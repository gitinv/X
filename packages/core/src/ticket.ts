export interface TicketLine {
  priceCents: number;
  durationMin: number;
  bufferMin?: number;
}

export function reservedMinutes(line: { durationMin: number; bufferMin?: number | null }) {
  return line.durationMin + Math.max(0, line.bufferMin ?? 0);
}

export function ticketSummary(lines: TicketLine[]) {
  return {
    count: lines.length,
    totalCents: lines.reduce((sum, line) => sum + line.priceCents, 0),
    durationMin: lines.reduce((sum, line) => sum + reservedMinutes(line), 0),
  };
}

export function requireServiceMinutes(durationMin: number, bufferMin = 0) {
  if (!Number.isInteger(durationMin) || durationMin <= 0) {
    return { ok: false as const, reason: "Please enter a duration greater than 0 minutes." };
  }
  if (!Number.isInteger(bufferMin) || bufferMin < 0) {
    return { ok: false as const, reason: "Please enter a buffer of 0 minutes or more." };
  }
  return { ok: true as const, reservedMin: durationMin + bufferMin };
}

export function discountCents(subtotalCents: number, mode: "percent" | "amount", value: number) {
  const subtotal = Math.max(0, Math.round(subtotalCents));
  if (mode === "percent") {
    const percent = Math.min(100, Math.max(0, value));
    return Math.round((subtotal * percent) / 100);
  }
  return Math.min(subtotal, Math.max(0, Math.round(value)));
}

export function checkoutTotal(input: { subtotalCents: number; discountCents: number; tipCents: number }) {
  const subtotal = Math.max(0, Math.round(input.subtotalCents));
  const discount = Math.min(subtotal, Math.max(0, Math.round(input.discountCents)));
  const tip = Math.max(0, Math.round(input.tipCents));
  return { subtotalCents: subtotal, discountCents: discount, tipCents: tip, totalCents: subtotal - discount + tip };
}

export function refundDecision(input: { totalCents: number; refundedCents: number; amountCents: number }) {
  const remaining = input.totalCents - input.refundedCents;
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > remaining) {
    return { ok: false as const, reason: "Please choose a refund no larger than the amount still on the ticket." };
  }
  const refundedCents = input.refundedCents + input.amountCents;
  const status = refundedCents >= input.totalCents ? ("REFUNDED" as const) : ("PARTIAL" as const);
  return { ok: true as const, refundedCents, status };
}

export interface ShiftWindow {
  startMin: number;
  endMin: number;
}

export function slotWithinShifts(startMin: number, durationMin: number, shifts: ShiftWindow[]) {
  if (shifts.length === 0) return true;
  return shifts.some((shift) => startMin >= shift.startMin && startMin + durationMin <= shift.endMin);
}

export function blockFitsShift(startMin: number, durationMin: number, windows: ShiftWindow[], hasSchedule: boolean) {
  if (!hasSchedule) return true;
  if (durationMin <= 0 || windows.length === 0) return false;
  return windows.some((shift) => startMin >= shift.startMin && startMin + durationMin <= shift.endMin);
}

export function serviceGroup(service: { category: string; kind: string }) {
  const category = service.category.trim();
  const lower = category.toLowerCase();
  if (lower === "aura" || lower.startsWith("aura ")) return "Aura";
  if (service.kind === "ADDON") return category || "Add-ons";
  if (lower.includes("pedi")) return "Pedicure";
  if (lower.includes("mani")) return "Manicure";
  return "More";
}

export function uniqueStartSlots<T extends { startIso: string }>(slots: T[]): T[] {
  const seen = new Set<string>();
  return slots.filter((slot) => {
    if (seen.has(slot.startIso)) return false;
    seen.add(slot.startIso);
    return true;
  });
}

export interface SalesOrder {
  id: string;
  totalCents: number;
  tipCents: number;
  discountCents: number;
  technicianName: string | null;
  items: { name: string; kind: string; quantity: number; unitCents: number }[];
}

export interface SalesRefund {
  orderId: string;
  amountCents: number;
}

export function summarizeSales(orders: SalesOrder[], refunds: SalesRefund[]) {
  const refundedByOrder = new Map<string, number>();
  for (const refund of refunds) refundedByOrder.set(refund.orderId, (refundedByOrder.get(refund.orderId) ?? 0) + refund.amountCents);
  const refundedCents = refunds.reduce((sum, refund) => sum + refund.amountCents, 0);
  const grossCents = orders.reduce((sum, order) => sum + order.totalCents, 0);
  const tipCents = orders.reduce((sum, order) => sum + order.tipCents, 0);
  const discountCentsTotal = orders.reduce((sum, order) => sum + order.discountCents, 0);
  const mix = new Map<string, { name: string; quantity: number; cents: number }>();
  const techs = new Map<string, { name: string; tickets: number; salesCents: number; tipCents: number }>();
  for (const order of orders) {
    for (const item of order.items) {
      if (item.kind !== "SERVICE" && item.kind !== "ADDON") continue;
      const row = mix.get(item.name) ?? { name: item.name, quantity: 0, cents: 0 };
      row.quantity += item.quantity;
      row.cents += item.unitCents * item.quantity;
      mix.set(item.name, row);
    }
    const techName = order.technicianName ?? "Retail";
    const tech = techs.get(techName) ?? { name: techName, tickets: 0, salesCents: 0, tipCents: 0 };
    tech.tickets += 1;
    tech.salesCents += order.totalCents - (refundedByOrder.get(order.id) ?? 0);
    tech.tipCents += order.tipCents;
    techs.set(techName, tech);
  }
  return {
    tickets: orders.length,
    grossCents,
    discountCents: discountCentsTotal,
    tipCents,
    refundedCents,
    netCents: grossCents - refundedCents,
    serviceMix: [...mix.values()].sort((left, right) => right.cents - left.cents),
    technicians: [...techs.values()].sort((left, right) => right.salesCents - left.salesCents),
  };
}
