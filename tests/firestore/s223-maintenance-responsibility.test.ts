import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import { applyOperatingPolicy } from "@/lib/firestore/maintenance-operating-policies";
import {
  applyMaintenanceCaseOperation as apply,
  readMaintenanceCaseHistory as history,
  readMaintenanceReviewContext as context,
} from "@/lib/firestore/maintenance-case-records";
import {
  createMaintenanceTicket,
  transitionMaintenanceTicket,
  getMaintenanceTicket,
} from "@/lib/firestore/maintenance-tickets";
import type { ResponsibilityReviewInput } from "@/lib/maintenance/review-model";
const admin = {
    uid: "responsibility-admin",
    email: "responsibility-admin@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Admin" as const,
  },
  staff = { ...admin, uid: "responsibility-staff", role: "Editor" as const };
let env: RulesTestEnvironment,
  app: ReturnType<typeof initializeApp>,
  db: Firestore,
  id: string;
const at = "2026-10-10T01:00:00.000Z";
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "pmi-kc-kb-responsibility-test",
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp(
    { projectId: "pmi-kc-kb-responsibility-test" },
    `responsibility-${process.pid}`,
  );
  db = getFirestore(app);
});
beforeEach(async () => {
  await env.clearFirestore();
  id = (
    await createMaintenanceTicket(
      staff,
      {
        creation_id: randomUUID(),
        summary: "Fixture maintenance issue",
        description: "Reviewed fixture evidence",
        priority: "Normal",
        unit: { unitId: "unit:801", label: "Fixture 801", confidence: "Verified" },
      },
      db,
      "901",
    )
  ).id;
});
afterAll(async () => {
  await env.cleanup();
  await deleteApp(app);
});
async function version() {
  return (await getMaintenanceTicket(staff, id, db))!.record_version!;
}
async function policy() {
  await applyOperatingPolicy(
    admin,
    {
      op: "save_version",
      operationId: randomUUID(),
      expectedVersion: 0,
      reviewedExactPolicy: true,
      reason: "Actual fixture source review",
      policy: {
        purpose: "chargeback",
        scope: { kind: "organization" },
        state: "approved",
        title: "Actual fixture approved guidance",
        effectiveFrom: "2026-10-01T00:00:00.000Z",
        expiresAt: null,
        sourceRefs: ["fixture actual lease policy"],
        wording: "Fixture approved responsibility wording",
        timing: "after_responsibility_review",
        reviewConditions: ["assessment", "lease_evidence", "staff_review"],
      },
    },
    { db, at },
  );
}
async function assess() {
  await transitionMaintenanceTicket(
    staff,
    id,
    {
      op: "assessment",
      operationId: randomUUID(),
      expectedVersion: await version(),
      outcome: "work_required",
      scope: "Actual inspected fixture work",
      evidence_refs: ["fixture actual assessment"],
    },
    db,
  );
}
async function associate() {
  await apply(
    staff,
    id,
    {
      op: "association",
      operationId: randomUUID(),
      expectedVersion: await version(),
      association: {
        kind: "lease",
        propertyId: "901",
        unitId: "801",
        leaseId: "701",
        ownerRef: "601",
        eventDate: "2026-10-09",
        evidenceRef: "fixture reviewed event-date tenancy/ownership",
        reason: "Actual fixture lease and owner relation",
      },
    },
    {
      db,
      verifyAssociation: async () => ({
        unitLabel: "Fixture 801",
        ownerLabel: "Fixture owner",
        sourceHash: "a".repeat(64),
      }),
    },
  );
}
const review = (): ResponsibilityReviewInput => ({
  state: "reviewed",
  expectedPolicy: { id: "chargeback_organization", version: 1 },
  expectedAssessmentVersion: 1,
  reason: "Actual staff reviewed assessment and actual lease policy",
  evidenceRefs: ["fixture inspected work"],
  leaseEvidenceRefs: ["fixture actual reviewed lease"],
  allocations: [
    {
      party: "resident",
      identityRef: "701",
      basisPoints: 10000,
      evidenceRef: "fixture reviewed actual responsibility evidence",
    },
  ],
  proposedAmountCents: null,
  amountBasis: "",
  residentConcern: "",
  reviewedByStaff: true,
});
it("holds liability without actual policy, completed assessment and verified event-date lease, and keeps unknown amounts unknown", async () => {
  await expect(
    apply(
      staff,
      id,
      {
        op: "responsibility_review",
        operationId: randomUUID(),
        expectedVersion: await version(),
        review: review(),
      },
      { db, at },
    ),
  ).rejects.toMatchObject({ status: 409 });
  await policy();
  await assess();
  await expect(
    apply(
      staff,
      id,
      {
        op: "responsibility_review",
        operationId: randomUUID(),
        expectedVersion: await version(),
        review: review(),
      },
      { db, at },
    ),
  ).rejects.toMatchObject({ status: 409 });
  await associate();
  const t = await apply(
    staff,
    id,
    {
      op: "responsibility_review",
      operationId: randomUUID(),
      expectedVersion: await version(),
      review: review(),
    },
    { db, at },
  );
  expect(t.responsibility_decision).toMatchObject({
    state: "reviewed",
    proposedAmountCents: null,
    ledgerPosting: "not_executed",
    paymentVerification: "not_established",
  });
  expect((await context(staff, id, { db, at })).approvedGuidance).toBe(
    "Fixture approved responsibility wording",
  );
  for (const collection of [
    "action_executions",
    "maintenance_financial_entries",
    "workflow_communication_sequences",
  ])
    expect((await db.collection(collection).get()).size).toBe(0);
});
it("a dispute preserves the prior proposal and never cancels work, while concurrent corrections and replay retain exact history", async () => {
  await policy();
  await assess();
  await associate();
  const original = {
    op: "responsibility_review" as const,
    operationId: randomUUID(),
    expectedVersion: await version(),
    review: {
      ...review(),
      proposedAmountCents: 12000,
      amountBasis: "Fixture actual reviewed amount",
    },
  };
  await apply(staff, id, original, { db, at });
  const currentVersion = await version(),
    disputed = {
      ...review(),
      state: "disputed" as const,
      allocations: [],
      proposedAmountCents: null,
      reason: "Actual resident disputes the recorded proposal",
      residentConcern: "Actual reported fixture concern",
    };
  const changes = await Promise.allSettled([
    apply(
      staff,
      id,
      {
        op: "responsibility_review",
        operationId: randomUUID(),
        expectedVersion: currentVersion,
        review: disputed,
      },
      { db, at },
    ),
    apply(
      staff,
      id,
      {
        op: "responsibility_review",
        operationId: randomUUID(),
        expectedVersion: currentVersion,
        review: { ...disputed, reason: "Concurrent correction must not overwrite" },
      },
      { db, at },
    ),
  ]);
  expect(changes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  const current = await getMaintenanceTicket(staff, id, db);
  expect(current?.status).not.toBe("Closed");
  expect(current?.workflow_stage).toBe("owner_decision");
  expect(
    (await apply(staff, id, original, { db, at })).responsibility_decision?.state,
  ).toBe("disputed");
  const events = (await history(staff, id, { db, at })).events;
  expect(
    events.find((e) => e.responsibility_snapshot?.state === "disputed")
      ?.previous_responsibility,
  ).toMatchObject({ version: 1, proposedAmountCents: 12000 });
  expect((await context(staff, id, { db, at })).approvedGuidance).toBeNull();
});
it("material assessment/policy changes flag current responsibility and hide guidance without rewriting original decisions", async () => {
  await policy();
  await assess();
  await associate();
  await apply(
    staff,
    id,
    {
      op: "responsibility_review",
      operationId: randomUUID(),
      expectedVersion: await version(),
      review: review(),
    },
    { db, at },
  );
  const before = (await getMaintenanceTicket(staff, id, db))!.responsibility_decision;
  await assess();
  const c = await context(staff, id, { db, at });
  expect(c.responsibilityNeedsReview).toBe(true);
  expect(c.approvedGuidance).toBeNull();
  expect(c.ticket.responsibility_decision).toEqual(before);
  await expect(
    apply(
      staff,
      id,
      {
        op: "responsibility_review",
        operationId: randomUUID(),
        expectedVersion: await version(),
        review: review(),
      },
      { db, at },
    ),
  ).rejects.toMatchObject({ status: 409 });
});
it("attributed corrected urgency retains original facts and cannot be submitted by a vendor or stale policy review", async () => {
  await db
    .collection("maintenance_tickets")
    .doc(id)
    .update({ summary: "Original fixture gas report", priority: "Emergency" });
  const command = {
    op: "urgency_review" as const,
    operationId: randomUUID(),
    expectedVersion: await version(),
    review: {
      facts: {
        summary: "Verified fixture dishwasher gasket",
        description: "Staff inspected actual harmless gasket part",
        damageOrAccess: "",
        happeningNow: false,
      },
      expectedPolicy: { id: null, version: null },
      reason: "Actual report term corrected after inspection",
      evidenceRefs: ["fixture inspected part"],
      reviewedActualFacts: true as const,
    },
  };
  await expect(
    apply({ ...staff, role: "Vendor" as never }, id, command, { db, at }),
  ).rejects.toMatchObject({ status: 403 });
  const changed = await apply(staff, id, command, { db, at });
  expect(changed.priority).toBe("Normal");
  expect(changed.summary).toBe("Original fixture gas report");
  const event = (await history(staff, id, { db, at })).events.find(
    (e) => e.kind === "urgency_review",
  );
  expect(event?.urgency_review).toMatchObject({
    originalFacts: { summary: "Original fixture gas report" },
    reviewedFacts: { summary: "Verified fixture dishwasher gasket" },
  });
});
