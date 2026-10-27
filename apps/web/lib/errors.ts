import { BookingConflictError } from "@redlady/db";
import { InventoryError, TenantIsolationError } from "@redlady/core";

export function publicError(error: unknown) {
  if (error instanceof InventoryError || error instanceof BookingConflictError || error instanceof TenantIsolationError) {
    return error.message;
  }
  if (error instanceof Error && error.message.startsWith("Please ")) return error.message;
  return "Something went wrong.";
}
