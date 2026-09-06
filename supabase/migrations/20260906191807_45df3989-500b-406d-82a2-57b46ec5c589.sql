CREATE TABLE public.onboarding_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed boolean NOT NULL DEFAULT false,
  tour_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.onboarding_state TO authenticated;
GRANT ALL ON public.onboarding_state TO service_role;

ALTER TABLE public.onboarding_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own onboarding select" ON public.onboarding_state
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own onboarding insert" ON public.onboarding_state
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own onboarding update" ON public.onboarding_state
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER onboarding_state_set_updated_at
  BEFORE UPDATE ON public.onboarding_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();