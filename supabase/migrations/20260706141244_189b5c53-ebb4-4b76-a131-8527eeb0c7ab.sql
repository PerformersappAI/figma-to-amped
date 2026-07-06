
-- 1. Column-level SELECT restrictions for anon on pages
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.pages FROM anon;
GRANT SELECT (id, project_id, name, slug, html, css, puck_data, is_home, thumbnail_url, order_index, status) ON public.pages TO anon;

-- 2. Column-level SELECT restrictions for anon on projects
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.projects FROM anon;
GRANT SELECT (id, user_id, name, thumbnail_url, preview_url, is_published, seo) ON public.projects TO anon;

-- 3. user_roles: revoke anon write, add RESTRICTIVE insert policy
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon;
DROP POLICY IF EXISTS "Only admins can insert roles" ON public.user_roles;
CREATE POLICY "Only admins can insert roles"
  ON public.user_roles
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. has_role: switch to SECURITY INVOKER (users can read own roles via RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$;

-- 5. Revoke EXECUTE on remaining SECURITY DEFINER trigger functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
