import { ImportJobsView } from "@/components/marine/ImportJobsView";

// Super-admin gating comes from ../layout.tsx, which covers this whole subtree.
export const dynamic = "force-dynamic";

export default function ImportJobsPage() {
  return <ImportJobsView />;
}
