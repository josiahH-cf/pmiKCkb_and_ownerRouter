import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { FakeTransactionalFirestore } from "../helpers/fake-transactional-firestore";
const seam = vi.hoisted(() => ({
  actor: {
    uid: "notice-editor",
    email: "notice-editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  },
  db: null as unknown,
  positive: true,
  exportFails: false,
  exports: 0,
  reader: null as null | object,
}));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityInSpace: async () => seam.actor,
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => seam.db }));
vi.mock("@/lib/lease-renewal/live-config", () => ({
  buildLiveRentVineConfig: () => ({
    ok: true,
    rentvineClient: (seam.reader ??= {
      listAllLeasesExport: async () => {
        seam.exports++;
        if (seam.exportFails) throw new Error("synthetic provider failure");
        return {
          rows: [
            {
              lease: {
                leaseID: "9001",
                leaseStatusID: seam.positive ? "3" : "2",
                tenants: [{ contactID: "9101" }],
              },
              unit: { unitID: "9201" },
            },
          ],
          complete: true,
        };
      },
      getLease: async () => ({
        leaseStatusID: seam.positive ? "3" : "2",
        noticeDate: seam.positive ? "2026-09-28" : null,
        expectedMoveOutDate: null,
        moveOutDate: null,
        isMonthToMonth: "0",
      }),
      listLeaseStatuses: async () => [
        {
          leaseStatusID: "2",
          name: "Synthetic active",
          primaryLeaseStatusID: "2",
          isPendingMoveOutStatus: false,
          isCompletedMoveOutStatus: false,
        },
        {
          leaseStatusID: "3",
          name: "Synthetic notice",
          primaryLeaseStatusID: "2",
          isPendingMoveOutStatus: true,
          isCompletedMoveOutStatus: false,
        },
      ],
    }),
  }),
}));
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { GET, POST } from "@/app/api/lease-renewal/notice-review/route";
import {
  clearLiveLeaseCache,
  getLiveLeaseSnapshot,
} from "@/lib/lease-renewal/live-lease-cache";
import {
  clearLeaseStatusTableCache,
  readLeaseStatusTable,
} from "@/lib/lease-renewal/lease-status-table";
import { noticeSafetyMarkerRef } from "@/lib/firestore/renewal-notice-safety";
const readRequest = () =>
  new Request("https://synthetic.invalid/api/lease-renewal/notice-review?leaseId=9001");
const postRequest = (body: unknown) =>
  new Request("https://synthetic.invalid/api/lease-renewal/notice-review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
let db: FakeTransactionalFirestore;
beforeEach(() => {
  db = new FakeTransactionalFirestore();
  seam.db = db;
  seam.positive = true;
  seam.exportFails = false;
  seam.exports = 0;
  seam.reader = null;
  seam.actor.email = "notice-editor@pmikcmetro.com";
  clearLiveLeaseCache();
  clearLeaseStatusTableCache();
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime("2026-09-28T12:00:00.000Z");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("notice review authenticated route", () => {
  it("repairs a previously unadmitted shared cache with one bounded fresh generation", async () => {
    const config = buildLiveRentVineConfig();
    if (!config.ok) throw new Error("Fixture config");
    await getLiveLeaseSnapshot(config.rentvineClient, Date.now());
    await readLeaseStatusTable(config.rentvineClient, Date.now());
    expect(seam.exports).toBe(1);
    const reviewed = await (await GET(readRequest())).json();
    expect(reviewed.ready).toBe(true);
    expect(seam.exports).toBe(2);
    const repeated = await (await GET(readRequest())).json();
    expect(repeated.basis).toEqual(reviewed.basis);
    expect(seam.exports).toBe(2);
    expect([...db.store.keys()]).toHaveLength(1);
  });

  it("GET writes only the approved metadata; actual POST/readback records positive and withdrawal before a cycle exists", async () => {
    const read = await GET(readRequest());
    expect(read.status).toBe(200);
    const positive = await read.json();
    expect(positive.ready).toBe(true);
    expect(positive.cycleId).toBeNull();
    expect([...db.store.keys()]).toEqual([
      noticeSafetyMarkerRef(db as unknown as Firestore, "9001").path,
    ]);
    const command = {
      leaseId: "9001",
      expected: positive.basis,
      operationId: "10000000-0000-4000-8000-000000000001",
      action: "record_notice",
      reason: "Synthetic explicit review",
    };
    const recorded = await POST(postRequest(command));
    expect(recorded.status).toBe(200);
    const saved = await recorded.json();
    expect(saved.history.positive.evidence.pendingMoveOut).toBe(true);
    expect(seam.exports).toBe(1); // Review/save and cache hits never re-admit a generation.
    vi.setSystemTime("2026-09-28T12:01:00.000Z");
    clearLiveLeaseCache();
    clearLeaseStatusTableCache();
    seam.positive = false;
    const cleared = await (await GET(readRequest())).json();
    expect(cleared.disposition.reason).toBe("withdrawal_review_required");
    const withdrawn = await POST(
      postRequest({
        ...command,
        expected: cleared.basis,
        operationId: "10000000-0000-4000-8000-000000000002",
        action: "review_withdrawal",
      }),
    );
    expect(withdrawn.status).toBe(200);
    expect((await withdrawn.json()).disposition.state).toBe("withdrawn");
    expect(
      [...db.store.keys()].some(
        (key) => key.includes("workspace_activity") || key.includes("workspace_cycles"),
      ),
    ).toBe(false);
  });
  it("refuses stale exact confirmations and verification writes; source failure keeps old review invalidated", async () => {
    const initial = await (await GET(readRequest())).json();
    const command = {
      leaseId: "9001",
      expected: initial.basis,
      operationId: "10000000-0000-4000-8000-000000000001",
      action: "record_notice",
      reason: "Synthetic explicit review",
    };
    seam.actor.email = "canary-editor@pmikcmetro.com";
    expect((await POST(postRequest(command))).status).toBe(403);
    seam.actor.email = "notice-editor@pmikcmetro.com";
    vi.setSystemTime("2026-09-28T12:02:00.000Z");
    clearLiveLeaseCache();
    clearLeaseStatusTableCache();
    seam.exportFails = true;
    expect((await GET(readRequest())).status).toBeGreaterThanOrEqual(400);
    const pending = db.read(
      noticeSafetyMarkerRef(db as unknown as Firestore, "9001").path,
    )!;
    expect(pending.version).toBeGreaterThan(initial.basis.version);
    vi.setSystemTime("2026-09-28T12:03:00.000Z");
    clearLiveLeaseCache();
    clearLeaseStatusTableCache();
    seam.exportFails = false;
    expect((await POST(postRequest(command))).status).toBe(409);
  });
});
