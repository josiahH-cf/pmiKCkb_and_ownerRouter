import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
const state = vi.hoisted(() => ({ db: null as Firestore | null }));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => state.db }));
vi.mock("@/lib/lease-renewal/pricing-policy-dependencies", () => ({
  pricingPolicyDependencies: () => ({
    store: new RenewalPricingPolicyStore(state.db!),
    verifier: {
      portfolio: async (id: string) => id === "55",
      lease: async (id: string) => {
        if (id !== "115")
          throw new EditableLayerError("Actual source identity unavailable.", 409);
        return {
          leaseId: id,
          portfolioId: "55",
          currentRent: 1201,
          cycleDate: "2026-12-31",
          rentSource: "Synthetic verified source",
        };
      },
    },
  }),
}));
import { GET, POST } from "@/app/api/lease-renewal/pricing-policy/route";
import { setAuthResolverForTest, type AuthenticatedUser } from "@/lib/auth/session";
import {
  RenewalPricingPolicyStore,
  RENEWAL_PRICING_COLLECTIONS,
} from "@/lib/firestore/renewal-pricing-policies";
import { EditableLayerError } from "@/lib/firestore/errors";
const admin: AuthenticatedUser = {
  uid: "policy-http-admin",
  email: "policy-http-admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
let app: App, db: Firestore, env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "pmi-kc-kb-policy-http-test",
    firestore: FIRESTORE_EMULATOR_TARGET,
  });
  app = initializeApp(
    { projectId: "pmi-kc-kb-policy-http-test" },
    `policy-http-${process.pid}`,
  );
  db = getFirestore(app);
  state.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  await env.clearFirestore();
  setAuthResolverForTest(async () => admin);
});
afterAll(async () => {
  setAuthResolverForTest(null);
  await env.cleanup();
  await deleteApp(app);
  vi.unstubAllEnvs();
});
const policy = (kind = "percentage", value: number | null = 3.5) => ({
  id: randomUUID(),
  name: `Synthetic ${kind}`,
  kind,
  value,
  effectiveFrom: "2026-10-01",
  effectiveThrough: null,
  enabled: true,
  purpose: "Synthetic reviewed configuration",
});
const post = (body: unknown) =>
  POST(
    new Request("http://local.test/api/lease-renewal/pricing-policy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const save = (p: ReturnType<typeof policy>) => ({
  action: "policy",
  policy: p,
  expectedVersion: 0,
  operationId: randomUUID(),
});
it("actual Admin HTTP creates and reads all four policy types while strict invalid configuration leaves no extra record", async () => {
  for (const [kind, value] of [
    ["percentage", 3.5],
    ["fixed_dollar", 40.25],
    ["no_increase", null],
    ["manual_review", null],
  ] as const) {
    const r = await post(save(policy(kind, value)));
    expect(r.status).toBe(200);
    expect((await r.json()).policy).toMatchObject({ kind, value, version: 1 });
  }
  const catalog = await GET(
    new Request("http://local.test/api/lease-renewal/pricing-policy"),
  );
  expect(catalog.status).toBe(200);
  expect((await catalog.json()).policies).toHaveLength(4);
  expect((await post(save({ ...policy(), effectiveFrom: "2026-02-30" }))).status).toBe(
    400,
  );
  expect((await db.collection(RENEWAL_PRICING_COLLECTIONS.policies).get()).size).toBe(4);
});
it("actual lost-response replay returns one accepted policy and rejects changed intent or stale edits without overwriting the immutable version", async () => {
  const body = save(policy());
  expect((await post(body)).status).toBe(200);
  expect((await post(body)).status).toBe(200);
  expect((await post({ ...body, policy: { ...body.policy, value: 4 } })).status).toBe(
    409,
  );
  expect(
    (
      await post({
        ...body,
        operationId: randomUUID(),
        policy: { ...body.policy, value: 5 },
      })
    ).status,
  ).toBe(409);
  expect((await db.collection(RENEWAL_PRICING_COLLECTIONS.policies).get()).size).toBe(1);
  expect((await db.collection(RENEWAL_PRICING_COLLECTIONS.versions).get()).size).toBe(1);
  expect(
    (
      await db.collection(RENEWAL_PRICING_COLLECTIONS.policies).doc(body.policy.id).get()
    ).get("value"),
  ).toBe(3.5);
});
it("ordinary Editor lease assignment remains allowed while Admin policy writes, canary writes, spoofed actors and unknown source targets are refused", async () => {
  const p = policy();
  expect((await post(save(p))).status).toBe(200);
  const editor = {
    ...admin,
    uid: "policy-http-editor",
    email: "policy-http-editor@pmikcmetro.com",
    role: "Editor" as const,
  };
  setAuthResolverForTest(async () => editor);
  expect((await post(save(policy()))).status).toBe(403);
  const assignment = {
    action: "assignment",
    scope: "lease",
    sourceId: "115",
    policyId: p.id,
    expectedVersion: 0,
    operationId: randomUUID(),
    reason: "Synthetic deliberate assignment",
  };
  expect((await post(assignment)).status).toBe(200);
  expect(
    (await post({ ...assignment, sourceId: "999", operationId: randomUUID() })).status,
  ).toBe(409);
  expect((await post({ ...assignment, actorUid: admin.uid })).status).toBe(400);
  setAuthResolverForTest(async () => ({
    ...editor,
    uid: "canary-editor",
    email: "canary-editor@pmikcmetro.com",
  }));
  expect((await post({ ...assignment, operationId: randomUUID() })).status).toBe(403);
  expect((await db.collection(RENEWAL_PRICING_COLLECTIONS.assignments).get()).size).toBe(
    1,
  );
  expect((await db.collection("gmail_communication_sequences").get()).size).toBe(0);
});
