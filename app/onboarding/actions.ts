"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OnboardingInput = {
  name: string; orgType: string; structure: string;
  categories: string[]; templates: string[]; requests: { name: string; description: string }[];
};

export async function createOrganisation(input: OnboardingInput): Promise<{ error: string } | void> {
  const name = input.name.trim();
  if (!name) return { error: "Add your organisation's name." };
  if (!input.categories.length) return { error: "Pick at least one type you can make today." };
  if (!input.templates.length) return { error: "Pick at least one style." };
  const supabase = await createClient();
  const { data: orgId, error } = await supabase.rpc("create_organisation", {
    org_name: name, org_type: input.orgType, org_structure: input.structure,
    category_keys: input.categories, template_keys: input.templates,
  });
  if (error) return { error: error.code === "23505" ? "You already belong to an organisation." : "Setup didn't finish. Try again." };
  if (input.requests.length) {
    await supabase.from("type_requests").insert(input.requests.map((r) => ({ org_id: orgId, name: r.name, description: r.description })));
  }
  redirect("/");
}
