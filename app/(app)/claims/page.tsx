import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Claims" };

export default async function Page() {
  await requireSession();
  return (
    <ComingSoon
      title="Claims"
      phase={3}
      description="Track FedEx/shipping claims (Damage, Loss/Missing, Late) from Needs Entry through Paid or Closed, linked to their tickets."
    />
  );
}
