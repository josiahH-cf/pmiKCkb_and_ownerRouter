import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { SYNTHETIC_APPROVAL, SYNTHETIC_OWNER_ROSTER } from "../helpers/owner-approval";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";

// PR #161 review (discussion_r4402147961): staff record every signature on the current packet, then
// save a Working renewal rent, effective date or end date on its own while the owner response stays
// absent, unchanged or approval-bound. With the packet snapshot and its document version unchanged,
// the earlier signatures immediately stop completing the renewal, the shared service and the mounted
// workspace route refuse Required signatures complete, and every record stays as history. A
// current-base correction, a same-value save and an owner-response re-record change nothing.
// Synthetic people, terms and records on the local emulator only.

const testState = vi.hoisted(() => ({ db: null as Firestore | null }));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => testState.db }));
vi.mock("@/lib/auth/session", async (original) => {
  const actual = await original<typeof import("@/lib/auth/session")>();
  const { can } = await import("@/lib/auth/roles");
  return {
    ...actual,
    requireCapabilityInSpace: async (capability: Parameters<typeof can>[1]) => {
      if (!can("Editor", capability))
        throw new actual.AuthError("This role cannot perform this action.", 403);
      return {
        uid: "editor-1",
        email: "editor1@pmikcmetro.com",
        hd: "pmikcmetro.com",
        role: "Editor" as const,
      };
    },
  };
});

import { POST } from "@/app/api/lease-renewal/workspace/route";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { ARTIFACT_INTAKE_COLLECTION } from "@/lib/firestore/lease-artifact-intake";
import {
  LEASE_DOCUMENT_PACKET_COLLECTIONS,
  packetHeadId,
} from "@/lib/firestore/lease-document-packet-snapshots";
import {
  RETURNED_STATE_COLLECTIONS,
  listReturnedStateRecords,
} from "@/lib/firestore/lease-document-returned-states";
import { savePacketInputs } from "@/lib/firestore/lease-packet-inputs";
import {
  getRenewalWorkingRecord,
  saveRenewalWorkingField,
} from "@/lib/firestore/renewal-working-record";
import {
  getRenewalWorkspace,
  saveRenewalWorkspace,
  startRenewalCycle,
} from "@/lib/firestore/renewal-workspace";
import { ArtifactIntakeEntrySchema } from "@/lib/lease-documents/artifact-intake-contract";
import {
  DERIVED_ARTIFACT_COLLECTIONS,
  derivedHeadId,
} from "@/lib/lease-documents/derived-artifact-contract";
import { currentOwnerApproval } from "@/lib/lease-documents/owner-approval-binding";
import { OLDER_TERMS_NOTE } from "@/lib/lease-documents/returned-state";
import {
  assertSignaturesCompletable,
  recordReturnedStateChange,
  resolveReturnedState,
} from "@/lib/lease-documents/returned-state-service";

const projectId = "pmi-kc-kb-s236-working-terms-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
let counter = 0;
const op = () => `4b8d2e3f-6c5a-4d7e-9fa0-${String(++counter).padStart(12, "0")}`;
const SAM = "00000000-0000-4000-8000-000000000001";
const RILEY = "00000000-0000-4000-8000-000000000002";
const AVERY = "00000000-0000-4000-8000-000000000003";
const ORIGINAL = "a".repeat(64);
const FILLED = "b".repeat(64);
const LEASE = "4821";
const SNAPSHOT = "packet_terms_a";
const basis = {
  kind: "lease_end" as const,
  dateIso: "2026-11-30",
  source: "RentVine lease end",
};
const TERMS = { rent: 1750, effectiveDate: "2026-12-01", endDate: "2027-11-30" };
const EDITS = {
  terms_rent: 1800,
  terms_effective_date: "2026-12-15",
  terms_end_date: "2027-12-14",
} as const;
type Owner = "approved_working_terms" | "absent" | "legacy_terms";

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s236-working-terms-${process.pid}`);
  db = getFirestore(app);
  testState.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await testEnv.cleanup();
});

async function saveWorking(field: string, value: number | string, context?: string) {
  const record = await getRenewalWorkingRecord(editor, LEASE, db);
  return saveRenewalWorkingField(
    editor,
    {
      leaseId: LEASE,
      field,
      value,
      expectedRevision: record?.fields[field]?.revision ?? 0,
      operationId: op(),
      ...(context ? { context } : {}),
    },
    db,
  );
}

async function recordOwner(terms?: typeof TERMS) {
  const state = await getRenewalWorkspace(editor, LEASE, db);
  await saveRenewalWorkspace(
    editor,
    {
      leaseId: LEASE,
      cycleId: state!.cycleId,
      expectedRevision: state!.revision,
      operationId: op(),
      action: {
        kind: "owner_response",
        outcome: "approved_terms",
        approval: SYNTHETIC_APPROVAL,
        ...(terms ? { terms } : {}),
      },
    },
    db,
    undefined,
    SYNTHETIC_OWNER_ROSTER,
  );
}

const person = (
  personId: string,
  fullName: string,
  signerRole: "tenant" | "owner",
  order: number,
  dotloopRole: "TENANT" | "LANDLORD",
) => ({
  personId,
  kind: "person" as const,
  fullName,
  email: null,
  emailBasis: null,
  contactRef: null,
  roles: [{ signerRole, order, dotloopRole }],
});

/** The cycle, people, reviewed map, Working terms, owner response and one prepared packet. */
async function seed(owner: Owner) {
  await startRenewalCycle(
    editor,
    {
      leaseId: LEASE,
      expectedCycleId: null,
      expectedRevision: 0,
      operationId: op(),
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
      operationId: op(),
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
    updated_at: "2026-10-20T15:00:00.000Z",
  });
  const stored: Record<string, unknown> = { ...entry };
  delete stored.id;
  await db.collection(ARTIFACT_INTAKE_COLLECTION).doc("renewal_extension").set(stored);
  // A legacy-era approval carried its own terms before any Working terms existed.
  if (owner === "legacy_terms") await recordOwner(TERMS);
  await saveWorking("terms_rent", TERMS.rent);
  await saveWorking("terms_effective_date", TERMS.effectiveDate);
  await saveWorking("terms_end_date", TERMS.endDate);
  if (owner === "approved_working_terms") await recordOwner();
  const [workspace, working] = await Promise.all([
    getRenewalWorkspace(editor, LEASE, db),
    getRenewalWorkingRecord(editor, LEASE, db),
  ]);
  if (owner === "legacy_terms") {
    expect(workspace!.ownerResponse).toMatchObject({ terms: TERMS });
    expect(workspace!.ownerResponse!.approvedWorkingTerms).toBeUndefined();
  }
  if (owner === "absent") expect(workspace!.ownerResponse).toBeNull();
  // The packet carries the approval-bound term facts exactly as the binding sources them; a
  // packet without a current approval carries none.
  const binding = workspace!.ownerResponse?.approvedWorkingTerms;
  const sourceVersions = binding
    ? [
        currentOwnerApproval({
          workspace,
          working,
          economicsHash: binding.economicsHash,
        }).facts[0].source,
      ]
    : [];
  if (owner === "approved_working_terms") expect(sourceVersions).toHaveLength(1);
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
            artifactId: "fixture-extension",
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
      sourceVersions,
      payloadHash: "f".repeat(64),
      snapshot_id: SNAPSHOT,
      snapshot_version: 1,
      actor_uid: "editor-1",
      // Prepared after the Working terms were saved, as a real packet is.
      created_at: new Date().toISOString(),
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
  await db
    .collection(DERIVED_ARTIFACT_COLLECTIONS.heads)
    .doc(derivedHeadId(SNAPSHOT, "fixture-extension"))
    .set({ id: `derived-${SNAPSHOT}` });
  await db
    .collection(DERIVED_ARTIFACT_COLLECTIONS.records)
    .doc(`derived-${SNAPSHOT}`)
    .set({
      snapshotId: SNAPSHOT,
      artifactId: "fixture-extension",
      outputHash: FILLED,
      approval: { outputHash: FILLED, actorUid: "editor-1" },
    });
}

async function change(body: Record<string, unknown>) {
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
      operationId: op(),
      change: body,
    } as never,
    db,
  );
}
const signed = (personId: string, signerRole: "tenant" | "owner") => {
  const at = new Date().toISOString();
  return {
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
  };
};

async function signEveryone() {
  await change({
    kind: "sent_for_signature",
    at: new Date().toISOString(),
    how: "Dotloop loop sent by staff",
  });
  await change(signed(SAM, "tenant"));
  await change(signed(RILEY, "tenant"));
  return change(signed(AVERY, "owner"));
}

/** The mounted workspace route recording Required signatures complete as Done. */
async function postSignaturesDone() {
  const state = await getRenewalWorkspace(editor, LEASE, db);
  const response = await POST(
    new Request("http://localhost/api/lease-renewal/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "record",
        leaseId: LEASE,
        cycleId: state!.cycleId,
        expectedRevision: state!.revision,
        operationId: op(),
        action: { kind: "activity", activity: "signatures", outcome: "done" },
      }),
    }),
  );
  return { status: response.status, body: await response.json(), before: state! };
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as { status?: number; message: string };
  }
  throw new Error("Expected a refusal.");
}

describe("PR #161 review: a Working terms edit ends current signature completion", () => {
  it.each([
    ["approved_working_terms", "terms_rent", true],
    ["approved_working_terms", "terms_effective_date", true],
    ["approved_working_terms", "terms_end_date", true],
    ["absent", "terms_end_date", false],
    ["legacy_terms", "terms_rent", true],
    ["legacy_terms", "terms_end_date", false],
  ] as const)(
    "owner response %s, then %s saved on its own (owner re-recorded first: %s)",
    async (owner, field, reRecordOwner) => {
      await seed(owner);
      const signedView = (await signEveryone()).view;
      expect(signedView).toMatchObject({
        snapshotId: SNAPSHOT,
        overall: "Fully executed",
        signaturesComplete: true,
        packetTermsCurrent: true,
      });

      // Unchanged controls: a current-base correction with a note, a same-value term save with a
      // note, and an owner-response re-record leave the packet's terms and signatures current.
      await saveWorking(
        "current_rent",
        1600,
        "Corrected current base from the lease ledger",
      );
      const noOp = await saveWorking(
        field,
        (await getRenewalWorkingRecord(editor, LEASE, db))!.fields[field].value as never,
        "Confirmed on a call",
      );
      expect(noOp.duplicate).toBe(true);
      expect(noOp.record.fields[field].revision).toBe(1);
      if (reRecordOwner) await recordOwner(owner === "legacy_terms" ? TERMS : undefined);
      const controlled = (await resolveReturnedState(editor, LEASE, db)).view;
      expect(controlled).toMatchObject({
        overall: "Fully executed",
        signaturesComplete: true,
        packetTermsCurrent: true,
      });
      await expect(
        assertSignaturesCompletable(editor, LEASE, db),
      ).resolves.toBeUndefined();
      const accepted = await postSignaturesDone();
      expect(accepted.status).toBe(200);
      expect(accepted.body.state.activities.signatures.outcome).toBe("done");

      // The material edit: one Working term saved independently; packet and version unchanged.
      const saved = await saveWorking(field, EDITS[field]);
      expect(saved.record.fields[field].revision).toBe(2);
      const workspace = await getRenewalWorkspace(editor, LEASE, db);
      expect(workspace!.ownerResponse?.recordedAt ?? null).toBe(
        accepted.before.ownerResponse?.recordedAt ?? null,
      );
      const { view } = await resolveReturnedState(editor, LEASE, db);
      expect(view).toMatchObject({
        snapshotId: SNAPSHOT,
        overall: "Sent for signature",
        signaturesComplete: false,
        packetTermsCurrent: false,
        manualCompletion:
          "Required signatures complete was recorded for earlier Working renewal terms; the current packet's signatures do not complete this renewal.",
      });
      expect(view.documents[0]).toMatchObject({
        contentHash: FILLED,
        attestation: "Recorded by staff, not provider-verified",
      });
      expect(view.documents[0].notes).toEqual(
        expect.arrayContaining([OLDER_TERMS_NOTE, "Signed before the terms changed"]),
      );
      expect(view.documents[0].stillMustSign.map((entry) => entry.name)).toEqual([
        "Sam Example",
        "Riley Example",
        "Avery Owner",
      ]);

      // The earlier attestations and their audit stay as history.
      const records = await listReturnedStateRecords(editor, LEASE, view.cycleId!, db);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ snapshotId: SNAPSHOT, revision: 4 });
      expect(records[0].signers.map((entry) => entry.status)).toEqual([
        "signed",
        "signed",
        "signed",
      ]);
      expect((await db.collection(RETURNED_STATE_COLLECTIONS.activity).get()).size).toBe(
        4,
      );

      // The shared guard and the mounted route both refuse Done; nothing is recorded.
      const refusal = await rejection(assertSignaturesCompletable(editor, LEASE, db));
      expect(refusal).toMatchObject({ status: 409 });
      expect(refusal.message).toContain(
        "The Working renewal terms changed after the current packet was prepared",
      );
      const refused = await postSignaturesDone();
      expect(refused.status).toBe(409);
      expect(refused.body.error).toContain(
        "The Working renewal terms changed after the current packet was prepared",
      );
      expect((await getRenewalWorkspace(editor, LEASE, db))!.revision).toBe(
        refused.before.revision,
      );

      // A signature observed after the edit still does not cover the older packet.
      const later = (await change(signed(SAM, "tenant"))).view;
      expect(later).toMatchObject({
        signaturesComplete: false,
        packetTermsCurrent: false,
      });
      expect((await postSignaturesDone()).status).toBe(409);
    },
  );
});
