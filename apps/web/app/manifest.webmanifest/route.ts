import { getPublicTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  let name = "The Red Lady Spa";
  let theme = "#7A1F2B";
  try {
    const salon = await getPublicTenant();
    if (salon) {
      name = salon.name;
      theme = salon.brandColor || theme;
    }
  } catch {
    name = "The Red Lady Spa";
  }
  return Response.json(
    {
      name,
      short_name: name,
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#F7F3EE",
      theme_color: theme,
      icons: [
        { src: "/api/pwa/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/api/pwa/icon/512", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "private, max-age=60" } },
  );
}
