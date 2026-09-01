"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button, ConfirmationDialog, Field, Notice, StatusPill } from "@/components/ui";
import {
  ACCESS_CAPABILITY_CATALOG,
  ACCESS_ROLE_CATALOG,
  ACCESS_SPACE_CATALOG,
  capabilityCatalogEntry,
  spaceCatalogEntry,
} from "@/lib/access/catalog";
import type { Capability } from "@/lib/auth/roles";
import type { SpaceScope } from "@/lib/constants";
import type { AccessRequestState } from "@/lib/access/contracts";
import type {
  AccessApplyPreviewV1,
  AccessRequestRecordV1,
} from "@/lib/access/request-store";
import type {
  AdminAccessRequestDetail,
  AdminAccessRequestListItem,
} from "@/lib/access/request-service";

type ApplyEnvelope = {
  status: "ready";
  preview: AccessApplyPreviewV1;
  preview_hash: string;
};

type ApplyPreviewResponse =
  | ApplyEnvelope
  | { status: "already_applied" }
  | { status: "superseded" }
  | { error?: string };

type LaneFilters = {
  requesterQuery: string;
  intentKind: "" | "capability" | "role" | "spaces";
  catalogKey: string;
  spaceId: string;
  state: "" | AccessRequestState;
  waitingMinutes: string;
};

const DEFAULT_FILTERS: LaneFilters = {
  requesterQuery: "",
  intentKind: "",
  catalogKey: "",
  spaceId: "",
  state: "pending",
  waitingMinutes: "",
};

export function AccessRequestsLane({
  initialItems,
  initialPendingCount,
  initialNextCursor,
  initialDetail,
  referenceTime,
  initialError,
}: Readonly<{
  initialItems: readonly AdminAccessRequestListItem[];
  initialPendingCount: number;
  initialNextCursor: string | null;
  initialDetail: AdminAccessRequestDetail | null;
  referenceTime: string;
  initialError?: string;
}>) {
  const [items, setItems] = useState([...initialItems]);
  const [pendingCount, setPendingCount] = useState(initialPendingCount);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialItems[0]?.id ?? null,
  );
  const [filters, setFilters] = useState<LaneFilters>(DEFAULT_FILTERS);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [detail, setDetail] = useState(initialDetail);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [error, setError] = useState(initialError ?? null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<
    "list" | "detail" | "preview" | "apply" | "deny" | "reconcile" | "resolve" | null
  >(null);
  const [applyPreview, setApplyPreview] = useState<ApplyEnvelope | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [denyOpen, setDenyOpen] = useState(false);
  const [resolutionReason, setResolutionReason] = useState("");
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const selectedListItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );
  const selected =
    detail && detail.request.id === selectedListItem?.id
      ? detail.request
      : selectedListItem;

  useEffect(() => {
    if (selectedId && detail?.request.id !== selectedId) void loadDetail(selectedId);
    // The exact id is the dependency; detail is deliberately omitted to avoid a replay loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function loadDetail(requestId: string) {
    setBusy("detail");
    setDetailError(null);
    try {
      const response = await fetch(
        `/api/admin/access/review/${encodeURIComponent(requestId)}`,
      );
      const body = (await response.json().catch(() => null)) as
        | AdminAccessRequestDetail
        | { error?: string }
        | null;
      if (
        !response.ok ||
        !body ||
        !("request" in body) ||
        !Array.isArray(body.activity)
      ) {
        throw new Error(
          body && "error" in body && body.error
            ? body.error
            : "Access request detail is unavailable.",
        );
      }
      setDetail(body);
      setItems((current) =>
        current.map((item) =>
          item.id === body.request.id ? { ...item, ...body.request } : item,
        ),
      );
    } catch (cause) {
      setDetailError(
        cause instanceof Error ? cause.message : "Access request detail is unavailable.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function reload({
    activeFilters = filters,
    cursor,
    append = false,
  }: {
    activeFilters?: LaneFilters;
    cursor?: string;
    append?: boolean;
  } = {}) {
    setBusy("list");
    setError(null);
    setMessage("");
    try {
      const waiting = activeFilters.waitingMinutes
        ? Number(activeFilters.waitingMinutes)
        : undefined;
      const response = await fetch("/api/admin/access/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema_version: "access-request-admin-list-command-v1",
          filters: compactObject({
            requester_query: activeFilters.requesterQuery.trim() || undefined,
            intent_kind: activeFilters.intentKind || undefined,
            catalog_key: activeFilters.catalogKey || undefined,
            space_id: activeFilters.spaceId || undefined,
            state: activeFilters.state || undefined,
            minimum_waiting_minutes: waiting,
            cursor,
            limit: 50,
          }),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        items?: AdminAccessRequestListItem[];
        pending_count?: number;
        next_cursor?: string | null;
        error?: string;
      } | null;
      if (
        !response.ok ||
        !body ||
        !Array.isArray(body.items) ||
        (body.next_cursor !== null && typeof body.next_cursor !== "string")
      ) {
        throw new Error(body?.error ?? "Access requests are unavailable.");
      }
      setItems((current) =>
        append ? deduplicateRequests([...current, ...body.items!]) : body.items!,
      );
      setPendingCount(Number(body.pending_count ?? 0));
      setNextCursor(body.next_cursor ?? null);
      const nextSelectedId =
        append && selectedId ? selectedId : (body.items?.[0]?.id ?? null);
      setSelectedId(nextSelectedId);
      if (nextSelectedId) await loadDetail(nextSelectedId);
      else setDetail(null);
      setMessage(
        `Access requests refreshed. ${Number(body.pending_count ?? 0)} pending.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Access requests are unavailable.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function prepareApply() {
    if (!selected) return;
    setBusy("preview");
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/access/review/${encodeURIComponent(selected.id)}/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schema_version: "access-request-decision-preview-command-v1",
          }),
        },
      );
      const body = (await response
        .json()
        .catch(() => null)) as ApplyPreviewResponse | null;
      if (!response.ok || !body || !("status" in body) || body.status !== "ready") {
        if (body && "status" in body && body.status === "already_applied") {
          setMessage("Current directory access already satisfies this request.");
          await reload();
          return;
        }
        if (body && "status" in body && body.status === "superseded") {
          setMessage(
            "The request no longer has a safe additive plan. The requester can revise it.",
          );
          await reload();
          return;
        }
        throw new Error(
          body && "error" in body && body.error
            ? body.error
            : "Apply preview is unavailable.",
        );
      }
      setApplyPreview(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Apply preview is unavailable.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmApply() {
    if (!applyPreview || !selected) return;
    setBusy("apply");
    try {
      const response = await fetch(
        `/api/admin/access/review/${encodeURIComponent(selected.id)}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schema_version: "access-request-apply-command-v1",
            preview: applyPreview.preview,
            preview_hash: applyPreview.preview_hash,
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        status?: string;
        message?: string;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(body?.error ?? "Access could not be applied.");
      setMessage(body?.message ?? "Access decision recorded.");
      setApplyPreview(null);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Access could not be applied.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmDeny() {
    if (!selected) return;
    setBusy("deny");
    try {
      const response = await fetch(
        `/api/admin/access/review/${encodeURIComponent(selected.id)}/deny`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request_version: selected.version, reason: denyReason }),
        },
      );
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok)
        throw new Error(body?.error ?? "The request could not be denied.");
      setMessage("Access request denied. No claim was changed.");
      setDenyOpen(false);
      setDenyReason("");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The request could not be denied.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function reconcile() {
    if (!selected) return;
    setBusy("reconcile");
    try {
      const response = await fetch(
        `/api/admin/access/review/${encodeURIComponent(selected.id)}/reconcile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schema_version: "access-request-reconcile-command-v1" }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(body?.error ?? "Reconciliation could not run.");
      setMessage(body?.message ?? "Readback reconciliation completed.");
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reconciliation could not run.");
    } finally {
      setBusy(null);
    }
  }

  async function resolveAfterCorrection() {
    if (!selected) return;
    setBusy("resolve");
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/access/review/${encodeURIComponent(selected.id)}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schema_version: "access-request-resolution-command-v1",
            reason: resolutionReason,
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The reviewed resolution could not be completed.");
      }
      setMessage(body?.message ?? "The reviewed access resolution was recorded.");
      setResolutionOpen(false);
      setResolutionReason("");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The reviewed resolution could not be completed.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="access-review-lane ui-stack" aria-busy={busy === "list" || undefined}>
      <div className="ui-spread">
        <div>
          <p className="eyebrow">Admin-only global pool</p>
          <h2>Access requests</h2>
          <p className="muted">
            Review additive role and Space requests. This lane does not load or transition
            renewal queue records.
          </p>
        </div>
        <StatusPill value="pending">{pendingCount} pending</StatusPill>
      </div>
      <form
        className="access-review-filters"
        onSubmit={(event) => {
          event.preventDefault();
          void reload({ activeFilters: filters });
        }}
      >
        <label>
          Requester
          <input
            maxLength={160}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                requesterQuery: event.target.value,
              }))
            }
            placeholder="Name or user id"
            value={filters.requesterQuery}
          />
        </label>
        <label>
          Intent type
          <select
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                intentKind: event.target.value as LaneFilters["intentKind"],
              }))
            }
            value={filters.intentKind}
          >
            <option value="">All intent types</option>
            <option value="capability">Staff task</option>
            <option value="role">Role</option>
            <option value="spaces">Space access</option>
          </select>
        </label>
        <label>
          Capability or role
          <select
            onChange={(event) =>
              setFilters((current) => ({ ...current, catalogKey: event.target.value }))
            }
            value={filters.catalogKey}
          >
            <option value="">All capabilities and roles</option>
            <optgroup label="Capabilities">
              {ACCESS_CAPABILITY_CATALOG.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Roles">
              {ACCESS_ROLE_CATALOG.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Space reach">
              <option value="named_spaces">Named Spaces</option>
              <option value="all_spaces">All spaces</option>
            </optgroup>
          </select>
        </label>
        <label>
          Space
          <select
            onChange={(event) =>
              setFilters((current) => ({ ...current, spaceId: event.target.value }))
            }
            value={filters.spaceId}
          >
            <option value="">All Spaces</option>
            {ACCESS_SPACE_CATALOG.map((space) => (
              <option key={space.id} value={space.id}>
                {space.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          State
          <select
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                state: event.target.value as LaneFilters["state"],
              }))
            }
            value={filters.state}
          >
            <option value="">All states</option>
            {[
              "pending",
              "applying",
              "reconciliation_required",
              "applied",
              "denied",
              "cancelled",
              "superseded",
            ].map((state) => (
              <option key={state} value={state}>
                {state.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Waiting at least
          <select
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                waitingMinutes: event.target.value,
              }))
            }
            value={filters.waitingMinutes}
          >
            <option value="">Any age</option>
            <option value="60">1 hour</option>
            <option value="240">4 hours</option>
            <option value="1440">1 day</option>
            <option value="10080">7 days</option>
          </select>
        </label>
        <div className="ui-row access-review-filter-actions">
          <Button busy={busy === "list"} type="submit">
            Apply filters
          </Button>
          <Button
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
              void reload({ activeFilters: DEFAULT_FILTERS });
            }}
            type="button"
            variant="secondary"
          >
            Clear filters
          </Button>
          <Link href="/admin/access">Open My access</Link>
        </div>
      </form>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="status">{message}</Notice> : null}
      {items.length === 0 && !error ? (
        <p>No access requests match this filter.</p>
      ) : (
        <div className="access-review-layout">
          <div className="queue-list" aria-label="Access request list">
            {items.map((item) => (
              <button
                aria-pressed={selectedListItem?.id === item.id}
                className="compact-record access-request-list-button"
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                type="button"
              >
                <strong>{item.intent_label_snapshot}</strong>
                <span>
                  {item.requester_directory.state === "eligible"
                    ? item.requester_directory.current_label
                    : item.requester_label}
                </span>
                <span>Submitted {formatDate(item.created_at)}</span>
              </button>
            ))}
          </div>
          {selected ? (
            <article
              aria-busy={busy === "detail" || undefined}
              className="panel ui-stack"
              aria-label="Selected access request"
            >
              <div className="ui-spread">
                <h3>{selected.intent_label_snapshot}</h3>
                <StatusPill value={selected.state}>
                  {selected.state.replaceAll("_", " ")}
                </StatusPill>
              </div>
              <p>
                <strong>Requester:</strong> {selected.requester_label}
              </p>
              <p>
                <strong>Reason:</strong> {selected.reason}
              </p>
              <p>
                <strong>Request age:</strong>{" "}
                {formatAge(selected.created_at, referenceTime)}
              </p>
              {detail?.request.id === selected.id ? (
                detail.requester_directory.state === "eligible" ? (
                  <p>
                    <strong>Latest directory access:</strong>{" "}
                    {formatAccess(detail.requester_directory.current_access)}
                  </p>
                ) : (
                  <Notice tone="caution">
                    Latest requester directory access could not be checked. Preview or
                    decision will fail closed until it is available.
                  </Notice>
                )
              ) : null}
              <p>
                <strong>Current snapshot:</strong>{" "}
                {formatAccess(selected.baseline_access)}
              </p>
              <p>
                <strong>Requested target:</strong> {formatAccess(selected.target_access)}
              </p>
              <p>
                <strong>Access gained:</strong>{" "}
                {[
                  ...selected.added_capability_keys.map(
                    (capability) =>
                      capabilityCatalogEntry(capability as Capability).label,
                  ),
                  ...selected.added_space_ids.map(
                    (space) => spaceCatalogEntry(space as SpaceScope).label,
                  ),
                  ...(selected.all_spaces_added ? ["All spaces"] : []),
                ].join(", ") || "Already satisfied"}
              </p>
              {selected.decision_reason ? (
                <p>
                  <strong>Decision reason:</strong> {selected.decision_reason}
                </p>
              ) : null}
              {selected.state === "pending" ? (
                <div className="ui-row">
                  <Button
                    busy={busy === "preview"}
                    busyLabel="Preparing exact apply preview…"
                    onClick={prepareApply}
                  >
                    Preview exact access change
                  </Button>
                  <Button onClick={() => setDenyOpen(true)} variant="secondary">
                    Deny request
                  </Button>
                </div>
              ) : null}
              {["applying", "reconciliation_required"].includes(selected.state) ? (
                <div className="ui-row">
                  <Button
                    busy={busy === "reconcile"}
                    busyLabel="Reading current claims…"
                    onClick={reconcile}
                    variant="secondary"
                  >
                    Reconcile readback
                  </Button>
                  {selected.state === "reconciliation_required" ? (
                    <>
                      <Link href="/admin/users">Open People and Access</Link>
                      <Button onClick={() => setResolutionOpen(true)} variant="secondary">
                        Complete reviewed resolution
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : null}
              {detailError ? <Notice tone="error">{detailError}</Notice> : null}
              {detail?.request.id === selected.id ? (
                <div className="ui-stack-tight">
                  <h4>Immutable activity</h4>
                  {detail.activity.length ? (
                    <ol className="compact-list">
                      {detail.activity.map((activity) => (
                        <li key={activity.id}>
                          {humanizeActivity(activity.action)} ·{" "}
                          {formatDate(activity.created_at)}
                          {activity.reason ? `: ${activity.reason}` : ""}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>No activity receipt is available.</p>
                  )}
                </div>
              ) : null}
            </article>
          ) : null}
        </div>
      )}
      {nextCursor ? (
        <Button
          busy={busy === "list"}
          busyLabel="Loading older access requests…"
          onClick={() => reload({ cursor: nextCursor, append: true })}
          variant="secondary"
        >
          Load older access requests
        </Button>
      ) : null}

      <ConfirmationDialog
        busy={busy === "apply"}
        busyLabel="Applying and verifying access…"
        confirmLabel="Confirm exact access change"
        description="One merged Firebase claim attempt will preserve unrelated claims. Success is shown only after exact directory readback."
        onCancel={() => setApplyPreview(null)}
        onConfirm={confirmApply}
        open={applyPreview !== null}
        title="Apply this access bundle?"
      >
        {applyPreview ? (
          <div className="ui-stack-tight">
            <p>
              <strong>Target:</strong> {formatAccess(applyPreview.preview.target_access)}
            </p>
            <p>The requester must sign out and back in before the new claim is usable.</p>
          </div>
        ) : null}
      </ConfirmationDialog>

      <ConfirmationDialog
        busy={busy === "deny"}
        busyLabel="Denying request…"
        confirmDisabled={denyReason.trim().length < 1}
        confirmLabel="Confirm denial"
        description="Denial changes no Firebase claim. The requester can submit a corrected request immediately."
        onCancel={() => setDenyOpen(false)}
        onConfirm={confirmDeny}
        open={denyOpen}
        title="Deny this access request?"
      >
        <Field
          htmlFor="access-denial-reason"
          label="Plain-English denial reason"
          required
        >
          <textarea
            maxLength={500}
            onChange={(event) => setDenyReason(event.target.value)}
            rows={3}
            value={denyReason}
          />
        </Field>
      </ConfirmationDialog>

      <ConfirmationDialog
        busy={busy === "resolve"}
        busyLabel="Reading and resolving access…"
        confirmDisabled={resolutionReason.trim().length < 1}
        confirmLabel="Confirm reviewed resolution"
        description="This reads the current directory claims and never writes them. If they satisfy the approved target, the request closes as applied; otherwise it is superseded with this reason."
        onCancel={() => setResolutionOpen(false)}
        onConfirm={resolveAfterCorrection}
        open={resolutionOpen}
        title="Complete this reviewed resolution?"
      >
        <Field
          htmlFor="access-resolution-reason"
          label="Plain-English resolution reason"
          required
        >
          <textarea
            maxLength={500}
            onChange={(event) => setResolutionReason(event.target.value)}
            rows={3}
            value={resolutionReason}
          />
        </Field>
      </ConfirmationDialog>
    </div>
  );
}

function formatAccess(access: AccessRequestRecordV1["target_access"]) {
  return `${access.role} · ${
    access.scope.kind === "all_spaces"
      ? "All spaces"
      : access.scope.space_ids
          .map((space) => spaceCatalogEntry(space as SpaceScope).label)
          .join(", ")
  }`;
}

function formatDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleString()
    : "Unknown time";
}

function formatAge(createdAt: string, referenceTime: string) {
  const elapsed = Math.max(0, Date.parse(referenceTime) - Date.parse(createdAt));
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function compactObject(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

function deduplicateRequests(items: readonly AdminAccessRequestListItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function humanizeActivity(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (first) => first.toUpperCase());
}
