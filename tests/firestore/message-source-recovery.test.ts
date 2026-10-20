import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";

const state = vi.hoisted(() => ({
  db: null as Firestore | null,
  statusUnavailable: false,
  leaseUnavailable: false,
  leaseProgrammingError: false,
  capabilityRefusal: null as 401 | 403 | null,
  leaseReads: 0,
  statusReads: 0,
  actor: {
    uid: "synthetic-message-recovery",
    email: "synthetic-message-recovery@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  } as AuthenticatedUser,
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => state.db }));
vi.mock("@/lib/auth/session", async (original) => {
  const actual = await original<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    requireCapabilityInSpace: async () => {
      if (state.capabilityRefusal)
        throw new actual.AuthError(
          "Synthetic session or Space refusal",
          state.capabilityRefusal,
        );
      return state.actor;
    },
  };
});
vi.mock("@/lib/lease-renewal/live-config", async (original) => {
  const actual = await original<typeof import("@/lib/lease-renewal/live-config")>();
  const { RentVineError } = await import("@/lib/integrations/rentvine/client");
  const { withFakeLeaseDetail } = await import("@/tests/helpers/rentvine-detail-fake");
  const reader = withFakeLeaseDetail({
    listAllLeasesExport: async () => {
      state.leaseReads++;
      if (state.leaseUnavailable)
        throw new RentVineError("synthetic-private-provider-body", 503);
      if (state.leaseProgrammingError)
        throw new TypeError("synthetic programming defect");
      return {
        complete: true,
        pages: 1,
        rows: [
          {
            lease: {
              leaseID: 9701,
              leaseStatusID: "2",
              endDate: "2027-01-31",
              baseRentAmount: 1234,
              noticeDate: null,
              expectedMoveOutDate: null,
              moveOutDate: null,
              tenants: [
                {
                  contactID: "19701",
                  name: "Synthetic Tenant",
                  firstName: "Synthetic",
                  email: "tenant@fixture.invalid",
                },
              ],
            },
            unit: { unitID: "29701" },
            property: { streetName: "9701 Synthetic Fixture Avenue" },
            portfolio: {
              owners: [{ name: "Synthetic Owner", email: "owner@fixture.invalid" }],
            },
          },
        ],
      };
    },
    listLeaseStatuses: async () => {
      state.statusReads++;
      if (state.statusUnavailable) throw new Error("synthetic status disconnected");
      return [
        {
          leaseStatusID: "2",
          name: "Synthetic Active",
          primaryLeaseStatusID: "2",
          isPendingMoveOutStatus: false,
          isCompletedMoveOutStatus: false,
          isPendingMoveInStatus: false,
          isSystemStatus: true,
        },
      ];
    },
  });
  return {
    ...actual,
    buildLiveRentVineConfig: () => ({ ok: true, rentvineClient: reader }),
    buildLiveRenewalConfig: () => ({
      ok: false,
      reason: "synthetic_optional_source_not_configured",
    }),
  };
});
// Every provider effect is an unexpected test failure, in addition to the OS egress refusal.
vi.mock("@/lib/gmail-hub/dependencies", async (original) => ({
  ...(await original<typeof import("@/lib/gmail-hub/dependencies")>()),
  createDescriptorBoundGmailRuntimeClient: () => {
    throw new Error("No real or simulated Gmail effect in a preparation read");
  },
}));

import { GET, POST } from "@/app/api/lease-renewal/message-preparation/route";
import { currentRenewalMessage } from "@/lib/lease-renewal/current-renewal-message";
import { buildSuppliedRenewalDraftPreview } from "@/lib/lease-renewal/execution/supplied-renewal-draft-preview";
import {
  clearLiveLeaseCache,
  LEASE_EXPORT_MAX_AGE_MS,
} from "@/lib/lease-renewal/live-lease-cache";
import { clearLeaseStatusTableCache } from "@/lib/lease-renewal/lease-status-table";

const projectId = "demo-pmi-message-source-recovery";
let app: App, db: Firestore, testEnv: RulesTestEnvironment;
function request(channel: "owner" | "tenant" = "tenant") {
  return new Request(
    `http://fixture.invalid/api/lease-renewal/message-preparation?leaseId=9701&channel=${channel}`,
  );
}
function clearSources() {
  clearLiveLeaseCache();
  clearLeaseStatusTableCache();
}
beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `synthetic-message-recovery-${process.pid}`);
  db = getFirestore(app);
  state.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  vi.useRealTimers();
  await testEnv.clearFirestore();
  clearSources();
  state.statusUnavailable = false;
  state.leaseUnavailable = false;
  state.leaseProgrammingError = false;
  state.capabilityRefusal = null;
  state.leaseReads = 0;
  state.statusReads = 0;
});
afterAll(async () => {
  vi.useRealTimers();
  await deleteApp(app);
  await testEnv.cleanup();
  vi.unstubAllEnvs();
});

describe("available editing with strict notice admission", () => {
  it.each([401, 403] as const)(
    "marks a %s session/Space refusal before parsing as pre-effect and preserves parsing order",
    async (status) => {
      state.capabilityRefusal = status;
      const refusedRequest = new Request(request().url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      });
      const parse = vi.spyOn(refusedRequest, "json");
      const denied = await POST(refusedRequest);
      expect(denied.status).toBe(status);
      expect(await denied.json()).toMatchObject({ providerCallAttempted: false });
      expect(parse).not.toHaveBeenCalled();
      expect(state.leaseReads).toBe(0);
      expect(state.statusReads).toBe(0);
      expect((await db.collection("action_executions").get()).size).toBe(0);
      state.capabilityRefusal = null;
      const invalid = await POST(refusedRequest);
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toMatchObject({ providerCallAttempted: false });
      expect(parse).toHaveBeenCalledTimes(1);
    },
  );
  it("returns a truthful cold-source hold without provider details and retries after reconnection", async () => {
    state.leaseUnavailable = true;
    const response = await GET(request());
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({
      code: "renewal_notice_source_unavailable",
      reason: "lease_unavailable",
    });
    expect(JSON.stringify(body)).not.toContain("synthetic-private-provider-body");
    expect(body.content).toBeUndefined();
    expect(state.leaseReads).toBe(1);
    state.leaseUnavailable = false;
    expect((await GET(request())).status).toBe(200);
    expect(state.leaseReads).toBe(2);
  });

  it("does not disguise a programming failure as an unavailable provider", async () => {
    state.leaseProgrammingError = true;
    await expect(GET(request())).rejects.toThrow("synthetic programming defect");
  });

  it("keeps authored wording through a failed status read and only clears its draft hold after reconnect", async () => {
    const initialResponse = await GET(request());
    expect(initialResponse.status).toBe(200);
    const initial = await initialResponse.json();
    const authored = "Synthetic authored wording survives source recovery exactly.";
    const savedResponse = await POST(
      new Request(request().url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "save",
          leaseId: "9701",
          channel: "tenant",
          expectedRevision: 0,
          operationId: randomUUID(),
          inputs: initial.inputs,
          bodyOverride: { text: authored, baseHash: initial.bodyBaseHash },
          subjectOverride: "Synthetic saved subject",
        }),
      }),
    );
    expect(savedResponse.status).toBe(200);
    clearSources();
    state.statusUnavailable = true;
    const [owner, tenant] = await Promise.all([
      GET(request("owner")),
      GET(request("tenant")),
    ]);
    expect(owner.status).toBe(200);
    expect(tenant.status).toBe(200);
    const content = await tenant.json();
    expect(content.content.plainText).toBe(authored);
    expect(content.content.subject).toBe("Synthetic saved subject");
    expect(content.saved.revision).toBe(1);
    expect(content.notices.join(" ")).toContain("fresh admitted source");
    const held = await currentRenewalMessage(state.actor, "9701", "tenant", db);
    expect(held.moveOut.state).toBe("unknown");
    expect(held.noticeBlock).toBeTruthy();
    const preview = buildSuppliedRenewalDraftPreview(state.actor, held);
    expect(preview.status).toBe("blocked");
    if (preview.status === "blocked") expect(preview.reasons).toContain(held.noticeBlock);
    state.statusUnavailable = false;
    const recovered = await currentRenewalMessage(state.actor, "9701", "tenant", db);
    expect(recovered.noticeBlock).toBeNull();
    expect(recovered.content.plainText).toBe(authored);
    expect(recovered.saved?.revision).toBe(1);
  });

  it("refuses an expired held lease with a recoverable HTTP conflict and recovers on fresh data", async () => {
    const now = Date.now();
    expect((await GET(request())).status).toBe(200);
    state.leaseUnavailable = true;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now + LEASE_EXPORT_MAX_AGE_MS + 1000);
    const expired = await GET(request());
    expect(expired.status).toBe(409);
    expect((await expired.json()).error).toContain("maximum");
    vi.useRealTimers();
    state.leaseUnavailable = false;
    clearSources();
    expect((await GET(request())).status).toBe(200);
  });
});
