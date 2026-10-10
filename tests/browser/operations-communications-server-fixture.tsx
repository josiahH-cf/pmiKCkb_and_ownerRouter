import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FirestoreGmailStateStore, gmailMailboxKey } from "@/lib/gmail-hub/state-store";
import { GmailHubService } from "@/lib/gmail-hub/service";
import { communicationsRetentionFields } from "@/lib/gmail-hub/retention-policy";
import {
  listGmailWorkflowNotifications,
  markGmailWorkflowNotificationRead,
} from "@/lib/gmail-hub/notifications";
import {
  workflowCommunicationHref,
  type WorkflowCommunicationLink,
} from "@/lib/gmail-hub/workflow-context";
import { bindWorkflowReply } from "@/lib/gmail-hub/workflow-reply-binding";
// Deterministic external adapters for a disposable, loopback-only compiled browser journey.
// No production route imports this module; the runner injects it only into its shadow checkout.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { GmailHubHome } from "@/components/gmail-hub/GmailHubHome";
import { FirestoreCommunicationSequenceStore } from "@/lib/gmail-hub/sequence-store";
import {
  WorkflowCommunicationSequenceService,
  type CommunicationSequenceDependencies,
} from "@/lib/gmail-hub/sequence-service";
import { CommunicationAttachmentStore } from "@/lib/gmail-hub/sequence-attachments";
import {
  CommunicationWorkerStore,
  runCommunicationWorker,
} from "@/lib/gmail-hub/sequence-worker";
import { type VerifiedCommunicationTarget } from "@/lib/gmail-hub/sequence-model";
import {
  encodeWorkflowMime,
  type WorkflowMimeMessage,
} from "@/lib/gmail-runtime/workflow-mime";
import { GmailRuntimeError } from "@/lib/gmail-runtime/client";
import { EditableLayerError } from "@/lib/firestore/errors";
import type { AuthenticatedUser } from "@/lib/auth/session";
export type { AuthenticatedUser } from "@/lib/auth/session";
export { hasSpaceAccess } from "@/lib/auth/session";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
import type { GmailThreadView } from "@/lib/gmail-runtime/types";
assert.match(process.cwd(), /^\/tmp\/pmi-kc-operations-browser-[^/]+\/worktree$/);
assert.equal(process.env.OPERATIONS_BROWSER_FIXTURE, "true");
assert.equal(process.env.FIREBASE_PROJECT_ID, "pmi-kc-kb-operations-browser-test");
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
const one: AuthenticatedUser = {
  uid: "browser-staff-one",
  email: "browser-staff-one@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const two: AuthenticatedUser = {
  ...one,
  uid: "browser-staff-two",
  email: "browser-staff-two@pmikcmetro.com",
};
interface Fixture {
  actor: AuthenticatedUser;
  clock: number;
  sends: WorkflowMimeMessage[];
  lose: boolean;
  threads: Map<string, GmailThreadView>;
  sent: Map<
    string,
    {
      mime: string;
      messageId: string;
      threadId: string;
      labelIds: string[];
      sentAtMs: number;
    }
  >;
}
const globalFixture = globalThis as unknown as Record<symbol, Fixture>;
const key = Symbol.for("pmi-kc-operations-isolated-communications-fixture");
const state =
  globalFixture[key] ??
  (globalFixture[key] = {
    actor: one,
    clock: Date.parse("2026-10-09T14:00:00Z"),
    sends: [],
    lose: false,
    threads: new Map(),
    sent: new Map(),
  });
const app = getApps()[0] ?? initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID }),
  db = getFirestore(app);
export async function requireCapabilityInSpace(...args: unknown[]) {
  void args;
  return state.actor;
}
export function buildLiveRentVineConfig(...args: unknown[]) {
  void args;
  return { ok: true, rentvineClient: {} };
}
export async function requirePageCapability(...args: unknown[]) {
  void args;
  return state.actor;
}
export async function readCoherentRenewalDisplaySource(...args: unknown[]) {
  void args;
  return {
    snapshot: {
      views: [
        {
          leaseID: 9001,
          unit: { unitID: 9002, address: "Local 9001 Fixture Lane" },
          property: { propertyID: 9003, name: "Synthetic property" },
        },
      ],
      complete: true,
      readAtMs: Date.now(),
    },
    currency: { state: "fresh" },
  };
}
export async function requireCurrentLeaseViews(...args: unknown[]) {
  void args;
  return [{ leaseID: 9001 }];
}
const legacyStore = () => new FirestoreGmailStateStore({ db, dataMode: "test" });
const legacyHref = workflowCommunicationHref({
  entity_type: "renewal_lease",
  entity_id: "9001",
  purpose: "renewal_owner",
});
export function EntryPointsFixture() {
  return (
    <AppShell user={state.actor}>
      <main className="content">
        <h1>Saved Communications entries</h1>
        <a href={legacyHref}>Saved original workflow link</a>
      </main>
    </AppShell>
  );
}
export function createGmailHubService(actor: AuthenticatedUser) {
  return new GmailHubService(actor, {
    store: legacyStore(),
    createClient: () => {
      throw Error("Discovery cannot construct Gmail");
    },
    assertEffectEnvironment: () => {
      throw Error("A saved link grants no effect");
    },
    assertRuntimeActionExecutable: async () => {},
  });
}
export async function notificationGET(...args: unknown[]) {
  void args;
  const notifications = await listGmailWorkflowNotifications(
    state.actor,
    {},
    legacyStore(),
  );
  return Response.json({
    notifications,
    families: [],
    unreadTotal: notifications.filter((n) => !n.read_at).length,
  });
}
export async function notificationReadPOST(request: Request) {
  const input = await request.json();
  assert.equal(input.source, "gmail_workflow");
  await markGmailWorkflowNotificationRead(state.actor, input.id, legacyStore());
  return Response.json({ ok: true });
}
async function seedLegacy() {
  const t = Date.now();
  const store = legacyStore();
  for (const [n, status] of ["draft_created", "sent", "attention_required"].entries()) {
    const link: WorkflowCommunicationLink = {
      id: `browser-legacy-${n}`,
      actor_uid: one.uid,
      mailbox_key: gmailMailboxKey(one.email),
      lane: "renewals",
      entity_type: "renewal_lease",
      entity_id: "9001",
      purpose: "renewal_owner",
      origin_action_key: "gmail.renewal_notice.draft_create",
      source_refs: ["rentvine:lease:9001"],
      status: status as WorkflowCommunicationLink["status"],
      draft_id: `original-draft-${n}`,
      gmail_thread_id: `original-thread-${n}`,
      ...(n === 2 ? { attention_at_ms: t } : {}),
      created_at_ms: t,
      updated_at_ms: t,
      ...communicationsRetentionFields("workflow_link", t),
    };
    await store.saveCommunicationLink(link);
  }
}
export async function requireCapability(...args: unknown[]) {
  void args;
  return state.actor;
}
export function BrowserCommunicationsFixture() {
  return (
    <main>
      <Suspense fallback={<p>Loading communications</p>}>
        <GmailHubHome authenticatedEmail={state.actor.email} />
      </Suspense>
    </main>
  );
}
function target(context: WorkflowCommunicationContext): VerifiedCommunicationTarget {
  if (
    !(
      (context.entityType === "renewal_lease" && context.entityId === "9001") ||
      (context.entityType === "maintenance_ticket" &&
        context.entityId === "synthetic-ticket")
    )
  )
    throw new EditableLayerError("This synthetic workflow is unavailable.", 404);
  return {
    context,
    to: ["owner@example.invalid"],
    cc: [],
    sourceRefs: [`${context.entityType}:${context.entityId}`],
    label: "Local 9001 Fixture Lane",
    materialSourceHash: "a".repeat(64),
    blockers: [],
  };
}
export async function prepareWorkflowComposition(
  actor: AuthenticatedUser,
  context: WorkflowCommunicationContext,
) {
  const verified = await verifiedTarget(actor, context);
  if (verified.reply)
    return {
      target: verified,
      initial: {
        subject: verified.reply.subject,
        paragraphs: [[{ text: "" }]],
        attachmentIds: [],
      },
      attachmentNotice: null,
    };
  return {
    target: verified,
    initial: {
      subject: "Exact synthetic owner update",
      paragraphs: [
        [
          { text: "Local 9001 Fixture Lane", bold: true },
          { text: " — review the current proposal." },
        ],
      ],
      attachmentIds: [],
    },
    attachmentNotice: null,
  };
}
async function verifiedTarget(
  actor: AuthenticatedUser,
  context: WorkflowCommunicationContext,
): Promise<VerifiedCommunicationTarget> {
  const base = target(context);
  if (!context.replyTo) return base;
  const service = createCommunicationSequenceService(),
    original = await service.get(actor, context.replyTo.sequenceId),
    thread = await service.thread(
      actor,
      original.id,
      context.replyTo.threadId,
      context.replyTo.senderEmail,
    );
  const reply = bindWorkflowReply(context, original.context, thread, base);
  return {
    ...base,
    reply,
    materialSourceHash: createHash("sha256")
      .update(JSON.stringify({ source: base.materialSourceHash, reply }))
      .digest("hex"),
  };
}
export async function prepareWorkflowReplyComposition(
  actor: AuthenticatedUser,
  replyTo: NonNullable<WorkflowCommunicationContext["replyTo"]>,
) {
  const original = await createCommunicationSequenceService().get(
      actor,
      replyTo.sequenceId,
    ),
    context = { ...original.context, actionKey: "gmail.thread.reply" as const, replyTo };
  return { ...(await prepareWorkflowComposition(actor, context)), context };
}
export function createCommunicationSequenceService() {
  const deps: CommunicationSequenceDependencies = {
    store: new FirestoreCommunicationSequenceStore(db),
    now: () => state.clock,
    resolveTarget: verifiedTarget,
    resolveAttachment: (id, c) => new CommunicationAttachmentStore(db).resolve(id, c),
    readActor: async (uid) => (uid === two.uid ? two : one),
    assertRuntimeAction: async () => undefined,
    assertEffectEnvironment: () => undefined,
    createClient: (sender) => ({
      subject: sender,
      getProfile: async () => ({
        emailAddress: sender,
        messagesTotal: 0,
        threadsTotal: 0,
        historyId: "100",
      }),
      getThread: async (id) => {
        const thread = state.threads.get(`${sender}:${id}`);
        if (!thread) throw new Error("Synthetic thread unavailable");
        return structuredClone(thread);
      },
      sendWorkflowMessage: async (m) => {
        const count = state.sends.push(m),
          messageId = `synthetic-message-${count}`,
          threadId = m.threadId ?? "synthetic-mailbox-thread",
          threadKey = `${sender}:${threadId}`,
          thread = state.threads.get(threadKey) ?? {
            id: threadId,
            truncated: false,
            messages: [],
            historyId: "100",
          };
        thread.messages.push({
          id: messageId,
          threadId,
          labelIds: ["SENT"],
          internalDate: String(state.clock),
          from: sender,
          to: m.to,
          cc: m.cc,
          bcc: [],
          subject: m.subject,
          date: new Date(state.clock).toISOString(),
          messageId: m.messageId,
          references: m.references,
          bodyText: m.body,
          bodyTruncated: false,
          attachments: m.attachments.map((a) => ({
            filename: a.filename,
            mimeType: a.mimeType,
            size: a.bytes.length,
          })),
        });
        state.threads.set(threadKey, thread);
        const receipt = {
          mime: encodeWorkflowMime(m),
          messageId,
          threadId,
          labelIds: ["SENT"],
          sentAtMs: state.clock,
        };
        state.sent.set(m.messageId, receipt);
        if (state.lose) {
          state.lose = false;
          throw new GmailRuntimeError(
            "Synthetic response lost after dispatch",
            undefined,
            true,
          );
        }
        return receipt;
      },
      findWorkflowMessage: async (id, expected) => {
        const receipt = state.sent.get(id);
        if (!receipt) return null;
        assert.equal(receipt.mime, encodeWorkflowMime(expected));
        return receipt;
      },
    }),
  };
  return new WorkflowCommunicationSequenceService(deps);
}
export async function controlPOST(request: Request) {
  const input = await request.json();
  if (input.seedLegacy) await seedLegacy();
  if (input.clock) {
    assert.equal(typeof input.clock, "string");
    state.clock = Date.parse(input.clock);
    assert.ok(Number.isFinite(state.clock));
  }
  if (input.actor) {
    assert.ok(input.actor === one.uid || input.actor === two.uid);
    state.actor = input.actor === two.uid ? two : one;
  }
  if (input.reply) {
    const sender = input.sender ?? one.email;
    const thread = state.threads.get(`${sender}:synthetic-mailbox-thread`);
    assert.ok(thread);
    thread.messages.push({
      id: `synthetic-reply-${state.clock}`,
      threadId: thread.id,
      labelIds: ["INBOX"],
      internalDate: String(state.clock),
      from: "owner@example.invalid",
      to: [sender],
      cc: [],
      bcc: [],
      subject: thread.messages[0].subject,
      date: new Date(state.clock).toISOString(),
      messageId: `<reply-${state.clock}@example.invalid>`,
      references: [],
      bodyText: "Human reply to the approved message",
      bodyTruncated: false,
      attachments: [],
    });
  }
  if (input.lose) state.lose = true;
  const worker = input.worker
    ? await runCommunicationWorker({
        service: createCommunicationSequenceService(),
        store: new CommunicationWorkerStore(db),
        now: () => state.clock,
      })
    : null;
  return Response.json({
    worker,
    legacy: input.inspectLegacy
      ? (await legacyStore().listCommunicationLinks(one.email)).map((l) => ({
          id: l.id,
          draftId: l.draft_id,
          threadId: l.gmail_thread_id,
          status: l.status,
          sequenceId: l.sequence_id ?? null,
        }))
      : null,
    sends: state.sends.map((m) => ({
      from: m.from,
      threadId: m.threadId ?? null,
      inReplyTo: m.inReplyTo ?? null,
      references: m.references ?? [],
      subject: m.subject,
      body: m.body,
      htmlBody: m.htmlBody,
      attachments: m.attachments.map((a) => ({
        filename: a.filename,
        sha256: createHash("sha256").update(a.bytes).digest("hex"),
      })),
    })),
  });
}
export async function senderGET() {
  return Response.json({
    staff: [one, two].map((a) => ({ uid: a.uid, name: a.uid, email: a.email })),
    cursor: null,
  });
}
