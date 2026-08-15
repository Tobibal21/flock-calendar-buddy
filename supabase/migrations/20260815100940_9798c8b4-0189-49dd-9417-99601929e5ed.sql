CREATE TABLE public.finance_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flock_id uuid REFERENCES public.flocks(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('income','expense')),
  category text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  record_date date NOT NULL DEFAULT current_date,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_records TO authenticated;
GRANT ALL ON public.finance_records TO service_role;

ALTER TABLE public.finance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own finance all" ON public.finance_records
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX finance_records_user_date_idx ON public.finance_records (user_id, record_date DESC);