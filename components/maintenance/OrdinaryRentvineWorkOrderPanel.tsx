"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import type { WorkOrderLinkView } from "./RentvineWorkOrderPanel";
import { Button } from "@/components/ui/Button";
type Selection =
  | {
      kind: "create";
      ticketId: string;
      priorityId: "1" | "2" | "3";
      workOrderStatusId: string;
      isVacant: boolean;
      vendorTradeId?: string;
    }
  | { kind: "status"; workOrderId: string; targetStatusId: string };
interface Review {
  executionId: string;
  reviewHash: string;
  preview: Record<string, unknown>;
  selection: Selection;
}
interface Catalog {
  statuses: Array<{
    workOrderStatusId: string;
    primaryWorkOrderStatusId: string;
    name: string;
  }>;
  trades: Array<{ vendorTradeId: string; name: string }>;
  list: {
    rows: Array<{
      workOrderId: string;
      workOrderNumber: string;
      isSharedWithTenant: string;
      isSharedWithOwner: string;
    }>;
    complete: boolean;
  } | null;
}
async function request(body: Record<string, unknown>) {
  const r = await fetch("/api/maintenance/rentvine-work-orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    p = await r.json();
  if (!r.ok)
    throw Object.assign(
      new Error(
        p.error ?? "This work-order operation is unavailable. Your fields are kept.",
      ),
      { status: r.status },
    );
  return p;
}
/** Ordinary staff review source-resolved values, then apply once through the unchanged S20 effect seam. */
export function OrdinaryRentvineWorkOrderPanel({
  ticketId,
  canEdit,
  hasVerifiedUnit,
  initialLink,
}: {
  ticketId: string;
  canEdit: boolean;
  hasVerifiedUnit: boolean;
  initialLink: WorkOrderLinkView | null;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [link, setLink] = useState(initialLink),
    [kind, setKind] = useState<"create" | "status">("create"),
    [priority, setPriority] = useState<"1" | "2" | "3">("2"),
    [status, setStatus] = useState(""),
    [vacancy, setVacancy] = useState(""),
    [trade, setTrade] = useState(""),
    [workOrder, setWorkOrder] = useState(""),
    [targetStatus, setTargetStatus] = useState(""),
    [review, setReview] = useState<Review | null>(null),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [held, setHeld] = useState<string | null>(null),
    [knownFailure, setKnownFailure] = useState(false),
    [canResume, setCanResume] = useState(false),
    [existingId, setExistingId] = useState(""),
    [linkReview, setLinkReview] = useState<{
      previewHash: string;
      values: Record<string, string>;
    } | null>(null);
  const intent = useRef<Review | null>(null),
    live = useRef(true),
    running = useRef(false),
    key = `maintenance-rentvine-apply:${ticketId}`;
  const remember = useCallback(
    (value: Review | null, id?: string) => {
      intent.current = value;
      setCanResume(!!value);
      setHeld(value?.executionId ?? id ?? null);
      setKnownFailure(false);
      try {
        if (value) sessionStorage.setItem(key, JSON.stringify(value));
        else sessionStorage.removeItem(key);
      } catch {
        /* The original execution id remains in the URL. */
      }
      const u = new URL(location.href);
      if (value || id)
        u.searchParams.set("work_order_execution", value?.executionId ?? id!);
      else u.searchParams.delete("work_order_execution");
      history.replaceState(null, "", u);
    },
    [key],
  );
  const original = useCallback(
    async (id: string) => {
      const p = await request({ operation: "original", executionId: id });
      if (!live.current) return;
      if (p.state === "Succeeded") {
        setNote(
          "The original provider operation succeeded with its durable receipt. Check RentVine for the current readback.",
        );
        remember(null);
      } else if (p.state === "Failed") {
        setKnownFailure(true);
        setNote(
          "The original ledger records a known failure. Its evidence is retained. You may deliberately start a fresh current review.",
        );
      } else if (p.state === "not_recorded")
        setNote(
          "No original record is available yet. Keep this identity and check again; no second operation is authorized by absence.",
        );
      else
        setNote(
          `Original operation: ${p.state}. Reconcile its provider outcome before starting another change.`,
        );
    },
    [remember],
  );
  useEffect(() => {
    live.current = true;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      let saved: Review | null = null;
      try {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const p = JSON.parse(raw);
          if (
            /^exec_[a-f0-9]{40}$/.test(p.executionId) &&
            /^[a-f0-9]{64}$/.test(p.reviewHash) &&
            p.selection &&
            (p.selection.kind !== "create" || p.selection.ticketId === ticketId)
          )
            saved = p;
        }
      } catch {
        /* Missing local words never supply a replacement effect. */
      }
      const id =
        saved?.executionId ??
        new URL(location.href).searchParams.get("work_order_execution");
      if (id && /^exec_[a-f0-9]{40}$/.test(id)) {
        intent.current = saved;
        setCanResume(!!saved);
        setHeld(id);
        if (saved) setReview(saved);
        void original(id).catch((e) => {
          if (live.current) setNote(e.message);
        });
      }
    });
    return () => {
      active = false;
      live.current = false;
    };
  }, [key, original, ticketId]);
  async function run(fn: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      if (live.current)
        setNote(
          e instanceof Error
            ? e.message
            : "The outcome is unavailable. Keep the original identity.",
        );
    } finally {
      running.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function read() {
    const p = await request({ operation: "read", ticketId }),
      l = await request({ operation: "link_status", ticketId });
    if (live.current) {
      setCatalog(p);
      setLink(l.link ?? null);
      setReview(null);
      setNote(
        p.list?.complete
          ? "Current catalogs and complete work-order list read."
          : "Current catalog read; the work-order list may be incomplete. Exact reads and recovery remain available.",
      );
    }
  }
  function selection(): Selection {
    if (kind === "create") {
      if (!status || !vacancy)
        throw Error(
          "Choose the current initial status and explicitly record occupied or vacant.",
        );
      return {
        kind,
        ticketId,
        priorityId: priority,
        workOrderStatusId: status,
        isVacant: vacancy === "vacant",
        ...(trade ? { vendorTradeId: trade } : {}),
      };
    }
    if (!workOrder || !targetStatus)
      throw Error("Choose one current unshared work order and target status.");
    return { kind, workOrderId: workOrder, targetStatusId: targetStatus };
  }
  async function inspect() {
    const chosen = selection(),
      p = await request({ operation: "review", selection: chosen });
    if (live.current) {
      setReview({ ...p, selection: chosen });
      setNote("Read-only review loaded. Apply once to execute exactly these values.");
    }
  }
  async function apply(exact: Review) {
    remember(exact);
    const p = await request({
      operation: "apply",
      selection: exact.selection,
      executionId: exact.executionId,
      reviewHash: exact.reviewHash,
    });
    if (!live.current) return;
    if (p.execution_state === "Succeeded") {
      remember(null);
      setReview(null);
      setNote(
        "Applied in RentVine with a verified receipt and exact readback. Check RentVine to show its current state.",
      );
    } else
      setNote(
        `Original operation: ${p.execution_state ?? "unknown"}. Reconcile without redispatching.`,
      );
  }
  const blocked = busy || !!held;
  const change = () => {
    setReview(null);
    setLinkReview(null);
  };
  return (
    <section className="panel ui-stack" aria-label="RentVine work order">
      <h2>RentVine work order</h2>
      <p>
        Review one exact source change, then Apply once. Provider receipts and readback
        remain separate from this case&apos;s staff progress.
      </p>
      {link ? (
        <p>
          Work-order link: {link.state}
          {link.provider_work_order_id ? ` · ${link.provider_work_order_id}` : ""}
        </p>
      ) : null}
      <Button variant="secondary" disabled={busy} onClick={() => void run(read)}>
        Check RentVine
      </Button>
      {canEdit ? (
        <>
          <fieldset disabled={blocked}>
            <legend>Supported source change</legend>
            <label className="stack">
              Change
              <select
                aria-label="Work-order change"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as "create" | "status");
                  change();
                }}
              >
                <option value="create">Create for this assessed case</option>
                <option value="status">Update one existing status</option>
              </select>
            </label>
            {kind === "create" ? (
              <>
                {!hasVerifiedUnit ? (
                  <p>A verified current unit is required before creation.</p>
                ) : null}
                <label className="stack">
                  Priority
                  <select
                    aria-label="Provider priority"
                    value={priority}
                    onChange={(e) => {
                      setPriority(e.target.value as "1" | "2" | "3");
                      change();
                    }}
                  >
                    <option value="1">Low</option>
                    <option value="2">Medium</option>
                    <option value="3">High</option>
                  </select>
                </label>
                <label className="stack">
                  Initial status
                  <select
                    aria-label="Initial status"
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      change();
                    }}
                  >
                    <option value="">Choose from current catalog</option>
                    {catalog?.statuses
                      .filter((s) => ["1", "2"].includes(s.primaryWorkOrderStatusId))
                      .map((s) => (
                        <option key={s.workOrderStatusId} value={s.workOrderStatusId}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="stack">
                  Actual unit occupancy
                  <select
                    aria-label="Actual unit occupancy"
                    value={vacancy}
                    onChange={(e) => {
                      setVacancy(e.target.value);
                      change();
                    }}
                  >
                    <option value="">Record actual occupancy</option>
                    <option value="occupied">Occupied</option>
                    <option value="vacant">Vacant</option>
                  </select>
                </label>
                <label className="stack">
                  Category (optional)
                  <select
                    aria-label="Provider category"
                    value={trade}
                    onChange={(e) => {
                      setTrade(e.target.value);
                      change();
                    }}
                  >
                    <option value="">No category</option>
                    {catalog?.trades.map((t) => (
                      <option key={t.vendorTradeId} value={t.vendorTradeId}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <label className="stack">
                  Work order
                  <select
                    aria-label="Existing provider work order"
                    value={workOrder}
                    onChange={(e) => {
                      setWorkOrder(e.target.value);
                      change();
                    }}
                  >
                    <option value="">Choose a current unshared work order</option>
                    {catalog?.list?.rows
                      .filter(
                        (w) =>
                          w.isSharedWithTenant === "0" && w.isSharedWithOwner === "0",
                      )
                      .map((w) => (
                        <option key={w.workOrderId} value={w.workOrderId}>
                          #{w.workOrderNumber} · {w.workOrderId}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="stack">
                  Target status
                  <select
                    aria-label="Target provider status"
                    value={targetStatus}
                    onChange={(e) => {
                      setTargetStatus(e.target.value);
                      change();
                    }}
                  >
                    <option value="">Choose from current catalog</option>
                    {catalog?.statuses.map((s) => (
                      <option key={s.workOrderStatusId} value={s.workOrderStatusId}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <Button
              variant="secondary"
              disabled={
                !catalog ||
                (kind === "create" &&
                  (!hasVerifiedUnit || (!!link && link.state !== "failed")))
              }
              onClick={() => void run(inspect)}
            >
              Read exact change for review
            </Button>
          </fieldset>
          {review ? (
            <div>
              <h3>Exact provider values</h3>
              <dl>
                {Object.entries(review.preview).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
              </dl>
              {!held ? (
                <Button disabled={busy} onClick={() => void run(() => apply(review))}>
                  Apply reviewed RentVine change
                </Button>
              ) : null}
            </div>
          ) : null}
          {held ? (
            <div className="panel">
              <p>Original execution: {held}</p>
              <Button
                disabled={busy}
                variant="secondary"
                onClick={() => void run(() => original(held))}
              >
                Check original provider operation
              </Button>
              {knownFailure ? (
                <Button
                  disabled={busy}
                  variant="secondary"
                  onClick={() => {
                    remember(null);
                    setReview(null);
                    setCatalog(null);
                    setNote(
                      "Original failed outcome retained. Read current RentVine before preparing a fresh change.",
                    );
                  }}
                >
                  Start a new review after known failure
                </Button>
              ) : null}
              {canResume ? (
                <Button
                  disabled={busy}
                  onClick={() => void run(() => apply(intent.current!))}
                >
                  Continue exact original Apply
                </Button>
              ) : null}
              <Button
                disabled={busy}
                variant="secondary"
                onClick={() =>
                  void run(async () => {
                    const p = await request({
                      operation: "reconcile",
                      executionId: held,
                    });
                    setNote(
                      `Original reconciliation: ${p.reconcile_status ?? p.execution_state ?? "unknown"}. No provider write was retried.`,
                    );
                    await original(held);
                  })
                }
              >
                Reconcile original provider outcome
              </Button>
            </div>
          ) : null}
          {(!link || link.state === "failed") && !held ? (
            <fieldset disabled={busy}>
              <legend>Link an existing work order</legend>
              <label>
                Exact work-order ID
                <input
                  aria-label="Existing work-order ID to link"
                  value={existingId}
                  onChange={(e) => {
                    setExistingId(e.target.value);
                    setLinkReview(null);
                  }}
                />
              </label>
              <Button
                variant="secondary"
                onClick={() =>
                  void run(async () => {
                    const p = await request({
                      operation: "preview_link",
                      ticketId,
                      workOrderId: existingId,
                    });
                    setLinkReview(p);
                  })
                }
              >
                Read existing work-order link
              </Button>
              {linkReview ? (
                <>
                  <pre>{JSON.stringify(linkReview.values, null, 2)}</pre>
                  <Button
                    onClick={() =>
                      void run(async () => {
                        const p = await request({
                          operation: "confirm_link",
                          ticketId,
                          workOrderId: linkReview.values.work_order_id,
                          confirmedPreviewHash: linkReview.previewHash,
                          confirmation: "Link this existing work order",
                        });
                        setLink(p.link);
                        setLinkReview(null);
                        setNote(
                          "Existing work-order link saved and read back. RentVine was read only.",
                        );
                      })
                    }
                  >
                    Save reviewed existing link
                  </Button>
                </>
              ) : null}
            </fieldset>
          ) : null}
        </>
      ) : (
        <p>Current staff editing authority is required for provider changes.</p>
      )}
      {note ? <p role="status">{note}</p> : null}
    </section>
  );
}
