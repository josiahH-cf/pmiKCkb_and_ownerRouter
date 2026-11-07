"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Field } from "@/components/ui";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { formatBusinessTimestamp, formatCalendarDate } from "@/lib/date-display";
import {
  CollectionBasisSchema,
  CollectionLeaseIdSchema,
  CollectionRenameSchema,
  sharedCollectionDeskHref,
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
type LeaseChoice = { leaseId: string; label: string; cycleDate: string | null };
type NamedReview = { review: CollectionReview; labels?: Record<string, string> };
type Draft = {
  name: string;
  basis: CollectionBasis;
  memberText: string;
  savedAt: number;
};

function emptyBasis(): CollectionBasis {
  return {
    mode: "explicit",
    origin: "explicit",
    dateField: "lease_end",
    from: "",
    through: "",
    criteria: "",
    selectedLeaseIds: [],
  };
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
      mode: "explicit",
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
  const [editing, setEditing] = useState(
    initialMembers.length > 0 || Boolean(initialReview),
  );
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [choices, setChoices] = useState<LeaseChoice[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [lookupStatus, setLookupStatus] = useState("");
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [validationAttempted, setValidationAttempted] = useState(false);
  const fieldId = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const fromInput = useRef<HTMLInputElement>(null);
  const throughInput = useRef<HTMLInputElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const collectionHeading = useRef<HTMLHeadingElement>(null);
  const selectedIds = [...new Set(memberText.split(/[,\s]+/).filter(Boolean))];
  const draftKey = (collectionId: string | null) =>
    `renewal-collection-draft:${ownerUid}:${collectionId ?? "new"}`;

  function keepDraft() {
    try {
      sessionStorage.setItem(
        draftKey(detail?.collection.id ?? null),
        JSON.stringify({
          name,
          basis,
          memberText,
          savedAt: Date.now(),
        }),
      );
    } catch {
      /* The tab can continue with the visible form. */
    }
  }

  function clearDraft(collectionId: string | null) {
    try {
      sessionStorage.removeItem(draftKey(collectionId));
    } catch {}
  }

  function restoreDraft(collectionId: string | null) {
    try {
      const draft = JSON.parse(
        sessionStorage.getItem(draftKey(collectionId)) ?? "null",
      ) as Draft | null;
      if (
        !draft ||
        Date.now() - draft.savedAt > 30 * 60_000 ||
        typeof draft.name !== "string" ||
        typeof draft.memberText !== "string"
      )
        return false;
      const valid = CollectionBasisSchema.safeParse({
        ...draft.basis,
        from: draft.basis.from || "2000-01-01",
        through: draft.basis.through || draft.basis.from || "2000-01-01",
      });
      if (!valid.success) return false;
      setName(draft.name);
      setBasis(draft.basis);
      setMemberText(draft.memberText);
      setEditing(true);
      setNotice(
        "Local collection inputs restored. Review the current membership before saving.",
      );
      return true;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    if (!editing) return;
    const saveDraft = () => keepDraft();
    window.addEventListener("pagehide", saveDraft);
    return () => window.removeEventListener("pagehide", saveDraft);
  });

  useEffect(() => {
    if (review) reviewHeading.current?.focus();
  }, [review]);

  async function lookup(query: string, imported = false) {
    setLookingUp(true);
    setLookupStatus("Reading accessible leases…");
    try {
      const result = await read<{ leases: LeaseChoice[]; complete: boolean }>(query);
      if (!live.current) return;
      setLabels((old) => ({
        ...old,
        ...Object.fromEntries(result.leases.map((row) => [row.leaseId, row.label])),
      }));
      if (!imported) setChoices(result.leases);
      setLookupStatus(
        !result.complete
          ? "The current source read is incomplete. Review waits for a complete read."
          : result.leases.length === 0
            ? "No accessible leases matched."
            : `${result.leases.length} leases found.`,
      );
    } catch {
      if (live.current) setLookupStatus("Lease lookup failed. Search again to retry.");
    } finally {
      if (live.current) setLookingUp(false);
    }
  }
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
    setLoading(true);
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
    } finally {
      if (live.current) setLoading(false);
    }
  }
  async function open(collectionId: string, edit = true) {
    const generation = ++readGeneration.current;
    setNotice("Reading saved members and current statuses…");
    try {
      const result = await read<Detail>(`id=${collectionId}`);
      if (!live.current || generation !== readGeneration.current) return;
      setDetail(result);
      setId(collectionId);
      setLabels((old) => ({
        ...old,
        ...Object.fromEntries(
          result.statuses
            .filter((status) => status.href)
            .map((status) => [status.member.leaseId, status.label]),
        ),
      }));
      setNotice("Current statuses read. Saved membership is kept.");
      if (edit) {
        setName(result.collection.name);
        setBasis(result.collection.basis);
        setMemberText(result.collection.basis.selectedLeaseIds.join(", "));
        setReview(null);
        setPending(null);
        setEditing(false);
        setRenaming(false);
        setChoices([]);
        address(collectionId);
        restoreDraft(collectionId);
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
      if (initialMembers.length > 0)
        void lookup(
          new URLSearchParams({ ids: initialMembers.join(",") }).toString(),
          true,
        );
      if (!initialId) restoreDraft(null);
      if (initialId) void open(initialId, !initialOperation && !initialReview);
      if (initialReview) {
        void read<NamedReview>(`review=${initialReview}`).then(
          (result) => {
            if (!live.current || restoring !== restoreGeneration.current) return;
            setReview(result.review);
            setId(result.review.collectionId);
            setEditing(true);
            setName(result.review.name);
            setBasis(result.review.basis);
            setMemberText(result.review.basis.selectedLeaseIds.join(", "));
            setLabels((old) => ({ ...old, ...result.labels }));
          },
          () => {
            if (!live.current || restoring !== restoreGeneration.current) return;
            restoreDraft(initialId);
            setError(
              "The prior review is unavailable or out of date. Review the current membership again.",
            );
            if (!initialOperation) address(initialId);
          },
        );
      }
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
        void checkReceipt(restored);
      }
    });
    // Mount reads only: neither review nor save runs as a consequence of navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function changed() {
    if (review) address(detail?.collection.id ?? null);
    setReview(null);
    setNotice("");
    setError("");
    setValidationAttempted(false);
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
      setValidationAttempted(true);
      if (!name.trim() || !basis.from || !basis.through) {
        const first = !name.trim() ? nameInput : !basis.from ? fromInput : throughInput;
        first.current?.focus();
        throw new Error(
          "Complete the required collection fields before reviewing membership.",
        );
      }
      const selectedLeaseIds = selectedIds;
      const parsed = CollectionBasisSchema.safeParse({ ...basis, selectedLeaseIds });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues[0]?.message ??
            "Choose a date field, period and actual lease selection.",
        );
      const collectionId = id ?? crypto.randomUUID();
      const result = await post<NamedReview>({
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
      setLabels((old) => ({ ...old, ...result.labels }));
      keepDraft();
      address(detail?.collection.id ?? null, result.review.id);
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
        clearDraft(detail?.collection.id ?? null);
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
    if (!detail || !newName.trim()) return;
    void save({
      operationId: crypto.randomUUID(),
      rename: {
        collectionId: detail.collection.id,
        expectedVersion: detail.collection.version,
        name: newName.trim(),
      },
    });
  }
  function newCollection() {
    readGeneration.current++;
    setId(null);
    setDetail(null);
    clearDraft(null);
    setName("");
    setBasis(emptyBasis());
    setMemberText("");
    setChoices([]);
    setSearchText("");
    setEditing(true);
    setRenaming(false);
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
        {loading ? <p role="status">Loading collections…</p> : null}
        {!loading && !listError && entries.length === 0 ? (
          <p>Choose New collection to review your first group.</p>
        ) : null}
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
                onClick={() => {
                  if (editing) keepDraft();
                  void open(entry.id);
                }}
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
          <h2 ref={collectionHeading} tabIndex={-1}>
            {detail.collection.name}
          </h2>
          <p>
            {formatCalendarDate(detail.collection.basis.from)} through{" "}
            {formatCalendarDate(detail.collection.basis.through)}
            {" · "}
            {detail.collection.members.length} saved members.
          </p>
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
            Refresh statuses
          </button>{" "}
          <button
            type="button"
            disabled={busy || !!pending}
            onClick={() => setEditing(true)}
          >
            Edit membership
          </button>{" "}
          <button
            type="button"
            disabled={busy || !!pending}
            onClick={() => {
              setNewName(detail.collection.name);
              setRenaming(true);
            }}
          >
            Rename collection
          </button>
          {renaming ? (
            <div className="ui-stack-tight">
              <label className="field">
                New collection name
                <input
                  maxLength={160}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={
                  !newName.trim() || newName.trim() === detail.collection.name || busy
                }
                onClick={rename}
              >
                Save collection name
              </button>
              <button type="button" onClick={() => setRenaming(false)}>
                Cancel rename
              </button>
            </div>
          ) : null}
          {/* S246 R-S246-9: the shared collection link opens the table on exactly these leases. */}
          <p>
            <Link href={sharedCollectionDeskHref(detail.collection.id)}>
              Open this collection on the Renewals desk
            </Link>
          </p>
          <div className="renewal-batch-table-scroll">
            <table className="renewal-batch-table">
              <caption className="sr-only">Saved members</caption>
              <thead>
                <tr>
                  <th scope="col">Lease</th>
                  <th scope="col">Saved cycle</th>
                  <th scope="col">Current status</th>
                </tr>
              </thead>
              <tbody>
                {detail.statuses.map((status) => (
                  <tr key={`${status.member.leaseId}:${status.member.cycleKey}`}>
                    <th scope="row">
                      {status.href ? (
                        <Link href={status.href}>{status.label}</Link>
                      ) : (
                        status.label
                      )}{" "}
                      · Lease {status.member.leaseId}
                    </th>
                    <td>
                      {formatCalendarDate(status.member.cycleDate, "No dated basis")}
                    </td>
                    <td>
                      {status.state === "cycle_changed"
                        ? "Cycle changed; saved membership is kept"
                        : status.state === "unavailable"
                          ? "Unavailable; saved membership is kept"
                          : `${status.lifecycle} · ${status.workStatus}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {editing ? (
        <section className="panel" aria-label="Collection membership editor">
          <h2>{detail ? "Edit membership" : "Name and review a monthly lease group"}</h2>
          <fieldset disabled={busy || !!pending} className="ui-stack">
            <Field
              htmlFor={`${fieldId}-name`}
              label="Collection name"
              required
              error={
                validationAttempted && !name.trim()
                  ? "Enter a collection name."
                  : undefined
              }
            >
              <input
                id={`${fieldId}-name`}
                ref={nameInput}
                required
                value={name}
                maxLength={160}
                onChange={(e) => {
                  setName(e.target.value);
                  changed();
                }}
              />
            </Field>
            <label className="field">
              Membership selection
              <select
                value={basis.mode}
                onChange={(e) => {
                  setBasis({ ...basis, mode: e.target.value as CollectionBasis["mode"] });
                  changed();
                }}
              >
                <option value="explicit">Choose leases</option>
                <option value="period">Match a period</option>
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
            <Field
              htmlFor={`${fieldId}-from`}
              label="Period from"
              required
              error={
                validationAttempted && !basis.from ? "Choose Period from." : undefined
              }
            >
              <input
                id={`${fieldId}-from`}
                ref={fromInput}
                required
                type="date"
                value={basis.from}
                onChange={(e) => {
                  setBasis({ ...basis, from: e.target.value });
                  changed();
                }}
              />
            </Field>
            <Field
              htmlFor={`${fieldId}-through`}
              label="Period through"
              required
              error={
                validationAttempted && !basis.through
                  ? "Choose Period through."
                  : undefined
              }
            >
              <input
                id={`${fieldId}-through`}
                ref={throughInput}
                required
                type="date"
                value={basis.through}
                onChange={(e) => {
                  setBasis({ ...basis, through: e.target.value });
                  changed();
                }}
              />
            </Field>
            {basis.mode === "explicit" ? (
              <div className="ui-stack-tight">
                <label className="field">
                  Find leases by address, name or lease ID
                  <input
                    value={searchText}
                    maxLength={160}
                    onChange={(event) => setSearchText(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={!searchText.trim() || lookingUp}
                  onClick={() =>
                    void lookup(new URLSearchParams({ search: searchText }).toString())
                  }
                >
                  Search leases
                </button>
                {lookupStatus ? <p role="status">{lookupStatus}</p> : null}
                <ul>
                  {choices.map((row) => (
                    <li key={row.leaseId}>
                      {row.label} · Lease {row.leaseId} ·{" "}
                      {formatCalendarDate(row.cycleDate)}{" "}
                      <button
                        type="button"
                        disabled={selectedIds.includes(row.leaseId)}
                        onClick={() => {
                          setMemberText([...selectedIds, row.leaseId].join(", "));
                          changed();
                        }}
                      >
                        Add {row.label}
                      </button>
                    </li>
                  ))}
                </ul>
                {initialMembers.length > 0 && !detail ? (
                  <p>
                    {initialMembers.length} leases were offered by the source selection.
                  </p>
                ) : null}
                <ul aria-label="Selected leases">
                  {selectedIds
                    .filter((id) => CollectionLeaseIdSchema.safeParse(id).success)
                    .map((id) => (
                      <li key={id}>
                        {labels[id] ?? `Lease ${id}`}{" "}
                        <button
                          type="button"
                          onClick={() => {
                            setMemberText(
                              selectedIds.filter((member) => member !== id).join(", "),
                            );
                            changed();
                          }}
                        >
                          Remove {labels[id] ?? `lease ${id}`}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
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
            {basis.mode === "period" && basis.criteria ? (
              <details>
                <summary>Recorded worklist filters</summary>
                <ul>
                  {[...new URLSearchParams(basis.criteria)]
                    .filter(([key]) => key !== "v")
                    .map(([key, value]) => (
                      <li key={key}>
                        {key === "ownerKey"
                          ? "Selected owner"
                          : key === "tenantKey"
                            ? "Selected tenant"
                            : `${key.replace(/([a-z])([A-Z])/g, "$1 $2")}: ${value.replaceAll("_", " ")}`}
                      </li>
                    ))}
                </ul>
              </details>
            ) : null}
            <button type="button" onClick={() => void prepare()}>
              Review membership
            </button>
            <div className="ui-row">
              <button
                type="button"
                onClick={() => {
                  keepDraft();
                  setEditing(false);
                }}
              >
                Keep local changes and close
              </button>
              <button
                type="button"
                onClick={() => {
                  clearDraft(detail?.collection.id ?? null);
                  if (detail) void open(detail.collection.id);
                  else {
                    newCollection();
                    setEditing(false);
                  }
                }}
              >
                Discard changes
              </button>
            </div>
          </fieldset>
          {review ? (
            <section aria-label="Reviewed membership">
              <h3 ref={reviewHeading} tabIndex={-1}>
                Reviewed membership
              </h3>
              <p>
                {review.name} ·{" "}
                {review.expectedVersion
                  ? `From version ${review.expectedVersion}`
                  : "New collection"}{" "}
                ·{" "}
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
                    {labels[m.leaseId] ?? "Lease"} · {m.leaseId} · cycle{" "}
                    {formatCalendarDate(m.cycleDate, "No dated basis")}
                  </li>
                ))}
              </ul>
              <h4>Removals ({review.removed.length})</h4>
              <ul>
                {review.removed.map((m) => (
                  <li key={`${m.leaseId}:${m.cycleKey}`}>
                    {labels[m.leaseId] ?? "Lease"} · {m.leaseId} · cycle{" "}
                    {formatCalendarDate(m.cycleDate, "No dated basis")}
                  </li>
                ))}
              </ul>
              <details>
                <summary>All reviewed members</summary>
                <ul>
                  {review.members.map((m) => (
                    <li key={`${m.leaseId}:${m.cycleKey}`}>
                      {labels[m.leaseId] ?? "Lease"} · {m.leaseId} · cycle{" "}
                      {formatCalendarDate(m.cycleDate, "No dated basis")}
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
      ) : null}
    </div>
  );
}
