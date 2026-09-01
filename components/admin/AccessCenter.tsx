"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { Button, ConfirmationDialog, Field, Notice, StatusPill } from "@/components/ui";
import { can, type Capability, type Role } from "@/lib/auth/roles";
import {
  ACCESS_CAPABILITIES,
  ACCESS_CAPABILITY_CATALOG,
  ACCESS_ROLE_CATALOG,
  ACCESS_SPACE_CATALOG,
  capabilityCatalogEntry,
  spaceCatalogEntry,
} from "@/lib/access/catalog";
import {
  AccessRequestPreviewResponseSchema,
  AccessRequestReceiptSchema,
  AccessRequestSubmitResponseSchema,
  accessIntentLabel,
  type AccessIntentV1,
  type AccessRequestPreviewV1,
  type AccessRequestReceiptV1,
} from "@/lib/access/contracts";
import type { AccessEffectiveProjectionV1 } from "@/lib/access/projection";
import type { AccessRequestHistoryItem } from "@/lib/access/request-store";
import type { SpaceScope } from "@/lib/constants";
import { CONNECTION_TASK_GROUPS } from "@/lib/navigation/admin-connections";

type RequestKind = "capability" | "role" | "spaces";
type SubmissionState = "idle" | "not_committed" | "unknown";

export interface AccessPreselection {
  readonly capability: Capability;
  readonly space?: SpaceScope;
  readonly returnTo?: string;
}

export function AccessCenter({
  projection,
  currentScopes,
  initialHistory,
  historyUnavailable,
  reviewerAvailable,
  preselection,
  preselectionNotice,
  isAdmin,
}: Readonly<{
  projection: AccessEffectiveProjectionV1;
  currentScopes?: readonly SpaceScope[];
  initialHistory: {
    readonly items: readonly AccessRequestHistoryItem[];
    readonly next_cursor: string | null;
  } | null;
  historyUnavailable: boolean;
  reviewerAvailable: boolean | null;
  preselection?: AccessPreselection;
  preselectionNotice?: string;
  isAdmin: boolean;
}>) {
  const hasAllSpaces = currentScopes === undefined;
  const missingSpaces = ACCESS_SPACE_CATALOG.filter(
    (space) => !hasAllSpaces && !currentScopes?.includes(space.id),
  );
  const missingCapability = ACCESS_CAPABILITIES.find(
    (capability) => !can(projection.role, capability),
  );
  const firstCapability = preselection?.capability ?? missingCapability ?? "read";
  const initialKind: RequestKind =
    preselection || missingCapability
      ? "capability"
      : missingSpaces.length || !hasAllSpaces
        ? "spaces"
        : "capability";
  const [kind, setKind] = useState<RequestKind>(initialKind);
  const [catalogKey, setCatalogKey] = useState<string>(firstCapability);
  const [scopeKind, setScopeKind] = useState<"global" | "named_spaces" | "all_spaces">(
    preselection?.space
      ? "named_spaces"
      : initialKind === "spaces"
        ? missingSpaces.length
          ? "named_spaces"
          : "all_spaces"
        : "global",
  );
  const [selectedSpaces, setSelectedSpaces] = useState<SpaceScope[]>(
    preselection?.space
      ? [preselection.space]
      : initialKind === "spaces" && missingSpaces[0]
        ? [missingSpaces[0].id]
        : [],
  );
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [spaceError, setSpaceError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "submit" | "history" | "cancel" | null>(
    null,
  );
  const [reviewed, setReviewed] = useState<{
    attempt_id: string;
    preview_hash: string;
    expires_at: string;
    preview: AccessRequestPreviewV1;
  } | null>(null);
  const [recoveryCommand, setRecoveryCommand] = useState<{
    schema_version: "access-request-submit-command-v1";
    attempt_id: string;
    preview_hash: string;
  } | null>(null);
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [receipt, setReceipt] = useState<AccessRequestReceiptV1 | null>(null);
  const [notice, setNotice] = useState<{
    tone: "status" | "success" | "caution" | "error";
    text: string;
  } | null>(null);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [history, setHistory] = useState<AccessRequestHistoryItem[]>(
    initialHistory?.items ? [...initialHistory.items] : [],
  );
  const [nextCursor, setNextCursor] = useState(initialHistory?.next_cursor ?? null);
  const [historyError, setHistoryError] = useState(historyUnavailable);
  const [cancelTarget, setCancelTarget] = useState<AccessRequestHistoryItem | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const historyHeadingRef = useRef<HTMLHeadingElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const firstRequestableSpaceRef = useRef<HTMLInputElement>(null);

  const accessIncreasingOptions = useMemo(() => {
    const missingCapability = ACCESS_CAPABILITIES.some(
      (capability) => !can(projection.role, capability),
    );
    const higherRole = ACCESS_ROLE_CATALOG.some(
      (entry) => roleRank(entry.key) > roleRank(projection.role),
    );
    const missingNamedSpace =
      !hasAllSpaces &&
      ACCESS_SPACE_CATALOG.some((space) => !currentScopes?.includes(space.id));
    return missingCapability || higherRole || missingNamedSpace || !hasAllSpaces;
  }, [currentScopes, hasAllSpaces, projection.role]);

  useEffect(() => {
    if (window.location.hash === "#my-requests") {
      historyHeadingRef.current?.scrollIntoView({ block: "start" });
      historyHeadingRef.current?.focus();
    }
  }, [historyError]);

  function resetReview() {
    setReviewed(null);
    setReceipt(null);
    setRecoveryCommand(null);
    setSubmissionState("idle");
    setNotice(null);
    setPreviewUnavailable(false);
  }

  function changeKind(nextKind: RequestKind) {
    resetReview();
    setKind(nextKind);
    if (nextKind === "capability") {
      setCatalogKey(firstCapability);
      setScopeKind(preselection?.space ? "named_spaces" : "global");
    } else if (nextKind === "role") {
      setCatalogKey(
        ACCESS_ROLE_CATALOG.find((role) => roleRank(role.key) > roleRank(projection.role))
          ?.key ?? "Admin",
      );
      setScopeKind("global");
      setSelectedSpaces([]);
    } else {
      setCatalogKey("named_spaces");
      if (missingSpaces[0]) {
        setScopeKind("named_spaces");
        setSelectedSpaces([missingSpaces[0].id]);
      } else {
        setScopeKind("all_spaces");
        setSelectedSpaces([]);
      }
    }
  }

  function buildIntent(): AccessIntentV1 | null {
    if (kind === "capability") {
      const capability = catalogKey as Capability;
      if (scopeKind === "named_spaces" && selectedSpaces.length === 0) {
        setSpaceError("Choose at least one Space.");
        firstRequestableSpaceRef.current?.focus();
        return null;
      }
      return {
        schema_version: "access-intent-v1",
        intent_kind: "capability",
        catalog_version: "catalog-v1",
        catalog_key: capability,
        scope:
          scopeKind === "named_spaces"
            ? { kind: "named_spaces", space_ids: selectedSpaces }
            : { kind: "global", space_ids: [] },
      };
    }
    if (kind === "role") {
      return {
        schema_version: "access-intent-v1",
        intent_kind: "role",
        catalog_version: "catalog-v1",
        catalog_key: catalogKey,
        scope: { kind: "global", space_ids: [] },
      };
    }
    if (scopeKind === "all_spaces") {
      return {
        schema_version: "access-intent-v1",
        intent_kind: "spaces",
        catalog_version: "catalog-v1",
        catalog_key: "all_spaces",
        scope: { kind: "all_spaces", space_ids: [] },
      };
    }
    if (!selectedSpaces.length) {
      setSpaceError("Choose at least one Space.");
      firstRequestableSpaceRef.current?.focus();
      return null;
    }
    return {
      schema_version: "access-intent-v1",
      intent_kind: "spaces",
      catalog_version: "catalog-v1",
      catalog_key: "named_spaces",
      scope: { kind: "named_spaces", space_ids: selectedSpaces },
    };
  }

  async function requestPreview() {
    setFieldError(null);
    setSpaceError(null);
    setNotice(null);
    setPreviewUnavailable(false);
    const intent = buildIntent();
    if (!intent) return;
    if (Array.from(reason.trim()).length < 10) {
      setFieldError("Describe the staff duty in at least 10 characters.");
      reasonRef.current?.focus();
      return;
    }
    setBusy("preview");
    try {
      const response = await fetch("/api/admin/access/requests/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema_version: "access-request-preview-command-v1",
          intent,
          reason,
        }),
      });
      const body = await response.json().catch(() => null);
      if (response.status !== 200) {
        setPreviewUnavailable(true);
        setNotice({
          tone: "error",
          text: readError(body, "Access options are unavailable. Retry access options."),
        });
        return;
      }
      const parsed = AccessRequestPreviewResponseSchema.safeParse(body);
      if (!parsed.success) {
        setPreviewUnavailable(true);
        setNotice({
          tone: "error",
          text: "Access options are unavailable. Retry access options.",
        });
        return;
      }
      if (parsed.data.status === "existing_request") {
        setReceipt(parsed.data.request);
        setNotice({
          tone: "status",
          text: "An active request already covers this access need.",
        });
        queueMicrotask(() => receiptRef.current?.focus());
        return;
      }
      setReviewed(parsed.data);
      setRecoveryCommand(null);
      setSubmissionState("idle");
      setNotice({
        tone: "status",
        text: "Review the exact access bundle before submitting.",
      });
    } catch {
      setPreviewUnavailable(true);
      setNotice({
        tone: "error",
        text: "Access options are unavailable. Retry access options.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function submitReviewed() {
    if (!reviewed) return;
    const command = {
      schema_version: "access-request-submit-command-v1" as const,
      attempt_id: reviewed.attempt_id,
      preview_hash: reviewed.preview_hash,
    };
    setRecoveryCommand(command);
    await submitExact(command);
  }

  async function submitExact(command: NonNullable<typeof recoveryCommand>) {
    setBusy("submit");
    setNotice(null);
    let dispatched = false;
    try {
      dispatched = true;
      const response = await fetch("/api/admin/access/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const body = await response.json().catch(() => null);
      const parsed = AccessRequestSubmitResponseSchema.safeParse(body);
      if (!parsed.success || !httpMatchesSubmit(response.status, parsed.data.status)) {
        setSubmissionState("unknown");
        setNotice({ tone: "caution", text: "Request status was not received." });
        return;
      }
      const result = parsed.data;
      if (
        result.status === "created" ||
        result.status === "replayed" ||
        result.status === "existing_request"
      ) {
        setReceipt(result.request);
        setHistory((current) =>
          deduplicateHistory([
            {
              ...result.request,
              requester_reason: reviewed?.preview.reason ?? reason,
            },
            ...current,
          ]),
        );
        setReviewed(null);
        setRecoveryCommand(null);
        setSubmissionState("idle");
        setNotice({
          tone: result.status === "created" ? "success" : "status",
          text: result.message,
        });
        queueMicrotask(() => receiptRef.current?.focus());
        return;
      }
      if (result.status === "stale_preview") {
        setReviewed(null);
        setRecoveryCommand(null);
        setSubmissionState("idle");
        setNotice({
          tone: "caution",
          text: "Request status could not be confirmed. Start a new preview.",
        });
      } else if (result.status === "idempotency_conflict") {
        setReviewed(null);
        setRecoveryCommand(null);
        setSubmissionState("idle");
        setNotice({ tone: "error", text: result.message });
      } else {
        setSubmissionState(result.commit_state);
        setNotice({
          tone: result.commit_state === "unknown" ? "caution" : "error",
          text:
            result.commit_state === "unknown"
              ? "Request status was not received."
              : "Your request was not submitted.",
        });
      }
    } catch {
      if (dispatched) {
        setSubmissionState("unknown");
        setNotice({ tone: "caution", text: "Request status was not received." });
      }
    } finally {
      setBusy(null);
    }
  }

  async function loadOlder() {
    if (!nextCursor) return;
    setBusy("history");
    setHistoryError(false);
    try {
      const response = await fetch(
        `/api/admin/access/requests?cursor=${encodeURIComponent(nextCursor)}&limit=50`,
      );
      const body = await response.json().catch(() => null);
      const page = parseHistoryPage(body);
      if (!response.ok || !page) throw new Error("history");
      setHistory((current) => deduplicateHistory([...current, ...page.items]));
      setNextCursor(page.next_cursor);
    } catch {
      setHistoryError(true);
    } finally {
      setBusy(null);
    }
  }

  async function retryHistory() {
    setBusy("history");
    setHistoryError(false);
    try {
      const response = await fetch("/api/admin/access/requests?limit=50");
      const body = await response.json().catch(() => null);
      const page = parseHistoryPage(body);
      if (!response.ok || !page) throw new Error("history");
      setHistory(page.items);
      setNextCursor(page.next_cursor);
      setNotice({ tone: "status", text: "Request history refreshed." });
    } catch {
      setHistoryError(true);
    } finally {
      setBusy(null);
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    setBusy("cancel");
    try {
      const response = await fetch(
        `/api/admin/access/requests/${encodeURIComponent(cancelTarget.request_ref)}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schema_version: "access-request-cancel-command-v1",
            request_version: cancelTarget.request_version,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      const parsed = AccessRequestReceiptSchema.safeParse(body);
      if (!response.ok || !parsed.success) throw new Error("cancel");
      setHistory((current) =>
        current.map((item) =>
          item.request_ref === parsed.data.request_ref
            ? { ...item, ...parsed.data }
            : item,
        ),
      );
      setNotice({ tone: "success", text: "Access request cancelled." });
      setCancelTarget(null);
    } catch {
      setNotice({
        tone: "error",
        text: readError(null, "The request could not be cancelled."),
      });
    } finally {
      setBusy(null);
    }
  }

  const capabilityEntry =
    kind === "capability" ? capabilityCatalogEntry(catalogKey as Capability) : null;

  return (
    <div className="access-center ui-stack">
      <section
        aria-labelledby="my-access-heading"
        className="panel ui-stack access-task-region"
      >
        <div className="ui-spread">
          <div>
            <p className="eyebrow">Current session</p>
            <h2 id="my-access-heading">My access</h2>
          </div>
          <StatusPill value={projection.role}>{projection.role}</StatusPill>
        </div>
        <div className="access-summary-grid">
          <div>
            <strong>Role</strong>
            <p>{projection.role}</p>
          </div>
          <div>
            <strong>Spaces</strong>
            <p>
              {projection.space_access.kind === "all_spaces"
                ? "All spaces"
                : projection.space_access.labels.join(", ")}
            </p>
          </div>
        </div>
        <div>
          <strong>Inherited capabilities</strong>
          <ul className="compact-list">
            {projection.capability_labels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
        {projection.directory_sync_state === "refresh_required" ? (
          <Notice tone="caution">
            <p>Your access was updated. Sign out and back in to use the latest access.</p>
            <SignOutButton />
          </Notice>
        ) : projection.directory_sync_state === "unavailable" ? (
          <Notice
            actionLabel="Retry latest access"
            onAction={() => window.location.reload()}
            tone="caution"
          >
            Current session access is shown. Newer access changes could not be checked.
          </Notice>
        ) : (
          <Notice tone="success">
            Current session access matches the latest directory.
          </Notice>
        )}
        <p className="muted">
          Role and Space access do not open closed actions, bypass provider readiness, or
          remove required human confirmation.
        </p>
      </section>

      <section
        aria-labelledby="request-access-heading"
        className="panel ui-stack access-task-region"
      >
        <div>
          <p className="eyebrow">Additive access only</p>
          <h2 id="request-access-heading">Request access</h2>
          <p>What do you need to do?</p>
        </div>
        {preselectionNotice ? <Notice tone="caution">{preselectionNotice}</Notice> : null}
        {reviewerAvailable === false ? (
          <Notice tone="caution">Admin review is unavailable</Notice>
        ) : reviewerAvailable === null ? (
          <Notice tone="caution">Admin review availability could not be checked.</Notice>
        ) : null}
        {!accessIncreasingOptions ? (
          <p>
            You already have every role and Space available through this request workflow.
          </p>
        ) : (
          <div className="access-request-form ui-stack">
            <fieldset className="access-choice-group">
              <legend>Request type</legend>
              {(["capability", "role", "spaces"] as const).map((option) => (
                <label key={option}>
                  <input
                    checked={kind === option}
                    name="access-kind"
                    onChange={() => changeKind(option)}
                    type="radio"
                  />
                  {option === "capability"
                    ? "A staff task"
                    : option === "role"
                      ? "A higher role"
                      : "Space access"}
                </label>
              ))}
            </fieldset>

            {kind === "capability" ? (
              <Field
                hint={
                  capabilityEntry
                    ? `${capabilityEntry.impact} Minimum role: ${capabilityEntry.minimumRole}.`
                    : undefined
                }
                htmlFor="access-capability"
                label="Staff task"
                required
              >
                <select
                  value={catalogKey}
                  onChange={(event) => {
                    resetReview();
                    const nextKey = event.target.value as Capability;
                    setCatalogKey(nextKey);
                    const next = capabilityCatalogEntry(nextKey);
                    if (!next.namedSpaceRequestable) {
                      setScopeKind("global");
                      setSelectedSpaces([]);
                    } else if (can(projection.role, nextKey) && missingSpaces[0]) {
                      setScopeKind("named_spaces");
                      setSelectedSpaces([missingSpaces[0].id]);
                    } else {
                      setScopeKind("global");
                      setSelectedSpaces([]);
                    }
                  }}
                >
                  {ACCESS_CAPABILITY_CATALOG.map((entry) => (
                    <option
                      disabled={
                        can(projection.role, entry.key) &&
                        (!entry.namedSpaceRequestable || missingSpaces.length === 0)
                      }
                      key={entry.key}
                      value={entry.key}
                    >
                      {entry.label}
                      {can(projection.role, entry.key) ? " (current role)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
            ) : kind === "role" ? (
              <Field htmlFor="access-role" label="Higher role" required>
                <select
                  value={catalogKey}
                  onChange={(event) => {
                    resetReview();
                    setCatalogKey(event.target.value);
                  }}
                >
                  {ACCESS_ROLE_CATALOG.map((entry) => (
                    <option
                      disabled={roleRank(entry.key) <= roleRank(projection.role)}
                      key={entry.key}
                      value={entry.key}
                    >
                      {entry.label}
                      {roleRank(entry.key) <= roleRank(projection.role)
                        ? " (current or lower)"
                        : ""}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {(kind === "spaces" || capabilityEntry?.namedSpaceRequestable) && (
              <fieldset
                aria-describedby={spaceError ? "access-space-error" : undefined}
                aria-invalid={spaceError ? true : undefined}
                className="access-choice-group"
              >
                <legend>
                  {kind === "spaces" ? "Space reach" : "Where is it needed?"}
                </legend>
                {kind === "capability" ? (
                  <label>
                    <input
                      checked={scopeKind === "global"}
                      name="access-scope-kind"
                      onChange={() => {
                        resetReview();
                        setScopeKind("global");
                        setSelectedSpaces([]);
                      }}
                      type="radio"
                    />
                    Use my current Space access
                  </label>
                ) : null}
                <label>
                  <input
                    checked={scopeKind === "named_spaces"}
                    name="access-scope-kind"
                    onChange={() => {
                      resetReview();
                      setScopeKind("named_spaces");
                    }}
                    type="radio"
                  />
                  Named Spaces
                </label>
                {kind === "spaces" ? (
                  <label>
                    <input
                      checked={scopeKind === "all_spaces"}
                      name="access-scope-kind"
                      onChange={() => {
                        resetReview();
                        setScopeKind("all_spaces");
                        setSelectedSpaces([]);
                      }}
                      type="radio"
                    />
                    All spaces. This also reaches future Spaces until an Admin narrows it
                  </label>
                ) : null}
              </fieldset>
            )}

            {scopeKind === "named_spaces" ? (
              <div className="ui-stack-tight">
                <fieldset
                  aria-describedby={spaceError ? "access-space-error" : undefined}
                  aria-invalid={spaceError ? true : undefined}
                  className="access-choice-group"
                >
                  <legend>Choose Spaces</legend>
                  {ACCESS_SPACE_CATALOG.map((space) => (
                    <label key={space.id}>
                      <input
                        checked={selectedSpaces.includes(space.id)}
                        disabled={hasAllSpaces || currentScopes?.includes(space.id)}
                        onChange={(event) => {
                          resetReview();
                          setSpaceError(null);
                          setSelectedSpaces((current) =>
                            event.target.checked
                              ? [...new Set([...current, space.id])]
                              : current.filter((id) => id !== space.id),
                          );
                        }}
                        ref={
                          space.id === missingSpaces[0]?.id
                            ? firstRequestableSpaceRef
                            : undefined
                        }
                        type="checkbox"
                      />
                      {space.label}
                      {hasAllSpaces || currentScopes?.includes(space.id)
                        ? " (current access)"
                        : ""}
                    </label>
                  ))}
                </fieldset>
                {spaceError ? (
                  <span className="field-error" id="access-space-error" role="alert">
                    {spaceError}
                  </span>
                ) : null}
              </div>
            ) : null}

            <Field
              error={fieldError}
              hint="Do not include resident, owner, lease, credential, or other customer details."
              htmlFor="access-reason"
              label="Describe the staff duty that needs this access."
              required
            >
              <textarea
                maxLength={500}
                onChange={(event) => {
                  resetReview();
                  setFieldError(null);
                  setReason(event.target.value);
                }}
                ref={reasonRef}
                rows={3}
                value={reason}
              />
            </Field>
            <Button
              busy={busy === "preview"}
              busyLabel="Preparing exact preview…"
              disabled={submissionState !== "idle"}
              onClick={requestPreview}
            >
              Preview access request
            </Button>
          </div>
        )}

        {reviewed ? (
          <article
            aria-label="Exact access request preview"
            className="ui-callout ui-stack"
          >
            <h3>Exact access bundle</h3>
            <dl className="access-preview-list">
              <div>
                <dt>Requester</dt>
                <dd>{reviewed.preview.requester_label}</dd>
              </div>
              <div>
                <dt>Requested job</dt>
                <dd>{accessIntentLabel(reviewed.preview.intent)}</dd>
              </div>
              <div>
                <dt>Current access</dt>
                <dd>{formatAccess(reviewed.preview.baseline_access)}</dd>
              </div>
              <div>
                <dt>Target access</dt>
                <dd>{formatAccess(reviewed.preview.target_access)}</dd>
              </div>
              <div>
                <dt>Capabilities added</dt>
                <dd>
                  {reviewed.preview.added_capability_keys.length
                    ? reviewed.preview.added_capability_keys
                        .map((key) => capabilityCatalogEntry(key).label)
                        .join(", ")
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Spaces added</dt>
                <dd>
                  {reviewed.preview.all_spaces_added
                    ? "All spaces"
                    : reviewed.preview.added_space_ids
                        .map((space) => spaceCatalogEntry(space as SpaceScope).label)
                        .join(", ") || "None"}
                </dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>{reviewed.preview.reason}</dd>
              </div>
            </dl>
            <p>{reviewed.preview.independent_conditions_statement}</p>
            <p>
              Submitting changes nothing until a different Admin approves and exact
              directory readback succeeds.
            </p>
            <div className="ui-row">
              <Button
                busy={busy === "submit"}
                busyLabel="Submitting exact request…"
                disabled={submissionState !== "idle"}
                onClick={submitReviewed}
              >
                Submit access request
              </Button>
              <Button
                disabled={submissionState !== "idle"}
                onClick={() => setReviewed(null)}
                variant="secondary"
              >
                Revise request
              </Button>
            </div>
          </article>
        ) : null}

        {notice ? (
          <Notice
            actionLabel={previewUnavailable ? "Retry access options" : undefined}
            onAction={previewUnavailable ? requestPreview : undefined}
            tone={notice.tone}
          >
            {notice.text}
          </Notice>
        ) : null}
        {submissionState !== "idle" && recoveryCommand ? (
          <Button
            busy={busy === "submit"}
            busyLabel="Checking exact request status…"
            onClick={() => submitExact(recoveryCommand)}
            variant="secondary"
          >
            {submissionState === "unknown" ? "Check request status" : "Try again"}
          </Button>
        ) : null}
        {receipt ? (
          <div className="access-receipt" ref={receiptRef} tabIndex={-1}>
            <strong>{receipt.intent_label}</strong>
            <p>{receipt.outcome_summary}</p>
            <StatusPill value={receipt.state}>{humanizeState(receipt.state)}</StatusPill>
            {preselection?.returnTo ? (
              <p>
                <Link href={preselection.returnTo}>Return to previous work</Link>
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="my-requests"
        className="panel ui-stack access-task-region task-anchor"
      >
        <div className="ui-spread">
          <h2 id="my-requests" ref={historyHeadingRef} tabIndex={-1}>
            My requests
          </h2>
          {isAdmin ? (
            <Link href="/approval-queue?view=access">Review Admin queue</Link>
          ) : null}
        </div>
        {historyError && history.length === 0 ? (
          <div className="ui-stack-tight">
            <Notice tone="error">Your request history is unavailable.</Notice>
            <Button
              busy={busy === "history"}
              busyLabel="Retrying request history…"
              onClick={retryHistory}
              variant="secondary"
            >
              Retry request history
            </Button>
          </div>
        ) : history.length === 0 ? (
          <p>No access requests yet.</p>
        ) : (
          <div className="queue-list">
            {history.map((item) => (
              <article className="compact-record" key={item.request_ref}>
                <div className="ui-spread">
                  <strong>{item.intent_label}</strong>
                  <StatusPill value={item.state}>{humanizeState(item.state)}</StatusPill>
                </div>
                <p>{item.outcome_summary}</p>
                <p className="muted">Updated {formatDate(item.updated_at)}</p>
                {item.decision_reason ? (
                  <p>Decision reason: {item.decision_reason}</p>
                ) : null}
                {item.state === "pending" ? (
                  <Button
                    onClick={() => setCancelTarget(item)}
                    size="compact"
                    variant="secondary"
                  >
                    Cancel request
                  </Button>
                ) : null}
              </article>
            ))}
          </div>
        )}
        {historyError && history.length > 0 ? (
          <Notice tone="error">
            Older requests could not be loaded. Existing results remain shown.
          </Notice>
        ) : null}
        {nextCursor ? (
          <Button
            busy={busy === "history"}
            busyLabel="Loading older requests…"
            onClick={loadOlder}
            variant="secondary"
          >
            {historyError ? "Try loading older requests" : "Load older requests"}
          </Button>
        ) : null}
      </section>

      <section
        aria-labelledby="access-connections-heading"
        className="panel ui-stack access-task-region"
      >
        <h2 id="access-connections-heading">Connections</h2>
        <p>
          Review source-backed status. Following a link does not run a connection check.
        </p>
        <div className="grid three">
          {CONNECTION_TASK_GROUPS.filter((group) =>
            ["renewal-data", "communications", "documents-storage"].includes(group.id),
          ).map((group) => (
            <article className="ui-callout ui-stack-tight" key={group.id}>
              <strong>{group.label}</strong>
              <p className="muted">{group.description}</p>
              <Link href={group.target.href}>{group.target.label}</Link>
            </article>
          ))}
        </div>
      </section>

      <ConfirmationDialog
        busy={busy === "cancel"}
        busyLabel="Cancelling request…"
        confirmLabel="Confirm cancellation"
        description={
          cancelTarget
            ? `Cancel ${cancelTarget.intent_label}? This does not change your current access.`
            : undefined
        }
        onCancel={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
        open={cancelTarget !== null}
        title="Cancel access request"
      />
    </div>
  );
}

function roleRank(role: Role) {
  return { Editor: 0, Approver: 1, Admin: 2 }[role];
}

function formatAccess(access: AccessRequestPreviewV1["target_access"]) {
  return `${access.role} · ${
    access.scope.kind === "all_spaces"
      ? "All spaces"
      : access.scope.space_ids
          .map((space) => spaceCatalogEntry(space as SpaceScope).label)
          .join(", ")
  }`;
}

function humanizeState(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "at an unavailable time" : date.toLocaleString();
}

function readError(body: unknown, fallback: string) {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return fallback;
}

function httpMatchesSubmit(status: number, resultStatus: string) {
  if (resultStatus === "created") return status === 201;
  if (resultStatus === "replayed" || resultStatus === "existing_request")
    return status === 200;
  if (resultStatus === "stale_preview" || resultStatus === "idempotency_conflict") {
    return status === 409;
  }
  return resultStatus === "unavailable" && status === 503;
}

function parseHistoryItem(value: unknown): AccessRequestHistoryItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const receipt = AccessRequestReceiptSchema.safeParse(value);
  if (receipt.success) {
    return { ...receipt.data, requester_reason: "" };
  }
  const safeReceipt = AccessRequestReceiptSchema.safeParse({
    schema_version: record.schema_version,
    request_ref: record.request_ref,
    request_version: record.request_version,
    intent_kind: record.intent_kind,
    intent_label: record.intent_label,
    state: record.state,
    outcome_summary: record.outcome_summary,
    created_at: record.created_at,
    updated_at: record.updated_at,
  });
  if (!safeReceipt.success || typeof record.requester_reason !== "string") return null;
  if (
    record.decision_reason !== undefined &&
    typeof record.decision_reason !== "string"
  ) {
    return null;
  }
  const allowed = new Set([
    "schema_version",
    "request_ref",
    "request_version",
    "intent_kind",
    "intent_label",
    "state",
    "outcome_summary",
    "created_at",
    "updated_at",
    "requester_reason",
    "decision_reason",
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key))) return null;
  return {
    ...safeReceipt.data,
    requester_reason: record.requester_reason,
    decision_reason: record.decision_reason as string | undefined,
  };
}

function parseHistoryPage(
  value: unknown,
): { items: AccessRequestHistoryItem[]; next_cursor: string | null } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    !Object.prototype.hasOwnProperty.call(record, "items") ||
    !Object.prototype.hasOwnProperty.call(record, "next_cursor") ||
    !Array.isArray(record.items) ||
    (record.next_cursor !== null &&
      (typeof record.next_cursor !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(record.next_cursor)))
  ) {
    return null;
  }
  const items = record.items
    .map((item) => parseHistoryItem(item))
    .filter((item): item is AccessRequestHistoryItem => item !== null);
  if (items.length !== record.items.length) return null;
  return { items, next_cursor: record.next_cursor as string | null };
}

function deduplicateHistory(items: readonly AccessRequestHistoryItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.request_ref)) return false;
    seen.add(item.request_ref);
    return true;
  });
}
