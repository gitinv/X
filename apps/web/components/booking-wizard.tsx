"use client";

import { bookAppointment, loadAlternates, loadSlots } from "@/app/book/actions";
import { buttonClass } from "@/components/ui";
import { FavoriteToggle } from "@/components/favorite-mark";
import { SignOutButton } from "@/components/sign-out-button";
import { favoriteCardClass } from "@redlady/core";
import { ServiceTiles, TicketTotal } from "@/components/service-tiles";
import { bookingFieldErrors, closedDaySentence, formatCents, formatTime, formatWallClock, formatWhen, reservedMinutes, serviceGroup, sortByFavorite, studioHoursSummary, toggleBookedService, uniqueStartSlots, weekdayOfDate, type AlternateLocation, type BookingFieldErrors } from "@redlady/core";
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

function SlotChoices({
  slots,
  startIso,
  onPick,
}: {
  slots: { startIso: string; label: string; technicianId: string }[];
  startIso: string;
  onPick: (slot: { startIso: string; technicianId: string }) => void;
}) {
  const [cursor, setCursor] = useState(0);
  if (slots.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Open times">
      {slots.map((slot, index) => {
        const selected = startIso === slot.startIso;
        return (
          <button
            key={slot.startIso}
            type="button"
            data-roving="slot"
            tabIndex={index === cursor ? 0 : -1}
            aria-pressed={selected}
            onClick={() => onPick(slot)}
            onKeyDown={(event) => {
              if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? slots.length - 1 : event.key === "ArrowRight" ? (index + 1) % slots.length : (index - 1 + slots.length) % slots.length;
              setCursor(next);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[data-roving='slot']")[next]?.focus();
            }}
            className={buttonClass(selected ? "solid" : "ghost", "min-h-11 px-3")}
          >
            {slot.label}
          </button>
        );
      })}
    </div>
  );
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
  account,
  favoriteIds,
  signedIn,
  today,
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
  account: { name: string; phone: string; email: string } | null;
  favoriteIds: string[];
  signedIn: boolean;
  today: string;
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
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<BookingFieldErrors>({});
  const [pending, setPending] = useState(false);
  const [slotRefresh, setSlotRefresh] = useState(0);
  const alertRef = useRef<HTMLDivElement>(null);
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
    if (selectedIds.length === 0 || !date || !location || date < today) {
      setSlots([]);
      setAlternates([]);
      setLoadingSlots(false);
      return;
    }
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
  }, [selectedIds, technician, date, location, today, slotRefresh]);

  async function submit(choice?: { locationSlug: string; technicianId: string; startIso: string; technicianName: string }) {
    if (bookingLock.current || selectedIds.length === 0) return;
    const chosenLocation = choice?.locationSlug ?? location?.slug;
    const chosenTech = choice?.technicianId ?? technician?.id ?? slotTechId;
    const chosenStart = choice?.startIso ?? startIso;
    if (!chosenLocation || !chosenStart || selectedIds.length === 0) return;
    const visitDate = new Intl.DateTimeFormat("en-CA", { timeZone: location?.timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(chosenStart));
    if (!signedIn) {
      const fields = bookingFieldErrors({ name, phone, email, date: visitDate, today });
      setFieldErrors(fields);
      if (fields.name || fields.phone || fields.email || fields.date) {
        setError("");
        return;
      }
    }
    bookingLock.current = true;
    setPending(true);
    setError("");
    try {
      const result = await bookAppointment({
        serviceIds: selectedIds,
        technicianId: chosenTech,
        locationSlug: chosenLocation,
        startIso: chosenStart,
        name: signedIn ? account?.name ?? "" : name,
        phone: signedIn ? account?.phone ?? "" : phone,
        email: signedIn ? account?.email ?? "" : email,
        notes,
        idempotencyKey: idempotencyKey.current,
      });
      if (!result.ok) {
        setFieldErrors(result.fields ?? {});
        setError(result.fields && (result.fields.name || result.fields.phone || result.fields.email || result.fields.date) ? "" : result.error);
        if (result.error === "That time is no longer available.") {
          setStartIso("");
          setSlotRefresh((value) => value + 1);
        }
        return;
      }
      router.push(`/book/confirmation/${result.reference}`);
    } finally {
      bookingLock.current = false;
      setPending(false);
    }
  }

  useEffect(() => {
    if (error || pendingAlternate) alertRef.current?.scrollIntoView({ block: "center" });
  }, [error, pendingAlternate]);

  const hoursToday = location?.hours.find((row) => row.dayOfWeek === weekdayOfDate(date));
  const closing = !hoursToday
    ? ""
    : hoursToday.closed
      ? closedDaySentence(location?.name ?? "This studio", hoursToday.dayOfWeek)
      : `${location?.name ?? "This studio"} is open until ${formatWallClock(hoursToday.closeMin)}. A time is offered only when the whole visit ends by closing, and by the end of that technician's shift.`;
  const finishLabel = startIso && blockMinutes > 0 && location ? formatTime(new Date(new Date(startIso).getTime() + blockMinutes * 60_000), location.timezone) : "";

  return (
    <div className="grid gap-6 pb-28 lg:grid-cols-[1.1fr_0.9fr] md:pb-0">
      <section className="space-y-6">
        <div>
          <h1 className="font-serif text-5xl italic leading-none text-wine">Reserve a chair</h1>
          <p className="mt-3 text-sm text-bark">Pick a manicure, a pedicure, and aura nail art. Your technician will do these services back to back. If that chair is full, nearby studios appear below.</p>
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
              className={`min-h-11 rounded-3xl border p-4 text-left ${ (pendingAlternate ? locations.find((studio) => studio.slug === pendingAlternate.locationSlug)?.id : location?.id) === item.id ? "border-ink bg-white shadow-card" : "border-line bg-white/70"}`}
            >
              <span className="block font-medium">{item.name}</span>
              <span className="mt-1 block text-sm text-bark">{item.address}</span>
              <span className="mt-2 block text-xs text-bark">{studioHoursSummary(item.hours)}</span>
            </button>
          ))}
        </div>
        <div className="space-y-5">
          {["Manicure", "Pedicure", "Aura", ...[...new Set(visibleServices.map((item) => serviceGroup(item)))].filter((group) => !["Manicure", "Pedicure", "Aura", "More"].includes(group)).sort(), "More"].map((group) => (
            <ServiceTiles
              key={group}
              title={group === "Aura" ? "Aura nail art" : group === "More" ? "Other services" : group}
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
              <div key={item.id} className={`rounded-2xl p-3 text-left ${favoriteCardClass(favorite)} ${technician?.id === item.id ? "bg-cream" : ""}`}>
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
          <input type="date" min={today} value={date} aria-invalid={fieldErrors.date ? true : undefined} aria-describedby={fieldErrors.date ? "date-error" : undefined} onChange={(event) => { setDate(event.target.value); setFieldErrors((current) => ({ ...current, date: undefined })); }} />
          {fieldErrors.date ? <span id="date-error" className="mt-1 block text-sm text-wine">{fieldErrors.date}</span> : null}
        </label>
        <p className="text-sm text-bark">{closing}</p>
        <div className="flex flex-wrap gap-2">
          {selectedIds.length === 0 ? <p className="text-sm text-bark">Choose a service to see times.</p> : null}
          {loadingSlots ? <p className="text-sm text-bark">Looking up open times…</p> : null}
          {!loadingSlots && selectedIds.length > 0 && date < today ? <p className="text-sm text-wine">Pick today or a later date</p> : null}
          {!loadingSlots && selectedIds.length > 0 && date >= today && hoursToday?.closed ? <p className="text-sm text-bark">{closedDaySentence(location?.name ?? "This studio", hoursToday.dayOfWeek)}</p> : null}
          {!loadingSlots && selectedIds.length > 0 && date >= today && hoursToday && !hoursToday.closed && slots.length === 0 ? <p className="text-sm text-bark">No open times at {location?.name} that day.</p> : null}
          {selectedIds.length > 0 ? <SlotChoices slots={technician ? slots : uniqueStartSlots(slots)} startIso={startIso} onPick={(slot) => { setStartIso(slot.startIso); setSlotTechId(technician ? slot.technicianId : ""); }} /> : null}
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
          <div ref={alertRef} className="rounded-2xl border-2 border-gold-deep bg-cream p-3 text-sm">
            {(() => {
              const studio = locations.find((item) => item.slug === pendingAlternate.locationSlug);
              const priced = services.flatMap((service) => {
                if (!selectedIds.includes(service.id)) return [];
                const offer = offerAt(service, studio?.id, offers);
                return offer ? [offer] : [];
              });
              const price = priced.reduce((sum, item) => sum + item.priceCents, 0);
              const minutes = priced.reduce((sum, item) => sum + reservedMinutes(item), 0);
              const when = studio ? formatWhen(new Date(pendingAlternate.startIso), studio.timezone) : pendingAlternate.label;
              return (
                <p>
                  Book {priced.map((item) => item.name).join(", ")} at {pendingAlternate.locationName} on {when} with {pendingAlternate.technicianName}. {formatCents(price)} · {minutes} min · {pendingAlternate.label}.
                </p>
              );
            })()}
            <div className="mt-2 flex gap-2">
              <button type="button" className={buttonClass("solid")} disabled={pending} aria-busy={pending} onClick={() => void submit(pendingAlternate)}>
                {pending ? <BookingPending /> : "Confirm booking"}
              </button>
              <button type="button" className={buttonClass("ghost")} onClick={() => setPendingAlternate(null)}>Back</button>
            </div>
          </div>
        ) : null}
        {signedIn && account ? (
          <p className="text-sm">
            Booking as {account.name}. <SignOutButton className="underline" label="Not you? Sign out" />
          </p>
        ) : (
          <>
            <label className="block text-sm">
              <span className="mb-1 block text-bark">Name</span>
              <input value={name} aria-invalid={fieldErrors.name ? true : undefined} aria-describedby={fieldErrors.name ? "name-error" : undefined} onChange={(event) => { setName(event.target.value); setFieldErrors((current) => ({ ...current, name: undefined })); }} required />
              {fieldErrors.name ? <span id="name-error" className="mt-1 block text-sm text-wine">{fieldErrors.name}</span> : null}
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-bark">Phone</span>
              <input type="tel" inputMode="numeric" autoComplete="tel" value={phone} aria-invalid={fieldErrors.phone ? true : undefined} aria-describedby={fieldErrors.phone ? "phone-error" : undefined} onChange={(event) => { setPhone(event.target.value); setFieldErrors((current) => ({ ...current, phone: undefined })); }} required />
              {fieldErrors.phone ? <span id="phone-error" className="mt-1 block text-sm text-wine">{fieldErrors.phone}</span> : null}
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-bark">Email</span>
              <input type="email" autoComplete="email" value={email} aria-invalid={fieldErrors.email ? true : undefined} aria-describedby={fieldErrors.email ? "email-error" : undefined} onChange={(event) => { setEmail(event.target.value); setFieldErrors((current) => ({ ...current, email: undefined })); }} required />
              {fieldErrors.email ? <span id="email-error" className="mt-1 block text-sm text-wine">{fieldErrors.email}</span> : null}
            </label>
          </>
        )}
        <label className="block text-sm">
          <span className="mb-1 block text-bark">Notes</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
        </label>
        {error ? <p ref={pendingAlternate ? undefined : alertRef} className="text-sm text-wine" role="alert">{error}</p> : null}
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
