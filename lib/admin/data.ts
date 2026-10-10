import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Staff } from "./auth";
import type { HandoverKind } from "./status";
import type { HandoverRow, MediaRow } from "./types";

export const DELOO_VENDOR_ID = "de100000-0000-4000-8000-000000000001";
export const HANDOVER_BUCKET = "handover-media";
export const ITEMS_BUCKET = "items";

/** Public URL of an item photo path in the `items` bucket (or the value itself if already a URL). */
export function itemPhotoUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${ITEMS_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Display names for user ids: staff display name first, then the renter profile name. */
export async function namesFor(db: SupabaseClient, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (!unique.length) return out;
  const [{ data: profiles }, { data: staff }] = await Promise.all([
    db.from("profiles").select("id, full_name").in("id", unique),
    db.from("staff_members").select("user_id, display_name").in("user_id", unique),
  ]);
  for (const p of profiles ?? []) out.set(p.id, p.full_name);
  for (const s of staff ?? []) if (s.display_name) out.set(s.user_id, `${s.display_name} (staff)`);
  return out;
}

export type EvidenceMedia = MediaRow & { url: string | null };
export type Evidence = HandoverRow & { media: EvidenceMedia[]; performer: string };

/**
 * Every handover of these bookings with its media, newest first. Media live in the private
 * `handover-media` bucket; signed URLs are made with the staff member's own session (storage RLS lets
 * staff read) and last an hour.
 */
export async function loadEvidence(db: SupabaseClient, bookingIds: string[]): Promise<{ data: Evidence[]; error: string | null }> {
  if (!bookingIds.length) return { data: [], error: null };
  const [h, m] = await Promise.all([
    db.from("handovers").select("id, booking_id, kind, party, performed_by, problem_note, result, confirmed_at, device_completed_at, created_at")
      .in("booking_id", bookingIds).order("created_at", { ascending: false }),
    db.from("handover_media").select("id, handover_id, booking_id, unit_id, shot, media_type, storage_path, sha256, bytes, captured_at, uploaded_at, uploaded_by")
      .in("booking_id", bookingIds).order("uploaded_at", { ascending: true }),
  ]);
  if (h.error || m.error) return { data: [], error: (h.error ?? m.error)!.message };
  const handovers = (h.data ?? []) as HandoverRow[];
  const media = (m.data ?? []) as MediaRow[];

  const urls = new Map<string, string>();
  const paths = media.map((x) => x.storage_path);
  for (let i = 0; i < paths.length; i += 100) {
    const { data } = await db.storage.from(HANDOVER_BUCKET).createSignedUrls(paths.slice(i, i + 100), 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const names = await namesFor(db, handovers.map((x) => x.performed_by));
  return {
    error: null,
    data: handovers.map((x) => ({
      ...x,
      performer: (x.performed_by && names.get(x.performed_by)) || (x.party === "renter" ? "Renter" : "Staff"),
      media: media.filter((y) => y.handover_id === x.id).map((y) => ({ ...y, url: urls.get(y.storage_path) ?? null })),
    })),
  };
}

/**
 * Which of the booking's units have at least one staff photo in a handover of this kind. A rider can
 * only move a job on once every unit is covered (A-23).
 */
export async function evidenceCoverage(db: SupabaseClient, bookingId: string, kind: HandoverKind) {
  const [{ data: items }, { data: hs }] = await Promise.all([
    db.from("booking_items").select("unit_id").eq("booking_id", bookingId).eq("kind", "rental"),
    db.from("handovers").select("id").eq("booking_id", bookingId).eq("kind", kind).eq("party", "staff"),
  ]);
  const units = [...new Set((items ?? []).map((i) => i.unit_id as string | null).filter((x): x is string => !!x))];
  const ids = (hs ?? []).map((x) => x.id as string);
  const covered = new Set<string>();
  if (ids.length) {
    const { data: media } = await db.from("handover_media").select("unit_id").in("handover_id", ids).eq("media_type", "photo");
    for (const x of media ?? []) if (x.unit_id) covered.add(x.unit_id as string);
  }
  const missing = units.filter((u) => !covered.has(u));
  return { units, covered, missing, complete: units.length > 0 && missing.length === 0, hasHandover: ids.length > 0 };
}

const digits = (s: string) => (s ?? "").replace(/\D/g, "").slice(-10);

/**
 * Riders see only their own jobs. Bookings have no rider user id yet (rider_name/rider_phone are free
 * text), so a job is the rider's when its rider phone matches theirs, or the name does.
 */
export function riderOwns(staff: Staff, b: { rider_name: string; rider_phone: string }) {
  if (staff.role !== "rider") return true;
  const p = digits(staff.phone);
  if (p.length >= 7 && digits(b.rider_phone) === p) return true;
  return !!staff.displayName && b.rider_name.trim().toLowerCase() === staff.displayName.trim().toLowerCase();
}

/** Turn a Postgres/PostgREST error into something staff can act on. */
export function friendlyError(e: { message?: string; code?: string } | null | undefined): string {
  if (!e) return "Something went wrong.";
  if (e.code === "23P01") return "That overlaps a booking or block on this unit.";
  if (e.code === "42501" || /row-level security/i.test(e.message ?? "")) return e.message && !/row-level security/i.test(e.message) ? e.message : "Your role can’t do that.";
  if (e.code === "23505") return "That already exists.";
  if (e.code === "23514") return "One of the values isn’t allowed. Check the numbers.";
  return e.message || "Something went wrong.";
}

/** Strip characters that would break a PostgREST or() filter. */
export const safeSearch = (q: string) => q.replace(/[,()*%\\]/g, " ").trim().slice(0, 60);
