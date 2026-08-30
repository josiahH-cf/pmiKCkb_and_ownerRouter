import { afterEach, describe, expect, it, vi } from "vitest";

// Wiring test for the renewal-progress route: it is edit/renewals-gated, dispatches the
// actions to the store, and rejects a malformed body without ever touching the store.
const mocks = vi.hoisted(() => ({
  requireCapabilityInSpace: vi.fn(),
  recordOwnerDecision: vi.fn(),
  recordTenantOutcome: vi.fn(),
  markRenewalComplete: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return { ...actual, requireCapabilityInSpace: mocks.requireCapabilityInSpace };
});

vi.mock("@/lib/firestore/lease-renewal-progress", () => ({
  recordOwnerDecision: mocks.recordOwnerDecision,
  recordTenantOutcome: mocks.recordTenantOutcome,
  markRenewalComplete: mocks.markRenewalComplete,
}));

import { createRenewalProgressPostHandler } from "@/app/api/lease-renewal/renewal-progress/route";
import { LeaseDataExpiredError } from "@/lib/lease-renewal/live-lease-cache";

const user = {
  uid: "u1",
  email: "u1@example.com",
  hd: "example.com",
  role: "Editor" as const,
};

function post(body: unknown) {
  return createRenewalProgressPostHandler({
    requireCapabilityInSpace: mocks.requireCapabilityInSpace,
    recordDecision: mocks.recordOwnerDecision,
    recordOutcome: mocks.recordTenantOutcome,
    markComplete: mocks.markRenewalComplete,
  })(
    new Request("http://localhost/api/lease-renewal/renewal-progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

afterEach(() => vi.clearAllMocks());

describe("renewal-progress route", () => {
  it("records an owner decision through the edit/renewals gate", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue(user);
    mocks.recordOwnerDecision.mockResolvedValue({
      leaseId: "5001",
      stageIndex: 2,
      ownerDecision: { decision: "increase", offeredRent: 1300 },
      tenantOfferDraftId: null,
      complete: false,
    });

    const res = await post({
      action: "owner_decision",
      leaseId: "5001",
      decision: "increase",
      offeredRent: 1300,
      charges: { rbp: 28 },
      infoFormUrl: "https://forms.example/x",
    });

    expect(res.status).toBe(200);
    expect(mocks.requireCapabilityInSpace).toHaveBeenCalledWith("edit", "renewals");
    expect(mocks.recordOwnerDecision).toHaveBeenCalledWith(
      user,
      "5001",
      expect.objectContaining({
        decision: "increase",
        offeredRent: 1300,
        charges: { rbp: 28 },
        infoFormUrl: "https://forms.example/x",
      }),
    );
    const json = (await res.json()) as { progress: { stageIndex: number } };
    expect(json.progress.stageIndex).toBe(2);
  });

  it("passes the operator comp basis (market) through to the store", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue(user);
    mocks.recordOwnerDecision.mockResolvedValue({
      leaseId: "5001",
      stageIndex: 2,
      ownerDecision: { decision: "increase", offeredRent: 1300 },
      tenantOfferDraftId: null,
      complete: false,
    });

    const res = await post({
      action: "owner_decision",
      leaseId: "5001",
      decision: "increase",
      offeredRent: 1300,
      market: {
        rangeLow: 1450,
        rangeHigh: 1600,
        pmiNumber: 1550,
      },
    });

    expect(res.status).toBe(200);
    expect(mocks.recordOwnerDecision).toHaveBeenCalledWith(
      user,
      "5001",
      expect.objectContaining({
        market: {
          rangeLow: 1450,
          rangeHigh: 1600,
          pmiNumber: 1550,
        },
      }),
    );
  });

  it("leaves screenshot derivation to the atomic Firestore decision store", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue(user);
    mocks.recordOwnerDecision.mockResolvedValue({
      leaseId: "5001",
      stageIndex: 2,
      ownerDecision: { decision: "increase", offeredRent: 1300 },
      tenantOfferDraftId: null,
      complete: false,
    });

    const res = await post({
      action: "owner_decision",
      leaseId: "5001",
      decision: "increase",
      offeredRent: 1300,
      market: { pmiNumber: 1550 },
    });

    expect(res.status).toBe(200);
    expect(mocks.recordOwnerDecision).toHaveBeenCalledWith(
      user,
      "5001",
      expect.objectContaining({
        market: {
          pmiNumber: 1550,
        },
      }),
    );
  });

  it("rejects a caller-supplied Drive reference before persistence", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue(user);
    const res = await post({
      action: "owner_decision",
      leaseId: "5001",
      decision: "increase",
      offeredRent: 1300,
      market: { compScreenshotRef: "drive:forged-file" },
    });

    expect(res.status).toBe(400);
    expect(mocks.recordOwnerDecision).not.toHaveBeenCalled();
  });

  it("rejects historical market keys at the current API boundary", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue(user);
    const res = await post({
      action: "owner_decision",
      leaseId: "5001",
      decision: "increase",
      offeredRent: 1300,
      market: { ["comps" + "Url"]: "https://legacy.invalid" },
    });
    expect(res.status).toBe(400);
    expect(mocks.recordOwnerDecision).not.toHaveBeenCalled();
  });

  it("marks a renewal complete", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue(user);
    mocks.markRenewalComplete.mockResolvedValue({
      leaseId: "5001",
      stageIndex: 3,
      ownerDecision: null,
      tenantOfferDraftId: null,
      complete: true,
    });

    const res = await post({ action: "mark_complete", leaseId: "5001" });

    expect(res.status).toBe(200);
    expect(mocks.markRenewalComplete).toHaveBeenCalledWith(user, "5001");
    expect(mocks.recordOwnerDecision).not.toHaveBeenCalled();
  });

  it("records a source-backed accepted tenant outcome without a provider action", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue(user);
    mocks.recordTenantOutcome.mockResolvedValue({
      leaseId: "5001",
      processVersion: "renewal-v1",
      stageIndex: 3,
      tenantOutcome: { state: "accepted" },
      complete: false,
    });

    const evidence = {
      ref: "gmail-thread:thread-5001:message-7",
      source: "gmail_receipt",
      disposition: "verified",
      observedAt: "2026-08-29T12:00:00.000Z",
    } as const;
    const res = await post({
      action: "tenant_outcome",
      leaseId: "5001",
      outcome: "accepted",
      evidence,
    });

    expect(res.status).toBe(200);
    expect(mocks.recordTenantOutcome).toHaveBeenCalledWith(
      user,
      "5001",
      "accepted",
      evidence,
    );
    expect(mocks.recordOwnerDecision).not.toHaveBeenCalled();
    expect(mocks.markRenewalComplete).not.toHaveBeenCalled();
  });

  it("rejects a tenant outcome without an exact verified evidence reference", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue(user);

    const res = await post({
      action: "tenant_outcome",
      leaseId: "5001",
      outcome: "counter_change_requested",
      evidence: {
        ref: "gmail-thread:thread-5001\nraw body",
        source: "gmail_receipt",
        disposition: "not_applicable",
      },
    });

    expect(res.status).toBe(400);
    expect(mocks.recordTenantOutcome).not.toHaveBeenCalled();
  });

  it("rejects a non-positive offer with a 400 and never touches the store", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue(user);
    const res = await post({
      action: "owner_decision",
      leaseId: "5001",
      decision: "increase",
      offeredRent: -5,
    });
    expect(res.status).toBe(400);
    expect(mocks.recordOwnerDecision).not.toHaveBeenCalled();
  });

  it("rejects an unknown action with a 400", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue(user);
    const res = await post({ action: "explode", leaseId: "5001" });
    expect(res.status).toBe(400);
  });

  // AC-S58-3: expired lease data refuses with the explicit reason and records nothing.
  it("refuses to record a decision on expired lease data and creates nothing", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue(user);
    const handler = createRenewalProgressPostHandler({
      requireCapabilityInSpace: mocks.requireCapabilityInSpace,
      recordDecision: mocks.recordOwnerDecision,
      markComplete: mocks.markRenewalComplete,
      assertLeaseDataCurrent: vi
        .fn()
        .mockRejectedValue(new LeaseDataExpiredError(16 * 60_000)),
    });
    const res = await handler(
      new Request("http://localhost/api/lease-renewal/renewal-progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "owner_decision",
          leaseId: "5001",
          decision: "increase",
          offeredRent: 1300,
        }),
      }),
    );
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string; error_type: string };
    expect(json.error_type).toBe("lease_data_expired");
    expect(json.error).toContain("minute");
    expect(mocks.recordOwnerDecision).not.toHaveBeenCalled();
    expect(mocks.markRenewalComplete).not.toHaveBeenCalled();
  });

  it("refuses mark_complete on expired lease data too", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue(user);
    const handler = createRenewalProgressPostHandler({
      requireCapabilityInSpace: mocks.requireCapabilityInSpace,
      recordDecision: mocks.recordOwnerDecision,
      markComplete: mocks.markRenewalComplete,
      assertLeaseDataCurrent: vi
        .fn()
        .mockRejectedValue(new LeaseDataExpiredError(20 * 60_000)),
    });
    const res = await handler(
      new Request("http://localhost/api/lease-renewal/renewal-progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "mark_complete", leaseId: "5001" }),
      }),
    );
    expect(res.status).toBe(409);
    expect(mocks.markRenewalComplete).not.toHaveBeenCalled();
  });
});
