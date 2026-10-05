/** Local waits have finite lifetimes. Aborting a wait never proves a server effect stopped. */
export type OperationKind = "read" | "save" | "effect";
export type OperationPhase =
  | "idle"
  | "pending"
  | "succeeded"
  | "failed"
  | "interrupted"
  | "unknown";
export interface OperationSnapshot {
  readonly generation: number;
  readonly phase: OperationPhase;
  readonly label: string;
  readonly reason: "timeout" | "stopped" | "failed" | null;
}
export type OperationResult<T> =
  | { readonly outcome: "succeeded"; readonly value: T }
  | { readonly outcome: "superseded" | "failed" | "interrupted" | "unknown" };
export const READ_WAIT_MS = 60_000;

export class OperationController {
  private snapshot: OperationSnapshot = {
    generation: 0,
    phase: "idle",
    label: "",
    reason: null,
  };
  private listeners = new Set<() => void>();
  private terminate: (() => void) | null = null;
  private kind: OperationKind = "read";
  readonly getSnapshot = () => this.snapshot;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(snapshot: OperationSnapshot) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
  stop(reason: "timeout" | "stopped" = "stopped") {
    if (this.snapshot.phase !== "pending") return;
    this.publish({
      ...this.snapshot,
      phase: this.kind === "read" ? "interrupted" : "unknown",
      reason,
    });
    this.terminate?.();
  }
  reset() {
    this.stop();
    this.publish({
      generation: this.snapshot.generation + 1,
      phase: "idle",
      label: "",
      reason: null,
    });
  }
  async run<T>(
    label: string,
    work: (signal: AbortSignal) => Promise<T>,
    {
      kind = "read",
      waitMs = READ_WAIT_MS,
    }: { kind?: OperationKind; waitMs?: number } = {},
  ): Promise<OperationResult<T>> {
    if (!Number.isFinite(waitMs) || waitMs <= 0)
      throw new RangeError("Operation wait must be finite and positive");
    // Effects/saves retain their original owning attempt and require authoritative recovery.
    if (this.snapshot.phase === "pending" && this.kind !== "read")
      return { outcome: "unknown" };
    if (this.snapshot.phase === "unknown") return { outcome: "unknown" };
    this.stop();
    const generation = this.snapshot.generation + 1;
    const abort = new AbortController();
    let endWait!: () => void;
    const ended = new Promise<OperationResult<T>>((resolve) => {
      endWait = () => {
        abort.abort();
        resolve({ outcome: kind === "read" ? "interrupted" : "unknown" });
      };
    });
    this.terminate = endWait;
    this.kind = kind;
    this.publish({ generation, phase: "pending", label, reason: null });
    const timer = setTimeout(() => {
      if (this.snapshot.generation === generation) this.stop("timeout");
    }, waitMs);
    try {
      const dispatched = Promise.resolve().then(() => {
        if (abort.signal.aborted || this.snapshot.generation !== generation) return ended;
        return work(abort.signal).then<OperationResult<T>>((value) => ({
          outcome: "succeeded",
          value,
        }));
      });
      const result = await Promise.race([dispatched, ended]);
      const state = this.getSnapshot();
      if (state.generation !== generation) return { outcome: "superseded" };
      if (state.phase !== "pending")
        return { outcome: state.phase === "unknown" ? "unknown" : "interrupted" };
      this.publish({ generation, phase: "succeeded", label, reason: null });
      return result;
    } catch {
      const state = this.getSnapshot();
      if (state.generation !== generation) return { outcome: "superseded" };
      if (state.phase !== "pending")
        return { outcome: state.phase === "unknown" ? "unknown" : "interrupted" };
      const phase = kind === "read" ? "failed" : "unknown";
      this.publish({ generation, phase, label, reason: "failed" });
      return { outcome: phase };
    } finally {
      clearTimeout(timer);
      if (this.snapshot.generation === generation) this.terminate = null;
    }
  }
}
