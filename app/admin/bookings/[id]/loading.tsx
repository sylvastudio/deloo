import { PageSkeleton } from "@/components/admin/skeleton";

export default function Loading() {
  return <PageSkeleton blocks={4} label="Loading the booking…" />;
}
