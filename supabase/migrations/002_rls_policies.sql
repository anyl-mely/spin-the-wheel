-- ============================================================
-- Migration 002: Row Level Security Policies
-- Run AFTER 001_initial_schema.sql
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.rooms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spin_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spin_history ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ROOMS policies
-- ============================================================

-- Anyone (including unauthenticated) can read rooms (for guest access)
CREATE POLICY "rooms_read_all" ON public.rooms
  FOR SELECT USING (TRUE);

-- Only authenticated users can insert rooms they own
CREATE POLICY "rooms_insert_owner" ON public.rooms
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Only owner can update their room
CREATE POLICY "rooms_update_owner" ON public.rooms
  FOR UPDATE USING (auth.uid() = owner_id);

-- Only owner can delete their room
CREATE POLICY "rooms_delete_owner" ON public.rooms
  FOR DELETE USING (auth.uid() = owner_id);

-- ============================================================
-- PARTICIPANTS policies
-- ============================================================

-- Anyone can read participants (guests need to see the wheel)
CREATE POLICY "participants_read_all" ON public.participants
  FOR SELECT USING (TRUE);

-- Only room owner can insert participants
CREATE POLICY "participants_insert_owner" ON public.participants
  FOR INSERT WITH CHECK (
    auth.uid() = (SELECT owner_id FROM public.rooms WHERE id = room_id)
  );

-- Only room owner can update participants
CREATE POLICY "participants_update_owner" ON public.participants
  FOR UPDATE USING (
    auth.uid() = (SELECT owner_id FROM public.rooms WHERE id = room_id)
  );

-- Only room owner can delete participants
CREATE POLICY "participants_delete_owner" ON public.participants
  FOR DELETE USING (
    auth.uid() = (SELECT owner_id FROM public.rooms WHERE id = room_id)
  );

-- ============================================================
-- SPIN_RULES policies
-- ============================================================

-- Only room owner can read rules (keep rules secret from guests)
CREATE POLICY "spin_rules_read_owner" ON public.spin_rules
  FOR SELECT USING (
    auth.uid() = (SELECT owner_id FROM public.rooms WHERE id = room_id)
  );

-- Only room owner can insert rules
CREATE POLICY "spin_rules_insert_owner" ON public.spin_rules
  FOR INSERT WITH CHECK (
    auth.uid() = (SELECT owner_id FROM public.rooms WHERE id = room_id)
  );

-- Only room owner can update rules
CREATE POLICY "spin_rules_update_owner" ON public.spin_rules
  FOR UPDATE USING (
    auth.uid() = (SELECT owner_id FROM public.rooms WHERE id = room_id)
  );

-- Only room owner can delete rules
CREATE POLICY "spin_rules_delete_owner" ON public.spin_rules
  FOR DELETE USING (
    auth.uid() = (SELECT owner_id FROM public.rooms WHERE id = room_id)
  );

-- ============================================================
-- SPIN_HISTORY policies
-- ============================================================

-- Anyone can read spin history (guests can see results)
CREATE POLICY "spin_history_read_all" ON public.spin_history
  FOR SELECT USING (TRUE);

-- Only the perform_spin RPC (SECURITY DEFINER) can insert — no direct insert allowed
-- We block direct inserts via policy that only allows service role
CREATE POLICY "spin_history_insert_rpc_only" ON public.spin_history
  FOR INSERT WITH CHECK (FALSE);
  -- This is intentionally FALSE: only the SECURITY DEFINER RPC can bypass RLS

-- Only room owner can delete history
CREATE POLICY "spin_history_delete_owner" ON public.spin_history
  FOR DELETE USING (
    auth.uid() = (SELECT owner_id FROM public.rooms WHERE id = room_id)
  );

