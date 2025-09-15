-- Add owner_user_id to tenant tables and tighten RLS for per-user isolation
-- This keeps existing data readable temporarily (owner_user_id IS NULL)
-- and provides a helper to claim all existing rows for the current user.

-- 1) Add column owner_user_id with default auth.uid()
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS owner_user_id uuid DEFAULT auth.uid();
ALTER TABLE public.bottles ADD COLUMN IF NOT EXISTS owner_user_id uuid DEFAULT auth.uid();
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS owner_user_id uuid DEFAULT auth.uid();
ALTER TABLE public.pricing ADD COLUMN IF NOT EXISTS owner_user_id uuid DEFAULT auth.uid();
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS owner_user_id uuid DEFAULT auth.uid();
ALTER TABLE public.function_orders ADD COLUMN IF NOT EXISTS owner_user_id uuid DEFAULT auth.uid();

-- 2) Indexes
CREATE INDEX IF NOT EXISTS idx_customers_owner ON public.customers(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_bottles_owner ON public.bottles(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_routes_owner ON public.routes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_pricing_owner ON public.pricing(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_owner ON public.transactions(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_function_orders_owner ON public.function_orders(owner_user_id);

-- 3) Replace RLS policies to enforce owner scoping
-- First drop existing generic policies if they exist
DO $$
BEGIN
  -- customers
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='customers';
  EXECUTE 'DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.customers';
  EXECUTE 'DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.customers';
  EXECUTE 'DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.customers';
  EXECUTE 'DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.customers';

  -- bottles
  EXECUTE 'DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.bottles';
  EXECUTE 'DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.bottles';
  EXECUTE 'DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.bottles';
  EXECUTE 'DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.bottles';

  -- routes
  EXECUTE 'DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.routes';
  EXECUTE 'DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.routes';
  EXECUTE 'DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.routes';
  EXECUTE 'DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.routes';

  -- staff (we will recreate with user_id equality)
  EXECUTE 'DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.staff';
  EXECUTE 'DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.staff';
  EXECUTE 'DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.staff';
  EXECUTE 'DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.staff';

  -- pricing
  EXECUTE 'DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.pricing';
  EXECUTE 'DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.pricing';
  EXECUTE 'DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.pricing';
  EXECUTE 'DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.pricing';

  -- transactions
  EXECUTE 'DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.transactions';
  EXECUTE 'DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.transactions';
  EXECUTE 'DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.transactions';
  EXECUTE 'DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.transactions';

  -- function_orders
  EXECUTE 'DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.function_orders';
  EXECUTE 'DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.function_orders';
  EXECUTE 'DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.function_orders';
  EXECUTE 'DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.function_orders';
END $$;

-- New per-owner policies (temporary allowance for NULL for smoother backfill)
CREATE POLICY customers_select_owner ON public.customers
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);
CREATE POLICY customers_insert_owner ON public.customers
  FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid() OR owner_user_id IS NULL);
CREATE POLICY customers_update_owner ON public.customers
  FOR UPDATE TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY customers_delete_owner ON public.customers
  FOR DELETE TO authenticated USING (owner_user_id = auth.uid());

CREATE POLICY bottles_select_owner ON public.bottles
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);
CREATE POLICY bottles_insert_owner ON public.bottles
  FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid() OR owner_user_id IS NULL);
CREATE POLICY bottles_update_owner ON public.bottles
  FOR UPDATE TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY bottles_delete_owner ON public.bottles
  FOR DELETE TO authenticated USING (owner_user_id = auth.uid());

CREATE POLICY routes_select_owner ON public.routes
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);
CREATE POLICY routes_insert_owner ON public.routes
  FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid() OR owner_user_id IS NULL);
CREATE POLICY routes_update_owner ON public.routes
  FOR UPDATE TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY routes_delete_owner ON public.routes
  FOR DELETE TO authenticated USING (owner_user_id = auth.uid());

-- Staff is scoped by user_id
CREATE POLICY staff_select_owner ON public.staff
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY staff_insert_owner ON public.staff
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY staff_update_owner ON public.staff
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY staff_delete_owner ON public.staff
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY pricing_select_owner ON public.pricing
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);
CREATE POLICY pricing_insert_owner ON public.pricing
  FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid() OR owner_user_id IS NULL);
CREATE POLICY pricing_update_owner ON public.pricing
  FOR UPDATE TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY pricing_delete_owner ON public.pricing
  FOR DELETE TO authenticated USING (owner_user_id = auth.uid());

CREATE POLICY transactions_select_owner ON public.transactions
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);
CREATE POLICY transactions_insert_owner ON public.transactions
  FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid() OR owner_user_id IS NULL);
CREATE POLICY transactions_update_owner ON public.transactions
  FOR UPDATE TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY transactions_delete_owner ON public.transactions
  FOR DELETE TO authenticated USING (owner_user_id = auth.uid());

CREATE POLICY function_orders_select_owner ON public.function_orders
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);
CREATE POLICY function_orders_insert_owner ON public.function_orders
  FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid() OR owner_user_id IS NULL);
CREATE POLICY function_orders_update_owner ON public.function_orders
  FOR UPDATE TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY function_orders_delete_owner ON public.function_orders
  FOR DELETE TO authenticated USING (owner_user_id = auth.uid());

-- 4) Helper function: claim all unowned rows for current user
CREATE OR REPLACE FUNCTION public.claim_all_rows_for_current_user()
RETURNS void AS $$
BEGIN
  UPDATE public.customers SET owner_user_id = auth.uid() WHERE owner_user_id IS NULL;
  UPDATE public.bottles SET owner_user_id = auth.uid() WHERE owner_user_id IS NULL;
  UPDATE public.routes SET owner_user_id = auth.uid() WHERE owner_user_id IS NULL;
  UPDATE public.pricing SET owner_user_id = auth.uid() WHERE owner_user_id IS NULL;
  UPDATE public.transactions SET owner_user_id = auth.uid() WHERE owner_user_id IS NULL;
  UPDATE public.function_orders SET owner_user_id = auth.uid() WHERE owner_user_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- After backfill, you can later tighten policies by removing the OR owner_user_id IS NULL part.
