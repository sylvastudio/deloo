"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveState = { error?: string; notice?: string } | undefined;

export async function saveProfile(_: SaveState, form: FormData): Promise<SaveState> {
  const fullName = String(form.get("full_name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  if (!fullName) return { error: "Add your name." };
  if (phone.replace(/\D/g, "").length < 10) return { error: "Add a phone number we can call or WhatsApp." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in again, then try once more." };
  // RLS (profiles_update) limits this to your own row; column grants keep trust level and Ops flags out of reach.
  const { error } = await supabase.from("profiles")
    .update({ full_name: fullName, phone, wants_to_rent: form.get("wants_to_rent") === "on" })
    .eq("id", user.id);
  if (error) return { error: "Couldn't save. Try again." };
  revalidatePath("/", "layout");
  return { notice: "Saved." };
}
