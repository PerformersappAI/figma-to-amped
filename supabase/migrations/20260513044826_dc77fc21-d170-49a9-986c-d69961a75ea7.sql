CREATE TABLE public.figma_connections (
  user_id uuid PRIMARY KEY,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  figma_user_id text,
  figma_handle text,
  figma_email text,
  figma_img_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.figma_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own figma connection"
  ON public.figma_connections FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own figma connection"
  ON public.figma_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own figma connection"
  ON public.figma_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own figma connection"
  ON public.figma_connections FOR DELETE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER figma_connections_updated_at
  BEFORE UPDATE ON public.figma_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.figma_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.figma_oauth_states ENABLE ROW LEVEL SECURITY;

-- No client policies; only the service role (server-side) reads/writes this table.
