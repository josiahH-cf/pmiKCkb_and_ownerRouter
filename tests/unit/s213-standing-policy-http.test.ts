import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  actor: vi.fn(async () => ({
    uid: "fixture-admin",
    hd: "pmikcmetro.com",
    email: "fixture-admin@pmikcmetro.com",
    role: "Admin",
  })),
  live: vi.fn(),
  verify: vi.fn(),
  original: vi.fn(async () => ({ state: "not_recorded" })),
  save: vi.fn(async () => ({ version: 1 })),
  stop: vi.fn(async () => ({ state: "cancelled" })),
  list: vi.fn(async () => []),
}));
vi.mock("@/lib/auth/session", () => ({ requireCapabilityInSpace: m.actor }));
vi.mock("@/lib/operations/live-context", () => ({
  requireOperationsLiveContext: m.live,
}));
vi.mock("@/lib/maintenance/policy-source", () => ({
  verifyMaintenancePolicySource: m.verify,
}));
vi.mock("@/lib/firestore/maintenance-property-preapprovals", async (importActual) => ({
  ...(await importActual<object>()),
  readMaintenancePolicyOperation: m.original,
  applyMaintenancePolicy: m.save,
  stopMaintenancePolicyOperation: m.stop,
  listMaintenancePropertyPreapprovals: m.list,
}));
import { GET, POST, PATCH } from "@/app/api/maintenance/property-preapprovals/route";
import { EditableLayerError } from "@/lib/firestore/errors";
const id = "6883aff1-e31d-4718-922d-aaeed620ad2f",
  url = "https://fixture.invalid/api/maintenance/property-preapprovals";
const command = {
  operation: "set_policy",
  operation_id: id,
  property_key: "901",
  expected_version: 0,
  amount_cents: 25000,
  effective_from_iso: "2026-10-01T00:00:00Z",
  note: "Fixture current owner agreement",
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
const request = (method: string, body: unknown) =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  m.original.mockResolvedValue({ state: "not_recorded" });
});
it("one reviewed Save checks current source once and an original committed retry avoids a second source probe", async () => {
  expect((await POST(request("POST", command))).status).toBe(200);
  expect(m.verify).toHaveBeenCalledTimes(1);
  m.original.mockResolvedValue({ state: "committed" });
  expect((await POST(request("POST", command))).status).toBe(200);
  expect(m.verify).toHaveBeenCalledTimes(1);
});
it("rejects duplicate query targets and legacy bare limits before a policy writer or provider effect", async () => {
  expect(
    (await GET(new Request(url + "?property_key=901&property_key=902"))).status,
  ).toBe(400);
  expect(m.list).not.toHaveBeenCalled();
  const r = await POST(
    request("POST", { operation: "set", property_key: "901", amount_cents: 25000 }),
  );
  expect(r.status).toBe(410);
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(m.save).not.toHaveBeenCalled();
  expect(m.verify).not.toHaveBeenCalled();
});
it("authorization and Production/Live refusal precede decoding or writers; errors remain private", async () => {
  m.actor.mockRejectedValueOnce(new EditableLayerError("Denied", 403));
  const denied = await POST(request("POST", null));
  expect(denied.status).toBe(403);
  expect(denied.headers.get("cache-control")).toBe("private, no-store");
  expect(m.live).not.toHaveBeenCalled();
  m.live.mockImplementationOnce(() => {
    throw new EditableLayerError("Live required", 409);
  });
  expect(
    (
      await PATCH(
        request("PATCH", { operation: "stop_before_admission", operation_id: id }),
      )
    ).status,
  ).toBe(409);
  expect(m.stop).not.toHaveBeenCalled();
  expect(
    (
      await PATCH(
        request("PATCH", { operation: "stop_before_admission", operation_id: id }),
      )
    ).status,
  ).toBe(200);
  expect(m.stop).toHaveBeenCalledTimes(1);
});
