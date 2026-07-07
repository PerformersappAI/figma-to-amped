import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/figma-diagnostic")({
  server: {
    handlers: {
      GET: async () => {
        const clientId = process.env.FIGMA_CLIENT_ID;
        const clientSecret = process.env.FIGMA_CLIENT_SECRET;
        const res = await fetch("https://api.figma.com/v1/oauth/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId ?? "",
            client_secret: clientSecret ?? "",
            redirect_uri: "https://figmaship.com/auth/figma/callback",
            code: "test_diagnostic_code",
            grant_type: "authorization_code",
          }).toString(),
        });
        const body = await res.text();
        return Response.json({
          status: res.status,
          body,
          clientIdPresent: Boolean(clientId),
          clientIdLength: clientId?.length ?? 0,
          clientSecretPresent: Boolean(clientSecret),
          clientSecretLength: clientSecret?.length ?? 0,
        });
      },
    },
  },
});
