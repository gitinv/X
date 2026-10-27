import { LoginForm } from "@/components/login-form";
import { demoHints } from "@/lib/demo-accounts";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-4 py-10 md:grid-cols-2">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-bark">Red Lady Spa</p>
        <h1 className="mt-3 font-serif text-6xl italic leading-none text-wine">Sign in to your chair, desk, or studio.</h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-bark">
          Customers book and review visits. The front desk runs today&apos;s book. Technicians watch the turn screen. Owners edit the menu.
        </p>
      </div>
      <div className="rounded-[2rem] bg-white p-6 shadow-card">
        <LoginForm next={params.next} hints={demoHints()} />
      </div>
    </main>
  );
}
