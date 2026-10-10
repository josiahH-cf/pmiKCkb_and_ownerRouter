import { maintenanceWorkScope } from "@/lib/maintenance/lifecycle";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  submitVendorContribution,
  readVendorWork,
  uploadVendorArtifact,
  readVendorArtifact,
  saveMaintenanceVendorRoster,
  stopMaintenanceRosterOperation,
  readMaintenanceRosterOperation,
  applyMaintenanceVendorOperation,
  readStaffVendorWork,
} from "@/lib/firestore/maintenance-vendor-work";
import type { VendorContributionInput } from "@/lib/maintenance/vendor-work-model";
import { FirestorePublicationContentStore } from "@/lib/publication/content";
import { vi, afterEach } from "vitest";
import { FirestoreVendorStore } from "@/lib/firestore/vendors";
let env: RulesTestEnvironment, app: ReturnType<typeof initializeApp>, db: Firestore;
const principal = {
  uid: "vendor-uid",
  vendorId: "vendor-fixture",
  email: "vendor@fixture.invalid",
  emailVerified: true as const,
  totpVerified: true as const,
  sessionIssuedAt: Date.now(),
  dataMode: "live" as const,
};
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "pmi-kc-kb-vendor-work-test",
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp(
    { projectId: "pmi-kc-kb-vendor-work-test" },
    `vendor-work-${process.pid}`,
  );
  db = getFirestore(app);
});
beforeEach(async () => {
  await env.clearFirestore();
  await db.collection("vendors").doc(principal.vendorId).set({
    id: principal.vendorId,
    uid: principal.uid,
    email: principal.email,
    status: "active",
    data_mode: "live",
    inviteVersion: 1,
    updatedAt: "2026-10-09T10:00:00Z",
  });
  await db
    .collection("maintenance_tickets")
    .doc("ticket-fixture")
    .set({
      id: "ticket-fixture",
      vendor_id: principal.vendorId,
      status: "Open",
      record_version: 1,
      priority: "Routine",
      summary: "Actual reviewed issue",
      description: "PRIVATE INTERNAL SENTIMENT",
      data_mode: "live",
      updated_at: "2026-10-09T10:00:00Z",
      unit: { unitId: "unit:41", label: "Fixture unit" },
    });
  await db.collection("vendor_ticket_assignments").doc("ticket-fixture").set({
    ticket_id: "ticket-fixture",
    vendor_id: principal.vendorId,
    active: true,
    data_mode: "live",
    updated_at: "2026-10-09T10:00:00Z",
  });
});
afterAll(async () => {
  await env.cleanup();
  await deleteApp(app);
});
it("reports current assignment generation without exposing private internal work or requiring a mailbox", async () => {
  const result = await new FirestoreVendorStore(db).getAssignedTicket({
    ...principal,
    ticketId: "ticket-fixture",
  });
  expect(result).toHaveProperty("assignmentGeneration");
  expect(JSON.stringify(result)).not.toContain("PRIVATE INTERNAL");
});

const staff = {
    uid: "staff",
    email: "staff@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor" as const,
  },
  admin = { ...staff, role: "Admin" as const };
afterEach(() => vi.restoreAllMocks());
async function command(
  change: Partial<VendorContributionInput> = {},
): Promise<VendorContributionInput> {
  const work = await readVendorWork(principal, "ticket-fixture", undefined, db);
  return {
    operationId: randomUUID(),
    submissionId: randomUUID(),
    expectedSubmissionVersion: 0,
    assignmentGeneration: work.ticket.assignmentGeneration!,
    kind: "progress",
    description: "Vendor-reported actual fixture work",
    occurredAt: "2026-10-09T11:00:00Z",
    quoteBasis: null,
    lines: [],
    invoiceId: null,
    issueDate: null,
    serviceDate: null,
    proposedStart: null,
    proposedEnd: null,
    progressKind: "arrived",
    unresolvedIssues: "",
    artifactIds: [],
    revisionReason: "Actual initial report",
    ...change,
  };
}
it("retains one original submission/receipt, refuses changed replay, resets review on revision and never closes the case", async () => {
  const c = await command(),
    one = await submitVendorContribution(principal, "ticket-fixture", c, db);
  expect(one.version).toBe(1);
  expect(await submitVendorContribution(principal, "ticket-fixture", c, db)).toEqual(one);
  await expect(
    submitVendorContribution(
      principal,
      "ticket-fixture",
      { ...c, description: "Changed replay" },
      db,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await applyMaintenanceVendorOperation(
    staff,
    "ticket-fixture",
    {
      operationId: randomUUID(),
      expectedVersion: 1,
      op: "vendor_review",
      submissionId: c.submissionId,
      expectedSubmissionVersion: 1,
      decision: "accepted",
      reason: "PMI checked this report",
    },
    db,
  );
  const revised = await submitVendorContribution(
    principal,
    "ticket-fixture",
    {
      ...c,
      operationId: randomUUID(),
      expectedSubmissionVersion: 1,
      description: "Corrected report",
      revisionReason: "Correct actual description",
    },
    db,
  );
  expect(revised.review.state).toBe("pending");
  await expect(
    applyMaintenanceVendorOperation(
      staff,
      "ticket-fixture",
      {
        operationId: randomUUID(),
        expectedVersion: 2,
        op: "vendor_review",
        submissionId: c.submissionId,
        expectedSubmissionVersion: 1,
        decision: "accepted",
        reason: "Old report",
      },
      db,
    ),
  ).rejects.toMatchObject({ status: 409 });
  const ticket = (
    await db.collection("maintenance_tickets").doc("ticket-fixture").get()
  ).data()!;
  expect(ticket.status).toBe("Open");
  expect(ticket.record_version).toBe(2);
  expect((await db.collection("maintenance_vendor_contributions").get()).size).toBe(1);
  const events = (await db.collection("maintenance_case_events").get()).docs.map((d) =>
    d.data(),
  );
  expect(events).toHaveLength(3);
  expect(events.some((e) => e.submission?.description === c.description)).toBe(true);
});
it("serializes concurrent revisions and refuses revoked, wrong, unverified or stale assignments before submissions or private reads", async () => {
  const c = await command();
  const results = await Promise.allSettled([
    submitVendorContribution(principal, "ticket-fixture", c, db),
    submitVendorContribution(
      principal,
      "ticket-fixture",
      { ...c, operationId: randomUUID(), description: "Racing initial report" },
      db,
    ),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  for (const p of [
    { ...principal, uid: "wrong" },
    { ...principal, totpVerified: false },
    { ...principal, dataMode: "test" },
  ])
    await expect(
      readVendorWork(p as typeof principal, "ticket-fixture", undefined, db),
    ).rejects.toBeTruthy();
  await db
    .collection("vendor_ticket_assignments")
    .doc("ticket-fixture")
    .update({ updated_at: "2026-10-09T12:00:00Z" });
  await expect(
    submitVendorContribution(
      principal,
      "ticket-fixture",
      { ...c, operationId: randomUUID(), submissionId: randomUUID() },
      db,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await db
    .collection("vendor_ticket_assignments")
    .doc("ticket-fixture")
    .update({ active: false });
  await expect(
    readVendorWork(principal, "ticket-fixture", c.operationId, db),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    submitVendorContribution(principal, "ticket-fixture", c, db),
  ).rejects.toMatchObject({ status: 404 });
  expect(
    (await readStaffVendorWork(staff, "ticket-fixture", db)).contributions,
  ).toHaveLength(1);
});
it("keeps roster selection and reviewed packet independent of actual portal assignment, spending and delivery", async () => {
  const input = {
    operationId: randomUUID(),
    expectedVersion: 0,
    vendorId: principal.vendorId,
    active: true,
    availability: "available" as const,
    categories: ["Plumbing"],
    preference: "primary" as const,
    contactEmail: principal.email,
    contactPhone: "",
    preferredChannel: "portal" as const,
    contactVerified: true as const,
    sourceRef: "private-evidence:verified-fixture-contact",
    rentvineVendorId: null,
    rentvineEvidenceRef: null,
    reason: "Reviewed actual contact",
  };
  await expect(saveMaintenanceVendorRoster(staff, input, db)).rejects.toMatchObject({
    status: 403,
  });
  const roster = await saveMaintenanceVendorRoster(admin, input, db);
  expect(await saveMaintenanceVendorRoster(admin, input, db)).toEqual(roster);
  await applyMaintenanceVendorOperation(
    staff,
    "ticket-fixture",
    {
      op: "vendor_selection",
      operationId: randomUUID(),
      expectedVersion: 1,
      vendorId: principal.vendorId,
      rosterVersion: 1,
      reason: "Deliberate primary selection",
    },
    db,
  );
  await applyMaintenanceVendorOperation(
    staff,
    "ticket-fixture",
    {
      op: "vendor_packet",
      operationId: randomUUID(),
      expectedVersion: 2,
      selectionVersion: 1,
      rosterVersion: 1,
      packet: {
        issue: "Reviewed leak",
        location: "Verified fixture unit",
        access: "PMI will coordinate actual access",
        scheduling: "No visit approved yet",
        approvedScope: "Review source leak; obtain authorization before work",
        costLimitCents: null,
        authorizationRef: null,
        troubleshooting: [{ step: "Checked visible fixture", outcome: "Leak persists" }],
        artifactIds: [],
        reviewedForVendor: true,
        reason: "Reviewed for this vendor",
      },
    },
    db,
  );
  const work = await readVendorWork(principal, "ticket-fixture", undefined, db);
  expect(work.ticket.reviewedPacket?.issue).toBe("Reviewed leak");
  expect(JSON.stringify(work)).not.toContain("PRIVATE INTERNAL");
  expect(JSON.stringify(work)).not.toContain("selectedBy");
  await db
    .collection("maintenance_tickets")
    .doc("ticket-fixture")
    .update({ description: "Materially changed scope" });
  expect(
    (await readVendorWork(principal, "ticket-fixture", undefined, db)).ticket
      .reviewedPacket,
  ).toBeNull();
  expect((await db.collection("maintenance_tickets").get()).size).toBe(1);
  expect(
    (await db.collection("vendor_ticket_assignments").doc("ticket-fixture").get()).data()
      ?.updated_at,
  ).toBe("2026-10-09T10:00:00Z");
});
it("recovers exact bounded original files without a mailbox and refuses replacement bytes, cross-ticket files and revoked download", async () => {
  const c = await command(),
    bytes = Buffer.from("%PDF-1.7\nOriginal invoice fixture\n%%EOF"),
    input = {
      operationId: randomUUID(),
      assignmentGeneration: c.assignmentGeneration,
      filename: "original.pdf",
      mimeType: "application/pdf" as const,
      purpose: "invoice" as const,
      base64: bytes.toString("base64"),
      approvedCoreEvidence: true as const,
    };
  vi.spyOn(
    FirestorePublicationContentStore.prototype,
    "putImmutable",
  ).mockRejectedValueOnce(Error("Lost upload response"));
  await expect(
    uploadVendorArtifact(principal, "ticket-fixture", input, db),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await readVendorArtifact(principal, "ticket-fixture", input.operationId, db))
      .artifact.state,
  ).toBe("uploading");
  await expect(
    uploadVendorArtifact(
      principal,
      "ticket-fixture",
      { ...input, base64: Buffer.from("%PDF-1.7 other %%EOF").toString("base64") },
      db,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect((await uploadVendorArtifact(principal, "ticket-fixture", input, db)).state).toBe(
    "retained",
  );
  expect((await uploadVendorArtifact(principal, "ticket-fixture", input, db)).state).toBe(
    "retained",
  );
  expect(
    Buffer.from(
      (await readVendorArtifact(principal, "ticket-fixture", input.operationId, db, true))
        .bytes!,
    ),
  ).toEqual(bytes);
  const invoiceCommand = await command({
    kind: "invoice",
    progressKind: null,
    invoiceId: "INV-fixture",
    issueDate: "2026-10-09",
    serviceDate: "2026-10-08",
    lines: [{ description: "Actual work fixture", amountCents: 10000 }],
    artifactIds: [input.operationId],
  });
  await db
    .collection("maintenance_vendor_artifacts")
    .doc(input.operationId)
    .update({ purpose: "work_photo" });
  await expect(
    submitVendorContribution(principal, "ticket-fixture", invoiceCommand, db),
  ).rejects.toMatchObject({ status: 409 });
  await db
    .collection("maintenance_vendor_artifacts")
    .doc(input.operationId)
    .update({ purpose: "invoice" });
  await submitVendorContribution(principal, "ticket-fixture", invoiceCommand, db);
  await expect(
    submitVendorContribution(
      principal,
      "ticket-fixture",
      { ...invoiceCommand, operationId: randomUUID(), submissionId: randomUUID() },
      db,
    ),
  ).rejects.toMatchObject({ status: 409 });
  const revised = await submitVendorContribution(
    principal,
    "ticket-fixture",
    {
      ...invoiceCommand,
      operationId: randomUUID(),
      expectedSubmissionVersion: 1,
      invoiceMeaning: "credit",
      revisionReason: "Original fixture credit document corrected",
    },
    db,
  );
  expect(revised).toMatchObject({
    version: 2,
    invoiceMeaning: "credit",
    review: { state: "pending" },
  });
  expect((await db.collection("maintenance_vendor_contributions").get()).size).toBe(1);
  await expect(
    readVendorArtifact(principal, "other-ticket", input.operationId, db, true),
  ).rejects.toMatchObject({ status: 404 });
  await db.collection("vendors").doc(principal.vendorId).update({ status: "disabled" });
  await expect(
    readVendorArtifact(principal, "ticket-fixture", input.operationId, db, true),
  ).rejects.toMatchObject({ status: 404 });
  expect((await db.collection("maintenance_vendor_artifacts").get()).size).toBe(1);
});

it("a packet cannot mint spending authority or retain a cost limit after the exact owner decision is revoked", async () => {
  await saveMaintenanceVendorRoster(
    admin,
    {
      operationId: randomUUID(),
      expectedVersion: 0,
      vendorId: principal.vendorId,
      active: true,
      availability: "available",
      categories: ["Plumbing"],
      preference: "primary",
      contactEmail: principal.email,
      contactPhone: "",
      preferredChannel: "portal",
      contactVerified: true,
      sourceRef: "private-evidence:contact-fixture",
      rentvineVendorId: null,
      rentvineEvidenceRef: null,
      reason: "Reviewed actual fixture contact",
    },
    db,
  );
  await applyMaintenanceVendorOperation(
    staff,
    "ticket-fixture",
    {
      op: "vendor_selection",
      operationId: randomUUID(),
      expectedVersion: 1,
      vendorId: principal.vendorId,
      rosterVersion: 1,
      reason: "Reviewed fixture selection",
    },
    db,
  );
  const packet = {
    issue: "Reviewed fixture leak",
    location: "Fixture unit",
    access: "PMI to coordinate",
    scheduling: "Not yet agreed",
    approvedScope: "Actual approved fixture scope",
    costLimitCents: 9000,
    authorizationRef: "private-evidence:owner-decision",
    troubleshooting: [],
    artifactIds: [],
    reviewedForVendor: true as const,
    reason: "Reviewed this exact work",
  };
  await expect(
    applyMaintenanceVendorOperation(
      staff,
      "ticket-fixture",
      {
        op: "vendor_packet",
        operationId: randomUUID(),
        expectedVersion: 2,
        selectionVersion: 1,
        rosterVersion: 1,
        packet,
      },
      db,
    ),
  ).rejects.toMatchObject({ status: 409 });
  const ref = db.collection("maintenance_tickets").doc("ticket-fixture"),
    current = (await ref.get()).data() as MaintenanceTicketRecord,
    assessed = {
      ...current,
      property_id: "91",
      assessment: {
        outcome: "work_required" as const,
        version: 1,
        scope: "Actual assessed fixture work",
        evidence_refs: ["private-evidence:assessment"],
        recorded_at: new Date().toISOString(),
        recorded_by_uid: staff.uid,
      },
      estimate_amount_cents: 10000,
      estimate_cost_basis: "total_including_tax_and_markup" as const,
    };
  await ref.set({
    ...assessed,
    owner_decision: {
      decision: "approved",
      work_scope: maintenanceWorkScope(assessed),
      cost_basis: "total_including_tax_and_markup",
      evidence_ref: packet.authorizationRef,
      reason: "Owner reviewed actual fixture",
      recorded_at: new Date().toISOString(),
      recorded_by_uid: staff.uid,
    },
  });
  await applyMaintenanceVendorOperation(
    staff,
    "ticket-fixture",
    {
      op: "vendor_packet",
      operationId: randomUUID(),
      expectedVersion: 2,
      selectionVersion: 1,
      rosterVersion: 1,
      packet,
    },
    db,
  );
  expect(
    (await readVendorWork(principal, "ticket-fixture", undefined, db)).ticket
      .reviewedPacket?.costLimitCents,
  ).toBe(9000);
  await ref.update({ "owner_decision.decision": "declined" });
  expect(
    (await readVendorWork(principal, "ticket-fixture", undefined, db)).ticket
      .reviewedPacket,
  ).toBeNull();
  expect((await readStaffVendorWork(staff, "ticket-fixture", db)).packetCurrent).toBe(
    false,
  );
});

it("roster cutoff and save serialize one outcome, and a cutoff cannot erase an already committed preference", async () => {
  const operationId = randomUUID(),
    input = {
      operationId,
      expectedVersion: 0,
      vendorId: principal.vendorId,
      active: true,
      availability: "available" as const,
      categories: ["plumbing"],
      preference: "primary" as const,
      contactEmail: principal.email,
      contactPhone: "",
      preferredChannel: "email" as const,
      contactVerified: true as const,
      sourceRef: "private-fixture:actual-contact-review",
      rentvineVendorId: null,
      rentvineEvidenceRef: null,
      reason: "Fixture reviewed preference",
    };
  await Promise.allSettled([
    saveMaintenanceVendorRoster(admin, input, db),
    stopMaintenanceRosterOperation(admin, operationId, db),
  ]);
  const outcome = await readMaintenanceRosterOperation(admin, operationId, db),
    head = await db.collection("maintenance_vendor_roster").doc(principal.vendorId).get();
  expect(["committed", "stopped"]).toContain(outcome.state);
  if (outcome.state === "stopped") {
    expect(head.exists).toBe(false);
    await expect(saveMaintenanceVendorRoster(admin, input, db)).rejects.toThrow(
      "stopped before commitment",
    );
  } else {
    expect(head.data()?.version).toBe(1);
    expect((await stopMaintenanceRosterOperation(admin, operationId, db)).state).toBe(
      "committed",
    );
    expect((await saveMaintenanceVendorRoster(admin, input, db)).version).toBe(1);
  }
  expect((await db.collection("maintenance_vendor_roster_history").get()).size).toBe(
    outcome.state === "committed" ? 1 : 0,
  );
  const other = { ...admin, uid: "different-admin" };
  expect((await readMaintenanceRosterOperation(other, operationId, db)).state).toBe(
    "not_recorded",
  );
  await expect(
    stopMaintenanceRosterOperation(staff, randomUUID(), db),
  ).rejects.toMatchObject({ status: 403 });
});
