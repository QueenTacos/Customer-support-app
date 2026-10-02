import type { Metadata } from "next";
import { getLookups } from "@/lib/data/lookups";
import { getSettings } from "@/lib/data/settings";
import { addDaysISO, todayISO } from "@/lib/utils/dates";
import { PageHeader } from "@/components/ui/page-header";
import { NewTicketWizard } from "./wizard";

export const metadata: Metadata = { title: "New Ticket" };

export default async function NewTicketPage() {
  const [lookups, settings] = await Promise.all([getLookups(), getSettings()]);
  const today = todayISO();
  const defaultFollowUp =
    settings.default_follow_up_days === null ? "" : addDaysISO(today, settings.default_follow_up_days);

  return (
    <>
      <PageHeader title="New Ticket" subtitle="Capture the call step by step. Nothing is saved until you press Save Ticket." />
      <NewTicketWizard lookups={lookups} today={today} defaultFollowUp={defaultFollowUp} />
    </>
  );
}
