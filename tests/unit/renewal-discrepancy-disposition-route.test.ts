import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCapabilityInSpace: vi.fn(),
  list: vi.fn(),
  record: vi.fn(),
}));
vi.mock("@/lib/auth/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: mocks.requireCapabilityInSpace,
}));
vi.mock("@/lib/firestore/renewal-discrepancy-dispositions", () => ({
  listRenewalDiscrepancyDispositions: mocks.list,
  recordRenewalDiscrepancyDisposition: mocks.record,
}));

import { GET, POST } from "@/app/api/lease-renewal/discrepancy-dispositions/route";

const actor = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};

afterEach(() => vi.clearAllMocks());

describe("renewal discrepancy disposition route", () => {
  it("requires lease identity on read", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue(actor);
    expect(
      (
        await GET(
          new Request("https://example.test/api/lease-renewal/discrepancy-dispositions"),
        )
      ).status,
    ).toBe(400);
    expect(mocks.requireCapabilityInSpace).toHaveBeenCalledWith("read", "renewals");
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("records through the renewal-scoped edit capability and strict schema", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue(actor);
    mocks.record.mockResolvedValue({ id: "d1" });
    const response = await POST(
      new Request("https://example.test/api/lease-renewal/discrepancy-dispositions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lease_id: "lease-1",
          sheet_row_number: 10,
          source_hash: "a".repeat(64),
          field: "current_rent",
          category: "conflict",
          authoritative_source: "not_determined",
          proposed_correction: "Wait for the definition.",
          reason: "Current-rent meaning is not confirmed.",
          owner_uid: "admin-1",
          status: "waiting_on_client",
          evidence_refs: [],
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.requireCapabilityInSpace).toHaveBeenCalledWith("edit", "renewals");
    expect(mocks.record).toHaveBeenCalledTimes(1);
  });
});
