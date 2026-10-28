"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "redlady-install-dismissed";

export function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
    if (standalone) return;
    const mobile = window.matchMedia("(max-width: 768px)").matches;
    if (mobile) setShow(true);
    const onInstallable = () => setShow(true);
    window.addEventListener("beforeinstallprompt", onInstallable);
    return () => window.removeEventListener("beforeinstallprompt", onInstallable);
  }, []);

  if (!show) return null;

  return (
    <div className="mt-3 flex max-w-xl items-start justify-between gap-3 rounded-2xl border border-line bg-white p-3 text-sm text-bark">
      <p>Add Red Lady to your home screen to book with one tap. On iPhone, open Share and choose Add to Home Screen. On Android, open the browser menu and choose Install app or Add to Home screen.</p>
      <button
        type="button"
        className="shrink-0 underline"
        onClick={() => {
          window.localStorage.setItem(STORAGE_KEY, "1");
          setShow(false);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
