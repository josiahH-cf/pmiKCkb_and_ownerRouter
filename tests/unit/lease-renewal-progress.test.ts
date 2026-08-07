import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  LEASE_RENEWAL_PROGRESS_COLLECTIONS,
  getRenewalProgress,
  listAllRenewalProgress,
  listRenewalProgressActivity,
  markRenewalComplete,
  progressDocId,
  recordOwnerDecision,
  recordTenantOfferDraft,
} from "@/lib/firestore/lease-renewal-progress";
import { COMP_SCREENSHOT_EXECUTION_COLLECTIONS } from "@/lib/firestore/lease-renewal-comp-screenshot-executions";
import { compScreenshotHeadDocId } from "@/lib/lease-renewal/comp-screenshot-attachment";
import {
  buildCompScreenshotPreview,
  buildCompScreenshotReceipt,
  compScreenshotExecutionFromPreview,
  compScreenshotProviderPayload,
  compScreenshotRecordIdentity,
  type CompScreenshotExecutionRecord,
} from "@/lib/lease-renewal/comp-screenshot-contract";
import {
  RENEWAL_STAGE,
  effectiveStageIndex,
  normalizeOwnerDecision,
  planMarkComplete,
  planRecordOwnerDecision,
  planRecordTenantOfferDraft,
  type RenewalOwnerDecisionWriteInput,
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

  it("normalizes the operator comp basis, drops an empty market, and validates numbers + range", () => {
    expect(
      normalizeOwnerDecision({
        decision: "increase",
        offeredRent: 1300,
        market: {
          zillowLow: 1450,
          zillowHigh: 1600,
          pmiNumber: 1550,
          compsUrl: "  https://www.zillow.com/homes/x_rb/  ",
        },
      }),
    ).toEqual({
      decision: "increase",
      offeredRent: 1300,
      market: {
        zillowLow: 1450,
        zillowHigh: 1600,
        pmiNumber: 1550,
        compsUrl: "https://www.zillow.com/homes/x_rb/",
      },
    });
    // An all-empty market object is dropped entirely (no market field).
    expect(
      normalizeOwnerDecision({ decision: "keep_same", offeredRent: 1200, market: {} }),
    ).toEqual({ decision: "keep_same", offeredRent: 1200 });
    // A negative comp is rejected; an inverted range (high < low) is rejected.
    expect(() =>
      normalizeOwnerDecision({
        decision: "increase",
        offeredRent: 1300,
        market: { zillowLow: -1 },
      }),
    ).toThrow();
    expect(() =>
      normalizeOwnerDecision({
        decision: "increase",
        offeredRent: 1300,
        market: { zillowLow: 1700, zillowHigh: 1500 },
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
      // S63: single-field equality query, mirroring the real API surface the activity reader uses.
      where: (field: string, _operator: "==", value: unknown) => ({
        get: async () => ({
          docs: [...store.entries()]
            .filter(
              ([path, record]) => path.startsWith(`${name}/`) && record[field] === value,
            )
            .map(([path, record]) => ({
              id: path.slice(name.length + 1),
              data: () => structuredClone(record),
            })),
        }),
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

function seedDeliveredCompScreenshot(
  db: ProgressTestFirestore,
  leaseId: string,
): CompScreenshotExecutionRecord {
  const identity = compScreenshotRecordIdentity(leaseId);
  const preview = buildCompScreenshotPreview({
    actorUid: editor.uid,
    ...identity,
    folderId: "approved_folder_fixture",
    providerIdentityHash: "a".repeat(64),
    contentSha256: "b".repeat(64),
    contentMd5: "c".repeat(32),
    sourceFilenameHash: "d".repeat(64),
    mimeType: "image/png",
    sizeBytes: 128,
    descriptor: {
      environmentKind: "production",
      dataContext: "live",
      source: "explicit",
    },
    nowMs: Date.parse("2026-07-30T03:00:00.000Z"),
    nonce: "progress_attachment_fixture",
  });
  const claimed = compScreenshotExecutionFromPreview(
    preview,
    Date.parse("2026-07-30T03:00:01.000Z"),
  );
  const candidate: CompScreenshotExecutionRecord = {
    ...claimed,
    state: "upload_started",
    reservedFileId: "drive_file_attachment_fixture",
    folderMetadataHash: "f".repeat(64),
    folderVersion: "1",
    dispatchGeneration: 1,
    dispatchLeaseExpiresAtMs: Date.parse("2026-07-30T03:02:01.000Z"),
  };
  const payload = compScreenshotProviderPayload(candidate);
  const receipt = buildCompScreenshotReceipt(
    candidate,
    {
      fileId: candidate.reservedFileId!,
      providerPayloadHash: payload.providerPayloadHash,
      providerMetadataHash: "e".repeat(64),
      md5Checksum: candidate.contentMd5,
      sha256Checksum: candidate.contentSha256,
      version: "1",
      headRevisionId: "head_attachment_fixture",
      createdTime: "2026-07-30T03:00:02.000Z",
      canUntrash: true,
    },
    false,
  );
  const delivered: CompScreenshotExecutionRecord = {
    ...candidate,
    state: "delivered",
    receipt,
  };
  db.store.set(
    `${COMP_SCREENSHOT_EXECUTION_COLLECTIONS.heads}/${compScreenshotHeadDocId(identity.compRecordHash)}`,
    {
      executionId: delivered.id,
      compRecordHash: identity.compRecordHash,
    },
  );
  db.store.set(
    `${COMP_SCREENSHOT_EXECUTION_COLLECTIONS.executions}/${delivered.id}`,
    structuredClone(delivered) as unknown as TestRecord,
  );
  return delivered;
}

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
      product_retention_policy: "product-record-retention:v1.0",
      product_retention_class: "indefinite",
      legal_hold: false,
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

  it("persists operator comp fields but ignores a caller-nominated screenshot reference", async () => {
    const db = new ProgressTestFirestore();
    await recordOwnerDecision(
      editor,
      LEASE_ID,
      {
        decision: "increase",
        offeredRent: 1300,
        market: {
          zillowLow: 1450,
          zillowHigh: 1600,
          pmiNumber: 1550,
          compsUrl: "https://www.zillow.com/homes/x_rb/",
          // The persistence boundary derives screenshots from its own receipt ledger; this forged
          // caller value must never become authority.
          compScreenshotRef: "drive:abc123",
          compSource: "RentCast",
          compRetrievedAt: "2026-07-23T00:00:00.000Z",
        },
      } as unknown as RenewalOwnerDecisionWriteInput,
      db as unknown as Firestore,
    );
    const record = db.store.get(
      `${LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress}/${progressDocId(LEASE_ID)}`,
    );
    // Persisted snake_case.
    expect(record).toMatchObject({
      owner_decision: {
        market: {
          zillow_low: 1450,
          zillow_high: 1600,
          pmi_number: 1550,
          comps_url: "https://www.zillow.com/homes/x_rb/",
          comp_source: "RentCast",
          comp_retrieved_at: "2026-07-23T00:00:00.000Z",
        },
      },
    });
    expect(
      (record?.owner_decision as { market?: Record<string, unknown> } | undefined)
        ?.market,
    ).not.toHaveProperty("comp_screenshot_ref");
    // Read back camelCase.
    const progress = await getRenewalProgress(
      editor,
      LEASE_ID,
      db as unknown as Firestore,
    );
    expect(progress?.ownerDecision?.market).toEqual({
      zillowLow: 1450,
      zillowHigh: 1600,
      pmiNumber: 1550,
      compsUrl: "https://www.zillow.com/homes/x_rb/",
      compSource: "RentCast",
      compRetrievedAt: "2026-07-23T00:00:00.000Z",
    });
  });

  it("derives and persists only the coherent current screenshot receipt in the decision transaction", async () => {
    const db = new ProgressTestFirestore();
    const delivered = seedDeliveredCompScreenshot(db, LEASE_ID);

    const progress = await recordOwnerDecision(
      editor,
      LEASE_ID,
      {
        decision: "increase",
        offeredRent: 1300,
        market: { pmiNumber: 1550 },
      },
      db as unknown as Firestore,
    );

    expect(progress.ownerDecision?.market).toMatchObject({
      pmiNumber: 1550,
      compScreenshotRef: delivered.receipt?.ref,
    });
    const record = db.store.get(
      `${LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress}/${progressDocId(LEASE_ID)}`,
    );
    expect(record).toMatchObject({
      owner_decision: {
        market: {
          comp_screenshot_ref: delivered.receipt?.ref,
          comp_screenshot_execution_id: delivered.id,
          comp_screenshot_receipt_id: delivered.receipt?.receiptId,
          comp_screenshot_result_hash: delivered.receipt?.resultHash,
        },
      },
    });
  });

  it("does not attach a tampered receipt or an execution with an active rollback", async () => {
    for (const variant of ["tampered", "running", "ambiguous"] as const) {
      const db = new ProgressTestFirestore();
      const delivered = seedDeliveredCompScreenshot(db, LEASE_ID);
      const path = `${COMP_SCREENSHOT_EXECUTION_COLLECTIONS.executions}/${delivered.id}`;
      const changed =
        variant === "tampered"
          ? {
              ...delivered,
              receipt: {
                ...delivered.receipt!,
                ref: "drive:forged_attachment_fixture",
              },
            }
          : {
              ...delivered,
              rollback: {
                id: `comp_trash_${"f".repeat(48)}`,
                bindingHash: "a".repeat(64),
                previewHash: "b".repeat(64),
                actorUid: editor.uid,
                state: variant,
                attemptCount: 1 as const,
                createdAt: "2026-07-30T03:01:00.000Z",
                updatedAt: "2026-07-30T03:01:00.000Z",
              },
            };
      db.store.set(path, structuredClone(changed) as unknown as TestRecord);

      const progress = await recordOwnerDecision(
        editor,
        LEASE_ID,
        { decision: "increase", offeredRent: 1300 },
        db as unknown as Firestore,
      );
      expect(progress.ownerDecision?.market?.compScreenshotRef, variant).toBeUndefined();
    }
  });

  it("allows the same receipted attachment to return after a deterministic rollback failure", async () => {
    const db = new ProgressTestFirestore();
    const delivered = seedDeliveredCompScreenshot(db, LEASE_ID);
    const path = `${COMP_SCREENSHOT_EXECUTION_COLLECTIONS.executions}/${delivered.id}`;
    db.store.set(
      path,
      structuredClone({
        ...delivered,
        rollback: {
          id: `comp_trash_${"f".repeat(48)}`,
          bindingHash: "a".repeat(64),
          previewHash: "b".repeat(64),
          actorUid: editor.uid,
          state: "failed",
          attemptCount: 1,
          createdAt: "2026-07-30T03:01:00.000Z",
          updatedAt: "2026-07-30T03:01:00.000Z",
        },
      }) as unknown as TestRecord,
    );

    const progress = await recordOwnerDecision(
      editor,
      LEASE_ID,
      { decision: "increase", offeredRent: 1300 },
      db as unknown as Firestore,
    );
    expect(progress.ownerDecision?.market?.compScreenshotRef).toBe(
      delivered.receipt?.ref,
    );
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

  it("preserves a legal hold across a full progress rewrite", async () => {
    const db = new ProgressTestFirestore();
    await recordOwnerDecision(
      editor,
      LEASE_ID,
      { decision: "increase", offeredRent: 1300 },
      db as unknown as Firestore,
    );
    const path = `${LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress}/${progressDocId(LEASE_ID)}`;
    db.store.set(path, { ...db.store.get(path)!, legal_hold: true });

    await recordOwnerDecision(
      editor,
      LEASE_ID,
      { decision: "custom", offeredRent: 1275 },
      db as unknown as Firestore,
    );

    expect(db.store.get(path)).toMatchObject({
      product_retention_policy: "product-record-retention:v1.0",
      product_retention_class: "indefinite",
      legal_hold: true,
    });
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

// S60: the provider-retrieved basis persists verbatim, beside (never over) the typed fields.
describe("S60 provider comp basis persistence", () => {
  const PROVIDER = {
    source: "RentCast",
    rangeLow: 1450,
    rangeHigh: 1650,
    pointEstimate: 1550,
    compCount: 12,
    retrievedAt: "2026-08-06T12:00:00.000Z",
    comps: [
      { rent: 1600, correlation: 0.97, distanceMiles: 0.4 },
      { rent: 1500, correlation: 0.93 },
    ],
    trend: {
      zipCode: "64118",
      retrievedAt: "2026-08-06T12:00:00.000Z",
      months: {
        "2024-08": { averageRent: 1400 },
        "2026-07": { averageRent: 1520, medianRent: 1500 },
      },
    },
  };

  // AC-S60-1 + AC-S60-5: both bases survive the round trip; neither write clears the other.
  it("persists provider and typed values together and reads both back", async () => {
    const db = new ProgressTestFirestore();
    await recordOwnerDecision(
      editor,
      LEASE_ID,
      {
        decision: "increase",
        offeredRent: 1300,
        market: { zillowLow: 1400, zillowHigh: 1500, provider: PROVIDER },
      },
      db as unknown as Firestore,
    );
    const readBack = await getRenewalProgress(
      editor,
      LEASE_ID,
      db as unknown as Firestore,
    );
    const market = readBack?.ownerDecision?.market;
    expect(market?.zillowLow).toBe(1400);
    expect(market?.zillowHigh).toBe(1500);
    expect(market?.provider).toMatchObject({
      source: "RentCast",
      rangeLow: 1450,
      rangeHigh: 1650,
      pointEstimate: 1550,
      compCount: 12,
      retrievedAt: "2026-08-06T12:00:00.000Z",
    });
    expect(market?.provider?.comps?.map((comp) => comp.correlation)).toEqual([
      0.97, 0.93,
    ]);
    expect(market?.provider?.trend?.months["2026-07"]).toEqual({
      averageRent: 1520,
      medianRent: 1500,
    });

    const record = db.store.get(
      `${LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress}/${progressDocId(LEASE_ID)}`,
    ) as Record<string, never>;
    const persisted = (record as Record<string, Record<string, Record<string, unknown>>>)
      .owner_decision.market;
    expect(persisted.provider).toMatchObject({
      source: "RentCast",
      range_low: 1450,
      range_high: 1650,
      point_estimate: 1550,
      comp_count: 12,
    });
  });

  it("refuses an incoherent provider block instead of persisting a half-truth", () => {
    expect(() =>
      planRecordOwnerDecision(null, {
        decision: "increase",
        offeredRent: 1300,
        market: {
          provider: { ...PROVIDER, rangeHigh: 1000 },
        },
      }),
    ).toThrow(/range high/i);
    expect(() =>
      planRecordOwnerDecision(null, {
        decision: "increase",
        offeredRent: 1300,
        market: {
          provider: { ...PROVIDER, source: "  " },
        },
      }),
    ).toThrow(/source label/i);
  });
});

// S63 (AC-S63-6): the activity trail's first reader. Written on every transition; until this
// suite nothing anywhere read it.
describe("listRenewalProgressActivity (AC-S63-6)", () => {
  it("returns a lease's transitions in time order after a real write", async () => {
    const db = new ProgressTestFirestore();
    await recordOwnerDecision(
      editor,
      LEASE_ID,
      { decision: "increase", offeredRent: 1300 },
      db as unknown as Firestore,
    );
    // A second, EARLIER entry for the same lease plus one for a different lease.
    db.store.set(`${LEASE_RENEWAL_PROGRESS_COLLECTIONS.progressActivity}/earlier`, {
      id: "earlier",
      lease_id: LEASE_ID,
      actor_uid: "editor-0",
      action: "owner_decision",
      stage_index: 1,
      created_at: "2026-07-01T00:00:00.000Z",
    });
    db.store.set(`${LEASE_RENEWAL_PROGRESS_COLLECTIONS.progressActivity}/other-lease`, {
      id: "other-lease",
      lease_id: "9999",
      actor_uid: "editor-0",
      action: "mark_complete",
      stage_index: 3,
      created_at: "2026-07-02T00:00:00.000Z",
    });

    const timeline = await listRenewalProgressActivity(
      editor,
      LEASE_ID,
      db as unknown as Firestore,
    );
    expect(timeline).toHaveLength(2);
    // Time order: the seeded July entry precedes the transition just written.
    expect(timeline[0]).toMatchObject({ id: "earlier", lease_id: LEASE_ID });
    expect(timeline[1]).toMatchObject({ lease_id: LEASE_ID, action: "owner_decision" });
    expect(timeline.map((entry) => entry.lease_id)).not.toContain("9999");
  });

  it("returns an empty timeline for a blank lease id", async () => {
    const db = new ProgressTestFirestore();
    expect(
      await listRenewalProgressActivity(editor, "  ", db as unknown as Firestore),
    ).toEqual([]);
  });
});
