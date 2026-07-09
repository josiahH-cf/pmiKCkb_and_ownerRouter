import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/maintenance/units/search/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { getUnitIndex } from "@/lib/maintenance/unit-index";

// Mock getUnitIndex (the TTL cache) but keep the real searchUnits so the route's filtering is exercised.
vi.mock("@/lib/maintenance/unit-index", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/maintenance/unit-index")>();
  return { ...actual, getUnitIndex: vi.fn() };
});

const editor = {
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
  uid: "editor",
};

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(getUnitIndex).mockReset();
});

function get(q: string) {
  return new Request(
    `http://localhost/api/maintenance/units/search?q=${encodeURIComponent(q)}`,
  );
}

describe("maintenance units search route", () => {
  it("returns 401 before any index read when unauthenticated", async () => {
    setAuthResolverForTest(() => null);
    const response = await GET(get("123 Main"));
    expect(response.status).toBe(401);
    expect(getUnitIndex).not.toHaveBeenCalled();
  });

  it("returns 200 with an empty list for an empty query, without reading the index", async () => {
    setAuthResolverForTest(() => editor);
    const response = await GET(get("   "));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ units: [] });
    expect(getUnitIndex).not.toHaveBeenCalled();
  });

  it("rejects an over-long query with 400, without reading the index", async () => {
    setAuthResolverForTest(() => editor);
    const response = await GET(get("x".repeat(121)));
    expect(response.status).toBe(400);
    expect(getUnitIndex).not.toHaveBeenCalled();
  });

  it("returns 503 with the error category when the index is unavailable", async () => {
    setAuthResolverForTest(() => editor);
    vi.mocked(getUnitIndex).mockResolvedValue({ status: "not_configured" });
    const response = await GET(get("123 Main"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error_type: "not_configured",
    });
  });

  it("serves filtered units from the index for an editor", async () => {
    setAuthResolverForTest(() => editor);
    vi.mocked(getUnitIndex).mockResolvedValue({
      status: "ok",
      candidates: [
        { unitId: "unit:456", label: "123 Main Street Unit 2" },
        { unitId: "unit:789", label: "9 Oak Avenue" },
      ],
    });
    const response = await GET(get("main"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      units: [{ unitId: "unit:456", label: "123 Main Street Unit 2" }],
    });
  });
});
