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
import {
  applyMaintenanceCaseOperation as apply,
  readMaintenanceCaseHistory as read,
  MAINTENANCE_CASE_COLLECTIONS as C,
} from "@/lib/firestore/maintenance-case-records";
import {
  createMaintenanceTicket,
  readMaintenanceTicketOperation,
  stopOriginalMaintenanceEdit,
  transitionMaintenanceTicket,
} from "@/lib/firestore/maintenance-tickets";
import type {
  MaintenanceCaseCommand,
  FinancialEntryInput,
} from "@/lib/maintenance/case-model";
import { stampProductRecordRetention } from "@/lib/operations/product-record-retention";
const actor = {
  uid: "history-staff",
  email: "history-staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
let env: RulesTestEnvironment, app: ReturnType<typeof initializeApp>, db: Firestore;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "pmi-kc-kb-case-facts-test",
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp(
    { projectId: "pmi-kc-kb-case-facts-test" },
    `case-facts-${process.pid}`,
  );
  db = getFirestore(app);
});
beforeEach(async () => {
  await env.clearFirestore();
  await db.collection("vendors").doc("vendor-one").set({
    id: "vendor-one",
    uid: "vendor-uid",
    email: "vendor@fixture.invalid",
    status: "active",
    data_mode: "live",
  });
});
afterAll(async () => {
  await env.cleanup();
  await deleteApp(app);
});
async function ticket() {
  return createMaintenanceTicket(
    actor,
    {
      creation_id: randomUUID(),
      summary: "Local fixture active maintenance",
      description: "Current fixture work, not historical backfill",
      priority: "Normal",
      unit: {
        unitId: "unit:17",
        label: "Fixture unit seventeen",
        confidence: "Verified",
      },
    },
    db,
    "91",
  );
}
function financial(
  kind: FinancialEntryInput["kind"] = "vendor_invoice",
  amount = 6000,
): FinancialEntryInput {
  return {
    id: randomUUID(),
    expectedEntryVersion: 0,
    kind,
    amountCents: amount,
    currency: "USD",
    serviceDate: "2026-10-09",
    invoiceDate: kind === "vendor_invoice" ? "2026-10-09" : null,
    paymentDate: kind === "payment_claim" ? "2026-10-09" : null,
    vendorId: "vendor-one",
    sourceRef: "fixture-invoice:original",
    externalIdentity: "invoice-original",
    sourceTotalCents: 10000,
    sourceLines: [{ description: "Reviewed original fixture work", amountCents: 10000 }],
    reviewState: "reviewed",
    correctionReason: "Reviewed real fixture invoice attribution",
  };
}
type CaseBody = MaintenanceCaseCommand extends infer C
  ? C extends MaintenanceCaseCommand
    ? Omit<C, "operationId" | "expectedVersion">
    : never
  : never;
async function act(id: string, command: CaseBody, extra: Record<string, unknown> = {}) {
  const current = (await read(actor, id, { db })).ticket;
  return apply(
    actor,
    id,
    {
      ...command,
      operationId: randomUUID(),
      expectedVersion: current.record_version ?? 0,
    } as MaintenanceCaseCommand,
    { db, ...extra },
  );
}
it("corrects the event-date association once without losing the old facts, and original receipt recovery survives source outage", async () => {
  const t = await ticket(),
    operationId = randomUUID(),
    command: MaintenanceCaseCommand = {
      op: "association",
      operationId,
      expectedVersion: 1,
      association: {
        kind: "lease",
        propertyId: "91",
        unitId: "17",
        leaseId: "71",
        eventDate: "2026-10-08",
        evidenceRef: "fixture-agreement:71",
        reason: "Reviewed the lease applicable to this work date",
      },
    };
  const options = {
    db,
    verifyAssociation: async () => ({
      unitLabel: "Fixture unit seventeen",
      sourceHash: "a".repeat(64),
    }),
  };
  await apply(actor, t.id, command, options);
  await apply(actor, t.id, command, {
    db,
    verifyAssociation: async () => {
      throw Error("Source outage");
    },
  });
  expect(
    await readMaintenanceTicketOperation(actor, t.id, operationId, db),
  ).toMatchObject({ state: "committed", committed_version: 2 });
  await act(
    t.id,
    {
      op: "association",
      association: {
        ...command.association,
        leaseId: "72",
        reason: "Corrected exact tenancy from retained fixture agreement",
      },
    },
    options,
  );
  const result = await read(actor, t.id, { db, at: "2038-10-09T00:00:00Z" });
  expect(result.ticket).toMatchObject({
    record_version: 3,
    maintenance_association: {
      leaseId: "72",
      version: 2,
      tenancyBasis: "staff_reviewed_event_date_evidence",
    },
  });
  expect(result.events.filter((e) => e.kind === "association")).toHaveLength(2);
  expect(result.events.at(-1)).toMatchObject({
    previous_association: { leaseId: "71" },
    occurred_at: "2026-10-08",
    occurrence_precision: "date",
  });
  expect(
    (await db.collection(C.events).get()).docs.every(
      (d) => d.data().product_retention_class === "indefinite",
    ),
  ).toBe(true);
});
it("concurrent financial review cannot lose an edit; invoice allocations remain globally bounded across cases and duplicate identities are refused", async () => {
  const one = await ticket(),
    two = await ticket(),
    entry = financial();
  const attempts = await Promise.allSettled([
    apply(
      actor,
      one.id,
      { op: "financial", operationId: randomUUID(), expectedVersion: 1, entry },
      { db },
    ),
    apply(
      actor,
      one.id,
      {
        op: "financial",
        operationId: randomUUID(),
        expectedVersion: 1,
        entry: { ...entry, id: randomUUID() },
      },
      { db },
    ),
  ]);
  expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  await act(two.id, {
    op: "financial",
    entry: { ...financial("vendor_invoice", 4000), serviceDate: "2026-10-07" },
  });
  await expect(
    act(two.id, { op: "financial", entry: financial("vendor_invoice", 1) }),
  ).rejects.toMatchObject({ status: 409 });
  const three = await ticket();
  await expect(
    act(three.id, { op: "financial", entry: financial("vendor_invoice", 1) }),
  ).rejects.toMatchObject({ status: 409 });
  expect((await db.collection(C.financial).get()).size).toBe(2);
  expect((await db.collection("action_executions").get()).empty).toBe(true);
});
it("financial corrections retain original evidence and legal holds, reject reused operations and expose exact current amounts", async () => {
  const t = await ticket(),
    entry = financial(),
    operationId = randomUUID(),
    command: MaintenanceCaseCommand = {
      op: "financial",
      operationId,
      expectedVersion: 1,
      entry,
    };
  await apply(actor, t.id, command, { db });
  const first = await db.collection(C.financial).get(),
    source = await db.collection(C.sources).get();
  await first.docs[0].ref.update({ legal_hold: true });
  await source.docs[0].ref.update({ legal_hold: true });
  await act(t.id, {
    op: "financial",
    entry: {
      ...entry,
      expectedEntryVersion: 1,
      amountCents: 7000,
      correctionReason: "Reviewed corrected partial allocation",
    },
  });
  await expect(
    apply(actor, t.id, { ...command, entry: { ...entry, amountCents: 8000 } }, { db }),
  ).rejects.toMatchObject({ status: 409 });
  const history = await read(actor, t.id, { db });
  expect(history.totals.invoicedCents).toBe(7000);
  expect(history.events.at(-1)).toMatchObject({
    previous_financial_snapshot: { amountCents: 6000 },
    financial_snapshot: { amountCents: 7000 },
  });
  expect((await first.docs[0].ref.get()).data()?.legal_hold).toBe(true);
  expect((await source.docs[0].ref.get()).data()?.legal_hold).toBe(true);
  expect((await db.collection("maintenance_ticket_operations").get()).size).toBe(2);
});
it("invoice and payment claims remain distinct after ten years, and expired raw sources retain no transcript or exposed source link", async () => {
  const t = await ticket();
  await act(t.id, { op: "financial", entry: financial() });
  await act(t.id, { op: "financial", entry: financial("owner_charge", 9000) });
  await act(t.id, { op: "financial", entry: financial("payment_claim", 3000) });
  await act(t.id, {
    op: "reviewed_summary",
    summary:
      "PMI reviewed the fixture valve replacement; physical work evidence is retained separately.",
    occurredAt: "2026-10-08T12:00:00Z",
    evidenceRefs: ["fixture-work:photo"],
    reviewedFactualSummary: true,
    rawSources: [
      {
        kind: "transcript",
        sourceRef: "private-source:call",
        expiresAt: "2027-10-09T00:00:00Z",
        legalHold: false,
      },
    ],
  });
  const result = await read(actor, t.id, { db, at: "2038-10-09T00:00:00Z" });
  expect(result.totals).toMatchObject({
    invoicedCents: 6000,
    ownerChargeCents: 9000,
    claimedPaidCents: 3000,
    verifiedPaidCents: null,
    balanceCents: null,
    paymentState: "unknown",
  });
  expect(result.events.at(-1)?.raw_sources).toEqual([
    { kind: "transcript", expiresAt: "2027-10-09T00:00:00Z", availability: "expired" },
  ]);
  expect(JSON.stringify(result.events)).not.toContain("private-source:call");
});
it("admission, stale versions and forged verification fail atomically; raw clients cannot read or write the new core collections", async () => {
  const t = await ticket();
  for (const bad of [
    { ...actor, role: "Vendor" },
    { ...actor, email: "canary-admin@pmikcmetro.com" },
    { ...actor, hd: "external.invalid" },
  ])
    await expect(
      apply(
        bad as typeof actor,
        t.id,
        {
          op: "financial",
          operationId: randomUUID(),
          expectedVersion: 1,
          entry: financial(),
        },
        { db },
      ),
    ).rejects.toMatchObject({ status: 403 });
  await expect(
    apply(
      actor,
      t.id,
      {
        op: "financial",
        operationId: randomUUID(),
        expectedVersion: 0,
        entry: financial(),
      },
      { db },
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    apply(
      actor,
      t.id,
      {
        op: "financial",
        operationId: randomUUID(),
        expectedVersion: 1,
        entry: {
          ...financial(),
          kind: "payment_observation",
          verification: { kind: "provider_readback" },
        },
      } as unknown as MaintenanceCaseCommand,
      { db },
    ),
  ).rejects.toBeTruthy();
  expect((await db.collection(C.events).get()).docs.map((d) => d.data().kind)).toEqual([
    "create",
  ]);
  const client = env
    .authenticatedContext("history-staff", {
      email: actor.email,
      hd: actor.hd,
      role: "Editor",
    })
    .firestore();
  const { doc, getDoc, setDoc } = await import("firebase/firestore");
  for (const collection of Object.values(C)) {
    await expect(getDoc(doc(client, collection, "guessed"))).rejects.toBeTruthy();
    await expect(
      setDoc(doc(client, collection, "guessed"), { kind: "forged" }),
    ).rejects.toBeTruthy();
  }
});
it("pages every durable event without a raw-source loophole and labels continued legacy work as starting state", async () => {
  const t = await ticket();
  await db.collection("maintenance_tickets").doc(t.id).update({
    lifecycle_origin: "legacy_starting_state",
    lifecycle_started_at: "2026-10-09T00:00:00Z",
  });
  const batch = db.batch();
  for (let i = 0; i < 123; i++) {
    const id = `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    batch.set(
      db.collection(C.events).doc(id),
      stampProductRecordRetention("maintenance_case_events", {
        id,
        ticket_id: t.id,
        ticket_version: 1,
        kind: "reviewed_summary",
        actor_kind: "staff",
        actor_id: actor.uid,
        occurred_at: "2026-10-09T00:00:00Z",
        recorded_at: "2026-10-09T00:00:00Z",
        summary: "Reviewed fixture fact",
        evidence_refs: ["fixture:retained"],
        association: null,
      }),
    );
  }
  await batch.commit();
  let cursor: string | null = null,
    count = 0;
  do {
    const page = await read(actor, t.id, { db, after: cursor });
    count += page.events.length;
    cursor = page.nextCursor;
    expect(page.coverage).toMatchObject({
      origin: "legacy_starting_state",
      historicalBackfill: false,
    });
  } while (cursor);
  expect(count).toBe(124);
});

it("the owning creation and lifecycle transactions append the same durable timeline, rather than a disconnected financial-only history", async () => {
  const t = await ticket();
  await transitionMaintenanceTicket(
    actor,
    t.id,
    {
      op: "assessment",
      operationId: randomUUID(),
      expectedVersion: 1,
      outcome: "work_required",
      scope: "Review actual fixture work scope",
      evidence_refs: ["fixture-assessment:one"],
    },
    db,
  );
  const history = await read(actor, t.id, { db });
  expect(history.events.map((event) => event.kind)).toEqual(["create", "assessment"]);
  expect(history.events[1]).toMatchObject({
    actor_kind: "staff",
    actor_id: actor.uid,
    ticket_version: 2,
  });
});

it("an exact app-only stop races commitment atomically and fences late requests without undoing committed work", async () => {
  const t = await ticket(),
    operationId = randomUUID();
  await stopOriginalMaintenanceEdit(actor, t.id, operationId, db);
  await expect(
    apply(
      actor,
      t.id,
      {
        op: "reviewed_summary",
        operationId,
        expectedVersion: 1,
        summary: "Late original words",
        occurredAt: new Date().toISOString(),
        evidenceRefs: ["private-evidence:actual-fixture-review"],
        reviewedFactualSummary: true,
        rawSources: [],
      },
      { db },
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect((await readMaintenanceTicketOperation(actor, t.id, operationId, db)).state).toBe(
    "cancelled",
  );
  expect(
    (await db.collection("maintenance_tickets").doc(t.id).get()).data()?.record_version,
  ).toBe(1);
  const id = randomUUID();
  await apply(
    actor,
    t.id,
    {
      op: "reviewed_summary",
      operationId: id,
      expectedVersion: 1,
      summary: "Actual committed fixture",
      occurredAt: new Date().toISOString(),
      evidenceRefs: ["private-evidence:actual-fixture-review"],
      reviewedFactualSummary: true,
      rawSources: [],
    },
    { db },
  );
  const stopped = await stopOriginalMaintenanceEdit(actor, t.id, id, db);
  expect(stopped.state).toBe("committed");
  expect(stopped.committed_version).toBe(2);
  expect(
    (await read(actor, t.id, { db })).events.filter((e) => e.kind === "reviewed_summary"),
  ).toHaveLength(1);
  const t2 = await ticket(),
    raceId = randomUUID();
  const race = await Promise.allSettled([
    transitionMaintenanceTicket(
      actor,
      t2.id,
      {
        op: "note",
        text: "Exact racing app note",
        operationId: raceId,
        expectedVersion: 1,
      },
      db,
    ),
    stopOriginalMaintenanceEdit(actor, t2.id, raceId, db),
  ]);
  const result = await readMaintenanceTicketOperation(actor, t2.id, raceId, db);
  expect(["committed", "cancelled"]).toContain(result.state);
  expect(race[1].status).toBe("fulfilled");
  const history = (await read(actor, t2.id, { db })).events;
  expect(history.filter((e) => e.kind === "note")).toHaveLength(
    result.state === "committed" ? 1 : 0,
  );
});
