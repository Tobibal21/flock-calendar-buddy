CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz
);
GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own push select" ON public.push_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own push insert" ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own push delete" ON public.push_subscriptions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions(user_id);

CREATE TABLE public.reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  slot text NOT NULL CHECK (slot IN ('morning','evening','test')),
  sent_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Lagos')::date,
  sent_at timestamptz NOT NULL DEFAULT now(),
  result text NOT NULL
);
GRANT SELECT ON public.reminder_log TO authenticated;
GRANT ALL ON public.reminder_log TO service_role;
ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reminder log select" ON public.reminder_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE UNIQUE INDEX reminder_log_once_per_day ON public.reminder_log(user_id, slot, sent_on) WHERE slot <> 'test';

-- Users due a reminder for a slot today (Lagos time). Service role only.
CREATE OR REPLACE FUNCTION public.reminder_recipients(p_slot text)
RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH today AS (SELECT (now() AT TIME ZONE 'Africa/Lagos')::date AS d)
  SELECT DISTINCT ps.user_id
  FROM push_subscriptions ps
  JOIN subscribers s ON s.user_id = ps.user_id
  CROSS JOIN today
  WHERE (
      (s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now()))
      OR (s.status = 'trialing' AND s.trial_ends_at > now())
    )
    AND NOT EXISTS (
      SELECT 1 FROM reminder_log rl
      WHERE rl.user_id = ps.user_id AND rl.slot = p_slot AND rl.sent_on = today.d
    )
    AND (
      p_slot = 'morning'
      OR (p_slot = 'evening'
        AND NOT EXISTS (SELECT 1 FROM production_records pr WHERE pr.user_id = ps.user_id
              AND ((pr.created_at AT TIME ZONE 'Africa/Lagos')::date = today.d OR pr.record_date = today.d))
        AND NOT EXISTS (SELECT 1 FROM finance_records fr WHERE fr.user_id = ps.user_id
              AND ((fr.created_at AT TIME ZONE 'Africa/Lagos')::date = today.d OR fr.record_date = today.d)))
    );
$$;
REVOKE ALL ON FUNCTION public.reminder_recipients(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reminder_recipients(text) TO service_role;