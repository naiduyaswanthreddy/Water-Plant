-- Track which bottles were given for a specific function order
BEGIN;

-- 1) Create mapping table
CREATE TABLE IF NOT EXISTS public.function_order_bottles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.function_orders(id) ON DELETE CASCADE,
  bottle_id uuid REFERENCES public.bottles(id) ON DELETE SET NULL,
  bottle_number text NOT NULL,
  bottle_type bottle_type NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  received boolean NOT NULL DEFAULT false,
  received_at timestamptz,
  owner_user_id uuid DEFAULT auth.uid(),
  CONSTRAINT uq_order_bottle UNIQUE (order_id, bottle_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fob_order ON public.function_order_bottles(order_id);
CREATE INDEX IF NOT EXISTS idx_fob_owner ON public.function_order_bottles(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fob_received ON public.function_order_bottles(received);

-- 2) RLS
ALTER TABLE public.function_order_bottles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS fob_select_owner ON public.function_order_bottles';
  EXECUTE 'DROP POLICY IF EXISTS fob_insert_owner ON public.function_order_bottles';
  EXECUTE 'DROP POLICY IF EXISTS fob_update_owner ON public.function_order_bottles';
  EXECUTE 'DROP POLICY IF EXISTS fob_delete_owner ON public.function_order_bottles';
END $$;

CREATE POLICY fob_select_owner ON public.function_order_bottles
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);
CREATE POLICY fob_insert_owner ON public.function_order_bottles
  FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid() OR owner_user_id IS NULL);
CREATE POLICY fob_update_owner ON public.function_order_bottles
  FOR UPDATE TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY fob_delete_owner ON public.function_order_bottles
  FOR DELETE TO authenticated USING (owner_user_id = auth.uid());

COMMIT;
