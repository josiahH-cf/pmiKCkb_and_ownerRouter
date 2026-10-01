import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

import {
  LIVE_CHECK_WRITES,
  LIVE_QUESTIONS,
  MAX_LIVE_QUESTIONS,
  answerShape,
  countLogLines,
  decideLiveCheckRequest,
  hashedId,
  maskedRequest,
  parseAiHistoryCheckArgs,
} from "@/scripts/check-production-ai-history";

// S151: the owner's bounded live check has its own narrow request guard (it changes neither the
// release assurance guard nor READ_POSTS), a hard five-question counter, and prints structure only.

const ORIGIN = "https://pmi-kc-app-kq6wuvpiva-uc.a.run.app";
const SAVED = "d".repeat(32);
const OP = "00000000-0000-4000-8000-000000000001";
const profile = mkdtempSync(join(tmpdir(), "s151-profile-"));

afterAll(() => rmSync(profile, { recursive: true, force: true }));

const target = [
  "--live",
  `--base-url=${ORIGIN}/`,
  `--expected-commit=${"a".repeat(40)}`,
  "--expected-revision=pmi-kc-app-rmabc-123",
  "--service=pmi-kc-app",
  `--profile=${profile}`,
  "--project=pmi-kc-kb-prod",
];

describe("S151 live-check arguments", () => {
  it("requires an explicit live run against the exact serving target and project", () => {
    expect(parseAiHistoryCheckArgs(target)).toMatchObject({
      origin: ORIGIN,
      project: "pmi-kc-kb-prod",
      skipLogs: false,
    });
    expect(() =>
      parseAiHistoryCheckArgs(target.filter((arg) => arg !== "--live")),
    ).toThrow("explicit_live_required");
    expect(() =>
      parseAiHistoryCheckArgs(
        target.map((arg) => (arg.startsWith("--project") ? "--project=x" : arg)),
      ),
    ).toThrow("project_invalid");
    expect(() =>
      parseAiHistoryCheckArgs(
        target.map((arg) =>
          arg.startsWith("--base-url") ? "--base-url=http://localhost:3000/" : arg,
        ),
      ),
    ).toThrow("production_origin_invalid");
  });

  it("asks at most five questions, all read-only operational questions", () => {
    expect(LIVE_QUESTIONS.length).toBeLessThanOrEqual(MAX_LIVE_QUESTIONS);
    expect(MAX_LIVE_QUESTIONS).toBe(5);
    expect(LIVE_QUESTIONS.filter((question) => question.followUp)).toHaveLength(1);
  });
});

describe("S151 live-check request guard", () => {
  const decide = (method: string, path: string, sent = 0, origin = ORIGIN) =>
    decideLiveCheckRequest(method, `${origin}${path}`, ORIGIN, sent);

  it("allows reads except the known state-changing GETs", () => {
    expect(decide("GET", "/")).toEqual({ allowed: true, kind: "read" });
    expect(decide("GET", "/api/assistant/history")).toEqual({
      allowed: true,
      kind: "read",
    });
    expect(decide("GET", "/fonts/x.woff2", 0, "https://fonts.gstatic.com")).toEqual({
      allowed: true,
      kind: "read",
    });
    expect(decide("GET", "/api/connections/dotloop/callback")).toEqual({
      allowed: false,
      reason: "not_allowlisted",
    });
  });

  it("allows exactly the Dashboard question, history, saved and run writes", () => {
    expect(decide("POST", "/api/assistant/query")).toEqual({
      allowed: true,
      kind: "question",
    });
    expect(decide("POST", "/api/assistant/history/turns")).toEqual({
      allowed: true,
      kind: "history",
    });
    expect(decide("PUT", `/api/assistant/history/turns/${OP}`)).toEqual({
      allowed: true,
      kind: "history",
    });
    expect(decide("POST", "/api/assistant/saved")).toEqual({
      allowed: true,
      kind: "saved",
    });
    expect(decide("PATCH", `/api/assistant/saved/${SAVED}`)).toEqual({
      allowed: true,
      kind: "saved",
    });
    expect(decide("POST", `/api/assistant/saved/${SAVED}/run`)).toEqual({
      allowed: true,
      kind: "run",
    });
    expect(LIVE_CHECK_WRITES).toHaveLength(6);
  });

  it("refuses every other write before dispatch, including the knowledge answer and session calls", () => {
    for (const [method, path] of [
      ["POST", "/api/ask"],
      ["POST", "/api/auth/session"],
      ["DELETE", `/api/assistant/saved/${SAVED}`],
      ["POST", `/api/assistant/saved/${SAVED}`],
      ["PUT", "/api/assistant/history/turns/short"],
      ["POST", "/api/lease-renewal/writeback"],
      ["POST", "/api/approval-queue"],
      ["POST", "/api/assistant/query?x=1"],
    ] as const) {
      expect(decide(method, path)).toEqual({ allowed: false, reason: "not_allowlisted" });
    }
    expect(decide("POST", "/api/assistant/query", 0, "https://evil.example")).toEqual({
      allowed: false,
      reason: "not_allowlisted",
    });
  });

  it("refuses a sixth question", () => {
    expect(decide("POST", "/api/assistant/query", 4)).toEqual({
      allowed: true,
      kind: "question",
    });
    expect(decide("POST", "/api/assistant/query", 5)).toEqual({
      allowed: false,
      reason: "question_limit",
    });
  });

  it("records refusals without ids, digits or query strings", () => {
    expect(maskedRequest("post", `${ORIGIN}/api/assistant/saved/${SAVED}/run?a=1`)).toBe(
      "POST /api/assistant/saved/:id/run",
    );
    expect(maskedRequest("PUT", `${ORIGIN}/api/assistant/history/turns/${OP}`)).toBe(
      "PUT /api/assistant/history/turns/:id",
    );
    expect(hashedId(SAVED)).toMatch(/^[a-f0-9]{12}$/);
  });
});

describe("S151 live-check log counting and output", () => {
  const windows = [
    {
      phase: "questions" as const,
      startIso: "2026-10-02T15:00:00.000Z",
      endIso: "2026-10-02T15:02:00.000Z",
    },
    {
      phase: "reopen" as const,
      startIso: "2026-10-02T15:02:00.001Z",
      endIso: "2026-10-02T15:03:00.000Z",
    },
    {
      phase: "save_pin" as const,
      startIso: "2026-10-02T15:03:00.001Z",
      endIso: "2026-10-02T15:04:00.000Z",
    },
    {
      phase: "rerun" as const,
      startIso: "2026-10-02T15:04:00.001Z",
      endIso: "2026-10-02T15:05:00.000Z",
    },
  ];

  it("attributes bodyless lines to their phase by time and counts only names and outcomes", () => {
    const counts = countLogLines(
      [
        {
          timestamp: "2026-10-02T15:00:10.000Z",
          payload: { event: "model_call", purpose: "assistant.interpret" },
        },
        {
          timestamp: "2026-10-02T15:00:11.000Z",
          payload: { event: "assistant_conversation", interpretedBy: "model" },
        },
        {
          timestamp: "2026-10-02T15:00:12.000Z",
          payload: { event: "assistant_history", operation: "finalize", outcome: "ok" },
        },
        {
          timestamp: "2026-10-02T15:02:30.000Z",
          payload: { event: "assistant_history", operation: "open", outcome: "ok" },
        },
        {
          timestamp: "2026-10-02T15:03:30.000Z",
          payload: { event: "assistant_history", operation: "pin", outcome: "ok" },
        },
        {
          timestamp: "2026-10-02T15:04:30.000Z",
          payload: { event: "assistant_conversation", interpretedBy: "stored_plan" },
        },
        {
          timestamp: "2026-10-02T15:04:31.000Z",
          payload: { event: "assistant_history", operation: "run", outcome: "ok" },
        },
        {
          timestamp: "2026-10-02T16:00:00.000Z",
          payload: { event: "model_call", purpose: "assistant.interpret" },
        },
      ],
      windows,
    );
    expect(counts.questions).toMatchObject({
      modelCalls: 1,
      modelCallsByPurpose: { "assistant.interpret": 1 },
      conversations: { model: 1 },
      historyOperations: { "finalize:ok": 1 },
    });
    expect(counts.reopen).toMatchObject({
      modelCalls: 0,
      historyOperations: { "open:ok": 1 },
    });
    expect(counts.save_pin).toMatchObject({
      modelCalls: 0,
      historyOperations: { "pin:ok": 1 },
    });
    expect(counts.rerun).toMatchObject({
      modelCalls: 0,
      conversations: { stored_plan: 1 },
      historyOperations: { "run:ok": 1 },
    });
  });

  it("describes an answer by counts and statuses only", () => {
    const shape = answerShape({
      interpretedBy: "model",
      summary: "private",
      groups: [
        { status: "ok", items: [{ title: "private" }, { title: "private" }] },
        { status: "partial", items: [] },
      ],
    });
    expect(shape).toEqual({
      interpretedBy: "model",
      groups: 2,
      items: 2,
      groupStatuses: ["ok", "partial"],
    });
    expect(JSON.stringify(shape)).not.toContain("private");
    expect(
      answerShape({ turn: { assistant: { interpretedBy: "stored_plan", groups: [] } } }),
    ).toEqual({
      interpretedBy: "stored_plan",
      groups: 0,
      items: 0,
      groupStatuses: [],
    });
  });

  it("reopens history in a fresh browser context, not another page of the first one", () => {
    const source = readFileSync("scripts/check-production-ai-history.ts", "utf8");
    const questions = source.indexOf('phase("questions"');
    const reopen = source.indexOf('phase("reopen"');
    const between = source.slice(questions, reopen);
    expect(questions).toBeGreaterThan(0);
    expect(reopen).toBeGreaterThan(questions);
    expect(between).toMatch(/await context\.close\(\);/);
    expect(between).toMatch(
      /context = await launchGuardedOwnerBrowser\(options, tracker\);\s+const fresh = await context\.newPage\(\);/,
    );
  });

  it("leaves the release assurance guard and READ_POSTS untouched", () => {
    const source = readFileSync("scripts/check-production-ai-history.ts", "utf8");
    expect(source).not.toMatch(/launchGuardedManagedBrowser|READ_POSTS/);
    expect(source).toContain('serviceWorkers: "block"');
    expect(source).toContain("offline: true");
  });
});
