"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function FavoriteToggle({ technicianId, name, active }: { technicianId: string; name: string; active: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(active);
  return (
    <FavoriteMark
      active={on}
      editable
      name={name}
      onToggle={() => {
        void fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ technicianId }),
        }).then(async (response) => {
          if (!response.ok) return;
          const body = (await response.json()) as { favorite?: boolean };
          setOn(Boolean(body.favorite));
          router.refresh();
        });
      }}
    />
  );
}

export function FavoriteMark({
  active,
  editable,
  name,
  onToggle,
}: {
  active: boolean;
  editable?: boolean;
  name: string;
  onToggle?: () => void;
}) {
  const className = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl leading-none ${active ? "text-gold" : "text-bark"}`;
  if (!editable) {
    if (!active) return null;
    return (
      <span className={className} title="Favorite technician">
        ★
      </span>
    );
  }
  return (
    <button type="button" className={className} aria-pressed={active} aria-label={active ? `Remove ${name} from favorites` : `Mark ${name} as a favorite`} onClick={onToggle}>
      {active ? "★" : "☆"}
    </button>
  );
}

export function favoriteCardClass(active: boolean) {
  return active ? "border-2 border-gold bg-white" : "border border-line bg-white";
}
