CREATE TABLE public.farm_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  score integer,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  months_of_records numeric NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX farm_scores_user_idx ON public.farm_scores (user_id, computed_at DESC);
GRANT SELECT ON public.farm_scores TO authenticated;
GRANT ALL ON public.farm_scores TO service_role;
ALTER TABLE public.farm_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own farm scores select" ON public.farm_scores FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.report_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  label text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_viewed_at timestamptz,
  view_count integer NOT NULL DEFAULT 0
);
CREATE INDEX report_shares_user_idx ON public.report_shares (user_id, created_at DESC);
GRANT SELECT ON public.report_shares TO authenticated;
GRANT INSERT (user_id, label, expires_at) ON public.report_shares TO authenticated;
GRANT UPDATE (revoked_at) ON public.report_shares TO authenticated;
GRANT ALL ON public.report_shares TO service_role;
ALTER TABLE public.report_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own shares select" ON public.report_shares FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own shares insert" ON public.report_shares FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own shares update" ON public.report_shares FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.report_shares_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    NEW.view_count := 0;
    NEW.last_viewed_at := NULL;
    NEW.revoked_at := NULL;
    NEW.created_at := now();
    IF NEW.expires_at <= now() OR NEW.expires_at > now() + interval '91 days' THEN
      RAISE EXCEPTION 'Expiry must be between now and 90 days';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER report_shares_validate_trg BEFORE INSERT ON public.report_shares
FOR EACH ROW EXECUTE FUNCTION public.report_shares_validate();

CREATE OR REPLACE FUNCTION public.compute_farm_score(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- ===== TUNABLE WEIGHTS & THRESHOLDS =====
  w_consistency   constant numeric := 30;
  w_plausibility  constant numeric := 25;
  w_length        constant numeric := 20;
  w_profit        constant numeric := 15;
  w_vaccination   constant numeric := 10;
  min_records         constant int := 14;
  min_days            constant int := 30;
  consistency_window  constant int := 90;
  consistency_full    constant numeric := 0.85;
  lay_tolerance       constant numeric := 1.02;   -- eggs may exceed birds by 2%
  feed_min_kg         constant numeric := 0.05;   -- per bird per day (layers)
  feed_max_kg         constant numeric := 0.20;
  flag_penalty_factor constant numeric := 2;      -- 10% flagged records => 20% of plausibility lost
  backdate_days       constant int := 7;
  backdate_share_ok   constant numeric := 0.25;
  backdate_penalty    constant numeric := 8;      -- max points lost to backdating
  length_full_months  constant numeric := 12;
  profit_months       constant int := 6;
  profit_partial      constant numeric := 0.5;
  vacc_full           constant numeric := 0.90;
  -- ========================================
  v_uid uuid := auth.uid();
  v_today date := current_date;
  v_broiler_only boolean;
  v_record_count int;
  v_first date;
  v_days_span int;
  v_months numeric;
  v_components jsonb := '[]'::jsonb;
  v_flags jsonb := '[]'::jsonb;
  v_summary jsonb;
  v_points numeric := 0;
  v_weights numeric := 0;
  v_score int;
  v_start date;
  v_window int;
  v_active_days int;
  v_ratio numeric;
  v_pts numeric;
  v_total_prod int;
  v_lay_flags int;
  v_feed_flags int;
  v_flagged int;
  v_backdated int;
  v_back_share numeric;
  v_month_count int;
  v_pos_months int;
  v_first_net numeric;
  v_last_net numeric;
  v_due int;
  v_given int;
  v_eggs bigint;
  v_lay numeric;
  v_income numeric;
  v_expense numeric;
  v_mort numeric;
  v_vacc_rate numeric;
  v_needed_records int;
  v_needed_days int;
BEGIN
  IF v_uid IS NULL OR p_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT COALESCE(bool_and(COALESCE(f.flock_type, CASE WHEN f.bird_type = 'broiler' THEN 'broilers' ELSE 'layers' END) = 'broilers'), false)
    INTO v_broiler_only FROM flocks f WHERE f.user_id = p_user_id;

  IF v_broiler_only THEN
    SELECT count(*), min(d) INTO v_record_count, v_first FROM (
      SELECT record_date d FROM production_records WHERE user_id = p_user_id
      UNION ALL SELECT record_date FROM finance_records WHERE user_id = p_user_id) x;
  ELSE
    SELECT count(*), min(record_date) INTO v_record_count, v_first FROM production_records WHERE user_id = p_user_id;
  END IF;

  v_days_span := COALESCE(v_today - v_first, 0);
  v_months := round(GREATEST(v_days_span, 0) / 30.44, 1);

  -- Summary metrics
  SELECT COALESCE(sum(eggs_collected), 0) INTO v_eggs FROM production_records WHERE user_id = p_user_id;
  SELECT avg(LEAST(p.eggs_collected::numeric / NULLIF(f.current_count, 0), 1.5)) INTO v_lay
    FROM production_records p JOIN flocks f ON f.id = p.flock_id
    WHERE p.user_id = p_user_id AND f.current_count > 0
      AND COALESCE(f.flock_type, CASE WHEN f.bird_type = 'broiler' THEN 'broilers' ELSE 'layers' END) = 'layers';
  SELECT COALESCE(sum(amount) FILTER (WHERE type = 'income'), 0), COALESCE(sum(amount) FILTER (WHERE type = 'expense'), 0)
    INTO v_income, v_expense FROM finance_records WHERE user_id = p_user_id;
  v_income := v_income + COALESCE((SELECT sum(amount_sold) FROM production_records WHERE user_id = p_user_id), 0);
  SELECT sum(mortality_count)::numeric / NULLIF(sum(initial_count), 0) INTO v_mort FROM flocks WHERE user_id = p_user_id;
  SELECT count(*) FILTER (WHERE scheduled_date <= v_today), count(*) FILTER (WHERE scheduled_date <= v_today AND administered)
    INTO v_due, v_given FROM vaccinations WHERE user_id = p_user_id;
  v_vacc_rate := CASE WHEN v_due > 0 THEN v_given::numeric / v_due END;

  v_summary := jsonb_build_object(
    'total_eggs', v_eggs,
    'avg_lay_rate', round(v_lay * 100, 1),
    'total_income', round(v_income, 2),
    'total_expenses', round(v_expense, 2),
    'net', round(v_income - v_expense, 2),
    'mortality_rate', round(v_mort * 100, 1),
    'vaccination_rate', round(v_vacc_rate * 100, 1));

  -- Not enough data
  IF v_record_count < min_records OR v_days_span < min_days THEN
    v_needed_records := GREATEST(min_records - v_record_count, 0);
    v_needed_days := GREATEST(min_days - v_days_span, 0);
    INSERT INTO farm_scores (user_id, score, components, flags, summary, months_of_records)
    VALUES (p_user_id, NULL, '[]', '[]',
      v_summary || jsonb_build_object('needed_records', v_needed_records, 'needed_days', CASE WHEN v_first IS NULL THEN min_days ELSE v_needed_days END),
      v_months);
    RETURN jsonb_build_object('score', NULL, 'components', '[]'::jsonb, 'flags', '[]'::jsonb, 'months_of_records', v_months,
      'summary', v_summary, 'needed_records', v_needed_records,
      'needed_days', CASE WHEN v_first IS NULL THEN min_days ELSE v_needed_days END, 'computed_at', now());
  END IF;

  -- 1. Consistency
  v_start := GREATEST(v_today - (consistency_window - 1), v_first);
  v_window := v_today - v_start + 1;
  IF v_broiler_only THEN
    SELECT count(DISTINCT d) INTO v_active_days FROM (
      SELECT record_date d FROM production_records WHERE user_id = p_user_id AND record_date BETWEEN v_start AND v_today
      UNION SELECT record_date FROM finance_records WHERE user_id = p_user_id AND record_date BETWEEN v_start AND v_today) x;
  ELSE
    SELECT count(DISTINCT record_date) INTO v_active_days FROM production_records
      WHERE user_id = p_user_id AND record_date BETWEEN v_start AND v_today;
  END IF;
  v_ratio := v_active_days::numeric / GREATEST(v_window, 1);
  v_pts := w_consistency * LEAST(1, v_ratio / consistency_full);
  v_points := v_points + v_pts; v_weights := v_weights + w_consistency;
  v_components := v_components || jsonb_build_object('key', 'consistency', 'label', 'Consistency',
    'points', round(v_pts, 1), 'max', w_consistency,
    'tip', CASE WHEN v_ratio >= consistency_full THEN 'Great — you log almost every day.'
      ELSE format('You logged on %s of the last %s days. Aim to record every day.', v_active_days, v_window) END);

  -- 2. Plausibility
  SELECT count(*) INTO v_total_prod FROM production_records WHERE user_id = p_user_id;
  IF v_total_prod > 0 THEN
    SELECT count(*) FILTER (WHERE lay), count(*) FILTER (WHERE feed), count(*) FILTER (WHERE lay OR feed)
      INTO v_lay_flags, v_feed_flags, v_flagged
    FROM (
      SELECT
        (is_layer AND cnt > 0 AND p.eggs_collected > cnt * lay_tolerance) AS lay,
        (is_layer AND cnt > 0 AND COALESCE(p.feed_kg, 0) > 0
          AND (p.feed_kg / cnt < feed_min_kg OR p.feed_kg / cnt > feed_max_kg)) AS feed
      FROM production_records p
      JOIN LATERAL (
        SELECT f.current_count AS cnt,
          COALESCE(f.flock_type, CASE WHEN f.bird_type = 'broiler' THEN 'broilers' ELSE 'layers' END) = 'layers' AS is_layer
        FROM flocks f WHERE f.id = p.flock_id
      ) fl ON true
      WHERE p.user_id = p_user_id
    ) q;
    SELECT count(*) INTO v_backdated FROM production_records
      WHERE user_id = p_user_id AND created_at::date - record_date > backdate_days;
    v_back_share := v_backdated::numeric / v_total_prod;

    v_pts := w_plausibility * GREATEST(0, 1 - flag_penalty_factor * v_flagged::numeric / v_total_prod);
    IF v_back_share > backdate_share_ok THEN
      v_pts := GREATEST(0, v_pts - backdate_penalty * v_back_share);
    END IF;

    IF v_lay_flags > 0 THEN
      v_flags := v_flags || to_jsonb(format('%s %s where eggs collected were more than your flock size. Check these entries.',
        v_lay_flags, CASE WHEN v_lay_flags = 1 THEN 'day' ELSE 'days' END));
    END IF;
    IF v_feed_flags > 0 THEN
      v_flags := v_flags || to_jsonb(format('%s %s where feed per bird looked unusual (outside 0.05–0.20 kg per bird). Check the feed amount and flock size.',
        v_feed_flags, CASE WHEN v_feed_flags = 1 THEN 'entry' ELSE 'entries' END));
    END IF;
    IF v_back_share > backdate_share_ok THEN
      v_flags := v_flags || to_jsonb(format('%s%% of your entries were added more than %s days after the date. Try to log on the day.',
        round(v_back_share * 100), backdate_days));
    END IF;

    v_points := v_points + v_pts; v_weights := v_weights + w_plausibility;
    v_components := v_components || jsonb_build_object('key', 'plausibility', 'label', 'Plausibility',
      'points', round(v_pts, 1), 'max', w_plausibility,
      'tip', CASE WHEN v_flagged = 0 AND v_back_share <= backdate_share_ok THEN 'Your numbers look consistent.'
        ELSE 'Fix the entries listed under "Things to check" to raise this.' END);
  END IF;

  -- 3. Record length
  v_pts := w_length * LEAST(1, v_months / length_full_months);
  v_points := v_points + v_pts; v_weights := v_weights + w_length;
  v_components := v_components || jsonb_build_object('key', 'length', 'label', 'Record length',
    'points', round(v_pts, 1), 'max', w_length,
    'tip', CASE WHEN v_months >= length_full_months THEN 'Over a year of records — excellent.'
      ELSE format('%s months recorded. Keep logging to reach 12 months.', v_months) END);

  -- 4. Profit trend
  WITH m AS (
    SELECT date_trunc('month', d) mon, sum(inc) - sum(exp) net FROM (
      SELECT record_date d, CASE WHEN type = 'income' THEN amount ELSE 0 END inc, CASE WHEN type = 'expense' THEN amount ELSE 0 END exp
        FROM finance_records WHERE user_id = p_user_id
      UNION ALL
      SELECT record_date, amount_sold, 0 FROM production_records WHERE user_id = p_user_id AND amount_sold > 0
    ) x
    WHERE d >= (date_trunc('month', v_today) - make_interval(months => profit_months - 1))::date
    GROUP BY 1
  )
  SELECT count(*), count(*) FILTER (WHERE net > 0),
    (SELECT net FROM m ORDER BY mon ASC LIMIT 1), (SELECT net FROM m ORDER BY mon DESC LIMIT 1)
  INTO v_month_count, v_pos_months, v_first_net, v_last_net FROM m;
  IF v_month_count >= 2 THEN
    IF v_pos_months::numeric / v_month_count > 0.5 THEN v_pts := w_profit;
    ELSIF v_last_net > v_first_net THEN v_pts := w_profit * profit_partial;
    ELSIF v_pos_months = 0 THEN v_pts := 0;
    ELSE v_pts := w_profit * v_pos_months::numeric / v_month_count;
    END IF;
    v_points := v_points + v_pts; v_weights := v_weights + w_profit;
    v_components := v_components || jsonb_build_object('key', 'profit', 'label', 'Profit trend',
      'points', round(v_pts, 1), 'max', w_profit,
      'tip', format('Profitable in %s of the last %s months with records. Record every sale and expense.', v_pos_months, v_month_count));
  END IF;

  -- 5. Vaccination follow-through
  IF v_due > 0 THEN
    v_pts := w_vaccination * LEAST(1, v_vacc_rate / vacc_full);
    v_points := v_points + v_pts; v_weights := v_weights + w_vaccination;
    v_components := v_components || jsonb_build_object('key', 'vaccination', 'label', 'Vaccination follow-through',
      'points', round(v_pts, 1), 'max', w_vaccination,
      'tip', format('%s of %s due vaccinations marked as given. Mark each one when done.', v_given, v_due));
    IF v_due > v_given THEN
      v_flags := v_flags || to_jsonb(format('%s past-due %s not marked as given. Update them on the Vaccines page.',
        v_due - v_given, CASE WHEN v_due - v_given = 1 THEN 'vaccination' ELSE 'vaccinations' END));
    END IF;
  END IF;

  v_score := round(v_points / NULLIF(v_weights, 0) * 100);

  INSERT INTO farm_scores (user_id, score, components, flags, summary, months_of_records)
  VALUES (p_user_id, v_score, v_components, v_flags, v_summary, v_months);

  RETURN jsonb_build_object('score', v_score, 'components', v_components, 'flags', v_flags,
    'months_of_records', v_months, 'summary', v_summary, 'computed_at', now());
END; $$;

REVOKE ALL ON FUNCTION public.compute_farm_score(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_farm_score(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_shared_report(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share report_shares%ROWTYPE;
  v_score farm_scores%ROWTYPE;
  v_farm text;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN jsonb_build_object('valid', false);
  END IF;
  SELECT * INTO v_share FROM report_shares
    WHERE token = p_token AND revoked_at IS NULL AND expires_at > now();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false);
  END IF;
  SELECT * INTO v_score FROM farm_scores WHERE user_id = v_share.user_id ORDER BY computed_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false);
  END IF;
  UPDATE report_shares SET view_count = view_count + 1, last_viewed_at = now() WHERE id = v_share.id;
  SELECT farm_name INTO v_farm FROM profiles WHERE id = v_share.user_id;
  RETURN jsonb_build_object(
    'valid', true,
    'farm_name', COALESCE(v_farm, 'Farm'),
    'score', v_score.score,
    'components', v_score.components,
    'months_of_records', v_score.months_of_records,
    'generated_at', v_score.computed_at,
    'expires_at', v_share.expires_at,
    'summary', v_score.summary - 'needed_records' - 'needed_days');
END; $$;

REVOKE ALL ON FUNCTION public.get_shared_report(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_report(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.report_shares_validate() FROM PUBLIC, anon, authenticated;