-- Bootstrap: grant admin role to will@actorwillroberts.com if user exists
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users WHERE lower(email) = 'will@actorwillroberts.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Security definer function callable only by existing admins
CREATE OR REPLACE FUNCTION public.grant_admin(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can grant the admin role';
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_admin(uuid) TO authenticated;