"use client";

import { cancelGuestVisit } from "@/app/book/manage/actions";
import { buttonClass } from "@/components/ui";

export function GuestCancelForm({ token, policy }: { token: string; policy: string }) {
  return (
    <form
      className="mt-4"
      action={cancelGuestVisit}
      onSubmit={(event) => {
        if (!window.confirm(`${policy}\n\nCancel this visit?`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="confirm" value="yes" />
      <button className={buttonClass("ghost", "min-h-11")}>Cancel this visit</button>
    </form>
  );
}
