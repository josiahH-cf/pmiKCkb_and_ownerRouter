"use client";
import { MaintenanceVendorWorkPanel } from "./MaintenanceVendorWorkPanel";
import { MaintenanceReviews } from "./MaintenanceReviews";
import { MaintenanceCaseFactsPanel } from "./MaintenanceCaseFactsPanel";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { MaintenanceLifecyclePanel } from "./MaintenanceLifecyclePanel";
import { useMaintenanceEdits } from "./useMaintenanceEdits";
import { maintenanceAging } from "@/lib/maintenance/lifecycle";
import {
  PersonalViewStatus,
  usePersonalFilters,
} from "@/components/layout/PersonalViewProvider";

import { formatBusinessTimestamp } from "@/lib/date-display";
import { useEffect, useState } from "react";

import { WorkflowCommunicationPanel } from "@/components/gmail-hub/WorkflowCommunicationPanel";
import { MaintenanceOwnerNoticeDraftComposer } from "@/components/maintenance/MaintenanceOwnerNoticeDraftComposer";
import { OrdinaryRentvineWorkOrderPanel } from "@/components/maintenance/OrdinaryRentvineWorkOrderPanel";
import { WorkOrderChatPanel } from "@/components/maintenance/WorkOrderChatPanel";
import { useMaintenanceTicketState } from "./MaintenanceTicketProvider";
import { projectMaintenanceWaitingOn } from "@/lib/maintenance/waiting-on";
import type { AssignableUser } from "@/lib/maintenance/assignee-model";
import {
  formatPreapprovalAmount,
  parsePreapprovalAmountCents,
} from "@/lib/maintenance/property-preapproval";
import {
  MAINTENANCE_WAITING_ON,
  MAINTENANCE_WAITING_ON_LABELS,
  type MaintenanceProviderStatusConflict,
  type MaintenanceWaitingOn,
  type MaintenanceWaitingOnProjection,
} from "@/lib/maintenance/waiting-on";
import {
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

export function MaintenanceQueue({
  initialTickets,
  waitingOn = {},
  statusConflicts = {},
  unavailableNote,
  assignees = [],
  currentUid,
  canEdit = false,
  focusedTicketId,
}: Readonly<{
  initialTickets: MaintenanceTicketRecord[];
  /** S108: the server-projected blocker per ticket id. Absent means the projection is unavailable. */
  waitingOn?: Readonly<Record<string, MaintenanceWaitingOnProjection>>;
  /** S108: the app-versus-RentVine status comparison per ticket id, shown but never resolved here. */
  statusConflicts?: Readonly<Record<string, MaintenanceProviderStatusConflict>>;
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
  const [localTickets, setLocalTickets] = useState(liveInitialTickets),
    shared = useMaintenanceTicketState();
  const tickets = shared?.tickets ?? localTickets,
    setTickets = shared?.setTickets ?? setLocalTickets;
  const focusedTicket = tickets.find((ticket) => ticket.id === focusedTicketId);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [agingOnly, setAgingOnly] = useState(false);
  const edits = useMaintenanceEdits(currentUid, tickets, (updated) =>
    setTickets((previous) =>
      previous.some((t) => t.id === updated.id)
        ? previous.map((t) =>
            t.id === updated.id &&
            (t.record_version ?? 0) <= (updated.record_version ?? 0)
              ? updated
              : t,
          )
        : [updated, ...previous],
    ),
  );
  const patch = edits.apply;
  const [viewFilters, setViewFilters, resetView] = usePersonalFilters(
    "maintenance-queue",
    { assignee: "", waiting: "all" },
  );
  const assignedToMe = viewFilters.assignee === "mine";
  const waitingFilter: MaintenanceWaitingOn | "all" = MAINTENANCE_WAITING_ON.includes(
    viewFilters.waiting as MaintenanceWaitingOn,
  )
    ? (viewFilters.waiting as MaintenanceWaitingOn)
    : "all";
  const setAssignedToMe = (value: boolean) =>
    setViewFilters((current) => ({ ...current, assignee: value ? "mine" : "" }));
  const setWaitingFilter = (value: MaintenanceWaitingOn | "all") =>
    setViewFilters((current) => ({ ...current, waiting: value }));

  useEffect(() => {
    if (!focusedTicket) return;
    const element = document.getElementById(`maintenance-ticket-${focusedTicket.id}`);
    if (!element) return;
    element.focus();
    element.scrollIntoView?.({ block: "center" });
  }, [focusedTicket]);

  if (unavailableNote && tickets.length === 0) {
    return (
      <section aria-label="Ticket queue" className="ui-stack">
        <h2 className="section-subtitle">Ticket queue</h2>
        <p className="muted">{unavailableNote}</p>
      </section>
    );
  }

  function assign(ticket: MaintenanceTicketRecord, assigneeUid: string | null) {
    if ((ticket.assignee_uid ?? null) === assigneeUid) return;
    void patch(ticket.id, { op: "assign", assigneeUid });
  }

  const mine =
    assignedToMe && currentUid
      ? tickets.filter((ticket) => ticket.assignee_uid === currentUid)
      : tickets;
  const byWaiting =
    waitingFilter === "all"
      ? mine
      : mine.filter(
          (ticket) =>
            (
              waitingOn[ticket.id] ??
              projectMaintenanceWaitingOn({ ticket, link: null, preapproval: null })
            ).waitingOn === waitingFilter,
        );
  const visible = agingOnly
    ? byWaiting.filter((t) => maintenanceAging(t).aging)
    : byWaiting;
  const open = visible.filter((ticket) => ticket.status !== "Closed");
  const closed = visible.filter((ticket) => ticket.status === "Closed");
  const focusedTicketMissing = Boolean(focusedTicketId) && !focusedTicket;
  const created = tickets.find((t) => t.id === shared?.createdId),
    outside = created && !visible.some((t) => t.id === created.id),
    revealed = outside && revealedId === created.id ? created : null;

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
        <label className="ui-row">
          Waiting on
          <select
            aria-label="Waiting on filter"
            onChange={(event) =>
              setWaitingFilter(event.target.value as MaintenanceWaitingOn | "all")
            }
            value={waitingFilter}
          >
            <option value="all">Everything</option>
            {MAINTENANCE_WAITING_ON.map((value) => (
              <option key={value} value={value}>
                {MAINTENANCE_WAITING_ON_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        <input
          type="checkbox"
          checked={agingOnly}
          onChange={(e) => setAgingOnly(e.target.checked)}
        />
        Unresolved at least three calendar days
      </label>
      <div className="ui-actions">
        <PersonalViewStatus surface="maintenance-queue" />
        <button
          className="text-link"
          type="button"
          onClick={() => setViewFilters({ assignee: "", waiting: "all" })}
        >
          Clear filters
        </button>
        <button className="text-link" type="button" onClick={resetView}>
          Reset view
        </button>
      </div>
      {unavailableNote ? (
        <p role="status">
          {unavailableNote} Only confirmed available tickets are shown here.
        </p>
      ) : null}
      {outside ? (
        <section aria-label="Created ticket visibility">
          <p>
            Your created ticket is outside these filters. The chosen filters are kept.
          </p>
          <button
            type="button"
            onClick={() => setRevealedId(revealed ? null : created.id)}
          >
            {revealed ? "Return to filtered queue" : "Reveal created ticket"}
          </button>
          {revealed ? (
            <TicketCard
              ticket={revealed}
              assignees={assignees}
              canEdit={canEdit}
              onAssign={(uid) => assign(revealed, uid)}
              onEstimate={(amount, costBasis) =>
                patch(revealed.id, {
                  op: "estimate",
                  amountCents: amount,
                  ...(costBasis ? { costBasis } : {}),
                })
              }
              onNote={(text) => patch(revealed.id, { op: "note", text })}
              onReadCurrent={() => edits.readCurrent(revealed.id)}
              pendingCommand={
                edits.pending?.ticketId === revealed.id
                  ? edits.pending.command
                  : undefined
              }
              onApply={(command) => patch(revealed.id, command)}
              pending={edits.blocked}
              statusConflict={statusConflicts[revealed.id] ?? null}
              waitingOn={
                waitingOn[revealed.id] ??
                projectMaintenanceWaitingOn({
                  ticket: revealed,
                  link: null,
                  preapproval: null,
                })
              }
            />
          ) : null}
        </section>
      ) : null}
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
        <p className="muted">
          {assignedToMe && waitingFilter === "all"
            ? "No tickets assigned to you."
            : "No tickets match these filters."}
        </p>
      ) : null}
      {open.map((ticket) => (
        <TicketCard
          key={ticket.id}
          assignees={assignees}
          canEdit={canEdit}
          onAssign={(assigneeUid) => assign(ticket, assigneeUid)}
          onEstimate={(amountCents, costBasis) =>
            patch(ticket.id, {
              op: "estimate",
              amountCents,
              ...(costBasis ? { costBasis } : {}),
            })
          }
          onNote={(text) => patch(ticket.id, { op: "note", text })}
          onReadCurrent={() => edits.readCurrent(ticket.id)}
          pendingCommand={
            edits.pending?.ticketId === ticket.id ? edits.pending.command : undefined
          }
          onApply={(command) => patch(ticket.id, command)}
          pending={edits.blocked}
          statusConflict={statusConflicts[ticket.id] ?? null}
          ticket={ticket}
          waitingOn={
            waitingOn[ticket.id] ??
            projectMaintenanceWaitingOn({ ticket, link: null, preapproval: null })
          }
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
              onEstimate={(amountCents, costBasis) =>
                patch(ticket.id, {
                  op: "estimate",
                  amountCents,
                  ...(costBasis ? { costBasis } : {}),
                })
              }
              onNote={(text) => patch(ticket.id, { op: "note", text })}
              onReadCurrent={() => edits.readCurrent(ticket.id)}
              pendingCommand={
                edits.pending?.ticketId === ticket.id ? edits.pending.command : undefined
              }
              onApply={(command) => patch(ticket.id, command)}
              pending={edits.blocked}
              statusConflict={statusConflicts[ticket.id] ?? null}
              ticket={ticket}
              waitingOn={
                waitingOn[ticket.id] ??
                projectMaintenanceWaitingOn({ ticket, link: null, preapproval: null })
              }
            />
          ))}
        </details>
      ) : null}
      <p aria-atomic="true" aria-live="polite" className="muted" role="status">
        {edits.status}
      </p>
      {edits.pending ? (
        <section aria-label="Original ticket edit recovery">
          <p>
            The original edit is unresolved; no replacement edit runs during recovery.
          </p>
          {["scope", "reason", "text"].map((key) =>
            typeof edits.pending?.command[key] === "string" ? (
              <p key={key}>{String(edits.pending.command[key])}</p>
            ) : null,
          )}
          <button type="button" disabled={edits.busy} onClick={() => void edits.check()}>
            Check original edit
          </button>
          <button
            type="button"
            disabled={edits.busy}
            onClick={() => void edits.stopOriginal()}
          >
            Stop original app edit if it has not committed
          </button>
          <p>
            Stopping records an exact cutoff. If it committed first, its actual result is
            recovered.
          </p>
        </section>
      ) : null}
      {edits.conflictId ? (
        <button type="button" disabled={edits.busy} onClick={() => void edits.refresh()}>
          Read current ticket after conflict
        </button>
      ) : null}
    </section>
  );
}

function TicketCard({
  ticket,
  waitingOn = null,
  statusConflict = null,
  pending,
  assignees,
  canEdit,
  onApply,
  pendingCommand,
  onReadCurrent,
  onAssign,
  onNote,
  onEstimate,
}: Readonly<{
  ticket: MaintenanceTicketRecord;
  waitingOn?: MaintenanceWaitingOnProjection | null;
  statusConflict?: MaintenanceProviderStatusConflict | null;
  pending: boolean;
  assignees: AssignableUser[];
  canEdit: boolean;
  onApply: (command: Record<string, unknown>) => Promise<boolean>;
  pendingCommand?: Record<string, unknown>;
  onReadCurrent: () => Promise<void>;
  onAssign: (assigneeUid: string | null) => void;
  onNote: (text: string) => Promise<boolean>;
  onEstimate: (
    amountCents: number | null,
    costBasis?: MaintenanceTicketRecord["estimate_cost_basis"],
  ) => Promise<boolean>;
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
      <div className="ui-rows">
        {waitingOn ? (
          <>
            <p className="ui-spread">
              <span>Waiting on</span>
              <span>{MAINTENANCE_WAITING_ON_LABELS[waitingOn.waitingOn]}</span>
            </p>
            <p className="muted">{waitingOn.nextAction}</p>
            <p className="muted">{waitingOn.ownerDecisionDetail}</p>
          </>
        ) : null}
        {statusConflict?.differs ? (
          <p role="status">
            Differs from RentVine: this app says {statusConflict.appStatus}, the last read
            said {statusConflict.providerStatus}. {statusConflict.nextAction}
          </p>
        ) : null}
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
      <MaintenanceLifecyclePanel
        ticket={ticket}
        canEdit={canEdit}
        pending={pending}
        onApply={onApply}
      />
      <div className="field-row">
        <p>App status: {ticket.status}</p>
        <label className="select-field" htmlFor={`assignee-${ticket.id}`}>
          Assignee
          <select
            disabled={pending || !canEdit}
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
        <label className="select-field">
          Note
          <input
            aria-label={`Note for ${ticket.summary}`}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add a note"
            type="text"
            value={note}
          />
        </label>
        <button
          className="secondary-button"
          disabled={pending || !canEdit || note.trim().length === 0}
          onClick={async () => {
            if (await onNote(note.trim())) setNote("");
          }}
          type="button"
        >
          Add note
        </button>
      </div>
      <TicketHistory ticketId={ticket.id} />
      <MaintenanceVendorWorkPanel
        ticket={ticket}
        canEdit={canEdit}
        blocked={pending}
        onApply={onApply}
        pendingCommand={pendingCommand}
      />
      <MaintenanceReviews
        ticket={ticket}
        canEdit={canEdit}
        blocked={pending}
        onApply={onApply}
        pendingCommand={pendingCommand}
        onReadCurrent={onReadCurrent}
      />
      <MaintenanceCaseFactsPanel
        ticket={ticket}
        canEdit={canEdit}
        blocked={pending}
        onApply={onApply}
        pendingCommand={pendingCommand}
        onReadCurrent={onReadCurrent}
      />
      <section className="ui-callout" aria-label="Live write boundary">
        <p>
          <strong>Live write boundary:</strong> each external action must show its exact
          action and target, then receive human confirmation through its configured
          provider gate.
        </p>
      </section>
      {canEdit ? (
        <EstimateControl
          currentCents={ticket.estimate_amount_cents ?? null}
          onRecord={onEstimate}
          pending={pending}
        />
      ) : null}
      {canEdit ? (
        <details>
          <summary>Optional owner communication</summary>
          <MaintenanceOwnerNoticeDraftComposer ticketRef={ticket.id} />
        </details>
      ) : null}
      {canEdit && waitingOn?.ownerDecisionRequired === false ? (
        <p className="muted">{waitingOn.ownerDecisionDetail}</p>
      ) : null}
      <details>
        <summary>RentVine work order</summary>
        <OrdinaryRentvineWorkOrderPanel
          canEdit={canEdit}
          hasVerifiedUnit={Boolean(ticket.unit)}
          initialLink={null}
          ticketId={ticket.id}
        />
      </details>
      <details>
        <summary>Resident messages</summary>
        <WorkOrderChatPanel canEdit={canEdit} ticketId={ticket.id} />
      </details>
      <WorkflowCommunicationPanel
        discoveryOnly
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
  return formatBusinessTimestamp(iso);
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

/**
 * S108: record the exact estimate for this work. The amount decides whether the property's
 * preapproval covers it; clearing it returns the ticket to needing an owner decision.
 */
function EstimateControl({
  currentCents,
  pending,
  onRecord,
}: Readonly<{
  currentCents: number | null;
  pending: boolean;
  onRecord: (
    amountCents: number | null,
    costBasis?: MaintenanceTicketRecord["estimate_cost_basis"],
  ) => Promise<boolean>;
}>) {
  const [value, setValue] = useState("");
  const [costBasis, setCostBasis] = useState<
    MaintenanceTicketRecord["estimate_cost_basis"] | ""
  >("");
  const [error, setError] = useState("");

  return (
    <div className="ui-rows">
      <p className="ui-spread">
        <span>Estimate</span>
        <span>
          {currentCents === null ? "Not recorded" : formatPreapprovalAmount(currentCents)}
        </span>
      </p>
      <label className="ui-field">
        <span>Record an estimate</span>
        <input
          inputMode="decimal"
          onChange={(event) => setValue(event.target.value)}
          placeholder="400.00"
          value={value}
        />
      </label>
      <label className="ui-field">
        <span>Estimate cost basis</span>
        <select
          value={costBasis}
          onChange={(event) => setCostBasis(event.target.value as typeof costBasis)}
        >
          <option value="">Choose the actual basis</option>
          <option value="total_including_tax_and_markup">
            Total including tax and PMI markup
          </option>
          <option value="vendor_cost_including_tax">
            Vendor cost including tax, excluding PMI markup
          </option>
          <option value="vendor_cost_excluding_tax">
            Vendor cost excluding tax and PMI markup
          </option>
        </select>
      </label>
      <div className="ui-row">
        <button
          disabled={pending || value.trim() === "" || !costBasis}
          onClick={async () => {
            try {
              if (
                await onRecord(parsePreapprovalAmountCents(value), costBasis || undefined)
              ) {
                setValue("");
                setError("");
              }
            } catch (caught) {
              setError(
                caught instanceof Error ? caught.message : "Enter an exact amount.",
              );
            }
          }}
          type="button"
        >
          Record this estimate
        </button>
        {currentCents === null ? null : (
          <button disabled={pending} onClick={() => onRecord(null)} type="button">
            Clear the estimate
          </button>
        )}
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
