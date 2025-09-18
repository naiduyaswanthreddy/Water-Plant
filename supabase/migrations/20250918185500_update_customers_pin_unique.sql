-- Make customers PIN uniqueness per owner (multi-tenancy)
-- This prevents cross-tenant conflicts like: duplicate key value violates unique constraint "customers_pin_key"

-- 1) Drop the old global unique constraint on pin
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_pin_key;

-- 2) Add a new unique constraint scoped by owner
ALTER TABLE public.customers
  ADD CONSTRAINT customers_owner_pin_unique
  UNIQUE (owner_user_id, pin);

-- 3) Optional: supporting index on pin for faster lookups by pin within owner
-- Note: The unique constraint already creates an index on (owner_user_id, pin)
-- so an extra index is not necessary.
