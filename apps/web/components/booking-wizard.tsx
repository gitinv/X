"use client";

import { bookAppointment, loadAlternates, loadSlots } from "@/app/book/actions";
import { buttonClass } from "@/components/ui";
import { FavoriteToggle } from "@/components/favorite-mark";
import { favoriteCardClass } from "@redlady/core";
import { ServiceTiles, TicketTotal } from "@/components/service-tiles";
import { formatCents, formatTime, formatWallClock, reservedMinutes, serviceGroup, sortByFavorite, toggleBookedService, uniqueStartSlots, weekdayOfDate, type AlternateLocation } from "@redlady/core";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface ServiceChoice {
  id: string;
  category: string;
  kind: "SERVICE" | "ADDON";
  name: string;
  description: string;
  durationMin: number;
  bufferMin: number;
  priceCents: number;
}

interface TechChoice {
  id: string;
  name: string;
  roleTitle: string;
  specialties: string[];
  avatarUrl: string | null;
  locationIds: string[];
}

interface LocationChoice {
  id: string;
  slug: string;
  name: string;
  address: string;
  timezone: string;
  hours: { dayOfWeek: number; openMin: number; closeMin: number; closed: boolean }[];
}

interface LocationOffer {
  locationId: string;
  serviceId: string;
  available: boolean;
  priceCents: number | null;
  durationMin: number | null;
  bufferMin: number | null;
}

function LinkHint() {
  return <>Sign in to save favorite techs.</>;
}

function BookingPending() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
      Booking your appointment…
    </span>
  );
}

function offerAt(service: ServiceChoice, locationId: string | undefined, offers: LocationOffer[]): ServiceChoice | null {
  if (!locationId) return service;
  const override = offers.find((offer) => offer.locationId === locationId && offer.serviceId === service.id);
  if (override && !override.available) return null;
  return {
    ...service,
    priceCents: override?.priceCents ?? service.priceCents,
    durationMin: override?.durationMin ?? service.durationMin,
    bufferMin: override?.bufferMin ?? service.bufferMin,
  };
}

export function BookingWizard({
  services,
  technicians,
  locations,
  offers,
  initialDate,
  presetServiceIds,
  presetTechnicianId,
  presetLocationSlug,
  suggestNearest,
  guest,
  favoriteIds,
  signedIn,
}: {
  services: ServiceChoice[];
  technicians: TechChoice[];
  locations: LocationChoice[];
  offers: LocationOffer[];
  initialDate: string;
  presetServiceIds: string[];
  presetTechnicianId?: string;
  presetLocationSlug: string;
  suggestNearest: boolean;
  guest: { name: string; phone: string; email: string } | null;
  favoriteIds: string[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const [locationSlug, setLocationSlug] = useState(presetLocationSlug);
  const location = locations.find((item) => item.slug === locationSlug) ?? locations[0];
  const visibleTechs = technicians.filter((tech) => !location || tech.locationIds.includes(location.id));
  const visibleServices = services.flatMap((item) => {
    const priced = offerAt(item, location?.id, offers);
    return priced ? [priced] : [];
  });
  const [selectedIds, setSelectedIds] = useState<string[]>(presetServiceIds);
  const [technician, setTechnician] = useState<TechChoice | null>(visibleTechs.find((tech) => tech.id === presetTechnicianId) ?? null);
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<{ startIso: string; label: string; technicianId: string; technicianName: string }[]>([]);
  const [slotTechId, setSlotTechId] = useState("");
  const [alternates, setAlternates] = useState<AlternateLocation[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [startIso, setStartIso] = useState("");
  const [name, setName] = useState(guest?.name ?? "");
  const [phone, setPhone] = useState(guest?.phone ?? "");
  const [email, setEmail] = useState(guest?.email ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [pendingAlternate, setPendingAlternate] = useState<{ locationSlug: string; locationName: string; technicianId: string; technicianName: string; startIso: string; label: string } | null>(null);
  const [starred, setStarred] = useState<string[]>(favoriteIds);
  const orderSnapshot = useRef(favoriteIds);
  const bookingLock = useRef(false);
  const idempotencyKey = useRef(typeof crypto !== "undefined" ? crypto.randomUUID() : "");
  const orderedTechs = sortByFavorite(visibleTechs, orderSnapshot.current);

  const chosen = visibleServices.filter((item) => selectedIds.includes(item.id));
  const blockMinutes = chosen.reduce((sum, item) => sum + reservedMinutes(item), 0);

  useEffect(() => {
    if (!location) return;
    setSelectedIds((current) => current.filter((id) => services.some((service) => service.id === id && offerAt(service, location.id, offers))));
  }, [location, offers, services]);

  useEffect(() => {
    if (!suggestNearest || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      router.replace(`/book?near=${position.coords.latitude},${position.coords.longitude}`);
    });
  }, [router, suggestNearest]);

  useEffect(() => {
    if (selectedIds.length === 0 || !date || !location) return;
    let cancel = false;
    setLoadingSlots(true);
    setStartIso("");
    setAlternates([]);
    const ids = selectedIds.join(",");
    loadSlots(ids, technician?.id ?? "", date, location.slug)
      .then(async (next) => {
        if (cancel) return;
        setSlots(next);
        if (next.length === 0) setAlternates(await loadAlternates(ids, date, location.slug));
      })
      .finally(() => {
        if (!cancel) setLoadingSlots(false);
      });
    return () => {
      cancel = true;
    };
  }, [selectedIds, technician, date, location]);

  async function submit(choice?: { locationSlug: string; technicianId: string; startIso: string; technicianName: string }) {
    if (bookingLock.current || selectedIds.length === 0) return;
    const chosenLocation = choice?.locationSlug ?? location?.slug;
    const chosenTech = choice?.technicianId ?? technician?.id ?? slotTechId;
    const chosenStart = choice?.startIso ?? startIso;
    if (!chosenLocation || !chosenStart || selectedIds.length === 0) return;
    bookingLock.current = true;
    setPending(true);
    setError("");
    try {
      const result = await bookAppointment({
        serviceIds: selectedIds,
        technicianId: chosenTech,
        locationSlug: chosenLocation,
        startIso: chosenStart,
        name,
        phone,
        email,
        notes,
        idempotencyKey: idempotencyKey.current,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/book/confirmation/${result.reference}`);
    } finally {
      bookingLock.current = false;
      setPending(false);
    }
  }

  const hoursToday = location?.hours.find((row) => row.dayOfWeek === weekdayOfDate(date));
  const closing = !hoursToday || hoursToday.closed ? `${location?.name ?? "This studio"} is closed that day.` : `${location?.name ?? "This studio"} is open until ${formatWallClock(hoursToday.closeMin)}. A time is offered only when the whole visit ends by closing, and by the end of that technician's shift.`;
  const finishLabel = startIso && blockMinutes > 0 && location ? formatTime(new Date(new Date(startIso).getTime() + blockMinutes * 60_000), location.timezone) : "";

  return (
    <div className="grid gap-6 pb-28 lg:grid-cols-[1.1fr_0.9fr] md:pb-0">
      <section className="space-y-6">
        <div>
          <h1 className="font-serif text-5xl italic leading-none text-wine">Reserve a chair</h1>
          <p className="mt-3 text-sm text-bark">Pick a manicure, a pedicure, and any aura add-ons. One technician keeps the whole block, back to back. If that chair is full, nearby studios appear below.</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {locations.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setLocationSlug(item.slug);
                setTechnician(null);
              }}
              className={`rounded-3xl border p-4 text-left ${location?.id === item.id ? "border-ink bg-white shadow-card" : "border-line bg-white/70"}`}
            >
              <span className="block font-medium">{item.name}</span>
              <span className="mt-1 block text-sm text-bark">{item.address}</span>
            </button>
          ))}
        </div>
        <div className="space-y-5">
          {["Manicure", "Pedicure", "Aura", ...[...new Set(visibleServices.map((item) => serviceGroup(item)))].filter((group) => !["Manicure", "Pedicure", "Aura", "More"].includes(group)).sort(), "More"].map((group) => (
            <ServiceTiles
              key={group}
              title={group === "Aura" ? "Aura add-ons" : group === "More" ? "More services" : group}
              items={visibleServices
                .filter((item) => serviceGroup(item) === group)
                .map((item) => ({ id: item.id, name: item.name, priceCents: item.priceCents, durationMin: reservedMinutes(item) }))}
              selected={selectedIds}
              onToggle={(id) => setSelectedIds((current) => toggleBookedService(current, visibleServices, id))}
            />
          ))}
          <TicketTotal items={chosen.map((item) => ({ id: item.id, name: item.name, priceCents: item.priceCents, durationMin: reservedMinutes(item) }))} />
        </div>
      </section>
      <aside className="h-fit space-y-4 rounded-[2rem] bg-white p-5 shadow-card lg:sticky lg:top-24">
        <h2 className="font-serif text-3xl italic">Technician</h2>
        {signedIn ? (
          <p className="text-sm text-bark">
            <span className="font-medium text-ink">Favorites.</span> Star as many technicians as you like. The order updates the next time you open the book.
          </p>
        ) : (
          <p className="text-sm text-bark">
            <LinkHint />
          </p>
        )}
        <p className="text-sm text-bark">{blockMinutes > 0 ? `${blockMinutes} min together · ${formatCents(chosen.reduce((sum, item) => sum + item.priceCents, 0))}` : "Select services to see the block."}</p>
        <button type="button" onClick={() => setTechnician(null)} className={buttonClass(technician ? "ghost" : "solid")}>Any technician</button>
        <div className="grid grid-cols-2 gap-2">
          {orderedTechs.map((item) => {
            const favorite = starred.includes(item.id);
            return (
              <div key={item.id} className={`rounded-2xl p-3 text-left ${favoriteCardClass(favorite)} ${technician?.id === item.id ? "ring-2 ring-ink" : ""}`}>
                <span className="flex items-start justify-between gap-1">
                  <button type="button" onClick={() => setTechnician(item)} className="min-w-0 flex-1 text-left">
                    {item.avatarUrl ? <img src={item.avatarUrl} alt="" className="mb-2 h-16 w-16 rounded-full object-cover" /> : null}
                    <span className="block text-sm font-medium">{item.name}</span>
                    <span className="block text-xs text-bark">{item.roleTitle}</span>
                  </button>
                  {signedIn ? (
                    <FavoriteToggle
                      technicianId={item.id}
                      name={item.name}
                      active={favorite}
                      onChange={(next) => setStarred((current) => (next ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id)))}
                    />
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-bark">Date</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <p className="text-sm text-bark">{closing}</p>
        <div className="flex flex-wrap gap-2">
          {loadingSlots ? <p className="text-sm text-bark">Checking the book…</p> : null}
          {!loadingSlots && selectedIds.length > 0 && slots.length === 0 ? <p className="text-sm text-bark">No open times at {location?.name} that day.</p> : null}
          {(technician ? slots : uniqueStartSlots(slots)).map((slot) => {
            const selected = startIso === slot.startIso;
            return (
              <button key={slot.startIso} type="button" aria-pressed={selected} onClick={() => { setStartIso(slot.startIso); setSlotTechId(technician ? slot.technicianId : ""); }} className={buttonClass(selected ? "solid" : "ghost", selected ? "px-3 py-2 ring-2 ring-ink ring-offset-2" : "px-3 py-2")}>
                {slot.label}
              </button>
            );
          })}
        </div>
        {alternates.length > 0 ? (
          <div className="rounded-2xl bg-cream p-3">
            <p className="text-sm font-medium">Also available at other locations</p>
            <div className="mt-3 space-y-3">
              {alternates.map((alternate) => (
                <div key={alternate.locationId}>
                  <p className="text-xs uppercase tracking-[0.14em] text-bark">
                    {alternate.name}
                    {alternate.distanceKm != null ? ` · ${alternate.distanceKm.toFixed(1)} km` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {alternate.slots.map((slot) => (
                      <button
                        key={`${slot.technicianId}-${slot.startIso}`}
                        type="button"
                        className={buttonClass("ghost", "px-3 py-2")}
                        onClick={() => {
                          const nextLocation = locations.find((item) => item.id === alternate.locationId);
                          if (!nextLocation) return;
                          setPendingAlternate({
                            locationSlug: nextLocation.slug,
                            locationName: nextLocation.name,
                            technicianId: slot.technicianId,
                            technicianName: slot.technicianName,
                            startIso: slot.startIso,
                            label: slot.label,
                          });
                        }}
                      >
                        {slot.label} · {slot.technicianName}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {pendingAlternate ? (
          <div className="rounded-2xl border-2 border-gold bg-cream p-3 text-sm">
            <p>
              Book {chosen.map((item) => item.name).join(", ")} at {pendingAlternate.locationName} with {pendingAlternate.technicianName} at {pendingAlternate.label}?
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" className={buttonClass("solid")} disabled={pending} aria-busy={pending} onClick={() => void submit(pendingAlternate)}>
                {pending ? <BookingPending /> : "Confirm booking"}
              </button>
              <button type="button" className={buttonClass("ghost")} onClick={() => setPendingAlternate(null)}>Back</button>
            </div>
          </div>
        ) : null}
        <label className="block text-sm">
          <span className="mb-1 block text-bark">Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-bark">Phone</span>
          <input value={phone} onChange={(event) => setPhone(event.target.value)} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-bark">Email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-bark">Notes</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
        </label>
        {error ? <p className="text-sm text-wine">{error}</p> : null}
        <button type="button" className={buttonClass("solid", "w-full")} disabled={pending || selectedIds.length === 0 || !startIso} aria-busy={pending} onClick={() => void submit()}>
          {pending ? <BookingPending /> : "Book appointment"}
        </button>
      </aside>
      <div className="fixed inset-x-0 z-30 border-t border-line bg-white px-4 py-3 md:hidden" style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}>
        <p className="text-sm font-medium">{formatCents(chosen.reduce((sum, item) => sum + item.priceCents, 0))}</p>
        <p className="text-xs text-bark">
          {blockMinutes > 0 ? `${blockMinutes} min` : "Choose services"}
          {finishLabel ? ` · done at ${finishLabel}` : ""}
        </p>
      </div>
    </div>
  );
}
