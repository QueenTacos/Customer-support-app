import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Templates" };

export default async function Page() {
  await requireSession();
  return (
    <ComingSoon
      title="Templates"
      phase={3}
      description="Create, edit, duplicate, archive, preview and copy templates with placeholders, with full version history and restore."
    />
  );
}
