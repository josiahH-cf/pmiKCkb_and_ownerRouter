import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  createService: vi.fn(),
  save: vi.fn(),
  authorize: vi.fn(),
  dispatch: vi.fn(),
  control: vi.fn(),
  get: vi.fn(),
  verifyWorker: vi.fn(),
  runWorker: vi.fn(),
}));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireCapability: mocks.requireCapability,
}));
vi.mock("@/lib/gmail-hub/sequence-dependencies", () => ({
  createCommunicationSequenceService: mocks.createService,
}));
vi.mock("@/lib/gmail-hub/sequence-worker", () => ({
  verifyCommunicationWorkerRequest: mocks.verifyWorker,
  runCommunicationWorker: mocks.runWorker,
}));
import { POST, GET } from "@/app/api/gmail-hub/sequences/route";
import { POST as WORKER } from "@/app/api/gmail-hub/sequence-worker/route";
import { AuthError } from "@/lib/auth/session";
import { GmailPushAuthError } from "@/lib/gmail-hub/pubsub";
import { plainCommunicationMessage } from "@/lib/gmail-hub/sequence-model";
const actor = {
  uid: "staff",
  email: "staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const id = "cc3e6d25-f9a0-40e7-8bb0-e29521be90b1",
  op = "ed4279b1-a799-4eb8-8893-ad62e13b841b";
const initial = plainCommunicationMessage("Reviewed message", "Synthetic route fixture");
const draft = {
  id,
  context: {
    lane: "renewals",
    entityType: "renewal_lease",
    entityId: "115",
    purpose: "renewal_owner",
    actionKey: "gmail.renewal_notice.send",
    sourceRefs: ["rentvine:lease:115"],
  },
  initial,
  followUp: null,
};
const sequence = { ...draft, version: 1, state: "draft", senderEmail: actor.email };
function request(body: unknown) {
  return new Request("https://app.test/api/gmail-hub/sequences", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireCapability.mockResolvedValue(actor);
  mocks.createService.mockReturnValue({
    save: mocks.save,
    authorize: mocks.authorize,
    dispatch: mocks.dispatch,
    control: mocks.control,
    get: mocks.get,
  });
  mocks.save.mockResolvedValue(sequence);
  mocks.get.mockResolvedValue(sequence);
});
describe("S186–S192 private sequence HTTP boundaries", () => {
  it("authenticates before reading private input or constructing services", async () => {
    mocks.requireCapability.mockRejectedValue(
      new AuthError("Authentication required", 401),
    );
    const r = request({ private: "not decoded" });
    const body = vi.fn(() => {
      throw new Error("body read");
    });
    Object.defineProperty(r, "body", { get: body });
    expect((await POST(r)).status).toBe(401);
    expect(body).not.toHaveBeenCalled();
    expect(mocks.createService).not.toHaveBeenCalled();
  });
  it.each(["to", "cc", "from", "mailboxEmail", "production_allowed"])(
    "rejects forged %s effect authority instead of accepting browser fields",
    async (field) => {
      const r = await POST(
        request({
          action: "send",
          id,
          expectedVersion: 1,
          operationId: op,
          reviewedDraftHash: "a".repeat(64),
          reviewedTargetHash: "b".repeat(64),
          schedule: null,
          [field]: "forged@example.invalid",
        }),
      );
      expect(r.status).toBe(400);
      expect(mocks.createService).not.toHaveBeenCalled();
    },
  );
  it("refuses generic send context and extra draft fields", async () => {
    const r = await POST(
      request({
        action: "save",
        draft: {
          ...draft,
          context: { ...draft.context, actionKey: "gmail.message.send" },
        },
        expectedVersion: 0,
        operationId: op,
      }),
    );
    expect(r.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("uses the reviewed one-action command and the same durable dispatcher for Send", async () => {
    mocks.authorize.mockResolvedValue({ ...sequence, version: 2, state: "active" });
    mocks.dispatch.mockResolvedValue({
      sequence: { ...sequence, version: 2, state: "completed", confirmedCount: 1 },
    });
    const r = await POST(
      request({
        action: "send",
        id,
        expectedVersion: 1,
        operationId: op,
        reviewedDraftHash: "a".repeat(64),
        reviewedTargetHash: "b".repeat(64),
        schedule: null,
      }),
    );
    expect(r.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).toHaveBeenCalledExactlyOnceWith(id);
    expect((await r.json()).sequence.confirmedCount).toBe(1);
  });
  it("returns recorded ownership when a post-authorization dispatch cannot be completed", async () => {
    mocks.authorize.mockResolvedValue({ ...sequence, version: 2, state: "active" });
    mocks.dispatch.mockRejectedValue(new Error("unavailable"));
    mocks.get.mockResolvedValue({ ...sequence, version: 2, state: "active" });
    const r = await POST(
      request({
        action: "send",
        id,
        expectedVersion: 1,
        operationId: op,
        reviewedDraftHash: "a".repeat(64),
        reviewedTargetHash: "b".repeat(64),
        schedule: null,
      }),
    );
    expect((await r.json()).sequence.state).toBe("active");
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
  it("does not expose arbitrary mailbox or recipient query options", async () => {
    expect(
      (
        await GET(
          new Request(
            `https://app.test/api/gmail-hub/sequences?id=${id}&mailbox=other@pmikcmetro.com`,
          ),
        )
      ).status,
    ).toBe(409);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("authenticates the worker before body decoding and refuses target-bearing jobs", async () => {
    mocks.verifyWorker.mockRejectedValueOnce(
      new GmailPushAuthError("Rejected worker", 403),
    );
    const r = request({ id });
    const read = vi.fn(() => {
      throw new Error("body read");
    });
    Object.defineProperty(r, "body", { get: read });
    expect((await WORKER(r)).status).toBe(403);
    expect(read).not.toHaveBeenCalled();
    expect(mocks.runWorker).not.toHaveBeenCalled();
    expect((await WORKER(request({ id, to: ["forged@example.invalid"] }))).status).toBe(
      400,
    );
    expect(mocks.runWorker).not.toHaveBeenCalled();
  });
});
