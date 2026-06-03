const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, Table, TableRow, TableCell, WidthType, BorderStyle } = require('docx');
const fs = require('fs');

const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function makeCell(text, width, bold = false) {
  return new TableCell({
    borders: cellBorders,
    width: { size: width, type: WidthType.DXA },
    children: [new Paragraph({ children: [new TextRun({ text, bold, size: 20, font: "Arial" })] })],
  });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "2E75B6" },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: {
      page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
    },
    children: [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        children: [new TextRun("Amped FigmaShip — Full Build Report")]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Product Overview, Architecture & Technology Stack", size: 22, italics: true, color: "666666" })]
      }),
      new Paragraph({ text: "" }),

      // EXECUTIVE SUMMARY
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("1. Executive Summary")] }),
      new Paragraph({ children: [new TextRun("Amped FigmaShip is a visual website builder that turns Figma designs into live, editable websites. Users connect their Figma account, paste a file URL, select the pages (frames) they want, and the platform automatically fetches the design, processes all assets, converts the layout to HTML/CSS, and opens it in a GrapesJS visual editor where users can drag, drop, and restyle elements before publishing a shareable preview.")] }),
      new Paragraph({ text: "" }),

      // CORE FEATURES
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("2. Core Features")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("2.1 Figma Import Pipeline")] }),
      new Paragraph({ children: [new TextRun({ text: "Five-Step Batch Pipeline:", bold: true }), new TextRun(" Each selected Figma frame goes through a deterministic pipeline: (1) Fetch Node — download the full node tree from Figma API; (2) Process Assets — download images, render vector SVGs, and cache thumbnails; (3) Render — convert the node tree to semantic HTML/CSS using a custom deterministic converter; (4) Cleanup — run AI-assisted cleanup for short, clean markup; (5) Ready — store in the database and make available for editing.")] }),
      new Paragraph({ children: [new TextRun({ text: "Multi-Page Support:", bold: true }), new TextRun(" Users can select multiple frames from a Figma file (e.g. Home, About, Contact, Mobile versions) and build them all in one batch with real-time progress tracking via Supabase Realtime.")] }),
      new Paragraph({ children: [new TextRun({ text: "OAuth Integration:", bold: true }), new TextRun(" Full Figma OAuth 2.0 flow with token refresh, state validation, and secure credential storage in the database.")] }),
      new Paragraph({ text: "" }),

      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("2.2 ZIP Upload Fallback")] }),
      new Paragraph({ children: [new TextRun("Users can also drop a ZIP export directly. The system extracts HTML/CSS/images from the ZIP, creates a project, and routes to the preview.")] }),
      new Paragraph({ text: "" }),

      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("2.3 Visual Editor (GrapesJS)")] }),
      new Paragraph({ children: [new TextRun({ text: "GrapesJS Integration:", bold: true }), new TextRun(" The editor uses GrapesJS v0.23.2 with the preset-webpage and blocks-basic plugins. It provides a full WYSIWYG canvas with block manager, style manager, layer manager, and device preview (Desktop, Tablet, Mobile).")] }),
      new Paragraph({ children: [new TextRun({ text: "Custom Blocks:", bold: true }), new TextRun(" A custom 'Shopify Product' block in the Commerce category inserts a product card with data-shopify-product-id attribute, ready for e-commerce integration.")] }),
      new Paragraph({ children: [new TextRun({ text: "Canvas Centering:", bold: true }), new TextRun(" The converted page sits centered in the GrapesJS iframe with dark gutters, preserving the original Figma frame width for pixel-accurate editing.")] }),
      new Paragraph({ text: "" }),

      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("2.4 AI Design Assistant")] }),
      new Paragraph({ children: [new TextRun("An AI-powered chat assistant helps users with design decisions, font choices, spacing adjustments, and brand polish. Chat history is persisted per project.")] }),
      new Paragraph({ text: "" }),

      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("2.5 Publishing & Sharing")] }),
      new Paragraph({ children: [new TextRun("Projects can be published to generate a public preview URL. Published projects get a 'Live' badge on the dashboard. Share links are copyable with one click.")] }),
      new Paragraph({ text: "" }),

      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("2.6 Admin Panel")] }),
      new Paragraph({ children: [new TextRun("A role-based admin panel (using a separate user_roles table) is available for administrators to monitor and manage the platform.")] }),
      new Paragraph({ text: "" }),

      // TECH STACK
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3. Technology Stack")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("3.1 Frontend Framework")] }),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2800, 6560],
        rows: [
          new TableRow({ children: [makeCell("Technology", 2800, true), makeCell("Purpose / Version", 6560, true)] }),
          new TableRow({ children: [makeCell("React", 2800), makeCell("UI library — v19.2.0", 6560)] }),
          new TableRow({ children: [makeCell("TanStack Start", 2800), makeCell("Full-stack React framework (v1.167+) with file-based routing, SSR, and server functions", 6560)] }),
          new TableRow({ children: [makeCell("TanStack Router", 2800), makeCell("Type-safe file-based routing (v1.168+)", 6560)] }),
          new TableRow({ children: [makeCell("TanStack Query", 2800), makeCell("Server state management and data fetching (v5.83+)", 6560)] }),
          new TableRow({ children: [makeCell("TypeScript", 2800), makeCell("Type safety — v5.8.3, strict mode enabled", 6560)] }),
          new TableRow({ children: [makeCell("Vite", 2800), makeCell("Build tool and dev server — v7.3.1", 6560)] }),
        ]
      }),
      new Paragraph({ text: "" }),

      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("3.2 Styling & UI")] }),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2800, 6560],
        rows: [
          new TableRow({ children: [makeCell("Technology", 2800, true), makeCell("Purpose / Version", 6560, true)] }),
          new TableRow({ children: [makeCell("Tailwind CSS", 2800), makeCell("Utility-first CSS — v4.2.1 with native CSS @theme and oklch tokens", 6560)] }),
          new TableRow({ children: [makeCell("Radix UI", 2800), makeCell("Headless accessible UI primitives (dialogs, dropdowns, tabs, etc.)", 6560)] }),
          new TableRow({ children: [makeCell("shadcn/ui pattern", 2800), makeCell("Component architecture using CVA (class-variance-authority), tailwind-merge, clsx", 6560)] }),
          new TableRow({ children: [makeCell("Lucide React", 2800), makeCell("Icon library — v0.575.0", 6560)] }),
          new TableRow({ children: [makeCell("Sonner", 2800), makeCell("Toast notifications — v2.0.7", 6560)] }),
          new TableRow({ children: [makeCell("Recharts", 2800), makeCell("Charting library — v2.15.4", 6560)] }),
        ]
      }),
      new Paragraph({ text: "" }),

      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("3.3 Backend & Database")] }),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2800, 6560],
        rows: [
          new TableRow({ children: [makeCell("Technology", 2800, true), makeCell("Purpose / Version", 6560, true)] }),
          new TableRow({ children: [makeCell("Lovable Cloud", 2800), makeCell("Managed backend platform (database, auth, storage, server functions)", 6560)] }),
          new TableRow({ children: [makeCell("PostgreSQL", 2800), makeCell("Primary database with Row Level Security (RLS) policies", 6560)] }),
          new TableRow({ children: [makeCell("Supabase Auth", 2800), makeCell("Authentication system with email, Google OAuth, JWT sessions", 6560)] }),
          new TableRow({ children: [makeCell("Supabase Storage", 2800), makeCell("File storage for thumbnails, ZIP uploads, and vector assets", 6560)] }),
          new TableRow({ children: [makeCell("Supabase Realtime", 2800), makeCell("Live page status updates during batch build pipeline", 6560)] }),
        ]
      }),
      new Paragraph({ text: "" }),

      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("3.4 Visual Editor")] }),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2800, 6560],
        rows: [
          new TableRow({ children: [makeCell("Technology", 2800, true), makeCell("Purpose / Version", 6560, true)] }),
          new TableRow({ children: [makeCell("GrapesJS", 2800), makeCell("Open-source visual web builder — v0.23.2", 6560)] }),
          new TableRow({ children: [makeCell("grapesjs-preset-webpage", 2800), makeCell("Official preset with panels, device manager, and default blocks", 6560)] }),
          new TableRow({ children: [makeCell("grapesjs-blocks-basic", 2800), makeCell("Basic block collection (text, image, column, etc.)", 6560)] }),
        ]
      }),
      new Paragraph({ text: "" }),

      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("3.5 External APIs & Services")] }),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2800, 6560],
        rows: [
          new TableRow({ children: [makeCell("Service", 2800, true), makeCell("Purpose", 6560, true)] }),
          new TableRow({ children: [makeCell("Figma API", 2800), makeCell("File tree retrieval, node data, image exports, OAuth", 6560)] }),
          new TableRow({ children: [makeCell("Lovable AI Gateway", 2800), makeCell("AI-powered design chat and HTML cleanup (Gemini, GPT models)", 6560)] }),
        ]
      }),
      new Paragraph({ text: "" }),

      // DESIGN SYSTEM
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4. Design System")] }),
      new Paragraph({ children: [new TextRun({ text: "Theme:", bold: true }), new TextRun(" Dark mode only with an Amped Marketing brand identity.")] }),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2800, 2800, 3760],
        rows: [
          new TableRow({ children: [makeCell("Token", 2800, true), makeCell("Value", 2800, true), makeCell("Usage", 3760, true)] }),
          new TableRow({ children: [makeCell("Background", 2800), makeCell("#0a0a0a", 2800), makeCell("Main app background", 3760)] }),
          new TableRow({ children: [makeCell("Surface", 2800), makeCell("#111111", 2800), makeCell("Card / panel backgrounds", 3760)] }),
          new TableRow({ children: [makeCell("Surface-2", 2800), makeCell("#1a1a1a", 2800), makeCell("Elevated surfaces, inputs", 3760)] }),
          new TableRow({ children: [makeCell("Border", 2800), makeCell("#1e1e1e", 2800), makeCell("Subtle dividers", 3760)] }),
          new TableRow({ children: [makeCell("Border Strong", 2800), makeCell("#2a2a2a", 2800), makeCell("Panel borders, hover states", 3760)] }),
          new TableRow({ children: [makeCell("Foreground", 2800), makeCell("#ffffff", 2800), makeCell("Primary text", 3760)] }),
          new TableRow({ children: [makeCell("Muted Foreground", 2800), makeCell("#888888", 2800), makeCell("Secondary / placeholder text", 3760)] }),
          new TableRow({ children: [makeCell("Accent", 2800), makeCell("#c8f000", 2800), makeCell("Buttons, badges, highlights", 3760)] }),
          new TableRow({ children: [makeCell("Destructive", 2800), makeCell("#ff3b30", 2800), makeCell("Errors, delete actions", 3760)] }),
        ]
      }),
      new Paragraph({ children: [new TextRun({ text: "Typography:", bold: true }), new TextRun(" Barlow Condensed (display/headings, weights 700-900) + Barlow (body, weights 400-600). Both loaded from Google Fonts.")] }),
      new Paragraph({ text: "" }),

      // DATA MODEL
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("5. Database Schema")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("5.1 projects")] }),
      new Paragraph({ children: [new TextRun("Stores user projects. Contains: user_id, name, html_content, css_content, figma_metadata, grapesjson, is_published, thumbnail_url, original_zip_url, preview_url, seo JSON, and timestamps. One project can have many pages.")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("5.2 pages")] }),
      new Paragraph({ children: [new TextRun("Individual pages within a project. Stores: project_id, name, slug, html, css, figma_node_id, figma_node_tree (cached Figma data), figma_metadata, assets (image map), vectors (SVG map), grapesjson (editor state), status (pending → fetching → assets-ready → rendered → cleaning → ready → failed), thumbnail_url, is_home flag, order_index, and error_message.")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("5.3 profiles")] }),
      new Paragraph({ children: [new TextRun("User profile data linked to auth.users: id, email, full_name, company, timestamps.")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("5.4 figma_connections")] }),
      new Paragraph({ children: [new TextRun("OAuth credentials for Figma: user_id, access_token, refresh_token, expires_at, figma_handle, figma_email, figma_img_url, figma_user_id.")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("5.5 chat_history")] }),
      new Paragraph({ children: [new TextRun("AI chat messages per project: project_id, role (user/assistant), message, timestamps.")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("5.6 ai_usage_log")] }),
      new Paragraph({ children: [new TextRun("Tracks AI API consumption: user_id, project_id, operation, model, input/output tokens, cost_usd, metadata.")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("5.7 user_roles")] }),
      new Paragraph({ children: [new TextRun("Role-based access control with app_role enum (admin, user). Separate table from profiles for security. Has a has_role() security definer function for RLS policies.")] }),
      new Paragraph({ text: "" }),

      // ARCHITECTURE
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("6. Application Architecture")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("6.1 File Structure")] }),
      new Paragraph({ children: [new TextRun("src/routes/ — File-based routes (TanStack Router). Each .tsx file maps to a URL. API routes under src/routes/api/.")] }),
      new Paragraph({ children: [new TextRun("src/components/ — Reusable React components (GrapesEditor, ChatDrawer, PublishModal, CanvasEditor legacy).")] }),
      new Paragraph({ children: [new TextRun("src/lib/ — Business logic: auth.tsx (context), figma-convert.ts (deterministic converter), figma-convert.server.ts (pipeline steps), zip-import.ts, use-admin.ts, utils.ts.")] }),
      new Paragraph({ children: [new TextRun("src/integrations/supabase/ — Auto-generated Supabase clients (browser, server, admin, auth middleware, auth attacher, types).")] }),
      new Paragraph({ text: "" }),

      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("6.2 Server Functions (createServerFn)")] }),
      new Paragraph({ children: [new TextRun("Backend logic is implemented as TanStack server functions, NOT Supabase Edge Functions. Key server functions:")] }),
      new Paragraph({ children: [new TextRun("- runFetchNodeStep — fetches a specific node tree from Figma API")] }),
      new Paragraph({ children: [new TextRun("- runProcessAssetsStep — downloads images, renders vector SVGs via Figma /v1/images")] }),
      new Paragraph({ children: [new TextRun("- runRenderStep — converts the cached figma_node_tree to HTML/CSS")] }),
      new Paragraph({ children: [new TextRun("- runCleanupStep — AI-assisted HTML cleanup")] }),
      new Paragraph({ children: [new TextRun("All protected by requireSupabaseAuth middleware. attachSupabaseAuth in start.ts ensures the user's bearer token is sent with every server function call.")] }),
      new Paragraph({ text: "" }),

      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("6.3 Server Routes (API Endpoints)")] }),
      new Paragraph({ children: [new TextRun("- POST /api/figma/import — Parses a Figma URL, fetches file tree, resolves thumbnails")] }),
      new Paragraph({ children: [new TextRun("- POST /api/figma/fetch-node — Step 1: fetch individual node data")] }),
      new Paragraph({ children: [new TextRun("- POST /api/figma/process-assets — Step 2: download images and SVGs")] }),
      new Paragraph({ children: [new TextRun("- POST /api/figma/render — Step 3: convert to HTML/CSS")] }),
      new Paragraph({ children: [new TextRun("- POST /api/figma/cleanup — Step 4: AI cleanup")] }),
      new Paragraph({ children: [new TextRun("- POST /api/figma/convert-batch — Batch orchestration endpoint")] }),
      new Paragraph({ children: [new TextRun("- POST /api/figma.disconnect — Revokes Figma connection")] }),
      new Paragraph({ children: [new TextRun("- POST /api/ai-design-chat — AI design assistant chat endpoint")] }),
      new Paragraph({ text: "" }),

      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("6.4 Authentication Flow")] }),
      new Paragraph({ children: [new TextRun("1. User signs up/logs in via email or Google OAuth (Supabase Auth)")] }),
      new Paragraph({ children: [new TextRun("2. On first login, onboarding screen collects company name and saves to profiles")] }),
      new Paragraph({ children: [new TextRun("3. Auth state is managed via AuthProvider context with onAuthStateChange listener")] }),
      new Paragraph({ children: [new TextRun("4. _authenticated layout route guards all protected pages (redirects to /login)")] }),
      new Paragraph({ children: [new TextRun("5. Figma OAuth is a separate flow: /auth/figma.start initiates, /auth/figma.callback handles the code exchange")] }),
      new Paragraph({ text: "" }),

      // FIGMA CONVERTER
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("7. Figma-to-HTML Converter")] }),
      new Paragraph({ children: [new TextRun("The converter (src/lib/figma-convert.ts) is a pure, deterministic TypeScript function with NO AI involvement. It walks the Figma node tree and maps each node type to semantic HTML:")] }),
      new Paragraph({ children: [new TextRun("- TEXT nodes → <h1>/<h2>/<h3>/<p> with font-size, font-family, font-weight, line-height, letter-spacing, text-align, color")] }),
      new Paragraph({ children: [new TextRun("- RECTANGLE with image fill → <img> with object-fit: cover")] }),
      new Paragraph({ children: [new TextRun("- ELLIPSE → <div> with border-radius: 50%")] }),
      new Paragraph({ children: [new TextRun("- VECTOR / BOOLEAN_OPERATION / STAR / LINE / GROUP(vectors) → inline <svg>")] }),
      new Paragraph({ children: [new TextRun("- FRAME/GROUP/INSTANCE with auto-layout → flex container with gap, padding, justify-content, align-items")] }),
      new Paragraph({ children: [new TextRun("- FRAME/GROUP without auto-layout → relative container with absolutely positioned children using Figma X/Y coordinates")] }),
      new Paragraph({ children: [new TextRun("- Masks: detects isMask === true, drops the mask layer, applies overflow: hidden (and border-radius: 50% for ellipse masks) to the parent")] }),
      new Paragraph({ children: [new TextRun("- Fills: SOLID → rgb/rgba, IMAGE → background-image, GRADIENT → CSS linear-gradient")] }),
      new Paragraph({ children: [new TextRun("- Effects: DROP_SHADOW / INNER_SHADOW → CSS box-shadow")] }),
      new Paragraph({ children: [new TextRun("- Strokes: solid borders with strokeWeight")] }),
      new Paragraph({ text: "" }),

      // ROUTES
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("8. Route Map")] }),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2800, 2800, 3760],
        rows: [
          new TableRow({ children: [makeCell("Route", 2800, true), makeCell("Auth", 2800, true), makeCell("Purpose", 3760, true)] }),
          new TableRow({ children: [makeCell("/", 2800), makeCell("Public", 2800), makeCell("Marketing landing page", 3760)] }),
          new TableRow({ children: [makeCell("/login", 2800), makeCell("Public", 2800), makeCell("Sign in / sign up", 3760)] }),
          new TableRow({ children: [makeCell("/onboarding", 2800), makeCell("Authenticated", 2800), makeCell("Collect company name after signup", 3760)] }),
          new TableRow({ children: [makeCell("/dashboard", 2800), makeCell("Authenticated", 2800), makeCell("Project grid with thumbnails", 3760)] }),
          new TableRow({ children: [makeCell("/upload", 2800), makeCell("Authenticated", 2800), makeCell("Figma import / ZIP upload", 3760)] }),
          new TableRow({ children: [makeCell("/projects/$id/editor", 2800), makeCell("Authenticated", 2800), makeCell("GrapesJS visual editor for a project", 3760)] }),
          new TableRow({ children: [makeCell("/projects/$id/preview", 2800), makeCell("Authenticated", 2800), makeCell("Live preview of the project", 3760)] }),
          new TableRow({ children: [makeCell("/canvas-editor", 2800), makeCell("Public", 2800), makeCell("Standalone GrapesJS editor (demo)", 3760)] }),
          new TableRow({ children: [makeCell("/admin", 2800), makeCell("Admin only", 2800), makeCell("Admin dashboard", 3760)] }),
          new TableRow({ children: [makeCell("/preview/$projectId", 2800), makeCell("Public", 2800), makeCell("Public project preview", 3760)] }),
          new TableRow({ children: [makeCell("/preview/$projectId/$pageSlug", 2800), makeCell("Public", 2800), makeCell("Public page preview", 3760)] }),
        ]
      }),
      new Paragraph({ text: "" }),

      // KEY IMPLEMENTATION DETAILS
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("9. Key Implementation Details")] }),
      new Paragraph({ children: [new TextRun({ text: "Asset Caching:", bold: true }), new TextRun(" Figma image exports are downloaded and cached in Supabase Storage (project-thumbnails bucket). Thumbnails are checked via HEAD request before re-fetching. Figma signed URLs are never exposed to the browser.")] }),
      new Paragraph({ children: [new TextRun({ text: "Concurrent Builds:", bold: true }), new TextRun(" Batch pipeline runs with concurrency=2 to avoid overwhelming the Figma API while maintaining speed.")] }),
      new Paragraph({ children: [new TextRun({ text: "Token Refresh:", bold: true }), new TextRun(" Figma access tokens are automatically refreshed 30 seconds before expiry using the stored refresh_token.")] }),
      new Paragraph({ children: [new TextRun({ text: "Error Handling:", bold: true }), new TextRun(" Each pipeline step records errors to the page row. Users can retry from the last completed step rather than starting over.")] }),
      new Paragraph({ children: [new TextRun({ text: "RLS Security:", bold: true }), new TextRun(" All tables have Row Level Security. Projects and pages are scoped to auth.uid(). Admin checks use the has_role() security definer function to avoid recursive RLS.")] }),
      new Paragraph({ children: [new TextRun({ text: "SSR-Safe:", bold: true }), new TextRun(" The Supabase client uses a Proxy pattern that lazily initializes, avoiding SSR crashes. Auth state is hydrated from localStorage on the client.")] }),
      new Paragraph({ text: "" }),

      // DEPLOYMENT
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("10. Deployment")] }),
      new Paragraph({ children: [new TextRun("The app is deployed on Lovable with a custom domain (figmaship.com / www.figmaship.com). Preview URL: id-preview--eedc96cf-d60a-44d3-b43d-ed908d93dadb.lovable.app. Published URL: figma-to-amped.lovable.app. The backend runs on Lovable Cloud (managed Supabase).")] }),
      new Paragraph({ text: "" }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("11. Summary")] }),
      new Paragraph({ children: [new TextRun("Amped FigmaShip is a production-ready Figma-to-website platform built on TanStack Start + React + TypeScript, backed by Lovable Cloud (PostgreSQL + Auth + Storage), and powered by a custom deterministic Figma converter + GrapesJS visual editor. It enables designers to turn static Figma files into live, editable, publishable websites without writing code.")] }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/mnt/documents/Amped_FigmaShip_Build_Report.docx", buffer);
  console.log("Report generated successfully at /mnt/documents/Amped_FigmaShip_Build_Report.docx");
});
