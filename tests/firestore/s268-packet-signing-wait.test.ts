import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { ARTIFACT_INTAKE_COLLECTION } from "@/lib/firestore/lease-artifact-intake";
import {
  LEASE_DOCUMENT_PACKET_COLLECTIONS,
  packetHeadId,
} from "@/lib/firestore/lease-document-packet-snapshots";
import { savePacketInputs } from "@/lib/firestore/lease-packet-inputs";
import { startRenewalCycle } from "@/lib/firestore/renewal-workspace";
import { ArtifactIntakeEntrySchema } from "@/lib/lease-documents/artifact-intake-contract";
import {
  DERIVED_ARTIFACT_COLLECTIONS,
  derivedHeadId,
} from "@/lib/lease-documents/derived-artifact-contract";
import { projectPacketLead } from "@/lib/lease-documents/lease-packet-readiness";
import {
  recordReturnedStateChange,
  resolveReturnedState,
} from "@/lib/lease-documents/returned-state-service";
import { STAFF_ATTESTATION_LABEL } from "@/lib/lease-documents/returned-state";

// S268 R-S268-3 / AC-S268-3 on the emulator: a prepared file is not signed returned evidence.
// Documents and signatures leads with the actual signing wait only after staff record the packet
// as sent, names who still must sign from the staff records, and stops waiting only when every
// required signer is recorded. Synthetic people, map and records on the local emulator only.

const projectId = "pmi-kc-kb-s268-signing-wait";
const editor: AuthenticatedUser = {
  uid: "s268-editor",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const OP = (n: number) =>
  `5b8d2e3f-6c5a-4d7e-9fa0-0000000268${String(n).padStart(2, "0")}`;
const SAM = "00000000-0000-4000-8000-000000000261";
const AVERY = "00000000-0000-4000-8000-000000000262";
const ORIGINAL = "a".repeat(64);
const FILLED = "b".repeat(64);
const LEASE = "4868";
const SNAPSHOT = "packet_s268_a";
const basis = {
  kind: "lease_end" as const,
  dateIso: "2026-12-31",
  source: "RentVine lease end",
};

let app: App;
let db: Firestore;
let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s268-signing-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => env.clearFirestore());
afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await env.cleanup();
});

function person(
  personId: string,
  fullName: string,
  signerRole: "tenant" | "owner",
  dotloopRole: "TENANT" | "LANDLORD",
) {
  return {
    personId,
    kind: "person" as const,
    fullName,
    email: null,
    emailBasis: null,
    contactRef: null,
    roles: [{ signerRole, order: 1, dotloopRole }],
  };
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
          person(SAM, "Sam Example", "tenant", "TENANT"),
          person(AVERY, "Avery Owner", "owner", "LANDLORD"),
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
      reference: "publication:synthetic-extension-268",
      contentHash: ORIGINAL,
    },
    fieldMap: {
      schemaVersion: "artifact-field-map/v1",
      artifactKind: "renewal_extension",
      mapVersion: "renewal_extension-synthetic-268",
      templateVersion: "publication:synthetic-extension-268",
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
    updated_at: "2026-11-09T15:00:00.000Z",
  });
  const stored: Record<string, unknown> = { ...entry };
  delete stored.id;
  await db.collection(ARTIFACT_INTAKE_COLLECTION).doc("renewal_extension").set(stored);
  await db
    .collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.snapshots)
    .doc(SNAPSHOT)
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
            artifactId: "synthetic-extension",
            kind: "renewal_extension",
            label: "Renewal extension",
            contentHash: ORIGINAL,
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
      sourceVersions: [],
      payloadHash: "f".repeat(64),
      snapshot_id: SNAPSHOT,
      snapshot_version: 1,
      actor_uid: editor.uid,
      created_at: "2026-11-09T15:00:00.000Z",
    });
  await db
    .collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.heads)
    .doc(packetHeadId(LEASE, LEASE))
    .set({
      lease_id: LEASE,
      transaction_id: LEASE,
      snapshot_id: SNAPSHOT,
      snapshot_version: 1,
      payload_hash: "f".repeat(64),
    });
  // The approved filled copy of this snapshot's extension: a prepared file, not a signature.
  await db
    .collection(DERIVED_ARTIFACT_COLLECTIONS.heads)
    .doc(derivedHeadId(SNAPSHOT, "synthetic-extension"))
    .set({ id: `derived-${SNAPSHOT}` });
  await db
    .collection(DERIVED_ARTIFACT_COLLECTIONS.records)
    .doc(`derived-${SNAPSHOT}`)
    .set({
      snapshotId: SNAPSHOT,
      artifactId: "synthetic-extension",
      outputHash: FILLED,
      approval: { outputHash: FILLED, actorUid: editor.uid },
    });
}

async function change(n: number, body: Record<string, unknown>) {
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
    } as never,
    db,
  );
}
const signed = (personId: string, signerRole: "tenant" | "owner", at: string) => ({
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
const lead = (view: Awaited<ReturnType<typeof resolveReturnedState>>["view"]) =>
  projectPacketLead({ rows: [], context: null, returned: view });

describe("S268 signing wait and returned evidence on the emulator", () => {
  it("AC-S268-3: keeps a prepared file apart from signed evidence and leads with the actual wait", async () => {
    await seed();
    const prepared = (await resolveReturnedState(editor, LEASE, db)).view;
    expect(prepared.documents[0]).toMatchObject({ state: "Prepared", attestation: null });
    expect(prepared.signaturesComplete).toBe(false);
    expect(lead(prepared).kind).not.toBe("signing_wait");

    const sent = await change(10, {
      kind: "sent_for_signature",
      at: "2026-11-10T15:00:00.000Z",
      how: "Dotloop, by staff",
    });
    expect(sent.view.documents[0]).toMatchObject({
      state: "Sent for signature",
      attestation: STAFF_ATTESTATION_LABEL,
    });
    expect(lead(sent.view)).toEqual({
      kind: "signing_wait",
      awaiting: ["Sam Example, tenant", "Avery Owner, owner"],
    });

    const partial = await change(11, signed(SAM, "tenant", "2026-11-10T16:00:00.000Z"));
    expect(partial.view.documents[0].state).toBe("Partially signed");
    expect(lead(partial.view)).toEqual({
      kind: "signing_wait",
      awaiting: ["Avery Owner, owner"],
    });

    const done = await change(12, signed(AVERY, "owner", "2026-11-10T16:30:00.000Z"));
    expect(done.view).toMatchObject({
      overall: "Fully executed",
      signaturesComplete: true,
    });
    expect(done.view.documents[0].attestation).toBe(STAFF_ATTESTATION_LABEL);
    expect(lead(done.view).kind).not.toBe("signing_wait");
  });
});
