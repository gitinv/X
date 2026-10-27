"use client";

import { login } from "@/app/login/actions";
import { buttonClass } from "@/components/ui";
import { useActionState, useState } from "react";

export function LoginForm({
  next,
  hints,
}: {
  next?: string;
  hints: { label: string; email: string; password: string }[];
}) {
  const [state, action, pending] = useActionState(login, null);
  const [email, setEmail] = useState(hints[0]?.email ?? "");
  const [password, setPassword] = useState(hints[0]?.password ?? "");

  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label className="block text-sm">
        <span className="mb-1 block text-bark">Email</span>
        <input name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-bark">Password</span>
        <input name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </label>
      {state?.error ? <p className="text-sm text-wine">{state.error}</p> : null}
      <button className={buttonClass("solid", "w-full")} disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      {hints.length > 0 ? (
        <div className="space-y-2 pt-2">
          <p className="text-xs uppercase tracking-[0.16em] text-bark">Sample logins</p>
          <div className="grid gap-2">
            {hints.map((hint) => (
              <button
                key={hint.email}
                type="button"
                className="rounded-2xl border border-line bg-cream px-3 py-2 text-left text-sm hover:border-ink"
                onClick={() => {
                  setEmail(hint.email);
                  setPassword(hint.password);
                }}
              >
                <span className="font-medium">{hint.label}</span>
                <span className="mt-0.5 block text-xs text-bark">
                  {hint.email} · {hint.password}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </form>
  );
}
