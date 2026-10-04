export const metadata = { title: "Offline · Deloo" };

export default function Offline() {
  return (
    <main className="solo">
      <div className="solo-top"><p className="wordmark">deloo<span className="dot">.</span></p></div>
      <div className="solo-main">
        <section className="solo-step">
          <h1 className="h1">You&apos;re offline</h1>
          <p className="hint" style={{ fontSize: 15 }}>Deloo needs a connection to load your brand kit and designs. Reconnect and try again.</p>
        </section>
      </div>
    </main>
  );
}
