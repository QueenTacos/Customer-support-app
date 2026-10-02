import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTicket } from "@/lib/data/tickets";
import { getLookups } from "@/lib/data/lookups";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/tickets/status-badge";
import { formatDateTime } from "@/lib/utils/dates";
import { ticketToForm } from "@/lib/validation/ticket";
import { EditTicketForm } from "./edit-form";

export const metadata: Metadata = { title: "Edit Ticket" };

export default async function EditTicketPage(props: PageProps<"/tickets/[id]/edit">) {
  const { id } = await props.params;
  const [ticket, lookups] = await Promise.all([getTicket(id), getLookups()]);
  if (!ticket) notFound();

  return (
    <>
      <Link href={`/tickets/${ticket.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Back to ticket
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">Edit Ticket #{ticket.ticket_number}</span>
            <StatusBadge status={ticket.status} />
          </span>
        }
        subtitle={`Last updated ${formatDateTime(ticket.updated_at)} · Every change is recorded in History.`}
      />
      <EditTicketForm
        ticketId={ticket.id}
        initial={ticketToForm(ticket)}
        updatedAt={ticket.updated_at}
        lookups={lookups}
      />
    </>
  );
}
