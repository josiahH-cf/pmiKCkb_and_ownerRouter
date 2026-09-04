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
  recordOwnerOutcome,
  recordRenewalProcessEvidence,
  recordTenantOutcome,
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
  type RenewalMarketProviderBasis,
  type RenewalOwnerDecisionWriteInput,
  type RenewalProgress,
} from "@/lib/lease-renewal/renewal-progress";
import {
  RENEWAL_PROCESS_VERSION,
  type RenewalEvidenceKey,
  type RenewalEvidenceSource,
} from "@/lib/lease-renewal/renewal-process";

function currentProgress(overrides: Partial<RenewalProgress> = {}): RenewalProgress {
  return {
    leaseId: "42",
    processVersion: RENEWAL_PROCESS_VERSION,
    stageIndex: RENEWAL_STAGE.data,
    ownerDecision: null,
    ownerDecisionRevision: 0,
    tenantOfferDraftId: null,
    tenantOutcome: null,
    evidence: {},
    complete: false,
    ...overrides,
  };
}

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
          rangeLow: 1450,
          rangeHigh: 1600,
          pmiNumber: 1550,
        },
      }),
    ).toEqual({
      decision: "increase",
      offeredRent: 1300,
      market: {
        rangeLow: 1450,
        rangeHigh: 1600,
        pmiNumber: 1550,
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
        market: { rangeLow: -1 },
      }),
    ).toThrow();
    expect(() =>
      normalizeOwnerDecision({
        decision: "increase",
        offeredRent: 1300,
        market: { rangeLow: 1700, rangeHigh: 1500 },
      }),
    ).toThrow();
  });

  it("recording a decision places the lease at the Tenant step and clears any prior draft", () => {
    const plan = planRecordOwnerDecision(
      currentProgress({
        stageIndex: RENEWAL_STAGE.build,
        ownerDecision: { decision: "keep_same", offeredRent: 1000 },
        ownerDecisionRevision: 1,
        tenantOfferDraftId: "old-draft",
        complete: true,
      }),
      { decision: "increase", offeredRent: 1300 },
    );
    expect(plan).toMatchObject({
      processVersion: RENEWAL_PROCESS_VERSION,
      stageIndex: RENEWAL_STAGE.owner,
      ownerDecision: { decision: "increase", offeredRent: 1300 },
      ownerDecisionRevision: 2,
      tenantOfferDraftId: null,
      tenantOutcome: null,
      complete: false,
    });
    expect(plan.evidence).toHaveProperty("owner-decision");
    expect(plan.evidence).toHaveProperty("recurring-charges-separated");
  });

  it("recording a tenant draft stays in Tenant decision; without a current decision it is out of order (409)", () => {
    const current = currentProgress({
      stageIndex: RENEWAL_STAGE.tenant,
      ownerDecision: { decision: "increase", offeredRent: 1300 },
      ownerDecisionRevision: 1,
      evidence: {
        "owner-decision": {
          ref: "lease-progress:owner-decision:r1",
          source: "app_record",
          disposition: "verified",
        },
      },
    });
    expect(planRecordTenantOfferDraft(current, "draft-1")).toMatchObject({
      processVersion: RENEWAL_PROCESS_VERSION,
      stageIndex: RENEWAL_STAGE.tenant,
      ownerDecision: { decision: "increase", offeredRent: 1300 },
      tenantOfferDraftId: "draft-1",
      complete: false,
    });
    expect(() => planRecordTenantOfferDraft(null, "draft-1")).toThrow();
    expect(() =>
      planRecordTenantOfferDraft(
        { ...current, ownerDecision: null, evidence: {} },
        "draft-1",
      ),
    ).toThrow();
    expect(() => planRecordTenantOfferDraft(current, "   ")).toThrow();
  });

  it("marking complete refuses a coarse decision/draft state without compliance evidence", () => {
    const current = currentProgress({
      stageIndex: RENEWAL_STAGE.tenant,
      ownerDecision: { decision: "increase", offeredRent: 1300 },
      ownerDecisionRevision: 1,
      tenantOfferDraftId: "draft-1",
      evidence: {
        "owner-decision": {
          ref: "lease-progress:owner-decision:r1",
          source: "app_record",
          disposition: "verified",
        },
      },
    });
    expect(() => planMarkComplete(current)).toThrow(/compliance evidence/i);
    expect(() => planMarkComplete(null)).toThrow();
    expect(() =>
      planMarkComplete({ ...current, ownerDecision: null, evidence: {} }),
    ).toThrow();
  });

  it("effectiveStageIndex prefers recorded progress and clamps out-of-range values", () => {
    expect(effectiveStageIndex(null, 1)).toBe(1);
    expect(
      effectiveStageIndex(
        currentProgress({
          leaseId: "1",
          stageIndex: 2,
        }),
        1,
      ),
    ).toBe(2);
    expect(
      effectiveStageIndex(
        currentProgress({
          leaseId: "1",
          stageIndex: 99,
        }),
        0,
      ),
    ).toBe(RENEWAL_STAGE.close);
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

async function recordEvidence(
  db: ProgressTestFirestore,
  key: RenewalEvidenceKey,
  source: RenewalEvidenceSource = "app_record",
) {
  await recordRenewalProcessEvidence(
    editor,
    LEASE_ID,
    key,
    {
      ref: `${source}:${key}:fixture-receipt`,
      source,
      disposition: "verified",
    },
    db as unknown as Firestore,
  );
}

/** Build the accepted path in process order so every upstream replacement invalidates only stale work. */
async function recordAcceptedCompletionEvidence(db: ProgressTestFirestore) {
  for (const [key, source] of [
    ["lease-tracked", "app_record"],
    ["lease-identity", "rentvine_snapshot"],
    ["lease-end-date", "rentvine_snapshot"],
    ["base-rent", "rentvine_snapshot"],
    ["recurring-charges-separated", "app_record"],
    ["source-conflicts-resolved", "reconciliation_receipt"],
    ["source-snapshot-current", "rentvine_snapshot"],
    ["renewal-recipients", "rentvine_snapshot"],
    ["market-evidence", "rentcast_receipt"],
    ["market-evidence-reviewed", "app_record"],
    ["owner-copy-version", "policy_version"],
    ["owner-draft-receipt", "gmail_receipt"],
    ["owner-message-sent", "gmail_receipt"],
    ["owner-response", "gmail_receipt"],
  ] as const) {
    await recordEvidence(db, key, source);
  }

  // Explicitly re-recording the human decision is the reviewed migration/currentness seam.
  await recordOwnerDecision(
    editor,
    LEASE_ID,
    { decision: "increase", offeredRent: 1300 },
    db as unknown as Firestore,
  );
  for (const [key, source] of [
    ["tenant-offer-fact-lock", "app_record"],
    ["tenant-recipients", "rentvine_snapshot"],
    ["tenant-copy-version", "policy_version"],
  ] as const) {
    await recordEvidence(db, key, source);
  }
  await recordTenantOfferDraft(
    editor,
    LEASE_ID,
    "draft_accepted_fixture",
    db as unknown as Firestore,
  );
  await recordEvidence(db, "tenant-message-sent", "gmail_receipt");
  await recordEvidence(db, "tenant-contact-state", "gmail_receipt");
  await recordTenantOutcome(
    editor,
    LEASE_ID,
    "accepted",
    {
      ref: "gmail_receipt:tenant-outcome:accepted-fixture",
      source: "gmail_receipt",
      disposition: "verified",
    },
    db as unknown as Firestore,
  );

  for (const [key, source] of [
    ["packet-catalog-version", "policy_version"],
    ["packet-facts", "app_record"],
    ["packet-snapshot", "packet_snapshot"],
    ["dotloop-packet-readback", "dotloop_receipt"],
    ["signer-roster", "packet_snapshot"],
    ["signature-state", "dotloop_receipt"],
    ["timing-policy-version", "policy_version"],
    ["current-packet-version", "packet_snapshot"],
    ["signatures-complete", "signed_artifact"],
    ["final-documents", "signed_artifact"],
    ["animal-compliance", "compliance_record"],
    ["deposit-compliance", "compliance_record"],
    ["insurance-and-charges", "compliance_record"],
    ["inspection-compliance", "compliance_record"],
    ["term-dates", "compliance_record"],
    ["compliance-exceptions", "compliance_record"],
  ] as const) {
    await recordEvidence(db, key, source);
  }
}

describe("lease-renewal-progress store", () => {
  it("records a version-pinned owner decision without pretending owner outreach is complete", async () => {
    const db = new ProgressTestFirestore();
    const progress = await recordOwnerDecision(
      editor,
      LEASE_ID,
      { decision: "increase", offeredRent: 1300 },
      db as unknown as Firestore,
    );

    expect(progress).toMatchObject({
      leaseId: LEASE_ID,
      processVersion: RENEWAL_PROCESS_VERSION,
      stageIndex: RENEWAL_STAGE.owner,
      ownerDecision: { decision: "increase", offeredRent: 1300 },
      ownerDecisionRevision: 1,
      tenantOfferDraftId: null,
      complete: false,
    });

    const record = db.store.get(
      `${LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress}/${progressDocId(LEASE_ID)}`,
    );
    expect(record).toMatchObject({
      lease_id: LEASE_ID,
      process_version: RENEWAL_PROCESS_VERSION,
      stage_index: RENEWAL_STAGE.owner,
      owner_decision: { decision: "increase", offered_rent: 1300 },
      owner_decision_revision: 1,
      process_evidence: {
        "owner-decision": expect.objectContaining({ disposition: "verified" }),
        "recurring-charges-separated": expect.objectContaining({
          disposition: "verified",
        }),
      },
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
      process_version: RENEWAL_PROCESS_VERSION,
    });
  });

  it("persists and reads back a typed owner response, reopening downstream work (S105)", async () => {
    const db = new ProgressTestFirestore();
    await recordOwnerDecision(
      editor,
      LEASE_ID,
      { decision: "increase", offeredRent: 1300 },
      db as unknown as Firestore,
    );
    await recordEvidence(db, "owner-copy-version", "policy_version");
    await recordEvidence(db, "owner-draft-receipt", "gmail_receipt");
    await recordEvidence(db, "owner-message-sent", "gmail_receipt");

    const progress = await recordOwnerOutcome(
      editor,
      LEASE_ID,
      "revision_requested",
      {
        ref: "gmail_receipt:owner-response:revision-fixture",
        source: "gmail_receipt",
        disposition: "verified",
      },
      db as unknown as Firestore,
    );
    expect(progress.ownerOutcome).toMatchObject({ state: "revision_requested" });
    expect(progress.evidence["owner-copy-version"]).toBeUndefined();
    expect(progress.evidence["owner-response"]).toBeDefined();

    const record = db.store.get(
      `${LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress}/${progressDocId(LEASE_ID)}`,
    );
    expect(record).toMatchObject({
      owner_outcome: {
        state: "revision_requested",
        evidence: expect.objectContaining({ disposition: "verified" }),
      },
    });
    const readBack = await getRenewalProgress(
      editor,
      LEASE_ID,
      db as unknown as Firestore,
    );
    expect(readBack?.ownerOutcome).toMatchObject({ state: "revision_requested" });
    const activity = [...db.store.entries()]
      .filter(([path]) =>
        path.startsWith(`${LEASE_RENEWAL_PROGRESS_COLLECTIONS.progressActivity}/`),
      )
      .map(([, value]) => (value as { action?: string }).action);
    expect(activity).toContain("owner_outcome");
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
          rangeLow: 1450,
          rangeHigh: 1600,
          pmiNumber: 1550,
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
          range_low: 1450,
          range_high: 1600,
          pmi_number: 1550,
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
      rangeLow: 1450,
      rangeHigh: 1600,
      pmiNumber: 1550,
      compSource: "RentCast",
      compRetrievedAt: "2026-07-23T00:00:00.000Z",
    });
  });

  it("reads historical market aliases neutrally and migrates them on the next save", async () => {
    const db = new ProgressTestFirestore();
    const oldLowKey = ["zillow", "_low"].join("");
    const oldHighKey = ["zillow", "_high"].join("");
    const oldUrlKey = ["comps", "_url"].join("");
    const path = `${LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress}/${progressDocId(LEASE_ID)}`;
    db.store.set(path, {
      id: progressDocId(LEASE_ID),
      lease_id: LEASE_ID,
      stage_index: RENEWAL_STAGE.tenant,
      owner_decision: {
        decision: "increase",
        offered_rent: 1300,
        market: {
          [oldLowKey]: 1450,
          [oldHighKey]: 1600,
          [oldUrlKey]: "https://legacy.invalid/never-follow",
        },
      },
      complete: false,
      updated_by_uid: editor.uid,
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    });

    const opened = await getRenewalProgress(editor, LEASE_ID, db as unknown as Firestore);
    expect(opened?.ownerDecision?.market).toEqual({ rangeLow: 1450, rangeHigh: 1600 });
    expect(JSON.stringify(opened)).not.toContain("never-follow");

    await recordOwnerDecision(
      editor,
      LEASE_ID,
      {
        decision: "increase",
        offeredRent: 1300,
        market: opened?.ownerDecision?.market,
      },
      db as unknown as Firestore,
    );
    const migratedMarket = (
      db.store.get(path)?.owner_decision as { market?: Record<string, unknown> }
    ).market;
    expect(migratedMarket).toMatchObject({ range_low: 1450, range_high: 1600 });
    expect(migratedMarket).not.toHaveProperty(oldLowKey);
    expect(migratedMarket).not.toHaveProperty(oldHighKey);
    expect(migratedMarket).not.toHaveProperty(oldUrlKey);
    expect(JSON.stringify(migratedMarket)).not.toContain("never-follow");
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

  it("stamps the unsent tenant-draft receipt without completing the decision; a re-recorded owner decision clears it", async () => {
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
      stageIndex: RENEWAL_STAGE.tenant,
      tenantOfferDraftId: "draft_abc",
    });

    // Re-recording the decision stays in owner work and drops the stale draft id (full set, no merge).
    const rerecorded = await recordOwnerDecision(
      editor,
      LEASE_ID,
      { decision: "custom", offeredRent: 1275 },
      db as unknown as Firestore,
    );
    expect(rerecorded.stageIndex).toBe(RENEWAL_STAGE.owner);
    expect(rerecorded.tenantOfferDraftId).toBeNull();
  });

  it("refuses a tenant-draft stamp before any owner decision is recorded", async () => {
    const db = new ProgressTestFirestore();
    await expect(
      recordTenantOfferDraft(editor, LEASE_ID, "draft_x", db as unknown as Firestore),
    ).rejects.toThrow();
  });

  it("refuses coarse completion, then completes only after the accepted evidence path", async () => {
    const db = new ProgressTestFirestore();
    await recordOwnerDecision(
      editor,
      LEASE_ID,
      { decision: "increase", offeredRent: 1300 },
      db as unknown as Firestore,
    );
    await expect(
      markRenewalComplete(editor, LEASE_ID, db as unknown as Firestore),
    ).rejects.toThrow(/tenant-outcome|evidence/i);

    await recordAcceptedCompletionEvidence(db);
    const complete = await markRenewalComplete(
      editor,
      LEASE_ID,
      db as unknown as Firestore,
    );
    expect(complete.complete).toBe(true);
    expect(complete.stageIndex).toBe(RENEWAL_STAGE.compliance);

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
    radiusMiles: 2,
    requestedCompCount: 15,
    lookupSubjectAttributes: true,
    providerVersion: "rentcast-avm-long-term-v1",
    cacheState: "live",
    omittedAttributes: [
      {
        field: "propertyType",
        reason: "RentVine propertyTypeID has no approved RentCast mapping.",
      },
    ],
    unitFilters: { bedrooms: 3, bathrooms: 2.5, squareFootage: 1400 },
    subjectProperty: {
      propertyType: "Single Family",
      bedrooms: 3,
      bathrooms: 2.5,
      squareFootage: 1400,
    },
    comps: [
      {
        rent: 1600,
        correlation: 0.97,
        distanceMiles: 0.4,
        propertyType: "Single Family",
        bedrooms: 3,
        bathrooms: 2.5,
        squareFootage: 1400,
        listedDate: "2026-07-01T00:00:00.000Z",
        lastSeenDate: "2026-07-20T00:00:00.000Z",
        daysOld: 10,
        daysOnMarket: 19,
      },
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
  } satisfies RenewalMarketProviderBasis;

  // AC-S60-1 + AC-S60-5: both bases survive the round trip; neither write clears the other.
  it("persists provider and typed values together and reads both back", async () => {
    const db = new ProgressTestFirestore();
    await recordOwnerDecision(
      editor,
      LEASE_ID,
      {
        decision: "increase",
        offeredRent: 1300,
        market: { rangeLow: 1400, rangeHigh: 1500, provider: PROVIDER },
      },
      db as unknown as Firestore,
    );
    const readBack = await getRenewalProgress(
      editor,
      LEASE_ID,
      db as unknown as Firestore,
    );
    const market = readBack?.ownerDecision?.market;
    expect(market?.rangeLow).toBe(1400);
    expect(market?.rangeHigh).toBe(1500);
    expect(market?.provider).toMatchObject({
      source: "RentCast",
      rangeLow: 1450,
      rangeHigh: 1650,
      pointEstimate: 1550,
      compCount: 12,
      retrievedAt: "2026-08-06T12:00:00.000Z",
      radiusMiles: 2,
      requestedCompCount: 15,
      lookupSubjectAttributes: true,
      providerVersion: "rentcast-avm-long-term-v1",
      cacheState: "live",
      unitFilters: { bedrooms: 3, bathrooms: 2.5, squareFootage: 1400 },
      subjectProperty: {
        propertyType: "Single Family",
        bedrooms: 3,
        bathrooms: 2.5,
        squareFootage: 1400,
      },
    });
    expect(market?.provider?.omittedAttributes).toEqual(PROVIDER.omittedAttributes);
    expect(market?.provider?.comps?.map((comp) => comp.correlation)).toEqual([
      0.97, 0.93,
    ]);
    expect(market?.provider?.comps?.[0]).toEqual(PROVIDER.comps[0]);
    expect(market?.provider?.trend?.months["2026-07"]).toEqual({
      averageRent: 1520,
      medianRent: 1500,
    });

    const record = db.store.get(
      `${LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress}/${progressDocId(LEASE_ID)}`,
    ) as Record<string, never>;
    const persisted = (record as Record<string, Record<string, Record<string, unknown>>>)
      .owner_decision.market;
    const persistedProvider = persisted.provider as Record<string, unknown> & {
      comps?: unknown;
    };
    expect(persistedProvider).toMatchObject({
      source: "RentCast",
      range_low: 1450,
      range_high: 1650,
      point_estimate: 1550,
      comp_count: 12,
      radius_miles: 2,
      requested_comp_count: 15,
      lookup_subject_attributes: true,
      provider_version: "rentcast-avm-long-term-v1",
      cache_state: "live",
      unit_filters: { bedrooms: 3, bathrooms: 2.5, square_footage: 1400 },
      subject_property: {
        property_type: "Single Family",
        bedrooms: 3,
        bathrooms: 2.5,
        square_footage: 1400,
      },
    });
    expect(persistedProvider.comps).toEqual([
      {
        rent: 1600,
        correlation: 0.97,
        distance_miles: 0.4,
        property_type: "Single Family",
        bedrooms: 3,
        bathrooms: 2.5,
        square_footage: 1400,
        listed_date: "2026-07-01T00:00:00.000Z",
        last_seen_date: "2026-07-20T00:00:00.000Z",
        days_old: 10,
        days_on_market: 19,
      },
      { rent: 1500, correlation: 0.93 },
    ]);
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
