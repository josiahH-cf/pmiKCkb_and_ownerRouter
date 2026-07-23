import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Wiring test for the read-only S33 live-target lookup: edit/renewals-gated, resolves a single lease from
// the authoritative live read, returns no_match on ambiguity/absence, and performs NO external effect.
const mocks = vi.hoisted(() => ({
  requireCapabilityInSpace: vi.fn(),
  buildLiveRentVineConfig: vi.fn(),
  getLiveLeaseViews: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return { ...actual, requireCapabilityInSpace: mocks.requireCapabilityInSpace };
});
vi.mock("@/lib/lease-renewal/live-config", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/lease-renewal/live-config")>();
  return { ...actual, buildLiveRentVineConfig: mocks.buildLiveRentVineConfig };
});
vi.mock("@/lib/lease-renewal/live-lease-cache", () => ({
  getLiveLeaseViews: mocks.getLiveLeaseViews,
}));

import { POST } from "@/app/api/ask/live-target/route";

function req(body: unknown) {
  return new Request("http://localhost/api/ask/live-target", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.requireCapabilityInSpace.mockResolvedValue({
    uid: "editor-1",
    email: "josiah@pmikcmetro.com",
    role: "Editor",
  });
  mocks.buildLiveRentVineConfig.mockReturnValue({ ok: true, rentvineClient: {} });
  mocks.getLiveLeaseViews.mockResolvedValue([
    { leaseID: 42, property: { streetName: "1234 Oak St" } },
    { leaseID: 43, property: { streetName: "5678 Maple Ave" } },
  ]);
});
afterEach(() => vi.clearAllMocks());

describe("ask/live-target route (AC-S33-4, read-only half of AC-S33-2)", () => {
  it("resolves an unambiguous single lease and a live route for a renewal intent", async () => {
    const res = await POST(
      req({ question: "start the renewal for 1234 Oak St", processId: "lease-renewal" }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      status: string;
      leaseId: string;
      addressLabel: string;
      route: { actionKey: string; surface: string; href: string } | null;
    };
    expect(json.status).toBe("ok");
    expect(json.leaseId).toBe("42");
    expect(json.addressLabel).toBe("1234 Oak St");
    // The gate is open (draft_create), so a value-free route is returned.
    expect(json.route?.actionKey).toBe("gmail.renewal_notice.draft_create");
    expect(json.route?.surface).toBe("renewal-notice-draft");
    expect(json.route?.href).toBe("/lease-renewal/live/desk/lease/42");
    expect(mocks.requireCapabilityInSpace).toHaveBeenCalledWith("edit", "renewals");
  });

  it("resolves the target but no route when no process is detected", async () => {
    const res = await POST(req({ question: "start the renewal for 1234 Oak St" }));
    const json = (await res.json()) as {
      status: string;
      leaseId: string;
      route: unknown;
    };
    expect(json.status).toBe("ok");
    expect(json.leaseId).toBe("42");
    expect(json.route).toBeNull();
  });

  it("returns no_match for a question naming no lease (never a best-guess)", async () => {
    const res = await POST(req({ question: "how do renewals work?" }));
    expect(await res.json()).toEqual({ status: "no_match" });
  });

  it("returns not_configured when live sources are not connected", async () => {
    mocks.buildLiveRentVineConfig.mockReturnValue({
      ok: false,
      reason: "not_configured",
    });
    const res = await POST(req({ question: "renew 1234 Oak St" }));
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("not_configured");
    // No live read is attempted when unconfigured.
    expect(mocks.getLiveLeaseViews).not.toHaveBeenCalled();
  });

  it("rejects a malformed body", async () => {
    const res = await POST(req({ notQuestion: 1 }));
    expect(res.status).toBe(400);
  });
});
