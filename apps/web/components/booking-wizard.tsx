"use client";

import { bookAppointment, loadAlternates, loadSlots } from "@/app/book/actions";
import { buttonClass } from "@/components/ui";
import { FavoriteToggle, favoriteCardClass } from "@/components/favorite-mark";
import { formatCents, sortByFavorite, type AlternateLocation } from "@redlady/core";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface ServiceChoice {
  id: string;
  category: string;
  name: string;
  description: string;
  durationMin: number;
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
}

interface LocationOffer {
  locationId: string;
  serviceId: string;
  available: boolean;
  priceCents: number | null;
  durationMin: number | null;
}

function offerAt(service: ServiceChoice, locationId: string | undefined, offers: LocationOffer[]): ServiceChoice | null {
  if (!locationId) return service;
  const override = offers.find((offer) => offer.locationId === locationId && offer.serviceId === service.id);
  if (override && !override.available) return null;
  return {
    ...service,
    priceCents: override?.priceCents ?? service.priceCents,
    durationMin: override?.durationMin ?? service.durationMin,
  };
}

export function BookingWizard({
  services,
  technicians,
  locations,
  offers,
  initialDate,
  presetServiceId,
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
  presetServiceId?: string;
  presetTechnicianId?: string;
  presetLocationSlug: string;
  suggestNearest: boolean;
  guest: { name: string; phone: string; email: string } | null;
  favoriteIds: string[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const preset = services.find((service) => service.id === presetServiceId) ?? null;
  const [locationSlug, setLocationSlug] = useState(presetLocationSlug);
  const location = locations.find((item) => item.slug === locationSlug) ?? locations[0];
  const visibleTechs = technicians.filter((tech) => !location || tech.locationIds.includes(location.id));
  const visibleServices = services.flatMap((item) => {
    const priced = offerAt(item, location?.id, offers);
    return priced ? [priced] : [];
  });
  const [service, setService] = useState<ServiceChoice | null>(preset);
  const [technician, setTechnician] = useState<TechChoice | null>(visibleTechs.find((tech) => tech.id === presetTechnicianId) ?? null);
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<{ startIso: string; label: string }[]>([]);
  const [alternates, setAlternates] = useState<AlternateLocation[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [startIso, setStartIso] = useState("");
  const [name, setName] = useState(guest?.name ?? "");
  const [phone, setPhone] = useState(guest?.phone ?? "");
  const [email, setEmail] = useState(guest?.email ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ when: string; service: string; technician: string; location: string } | null>(null);
  const [pendingAlternate, setPendingAlternate] = useState<{ locationSlug: string; locationName: string; technicianId: string; technicianName: string; startIso: string; label: string } | null>(null);
  const orderedTechs = sortByFavorite(visibleTechs, favoriteIds);

  useEffect(() => {
    if (!service || !location) return;
    if (!offerAt(service, location.id, offers)) setService(null);
  }, [service, location, offers]);

  useEffect(() => {
    if (!suggestNearest || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      router.replace(`/book?near=${position.coords.latitude},${position.coords.longitude}`);
    });
  }, [router, suggestNearest]);

  useEffect(() => {
    if (!service || !technician || !date || !location) return;
    let cancel = false;
    setLoadingSlots(true);
    setStartIso("");
    setAlternates([]);
    loadSlots(service.id, technician.id, date, location.slug)
      .then(async (next) => {
        if (cancel) return;
        setSlots(next);
        if (next.length === 0) setAlternates(await loadAlternates(service.id, date, location.slug));
      })
      .finally(() => {
        if (!cancel) setLoadingSlots(false);
      });
    return () => {
      cancel = true;
    };
  }, [service, technician, date, location]);

  async function submit(choice?: { locationSlug: string; technicianId: string; startIso: string; technicianName: string }) {
    if (!service) return;
    const chosenLocation = choice?.locationSlug ?? location?.slug;
    const chosenTech = choice?.technicianId ?? technician?.id;
    const chosenStart = choice?.startIso ?? startIso;
    const techName = choice?.technicianName ?? technician?.name ?? "";
    if (!chosenLocation || !chosenTech || !chosenStart) return;
    setPending(true);
    setError("");
    const result = await bookAppointment({
      serviceId: service.id,
      technicianId: chosenTech,
      locationSlug: chosenLocation,
      startIso: chosenStart,
      name,
      phone,
      email,
      notes,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone({ when: result.when, service: result.service, technician: techName || result.technician, location: result.location });
  }

  if (done) {
    return (
      <section className="rounded-[2rem] bg-white p-8 shadow-card">
        <p className="text-xs uppercase tracking-[0.18em] text-bark">Reserved</p>
        <h1 className="mt-2 font-serif text-5xl italic text-wine">You&apos;re on the book.</h1>
        <p className="mt-4 text-lg">
          {done.service} with {done.technician}
        </p>
        <p className="text-bark">
          {done.location} · {done.when}
        </p>
        <p className="mt-4 text-sm text-bark">
          A confirmation was handed to the SMS driver. <a className="underline" href="/login">Sign in</a> or <a className="underline" href="/signup">create an account</a> to see or cancel the visit.
        </p>
      </section>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="space-y-6">
        <div>
          <h1 className="font-serif text-5xl italic leading-none text-wine">Reserve a chair</h1>
          <p className="mt-3 text-sm text-bark">Pick a studio, a service, and an open time. If that chair is full, nearby studios appear below.</p>
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
        <div className="space-y-3">
          {visibleServices.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setService(item)}
              className={`w-full rounded-3xl border p-4 text-left ${service?.id === item.id ? "border-ink bg-white shadow-card" : "border-line bg-white/60"}`}
            >
              <span className="text-[10px] uppercase tracking-[0.16em] text-bark">{item.category}</span>
              <span className="mt-1 flex items-baseline justify-between gap-3">
                <span className="font-medium">{item.name}</span>
                <span>{formatCents(item.priceCents)}</span>
              </span>
              <span className="mt-1 block text-sm text-bark">
                {item.durationMin} min · {item.description}
              </span>
            </button>
          ))}
        </div>
      </section>
      <aside className="h-fit space-y-4 rounded-[2rem] bg-white p-5 shadow-card lg:sticky lg:top-24">
        <h2 className="font-serif text-3xl italic">Technician</h2>
        <div className="grid grid-cols-2 gap-2">
          {orderedTechs.map((item) => {
            const favorite = favoriteIds.includes(item.id);
            return (
              <div key={item.id} className={`rounded-2xl p-3 text-left ${favoriteCardClass(favorite)} ${technician?.id === item.id ? "ring-2 ring-ink" : ""}`}>
                <span className="flex items-start justify-between gap-1">
                  <button type="button" onClick={() => setTechnician(item)} className="min-w-0 flex-1 text-left">
                    {item.avatarUrl ? <img src={item.avatarUrl} alt="" className="mb-2 h-16 w-16 rounded-full object-cover" /> : null}
                    <span className="block text-sm font-medium">{item.name}</span>
                    <span className="block text-xs text-bark">{item.roleTitle}</span>
                  </button>
                  {signedIn ? <FavoriteToggle technicianId={item.id} name={item.name} active={favorite} /> : null}
                </span>
              </div>
            );
          })}
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-bark">Date</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          {loadingSlots ? <p className="text-sm text-bark">Checking the book…</p> : null}
          {!loadingSlots && service && technician && slots.length === 0 ? <p className="text-sm text-bark">No open times at {location?.name} that day.</p> : null}
          {slots.map((slot) => (
            <button key={slot.startIso} type="button" onClick={() => setStartIso(slot.startIso)} className={buttonClass(startIso === slot.startIso ? "solid" : "ghost", "px-3 py-2")}>
              {slot.label}
            </button>
          ))}
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
              Book {service?.name} at {pendingAlternate.locationName} with {pendingAlternate.technicianName} at {pendingAlternate.label}?
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" className={buttonClass("solid")} onClick={() => void submit(pendingAlternate)}>Confirm booking</button>
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
        <button type="button" className={buttonClass("solid", "w-full")} disabled={pending || !service || !technician || !startIso} onClick={() => void submit()}>
          {pending ? "Saving…" : "Book appointment"}
        </button>
      </aside>
    </div>
  );
}
