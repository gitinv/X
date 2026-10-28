import { logout } from "@/app/login/actions";
import { buttonClass } from "@/components/ui";
import type { Role } from "@redlady/core";
import Link from "next/link";
import type { ReactNode } from "react";

const customerLinks = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/book", label: "Book" },
  { href: "/shop", label: "Shop" },
  { href: "/account", label: "Visits" },
];

export function CustomerShell({
  name,
  tagline,
  brandColor,
  signedInName,
  children,
}: {
  name: string;
  tagline: string;
  brandColor: string;
  signedInName?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream" style={{ ["--brand" as string]: brandColor }}>
      <header className="sticky top-0 z-20 border-b border-line/80 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="min-w-0">
            <span className="block font-serif text-3xl italic leading-none text-wine">{name}</span>
            <span className="mt-1 block truncate text-[10px] uppercase tracking-[0.18em] text-bark">{tagline}</span>
          </Link>
          <nav className="hidden items-center gap-5 text-sm md:flex">
            {customerLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-ink/80 hover:text-ink">
                {link.label}
              </Link>
            ))}
            {signedInName ? (
              <form action={logout}>
                <button className="text-bark hover:text-ink">Sign out</button>
              </form>
            ) : (
              <Link href="/login" className={buttonClass("solid", "px-3 py-2")}>
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 md:pb-16">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-white/95 px-2 py-2 backdrop-blur md:hidden">
        {customerLinks.map((link) => (
          <Link key={link.href} href={link.href} className="py-2 text-center text-[11px] font-medium text-ink">
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function StaffShell({
  role,
  name,
  salon,
  children,
}: {
  role: Role;
  name: string;
  salon?: string | null;
  children: ReactNode;
}) {
  const links = [
    { href: "/pos", label: "Front desk", show: role === "FRONT_DESK" || role === "MANAGER" || role === "OWNER" },
    { href: "/tech", label: "Tech screen", show: role === "TECHNICIAN" || role === "FRONT_DESK" || role === "MANAGER" || role === "OWNER" },
    { href: "/catalog", label: "Catalog", show: role === "FRONT_DESK" || role === "MANAGER" || role === "OWNER" },
    { href: "/admin", label: "Owner portal", show: role === "MANAGER" || role === "OWNER" },
    { href: "/platform", label: "All salons", show: role === "PLATFORM_ADMIN" },
    { href: "/", label: "Customer site", show: true },
  ];
  return (
    <div className="min-h-screen bg-cream md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-white/10 bg-wine text-cream md:min-h-screen md:border-b-0">
        <div className="px-5 py-6">
          <p className="font-serif text-3xl italic leading-none">Red Lady</p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-gold">{salon || "Platform"}</p>
          <p className="mt-4 text-sm text-cream/80">{name}</p>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-3 pb-4 md:block md:space-y-1 md:px-3">
          {links
            .filter((link) => link.show)
            .map((link) => (
              <Link key={link.href} href={link.href} className="block whitespace-nowrap rounded-full px-3 py-2 text-sm hover:bg-white/10">
                {link.label}
              </Link>
            ))}
          <form action={logout} className="px-3 py-2">
            <button className="text-sm text-gold">Sign out</button>
          </form>
        </nav>
      </aside>
      <div className="px-4 py-6 md:px-8">{children}</div>
    </div>
  );
}
