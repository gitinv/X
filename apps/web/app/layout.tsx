import { PwaRegister } from "@/components/pwa-register";
import { getPublicTenant } from "@/lib/tenant";
import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Outfit } from "next/font/google";
import "./globals.css";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-serif",
});

const sans = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
});

export const dynamic = "force-dynamic";

async function branding() {
  try {
    const salon = await getPublicTenant();
    return { name: salon?.name ?? "The Red Lady Spa", color: salon?.brandColor ?? "#7A1F2B" };
  } catch {
    return { name: "The Red Lady Spa", color: "#7A1F2B" };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const brand = await branding();
  return {
    title: { default: brand.name, template: `%s · ${brand.name}` },
    description: "Book nail services, run the front desk, and manage your salon.",
    applicationName: brand.name,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: brand.name,
    },
    icons: {
      icon: "/icon.svg",
      apple: "/api/pwa/icon/180",
    },
    other: {
      "apple-mobile-web-app-capable": "yes",
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const brand = await branding();
  return {
    themeColor: brand.color,
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body className="min-h-screen bg-cream font-sans text-ink antialiased">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
