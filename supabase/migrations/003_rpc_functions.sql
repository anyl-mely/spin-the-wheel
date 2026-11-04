-- ============================================================
-- Migration 003: RPC Functions
-- Run AFTER 002_rls_policies.sql
-- ============================================================

-- ============================================================
-- FUNCTION: perform_spin
-- Core controlled-randomization logic.
-- Runs as SECURITY DEFINER to bypass RLS for atomic writes.
-- ============================================================
CREATE OR REPLACE FUNCTION public.perform_spin(
  p_room_id          UUID,
  p_animation_duration INTEGER DEFAULT 5000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room              public.rooms%ROWTYPE;
  v_next_spin         INTEGER;
  v_rule              public.spin_rules%ROWTYPE;
  v_participant       public.participants%ROWTYPE;
  v_result_type       TEXT;
  v_event_id          UUID := gen_random_uuid();
  v_history_id        UUID;
  v_participant_name  TEXT;
BEGIN
  -- -------------------------------------------------------
  -- 1. Verify caller is the room owner
  -- -------------------------------------------------------
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- -------------------------------------------------------
  -- 2. Lock the room row to prevent concurrent spins
  -- -------------------------------------------------------
  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found' USING ERRCODE = 'P0001';
  END IF;

  IF v_room.owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Permission denied: you do not own this room' USING ERRCODE = '42501';
  END IF;

  IF v_room.status = 'spinning' THEN
    RAISE EXCEPTION 'Room is already spinning' USING ERRCODE = 'P0001';
  END IF;

  -- -------------------------------------------------------
  -- 3. Determine the next spin number
  -- -------------------------------------------------------
  v_next_spin := v_room.current_spin_count + 1;

  -- -------------------------------------------------------
  -- 4. Check idempotency: if this spin already recorded, return it
  -- -------------------------------------------------------
  DECLARE
    v_existing public.spin_history%ROWTYPE;
  BEGIN
    SELECT * INTO v_existing
    FROM public.spin_history
    WHERE room_id = p_room_id AND spin_number = v_next_spin;

    IF FOUND THEN
      SELECT name INTO v_participant_name
      FROM public.participants
      WHERE id = v_existing.participant_id;

      RETURN jsonb_build_object(
        'spin_number',      v_existing.spin_number,
        'participant_id',   v_existing.participant_id,
        'participant_name', v_participant_name,
        'result_type',      v_existing.result_type,
        'event_id',         v_existing.event_id,
        'animation_duration', v_existing.animation_duration
      );
    END IF;
  END;

  -- -------------------------------------------------------
  -- 5. Check for active fixed rule for this spin number
  -- -------------------------------------------------------
  SELECT * INTO v_rule
  FROM public.spin_rules
  WHERE room_id = p_room_id
    AND spin_number = v_next_spin
    AND is_active = TRUE;

  IF FOUND THEN
    -- Fixed result: use designated participant
    SELECT * INTO v_participant
    FROM public.participants
    WHERE id = v_rule.participant_id
      AND room_id = p_room_id
      AND is_active = TRUE;

    IF NOT FOUND THEN
      -- Participant was removed; fall back to random
      v_rule := NULL;
    ELSE
      v_result_type := 'fixed';
    END IF;
  END IF;

  IF v_rule IS NULL THEN
    -- -------------------------------------------------------
    -- 6. Random selection
    -- -------------------------------------------------------
    -- Check if exclude_winners mode is on
    IF (v_room.settings->>'exclude_winners')::BOOLEAN IS TRUE THEN
      -- Exclude participants who have already won
      SELECT p.* INTO v_participant
      FROM public.participants p
      WHERE p.room_id = p_room_id
        AND p.is_active = TRUE
        AND p.id NOT IN (
          SELECT participant_id FROM public.spin_history
          WHERE room_id = p_room_id
        )
      ORDER BY random()
      LIMIT 1;

      -- If everyone has won, reset exclusion and pick randomly
      IF NOT FOUND THEN
        SELECT * INTO v_participant
        FROM public.participants
        WHERE room_id = p_room_id AND is_active = TRUE
        ORDER BY random()
        LIMIT 1;
      END IF;
    ELSE
      SELECT * INTO v_participant
      FROM public.participants
      WHERE room_id = p_room_id AND is_active = TRUE
      ORDER BY random()
      LIMIT 1;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No active participants in this room' USING ERRCODE = 'P0001';
    END IF;

    v_result_type := 'random';
  END IF;

  -- -------------------------------------------------------
  -- 7. Mark room as spinning (brief, within same transaction)
  -- -------------------------------------------------------
  UPDATE public.rooms
  SET status = 'spinning', updated_at = NOW()
  WHERE id = p_room_id;

  -- -------------------------------------------------------
  -- 8. Record the spin result
  -- -------------------------------------------------------
  INSERT INTO public.spin_history (
    room_id, spin_number, participant_id, result_type,
    event_id, animation_duration, animation_start_at
  ) VALUES (
    p_room_id, v_next_spin, v_participant.id, v_result_type,
    v_event_id, p_animation_duration, NOW()
  )
  RETURNING id INTO v_history_id;

  -- -------------------------------------------------------
  -- 9. Increment spin count & restore status
  -- -------------------------------------------------------
  UPDATE public.rooms
  SET current_spin_count = v_next_spin,
      status = 'waiting',
      updated_at = NOW()
  WHERE id = p_room_id;

  -- -------------------------------------------------------
  -- 10. Return result
  -- -------------------------------------------------------
  RETURN jsonb_build_object(
    'id',               v_history_id,
    'spin_number',      v_next_spin,
    'participant_id',   v_participant.id,
    'participant_name', v_participant.name,
    'result_type',      v_result_type,
    'event_id',         v_event_id,
    'animation_duration', p_animation_duration
  );

EXCEPTION WHEN unique_violation THEN
  -- Concurrent spin race: return the winner that got recorded
  DECLARE
    v_existing public.spin_history%ROWTYPE;
    v_name TEXT;
  BEGIN
    SELECT * INTO v_existing
    FROM public.spin_history
    WHERE room_id = p_room_id AND spin_number = v_next_spin;

    SELECT name INTO v_name FROM public.participants WHERE id = v_existing.participant_id;

    UPDATE public.rooms SET status = 'waiting', updated_at = NOW() WHERE id = p_room_id;

    RETURN jsonb_build_object(
      'id',               v_existing.id,
      'spin_number',      v_existing.spin_number,
      'participant_id',   v_existing.participant_id,
      'participant_name', v_name,
      'result_type',      v_existing.result_type,
      'event_id',         v_existing.event_id,
      'animation_duration', v_existing.animation_duration
    );
  END;
END;
$$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION public.perform_spin(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perform_spin(UUID, INTEGER) TO authenticated;


-- ============================================================
-- FUNCTION: reset_room
-- Resets spin count and clears history atomically.
-- ============================================================
CREATE OR REPLACE FUNCTION public.reset_room(p_room_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.rooms WHERE id = p_room_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  -- Delete history
  DELETE FROM public.spin_history WHERE room_id = p_room_id;

  -- Reset spin count
  UPDATE public.rooms
  SET current_spin_count = 0, status = 'waiting', updated_at = NOW()
  WHERE id = p_room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_room(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_room(UUID) TO authenticated;


-- ============================================================
-- Enable Realtime for spin_history table
-- (Realtime must also be enabled in Supabase Dashboard)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.spin_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;

