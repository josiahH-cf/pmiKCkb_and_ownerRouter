import { describe, expect, it } from "vitest";

import { EditableLayerError } from "@/lib/firestore/errors";
import { transitionWriteBack, type WriteBackState } from "@/lib/lease-renewal/writeback";
import {
  planWritebackApprovalDecision,
  WRITEBACK_AWAITING_APPROVAL,
} from "@/lib/lease-renewal/writeback-approval";

describe("planWritebackApprovalDecision", () => {
  it("approves a freshly queued proposal (Awaiting Approval → Approved), never executing", () => {
    const plan = planWritebackApprovalDecision("approve");
    expect(plan.state).toBe("Approved");
    expect(plan.productionAllowed).toBe(false);
    expect(plan.executed).toBe(false);
  });

  it("returns a queued proposal for revision", () => {
    const plan = planWritebackApprovalDecision("return", WRITEBACK_AWAITING_APPROVAL);
    expect(plan.state).toBe("Returned for Revision");
  });

  it("revokes an approval (Approved → Returned for Revision) — safe, nothing executed", () => {
    const plan = planWritebackApprovalDecision("return", "Approved");
    expect(plan.state).toBe("Returned for Revision");
  });

  it("re-approves a returned proposal", () => {
    const plan = planWritebackApprovalDecision("approve", "Returned for Revision");
    expect(plan.state).toBe("Approved");
  });

  it("rejects a double-approve", () => {
    expect(() => planWritebackApprovalDecision("approve", "Approved")).toThrow(
      EditableLayerError,
    );
  });

  it("rejects re-returning an already-returned proposal", () => {
    expect(() =>
      planWritebackApprovalDecision("return", "Returned for Revision"),
    ).toThrow(EditableLayerError);
  });

  it("never yields an executing state and stays a subset of the audited write-back FSM", () => {
    const executing: WriteBackState[] = ["Writing", "Verifying", "Written"];
    const states = [
      WRITEBACK_AWAITING_APPROVAL,
      "Approved",
      "Returned for Revision",
    ] as const;

    for (const previousState of states) {
      for (const decision of ["approve", "return"] as const) {
        let state: WriteBackState;
        try {
          state = planWritebackApprovalDecision(decision, previousState).state;
        } catch {
          continue; // illegal transitions are rejected, never executed
        }
        expect(executing).not.toContain(state);
        // The produced state is a genuine non-executing state in the safety FSM (block always legal).
        expect(() => transitionWriteBack(state, "block")).not.toThrow();
      }
    }
  });
});
