
-- Pages table: each project can now have many pages
CREATE TABLE public.pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled page',
  slug TEXT NOT NULL,
  html TEXT,
  css TEXT,
  grapesjson JSONB,
  figma_node_id TEXT,
  figma_design_reference_url TEXT,
  figma_metadata JSONB,
  thumbnail_url TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_home BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ready', -- pending | building | ready | failed
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, slug)
);

CREATE INDEX idx_pages_project ON public.pages(project_id, order_index);

ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view own pages" ON public.pages
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = pages.project_id AND p.user_id = auth.uid())
);

CREATE POLICY "Public view pages of published projects" ON public.pages
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = pages.project_id AND p.is_published = true)
);

CREATE POLICY "Admins view all pages" ON public.pages
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners insert pages" ON public.pages
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = pages.project_id AND p.user_id = auth.uid())
);

CREATE POLICY "Owners update pages" ON public.pages
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = pages.project_id AND p.user_id = auth.uid())
);

CREATE POLICY "Owners delete pages" ON public.pages
FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = pages.project_id AND p.user_id = auth.uid())
);

CREATE TRIGGER trg_pages_updated_at
BEFORE UPDATE ON public.pages
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.pages;
ALTER TABLE public.pages REPLICA IDENTITY FULL;

-- Migrate any existing projects' html/css into one home page row
INSERT INTO public.pages (project_id, name, slug, html, css, grapesjson, figma_design_reference_url, figma_metadata, order_index, is_home, status)
SELECT
  p.id,
  COALESCE(NULLIF(p.name, ''), 'Home'),
  'home',
  p.html_content,
  p.css_content,
  p.grapesjson,
  p.figma_design_reference,
  p.figma_metadata,
  0,
  true,
  'ready'
FROM public.projects p
WHERE (p.html_content IS NOT NULL OR p.css_content IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.pages pg WHERE pg.project_id = p.id);
