import { describe, expect, it } from "vitest";
import { GET } from "../app/api/pwa/manifest/route";
import { demoHints } from "./demo-accounts";
import { SESSION_COOKIE, sessionCookieOptions } from "./auth/token";
import { readManageToken, signManageToken } from "./manage-token";

describe("public routes", () => {
  it("GET /api/pwa/manifest points at the real manifest", async () => {
    const response = GET(new Request("https://staging.redladyspa.com/api/pwa/manifest"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://staging.redladyspa.com/manifest.webmanifest");
  });

  it("hides demo passwords unless DEMO_HINTS is on, and never lists the platform admin", () => {
    const previous = process.env.DEMO_HINTS;
    process.env.DEMO_HINTS = "false";
    expect(demoHints()).toEqual([]);
    process.env.DEMO_HINTS = "true";
    const hints = demoHints();
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.some((account) => account.email === "platform@redladyspa.com")).toBe(false);
    process.env.DEMO_HINTS = previous;
  });

  it("clears the session cookie with the same path and a zero lifetime", () => {
    const cleared = sessionCookieOptions(0);
    expect(cleared).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    expect(SESSION_COOKIE).toBe("redlady_session");
    expect(sessionCookieOptions(60).maxAge).toBe(60);
  });

  it("signs a manage link that opens only that visit", async () => {
    process.env.AUTH_SECRET = "dev-only-change-me-red-lady-spa-2026";
    const token = await signManageToken({ appointmentId: "visit-1", tenantId: "salon-1" });
    expect(await readManageToken(token)).toEqual({ appointmentId: "visit-1", tenantId: "salon-1" });
    expect(await readManageToken(`${token}x`)).toBeNull();
  });
});
