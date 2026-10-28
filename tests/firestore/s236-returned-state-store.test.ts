import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import { ARTIFACT_INTAKE_COLLECTION } from "@/lib/firestore/lease-artifact-intake";
import { LEASE_DOCUMENT_PACKET_COLLECTIONS } from "@/lib/firestore/lease-document-packet-snapshots";
import { packetHeadId } from "@/lib/firestore/lease-document-packet-snapshots";
import {
  RETURNED_STATE_COLLECTIONS,
  RETURNED_STATE_HISTORY_LIMIT,
  listReturnedStateRecords,
  readReturnedStateInspected,
  recordReturnedState,
} from "@/lib/firestore/lease-document-returned-states";
import { readArtifactIntakeManifest } from "@/lib/firestore/lease-artifact-intake";
import { savePacketInputs } from "@/lib/firestore/lease-packet-inputs";
import { startRenewalCycle } from "@/lib/firestore/renewal-workspace";
import { ArtifactIntakeEntrySchema } from "@/lib/lease-documents/artifact-intake-contract";
import {
  DERIVED_ARTIFACT_COLLECTIONS,
  derivedHeadId,
} from "@/lib/lease-documents/derived-artifact-contract";
import {
  WITHOUT_SIGNER_DETAIL_LABEL,
  assertSignaturesCompletable,
  recordReturnedStateChange,
  resolveReturnedState,
} from "@/lib/lease-documents/returned-state-service";
import { saveRenewalWorkspace } from "@/lib/firestore/renewal-workspace";
import { STAFF_ATTESTATION_LABEL } from "@/lib/lease-documents/returned-state";

// S236 ARCH-S236-1 / R-S236-2 / R-S236-4 (AC-S236-2, AC-S236-3): staff-attested returned-state
// records bind to the lease's current cycle, current packet snapshot and that document's current
// version, carry actor and time, replay idempotently and refuse every wrong lease, cycle, packet,
// version, party or stale revision. Synthetic people, maps and records on the local emulator only.

const projectId = "pmi-kc-kb-s236-returned-state-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
// A verification account keeps its displayed role but never writes a staff record.
const verification: AuthenticatedUser = {
  ...editor,
  uid: "canary-editor",
  email: "canary-editor@pmikcmetro.com",
};
const OP = (n: number) =>
  `3a7c1d2e-5b4f-4c6d-8e9f-0000000002${String(n).padStart(2, "0")}`;
const SAM = "00000000-0000-4000-8000-000000000001";
const RILEY = "00000000-0000-4000-8000-000000000002";
const AVERY = "00000000-0000-4000-8000-000000000003";
const ORIGINAL = "a".repeat(64);
const FILLED = "b".repeat(64);
const LEASE = "4821";
const basis = {
  kind: "lease_end" as const,
  dateIso: "2026-12-31",
  source: "RentVine lease end",
};

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s236-returned-state-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await testEnv.cleanup();
});

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as EditableLayerError;
  }
  throw new Error("Expected a refusal.");
}

async function seedPacket(snapshotId: string, artifactHash = ORIGINAL) {
  await db
    .collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.snapshots)
    .doc(snapshotId)
    .set({
      leaseId: LEASE,
      transactionId: LEASE,
      packetContext: "renewal_extension",
      classificationEvidence: {},
      state: "Ready for preview",
      manifest: {
        packetContext: "renewal_extension",
        audience: "tenant",
        includedArtifacts: [
          {
            artifactId: "fixture-extension",
            kind: "renewal_extension",
            label: "Renewal extension",
            contentHash: artifactHash,
            audience: "tenant",
            ruleResult: "Included",
            reason: "Synthetic packet",
          },
        ],
        excludedArtifacts: [],
        fields: [],
        participants: [],
        charges: [],
        animals: [],
      },
      blockers: [],
      catalogVersion: "synthetic-catalog",
      ruleVersion: "synthetic-rules",
      sourceVersions: {},
      payloadHash: "f".repeat(64),
      snapshot_id: snapshotId,
      snapshot_version: 1,
      actor_uid: "editor-1",
      created_at: "2026-11-01T15:00:00.000Z",
    });
  await db
    .collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.heads)
    .doc(packetHeadId(LEASE, LEASE))
    .set({
      lease_id: LEASE,
      transaction_id: LEASE,
      snapshot_id: snapshotId,
      snapshot_version: 1,
      payload_hash: "f".repeat(64),
    });
  // The approved filled copy of this snapshot's extension is the version that goes out.
  await db
    .collection(DERIVED_ARTIFACT_COLLECTIONS.heads)
    .doc(derivedHeadId(snapshotId, "fixture-extension"))
    .set({ id: `derived-${snapshotId}` });
  await db
    .collection(DERIVED_ARTIFACT_COLLECTIONS.records)
    .doc(`derived-${snapshotId}`)
    .set({
      snapshotId,
      artifactId: "fixture-extension",
      outputHash: FILLED,
      approval: { outputHash: FILLED, actorUid: "editor-1" },
    });
}

async function seed() {
  await startRenewalCycle(
    editor,
    {
      leaseId: LEASE,
      expectedCycleId: null,
      expectedRevision: 0,
      operationId: OP(1),
      basis,
      reason: "Synthetic renewal cycle.",
    },
    basis,
    db,
  );
  await savePacketInputs(
    editor,
    {
      leaseId: LEASE,
      operationId: OP(2),
      people: {
        expectedRevision: 0,
        entries: [
          person(SAM, "Sam Example", "tenant", 1, "TENANT"),
          person(RILEY, "Riley Example", "tenant", 2, "TENANT"),
          person(AVERY, "Avery Owner", "owner", 1, "LANDLORD"),
        ],
      },
    },
    db,
  );
  const entry = ArtifactIntakeEntrySchema.parse({
    id: "renewal_extension",
    kind: "renewal_extension",
    state: "approved",
    revision: 1,
    publication: {
      system: "s21_publication",
      reference: "publication:fixture-extension-1",
      contentHash: ORIGINAL,
    },
    fieldMap: {
      schemaVersion: "artifact-field-map/v1",
      artifactKind: "renewal_extension",
      mapVersion: "renewal_extension-synthetic-v1",
      templateVersion: "publication:fixture-extension-1",
      formFamily: "synthetic-family",
      formFamilyExtensionCompatible: true,
      audience: "tenant",
      allowedPacketContexts: ["renewal_extension"],
      fields: [
        {
          fieldId: "Rent",
          factKey: "renewal.approved_rent",
          meaning: "Approved monthly rent",
          required: true,
          multiplicity: "single",
          allowedSourceSystems: ["staff_recorded_owner_approval"],
        },
      ],
      signers: [
        {
          signerRole: "tenant",
          participantKind: "tenant",
          required: true,
          location: "Tenant signature",
        },
        {
          signerRole: "owner",
          participantKind: "owner",
          required: true,
          location: "Owner signature",
        },
      ],
      reviewNote: "SYNTHETIC review",
    },
    updated_at: "2026-10-30T15:00:00.000Z",
  });
  // The stored document carries no id field; the reader adds it from the document id.
  const stored: Record<string, unknown> = { ...entry };
  delete stored.id;
  await db.collection(ARTIFACT_INTAKE_COLLECTION).doc("renewal_extension").set(stored);
  await seedPacket("packet_s236_a");
}

function person(
  personId: string,
  fullName: string,
  signerRole: "tenant" | "owner",
  order: number,
  dotloopRole: "TENANT" | "LANDLORD",
) {
  return {
    personId,
    kind: "person" as const,
    fullName,
    email: null,
    emailBasis: null,
    contactRef: null,
    roles: [{ signerRole, order, dotloopRole }],
  };
}

const observed = (personId: string, signerRole: "tenant" | "owner", at: string) => ({
  kind: "signer" as const,
  signerRole,
  personId,
  status: "signed" as const,
  observedAt: at,
  evidence: {
    kind: "dotloop_observed" as const,
    documentName: "Renewal extension",
    viewedAt: at,
  },
});

async function change(
  n: number,
  body: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  const { view } = await resolveReturnedState(editor, LEASE, db);
  const document = view.documents[0];
  return recordReturnedStateChange(
    editor,
    {
      leaseId: LEASE,
      cycleId: view.cycleId!,
      snapshotId: view.snapshotId!,
      kind: document.kind,
      documentContentHash: document.contentHash,
      expectedRevision: document.revision,
      operationId: OP(n),
      change: body,
      ...overrides,
    } as never,
    db,
  );
}

describe("S236 returned-state records on the emulator", () => {
  it("binds to the current version, names who still must sign and audits every change", async () => {
    await seed();
    const before = (await resolveReturnedState(editor, LEASE, db)).view;
    expect(before).toMatchObject({
      cycleId: OP(1),
      snapshotId: "packet_s236_a",
      unavailable: null,
    });
    expect(before.documents[0]).toMatchObject({
      kind: "renewal_extension",
      label: "the renewal extension",
      contentHash: FILLED,
      versionLabel: "Approved filled copy",
      state: "Prepared",
      attestation: null,
      revision: 0,
    });

    const sent = await change(10, {
      kind: "sent_for_signature",
      at: "2026-11-02T15:00:00.000Z",
      how: "Dotloop, by staff",
    });
    expect(sent.view.documents[0]).toMatchObject({
      state: "Sent for signature",
      attestation: STAFF_ATTESTATION_LABEL,
      revision: 1,
    });

    const partial = await change(11, observed(SAM, "tenant", "2026-11-02T16:00:00.000Z"));
    expect(partial.view.documents[0].state).toBe("Partially signed");
    expect(partial.view.documents[0].stillMustSign).toEqual([
      {
        name: "Riley Example",
        capacity: "tenant",
        nextAction: "Ask Riley Example to sign the renewal extension in Dotloop",
      },
      {
        name: "Avery Owner",
        capacity: "owner",
        nextAction: "Ask Avery Owner to sign the renewal extension in Dotloop",
      },
    ]);
    const activity = await db.collection(RETURNED_STATE_COLLECTIONS.activity).get();
    expect(activity.size).toBe(2);
    for (const doc of activity.docs)
      expect(doc.data()).toMatchObject({
        lease_id: LEASE,
        cycle_id: OP(1),
        snapshot_id: "packet_s236_a",
        kind: "renewal_extension",
        document_content_hash: FILLED,
        actor_uid: "editor-1",
        recorded_at: expect.any(String),
      });
    const [record] = await listReturnedStateRecords(editor, LEASE, OP(1), db);
    expect(record).toMatchObject({ revision: 2, recordedByUid: "editor-1" });
  });

  it("is Fully executed only with every required signer, and a later decline returns it to Partially signed", async () => {
    await seed();
    await change(20, observed(SAM, "tenant", "2026-11-02T16:00:00.000Z"));
    await change(21, observed(RILEY, "tenant", "2026-11-02T16:05:00.000Z"));
    const done = await change(22, observed(AVERY, "owner", "2026-11-02T16:10:00.000Z"));
    expect(done.view).toMatchObject({
      overall: "Fully executed",
      signaturesComplete: true,
    });
    const voided = await change(23, {
      ...observed(AVERY, "owner", "2026-11-02T17:00:00.000Z"),
      status: "declined_voided",
    });
    expect(voided.view.signaturesComplete).toBe(false);
    expect(voided.view.documents[0].state).toBe("Partially signed");
    expect(voided.view.documents[0].notes).toContain("Avery Owner declined or voided");
  });

  it("refuses another lease, cycle, packet, version or party, a stale revision and a changed replay", async () => {
    await seed();
    const refusals = await Promise.all([
      rejection(
        change(30, observed(SAM, "tenant", "2026-11-02T16:00:00.000Z"), {
          leaseId: "5001",
        }),
      ),
      rejection(
        change(31, observed(SAM, "tenant", "2026-11-02T16:00:00.000Z"), {
          cycleId: "00000000-0000-4000-8000-0000000000ff",
        }),
      ),
      rejection(
        change(32, observed(SAM, "tenant", "2026-11-02T16:00:00.000Z"), {
          snapshotId: "packet_other",
        }),
      ),
      rejection(
        change(33, observed(SAM, "tenant", "2026-11-02T16:00:00.000Z"), {
          documentContentHash: ORIGINAL,
        }),
      ),
      rejection(change(34, observed(SAM, "owner", "2026-11-02T16:00:00.000Z"))),
      rejection(
        change(35, observed(SAM, "tenant", "2026-11-02T16:00:00.000Z"), {
          expectedRevision: 3,
        }),
      ),
    ]);
    expect(refusals.map((error) => error.status)).toEqual([409, 409, 409, 409, 409, 409]);
    expect(refusals.map((error) => error.message)).toEqual([
      expect.stringMatching(/another lease|not this lease's current cycle/),
      expect.stringMatching(/not this lease's current cycle/),
      expect.stringMatching(/not this lease's current packet/),
      expect.stringMatching(/version is no longer current/),
      expect.stringMatching(/not recorded in that signing role/),
      expect.stringMatching(/Your entry is kept; reload and review/),
    ]);
    expect((await db.collection(RETURNED_STATE_COLLECTIONS.records).get()).size).toBe(0);

    const first = await change(36, observed(SAM, "tenant", "2026-11-02T16:00:00.000Z"));
    expect(first.duplicate).toBe(false);
    // The same operation replayed with the revision it first read returns the stored result.
    const replay = await recordReturnedStateChange(
      editor,
      {
        leaseId: LEASE,
        cycleId: OP(1),
        snapshotId: "packet_s236_a",
        kind: "renewal_extension",
        documentContentHash: FILLED,
        expectedRevision: 0,
        operationId: OP(36),
        change: observed(SAM, "tenant", "2026-11-02T16:00:00.000Z"),
      },
      db,
    );
    expect(replay.duplicate).toBe(true);
    expect(replay.view.documents[0].revision).toBe(1);
    const changed = await rejection(
      recordReturnedStateChange(
        editor,
        {
          leaseId: LEASE,
          cycleId: OP(1),
          snapshotId: "packet_s236_a",
          kind: "renewal_extension",
          documentContentHash: FILLED,
          expectedRevision: 0,
          operationId: OP(36),
          change: observed(RILEY, "tenant", "2026-11-02T16:00:00.000Z"),
        },
        db,
      ),
    );
    expect(changed.message).toMatch(/This saved request changed/);
    const verificationRefusal = await rejection(
      recordReturnedStateChange(
        verification,
        {
          leaseId: LEASE,
          cycleId: OP(1),
          snapshotId: "packet_s236_a",
          kind: "renewal_extension",
          documentContentHash: FILLED,
          expectedRevision: 1,
          operationId: OP(37),
          change: observed(RILEY, "tenant", "2026-11-02T16:00:00.000Z"),
        },
        db,
      ),
    );
    expect(verificationRefusal.status).toBe(403);
  });

  it("refuses inside the transaction when the cycle restarted after the page read", async () => {
    await seed();
    const { context } = await resolveReturnedState(editor, LEASE, db);
    await startRenewalCycle(
      editor,
      {
        leaseId: LEASE,
        expectedCycleId: OP(1),
        expectedRevision: 0,
        operationId: OP(40),
        basis: { ...basis, dateIso: "2027-12-31" },
        reason: "Staff explicitly started the next reviewed renewal cycle",
      },
      { ...basis, dateIso: "2027-12-31" },
      db,
    );
    const refused = await rejection(
      recordReturnedState(
        editor,
        {
          leaseId: LEASE,
          cycleId: OP(1),
          snapshotId: "packet_s236_a",
          kind: "renewal_extension",
          documentContentHash: FILLED,
          expectedRevision: 0,
          operationId: OP(41),
          change: observed(SAM, "tenant", "2026-11-02T16:00:00.000Z"),
        },
        context,
        db,
      ),
    );
    expect(refused.message).toMatch(/renewal cycle changed/);
    expect((await db.collection(RETURNED_STATE_COLLECTIONS.records).get()).size).toBe(0);
  });

  it("shows an earlier packet's signatures as an earlier version that never counts", async () => {
    await seed();
    await change(50, observed(SAM, "tenant", "2026-11-02T16:00:00.000Z"));
    await change(51, observed(RILEY, "tenant", "2026-11-02T16:05:00.000Z"));
    await change(52, observed(AVERY, "owner", "2026-11-02T16:10:00.000Z"));
    // A re-evaluated packet (for example after a terms change) is a new snapshot.
    await seedPacket("packet_s236_b");
    const { view } = await resolveReturnedState(editor, LEASE, db);
    expect(view.snapshotId).toBe("packet_s236_b");
    expect(view.documents[0].state).toBe("Prepared");
    expect(view.documents[0].notes).toContain("Signed an earlier version, not current");
    expect(view.signaturesComplete).toBe(false);
  });

  it("refuses a lease cycle with more records than it can show", async () => {
    const batch = db.batch();
    for (let index = 0; index <= RETURNED_STATE_HISTORY_LIMIT; index += 1)
      batch.set(db.collection(RETURNED_STATE_COLLECTIONS.records).doc(`r${index}`), {
        lease_id: LEASE,
        cycle_id: OP(1),
      });
    await batch.commit();
    await expect(listReturnedStateRecords(editor, LEASE, OP(1), db)).rejects.toThrow(
      /more returned-document records than the app can show/,
    );
  });

  it("R-S236-7: the Admin returned-state checkpoint follows records for an approved family", async () => {
    expect(
      await readReturnedStateInspected(await readArtifactIntakeManifest(db), db),
    ).toBe(false);
    await seed();
    const manifest = await readArtifactIntakeManifest(db);
    expect(await readReturnedStateInspected(manifest, db)).toBe(false);
    // A record of a family that is not approved does not satisfy it.
    await db
      .collection(RETURNED_STATE_COLLECTIONS.records)
      .doc("other-family")
      .set({ kind: "lead_disclosure", lease_id: "5001", cycle_id: "other-cycle" });
    expect(await readReturnedStateInspected(manifest, db)).toBe(false);
    await change(70, observed(SAM, "tenant", "2026-11-02T16:00:00.000Z"));
    expect(await readReturnedStateInspected(manifest, db)).toBe(true);
  });

  it("R-S236-6: a fully tracked packet derives Required signatures complete; without one staff record it", async () => {
    await seed();
    expect((await resolveReturnedState(editor, LEASE, db)).view.tracksSignerDetail).toBe(
      true,
    );
    await change(80, observed(SAM, "tenant", "2026-11-02T16:00:00.000Z"));
    const refused = await rejection(assertSignaturesCompletable(editor, LEASE, db));
    expect(refused.status).toBe(409);
    expect(refused.message).toMatch(
      /Riley Example \(the renewal extension\), Avery Owner \(the renewal extension\) still must sign/,
    );
    await change(81, observed(RILEY, "tenant", "2026-11-02T16:05:00.000Z"));
    await change(82, observed(AVERY, "owner", "2026-11-02T16:10:00.000Z"));
    await expect(assertSignaturesCompletable(editor, LEASE, db)).resolves.toBeUndefined();
  });

  it("R-S236-6: without signer detail the staff record completes with its label", async () => {
    await startRenewalCycle(
      editor,
      {
        leaseId: LEASE,
        expectedCycleId: null,
        expectedRevision: 0,
        operationId: OP(90),
        basis,
        reason: "Synthetic renewal cycle.",
      },
      basis,
      db,
    );
    await expect(assertSignaturesCompletable(editor, LEASE, db)).resolves.toBeUndefined();
    await saveRenewalWorkspace(
      editor,
      {
        leaseId: LEASE,
        cycleId: OP(90),
        expectedRevision: 0,
        operationId: OP(91),
        action: {
          kind: "activity",
          activity: "signatures",
          outcome: "done",
          source: "Signed copies in the office file",
        },
      },
      db,
    );
    const { view } = await resolveReturnedState(editor, LEASE, db);
    expect(view.tracksSignerDetail).toBe(false);
    expect(view.manualCompletion).toBe(
      `Required signatures complete: ${WITHOUT_SIGNER_DETAIL_LABEL} (Signed copies in the office file).`,
    );
  });

  it("without a current app packet, says so and records nothing", async () => {
    await startRenewalCycle(
      editor,
      {
        leaseId: LEASE,
        expectedCycleId: null,
        expectedRevision: 0,
        operationId: OP(60),
        basis,
        reason: "Synthetic renewal cycle.",
      },
      basis,
      db,
    );
    const { view } = await resolveReturnedState(editor, LEASE, db);
    expect(view.unavailable).toMatch(/No current app packet exists for this lease/);
    expect(view.documents).toEqual([]);
  });
});
