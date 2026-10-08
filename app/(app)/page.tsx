import { redirect } from "next/navigation";
import { isRenter, requireAccount } from "@/lib/account";

/** Home sends renters to planning and gear owners to their gear. */
export default async function Home() {
  const a = await requireAccount();
  redirect(isRenter(a) ? "/plan" : "/gear");
}
