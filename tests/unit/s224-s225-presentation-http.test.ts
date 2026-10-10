import { beforeEach, it, expect, vi } from "vitest";
import { EditableLayerError } from "@/lib/firestore/errors";
import { can } from "@/lib/auth/roles";
const m = vi.hoisted(() => ({
  role: "Admin",
  live: vi.fn(),
  own: vi.fn(async () => ({
    actorUid: "fixture-admin",
    profile: null,
    retainedSignature: null,
  })),
  read: vi.fn(async () => null),
  original: vi.fn(async () => ({ state: "not_recorded" })),
  display: vi.fn(async () => null),
  save: vi.fn(async () => ({ version: 1 })),
  stop: vi.fn(async () => ({ state: "cancelled" })),
}));
vi.mock("@/lib/auth/session", () => ({
  requireCapability: async (capability: Parameters<typeof can>[1]) => {
    if (!can(m.role as Parameters<typeof can>[0], capability))
      throw new EditableLayerError("Denied", 403);
    return {
      uid: "fixture-admin",
      email: "fixture-admin@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: m.role,
    };
  },
}));
vi.mock("@/lib/operations/live-context", () => ({
  requireOperationsLiveContext: m.live,
}));
vi.mock("@/lib/firestore/presentation-settings", () => ({
  inspectOwnBusinessProfile: m.own,
  readBusinessProfile: m.read,
  readPresentationOperation: m.original,
  readApplicationPresentation: m.display,
  savePresentationSetting: m.save,
  stopPresentationOperation: m.stop,
}));
import * as profile from "@/app/api/staff/business-profile/route";
import * as display from "@/app/api/admin/application-presentation/route";
const id = "6883aff1-e31d-4718-922d-aaeed620ad2f",
  base = "https://fixture.invalid",
  paths = ["/api/staff/business-profile", "/api/admin/application-presentation"];
const business = {
  op: "save_profile",
  operationId: id,
  expectedVersion: 0,
  uid: "verified-fixture-staff",
  profile: {
    name: "Fixture staff",
    businessTitle: "Property Manager",
    phone: "",
    hours: "",
    website: "",
    source: "Fixture reviewed business details",
  },
  reason: "Reviewed fixture profile",
};
const branding = {
  op: "save_display_name",
  operationId: id,
  expectedVersion: 0,
  displayName: "Fixture workspace",
  reason: "Reviewed fixture name",
};
const request = (index: number, method: string, body: unknown) =>
  new Request(base + paths[index], {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  m.role = "Admin";
  m.live.mockReset();
  m.save.mockReset().mockResolvedValue({ version: 1 });
});
function privateResponse(r: Response) {
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(r.headers.get("x-content-type-options")).toBe("nosniff");
}
it("one explicit Save routes exact reviewed business fields and display text through their separate store commands", async () => {
  for (const [i, route, command] of [
    [0, profile, business],
    [1, display, branding],
  ] as const) {
    const r = await route.POST(request(i, "POST", command));
    expect(r.status).toBe(200);
    privateResponse(r);
    expect(m.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ uid: "fixture-admin" }),
      command,
    );
  }
  expect(m.save).toHaveBeenCalledTimes(2);
  expect(m.live).toHaveBeenCalledTimes(2);
});
it("Editor and Approver can inspect their own profile but cannot mutate business fields or inspect the Admin branding editor", async () => {
  for (const role of ["Editor", "Approver"]) {
    m.role = role;
    expect((await profile.GET(new Request(base + paths[0]))).status).toBe(200);
    for (const [i, route, command] of [
      [0, profile, business],
      [1, display, branding],
    ] as const) {
      const denied = await route.POST(request(i, "POST", command));
      expect(denied.status).toBe(403);
      privateResponse(denied);
    }
    expect((await display.GET(new Request(base + paths[1]))).status).toBe(403);
  }
  expect(m.save).not.toHaveBeenCalled();
  expect(m.live).not.toHaveBeenCalled();
  expect(m.own).toHaveBeenCalledTimes(2);
});
it("operation recovery retains the current actor and one exact original identity, without a write or Live prerequisite", async () => {
  const recovered = await profile.GET(
    new Request(base + paths[0] + "?operation_id=" + id),
  );
  expect(recovered.status).toBe(200);
  privateResponse(recovered);
  expect(m.original).toHaveBeenCalledWith(
    expect.objectContaining({ uid: "fixture-admin" }),
    id,
  );
  expect(
    (await display.GET(new Request(base + paths[1] + "?operation_id=" + id))).status,
  ).toBe(200);
  expect(m.save).not.toHaveBeenCalled();
  expect(m.live).not.toHaveBeenCalled();
});
it("duplicate, mixed and unknown read selectors are rejected before loading any record", async () => {
  for (const q of [
    "?uid=one&uid=two",
    "?uid=one&operation_id=" + id,
    "?unknown=one",
    "?uid=invalid%2Fpath",
  ]) {
    const r = await profile.GET(new Request(base + paths[0] + q));
    expect(r.status).toBe(400);
    privateResponse(r);
  }
  for (const q of ["?operation_id=" + id + "&operation_id=" + id, "?uid=one"]) {
    expect((await display.GET(new Request(base + paths[1] + q))).status).toBe(400);
  }
  expect(m.read).not.toHaveBeenCalled();
  expect(m.own).not.toHaveBeenCalled();
  expect(m.original).not.toHaveBeenCalled();
  expect(m.display).not.toHaveBeenCalled();
});
it("writes refuse a wrong lane before decoding and do not cross-accept profile and branding commands", async () => {
  m.live.mockImplementationOnce(() => {
    throw new EditableLayerError("Live required", 409);
  });
  const lane = await profile.POST(request(0, "POST", null));
  expect(lane.status).toBe(409);
  privateResponse(lane);
  expect((await profile.POST(request(0, "POST", branding))).status).toBe(400);
  expect((await display.POST(request(1, "POST", business))).status).toBe(400);
  expect(
    (await display.POST(request(1, "POST", { ...branding, role: "Admin" }))).status,
  ).toBe(400);
  expect(m.save).not.toHaveBeenCalled();
});
it("conflict and denied original reads remain private and never cause a new save", async () => {
  m.save.mockRejectedValueOnce(new EditableLayerError("Current setting changed", 409));
  const r = await profile.POST(request(0, "POST", business));
  expect(r.status).toBe(409);
  privateResponse(r);
  expect(m.save).toHaveBeenCalledTimes(1);
  m.original.mockRejectedValueOnce(new EditableLayerError("Only original actor", 403));
  const denied = await profile.GET(new Request(base + paths[0] + "?operation_id=" + id));
  expect(denied.status).toBe(403);
  privateResponse(denied);
  expect(m.save).toHaveBeenCalledTimes(1);
});
it("stop before admission retains the same operation identity and rejects added command fields", async () => {
  for (const [i, route] of [
    [0, profile],
    [1, display],
  ] as const) {
    const c = { operationId: id, op: "stop_before_admission" };
    const r = await route.PATCH(request(i, "PATCH", c));
    expect(r.status).toBe(200);
    privateResponse(r);
    expect(m.stop).toHaveBeenLastCalledWith(
      expect.objectContaining({ uid: "fixture-admin" }),
      id,
    );
    expect((await route.PATCH(request(i, "PATCH", { ...c, uid: "other" }))).status).toBe(
      400,
    );
  }
  expect(m.stop).toHaveBeenCalledTimes(2);
  expect(m.save).not.toHaveBeenCalled();
});
