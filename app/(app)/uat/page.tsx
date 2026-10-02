import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "UAT" };

export default async function Page() {
  await requireSession();
  return (
    <ComingSoon
      title="UAT"
      phase={4}
      description="Track UAT tests with Pass/Fail/Needs Retest status, a Failed Only filter, and a failed-tests email generator."
    />
  );
}
