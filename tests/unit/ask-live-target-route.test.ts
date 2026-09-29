import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeTransactionalFirestore } from "../helpers/fake-transactional-firestore";

vi.mock("@/lib/firestore/runtime-action-suspensions", () => ({
  readRuntimeActionSuspension: vi.fn(async () => ({ status: "clear" })),
}));

// Wiring test for the read-only S33 live-target lookup: edit/renewals-gated, resolves a single lease from
// the authoritative live read, returns no_match on ambiguity/absence, and performs NO external effect.
const mocks = vi.hoisted(() => ({
  requireCapabilityInSpace: vi.fn(),
  buildLiveRentVineConfig: vi.fn(),
  getAdminFirestore: vi.fn(),
}));

vi.mock("@/lib/firestore/admin", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
}));

vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return { ...actual, requireCapabilityInSpace: mocks.requireCapabilityInSpace };
});
vi.mock("@/lib/lease-renewal/live-config", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/lease-renewal/live-config")>();
  return { ...actual, buildLiveRentVineConfig: mocks.buildLiveRentVineConfig };
});
import { POST } from "@/app/api/ask/live-target/route";
import type { LeaseExportReadResult } from "@/lib/integrations/rentvine/client";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";
import { renewalWorkspaceDocId } from "@/lib/firestore/renewal-workspace";
import {
  NoticeSafetyMarkerSchema,
  noticeScopeHash,
  pendingNoticeHash,
} from "@/lib/lease-renewal/notice-safety";

let store: FakeTransactionalFirestore;
let markerAtProviderDispatch: unknown;
const markerPath = `lease_renewal_workspaces/${renewalWorkspaceDocId("42")}/approval_safety/notice`;
const initialMarker = {
  version: 3,
  scopeHash: noticeScopeHash("42", null, null),
  semanticHash: "a".repeat(64),
  sourceReadAt: { lease: 0, status: 0 },
  observedAt: "2026-09-29T00:00:00.000Z",
};
const listAllLeasesExport = vi.fn(async (): Promise<LeaseExportReadResult> => {
  markerAtProviderDispatch = store.read(markerPath);
  return {
    rows: [
      { lease: { leaseID: 42 }, property: { streetName: "1234 Oak St" } },
      { lease: { leaseID: 43 }, property: { streetName: "5678 Maple Ave" } },
    ],
    pages: 1,
    complete: true,
  };
});

function req(body: unknown) {
  return new Request("http://localhost/api/ask/live-target", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  clearLiveLeaseCache();
  store = new FakeTransactionalFirestore();
  store.seed(markerPath, initialMarker);
  markerAtProviderDispatch = undefined;
  mocks.getAdminFirestore.mockReturnValue(store);
  mocks.requireCapabilityInSpace.mockResolvedValue({
    uid: "editor-1",
    email: "fixture-editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  });
  mocks.buildLiveRentVineConfig.mockReturnValue({
    ok: true,
    rentvineClient: { listAllLeasesExport },
  });
});
afterEach(() => {
  clearLiveLeaseCache();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

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
    expect(listAllLeasesExport).toHaveBeenCalledTimes(1);
    // Assertions stay outside the provider callback because the cache catches provider failures.
    // The real admission transaction must commit before the synthetic export is dispatched.
    const admitted = NoticeSafetyMarkerSchema.parse(markerAtProviderDispatch);
    expect(admitted.version).toBe(initialMarker.version + 1);
    expect(admitted.sourceReadAt.lease).toBeGreaterThan(0);
    expect(admitted.sourceReadAt.status).toBe(0);
    expect(admitted.semanticHash).toBe(
      pendingNoticeHash(initialMarker.scopeHash, admitted.sourceReadAt),
    );
    expect(store.read(markerPath)).toEqual(admitted);
    expect(store.store.size).toBe(1);
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
    expect(listAllLeasesExport).not.toHaveBeenCalled();
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
    expect(store.read(markerPath)).toEqual(initialMarker);
  });

  it("dispatches no provider read when the real admission transaction cannot persist", async () => {
    const failure = new Error("Synthetic admission persistence failed.");
    const persist = vi.spyOn(store, "runTransaction").mockRejectedValue(failure);
    await expect(POST(req({ question: "renew 1234 Oak St" }))).rejects.toBe(failure);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(listAllLeasesExport).not.toHaveBeenCalled();
    expect(store.read(markerPath)).toEqual(initialMarker);
    expect(store.store.size).toBe(1);
  });

  it("rejects a malformed body", async () => {
    const res = await POST(req({ notQuestion: 1 }));
    expect(res.status).toBe(400);
    expect(listAllLeasesExport).not.toHaveBeenCalled();
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
  });
});
