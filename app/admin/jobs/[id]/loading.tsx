import { PageSkeleton } from "@/components/admin/skeleton";

export default function Loading() {
  return <PageSkeleton narrow blocks={3} label="Loading the job…" />;
}
