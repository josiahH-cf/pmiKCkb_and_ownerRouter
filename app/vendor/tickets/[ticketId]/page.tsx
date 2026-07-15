import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { VendorTestMailboxPanel } from "@/components/vendor/VendorTestMailboxPanel";
import { FirestoreVendorStore } from "@/lib/firestore/vendors";
import { requireAssignedTicket } from "@/lib/vendor/assignment";
import { getVendorSession } from "@/lib/vendor/auth";
import { VendorBoundaryError, type VendorTicketProjection } from "@/lib/vendor/model";

export default async function VendorTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/sign-in");
  let ticket: VendorTicketProjection;
  try {
    ticket = await requireAssignedTicket(
      principal,
      (await params).ticketId,
      new FirestoreVendorStore(),
    );
  } catch (error) {
    if (error instanceof VendorBoundaryError && error.status === 404) notFound();
    throw error;
  }
  return (
    <main className="content">
      <Link href="/vendor">Back to assigned tickets</Link>
      <p className="eyebrow">
        {ticket.status} · {ticket.priority}
      </p>
      <h1>{ticket.summary}</h1>
      <p>{ticket.unitLabel ?? "Unit details unavailable"}</p>
      {(principal.dataMode ?? "live") === "test" ? (
        <VendorTestMailboxPanel ticketId={ticket.id} />
      ) : (
        <article className="panel">
          <h2>Assigned-ticket Gmail</h2>
          <p>
            Live communication is restricted to this assigned ticket, the connected
            same-address mailbox, approved labels and drafts, and exact-confirmed replies.
          </p>
        </article>
      )}
    </main>
  );
}
