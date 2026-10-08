"use server";
import { redirect } from "next/navigation";
import { LAGOS_AREAS } from "@/lib/areas";
import type { VendorType } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";

export type OnboardingInput = {
  fullName: string; phone: string; rent: boolean; gear: boolean;
  vendor?: { name: string; type: VendorType; areas: string[]; delivery: boolean; technician: boolean };
};

const PHONE = /^\+?[0-9 ()-]{10,16}$/;

export async function completeOnboarding(input: OnboardingInput): Promise<{ error: string } | void> {
  const fullName = input.fullName.trim(), phone = input.phone.trim();
  if (!fullName) return { error: "Add your name." };
  if (!PHONE.test(phone)) return { error: "Add a phone number we can call or WhatsApp, e.g. 0803 123 4567." };
  if (!input.rent && !input.gear) return { error: "Choose at least one." };
  const v = input.vendor;
  if (input.gear && (!v?.name.trim() || !v.type)) return { error: "Add a name for your gear and choose what kind of owner you are." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Insert, or update if a previous attempt got this far. Not upsert: that also writes `id`, which users
  // may not update (column grants in 0007).
  const fields = { full_name: fullName, phone, wants_to_rent: input.rent, has_gear: input.gear };
  let { error } = await supabase.from("profiles").insert({ id: user.id, ...fields });
  if (error?.code === "23505") ({ error } = await supabase.from("profiles").update(fields).eq("id", user.id));
  if (error) return { error: "Setup didn't finish. Try again." };

  if (input.gear && v) {
    const { data: existing } = await supabase.from("vendor_members").select("vendor_id").eq("user_id", user.id).limit(1);
    if (!existing?.length) {
      const { error: vErr } = await supabase.rpc("create_vendor", {
        vendor_name: v.name, kind: v.type, vendor_areas: v.areas.filter((a) => (LAGOS_AREAS as readonly string[]).includes(a)),
        vendor_phone: phone, delivery: v.delivery, technician: v.technician,
      });
      if (vErr) return { error: "Your profile is saved, but we couldn't set up your gear listing. Try again." };
    }
  }
  redirect(input.rent ? "/plan" : "/gear");
}
