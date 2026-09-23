-- Security hardening found while auditing the live policies.
--
-- 1. is_admin() also trusted users_profile.email = 'admin@voiceforge.com', but users can
--    update their own profile row, including email. One UPDATE was enough to become admin.
-- 2. The credit protection trigger did not cover email/id, and several SECURITY DEFINER
--    functions had no fixed search_path.
-- 3. Users could insert arbitrary rows into usage_logs (the Edge Function and admins write them).
-- 4. audio_cache accepted any URL for any hash, the voiceovers bucket accepted any file type
--    and size and did not allow overwriting your own upload (forced regeneration failed).
-- 5. Two dead RPCs (deduct_characters, deduct_credits_and_log) were callable by every user.

-- ---------------------------------------------------------------- admin check

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.users_profile WHERE id = auth.uid()),
    false
  );
$$;

-- Same rule for system_settings writes, no e-mail special case.
DROP POLICY IF EXISTS "Enable write access for admins" ON public.system_settings;
CREATE POLICY "Enable write access for admins" ON public.system_settings
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------ protected profile columns

CREATE OR REPLACE FUNCTION public.protect_user_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Browser sessions of non-admins can only change harmless columns (display_name, ...).
  -- The service role (Edge Functions) and admins pass through.
  IF current_setting('request.jwt.claims', true) IS NOT NULL THEN
    IF auth.role() = 'authenticated' AND NOT public.is_admin() THEN
      NEW.id := OLD.id;
      NEW.email := OLD.email;
      NEW.role := OLD.role;
      NEW.is_banned := OLD.is_banned;
      NEW.available_characters := OLD.available_characters;
      NEW.created_at := OLD.created_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_credit_amount integer := 10000;
  setting_val text;
BEGIN
  SELECT value INTO setting_val FROM public.system_settings WHERE key = 'default_credits';

  IF setting_val IS NOT NULL THEN
    BEGIN
      default_credit_amount := setting_val::integer;
    EXCEPTION WHEN OTHERS THEN
      default_credit_amount := 10000;
    END;
  END IF;

  INSERT INTO public.users_profile (id, email, available_characters, role, display_name)
  VALUES (new.id, new.email, default_credit_amount, 'user', new.raw_user_meta_data->>'display_name');
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- ------------------------------------------------------------------ dead RPCs

-- Credits are charged by the generate-speech Edge Function only.
DROP FUNCTION IF EXISTS public.deduct_characters(integer, text, text, uuid);
DROP FUNCTION IF EXISTS public.deduct_credits_and_log(uuid, integer, text, text);

-- --------------------------------------------------------------- usage_logs

-- Logs are written by the Edge Function (service role) and by admins.
DROP POLICY IF EXISTS "Users can insert own logs" ON public.usage_logs;
-- Duplicate of "Users can read own logs".
DROP POLICY IF EXISTS "Users can view own logs" ON public.usage_logs;

-- ------------------------------------------------------------- users_profile

-- Redundant duplicates: the remaining "own OR admin" policies cover them.
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users_profile;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users_profile;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.users_profile;

-- --------------------------------------------------------- audio cache/storage

-- A cache row must point to a file that is named after its own hash.
DROP POLICY IF EXISTS "Authenticated users can insert cache" ON public.audio_cache;
CREATE POLICY "Authenticated users can insert cache" ON public.audio_cache
  FOR INSERT TO authenticated
  WITH CHECK (
    audio_url LIKE '%/storage/v1/object/public/voiceovers/' || hash_key || '.%'
  );

-- Only audio, bounded size.
UPDATE storage.buckets
SET file_size_limit = 26214400, -- 25 MB
    allowed_mime_types = ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/aac']
WHERE id = 'voiceovers';

-- Overwriting is limited to the user's own uploads (needed for forced regeneration).
DROP POLICY IF EXISTS "Owners can overwrite own audio" ON storage.objects;
CREATE POLICY "Owners can overwrite own audio" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'voiceovers' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'voiceovers' AND owner = auth.uid());
