-- Security hardening for users_profile.
--
-- Row level security only decides WHICH rows a user may update, not which
-- columns. Without this trigger a user who is allowed to update their own
-- profile (e.g. display_name) could also raise their own credits, un-ban
-- themselves or promote themselves to admin straight from the browser.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users_profile
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only browser sessions are restricted. The service role (Edge Functions)
  -- and SECURITY DEFINER functions run under a different role and pass through.
  IF current_user IN ('authenticated', 'anon') AND NOT public.is_admin() THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.is_banned IS DISTINCT FROM OLD.is_banned
       OR NEW.available_characters IS DISTINCT FROM OLD.available_characters THEN
      RAISE EXCEPTION 'Not allowed to modify protected profile columns'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_columns ON public.users_profile;
CREATE TRIGGER protect_profile_columns
  BEFORE UPDATE ON public.users_profile
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();

-- The client no longer treats a hard-coded e-mail address as admin, the
-- profile role is the single source of truth. Keep the original admin working.
UPDATE public.users_profile
SET role = 'admin'
WHERE id IN (SELECT id FROM auth.users WHERE email = 'admin@voiceforge.com');
