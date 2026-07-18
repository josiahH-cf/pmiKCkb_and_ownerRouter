"use client";

import { useEffect, useState } from "react";
import { WorkflowCommunicationPanel } from "@/components/gmail-hub/WorkflowCommunicationPanel";
import type { AssignableUser } from "@/lib/maintenance/assignee-model";
import {
  MAINTENANCE_ALLOWED_STATUS_TRANSITIONS,
  type MaintenanceTicketActivityRecord,
  type MaintenanceTicketRecord,
  type MaintenanceTicketStatus,
} from "@/lib/maintenance/ticket-model";
import {
  MAINTENANCE_TEST_ACTIONS,
  MAINTENANCE_TEST_ACTION_TARGETS,
  MAINTENANCE_TEST_CONFIRMATION,
  MAINTENANCE_TEST_VENDOR,
  maintenanceTestBusinessCloseoutBoundary,
  type MaintenanceTestActionKey,
  type MaintenanceTestActionReceipt,
} from "@/lib/maintenance/test-workflow";

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
  initialTestReceipts = [],
  focusedTicketId,
}: Readonly<{
  initialTickets: MaintenanceTicketRecord[];
  unavailableNote?: string;
  assignees?: AssignableUser[];
  currentUid?: string;
  initialTestReceipts?: MaintenanceTestActionReceipt[];
  focusedTicketId?: string;
}>) {
  const focusedTicket = initialTickets.find((ticket) => ticket.id === focusedTicketId);
  const [tickets, setTickets] = useState(initialTickets);
  const [testReceipts, setTestReceipts] = useState(initialTestReceipts);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [dataFilter, setDataFilter] = useState<"all" | "live" | "test">(
    focusedTicket?.data_mode ?? "all",
  );
  const [seedPending, setSeedPending] = useState(false);

  useEffect(() => {
    if (!focusedTicketId) return;
    const element = document.getElementById(`maintenance-ticket-${focusedTicketId}`);
    if (!element) return;
    element.focus();
    element.scrollIntoView?.({ block: "center" });
  }, [focusedTicketId]);

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

  function reopen(ticket: MaintenanceTicketRecord) {
    const reason = window.prompt("Reason for reopening this ticket?")?.trim();
    if (!reason) {
      setStatus("A reason is required to reopen a ticket.");
      return;
    }
    void patch(ticket.id, { op: "reopen", reason });
  }

  function assign(ticket: MaintenanceTicketRecord, assigneeUid: string | null) {
    // No-op guard: re-selecting the current assignee would emit a redundant Activity row.
    if ((ticket.assignee_uid ?? null) === assigneeUid) return;
    void patch(ticket.id, { op: "assign", assigneeUid });
  }

  function assignVendor(ticket: MaintenanceTicketRecord, vendorId: string | null) {
    if ((ticket.vendor_id ?? null) === vendorId) return;
    void patch(ticket.id, { op: "vendor-assign", vendorId });
  }

  async function createTestTicket() {
    setSeedPending(true);
    setStatus("");
    try {
      const response = await fetch("/api/maintenance/tickets/test-seed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: "plumbing" }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ticket?: MaintenanceTicketRecord;
        error?: string;
      };
      if (response.ok && payload.ticket) {
        setTickets((previous) => [payload.ticket!, ...previous]);
        setDataFilter("test");
        setStatus(
          "Test ticket created. It is stored in this app and clearly labeled TEST DATA.",
        );
      } else {
        setStatus(payload.error ?? "Could not create the Test ticket.");
      }
    } catch {
      setStatus("Could not reach the Test ticket service.");
    } finally {
      setSeedPending(false);
    }
  }

  // "Assigned to me" is an app-plane view filter (there is no per-user security rule for maintenance
  // tickets); it hides tickets not assigned to the signed-in user. Disabled when we don't know the uid.
  const modeVisible =
    dataFilter === "all"
      ? tickets
      : tickets.filter((ticket) => ticket.data_mode === dataFilter);
  const visible =
    assignedToMe && currentUid
      ? modeVisible.filter((ticket) => ticket.assignee_uid === currentUid)
      : modeVisible;
  const open = visible.filter((ticket) => ticket.status !== "Closed");
  const closed = visible.filter((ticket) => ticket.status === "Closed");
  const focusedTicketMissing =
    Boolean(focusedTicketId) && !tickets.some((ticket) => ticket.id === focusedTicketId);

  return (
    <section aria-label="Ticket queue" className="ui-stack">
      <section className="ui-callout ui-stack" aria-label="Maintenance Test workspace">
        <div className="ui-spread">
          <div>
            <h2 className="section-subtitle">Production Test workspace</h2>
            <p className="muted">
              Create an invented plumbing ticket, assign the invented Test Vendor, move it
              through the full lifecycle, and issue internal simulation receipts. No Test
              action contacts an external provider or counts as Live proof.
            </p>
          </div>
          <button
            className="secondary-button"
            disabled={seedPending}
            onClick={() => void createTestTicket()}
            type="button"
          >
            {seedPending ? "Creating Test ticket…" : "Create Test ticket"}
          </button>
        </div>
      </section>
      <div className="ui-spread">
        <h2 className="section-subtitle">Ticket queue</h2>
        <div className="ui-row">
          <label className="select-field" htmlFor="maintenance-data-filter">
            Data
            <select
              id="maintenance-data-filter"
              onChange={(event) =>
                setDataFilter(event.target.value as "all" | "live" | "test")
              }
              value={dataFilter}
            >
              <option value="all">All data</option>
              <option value="live">Live only</option>
              <option value="test">Test only</option>
            </select>
          </label>
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
          onAssign={(assigneeUid) => assign(ticket, assigneeUid)}
          onVendorAssign={(vendorId) => assignVendor(ticket, vendorId)}
          onNote={(text) => patch(ticket.id, { op: "note", text })}
          onStatus={(next) => changeStatus(ticket, next)}
          onReopen={() => reopen(ticket)}
          pending={pendingId === ticket.id}
          receipts={testReceipts.filter((receipt) => receipt.ticket_id === ticket.id)}
          onReceipt={(receipt) =>
            setTestReceipts((previous) => [
              ...previous.filter((existing) => existing.id !== receipt.id),
              receipt,
            ])
          }
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
              onAssign={(assigneeUid) => assign(ticket, assigneeUid)}
              onVendorAssign={(vendorId) => assignVendor(ticket, vendorId)}
              onNote={(text) => patch(ticket.id, { op: "note", text })}
              onStatus={(next) => changeStatus(ticket, next)}
              onReopen={() => reopen(ticket)}
              pending={pendingId === ticket.id}
              receipts={testReceipts.filter((receipt) => receipt.ticket_id === ticket.id)}
              onReceipt={(receipt) =>
                setTestReceipts((previous) => [
                  ...previous.filter((existing) => existing.id !== receipt.id),
                  receipt,
                ])
              }
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
  onReopen,
  onAssign,
  onVendorAssign,
  onNote,
  receipts,
  onReceipt,
}: Readonly<{
  ticket: MaintenanceTicketRecord;
  pending: boolean;
  assignees: AssignableUser[];
  onStatus: (next: MaintenanceTicketStatus) => void;
  onReopen: () => void;
  onAssign: (assigneeUid: string | null) => void;
  onVendorAssign: (vendorId: string | null) => void;
  onNote: (text: string) => void;
  receipts: MaintenanceTestActionReceipt[];
  onReceipt: (receipt: MaintenanceTestActionReceipt) => void;
}>) {
  const [note, setNote] = useState("");
  // The current assignee may be a real user not in the (demo) roster; show a value-free "outside roster"
  // option for it rather than leaking the raw uid, preserving the queue's no-uid-on-screen invariant.
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
          {ticket.data_mode === "test" && ticket.status === "Closed"
            ? "App ticket closed"
            : ticket.status}
        </span>
      </div>
      <p>
        <span
          className="queue-pill"
          data-value={ticket.data_mode === "test" ? "Needs Attention" : "Scheduled"}
        >
          {ticket.data_mode === "test" ? "TEST DATA" : "LIVE DATA"}
        </span>
      </p>
      {ticket.labels.length > 0 ? (
        <p className="muted">Labels: {ticket.labels.join(", ")}</p>
      ) : null}
      {ticket.closed_reason ? (
        <p className="muted">
          {ticket.data_mode === "test" ? "App ticket closed" : "Closed"}:{" "}
          {ticket.closed_reason}
        </p>
      ) : null}
      <div className="field-row">
        {ticket.status === "Closed" ? (
          <div className="select-field">
            <span>Status</span>
            <strong>
              {ticket.data_mode === "test" ? "App ticket closed" : "Closed"}
            </strong>
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
      {ticket.data_mode === "test" ? (
        <section className="ui-callout ui-stack" aria-label="Test Vendor assignment">
          <p>
            <strong>Test Vendor:</strong>{" "}
            {ticket.vendor_id === MAINTENANCE_TEST_VENDOR.id
              ? `${MAINTENANCE_TEST_VENDOR.label} (${MAINTENANCE_TEST_VENDOR.email})`
              : "Unassigned"}
          </p>
          <button
            className="secondary-button"
            disabled={pending}
            onClick={() =>
              onVendorAssign(
                ticket.vendor_id === MAINTENANCE_TEST_VENDOR.id
                  ? null
                  : MAINTENANCE_TEST_VENDOR.id,
              )
            }
            type="button"
          >
            {ticket.vendor_id === MAINTENANCE_TEST_VENDOR.id
              ? "Unassign Test Vendor"
              : `Assign ${MAINTENANCE_TEST_VENDOR.label}`}
          </button>
        </section>
      ) : ticket.vendor_id ? (
        <p className="muted">A Live Vendor is assigned.</p>
      ) : null}
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
      {ticket.data_mode === "test" ? (
        <>
          <MaintenanceTestActions
            onReceipt={onReceipt}
            receipts={receipts}
            ticket={ticket}
          />
          <MaintenanceBusinessCloseoutPanel receipts={receipts} />
        </>
      ) : (
        <section className="ui-callout" aria-label="Live write boundary">
          <p>
            <strong>Live write boundary:</strong> each external action must show its exact
            action and target, then receive human confirmation through its configured
            provider gate. Test simulation is unavailable for this record.
          </p>
        </section>
      )}
      {ticket.data_mode === "live" ? (
        <WorkflowCommunicationPanel
          canLink
          entityId={ticket.id}
          entityType="maintenance_ticket"
          lane="maintenance"
          purpose="maintenance_owner"
        />
      ) : (
        <section className="ui-callout" aria-label="Test communication boundary">
          <p>
            <strong>Test communication:</strong> simulated owner and Vendor actions stay
            inside this Test ticket and the assigned Test Vendor portal. No Live Gmail
            thread can be loaded, linked, drafted, labeled, or sent from Test data.
          </p>
        </section>
      )}
    </article>
  );
}

function MaintenanceBusinessCloseoutPanel({
  receipts,
}: Readonly<{ receipts: MaintenanceTestActionReceipt[] }>) {
  const boundary = maintenanceTestBusinessCloseoutBoundary(receipts);
  return (
    <section
      aria-label="Maintenance business closeout evidence gates"
      className="ui-callout ui-stack"
    >
      <div>
        <h4>Business closeout evidence gates</h4>
        <p className="muted">
          Test ticket status and real-world completion are separate. Closing an invented
          Test ticket cannot prove business closeout.
        </p>
      </div>
      <ul className="compact-list">
        {boundary.gates.map((gate) => (
          <li key={gate.id}>
            <strong>{gate.label}</strong> —{" "}
            {gate.outcome === "internal_simulation_only"
              ? `${gate.internalTestReceiptCount} of ${gate.internalTestReceiptTotal} internal Test receipts; business proof not established.`
              : gate.outcome === "test_evidence_incomplete"
                ? `${gate.internalTestReceiptCount} of ${gate.internalTestReceiptTotal} internal Test receipts; Test evidence incomplete and business proof not established.`
                : "No owning Test milestone; business proof not established."}
          </li>
        ))}
      </ul>
      <p>
        <strong>Business closeout:</strong> Not proven · diagnosis, approvals, physical
        completion, invoice disposition, and stakeholder notices remain on their owning
        records.
      </p>
    </section>
  );
}

function MaintenanceTestActions({
  ticket,
  receipts,
  onReceipt,
}: Readonly<{
  ticket: MaintenanceTicketRecord;
  receipts: MaintenanceTestActionReceipt[];
  onReceipt: (receipt: MaintenanceTestActionReceipt) => void;
}>) {
  const [actionKey, setActionKey] = useState<MaintenanceTestActionKey>(
    MAINTENANCE_TEST_ACTIONS[0],
  );
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const completedReceipt = receipts.find((receipt) => receipt.action_key === actionKey);

  async function simulate() {
    if (!confirmed || pending || completedReceipt) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/maintenance/tickets/${encodeURIComponent(ticket.id)}/test-actions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            actionKey,
            confirmation: MAINTENANCE_TEST_CONFIRMATION,
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        receipt?: MaintenanceTestActionReceipt;
        error?: string;
      };
      if (response.ok && payload.receipt) {
        onReceipt(payload.receipt);
        setConfirmed(false);
        setMessage("Internal Test receipt recorded. No external provider was contacted.");
      } else {
        setMessage(payload.error ?? "Could not record the Test action.");
      }
    } catch {
      setMessage("Could not reach the Test action service.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="ui-callout ui-stack" aria-label="Test external action simulator">
      <h4>Explicit Test action</h4>
      <label className="select-field" htmlFor={`test-action-${ticket.id}`}>
        Action
        <select
          id={`test-action-${ticket.id}`}
          onChange={(event) =>
            setActionKey(event.target.value as MaintenanceTestActionKey)
          }
          value={actionKey}
        >
          {MAINTENANCE_TEST_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {action}
              {receipts.some((receipt) => receipt.action_key === action)
                ? " — recorded"
                : ""}
            </option>
          ))}
        </select>
      </label>
      <p>
        <strong>Target:</strong> {MAINTENANCE_TEST_ACTION_TARGETS[actionKey]}
      </p>
      <p className="muted">
        Result: internal simulated-success receipt only. Provider contacted: No. Live
        proof eligible: No.
      </p>
      <label className="ui-row">
        <input
          checked={confirmed}
          disabled={Boolean(completedReceipt)}
          onChange={(event) => setConfirmed(event.target.checked)}
          type="checkbox"
        />
        I confirm this exact Test action and target.
      </label>
      <button
        className="secondary-button"
        disabled={!confirmed || pending || Boolean(completedReceipt)}
        onClick={() => void simulate()}
        type="button"
      >
        {completedReceipt
          ? "Test action recorded"
          : pending
            ? "Recording…"
            : "Run Test action"}
      </button>
      {completedReceipt ? (
        <p className="muted">
          This exact Test action already has its one idempotent receipt. Repeating it
          cannot create another simulated effect.
        </p>
      ) : null}
      {message ? <p className="muted">{message}</p> : null}
      {receipts.length > 0 ? (
        <details>
          <summary>Test receipts ({receipts.length})</summary>
          <ul>
            {receipts.map((receipt) => (
              <li key={receipt.id}>
                {receipt.action_key} → {receipt.target_label} — simulated; no provider
                contacted; not Live proof
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
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
    case "vendor-assign":
      return entry.text === "assigned" ? "Vendor assigned" : "Vendor unassigned";
    case "test-action":
      return entry.text ? `Test action recorded: ${entry.text}` : "Test action recorded";
    case "label":
      return entry.text ? `Label ${entry.text}` : "Label updated";
    case "note":
      return entry.text ? `Note: ${entry.text}` : "Note added";
    default:
      return entry.action;
  }
}
