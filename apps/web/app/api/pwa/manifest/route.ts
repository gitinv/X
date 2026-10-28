export function GET(request: Request) {
  return Response.redirect(new URL("/manifest.webmanifest", request.url), 307);
}
