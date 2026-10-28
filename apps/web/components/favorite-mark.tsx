"use client";

import { useRef, useState } from "react";

export function FavoriteToggle({
  technicianId,
  name,
  active,
  onChange,
}: {
  technicianId: string;
  name: string;
  active: boolean;
  onChange?: (active: boolean) => void;
}) {
  const [on, setOn] = useState(active);
  const onRef = useRef(active);

  function apply(next: boolean) {
    onRef.current = next;
    setOn(next);
    onChange?.(next);
  }

  return (
    <FavoriteMark
      active={on}
      editable
      name={name}
      onToggle={() => {
        const previous = onRef.current;
        const next = !previous;
        apply(next);
        void fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ technicianId }),
        })
          .then(async (response) => {
            if (!response.ok) {
              if (onRef.current === next) apply(previous);
              return;
            }
            const body = (await response.json()) as { favorite?: boolean };
            apply(Boolean(body.favorite));
          })
          .catch(() => {
            if (onRef.current === next) apply(previous);
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
