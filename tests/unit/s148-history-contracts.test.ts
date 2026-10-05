import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  runOncePerOperation,
  resetOperationDedupe,
} from "@/lib/api/assistant-operation-dedupe";
import {
  conversationActorKey,
  runAssistantConversation,
  type ConversationAnswer,
} from "@/lib/assistant/conversation";
import {
  StoredAssistantAnswerSchema,
  StoredKnowledgeAnswerSchema,
  accessNarrowedSince,
  projectStoredAssistantAnswer,
  projectStoredKnowledgeAnswer,
  type AccessBasis,
} from "@/lib/assistant-history/stored-answer";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { resolveEnvironmentDescriptor } from "@/lib/environment/descriptor";
import {
  EMULATOR_ONLY_HISTORY_REQUESTS,
  LIVE_READONLY_ALLOWED_NON_SAFE_REQUESTS,
  decideLiveReadonlyRequest,
} from "@/lib/environment/live-readonly-request-policy";
import {
  connectionsRead,
  fakeOperationalContext,
  renewalsRead,
} from "@/tests/helpers/operational-context-fake";

// S148 contracts that need no database: what a stored answer may contain, how reopening applies
// the viewer's current access, the duplicate-delivery join, the emulator-only write allowance under
// Live-read-only, and the static read-only boundary of the query route.

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const admin: AuthenticatedUser = {
  uid: "u1",
  email: "owner@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};

async function realAnswer(
  question = "What leases are due this week?",
): Promise<ConversationAnswer> {
  const context = fakeOperationalContext({
    actorUid: admin.uid,
    reads: {
      renewals: renewalsRead([
        { id: "L-1", endDateIso: "2026-10-02" },
        { id: "L-2", endDateIso: "2026-10-03" },
      ]),
      connections: connectionsRead([{ id: "rentvine", state: "connected" }]),
    },
  });
  return runAssistantConversation(
    { question, conversation: null },
    {
      nowIso: context.nowIso,
      actorKey: conversationActorKey(admin.uid),
      context,
      interpret: null,
    },
  );
}

const KNOWLEDGE = {
  question: "How do renewals work?",
  source_state: "Verified Source",
  answer: "Grounded answer.",
  handling_steps: [],
  citations: [
    { source_id: "sop-1", title: "Renewal SOP", url: "https://docs.example.com/sop-1" },
  ],
  draft: "",
};

describe("S148 stored-answer contract", () => {
  it("accepts exactly what the S138 assistant returns, including its executed plan", async () => {
    const answer = await realAnswer();
    expect(answer.groups[0].items.length).toBeGreaterThan(0);
    const parsed = StoredAssistantAnswerSchema.parse(answer);
    expect(parsed).toEqual(answer);
    expect(parsed.execution?.plan).toEqual(answer.execution?.plan);
  });

  it("refuses links that leave the application, script links and unknown fields", async () => {
    const answer = await realAnswer();
    const group = answer.groups[0];
    for (const href of [
      "javascript:alert(1)",
      "//evil.example/x",
      "https://evil.example/x",
      "lease/L-1",
    ]) {
      expect(
        StoredAssistantAnswerSchema.safeParse({
          ...answer,
          groups: [{ ...group, items: [{ ...group.items[0], href }] }],
        }).success,
      ).toBe(false);
      expect(
        StoredAssistantAnswerSchema.safeParse({
          ...answer,
          groups: [{ ...group, link: { label: "Open", href } }],
        }).success,
      ).toBe(false);
    }
    expect(
      StoredAssistantAnswerSchema.safeParse({ ...answer, injected: "<script>" }).success,
    ).toBe(false);
  });

  it("stores knowledge sources only as https links", () => {
    expect(StoredKnowledgeAnswerSchema.safeParse(KNOWLEDGE).success).toBe(true);
    const insecure = {
      ...KNOWLEDGE,
      citations: [{ ...KNOWLEDGE.citations[0], url: "http://docs.example.com/sop-1" }],
    };
    expect(StoredKnowledgeAnswerSchema.safeParse(insecure).success).toBe(false);
  });
});

describe("S148 reopening applies the viewer's current access", () => {
  const basis = (
    role: AuthenticatedUser["role"],
    scopes: string[] | null,
  ): AccessBasis => ({
    role,
    scopes,
  });

  // S167: every staff account has every internal Space, so only a lower role narrows access. A
  // Space list on an answer stored before S167 was produced with less reach than the viewer has now.
  it("detects a narrowed role and nothing else, whatever Space list the stored answer carries", () => {
    const editor = { ...admin, role: "Editor" as const };
    const approver = { ...admin, role: "Approver" as const };
    expect(accessNarrowedSince(basis("Admin", null), editor)).toBe(true);
    expect(accessNarrowedSince(basis("Admin", null), approver)).toBe(true);
    expect(accessNarrowedSince(basis("Approver", null), editor)).toBe(true);
    expect(accessNarrowedSince(basis("Editor", null), admin)).toBe(false);
    expect(accessNarrowedSince(basis("Admin", null), admin)).toBe(false);
    // An older answer stored under a Space allowlist reopens for the same role.
    expect(accessNarrowedSince(basis("Admin", ["renewals"]), admin)).toBe(false);
    expect(
      accessNarrowedSince(basis("Editor", ["maintenance", "renewals"]), editor),
    ).toBe(false);
    // The stored Space list never offsets a lower role.
    expect(accessNarrowedSince(basis("Admin", ["renewals"]), editor)).toBe(true);
    expect(accessNarrowedSince(basis("Approver", ["maintenance"]), editor)).toBe(true);
  });

  it("hides stored records and their references when access narrowed; otherwise returns the answer unchanged", async () => {
    const answer = StoredAssistantAnswerSchema.parse(await realAnswer());
    expect(projectStoredAssistantAnswer(answer, basis("Admin", null), admin)).toBe(
      answer,
    );

    const narrowed = projectStoredAssistantAnswer(answer, basis("Admin", null), {
      ...admin,
      role: "Editor",
    });
    for (const group of narrowed.groups) {
      expect(group.items).toEqual([]);
      expect(group.link).toBeNull();
      expect(group.hiddenForAccess).toBe(true);
    }
    expect(narrowed.conversation.turns.every((turn) => turn.refs.length === 0)).toBe(
      true,
    );
    expect(narrowed.execution?.relatedRefs ?? []).toEqual([]);
    expect(narrowed.execution?.detailRef ?? null).toBeNull();
    expect(JSON.stringify(narrowed)).not.toContain("L-1");
    expect(
      projectStoredKnowledgeAnswer(
        StoredKnowledgeAnswerSchema.parse(KNOWLEDGE),
        basis("Admin", null),
        { ...admin, role: "Editor" },
      ),
    ).toBeNull();
  });

  it("keeps value-free connection status visible after a narrowing", async () => {
    const answer = StoredAssistantAnswerSchema.parse(
      await realAnswer("What applications are connected?"),
    );
    const connections = answer.groups.find((group) => group.source === "connections");
    expect(connections).toBeDefined();
    const narrowed = projectStoredAssistantAnswer(answer, basis("Admin", null), {
      ...admin,
      role: "Editor",
    });
    expect(narrowed.groups.find((group) => group.source === "connections")).toEqual(
      connections,
    );
  });
});

describe("S148 duplicate delivery runs one execution", () => {
  it("joins a concurrent duplicate and reuses a recent completion", async () => {
    resetOperationDedupe();
    let clock = 1_000;
    const now = () => clock;
    const execute = vi.fn(async () => "answer");
    const first = runOncePerOperation("u1:op-00000001:q", execute, now);
    const second = runOncePerOperation("u1:op-00000001:q", execute, now);
    expect([first.joined, second.joined]).toEqual([false, true]);
    expect(await second.promise).toBe("answer");
    clock += 60_000;
    expect(runOncePerOperation("u1:op-00000001:q", execute, now).joined).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    // Another user, operation or question never shares an answer.
    expect(runOncePerOperation("u2:op-00000001:q", execute, now).joined).toBe(false);
    expect(runOncePerOperation("u1:op-00000002:q", execute, now).joined).toBe(false);
    expect(runOncePerOperation("u1:op-00000001:other", execute, now).joined).toBe(false);
    await Promise.resolve();
  });

  it("forgets a failed execution so an explicit retry runs again, and expires old entries", async () => {
    resetOperationDedupe();
    let clock = 1_000;
    const now = () => clock;
    const failing = vi.fn(async () => {
      throw new Error("model unavailable");
    });
    await expect(runOncePerOperation("k", failing, now).promise).rejects.toThrow();
    const retried = runOncePerOperation("k", async () => "ok", now);
    expect(retried.joined).toBe(false);
    await retried.promise;
    clock += 2 * 60_000 + 1;
    expect(runOncePerOperation("k", async () => "again", now).joined).toBe(false);
  });
});

describe("S148 Live-read-only allows history writes only into a local emulator", () => {
  const op = "00000000-0000-4000-8000-000000000001";
  const descriptor = resolveEnvironmentDescriptor({
    ENVIRONMENT_KIND: "demo",
    DATA_CONTEXT: "live_readonly",
  });

  it("refuses the history writes against a real project and allows them only with an emulator", () => {
    expect(descriptor.ok).toBe(true);
    for (const request of [
      { descriptor, method: "POST", pathname: "/api/assistant/history/turns" },
      { descriptor, method: "PUT", pathname: `/api/assistant/history/turns/${op}` },
    ]) {
      expect(decideLiveReadonlyRequest(request).allowed).toBe(false);
      expect(
        decideLiveReadonlyRequest({ ...request, firestoreEmulator: false }).allowed,
      ).toBe(false);
      expect(
        decideLiveReadonlyRequest({ ...request, firestoreEmulator: true }).allowed,
      ).toBe(true);
    }
  });

  it("keeps every other write refused even with an emulator", () => {
    for (const request of [
      { descriptor, method: "DELETE", pathname: `/api/assistant/history/turns/${op}` },
      { descriptor, method: "PUT", pathname: "/api/assistant/history/turns/short" },
      { descriptor, method: "PUT", pathname: `/api/assistant/history/turns/${op}/extra` },
      { descriptor, method: "POST", pathname: "/api/assistant/history" },
      { descriptor, method: "POST", pathname: "/api/lease-renewal/writeback" },
    ]) {
      expect(
        decideLiveReadonlyRequest({ ...request, firestoreEmulator: true }).allowed,
      ).toBe(false);
    }
  });

  it("adds nothing to the fixed Live-read-only allowlist", () => {
    for (const key of LIVE_READONLY_ALLOWED_NON_SAFE_REQUESTS.keys()) {
      expect(key).not.toMatch(/assistant\/history|assistant\/saved/);
    }
    // S148 turns, then S149 save and pin, then the S150 run: each the user's own history only.
    expect(
      EMULATOR_ONLY_HISTORY_REQUESTS.map(
        (entry) => `${entry.method} ${entry.pattern.source}`,
      ),
    ).toEqual([
      // S177: private account preferences are writable only in the local emulator.
      "POST ^\\/api\\/personal-view$",
      "POST ^\\/api\\/assistant\\/history\\/turns$",
      "PUT ^\\/api\\/assistant\\/history\\/turns\\/[A-Za-z0-9-]{8,64}$",
      "POST ^\\/api\\/assistant\\/saved$",
      "PATCH ^\\/api\\/assistant\\/saved\\/[a-f0-9]{32}$",
      "POST ^\\/api\\/assistant\\/saved\\/[a-f0-9]{32}\\/run$",
      // S166: the signed-in account's own remembered worklist view, emulator only as well.
      "POST ^\\/api\\/lease-renewal\\/desk-preferences$",
    ]);
  });
});

describe("S148 static boundaries", () => {
  it("the query route reads history and never imports the history writer", () => {
    const route = read("app/api/assistant/query/route.ts");
    expect(route).toContain('from "@/lib/firestore/assistant-history-read"');
    expect(route).not.toContain('from "@/lib/firestore/assistant-history"');
  });

  it("the history read module performs reads only", () => {
    // The id hash's digest update is not a Firestore call.
    const source = read("lib/firestore/assistant-history-read.ts").replaceAll(
      'createHash("sha256").update(value)',
      "",
    );
    for (const write of [
      ".set(",
      ".create(",
      ".update(",
      ".delete(",
      ".add(",
      "runTransaction",
      "batch(",
    ]) {
      expect(source).not.toContain(write);
    }
  });

  it("no history route can reach a model, an interpreter, a provider or the operational context", () => {
    for (const path of [
      "app/api/assistant/history/route.ts",
      "app/api/assistant/history/[conversationId]/route.ts",
      "app/api/assistant/history/turns/route.ts",
      "app/api/assistant/history/turns/[operationId]/route.ts",
    ]) {
      const source = read(path);
      for (const banned of [
        "@/lib/llm/",
        "@/lib/assistant/interpret",
        "runAssistantConversation",
        "operational-context",
        "createModelProvider",
        "action-gate",
        "rentvine",
        "gmail",
      ]) {
        expect(source, `${path} must not reference ${banned}`).not.toContain(banned);
      }
      expect(source).toContain('requireCapability("read")');
    }
  });

  it("the stored-answer contract is pure", () => {
    const source = read("lib/assistant-history/stored-answer.ts");
    expect(source).not.toMatch(/firebase|fetch\(|getAdminFirestore|node:/);
  });
});
