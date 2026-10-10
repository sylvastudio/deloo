import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetPassword } from "./set-password";

export const metadata = { title: "Welcome · Deloo" };

/** Invited staff land here from their email link and choose a password. */
export default async function Welcome() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <main className="solo">
      <div className="solo-top"><p className="wordmark">deloo<span className="dot">.</span></p></div>
      <div className="solo-main">
        <section className="solo-step">
          <p className="kicker">You&apos;re in</p>
          <h1 className="h1">Welcome to Deloo</h1>
          <p className="hint" style={{ fontSize: 15 }}>Choose a password so you can sign in from any phone.</p>
          <SetPassword />
        </section>
      </div>
    </main>
  );
}
