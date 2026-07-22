import Link from "next/link";

import type { DataMode } from "@/lib/data-mode";
import type { VendorTicketProjection } from "@/lib/vendor/model";

export function VendorPortal({
  email,
  dataMode,
  tickets,
}: Readonly<{
  email: string;
  dataMode: DataMode;
  tickets: readonly VendorTicketProjection[];
}>) {
  const isTest = dataMode === "test";
  return (
    <main className="content">
      <p className="eyebrow">
        External Vendor portal{isTest ? " · Test workspace" : " · Live workspace"}
      </p>
      <h1>Assigned maintenance tickets</h1>
      <p className="muted">
        Signed in as {email}. Only tickets assigned to this Vendor account appear here.
      </p>
      {isTest ? (
        <article className="panel" role="status">
          <h2>Test data: external delivery is off</h2>
          <p>
            This non-routable Vendor identity exercises the real assigned-ticket and
            mailbox lifecycle. Every write stays in the production Test workspace and is
            marked ineligible as live-provider evidence.
          </p>
        </article>
      ) : null}
      {tickets.length === 0 ? (
        <article className="panel">
          <h2>No assigned tickets</h2>
          <p>
            Ask PMI KC to verify the assignment. Guessed or removed tickets stay hidden.
          </p>
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
        <h2>{isTest ? "Simulated assigned-ticket mailbox" : "Vendor Gmail"}</h2>
        {isTest ? (
          <p>
            Open an assigned ticket to draft, label, review, and confirm simulated
            replies. The Test provider is sandboxed from Gmail and OAuth.
          </p>
        ) : (
          <p>
            Live mailbox access is limited to assigned-ticket threads and the same address
            used for this verified-email, TOTP-authenticated Vendor session.
          </p>
        )}
      </article>
    </main>
  );
}
