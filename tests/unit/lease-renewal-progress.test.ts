import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  LEASE_RENEWAL_PROGRESS_COLLECTIONS,
  getRenewalProgress,
  listAllRenewalProgress,
  markRenewalComplete,
  progressDocId,
  recordOwnerDecision,
  recordTenantOfferDraft,
} from "@/lib/firestore/lease-renewal-progress";
import {
  RENEWAL_STAGE,
  effectiveStageIndex,
  normalizeOwnerDecision,
  planMarkComplete,
  planRecordOwnerDecision,
  planRecordTenantOfferDraft,
  type RenewalProgress,
} from "@/lib/lease-renewal/renewal-progress";

// ── Pure planner ────────────────────────────────────────────────────────────────────────────────────

describe("renewal-progress pure planner", () => {
  it("normalizes a valid owner decision and drops empty optionals", () => {
    expect(
      normalizeOwnerDecision({
        decision: "increase",
        offeredRent: 1300,
        charges: { rbp: 28, insurance: 0 },
        infoFormUrl: "  https://forms.example/x  ",
      }),
    ).toEqual({
      decision: "increase",
      offeredRent: 1300,
      charges: { rbp: 28, insurance: 0 },
      infoFormUrl: "https://forms.example/x",
    });
    expect(normalizeOwnerDecision({ decision: "keep_same", offeredRent: 1200 })).toEqual({
      decision: "keep_same",
      offeredRent: 1200,
    });
  });

  it("rejects a non-positive offer, an unknown decision, and a negative charge", () => {
    expect(() =>
      normalizeOwnerDecision({ decision: "increase", offeredRent: 0 }),
    ).toThrow();
    expect(() =>
      normalizeOwnerDecision({ decision: "increase", offeredRent: -5 }),
    ).toThrow();
    expect(() =>
      normalizeOwnerDecision({
        decision: "sideways" as never,
        offeredRent: 1200,
      }),
    ).toThrow();
    expect(() =>
      normalizeOwnerDecision({
        decision: "increase",
        offeredRent: 1200,
        charges: { rbp: -1 },
      }),
    ).toThrow();
  });

  it("recording a decision places the lease at the Tenant step and clears any prior draft", () => {
    const plan = planRecordOwnerDecision(
      {
        leaseId: "42",
        stageIndex: RENEWAL_STAGE.build,
        ownerDecision: { decision: "keep_same", offeredRent: 1000 },
        tenantOfferDraftId: "old-draft",
        complete: true,
      },
      { decision: "increase", offeredRent: 1300 },
    );
    expect(plan).toEqual({
      stageIndex: RENEWAL_STAGE.tenant,
      ownerDecision: { decision: "increase", offeredRent: 1300 },
      tenantOfferDraftId: null,
      complete: false,
    });
  });

  it("recording a tenant draft advances to Build; without a decision it is out of order (409)", () => {
    const current: RenewalProgress = {
      leaseId: "42",
      stageIndex: RENEWAL_STAGE.tenant,
      ownerDecision: { decision: "increase", offeredRent: 1300 },
      tenantOfferDraftId: null,
      complete: false,
    };
    expect(planRecordTenantOfferDraft(current, "draft-1")).toEqual({
      stageIndex: RENEWAL_STAGE.build,
      ownerDecision: { decision: "increase", offeredRent: 1300 },
      tenantOfferDraftId: "draft-1",
      complete: false,
    });
    expect(() => planRecordTenantOfferDraft(null, "draft-1")).toThrow();
    expect(() =>
      planRecordTenantOfferDraft({ ...current, ownerDecision: null }, "draft-1"),
    ).toThrow();
    expect(() => planRecordTenantOfferDraft(current, "   ")).toThrow();
  });

  it("marking complete requires a recorded decision and pins the stage to Build", () => {
    const current: RenewalProgress = {
      leaseId: "42",
      stageIndex: RENEWAL_STAGE.tenant,
      ownerDecision: { decision: "increase", offeredRent: 1300 },
      tenantOfferDraftId: "draft-1",
      complete: false,
    };
    expect(planMarkComplete(current)).toEqual({
      stageIndex: RENEWAL_STAGE.build,
      ownerDecision: { decision: "increase", offeredRent: 1300 },
      tenantOfferDraftId: "draft-1",
      complete: true,
    });
    expect(() => planMarkComplete(null)).toThrow();
    expect(() => planMarkComplete({ ...current, ownerDecision: null })).toThrow();
  });

  it("effectiveStageIndex prefers recorded progress and clamps out-of-range values", () => {
    expect(effectiveStageIndex(null, 1)).toBe(1);
    expect(
      effectiveStageIndex(
        {
          leaseId: "1",
          stageIndex: 2,
          ownerDecision: null,
          tenantOfferDraftId: null,
          complete: false,
        },
        1,
      ),
    ).toBe(2);
    expect(
      effectiveStageIndex(
        {
          leaseId: "1",
          stageIndex: 99,
          ownerDecision: null,
          tenantOfferDraftId: null,
          complete: false,
        },
        0,
      ),
    ).toBe(RENEWAL_STAGE.build);
  });
});

// ── Firestore store (in-memory transaction harness) ───────────────────────────────────────────────────

type TestRecord = Record<string, unknown>;

interface TestSnapshot {
  exists: boolean;
  data: () => TestRecord | undefined;
  get: (field: string) => unknown;
}

interface TestDocumentRef {
  path: string;
  get: () => Promise<TestSnapshot>;
}

class ProgressTestFirestore {
  readonly store = new Map<string, TestRecord>();

  collection(name: string) {
    const store = this.store;
    return {
      doc: (id: string): TestDocumentRef => {
        const path = `${name}/${id}`;
        return {
          path,
          get: async () => {
            const record = store.get(path);
            return {
              exists: record !== undefined,
              data: () => (record ? structuredClone(record) : undefined),
              get: (field: string) => record?.[field],
            };
          },
        };
      },
      get: async () => ({
        docs: [...store.entries()]
          .filter(([path]) => path.startsWith(`${name}/`))
          .map(([path, record]) => ({
            id: path.slice(name.length + 1),
            data: () => structuredClone(record),
          })),
      }),
    };
  }

  async runTransaction<T>(
    callback: (transaction: {
      get: (ref: TestDocumentRef) => Promise<TestSnapshot>;
      set: (ref: TestDocumentRef, data: TestRecord) => void;
    }) => Promise<T>,
  ) {
    return callback({
      get: (ref) => ref.get(),
      set: (ref, data) => {
        this.store.set(ref.path, resolveFirestoreSentinels(data) as TestRecord);
      },
    });
  }
}

function resolveFirestoreSentinels(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    value.constructor.name === "ServerTimestampTransform"
  ) {
    return "2026-07-22T12:00:00.000Z";
  }
  if (Array.isArray(value)) return value.map(resolveFirestoreSentinels);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        resolveFirestoreSentinels(child),
      ]),
    );
  }
  return value;
}

const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor-1@example.com",
  hd: "example.com",
  role: "Editor",
};

const LEASE_ID = "5001";

describe("lease-renewal-progress store", () => {
  it("records an owner decision, advancing to the Tenant step with an activity twin", async () => {
    const db = new ProgressTestFirestore();
    const progress = await recordOwnerDecision(
      editor,
      LEASE_ID,
      { decision: "increase", offeredRent: 1300 },
      db as unknown as Firestore,
    );

    expect(progress).toMatchObject({
      leaseId: LEASE_ID,
      stageIndex: RENEWAL_STAGE.tenant,
      ownerDecision: { decision: "increase", offeredRent: 1300 },
      tenantOfferDraftId: null,
      complete: false,
    });

    const record = db.store.get(
      `${LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress}/${progressDocId(LEASE_ID)}`,
    );
    expect(record).toMatchObject({
      lease_id: LEASE_ID,
      stage_index: RENEWAL_STAGE.tenant,
      owner_decision: { decision: "increase", offered_rent: 1300 },
      complete: false,
      updated_by_uid: "editor-1",
    });

    const activity = [...db.store.entries()].filter(([path]) =>
      path.startsWith(`${LEASE_RENEWAL_PROGRESS_COLLECTIONS.progressActivity}/`),
    );
    expect(activity).toHaveLength(1);
    expect(activity[0][1]).toMatchObject({
      lease_id: LEASE_ID,
      action: "owner_decision",
    });
  });

  it("reads a lease's progress back and returns null for an untouched lease", async () => {
    const db = new ProgressTestFirestore();
    expect(
      await getRenewalProgress(editor, LEASE_ID, db as unknown as Firestore),
    ).toBeNull();
    await recordOwnerDecision(
      editor,
      LEASE_ID,
      { decision: "keep_same", offeredRent: 1200 },
      db as unknown as Firestore,
    );
    const progress = await getRenewalProgress(
      editor,
      LEASE_ID,
      db as unknown as Firestore,
    );
    expect(progress?.ownerDecision).toEqual({ decision: "keep_same", offeredRent: 1200 });
  });

  it("stamps the tenant-offer draft id and advances to Build; a re-recorded decision clears it", async () => {
    const db = new ProgressTestFirestore();
    await recordOwnerDecision(
      editor,
      LEASE_ID,
      { decision: "increase", offeredRent: 1300 },
      db as unknown as Firestore,
    );
    const drafted = await recordTenantOfferDraft(
      editor,
      LEASE_ID,
      "draft_abc",
      db as unknown as Firestore,
    );
    expect(drafted).toMatchObject({
      stageIndex: RENEWAL_STAGE.build,
      tenantOfferDraftId: "draft_abc",
    });

    // Re-recording the decision reopens the tenant step and drops the stale draft id (full set, no merge).
    const rerecorded = await recordOwnerDecision(
      editor,
      LEASE_ID,
      { decision: "custom", offeredRent: 1275 },
      db as unknown as Firestore,
    );
    expect(rerecorded.stageIndex).toBe(RENEWAL_STAGE.tenant);
    expect(rerecorded.tenantOfferDraftId).toBeNull();
  });

  it("refuses a tenant-draft stamp before any owner decision is recorded", async () => {
    const db = new ProgressTestFirestore();
    await expect(
      recordTenantOfferDraft(editor, LEASE_ID, "draft_x", db as unknown as Firestore),
    ).rejects.toThrow();
  });

  it("marks a renewal complete and lists all progress keyed by lease id", async () => {
    const db = new ProgressTestFirestore();
    await recordOwnerDecision(
      editor,
      LEASE_ID,
      { decision: "increase", offeredRent: 1300 },
      db as unknown as Firestore,
    );
    const complete = await markRenewalComplete(
      editor,
      LEASE_ID,
      db as unknown as Firestore,
    );
    expect(complete.complete).toBe(true);
    expect(complete.stageIndex).toBe(RENEWAL_STAGE.build);

    const all = await listAllRenewalProgress(editor, db as unknown as Firestore);
    expect(all.get(LEASE_ID)?.complete).toBe(true);
  });
});
