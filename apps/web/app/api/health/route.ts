import { platform } from "@redlady/db";

export async function GET() {
  try {
    await platform.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
