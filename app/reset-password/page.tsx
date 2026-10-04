import { SetPassword } from "@/app/welcome/set-password";

export const metadata = { title: "New password · Deloo" };

/** Where a "Forgot password?" email link lands (signed in by /auth/confirm). */
export default function ResetPassword() {
  return (
    <main className="solo">
      <div className="solo-top"><p className="wordmark">deloo<span className="dot">.</span></p></div>
      <div className="solo-main">
        <section className="solo-step">
          <p className="kicker">Almost done</p>
          <h1 className="h1">Choose a new password</h1>
          <p className="hint" style={{ fontSize: 15 }}>Use at least 8 characters. You&apos;ll stay signed in on this device.</p>
          <SetPassword />
        </section>
      </div>
    </main>
  );
}
