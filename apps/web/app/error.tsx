"use client";

import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const waking = error.digest === "DATABASE_WAKING" || /waking up/i.test(error.message);
  useEffect(() => {
    if (!waking) return;
    const timer = window.setTimeout(() => reset(), 4000);
    return () => window.clearTimeout(timer);
  }, [reset, waking]);
  if (waking) {
    return (
      <main className="mx-auto grid min-h-screen max-w-lg place-items-center px-6 text-center">
        <div>
          <p className="text-xs tracking-[0.16em] text-bark">The Red Lady Spa</p>
          <h1 className="mt-3 font-serif text-5xl italic text-wine">Waking up, one moment</h1>
          <p className="mt-4 text-sm text-bark">The studio is opening its books. This page will try again on its own.</p>
        </div>
      </main>
    );
  }
  return (
    <main className="mx-auto grid min-h-screen max-w-lg place-items-center px-6 text-center">
      <div>
        <h1 className="font-serif text-5xl italic text-wine">Something went wrong.</h1>
        <button type="button" className="mt-4 underline" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </main>
  );
}
