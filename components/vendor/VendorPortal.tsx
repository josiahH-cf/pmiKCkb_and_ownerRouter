import Link from "next/link";

import type { VendorTicketProjection } from "@/lib/vendor/model";

export function VendorPortal({
  email,
  tickets,
}: Readonly<{
  email: string;
  tickets: readonly VendorTicketProjection[];
}>) {
  return (
    <main className="content">
      <p className="eyebrow">External Vendor portal · Live workspace</p>
      <h1>Assigned maintenance tickets</h1>
      <p className="muted">Signed in as {email}. Assigned tickets only.</p>
      {tickets.length === 0 ? (
        <article className="panel">
          <h2>No assigned tickets</h2>
          <p>Ask PMI KC to confirm your assignment.</p>
        </article>
      ) : (
        <div className="card-grid">
          {tickets.map((ticket) => (
            <article className="panel" key={ticket.id}>
              <p className="eyebrow">
                {ticket.status} · {ticket.priority}
              </p>
              <h2>{ticket.summary}</h2>
              <p>{ticket.unitLabel ?? "Unit details unavailable"}</p>
              <Link href={`/vendor/tickets/${encodeURIComponent(ticket.id)}`}>
                Open assigned ticket
              </Link>
            </article>
          ))}
        </div>
      )}
      <article className="panel">
        <h2>Vendor Gmail</h2>
        <p>
          Assigned-ticket threads only, using this session&apos;s verified email and
          authenticator.
        </p>
      </article>
    </main>
  );
}
