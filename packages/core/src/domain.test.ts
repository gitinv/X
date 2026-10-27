import { describe, expect, it } from "vitest";
import { canAccessLocation, effectiveOffer, locationCharge, rankAlternateLocations } from "./locations";
import { canCaptureServicePhoto, canSoftDeletePhoto, canViewServicePhoto } from "./photos";
import { shouldCacheForOffline } from "./pwa";
import { canCustomerCancel, findBookingConflict } from "./booking";
import { InventoryError, planInventoryDecrement } from "./inventory";
import { dollarsToCents, formatClock, parseClock } from "./money";
import { billingMode, resolveSmsDriverName } from "./sms";
import { TenantIsolationError, assertSameTenant, requireTenantId, scopeWhere } from "./tenant";
import { listOpenSlots, zonedTimeToUtc } from "./time";
import { buildTurnBoard, type TurnVisit } from "./turns";

const at = (iso: string) => new Date(iso);

describe("booking conflicts", () => {
  const existing = [
    {
      id: "a",
      technicianId: "chloe",
      start: at("2026-06-02T15:00:00Z"),
      end: at("2026-06-02T15:45:00Z"),
      status: "BOOKED",
    },
    {
      id: "b",
      technicianId: "chloe",
      start: at("2026-06-02T18:00:00Z"),
      end: at("2026-06-02T19:00:00Z"),
      status: "CANCELLED",
    },
    {
      id: "c",
      technicianId: "marcus",
      start: at("2026-06-02T15:00:00Z"),
      end: at("2026-06-02T16:00:00Z"),
      status: "CHECKED_IN",
    },
  ];

  it("blocks an overlapping appointment for the same technician", () => {
    const conflict = findBookingConflict(existing, {
      technicianId: "chloe",
      start: at("2026-06-02T15:30:00Z"),
      end: at("2026-06-02T16:15:00Z"),
    });
    expect(conflict?.id).toBe("a");
  });

  it("allows a visit that starts when the previous one ends", () => {
    const conflict = findBookingConflict(existing, {
      technicianId: "chloe",
      start: at("2026-06-02T15:45:00Z"),
      end: at("2026-06-02T16:30:00Z"),
    });
    expect(conflict).toBeNull();
  });

  it("ignores cancelled visits and other technicians", () => {
    expect(
      findBookingConflict(existing, {
        technicianId: "chloe",
        start: at("2026-06-02T18:00:00Z"),
        end: at("2026-06-02T18:30:00Z"),
      }),
    ).toBeNull();
    expect(
      findBookingConflict(existing, {
        technicianId: "yuki",
        start: at("2026-06-02T15:00:00Z"),
        end: at("2026-06-02T16:00:00Z"),
      }),
    ).toBeNull();
  });

  it("lets a move keep its own time", () => {
    expect(
      findBookingConflict(existing, {
        technicianId: "chloe",
        ignoreId: "a",
        start: at("2026-06-02T15:00:00Z"),
        end: at("2026-06-02T15:45:00Z"),
      }),
    ).toBeNull();
  });

  it("enforces the customer cancellation window", () => {
    const start = at("2026-06-02T18:00:00Z");
    expect(canCustomerCancel(start, at("2026-06-02T15:00:00Z"), 2)).toBe(true);
    expect(canCustomerCancel(start, at("2026-06-02T16:30:00Z"), 2)).toBe(false);
    expect(canCustomerCancel(start, at("2026-06-02T16:00:00Z"), 2)).toBe(true);
  });
});

describe("turn queue", () => {
  const visits: TurnVisit[] = [
    {
      id: "later",
      status: "BOOKED",
      start: at("2026-06-02T17:00:00Z"),
      clientName: "Noah",
      technicianName: "Marcus",
      serviceName: "Dip",
      supplies: ["Dip powder"],
    },
    {
      id: "waiting",
      status: "CHECKED_IN",
      start: at("2026-06-02T16:00:00Z"),
      clientName: "Gemma",
      technicianName: "Sophia",
      serviceName: "Pedicure",
      supplies: ["Foot liner"],
    },
    {
      id: "chair",
      status: "IN_SERVICE",
      start: at("2026-06-02T15:00:00Z"),
      clientName: "Eleanor",
      technicianName: "Chloe",
      serviceName: "Gel manicure",
      supplies: ["LED lamp", "Gel polish"],
    },
    {
      id: "done",
      status: "COMPLETED",
      start: at("2026-06-02T13:00:00Z"),
      clientName: "Sasha",
      technicianName: "Yuki",
      serviceName: "Velvet",
      supplies: [],
    },
  ];

  it("puts the chair first, then the waiting client, and lists supplies for the current service", () => {
    const board = buildTurnBoard(visits);
    expect(board.current?.id).toBe("chair");
    expect(board.next?.clientName).toBe("Gemma");
    expect(board.queue.map((visit) => visit.id)).toEqual(["later"]);
    expect(board.supplies).toEqual(["LED lamp", "Gel polish"]);
  });

  it("promotes a checked-in client when nobody is in the chair", () => {
    const board = buildTurnBoard(visits.filter((visit) => visit.id !== "chair"));
    expect(board.current?.technicianName).toBe("Sophia");
    expect(board.next?.clientName).toBe("Noah");
  });
});

describe("inventory", () => {
  const stock = [
    { productId: "oil", name: "Cuticle oil", onHand: 5, lowStockAlert: 2 },
    { productId: "charms", name: "Caviar charms", onHand: 3, lowStockAlert: 10 },
  ];

  it("decrements stock and flags a low result", () => {
    expect(planInventoryDecrement(stock, [{ productId: "oil", quantity: 2 }])).toEqual([
      { productId: "oil", onHand: 3, low: false },
    ]);
    expect(planInventoryDecrement(stock, [{ productId: "charms", quantity: 1 }])[0]?.low).toBe(true);
  });

  it("combines duplicate lines and rejects a sale the shelf cannot cover", () => {
    expect(
      planInventoryDecrement(stock, [
        { productId: "oil", quantity: 2 },
        { productId: "oil", quantity: 2 },
      ]),
    ).toEqual([{ productId: "oil", onHand: 1, low: true }]);
    expect(() => planInventoryDecrement(stock, [{ productId: "oil", quantity: 9 }])).toThrow(InventoryError);
    expect(() => planInventoryDecrement(stock, [{ productId: "missing", quantity: 1 }])).toThrow(
      /not in this salon's inventory/,
    );
  });
});

describe("tenant isolation", () => {
  it("requires a salon on every scoped query", () => {
    expect(scopeWhere("salon-a", { status: "BOOKED" })).toEqual({ status: "BOOKED", tenantId: "salon-a" });
    expect(() => requireTenantId("")).toThrow(TenantIsolationError);
    expect(() => requireTenantId(null)).toThrow(TenantIsolationError);
  });

  it("rejects a record from another salon", () => {
    expect(() => assertSameTenant("salon-b", "salon-a")).toThrow(TenantIsolationError);
    expect(() => assertSameTenant("salon-a", "salon-a")).not.toThrow();
  });
});

describe("slots and money", () => {
  it("converts Chicago wall time to UTC", () => {
    expect(zonedTimeToUtc("2026-01-15", 9 * 60, "America/Chicago").toISOString()).toBe("2026-01-15T15:00:00.000Z");
    expect(zonedTimeToUtc("2026-07-15", 9 * 60, "America/Chicago").toISOString()).toBe("2026-07-15T14:00:00.000Z");
  });

  it("hides closed days, past times, and busy chairs", () => {
    expect(
      listOpenSlots({
        date: "2026-01-15",
        timeZone: "America/Chicago",
        openMin: 9 * 60,
        closeMin: 11 * 60,
        closed: true,
        durationMin: 60,
        busy: [],
      }),
    ).toEqual([]);

    const slots = listOpenSlots({
      date: "2026-01-15",
      timeZone: "America/Chicago",
      openMin: 9 * 60,
      closeMin: 11 * 60,
      closed: false,
      durationMin: 60,
      busy: [{ start: zonedTimeToUtc("2026-01-15", 9 * 60, "America/Chicago"), end: zonedTimeToUtc("2026-01-15", 10 * 60, "America/Chicago") }],
      now: zonedTimeToUtc("2026-01-15", 8 * 60, "America/Chicago"),
    });
    expect(slots.map((slot) => slot.label)).toEqual(["10:00 AM"]);
  });

  it("parses prices and clocks", () => {
    expect(dollarsToCents("19.99")).toBe(1999);
    expect(dollarsToCents("25")).toBe(2500);
    expect(dollarsToCents("1.234")).toBeNull();
    expect(parseClock("09:30")).toBe(570);
    expect(formatClock(570)).toBe("09:30");
  });
});

describe("locations", () => {
  const oak = { id: "oak", name: "Oak Street", latitude: 41.9, longitude: -87.62, active: true };
  const lincoln = { id: "lincoln", name: "Lincoln Park", latitude: 41.93, longitude: -87.65, active: true };
  const evanston = { id: "evanston", name: "Evanston", latitude: 42.05, longitude: -87.68, active: true };

  it("hides a service a location turned off and uses a price override", () => {
    expect(effectiveOffer({ priceCents: 4500, durationMin: 45 }, { available: false, priceCents: null, durationMin: null })).toBeNull();
    expect(effectiveOffer({ priceCents: 4500, durationMin: 45 }, { available: true, priceCents: 5000, durationMin: null })).toEqual({
      priceCents: 5000,
      durationMin: 45,
    });
  });

  it("offers the nearest sibling location when the chosen chair is full", () => {
    const alternatives = rankAlternateLocations({
      requestedLocationId: "oak",
      origin: { latitude: oak.latitude, longitude: oak.longitude },
      locations: [oak, lincoln, evanston],
      slotsByLocation: {
        oak: [],
        lincoln: [{ startIso: "2026-06-02T16:00:00Z", label: "11:00 AM", technicianId: "marcus", technicianName: "Marcus" }],
        evanston: [{ startIso: "2026-06-02T17:00:00Z", label: "12:00 PM", technicianId: "yuki", technicianName: "Yuki" }],
      },
    });
    expect(alternatives.map((location) => location.locationId)).toEqual(["lincoln", "evanston"]);
    expect(alternatives[0]?.slots[0]?.technicianName).toBe("Marcus");
    expect(alternatives[0]?.distanceKm ?? 0).toBeLessThan(alternatives[1]?.distanceKm ?? 0);
  });

  it("lets an owner see every location and keeps a manager inside their own", () => {
    const oakOnly = [{ locationId: "oak", role: "MANAGER" }];
    expect(canAccessLocation({ role: "MANAGER", memberships: oakOnly, locationId: "oak" })).toBe(true);
    expect(canAccessLocation({ role: "MANAGER", memberships: oakOnly, locationId: "lincoln" })).toBe(false);
    expect(canAccessLocation({ role: "MANAGER", memberships: oakOnly, locationId: "all" })).toBe(false);
    expect(canAccessLocation({ role: "OWNER", memberships: [], locationId: "lincoln" })).toBe(true);
    expect(canAccessLocation({ role: "OWNER", memberships: [], locationId: "all" })).toBe(true);
  });

  it("counts extra locations for the billing hook", () => {
    expect(locationCharge({ activeLocations: 2, includedLocations: 1, extraLocationPriceCents: 4900 })).toEqual({
      billableLocations: 2,
      extraLocations: 1,
      monthlyCents: 4900,
    });
  });
});

describe("service photos", () => {
  const photo = { tenantId: "salon-a", clientId: "ava", deletedAt: null };

  it("lets a customer see only their own photos in their own salon", () => {
    expect(canViewServicePhoto({ role: "CUSTOMER", tenantId: "salon-a", clientId: "ava" }, photo)).toBe(true);
    expect(canViewServicePhoto({ role: "CUSTOMER", tenantId: "salon-a", clientId: "gemma" }, photo)).toBe(false);
    expect(canViewServicePhoto({ role: "CUSTOMER", tenantId: "salon-b", clientId: "ava" }, photo)).toBe(false);
    expect(canViewServicePhoto({ role: "OWNER", tenantId: "salon-b", clientId: null }, photo)).toBe(false);
  });

  it("blocks capture without consent and lets only an owner soft-delete", () => {
    expect(
      canCaptureServicePhoto({
        role: "TECHNICIAN",
        actorTenantId: "salon-a",
        customerTenantId: "salon-a",
        consentAt: null,
        consentRequired: true,
      }).ok,
    ).toBe(false);
    expect(
      canCaptureServicePhoto({
        role: "FRONT_DESK",
        actorTenantId: "salon-a",
        customerTenantId: "salon-a",
        consentAt: new Date(),
        consentRequired: true,
      }).ok,
    ).toBe(true);
    expect(canSoftDeletePhoto("OWNER")).toBe(true);
    expect(canSoftDeletePhoto("FRONT_DESK")).toBe(false);
    expect(canSoftDeletePhoto("CUSTOMER")).toBe(false);
  });
});

describe("offline cache", () => {
  it("never caches API or photo responses", () => {
    expect(shouldCacheForOffline("/api/appointments", "GET")).toBe(false);
    expect(shouldCacheForOffline("/api/photos/content", "GET")).toBe(false);
    expect(shouldCacheForOffline("/api/push/subscribe", "POST")).toBe(false);
    expect(shouldCacheForOffline("/_next/static/chunk.js", "GET")).toBe(true);
  });
});

describe("provider selection", () => {
  it("stays on the console driver until real credentials exist", () => {
    expect(resolveSmsDriverName({})).toBe("console");
    expect(resolveSmsDriverName({ SMS_DRIVER: "twilio" })).toBe("console");
    expect(
      resolveSmsDriverName({
        SMS_DRIVER: "twilio",
        TWILIO_ACCOUNT_SID: "AC",
        TWILIO_AUTH_TOKEN: "token",
        TWILIO_FROM: "+15555550100",
      }),
    ).toBe("twilio");
    expect(
      resolveSmsDriverName({
        SMS_DRIVER: "sns",
        AWS_REGION: "us-east-1",
        AWS_ACCESS_KEY_ID: "AKIA",
        AWS_SECRET_ACCESS_KEY: "secret",
      }),
    ).toBe("sns");
  });

  it("stubs billing until Stripe price and secret are both set", () => {
    expect(billingMode({})).toBe("stub");
    expect(billingMode({ STRIPE_SECRET_KEY: "sk_test" })).toBe("stub");
    expect(billingMode({ STRIPE_SECRET_KEY: "sk_test", STRIPE_PRICE_ID: "price_123" })).toBe("stripe");
  });
});
