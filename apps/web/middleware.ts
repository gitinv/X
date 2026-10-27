import { areaForPath, homeForRole, roleCan } from "@redlady/core";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "./lib/auth/token";

function tenantFromHost(host: string) {
  const hostname = (host.split(":")[0] ?? "").toLowerCase();
  const fallback = process.env.DEFAULT_TENANT_SLUG || "red-lady-spa";
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local")) {
    return { slug: fallback, location: "" };
  }
  if (hostname.endsWith(".localhost")) {
    const labels = hostname.slice(0, -".localhost".length).split(".").filter(Boolean);
    if (labels.length >= 2) return { slug: labels.slice(1).join("."), location: labels[0] ?? "" };
    return { slug: labels[0] || fallback, location: "" };
  }
  const labels = hostname.split(".");
  const first = labels[0] ?? "";
  if (labels.length < 3 || first === "www" || first === "app" || first === "staging") return { slug: fallback, location: "" };
  return { slug: first, location: "" };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  const resolved = tenantFromHost(request.headers.get("host") || "");
  requestHeaders.set("x-tenant-slug", resolved.slug);
  if (resolved.location) requestHeaders.set("x-location-slug", resolved.location);

  if (
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/billing/webhook") ||
    pathname.startsWith("/api/jobs/reminders") ||
    pathname.startsWith("/api/auth/login")
  ) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const area = areaForPath(pathname);
  if (!area) return NextResponse.next({ request: { headers: requestHeaders } });

  const header = request.headers.get("authorization") || "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const token = request.cookies.get(SESSION_COOKIE)?.value || bearer;
  const session = token ? await readSessionToken(token) : null;
  if (!session) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (area !== "account" && !roleCan(session.role, area)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "That area is for another role." }, { status: 403 });
    const url = request.nextUrl.clone();
    url.pathname = homeForRole(session.role);
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|offline).*)"],
};
