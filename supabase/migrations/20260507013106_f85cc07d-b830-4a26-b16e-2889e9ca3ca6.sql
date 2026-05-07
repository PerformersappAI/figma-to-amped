
-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  company TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Projects table
CREATE TABLE public.projects (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Project',
  original_zip_url TEXT,
  html_content TEXT,
  css_content TEXT,
  grapesjson JSONB,
  preview_url TEXT,
  thumbnail_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can view own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Public can view published projects" ON public.projects FOR SELECT USING (is_published = true);
CREATE POLICY "Users can insert own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

-- Chat history table
CREATE TABLE public.chat_history (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view chat for own projects" ON public.chat_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = chat_history.project_id AND p.user_id = auth.uid()));
CREATE POLICY "Users can insert chat for own projects" ON public.chat_history FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = chat_history.project_id AND p.user_id = auth.uid()));

-- Auto profile trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER set_projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('project-zips', 'project-zips', false),
  ('project-assets', 'project-assets', true),
  ('project-thumbnails', 'project-thumbnails', true);

-- Storage policies: project-zips (private, owner only by user_id prefix)
CREATE POLICY "Users can upload own zips" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'project-zips' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can read own zips" ON storage.objects FOR SELECT
  USING (bucket_id = 'project-zips' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own zips" ON storage.objects FOR DELETE
  USING (bucket_id = 'project-zips' AND auth.uid()::text = (storage.foldername(name))[1]);

-- project-assets (public read, owner write)
CREATE POLICY "Public can read assets" ON storage.objects FOR SELECT USING (bucket_id = 'project-assets');
CREATE POLICY "Users can upload own assets" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'project-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own assets" ON storage.objects FOR UPDATE
  USING (bucket_id = 'project-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own assets" ON storage.objects FOR DELETE
  USING (bucket_id = 'project-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

-- project-thumbnails (public read, owner write)
CREATE POLICY "Public can read thumbnails" ON storage.objects FOR SELECT USING (bucket_id = 'project-thumbnails');
CREATE POLICY "Users can upload own thumbnails" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'project-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own thumbnails" ON storage.objects FOR UPDATE
  USING (bucket_id = 'project-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);
