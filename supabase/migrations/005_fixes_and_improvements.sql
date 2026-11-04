-- ============================================================
-- Migration 005: Fix Reset, Protect Future Fixed Winners, & Sync Settings
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Fix reset_room: Restore all participants to is_active = TRUE
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

  -- 1. Delete all spin history
  DELETE FROM public.spin_history WHERE room_id = p_room_id;

  -- 2. Restore all participants to active
  UPDATE public.participants
  SET is_active = TRUE
  WHERE room_id = p_room_id;

  -- 3. Reset room counters & status
  UPDATE public.rooms
  SET current_spin_count = 0,
      status = 'waiting',
      updated_at = NOW()
  WHERE id = p_room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_room(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_room(UUID) TO authenticated;


-- ============================================================
-- 2. Fix perform_spin (Admin):
--    - Enforce fixed winner even if previously marked inactive
--    - CRITICAL: In random spins, exclude participants scheduled for FUTURE fixed spins!
-- ============================================================
CREATE OR REPLACE FUNCTION public.perform_spin(
  p_room_id            UUID,
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
  v_use_rule          BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Lock room row
  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found' USING ERRCODE = 'P0001';
  END IF;

  IF v_room.owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF v_room.status = 'spinning' THEN
    RAISE EXCEPTION 'Room is already spinning' USING ERRCODE = 'P0001';
  END IF;

  v_next_spin := v_room.current_spin_count + 1;

  -- Idempotency check
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
        'id',               v_existing.id,
        'spin_number',      v_existing.spin_number,
        'participant_id',   v_existing.participant_id,
        'participant_name', v_participant_name,
        'result_type',      v_existing.result_type,
        'event_id',         v_existing.event_id,
        'animation_duration', v_existing.animation_duration
      );
    END IF;
  END;

  -- Check for active fixed rule for this spin number
  SELECT * INTO v_rule
  FROM public.spin_rules
  WHERE room_id = p_room_id
    AND spin_number = v_next_spin
    AND is_active = TRUE;

  IF FOUND THEN
    SELECT * INTO v_participant
    FROM public.participants
    WHERE id = v_rule.participant_id
      AND room_id = p_room_id;

    IF FOUND THEN
      -- If participant was inactive, restore them to active for this win
      UPDATE public.participants SET is_active = TRUE WHERE id = v_participant.id;
      v_result_type := 'fixed';
      v_use_rule    := TRUE;
    END IF;
  END IF;

  IF NOT v_use_rule THEN
    -- RANDOM SELECTION:
    -- Exclude any participant reserved for a FUTURE fixed spin (spin_number > v_next_spin)
    SELECT p.* INTO v_participant
    FROM public.participants p
    WHERE p.room_id = p_room_id
      AND p.is_active = TRUE
      AND p.id NOT IN (
        SELECT sr.participant_id
        FROM public.spin_rules sr
        WHERE sr.room_id = p_room_id
          AND sr.spin_number > v_next_spin
          AND sr.is_active = TRUE
      )
    ORDER BY random()
    LIMIT 1;

    -- If all remaining active participants are reserved for future spins, fallback to any active
    IF NOT FOUND THEN
      SELECT p.* INTO v_participant
      FROM public.participants p
      WHERE p.room_id = p_room_id
        AND p.is_active = TRUE
      ORDER BY random()
      LIMIT 1;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No active participants available to spin' USING ERRCODE = 'P0001';
    END IF;

    v_result_type := 'random';
  END IF;

  -- Update room status
  UPDATE public.rooms
  SET status = 'spinning', updated_at = NOW()
  WHERE id = p_room_id;

  -- Insert history
  INSERT INTO public.spin_history (
    room_id, spin_number, participant_id, result_type,
    event_id, animation_duration, animation_start_at
  ) VALUES (
    p_room_id, v_next_spin, v_participant.id, v_result_type,
    v_event_id, p_animation_duration, NOW()
  )
  RETURNING id INTO v_history_id;

  -- Auto-remove participant if room settings specify auto_remove
  IF (v_room.settings->>'auto_remove')::BOOLEAN IS TRUE THEN
    UPDATE public.participants SET is_active = FALSE WHERE id = v_participant.id;
  END IF;

  -- Complete spin
  UPDATE public.rooms
  SET current_spin_count = v_next_spin,
      status = 'waiting',
      updated_at = NOW()
  WHERE id = p_room_id;

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


-- ============================================================
-- 3. Fix perform_spin_stage (Stage/MC):
--    - Enforce fixed winner even if inactive
--    - CRITICAL: In random spins, exclude participants scheduled for FUTURE fixed spins!
--    - Auto-deactivate winner if auto_remove setting is TRUE
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
  -- Validate code and token
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

  v_next_spin := v_room.current_spin_count + 1;

  -- Idempotency
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

  -- Check rule
  SELECT * INTO v_rule
  FROM public.spin_rules
  WHERE room_id = v_room.id
    AND spin_number = v_next_spin
    AND is_active = TRUE;

  IF FOUND THEN
    SELECT * INTO v_participant
    FROM public.participants
    WHERE id = v_rule.participant_id
      AND room_id = v_room.id;

    IF FOUND THEN
      -- If inactive, re-enable for this scheduled win
      UPDATE public.participants SET is_active = TRUE WHERE id = v_participant.id;
      v_result_type := 'fixed';
      v_use_rule    := TRUE;
    END IF;
  END IF;

  -- Random selection if no rule
  IF NOT v_use_rule THEN
    -- Exclude any participant reserved for FUTURE fixed spins
    SELECT p.* INTO v_participant
    FROM public.participants p
    WHERE p.room_id = v_room.id
      AND p.is_active = TRUE
      AND p.id NOT IN (
        SELECT sr.participant_id
        FROM public.spin_rules sr
        WHERE sr.room_id = v_room.id
          AND sr.spin_number > v_next_spin
          AND sr.is_active = TRUE
      )
    ORDER BY random()
    LIMIT 1;

    -- Fallback if all active participants are reserved
    IF NOT FOUND THEN
      SELECT p.* INTO v_participant
      FROM public.participants p
      WHERE p.room_id = v_room.id
        AND p.is_active = TRUE
      ORDER BY random()
      LIMIT 1;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No active participants available to spin' USING ERRCODE = 'P0001';
    END IF;

    v_result_type := 'random';
  END IF;

  -- Mark spinning
  UPDATE public.rooms
  SET status = 'spinning', updated_at = NOW()
  WHERE id = v_room.id;

  -- Insert history
  INSERT INTO public.spin_history (
    room_id, spin_number, participant_id, result_type,
    event_id, animation_duration, animation_start_at
  ) VALUES (
    v_room.id, v_next_spin, v_participant.id, v_result_type,
    v_event_id, p_animation_duration, NOW()
  )
  RETURNING id INTO v_history_id;

  -- Auto-remove participant if room settings specify auto_remove
  IF (v_room.settings->>'auto_remove')::BOOLEAN IS TRUE THEN
    UPDATE public.participants SET is_active = FALSE WHERE id = v_participant.id;
  END IF;

  -- Update room status
  UPDATE public.rooms
  SET current_spin_count = v_next_spin,
      status = 'waiting',
      updated_at = NOW()
  WHERE id = v_room.id;

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

