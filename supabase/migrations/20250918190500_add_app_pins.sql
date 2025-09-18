-- App-level login PIN stored per owner in the database
-- This enables PIN to persist across devices for the same logged-in user

CREATE TABLE IF NOT EXISTS public.app_pins (
  owner_user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  pin_hash text NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_pins ENABLE ROW LEVEL SECURITY;

-- Policies: only owner can access their pin row
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS app_pins_select_owner ON public.app_pins';
  EXECUTE 'DROP POLICY IF EXISTS app_pins_upsert_owner ON public.app_pins';
  EXECUTE 'DROP POLICY IF EXISTS app_pins_delete_owner ON public.app_pins';
END $$;

CREATE POLICY app_pins_select_owner ON public.app_pins
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

-- Upsert allowed for owner; WITH CHECK ensures row belongs to user
CREATE POLICY app_pins_upsert_owner ON public.app_pins
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY app_pins_update_owner ON public.app_pins
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY app_pins_delete_owner ON public.app_pins
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

-- Helpful index on updated_at for housekeeping if needed later
CREATE INDEX IF NOT EXISTS idx_app_pins_updated_at ON public.app_pins(updated_at);
