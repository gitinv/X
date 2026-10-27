"use client";

import { buttonClass } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

async function resized(file: File, maxWidth: number) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  return blob ?? file;
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function PhotoCapture({
  appointments,
}: {
  appointments: { id: string; label: string; blocked?: string | null }[];
}) {
  const router = useRouter();
  const [appointmentId, setAppointmentId] = useState(appointments[0]?.id ?? "");
  const blocked = appointments.find((visit) => visit.id === appointmentId)?.blocked;
  const [label, setLabel] = useState("AFTER");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function onFiles(files: FileList | null) {
    if (!files || !appointmentId || blocked) return;
    setPending(true);
    setMessage("");
    try {
      for (const file of Array.from(files)) {
        const bytes = await file.arrayBuffer();
        const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
        const presign = await fetch("/api/photos/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appointmentId, label, sha256, contentType: file.type || "image/jpeg" }),
        });
        const targets = (await presign.json()) as {
          error?: string;
          original?: { url: string; key: string };
          display?: { url: string; key: string };
          thumb?: { url: string; key: string };
        };
        if (!presign.ok || !targets.original || !targets.display || !targets.thumb) throw new Error(targets.error || "Upload was refused.");
        const display = await resized(file, 1600);
        const thumb = await resized(file, 320);
        const uploads: [string, Blob][] = [
          [targets.original.url, new Blob([bytes], { type: file.type || "image/jpeg" })],
          [targets.display.url, display],
          [targets.thumb.url, thumb],
        ];
        for (const [url, body] of uploads) {
          const response = await fetch(url, { method: "PUT", body, headers: { "Content-Type": "image/jpeg" } });
          if (!response.ok) throw new Error("The photo could not be stored.");
        }
        const saved = await fetch("/api/photos/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appointmentId,
            label,
            note,
            sha256,
            originalKey: targets.original.key,
            displayKey: targets.display.key,
            thumbKey: targets.thumb.key,
            contentType: file.type || "image/jpeg",
          }),
        });
        const result = (await saved.json()) as { error?: string };
        if (!saved.ok) throw new Error(result.error || "The photo record was not saved.");
      }
      setMessage("Photos saved on this visit.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The photo could not be saved.");
    } finally {
      setPending(false);
    }
  }

  if (appointments.length === 0) return <p className="text-sm text-bark">No chair is ready for photos at this location.</p>;

  return (
    <div className="space-y-3">
      {blocked ? <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{blocked}</p> : null}
      <label className="block text-sm">
        <span className="mb-1 block text-bark">Visit</span>
        <select value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)}>
          {appointments.map((visit) => (
            <option key={visit.id} value={visit.id}>
              {visit.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-bark">Label</span>
        <select value={label} onChange={(event) => setLabel(event.target.value)}>
          <option value="BEFORE">Before</option>
          <option value="AFTER">After</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-bark">Note</span>
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" />
      </label>
      <label className={`${buttonClass("solid", "w-full")} ${blocked ? "pointer-events-none opacity-50" : ""}`}>
        {pending ? "Uploading…" : "Take or choose photos"}
        <input
          className="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          disabled={Boolean(blocked) || pending}
          onChange={(event) => void onFiles(event.target.files)}
        />
      </label>
      {message ? <p className="text-sm text-bark">{message}</p> : null}
    </div>
  );
}
