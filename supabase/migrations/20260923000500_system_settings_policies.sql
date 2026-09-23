-- system_settings had one FOR ALL admin policy, which PostgreSQL also evaluates for SELECT.
-- That forced is_admin() to stay executable for signed-out visitors. Splitting the policy by
-- command lets anon read the announcement without ever touching admin functions.

DROP POLICY IF EXISTS "Enable write access for admins" ON public.system_settings;

CREATE POLICY "Admins can insert settings" ON public.system_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update settings" ON public.system_settings
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete settings" ON public.system_settings
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- The remaining policies that call is_admin() are only reachable by signed-in users.
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

COMMENT ON TABLE public.credit_reservations IS
  'Internal ledger of credit reservations. RLS is on with no policies on purpose: only the SECURITY DEFINER credit functions (service role) may touch it.';
