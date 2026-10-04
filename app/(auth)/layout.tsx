export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="solo">
      <div className="solo-top"><p className="wordmark">deloo<span className="dot">.</span></p>{process.env.NODE_ENV === "development" && <span className="badge">Local dev</span>}</div>
      <div className="solo-main">{children}</div>
    </main>
  );
}
