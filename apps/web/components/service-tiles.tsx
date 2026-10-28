"use client";

import { formatCents, ticketSummary } from "@redlady/core";
import { useState } from "react";

export interface TileChoice {
  id: string;
  name: string;
  priceCents: number;
  durationMin: number;
  category?: string;
  kind?: "SERVICE" | "ADDON";
}

function moveRoving(event: React.KeyboardEvent<HTMLButtonElement>, index: number, count: number, marker: string) {
  if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return false;
  event.preventDefault();
  let next = index;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % count;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + count) % count;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = count - 1;
  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(`[data-roving="${marker}"]`)[next]?.focus();
  return next;
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
  const [cursor, setCursor] = useState(0);
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="text-xs tracking-[0.16em] text-bark">{title}</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={title}>
        {items.map((item, index) => {
          const on = selected.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              data-roving="tile"
              tabIndex={index === cursor ? 0 : -1}
              aria-pressed={on}
              onClick={() => onToggle(item.id)}
              onKeyDown={(event) => {
                const next = moveRoving(event, index, items.length, "tile");
                if (next !== false) setCursor(next);
              }}
              className={`flex min-h-11 flex-col items-center justify-center rounded-2xl px-2 py-2 text-center ${on ? "bg-gold text-ink shadow-card" : "border border-line bg-white text-ink"}`}
            >
              <span className={`text-xs ${on ? "" : "invisible"}`} aria-hidden="true">
                ✓
              </span>
              <span className="text-sm font-medium leading-tight">{item.name}</span>
              <span className="mt-1 text-xs">
                {formatCents(item.priceCents)} · {item.durationMin} min
              </span>
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
