import { redirect } from "next/navigation";
import { getMembership } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { Onboarding } from "./onboarding";

export const metadata = { title: "Set up · Deloo" };

export default async function OnboardingPage() {
  if (await getMembership()) redirect("/");
  const supabase = await createClient();
  const [{ data: categories }, { data: templates }] = await Promise.all([
    supabase.from("categories").select("key, label, description, available").order("sort"),
    supabase.from("templates").select("key, name, description").order("sort"),
  ]);
  return <Onboarding categories={categories ?? []} templates={templates ?? []} />;
}
