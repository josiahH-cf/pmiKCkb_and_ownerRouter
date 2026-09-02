"use client";

import { useState } from "react";

import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import { Button, Field } from "@/components/ui";

interface WorkOrderRow {
  workOrderId: string;
  workOrderNumber: string;
  workOrderStatusId: string;
  primaryWorkOrderStatusId: string;
  priorityId: string;
  description: string;
  isSharedWithTenant: "0" | "1";
  isSharedWithOwner: "0" | "1";
}

interface StatusRow {
  workOrderStatusId: string;
  primaryWorkOrderStatusId: string;
  name: string;
  isSystemStatus: "0" | "1";
}

interface TradeRow {
  vendorTradeId: string;
  name: string;
}

interface ReadPayload {
  list: { rows: WorkOrderRow[]; pages: number; complete: boolean } | null;
  detail: { workOrder: WorkOrderRow } | null;
  statuses: StatusRow[];
  trades: TradeRow[];
  filters: { propertyId: string | null; unitId: string | null };
}

export interface WorkOrderLinkView {
  state: "pending" | "succeeded" | "ambiguous" | "failed";
  execution_id: string;
  provider_work_order_id?: string;
}

const PRIMARY_GROUPS: Record<string, string> = {
  "1": "Pending",
  "2": "Open",
  "3": "Closed",
  "4": "On Hold",
};

async function postWorkOrders(body: Record<string, unknown>) {
  const response = await fetch("/api/maintenance/rentvine-work-orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "The RentVine work-order request was declined.",
    );
  }
  return payload;
}

/**
 * BEH-S99-1/2/3/6: explicit bounded reads, one reviewed create for one eligible ticket, and one
 * reviewed status update for a fresh unshared work order. Every write goes to the Approval Queue
 * first; there is no Vendor assignment, share, chat, file, DELETE, or notification control here.
 * The RentVine dashboard URL mapping is an unverified runtime input, so rows show provider ids
 * without an external link.
 */
export function RentvineWorkOrderPanel({
  ticketId,
  canEdit,
  hasVerifiedUnit,
  initialLink,
}: Readonly<{
  ticketId: string;
  canEdit: boolean;
  hasVerifiedUnit: boolean;
  initialLink: WorkOrderLinkView | null;
}>) {
  const editor = canEdit;
  const [link, setLink] = useState(initialLink);
  const [read, setRead] = useState<ReadPayload | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [priorityId, setPriorityId] = useState<"1" | "2" | "3">("2");
  const [statusId, setStatusId] = useState("");
  const [vacancy, setVacancy] = useState<"" | "occupied" | "vacant">("");
  const [tradeId, setTradeId] = useState("");
  const [prepared, setPrepared] = useState<{
    executionId: string;
    kind: "create" | "status";
    preview: Record<string, unknown>;
    approvalHref: string;
  } | null>(null);
  const [targetWorkOrderId, setTargetWorkOrderId] = useState("");
  const [targetStatusId, setTargetStatusId] = useState("");

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "The RentVine work-order request was declined.",
      );
    } finally {
      setPending(false);
    }
  }

  async function checkRentvine() {
    const linkPayload = await postWorkOrders({ operation: "link_status", ticketId });
    setLink((linkPayload.link as WorkOrderLinkView | null) ?? null);
    const payload = (await postWorkOrders({
      operation: "read",
      ticketId,
    })) as unknown as ReadPayload;
    setRead(payload);
    setNotice(
      payload.list
        ? payload.list.complete
          ? `Read ${payload.list.rows.length} work order(s) for this unit's property (complete).`
          : `Read ${payload.list.rows.length} work order(s) across ${payload.list.pages} pages; the page cap stopped the read, so this set is explicitly incomplete.`
        : "Read one exact work order.",
    );
  }

  async function proposeCreate() {
    if (!statusId) throw new Error("Pick the fresh initial status first.");
    if (!vacancy) {
      throw new Error(
        "Explicitly confirm whether the unit is vacant; it is never inferred.",
      );
    }
    const payload = await postWorkOrders({
      operation: "propose_create",
      ticketId,
      priorityId,
      workOrderStatusId: statusId,
      isVacant: vacancy === "vacant",
      ...(tradeId ? { vendorTradeId: tradeId } : {}),
    });
    setPrepared({
      executionId: String(payload.execution_id),
      kind: "create",
      preview: payload.preview as Record<string, unknown>,
      approvalHref: String(payload.approval_queue_href ?? "/approval-queue"),
    });
    setLink({
      state: "pending",
      execution_id: String(payload.execution_id),
    });
    setNotice(
      "Create proposal saved and routed to Admin approval. Nothing has reached RentVine.",
    );
  }

  async function proposeStatus() {
    if (!targetWorkOrderId || !targetStatusId) {
      throw new Error("Pick the exact work order and a fresh-catalog target status.");
    }
    const payload = await postWorkOrders({
      operation: "propose_status",
      workOrderId: targetWorkOrderId,
      targetStatusId,
    });
    setPrepared({
      executionId: String(payload.execution_id),
      kind: "status",
      preview: payload.preview as Record<string, unknown>,
      approvalHref: String(payload.approval_queue_href ?? "/approval-queue"),
    });
    setNotice(
      "Status proposal saved and routed to Admin approval. Nothing has changed in RentVine.",
    );
  }

  async function executePrepared() {
    if (!prepared) return;
    const payload = await postWorkOrders({
      operation: "execute",
      executionId: prepared.executionId,
    });
    const state = String(payload.execution_state ?? "");
    if (state === "Succeeded") {
      setNotice(
        payload.duplicate === true
          ? "This exact effect already completed; showing its durable outcome."
          : "Applied in RentVine with a verified receipt and exact readback.",
      );
      if (prepared.kind === "create") {
        const receipt = payload.receipt as { provider_ref?: string } | undefined;
        setLink({
          state: "succeeded",
          execution_id: prepared.executionId,
          ...(receipt?.provider_ref
            ? { provider_work_order_id: receipt.provider_ref }
            : {}),
        });
      }
    } else if (state === "Needs reconciliation") {
      setNotice(
        "The provider outcome is unproven. Reconciliation reads fresh state and never retries.",
      );
    } else {
      setNotice(`RentVine declined the action without a change (state: ${state}).`);
    }
  }

  async function reconcilePrepared() {
    if (!prepared) return;
    const payload = await postWorkOrders({
      operation: "reconcile",
      executionId: prepared.executionId,
    });
    setNotice(
      `Reconciliation recorded ${String(payload.reconcile_status ?? "an outcome")} from fresh provider state without any retry.`,
    );
  }

  const creatableStatuses = (read?.statuses ?? []).filter((entry) =>
    ["1", "2"].includes(entry.primaryWorkOrderStatusId),
  );

  return (
    <article aria-labelledby="rentvine-work-order-title" className="panel ui-stack">
      <div>
        <h2 id="rentvine-work-order-title">RentVine work order</h2>
        <p className="muted">
          Explicit bounded reads and reviewed one-at-a-time writes against the official
          account operations. Every write needs Admin approval and an exact confirmation;
          nothing is shared, sent, assigned, or deleted from here.
        </p>
      </div>

      {link ? (
        <p className="muted" role="status">
          {link.state === "succeeded" && link.provider_work_order_id
            ? `Linked RentVine work order ${link.provider_work_order_id} (receipted).`
            : link.state === "pending"
              ? "A create attempt is awaiting approval or execution."
              : link.state === "ambiguous"
                ? "The last create outcome is unproven; reconcile before anything new."
                : "The last create attempt was declined; a fresh proposal is allowed."}
        </p>
      ) : null}

      <div className="ui-actions">
        <Button
          disabled={pending}
          onClick={() => void run(checkRentvine)}
          variant="secondary"
        >
          Check RentVine
        </Button>
      </div>

      {read?.list ? (
        <ul>
          {read.list.rows.map((row) => (
            <li key={row.workOrderId}>
              #{row.workOrderNumber} · provider id {row.workOrderId} · status{" "}
              {read.statuses.find(
                (entry) => entry.workOrderStatusId === row.workOrderStatusId,
              )?.name ?? row.workOrderStatusId}{" "}
              ({PRIMARY_GROUPS[row.primaryWorkOrderStatusId] ?? "?"})
            </li>
          ))}
          {read.list.rows.length === 0 ? (
            <li>No work orders exist for this unit&apos;s property.</li>
          ) : null}
        </ul>
      ) : null}

      {editor ? (
        <>
          {!link || link.state === "failed" ? (
            <details>
              <summary>Create in RentVine</summary>
              {!hasVerifiedUnit ? (
                <p className="muted">
                  This ticket needs a verified unit before a create can be proposed.
                </p>
              ) : !read ? (
                <p className="muted">
                  Run Check RentVine first; the initial status and category come from the
                  fresh account catalogs.
                </p>
              ) : (
                <form
                  className="ui-stack"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(proposeCreate);
                  }}
                >
                  <Field htmlFor="s99-priority" label="Priority (documented vocabulary)">
                    <select
                      id="s99-priority"
                      onChange={(event) =>
                        setPriorityId(event.target.value as "1" | "2" | "3")
                      }
                      value={priorityId}
                    >
                      <option value="1">1 - Low</option>
                      <option value="2">2 - Medium</option>
                      <option value="3">3 - High</option>
                    </select>
                  </Field>
                  <Field htmlFor="s99-status" label="Initial status (fresh catalog)">
                    <select
                      id="s99-status"
                      onChange={(event) => setStatusId(event.target.value)}
                      value={statusId}
                    >
                      <option value="">Pick a Pending/Open-grouped status…</option>
                      {creatableStatuses.map((entry) => (
                        <option
                          key={entry.workOrderStatusId}
                          value={entry.workOrderStatusId}
                        >
                          {entry.name} ({PRIMARY_GROUPS[entry.primaryWorkOrderStatusId]})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    htmlFor="s99-vacancy"
                    label="Unit vacancy (explicit confirmation)"
                  >
                    <select
                      id="s99-vacancy"
                      onChange={(event) =>
                        setVacancy(event.target.value as "" | "occupied" | "vacant")
                      }
                      value={vacancy}
                    >
                      <option value="">Confirm occupied or vacant…</option>
                      <option value="occupied">Occupied</option>
                      <option value="vacant">Vacant</option>
                    </select>
                  </Field>
                  <Field htmlFor="s99-trade" label="Maintenance category (optional)">
                    <select
                      id="s99-trade"
                      onChange={(event) => setTradeId(event.target.value)}
                      value={tradeId}
                    >
                      <option value="">No category</option>
                      {(read?.trades ?? []).map((entry) => (
                        <option key={entry.vendorTradeId} value={entry.vendorTradeId}>
                          {entry.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <p className="muted">
                    The preview fixes owner approval, both portal shares, and both
                    provider notifications off; the exact reviewed ticket description is
                    used as-is.
                  </p>
                  <Button disabled={pending} type="submit">
                    Save create proposal for approval
                  </Button>
                </form>
              )}
            </details>
          ) : null}

          <details>
            <summary>Update RentVine status</summary>
            {!read?.list ? (
              <p className="muted">
                Run Check RentVine first; the target comes from a fresh read and the fresh
                status catalog.
              </p>
            ) : (
              <form
                className="ui-stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(proposeStatus);
                }}
              >
                <Field htmlFor="s99-wo" label="Work order (fresh read)">
                  <select
                    id="s99-wo"
                    onChange={(event) => setTargetWorkOrderId(event.target.value)}
                    value={targetWorkOrderId}
                  >
                    <option value="">Pick the exact work order…</option>
                    {read.list.rows
                      .filter(
                        (row) =>
                          row.isSharedWithTenant === "0" && row.isSharedWithOwner === "0",
                      )
                      .map((row) => (
                        <option key={row.workOrderId} value={row.workOrderId}>
                          #{row.workOrderNumber} (id {row.workOrderId})
                        </option>
                      ))}
                  </select>
                </Field>
                <Field htmlFor="s99-target" label="Target status (fresh catalog)">
                  <select
                    id="s99-target"
                    onChange={(event) => setTargetStatusId(event.target.value)}
                    value={targetStatusId}
                  >
                    <option value="">Pick the target status…</option>
                    {read.statuses.map((entry) => (
                      <option
                        key={entry.workOrderStatusId}
                        value={entry.workOrderStatusId}
                      >
                        {entry.name} ({PRIMARY_GROUPS[entry.primaryWorkOrderStatusId]})
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="muted">
                  Only the status changes; vendor notification and completion review stay
                  off, and readback must show every other field unchanged.
                </p>
                <Button disabled={pending} type="submit">
                  Save status proposal for approval
                </Button>
              </form>
            )}
          </details>
        </>
      ) : (
        <p className="muted">
          Proposing a RentVine work-order change is an Editor action.{" "}
          <RequestAccessLink surface="maintenance.edit" />
        </p>
      )}

      {prepared ? (
        <div className="ui-stack">
          <p className="muted">
            Prepared {prepared.kind === "create" ? "create" : "status update"} awaiting
            Admin approval. <a href={prepared.approvalHref}>Open the Approval Queue</a>.
          </p>
          <ul>
            {Object.entries(prepared.preview).map(([key, value]) => (
              <li key={key}>
                {key}: {String(value)}
              </li>
            ))}
          </ul>
          <div className="ui-actions">
            <Button disabled={pending} onClick={() => void run(executePrepared)}>
              Execute the approved action once
            </Button>
            <Button
              disabled={pending}
              onClick={() => void run(reconcilePrepared)}
              variant="secondary"
            >
              Reconcile from provider state
            </Button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <p className="muted" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {pending ? (
        <p aria-busy="true" className="muted" role="status">
          Working…
        </p>
      ) : null}
    </article>
  );
}
