// Synthetic actors/sources only, injected by a guarded disposable loopback runner.
import assert from "node:assert/strict";
export { authErrorResponse } from "@/lib/auth/session";
import { randomUUID } from "node:crypto";
import {
  answerQuestion as answerWithOwningService,
  type AskServiceOptions,
} from "@/lib/ask/service";
import type { AskRequest } from "@/lib/schemas";
import { readServerConfig } from "@/lib/config/server";
import type { ModelProvider } from "@/lib/llm/model-provider";
import type { ConversationMemory } from "@/lib/assistant-history/memory-types";
import {
  fakeOperationalContext,
  maintenanceRead,
  task,
  workRead,
} from "@/tests/helpers/operational-context-fake";
import { AskForm } from "@/components/ask/AskForm";
import { SharedLeaseCollections } from "@/components/lease-renewal/SharedLeaseCollections";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  beginAssistantTurn,
  finalizeAssistantTurn,
} from "@/lib/firestore/assistant-history";
import {
  historyOwnerKey,
  listAssistantConversations,
  readActiveConversationSelection,
} from "@/lib/firestore/assistant-history-read";
import {
  listSavedQuestions,
  saveQuestion,
} from "@/lib/firestore/assistant-saved-questions";
import { updateAssistantThreadMetadata } from "@/lib/firestore/assistant-thread-metadata";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { CollectionSource } from "@/lib/lease-renewal/shared-collections";
assert.match(process.cwd(), /^\/tmp\/pmi-kc-operations-browser-[^/]+\/worktree$/);
assert.equal(process.env.OPERATIONS_BROWSER_FIXTURE, "true");
assert.equal(process.env.FIREBASE_PROJECT_ID, "pmi-kc-kb-operations-browser-test");
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
const one: AuthenticatedUser = {
    uid: "browser-history-staff-one",
    email: "browser-history-staff-one@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Approver",
  },
  two: AuthenticatedUser = {
    ...one,
    role: "Editor",
    uid: "browser-history-staff-two",
    email: "browser-history-staff-two@pmikcmetro.com",
  };
interface State {
  actor: AuthenticatedUser;
  seed: Promise<void> | null;
  thread: string | null;
  threadKey: string | null;
  ids: string[];
  cycle: string;
  complete: boolean;
  interpretations: string[];
  answers: Array<{ question: string; memory: ConversationMemory | null }>;
  reads: string[];
}
const globals = globalThis as unknown as Record<symbol, State>,
  key = Symbol.for("pmi-kc-private-history-collection-fixture"),
  state =
    globals[key] ??
    (globals[key] = {
      actor: one,
      seed: null,
      thread: null,
      threadKey: null,
      ids: ["701", "702"],
      cycle: "2026-12-31",
      complete: true,
      interpretations: [],
      answers: [],
      reads: [],
    });
export async function requireCapability(...args: unknown[]) {
  void args;
  return state.actor;
}
export async function requireCapabilityInSpace(...args: unknown[]) {
  void args;
  return state.actor;
}
async function append(question: string, answer: string) {
  const operationId = randomUUID(),
    conversationKey = state.threadKey ?? operationId;
  const begun = await beginAssistantTurn(one, { operationId, conversationKey, question });
  state.thread = begun.conversationId;
  state.threadKey = conversationKey;
  await finalizeAssistantTurn(one, operationId, {
    conversationKey,
    question,
    state: "completed",
    assistant: null,
    knowledge: {
      question,
      source_state: "Partial Source",
      answer,
      handling_steps: [],
      citations: [
        {
          source_id: "synthetic-independent-policy",
          title: "Synthetic approved PMI policy",
          url: "https://example.invalid/policy",
        },
      ],
      draft: "",
    },
  });
  return operationId;
}
async function seed() {
  state.seed ??= (async () => {
    const op = await append(
      "Continuing monthly lease discussion",
      "Earlier discussion retained with its original date.",
    );
    await append(
      "Use 3.5%, pending actual membership and agreement evidence.",
      "Correction remembered; this does not verify membership or owner authority.",
    );
    await saveQuestion(one, { operationId: op });
    await updateAssistantThreadMetadata(one, {
      action: "select",
      conversationId: state.thread,
      expectedVersion: (await readActiveConversationSelection(one)).version,
      operationId: randomUUID(),
    });
  })();
  await state.seed;
}
export async function HistoryFixture() {
  await seed();
  const actor = state.actor,
    page = await listAssistantConversations(actor),
    pins = await listAssistantConversations(actor, { pinnedOnly: true }),
    selection = await readActiveConversationSelection(actor),
    saved = await listSavedQuestions(actor);
  return (
    <main className="content content--workspace">
      <AskForm
        key={actor.uid}
        historyMode="saved"
        ownerKey={historyOwnerKey(actor.uid)}
        initialHistory={Promise.resolve({
          status: "ok",
          page: {
            ownerKey: historyOwnerKey(actor.uid),
            persisted: true,
            ...page,
            activeSelection: selection,
            pinnedConversations: pins.conversations,
            pinnedNextCursor: pins.nextCursor,
          },
        })}
        initialSaved={Promise.resolve({
          status: "ok",
          list: { ownerKey: historyOwnerKey(actor.uid), persisted: true, ...saved },
        })}
      />
    </main>
  );
}
export function CollectionsFixture({
  searchParams,
}: Readonly<{ searchParams?: Promise<Record<string, string | undefined>> }>) {
  return CollectionPage(searchParams);
}
async function CollectionPage(params?: Promise<Record<string, string | undefined>>) {
  const q = (await params) ?? {};
  return (
    <main className="content content--workspace">
      <SharedLeaseCollections
        ownerUid={state.actor.uid}
        initialMembers={["701", "702"]}
        origin="worklist"
        initialId={q.id ?? null}
        initialReview={q.review ?? null}
        initialOperation={q.operation ?? null}
      />
    </main>
  );
}
export async function readSharedCollectionSource(
  ...args: unknown[]
): Promise<CollectionSource> {
  void args;
  return {
    complete: state.complete,
    readAt: new Date().toISOString(),
    issues: state.complete ? [] : ["Synthetic incomplete source; membership is kept."],
    records: state.ids.map((id) => ({
      member: {
        leaseId: id,
        cycleKey: `source:lease_end:${state.cycle}`,
        cycleDate: state.cycle,
      },
      label: `Local ${id} Fixture Lane`,
      href: `/lease-renewal/live/desk/lease/${id}`,
      lifecycle: "Renewal active",
      workStatus: "In progress",
    })),
    matches: () => state.ids,
  };
}
export function createModelProvider(...args: unknown[]): ModelProvider {
  void args;
  return {
    generateText: async (input) => {
      state.interpretations.push(input.userContent);
      return { text: "{}" };
    },
  };
}
export function createServerOperationalContext(user: AuthenticatedUser, now: Date) {
  const context = fakeOperationalContext({
    actorUid: user.uid,
    nowIso: now.toISOString(),
    reads: {
      maintenance: maintenanceRead([
        { id: "synthetic-case", title: "Synthetic assessment case" },
      ]),
      work: workRead([
        task({
          id: "synthetic-thread-task",
          title: "Synthetic assigned follow-up",
          assignee_uid: user.uid,
        }),
      ]),
    },
  });
  return {
    ...context,
    read: async (source: Parameters<typeof context.read>[0]) => {
      state.reads.push(source);
      return context.read(source);
    },
  } as ReturnType<typeof fakeOperationalContext>;
}
export async function answerQuestion(
  user: AuthenticatedUser,
  request: AskRequest,
  options: AskServiceOptions = {},
) {
  return answerWithOwningService(user, request, {
    ...options,
    config: { ...readServerConfig(), askDemoMode: false },
    retrievalClient: {
      search: async () => ({ sources: [], sourceIds: [], citations: [], confidence: 0 }),
    },
    answerGenerator: {
      generateAnswer: async (input) => {
        state.answers.push({
          question: input.ask.question,
          memory: input.memory ?? null,
        });
        return {
          answer:
            "Keep the corrected 3.5% discussion pending real membership and agreement evidence.",
          source_state: "No Reliable Source Found",
          handling_steps: [],
          citations: [],
          draft: "",
          claims: [
            {
              kind: "recommendation",
              text: "Keep the corrected 3.5% discussion pending real membership and agreement evidence.",
              source_ids: [],
              history_seq: null,
            },
          ],
        };
      },
    },
  });
}
export async function controlPOST(request: Request) {
  const input = await request.json();
  await seed();
  if (input.actor) {
    assert.ok(input.actor === one.uid || input.actor === two.uid);
    state.actor = input.actor === two.uid ? two : one;
  }
  if (input.padding)
    for (let i = 1; i <= 4; i++)
      await append(`Unrelated stored question ${i}`, `Unrelated stored answer ${i}`);
  if (input.narrow) state.actor = { ...one, role: "Editor" };
  if (input.append)
    await append(
      "Later accepted question from a second session",
      "Later accepted answer appears when this pin is reopened.",
    );
  if (input.changed) state.ids = ["701", "703"];
  if (typeof input.complete === "boolean") state.complete = input.complete;
  if (input.cycle) state.cycle = "2027-01-31";
  return Response.json({
    actor: state.actor.uid,
    thread: state.thread,
    threadCount: (await listAssistantConversations(one)).conversations.length,
    threadKey: state.threadKey,
    interpretations: state.interpretations,
    answers: state.answers,
    reads: state.reads,
    historyUsers: (await getAdminFirestore().collection("assistant_history_users").get())
      .size,
  });
}
