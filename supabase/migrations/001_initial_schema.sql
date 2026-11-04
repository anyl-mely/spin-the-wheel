-- ============================================================
-- Migration 001: Initial Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension (already enabled in Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: rooms
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rooms (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code          VARCHAR(10) NOT NULL UNIQUE,
  room_name          TEXT        NOT NULL,
  owner_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_spin_count INTEGER     NOT NULL DEFAULT 0,
  status             TEXT        NOT NULL DEFAULT 'waiting'
                                 CHECK (status IN ('waiting', 'spinning', 'finished')),
  settings           JSONB       NOT NULL DEFAULT '{"exclude_winners": false}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_owner_id  ON public.rooms(owner_id);
CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON public.rooms(room_code);

-- ============================================================
-- TABLE: participants
-- ============================================================
CREATE TABLE IF NOT EXISTS public.participants (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID        NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL CHECK (char_length(name) > 0),
  position   INTEGER     NOT NULL DEFAULT 0,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_participants_room_id ON public.participants(room_id);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_participants_room_pos ON public.participants(room_id, position);

-- ============================================================
-- TABLE: spin_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS public.spin_rules (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id        UUID        NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  spin_number    INTEGER     NOT NULL CHECK (spin_number >= 1),
  participant_id UUID        NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, spin_number)
);

CREATE INDEX IF NOT EXISTS idx_spin_rules_room_id ON public.spin_rules(room_id);

-- ============================================================
-- TABLE: spin_history
-- ============================================================
CREATE TABLE IF NOT EXISTS public.spin_history (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id            UUID        NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  spin_number        INTEGER     NOT NULL,
  participant_id     UUID        NOT NULL REFERENCES public.participants(id),
  result_type        TEXT        NOT NULL CHECK (result_type IN ('random', 'fixed')),
  event_id           UUID        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  animation_start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  animation_duration INTEGER     NOT NULL DEFAULT 5000, -- milliseconds
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, spin_number)  -- Each spin# has exactly one result per room
);

CREATE INDEX IF NOT EXISTS idx_spin_history_room_id ON public.spin_history(room_id);

-- ============================================================
-- Auto-update updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_spin_rules_updated_at
  BEFORE UPDATE ON public.spin_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

