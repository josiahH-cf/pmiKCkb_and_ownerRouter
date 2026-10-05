import { describe, expect, it, vi } from "vitest";
import { OperationController } from "@/lib/ui/operation";

describe("S169 finite independent operation generations", () => {
  it("acknowledges before dispatch, supersedes reads and rejects late admission", async () => {
    const operation = new OperationController();
    let first!: (value: number) => void;
    const a = operation.run(
      "First",
      () =>
        new Promise<number>((resolve) => {
          first = resolve;
        }),
    );
    expect(operation.getSnapshot()).toMatchObject({ phase: "pending", label: "First" });
    await Promise.resolve();
    const b = operation.run("Second", async () => 2);
    expect(await b).toEqual({ outcome: "succeeded", value: 2 });
    first(1);
    expect(await a).toEqual({ outcome: "superseded" });
    expect(operation.getSnapshot()).toMatchObject({
      phase: "succeeded",
      label: "Second",
    });
  });
  it("allows unrelated operations and bounds a stalled local read", async () => {
    vi.useFakeTimers();
    try {
      const a = new OperationController();
      const b = new OperationController();
      const waiting = a.run("Read", () => new Promise<never>(() => {}), { waitMs: 100 });
      expect(await b.run("Copy", async () => true)).toMatchObject({
        outcome: "succeeded",
      });
      await vi.advanceTimersByTimeAsync(101);
      expect(await waiting).toEqual({ outcome: "interrupted" });
      expect(a.getSnapshot()).toMatchObject({ phase: "interrupted", reason: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });
  it("retains uncertainty and refuses duplicate write dispatch after a lost response", async () => {
    const operation = new OperationController();
    const dispatch = vi.fn(async () => {
      throw new Error("response lost");
    });
    expect(await operation.run("Save", dispatch, { kind: "save" })).toEqual({
      outcome: "unknown",
    });
    expect(await operation.run("Save again", dispatch, { kind: "save" })).toEqual({
      outcome: "unknown",
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it("stopping before the dispatch microtask does not dispatch", async () => {
    const operation = new OperationController();
    const dispatch = vi.fn(async () => 1);
    const pending = operation.run("Draft", dispatch, { kind: "effect" });
    operation.stop();
    await pending;
    expect(dispatch).not.toHaveBeenCalled();
    expect(operation.getSnapshot().phase).toBe("unknown");
  });
  it("reset on session change prevents admission and clears old status", async () => {
    const operation = new OperationController();
    const pending = operation.run("Old account", () => new Promise<never>(() => {}));
    operation.reset();
    expect(await pending).toEqual({ outcome: "superseded" });
    expect(operation.getSnapshot().phase).toBe("idle");
  });
});
