"use client";

import { buttonClass } from "@/components/ui";
import Link from "next/link";
import { useState } from "react";

export function SignupForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [challengeId, setChallengeId] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [draft, setDraft] = useState({ name: "", password: "" });

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError("");
    const name = String(formData.get("name") ?? "");
    const password = String(formData.get("password") ?? "");
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email: formData.get("email"), phone: formData.get("phone"), password }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string; needsVerification?: boolean; challengeId?: string; demoCode?: string } | null;
    setPending(false);
    if (!response.ok) {
      setError(body?.error || "Could not create the account.");
      return;
    }
    if (body?.needsVerification && body.challengeId) {
      setDraft({ name, password });
      setChallengeId(body.challengeId);
      setDemoCode(body.demoCode ?? "");
      return;
    }
    window.location.href = "/account";
  }

  async function onConfirm(formData: FormData) {
    setPending(true);
    setError("");
    const response = await fetch("/api/auth/signup/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, code: formData.get("code"), name: draft.name, password: draft.password }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setPending(false);
    if (!response.ok) {
      setError(body?.error || "That code did not match.");
      return;
    }
    window.location.href = "/account";
  }

  if (challengeId) {
    return (
      <form action={onConfirm} className="mt-6 space-y-3">
        <p className="text-sm text-bark">That email or phone is already a guest here. Enter the code we sent to link the login. In this demo the code is also written to the server log.</p>
        {demoCode ? <p className="text-sm">Demo code: {demoCode}</p> : null}
        <label className="block text-sm">Code<input name="code" inputMode="numeric" required /></label>
        {error ? <p className="text-sm text-wine">{error}</p> : null}
        <button className={buttonClass("solid")} disabled={pending}>{pending ? "Checking…" : "Link this profile"}</button>
      </form>
    );
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
