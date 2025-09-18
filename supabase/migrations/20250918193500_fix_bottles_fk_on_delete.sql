-- Allow deleting customers without failing due to bottles assigned
-- Bottles should simply detach (current_customer_id -> NULL) when a customer is deleted

ALTER TABLE public.bottles
  DROP CONSTRAINT IF EXISTS bottles_current_customer_id_fkey;

ALTER TABLE public.bottles
  ADD CONSTRAINT bottles_current_customer_id_fkey
  FOREIGN KEY (current_customer_id)
  REFERENCES public.customers(id)
  ON DELETE SET NULL;

-- Note: transactions.customer_id continues to RESTRICT (default) deletes
-- so a customer with any transactions cannot be deleted.
-- This matches the product rule: only deletable when transactions count = 0.
