import { Skeleton } from "./ui/layout";

/** Placeholder while an admin page loads (the loading.tsx files under app/admin): a head and rows. */
export function PageSkeleton({ narrow, blocks = 3, label = "Loading…" }: { narrow?: boolean; blocks?: number; label?: string }) {
  return (
    <div className={`adm-page${narrow ? " narrow" : ""}`} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="grid gap-2" aria-hidden="true">
        <Skeleton w={110} h={12} />
        <Skeleton w={240} h={26} />
      </div>
      {Array.from({ length: blocks }, (_, i) => (
        <div key={i} className="grid gap-3" aria-hidden="true">
          <Skeleton w="30%" h={15} />
          <Skeleton h={36} />
          <Skeleton h={36} />
          <Skeleton w="80%" h={36} />
        </div>
      ))}
    </div>
  );
}
