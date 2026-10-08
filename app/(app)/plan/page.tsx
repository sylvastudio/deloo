import { requireAccount } from "@/lib/account";

export const metadata = { title: "Plan · Deloo" };

// Phase 1 replaces this with the intake questions and Good / Better / Best setups.
export default async function Plan() {
  const a = await requireAccount();
  return (
    <div className="page">
      <div className="grid gap-1">
        <p className="kicker">Plan an event</p>
        <h1 className="h1">Hi {a.profile.full_name.split(" ")[0]}, tell us about your event</h1>
      </div>
      <section className="card grid gap-3">
        <h2 className="h2">The planner is almost ready</h2>
        <p className="hint" style={{ fontSize: 14 }}>
          Soon you&apos;ll answer a few quick questions (what kind of event, how many people, indoors or outdoors, livestream or not)
          and Deloo will recommend the sound, screens, cameras and power you need, with what&apos;s free on your date.
        </p>
      </section>
    </div>
  );
}
