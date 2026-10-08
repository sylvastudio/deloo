import { requireAccount } from "@/lib/account";
import { VENDOR_TYPES } from "@/lib/areas";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Account · Deloo" };

const TRUST = ["Not verified yet", "Verified for small gear", "Verified for full sound and cameras", "Verified for LED walls and full production"];

export default async function Account() {
  const a = await requireAccount();
  return (
    <div className="page">
      <h1 className="h1">Account</h1>
      <section className="card grid gap-3">
        <h2 className="h2">You</h2>
        <p className="hint">{a.email}</p>
        <ProfileForm fullName={a.profile.full_name} phone={a.profile.phone} wantsToRent={a.profile.wants_to_rent} />
      </section>
      <section className="card grid gap-2">
        <h2 className="h2">Verification</h2>
        <p style={{ fontSize: 14 }}>{TRUST[a.profile.trust_level]}</p>
        <p className="hint">Higher-value gear needs more checks. Verifying your ID with your phone is coming soon.</p>
      </section>
      {a.vendors.map((v) => (
        <section key={v.id} className="card grid gap-2">
          <h2 className="h2">{v.name}</h2>
          <p className="hint">{VENDOR_TYPES.find(([k]) => k === v.vendor_type)?.[1]} · {v.role === "owner" ? "Owner" : "Staff"}</p>
          <p style={{ fontSize: 14 }}>{v.approved_at ? "Approved: your gear is visible to renters." : "Waiting for Deloo's check. We'll call you."}</p>
        </section>
      ))}
    </div>
  );
}
