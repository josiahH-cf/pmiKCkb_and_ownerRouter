import { beforeEach, it, expect, vi } from "vitest";
import { EditableLayerError } from "@/lib/firestore/errors";
const m = vi.hoisted(() => ({
  actor: vi.fn(async () => ({
    uid: "fixture-staff",
    email: "fixture-staff@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  })),
  live: vi.fn(),
  read: vi.fn(async () => ({
    ticket: { id: "fixture-case" },
    emergency: { detail: "Fallback" },
    chargeback: { detail: "No current policy" },
  })),
}));
vi.mock("@/lib/auth/session", () => ({ requireCapabilityInSpace: m.actor }));
vi.mock("@/lib/operations/live-context", () => ({
  requireOperationsLiveContext: m.live,
}));
vi.mock("@/lib/firestore/maintenance-case-records", () => ({
  readMaintenanceReviewContext: m.read,
}));
import { GET } from "@/app/api/maintenance/tickets/[ticketId]/review-context/route";
const url = "https://fixture.invalid/api/maintenance/tickets/fixture-case/review-context",
  params = (ticketId = "fixture-case") => ({ params: Promise.resolve({ ticketId }) });
beforeEach(() => {
  vi.clearAllMocks();
});
it("reads one actual case context under current Maintenance read permission and private response headers", async () => {
  const r = await GET(new Request(url), params());
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(m.actor).toHaveBeenCalledWith("read", "maintenance");
  expect(m.read).toHaveBeenCalledWith(
    expect.objectContaining({ uid: "fixture-staff" }),
    "fixture-case",
  );
  expect(m.read).toHaveBeenCalledTimes(1);
});
it("refuses unexpected selectors and invalid targets before a case/policy source read", async () => {
  expect((await GET(new Request(url + "?other=case"), params())).status).toBe(400);
  for (const id of ["", "other/case", "x".repeat(201)]) {
    const r = await GET(new Request(url), params(id));
    expect(r.status).toBe(400);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  }
  expect(m.read).not.toHaveBeenCalled();
});
it("authorization and context holds precede source reads, and source conflicts remain private", async () => {
  m.actor.mockRejectedValueOnce(new EditableLayerError("Denied", 403));
  expect((await GET(new Request(url), params())).status).toBe(403);
  expect(m.live).not.toHaveBeenCalled();
  m.live.mockImplementationOnce(() => {
    throw new EditableLayerError("Live required", 409);
  });
  expect((await GET(new Request(url), params())).status).toBe(409);
  expect(m.read).not.toHaveBeenCalled();
  m.read.mockRejectedValueOnce(new EditableLayerError("Changed context", 409));
  const r = await GET(new Request(url), params());
  expect(r.status).toBe(409);
  expect(r.headers.get("cache-control")).toBe("private, no-store");
});
