import { describe, expect, it } from "vitest";
import { DatabaseWakingError, DATABASE_CONNECT_TIMEOUT_SECONDS, DATABASE_POOL_TIMEOUT_SECONDS, isDatabaseWaking, withDatabaseRetry, withPoolLimit } from "./clients";

describe("database cold start", () => {
  it("waits at least 30 seconds for a paused database to resume", () => {
    const url = new URL(withPoolLimit("postgresql://redlady:redlady@example.test:5432/redladyspa?schema=public&sslmode=require"));
    expect(Number(url.searchParams.get("connect_timeout"))).toBeGreaterThanOrEqual(DATABASE_CONNECT_TIMEOUT_SECONDS);
    expect(Number(url.searchParams.get("pool_timeout"))).toBe(DATABASE_POOL_TIMEOUT_SECONDS);
    expect(DATABASE_CONNECT_TIMEOUT_SECONDS).toBeGreaterThanOrEqual(30);
    expect(DATABASE_POOL_TIMEOUT_SECONDS).toBeGreaterThanOrEqual(30);
  });

  it("retries a failed first connection and then returns the page data", async () => {
    let calls = 0;
    const waits: number[] = [];
    const result = await withDatabaseRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error("Can't reach database server"), { code: "P1001" });
        return { ok: true };
      },
      { attempts: 3, baseDelayMs: 25, sleep: async (ms) => { waits.push(ms); } },
    );
    expect(result).toEqual({ ok: true });
    expect(calls).toBe(2);
    expect(waits).toEqual([25]);
  });

  it("does not retry an ordinary error", async () => {
    let calls = 0;
    await expect(
      withDatabaseRetry(
        async () => {
          calls += 1;
          throw new Error("Please choose a service.");
        },
        { sleep: async () => undefined },
      ),
    ).rejects.toThrow(/service/);
    expect(calls).toBe(1);
    expect(isDatabaseWaking(new Error("Please choose a service."))).toBe(false);
  });

  it("turns a still-paused database into the waking error instead of a raw timeout", async () => {
    await expect(
      withDatabaseRetry(
        async () => {
          throw Object.assign(new Error("the database system is starting up"), { code: "P1002" });
        },
        { attempts: 2, baseDelayMs: 1, sleep: async () => undefined },
      ),
    ).rejects.toBeInstanceOf(DatabaseWakingError);
  });
});
