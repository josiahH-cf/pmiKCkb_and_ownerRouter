import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "./helpers/client.mjs";

describe("integrated final-V1 fake-provider acceptance", () => {
  let client;

  beforeAll(async () => {
    client = createClient();
    await client.signInDemo();
  });

  it("completes Vendor boundary plus every S25/S26 fake action with one receipt", async () => {
    const response = await client.request("/api/admin/v1/fake-acceptance", {
      method: "POST",
    });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.mode).toBe("synthetic-fake-only");
    expect(json.vendorBoundary).toEqual({
      verifiedEmailTotp: true,
      assignedTicketOnly: true,
      liveProviderCalls: 0,
      typedProviderBoundary: true,
      invited: true,
      oauthExactScopes: true,
      sameMailbox: true,
      wrongMailboxBlocked: true,
      exactReplyOneAttempt: true,
      disabled: true,
      sessionRevoked: true,
      tokenRevocationQueued: true,
    });
    expect(json.lease.receiptCount).toBe(json.lease.actionCount);
    expect(json.lease.attemptCount).toBe(json.lease.actionCount);
    expect(json.maintenance.receiptCount).toBe(json.maintenance.actionCount);
    expect(json.maintenance.attemptCount).toBe(json.maintenance.actionCount);
    expect(json.lease.typedAdapterCount).toBe(json.lease.actionCount);
    expect(json.maintenance.typedAdapterCount).toBe(json.maintenance.actionCount);
    expect(json.lease.providerCallCount).toBeGreaterThan(0);
    expect(json.maintenance.providerCallCount).toBeGreaterThan(0);
  });
});
