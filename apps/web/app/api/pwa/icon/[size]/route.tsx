import { getPublicTenant } from "@/lib/tenant";
import { ImageResponse } from "next/og";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ size: string }> }) {
  const { size } = await context.params;
  const px = size === "180" ? 180 : size === "192" ? 192 : size === "512" ? 512 : 0;
  if (!px) return new Response("Not found", { status: 404 });
  let color = "#7A1F2B";
  let letters = "RL";
  try {
    const salon = await getPublicTenant();
    if (salon) {
      color = salon.brandColor || color;
      letters = salon.name
        .split(" ")
        .filter((word) => word && word.toLowerCase() !== "the")
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase() ?? "")
        .join("");
    }
  } catch {
    color = "#7A1F2B";
  }
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: color,
          color: "#F7F3EE",
          fontSize: Math.round(px * 0.34),
          letterSpacing: -1,
        }}
      >
        {letters || "RL"}
      </div>
    ),
    { width: px, height: px },
  );
}
