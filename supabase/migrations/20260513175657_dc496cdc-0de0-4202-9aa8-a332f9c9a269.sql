ALTER TABLE public.pages
ADD COLUMN IF NOT EXISTS figma_node_tree JSONB,
ADD COLUMN IF NOT EXISTS assets JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS vectors JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.pages
SET assets = COALESCE(assets, '{}'::jsonb),
    vectors = COALESCE(vectors, '{}'::jsonb)
WHERE assets IS NULL OR vectors IS NULL;