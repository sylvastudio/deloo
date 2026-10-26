import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { trustShort } from "@/lib/admin/kyc";
import { requiredTrust } from "@/lib/admin/kyc-data";
import { nextAction, type NextAction, type NextActionCtx } from "@/lib/admin/next-action";
import { HANDOVER_KINDS, type BookingStatus, type HandoverKind } from "@/lib/admin/status";
import { one } from "@/lib/admin/types";

/**
 * Bookings for the Today inbox and the dispatch board, with what nextAction() needs: units assigned,
 * staff photo coverage per handover kind, refunds, payment problems and renter-reported problems.
 * One round of queries for the whole list, not one per booking.
 */
export const OPS_COLUMNS =
  "id, ref, renter_id, status, starts_at, ends_at, hold_expires_at, delivery, delivery_zone_id, address, contact_phone, delivery_slot, collection_slot, rider_name, rider_phone, needs_refund, total_kobo, deposit_kobo, delivery_zones(name)";

export type OpsRow = {
  id: string; ref: string | null; renter_id: string; status: BookingStatus; starts_at: string; ends_at: string;
  hold_expires_at: string | null; delivery: string; delivery_zone_id: string | null; address: string; contact_phone: string;
  delivery_slot: string; collection_slot: string; rider_name: string; rider_phone: string; needs_refund: boolean;
  total_kobo: number; deposit_kobo: number; delivery_zones: { name: string } | { name: string }[] | null;
};

export type OpsInfo = {
  ctx: NextActionCtx;
  action: NextAction;
  items: { name: string; tag: string }[];
  renter: { name: string; phone: string };
  zone: string;
  /**
   * The renter's trust is below the booking's required_trust and it hasn't gone out yet: the database
   * refuses the trip out (or the handover at base) with 'not_verified' until ID verification clears.
   */
  unverified: boolean;
};

const chunks = <T,>(xs: T[], n = 150) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

async function inAll<T>(ids: string[], q: (part: string[]) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (const part of chunks(ids)) {
    const { data, error } = await q(part);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

export async function loadOps(db: SupabaseClient, rows: OpsRow[], now = new Date()): Promise<Map<string, OpsInfo>> {
  const ids = [...new Set(rows.map((r) => r.id))];
  const out = new Map<string, OpsInfo>();
  if (!ids.length) return out;
  const renterIds = [...new Set(rows.map((r) => r.renter_id))];

  type Item = { booking_id: string; unit_id: string | null; kind: string; item_name: string; units: { tag: string } | { tag: string }[] | null };
  type Hand = { id: string; booking_id: string; kind: HandoverKind; party: string; result: string | null; created_at: string };
  type Media = { handover_id: string; unit_id: string | null };
  type Refund = { booking_id: string; status: string; amount_kobo: number; purpose: string; created_at: string };
  type Pay = { booking_id: string; status: string; flags: string[] | null };

  const [items, hands, media, refunds, pays, people, required] = await Promise.all([
    inAll<Item>(ids, (p) => db.from("booking_items").select("booking_id, unit_id, kind, item_name, units(tag)").in("booking_id", p)),
    inAll<Hand>(ids, (p) => db.from("handovers").select("id, booking_id, kind, party, result, created_at").in("booking_id", p)),
    inAll<Media>(ids, (p) => db.from("handover_media").select("handover_id, unit_id").in("booking_id", p).eq("media_type", "photo")),
    inAll<Refund>(ids, (p) => db.from("refunds").select("booking_id, status, amount_kobo, purpose, created_at").in("booking_id", p)),
    inAll<Pay>(ids, (p) => db.from("payments").select("booking_id, status, flags").in("booking_id", p)),
    inAll<{ id: string; full_name: string; phone: string; trust_level: number }>(renterIds, (p) => db.from("profiles").select("id, full_name, phone, trust_level").in("id", p)),
    requiredTrust(db, ids),
  ]);

  const unitsByHandover = new Map<string, Set<string>>();
  for (const m of media) if (m.unit_id) unitsByHandover.set(m.handover_id, (unitsByHandover.get(m.handover_id) ?? new Set()).add(m.unit_id));
  const person = new Map(people.map((p) => [p.id, p]));

  for (const b of rows) {
    const lines = items.filter((i) => i.booking_id === b.id && i.kind === "rental");
    const units = [...new Set(lines.map((i) => i.unit_id).filter((x): x is string => !!x))];
    const hs = hands.filter((h) => h.booking_id === b.id);
    const coverage: NextActionCtx["coverage"] = {};
    for (const k of HANDOVER_KINDS) {
      const covered = new Set<string>();
      for (const h of hs) if (h.kind === k && h.party === "staff") for (const u of unitsByHandover.get(h.id) ?? []) covered.add(u);
      coverage[k] = { covered: units.filter((u) => covered.has(u)).length, total: units.length };
    }
    const collected = hs.filter((h) => h.kind === "collection" && h.party === "staff").map((h) => h.created_at).sort().at(-1) ?? null;
    const ctx: NextActionCtx = {
      now,
      units: { total: lines.length, assigned: lines.filter((i) => i.unit_id).length },
      coverage,
      refunds: refunds.filter((r) => r.booking_id === b.id),
      paymentMismatch: pays.some((p) => p.booking_id === b.id && (p.status === "mismatch" || (p.flags ?? []).includes("duplicate"))),
      renterProblem: hs.some((h) => h.party === "renter" && h.result === "issue" && h.kind === "delivery"),
      collectedAt: collected,
    };
    const p = person.get(b.renter_id);
    out.set(b.id, {
      ctx,
      action: nextAction(b, ctx),
      items: lines.map((i) => ({ name: i.item_name, tag: one(i.units)?.tag ?? "" })),
      renter: { name: p?.full_name ?? "Renter", phone: b.contact_phone || p?.phone || "" },
      zone: one(b.delivery_zones)?.name ?? "",
      unverified: (b.status === "confirmed" || b.status === "preparing") && trustShort(p?.trust_level, required.get(b.id)),
    });
  }
  return out;
}

/** "Lekki Phase 1, …" → "Lekki Phase 1": the first part of an address, for an Area column. */
export const area = (address: string) => (address ?? "").split(/[,\n]/)[0].trim();
