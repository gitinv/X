"use client";

import { useState } from "react";

export function SignOutButton({ className = "", label = "Sign out" }: { className?: string; label?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => {
        setPending(true);
        void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).finally(() => {
          window.localStorage.removeItem("redlady_token");
          window.location.assign("/login");
        });
      }}
    >
      {pending ? "Signing out…" : label}
    </button>
  );
}
