-- Add 'hotel' to customer_type enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'customer_type' AND e.enumlabel = 'hotel'
  ) THEN
    ALTER TYPE public.customer_type ADD VALUE 'hotel';
  END IF;
END $$;
