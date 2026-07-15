import { describe, expect, it } from "vitest";

import { LEASE_EXECUTION_ACTIONS } from "@/lib/lease-renewal/execution/matrix";
import { MAINTENANCE_EXECUTION_ACTIONS } from "@/lib/maintenance/execution/matrix";
import { runIntegratedFakeV1Acceptance } from "@/lib/release/fake-acceptance";

describe("typed integrated V1 synthetic acceptance", () => {
  it("runs every S25/S26 adapter with exact schemas and bodyless evidence", async () => {
    const result = await runIntegratedFakeV1Acceptance();

    expect(result.mode).toBe("synthetic-fake-only");
    expect(result.vendorBoundary).toEqual({
      assignedTicketOnly: true,
      disabled: true,
      exactReplyOneAttempt: true,
      invited: true,
      liveProviderCalls: 0,
      oauthExactScopes: true,
      sameMailbox: true,
      sessionRevoked: true,
      tokenRevocationQueued: true,
      typedProviderBoundary: true,
      verifiedEmailTotp: true,
      wrongMailboxBlocked: true,
    });
    expect(new Set(result.lease.keys)).toEqual(new Set(LEASE_EXECUTION_ACTIONS));
    expect(new Set(result.maintenance.keys)).toEqual(
      new Set(MAINTENANCE_EXECUTION_ACTIONS),
    );

    for (const lane of [result.lease, result.maintenance]) {
      expect(lane.receiptCount).toBe(lane.actionCount);
      expect(lane.typedAdapterCount).toBe(lane.actionCount);
      expect(lane.attemptCount).toBe(lane.actionCount);
      expect(lane.providerCallCount).toBeGreaterThan(0);
      expect(lane.actions).toHaveLength(lane.actionCount);
      expect(lane.actions.every((action) => action.state === "succeeded")).toBe(true);
      expect(lane.actions.every((action) => action.receiptHash?.length === 64)).toBe(
        true,
      );
    }

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Synthetic kitchen sink leak");
    expect(serialized).not.toContain("Exact body");
  });
});
