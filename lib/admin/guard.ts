import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { AccessError, requireStaff, type Staff } from "./auth";
import type { ActionResult } from "./action-result";
import type { Capability } from "./roles";

/**
 * Wraps a server action body: checks the caller is staff with the capability, turns access errors into
 * a message for the form, and refreshes the admin pages after a change.
 */
export async function act(cap: Capability, fn: (staff: Staff) => Promise<ActionResult>): Promise<ActionResult> {
  try {
    const staff = await requireStaff(cap);
    const result = await fn(staff);
    if (!result?.error) revalidatePath("/admin", "layout");
    return result;
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AccessError) return { error: e.message };
    console.error("[admin] action failed:", e);
    return { error: e instanceof Error ? e.message : "Something went wrong. Try again." };
  }
}

export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
