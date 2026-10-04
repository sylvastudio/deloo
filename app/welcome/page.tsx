import { redirect } from "next/navigation";
import { getMembership } from "@/lib/org";
import { SetPassword } from "./set-password";

export const metadata = { title: "Welcome · Deloo" };

/** Invited volunteers land here from their email link and choose a password. */
export default async function Welcome() {
  const m = await getMembership();
  if (!m) redirect("/onboarding");
  return (
    <main className="solo">
      <div className="solo-top"><p className="wordmark">deloo<span className="dot">.</span></p></div>
      <div className="solo-main">
        <section className="solo-step">
          <p className="kicker">You&apos;re in</p>
          <h1 className="h1">Welcome to {m.org.name}{m.unit ? `, ${m.unit.name}` : ""}</h1>
          <p className="hint" style={{ fontSize: 15 }}>HQ has set the brand kit, so everything you make stays on-brand. Choose a password so you can sign in from any phone.</p>
          <SetPassword />
        </section>
      </div>
    </main>
  );
}
