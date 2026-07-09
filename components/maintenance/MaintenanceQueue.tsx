"use client";

import { useState } from "react";
import {
  MAINTENANCE_TICKET_STATUSES,
  type MaintenanceTicketRecord,
  type MaintenanceTicketStatus,
} from "@/lib/firestore/maintenance-tickets";

// The staff ticket queue (console overhaul Slice E). Lists persisted tickets grouped Open-first, with
// one-change-per-action lifecycle transitions (status / note / close-with-reason). Closed tickets
// collapse. Read + app-plane transitions only; no system-of-record write, no send.
const STATUS_PILL: Record<MaintenanceTicketStatus, string> = {
  Open: "Ready for Approval",
  "Waiting on Response": "Needs Attention",
  "Waiting on Vendor": "Needs Attention",
  Scheduled: "Ready for Approval",
  Closed: "Approved",
};

export function MaintenanceQueue({
  initialTickets,
  unavailableNote,
}: Readonly<{ initialTickets: MaintenanceTicketRecord[]; unavailableNote?: string }>) {
  const [tickets, setTickets] = useState(initialTickets);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  if (unavailableNote) {
    return (
      <section aria-label="Ticket queue" className="ui-stack">
        <h2 className="section-subtitle">Ticket queue</h2>
        <p className="muted">{unavailableNote}</p>
      </section>
    );
  }

  async function patch(ticketId: string, body: Record<string, unknown>) {
    setPendingId(ticketId);
    setStatus("");
    try {
      const response = await fetch(
        `/api/maintenance/tickets/${encodeURIComponent(ticketId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        ticket?: MaintenanceTicketRecord;
        error?: string;
      };
      if (response.ok && payload.ticket) {
        const updated = payload.ticket;
        setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      } else {
        setStatus(payload.error ?? "Could not update the ticket.");
      }
    } finally {
      setPendingId(null);
    }
  }

  function changeStatus(ticket: MaintenanceTicketRecord, next: MaintenanceTicketStatus) {
    if (next === ticket.status) return;
    let reason: string | undefined;
    if (next === "Closed") {
      reason = window.prompt("Reason for closing this ticket?")?.trim() || undefined;
      if (!reason) {
        setStatus("A reason is required to close a ticket.");
        return;
      }
    }
    void patch(ticket.id, { op: "status", status: next, reason });
  }

  const open = tickets.filter((ticket) => ticket.status !== "Closed");
  const closed = tickets.filter((ticket) => ticket.status === "Closed");

  return (
    <section aria-label="Ticket queue" className="ui-stack">
      <h2 className="section-subtitle">Ticket queue</h2>
      {tickets.length === 0 ? (
        <p className="muted">
          No tickets yet. Build a work-order draft and create a ticket.
        </p>
      ) : null}
      {open.map((ticket) => (
        <TicketCard
          key={ticket.id}
          onNote={(text) => patch(ticket.id, { op: "note", text })}
          onStatus={(next) => changeStatus(ticket, next)}
          pending={pendingId === ticket.id}
          ticket={ticket}
        />
      ))}
      {closed.length > 0 ? (
        <details className="ui-stack">
          <summary>Closed ({closed.length})</summary>
          {closed.map((ticket) => (
            <TicketCard
              key={ticket.id}
              onNote={(text) => patch(ticket.id, { op: "note", text })}
              onStatus={(next) => changeStatus(ticket, next)}
              pending={pendingId === ticket.id}
              ticket={ticket}
            />
          ))}
        </details>
      ) : null}
      {status ? <p className="muted">{status}</p> : null}
    </section>
  );
}

function TicketCard({
  ticket,
  pending,
  onStatus,
  onNote,
}: Readonly<{
  ticket: MaintenanceTicketRecord;
  pending: boolean;
  onStatus: (next: MaintenanceTicketStatus) => void;
  onNote: (text: string) => void;
}>) {
  const [note, setNote] = useState("");

  return (
    <article className="panel maintenance-ticket">
      <div className="ui-spread">
        <div>
          <h3 className="ui-card-title">{ticket.summary}</h3>
          <p className="muted">
            {ticket.unit ? ticket.unit.label : "Unit unmatched"} · {ticket.priority}
            {ticket.priority_provenance === "auto-inferred" ? " (auto)" : ""}
          </p>
        </div>
        <span className="queue-pill" data-value={STATUS_PILL[ticket.status]}>
          {ticket.status}
        </span>
      </div>
      {ticket.labels.length > 0 ? (
        <p className="muted">Labels: {ticket.labels.join(", ")}</p>
      ) : null}
      {ticket.closed_reason ? (
        <p className="muted">Closed: {ticket.closed_reason}</p>
      ) : null}
      <div className="field-row">
        <label className="select-field" htmlFor={`status-${ticket.id}`}>
          Status
          <select
            disabled={pending}
            id={`status-${ticket.id}`}
            onChange={(event) => onStatus(event.target.value as MaintenanceTicketStatus)}
            value={ticket.status}
          >
            {MAINTENANCE_TICKET_STATUSES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row">
        <input
          aria-label={`Note for ${ticket.summary}`}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add a note"
          type="text"
          value={note}
        />
        <button
          className="secondary-button"
          disabled={pending || note.trim().length === 0}
          onClick={() => {
            onNote(note.trim());
            setNote("");
          }}
          type="button"
        >
          Add note
        </button>
      </div>
    </article>
  );
}
