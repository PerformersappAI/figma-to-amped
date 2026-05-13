
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS figma_design_reference text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS figma_metadata jsonb;

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid,
  operation text NOT NULL,
  model text,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10,6),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ai usage"
  ON public.ai_usage_log FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own ai usage"
  ON public.ai_usage_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);
