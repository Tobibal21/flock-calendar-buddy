ALTER TABLE public.production_records
ADD COLUMN IF NOT EXISTS crates_sold integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS amount_sold numeric NOT NULL DEFAULT 0;