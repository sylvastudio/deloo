import { isVendor, requireAccount } from "@/lib/account";
import { DAY, naira } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Bookings · Deloo" };

const STATUS: Record<string, string> = {
  hold: "Waiting for payment", confirmed: "Confirmed", out: "With renter", returned: "Returned",
  closed: "Closed", cancelled: "Cancelled", disputed: "In dispute",
};

type Row = { id: string; renter_id: string; status: string; starts_at: string; total_kobo: number; vendors: { name: string } | { name: string }[] | null };

function List({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  return (
    <section className="card grid gap-3">
      <h2 className="h2">{title}</h2>
      {rows.length ? (
        <ul className="row-list">
          {rows.map((b) => {
            const vendor = Array.isArray(b.vendors) ? b.vendors[0] : b.vendors;
            return (
              <li key={b.id} className="row">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{DAY.format(new Date(b.starts_at))} · {vendor?.name}</span>
                  <span className="hint">{STATUS[b.status] ?? b.status}</span>
                </span>
                <span className="hint font-mono shrink-0">{naira(b.total_kobo)}</span>
              </li>
            );
          })}
        </ul>
      ) : <p className="hint">{empty}</p>}
    </section>
  );
}

export default async function Bookings() {
  const a = await requireAccount();
  const supabase = await createClient();
  // RLS (bookings_select): your bookings as a renter, plus bookings of gear from vendors you belong to.
  const { data } = await supabase
    .from("bookings").select("id, renter_id, status, starts_at, total_kobo, vendors(name)")
    .order("starts_at", { ascending: true }).limit(50);
  const rows = (data ?? []) as Row[];
  return (
    <div className="page">
      <h1 className="h1">Bookings</h1>
      <List title="Your rentals" rows={rows.filter((b) => b.renter_id === a.userId)} empty="When you book a setup, it shows here." />
      {isVendor(a) && <List title="Bookings for your gear" rows={rows.filter((b) => b.renter_id !== a.userId)} empty="When someone books your gear, it shows here." />}
    </div>
  );
}
