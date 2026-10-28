import type { ButtonHTMLAttributes, ReactNode } from "react";

export function buttonClass(variant: "solid" | "ghost" | "light" = "solid", className = "") {
  const base = "inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium transition disabled:opacity-50";
  const styles = {
    solid: "bg-[var(--brand,#7A1F2B)] text-white hover:opacity-90",
    ghost: "border border-line bg-white text-ink hover:border-ink",
    light: "bg-white text-wine hover:bg-cream",
  }[variant];
  return `${base} ${styles} ${className}`;
}

export function Button({
  variant = "solid",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "light" }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function Notice({ children, tone = "ok" }: { children: ReactNode; tone?: "ok" | "warn" }) {
  const styles = tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950";
  return <p className={`rounded-2xl border px-4 py-3 text-sm ${styles}`}>{children}</p>;
}

export function SetupScreen() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <p className="text-xs uppercase tracking-[0.2em] text-bark">Red Lady Spa</p>
      <h1 className="mt-3 font-serif text-5xl italic text-wine">The database is not ready yet.</h1>
      <p className="mt-4 text-sm leading-6 text-bark">
        Start Postgres, then load the sample salon. In PowerShell, from the project folder:
      </p>
      <pre className="mt-4 overflow-x-auto rounded-2xl bg-ink p-4 text-xs leading-6 text-cream">
        {`Copy-Item .env.example .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:setup
pnpm dev`}
      </pre>
    </main>
  );
}
