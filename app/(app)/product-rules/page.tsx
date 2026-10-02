import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Product Rules" };

export default async function Page() {
  await requireSession();
  return (
    <ComingSoon
      title="Product Rules"
      phase={4}
      description="Editable Pantone and contour-cut availability rules, materials management, and warnings on tickets that conflict with a rule."
    />
  );
}
