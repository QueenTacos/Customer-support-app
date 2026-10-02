import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Reports" };

export default async function Page() {
  await requireSession();
  return (
    <ComingSoon
      title="Reports"
      phase={5}
      description="Ticket, fault and resolution totals with date-range filters and CSV/Excel export."
    />
  );
}
