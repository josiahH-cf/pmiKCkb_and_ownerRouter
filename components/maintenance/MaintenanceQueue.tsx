"use client";

import { useEffect, useState } from "react";

import { WorkflowCommunicationPanel } from "@/components/gmail-hub/WorkflowCommunicationPanel";
import { MaintenanceOwnerNoticeDraftComposer } from "@/components/maintenance/MaintenanceOwnerNoticeDraftComposer";
import { ConfirmationDialog } from "@/components/ui";
import type { AssignableUser } from "@/lib/maintenance/assignee-model";
import {
  MAINTENANCE_ALLOWED_STATUS_TRANSITIONS,
  type MaintenanceTicketActivityRecord,
  type MaintenanceTicketRecord,
  type MaintenanceTicketStatus,
} from "@/lib/maintenance/ticket-model";

// Production renders only Live tickets. External effects remain separate exact-confirmed actions;
// this queue owns app-plane lifecycle bookkeeping only.
const STATUS_PILL: Record<MaintenanceTicketStatus, string> = {
  Open: "Needs Attention",
  "Waiting on Response": "Needs Attention",
  "Waiting on Vendor": "Needs Attention",
  Scheduled: "Scheduled",
  Closed: "Completed",
};

interface PendingTicketTransition {
  ticket: MaintenanceTicketRecord;
  kind: "close" | "reopen";
  nextStatus: MaintenanceTicketStatus;
}

export function MaintenanceQueue({
  initialTickets,
  unavailableNote,
  assignees = [],
  currentUid,
  canEdit = false,
  focusedTicketId,
}: Readonly<{
  initialTickets: MaintenanceTicketRecord[];
  unavailableNote?: string;
  assignees?: AssignableUser[];
  currentUid?: string;
  /** Whether the signed-in user may edit (drives the per-ticket owner-notice draft control). */
  canEdit?: boolean;
  focusedTicketId?: string;
}>) {
  const liveInitialTickets = initialTickets.filter(
    (ticket) => ticket.data_mode === "live",
  );
  const focusedTicket = liveInitialTickets.find(
    (ticket) => ticket.id === focusedTicketId,
  );
  const [tickets, setTickets] = useState(liveInitialTickets);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingTransition, setPendingTransition] =
    useState<PendingTicketTransition | null>(null);
  const [transitionReason, setTransitionReason] = useState("");
  const [transitionError, setTransitionError] = useState("");
  const [status, setStatus] = useState("");
  const [assignedToMe, setAssignedToMe] = useState(false);

  useEffect(() => {
    if (!focusedTicket) return;
    const element = document.getElementById(`maintenance-ticket-${focusedTicket.id}`);
    if (!element) return;
    element.focus();
    element.scrollIntoView?.({ block: "center" });
  }, [focusedTicket]);

  if (unavailableNote) {
    return (
      <section aria-label="Ticket queue" className="ui-stack">
        <h2 className="section-subtitle">Ticket queue</h2>
        <p className="muted">{unavailableNote}</p>
      </section>
    );
  }

  async function patch(
    ticketId: string,
    body: Record<string, unknown>,
  ): Promise<boolean> {
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
      if (response.ok && payload.ticket?.data_mode === "live") {
        const updated = payload.ticket;
        setTickets((previous) =>
          previous.map((ticket) => (ticket.id === updated.id ? updated : ticket)),
        );
        setStatus(
          body.op === "status" || body.op === "reopen"
            ? `Ticket updated to ${updated.status}.`
            : "Ticket updated.",
        );
        return true;
      } else {
        setStatus(payload.error ?? "Could not update the ticket.");
        return false;
      }
    } catch {
      setStatus("Could not reach the ticket service.");
      return false;
    } finally {
      setPendingId(null);
    }
  }

  function changeStatus(ticket: MaintenanceTicketRecord, next: MaintenanceTicketStatus) {
    if (next === ticket.status) return;
    if (next === "Closed") {
      setPendingTransition({ ticket, kind: "close", nextStatus: "Closed" });
      setTransitionReason("");
      setTransitionError("");
      return;
    }
    void patch(ticket.id, { op: "status", status: next });
  }

  function reopen(ticket: MaintenanceTicketRecord) {
    setPendingTransition({ ticket, kind: "reopen", nextStatus: "Open" });
    setTransitionReason("");
    setTransitionError("");
  }

  async function confirmTransition() {
    const transition = pendingTransition;
    const reason = transitionReason.trim();
    if (!transition || pendingId || !reason) return;
    setTransitionError("");
    const saved = await patch(
      transition.ticket.id,
      transition.kind === "close"
        ? { op: "status", status: transition.nextStatus, reason }
        : { op: "reopen", reason },
    );
    if (saved) {
      setPendingTransition(null);
      setTransitionReason("");
    } else {
      setTransitionError("The ticket was not changed. Review the message and try again.");
    }
  }

  function assign(ticket: MaintenanceTicketRecord, assigneeUid: string | null) {
    if ((ticket.assignee_uid ?? null) === assigneeUid) return;
    void patch(ticket.id, { op: "assign", assigneeUid });
  }

  const visible =
    assignedToMe && currentUid
      ? tickets.filter((ticket) => ticket.assignee_uid === currentUid)
      : tickets;
  const open = visible.filter((ticket) => ticket.status !== "Closed");
  const closed = visible.filter((ticket) => ticket.status === "Closed");
  const focusedTicketMissing = Boolean(focusedTicketId) && !focusedTicket;

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
      {focusedTicketMissing ? (
        <p className="form-error" role="alert">
          The linked maintenance ticket could not be found or is not available to you.
        </p>
      ) : null}
      {tickets.length > 0 && open.length === 0 && closed.length === 0 ? (
        <p className="muted">No tickets assigned to you.</p>
      ) : null}
      {open.map((ticket) => (
        <TicketCard
          key={ticket.id}
          assignees={assignees}
          canEdit={canEdit}
          onAssign={(assigneeUid) => assign(ticket, assigneeUid)}
          onNote={(text) => patch(ticket.id, { op: "note", text })}
          onReopen={() => reopen(ticket)}
          onStatus={(next) => changeStatus(ticket, next)}
          pending={pendingId === ticket.id}
          ticket={ticket}
        />
      ))}
      {closed.length > 0 ? (
        <details
          className="ui-stack"
          open={closed.some((ticket) => ticket.id === focusedTicketId) || undefined}
        >
          <summary>Closed ({closed.length})</summary>
          {closed.map((ticket) => (
            <TicketCard
              key={ticket.id}
              assignees={assignees}
              canEdit={canEdit}
              onAssign={(assigneeUid) => assign(ticket, assigneeUid)}
              onNote={(text) => patch(ticket.id, { op: "note", text })}
              onReopen={() => reopen(ticket)}
              onStatus={(next) => changeStatus(ticket, next)}
              pending={pendingId === ticket.id}
              ticket={ticket}
            />
          ))}
        </details>
      ) : null}
      <p aria-atomic="true" aria-live="polite" className="muted" role="status">
        {status}
      </p>
      <ConfirmationDialog
        busy={pendingId === pendingTransition?.ticket.id}
        busyLabel={
          pendingTransition?.kind === "reopen" ? "Reopening ticket" : "Closing ticket"
        }
        confirmDisabled={transitionReason.trim().length === 0}
        confirmLabel={
          pendingTransition?.kind === "reopen" ? "Reopen ticket" : "Close ticket"
        }
        confirmVariant={pendingTransition?.kind === "reopen" ? "primary" : "destructive"}
        description="This changes the ticket's tracked lifecycle state in PMI."
        error={transitionError}
        onCancel={() => {
          setPendingTransition(null);
          setTransitionReason("");
          setTransitionError("");
        }}
        onConfirm={() => void confirmTransition()}
        open={pendingTransition !== null}
        title={
          pendingTransition?.kind === "reopen"
            ? "Reopen maintenance ticket"
            : "Close maintenance ticket"
        }
      >
        {pendingTransition ? (
          <>
            <dl className="ui-confirmation-summary">
              <dt>Ticket</dt>
              <dd>{pendingTransition.ticket.summary}</dd>
              <dt>Ticket ID</dt>
              <dd>{pendingTransition.ticket.id}</dd>
              <dt>Current status</dt>
              <dd>{pendingTransition.ticket.status}</dd>
              <dt>Next status</dt>
              <dd>{pendingTransition.nextStatus}</dd>
            </dl>
            <label htmlFor="maintenance-ticket-transition-reason">
              Reason
              <textarea
                disabled={pendingId === pendingTransition.ticket.id}
                id="maintenance-ticket-transition-reason"
                onChange={(event) => setTransitionReason(event.target.value)}
                required
                rows={3}
                value={transitionReason}
              />
            </label>
          </>
        ) : null}
      </ConfirmationDialog>
    </section>
  );
}

function TicketCard({
  ticket,
  pending,
  assignees,
  canEdit,
  onStatus,
  onReopen,
  onAssign,
  onNote,
}: Readonly<{
  ticket: MaintenanceTicketRecord;
  pending: boolean;
  assignees: AssignableUser[];
  canEdit: boolean;
  onStatus: (next: MaintenanceTicketStatus) => void;
  onReopen: () => void;
  onAssign: (assigneeUid: string | null) => void;
  onNote: (text: string) => void;
}>) {
  const [note, setNote] = useState("");
  const assigneeOffRoster =
    Boolean(ticket.assignee_uid) &&
    !assignees.some((user) => user.uid === ticket.assignee_uid);

  return (
    <article
      className="panel maintenance-ticket"
      id={`maintenance-ticket-${ticket.id}`}
      tabIndex={-1}
    >
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
      <p>
        <span className="queue-pill" data-value="Scheduled">
          LIVE DATA
        </span>
      </p>
      {ticket.labels.length > 0 ? (
        <p className="muted">Labels: {ticket.labels.join(", ")}</p>
      ) : null}
      {ticket.closed_reason ? (
        <p className="muted">Closed: {ticket.closed_reason}</p>
      ) : null}
      <div className="field-row">
        {ticket.status === "Closed" ? (
          <div className="select-field">
            <span>Status</span>
            <strong>Closed</strong>
            <button
              className="secondary-button"
              disabled={pending}
              onClick={onReopen}
              type="button"
            >
              Reopen ticket
            </button>
          </div>
        ) : (
          <label className="select-field" htmlFor={`status-${ticket.id}`}>
            Status
            <select
              disabled={pending}
              id={`status-${ticket.id}`}
              onChange={(event) =>
                onStatus(event.target.value as MaintenanceTicketStatus)
              }
              value={ticket.status}
            >
              {[
                ticket.status,
                ...MAINTENANCE_ALLOWED_STATUS_TRANSITIONS[ticket.status],
              ].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}
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
      {ticket.vendor_id ? <p className="muted">A Live Vendor is assigned.</p> : null}
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
      <section className="ui-callout" aria-label="Live write boundary">
        <p>
          <strong>Live write boundary:</strong> each external action must show its exact
          action and target, then receive human confirmation through its configured
          provider gate.
        </p>
      </section>
      {canEdit ? <MaintenanceOwnerNoticeDraftComposer ticketRef={ticket.id} /> : null}
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
      return entry.text && entry.text !== "unassigned"
        ? "Assignment updated"
        : "Unassigned";
    case "vendor-assign":
      return entry.text === "assigned" ? "Vendor assigned" : "Vendor unassigned";
    case "label":
      return entry.text ? `Label ${entry.text}` : "Label updated";
    case "note":
      return entry.text ? `Note: ${entry.text}` : "Note added";
    default:
      return entry.action;
  }
}
