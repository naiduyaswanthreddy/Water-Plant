-- Add notes column to bottles for per-bottle remarks
ALTER TABLE public.bottles ADD COLUMN IF NOT EXISTS notes text;

-- Optional: index if you plan to search notes frequently (commented out by default)
-- CREATE INDEX IF NOT EXISTS idx_bottles_notes_gin ON public.bottles USING gin (to_tsvector('english', coalesce(notes, '')));
