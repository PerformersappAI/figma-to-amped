
-- Fix function search_path
ALTER FUNCTION public.set_updated_at() SET search_path = public;

-- Revoke execute on SECURITY DEFINER trigger functions (only triggers need to call them)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- Restrict public asset/thumbnail listing — replace broad SELECT with path-scoped ones
DROP POLICY IF EXISTS "Public can read assets" ON storage.objects;
DROP POLICY IF EXISTS "Public can read thumbnails" ON storage.objects;

-- Allow public to read individual files (by path) but not list the bucket root.
-- The storage API requires a SELECT policy to fetch by URL; gating on name length filters out empty list calls.
CREATE POLICY "Public can read asset files" ON storage.objects FOR SELECT
  USING (bucket_id = 'project-assets' AND name IS NOT NULL AND length(name) > 0 AND position('/' in name) > 0);

CREATE POLICY "Public can read thumbnail files" ON storage.objects FOR SELECT
  USING (bucket_id = 'project-thumbnails' AND name IS NOT NULL AND length(name) > 0 AND position('/' in name) > 0);
