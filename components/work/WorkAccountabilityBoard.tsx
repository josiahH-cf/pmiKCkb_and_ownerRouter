"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { WorkActivityController } from "@/components/work/WorkActivityController";
import {
  actualTaskMinutes,
  compareTaskExpectation,
  isTerminalTaskState,
} from "@/lib/work-accountability/model";
import {
  WORK_SOURCE_TYPES,
  WORK_TASK_STATES,
  type WorkAccountabilitySnapshot,
  type WorkAssignableUser,
  type WorkDerivationMappingRecord,
  type WorkExpectationRecord,
  type WorkSessionRecord,
  type WorkSourceType,
  type WorkTaskRecord,
  type WorkTaskState,
} from "@/lib/work-accountability/types";

interface WorkSpaceOption {
  id: string;
  name: string;
}

interface WorkAccountabilityBoardProps {
  mode: "mine" | "team";
  mutationAllowed: boolean;
  spaces: readonly WorkSpaceOption[];
}

interface WorkApiSnapshot {
  snapshot: WorkAccountabilitySnapshot;
  roster?: WorkAssignableUser[];
}

export function WorkAccountabilityBoard({
  mode,
  mutationAllowed,
  spaces,
}: WorkAccountabilityBoardProps) {
  const [snapshot, setSnapshot] = useState<WorkAccountabilitySnapshot | null>(null);
  const [roster, setRoster] = useState<WorkAssignableUser[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [filters, setFilters] = useState({
    staff: "",
    space: "",
    type: "",
    state: "" as WorkTaskState | "",
    from: "",
    to: "",
  });
  const alive = useRef(true);
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = loadGeneration.current + 1;
    loadGeneration.current = generation;
    setIsRefreshing(true);
    try {
      const response = await fetch(
        `/api/work?view=${mode === "team" ? "team" : "mine"}`,
        {
          cache: "no-store",
        },
      );
      const payload = (await response.json().catch(() => ({}))) as WorkApiSnapshot & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Work could not be loaded.");
      if (!alive.current || loadGeneration.current !== generation) return;
      setSnapshot(payload.snapshot);
      setRoster(payload.roster ?? []);
      setError("");
    } catch (loadError) {
      if (!alive.current || loadGeneration.current !== generation) return;
      setError(
        loadError instanceof Error ? loadError.message : "Work could not be loaded.",
      );
    } finally {
      if (alive.current && loadGeneration.current === generation) {
        setIsRefreshing(false);
      }
    }
  }, [mode]);

  const reconcileAndLoad = useCallback(async () => {
    if (!mutationAllowed || isReconciling) return;
    setIsReconciling(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/work", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          mode === "mine"
            ? { action: "reconcile" }
            : { action: "reconcile_team", limit: 100 },
        ),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Work activity could not be reconciled.");
      }
      await load();
      setNotice("Work activity was reconciled and refreshed.");
    } catch (reconcileError) {
      setError(
        reconcileError instanceof Error
          ? reconcileError.message
          : "Work activity could not be reconciled.",
      );
    } finally {
      setIsReconciling(false);
    }
  }, [isReconciling, load, mode, mutationAllowed]);

  useEffect(() => {
    alive.current = true;
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      alive.current = false;
      loadGeneration.current += 1;
    };
  }, [load, mode, mutationAllowed]);

  const mutate = useCallback(
    async (body: Record<string, unknown>, key: string, focusTaskId?: string) => {
      if (!mutationAllowed || busyKey) return false;
      setBusyKey(key);
      setError("");
      setNotice("");
      const priorTask = snapshot?.current_session
        ? snapshot.tasks.find((task) => task.id === snapshot.current_session?.task_id)
        : undefined;
      const requestedTask =
        typeof body.task_id === "string"
          ? snapshot?.tasks.find((task) => task.id === body.task_id)
          : undefined;
      try {
        const response = await fetch("/api/work", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          task?: WorkTaskRecord;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "The change was not saved.");
        }
        await load();
        if (body.action === "start_session" && requestedTask) {
          setNotice(
            priorTask && priorTask.id !== requestedTask.id
              ? `Paused ${priorTask.title}; started ${requestedTask.title}.`
              : `Started ${requestedTask.title}.`,
          );
        }
        const changedTaskId = focusTaskId ?? payload.task?.id;
        if (changedTaskId) {
          window.requestAnimationFrame(() => {
            document.getElementById(`work-task-${changedTaskId}`)?.focus();
          });
        }
        return true;
      } catch (mutationError) {
        setError(
          `${
            mutationError instanceof Error
              ? mutationError.message
              : "The change was not saved."
          } Refresh to confirm server state before retrying.`,
        );
        return false;
      } finally {
        setBusyKey("");
      }
    },
    [busyKey, load, mutationAllowed, snapshot],
  );

  const tasks = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.tasks.filter((task) => {
      if (filters.staff && task.assignee_uid !== filters.staff) return false;
      if (filters.space && task.space_id !== filters.space) return false;
      if (filters.type && task.task_type !== filters.type) return false;
      if (filters.state && task.state !== filters.state) return false;
      if (filters.from && task.created_at.slice(0, 10) < filters.from) return false;
      if (filters.to && task.created_at.slice(0, 10) > filters.to) return false;
      return true;
    });
  }, [filters, snapshot]);

  const taskTypes = useMemo(
    () => Array.from(new Set(snapshot?.tasks.map((task) => task.task_type) ?? [])).sort(),
    [snapshot],
  );
  const selectedSessions = useMemo(() => {
    const ids = new Set(tasks.map((task) => task.id));
    return snapshot?.sessions.filter((session) => ids.has(session.task_id)) ?? [];
  }, [snapshot, tasks]);

  if (!snapshot && isRefreshing) {
    return (
      <section className="panel work-board" aria-busy="true" aria-live="polite">
        <h2>{mode === "team" ? "Team work" : "My work"}</h2>
        <p>Loading current assignments and sessions…</p>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="panel work-board">
        <h2>{mode === "team" ? "Team work" : "My work"}</h2>
        <p className="callout error" role="alert">
          {error || "Work is unavailable right now."}
        </p>
        <button type="button" onClick={() => void load()}>
          Retry
        </button>
      </section>
    );
  }

  const currentTask = snapshot.current_session
    ? snapshot.tasks.find((task) => task.id === snapshot.current_session?.task_id)
    : undefined;

  return (
    <div className="work-board ui-stack" aria-busy={isRefreshing}>
      {!mutationAllowed ? (
        <p className="callout" role="status">
          Work records are read-only in this environment. Starting, timing, and changing
          work are disabled.
        </p>
      ) : null}
      {error ? (
        <p className="callout error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="callout" role="status" aria-live="polite">
          {notice}
        </p>
      ) : null}
      {snapshot.may_be_truncated ? (
        <p className="callout" role="status">
          This view reached its {snapshot.record_limit}-record safety limit. Narrow the
          filters or request a bounded follow-up before treating these totals as complete.
        </p>
      ) : null}

      {mode === "mine" && snapshot.current_session && currentTask ? (
        <section className="panel work-current" aria-labelledby="current-work-title">
          <p className="eyebrow">Current session</p>
          <h2 id="current-work-title">{currentTask.title}</h2>
          <p>
            Started {formatDateTime(snapshot.current_session.effective_start_at)} ·
            Session time is recorded only after the explicit start action.
          </p>
          {snapshot.current_session.correction_state === "needs_review" ? (
            <p className="status-warning" role="status">
              Needs review: connection ended. Confirm or correct this session below.
            </p>
          ) : null}
          <WorkActivityController
            session={snapshot.current_session}
            taskId={currentTask.id}
            taskVersion={currentTask.record_version}
            serverNow={snapshot.server_now}
            mutationAllowed={mutationAllowed}
            onChanged={load}
            onError={setError}
          />
        </section>
      ) : null}

      <WorkSummary
        tasks={tasks}
        sessions={selectedSessions}
        serverNow={snapshot.server_now}
      />

      {mode === "team" ? (
        <TeamFilters
          filters={filters}
          setFilters={setFilters}
          roster={roster}
          spaces={spaces}
          taskTypes={taskTypes}
        />
      ) : null}

      <CreateTaskForm
        mode={mode}
        mutationAllowed={mutationAllowed}
        spaces={spaces}
        roster={roster}
        busy={Boolean(busyKey)}
        onCreate={async (body) => mutate(body, "create-task")}
      />

      <section aria-labelledby="work-list-title" className="ui-stack">
        <div className="work-section-heading">
          <div>
            <h2 id="work-list-title">
              {mode === "team" ? "Team tasks" : "Assigned tasks"}
            </h2>
            <p className="muted">
              Task completion changes this internal record only; linked product work keeps
              its own controls.
            </p>
          </div>
          <div className="action-row">
            {mutationAllowed ? (
              <button
                type="button"
                className="secondary"
                disabled={isReconciling || isRefreshing}
                onClick={() => void reconcileAndLoad()}
              >
                {isReconciling ? "Reconciling…" : "Reconcile activity"}
              </button>
            ) : null}
            <button
              type="button"
              className="secondary"
              disabled={isRefreshing}
              onClick={() => void load()}
            >
              {isRefreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        {tasks.length === 0 ? (
          <div className="panel empty-state" role="status">
            {mode === "team" ? "No team tasks match these filters" : "No tasks assigned"}
          </div>
        ) : (
          <div className="work-task-grid">
            {tasks.map((task) => (
              <WorkTaskCard
                key={task.id}
                task={task}
                sessions={snapshot.sessions.filter(
                  (session) => session.task_id === task.id,
                )}
                expectations={snapshot.expectations.filter(
                  (expectation) =>
                    expectation.task_type === task.task_type &&
                    (!expectation.space_id || expectation.space_id === task.space_id),
                )}
                allTasks={snapshot.tasks}
                editable={snapshot.editable_task_ids.includes(task.id)}
                roster={roster}
                mode={mode}
                serverNow={snapshot.server_now}
                mutationAllowed={mutationAllowed}
                busy={Boolean(busyKey)}
                onMutate={(body, key) => mutate(body, key, task.id)}
              />
            ))}
          </div>
        )}
      </section>

      {mode === "team" ? (
        <AdminWorkConfiguration
          mutationAllowed={mutationAllowed}
          spaces={spaces}
          roster={roster}
          snapshot={snapshot}
          busy={Boolean(busyKey)}
          onMutate={mutate}
          onRefresh={load}
          onError={setError}
        />
      ) : null}
    </div>
  );
}

function WorkSummary({
  tasks,
  sessions,
  serverNow,
}: {
  tasks: readonly WorkTaskRecord[];
  sessions: readonly WorkSessionRecord[];
  serverNow: string;
}) {
  const open = tasks.filter((task) => !isTerminalTaskState(task.state)).length;
  const blocked = tasks.filter((task) => task.state === "Blocked").length;
  const completed = tasks.filter((task) => task.state === "Completed").length;
  const overdue = tasks.filter(
    (task) =>
      !isTerminalTaskState(task.state) &&
      task.due_at !== undefined &&
      Date.parse(task.due_at) < Date.parse(serverNow),
  ).length;
  const minutes = sessions
    .filter((session) => session.state === "Ended")
    .reduce((sum, session) => sum + session.effective_minutes, 0);
  return (
    <section className="work-summary" aria-label="Factual work totals">
      <SummaryFact label="Assigned" value={tasks.length} />
      <SummaryFact label="Open" value={open} />
      <SummaryFact label="Blocked" value={blocked} />
      <SummaryFact label="Overdue" value={overdue} />
      <SummaryFact label="Completed" value={completed} />
      <SummaryFact label="Recorded minutes" value={Math.round(minutes * 100) / 100} />
    </section>
  );
}

function SummaryFact({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel work-summary-fact">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function TeamFilters({
  filters,
  setFilters,
  roster,
  spaces,
  taskTypes,
}: {
  filters: {
    staff: string;
    space: string;
    type: string;
    state: WorkTaskState | "";
    from: string;
    to: string;
  };
  setFilters: (value: typeof filters) => void;
  roster: readonly WorkAssignableUser[];
  spaces: readonly WorkSpaceOption[];
  taskTypes: readonly string[];
}) {
  return (
    <section className="panel" aria-labelledby="team-work-filters">
      <h2 id="team-work-filters">Filter team records</h2>
      <div className="work-filter-grid">
        <label>
          Staff
          <select
            value={filters.staff}
            onChange={(change) =>
              setFilters({ ...filters, staff: change.currentTarget.value })
            }
          >
            <option value="">All staff</option>
            {roster.map((person) => (
              <option key={person.uid} value={person.uid}>
                {person.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          Space
          <select
            value={filters.space}
            onChange={(change) =>
              setFilters({ ...filters, space: change.currentTarget.value })
            }
          >
            <option value="">All Spaces</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Task type
          <select
            value={filters.type}
            onChange={(change) =>
              setFilters({ ...filters, type: change.currentTarget.value })
            }
          >
            <option value="">All types</option>
            {taskTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          State
          <select
            value={filters.state}
            onChange={(change) =>
              setFilters({
                ...filters,
                state: change.currentTarget.value as WorkTaskState | "",
              })
            }
          >
            <option value="">All states</option>
            {WORK_TASK_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>
        <label>
          Created from
          <input
            type="date"
            value={filters.from}
            onChange={(change) =>
              setFilters({ ...filters, from: change.currentTarget.value })
            }
          />
        </label>
        <label>
          Created through
          <input
            type="date"
            value={filters.to}
            onChange={(change) =>
              setFilters({ ...filters, to: change.currentTarget.value })
            }
          />
        </label>
      </div>
    </section>
  );
}

function CreateTaskForm({
  mode,
  mutationAllowed,
  spaces,
  roster,
  busy,
  onCreate,
}: {
  mode: "mine" | "team";
  mutationAllowed: boolean;
  spaces: readonly WorkSpaceOption[];
  roster: readonly WorkAssignableUser[];
  busy: boolean;
  onCreate: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [sourceType, setSourceType] = useState<WorkSourceType>("manual");
  const formRef = useRef<HTMLFormElement>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const sourceId = String(data.get("source_id") ?? "").trim();
    const dueValue = String(data.get("due_at") ?? "").trim();
    const assignee = String(data.get("assignee_uid") ?? "").trim();
    const workLocation = String(data.get("work_location") ?? "").trim();
    const materialsNeeded = String(data.get("materials_needed") ?? "").trim();
    const materialsPurchased = String(data.get("materials_purchased") ?? "").trim();
    const saved = await onCreate({
      action: "create_task",
      space_id: String(data.get("space_id")),
      source: {
        type: sourceType,
        ...(sourceType !== "manual" ? { id: sourceId } : {}),
      },
      task_type: String(data.get("task_type")),
      title: String(data.get("title")),
      ...(assignee ? { assignee_uid: assignee } : {}),
      next_action: String(data.get("next_action")),
      ...(workLocation ? { work_location: workLocation } : {}),
      ...(materialsNeeded ? { materials_needed: materialsNeeded } : {}),
      ...(materialsPurchased ? { materials_purchased: materialsPurchased } : {}),
      ...(dueValue ? { due_at: new Date(dueValue).toISOString() } : {}),
      idempotency_key: crypto.randomUUID(),
    });
    if (saved) {
      formRef.current?.reset();
      setSourceType("manual");
    }
  };
  return (
    <details className="panel work-create-panel">
      <summary>{mode === "team" ? "Assign a task" : "Create my task"}</summary>
      <form
        ref={formRef}
        className="work-form-grid"
        onSubmit={(event) => void submit(event)}
      >
        <label>
          Space
          <select name="space_id" required defaultValue={spaces[0]?.id ?? ""}>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Task type
          <input name="task_type" required maxLength={100} />
        </label>
        <label className="work-form-wide">
          Title
          <input name="title" required maxLength={160} />
        </label>
        <label className="work-form-wide">
          Next action
          <input name="next_action" required maxLength={240} />
        </label>
        <label className="work-form-wide">
          Job location or address <span className="muted">(optional)</span>
          <input name="work_location" maxLength={240} />
        </label>
        <label className="work-form-wide">
          Materials needed <span className="muted">(optional)</span>
          <textarea name="materials_needed" maxLength={1000} rows={2} />
        </label>
        <label className="work-form-wide">
          Materials bought or on hand <span className="muted">(optional)</span>
          <textarea name="materials_purchased" maxLength={1000} rows={2} />
        </label>
        <label>
          Source
          <select
            value={sourceType}
            onChange={(change) =>
              setSourceType(change.currentTarget.value as WorkSourceType)
            }
          >
            {WORK_SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {sourceLabel(type)}
              </option>
            ))}
          </select>
        </label>
        {sourceType !== "manual" ? (
          <label>
            Source id
            <input name="source_id" required maxLength={160} />
          </label>
        ) : null}
        {mode === "team" ? (
          <label>
            Assignee
            <select name="assignee_uid" required defaultValue="">
              <option value="" disabled>
                Select active staff
              </option>
              {roster.map((person) => (
                <option key={person.uid} value={person.uid}>
                  {person.email}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Due date and time <span className="muted">(optional)</span>
          <input name="due_at" type="datetime-local" />
        </label>
        <div className="work-form-wide work-actions">
          <button
            type="submit"
            disabled={!mutationAllowed || busy || spaces.length === 0}
          >
            {mode === "team" ? "Assign task" : "Create task"}
          </button>
        </div>
      </form>
    </details>
  );
}

function WorkTaskCard({
  task,
  sessions,
  expectations,
  allTasks,
  editable,
  roster,
  mode,
  serverNow,
  mutationAllowed,
  busy,
  onMutate,
}: {
  task: WorkTaskRecord;
  sessions: readonly WorkSessionRecord[];
  expectations: readonly WorkExpectationRecord[];
  allTasks: readonly WorkTaskRecord[];
  editable: boolean;
  roster: readonly WorkAssignableUser[];
  mode: "mine" | "team";
  serverNow: string;
  mutationAllowed: boolean;
  busy: boolean;
  onMutate: (body: Record<string, unknown>, key: string) => Promise<boolean>;
}) {
  const actualMinutes = actualTaskMinutes(task.id, sessions);
  const comparison = compareTaskExpectation(task, actualMinutes);
  const assignee = roster.find((person) => person.uid === task.assignee_uid);
  const overdue =
    task.due_at !== undefined &&
    !isTerminalTaskState(task.state) &&
    Date.parse(task.due_at) < Date.parse(serverNow);
  const activeSession = sessions.find((session) => session.state === "Active");
  const needsReview = sessions.some(
    (session) => session.correction_state === "needs_review",
  );
  const canStart =
    editable &&
    task.assignee_uid !== undefined &&
    task.state !== "In progress" &&
    !isTerminalTaskState(task.state);

  return (
    <article
      className="panel work-task-card"
      id={`work-task-${task.id}`}
      data-task-id={task.id}
      tabIndex={-1}
    >
      <div className="work-task-heading">
        <div>
          <p className="eyebrow">{task.task_type}</p>
          <h3>{task.title}</h3>
        </div>
        <span className="status-pill">{task.state}</span>
      </div>
      {mode === "team" ? (
        <p>
          <strong>Assignee:</strong>{" "}
          {assignee?.email ?? task.assignee_uid ?? "Unassigned"}
        </p>
      ) : null}
      {!editable ? (
        <p className="muted" role="status">
          Historical task context for your own session record. Task controls are
          unavailable after reassignment.
        </p>
      ) : null}
      {needsReview ? (
        <p className="status-warning" role="status">
          Needs review: connection ended. Confirm the recorded interval or open session
          history to correct it.
        </p>
      ) : null}
      <p>
        <strong>Next action:</strong> {task.next_action}
      </p>
      {task.work_location ? (
        <p>
          <strong>Job location:</strong> {task.work_location}
        </p>
      ) : null}
      {task.materials_needed ? (
        <p>
          <strong>Materials needed:</strong> {task.materials_needed}
        </p>
      ) : null}
      {task.materials_purchased ? (
        <p>
          <strong>Materials bought or on hand:</strong> {task.materials_purchased}
        </p>
      ) : null}
      <div className="work-task-facts">
        <span>{task.due_at ? `Due ${formatDateTime(task.due_at)}` : "No due time"}</span>
        {overdue ? <span className="status-warning">Overdue</span> : null}
        <span>
          {task.expectation_snapshot
            ? `Expected ${task.expectation_snapshot.minimum_minutes}–${task.expectation_snapshot.maximum_minutes} min · v${task.expectation_snapshot.version}`
            : "Expected time not set"}
        </span>
        <span>{actualMinutes} recorded min</span>
        {task.retention_expires_at ? (
          <span>
            {Date.parse(task.retention_expires_at) <= Date.parse(serverNow)
              ? `Retention expired ${formatDateTime(task.retention_expires_at)}; bounded cleanup pending`
              : `Retained until ${formatDateTime(task.retention_expires_at)}`}
          </span>
        ) : null}
      </div>
      {comparison ? (
        <p className="work-comparison">
          {comparison.label}
          {comparison.difference_minutes
            ? ` by ${comparison.difference_minutes} min`
            : ""}
        </p>
      ) : null}
      {task.blocker_reason ? (
        <p className="status-warning">
          <strong>Blocked:</strong> {task.blocker_reason}
        </p>
      ) : null}
      {task.source.status === "verified" && task.source.link ? (
        <p>
          <Link href={task.source.link}>Open linked {sourceLabel(task.source.type)}</Link>
          {task.source.version ? (
            <span className="muted"> · {task.source.version}</span>
          ) : null}
        </p>
      ) : task.source.type !== "manual" ? (
        <p className="status-warning">
          Linked source is not verified. No source link is available.
        </p>
      ) : null}

      <div className="work-actions" aria-label={`Actions for ${task.title}`}>
        {canStart ? (
          <button
            type="button"
            disabled={!mutationAllowed || busy}
            onClick={() =>
              void onMutate(
                {
                  action: "start_session",
                  task_id: task.id,
                  expected_task_version: task.record_version,
                  idempotency_key: crypto.randomUUID(),
                },
                `start-${task.id}`,
              )
            }
          >
            {task.state === "Not started" ? "Start work" : "Resume work"}
          </button>
        ) : null}
        {editable && task.state === "In progress" ? (
          <button
            type="button"
            className="secondary"
            disabled={!mutationAllowed || busy}
            onClick={() =>
              void onMutate(transitionBody(task, "Paused"), `pause-${task.id}`)
            }
          >
            Pause
          </button>
        ) : null}
        {editable && !isTerminalTaskState(task.state) ? (
          <button
            type="button"
            className="secondary"
            disabled={!mutationAllowed || busy}
            onClick={() =>
              void onMutate(transitionBody(task, "Completed"), `complete-${task.id}`)
            }
          >
            Complete
          </button>
        ) : null}
      </div>

      {editable && !isTerminalTaskState(task.state) ? (
        <TaskReasonTransition
          task={task}
          state="Blocked"
          label="Block task"
          mutationAllowed={mutationAllowed}
          busy={busy}
          onMutate={onMutate}
        />
      ) : null}
      {editable && !isTerminalTaskState(task.state) ? (
        <TaskReasonTransition
          task={task}
          state="Cancelled"
          label="Cancel task"
          mutationAllowed={mutationAllowed}
          busy={busy}
          onMutate={onMutate}
        />
      ) : null}
      {mode === "team" && isTerminalTaskState(task.state) ? (
        <TaskReasonTransition
          task={task}
          state="Paused"
          label="Reopen task"
          mutationAllowed={mutationAllowed}
          busy={busy}
          onMutate={onMutate}
        />
      ) : null}
      {mode === "team" && !activeSession ? (
        <ReassignTaskForm
          task={task}
          roster={roster}
          mutationAllowed={mutationAllowed}
          busy={busy}
          onMutate={onMutate}
        />
      ) : null}
      {mode === "team" && !isTerminalTaskState(task.state) && expectations.length ? (
        <RebaseExpectationForm
          task={task}
          expectations={expectations}
          mutationAllowed={mutationAllowed}
          busy={busy}
          onMutate={onMutate}
        />
      ) : null}

      {sessions.length ? (
        <details className="work-session-history" open={needsReview || undefined}>
          <summary>Session history ({sessions.length})</summary>
          <div className="ui-stack compact">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                tasks={allTasks.filter(
                  (candidate) =>
                    candidate.id === session.task_id ||
                    candidate.assignee_uid === session.staff_uid,
                )}
                mutationAllowed={mutationAllowed}
                busy={busy}
                onMutate={onMutate}
              />
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}

function TaskReasonTransition({
  task,
  state,
  label,
  mutationAllowed,
  busy,
  onMutate,
}: {
  task: WorkTaskRecord;
  state: "Blocked" | "Cancelled" | "Paused";
  label: string;
  mutationAllowed: boolean;
  busy: boolean;
  onMutate: (body: Record<string, unknown>, key: string) => Promise<boolean>;
}) {
  return (
    <details className="work-inline-details">
      <summary>{label}</summary>
      <form
        className="work-inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const reason = String(new FormData(form).get("reason"));
          void onMutate(
            {
              ...transitionBody(task, state),
              reason,
            },
            `${state}-${task.id}`,
          ).then((saved) => {
            if (saved) form.reset();
          });
        }}
      >
        <label>
          Reason
          <textarea name="reason" required maxLength={500} rows={2} />
        </label>
        <button type="submit" disabled={!mutationAllowed || busy}>
          Confirm {label.toLowerCase()}
        </button>
      </form>
    </details>
  );
}

function ReassignTaskForm({
  task,
  roster,
  mutationAllowed,
  busy,
  onMutate,
}: {
  task: WorkTaskRecord;
  roster: readonly WorkAssignableUser[];
  mutationAllowed: boolean;
  busy: boolean;
  onMutate: (body: Record<string, unknown>, key: string) => Promise<boolean>;
}) {
  return (
    <details className="work-inline-details">
      <summary>Change assignee</summary>
      <form
        className="work-inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          void onMutate(
            {
              action: "reassign_task",
              task_id: task.id,
              expected_version: task.record_version,
              assignee_uid: String(data.get("assignee_uid")),
              reason: String(data.get("reason")),
              idempotency_key: crypto.randomUUID(),
            },
            `reassign-${task.id}`,
          ).then((saved) => {
            if (saved) form.reset();
          });
        }}
      >
        <label>
          Active managed staff
          <select name="assignee_uid" required defaultValue="">
            <option value="" disabled>
              Select staff
            </option>
            {roster.map((person) => (
              <option key={person.uid} value={person.uid}>
                {person.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reason
          <textarea name="reason" required maxLength={500} rows={2} />
        </label>
        <button type="submit" disabled={!mutationAllowed || busy}>
          Save assignee
        </button>
      </form>
    </details>
  );
}

function RebaseExpectationForm({
  task,
  expectations,
  mutationAllowed,
  busy,
  onMutate,
}: {
  task: WorkTaskRecord;
  expectations: readonly WorkExpectationRecord[];
  mutationAllowed: boolean;
  busy: boolean;
  onMutate: (body: Record<string, unknown>, key: string) => Promise<boolean>;
}) {
  return (
    <details className="work-inline-details">
      <summary>Rebase expected time</summary>
      <form
        className="work-inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          void onMutate(
            {
              action: "rebase_expectation",
              task_id: task.id,
              expectation_key: String(data.get("expectation_key")),
              expected_task_version: task.record_version,
              reason: String(data.get("reason")),
              idempotency_key: crypto.randomUUID(),
            },
            `rebase-${task.id}`,
          ).then((saved) => {
            if (saved) form.reset();
          });
        }}
      >
        <label>
          Active expectation
          <select name="expectation_key" required>
            {expectations.map((expectation) => (
              <option key={expectation.id} value={expectation.expectation_key}>
                {expectation.minimum_minutes}–{expectation.maximum_minutes} min · v
                {expectation.version}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rebase reason
          <textarea name="reason" required maxLength={500} rows={2} />
        </label>
        <button type="submit" disabled={!mutationAllowed || busy}>
          Rebase this task
        </button>
      </form>
    </details>
  );
}

function SessionRow({
  session,
  tasks,
  mutationAllowed,
  busy,
  onMutate,
}: {
  session: WorkSessionRecord;
  tasks: readonly WorkTaskRecord[];
  mutationAllowed: boolean;
  busy: boolean;
  onMutate: (body: Record<string, unknown>, key: string) => Promise<boolean>;
}) {
  return (
    <div className="work-session-row">
      <p>
        <strong>{session.state}</strong> · {formatDateTime(session.effective_start_at)}
        {session.effective_end_at
          ? ` – ${formatDateTime(session.effective_end_at)}`
          : ""}{" "}
        · {session.effective_minutes} min
      </p>
      {session.end_reason ? (
        <p className="muted">End reason: {session.end_reason}</p>
      ) : null}
      {session.correction_state === "needs_review" ? (
        <p className="status-warning">Needs review: connection ended.</p>
      ) : null}
      {session.state === "Ended" && session.effective_end_at ? (
        <details className="work-inline-details">
          <summary>Correct session</summary>
          <form
            className="work-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              void onMutate(
                {
                  action: "correct_session",
                  session_id: session.id,
                  expected_version: session.record_version,
                  effective_start_at: new Date(String(data.get("start"))).toISOString(),
                  effective_end_at: new Date(String(data.get("end"))).toISOString(),
                  task_id: String(data.get("task_id")),
                  reason: String(data.get("reason")),
                  idempotency_key: crypto.randomUUID(),
                },
                `correct-${session.id}`,
              );
            }}
          >
            <label>
              Start
              <input
                type="datetime-local"
                name="start"
                required
                defaultValue={toLocalDateTimeInput(session.effective_start_at)}
              />
            </label>
            <label>
              End
              <input
                type="datetime-local"
                name="end"
                required
                defaultValue={toLocalDateTimeInput(session.effective_end_at)}
              />
            </label>
            <label>
              Task
              <select name="task_id" defaultValue={session.task_id}>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reason
              <textarea name="reason" required maxLength={500} rows={2} />
            </label>
            <button type="submit" disabled={!mutationAllowed || busy}>
              Save correction
            </button>
          </form>
        </details>
      ) : null}
    </div>
  );
}

function AdminWorkConfiguration({
  mutationAllowed,
  spaces,
  roster,
  snapshot,
  busy,
  onMutate,
  onRefresh,
  onError,
}: {
  mutationAllowed: boolean;
  spaces: readonly WorkSpaceOption[];
  roster: readonly WorkAssignableUser[];
  snapshot: WorkAccountabilitySnapshot;
  busy: boolean;
  onMutate: (
    body: Record<string, unknown>,
    key: string,
    focusTaskId?: string,
  ) => Promise<boolean>;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}) {
  return (
    <section className="ui-stack" aria-labelledby="work-configuration-title">
      <h2 id="work-configuration-title">Work configuration and retention</h2>
      <p className="muted">
        Expectations are manager-set versions. Session durations never set or revise an
        expectation.
      </p>
      <div className="grid two">
        <ExpectationForm
          spaces={spaces}
          mutationAllowed={mutationAllowed}
          busy={busy}
          onMutate={onMutate}
        />
        <MappingForm
          spaces={spaces}
          roster={roster}
          mutationAllowed={mutationAllowed}
          busy={busy}
          onMutate={onMutate}
        />
      </div>
      <DeriveTaskForm
        mappings={snapshot.mappings}
        mutationAllowed={mutationAllowed}
        busy={busy}
        onMutate={onMutate}
      />
      <div className="panel">
        <h3>Active configuration</h3>
        <p>{snapshot.expectations.length} expectation version(s) active.</p>
        <p>{snapshot.mappings.length} derivation mapping(s) active.</p>
      </div>
      <RetentionPanel
        mutationAllowed={mutationAllowed}
        onRefresh={onRefresh}
        onError={onError}
      />
    </section>
  );
}

function DeriveTaskForm({
  mappings,
  mutationAllowed,
  busy,
  onMutate,
}: {
  mappings: readonly WorkDerivationMappingRecord[];
  mutationAllowed: boolean;
  busy: boolean;
  onMutate: (body: Record<string, unknown>, key: string) => Promise<boolean>;
}) {
  return (
    <details className="panel">
      <summary>Derive a task from an approved mapping</summary>
      {mappings.length === 0 ? (
        <p className="muted">Create an approved mapping version first.</p>
      ) : (
        <form
          className="work-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            void onMutate(
              {
                action: "derive_task",
                mapping_key: String(data.get("mapping_key")),
                source_id: String(data.get("source_id")),
                idempotency_key: crypto.randomUUID(),
              },
              "derive-task",
            ).then((saved) => {
              if (saved) form.reset();
            });
          }}
        >
          <label>
            Approved mapping
            <select name="mapping_key" required>
              {mappings.map((mapping) => (
                <option key={mapping.id} value={mapping.mapping_key}>
                  {mapping.mapping_key} · v{mapping.version}
                </option>
              ))}
            </select>
          </label>
          <label>
            Source id
            <input name="source_id" required maxLength={160} />
          </label>
          <button type="submit" disabled={!mutationAllowed || busy}>
            Derive task
          </button>
        </form>
      )}
    </details>
  );
}

function ExpectationForm({
  spaces,
  mutationAllowed,
  busy,
  onMutate,
}: {
  spaces: readonly WorkSpaceOption[];
  mutationAllowed: boolean;
  busy: boolean;
  onMutate: (body: Record<string, unknown>, key: string) => Promise<boolean>;
}) {
  return (
    <details className="panel">
      <summary>Create expectation version</summary>
      <form
        className="work-inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const taskType = String(data.get("task_type"));
          const spaceId = String(data.get("space_id"));
          void onMutate(
            {
              action: "create_expectation",
              expectation_key: `${spaceId}:${taskType}`,
              task_type: taskType,
              space_id: spaceId,
              minimum_minutes: Number(data.get("minimum")),
              maximum_minutes: Number(data.get("maximum")),
              rationale: String(data.get("rationale")),
              idempotency_key: crypto.randomUUID(),
            },
            "create-expectation",
          ).then((saved) => {
            if (saved) form.reset();
          });
        }}
      >
        <label>
          Space
          <select name="space_id" required defaultValue={spaces[0]?.id ?? ""}>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Task type
          <input name="task_type" required maxLength={100} />
        </label>
        <label>
          Minimum minutes
          <input name="minimum" type="number" min={1} step={1} required />
        </label>
        <label>
          Maximum minutes
          <input name="maximum" type="number" min={1} step={1} required />
        </label>
        <label>
          Rationale
          <textarea name="rationale" required maxLength={500} rows={2} />
        </label>
        <button type="submit" disabled={!mutationAllowed || busy}>
          Save expectation version
        </button>
      </form>
    </details>
  );
}

function MappingForm({
  spaces,
  roster,
  mutationAllowed,
  busy,
  onMutate,
}: {
  spaces: readonly WorkSpaceOption[];
  roster: readonly WorkAssignableUser[];
  mutationAllowed: boolean;
  busy: boolean;
  onMutate: (body: Record<string, unknown>, key: string) => Promise<boolean>;
}) {
  return (
    <details className="panel">
      <summary>Create derivation mapping version</summary>
      <form
        className="work-inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const assignee = String(data.get("assignee_uid"));
          void onMutate(
            {
              action: "create_mapping",
              mapping_key: String(data.get("mapping_key")),
              source_type: String(data.get("source_type")),
              actionable_unit: String(data.get("actionable_unit")),
              task_type: String(data.get("task_type")),
              title: String(data.get("title")),
              next_action: String(data.get("next_action")),
              space_id: String(data.get("space_id")),
              ...(assignee ? { assignee_uid: assignee } : {}),
              rationale: String(data.get("rationale")),
              idempotency_key: crypto.randomUUID(),
            },
            "create-mapping",
          ).then((saved) => {
            if (saved) form.reset();
          });
        }}
      >
        <label>
          Mapping key
          <input name="mapping_key" required maxLength={160} />
        </label>
        <label>
          Source type
          <select name="source_type" defaultValue="workflow_run">
            {WORK_SOURCE_TYPES.filter((type) => type !== "manual").map((type) => (
              <option key={type} value={type}>
                {sourceLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Actionable unit
          <input name="actionable_unit" required maxLength={160} />
        </label>
        <label>
          Space
          <select name="space_id" required defaultValue={spaces[0]?.id ?? ""}>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Task type
          <input name="task_type" required maxLength={100} />
        </label>
        <label>
          Title
          <input name="title" required maxLength={160} />
        </label>
        <label>
          Next action
          <input name="next_action" required maxLength={240} />
        </label>
        <label>
          Assignee <span className="muted">(optional; missing remains blocked)</span>
          <select name="assignee_uid" defaultValue="">
            <option value="">Unassigned</option>
            {roster.map((person) => (
              <option key={person.uid} value={person.uid}>
                {person.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rationale
          <textarea name="rationale" required maxLength={500} rows={2} />
        </label>
        <button type="submit" disabled={!mutationAllowed || busy}>
          Save mapping version
        </button>
      </form>
    </details>
  );
}

function RetentionPanel({
  mutationAllowed,
  onRefresh,
  onError,
}: {
  mutationAllowed: boolean;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [plan, setPlan] = useState<{
    as_of: string;
    limit: number;
    candidates: Array<{ target_collection: string; target_id: string }>;
    plan_hash: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/work/retention?limit=100", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        plan?: typeof plan;
        error?: string;
      };
      if (!response.ok || !payload.plan) {
        throw new Error(payload.error ?? "Retention preview is unavailable.");
      }
      setPlan(payload.plan);
    } catch (previewError) {
      onError(
        previewError instanceof Error
          ? previewError.message
          : "Retention preview is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  };
  const execute = async () => {
    if (!plan || !mutationAllowed) return;
    setBusy(true);
    try {
      const response = await fetch("/api/work/retention", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, confirmation_hash: plan.plan_hash }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error ?? "Retention cleanup was refused.");
      setPlan(null);
      await onRefresh();
    } catch (executeError) {
      onError(
        executeError instanceof Error
          ? executeError.message
          : "Retention cleanup was refused.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel">
      <h3>12-month retention</h3>
      <p className="muted">
        Preview a bounded batch. Active, unexpired, or legal-hold records remain
        untouched.
      </p>
      <div className="work-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => void preview()}
          disabled={busy}
        >
          Preview expired records
        </button>
        {plan ? (
          <button
            type="button"
            onClick={() => void execute()}
            disabled={busy || !mutationAllowed}
          >
            Confirm exact batch ({plan.candidates.length})
          </button>
        ) : null}
      </div>
      {plan ? (
        <p role="status">
          Exact preview: {plan.candidates.length} record(s), hash{" "}
          {plan.plan_hash.slice(0, 12)}…
        </p>
      ) : null}
    </div>
  );
}

function transitionBody(task: WorkTaskRecord, nextState: WorkTaskState) {
  return {
    action: "transition_task",
    task_id: task.id,
    expected_version: task.record_version,
    next_state: nextState,
    idempotency_key: crypto.randomUUID(),
  };
}

function sourceLabel(type: WorkSourceType): string {
  if (type === "workflow_run") return "workflow run";
  if (type === "renewal_lease") return "renewal lease";
  if (type === "maintenance_ticket") return "maintenance ticket";
  if (type === "approval_item") return "Approval item";
  return "manual internal task";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toLocalDateTimeInput(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
