import { redirect } from "next/navigation";
import { getAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { Onboarding } from "./onboarding";

export const metadata = { title: "Set up · Deloo" };

export default async function OnboardingPage() {
  if (await getAccount()) redirect("/");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");
  return <Onboarding />;
}
