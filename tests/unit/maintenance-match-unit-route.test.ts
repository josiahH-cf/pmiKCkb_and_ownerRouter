import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/maintenance/match-unit/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { loadLiveUnitCandidates } from "@/lib/maintenance/live-unit-source";

vi.mock("@/lib/maintenance/live-unit-source", () => ({
  loadLiveUnitCandidates: vi.fn(),
}));

const editor = {
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
  uid: "editor",
};

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(loadLiveUnitCandidates).mockReset();
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/maintenance/match-unit", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("maintenance match-unit route", () => {
  it("returns 401 before any read when unauthenticated", async () => {
    setAuthResolverForTest(() => null);

    const response = await POST(jsonRequest({ location: "123 Main St" }));

    expect(response.status).toBe(401);
    expect(loadLiveUnitCandidates).not.toHaveBeenCalled();
  });

  it("rejects an empty location with 400", async () => {
    setAuthResolverForTest(() => editor);

    const response = await POST(jsonRequest({ location: "   " }));

    expect(response.status).toBe(400);
    expect(loadLiveUnitCandidates).not.toHaveBeenCalled();
  });

  it("returns 503 with the error category when the unit source is unavailable", async () => {
    setAuthResolverForTest(() => editor);
    vi.mocked(loadLiveUnitCandidates).mockResolvedValue({ status: "not_configured" });

    const response = await POST(jsonRequest({ location: "123 Main St" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error_type: "not_configured",
    });
  });

  it("returns the match + candidates for an editor", async () => {
    setAuthResolverForTest(() => editor);
    vi.mocked(loadLiveUnitCandidates).mockResolvedValue({
      status: "ok",
      candidates: [{ unitId: "unit:456", label: "123 Main Street Unit 2" }],
      skipped: 0,
    });

    const response = await POST(jsonRequest({ location: "123 Main St #2" }));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      match: { unitId: string; confidence: string } | null;
      autoMerge: boolean;
    };
    expect(body.match?.unitId).toBe("unit:456");
    expect(body.autoMerge).toBe(false);
  });
});
