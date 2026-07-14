"use client";

import { useState } from "react";
import { WorkflowCommunicationPanel } from "@/components/gmail-hub/WorkflowCommunicationPanel";
import type { AssignableUser } from "@/lib/maintenance/assignee-model";
import {
  MAINTENANCE_TICKET_STATUSES,
  type MaintenanceTicketActivityRecord,
  type MaintenanceTicketRecord,
  type MaintenanceTicketStatus,
} from "@/lib/maintenance/ticket-model";

// The staff ticket queue (console overhaul Slice E). Lists persisted tickets grouped Open-first, with
// one-change-per-action lifecycle transitions (status / note / close-with-reason). Closed tickets
// collapse. Read + app-plane transitions only; no system-of-record write, no send.
//
// Color-tone bucket per status (drives the queue-pill accent). Maintenance-accurate vocabulary — the
// renewal/approval words ("Ready for Approval" / "Approved") that leaked in from the renewal queue are
// gone; the visible pill text is always the real ticket status.
const STATUS_PILL: Record<MaintenanceTicketStatus, string> = {
  Open: "Needs Attention",
  "Waiting on Response": "Needs Attention",
  "Waiting on Vendor": "Needs Attention",
  Scheduled: "Scheduled",
  Closed: "Completed",
};

export function MaintenanceQueue({
  initialTickets,
  unavailableNote,
  assignees = [],
  currentUid,
}: Readonly<{
  initialTickets: MaintenanceTicketRecord[];
  unavailableNote?: string;
  assignees?: AssignableUser[];
  currentUid?: string;
}>) {
  const [tickets, setTickets] = useState(initialTickets);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [assignedToMe, setAssignedToMe] = useState(false);

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

  function assign(ticket: MaintenanceTicketRecord, assigneeUid: string | null) {
    // No-op guard: re-selecting the current assignee would emit a redundant Activity row.
    if ((ticket.assignee_uid ?? null) === assigneeUid) return;
    void patch(ticket.id, { op: "assign", assigneeUid });
  }

  // "Assigned to me" is an app-plane view filter (there is no per-user security rule for maintenance
  // tickets); it hides tickets not assigned to the signed-in user. Disabled when we don't know the uid.
  const visible =
    assignedToMe && currentUid
      ? tickets.filter((ticket) => ticket.assignee_uid === currentUid)
      : tickets;
  const open = visible.filter((ticket) => ticket.status !== "Closed");
  const closed = visible.filter((ticket) => ticket.status === "Closed");

  return (
    <section aria-label="Ticket queue" className="ui-stack">
      <div className="ui-spread">
        <h2 className="section-subtitle">Ticket queue</h2>
        {currentUid ? (
          <label className="ui-row">
            <input
              checked={assignedToMe}
              onChange={(event) => setAssignedToMe(event.target.checked)}
              type="checkbox"
            />
            Assigned to me
          </label>
        ) : null}
      </div>
      {tickets.length === 0 ? (
        <p className="muted">
          No tickets yet. Build a work-order draft and create a ticket.
        </p>
      ) : null}
      {tickets.length > 0 && open.length === 0 && closed.length === 0 ? (
        <p className="muted">No tickets assigned to you.</p>
      ) : null}
      {open.map((ticket) => (
        <TicketCard
          key={ticket.id}
          assignees={assignees}
          onAssign={(assigneeUid) => assign(ticket, assigneeUid)}
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
              assignees={assignees}
              onAssign={(assigneeUid) => assign(ticket, assigneeUid)}
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
  assignees,
  onStatus,
  onAssign,
  onNote,
}: Readonly<{
  ticket: MaintenanceTicketRecord;
  pending: boolean;
  assignees: AssignableUser[];
  onStatus: (next: MaintenanceTicketStatus) => void;
  onAssign: (assigneeUid: string | null) => void;
  onNote: (text: string) => void;
}>) {
  const [note, setNote] = useState("");
  // The current assignee may be a real user not in the (demo) roster; show a value-free "outside roster"
  // option for it rather than leaking the raw uid, preserving the queue's no-uid-on-screen invariant.
  const assigneeOffRoster =
    Boolean(ticket.assignee_uid) &&
    !assignees.some((user) => user.uid === ticket.assignee_uid);

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
        <label className="select-field" htmlFor={`assignee-${ticket.id}`}>
          Assignee
          <select
            disabled={pending}
            id={`assignee-${ticket.id}`}
            onChange={(event) =>
              onAssign(event.target.value === "" ? null : event.target.value)
            }
            value={ticket.assignee_uid ?? ""}
          >
            <option value="">Unassigned</option>
            {assigneeOffRoster ? (
              <option value={ticket.assignee_uid}>Assigned (outside roster)</option>
            ) : null}
            {assignees.map((user) => (
              <option key={user.uid} value={user.uid}>
                {user.email}
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
      <TicketHistory ticketId={ticket.id} />
      <WorkflowCommunicationPanel
        canLink
        entityId={ticket.id}
        entityType="maintenance_ticket"
        lane="maintenance"
        purpose="maintenance_owner"
      />
    </article>
  );
}

// Collapsible per-ticket lifecycle trail. Fetches the append-only activity on first expand from the
// read-gated activity route; renders it plainly. Read-only — surfaces existing history, never mutates.
function TicketHistory({ ticketId }: Readonly<{ ticketId: string }>) {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activity, setActivity] = useState<MaintenanceTicketActivityRecord[]>([]);
  const [error, setError] = useState("");

  async function load() {
    if (loaded || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/maintenance/tickets/${encodeURIComponent(ticketId)}/activity`,
      );
      const payload = (await response.json().catch(() => ({}))) as {
        activity?: MaintenanceTicketActivityRecord[];
        error?: string;
      };
      if (response.ok && payload.activity) {
        setActivity(payload.activity);
        setLoaded(true);
      } else {
        setError(payload.error ?? "Could not load history.");
      }
    } catch {
      // Network failure (fetch rejected) — surface it rather than leaving an unhandled rejection.
      setError("Could not load history.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <details
      className="ui-stack maintenance-history"
      onToggle={(event) => {
        if ((event.target as HTMLDetailsElement).open) void load();
      }}
    >
      <summary>History</summary>
      {loading ? <p className="muted">Loading history…</p> : null}
      {error ? <p className="muted">{error}</p> : null}
      {loaded && activity.length === 0 ? (
        <p className="muted">No activity recorded yet.</p>
      ) : null}
      {activity.length > 0 ? (
        <ul className="maintenance-history-list">
          {activity.map((entry) => (
            <li key={entry.id}>
              <span className="muted">{formatHistoryStamp(entry.created_at)}</span>{" "}
              {describeActivity(entry)}
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

// Deterministic, locale-stable ISO render (date + HH:MM) so the trail reads the same everywhere.
function formatHistoryStamp(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

function describeActivity(entry: MaintenanceTicketActivityRecord): string {
  switch (entry.action) {
    case "create":
      return "Ticket created";
    case "status":
      return `Status set to ${entry.new_status ?? "updated"}`;
    case "close":
      return entry.text ? `Closed: ${entry.text}` : "Closed";
    case "reopen":
      return "Reopened";
    case "assign":
      // entry.text is a raw uid (not a display name) or "unassigned" — don't render it as a name.
      return entry.text && entry.text !== "unassigned"
        ? "Assignment updated"
        : "Unassigned";
    case "label":
      return entry.text ? `Label ${entry.text}` : "Label updated";
    case "note":
      return entry.text ? `Note: ${entry.text}` : "Note added";
    default:
      return entry.action;
  }
}
