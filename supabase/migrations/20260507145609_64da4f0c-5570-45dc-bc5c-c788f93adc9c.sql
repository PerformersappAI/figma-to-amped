-- Add seo metadata column to projects and clear AXIS placeholder content
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS seo jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.projects
SET html_content = '', css_content = '', grapesjson = NULL
WHERE html_content ILIKE '%AXIS%' OR html_content ILIKE '%Strategic Creative%';