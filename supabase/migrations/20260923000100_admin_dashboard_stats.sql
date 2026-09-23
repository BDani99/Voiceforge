-- Aggregates the admin dashboard numbers inside the database.
--
-- The dashboard used to download raw usage_logs rows and sum them in the browser,
-- but PostgREST returns at most 1000 rows per request, so the totals were silently
-- truncated on any busy installation.

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats(days integer DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  window_days integer := LEAST(GREATEST(days, 1), 365);
  result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total_users',  (SELECT count(*) FROM public.users_profile),
    'api_calls',    (SELECT count(*) FROM public.usage_logs
                     WHERE action_type IN ('generation', 'preview')),
    'cached_files', (SELECT count(*) FROM public.audio_cache),
    'daily_active', (SELECT count(DISTINCT user_id) FROM public.usage_logs
                     WHERE created_at >= now() - interval '1 day'),
    'daily_characters', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object('day', d.day, 'characters', COALESCE(u.chars, 0))
               ORDER BY d.day)
      FROM (
        SELECT g::date AS day
        FROM generate_series(current_date - (window_days - 1), current_date, interval '1 day') AS g
      ) d
      LEFT JOIN (
        SELECT created_at::date AS day, sum(character_count)::bigint AS chars
        FROM public.usage_logs
        WHERE action_type IN ('generation', 'preview')
          AND created_at >= current_date - (window_days - 1)
        GROUP BY 1
      ) u ON u.day = d.day
    ), '[]'::jsonb),
    'languages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('language', t.lang, 'characters', t.chars)
                       ORDER BY t.chars DESC)
      FROM (
        SELECT language AS lang, sum(character_count)::bigint AS chars
        FROM public.usage_logs
        WHERE action_type IN ('generation', 'preview')
          AND language IS NOT NULL
          AND created_at >= current_date - (window_days - 1)
        GROUP BY language
        ORDER BY chars DESC
        LIMIT 6
      ) t
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_stats(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats(integer) TO authenticated;
