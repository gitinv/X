"use server";

import { authenticate } from "@/lib/auth/authenticate";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth/session";
import { homeForRole, type Role } from "@redlady/core";
import { redirect } from "next/navigation";

function safeNext(value: FormDataEntryValue | null) {
  const next = String(value ?? "");
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export async function login(_prev: { error?: string } | null, formData: FormData) {
  const session = await authenticate(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  if (!session) return { error: "Those details don't match a login." };
  await setSessionCookie(session);
  redirect(safeNext(formData.get("next")) ?? homeForRole(session.role as Role));
}

export async function logout() {
  await clearSessionCookie();
  redirect("/login");
}
