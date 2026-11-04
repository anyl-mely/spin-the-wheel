-- ============================================================
-- Migration 004: Stage Mode + Deactivate Participant
-- Run this in Supabase SQL Editor AFTER migrations 001-003
-- ============================================================

-- 1. Add stage_token column to rooms
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS stage_token UUID DEFAULT NULL;

-- ============================================================
-- FUNCTION: generate_stage_token
-- Admin calls this to get a shareable Stage link token.
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_stage_token(p_room_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token UUID := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.rooms WHERE id = p_room_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.rooms
  SET stage_token = v_token, updated_at = NOW()
  WHERE id = p_room_id;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_stage_token(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_stage_token(UUID) TO authenticated;


-- ============================================================
-- FUNCTION: perform_spin_stage
-- Like perform_spin but authenticated by stage_token instead
-- of auth.uid(). Safe to call from anon (guest/stage) context.
-- Rules are applied server-side — NEVER exposed to client.
-- ============================================================
CREATE OR REPLACE FUNCTION public.perform_spin_stage(
  p_room_code          TEXT,
  p_stage_token        UUID,
  p_animation_duration INTEGER DEFAULT 5000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room             public.rooms%ROWTYPE;
  v_next_spin        INTEGER;
  v_rule             public.spin_rules%ROWTYPE;
  v_participant      public.participants%ROWTYPE;
  v_result_type      TEXT;
  v_event_id         UUID := gen_random_uuid();
  v_history_id       UUID;
  v_participant_name TEXT;
  v_existing_spin    public.spin_history%ROWTYPE;
  v_use_rule         BOOLEAN := FALSE;
BEGIN
  -- 1. Lock room — validate code + token together
  SELECT * INTO v_room
  FROM public.rooms
  WHERE room_code = p_room_code
    AND stage_token = p_stage_token
    AND stage_token IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid room code or stage token' USING ERRCODE = '42501';
  END IF;

  IF v_room.status = 'spinning' THEN
    RAISE EXCEPTION 'Room is already spinning' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Determine next spin number
  v_next_spin := v_room.current_spin_count + 1;

  -- 3. Idempotency: already recorded?
  SELECT * INTO v_existing_spin
  FROM public.spin_history
  WHERE room_id = v_room.id AND spin_number = v_next_spin;

  IF FOUND THEN
    SELECT name INTO v_participant_name
    FROM public.participants WHERE id = v_existing_spin.participant_id;

    RETURN jsonb_build_object(
      'id',               v_existing_spin.id,
      'spin_number',      v_existing_spin.spin_number,
      'participant_id',   v_existing_spin.participant_id,
      'participant_name', v_participant_name,
      'result_type',      v_existing_spin.result_type,
      'event_id',         v_existing_spin.event_id,
      'animation_duration', v_existing_spin.animation_duration
    );
  END IF;

  -- 4. Check fixed rule for this spin number
  SELECT * INTO v_rule
  FROM public.spin_rules
  WHERE room_id = v_room.id
    AND spin_number = v_next_spin
    AND is_active = TRUE;

  IF FOUND THEN
    SELECT * INTO v_participant
    FROM public.participants
    WHERE id = v_rule.participant_id
      AND room_id = v_room.id
      AND is_active = TRUE;

    IF FOUND THEN
      v_result_type := 'fixed';
      v_use_rule    := TRUE;
    END IF;
    -- If participant was removed, fall through to random
  END IF;

  -- 5. Random selection if no valid fixed rule
  IF NOT v_use_rule THEN
    IF (v_room.settings->>'exclude_winners')::BOOLEAN IS TRUE THEN
      SELECT p.* INTO v_participant
      FROM public.participants p
      WHERE p.room_id = v_room.id
        AND p.is_active = TRUE
        AND p.id NOT IN (
          SELECT participant_id FROM public.spin_history WHERE room_id = v_room.id
        )
      ORDER BY random()
      LIMIT 1;

      IF NOT FOUND THEN
        -- All won: reset exclusion, pick randomly
        SELECT * INTO v_participant
        FROM public.participants
        WHERE room_id = v_room.id AND is_active = TRUE
        ORDER BY random() LIMIT 1;
      END IF;
    ELSE
      SELECT * INTO v_participant
      FROM public.participants
      WHERE room_id = v_room.id AND is_active = TRUE
      ORDER BY random()
      LIMIT 1;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No active participants in this room' USING ERRCODE = 'P0001';
    END IF;

    v_result_type := 'random';
  END IF;

  -- 6. Mark spinning
  UPDATE public.rooms
  SET status = 'spinning', updated_at = NOW()
  WHERE id = v_room.id;

  -- 7. Record result
  INSERT INTO public.spin_history (
    room_id, spin_number, participant_id, result_type,
    event_id, animation_duration, animation_start_at
  ) VALUES (
    v_room.id, v_next_spin, v_participant.id, v_result_type,
    v_event_id, p_animation_duration, NOW()
  )
  RETURNING id INTO v_history_id;

  -- 8. Update spin count
  UPDATE public.rooms
  SET current_spin_count = v_next_spin,
      status = 'waiting',
      updated_at = NOW()
  WHERE id = v_room.id;

  -- 9. Return — note: result_type is returned but Stage UI will NOT display it
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
  SELECT * INTO v_existing_spin
  FROM public.spin_history
  WHERE room_id = v_room.id AND spin_number = v_next_spin;

  SELECT name INTO v_participant_name
  FROM public.participants WHERE id = v_existing_spin.participant_id;

  UPDATE public.rooms SET status = 'waiting', updated_at = NOW() WHERE id = v_room.id;

  RETURN jsonb_build_object(
    'id',               v_existing_spin.id,
    'spin_number',      v_existing_spin.spin_number,
    'participant_id',   v_existing_spin.participant_id,
    'participant_name', v_participant_name,
    'result_type',      v_existing_spin.result_type,
    'event_id',         v_existing_spin.event_id,
    'animation_duration', v_existing_spin.animation_duration
  );
END;
$$;

-- Allow anon (unauthenticated) to call this — token is the auth
REVOKE ALL ON FUNCTION public.perform_spin_stage(TEXT, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perform_spin_stage(TEXT, UUID, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.perform_spin_stage(TEXT, UUID, INTEGER) TO authenticated;


-- ============================================================
-- FUNCTION: deactivate_participant_stage
-- Stage page calls this to remove a winner from the wheel.
-- Authenticated by stage_token.
-- ============================================================
CREATE OR REPLACE FUNCTION public.deactivate_participant_stage(
  p_room_code      TEXT,
  p_stage_token    UUID,
  p_participant_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id UUID;
BEGIN
  SELECT id INTO v_room_id
  FROM public.rooms
  WHERE room_code = p_room_code
    AND stage_token = p_stage_token
    AND stage_token IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid stage token' USING ERRCODE = '42501';
  END IF;

  UPDATE public.participants
  SET is_active = FALSE
  WHERE id = p_participant_id AND room_id = v_room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_participant_stage(TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_participant_stage(TEXT, UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.deactivate_participant_stage(TEXT, UUID, UUID) TO authenticated;

