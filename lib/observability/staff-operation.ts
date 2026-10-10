import { AsyncLocalStorage } from "node:async_hooks";

/** S185: request-local diagnostics. Only fixed operation/stage names, counts and elapsed times
 * leave this scope. Actor IDs, targets, words, query values, error bodies and credentials do not. */
export type StaffOperation =
  | "maintenance_read"
  | "maintenance_edit"
  | "maintenance_provider_update"
  | "communications_prepare";
export type StaffOperationStage =
  | "permission"
  | "decode"
  | "source_read"
  | "record_read"
  | "prepare"
  | "commit"
  | "provider_dispatch"
  | "reconcile";
interface Stage {
  calls: number;
  completed: number;
  failed: number;
  durationMs: number;
}
interface Trace {
  operation: StaffOperation;
  userActions: 0 | 1;
  started: number;
  stages: Partial<Record<StaffOperationStage, Stage>>;
  reads: Map<string, Promise<unknown>>;
  coalescedReads: number;
}
const current = new AsyncLocalStorage<Trace>();
export async function operationStage<T>(
  stage: StaffOperationStage,
  task: () => Promise<T>,
): Promise<T> {
  const trace = current.getStore();
  if (!trace) return task();
  const row =
    trace.stages[stage] ??
    (trace.stages[stage] = { calls: 0, completed: 0, failed: 0, durationMs: 0 });
  row.calls++;
  const start = performance.now();
  try {
    const result = await task();
    row.completed++;
    return result;
  } catch (error) {
    row.failed++;
    throw error;
  } finally {
    row.durationMs += performance.now() - start;
  }
}
export async function observeStaffOperation<T>(
  operation: StaffOperation,
  userActions: 0 | 1,
  task: () => Promise<T>,
  emit: (record: unknown) => void = (record) => console.info(JSON.stringify(record)),
): Promise<T> {
  const trace: Trace = {
    operation,
    userActions,
    started: performance.now(),
    stages: {},
    reads: new Map(),
    coalescedReads: 0,
  };
  return current.run(trace, async () => {
    let outcome = "failed";
    try {
      const result = await task();
      outcome =
        result instanceof Response && result.status >= 400 ? "refused" : "completed";
      return result;
    } finally {
      // Diagnostics must never change an operation's result or cause a caller to retry its effect.
      try {
        emit({
          event: "staff_operation",
          operation,
          userActions,
          coalescedReads: trace.coalescedReads,
          outcome,
          durationMs: Math.round(performance.now() - trace.started),
          stages: Object.fromEntries(
            Object.entries(trace.stages).map(([name, row]) => [
              name,
              { ...row, durationMs: Math.round(row.durationMs) },
            ]),
          ),
        });
      } catch {}
    }
  });
}

/** Only read-only composition may reuse an app-owned history snapshot inside its one request.
 * Permissions are still checked at each caller. Effect admission/dispatch/recovery always read
 * afresh in their separate POST/worker scope; no provider response or authority is cached. */
export function compositionRecordRead<T>(
  partition: {
    actorUid: string;
    authorityFingerprint: string;
    recordKey: string;
    configVersion: string;
  },
  read: () => Promise<T>,
): Promise<T> {
  const trace = current.getStore();
  if (!trace || trace.operation !== "communications_prepare" || trace.userActions !== 0)
    return read();
  const key = JSON.stringify([
    partition.actorUid,
    partition.authorityFingerprint,
    partition.recordKey,
    partition.configVersion,
  ]);
  const prior = trace.reads.get(key);
  if (prior) {
    trace.coalescedReads++;
    return prior as Promise<T>;
  }
  const pending = Promise.resolve().then(read);
  trace.reads.set(key, pending);
  void pending.catch(() => {
    if (trace.reads.get(key) === pending) trace.reads.delete(key);
  });
  return pending;
}
