-- Credit reservations, rate limiting and enforced suspension.
--
-- 1. The Edge Function used to read the balance, write it back and refund by hand. If the
--    runtime died between charging and refunding, the credits were simply gone. Credits are
--    now reserved by one atomic SQL function that also writes a reservation row. The row is
--    settled after a successful generation, refunded on failure, and a scheduled job refunds
--    anything that stayed pending (crashed request).
-- 2. reserve_credits limits how many requests a user may start per minute.
-- 3. A suspended user could keep using the API with a still valid JWT (up to one hour). Restrictive
--    policies now block their writes at the database, no matter what the client does.

-- ------------------------------------------------------------------ reservations

CREATE TABLE IF NOT EXISTS public.credit_reservations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  amount      integer NOT NULL CHECK (amount > 0),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'refunded')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_reservations_user_created_idx
  ON public.credit_reservations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_reservations_pending_idx
  ON public.credit_reservations (created_at) WHERE status = 'pending';

-- Internal bookkeeping: no policies and no grants, only the functions below (service role) touch it.
ALTER TABLE public.credit_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.credit_reservations FROM PUBLIC, anon, authenticated;

-- Custom SQLSTATEs the Edge Function maps to HTTP statuses:
--   P0402 insufficient credits, P0403 account suspended, P0429 rate limited.
CREATE OR REPLACE FUNCTION public.reserve_credits(
  p_user_id uuid,
  p_amount integer,
  p_max_per_minute integer DEFAULT 60
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_banned boolean;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(is_banned, false) INTO v_banned FROM public.users_profile WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0404';
  END IF;
  IF v_banned THEN
    RAISE EXCEPTION 'account_suspended' USING ERRCODE = 'P0403';
  END IF;

  IF (SELECT count(*) FROM public.credit_reservations
      WHERE user_id = p_user_id AND created_at > now() - interval '1 minute') >= p_max_per_minute THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0429';
  END IF;

  -- One statement checks and charges, so parallel requests can never overdraw the account.
  UPDATE public.users_profile
  SET available_characters = available_characters - p_amount
  WHERE id = p_user_id AND available_characters >= p_amount;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0402';
  END IF;

  INSERT INTO public.credit_reservations (user_id, amount)
  VALUES (p_user_id, p_amount)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_credits(p_reservation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.credit_reservations
  SET status = 'settled', updated_at = now()
  WHERE id = p_reservation_id AND status = 'pending';
  RETURN FOUND;
END;
$$;

-- Idempotent: a reservation is refunded at most once, and never after it was settled.
CREATE OR REPLACE FUNCTION public.refund_credits(p_reservation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_amount integer;
BEGIN
  UPDATE public.credit_reservations
  SET status = 'refunded', updated_at = now()
  WHERE id = p_reservation_id AND status = 'pending'
  RETURNING user_id, amount INTO v_user, v_amount;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.users_profile
  SET available_characters = available_characters + v_amount
  WHERE id = v_user;
  RETURN true;
END;
$$;

-- Refunds reservations whose request never finished. A request lives well under a minute,
-- so anything pending for longer than the threshold belongs to a crashed invocation.
CREATE OR REPLACE FUNCTION public.reconcile_credit_reservations(p_older_than interval DEFAULT interval '10 minutes')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM public.credit_reservations
    WHERE status = 'pending' AND created_at < now() - p_older_than
    FOR UPDATE SKIP LOCKED
  LOOP
    IF public.refund_credits(v_id) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_credits(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_credits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_credits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_credit_reservations(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_credits(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_credits(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_credit_reservations(interval) TO service_role;

-- --------------------------------------------------------------------- schedule

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'reconcile-credit-reservations',
  '*/5 * * * *',
  $cron$SELECT public.reconcile_credit_reservations()$cron$
);

SELECT cron.schedule(
  'prune-credit-reservations',
  '17 3 * * *',
  $cron$DELETE FROM public.credit_reservations WHERE status <> 'pending' AND created_at < now() - interval '30 days'$cron$
);

-- ------------------------------------------------------------ enforced suspension

CREATE OR REPLACE FUNCTION public.is_banned()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_banned FROM public.users_profile WHERE id = auth.uid()), false);
$$;

-- Evaluated by RLS with the caller's rights; it only ever answers about the caller.
GRANT EXECUTE ON FUNCTION public.is_banned() TO authenticated;
REVOKE ALL ON FUNCTION public.is_banned() FROM PUBLIC, anon;

-- RESTRICTIVE policies are ANDed with the existing ones. A suspended user keeps read access to
-- their own profile (the app needs it to notice the suspension and sign them out).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['projects', 'paragraphs', 'presets', 'dictionaries']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Suspended users have no access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Suspended users have no access" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (NOT public.is_banned()) WITH CHECK (NOT public.is_banned())', t);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "Suspended users cannot write cache" ON public.audio_cache;
CREATE POLICY "Suspended users cannot write cache" ON public.audio_cache
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_banned());

DROP POLICY IF EXISTS "Suspended users cannot edit profile" ON public.users_profile;
CREATE POLICY "Suspended users cannot edit profile" ON public.users_profile
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.is_banned());

DROP POLICY IF EXISTS "Suspended users cannot upload" ON storage.objects;
CREATE POLICY "Suspended users cannot upload" ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_banned());

DROP POLICY IF EXISTS "Suspended users cannot overwrite" ON storage.objects;
CREATE POLICY "Suspended users cannot overwrite" ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.is_banned());
