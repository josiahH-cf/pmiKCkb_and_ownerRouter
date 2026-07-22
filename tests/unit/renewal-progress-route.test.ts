import { afterEach, describe, expect, it, vi } from "vitest";

// Wiring test for the Phase-A renewal-progress route: it is edit/renewals-gated, dispatches the two
// actions to the store, and rejects a malformed body without ever touching the store.
const mocks = vi.hoisted(() => ({
  requireCapabilityInSpace: vi.fn(),
  recordOwnerDecision: vi.fn(),
  markRenewalComplete: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return { ...actual, requireCapabilityInSpace: mocks.requireCapabilityInSpace };
});

vi.mock("@/lib/firestore/lease-renewal-progress", () => ({
  recordOwnerDecision: mocks.recordOwnerDecision,
  markRenewalComplete: mocks.markRenewalComplete,
}));

import { POST } from "@/app/api/lease-renewal/renewal-progress/route";

const user = {
  uid: "u1",
  email: "u1@example.com",
  hd: "example.com",
  role: "Editor" as const,
};

function post(body: unknown) {
  return POST(
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
        zillowLow: 1450,
        zillowHigh: 1600,
        pmiNumber: 1550,
        compsUrl: "https://www.zillow.com/homes/x_rb/",
      },
    });

    expect(res.status).toBe(200);
    expect(mocks.recordOwnerDecision).toHaveBeenCalledWith(
      user,
      "5001",
      expect.objectContaining({
        market: {
          zillowLow: 1450,
          zillowHigh: 1600,
          pmiNumber: 1550,
          compsUrl: "https://www.zillow.com/homes/x_rb/",
        },
      }),
    );
  });

  it("rejects a malformed comps URL with a 400 and never touches the store", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue(user);
    const res = await post({
      action: "owner_decision",
      leaseId: "5001",
      decision: "increase",
      offeredRent: 1300,
      market: { compsUrl: "not-a-url" },
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
});
