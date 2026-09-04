import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ASSISTANT_INTENTS,
  ASSISTANT_QUERY_VERSION,
  matchAssistantIntent,
  unsupportedAssistantResponse,
} from "@/lib/assistant/intent-registry";
import { projectRenewalItems } from "@/lib/assistant/renewal-adapter";
import { runAssistantQuery } from "@/lib/assistant/query";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
import type { WorkTaskRecord } from "@/lib/work-accountability/types";

// S110: three closed read-only intents. The client supplies only question text; the actor, role,
// Space, intent, and filters are all derived server-side, and no path writes, starts a run, drafts,
// or reaches a provider.

const NOW = "2026-09-04T12:00:00.000Z";

const editor: AuthenticatedUser = {
  uid: "uid-1",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

function task(overrides: Partial<WorkTaskRecord> = {}): WorkTaskRecord {
  return {
    id: "task-1",
    space_id: "renewals",
    source: { type: "manual", status: "current" } as unknown as WorkTaskRecord["source"],
    task_type: "renewal_followup",
    title: "Call the owner at 4821 Maple Ct",
    assignee_uid: "uid-1",
    creator_uid: "uid-1",
    state: "Assigned",
    next_action: "Call the owner",
    due_at: "2026-09-04T20:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  } as WorkTaskRecord;
}

function row(overrides: Record<string, unknown> = {}): DeskLeaseRow {
  return {
    id: "lease-1",
    addressLabel: "4821 Maple Ct",
    propertyNameLabel: null,
    tenantNameLabel: "Tenant Of Record",
    tenantNameLabels: ["Tenant Of Record"],
    ownerNameLabels: ["Owner Of Record"],
    identity: { leaseRef: "lease-1" },
    endDateIso: "2026-10-31",
    disposition: "review",
    reason: "in_window",
    reasonLabel: "In the renewal window",
    leaseTerm: { term: "fixed_term" },
    currentRent: 1500,
    unitListedRent: 1500,
    retention: { state: "unknown" },
    processVersion: null,
    workflowStepId: null,
    stageIndex: 0,
    stageLabel: null,
    nextAction: null,
    openConflicts: 0,
    queryKeys: { normalizedOwners: [], normalizedTenants: [] },
    guidance: {
      currentBaseRent: 1500,
      currentBaseRentSource: "RentVine",
      rentVerification: { state: "verified" },
      overallStatus: "on_track",
      urgencyRank: 3,
      isBlocked: false,
      blockers: [],
      action: { label: "Open this lease", href: "/lease-renewal/live/desk" },
    },
    processState: null,
    ...overrides,
  } as unknown as DeskLeaseRow;
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    nowIso: NOW,
    hasRenewalsAccess: true,
    loadWorkSnapshot: async () => ({ tasks: [task()], server_now: NOW }),
    loadRenewalRows: async () => ({ status: "ok" as const, rows: [row()] }),
    ...overrides,
  };
}

describe("S110 the intent registry is closed and versioned (ARCH-S110-1)", () => {
  it("exposes exactly the three V1 intents", () => {
    expect([...ASSISTANT_INTENTS]).toEqual([
      "work.assigned_today",
      "renewal.blocked",
      "renewal.window",
    ]);
    expect(ASSISTANT_QUERY_VERSION).toBe("assistant-query/v1");
  });

  it("maps representative phrasings to the same intent (BEH-S110-3)", () => {
    for (const question of [
      "What work is assigned to me today?",
      "what is assigned to me today",
      "show my work for today",
      "what do I have on today",
    ]) {
      expect(matchAssistantIntent(question, NOW), question).toMatchObject({
        kind: "matched",
        intent: "work.assigned_today",
      });
    }
    for (const question of [
      "What renewal blockers do I currently have?",
      "which renewals are blocked",
      "show blocked renewals",
    ]) {
      expect(matchAssistantIntent(question, NOW), question).toMatchObject({
        kind: "matched",
        intent: "renewal.blocked",
      });
    }
  });

  it("parses the supported renewal periods in the Kansas City calendar", () => {
    expect(matchAssistantIntent("Which renewals come up next month?", NOW)).toMatchObject(
      {
        kind: "matched",
        intent: "renewal.window",
        filters: { month: "2026-10" },
      },
    );
    expect(matchAssistantIntent("what renewals are due this month", NOW)).toMatchObject({
      filters: { month: "2026-09" },
    });
    expect(matchAssistantIntent("renewals for 2026-12", NOW)).toMatchObject({
      filters: { month: "2026-12" },
    });
  });

  it("asks exactly one clarification for an ambiguous period", () => {
    const result = matchAssistantIntent("which renewals are coming up soon", NOW);
    expect(result.kind).toBe("clarify");
    if (result.kind === "clarify") {
      expect(result.question).toMatch(/which month/i);
    }
  });

  it("returns the bounded unsupported response for anything else", () => {
    const result = matchAssistantIntent("what is our pet policy", NOW);
    expect(result.kind).toBe("unsupported");
    const bounded = unsupportedAssistantResponse();
    expect(bounded.supported).toHaveLength(3);
    for (const entry of bounded.supported) {
      expect(entry).toMatch(/\?$/);
    }
  });
});

describe("S110 adapters return the owning records with links (BEH-S110-1 / BEH-S110-2)", () => {
  it("returns the actor's open work due today or overdue, or blocked", async () => {
    const envelope = await runAssistantQuery(
      { question: "What work is assigned to me today?" },
      editor,
      deps({
        loadWorkSnapshot: async () => ({
          tasks: [
            task({ id: "due-today" }),
            task({ id: "overdue", due_at: "2026-09-01T00:00:00.000Z" }),
            task({ id: "blocked", state: "Blocked", blocker_reason: "Waiting on owner" }),
            task({ id: "later", due_at: "2026-09-30T00:00:00.000Z" }),
            task({ id: "done", state: "Completed" }),
            task({ id: "someone-else", assignee_uid: "uid-2" }),
          ],
          server_now: NOW,
        }),
      }),
    );
    expect(envelope.intent).toBe("work.assigned_today");
    expect(envelope.items.map((item) => item.id)).toEqual([
      "due-today",
      "overdue",
      "blocked",
    ]);
    expect(envelope.items[2].blockers).toEqual(["Waiting on owner"]);
    for (const item of envelope.items) {
      expect(item.href).toMatch(/^\/work/);
    }
    expect(envelope.completeness).toBe("complete");
  });

  it("returns the desk's blocked rows with the same blocker labels", async () => {
    const envelope = await runAssistantQuery(
      { question: "What renewal blockers do I currently have?" },
      editor,
      deps({
        loadRenewalRows: async () => ({
          status: "ok" as const,
          rows: [
            row(),
            row({
              id: "lease-blocked",
              guidance: {
                ...row().guidance,
                isBlocked: true,
                blockers: [{ label: "Owner has not responded" }],
                overallStatus: "blocked",
              },
            }),
          ],
        }),
      }),
    );
    expect(envelope.intent).toBe("renewal.blocked");
    expect(envelope.items.map((item) => item.id)).toEqual(["lease-blocked"]);
    expect(envelope.items[0].blockers).toEqual(["Owner has not responded"]);
    expect(envelope.items[0].href).toContain("/lease-renewal/live/desk");
  });

  it("returns the rows whose end date or review anchor falls in the requested month", async () => {
    const envelope = await runAssistantQuery(
      { question: "Which renewals come up next month?" },
      editor,
      deps({
        loadRenewalRows: async () => ({
          status: "ok" as const,
          rows: [
            row({ id: "in-window", endDateIso: "2026-10-15" }),
            row({ id: "outside", endDateIso: "2026-11-15" }),
            row({
              id: "periodic",
              endDateIso: null,
              disposition: "periodic_review",
              leaseTerm: { term: "month_to_month", nextReviewIso: "2026-10-01" },
            }),
          ],
        }),
      }),
    );
    expect(envelope.items.map((item) => item.id)).toEqual(["in-window", "periodic"]);
    expect(envelope.appliedFilters).toMatchObject({ month: "2026-10" });
  });
});

describe("S110 honesty and access (AC-S110-3 / AC-S110-4 / BEH-S110-3)", () => {
  it("reports a failed renewal read as unavailable, never as no renewals", async () => {
    const envelope = await runAssistantQuery(
      { question: "What renewal blockers do I currently have?" },
      editor,
      deps({
        loadRenewalRows: async () => ({ status: "read_error" as const, rows: [] }),
      }),
    );
    expect(envelope.completeness).toBe("unavailable");
    expect(envelope.items).toEqual([]);
    expect(envelope.sourceState).toMatch(/could not/i);
    expect(envelope.sourceState).not.toMatch(/no renewals/i);
  });

  it("reports a partial renewal read as partial", async () => {
    const envelope = await runAssistantQuery(
      { question: "What renewal blockers do I currently have?" },
      editor,
      deps({
        loadRenewalRows: async () => ({
          status: "ok" as const,
          rows: [],
          degraded: ["progress"],
        }),
      }),
    );
    expect(envelope.completeness).toBe("partial");
  });

  it("gives an actor without Renewals access no lease count or label", async () => {
    const envelope = await runAssistantQuery(
      { question: "What renewal blockers do I currently have?" },
      editor,
      deps({
        hasRenewalsAccess: false,
        loadRenewalRows: async () => {
          throw new Error("The renewal source must not be read without access.");
        },
      }),
    );
    expect(envelope.completeness).toBe("unavailable");
    expect(envelope.items).toEqual([]);
    expect(JSON.stringify(envelope)).not.toMatch(/lease-1|4821|Maple/);
    expect(envelope.sourceState).toMatch(/Renewals/i);
  });

  it("never lets a caller supply the actor, intent, Space, or filters (AC-S110-1)", () => {
    const code = readFileSync("app/api/assistant/query/route.ts", "utf8").replaceAll(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      "",
    );
    // The request body schema is the whole client surface: only the question text.
    const schema = /RequestSchema[\s\S]*?\}\)/.exec(code)?.[0] ?? "";
    expect(schema).toContain("question");
    for (const forbidden of ["intent", "actor", "uid", "role", "space", "filters"]) {
      expect(schema, forbidden).not.toContain(forbidden);
    }
  });
});

describe("S110 zero write across every path (AC-S110-2)", () => {
  it("never invokes a write, run start, draft, or provider call", async () => {
    // The action gate is the single door to every provider effect. If any assistant path opened it,
    // this stub would throw and fail the run.
    const gate = (await import("@/lib/integrations/action-gate")) as Record<
      string,
      unknown
    >;
    const original = new Map<string, unknown>();
    for (const key of Object.keys(gate)) {
      if (typeof gate[key] !== "function") continue;
      original.set(key, gate[key]);
      Object.defineProperty(gate, key, {
        configurable: true,
        value: () => {
          throw new Error(`The assistant invoked the action gate through ${key}.`);
        },
      });
    }
    expect(original.size).toBeGreaterThan(0);
    try {
      for (const question of [
        "What work is assigned to me today?",
        "What renewal blockers do I currently have?",
        "Which renewals come up next month?",
        "what is our pet policy",
        "which renewals are coming up soon",
      ]) {
        await runAssistantQuery({ question }, editor, deps());
      }
    } finally {
      for (const [key, value] of original) {
        Object.defineProperty(gate, key, { configurable: true, value });
      }
    }
  });

  it("keeps every assistant module free of a writer, executor, or provider import", () => {
    for (const path of assistantModules()) {
      const code = readFileSync(path, "utf8").replaceAll(
        /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        "",
      );
      for (const forbidden of [
        "action-gate",
        "external-execution/orchestrator",
        "gmail",
        "rentvine/write-client",
        "runTransaction",
        "process-definitions",
      ]) {
        expect(code, `${path}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

function assistantModules(): string[] {
  const out: string[] = [
    join(process.cwd(), "app", "api", "assistant", "query", "route.ts"),
  ];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts")) out.push(full);
    }
  };
  walk(join(process.cwd(), "lib", "assistant"));
  expect(out.length).toBeGreaterThan(2);
  return out;
}

describe("S110 the desk and the assistant share one orchestration (ARCH-S110-2)", () => {
  it("routes both surfaces through loadRenewalAssistantSource", () => {
    const desk = readFileSync("app/lease-renewal/live/desk/page.tsx", "utf8");
    const route = readFileSync("app/api/assistant/query/route.ts", "utf8");
    for (const [label, code] of [
      ["desk page", desk],
      ["assistant route", route],
    ] as const) {
      expect(code, label).toContain("loadRenewalAssistantSource");
    }
    // The desk must not keep a second orchestration; that is exactly how the two would drift.
    expect(desk).not.toContain("loadLiveRenewalDesk(");
    expect(desk).not.toContain("getLiveLeaseSnapshot(");
  });

  it("keeps the extracted orchestration a read, with Gmail used only to list links", () => {
    // This carries forward the property the live-read-only sentinel used to assert on the desk page
    // itself, before S110 moved the orchestration into a shared module the sentinel does not scan.
    const code = readFileSync("lib/lease-renewal/assistant-source.ts", "utf8").replaceAll(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      "",
    );
    const gmailCalls = [...code.matchAll(/createGmailHubService\([^)]*\)\.(\w+)/g)].map(
      (match) => match[1],
    );
    expect(gmailCalls).toEqual(["listCommunications"]);
    for (const forbidden of [
      "action-gate",
      "runTransaction",
      "write-client",
      ".send(",
      "draft",
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it("projects the same ids, labels, and blockers the desk table renders", () => {
    const rows = [
      row({ id: "lease-a", endDateIso: "2026-10-05" }),
      row({
        id: "lease-b",
        endDateIso: "2026-10-20",
        guidance: {
          ...row().guidance,
          isBlocked: true,
          blockers: [{ label: "Owner has not responded" }],
        },
      }),
    ];
    const items = projectRenewalItems(rows);
    expect(items.map((item) => item.id)).toEqual(rows.map((entry) => entry.id));
    expect(items.map((item) => item.title)).toEqual(
      rows.map((entry) => entry.addressLabel),
    );
    expect(items.map((item) => item.blockers)).toEqual([[], ["Owner has not responded"]]);
    for (const item of items) {
      expect(item.detail).toContain(
        rows.find((entry) => entry.id === item.id)!.reasonLabel,
      );
      expect(item.href).toContain(item.id);
    }
  });
});
