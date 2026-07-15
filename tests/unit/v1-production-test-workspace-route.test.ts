import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/release/fake-acceptance", () => ({
  runIntegratedFakeV1Acceptance: vi.fn(),
}));

import { POST } from "@/app/api/admin/v1/fake-acceptance/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { runIntegratedFakeV1Acceptance } from "@/lib/release/fake-acceptance";

const SAFE_RESULT = {
  mode: "production-test-workspace",
  dataMode: "test",
  liveEvidenceEligible: false,
  liveProviderCallCount: 0,
  vendorBoundary: { liveProviderCalls: 0 },
  lease: {},
  maintenance: {},
  providerOperations: [],
};

function actor(role: "Editor" | "Admin") {
  setAuthResolverForTest(() => ({
    uid: `${role.toLowerCase()}-1`,
    email: `${role.toLowerCase()}@pmikcmetro.com`,
    hd: "pmikcmetro.com",
    role,
  }));
}

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(runIntegratedFakeV1Acceptance).mockReset();
});

describe("production Test workspace route", () => {
  it("rejects non-Admins before running any workflow", async () => {
    actor("Editor");

    const response = await POST();

    expect(response.status).toBe(403);
    expect(runIntegratedFakeV1Acceptance).not.toHaveBeenCalled();
  });

  it("returns the explicit Test-only evidence boundary", async () => {
    actor("Admin");
    vi.mocked(runIntegratedFakeV1Acceptance).mockResolvedValue(SAFE_RESULT as never);

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      mode: "production-test-workspace",
      dataMode: "test",
      liveEvidenceEligible: false,
      liveProviderCallCount: 0,
      vendorBoundary: { liveProviderCalls: 0 },
    });
  });

  it("withholds a result that violates the zero-Live-call boundary", async () => {
    actor("Admin");
    vi.mocked(runIntegratedFakeV1Acceptance).mockResolvedValue({
      ...SAFE_RESULT,
      liveProviderCallCount: 1,
    } as never);

    const response = await POST();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Production Test workspace safety boundary failed.",
    });
  });
});
