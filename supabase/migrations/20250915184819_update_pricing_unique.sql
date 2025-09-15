-- Adjust pricing uniqueness to be per-owner
-- Drop the old global unique constraint
ALTER TABLE public.pricing DROP CONSTRAINT IF EXISTS pricing_bottle_type_customer_type_key;

-- Create a new unique constraint including owner_user_id
ALTER TABLE public.pricing
  ADD CONSTRAINT pricing_owner_bottle_customer_unique
  UNIQUE (owner_user_id, bottle_type, customer_type);
