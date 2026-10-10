import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
const fixture = vi.hoisted(() => ({ db: null as Firestore | null }));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => fixture.db }));
import {
  createMaintenanceTicket,
  transitionMaintenanceTicket as transition,
  getMaintenanceTicket,
  listMaintenanceTicketActivity,
  readMaintenanceTicketOperation,
  MAINTENANCE_TICKET_COLLECTIONS as C,
} from "@/lib/firestore/maintenance-tickets";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { PATCH, GET } from "@/app/api/maintenance/tickets/[ticketId]/route";
import type { TransitionMaintenanceTicketInput } from "@/lib/firestore/maintenance-tickets";
const staff = {
  uid: "lifecycle-staff",
  email: "lifecycle-staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
let env: RulesTestEnvironment, app: ReturnType<typeof initializeApp>, db: Firestore;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "pmi-kc-kb-s205-lifecycle-test",
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp(
    { projectId: "pmi-kc-kb-s205-lifecycle-test" },
    `lifecycle-${process.pid}`,
  );
  db = getFirestore(app);
  fixture.db = db;
});
beforeEach(async () => {
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
  await env.clearFirestore();
  setAuthResolverForTest(() => staff);
});
afterAll(async () => {
  setAuthResolverForTest(null);
  vi.unstubAllEnvs();
  await env.cleanup();
  await deleteApp(app);
});
async function create() {
  return createMaintenanceTicket(
    staff,
    {
      creation_id: randomUUID(),
      summary: "Local routine report",
      description: "Fixture report, no customer data",
      priority: "Normal",
      unit: { unitId: "unit:801", label: "Local fixture 801", confidence: "Verified" },
    },
    db,
    "901",
  );
}
const command = (body: Record<string, unknown>, version: number) =>
  ({
    ...body,
    expectedVersion: version,
    operationId: randomUUID(),
  }) as TransitionMaintenanceTicketInput;
async function apply(id: string, body: Record<string, unknown>) {
  const ticket = await getMaintenanceTicket(staff, id, db);
  return transition(staff, id, command(body, ticket!.record_version!), db);
}
it("persists assessment, PMI troubleshooting closeout and reopening without any provider or communication effect", async () => {
  const ticket = await create();
  expect(ticket).toMatchObject({ workflow_stage: "assessment", record_version: 1 });
  await expect(
    transition(
      staff,
      ticket.id,
      command({ op: "status", status: "Closed", reason: "Skip review" }, 1),
      db,
    ),
  ).rejects.toMatchObject({ status: 409 });
  const assessed = await apply(ticket.id, {
    op: "assessment",
    outcome: "resolved_troubleshooting",
    scope: "Fixture valve adjusted; no purchased work",
    evidence_refs: ["staff-note:fixture-observation"],
  });
  expect(assessed).toMatchObject({
    workflow_stage: "resolved_troubleshooting",
    assessment: { recorded_by_uid: staff.uid, version: 1 },
  });
  const closed = await apply(ticket.id, {
    op: "lifecycle",
    stage: "closed",
    reason: "PMI accepted troubleshooting evidence",
    evidence_refs: [],
  });
  expect(closed).toMatchObject({
    status: "Closed",
    workflow_stage: "closed",
    closed_reason: "PMI accepted troubleshooting evidence",
  });
  const reopened = await apply(ticket.id, {
    op: "reopen",
    reason: "The fixture issue recurred",
  });
  expect(reopened).toMatchObject({
    status: "Open",
    workflow_stage: "assessment",
    record_version: 4,
  });
  expect(
    (await listMaintenanceTicketActivity(staff, ticket.id, db)).map((a) => a.action),
  ).toEqual(["create", "assessment", "close", "reopen"]);
  for (const name of [
    "action_executions",
    "workflow_communication_sequences",
    "gmail_drafts",
  ])
    expect((await db.collection(name).get()).empty).toBe(true);
});
it("two stale tabs cannot overwrite each other and an exact operation replays once even after subsequent work", async () => {
  const ticket = await create(),
    one = command(
      {
        op: "assessment",
        outcome: "needs_information",
        scope: "First tab asks for fixture photos",
        evidence_refs: [],
      },
      1,
    ),
    two = command(
      {
        op: "assessment",
        outcome: "estimate_needed",
        scope: "Second tab sizes a different repair",
        evidence_refs: [],
      },
      1,
    );
  const results = await Promise.allSettled([
    transition(staff, ticket.id, one, db),
    transition(staff, ticket.id, two, db),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { status: 409 },
  });
  const admitted = results[0].status === "fulfilled" ? one : two;
  const later = await apply(ticket.id, {
    op: "note",
    text: "Later meaningful PMI progress",
  });
  expect((await transition(staff, ticket.id, admitted, db)).record_version).toBe(
    later.record_version,
  );
  expect(await listMaintenanceTicketActivity(staff, ticket.id, db)).toHaveLength(3);
  const receipt = await readMaintenanceTicketOperation(
    staff,
    ticket.id,
    admitted.operationId!,
    db,
  );
  expect(receipt).toMatchObject({
    state: "committed",
    committed_version: 2,
    ticket: { record_version: 3 },
  });
  await expect(
    transition(
      staff,
      ticket.id,
      {
        ...admitted,
        scope: "Changed words under an old ID",
      } as TransitionMaintenanceTicketInput,
      db,
    ),
  ).rejects.toMatchObject({ status: 409 });
});
it("scope/estimate changes invalidate the recorded owner decision and cannot schedule work on stale authority", async () => {
  const ticket = await create();
  await apply(ticket.id, {
    op: "assessment",
    outcome: "work_required",
    scope: "Replace the exact assessed fixture valve",
    evidence_refs: ["quote:local-1"],
  });
  await expect(
    apply(ticket.id, {
      op: "lifecycle",
      stage: "vendor_coordination",
      reason: "Try without authority",
      evidence_refs: [],
    }),
  ).rejects.toMatchObject({ status: 409 });
  await apply(ticket.id, { op: "estimate", amountCents: 24999 });
  await apply(ticket.id, {
    op: "owner-decision",
    decision: "approved",
    cost_basis: "total_including_tax_and_markup",
    evidence_ref: "owner-record:local-approval",
    reason: "Staff recorded the actual scoped total decision",
  });
  await apply(ticket.id, {
    op: "lifecycle",
    stage: "vendor_coordination",
    reason: "Coordinate the approved work",
    evidence_refs: [],
  });
  await apply(ticket.id, { op: "estimate", amountCents: 30000 });
  expect(
    (await getMaintenanceTicket(staff, ticket.id, db))?.owner_decision,
  ).toBeUndefined();
  await expect(
    apply(ticket.id, {
      op: "lifecycle",
      stage: "scheduled",
      reason: "Stale amount must refuse",
      evidence_refs: [],
    }),
  ).rejects.toMatchObject({ status: 409 });
});
it("completion evidence waits for PMI and server rejects vendor/canary closure, missing identity and missing retained evidence", async () => {
  const ticket = await create();
  await expect(
    transition(staff, ticket.id, { op: "note", text: "No durable ID" }, db),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    transition(
      { ...staff, role: "Vendor" } as never,
      ticket.id,
      command(
        {
          op: "lifecycle",
          stage: "closed",
          reason: "Vendor wants closure",
          evidence_refs: ["vendor:report"],
        },
        1,
      ),
      db,
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    transition(
      { ...staff, email: "canary-editor@pmikcmetro.com" },
      ticket.id,
      command(
        { op: "lifecycle", stage: "closed", reason: "Probe", evidence_refs: ["probe"] },
        1,
      ),
      db,
    ),
  ).rejects.toMatchObject({ status: 403 });
  await apply(ticket.id, {
    op: "assessment",
    outcome: "resolved_troubleshooting",
    scope: "Reported resolved but no evidence yet",
    evidence_refs: [],
  });
  await expect(
    apply(ticket.id, {
      op: "lifecycle",
      stage: "closed",
      reason: "No evidence",
      evidence_refs: [],
    }),
  ).rejects.toMatchObject({ status: 400 });
  expect((await getMaintenanceTicket(staff, ticket.id, db))?.status).toBe("Open");
});
it("actual HTTP requires current version and original operation identity; recovery is actor-private and read-only", async () => {
  const ticket = await create(),
    ctx = { params: Promise.resolve({ ticketId: ticket.id }) },
    body = command(
      {
        op: "assessment",
        outcome: "needs_information",
        scope: "Fixture photos requested",
        evidence_refs: [],
      },
      1,
    ),
    request = (input: unknown) =>
      new Request("http://local.test/api/maintenance/tickets/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
  expect((await PATCH(request({ op: "note", text: "No metadata" }), ctx)).status).toBe(
    400,
  );
  expect((await PATCH(request(body), ctx)).status).toBe(200);
  const result = await GET(
    new Request(
      `http://local.test/api/maintenance/tickets/x?operation_id=${body.operationId}`,
    ),
    ctx,
  );
  expect(await result.json()).toMatchObject({
    state: "committed",
    committed_version: 2,
    ticket: { id: ticket.id, workflow_stage: "needs_information" },
  });
  setAuthResolverForTest(() => ({ ...staff, uid: "different-staff" }));
  expect(
    await (
      await GET(
        new Request(
          `http://local.test/api/maintenance/tickets/x?operation_id=${body.operationId}`,
        ),
        ctx,
      )
    ).json(),
  ).toMatchObject({ state: "not_recorded", ticket: null });
  expect(await listMaintenanceTicketActivity(staff, ticket.id, db)).toHaveLength(2);
});
it("a rejected atomic transition commits neither changed ticket, activity nor operation receipt", async () => {
  const ticket = await create(),
    before = await getMaintenanceTicket(staff, ticket.id, db),
    rejected = new Proxy(db, {
      get(target, key) {
        if (key === "runTransaction")
          return (callback: (tx: unknown) => Promise<unknown>) =>
            target.runTransaction(async (tx) => {
              await callback(tx);
              throw Error("Deliberate rollback after staged writes");
            });
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  await expect(
    transition(
      staff,
      ticket.id,
      command(
        {
          op: "assessment",
          outcome: "needs_information",
          scope: "Must roll back",
          evidence_refs: [],
        },
        1,
      ),
      rejected,
    ),
  ).rejects.toThrow("rollback");
  expect(await getMaintenanceTicket(staff, ticket.id, db)).toEqual(before);
  expect((await db.collection(C.activity).get()).size).toBe(1);
  expect((await db.collection(C.operations).get()).empty).toBe(true);
});
