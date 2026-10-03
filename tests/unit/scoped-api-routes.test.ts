import { afterEach, describe, expect, it } from "vitest";
import {
  GET as getRenewalProgress,
  POST as saveRenewalProgress,
} from "@/app/api/lease-renewal/decider-progress/route";
import { GET as searchMaintenanceUnits } from "@/app/api/maintenance/units/search/route";
import { setAuthResolverForTest } from "@/lib/auth/session";

afterEach(() => {
  setAuthResolverForTest(null);
});

describe("scoped API route integration", () => {
  // S167: the renewals route used to answer this account with the JSON 403 Space refusal. It is
  // now admitted past the Space check and reaches the route's own request validation.
  it("admits an Editor with a leftover maintenance-only claim to renewals and Maintenance routes", async () => {
    setAuthResolverForTest(() => ({
      uid: "maintenance-editor",
      email: "maintenance-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["maintenance"],
    }));

    const renewals = await getRenewalProgress(
      new Request("http://localhost/api/lease-renewal/decider-progress"),
    );
    expect(renewals.status).toBe(400);
    await expect(renewals.json()).resolves.toMatchObject({
      error: "A valid run_id query parameter is required.",
    });

    const admitted = await searchMaintenanceUnits(
      new Request("http://localhost/api/maintenance/units/search?q="),
    );
    expect(admitted.status).toBe(200);
    await expect(admitted.json()).resolves.toEqual({ units: [] });
  });

  it("returns JSON 403 for a verification account's renewals mutation", async () => {
    setAuthResolverForTest(() => ({
      uid: "canary-editor",
      email: "canary-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
    }));

    const denied = await saveRenewalProgress(
      new Request("http://localhost/api/lease-renewal/decider-progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({
      error: "Verification accounts can only read.",
    });
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
