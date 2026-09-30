import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ASSISTANT_CONVERSATION_VERSION,
  conversationActorKey,
  runAssistantConversation,
  type ConversationAnswer,
} from "@/lib/assistant/conversation";
import { projectRenewalItems } from "@/lib/assistant/renewal-adapter";
import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
import { buildRenewalDeskWindow } from "@/lib/lease-renewal/desk-query";
import {
  projectRenewalRead,
  projectWorkRead,
  type RenewalSourceSnapshot,
} from "@/lib/operational-context/projections";
import { notAuthorizedRead } from "@/lib/operational-context/types";
import type { WorkTaskRecord } from "@/lib/work-accountability/types";
import { fakeOperationalContext } from "@/tests/helpers/operational-context-fake";

// S110 preservation under S138. The three original read-only questions still answer from the same
// owning records and desk predicates, now through the S138 conversation over the S137 context. The
// client still supplies no actor, role, Space or intent, and no path writes, starts a run, drafts,
// or reaches a provider effect. S138 deliberately widened what can be asked and replaced the
// bounded "three questions" note and the uncovered-month clarification with a partial answer that
// names its missing coverage.

const NOW = "2026-09-04T12:00:00.000Z";
const COVERAGE = buildRenewalDeskWindow("2026-09-04", 120);

function task(overrides: Partial<WorkTaskRecord> = {}): WorkTaskRecord {
  return {
    id: "task-1",
    space_id: "renewals",
    source: { type: "manual", status: "current" } as unknown as WorkTaskRecord["source"],
    task_type: "renewal_followup",
    title: "Call the owner at 4821 Maple Ct",
    assignee_uid: "uid-1",
    creator_uid: "uid-1",
    state: "Not started",
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
    queryKeys: {
      normalizedOwners: [],
      normalizedTenants: [],
      // The desk's month filter reads the lease END month; the fixture derives it as the loader does.
      endMonth:
        typeof overrides.endDateIso === "string"
          ? overrides.endDateIso.slice(0, 7)
          : overrides.endDateIso === null
            ? null
            : "2026-10",
    },
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

interface Sources {
  readonly tasks?: readonly WorkTaskRecord[];
  readonly renewal?: Omit<Partial<RenewalSourceSnapshot>, "coverage"> & {
    coverage?: RenewalSourceSnapshot["coverage"] | null;
  };
  readonly hasRenewalsAccess?: boolean;
  readonly workThrows?: boolean;
  readonly renewalsThrow?: boolean;
}

async function ask(
  question: string,
  sources: Sources = {},
): Promise<{ answer: ConversationAnswer; calls: string[] }> {
  const renewal = sources.renewal ?? {};
  const ctx = fakeOperationalContext({
    actorUid: "uid-1",
    nowIso: NOW,
    reads: {
      work: sources.workThrows
        ? new Error("firestore unavailable")
        : projectWorkRead({
            tasks: [...(sources.tasks ?? [task()])],
            server_now: NOW,
            may_be_truncated: false,
          }),
      renewals:
        sources.hasRenewalsAccess === false
          ? notAuthorizedRead(
              "renewals",
              "Renewal records need access to the Renewals Space.",
            )
          : sources.renewalsThrow
            ? new Error("rentvine unavailable")
            : projectRenewalRead({
                status: renewal.status ?? "ok",
                rows: renewal.rows ?? [row()],
                ...(renewal.coverage === null
                  ? {}
                  : { coverage: renewal.coverage ?? COVERAGE }),
                degraded: renewal.degraded ?? [],
              }),
    },
  });
  const answer = await runAssistantConversation(
    { question },
    {
      nowIso: NOW,
      actorKey: conversationActorKey("uid-1"),
      context: ctx,
      interpret: null,
    },
  );
  return { answer, calls: ctx.calls };
}

function ids(answer: ConversationAnswer): string[] {
  return answer.groups.flatMap((group) => group.items.map((item) => item.ref.id));
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("S110 questions still answer through the S138 conversation (ARCH-S110-1)", () => {
  it("answers the three original questions from their owning sources", async () => {
    expect(ASSISTANT_CONVERSATION_VERSION).toBe("assistant-conversation/v1");
    const work = await ask("What work is assigned to me today?");
    expect(work.answer.groups.map((group) => group.source)).toEqual(["work"]);
    const blocked = await ask("What renewal blockers do I currently have?");
    expect(blocked.answer.groups.map((group) => group.source)).toEqual(["renewals"]);
    const month = await ask("Which renewals come up next month?");
    expect(month.answer.groups[0].link?.href).toBe(
      "/lease-renewal/live/desk?v=2&month=2026-10",
    );
  });

  it("maps representative phrasings to the same records (BEH-S110-3)", async () => {
    const tasks = [
      task({ id: "due-today" }),
      task({ id: "later", due_at: "2026-09-30T00:00:00.000Z" }),
    ];
    for (const question of [
      "What work is assigned to me today?",
      "what is assigned to me today",
      "show my work for today",
      "what do I have on today",
    ]) {
      expect(ids((await ask(question, { tasks })).answer), question).toEqual([
        "due-today",
      ]);
    }
    const rows = [
      row(),
      row({
        id: "lease-blocked",
        guidance: { ...row().guidance, isBlocked: true, blockers: [{ label: "x" }] },
      }),
    ];
    for (const question of [
      "What renewal blockers do I currently have?",
      "which renewals are blocked",
      "show blocked renewals",
    ]) {
      expect(ids((await ask(question, { renewal: { rows } })).answer), question).toEqual([
        "lease-blocked",
      ]);
    }
  });

  it("parses the supported renewal periods in the Kansas City calendar", async () => {
    const rows = [
      row({ id: "sep", endDateIso: "2026-09-20" }),
      row({ id: "oct", endDateIso: "2026-10-15" }),
      row({ id: "dec", endDateIso: "2026-12-10" }),
    ];
    expect(
      ids(
        (await ask("Which renewals come up next month?", { renewal: { rows } })).answer,
      ),
    ).toEqual(["oct"]);
    expect(
      ids((await ask("what renewals are due this month", { renewal: { rows } })).answer),
    ).toEqual(["sep"]);
    expect(
      ids((await ask("renewals for 2026-12", { renewal: { rows } })).answer),
    ).toEqual(["dec"]);
  });

  it("asks exactly one clarification for an ambiguous period", async () => {
    const { answer, calls } = await ask("which renewals are coming up soon");
    expect(answer.kind).toBe("clarification");
    expect(answer.clarification?.match(/\?/g)).toHaveLength(1);
    expect(calls).toEqual([]);
  });

  it("sends a policy question to the knowledge answer instead of refusing it", async () => {
    const { answer, calls } = await ask("what is our pet policy");
    expect(answer.kind).toBe("knowledge");
    expect(answer.knowledgeQuestion).toBe("what is our pet policy");
    expect(calls).toEqual([]);
  });
});

describe("S110 answers return the owning records with links (BEH-S110-1 / BEH-S110-2)", () => {
  it("returns the actor's open work due today or overdue, or blocked", async () => {
    const { answer } = await ask("What work is assigned to me today?", {
      tasks: [
        task({ id: "due-today" }),
        task({ id: "overdue", due_at: "2026-09-01T00:00:00.000Z" }),
        task({ id: "blocked", state: "Blocked", blocker_reason: "Waiting on owner" }),
        task({ id: "later", due_at: "2026-09-30T00:00:00.000Z" }),
        task({ id: "done", state: "Completed" }),
        task({ id: "someone-else", assignee_uid: "uid-2" }),
      ],
    });
    expect(ids(answer)).toEqual(["due-today", "overdue", "blocked"]);
    expect(answer.groups[0].items[2].blockers).toEqual(["Waiting on owner"]);
    for (const item of answer.groups[0].items) expect(item.href).toMatch(/^\/work/);
    expect(answer.groups[0].status).toBe("ok");
  });

  it("returns the desk's blocked rows with the same blocker labels", async () => {
    const blockedGuidance = {
      ...row().guidance,
      isBlocked: true,
      blockers: [{ label: "Owner has not responded" }],
      overallStatus: "blocked",
    };
    const { answer } = await ask("What renewal blockers do I currently have?", {
      renewal: {
        rows: [
          row(),
          row({ id: "lease-blocked", guidance: blockedGuidance }),
          // Blocked but outside the active window: the desk's default worklist hides it, so the
          // assistant does too (parity, not a wider answer).
          row({
            id: "outside-blocked",
            retention: { state: "outside" },
            guidance: blockedGuidance,
          }),
        ],
      },
    });
    expect(ids(answer)).toEqual(["lease-blocked"]);
    expect(answer.groups[0].items[0].blockers).toEqual(["Owner has not responded"]);
    expect(answer.groups[0].items[0].href).toContain("/lease-renewal/live/desk");
  });

  it("returns exactly the rows the desk's Renewal-month filter lists for the requested month", async () => {
    const { answer } = await ask("Which renewals come up next month?", {
      renewal: {
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
      },
    });
    // The desk's month filter is the lease END month; a month-to-month lease's periodic review is
    // not a renewal and never appears under `?month=`, so the assistant does not list it either.
    expect(ids(answer)).toEqual(["in-window"]);
    expect(answer.interpretation.join(" ")).toContain("October 2026");
  });

  it("routes a renewal-flavoured today question to My Work, never to a clarification", async () => {
    const tasks = [task({ id: "due-today" })];
    const today = await ask("what renewal tasks are due today", { tasks });
    expect(today.answer.groups.map((group) => group.source)).toEqual(["work"]);
    expect(ids(today.answer)).toEqual(["due-today"]);
    const month = await ask("which renewals are due this month", {
      renewal: { rows: [row({ id: "sep", endDateIso: "2026-09-20" })] },
    });
    expect(ids(month.answer)).toEqual(["sep"]);
    expect((await ask("which renewals are coming up")).answer.kind).toBe("clarification");
  });
});

describe("S110 a source that throws reports itself unavailable", () => {
  it("reports the work list unavailable instead of failing the request", async () => {
    const { answer } = await ask("What work is assigned to me today?", {
      workThrows: true,
    });
    expect(answer.groups[0].status).toBe("unavailable");
    expect(answer.groups[0].items).toEqual([]);
    expect(answer.groups[0].summary).toMatch(/could not be read/);
  });

  it("reports the renewal source unavailable when the loader throws", async () => {
    const { answer } = await ask("What renewal blockers do I currently have?", {
      renewalsThrow: true,
    });
    expect(answer.groups[0].status).toBe("unavailable");
    expect(answer.groups[0].items).toEqual([]);
  });
});

describe("S110 honesty and access (AC-S110-3 / AC-S110-4 / BEH-S110-3)", () => {
  it("reports a failed renewal read as unavailable, never as no renewals", async () => {
    const { answer } = await ask("What renewal blockers do I currently have?", {
      renewal: { status: "read_error", rows: [] },
    });
    expect(answer.groups[0].status).toBe("unavailable");
    expect(answer.groups[0].items).toEqual([]);
    expect(answer.summary).toMatch(/could not/i);
    expect(answer.summary).not.toMatch(/no (leases|renewals)/i);
  });

  it("reports a partial renewal read as partial", async () => {
    const { answer } = await ask("What renewal blockers do I currently have?", {
      renewal: { rows: [], degraded: ["progress"] },
    });
    expect(answer.groups[0].status).toBe("partial");
  });

  it("gives an actor without Renewals access no lease count or label", async () => {
    const { answer } = await ask("What renewal blockers do I currently have?", {
      hasRenewalsAccess: false,
    });
    expect(answer.groups[0].status).toBe("not_authorized");
    expect(answer.groups[0].items).toEqual([]);
    expect(answer.groups[0].link).toBeNull();
    expect(JSON.stringify(answer)).not.toMatch(/lease-1|4821|Maple/);
    expect(answer.summary).toMatch(/Renewals/i);
  });

  it("never lets a caller supply the actor, intent, Space, or filters (AC-S110-1)", () => {
    const code = readFileSync("app/api/assistant/query/route.ts", "utf8").replaceAll(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      "",
    );
    // The request body is the question plus the page session's own conversation context.
    const schema = /RequestSchema[\s\S]*?\}\)/.exec(code)?.[0] ?? "";
    expect(schema).toContain("question");
    expect(schema).toContain("conversation: ConversationContextSchema");
    for (const forbidden of ["intent", "actor", "uid", "role", "space", "filters"]) {
      expect(schema, forbidden).not.toContain(forbidden);
    }
    // The actor comes from the session; the context key is derived from it, never read from the body.
    expect(code).toContain('requireCapability("read")');
    expect(code).toContain("conversationActorKey(user.uid)");
    expect(code).toContain("createServerOperationalContext(user, now)");
  });
});

describe("S110 zero write across every path (AC-S110-2)", () => {
  it("never invokes a write, run start, draft, or provider effect", async () => {
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
        await ask(question);
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

describe("S110 bounded source coverage", () => {
  it.each(["2026-08", "2027-01", "2027-02"])(
    "names the uncovered part of month %s instead of implying there are no leases",
    async (month) => {
      const { answer } = await ask(`renewals for ${month}`);
      expect(answer.groups[0].status).toBe("partial");
      const notes = answer.groups[0].notes.join(" ");
      expect(notes).toContain("09/01/2026");
      expect(notes).toContain("01/02/2027");
      expect(answer.summary).toMatch(/^No leases|^\d+ lease/);
    },
  );

  it("never infers complete coverage from rows or an absent bound", async () => {
    const { answer } = await ask("renewals for 2026-10", { renewal: { coverage: null } });
    expect(answer.groups[0].status).toBe("partial");
    expect(answer.groups[0].notes.join(" ")).toMatch(
      /did not report which lease end dates it covers/,
    );
  });

  it("keeps the owning calendar and predicates for a fully covered month", async () => {
    const { answer } = await ask("renewals for 2026-10");
    expect(answer.groups[0].status).toBe("ok");
    expect(ids(answer)).toEqual(["lease-1"]);
    expect(answer.clarification).toBeNull();
  });
});

describe("S110 the desk and the assistant share one orchestration (ARCH-S110-2)", () => {
  it("routes both surfaces through loadRenewalAssistantSource", () => {
    const desk = readFileSync("app/lease-renewal/live/desk/page.tsx", "utf8");
    // S137 moved the assistant's reads into the shared operational context the route uses.
    const context = readFileSync("lib/operational-context/server-context.ts", "utf8");
    const route = readFileSync("app/api/assistant/query/route.ts", "utf8");
    expect(desk).toContain("loadRenewalAssistantSource");
    expect(context).toContain("loadRenewalAssistantSource(user, now)");
    expect(route).toContain("createServerOperationalContext");
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
