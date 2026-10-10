import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  gate: vi.fn(),
  create: vi.fn(),
  run: vi.fn(),
}));
vi.mock("@/lib/gmail-hub/sequence-worker", () => ({
  verifyCommunicationWorkerRequest: mocks.verify,
  runCommunicationWorker: mocks.run,
}));
vi.mock("@/lib/gmail-hub/sequence-dependencies", () => ({
  createCommunicationSequenceService: mocks.create,
}));
vi.mock("@/lib/operations/runtime-suspension-gate", async (original) => ({
  ...(await original<typeof import("@/lib/operations/runtime-suspension-gate")>()),
  assertProductionRuntimeActionExecutable: mocks.gate,
}));
import { GET } from "@/app/api/gmail-hub/sequence-worker/route";
import { GmailPushAuthError } from "@/lib/gmail-hub/pubsub";
import { EditableLayerError } from "@/lib/firestore/errors";
const probeId = "3785c149-59a4-45fa-85de-a33a71f757d8";
const request = (query = "", id: string | null = probeId) =>
  new Request("https://app.test/api/gmail-hub/sequence-worker" + query, {
    headers: id ? { "X-PMI-Worker-Readiness": id } : {},
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
it("rejects an unverified service before reading gates, logging readiness or constructing business work", async () => {
  mocks.verify.mockRejectedValue(new GmailPushAuthError("Unauthorized", 401));
  expect((await GET(request())).status).toBe(401);
  expect(mocks.gate).not.toHaveBeenCalled();
  expect(console.log).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.run).not.toHaveBeenCalled();
});
it("proves only the managed service and two current exact gates without claiming or dispatching an occurrence", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ready" });
  expect(mocks.gate.mock.calls).toEqual([
    ["gmail.renewal_notice.send"],
    ["gmail.maintenance_owner_notice.send"],
  ]);
  expect(JSON.parse(vi.mocked(console.log).mock.calls[0][0])).toEqual({
    event: "communication_worker_readiness",
    probeId,
    ready: true,
  });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.run).not.toHaveBeenCalled();
});
it.each([
  { query: "?target=customer", id: probeId, status: 409 },
  { query: "", id: null, status: 400 },
  { query: "", id: "not-a-uuid", status: 400 },
])(
  "rejects unbounded probe input before current-state reads: $status",
  async ({ query, id, status }) => {
    expect((await GET(request(query, id))).status).toBe(status);
    expect(mocks.gate).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  },
);
it("a current runtime suspension cannot produce a readiness success log", async () => {
  mocks.gate.mockRejectedValue(new EditableLayerError("Suspended", 409));
  expect((await GET(request())).status).toBe(409);
  expect(console.log).not.toHaveBeenCalled();
  expect(mocks.run).not.toHaveBeenCalled();
});
