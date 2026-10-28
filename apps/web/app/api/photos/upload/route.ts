import { verifyPhotoToken, writeLocalPhoto } from "@/lib/photos/storage";

export async function PUT(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const payload = verifyPhotoToken(token);
  if (!payload || payload.op !== "put") return new Response("That upload link has expired.", { status: 403 });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 12_000_000) return new Response("That photo is empty or too large.", { status: 400 });
  try {
    await writeLocalPhoto(payload.key, bytes, payload.sha256);
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("Please ") ? error.message : "The photo could not be stored.";
    return new Response(message, { status: 400 });
  }
  return new Response(null, { status: 204 });
}
