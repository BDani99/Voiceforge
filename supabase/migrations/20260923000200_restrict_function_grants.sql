-- SECURITY DEFINER functions in the public schema are callable through /rest/v1/rpc by default.
-- Only expose what the app really calls.

-- Trigger functions run from their triggers, nobody needs to call them directly.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_user_credits() FROM PUBLIC, anon, authenticated;

-- Called by signed-in users only.
REVOKE ALL ON FUNCTION public.delete_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;

-- Admin dashboard (the function additionally checks is_admin()).
REVOKE ALL ON FUNCTION public.admin_dashboard_stats(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats(integer) TO authenticated;

-- is_admin() stays executable for anon and authenticated: RLS policies evaluate it
-- with the caller's privileges, and it only ever answers about the caller.
