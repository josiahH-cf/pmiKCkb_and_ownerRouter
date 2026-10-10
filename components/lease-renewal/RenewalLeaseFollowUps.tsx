"use client";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button, Field } from "@/components/ui";
import { fetchWithDeadline as fetch, waitFailureMessage } from "@/lib/ui/fetch-lifetime";
import { formatBusinessTimestamp } from "@/lib/date-display";
import {
  LEASE_FOLLOW_UP_KINDS,
  LEASE_FOLLOW_UP_LABELS,
  LeaseFollowUpInputSchema,
  type CreateLeaseFollowUpInput,
} from "@/lib/work-accountability/lease-follow-up";
import type {
  WorkAssignableUser,
  WorkTaskRecord,
  WorkTaskActivityRecord,
} from "@/lib/work-accountability/types";
import { LeaseFollowUpOriginView } from "@/components/work/LeaseFollowUpOriginView";
import { useRenewalPolicy } from "./RenewalPolicyContext";
import { useRenewalManualWorkspace } from "./RenewalManualWorkspace";
import { projectPolicyApplicability } from "@/lib/lease-renewal/policy-content";
interface Read {
  snapshot: {
    tasks: WorkTaskRecord[];
    activity: WorkTaskActivityRecord[];
    cursor: string | null;
    history_may_be_truncated: boolean;
  };
  context: { cycle_key: string; cycle_label: string } | null;
  contextError: string;
  roster?: WorkAssignableUser[];
}
class TaskResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
const errorMessage = (e: unknown, fallback: string) =>
  e instanceof TaskResponseError ? e.message : waitFailureMessage(e, fallback);
const INTENT = "leaseFollowUpIntent";
function urlIntent(value?: string | null) {
  const url = new URL(window.location.href);
  if (value === undefined) {
    const current = url.searchParams.get(INTENT);
    return current && /^[0-9a-f-]{36}$/i.test(current) ? current : null;
  }
  if (value) url.searchParams.set(INTENT, value);
  else url.searchParams.delete(INTENT);
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return value;
}
export function RenewalLeaseFollowUps({
  leaseId,
  canEdit,
  admin,
}: Readonly<{ leaseId: string; canEdit: boolean; admin: boolean }>) {
  const [read, setRead] = useState<Read | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [recovering, setRecovering] = useState(false),
    [kind, setKind] = useState<(typeof LEASE_FOLLOW_UP_KINDS)[number]>("insurance");
  const lock = useRef(false),
    alive = useRef(true),
    generation = useRef(0),
    intent = useRef<CreateLeaseFollowUpInput | null>(null),
    pendingUrl = useRef<string | null>(null),
    formRef = useRef<HTMLFormElement | null>(null);
  const id = useId();
  const [hasIntent, setHasIntent] = useState(false);
  const policy = useRenewalPolicy(),
    manual = useRenewalManualWorkspace();
  const applicability = policy
    ? projectPolicyApplicability({
        ...policy,
        productKey: "rhino",
        manualState: manual?.state ?? null,
      })
    : null;
  const load = useCallback(
    async (after?: string) => {
      const version = ++generation.current;
      try {
        const r = await fetch(
          `/api/work?lease_id=${encodeURIComponent(leaseId)}${after ? `&after=${encodeURIComponent(after)}` : ""}`,
          { cache: "no-store" },
        );
        const data = await r.json();
        if (
          !r.ok ||
          !Array.isArray(data.snapshot?.tasks) ||
          !Array.isArray(data.snapshot?.activity)
        )
          throw new TaskResponseError(
            data.error ?? "Lease tasks could not be read.",
            r.status,
          );
        if (!alive.current || version !== generation.current) return;
        setRead((old) =>
          after && old
            ? {
                ...data,
                snapshot: {
                  ...data.snapshot,
                  tasks: [
                    ...new Map(
                      [...old.snapshot.tasks, ...data.snapshot.tasks].map((t) => [
                        t.id,
                        t,
                      ]),
                    ).values(),
                  ],
                  activity: [
                    ...new Map(
                      [...old.snapshot.activity, ...data.snapshot.activity].map((t) => [
                        t.id,
                        t,
                      ]),
                    ).values(),
                  ],
                },
              }
            : data,
        );
        setError("");
      } catch (e) {
        if (alive.current && version === generation.current)
          setError(
            errorMessage(
              e,
              "Lease tasks could not be read. Your entry remains available.",
            ),
          );
      }
    },
    [leaseId],
  );
  const recover = useCallback(async () => {
    const operation = pendingUrl.current;
    if (!operation || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/work?lease_id=${encodeURIComponent(leaseId)}&creation_intent=${encodeURIComponent(operation)}`,
        { cache: "no-store" },
      );
      const p = await r.json();
      if (!r.ok)
        throw new TaskResponseError(
          p.error ??
            "No task receipt is available yet. Retry the original request before starting another.",
          r.status,
        );
      intent.current = null;
      setHasIntent(false);
      pendingUrl.current = null;
      urlIntent(null);
      setRecovering(false);
      setNotice(
        `Recovered ${p.existing ? "the existing" : "the created"} task: ${p.task.title}.`,
      );
      await load();
    } catch (e) {
      if (e instanceof TaskResponseError && e.status === 404) setRecovering(false);
      setNotice(
        e instanceof TaskResponseError && e.status === 404
          ? "The original intent has no readable task receipt yet. Enter its original details and retry this same intent; conflicting recorded details will be refused."
          : errorMessage(e, "The original task could not be recovered yet."),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, [leaseId, load]);
  useEffect(() => {
    alive.current = true;
    pendingUrl.current = urlIntent();
    setRecovering(Boolean(pendingUrl.current));
    void load();
    if (pendingUrl.current) void recover();
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, [load, recover]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !read?.context || !canEdit) return;
    const form = event.currentTarget;
    let input = intent.current;
    if (!input) {
      const f = new FormData(form),
        due = String(f.get("due") ?? ""),
        reference = String(f.get("reference") ?? "").trim();
      if (due && !Number.isFinite(new Date(due).getTime())) {
        setNotice("Enter a valid local due time.");
        return;
      }
      const parsed = LeaseFollowUpInputSchema.safeParse({
        lease_id: leaseId,
        expected_cycle_key: read.context.cycle_key,
        kind,
        title: String(f.get("title") ?? ""),
        next_action: String(f.get("next_action") ?? ""),
        notes: String(f.get("notes") ?? ""),
        ...(admin && f.get("assignee")
          ? { assignee_uid: String(f.get("assignee")) }
          : {}),
        ...(due ? { due_at: new Date(due).toISOString() } : {}),
        supporting_references: reference
          ? [
              {
                label:
                  String(f.get("reference_label") ?? "") || "Staff supporting reference",
                url: reference,
              },
            ]
          : [],
        ...(f.get("distinct_reason")
          ? { distinct_reason: String(f.get("distinct_reason")) }
          : {}),
        idempotency_key: pendingUrl.current ?? crypto.randomUUID(),
      });
      if (!parsed.success) {
        setNotice(parsed.error.issues.map((i) => i.message).join(" "));
        return;
      }
      input = parsed.data;
      intent.current = input;
      setHasIntent(true);
      pendingUrl.current = input.idempotency_key;
      urlIntent(input.idempotency_key);
    }
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/work", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_lease_follow_up", ...input }),
      });
      const p = await r.json();
      if (!r.ok)
        throw new TaskResponseError(p.error ?? "The task was refused.", r.status);
      intent.current = null;
      setHasIntent(false);
      pendingUrl.current = null;
      urlIntent(null);
      setRecovering(false);
      form.reset();
      setKind("insurance");
      setNotice(
        p.existing
          ? `Existing active matching task: ${p.task.title}. Its original notes and assignment were kept.`
          : `Task created: ${p.task.title}.`,
      );
      await load();
    } catch (e) {
      if (e instanceof TaskResponseError) {
        intent.current = null;
        setHasIntent(false);
        pendingUrl.current = null;
        urlIntent(null);
        setRecovering(false);
        if (e.status === 409) await load();
      } else setRecovering(true);
      setNotice(
        errorMessage(
          e,
          "The task response was lost. Retry the original creation intent to recover its task.",
        ),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function transition(
    task: WorkTaskRecord,
    next: "Completed" | "Paused",
    reason: string,
  ) {
    if (lock.current || !canEdit) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/work", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "transition_task",
          task_id: task.id,
          expected_version: task.record_version,
          next_state: next,
          reason,
          ...(next === "Completed" ? { outcome_note: reason } : {}),
          idempotency_key: crypto.randomUUID(),
        }),
      });
      const p = await r.json();
      if (!r.ok)
        throw new TaskResponseError(
          p.error ?? "Task progress could not be recorded.",
          r.status,
        );
      setNotice(
        next === "Completed"
          ? "Completion recorded as staff work."
          : "Task reopened; prior completion remains in its history.",
      );
      await load();
    } catch (e) {
      setNotice(
        errorMessage(
          e,
          "The progress response was lost. Reload the same task to reconcile its state.",
        ),
      );
      await load();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="panel ui-stack"
      aria-label="Lease follow-up tasks"
      data-renewal-focus-context
      id="renewal-lease-follow-ups"
    >
      <details>
        <summary>
          Lease follow-up tasks
          {read
            ? ` (${read.snapshot.tasks.length}${read.snapshot.cursor ? "+" : ""})`
            : ""}
        </summary>
        <div className="ui-stack">
          <p>
            Lease {leaseId} · {read?.context?.cycle_label ?? "Current cycle unavailable"}
          </p>
          <a href="/work">Open My Work</a>
          {error ? <p role="status">{error}</p> : null}
          {read?.contextError ? <p role="status">{read.contextError}</p> : null}
          <Button disabled={busy} onClick={() => void load()}>
            Refresh lease tasks
          </Button>
          <form className="ui-stack" ref={formRef} onSubmit={(e) => void create(e)}>
            <fieldset disabled={!canEdit || busy || !read?.context || recovering}>
              <legend>Create a staff follow-up</legend>
              <Field label="Task kind" htmlFor={`${id}-kind`}>
                <select
                  name="kind"
                  id={`${id}-kind`}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                >
                  {LEASE_FOLLOW_UP_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {LEASE_FOLLOW_UP_LABELS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Task title" htmlFor={`${id}-title`}>
                <input name="title" required maxLength={160} />
              </Field>
              <Field label="Next staff action" htmlFor={`${id}-next`}>
                <input name="next_action" required maxLength={240} />
              </Field>
              <Field label="Task context and unknown facts" htmlFor={`${id}-notes`}>
                <textarea name="notes" rows={3} maxLength={2000} />
              </Field>
              {admin ? (
                <Field label="Staff assignee" htmlFor={`${id}-assignee`}>
                  <select name="assignee">
                    <option value="">Unassigned</option>
                    {read?.roster?.map((p) => (
                      <option key={p.uid} value={p.uid}>
                        {p.email}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <p>Assigned to you through your existing My Work permissions.</p>
              )}
              <Field
                label="Optional due time (your browser's local time)"
                htmlFor={`${id}-due`}
              >
                <input type="datetime-local" name="due" />
              </Field>
              <Field label="Optional supporting reference" htmlFor={`${id}-ref`}>
                <input type="url" name="reference" maxLength={2048} />
              </Field>
              <Field label="Reference label" htmlFor={`${id}-ref-label`}>
                <input name="reference_label" maxLength={120} />
              </Field>
              <Field
                label="Reason for a deliberate separate follow-up (optional)"
                htmlFor={`${id}-separate`}
                hint="Leave blank to reuse active matching work of the same kind and assignee in this cycle."
              >
                <input name="distinct_reason" maxLength={500} />
              </Field>
              <Button type="submit">Create lease task</Button>
            </fieldset>
            {recovering ? (
              <div className="ui-actions">
                <Button disabled={busy} onClick={() => void recover()}>
                  Recover original task
                </Button>
                {hasIntent ? (
                  <Button
                    disabled={busy}
                    onClick={() => formRef.current?.requestSubmit()}
                  >
                    Retry original task creation
                  </Button>
                ) : (
                  <p>
                    Reload preserved the intent identifier. Recover its receipt before
                    creating a separate task.
                  </p>
                )}
              </div>
            ) : null}
          </form>
          {kind === "rhino" ? (
            <p role="status">
              {applicability
                ? `${applicability.label}. ${applicability.explanation}`
                : "Approved Rhino material and actual applicability have not been established."}{" "}
              <a href="#renewal-policy-content-rhino">Review policy context</a>
            </p>
          ) : (
            <p className="muted">
              Pet and insurance applicability comes from the actual lease and reviewed
              material. Unknown facts can be investigated as a task.
            </p>
          )}
          {read?.snapshot.tasks.length === 0 ? (
            <p>No lease follow-up tasks are visible under your My Work permissions.</p>
          ) : null}
          {read?.snapshot.tasks.map((task) => (
            <LeaseFollowUpCard
              key={task.id}
              task={task}
              activity={read.snapshot.activity.filter((a) => a.task_id === task.id)}
              busy={busy}
              canEdit={canEdit}
              transition={transition}
            />
          ))}
          {read?.snapshot.cursor ? (
            <Button
              disabled={busy}
              onClick={() => void load(read.snapshot.cursor ?? undefined)}
            >
              Load more lease tasks
            </Button>
          ) : null}
          {read?.snapshot.history_may_be_truncated ? (
            <p role="status">
              This read reached its bounded activity limit. Some older task activity is
              not in this page.
            </p>
          ) : null}
          {notice ? <p role="status">{notice}</p> : null}
        </div>
      </details>
    </section>
  );
}
function LeaseFollowUpCard({
  task,
  activity,
  busy,
  canEdit,
  transition,
}: Readonly<{
  task: WorkTaskRecord;
  activity: WorkTaskActivityRecord[];
  busy: boolean;
  canEdit: boolean;
  transition: (
    task: WorkTaskRecord,
    next: "Completed" | "Paused",
    reason: string,
  ) => Promise<void>;
}>) {
  const [reason, setReason] = useState(""),
    [audit, setAudit] = useState<{
      activity: WorkTaskActivityRecord[];
      cursor: string | null;
    } | null>(null),
    [auditError, setAuditError] = useState(""),
    [auditBusy, setAuditBusy] = useState(false);
  const auditLock = useRef(false);
  const history = [
    ...new Map([...(audit?.activity ?? []), ...activity].map((a) => [a.id, a])).values(),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  async function readHistory(after?: string) {
    if (auditLock.current) return;
    auditLock.current = true;
    setAuditBusy(true);
    try {
      const r = await fetch(
        `/api/work?lease_id=${encodeURIComponent(task.renewal_follow_up!.lease_id)}&task_id=${encodeURIComponent(task.id)}${after ? `&activity_after=${encodeURIComponent(after)}` : ""}`,
      );
      const p = await r.json();
      if (!r.ok || !Array.isArray(p.activity))
        throw new TaskResponseError(
          p.error ?? "Task history could not be read.",
          r.status,
        );
      setAudit((old) => ({
        activity: after ? [...(old?.activity ?? []), ...p.activity] : p.activity,
        cursor: p.cursor,
      }));
      setAuditError("");
    } catch (e) {
      setAuditError(errorMessage(e, "Task history could not be read."));
    } finally {
      auditLock.current = false;
      setAuditBusy(false);
    }
  }
  const id = useId(),
    terminal = task.state === "Completed" || task.state === "Cancelled";
  return (
    <article className="panel ui-stack" aria-label={task.title}>
      <h3>{task.title}</h3>
      <p>
        <strong>{task.state}</strong> · {task.assignee_uid ?? "Unassigned"}
        {task.due_at
          ? ` · Due ${formatBusinessTimestamp(task.due_at)}`
          : " · No due time"}
      </p>
      <p>Next action: {task.next_action}</p>
      <LeaseFollowUpOriginView task={task} />
      <a href={`/work#work-task-${task.id}`}>Open this task in My Work</a>
      <details>
        <summary>Staff task history ({history.length})</summary>
        <Button disabled={auditBusy} onClick={() => void readHistory()}>
          Refresh task history
        </Button>
        <ol>
          {history.map((a) => (
            <li key={a.id}>
              {a.action} · {a.actor_uid} · {formatBusinessTimestamp(a.created_at)}
              {a.reason_text ? ` · ${a.reason_text}` : ""}
            </li>
          ))}
        </ol>
        {audit?.cursor ? (
          <Button
            disabled={auditBusy}
            onClick={() => void readHistory(audit.cursor ?? undefined)}
          >
            Load older task activity
          </Button>
        ) : null}
        {auditError ? <p role="status">{auditError}</p> : null}
      </details>
      <Field
        label={terminal ? "Reopening context" : "Completion context"}
        htmlFor={`${id}-reason`}
      >
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={2}
        />
      </Field>
      <Button
        disabled={!canEdit || busy || !reason.trim()}
        onClick={() =>
          void transition(task, terminal ? "Paused" : "Completed", reason.trim())
        }
      >
        {terminal ? "Reopen staff task" : "Record staff completion"}
      </Button>
    </article>
  );
}
