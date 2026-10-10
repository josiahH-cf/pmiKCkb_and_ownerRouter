import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { beforeAll, beforeEach, afterAll, afterEach, it, expect, vi } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  prepareMaintenanceReport as prepare,
  saveMaintenanceReport as save,
  readMaintenanceReport as read,
  stopOriginalMaintenanceReport as stop,
} from "@/lib/firestore/maintenance-reports";
import {
  transitionMaintenanceTicket,
  getMaintenanceTicket,
} from "@/lib/firestore/maintenance-tickets";
import { applyOperatingPolicy } from "@/lib/firestore/maintenance-operating-policies";
import { createMaintenanceTicket } from "@/lib/firestore/maintenance-tickets";
import { applyMaintenanceCaseOperation } from "@/lib/firestore/maintenance-case-records";
import { FirestorePublicationContentStore } from "@/lib/publication/content";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import type { SaveMaintenanceReportInput } from "@/lib/maintenance/report-model";
const actor = {
    uid: "report-staff",
    email: "report-staff@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor" as const,
  },
  other = { ...actor, uid: "other-staff", email: "other-staff@pmikcmetro.com" };
let env: RulesTestEnvironment,
  app: ReturnType<typeof initializeApp>,
  db: Firestore,
  ticketId: string;
const day = businessDateIso(Date.now()),
  request = {
    scopeKind: "property" as const,
    scopeId: "91",
    startDate: day,
    endDate: day,
    financialDateBasis: "service" as const,
  };
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "pmi-kc-kb-maintenance-report-test",
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp(
    { projectId: "pmi-kc-kb-maintenance-report-test" },
    `report-${process.pid}`,
  );
  db = getFirestore(app);
});
beforeEach(async () => {
  await env.clearFirestore();
  const ticket = await createMaintenanceTicket(
    actor,
    {
      creation_id: randomUUID(),
      summary: "Local report fixture",
      description: "Private staff description",
      priority: "Normal",
      unit: { unitId: "unit:17", label: "Local reviewed unit", confidence: "Verified" },
    },
    db,
    "91",
  );
  ticketId = ticket.id;
  await applyMaintenanceCaseOperation(
    actor,
    ticket.id,
    {
      operationId: randomUUID(),
      expectedVersion: 1,
      op: "association",
      association: {
        kind: "unit",
        propertyId: "91",
        unitId: "17",
        leaseId: null,
        eventDate: day,
        evidenceRef: "private-fixture:reviewed-property",
        reason: "Reviewed actual fixture scope",
      },
    },
    {
      db,
      verifyAssociation: async () => ({
        unitLabel: "Local reviewed unit",
        sourceHash: "a".repeat(64),
      }),
    },
  );
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await env.cleanup();
  await deleteApp(app);
});
async function command(): Promise<SaveMaintenanceReportInput> {
  const prepared = await prepare(actor, request, db);
  return {
    operationId: randomUUID(),
    request,
    expectedSnapshotHash: prepared.snapshotHash,
    reviewedGeneratedAt: prepared.report.generatedAt,
    reviewedOwnerReadyContent: true,
    retainFactsAndExportsIndefinitely: true,
  };
}
it("freezes facts and both exact exports, then replays the original across corrections and ten years", async () => {
  const input = await command(),
    saved = await save(actor, input, db);
  expect(saved.state).toBe("saved");
  const pdf = await read(other, saved.id, db, "pdf"),
    csv = await read(other, saved.id, db, "csv");
  expect(Buffer.from(pdf.bytes!).subarray(0, 5).toString()).toBe("%PDF-");
  expect(Buffer.from(csv.bytes!).toString()).toContain("Local reviewed unit");
  const original = JSON.stringify(saved.report);
  await db.collection("maintenance_tickets").doc(ticketId).update({ record_version: 9 });
  expect((await prepare(actor, request, db)).snapshotHash).not.toBe(
    input.expectedSnapshotHash,
  );
  expect(await save(actor, input, db)).toEqual(saved);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2036-10-09T12:00:00Z"));
  try {
    expect(JSON.stringify((await read(actor, saved.id, db)).report)).toBe(original);
  } finally {
    vi.useRealTimers();
  }
  const record = (
    await db.collection("maintenance_report_snapshots").doc(saved.id).get()
  ).data()!;
  expect(record).toMatchObject({
    product_retention_class: "indefinite",
    legal_hold: false,
  });
  const chunks = await db.collection("publication_content_chunks").get();
  expect(chunks.size).toBeGreaterThan(1);
  expect(
    chunks.docs.every((d) => d.data().product_retention_class === "indefinite"),
  ).toBe(true);
  await expect(
    new FirestorePublicationContentStore(db).delete(record.pdf),
  ).rejects.toThrow("indefinite");
  await expect(
    save(actor, { ...input, request: { ...request, scopeId: "92" } }, db),
  ).rejects.toMatchObject({ status: 409 });
});
it("holds a changed review before claim and requires a new identified snapshot", async () => {
  const input = await command();
  await db.collection("maintenance_tickets").doc(ticketId).update({ record_version: 3 });
  await expect(save(actor, input, db)).rejects.toMatchObject({ status: 409 });
  expect((await db.collection("maintenance_report_snapshots").get()).size).toBe(0);
  const corrected = await save(actor, await command(), db);
  expect(corrected.report!.jobs[0].ticketVersion).toBe(3);
});
it("resumes the admitted original after interrupted export storage without re-reading changed facts", async () => {
  const input = await command(),
    spy = vi
      .spyOn(FirestorePublicationContentStore.prototype, "putImmutable")
      .mockRejectedValueOnce(Error("Local interrupted storage"));
  await expect(save(actor, input, db)).rejects.toThrow("interrupted");
  spy.mockRestore();
  const original = await read(actor, input.operationId, db);
  expect(original.state).toBe("preparing");
  await expect(read(other, input.operationId, db)).rejects.toMatchObject({ status: 404 });
  await db.collection("maintenance_tickets").doc(ticketId).update({ record_version: 10 });
  const resumed = await save(actor, input, db);
  expect(resumed.state).toBe("saved");
  expect(resumed.report).toEqual(original.report);
  expect((await db.collection("maintenance_report_snapshots").get()).size).toBe(1);
  expect((await db.collection("action_executions").get()).size).toBe(0);
});
it("records an exact cutoff before admission and preserves a save that won the race", async () => {
  const input = await command();
  expect((await stop(actor, input.operationId, db)).state).toBe("cancelled");
  await expect(save(actor, input, db)).rejects.toMatchObject({ status: 409 });
  const next = await command();
  const results = await Promise.allSettled([
    save(actor, next, db),
    stop(actor, next.operationId, db),
  ]);
  const outcome = await read(actor, next.operationId, db);
  expect(["cancelled", "preparing", "saved"]).toContain(outcome.state);
  if (outcome.state === "cancelled") expect(results[0].status).toBe("rejected");
  else expect((await save(actor, next, db)).state).toBe("saved");
});
it("refuses current access loss, personal identity and missing authenticated identity", async () => {
  const saved = await save(actor, await command(), db);
  await expect(
    read({ ...actor, role: "Viewer" as never }, saved.id, db, "pdf"),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    read({ ...actor, hd: "gmail.com", email: "staff@gmail.com" }, saved.id, db),
  ).rejects.toMatchObject({ status: 403 });
  await expect(read({ ...actor, uid: "" }, saved.id, db)).rejects.toMatchObject({
    status: 403,
  });
});

it("keeps policy and financial source identities, separates a responsibility proposal, and freezes its original review state", async () => {
  const admin = { ...actor, role: "Admin" as const },
    at = new Date().toISOString();
  await applyOperatingPolicy(
    admin,
    {
      op: "save_version",
      operationId: randomUUID(),
      expectedVersion: 0,
      reviewedExactPolicy: true,
      reason: "Fixture actual approved policy review",
      policy: {
        purpose: "chargeback",
        scope: { kind: "organization" },
        state: "approved",
        title: "Fixture reviewed guidance",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        expiresAt: null,
        sourceRefs: ["fixture approved policy"],
        wording: "Fixture exact reviewed guidance",
        timing: "after_responsibility_review",
        reviewConditions: ["assessment", "staff_review"],
      },
    },
    { db, at },
  );
  let t = (await getMaintenanceTicket(actor, ticketId, db))!;
  t = await transitionMaintenanceTicket(
    actor,
    ticketId,
    {
      op: "assessment",
      operationId: randomUUID(),
      expectedVersion: t.record_version!,
      outcome: "work_required",
      scope: "Fixture reviewed inspected work",
      evidence_refs: ["fixture inspection"],
    },
    db,
  );
  await applyMaintenanceCaseOperation(
    actor,
    ticketId,
    {
      op: "responsibility_review",
      operationId: randomUUID(),
      expectedVersion: t.record_version!,
      review: {
        state: "reviewed",
        expectedPolicy: { id: "chargeback_organization", version: 1 },
        expectedAssessmentVersion: 1,
        reason: "Fixture responsibility review",
        evidenceRefs: ["fixture inspected work"],
        leaseEvidenceRefs: [],
        allocations: [
          {
            party: "pmi",
            identityRef: null,
            basisPoints: 10000,
            evidenceRef: "fixture reviewed responsibility",
          },
        ],
        proposedAmountCents: 12000,
        amountBasis: "Fixture reviewed proposal only",
        residentConcern: "",
        reviewedByStaff: true,
      },
    },
    { db, at },
  );
  const prepared = await prepare(actor, request, db);
  expect(prepared.report.jobs[0].responsibility).toMatchObject({
    reviewAtExport: "current",
    policyId: "chargeback_organization",
    policyVersion: 1,
    proposedAmountCents: 12000,
  });
  expect(prepared.report.jobs[0].totals).not.toHaveProperty("proposedAmountCents");
  const saved = await save(
    actor,
    {
      operationId: randomUUID(),
      request,
      expectedSnapshotHash: prepared.snapshotHash,
      reviewedGeneratedAt: prepared.report.generatedAt,
      reviewedOwnerReadyContent: true,
      retainFactsAndExportsIndefinitely: true,
    },
    db,
  );
  t = (await getMaintenanceTicket(actor, ticketId, db))!;
  await transitionMaintenanceTicket(
    actor,
    ticketId,
    {
      op: "assessment",
      operationId: randomUUID(),
      expectedVersion: t.record_version!,
      outcome: "work_required",
      scope: "Fixture corrected actual inspected work",
      evidence_refs: ["fixture later inspection"],
    },
    db,
  );
  expect(
    (await prepare(actor, request, db)).report.jobs[0].responsibility?.reviewAtExport,
  ).toBe("needs_review");
  expect(
    (await read(actor, saved.id, db)).report!.jobs[0].responsibility?.reviewAtExport,
  ).toBe("current");
  const csv = Buffer.from((await read(actor, saved.id, db, "csv")).bytes!).toString();
  expect(csv).toContain("Responsibility review at export");
  expect(csv).toContain("chargeback_organization v1");
  expect(csv).toContain("12000");
  await db
    .collection("maintenance_operating_policy_versions")
    .doc("chargeback_organization_v1")
    .update({ purpose: "invalid" });
  await expect(prepare(actor, request, db)).rejects.toMatchObject({ status: 409 });
  expect((await read(actor, saved.id, db, "pdf")).bytes!.length).toBeGreaterThan(1000);
});
