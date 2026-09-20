import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  POLICY_MATERIAL_ACTIVITY_COLLECTION,
  POLICY_MATERIAL_COLLECTION,
  decidePolicyMaterial,
  intakePolicyMaterial,
  listPolicyMaterial,
  readPolicyMaterialSnapshot,
  type PolicyMaterialBindingDeps,
} from "@/lib/firestore/lease-renewal-policy-material";
import {
  policyPreparationCurrent,
  projectPolicyApplicability,
  type PolicyMaterialConfig,
} from "@/lib/lease-renewal/policy-content";
import type { PublicationVersionRecord } from "@/lib/publication/types";
import { FakeFirestore } from "../helpers/fake-firestore";

// S131 (F11): uploading, approving and using are separate; each version is exact; a lost response
// is reconciled by readback; nothing activates on its own. Every value is SYNTHETIC; the only
// "publication" is an injected fake read, so no provider or live store is touched.

const admin: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
} as AuthenticatedUser;
const approver = { ...admin, uid: "approver-1", role: "Approver" } as AuthenticatedUser;
const editor = { ...admin, uid: "editor-1", role: "Editor" } as AuthenticatedUser;

const HASH = "c".repeat(64);
const OP = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function config(
  version: string,
  overrides: Partial<PolicyMaterialConfig> = {},
): PolicyMaterialConfig {
  return {
    schemaVersion: "policy-material/v1",
    productKey: "rhino",
    version,
    reference: `SYNTHETIC fixture ${version}`,
    publicationSource: {
      system: "s21_publication",
      reference: "publication:synthetic-0000001",
      contentHash: HASH,
    },
    review: {
      reviewer: "synthetic-reviewer",
      reviewedAt: "2026-09-20T12:00:00Z",
      note: "SYNTHETIC",
    },
    effectiveFrom: "2026-01-01",
    applicability: { ruleVersion: `${version}-rule`, condition: { kind: "always" } },
    requiredInputs: [],
    outputSlots: [
      {
        slotId: "tenant_paragraph",
        channel: "tenant_message",
        text: "SYNTHETIC fixed wording.",
      },
    ],
    conditions: {},
    ...overrides,
  };
}

function publication(
  overrides: Partial<PublicationVersionRecord> = {},
): PublicationVersionRecord {
  return {
    id: "synthetic-0000001",
    connectorId: "connector",
    contentByteSize: 12,
    contentHash: HASH,
    contentRef: {
      byteSize: 12,
      chunkCount: 1,
      contentHash: HASH,
      contentId: "synthetic-0000001",
      storage: "firestore-chunks-v1",
    },
    createdAt: "2026-09-20T12:00:00Z",
    createdByUid: "admin-1",
    detectedMimeType: "application/pdf",
    fileName: "synthetic.pdf",
    path: "/synthetic.pdf",
    policyId: "policy-1",
    resourceId: "resource-1",
    resourceType: "file",
    rootId: "root",
    sensitivity: "Low",
    spaceId: "renewals",
    validated: true,
    versionNumber: 1,
    ...overrides,
  };
}

function deps(overrides: Partial<PolicyMaterialBindingDeps> = {}) {
  const readPublication = vi.fn(async () => publication());
  const readActiveVersionId = vi.fn(async () => "synthetic-0000001");
  return {
    readPublication,
    readActiveVersionId,
    ...overrides,
  } satisfies PolicyMaterialBindingDeps;
}

function harness() {
  const fake = new FakeFirestore();
  const db = fake as unknown as Firestore;
  return { fake, db };
}

async function status(promise: Promise<unknown>) {
  try {
    await promise;
    return 200;
  } catch (error) {
    return error instanceof EditableLayerError ? error.status : -1;
  }
}

describe("S131 intake is pending, never active (AC-S131-2, AC-S131-3)", () => {
  it("records one exact pending version idempotently and refuses non-Admins, changed resubmissions and duplicate versions", async () => {
    const { fake, db } = harness();
    const d = deps();
    expect(
      await status(
        intakePolicyMaterial(editor, { config: config("v1"), operationId: OP(1) }, db, d),
      ),
    ).toBe(403);
    expect(d.readPublication).not.toHaveBeenCalled();

    const first = await intakePolicyMaterial(
      admin,
      { config: config("v1"), operationId: OP(1) },
      db,
      d,
      "2026-09-20T12:00:00Z",
    );
    expect(first).toMatchObject({
      duplicate: false,
      record: {
        id: "rhino:v1",
        state: "pending",
        revision: 1,
        submitted_by_uid: "admin-1",
      },
    });
    expect(await readPolicyMaterialSnapshot("rhino", db)).toEqual({
      state: "pending_only",
      active: null,
      activeRevision: null,
      pendingVersions: ["v1"],
    });

    const again = await intakePolicyMaterial(
      admin,
      { config: config("v1"), operationId: OP(1) },
      db,
      d,
    );
    expect(again).toMatchObject({
      duplicate: true,
      record: { id: "rhino:v1", revision: 1 },
    });
    expect(
      await status(
        intakePolicyMaterial(
          admin,
          {
            config: config("v1", { reference: "SYNTHETIC changed" }),
            operationId: OP(1),
          },
          db,
          d,
        ),
      ),
    ).toBe(409);
    expect(
      await status(
        intakePolicyMaterial(admin, { config: config("v1"), operationId: OP(2) }, db, d),
      ),
    ).toBe(409);
    expect(
      fake.store.get(`${POLICY_MATERIAL_ACTIVITY_COLLECTION}/${OP(1)}`),
    ).toMatchObject({
      action: "policy_material_submitted",
      request_hash: expect.any(String),
    });
    expect(
      [...fake.store.keys()].filter((key) =>
        key.startsWith(`${POLICY_MATERIAL_COLLECTION}/`),
      ),
    ).toEqual(["rhino:v1"].map((id) => `${POLICY_MATERIAL_COLLECTION}/${id}`));
  });

  it("refuses an unapproved, changed, inactive or foreign-Space publication binding", async () => {
    const { db } = harness();
    const input = { config: config("v1"), operationId: OP(3) };
    expect(
      await status(
        intakePolicyMaterial(
          admin,
          input,
          db,
          deps({
            readPublication: vi.fn(async () => {
              throw new Error("missing");
            }),
          }),
        ),
      ),
    ).toBe(409);
    expect(
      await status(
        intakePolicyMaterial(
          admin,
          input,
          db,
          deps({
            readPublication: vi.fn(async () =>
              publication({ contentHash: "d".repeat(64) }),
            ),
          }),
        ),
      ),
    ).toBe(409);
    expect(
      await status(
        intakePolicyMaterial(
          admin,
          input,
          db,
          deps({ readActiveVersionId: vi.fn(async () => "other-version") }),
        ),
      ),
    ).toBe(409);
    expect(
      await status(
        intakePolicyMaterial(
          admin,
          input,
          db,
          deps({ readPublication: vi.fn(async () => publication({ spaceId: "ask" })) }),
        ),
      ),
    ).toBe(409);
    expect(
      await status(
        intakePolicyMaterial(
          admin,
          input,
          db,
          deps({
            readPublication: vi.fn(async () => publication({ data_mode: "test" })),
          }),
        ),
      ),
    ).toBe(409);
    expect(
      await status(
        intakePolicyMaterial(
          admin,
          { config: { ...config("v1"), extra: 1 }, operationId: OP(3) },
          db,
          deps(),
        ),
      ),
    ).toBe(-1);
    expect(await readPolicyMaterialSnapshot("rhino", db)).toMatchObject({
      state: "none",
    });
  });
});

describe("S131 approval enables the exact version and supersedes the earlier one (AC-S131-3, AC-S131-8)", () => {
  it("approves under a revision check, supersedes on a later approval, rejects without touching the version in use and reconciles a lost response", async () => {
    const { fake, db } = harness();
    const d = deps();
    await intakePolicyMaterial(
      admin,
      { config: config("v1"), operationId: OP(1) },
      db,
      d,
      "2026-09-20T12:00:00Z",
    );
    const decide = (
      actor: AuthenticatedUser,
      version: string,
      decision: "approve" | "reject",
      expectedRevision: number,
      op: string,
    ) =>
      decidePolicyMaterial(
        actor,
        {
          productKey: "rhino",
          version,
          decision,
          reason: "SYNTHETIC decision",
          expectedRevision,
          operationId: op,
        },
        db,
        d,
        "2026-09-20T13:00:00Z",
      );

    expect(await status(decide(editor, "v1", "approve", 1, OP(4)))).toBe(403);
    expect(await status(decide(approver, "v1", "approve", 7, OP(4)))).toBe(409);
    expect(await status(decide(approver, "missing", "approve", 1, OP(4)))).toBe(404);
    const approved = await decide(approver, "v1", "approve", 1, OP(4));
    expect(approved).toMatchObject({
      duplicate: false,
      record: { state: "approved", revision: 2, decided_by_uid: "approver-1" },
    });
    expect(await readPolicyMaterialSnapshot("rhino", db)).toMatchObject({
      state: "approved",
      active: { version: "v1" },
      activeRevision: 2,
      pendingVersions: [],
    });
    expect(await decide(approver, "v1", "approve", 1, OP(4))).toMatchObject({
      duplicate: true,
      record: { state: "approved", revision: 2 },
    });
    expect(await status(decide(approver, "v1", "approve", 2, OP(5)))).toBe(409);

    await intakePolicyMaterial(
      admin,
      { config: config("v2"), operationId: OP(6) },
      db,
      d,
      "2026-09-21T12:00:00Z",
    );
    const binding = { productKey: "rhino" as const, version: "v1", contentHash: HASH };
    expect(
      policyPreparationCurrent(binding, await readPolicyMaterialSnapshot("rhino", db)),
    ).toEqual({ current: true, reason: "current" });
    await decide(admin, "v2", "approve", 1, OP(7));
    const afterV2 = await readPolicyMaterialSnapshot("rhino", db);
    expect(afterV2).toMatchObject({ state: "approved", active: { version: "v2" } });
    expect(policyPreparationCurrent(binding, afterV2)).toEqual({
      current: false,
      reason: "superseded",
    });
    expect(fake.store.get(`${POLICY_MATERIAL_COLLECTION}/rhino:v1`)).toMatchObject({
      state: "superseded",
      revision: 3,
      superseded_by_version: "v2",
    });

    await intakePolicyMaterial(
      admin,
      { config: config("v3"), operationId: OP(8) },
      db,
      d,
      "2026-09-22T12:00:00Z",
    );
    const rejected = await decide(approver, "v3", "reject", 1, OP(9));
    expect(rejected.record).toMatchObject({
      state: "rejected",
      decision_reason: "SYNTHETIC decision",
    });
    expect(await readPolicyMaterialSnapshot("rhino", db)).toMatchObject({
      state: "approved",
      active: { version: "v2" },
      pendingVersions: [],
    });
    expect(await status(decide(approver, "v3", "approve", 2, OP(10)))).toBe(409);
    expect(await status(listPolicyMaterial(editor, "rhino", db))).toBe(403);
    expect(
      (await listPolicyMaterial(approver, "rhino", db)).map((record) => [
        record.version,
        record.state,
      ]),
    ).toEqual([
      ["v3", "rejected"],
      ["v2", "approved"],
      ["v1", "superseded"],
    ]);
    // The only "publication" reads are the injected binding checks; no send, charge or Sheet write exists.
    expect(vi.mocked(d.readPublication).mock.calls.length).toBe(
      vi.mocked(d.readActiveVersionId).mock.calls.length,
    );
    expect(
      [...fake.store.keys()].every(
        (key) =>
          key.startsWith(`${POLICY_MATERIAL_COLLECTION}/`) ||
          key.startsWith(`${POLICY_MATERIAL_ACTIVITY_COLLECTION}/`),
      ),
    ).toBe(true);
  });

  it("reads concurrent, malformed or unreachable material as explicit review states, never as a policy", async () => {
    const { fake, db } = harness();
    const d = deps();
    await intakePolicyMaterial(
      admin,
      { config: config("a1"), operationId: OP(1) },
      db,
      d,
    );
    await intakePolicyMaterial(
      admin,
      { config: config("a2"), operationId: OP(2) },
      db,
      d,
    );
    // A second approval that raced past the first is repaired by the next approval, never silently kept.
    fake.seed(`${POLICY_MATERIAL_COLLECTION}/rhino:a1`, {
      ...(fake.store.get(`${POLICY_MATERIAL_COLLECTION}/rhino:a1`) ?? {}),
      state: "approved",
    });
    fake.seed(`${POLICY_MATERIAL_COLLECTION}/rhino:a2`, {
      ...(fake.store.get(`${POLICY_MATERIAL_COLLECTION}/rhino:a2`) ?? {}),
      state: "approved",
    });
    const ambiguous = await readPolicyMaterialSnapshot("rhino", db);
    expect(ambiguous).toMatchObject({ state: "ambiguous", active: null });
    expect(
      projectPolicyApplicability({
        productKey: "rhino",
        leaseId: "L1",
        manualState: null,
        material: ambiguous,
        facts: [],
        sheetLegacyValue: null,
        todayIso: "2026-09-20",
      }),
    ).toMatchObject({ state: "needs_review", reason: "material_ambiguous" });
    fake.seed(`${POLICY_MATERIAL_COLLECTION}/rhino:bad`, {
      product_key: "rhino",
      state: "approved",
    });
    expect(await readPolicyMaterialSnapshot("rhino", db)).toMatchObject({
      state: "unreadable",
    });
    expect(
      await readPolicyMaterialSnapshot("rhino", {
        collection() {
          throw new Error("offline");
        },
      } as unknown as Firestore),
    ).toMatchObject({ state: "unreadable", active: null });
  });
});
