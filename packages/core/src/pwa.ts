export function shouldCacheForOffline(pathname: string, method: string): boolean {
  if (method !== "GET") return false;
  if (pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/photos") || pathname.includes("/photos/")) return false;
  return pathname.startsWith("/_next/static/") || pathname === "/offline" || pathname === "/sw.js" || pathname.startsWith("/icons/");
}
