"use client";

import { cancelVisit, rescheduleOwnVisit } from "@/app/account/actions";
import { buttonClass } from "@/components/ui";
import { useState } from "react";
import { useFormStatus } from "react-dom";

function PendingButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={buttonClass("ghost")} disabled={pending}>
      {pending ? busy : idle}
    </button>
  );
}

export function CancelVisitForm({ id, policy }: { id: string; policy: string }) {
  return (
    <form
      action={cancelVisit}
      onSubmit={(event) => {
        if (!window.confirm(`${policy}\n\nCancel this visit?`)) {
          event.preventDefault();
          return;
        }
        const field = event.currentTarget.elements.namedItem("confirm");
        if (field instanceof HTMLInputElement) field.value = "yes";
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="confirm" value="no" />
      <PendingButton idle="Cancel visit" busy="Cancelling…" />
    </form>
  );
}

export function RescheduleVisitForm({ id, timezone }: { id: string; timezone: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className={buttonClass("ghost")} onClick={() => setOpen(true)}>
        Reschedule
      </button>
    );
  }
  return (
    <form
      action={rescheduleOwnVisit}
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        if (!window.confirm("Move this visit? The new time has to fit the technician's whole block.")) {
          event.preventDefault();
          return;
        }
        const field = event.currentTarget.elements.namedItem("confirm");
        if (field instanceof HTMLInputElement) field.value = "yes";
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="confirm" value="no" />
      <label className="text-sm">
        <span className="mb-1 block text-bark">New time · {timezone}</span>
        <input type="datetime-local" name="start" required />
      </label>
      <PendingButton idle="Save new time" busy="Saving…" />
      <button type="button" className={buttonClass("ghost")} onClick={() => setOpen(false)}>
        Back
      </button>
    </form>
  );
}
