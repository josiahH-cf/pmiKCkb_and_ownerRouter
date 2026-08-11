import {
  WORK_RETENTION_MONTHS,
  type WorkExpectationComparison,
  type WorkIdlePhase,
  type WorkSessionRecord,
  type WorkSourceReference,
  type WorkSourceType,
  type WorkTaskRecord,
  type WorkTaskState,
} from "@/lib/work-accountability/types";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";

export const WORK_IDLE_WARNING_MS = 13 * 60 * 1_000;
export const WORK_IDLE_CUTOFF_MS = 15 * 60 * 1_000;
export const WORK_HEARTBEAT_MINIMUM_MS = 60 * 1_000;

export class WorkAccountabilityError extends EditableLayerError {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 = 400,
    public readonly code = "work_accountability_error",
  ) {
    super(message, status);
    this.name = "WorkAccountabilityError";
  }
}

export function assertFiniteIso(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new WorkAccountabilityError(`${label} must be a valid date and time.`);
  }
  return timestamp;
}

export function addRetentionPeriod(iso: string): string {
  const timestamp = assertFiniteIso(iso, "Retention anchor");
  const source = new Date(timestamp);
  const targetYear = source.getUTCFullYear() + Math.floor(WORK_RETENTION_MONTHS / 12);
  const targetMonth = source.getUTCMonth() + (WORK_RETENTION_MONTHS % 12);
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(source.getUTCDate(), lastDay),
      source.getUTCHours(),
      source.getUTCMinutes(),
      source.getUTCSeconds(),
      source.getUTCMilliseconds(),
    ),
  ).toISOString();
}

export function workIdlePhase(lastAcknowledgedAt: string, nowIso: string): WorkIdlePhase {
  const elapsed =
    assertFiniteIso(nowIso, "Current time") -
    assertFiniteIso(lastAcknowledgedAt, "Last acknowledged activity");
  if (elapsed >= WORK_IDLE_CUTOFF_MS) return "cutoff";
  if (elapsed >= WORK_IDLE_WARNING_MS) return "warning";
  return "active";
}

export function idleCutoffAt(lastAcknowledgedAt: string): string {
  return new Date(
    assertFiniteIso(lastAcknowledgedAt, "Last acknowledged activity") +
      WORK_IDLE_CUTOFF_MS,
  ).toISOString();
}

export function shouldAcknowledgeHeartbeat(
  lastAcknowledgedAt: string,
  nowIso: string,
): boolean {
  const elapsed =
    assertFiniteIso(nowIso, "Current time") -
    assertFiniteIso(lastAcknowledgedAt, "Last acknowledged activity");
  return elapsed >= WORK_HEARTBEAT_MINIMUM_MS && elapsed < WORK_IDLE_CUTOFF_MS;
}

export function durationMinutes(startAt: string, endAt: string): number {
  const start = assertFiniteIso(startAt, "Session start");
  const end = assertFiniteIso(endAt, "Session end");
  if (end < start) {
    throw new WorkAccountabilityError("Session end cannot be before its start.");
  }
  return Math.round(((end - start) / 60_000) * 100) / 100;
}

export function actualTaskMinutes(
  taskId: string,
  sessions: readonly WorkSessionRecord[],
): number {
  const total = sessions
    .filter(
      (session) =>
        session.task_id === taskId &&
        session.state === "Ended" &&
        session.effective_end_at !== undefined,
    )
    .reduce((sum, session) => sum + session.effective_minutes, 0);
  return Math.round(total * 100) / 100;
}

export function compareTaskExpectation(
  task: WorkTaskRecord,
  actualMinutes: number,
): WorkExpectationComparison | null {
  const expectation = task.expectation_snapshot;
  if (!expectation || task.state !== "Completed") return null;
  if (actualMinutes < expectation.minimum_minutes) {
    return {
      label: "Below expected range",
      difference_minutes: roundDifference(expectation.minimum_minutes - actualMinutes),
    };
  }
  if (actualMinutes > expectation.maximum_minutes) {
    return {
      label: "Above expected range",
      difference_minutes: roundDifference(actualMinutes - expectation.maximum_minutes),
    };
  }
  return { label: "Within expected range", difference_minutes: 0 };
}

export function isTerminalTaskState(state: WorkTaskState): boolean {
  return state === "Completed" || state === "Cancelled";
}

export function assertTransitionAllowed(
  current: WorkTaskState,
  next: WorkTaskState,
): void {
  const allowed: Readonly<Record<WorkTaskState, readonly WorkTaskState[]>> = {
    "Not started": ["In progress", "Blocked", "Completed", "Cancelled"],
    "In progress": ["Paused", "Blocked", "Completed", "Cancelled"],
    Paused: ["In progress", "Blocked", "Completed", "Cancelled"],
    Blocked: ["In progress", "Completed", "Cancelled"],
    Completed: ["Paused"],
    Cancelled: ["Paused"],
  };
  if (!allowed[current].includes(next)) {
    throw new WorkAccountabilityError(
      `Work cannot move from ${current} to ${next}.`,
      409,
      "invalid_transition",
    );
  }
}

export function canonicalSourceLink(
  type: WorkSourceType,
  id?: string,
): string | undefined {
  if (type === "manual") return undefined;
  const normalized = normalizeOpaqueId(id, "Source id");
  const encoded = encodeURIComponent(normalized);
  if (type === "workflow_run") return `/workflow-runs/${encoded}`;
  if (type === "renewal_lease") {
    return `/lease-renewal/live/desk/lease/${encoded}`;
  }
  if (type === "maintenance_ticket") {
    return `/maintenance?ticket_id=${encoded}`;
  }
  return `/approval-queue?item_id=${encoded}`;
}

export function unverifiedSource(
  type: WorkSourceType,
  id?: string,
  version?: string,
): WorkSourceReference {
  return {
    type,
    ...(id ? { id: normalizeOpaqueId(id, "Source id") } : {}),
    ...(version?.trim() ? { version: version.trim() } : {}),
    status: type === "manual" ? "verified" : "unverified",
  };
}

export function normalizeOpaqueId(value: string | undefined, label: string): string {
  const normalized = value?.trim() ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(normalized)) {
    throw new WorkAccountabilityError(`${label} is invalid.`);
  }
  return normalized;
}

export function normalizeShortText(
  value: string,
  label: string,
  maximum: number,
): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new WorkAccountabilityError(`${label} must be 1 to ${maximum} characters.`);
  }
  return normalized;
}

function roundDifference(value: number): number {
  return Math.round(value * 100) / 100;
}
