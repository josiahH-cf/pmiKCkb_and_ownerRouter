import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EMPTY_FILTERS } from "@/lib/assistant/conversation-plan";
import { resolveEnvironmentDescriptor } from "@/lib/environment/descriptor";
import { decideLiveReadonlyRequest } from "@/lib/environment/live-readonly-request-policy";
import {
  SaveQuestionInputSchema,
  UpdateSavedQuestionInputSchema,
  toSavedQuestionView,
  type SavedQuestionRecord,
} from "@/lib/firestore/assistant-saved-questions";

// S149/S150 contracts that need no database: a client can never hand the server a plan, the browser
// never receives a stored plan or record references, the run and saved routes cannot reach a model
// or interpreter, and Live-read-only allows their writes only into a local emulator.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const PLAN = {
  kind: "operational",
  subjects: ["leases"],
  filters: { ...EMPTY_FILTERS, range: { preset: "this_month", month: null } },
  followUp: { usePrevious: false, ordinal: null, detail: false },
  clarification: null,
  unsupportedTopic: null,
};

function record(overrides: Partial<SavedQuestionRecord> = {}): SavedQuestionRecord {
  return {
    owner_uid: "u1",
    saved_id: "d".repeat(32),
    turn_id: "t".repeat(32),
    operation_id: "00000000-0000-4000-8000-000000000001",
    conversation_id: "c".repeat(32),
    conversation_key: "00000000-0000-4000-8000-000000000001",
    question: "What leases are due this month?",
    label: "What leases are due this month?",
    plan: PLAN,
    related_refs: [{ source: "renewals", id: "L-1" }],
    detail_ref: null,
    original_range: null,
    context_before: {
      version: 1,
      actorKey: "b".repeat(32),
      turns: [],
    },
    pinned: false,
    pinned_at: null,
    record_version: 1,
    created_at: "2026-09-30T17:00:00.000Z",
    updated_at: "2026-09-30T17:00:00.000Z",
    last_turn_id: "t".repeat(32),
    last_operation_id: "00000000-0000-4000-8000-000000000001",
    last_answered_at: "2026-09-30T17:00:00.000Z",
    access_basis: { role: "Admin", scopes: null },
    ...overrides,
  };
}

describe("S149/S150 request contracts", () => {
  it("a save names only the user's own turn; a client cannot supply a plan", () => {
    expect(
      SaveQuestionInputSchema.safeParse({
        operationId: "00000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(true);
    for (const extra of [
      { plan: PLAN },
      { question: "x" },
      { relatedRefs: [] },
      { uid: "u2" },
    ]) {
      expect(
        SaveQuestionInputSchema.safeParse({
          operationId: "00000000-0000-4000-8000-000000000001",
          ...extra,
        }).success,
      ).toBe(false);
    }
  });

  it("a pin or label change must name the version it saw and change something", () => {
    expect(UpdateSavedQuestionInputSchema.safeParse({ pinned: true }).success).toBe(
      false,
    );
    expect(UpdateSavedQuestionInputSchema.safeParse({ expectedVersion: 1 }).success).toBe(
      false,
    );
    expect(
      UpdateSavedQuestionInputSchema.safeParse({
        pinned: true,
        expectedVersion: 1,
        plan: PLAN,
      }).success,
    ).toBe(false);
    expect(
      UpdateSavedQuestionInputSchema.safeParse({
        label: "x".repeat(81),
        expectedVersion: 1,
      }).success,
    ).toBe(false);
  });

  it("the run route accepts only an operation id; the plan is loaded on the server", () => {
    const route = read("app/api/assistant/saved/[savedId]/run/route.ts");
    expect(route).toMatch(
      /z\s*\.object\(\{ operationId: z\.string\(\)\.regex\(\/\^\[A-Za-z0-9-\]\{8,64\}\$\/\) \}\)\s*\.strict\(\)/,
    );
    expect(route).toContain("readSavedQuestion(user, savedId)");
    expect(route).toContain("plan: saved.plan");
  });
});

describe("S149 what the browser receives", () => {
  it("never the stored plan or record references; the earlier context only when asking again", () => {
    const structured = toSavedQuestionView(record());
    expect(structured.structured).toBe(true);
    expect(JSON.stringify(structured)).not.toMatch(/"plan"|L-1|related/);
    expect(structured.contextBefore).toBeNull();

    const unstructured = toSavedQuestionView(
      record({ plan: { ...PLAN, subjects: ["maintenance"] } }),
    );
    expect(unstructured.structured).toBe(false);
    expect(unstructured.contextBefore).toEqual(record().context_before);
    expect(JSON.stringify(unstructured)).not.toMatch(/"plan"|L-1/);
  });
});

describe("S149/S150 route boundaries", () => {
  const routes = [
    "app/api/assistant/saved/route.ts",
    "app/api/assistant/saved/[savedId]/route.ts",
    "app/api/assistant/saved/[savedId]/run/route.ts",
  ];

  it("no saved-question route can reach a model, an interpreter or a provider write", () => {
    for (const path of routes) {
      const source = read(path);
      for (const banned of [
        "@/lib/llm/",
        "@/lib/assistant/interpret",
        "createModelProvider",
        "runAssistantConversation",
        "action-gate",
        "external-execution",
        "rentvine",
        "gmail",
        "process-definitions",
      ]) {
        expect(source, `${path} must not reference ${banned}`).not.toContain(banned);
      }
      expect(source).toContain('requireCapability("read")');
      expect(source).toMatch(/refuseVerificationWrite|isHistoryPersisted/);
    }
  });

  it("the stored-plan executor stays inside the read-only assistant module", () => {
    const engine = read("lib/assistant/conversation.ts");
    expect(engine).toContain("export async function runStoredPlan(");
    expect(engine).toContain('interpretedBy: "stored_plan"');
    const runStoredPlanSource = engine.slice(
      engine.indexOf("export async function runStoredPlan("),
      engine.indexOf("/** The executed plan and the concrete period"),
    );
    expect(runStoredPlanSource).not.toMatch(
      /interpret\(|deps\.interpret|ModelInterpreter/,
    );
  });

  it("Live-read-only allows the saved writes only into a local emulator", () => {
    const descriptor = resolveEnvironmentDescriptor({
      ENVIRONMENT_KIND: "demo",
      DATA_CONTEXT: "live_readonly",
    });
    const id = "d".repeat(32);
    for (const request of [
      { method: "POST", pathname: "/api/assistant/saved" },
      { method: "PATCH", pathname: `/api/assistant/saved/${id}` },
      { method: "POST", pathname: `/api/assistant/saved/${id}/run` },
    ]) {
      expect(decideLiveReadonlyRequest({ descriptor, ...request }).allowed).toBe(false);
      expect(
        decideLiveReadonlyRequest({ descriptor, ...request, firestoreEmulator: true })
          .allowed,
      ).toBe(true);
    }
    for (const request of [
      { method: "DELETE", pathname: `/api/assistant/saved/${id}` },
      { method: "PUT", pathname: `/api/assistant/saved/${id}` },
      { method: "POST", pathname: `/api/assistant/saved/${id}` },
      { method: "PATCH", pathname: "/api/assistant/saved/not-an-id" },
      { method: "POST", pathname: `/api/assistant/saved/${id}/run/extra` },
    ]) {
      expect(
        decideLiveReadonlyRequest({ descriptor, ...request, firestoreEmulator: true })
          .allowed,
      ).toBe(false);
    }
  });
});
