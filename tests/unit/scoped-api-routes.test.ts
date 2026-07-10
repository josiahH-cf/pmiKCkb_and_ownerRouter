import { afterEach, describe, expect, it } from "vitest";
import { GET as getRenewalProgress } from "@/app/api/lease-renewal/decider-progress/route";
import { GET as searchMaintenanceUnits } from "@/app/api/maintenance/units/search/route";
import { setAuthResolverForTest } from "@/lib/auth/session";

afterEach(() => {
  setAuthResolverForTest(null);
});

describe("scoped API route integration", () => {
  it("returns JSON 403 for renewals while admitting the same Editor to Maintenance", async () => {
    setAuthResolverForTest(() => ({
      uid: "maintenance-editor",
      email: "maintenance-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["maintenance"],
    }));

    const denied = await getRenewalProgress(
      new Request("http://localhost/api/lease-renewal/decider-progress"),
    );
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toEqual({
      error: "This user is not authorized for the requested space.",
    });

    const admitted = await searchMaintenanceUnits(
      new Request("http://localhost/api/maintenance/units/search?q="),
    );
    expect(admitted.status).toBe(200);
    await expect(admitted.json()).resolves.toEqual({ units: [] });
  });

  it("keeps a missing scopes claim backward-compatible on renewals routes", async () => {
    setAuthResolverForTest(() => ({
      uid: "existing-editor",
      email: "existing-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
    }));

    const response = await getRenewalProgress(
      new Request("http://localhost/api/lease-renewal/decider-progress"),
    );
    expect(response.status).toBe(400);
  });
});
