
# FigmaShip — Implementation Plan

A full-stack Figma-to-website platform for non-technical users, branded as a premium dark-mode agency tool (Amped Marketing).

## Tech & Setup

- **Frontend**: TanStack Start + React + Tailwind (already scaffolded). All routes under `src/routes/`.
- **Backend**: Lovable Cloud (Supabase under the hood) — auth, Postgres, Storage, Edge Functions.
- **Editor**: `grapesjs` + `@grapesjs/react` (npm install).
- **ZIP parsing**: `jszip` (client-side on upload).
- **AI**: Anthropic Claude `claude-sonnet-4-5` via a Supabase Edge Function. You'll be asked for `ANTHROPIC_API_KEY`.
- **Public preview**: Server-rendered TanStack route `/preview/$projectId` that fetches stored HTML and renders it in an iframe srcdoc (sandboxed).
- **ZIP format assumption** (you didn't pick): I'll build a **lenient parser** — finds the first/largest `.html` file in the ZIP, inlines any referenced CSS, uploads asset files (images, fonts) to Storage, and rewrites asset paths to public Storage URLs. Works for the Builder.io Visual Copilot single-page export. We can harden it once you test a real export.

## Brand System (global)

Set in `src/styles.css` as design tokens — every component uses these, no inline hex codes.

- `--background: #0a0a0a` · `--surface: #111111` · `--border: #1e1e1e` · `--border-strong: #2a2a2a`
- `--accent: #c8f000` (lime) · `--accent-foreground: #0a0a0a`
- `--foreground: #ffffff` · `--muted-foreground: #888888`
- Fonts: Google Fonts Barlow Condensed (700/800/900) + Barlow (400/500/600). Headings = condensed, uppercase, `letter-spacing: 0.05em`.
- Radius capped at 8px.
- Button variants: `primary` (lime/black/800/uppercase), `ghost` (transparent + 1px `--border-strong` + muted text). Hover = border transitions to `--accent`.
- Toast styling: dark bg, 3px lime left border.

## Database Schema (Lovable Cloud)

```
profiles         (id uuid PK = auth.users.id, email, full_name, company, created_at)
projects         (id uuid PK, user_id uuid FK auth.users, name, original_zip_url,
                  html_content text, css_content text, grapesjson jsonb,
                  preview_url text, thumbnail_url text, is_published bool,
                  created_at, updated_at)
chat_history     (id uuid PK, project_id uuid FK projects, role text check in
                  ('user','assistant'), message text, created_at)
```

RLS: users see only their own profiles/projects/chat. `projects.is_published = true` gets a permissive public SELECT for the preview route. Auto-create profile via trigger on `auth.users` insert.

Storage buckets:
- `project-zips` (private) — raw uploads
- `project-assets` (public) — extracted images/fonts referenced in rendered HTML
- `project-thumbnails` (public) — dashboard thumbnails

## Routes

```
src/routes/
  __root.tsx                       (existing — add fonts + global styles)
  index.tsx                        (marketing landing → CTA to /login)
  login.tsx                        (email/password + signup, redirects to /dashboard)
  onboarding.tsx                   (one-question company name form)
  _authenticated.tsx               (auth guard layout)
  _authenticated/dashboard.tsx     (project grid + New Project)
  _authenticated/upload.tsx        (Screen 1)
  _authenticated/projects.$id.preview.tsx   (Screen 2)
  _authenticated/projects.$id.editor.tsx    (Screen 3 + Screen 4 drawer + Screen 5 modal)
  preview.$projectId.tsx           (public, no auth — Screen 5 share link target)
  api/ai-design-chat.ts            (server route calling Anthropic)
  api/export-zip.$projectId.ts     (server route returning a ZIP download)
```

## Screen-by-Screen

**Screen 1 — Upload** (`/upload`)
Centered drag-drop zone (lime dashed border, 2px). Accepts `.zip` or pasted Figma share URL (fallback only stores the URL on the project — actual import requires the ZIP). On drop: client-side JSZip parse → upload raw ZIP to `project-zips` → upload extracted assets to `project-assets` → rewrite asset URLs in HTML/CSS → insert `projects` row → redirect to `/projects/{id}/preview`. Progress bar driven by upload + parse phases.

**Screen 2 — Live Preview** (`/projects/$id/preview`)
Sidebar (260px, `--surface`) with project name, breadcrumbs. Main area: iframe with `srcdoc={html_content}`, wrapped in subtle dark frame. Top toolbar: Desktop / Tablet / Mobile toggles (1280 / 768 / 390 widths via CSS max-width). Primary "Looks good — open editor" + ghost "Re-upload".

**Screen 3 — Visual Editor** (`/projects/$id/editor`)
- `@grapesjs/react` GjsEditor mounted full-height. On init: load `html_content` + `css_content` (or `grapesjson` if previously saved).
- Custom blocks panel left: Section, Hero, Text, Image, Button, Columns, Spacer, Video, Form.
- Style manager right (default GrapesJS, themed).
- Top bar: Undo, Redo, Desktop/Mobile, Save Draft, Publish.
- Save → write `grapesjson` + rendered `html_content` + `css_content` back to row.
- **GrapesJS theming**: scoped CSS overriding `.gjs-*` classes — `--gjs-primary-color: #0a0a0a`, `--gjs-secondary-color: #111`, `--gjs-tertiary-color: #c8f000`, `--gjs-quaternary-color: #fff`, panel bg `#111`, active states lime, white text.
- Floating lime circular button bottom-right (56px) with chat icon → opens Screen 4 drawer (controls drawer state in same route component, editor stays mounted).

**Screen 4 — AI Design Assistant** (drawer in editor)
- Right-side `Sheet` (shadcn, modal=false so editor remains usable), `--surface` bg, 420px wide.
- Top: header. Middle: scrollable message list — user bubbles white bg/black text, AI bubbles `#1e1e1e` bg/white text. Bottom: 5 quick chips → "Fix my fonts", "Improve spacing", "Make it mobile-friendly", "Check brand colors", "Add a call to action". Below chips: textarea + lime send button.
- On send: insert user msg into `chat_history`, POST to `/api/ai-design-chat` with `{ project_id, messages }`. Server route loads recent history, calls Anthropic `claude-sonnet-4-5` with the system prompt verbatim from the brief, streams (SSE) the assistant reply back, persists the final assistant message.
- Surfaces 429/402/auth errors as themed toasts.

**Screen 5 — Publish & Export** (modal triggered by Publish in editor)
Three cards in a single row (stack on mobile), lime icons, white headings:
1. **Download ZIP** → calls `/api/export-zip/{projectId}` server route which builds a fresh ZIP (index.html + style.css + assets/) and streams it back.
2. **Copy clean code** → opens a panel with Prism-highlighted HTML + CSS, copy button.
3. **Share preview link** → flips `is_published=true`, generates `preview_url = ${origin}/preview/${id}`, shows it with copy button. The public route fetches the published row (RLS allows it) and renders the HTML in a sandboxed iframe (`srcdoc`) at full viewport — no chrome, no auth.

**Dashboard** (`/dashboard`)
Top bar: "FigmaShip" wordmark left, lime "+ New Project" right. Grid of cards (`--surface`, `--border`, hover border → lime). Each card: thumbnail (or placeholder), name (Barlow Condensed uppercase), updated date (muted), kebab menu → Open Editor / Share Preview / Delete (confirm dialog).

**Auth**
- Lovable Cloud email/password. Login page with both Sign In and Sign Up tabs. `emailRedirectTo: window.location.origin`.
- After signup: if `profiles.company` empty → redirect to `/onboarding`, else `/dashboard`.
- `_authenticated` layout uses `beforeLoad` to redirect to `/login` when no session.

## Server / Edge

- `/api/ai-design-chat` (TanStack server route) — POST, requires auth via `requireSupabaseAuth`. Validates input (Zod). Reads `ANTHROPIC_API_KEY` from `process.env` at handler time. Calls Anthropic Messages API with streaming, proxies SSE to client.
- `/api/export-zip/$projectId` — GET, requires auth + ownership check. Uses `jszip` server-side to build the archive from stored html/css + asset URLs (re-fetches assets from public Storage URLs).
- `preview/$projectId` — public TanStack route, server loader fetches the published row using anon client (RLS gates it), returns html, renders sandboxed iframe.

## Secrets

I'll request `ANTHROPIC_API_KEY` after the Cloud backend is wired up.

## Build Order

1. Enable Lovable Cloud, create schema + RLS + storage buckets + profile trigger.
2. Add brand tokens (`src/styles.css`), Google Fonts, base components (Button variants, Card, Toast).
3. Auth + onboarding + `_authenticated` guard + Dashboard.
4. Screen 1 Upload (with JSZip parser + storage uploads).
5. Screen 2 Preview.
6. Install `grapesjs` + `@grapesjs/react`, build Screen 3 editor with custom blocks + theme overrides + save.
7. Screen 4 chat drawer + Anthropic edge function (request `ANTHROPIC_API_KEY`).
8. Screen 5 publish modal + export-zip route + public `/preview/$projectId` route.
9. Landing page + final QA pass on every screen against brand rules.

## Out of Scope (v1)

- Importing React/Next.js project exports (lenient parser handles HTML+CSS only).
- Live collaboration / multi-user editing.
- Custom domains for shared previews (uses lovable.app subdomain).
- Versioning / draft history beyond a single `grapesjson` per project.
