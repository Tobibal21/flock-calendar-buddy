ALTER TABLE public.flocks
  ADD COLUMN IF NOT EXISTS flock_type text,
  ADD COLUMN IF NOT EXISTS acquisition_date date;

ALTER TABLE public.flocks
  ADD CONSTRAINT flocks_flock_type_check CHECK (flock_type IN ('layers','broilers'));

UPDATE public.flocks SET acquisition_date = date_acquired WHERE acquisition_date IS NULL;

CREATE OR REPLACE FUNCTION public.prevent_flock_type_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.flock_type IS NOT NULL AND NEW.flock_type IS DISTINCT FROM OLD.flock_type THEN
    RAISE EXCEPTION 'flock_type cannot be changed once set';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS flocks_flock_type_immutable ON public.flocks;
CREATE TRIGGER flocks_flock_type_immutable
BEFORE UPDATE ON public.flocks
FOR EACH ROW EXECUTE FUNCTION public.prevent_flock_type_change();