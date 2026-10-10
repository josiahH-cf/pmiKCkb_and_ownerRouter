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
vi.mock("@/lib/maintenance/policy-source", () => ({
  readCurrentMaintenancePolicyOwnerRefs: async () => [],
}));
import {
  applyMaintenancePolicy,
  stopMaintenancePolicyOperation,
  readMaintenancePolicyOperation,
  setMaintenancePropertyPreapproval,
  clearMaintenancePropertyPreapproval,
  getMaintenancePropertyPreapproval,
  MAINTENANCE_PROPERTY_PREAPPROVAL_ACTIVITY_COLLECTION as H,
  type ApplyMaintenancePolicyInput,
} from "@/lib/firestore/maintenance-property-preapprovals";
import {
  createMaintenanceTicket,
  transitionMaintenanceTicket as transition,
  getMaintenanceTicket,
} from "@/lib/firestore/maintenance-tickets";
import type { TransitionMaintenanceTicketInput } from "@/lib/firestore/maintenance-tickets";
const admin = {
    uid: "policy-admin",
    email: "policy-admin@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Admin" as const,
  },
  staff = {
    ...admin,
    uid: "policy-editor",
    email: "policy-editor@pmikcmetro.com",
    role: "Editor" as const,
  };
let env: RulesTestEnvironment, app: ReturnType<typeof initializeApp>, db: Firestore;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "pmi-kc-kb-s213-policy-test",
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp(
    { projectId: "pmi-kc-kb-s213-policy-test" },
    `policy-${process.pid}`,
  );
  db = getFirestore(app);
});
beforeEach(async () => {
  await env.clearFirestore();
});
afterAll(async () => {
  await env.cleanup();
  await deleteApp(app);
});
function set(version = 0): ApplyMaintenancePolicyInput {
  return {
    operation: "set_policy",
    property_key: "901",
    expected_version: version,
    operation_id: randomUUID(),
    amount_cents: 25000,
    effective_from_iso: "2026-10-01T00:00:00Z",
    note: "Actual fixture owner approved the recorded total and boundary",
    policy_terms: {
      scope: "property",
      property_keys: ["901"],
      owner_ref: null,
      comparison: "inclusive",
      cost_basis: "total_including_tax_and_markup",
      evidence_ref: "fixture-owner:agreement",
      expires_at: null,
      revoked_at: null,
    },
  };
}
it("records one version and original receipt atomically, rejects reused identity and stale edits, and retains revoked terms", async () => {
  const first = set(),
    one = await applyMaintenancePolicy(admin, first, db);
  expect(one.version).toBe(1);
  expect(await applyMaintenancePolicy(admin, first, db)).toEqual(one);
  await expect(
    applyMaintenancePolicy(
      admin,
      { ...first, amount_cents: 30000 } as ApplyMaintenancePolicyInput,
      db,
    ),
  ).rejects.toMatchObject({ status: 409 });
  const changes = await Promise.allSettled([
    applyMaintenancePolicy(admin, set(1), db),
    applyMaintenancePolicy(admin, set(1), db),
  ]);
  expect(changes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(changes.find((result) => result.status === "rejected")).toMatchObject({
    reason: { status: 409 },
  });
  const revoked = await applyMaintenancePolicy(
    admin,
    {
      operation: "revoke_policy",
      property_key: "901",
      expected_version: 2,
      operation_id: randomUUID(),
      reason: "Actual owner withdrew this policy",
    },
    db,
  );
  expect(revoked).toMatchObject({
    version: 3,
    policy_terms: { revoked_at: expect.any(String) },
  });
  expect((await db.collection(H).get()).size).toBe(3);
  expect(
    await readMaintenancePolicyOperation(admin, first.operation_id, db),
  ).toMatchObject({
    state: "committed",
    committed_version: 1,
    preapproval: { version: 3 },
  });
  expect(
    await readMaintenancePolicyOperation(
      { ...admin, uid: "another-admin" },
      first.operation_id,
      db,
    ),
  ).toMatchObject({ state: "not_recorded" });
});
it("amount-only edits/imports cannot discard reviewed semantics and unauthorized actors cannot create policy", async () => {
  await applyMaintenancePolicy(admin, set(), db);
  await expect(
    setMaintenancePropertyPreapproval(
      admin,
      {
        propertyKey: "901",
        amountCents: 30000,
        effectiveFromIso: "2026-10-09T00:00:00Z",
      },
      db,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    clearMaintenancePropertyPreapproval(admin, "901", db),
  ).rejects.toMatchObject({ status: 409 });
  for (const actor of [
    staff,
    { ...admin, email: "canary-admin@pmikcmetro.com" },
    { ...admin, hd: "external.invalid" },
    { ...admin, role: "Vendor" },
  ])
    await expect(
      applyMaintenancePolicy(actor as typeof admin, set(), db),
    ).rejects.toMatchObject({ status: 403 });
  expect((await getMaintenancePropertyPreapproval(staff, "901", db))?.version).toBe(1);
});
it("the actual ticket transaction applies current standing policy only after assessment and known basis; revocation blocks the next stage", async () => {
  const ticket = await createMaintenanceTicket(
    staff,
    {
      creation_id: randomUUID(),
      summary: "Local fixture valve issue",
      description: "Synthetic local test report",
      priority: "Normal",
      unit: { unitId: "unit:801", label: "Fixture 801", confidence: "Verified" },
    },
    db,
    "901",
  );
  async function apply(body: Record<string, unknown>) {
    const current = await getMaintenanceTicket(staff, ticket.id, db);
    return transition(
      staff,
      ticket.id,
      {
        ...body,
        operationId: randomUUID(),
        expectedVersion: current!.record_version,
      } as TransitionMaintenanceTicketInput,
      db,
    );
  }
  await apply({
    op: "assessment",
    outcome: "work_required",
    scope: "Replace exact fixture valve",
    evidence_refs: ["fixture-quote:one"],
  });
  await apply({ op: "estimate", amountCents: 25000 });
  await applyMaintenancePolicy(admin, set(), db);
  await expect(
    apply({
      op: "status",
      status: "Waiting on Vendor",
      reason: "Cannot evade unknown basis",
    }),
  ).rejects.toMatchObject({ status: 409 });
  await apply({
    op: "estimate",
    amountCents: 25000,
    costBasis: "total_including_tax_and_markup",
  });
  expect(
    (
      await apply({
        op: "lifecycle",
        stage: "vendor_coordination",
        reason: "Within actual standing policy",
        evidence_refs: [],
      })
    ).workflow_stage,
  ).toBe("vendor_coordination");
  expect(
    (await getMaintenanceTicket(staff, ticket.id, db))?.owner_decision,
  ).toBeUndefined();
  await applyMaintenancePolicy(
    admin,
    {
      operation: "revoke_policy",
      property_key: "901",
      expected_version: 1,
      operation_id: randomUUID(),
      reason: "Fixture owner revoked",
    },
    db,
  );
  await expect(
    apply({
      op: "lifecycle",
      stage: "scheduled",
      reason: "No stale spending authority",
      evidence_refs: [],
    }),
  ).rejects.toMatchObject({ status: 409 });
  for (const name of ["action_executions", "workflow_communication_sequences"])
    expect((await db.collection(name).get()).empty).toBe(true);
});

it("a cutoff blocks a late save, while an already committed policy wins the same cutoff race", async () => {
  const command = set();
  expect(
    await stopMaintenancePolicyOperation(admin, command.operation_id, db),
  ).toMatchObject({ state: "cancelled" });
  await expect(applyMaintenancePolicy(admin, command, db)).rejects.toMatchObject({
    status: 409,
  });
  expect(
    await getMaintenancePropertyPreapproval(admin, command.property_key, db),
  ).toBeNull();
  const accepted = set();
  await applyMaintenancePolicy(admin, accepted, db);
  expect(
    await stopMaintenancePolicyOperation(admin, accepted.operation_id, db),
  ).toMatchObject({ state: "committed", committed_version: 1 });
  expect(
    await readMaintenancePolicyOperation(admin, command.operation_id, db),
  ).toMatchObject({ state: "cancelled" });
});
