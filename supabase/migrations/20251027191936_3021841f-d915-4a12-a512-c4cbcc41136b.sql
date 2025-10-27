-- Ensure status column exists on leads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.leads
    ADD COLUMN status TEXT NOT NULL DEFAULT 'new';
  END IF;
END $$;

-- Optional index for filtering by status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'idx_leads_status' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_leads_status ON public.leads(status);
  END IF;
END $$;