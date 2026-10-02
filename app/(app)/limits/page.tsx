import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "LIMITS" };

export default async function Page() {
  await requireSession();
  return (
    <ComingSoon
      title="LIMITS"
      phase={3}
      description="Prepare LIMITS entries from ticket data with a required-fields checklist, a Copy button, Mark as Entered, and snapshots that later ticket edits can't change."
    />
  );
}
