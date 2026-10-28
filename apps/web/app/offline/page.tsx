export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <p className="text-xs uppercase tracking-[0.2em] text-bark">Red Lady</p>
      <h1 className="mt-3 font-serif text-5xl italic text-wine">You are offline.</h1>
      <p className="mt-4 text-sm leading-6 text-bark">The salon book and photos need a connection. The app shell is still on this device. Reopen it when you are back online.</p>
    </main>
  );
}
