"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { formatBusinessTimestamp } from "@/lib/date-display";
import {
  CollectionBasisSchema,
  CollectionRenameSchema,
  type CollectionBasis,
  type CollectionReview,
  type CollectionStatus,
  type SharedLeaseCollection,
} from "@/lib/lease-renewal/shared-collections";
interface Detail {
  collection: SharedLeaseCollection;
  statuses: CollectionStatus[];
  readAt: string | null;
  complete: boolean;
  issues: string[];
}
interface PendingChange {
  reviewId?: string;
  operationId: string;
  rename?: { collectionId: string; expectedVersion: number; name: string };
}
interface Receipt {
  state: "recorded" | "not_recorded";
  acceptedVersion?: number;
  collection?: SharedLeaseCollection | null;
}
class CollectionHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
const failureText = (body: { error?: unknown }, fallback: string) =>
  typeof body.error === "string" ? body.error : fallback;
async function read<T>(query: string): Promise<T> {
  const response = await fetch(`/api/lease-renewal/collections?${query}`, {
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok)
    throw new CollectionHttpError(
      failureText(body, "The collection could not be read."),
      response.status,
    );
  return body;
}
async function post<T>(body: unknown): Promise<T> {
  const response = await fetch("/api/lease-renewal/collections", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new CollectionHttpError(
      failureText(result, "The collection change is not confirmed."),
      response.status,
    );
  return result;
}
export function SharedLeaseCollections({
  ownerUid,
  initialMembers = [],
  origin = "explicit",
  initialCriteria = "",
  initialId = null,
  initialReview = null,
  initialOperation = null,
}: Readonly<{
  ownerUid: string;
  initialMembers?: readonly string[];
  origin?: CollectionBasis["origin"];
  initialCriteria?: string;
  initialId?: string | null;
  initialReview?: string | null;
  initialOperation?: string | null;
}>) {
  const [entries, setEntries] = useState<SharedLeaseCollection[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [listError, setListError] = useState(""),
    [detail, setDetail] = useState<Detail | null>(null);
  const [name, setName] = useState(""),
    [basis, setBasis] = useState<CollectionBasis>({
      mode: origin === "worklist" ? "period" : "explicit",
      origin,
      dateField: "lease_end",
      from: "",
      through: "",
      criteria: initialCriteria,
      selectedLeaseIds: [...initialMembers],
    });
  const [memberText, setMemberText] = useState(initialMembers.join(", ")),
    [id, setId] = useState(initialId),
    [review, setReview] = useState<CollectionReview | null>(null),
    [pending, setPending] = useState<PendingChange | null>(
      initialOperation
        ? {
            ...(initialReview ? { reviewId: initialReview } : {}),
            operationId: initialOperation,
          }
        : null,
    );
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const lock = useRef(false),
    live = useRef(true),
    readGeneration = useRef(0),
    restoreGeneration = useRef(0);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      readGeneration.current++;
    };
  }, []);
  function address(
    nextId: string | null,
    nextReview: string | null = null,
    operation: string | null = null,
  ) {
    const url = new URL(location.href);
    for (const key of ["id", "review", "operation", "members", "origin", "criteria"])
      url.searchParams.delete(key);
    if (nextId) url.searchParams.set("id", nextId);
    if (nextReview) url.searchParams.set("review", nextReview);
    if (operation) url.searchParams.set("operation", operation);
    history.replaceState(null, "", url);
  }
  async function loadList(older = false) {
    try {
      const result = await read<{
        collections: SharedLeaseCollection[];
        nextCursor: string | null;
      }>(older && cursor ? `after=${cursor}` : "");
      if (!live.current) return;
      setEntries((previous) =>
        older
          ? [
              ...new Map(
                [...previous, ...result.collections].map((c) => [c.id, c]),
              ).values(),
            ]
          : result.collections,
      );
      setCursor(result.nextCursor);
      setListError("");
    } catch {
      if (live.current)
        setListError(
          "Shared collections could not be loaded. The saved collections are kept.",
        );
    }
  }
  async function open(collectionId: string, edit = true) {
    const generation = ++readGeneration.current;
    try {
      const result = await read<Detail>(`id=${collectionId}`);
      if (!live.current || generation !== readGeneration.current) return;
      setDetail(result);
      setId(collectionId);
      if (edit) {
        setName(result.collection.name);
        setBasis(result.collection.basis);
        setMemberText(result.collection.basis.selectedLeaseIds.join(", "));
        setReview(null);
        setPending(null);
        address(collectionId);
      }
      setError("");
    } catch (e) {
      if (live.current && generation === readGeneration.current)
        setError(e instanceof Error ? e.message : "The collection could not be opened.");
    }
  }
  function intentKey(operationId: string) {
    return `renewal-collection-intent:${ownerUid}:${operationId}`;
  }
  function persistIntent(command: PendingChange) {
    try {
      sessionStorage.setItem(intentKey(command.operationId), JSON.stringify(command));
    } catch {
      /* The durable receipt remains available from the URL even if local input storage is unavailable. */
    }
  }
  function clearIntent(operationId: string) {
    try {
      sessionStorage.removeItem(intentKey(operationId));
    } catch {}
  }
  async function checkReceipt(command = pending) {
    if (!command) return;
    try {
      const result = await read<Receipt>(`operation=${command.operationId}`);
      if (!live.current) return;
      if (result.state === "recorded" && result.collection) {
        restoreGeneration.current++;
        clearIntent(command.operationId);
        setPending(null);
        setReview(null);
        address(result.collection.id);
        setNotice(
          `Change recorded as version ${result.acceptedVersion}. Showing the collection's current version.`,
        );
        await open(result.collection.id);
        await loadList();
      } else {
        setNotice(
          "This save is not recorded yet. Retry the same save intent; a later response cannot create a second version.",
        );
      }
    } catch {
      if (live.current)
        setError(
          "The recorded save could not be checked. Keep this intent and retry checking.",
        );
    }
  }
  useEffect(() => {
    const restoring = restoreGeneration.current;
    void Promise.resolve().then(() => {
      if (!live.current) return;
      void loadList();
      if (initialId) void open(initialId, !initialOperation);
      if (initialOperation) {
        let restored: PendingChange = {
          ...(initialReview ? { reviewId: initialReview } : {}),
          operationId: initialOperation,
        };
        try {
          const stored = JSON.parse(
            sessionStorage.getItem(intentKey(initialOperation)) ?? "null",
          );
          if (stored?.operationId === initialOperation && stored.rename) {
            const parsed = CollectionRenameSchema.safeParse({
              action: "rename",
              operationId: initialOperation,
              ...stored.rename,
            });
            if (parsed.success) {
              restored = {
                operationId: initialOperation,
                rename: {
                  collectionId: parsed.data.collectionId,
                  expectedVersion: parsed.data.expectedVersion,
                  name: parsed.data.name,
                },
              };
              setName(parsed.data.name);
            }
          }
        } catch {}
        setPending(restored);
        if (initialReview)
          void read<{ review: CollectionReview }>(`review=${initialReview}`).then(
            (result) => {
              if (live.current && restoring === restoreGeneration.current) {
                setReview(result.review);
                setName(result.review.name);
                setBasis(result.review.basis);
                setMemberText(result.review.basis.selectedLeaseIds.join(", "));
              }
            },
            () => {
              if (live.current && restoring === restoreGeneration.current)
                setError(
                  "The original reviewed selection could not be reopened. Check its recorded save before starting another.",
                );
            },
          );
        void checkReceipt(restored);
      }
    });
    // Mount reads only: neither review nor save runs as a consequence of navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function changed() {
    setReview(null);
    setNotice("");
    setError("");
  }
  async function act(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (live.current)
        setError(e instanceof Error ? e.message : "The change is not confirmed.");
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function prepare() {
    await act(async () => {
      if (pending)
        throw new Error("Check the original save before reviewing another change.");
      const selectedLeaseIds = [...new Set(memberText.split(/[,\s]+/).filter(Boolean))];
      const parsed = CollectionBasisSchema.safeParse({ ...basis, selectedLeaseIds });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues[0]?.message ??
            "Choose a date field, period and actual lease selection.",
        );
      const collectionId = id ?? crypto.randomUUID();
      const result = await post<{ review: CollectionReview }>({
        action: "review",
        collectionId,
        expectedVersion: detail?.collection.version ?? 0,
        name,
        basis: parsed.data,
        reviewId: crypto.randomUUID(),
      });
      if (!live.current) return;
      setId(collectionId);
      setReview(result.review);
      setNotice(
        "Review the actual lease and cycle changes below. Status refresh never changes membership.",
      );
    });
  }
  async function save(command?: PendingChange) {
    await act(async () => {
      if (!review && !command) throw new Error("Review the membership first.");
      const intent = command ??
        pending ?? { reviewId: review!.id, operationId: crypto.randomUUID() };
      if (!intent.reviewId && !intent.rename)
        throw new Error(
          "Only the recorded result can be checked for this change. Reopen the original tab to retain its exact input.",
        );
      setPending(intent);
      persistIntent(intent);
      address(
        intent.rename?.collectionId ?? id,
        intent.reviewId ?? null,
        intent.operationId,
      );
      try {
        const result = await post<Receipt>(
          intent.rename
            ? { action: "rename", ...intent.rename, operationId: intent.operationId }
            : {
                action: "save",
                reviewId: intent.reviewId,
                operationId: intent.operationId,
              },
        );
        if (!live.current) return;
        if (!result.collection)
          throw new Error(
            "The saved collection was not returned. Check its recorded result.",
          );
        clearIntent(intent.operationId);
        setPending(null);
        setReview(null);
        address(result.collection.id);
        setNotice(
          `${intent.rename ? "Name" : "Reviewed membership"} saved as version ${result.acceptedVersion}.`,
        );
        await open(result.collection.id);
        await loadList();
      } catch (e) {
        if (e instanceof CollectionHttpError && [400, 403, 404, 409].includes(e.status)) {
          clearIntent(intent.operationId);
          setPending(null);
          setReview(null);
          address(intent.rename?.collectionId ?? id);
          if (detail) await open(detail.collection.id, false);
          throw new Error(
            `${e.message} Your entries are kept. Review the current version before trying another change.`,
          );
        }
        throw new Error(
          `${e instanceof Error ? e.message : "The response was lost."} Check the recorded change or retry this same intent.`,
        );
      }
    });
  }
  function rename() {
    if (!detail || !name.trim()) return;
    void save({
      operationId: crypto.randomUUID(),
      rename: {
        collectionId: detail.collection.id,
        expectedVersion: detail.collection.version,
        name: name.trim(),
      },
    });
  }
  function newCollection() {
    readGeneration.current++;
    setId(null);
    setDetail(null);
    setName("");
    setReview(null);
    setPending(null);
    changed();
    address(null);
  }
  return (
    <div className="ui-stack">
      <h1>Shared lease collections</h1>
      <p>
        Save reviewed monthly lease groups for Renewal staff. Conversation history stays
        private.
      </p>
      <nav aria-label="Shared collections" className="panel">
        <h2>Team collections</h2>
        {listError ? (
          <p role="alert">
            {listError}{" "}
            <button type="button" onClick={() => void loadList()}>
              Retry collection list
            </button>
          </p>
        ) : null}
        <ul>
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                disabled={busy || !!pending}
                onClick={() => void open(entry.id)}
              >
                {entry.name}
              </button>{" "}
              · {entry.members.length} members · version {entry.version}
            </li>
          ))}
        </ul>
        {cursor ? (
          <button type="button" onClick={() => void loadList(true)}>
            Load older collections
          </button>
        ) : null}
        <button type="button" disabled={busy || !!pending} onClick={newCollection}>
          New collection
        </button>
      </nav>
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {pending ? (
        <div className="panel">
          <p>A collection change needs its recorded result checked.</p>
          <button
            disabled={busy}
            type="button"
            onClick={() => void act(() => checkReceipt())}
          >
            Check recorded change
          </button>
          <button
            disabled={busy || (!pending.reviewId && !pending.rename)}
            type="button"
            onClick={() => void save(pending)}
          >
            Retry the same change
          </button>
        </div>
      ) : null}
      {detail ? (
        <section className="panel" aria-label="Current collection status">
          <h2>{detail.collection.name}</h2>
          <p>
            Reviewed membership version {detail.collection.version} · changed by{" "}
            {detail.collection.updatedByUid} at{" "}
            {formatBusinessTimestamp(detail.collection.updatedAt)}.
          </p>
          <p>
            Membership source read{" "}
            {formatBusinessTimestamp(detail.collection.sourceReadAt)}. Current status read{" "}
            {detail.readAt ? formatBusinessTimestamp(detail.readAt) : "unavailable"}.
          </p>
          {detail.issues.map((issue) => (
            <p role="status" key={issue}>
              {issue}
            </p>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void open(detail.collection.id, false)}
          >
            Refresh current status
          </button>
          <ul>
            {detail.statuses.map((status) => (
              <li key={`${status.member.leaseId}:${status.member.cycleKey}`}>
                {status.href ? (
                  <Link href={status.href}>{status.label}</Link>
                ) : (
                  status.label
                )}{" "}
                · lease {status.member.leaseId} · saved cycle{" "}
                {status.member.cycleDate ?? "no dated basis"} ·{" "}
                {status.state === "cycle_changed"
                  ? "Cycle changed; saved membership is kept"
                  : status.state === "unavailable"
                    ? "Unavailable; saved membership is kept"
                    : `${status.lifecycle}; ${status.workStatus}`}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="panel" aria-label="Collection membership editor">
        <h2>
          {detail
            ? "Review membership or name changes"
            : "Name and review a monthly lease group"}
        </h2>
        <fieldset disabled={busy || !!pending} className="ui-stack">
          <label className="field">
            Collection name
            <input
              value={name}
              maxLength={160}
              onChange={(e) => {
                setName(e.target.value);
                changed();
              }}
            />
          </label>
          {detail ? (
            <button
              type="button"
              disabled={!name.trim() || name.trim() === detail.collection.name}
              onClick={rename}
            >
              Save collection name
            </button>
          ) : null}
          <label className="field">
            Membership selection
            <select
              value={basis.mode}
              onChange={(e) => {
                setBasis({ ...basis, mode: e.target.value as CollectionBasis["mode"] });
                changed();
              }}
            >
              <option value="period">Matching period and recorded filters</option>
              <option value="explicit">These explicitly selected lease IDs</option>
            </select>
          </label>
          <label className="field">
            Date field
            <select
              value={basis.dateField}
              onChange={(e) => {
                setBasis({
                  ...basis,
                  dateField: e.target.value as CollectionBasis["dateField"],
                });
                changed();
              }}
            >
              <option value="lease_end">RentVine lease end</option>
              <option value="annual_review">Month-to-month annual review</option>
            </select>
          </label>
          <label className="field">
            Period from
            <input
              type="date"
              value={basis.from}
              onChange={(e) => {
                setBasis({ ...basis, from: e.target.value });
                changed();
              }}
            />
          </label>
          <label className="field">
            Period through
            <input
              type="date"
              value={basis.through}
              onChange={(e) => {
                setBasis({ ...basis, through: e.target.value });
                changed();
              }}
            />
          </label>
          <label className="field">
            Selected lease IDs
            <textarea
              value={memberText}
              onChange={(e) => {
                setMemberText(e.target.value);
                changed();
              }}
            />
          </label>
          <p>
            Selection basis: {basis.origin}.{" "}
            {basis.mode === "period"
              ? "Refresh membership recomputes this period and the recorded worklist filters."
              : "Refresh membership checks these identified leases and their current cycles."}
          </p>
          {basis.criteria ? (
            <details>
              <summary>Recorded worklist filters</summary>
              <p>{new URLSearchParams(basis.criteria).toString()}</p>
            </details>
          ) : null}
          <button type="button" onClick={() => void prepare()}>
            {detail ? "Refresh membership for review" : "Review monthly leases"}
          </button>
        </fieldset>
        {review ? (
          <section aria-label="Reviewed membership">
            <h3>Reviewed membership</h3>
            <p>
              {review.name} ·{" "}
              {review.basis.dateField === "lease_end"
                ? "RentVine lease end"
                : "Annual review"}{" "}
              · {review.basis.from} through {review.basis.through} ·{" "}
              {review.members.length} members.
            </p>
            <h4>Additions ({review.added.length})</h4>
            <ul>
              {review.added.map((m) => (
                <li key={`${m.leaseId}:${m.cycleKey}`}>
                  Lease {m.leaseId} · cycle {m.cycleDate ?? m.cycleKey}
                </li>
              ))}
            </ul>
            <h4>Removals ({review.removed.length})</h4>
            <ul>
              {review.removed.map((m) => (
                <li key={`${m.leaseId}:${m.cycleKey}`}>
                  Lease {m.leaseId} · cycle {m.cycleDate ?? m.cycleKey}
                </li>
              ))}
            </ul>
            <details>
              <summary>All reviewed members</summary>
              <ul>
                {review.members.map((m) => (
                  <li key={`${m.leaseId}:${m.cycleKey}`}>
                    Lease {m.leaseId} · cycle {m.cycleDate ?? m.cycleKey}
                  </li>
                ))}
              </ul>
            </details>
            <button
              type="button"
              disabled={busy || !!pending}
              onClick={() => void save()}
            >
              Save reviewed collection
            </button>
          </section>
        ) : null}
      </section>
    </div>
  );
}
