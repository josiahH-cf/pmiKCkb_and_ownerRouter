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
  applyOperatingPolicy as apply,
  readOperatingPolicyOperation as original,
  type ApplyOperatingPolicy,
} from "@/lib/firestore/maintenance-operating-policies";
import {
  readApplicableOperatingPolicy as read,
  OPERATING_POLICY_COLLECTIONS as C,
} from "@/lib/firestore/maintenance-operating-policy-reader";
import { createMaintenanceTicket } from "@/lib/firestore/maintenance-tickets";
import { createUnverifiedIntakeFromPublic } from "@/lib/firestore/maintenance-unverified-intake";
const admin = {
    uid: "operating-admin",
    email: "operating-admin@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Admin" as const,
  },
  staff = { ...admin, uid: "operating-staff", role: "Editor" as const };
let env: RulesTestEnvironment, app: ReturnType<typeof initializeApp>, db: Firestore;
const at = "2026-10-10T01:00:00.000Z";
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "pmi-kc-kb-operating-policy-test",
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp(
    { projectId: "pmi-kc-kb-operating-policy-test" },
    `operating-${process.pid}`,
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
function input(expectedVersion = 0): ApplyOperatingPolicy {
  return {
    op: "save_version",
    operationId: randomUUID(),
    expectedVersion,
    reviewedExactPolicy: true,
    reason: "Fixture reviewed approved source",
    policy: {
      purpose: "emergency",
      scope: { kind: "property", propertyId: "901" },
      state: "approved",
      title: "Actual local fixture approval",
      effectiveFrom: "2026-10-01T00:00:00.000Z",
      expiresAt: null,
      sourceRefs: ["fixture:actual-approved-policy"],
      rules: [],
      guidance: {
        emergency_fire: "Actual fixture approved emergency guidance",
        urgent_flooding: null,
        urgent_property: null,
        normal: null,
      },
      contacts: [],
    },
  };
}
const options = () => ({
  db,
  at,
  verifyProperty: async (id: string) => {
    expect(id).toBe("901");
  },
});
it("retains the current approved version while a draft or future approval is saved, and revocation cannot revive old approval", async () => {
  const first = await apply(admin, input(), options());
  const draft = input(1);
  if (draft.op !== "save_version") throw Error();
  draft.policy.state = "draft";
  await apply(admin, draft, options());
  expect((await read("emergency", "901", at, db)).policy?.version).toBe(1);
  const future = input(2);
  if (future.op !== "save_version") throw Error();
  future.policy.effectiveFrom = "2026-11-01T00:00:00.000Z";
  await apply(admin, future, options());
  expect((await read("emergency", "901", at, db)).policy?.version).toBe(1);
  expect(
    (await read("emergency", "901", "2026-11-02T00:00:00.000Z", db)).policy?.version,
  ).toBe(3);
  await apply(
    admin,
    {
      op: "revoke_version",
      operationId: randomUUID(),
      expectedVersion: 3,
      purpose: "emergency",
      scope: { kind: "property", propertyId: "901" },
      targetVersion: 1,
      reason: "Actual fixture withdrew current approval",
    },
    options(),
  );
  expect((await read("emergency", "901", at, db)).policy).toBeNull();
  expect(
    (await read("emergency", "901", "2026-11-02T00:00:00.000Z", db)).policy?.version,
  ).toBe(3);
  expect(
    (await db.collection(C.versions).doc(`${first.head.id}_v1`).get()).data()?.state,
  ).toBe("approved");
  expect(
    (await db.collection(C.versions).get()).docs.every(
      (s) => s.data().product_retention_class === "indefinite",
    ),
  ).toBe(true);
});
it("races exact CAS saves, recovers one original without another source probe and refuses substituted content", async () => {
  const first = input();
  await apply(admin, first, options());
  expect(
    (
      await apply(admin, first, {
        db,
        at,
        verifyProperty: async () => {
          throw Error("Must not probe settled receipt");
        },
      })
    ).version.version,
  ).toBe(1);
  if (first.op !== "save_version") throw Error();
  await expect(
    apply(admin, { ...first, reason: "Changed exact work" }, options()),
  ).rejects.toMatchObject({ status: 409 });
  const results = await Promise.allSettled([
    apply(admin, input(1), options()),
    apply(admin, input(1), options()),
  ]);
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect((await original(admin, first.operationId, db)).state).toBe("committed");
  expect((await original(staff, first.operationId, db)).state).toBe("not_recorded");
});
it("the same policy governs staff and public transactions while photos stay outstanding and no customer/provider effect occurs", async () => {
  await apply(admin, input(), options());
  const ticket = await createMaintenanceTicket(
    staff,
    {
      creation_id: randomUUID(),
      summary: "Fixture gas smell",
      description: "fixture actual report",
      priority: "Low",
      unit: { unitId: "unit:801", label: "Fixture 801", confidence: "Verified" },
    },
    db,
    "901",
  );
  const saved = await createUnverifiedIntakeFromPublic(
    {
      propertyKey: "901",
      dataMode: "live",
      jti: randomUUID(),
      tokenEpoch: 0,
      singleUse: true,
      summary: "Fixture gas smell",
      issueType: "Plumbing",
      ipHash: null,
      dailyCap: 20,
      signageCap: 20,
    },
    db,
    Date.parse(at),
  );
  expect(saved.triage.acknowledgement).toBe("Actual fixture approved emergency guidance");
  expect(saved.triage.photosNeeded).toBe(true);
  expect(ticket.operating_policy_decision?.policyVersion).toBe(
    saved.triage.policyDecision.policyVersion,
  );
  expect(ticket.priority).toBe("Emergency");
  for (const collection of ["action_executions", "workflow_communication_sequences"])
    expect((await db.collection(collection).get()).size).toBe(0);
});
it("denies staff policy approval and unverified properties and retains no false success", async () => {
  await expect(apply(staff, input(), options())).rejects.toMatchObject({ status: 403 });
  await expect(
    apply({ ...admin, email: "canary-admin@pmikcmetro.com" }, input(), options()),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    apply(admin, input(), {
      db,
      at,
      verifyProperty: async () => {
        throw Error("Unverified property");
      },
    }),
  ).rejects.toThrow("Unverified");
  expect((await db.collection(C.heads).get()).empty).toBe(true);
});
