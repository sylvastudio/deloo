/** Placeholder blocks while an admin page loads (the loading.tsx files under app/admin). */
function Bar({ w = "100%", h = 14 }: { w?: string | number; h?: number }) {
  return <span className="animate-pulse" style={{ display: "block", width: w, height: h, borderRadius: 6, background: "var(--line)" }} />;
}

export function PageSkeleton({ narrow, blocks = 3, label = "Loading…" }: { narrow?: boolean; blocks?: number; label?: string }) {
  return (
    <div className={`adm-page${narrow ? " narrow" : ""}`} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="grid gap-2" aria-hidden="true">
        <Bar w={120} h={12} />
        <Bar w={220} h={26} />
      </div>
      {Array.from({ length: blocks }, (_, i) => (
        <div key={i} className="card grid gap-2" aria-hidden="true">
          <Bar w="40%" h={16} />
          <Bar />
          <Bar w="85%" />
          <Bar w="60%" />
        </div>
      ))}
    </div>
  );
}
