import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import { deskRow } from "@/tests/helpers/operational-context-fake";
const state = vi.hoisted(() => ({ require: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityInSpace: state.require,
  authErrorResponse: () => new Response("Denied", { status: 403 }),
}));
vi.mock("@/lib/lease-renewal/assistant-source", () => ({
  loadRenewalAssistantSource: state.read,
}));
import { GET } from "@/app/lease-renewal/live/desk/lease/[leaseId]/rentvine/route";
const actor = { uid: "fixture-editor", hd: "pmikcmetro.com", role: "Editor" };
function open(id = "7001") {
  return GET(
    new Request(`https://app.fixture/lease-renewal/live/desk/lease/${id}/rentvine`),
    { params: Promise.resolve({ leaseId: id }) },
  );
}
beforeEach(() => {
  state.require.mockReset().mockResolvedValue(actor);
  state.read.mockReset();
  vi.stubEnv("RENTVINE_API_BASE_URL", "https://fixture.rentvine.com/api/manager");
});
afterEach(() => vi.unstubAllEnvs());
describe("S178 actual current-source RentVine shortcut", () => {
  it("checks current actor and source before redirecting to the exact source-provided lease", async () => {
    const row = deskRow({ id: "7001" });
    row.sourceDestinations = {
      rentvine: {
        kind: "external",
        href: "https://fixture.rentvine.com/leases/7001",
        label: "Verified source",
      },
    };
    state.read.mockResolvedValue({ outcome: { status: "ok", view: { items: [row] } } });
    const result = await open();
    expect(state.require).toHaveBeenCalledWith("read", "renewals");
    expect(state.read).toHaveBeenCalledWith(actor, expect.any(Date));
    expect(result.status).toBe(302);
    expect(result.headers.get("location")).toBe(
      "https://fixture.rentvine.com/leases/7001",
    );
    expect(result.headers.get("cache-control")).toBe("no-store");
  });
  it.each([
    "https://hostile.example/leases/7001",
    "https://fixture.rentvine.com/leases/7002",
    "http://fixture.rentvine.com/leases/7001",
    undefined,
  ])("does not invent or reuse an unverified destination: %s", async (href) => {
    const row = deskRow({ id: "7001" });
    if (href)
      row.sourceDestinations = {
        rentvine: { kind: "external", href, label: "Untrusted local fixture" },
      };
    state.read.mockResolvedValue({ outcome: { status: "ok", view: { items: [row] } } });
    const result = await open();
    expect(result.status).toBe(409);
    expect(result.headers.has("location")).toBe(false);
  });
  it("refuses a no-longer-accessible or unavailable source without guessing a shortcut", async () => {
    state.read.mockResolvedValue({ outcome: { status: "unavailable" } });
    expect((await open()).status).toBe(409);
    state.read.mockResolvedValue({ outcome: { status: "ok", view: { items: [] } } });
    expect((await open()).status).toBe(409);
  });
  it("refuses permission before loading any source and rejects invalid identities", async () => {
    state.require.mockRejectedValue(new EditableLayerError("Denied", 403));
    expect((await open()).status).toBe(403);
    expect(state.read).not.toHaveBeenCalled();
    state.require.mockResolvedValue(actor);
    expect((await open("unknown-name")).status).toBe(400);
    expect(state.read).not.toHaveBeenCalled();
  });
});
