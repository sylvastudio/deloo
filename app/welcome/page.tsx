import { redirect } from "next/navigation";
import { getAccount } from "@/lib/account";
import { SetPassword } from "./set-password";

export const metadata = { title: "Welcome · Deloo" };

/** Invited people (e.g. a vendor's staff) land here from their email link and choose a password. */
export default async function Welcome() {
  const a = await getAccount();
  if (!a) redirect("/onboarding");
  return (
    <main className="solo">
      <div className="solo-top"><p className="wordmark">deloo<span className="dot">.</span></p></div>
      <div className="solo-main">
        <section className="solo-step">
          <p className="kicker">You&apos;re in</p>
          <h1 className="h1">Welcome{a.vendors[0] ? ` to ${a.vendors[0].name}` : ""}</h1>
          <p className="hint" style={{ fontSize: 15 }}>Choose a password so you can sign in from any phone.</p>
          <SetPassword />
        </section>
      </div>
    </main>
  );
}
