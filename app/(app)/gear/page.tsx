import { redirect } from "next/navigation";
import { isVendor, requireAccount } from "@/lib/account";
import { naira } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Gear · Deloo" };

// Phase 2 adds listing, units, photos and the calendar.
export default async function Gear() {
  const a = await requireAccount();
  if (!isVendor(a)) redirect("/account");
  const vendor = a.vendors[0];
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("items").select("id, name, category_key, day_rate_kobo, active, units(count)")
    .eq("vendor_id", vendor.id).order("created_at", { ascending: false });

  return (
    <div className="page">
      <div className="grid gap-1">
        <p className="kicker">{vendor.name}</p>
        <h1 className="h1">Your gear</h1>
      </div>
      {!vendor.approved_at && (
        <p className="notice" role="status">Deloo checks every owner before their gear goes live. We&apos;ll call you to arrange it. You can add gear now; renters see it once you&apos;re approved.</p>
      )}
      <section className="card grid gap-3">
        {items?.length ? (
          <ul className="row-list">
            {items.map((i) => {
              const units = (i.units as unknown as { count: number }[])[0]?.count ?? 0;
              return (
                <li key={i.id} className="row">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{i.name}</span>
                    <span className="hint">{units} {units === 1 ? "unit" : "units"}{i.active ? "" : " · hidden"}</span>
                  </span>
                  <span className="hint font-mono shrink-0">{naira(i.day_rate_kobo)}/day</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="hint">No gear listed yet. Adding speakers, screens, cameras and lights is coming next.</p>
        )}
      </section>
    </div>
  );
}
