-- Rename eggs columns to crates in production_records
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='production_records' AND column_name='eggs_collected') THEN
    ALTER TABLE public.production_records RENAME COLUMN eggs_collected TO crates_collected;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='production_records' AND column_name='broken_eggs') THEN
    ALTER TABLE public.production_records RENAME COLUMN broken_eggs TO broken_crates;
  END IF;
END $$;

-- Add sales columns to production_records
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS crates_sold integer NOT NULL DEFAULT 0;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS amount_sold numeric(10,2) NOT NULL DEFAULT 0.00;
