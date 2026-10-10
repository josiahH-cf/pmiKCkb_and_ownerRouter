import type { StaffBusinessProfile } from "@/lib/staff/business-profile";
import { applyBusinessSignature } from "@/lib/gmail-hub/business-signature";
import type { Firestore } from "firebase-admin/firestore";
import { randomUUID, createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "../helpers/fake-firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { GmailRuntimeError } from "@/lib/gmail-runtime/client";
import {
  FirestoreCommunicationSequenceStore,
  sequenceHash,
} from "@/lib/gmail-hub/sequence-store";
import {
  WorkflowCommunicationSequenceService,
  classifyIncomingMessage,
  type SequenceMailClient,
} from "@/lib/gmail-hub/sequence-service";
import {
  plainCommunicationMessage,
  renderCommunicationMessage,
  type SequenceDraft,
} from "@/lib/gmail-hub/sequence-model";
import type { GmailMessageView, GmailThreadView } from "@/lib/gmail-runtime/types";
import { gmailMailboxKey } from "@/lib/gmail-hub/state-store";
import { encodeWorkflowMime } from "@/lib/gmail-runtime/workflow-mime";

const actor: AuthenticatedUser = {
  uid: "staff-one",
  email: "staff-one@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const other: AuthenticatedUser = {
  ...actor,
  uid: "staff-two",
  email: "staff-two@pmikcmetro.com",
};
const context = {
  lane: "renewals" as const,
  entityType: "renewal_lease" as const,
  entityId: "115",
  purpose: "renewal_owner" as const,
  actionKey: "gmail.renewal_notice.send",
  sourceRefs: ["rentvine:lease:115"],
};
const body = plainCommunicationMessage(
  "Lease update",
  "A reviewed update.\n\nPlease reply.",
);
function setup() {
  const db = new FakeFirestore();
  const store = new FirestoreCommunicationSequenceStore(db as unknown as Firestore);
  let nowMs = Date.parse("2026-10-09T15:00Z");
  const target = {
    context,
    to: ["owner@example.invalid"],
    cc: [],
    sourceRefs: context.sourceRefs,
    materialSourceHash: "a".repeat(64),
    label: "Synthetic fixture lease",
  };
  let thread: GmailThreadView = {
    id: "thread-1",
    truncated: false,
    historyId: "100",
    messages: [],
  };
  let sentAtMs = nowMs;
  const getProfile = vi.fn(async () => ({
    emailAddress: actor.email,
    messagesTotal: 1,
    threadsTotal: 1,
    historyId: "100",
  }));
  const send = vi.fn(
    async (_message: import("@/lib/gmail-runtime/workflow-mime").WorkflowMimeMessage) => {
      sentAtMs = nowMs;
      return { messageId: "message-1", threadId: "thread-1", labelIds: ["SENT"] };
    },
  );
  const find = vi.fn(
    async (
      _id: string,
      _message: import("@/lib/gmail-runtime/workflow-mime").WorkflowMimeMessage,
    ) => ({
      messageId: "message-1",
      threadId: "thread-1",
      labelIds: ["SENT"],
      sentAtMs,
    }),
  );
  const createClient = vi.fn(
    (subject: string): SequenceMailClient => ({
      subject,
      getProfile,
      getThread: vi.fn(async () => thread),
      sendWorkflowMessage: send,
      findWorkflowMessage: find,
    }),
  );
  const resolveTarget = vi.fn(async () => target);
  const deps = {
    store,
    resolveTarget,
    resolveAttachment: vi.fn(),
    readActor: vi.fn(async (uid: string) => (uid === other.uid ? other : actor)),
    createClient,
    assertRuntimeAction: vi.fn(async () => undefined),
    assertEffectEnvironment: vi.fn(),
    now: () => nowMs,
    readBusinessProfile: vi.fn(
      async (_actor: AuthenticatedUser): Promise<StaffBusinessProfile | null> => null,
    ),
  };
  const service = new WorkflowCommunicationSequenceService(deps);
  const draft: SequenceDraft = {
    id: randomUUID(),
    context,
    initial: body,
    followUp: plainCommunicationMessage("Lease update", "A separate reviewed follow-up."),
  };
  async function save() {
    return service.save(actor, draft, 0, randomUUID());
  }
  async function approve(action: "send" | "schedule" = "send") {
    const s = await save();
    return service.authorize(actor, {
      id: s.id,
      expectedVersion: s.version,
      operationId: randomUUID(),
      action,
      schedule:
        action === "schedule"
          ? {
              firstDate: "2026-10-10",
              time: "09:00",
              timeZone: "America/Chicago",
              everyDays: 1,
              endDate: null,
              sendLimit: 3,
            }
          : null,
      reviewedTargetHash: sequenceHash({
        to: target.to,
        cc: target.cc,
        materialSourceHash: target.materialSourceHash,
      }),
      reviewedDraftHash: sequenceHash({ initial: s.initial, followUp: s.followUp }),
    });
  }
  return {
    db,
    store,
    deps,
    service,
    draft,
    target,
    save,
    approve,
    send,
    find,
    createClient,
    getProfile,
    setNow: (n: number) => {
      nowMs = n;
    },
    now: () => nowMs,
    setThread: (t: GmailThreadView) => {
      thread = t;
    },
  };
}
function incoming(overrides: Partial<GmailMessageView> = {}): GmailMessageView {
  return {
    id: "reply-1",
    threadId: "thread-1",
    labelIds: ["INBOX"],
    internalDate: String(Date.parse("2026-10-10T15:00Z")),
    from: "Owner <owner@example.invalid>",
    to: [actor.email],
    cc: [],
    bcc: [],
    subject: "Lease update",
    date: "",
    messageId: "<reply@example.invalid>",
    references: [],
    bodyText: "Thanks",
    bodyTruncated: false,
    attachments: [],
    ...overrides,
  };
}
describe("S191 mailbox-scoped history and S192 current authority", () => {
  it("retains separate history observations for old and new managed mailboxes", async () => {
    const f = setup();
    const approved = await f.approve();
    const s = await f.store.write({
      id: approved.id,
      actorUid: actor.uid,
      expectedVersion: approved.version,
      operationId: randomUUID(),
      operationHash: "fixture",
      nowMs: f.now(),
      action: "fixture_link",
      apply: (c) => ({
        ...c!,
        version: c!.version + 1,
        linkedThreads: [
          { senderEmail: actor.email, threadId: "old" },
          { senderEmail: other.email, threadId: "new" },
        ],
      }),
    });
    f.createClient.mockImplementation((subject) => ({
      subject,
      getProfile: f.getProfile,
      getThread: vi.fn(async (id) => ({
        id,
        truncated: false,
        messages: [],
        historyId: subject === actor.email ? "900" : "20",
      })),
      sendWorkflowMessage: f.send,
      findWorkflowMessage: f.find,
    }));
    const observed = await f.service.observe(s);
    expect(observed.observation).toMatchObject({
      historyId: null,
      mailboxHistoryIds: {
        [gmailMailboxKey(actor.email)]: "900",
        [gmailMailboxKey(other.email)]: "20",
      },
    });
  });
  it("pauses a formerly authorized send when its current exact key is refused", async () => {
    const f = setup();
    const s = await f.approve();
    f.deps.assertRuntimeAction.mockRejectedValue(new Error("Exact key closed"));
    const outcome = await f.service.dispatch(s.id);
    expect(outcome.status).toBe("paused");
    expect(outcome.sequence.pause?.cause).toBe("authorization_unavailable");
    expect((await f.store.get(s.id))?.state).toBe("paused");
    expect(f.send).not.toHaveBeenCalled();
  });
});
describe("S187–S192 durable workflow communications (isolated Gmail adapters)", () => {
  it("saves wording independently after target admission, retains input on conflict and replays one intent", async () => {
    const f = setup();
    const op = randomUUID();
    const first = await f.service.save(actor, f.draft, 0, op);
    expect((await f.service.save(actor, f.draft, 0, op)).version).toBe(first.version);
    await f.service.save(
      actor,
      { ...f.draft, initial: plainCommunicationMessage("Edited", "Retained input") },
      first.version,
      randomUUID(),
    );
    expect(f.deps.resolveTarget).toHaveBeenCalledTimes(1);
    await expect(
      f.service.save(actor, f.draft, first.version, randomUUID()),
    ).rejects.toThrow(/changed/);
    expect((await f.store.get(first.id))?.initial.subject).toBe("Edited");
    expect(f.send).not.toHaveBeenCalled();
    expect(f.getProfile).not.toHaveBeenCalled();
  });
  it("binds the exact reviewed revision, sender and content; edits preserve approved history and pause", async () => {
    const f = setup();
    const s = await f.approve("schedule");
    const approved = structuredClone(s.authorization);
    await expect(
      f.service.authorize(other, {
        id: s.id,
        expectedVersion: s.version,
        operationId: randomUUID(),
        action: "send",
        schedule: null,
        reviewedTargetHash: sequenceHash({
          to: f.target.to,
          cc: f.target.cc,
          materialSourceHash: f.target.materialSourceHash,
        }),
        reviewedDraftHash: "wrong",
      }),
    ).rejects.toThrow(/responsible/);
    await expect(
      f.service.authorize(actor, {
        id: s.id,
        expectedVersion: s.version,
        operationId: randomUUID(),
        action: "send",
        schedule: null,
        reviewedTargetHash: sequenceHash({
          to: f.target.to,
          cc: f.target.cc,
          materialSourceHash: f.target.materialSourceHash,
        }),
        reviewedDraftHash: "wrong",
      }),
    ).rejects.toThrow(/changed/);
    const edit = await f.service.save(
      actor,
      { ...f.draft, initial: plainCommunicationMessage("Changed", "New wording") },
      s.version,
      randomUUID(),
    );
    expect(edit.state).toBe("paused");
    expect(edit.authorization).toEqual(approved);
    f.setNow(Date.parse("2026-10-11T15:00Z"));
    await f.service.dispatch(s.id);
    expect(f.send).not.toHaveBeenCalled();
  });
  it("sends exactly once, reads back the exact effect, accounts once and survives service restart", async () => {
    const f = setup();
    const s = await f.approve();
    const result = await f.service.dispatch(s.id);
    expect(result.status).toBe("sent");
    expect(result.sequence.confirmedCount).toBe(1);
    const restarted = new WorkflowCommunicationSequenceService(f.deps);
    await restarted.dispatch(s.id);
    expect(f.send).toHaveBeenCalledTimes(1);
    expect((await f.store.get(s.id))?.confirmedCount).toBe(1);
    expect(f.send.mock.calls[0]).toBeDefined();
  });
  it("keeps an unknown attempt blocked across restart and not-found; own receipt settles without another send", async () => {
    const f = setup();
    const s = await f.approve();
    f.send.mockRejectedValueOnce(new GmailRuntimeError("response lost", 504, true));
    const failed = await f.service.dispatch(s.id);
    expect(failed.status).toBe("needs_reconciliation");
    const restarted = new WorkflowCommunicationSequenceService(f.deps);
    await restarted.dispatch(s.id);
    expect(f.send).toHaveBeenCalledTimes(1);
    f.find.mockResolvedValueOnce(null as never);
    expect(
      (await restarted.reconcile(actor, s.id)).unresolvedOccurrenceId,
    ).not.toBeNull();
    const settled = await restarted.reconcile(actor, s.id);
    expect(settled.confirmedCount).toBe(1);
    expect(settled.state).toBe("paused");
    await restarted.reconcile(actor, s.id);
    expect((await f.store.get(s.id))?.confirmedCount).toBe(1);
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it("honors a pause ordered after claim and before dispatch without a provider attempt", async () => {
    const f = setup();
    const s = await f.approve();
    const original = f.store.canDispatch.bind(f.store);
    vi.spyOn(f.store, "canDispatch").mockImplementationOnce(async (o) => {
      const current = (await f.store.get(s.id))!;
      await f.service.control(other, {
        id: s.id,
        expectedVersion: current.version,
        operationId: randomUUID(),
        action: "pause",
      });
      return original(o);
    });
    const result = await f.service.dispatch(s.id);
    expect(result.status).toBe("refused");
    expect(f.send).not.toHaveBeenCalled();
    expect(result.sequence.state).toBe("paused");
  });
  it("does not recall an in-flight send or erase a concurrent pause when the receipt settles", async () => {
    const f = setup();
    const s = await f.approve("schedule");
    f.setNow(Date.parse("2026-10-10T14:00Z"));
    f.send.mockImplementationOnce(async () => {
      const current = (await f.store.get(s.id))!;
      await f.service.control(other, {
        id: s.id,
        expectedVersion: current.version,
        operationId: randomUUID(),
        action: "pause",
      });
      return { messageId: "message-1", threadId: "thread-1", labelIds: ["SENT"] };
    });
    const result = await f.service.dispatch(s.id);
    expect(result.sequence.state).toBe("paused");
    expect(result.sequence.confirmedCount).toBe(1);
    expect(result.sequence.nextDueAtMs).toBeNull();
  });
  it.each(["human", "bounce"])(
    "pauses on a %s without inferring owner acceptance",
    async (kind) => {
      const f = setup();
      const s = await f.approve("schedule");
      f.setNow(Date.parse("2026-10-10T14:00Z"));
      await f.service.dispatch(s.id);
      f.setThread({
        id: "thread-1",
        truncated: false,
        historyId: "101",
        messages: [
          incoming(
            kind === "bounce"
              ? { contentType: "multipart/report; report-type=delivery-status" }
              : {},
          ),
        ],
      });
      f.setNow(Date.parse("2026-10-11T14:00Z"));
      const result = await f.service.dispatch(s.id);
      expect(result.sequence.state).toBe("paused");
      expect(result.sequence.pause?.cause).toBe(kind === "human" ? "reply" : "bounce");
      expect(f.send).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result.sequence)).not.toContain("acceptedTerms");
    },
  );
  it("keeps automated replies distinct and blocks incomplete thread reads", async () => {
    expect(classifyIncomingMessage(incoming({ autoSubmitted: "auto-replied" }))).toBe(
      "auto_reply",
    );
    expect(
      classifyIncomingMessage(incoming({ from: "unknown", precedence: "bulk" })),
    ).toBe("uncertain");
    const f = setup();
    const s = await f.approve("schedule");
    f.setNow(Date.parse("2026-10-10T14:00Z"));
    await f.service.dispatch(s.id);
    f.setThread({
      id: "thread-1",
      truncated: true,
      historyId: "102",
      messages: [incoming({ autoSubmitted: "auto-replied" })],
    });
    f.setNow(Date.parse("2026-10-11T14:00Z"));
    expect((await f.service.dispatch(s.id)).status).toBe("awaiting_source");
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it("holds a changed authoritative target but recovers a pre-claim source outage under unchanged approval", async () => {
    const f = setup();
    const s = await f.approve();
    f.deps.resolveTarget.mockRejectedValueOnce(new Error("source offline"));
    expect((await f.service.dispatch(s.id)).status).toBe("awaiting_source");
    expect(f.send).not.toHaveBeenCalled();
    expect((await f.service.dispatch(s.id)).status).toBe("sent");
    const g = setup();
    const t = await g.approve();
    g.target.materialSourceHash = "b".repeat(64);
    expect((await g.service.dispatch(t.id)).sequence.pause?.cause).toBe("changed_source");
    expect(g.send).not.toHaveBeenCalled();
  });
  it("transfers future authority without borrowing the old sender's authorization", async () => {
    const f = setup();
    const s = await f.approve("schedule");
    const transferred = await f.service.control(other, {
      id: s.id,
      expectedVersion: s.version,
      operationId: randomUUID(),
      action: "transfer",
      responsibleUid: other.uid,
    });
    expect(transferred.state).toBe("paused");
    expect(transferred.authorization?.senderEmail).toBe(actor.email);
    expect(transferred.senderEmail).toBe(other.email);
    await f.service.dispatch(s.id);
    expect(f.send).not.toHaveBeenCalled();
    await expect(
      f.service.authorize(actor, {
        id: s.id,
        expectedVersion: transferred.version,
        operationId: randomUUID(),
        action: "resume",
        schedule: null,
        reviewedTargetHash: sequenceHash({
          to: f.target.to,
          cc: f.target.cc,
          materialSourceHash: f.target.materialSourceHash,
        }),
        reviewedDraftHash: sequenceHash({
          initial: transferred.initial,
          followUp: transferred.followUp,
        }),
      }),
    ).rejects.toThrow(/responsible/);
  });
  it("does not allow verification principals or a generic/new mailbox operation", async () => {
    const f = setup();
    await expect(
      f.service.save(
        { ...actor, email: "canary-admin@pmikcmetro.com" },
        f.draft,
        0,
        randomUUID(),
      ),
    ).rejects.toThrow(/authority/);
    await expect(
      f.service.save(
        actor,
        { ...f.draft, context: { ...context, actionKey: "gmail.message.send" } },
        0,
        randomUUID(),
      ),
    ).rejects.toThrow();
  });
});
describe("S187 exact rich MIME and safe attachments", () => {
  it("preserves exact plain/HTML and byte hashes, and rejects header/file substitution", () => {
    const rich = {
      subject: "Reviewed address",
      paragraphs: [
        [
          { text: "12 Example St", bold: true },
          { text: " & amount ", italic: true },
          { text: "$120" },
        ],
      ],
      attachmentIds: [],
    };
    const content = renderCommunicationMessage(rich);
    expect(content.plainText).toBe("12 Example St & amount $120");
    expect(content.htmlBody).toContain("<strong>12 Example St</strong>");
    const bytes = Buffer.from("%PDF-1.4\n%%EOF");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const message = {
      from: actor.email,
      to: ["owner@example.invalid"],
      cc: [],
      bcc: [],
      subject: rich.subject,
      body: content.plainText,
      htmlBody: content.htmlBody,
      attachments: [
        { filename: "review.pdf", mimeType: "application/pdf", bytes, sha256 },
      ],
      messageId: "<fixture@pmikcmetro.com>",
      references: [],
    };
    const mime = Buffer.from(encodeWorkflowMime(message), "base64url").toString();
    expect(mime).toContain(Buffer.from(content.plainText).toString("base64"));
    expect(mime).toContain(bytes.toString("base64"));
    expect(encodeWorkflowMime(message)).toBe(encodeWorkflowMime(message));
    expect(() => encodeWorkflowMime({ ...message, subject: "bad\r\nBcc: x" })).toThrow();
    expect(() =>
      encodeWorkflowMime({
        ...message,
        attachments: [{ ...message.attachments[0], bytes: Buffer.from("other") }],
      }),
    ).toThrow();
    expect(() =>
      renderCommunicationMessage({
        ...rich,
        paragraphs: [[{ text: "x", href: "javascript:alert(1)" }]],
      }),
    ).toThrow();
  });
});

it("sends a workflow-linked rich reply under its exact key and retains threading for ambiguous reconciliation", async () => {
  const f = setup();
  const reply = {
    senderEmail: actor.email,
    threadId: "thread-1",
    parentMessageId: "<parent@example.invalid>",
    subject: body.subject,
    references: ["<older@example.invalid>"],
  };
  f.draft.context = {
    ...context,
    actionKey: "gmail.thread.reply",
    replyTo: {
      sequenceId: randomUUID(),
      threadId: "thread-1",
      senderEmail: actor.email,
      parentId: "parent-1",
    },
  };
  Object.assign(f.target, { reply });
  f.setThread({
    id: "thread-1",
    truncated: false,
    messages: [
      incoming({
        id: "parent-1",
        messageId: reply.parentMessageId,
        internalDate: String(f.now() - 10000),
      }),
    ],
  });
  const approved = await f.approve();
  f.send.mockRejectedValueOnce(
    new GmailRuntimeError("Unknown fixture transport outcome", 503, true),
  );
  expect((await f.service.dispatch(approved.id)).status).toBe("needs_reconciliation");
  expect(f.deps.assertRuntimeAction).toHaveBeenCalledWith("gmail.thread.reply");
  expect(f.send).toHaveBeenCalledTimes(1);
  const sent = f.send.mock.calls[0] as unknown as [
    {
      inReplyTo: string;
      references: string[];
      threadId: string;
      verifyThreading: boolean;
    },
  ];
  expect(sent[0]).toMatchObject({
    threadId: "thread-1",
    inReplyTo: reply.parentMessageId,
    references: [...reply.references, reply.parentMessageId],
    verifyThreading: true,
  });
  await f.service.reconcile(actor, approved.id);
  expect(f.find.mock.calls.at(-1)?.[1]).toMatchObject({
    inReplyTo: reply.parentMessageId,
    references: [...reply.references, reply.parentMessageId],
    verifyThreading: true,
  });
  expect(f.send).toHaveBeenCalledTimes(1);
});

function businessProfile(who: AuthenticatedUser, version = 1): StaffBusinessProfile {
  return {
    uid: who.uid,
    email: who.email,
    version,
    updatedAt: "2026-10-09T12:00:00Z",
    updatedBy: "fixture-admin",
    profile: {
      name: who.uid,
      businessTitle: version === 1 ? "Property Manager" : "Reviewed new title",
      phone: "",
      hours: "",
      website: "",
      source: "Fixture Admin-reviewed business profile",
    },
  };
}
it("retains the exact supplying signature version and content while profile edits leave an approved schedule unchanged", async () => {
  const f = setup(),
    first = businessProfile(actor);
  f.deps.readBusinessProfile.mockResolvedValue(first);
  f.draft.initial = applyBusinessSignature(f.draft.initial, first, actor.email);
  const scheduled = await f.approve("schedule"),
    snapshot = scheduled.signatureSnapshots!.initial!;
  expect(snapshot).toMatchObject({ uid: actor.uid, email: actor.email, version: 1 });
  expect(snapshot.text).toContain("Property Manager");
  expect(snapshot.text).not.toContain("null");
  expect(scheduled.authorization?.initial.signature).toEqual(snapshot);
  const before = JSON.stringify(scheduled.authorization),
    next = businessProfile(actor, 2);
  f.deps.readBusinessProfile.mockResolvedValue(next);
  expect(JSON.stringify((await f.service.get(actor, scheduled.id)).authorization)).toBe(
    before,
  );
  const edited = await f.service.save(
    actor,
    { ...f.draft, initial: { ...f.draft.initial, subject: "Explicit wording edit" } },
    scheduled.version,
    randomUUID(),
  );
  expect(edited.signatureSnapshots?.initial).toEqual(snapshot);
  expect(JSON.stringify(edited.authorization)).toBe(before);
  expect(edited.state).toBe("paused");
  const fresh = await f.service.save(
    actor,
    {
      ...f.draft,
      id: randomUUID(),
      initial: applyBusinessSignature(body, next, actor.email),
    },
    0,
    randomUUID(),
  );
  expect(fresh.signatureSnapshots?.initial?.version).toBe(2);
  expect(fresh.signatureSnapshots?.initial?.text).toContain("Reviewed new title");
  expect(f.send).not.toHaveBeenCalled();
});
it("takeover retains historical signature evidence and requires the new sender's own signature for a new authorization", async () => {
  const f = setup(),
    first = businessProfile(actor);
  f.deps.readBusinessProfile.mockImplementation(async (who) => businessProfile(who));
  f.draft.initial = applyBusinessSignature(body, first, actor.email);
  const original = await f.approve("schedule"),
    transferred = await f.service.control(other, {
      id: original.id,
      expectedVersion: original.version,
      operationId: randomUUID(),
      action: "transfer",
      responsibleUid: other.uid,
    });
  expect(transferred.authorization?.initial.signature?.email).toBe(actor.email);
  expect(transferred.senderEmail).toBe(other.email);
  f.getProfile.mockResolvedValue({
    emailAddress: other.email,
    messagesTotal: 1,
    threadsTotal: 1,
    historyId: "100",
  });
  const authorize = (s: typeof transferred) =>
    f.service.authorize(other, {
      id: s.id,
      expectedVersion: s.version,
      operationId: randomUUID(),
      action: "send",
      schedule: null,
      reviewedTargetHash: sequenceHash({
        to: f.target.to,
        cc: f.target.cc,
        materialSourceHash: f.target.materialSourceHash,
      }),
      reviewedDraftHash: sequenceHash({ initial: s.initial, followUp: s.followUp }),
    });
  await expect(authorize(transferred)).rejects.toThrow("another staff sender");
  const edited = await f.service.save(
    other,
    {
      id: transferred.id,
      context: transferred.context,
      initial: applyBusinessSignature(
        transferred.initial,
        businessProfile(other),
        other.email,
        transferred.signatureSnapshots?.initial?.text,
      ),
      followUp: transferred.followUp,
    },
    transferred.version,
    randomUUID(),
  );
  expect(edited.signatureSnapshots?.initial?.email).toBe(other.email);
  expect(
    edited.initial.paragraphs
      .at(-1)
      ?.map((r) => r.text)
      .join(""),
  ).not.toContain(actor.email);
  const approved = await authorize(edited);
  expect(approved.authorization?.initial.signature?.email).toBe(other.email);
  expect(original.authorization?.initial.signature?.email).toBe(actor.email);
  expect(f.send).not.toHaveBeenCalled();
});
