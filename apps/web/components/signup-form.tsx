"use client";

import { buttonClass } from "@/components/ui";
import Link from "next/link";
import { useState } from "react";

export function SignupForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError("");
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        password: formData.get("password"),
      }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setPending(false);
    if (!response.ok) {
      setError(body?.error || "Could not create the account.");
      return;
    }
    window.location.href = "/account";
  }

  return (
    <form action={onSubmit} className="mt-6 space-y-3">
      <label className="block text-sm">Name<input name="name" required /></label>
      <label className="block text-sm">Email<input name="email" type="email" /></label>
      <label className="block text-sm">Phone<input name="phone" /></label>
      <label className="block text-sm">Password<input name="password" type="password" minLength={8} required /></label>
      {error ? <p className="text-sm text-wine">{error}</p> : null}
      <button className={buttonClass("solid")} disabled={pending}>{pending ? "Creating…" : "Create account"}</button>
      <p className="text-sm"><Link href="/login" className="underline">Already have a login? Sign in</Link></p>
    </form>
  );
}
