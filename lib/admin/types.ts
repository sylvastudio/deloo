import type { BookingStatus, HandoverKind, UnitStatus } from "./status";

/** Row shapes the admin reads (supabase/migrations 0007, 0011). There are no generated DB types yet. */
export type BookingRow = {
  id: string;
  ref: string | null;
  renter_id: string;
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
  hold_expires_at: string | null;
  delivery: "pickup" | "delivery" | "delivery_setup";
  delivery_zone_id: string | null;
  address: string;
  contact_phone: string;
  delivery_slot: string;
  collection_slot: string;
  rider_name: string;
  rider_phone: string;
  days: number;
  rental_kobo: number;
  protection_kobo: number;
  delivery_kobo: number;
  deposit_kobo: number;
  protection_rate: number;
  total_kobo: number;
  needs_refund: boolean;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string;
  not_included: unknown;
  created_at: string;
};

export type BookingItemRow = {
  id: string;
  booking_id: string;
  item_id: string;
  unit_id: string | null;
  item_name: string;
  day_rate_kobo: number;
  days: number;
  rental_kobo: number;
  deposit_kobo: number;
  kind: "rental" | "extension";
  units?: { tag: string; serial: string } | null;
};

export type ItemRow = {
  id: string;
  vendor_id: string;
  category_key: string;
  name: string;
  brand: string;
  model: string;
  description: string;
  specs: Record<string, unknown>;
  day_rate_kobo: number;
  /** Legacy: 0 since 0019 (no deposits). */
  deposit_kobo: number;
  /** Deloo Protection share of rental (0–0.5); null means the category default (0019). */
  protection_rate: number | null;
  replacement_value_kobo: number;
  photos: string[];
  in_the_box: string[];
  active: boolean;
};

export type UnitRow = {
  id: string;
  item_id: string;
  tag: string;
  serial: string;
  condition: string;
  notes: string;
  status: UnitStatus;
  created_at: string;
};

export type HandoverRow = {
  id: string;
  booking_id: string;
  kind: HandoverKind;
  party: "staff" | "renter";
  performed_by: string | null;
  problem_note: string;
  result: "ok" | "issue" | null;
  confirmed_at: string | null;
  device_completed_at: string | null;
  created_at: string;
};

export type MediaRow = {
  id: string;
  handover_id: string;
  booking_id: string;
  unit_id: string | null;
  shot: string;
  media_type: "photo" | "video";
  storage_path: string;
  sha256: string;
  bytes: number;
  captured_at: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
};

export type PaymentRow = {
  id: string;
  booking_id: string;
  purpose: string;
  reference: string;
  amount_kobo: number;
  fees_kobo: number;
  channel: string;
  status: string;
  flags: string[];
  paystack_id: string;
  paid_at: string | null;
  created_at: string;
};

export type RefundRow = {
  id: string;
  booking_id: string;
  payment_id: string | null;
  purpose: string;
  amount_kobo: number;
  method: string;
  status: string;
  provider_ref: string;
  reason: string;
  requested_by: string | null;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
};

export type ProfileRow = { id: string; full_name: string; phone: string; blocked: boolean; trust_level: number; created_at: string };

/** Supabase returns a to-one embed as an object or a one-element array depending on the FK shape. */
export const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
