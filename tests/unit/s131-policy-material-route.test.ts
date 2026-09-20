import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH, POST } from "@/app/api/admin/policy-material/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  decidePolicyMaterial,
  intakePolicyMaterial,
  listPolicyMaterial,
} from "@/lib/firestore/lease-renewal-policy-material";

// S131 (F11): the route's auth and dispatch are the unit under test; the schemas stay real and the
// repository is mocked (its persistence, binding and decision rules are covered by the store test).
vi.mock("@/lib/firestore/lease-renewal-policy-material", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/firestore/lease-renewal-policy-material")
    >();
  return {
    ...actual,
    listPolicyMaterial: vi.fn(),
    intakePolicyMaterial: vi.fn(),
    decidePolicyMaterial: vi.fn(),
  };
});

const admin = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};
const approver = { ...admin, uid: "approver-1", role: "Approver" as const };

const config = {
  schemaVersion: "policy-material/v1",
  productKey: "rhino",
  version: "v1",
  reference: "SYNTHETIC fixture",
  publicationSource: {
    system: "s21_publication",
    reference: "publication:synthetic-0000001",
    contentHash: "e".repeat(64),
  },
  review: {
    reviewer: "synthetic",
    reviewedAt: "2026-09-20T12:00:00Z",
    note: "SYNTHETIC",
  },
  effectiveFrom: "2026-01-01",
  applicability: { ruleVersion: "r1", condition: { kind: "always" } },
  requiredInputs: [],
  outputSlots: [{ slotId: "s", channel: "tenant_message", text: "SYNTHETIC wording." }],
};
const operationId = "00000000-0000-4000-8000-000000000001";
const record = {
  id: "rhino:v1",
  product_key: "rhino",
  version: "v1",
  state: "pending",
  revision: 1,
  config,
  submitted_at: "2026-09-20T12:00:00Z",
  submitted_by_uid: "admin-1",
};

function req(method: "POST" | "PATCH", body: unknown) {
  return new Request("http://localhost/api/admin/policy-material", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(listPolicyMaterial).mockReset();
  vi.mocked(intakePolicyMaterial).mockReset();
  vi.mocked(decidePolicyMaterial).mockReset();
});

afterEach(() => {
  setAuthResolverForTest(() => null);
});

describe("admin policy-material route (S131)", () => {
  it("lets an Admin list, submit as pending and decide one exact version", async () => {
    setAuthResolverForTest(() => admin);
    vi.mocked(listPolicyMaterial).mockResolvedValue([record as never]);
    vi.mocked(intakePolicyMaterial).mockResolvedValue({
      record: record as never,
      duplicate: false,
    });
    vi.mocked(decidePolicyMaterial).mockResolvedValue({
      record: { ...record, state: "approved", revision: 2 } as never,
      duplicate: false,
    });

    const list = await GET();
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toEqual({ policyMaterial: { records: [record] } });

    const submitted = await POST(req("POST", { config, operationId }));
    expect(submitted.status).toBe(200);
    await expect(submitted.json()).resolves.toMatchObject({
      policyMaterial: { duplicate: false, record: { state: "pending" } },
    });
    expect(intakePolicyMaterial).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "admin-1" }),
      expect.objectContaining({
        operationId,
        config: expect.objectContaining({ version: "v1" }),
      }),
    );

    const decided = await PATCH(
      req("PATCH", {
        productKey: "rhino",
        version: "v1",
        decision: "approve",
        reason: "SYNTHETIC",
        expectedRevision: 1,
        operationId,
      }),
    );
    expect(decided.status).toBe(200);
    await expect(decided.json()).resolves.toMatchObject({
      policyMaterial: { record: { state: "approved", revision: 2 } },
    });
  });

  it("blocks a non-Admin from every method (403, repository never runs)", async () => {
    setAuthResolverForTest(() => approver);
    expect((await GET()).status).toBe(403);
    expect((await POST(req("POST", { config, operationId }))).status).toBe(403);
    expect(
      (
        await PATCH(
          req("PATCH", {
            productKey: "rhino",
            version: "v1",
            decision: "approve",
            reason: "x",
            expectedRevision: 1,
            operationId,
          }),
        )
      ).status,
    ).toBe(403);
    expect(listPolicyMaterial).not.toHaveBeenCalled();
    expect(intakePolicyMaterial).not.toHaveBeenCalled();
    expect(decidePolicyMaterial).not.toHaveBeenCalled();
  });

  it("rejects a malformed body with a 400 before the repository runs", async () => {
    setAuthResolverForTest(() => admin);
    expect(
      (await POST(req("POST", { config: { ...config, premium: 9 }, operationId })))
        .status,
    ).toBe(400);
    expect((await POST(req("POST", { config, operationId: "not-a-uuid" }))).status).toBe(
      400,
    );
    expect(
      (
        await POST(
          req("POST", {
            config: {
              ...config,
              publicationSource: { ...config.publicationSource, system: "drive" },
            },
            operationId,
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await PATCH(
          req("PATCH", {
            productKey: "rhino",
            version: "v1",
            decision: "maybe",
            reason: "x",
            expectedRevision: 1,
            operationId,
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await PATCH(
          req("PATCH", {
            productKey: "rhino",
            version: "v1",
            decision: "approve",
            reason: "",
            expectedRevision: 1,
            operationId,
          }),
        )
      ).status,
    ).toBe(400);
    expect(intakePolicyMaterial).not.toHaveBeenCalled();
    expect(decidePolicyMaterial).not.toHaveBeenCalled();
  });
});
