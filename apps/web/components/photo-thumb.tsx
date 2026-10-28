"use client";

import { useState } from "react";

export function PhotoThumb({ src, alt, className, quiet = false }: { src: string; alt: string; className?: string; quiet?: boolean }) {
  const [failed, setFailed] = useState(!src);
  if (failed) {
    if (quiet) return null;
    return <div className={`grid place-items-center bg-line px-2 text-center text-xs text-bark ${className ?? ""}`}>Photo unavailable</div>;
  }
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}
