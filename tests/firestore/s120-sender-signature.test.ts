import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";

// S120 (R120.2): a managed sender's saved signature is retained for that same sender across leases
// and cycles, fills the next preparation with a visible origin, never leaks to another actor, and
// binds only when that actor saves. Live lease views are deterministic fixtures.

vi.mock("@/lib/lease-renewal/live-config", async (original) => ({
  ...(await original<typeof import("@/lib/lease-renewal/live-config")>()),
  buildLiveRentVineConfig: () => ({ ok: true, rentvineClient: {} }),
  buildLiveRenewalConfig: () => ({ ok: false, reason: "test_source_not_configured" }),
}));
vi.mock("@/lib/lease-renewal/live-lease-cache", async (original) => ({
  ...(await original<typeof import("@/lib/lease-renewal/live-lease-cache")>()),
  requireCurrentLeaseViews: async () => [
    {
      leaseID: 701,
      endDate: "2026-12-31",
      currentRent: 1000,
      tenants: [{ name: "Emulator Tenant", email: "tenant@fixture-rental.net" }],
      property: { streetName: "701 Emulator Avenue" },
      portfolio: {
        owners: [{ name: "Emulator Owner", email: "owner@fixture-rental.net" }],
      },
    },
    {
      leaseID: 702,
      endDate: "2027-03-31",
      currentRent: 1200,
      tenants: [{ name: "Second Tenant", email: "second@fixture-rental.net" }],
      property: { streetName: "702 Emulator Avenue" },
      portfolio: {
        owners: [{ name: "Second Owner", email: "owner2@fixture-rental.net" }],
      },
    },
  ],
}));

import {
  getRetainedSenderSignature,
  RENEWAL_SENDER_SIGNATURE_COLLECTION,
} from "@/lib/firestore/renewal-sender-signatures";
import {
  MESSAGE_PREPARATION_COLLECTIONS,
  saveMessagePreparation,
} from "@/lib/firestore/renewal-message-preparations";
import { startRenewalCycle } from "@/lib/firestore/renewal-workspace";
import { currentRenewalMessage } from "@/lib/lease-renewal/current-renewal-message";

const projectId = "pmi-kc-kb-s120-sender-signature-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const secondEditor: AuthenticatedUser = {
  uid: "editor-2",
  email: "editor2@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const basis = {
  kind: "lease_end" as const,
  dateIso: "2026-12-31",
  source: "RentVine lease end",
};
const signature = {
  name: "Editor One",
  role: "PMI KC Metro",
  phone: null,
  hours: null,
  website: null,
  source: "Emulator signed-in staff declaration",
};

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s120-sender-signature-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  await testEnv.clearFirestore();
});
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
  vi.unstubAllEnvs();
});

async function cycle(actor: AuthenticatedUser, leaseId: string, dateIso: string) {
  const started = await startRenewalCycle(
    actor,
    {
      leaseId,
      expectedCycleId: null,
      expectedRevision: 0,
      operationId: randomUUID(),
      basis: { ...basis, dateIso },
      reason: "Cycle for the S120 emulator case.",
    },
    { ...basis, dateIso },
    db,
  );
  return started.state!.cycleId as string;
}

describe("S120 retained sender signature", () => {
  it("AC-S120-2: a saved signature is retained for its sender, fills the next lease and cycle with a visible origin, and never fills another actor", async () => {
    const firstCycle = await cycle(editor, "701", "2026-12-31");
    const fresh = await currentRenewalMessage(editor, "701", "tenant", db);
    expect(fresh.inputs.signature).toBeNull();
    expect(fresh.signatureOrigin).toEqual({ kind: "none" });
    expect(fresh.content.missing.map((item) => item.field)).toContain("signature");
    expect(await getRetainedSenderSignature(editor, db)).toBeNull();

    const saved = await saveMessagePreparation(
      editor,
      {
        leaseId: "701",
        cycleId: firstCycle,
        channel: "tenant",
        expectedRevision: 0,
        operationId: randomUUID(),
        sourceFingerprint: fresh.basis.sourceFingerprint,
        reviewed: false,
        inputs: { ...fresh.inputs, signature },
      },
      {
        sourceFingerprint: fresh.basis.sourceFingerprint,
        workspaceFingerprint: fresh.basis.workspaceFingerprint!,
      },
      db,
    );
    expect(saved.record?.signatureActorUid).toBe(editor.uid);
    const retained = await getRetainedSenderSignature(editor, db);
    expect(retained).toMatchObject({
      actorUid: editor.uid,
      email: editor.email,
      signature,
      leaseId: "701",
      channel: "tenant",
    });

    // Another lease, the other audience: the same sender starts with their own signature filled.
    await cycle(editor, "702", "2027-03-31");
    const next = await currentRenewalMessage(editor, "702", "owner", db);
    expect(next.inputs.signature).toEqual(signature);
    expect(next.signatureOrigin).toMatchObject({ kind: "retained_sender" });
    expect(next.facts.signature).toEqual({ ...signature, email: editor.email });
    expect(next.content.missing.map((item) => item.field)).not.toContain("signature");
    // Filling is not review or sender binding: both still require this actor's explicit save.
    expect(next.needsReview).toBe(true);
    expect(next.signatureMatchesActor).toBe(false);
    expect(next.saved).toBeNull();

    // A different actor sees no signature and no retained record of their own.
    const other = await currentRenewalMessage(secondEditor, "702", "owner", db);
    expect(other.inputs.signature).toBeNull();
    expect(other.signatureOrigin).toEqual({ kind: "none" });
    expect(other.retainedSignature).toBeNull();
    expect(await getRetainedSenderSignature(secondEditor, db)).toBeNull();

    // Saving the filled preparation binds the signature to the sender who saved it.
    const bound = await saveMessagePreparation(
      editor,
      {
        leaseId: "702",
        cycleId: next.workspace!.cycleId,
        channel: "owner",
        expectedRevision: 0,
        operationId: randomUUID(),
        sourceFingerprint: next.basis.sourceFingerprint,
        reviewed: true,
        inputs: next.inputs,
      },
      {
        sourceFingerprint: next.basis.sourceFingerprint,
        workspaceFingerprint: next.basis.workspaceFingerprint!,
      },
      db,
    );
    expect(bound.record?.signatureActorUid).toBe(editor.uid);
    expect(bound.record?.signatureEmail).toBe(editor.email);
    const after = await currentRenewalMessage(editor, "702", "owner", db);
    expect(after.signatureOrigin).toEqual({ kind: "saved" });
    expect(after.signatureMatchesActor).toBe(true);
    expect(after.needsReview).toBe(false);

    // The other actor loads the saved message: the signature is shown as saved by someone else,
    // not adopted, and their own retained signature stays empty.
    const otherAfter = await currentRenewalMessage(secondEditor, "702", "owner", db);
    expect(otherAfter.signatureOrigin).toEqual({ kind: "saved" });
    expect(otherAfter.signatureMatchesActor).toBe(false);
    expect(otherAfter.retainedSignature).toBeNull();

    // Exactly one retained document per sender and no extra preparation document was created.
    const retainedDocs = await db.collection(RENEWAL_SENDER_SIGNATURE_COLLECTION).get();
    expect(retainedDocs.docs.map((doc) => doc.id)).toEqual([editor.uid]);
    const preparations = await db.collection(MESSAGE_PREPARATION_COLLECTIONS.head).get();
    expect(preparations.size).toBe(2);
  });

  it("AC-S120-2: a retained record whose identity does not match the reader is ignored rather than trusted", async () => {
    await db.collection(RENEWAL_SENDER_SIGNATURE_COLLECTION).doc(secondEditor.uid).set({
      schemaVersion: "renewal-sender-signature/v1",
      actorUid: editor.uid,
      email: editor.email,
      signature,
      leaseId: "701",
      cycleId: randomUUID(),
      channel: "tenant",
      updatedAt: new Date().toISOString(),
    });
    expect(await getRetainedSenderSignature(secondEditor, db)).toBeNull();
    await cycle(secondEditor, "701", "2026-12-31");
    const current = await currentRenewalMessage(secondEditor, "701", "tenant", db);
    expect(current.inputs.signature).toBeNull();
    expect(current.signatureOrigin).toEqual({ kind: "none" });
  });
});
