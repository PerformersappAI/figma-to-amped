import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl text-foreground">404</h1>
        <p className="mt-4 text-muted-foreground">This page doesn't exist.</p>
        <Link to="/" className="btn-primary mt-6 inline-flex">Go home</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl text-foreground">Something broke</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="btn-primary mt-6"
        >Try again</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Amped — FigmaShip · Site design to live website, instantly" },
      { name: "description", content: "Drop your site design export. Edit visually. Publish in minutes." },
      { name: "theme-color", content: "#0a0a0a" },
      { property: "og:title", content: "Amped — FigmaShip · Site design to live website, instantly" },
      { name: "twitter:title", content: "Amped — FigmaShip · Site design to live website, instantly" },
      { property: "og:description", content: "Drop your Figma export. Edit visually. Publish in minutes." },
      { name: "twitter:description", content: "Drop your Figma export. Edit visually. Publish in minutes." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/475fc786-fdc1-49a8-8998-d0446e4e9dd9/id-preview-961e0e0c--eedc96cf-d60a-44d3-b43d-ed908d93dadb.lovable.app-1778131172889.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/475fc786-fdc1-49a8-8998-d0446e4e9dd9/id-preview-961e0e0c--eedc96cf-d60a-44d3-b43d-ed908d93dadb.lovable.app-1778131172889.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#111",
              color: "#fff",
              border: "1px solid #1e1e1e",
              borderLeft: "3px solid #c8f000",
              borderRadius: "4px",
              fontFamily: "Barlow, sans-serif",
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
