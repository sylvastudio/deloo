"use server";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/admin/action-result";
import { DELOO_VENDOR_ID, friendlyError, ITEMS_BUCKET } from "@/lib/admin/data";
import { addDays, dayStart, koboFromNaira } from "@/lib/admin/format";
import { act, bool, isDay, isUuid, str } from "@/lib/admin/guard";
import { can } from "@/lib/admin/roles";
import { UNIT_STATUSES, type UnitStatus } from "@/lib/admin/status";
import { createClient } from "@/lib/supabase/server";

/** specs arrive as JSON from the key/value editor; values typed as numbers/booleans where they look like one. */
function parseSpecs(raw: string): Record<string, unknown> | null {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      const key = k.trim().slice(0, 40);
      if (key) out[key] = val;
    }
    return out;
  } catch {
    return null;
  }
}

const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 40).map((x) => x.slice(0, 120));

function itemFields(form: FormData, withPrices: boolean): { patch: Record<string, unknown>; error?: string } {
  const name = str(form, "name").slice(0, 120);
  if (!name) return { patch: {}, error: "Give the item a name." };
  const specs = parseSpecs(str(form, "specs"));
  if (!specs) return { patch: {}, error: "The specs couldn’t be read. Check the key/value rows." };
  const patch: Record<string, unknown> = {
    name,
    brand: str(form, "brand").slice(0, 80),
    model: str(form, "model").slice(0, 80),
    description: str(form, "description").slice(0, 4000),
    specs,
    in_the_box: lines(str(form, "in_the_box")),
  };
  const cat = str(form, "category_key");
  if (cat) patch.category_key = cat;
  if (withPrices) {
    const rate = koboFromNaira(form.get("day_rate"));
    const pctRaw = str(form, "protection_pct");
    const protection = pctRaw === "" ? null : Number(pctRaw) / 100;
    const replacement = koboFromNaira(form.get("replacement_value"));
    if (rate == null) return { patch, error: "Add the day rate." };
    if (replacement == null || replacement <= 0) return { patch, error: "Add the replacement value (more than ₦0)." };
    patch.day_rate_kobo = rate;
    if (protection != null && (!Number.isFinite(protection) || protection < 0 || protection > 0.5)) return { patch, error: "Protection must be between 0% and 50%." };
    // No deposits since 0019; blank Protection falls back to the category rate on the server.
    patch.deposit_kobo = 0;
    patch.protection_rate = protection == null ? null : Math.round(protection * 10000) / 10000;
    patch.replacement_value_kobo = replacement;
  }
  return { patch };
}

export async function saveItem(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("inventory.edit", async (staff) => {
    const id = str(form, "item_id");
    if (!isUuid(id)) return { error: "Unknown item." };
    // Ops edit everything except prices (PRD §2.2); the price inputs are disabled for them anyway.
    const { patch, error } = itemFields(form, can(staff.role, "inventory.price"));
    if (error) return { error };
    patch.active = bool(form, "active");
    const db = await createClient();
    const { error: e } = await db.from("items").update(patch).eq("id", id);
    return e ? { error: friendlyError(e) } : { ok: "Item saved. New prices apply to new bookings only." };
  });
}

export async function createItem(_: ActionResult, form: FormData): Promise<ActionResult> {
  let newId = "";
  const r = await act("inventory.price", async () => {
    const { patch, error } = itemFields(form, true);
    if (error) return { error };
    if (!patch.category_key) return { error: "Choose a category." };
    const db = await createClient();
    const { data, error: e } = await db.from("items").insert({ ...patch, vendor_id: DELOO_VENDOR_ID, active: false }).select("id").single();
    if (e || !data) return { error: friendlyError(e) };
    newId = data.id as string;
    return { ok: "Item added." };
  });
  if (newId) redirect(`/admin/inventory/${newId}?new=1`);
  return r;
}

export async function setItemActive(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("inventory.edit", async () => {
    const id = str(form, "item_id");
    if (!isUuid(id)) return { error: "Unknown item." };
    const active = str(form, "active") === "true";
    const db = await createClient();
    const { error } = await db.from("items").update({ active }).eq("id", id);
    return error ? { error: friendlyError(error) } : { ok: active ? "Listed." : "Hidden from renters." };
  });
}

/** Photos: the browser uploads to the public `items` bucket at <vendor id>/<file>; this records the path. */
export async function addItemPhoto(input: { itemId: string; path: string }): Promise<{ error?: string }> {
  const r = await act("inventory.edit", async () => {
    if (!isUuid(input.itemId)) return { error: "Unknown item." };
    const db = await createClient();
    const { data: item } = await db.from("items").select("vendor_id, photos").eq("id", input.itemId).maybeSingle();
    if (!item) return { error: "Item not found." };
    if (!input.path.startsWith(`${item.vendor_id}/`) || input.path.includes("..")) return { error: "Photos must be stored under the item’s vendor." };
    const photos = [...((item.photos as string[]) ?? []), input.path].slice(0, 12);
    const { error } = await db.from("items").update({ photos }).eq("id", input.itemId);
    return error ? { error: friendlyError(error) } : { ok: "Photo added." };
  });
  return { error: r?.error };
}

export async function changeItemPhoto(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("inventory.edit", async () => {
    const id = str(form, "item_id");
    const path = str(form, "path");
    const op = str(form, "op");
    if (!isUuid(id)) return { error: "Unknown item." };
    const db = await createClient();
    const { data: item } = await db.from("items").select("photos").eq("id", id).maybeSingle();
    if (!item) return { error: "Item not found." };
    const photos = ((item.photos as string[]) ?? []);
    if (!photos.includes(path)) return { error: "That photo isn’t on this item." };
    const next = op === "cover" ? [path, ...photos.filter((p) => p !== path)] : photos.filter((p) => p !== path);
    const { error } = await db.from("items").update({ photos: next }).eq("id", id);
    if (error) return { error: friendlyError(error) };
    if (op === "remove" && !/^https?:/.test(path)) await db.storage.from(ITEMS_BUCKET).remove([path]);
    return { ok: op === "cover" ? "Cover photo set." : "Photo removed." };
  });
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------
function unitFields(form: FormData) {
  return {
    tag: str(form, "tag").slice(0, 40),
    serial: str(form, "serial").slice(0, 80),
    condition: str(form, "condition").slice(0, 40),
    notes: str(form, "notes").slice(0, 1000),
  };
}

export async function saveUnit(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("inventory.edit", async (staff) => {
    const id = str(form, "unit_id");
    const status = str(form, "status") as UnitStatus;
    if (!isUuid(id)) return { error: "Unknown unit." };
    if (!UNIT_STATUSES.includes(status)) return { error: "Choose a status." };
    const db = await createClient();
    const { data: cur } = await db.from("units").select("status").eq("id", id).maybeSingle();
    if (!cur) return { error: "Unit not found." };
    // Retiring or writing off a unit is an owner/admin decision (PRD §6.2).
    if (status !== cur.status && (status === "retired" || status === "lost" || cur.status === "retired" || cur.status === "lost") && !can(staff.role, "inventory.price")) {
      return { error: "Only an owner or admin can retire a unit, mark it lost, or bring it back." };
    }
    const { error } = await db.from("units").update({ ...unitFields(form), status }).eq("id", id);
    if (error) return { error: friendlyError(error) };
    if (cur.status === "active" && status !== "active") {
      const { count } = await db.from("reservations").select("id", { count: "exact", head: true })
        .eq("unit_id", id).eq("live", true).not("booking_id", "is", null).overlaps("period", `[${new Date().toISOString()},)`);
      if (count) return { ok: `Saved. ${count} upcoming booking${count === 1 ? " still uses" : "s still use"} this unit: swap them to another unit from each booking.` };
    }
    return { ok: "Unit saved." };
  });
}

export async function addUnit(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("inventory.edit", async () => {
    const itemId = str(form, "item_id");
    if (!isUuid(itemId)) return { error: "Unknown item." };
    const f = unitFields(form);
    if (!f.tag && !f.serial) return { error: "Add a tag (e.g. FX3-02) or the serial number." };
    const db = await createClient();
    const { error } = await db.from("units").insert({ ...f, item_id: itemId, status: "active" });
    return error ? { error: friendlyError(error) } : { ok: "Unit added." };
  });
}

// ---------------------------------------------------------------------------
// Availability blocks: reservations with no booking (maintenance, own shoot, cleaning)
// ---------------------------------------------------------------------------
export async function addBlock(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("inventory.edit", async () => {
    const unit = str(form, "unit_id");
    const first = str(form, "first");
    const last = str(form, "last");
    const note = str(form, "note").slice(0, 200);
    if (!isUuid(unit)) return { error: "Pick a unit." };
    if (!isDay(first) || !isDay(last) || last < first) return { error: "Pick the first and last day." };
    if (!note) return { error: "Say why (e.g. repair, own shoot, cleaning)." };
    const db = await createClient();
    const { error } = await db.from("reservations").insert({
      unit_id: unit, booking_id: null, note, live: true,
      period: `[${dayStart(first)},${dayStart(addDays(last, 1))})`,
    });
    return error ? { error: friendlyError(error) } : { ok: "Blocked." };
  });
}

export async function removeBlock(_: ActionResult, form: FormData): Promise<ActionResult> {
  return act("inventory.edit", async () => {
    const id = str(form, "reservation_id");
    if (!isUuid(id)) return { error: "Unknown block." };
    const db = await createClient();
    const { error, count } = await db.from("reservations").delete({ count: "exact" }).eq("id", id).is("booking_id", null);
    if (error) return { error: friendlyError(error) };
    return count ? { ok: "Block removed." } : { error: "That block was already gone, or it belongs to a booking." };
  });
}
