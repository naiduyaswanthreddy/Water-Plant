-- Make bottle numbers unique per owner, not globally
BEGIN;

-- Drop the existing global unique constraint on bottle_number, if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.constraint_type = 'UNIQUE'
      AND tc.table_schema = 'public'
      AND tc.table_name = 'bottles'
      AND tc.constraint_name = 'bottles_bottle_number_key'
  ) THEN
    ALTER TABLE public.bottles DROP CONSTRAINT bottles_bottle_number_key;
  END IF;
END $$;

-- Also drop any unique index directly created on bottle_number if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'bottles' AND indexname = 'idx_bottles_bottle_number_unique'
  ) THEN
    DROP INDEX public.idx_bottles_bottle_number_unique;
  END IF;
END $$;

-- Create a composite unique constraint on (owner_user_id, bottle_number)
-- This ensures each user can have their own numbering like C1, N1, etc.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.constraint_type = 'UNIQUE'
      AND tc.table_schema = 'public'
      AND tc.table_name = 'bottles'
      AND tc.constraint_name = 'bottles_owner_bottle_number_key'
  ) THEN
    ALTER TABLE public.bottles
      ADD CONSTRAINT bottles_owner_bottle_number_key UNIQUE (owner_user_id, bottle_number);
  END IF;
END $$;

COMMIT;
