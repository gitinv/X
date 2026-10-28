"use client";

import { formatCents, ticketSummary } from "@redlady/core";

export interface TileChoice {
  id: string;
  name: string;
  priceCents: number;
  durationMin: number;
}

export function ServiceTiles({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: TileChoice[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="text-xs uppercase tracking-[0.16em] text-bark">{title}</h2>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((item) => {
          const on = selected.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(item.id)}
              className={`relative flex h-[100px] flex-col items-center justify-center rounded-2xl px-2 text-center ${on ? "bg-gold text-ink shadow-card" : "border border-line bg-white text-ink"}`}
            >
              {on ? <span className="absolute right-2 top-2 text-sm">✓</span> : null}
              <span className="text-sm font-medium leading-tight">{item.name}</span>
              <span className="mt-1 text-xs">{formatCents(item.priceCents)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function TicketTotal({ items }: { items: TileChoice[] }) {
  const summary = ticketSummary(items);
  return (
    <p className="text-sm">
      <span className="font-medium">{formatCents(summary.totalCents)}</span>
      <span className="text-bark"> · {summary.durationMin} min · {summary.count} selected</span>
    </p>
  );
}
