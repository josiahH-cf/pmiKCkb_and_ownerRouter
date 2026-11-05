import { readFileSync } from "node:fs";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { setFamilyUse } from "@/lib/firestore/lease-artifact-family-use";
import {
  CHARGE_POLICY_COLLECTIONS,
  publishChargePolicy,
  readChargePolicy,
} from "@/lib/firestore/lease-charge-policy";
import {
  DERIVED_ARTIFACT_COLLECTIONS,
  derivedArtifactDeps,
  prepareDerivedArtifact,
  readDerivedArtifactContent,
  readDerivedArtifactStatus,
  type DerivedArtifactDeps,
} from "@/lib/firestore/lease-derived-artifacts";
import { savePacketSnapshot } from "@/lib/firestore/lease-document-packet-snapshots";
import { readOwnerExplanationStartingText } from "@/lib/firestore/lease-owner-explanation-starting-text";
import { getPacketInputs, savePacketInputs } from "@/lib/firestore/lease-packet-inputs";
import { ensureRenewalWorkRecord } from "@/lib/firestore/renewal-workspace";
import {
  readHistoricalApprovedArtifact,
  resolveApprovedDotloopArtifact,
  type ApprovedArtifactContentDeps,
} from "@/lib/lease-documents/approved-artifact-content";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import {
  PACKET_SOURCE_COLLECTIONS,
  resolveLivePacketInput,
  resolveOwnerAcknowledgmentInput,
} from "@/lib/lease-documents/live-input";
import { ApprovedLeaseCatalogSchema } from "@/lib/lease-documents/live-source-schema";
import { ownerAcknowledgmentTransactionId } from "@/lib/lease-documents/owner-acknowledgment";
import type { LeaseArtifactCatalog } from "@/lib/lease-documents/packet-types";
import { readStaticPageRuns, readStaticPdfLines } from "@/lib/lease-documents/static-pdf";
import { FirestorePublicationContentStore } from "@/lib/publication/content";
import {
  getPublicationVersion,
  PUBLICATION_COLLECTIONS,
} from "@/lib/publication/service";
import {
  ONE_PATH_EXECUTION_DATE_AREA,
  ONE_PATH_OLD_FEE_TEXT,
  ONE_PATH_ORGANIZATIONS,
  seedOnePathForms,
  type OnePathFormKind,
  type OnePathLease,
} from "@/tests/browser/one-path-forms-seed.mjs";
import { objectsHolding } from "@/tests/fixtures/synthetic-static";

// S253 deliverable 7: the rehearsal seed against the Firestore emulator and the real stores. The
// seed writes the synthetic forms and each lease's packet facts; an Admin then records one family
// use and publishes the fee, staff record a deposit and write an explanation, and the real reader,
// evaluator and filled-document store prepare the files. The property system is the one stand-in:
// its lease read answers with invented leases, so no provider is contacted. Invented values only.

const leaseViews = vi.hoisted(() => ({
  current: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/lease-renewal/live-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/lease-renewal/live-config")>()),
  buildLiveRentVineConfig: () => ({ ok: true, rentvineClient: {} }),
}));
vi.mock("@/lib/lease-renewal/live-lease-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/lease-renewal/live-lease-cache")>()),
  requireCurrentLeaseViews: async () => leaseViews.current,
}));
vi.mock("@/lib/firestore/renewal-notice-safety", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/firestore/renewal-notice-safety")>()),
  withRenewalNoticeAdmission: (_actor: unknown, reader: object) => reader,
}));

const projectId = "pmi-kc-kb-s253-one-path-test";
const admin = {
  uid: "synthetic-admin",
  email: "synthetic-admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
} as AuthenticatedUser;
const editor = {
  uid: "synthetic-editor",
  email: "synthetic-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
} as AuthenticatedUser;

const FEE_SOURCE = "SYNTHETIC source note for the processing fee";
const DEPOSIT_SOURCE = "SYNTHETIC screening result";
const FIRST = "SYNTHETIC first paragraph for the owner about this renewal.";
const SECOND = "SYNTHETIC second paragraph with one more sentence.";
const NEEDS_DEPOSIT =
  "Example Pet 1: record the refundable deposit and where it comes from.";

let app: App, db: Firestore, testEnv: RulesTestEnvironment, deps: DerivedArtifactDeps;
let operations = 0;
const nextOperation = () =>
  `00000000-0000-4000-8000-${String(++operations).padStart(12, "0")}`;

beforeAll(async () => {
  if (
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !["127.0.0.1", "localhost"].includes(FIRESTORE_EMULATOR_TARGET.host)
  )
    throw new Error("Local emulator required");
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp({ projectId }, `s253-one-path-${process.pid}`);
  db = getFirestore(app);
  // The approved originals are read from this emulator database by the application's own reader.
  const publications: ApprovedArtifactContentDeps = {
    readPublication: (id) => getPublicationVersion(id, db),
    readActiveVersionId: async (id) => {
      const value = (
        await db.collection(PUBLICATION_COLLECTIONS.resources).doc(id).get()
      ).data()?.activeVersionId;
      return typeof value === "string" ? value : null;
    },
    readContent: (reference) => new FirestorePublicationContentStore(db).read(reference),
  };
  deps = {
    ...derivedArtifactDeps(db),
    original: (actor, input) =>
      resolveApprovedDotloopArtifact(actor, input, publications),
    historicalOriginal: (actor, input) =>
      readHistoricalApprovedArtifact(actor, input, publications),
  };
});
beforeEach(async () => {
  vi.stubEnv("ENVIRONMENT_KIND", "demo");
  vi.stubEnv("DATA_CONTEXT", "demo");
  await testEnv.clearFirestore();
  leaseViews.current = [];
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

/** Seed the forms and leases, and let the property system stand-in answer with those leases. */
async function seed(leases: OnePathLease[], differingPetAgreement = false) {
  leaseViews.current = leases.map((lease) => ({
    leaseID: Number(lease.leaseId),
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  }));
  return seedOnePathForms(db, { leases, differingPetAgreement });
}

/** The seed header's two Admin steps, through the stores the Admin controls call. */
async function adminFinishesSetup(feeCents: number | null = 5_000) {
  await setFamilyUse(
    admin,
    {
      kind: "brokerage_disclosure",
      use: "mandatory",
      expectedVersion: 0,
      operationId: nextOperation(),
    },
    db,
  );
  if (feeCents !== null)
    await publishChargePolicy(
      admin,
      {
        content: {
          residentBenefitPackage: null,
          insuranceProgram: null,
          animals: null,
          petProcessingFee: { amountCents: feeCents, unit: null, source: FEE_SOURCE },
        },
        effectiveFrom: "2026-11-01",
        expectedVersion: 0,
        operationId: nextOperation(),
      },
      db,
    );
}

/** The approved catalog the application wrote when the Admin recorded the family use. */
async function catalog(): Promise<LeaseArtifactCatalog> {
  const record = ApprovedLeaseCatalogSchema.parse(
    (await db.collection(PACKET_SOURCE_COLLECTIONS.catalog).doc("current").get()).data(),
  );
  return record.catalog as LeaseArtifactCatalog;
}

async function staffRecordDeposit(leaseId: string, amountCents: number) {
  const current = (await getPacketInputs(editor, leaseId, db))!;
  return savePacketInputs(
    editor,
    {
      leaseId,
      operationId: nextOperation(),
      animals: {
        expectedRevision: current.animals.revision,
        entries: current.animals.entries.map((animal, index) =>
          index === 0
            ? { ...animal, deposit: { amountCents, source: DEPOSIT_SOURCE } }
            : animal,
        ),
      },
    },
    db,
  );
}

async function staffWriteExplanation(leaseId: string, text: string) {
  // The lease's work record gives the explanation the cycle it is written for.
  await ensureRenewalWorkRecord(editor, leaseId, db);
  const current = await getPacketInputs(editor, leaseId, db);
  return savePacketInputs(
    editor,
    {
      leaseId,
      operationId: nextOperation(),
      ownerExplanation: {
        expectedRevision: current?.ownerExplanation?.revision ?? 0,
        text,
      },
    },
    db,
  );
}

/** "Evaluate packet" and "Check the owner acknowledgment": both packets saved as current. */
async function evaluateBoth(leaseId: string) {
  const at = new Date().toISOString();
  const resolved = await resolveLivePacketInput(editor, leaseId, leaseId, at, db);
  const tenant = await savePacketSnapshot(
    editor,
    {
      evaluation: evaluateRenewalPacket(resolved.input),
      expectedCurrentSnapshotId: null,
    },
    db,
  );
  const owner = await savePacketSnapshot(
    editor,
    {
      evaluation: evaluateRenewalPacket(
        await resolveOwnerAcknowledgmentInput(resolved, at, db),
      ),
      expectedCurrentSnapshotId: null,
    },
    db,
  );
  return { resolved, tenant, owner };
}

async function requestFor(leaseId: string, snapshotId: string, kind: OnePathFormKind) {
  const artifact = (await catalog()).artifacts.find((entry) => entry.kind === kind)!;
  return { leaseId, snapshotId, artifactId: artifact.artifactId };
}

async function prepare(leaseId: string, snapshotId: string, kind: OnePathFormKind) {
  const request = await requestFor(leaseId, snapshotId, kind);
  const record = await prepareDerivedArtifact(
    editor,
    {
      ...request,
      action: "prepare",
      operationId: nextOperation(),
      expectedCurrentId: null,
    },
    db,
    deps,
  );
  const { content } = await readDerivedArtifactContent(
    editor,
    { ...request, derivedId: record.id },
    db,
    deps,
  );
  return {
    record,
    content,
    lines: (await readStaticPdfLines(content)).map((line) => line.text),
  };
}

const touching = (
  run: { x: number; y: number; width: number; height: number },
  area: { x: number; y: number; width: number; height: number },
) =>
  run.x < area.x + area.width &&
  area.x < run.x + run.width &&
  run.y < area.y + area.height &&
  area.y < run.y + run.height;

describe("S253 the rehearsal seed against the emulator and the real stores", () => {
  it("prepares the pet agreement, the owner acknowledgment and the brochure after the Admin and staff steps", async () => {
    const { forms } = await seed([{ leaseId: "701", tenants: 2, animals: "one_pet" }]);

    // The seed publishes no fee, saves no starting text and records no deposit or explanation.
    expect(await readChargePolicy(db)).toEqual({ readable: true, record: null });
    for (const name of Object.values(CHARGE_POLICY_COLLECTIONS))
      expect((await db.collection(name).get()).size).toBe(0);
    expect(await readOwnerExplanationStartingText(db)).toMatchObject({
      readable: true,
      revision: 0,
      text: "",
    });
    const seeded = (await getPacketInputs(editor, "701", db))!;
    expect(seeded.animals.entries.map((animal) => animal.deposit)).toEqual([undefined]);
    expect(seeded.ownerExplanation).toBeUndefined();

    // Admin step 1 alone: the catalog is the application's own, and nothing is priced yet.
    await adminFinishesSetup(null);
    expect(
      (await catalog()).artifacts.map((artifact) => [artifact.kind, artifact.status]),
    ).toEqual(
      expect.arrayContaining([
        ["animal_agreement", "active"],
        ["owner_acknowledgment", "active"],
        ["brokerage_disclosure", "active"],
        ["renewal_extension", "active"],
      ]),
    );
    const unpriced = await resolveLivePacketInput(
      editor,
      "701",
      "701",
      new Date().toISOString(),
      db,
    );
    expect(unpriced.calculated!.petAgreement).toMatchObject({
      feeCents: null,
      depositCents: null,
      totalCents: null,
    });

    // Admin step 2 and the two staff saves.
    await publishChargePolicy(
      admin,
      {
        content: {
          residentBenefitPackage: null,
          insuranceProgram: null,
          animals: null,
          petProcessingFee: { amountCents: 5_000, unit: null, source: FEE_SOURCE },
        },
        effectiveFrom: "2026-11-01",
        expectedVersion: 0,
        operationId: nextOperation(),
      },
      db,
    );
    const deposit = await staffRecordDeposit("701", 30_000);
    expect(deposit.record!.animals.entries[0].deposit).toMatchObject({
      amountCents: 30_000,
      source: DEPOSIT_SOURCE,
      recordedByUid: editor.uid,
    });
    const explanation = await staffWriteExplanation("701", `${FIRST}\n\n${SECOND}`);
    expect(explanation.record!.ownerExplanation).toMatchObject({
      text: `${FIRST}\n\n${SECOND}`,
      recordedByUid: editor.uid,
    });
    expect(explanation.record!.ownerExplanation!.cycleId).toMatch(/^[0-9a-f-]{36}$/);

    // L63: the lease shows the fee, the deposit and their exact sum before anything is prepared.
    const { resolved, tenant, owner } = await evaluateBoth("701");
    expect(resolved.calculated!.petAgreement).toMatchObject({
      feeCents: 5_000,
      ordinaryPets: 1,
      depositCents: 30_000,
      totalCents: 35_000,
      needs: [],
    });
    expect(tenant).toMatchObject({ state: "Ready for preview", blockers: [] });
    expect(tenant.manifest!.formHolds).toBeUndefined();
    expect(owner).toMatchObject({
      transactionId: ownerAcknowledgmentTransactionId("701"),
      packetContext: "owner_acknowledgment",
      state: "Needs input",
    });
    expect(owner.blockers.map((blocker) => blocker.code)).toEqual([
      "owner_ack_proof_unavailable",
    ]);
    expect(owner.manifest!.formHolds).toBeUndefined();

    // L63, L64: the prepared pet agreement states the published fee, the deposit and the total.
    const pet = await prepare("701", tenant.snapshotId, "animal_agreement");
    expect(pet.lines).toContain(
      "The tenant pays a non-refundable pet processing fee of $50.00 at signing,",
    );
    expect(pet.lines).toContain(
      "plus a refundable deposit of $300.00 for a total of $350.00",
    );
    expect(pet.lines.join("\n")).not.toContain(ONE_PATH_OLD_FEE_TEXT);
    expect(
      await objectsHolding(forms.animal_agreement.bytes, [ONE_PATH_OLD_FEE_TEXT]),
    ).not.toEqual([]);
    expect(await objectsHolding(pet.content, [ONE_PATH_OLD_FEE_TEXT])).toEqual([]);
    expect(pet.lines.join("\n")).toContain(ONE_PATH_ORGANIZATIONS.animal_agreement);

    // L66, L67, L69: the owner acknowledgment carries the two paragraphs, leaves the execution
    // date blank and still prints its own organization name.
    const acknowledgment = await prepare("701", owner.snapshotId, "owner_acknowledgment");
    const runs = await readStaticPageRuns(acknowledgment.content, 0);
    const drawn = runs
      .filter((run) => run.fillRegion !== null)
      .map((run) => run.text.trim());
    expect(drawn).toEqual(expect.arrayContaining([FIRST, SECOND]));
    expect(
      runs.filter((run) => touching(run, ONE_PATH_EXECUTION_DATE_AREA.rect)),
    ).toEqual([]);
    const text = acknowledgment.lines.join("\n");
    expect(text).toContain("Lease executed on:");
    expect(text).toContain(ONE_PATH_ORGANIZATIONS.owner_acknowledgment);
    expect(text).not.toContain(ONE_PATH_ORGANIZATIONS.brokerage_disclosure);
    expect(
      await readDerivedArtifactStatus(
        editor,
        await requestFor("701", owner.snapshotId, "owner_acknowledgment"),
        db,
        deps,
      ),
    ).toMatchObject({
      supported: true,
      notes: [
        "Lease executed on is left blank until the business confirms which date belongs there",
      ],
      printed: [`Page 1, Organization: ${ONE_PATH_ORGANIZATIONS.owner_acknowledgment}`],
    });

    // L68: the brochure is used exactly as approved and its notes name the four boxes.
    const brochure = await readDerivedArtifactStatus(
      editor,
      await requestFor("701", tenant.snapshotId, "brokerage_disclosure"),
      db,
      deps,
    );
    expect(brochure).toMatchObject({
      supported: false,
      unchangedAttachment: true,
      record: null,
      notes: [
        "Tenant initials: four boxes",
        "Agency selections are left for the signer until they are confirmed for the case",
      ],
      printed: [`Page 1, Organization: ${ONE_PATH_ORGANIZATIONS.brokerage_disclosure}`],
      originalHref:
        "/api/lease-renewal/document-artifact?leaseId=701&documentRef=one-path-brokerage_disclosure",
    });
    expect(brochure).not.toHaveProperty("questions");
    const approved = await deps.original(editor, {
      catalog: await catalog(),
      documentRef: forms.brokerage_disclosure.documentRef,
      expectedContentHash: forms.brokerage_disclosure.contentHash,
    });
    expect(
      Buffer.from(approved.content).equals(Buffer.from(forms.brokerage_disclosure.bytes)),
    ).toBe(true);
  });

  it("refuses the pet agreement made to differ, naming the fee its text states", async () => {
    await seed([{ leaseId: "701", animals: "one_pet" }], true);
    await adminFinishesSetup();
    await staffRecordDeposit("701", 30_000);
    const { tenant } = await evaluateBoth("701");
    expect(tenant).toMatchObject({ state: "Ready for preview", blockers: [] });
    await expect(
      prepareDerivedArtifact(
        editor,
        {
          ...(await requestFor("701", tenant.snapshotId, "animal_agreement")),
          action: "prepare",
          operationId: nextOperation(),
          expectedCurrentId: null,
        },
        db,
        deps,
      ),
    ).rejects.toThrow(
      /Page 2 of this form states a processing fee of \$150\.00 in its text, and the published fee is \$50\.00\./,
    );
    // Nothing is kept for the refused file, and the lease's other forms are prepared as usual.
    expect((await db.collection(DERIVED_ARTIFACT_COLLECTIONS.records).get()).size).toBe(
      0,
    );
    const extension = await prepare("701", tenant.snapshotId, "renewal_extension");
    expect(extension.record.comparison.verified).toBe(true);
    expect((await db.collection(DERIVED_ARTIFACT_COLLECTIONS.records).get()).size).toBe(
      1,
    );
  });

  it("holds only the form that waits, asks the five-tenant question and carries nothing between leases", async () => {
    await seed([
      { leaseId: "701", animals: "one_pet" },
      { leaseId: "702", tenants: 5 },
      { leaseId: "703", animals: "one_pet" },
    ]);
    await adminFinishesSetup();
    await staffRecordDeposit("701", 30_000);
    await staffWriteExplanation("701", `${FIRST}\n\n${SECOND}`);

    // L70: what staff recorded on lease 701 appears on no other lease or setting.
    const other = (await getPacketInputs(editor, "703", db))!;
    expect(other.animals.entries.map((animal) => animal.deposit)).toEqual([undefined]);
    expect(other.ownerExplanation).toBeUndefined();
    expect((await readChargePolicy(db)).record!.content).toEqual({
      residentBenefitPackage: null,
      insuranceProgram: null,
      animals: null,
      petProcessingFee: { amountCents: 5_000, unit: null, source: FEE_SOURCE },
    });
    expect(await readOwnerExplanationStartingText(db)).toMatchObject({
      revision: 0,
      text: "",
    });

    // L65, L66: lease 703 names what it needs, makes no total and holds each waiting form alone.
    const waiting = await evaluateBoth("703");
    expect(waiting.resolved.calculated!.petAgreement).toMatchObject({
      feeCents: 5_000,
      depositCents: null,
      totalCents: null,
      needs: [NEEDS_DEPOSIT],
    });
    expect(waiting.tenant).toMatchObject({ state: "Ready for preview", blockers: [] });
    expect([
      ...new Set(waiting.tenant.manifest!.formHolds!.map((hold) => hold.artifactKind)),
    ]).toEqual(["animal_agreement"]);
    await expect(
      prepareDerivedArtifact(
        editor,
        {
          ...(await requestFor("703", waiting.tenant.snapshotId, "animal_agreement")),
          action: "prepare",
          operationId: nextOperation(),
          expectedCurrentId: null,
        },
        db,
        deps,
      ),
    ).rejects.toThrow(
      `Approved animal agreement waits: ${NEEDS_DEPOSIT} The lease's other forms can be prepared.`,
    );
    await expect(
      prepareDerivedArtifact(
        editor,
        {
          ...(await requestFor("703", waiting.owner.snapshotId, "owner_acknowledgment")),
          action: "prepare",
          operationId: nextOperation(),
          expectedCurrentId: null,
        },
        db,
        deps,
      ),
    ).rejects.toThrow(
      "Approved owner acknowledgment waits: Needs the explanation for this lease. The lease's other forms can be prepared.",
    );
    const extension = await prepare(
      "703",
      waiting.tenant.snapshotId,
      "renewal_extension",
    );
    expect(extension.record.comparison.verified).toBe(true);
    expect(extension.lines.join("\n")).toContain("Example Tenant 1");

    // L68: a five-tenant lease shows the question, and its packet goes on.
    const five = await evaluateBoth("702");
    expect(five.tenant).toMatchObject({ state: "Ready for preview", blockers: [] });
    expect(
      await readDerivedArtifactStatus(
        editor,
        await requestFor("702", five.tenant.snapshotId, "brokerage_disclosure"),
        db,
        deps,
      ),
    ).toMatchObject({
      unchangedAttachment: true,
      notes: expect.arrayContaining(["Tenant initials: four boxes"]),
      questions: ["More than four tenants: confirm how initials are collected"],
    });
  });
});
