"use client";

import { saveTicket } from "@/app/pos/actions";
import { FavoriteMark } from "@/components/favorite-mark";
import { favoriteCardClass } from "@redlady/core";
import { ServiceTiles, TicketTotal, type TileChoice } from "@/components/service-tiles";
import { buttonClass } from "@/components/ui";
import { sortByFavorite } from "@redlady/core";
import { useMemo, useState } from "react";

export function TicketForm({
  locationId,
  appointmentId,
  services,
  addons,
  technicians,
  favoriteIds,
  initialServiceIds,
  initialTechnicianId,
  initialStart,
  client,
}: {
  locationId: string;
  appointmentId?: string;
  services: TileChoice[];
  addons: TileChoice[];
  technicians: { id: string; name: string }[];
  favoriteIds: string[];
  initialServiceIds: string[];
  initialTechnicianId?: string;
  initialStart?: string;
  client: { id: string; name: string } | null;
}) {
  const [selected, setSelected] = useState(initialServiceIds);
  const [technicianId, setTechnicianId] = useState(initialTechnicianId ?? technicians[0]?.id ?? "");
  const ordered = useMemo(() => sortByFavorite(technicians, favoriteIds), [technicians, favoriteIds]);
  const chosen = [...services, ...addons].filter((item) => selected.includes(item.id));
  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }
  return (
    <form action={saveTicket} className="space-y-5">
      <input type="hidden" name="locationId" value={locationId} />
      {appointmentId ? <input type="hidden" name="appointmentId" value={appointmentId} /> : null}
      {client ? <input type="hidden" name="clientId" value={client.id} /> : null}
      <input type="hidden" name="technicianId" value={technicianId} />
      {selected.map((id) => (
        <input key={id} type="hidden" name="serviceId" value={id} />
      ))}
      {client ? <p className="text-sm">Client · {client.name}</p> : (
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-sm">Walk-in name<input name="name" required /></label>
          <label className="text-sm">Phone<input name="phone" /></label>
          <label className="text-sm">Email<input name="email" type="email" /></label>
        </div>
      )}
      <label className="block text-sm">
        <span className="mb-1 block text-bark">Starts</span>
        <input type="datetime-local" name="start" defaultValue={initialStart} />
      </label>
      <ServiceTiles title="Services" items={services} selected={selected} onToggle={toggle} />
      <ServiceTiles title="Add-ons" items={addons} selected={selected} onToggle={toggle} />
      <TicketTotal items={chosen} />
      <div>
        <h2 className="text-xs uppercase tracking-[0.16em] text-bark">Technician</h2>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ordered.map((tech) => {
            const favorite = favoriteIds.includes(tech.id);
            const on = technicianId === tech.id;
            return (
              <button key={tech.id} type="button" onClick={() => setTechnicianId(tech.id)} className={`flex min-h-16 items-center gap-1 rounded-2xl px-2 py-3 text-left text-sm ${favoriteCardClass(favorite)} ${on ? "ring-2 ring-ink" : ""}`}>
                <FavoriteMark active={favorite} name={tech.name} />
                <span className="font-medium">{tech.name}</span>
              </button>
            );
          })}
        </div>
      </div>
      <button className={buttonClass("solid")}>{appointmentId ? "Update ticket" : "Open ticket"}</button>
    </form>
  );
}
