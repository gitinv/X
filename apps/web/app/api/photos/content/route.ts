import { readLocalPhoto, verifyPhotoToken } from "@/lib/photos/storage";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const payload = verifyPhotoToken(token);
  if (!payload || payload.op !== "get") return new Response("That photo link has expired.", { status: 403 });
  try {
    const bytes = await readLocalPhoto(payload.key);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=60" } });
  } catch {
    return new Response("Photo not found.", { status: 404 });
  }
}
