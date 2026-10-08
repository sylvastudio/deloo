import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type VendorType = "company" | "church" | "individual";
export type Account = {
  userId: string;
  email: string;
  profile: { full_name: string; phone: string; wants_to_rent: boolean; has_gear: boolean; trust_level: number; is_ops: boolean };
  vendors: { id: string; name: string; vendor_type: VendorType; approved_at: string | null; role: "owner" | "staff" }[];
};

/** The signed-in user's profile and the vendors they belong to, or null before onboarding. Cached per request. */
export const getAccount = cache(async (): Promise<Account | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: members }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, wants_to_rent, has_gear, trust_level, is_ops").eq("id", user.id).maybeSingle(),
    supabase.from("vendor_members").select("role, vendors(id, name, vendor_type, approved_at)").eq("user_id", user.id),
  ]);
  if (!profile) return null;
  const vendors = (members ?? []).flatMap((m) => {
    const v = Array.isArray(m.vendors) ? m.vendors[0] : m.vendors;
    return v ? [{ ...v, role: m.role }] : [];
  });
  return { userId: user.id, email: user.email ?? "", profile, vendors } as Account;
});

/** For pages inside the app: signed in and onboarded, or sent where they need to go. */
export async function requireAccount(): Promise<Account> {
  const a = await getAccount();
  if (!a) redirect("/onboarding");
  return a;
}

/** Renter pages show for anyone who rents; vendor pages for anyone with a vendor. */
export const isRenter = (a: Account) => a.profile.wants_to_rent || a.profile.is_ops;
export const isVendor = (a: Account) => a.vendors.length > 0;
