/**
 * Staff roles and what each may do in the admin portal (docs/prd-mvp-rental-ops.md §2.2).
 * The database enforces the same rules (RLS + staff_* functions); these checks only decide what the
 * UI shows, and server actions call them again before touching data. Safe to import from the client.
 */
export type StaffRole = "owner" | "admin" | "ops" | "rider" | "finance" | "readonly";

export const ROLES: StaffRole[] = ["owner", "admin", "ops", "rider", "finance", "readonly"];

export const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "Owner", admin: "Admin", ops: "Ops", rider: "Rider", finance: "Finance", readonly: "Read-only",
};

export type Capability =
  | "dashboard"          // see the dashboard
  | "dispatch.view"      // the dispatch board (who takes which job, when)
  | "bookings.view"      // bookings list and detail
  | "bookings.edit"      // delivery fields, notes
  | "bookings.move"      // status moves (prepare … inspect)
  | "units.swap"
  | "handover.capture"
  | "notes.write"
  | "inventory.view"
  | "inventory.edit"     // items/units fields, photos, availability blocks
  | "inventory.price"    // day rate, protection rate, replacement value, retire/lose a unit, add items
  | "payments.view"
  | "payments.verify"    // re-check with Paystack
  | "refunds.process"
  | "customers.view"
  | "customers.block"
  | "demand.view"
  | "settings.view"
  | "settings.edit"
  | "staff.manage"
  | "messages.view"      // emails to renters (outbox) and their previews
  | "messages.send"      // write a one-off email, retry or cancel one
  | "pii.view"           // unmasked phone numbers and addresses
  | "kyc.review";        // renters' ID documents and selfies, and the verify decision (storage RLS: owner/admin/ops)

const MATRIX: Record<Capability, StaffRole[]> = {
  "dashboard": ["owner", "admin", "ops", "finance", "readonly"],
  "dispatch.view": ["owner", "admin", "ops", "readonly"],
  "bookings.view": ["owner", "admin", "ops", "finance", "readonly"],
  "bookings.edit": ["owner", "admin", "ops"],
  "bookings.move": ["owner", "admin", "ops", "rider"],
  "units.swap": ["owner", "admin", "ops"],
  "handover.capture": ["owner", "admin", "ops", "rider"],
  "notes.write": ["owner", "admin", "ops", "rider", "finance"],
  "inventory.view": ["owner", "admin", "ops", "finance", "readonly"],
  "inventory.edit": ["owner", "admin", "ops"],
  "inventory.price": ["owner", "admin"],
  "payments.view": ["owner", "admin", "ops", "finance", "readonly"],
  "payments.verify": ["owner", "admin", "finance"],
  "refunds.process": ["owner", "admin", "finance"],
  "customers.view": ["owner", "admin", "ops", "finance", "readonly"],
  "customers.block": ["owner", "admin"],
  "demand.view": ["owner", "admin", "ops", "finance", "readonly"],
  "settings.view": ["owner", "admin", "finance", "readonly"],
  "settings.edit": ["owner", "admin"],
  "staff.manage": ["owner", "admin"],
  "messages.view": ["owner", "admin", "ops", "finance", "readonly"],
  "messages.send": ["owner", "admin", "ops"],
  "pii.view": ["owner", "admin", "ops", "rider", "finance"],
  "kyc.review": ["owner", "admin", "ops"],
};

export const can = (role: StaffRole, cap: Capability) => MATRIX[cap].includes(role);

/** Mask a phone number for read-only staff: "0803 ••• 4567". */
export function maskPhone(role: StaffRole, phone: string) {
  if (can(role, "pii.view") || !phone) return phone;
  const d = phone.replace(/\D/g, "");
  return d.length > 4 ? `${d.slice(0, 4)} ••• ${d.slice(-3)}` : "•••";
}

export function maskText(role: StaffRole, text: string) {
  if (can(role, "pii.view") || !text) return text;
  return "Hidden for read-only staff";
}
