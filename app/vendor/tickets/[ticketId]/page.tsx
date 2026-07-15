import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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
      <article className="panel">
        <h2>Communication</h2>
        <p>
          Assigned-thread communication appears only after the separately approved Vendor
          OAuth connection is active.
        </p>
      </article>
    </main>
  );
}
