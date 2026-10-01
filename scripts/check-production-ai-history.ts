// S151 owner's bounded production live check for the AI-first Dashboard (S148-S150). On the exact
// serving revision, in the managed owner-admin browser profile, it asks at most five read-only
// questions through the real Dashboard (a recurring lease-date question, a context-dependent
// follow-up, the owner's own work and approvals), then in a fresh page reopens the history, saves a
// question, pins and unpins it, and runs it once for current results. Its own request guard admits
// every same-origin and third-party read except the known stateful GETs, and only these writes:
// the Dashboard question, the owner's own history turns, and the owner's own saved-question save,
// pin and run. Everything else is refused before dispatch and recorded. A hard counter refuses a
// sixth question. Afterwards a read-only Cloud Logging query counts the bodyless model_call,
// assistant_conversation and assistant_history lines in each phase's window. It prints structure
// only: counts, booleans, durations and hashed ids; never a question, an answer, a record, a name
// or an amount. The conversations it creates stay in the owner's own history.
//
//   npx tsx scripts/check-production-ai-history.ts --live --base-url=https://<service-host> \
//     --expected-commit=<40-hex> --expected-revision=<revision> --service=pmi-kc-app \
//     --profile=<absolute managed owner-admin profile outside the repository> \
//     --project=pmi-kc-kb-prod [--report=<new file>] [--skip-logs]

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium, type BrowserContext, type Locator, type Page } from "playwright-core";

import { allowsVerificationRequest } from "../lib/auth/canary-policy";
import { GUARDED_BROWSER_BACKGROUND_ARGS } from "../lib/production-assurance/guarded-browser";
import {
  findBrowserExecutable,
  hasArg,
  readArg,
  requireExplicitLive,
  resolveManagedProfile,
  resolveProductionTarget,
  safeCliFailure,
  safeSameOrigin,
  verifyExactVersion,
  type ProductionTarget,
} from "./production-assurance-runtime";

export const AI_HISTORY_CHECK_SCHEMA_VERSION = "pmi-kc-ai-history-check.v1";
export const MAX_LIVE_QUESTIONS = 5;
const ROUTE_BUDGET_MS = 120_000;
const ANSWER_BUDGET_MS = 120_000;
const DESKTOP = { width: 1440, height: 1000 } as const;
const LOG_SETTLE_MS = 75_000;

/** The questions asked, in order. `followUp` continues the previous question's conversation. */
export const LIVE_QUESTIONS = [
  { id: "lease_dates", text: "What leases are due this month?", followUp: false },
  { id: "lease_follow_up", text: "Which of those are blocked?", followUp: true },
  { id: "my_work", text: "What work is assigned to me today?", followUp: false },
  { id: "my_approvals", text: "What approvals are waiting on me?", followUp: false },
] as const;

/** The only writes this check may send. Every other non-read is refused before dispatch. */
export const LIVE_CHECK_WRITES = [
  { kind: "question", method: "POST", pattern: /^\/api\/assistant\/query$/ },
  { kind: "history", method: "POST", pattern: /^\/api\/assistant\/history\/turns$/ },
  {
    kind: "history",
    method: "PUT",
    pattern: /^\/api\/assistant\/history\/turns\/[A-Za-z0-9-]{8,64}$/,
  },
  { kind: "saved", method: "POST", pattern: /^\/api\/assistant\/saved$/ },
  { kind: "saved", method: "PATCH", pattern: /^\/api\/assistant\/saved\/[a-f0-9]{32}$/ },
  {
    kind: "run",
    method: "POST",
    pattern: /^\/api\/assistant\/saved\/[a-f0-9]{32}\/run$/,
  },
] as const;

export type LiveRequestKind = "read" | "question" | "history" | "saved" | "run";

export type LiveRequestDecision =
  | { readonly allowed: true; readonly kind: LiveRequestKind }
  | { readonly allowed: false; readonly reason: "not_allowlisted" | "question_limit" };

export interface AiHistoryCheckOptions extends ProductionTarget {
  readonly profile: string;
  readonly project: string;
  readonly report: string | null;
  readonly skipLogs: boolean;
}

export type Phase = "questions" | "reopen" | "save_pin" | "rerun";

export interface PhaseWindow {
  readonly phase: Phase;
  readonly startIso: string;
  readonly endIso: string;
}

export interface QuestionResult {
  readonly id: string;
  readonly answered: boolean;
  readonly savedToHistory: boolean;
  readonly durationMs: number;
  readonly interpretedBy: string | null;
  readonly groups: number;
  readonly items: number;
  readonly groupStatuses: readonly string[];
}

export interface LogCounts {
  readonly modelCalls: number;
  readonly modelCallsByPurpose: Readonly<Record<string, number>>;
  readonly conversations: Readonly<Record<string, number>>;
  readonly replays: number;
  readonly historyOperations: Readonly<Record<string, number>>;
}

export interface AiHistoryCheckReport {
  readonly schemaVersion: typeof AI_HISTORY_CHECK_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly expectedCommit: string;
  readonly expectedRevision: string;
  readonly versionVerified: { readonly before: boolean; readonly after: boolean };
  readonly questionsAsked: number;
  readonly questions: readonly QuestionResult[];
  readonly reopen: {
    readonly conversationsListed: number;
    readonly restoredTurns: number;
    readonly historicalLabels: number;
  } | null;
  readonly saved: {
    readonly saved: boolean;
    readonly structured: boolean;
    readonly pinned: boolean;
    readonly unpinned: boolean;
    readonly stillListedAfterUnpin: boolean;
    readonly savedIdHash: string | null;
  } | null;
  readonly rerun: {
    readonly answered: boolean;
    readonly interpretedBy: string | null;
    readonly groups: number;
    readonly items: number;
    readonly groupStatuses: readonly string[];
    readonly earlierAnswerKept: boolean;
  } | null;
  readonly requests: {
    readonly reads: number;
    readonly questions: number;
    readonly historyWrites: number;
    readonly savedWrites: number;
    readonly runs: number;
    readonly refused: number;
    readonly refusedRequests: readonly string[];
  };
  readonly windows: readonly PhaseWindow[];
  readonly logs: Readonly<Record<Phase, LogCounts>> | null;
  readonly verdict: "passed" | "failed";
  readonly failures: readonly string[];
}

export function parseAiHistoryCheckArgs(
  argv: readonly string[],
  repositoryRoot = process.cwd(),
): AiHistoryCheckOptions {
  requireExplicitLive(argv);
  const target = resolveProductionTarget(argv);
  const profile = resolveManagedProfile(argv, repositoryRoot);
  const project = readArg(argv, "--project");
  if (!project || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project))
    throw new Error("project_invalid");
  const report = readArg(argv, "--report");
  return {
    ...target,
    profile,
    project,
    report: report ? resolve(report) : null,
    skipLogs: hasArg(argv, "--skip-logs"),
  };
}

/**
 * The live check's own request guard. Reads pass unless they are one of the known state-changing
 * GETs; a write passes only when it is one of the listed Dashboard calls to the serving origin; and
 * a question passes only while fewer than the limit have been sent.
 */
export function decideLiveCheckRequest(
  method: string,
  url: string,
  origin: string,
  questionsSent: number,
): LiveRequestDecision {
  const verb = method.trim().toUpperCase();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: "not_allowlisted" };
  }
  if (verb === "GET" || verb === "HEAD") {
    return allowsVerificationRequest({
      method: verb,
      pathname: parsed.pathname,
      searchParams: parsed.searchParams,
    })
      ? { allowed: true, kind: "read" }
      : { allowed: false, reason: "not_allowlisted" };
  }
  if (parsed.origin !== origin || parsed.search) {
    return { allowed: false, reason: "not_allowlisted" };
  }
  const write = LIVE_CHECK_WRITES.find(
    (entry) => entry.method === verb && entry.pattern.test(parsed.pathname),
  );
  if (!write) return { allowed: false, reason: "not_allowlisted" };
  if (write.kind === "question" && questionsSent >= MAX_LIVE_QUESTIONS) {
    return { allowed: false, reason: "question_limit" };
  }
  return { allowed: true, kind: write.kind };
}

/** A refused request for the report: method and path with digits and long ids masked. */
export function maskedRequest(method: string, url: string): string {
  let path = "unparseable";
  try {
    path = new URL(url).pathname
      .replace(/[A-Za-z0-9-]{16,}/g, ":id")
      .replace(/\d+/g, "#");
  } catch {
    // Keep the placeholder.
  }
  return `${method.toUpperCase()} ${path}`;
}

export function hashedId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

interface LogLine {
  readonly timestamp: string;
  readonly payload: Record<string, unknown>;
}

const emptyCounts = (): LogCounts => ({
  modelCalls: 0,
  modelCallsByPurpose: {},
  conversations: {},
  replays: 0,
  historyOperations: {},
});

/** Count bodyless lines per phase window. Only event names, purposes and outcomes are read. */
export function countLogLines(
  lines: readonly LogLine[],
  windows: readonly PhaseWindow[],
): Record<Phase, LogCounts> {
  const result = Object.fromEntries(
    windows.map((window) => [window.phase, emptyCounts()]),
  ) as Record<Phase, LogCounts>;
  const bump = (record: Readonly<Record<string, number>>, key: string) =>
    ({ ...record, [key]: (record[key] ?? 0) + 1 }) as Readonly<Record<string, number>>;
  for (const line of lines) {
    const at = Date.parse(line.timestamp);
    const window = windows.find(
      (entry) => at >= Date.parse(entry.startIso) && at <= Date.parse(entry.endIso),
    );
    if (!window) continue;
    const counts = result[window.phase];
    const event = line.payload.event;
    if (event === "model_call") {
      const purpose =
        typeof line.payload.purpose === "string" ? line.payload.purpose : "unknown";
      result[window.phase] = {
        ...counts,
        modelCalls: counts.modelCalls + 1,
        modelCallsByPurpose: bump(counts.modelCallsByPurpose, purpose),
      };
    } else if (event === "assistant_conversation") {
      const by =
        typeof line.payload.interpretedBy === "string"
          ? line.payload.interpretedBy
          : "unknown";
      result[window.phase] = { ...counts, conversations: bump(counts.conversations, by) };
    } else if (event === "assistant_conversation_replay") {
      result[window.phase] = { ...counts, replays: counts.replays + 1 };
    } else if (event === "assistant_history") {
      const operation =
        typeof line.payload.operation === "string" ? line.payload.operation : "unknown";
      const outcome =
        typeof line.payload.outcome === "string" ? line.payload.outcome : "unknown";
      result[window.phase] = {
        ...counts,
        historyOperations: bump(counts.historyOperations, `${operation}:${outcome}`),
      };
    }
  }
  return result;
}

/** Read-only Cloud Logging query for the bodyless lines on this revision during the check. */
function readLogLines(
  options: AiHistoryCheckOptions,
  startIso: string,
  endIso: string,
): LogLine[] {
  const filter = [
    'resource.type="cloud_run_revision"',
    `resource.labels.service_name="${options.service}"`,
    `resource.labels.revision_name="${options.expectedRevision}"`,
    `timestamp>="${startIso}"`,
    `timestamp<="${endIso}"`,
    '(jsonPayload.event="model_call" OR jsonPayload.event="assistant_conversation" OR jsonPayload.event="assistant_conversation_replay" OR jsonPayload.event="assistant_history")',
  ].join(" AND ");
  const output = execFileSync(
    "gcloud",
    [
      "logging",
      "read",
      filter,
      `--project=${options.project}`,
      "--format=json(timestamp,jsonPayload.event,jsonPayload.purpose,jsonPayload.interpretedBy,jsonPayload.operation,jsonPayload.outcome)",
      "--limit=500",
      "--order=asc",
    ],
    { encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
  );
  const parsed = JSON.parse(output || "[]") as {
    timestamp?: string;
    jsonPayload?: Record<string, unknown>;
  }[];
  return parsed
    .filter((entry) => typeof entry.timestamp === "string" && entry.jsonPayload)
    .map((entry) => ({ timestamp: entry.timestamp!, payload: entry.jsonPayload! }));
}

function fail(code: string): never {
  throw new Error(code);
}

interface Tracker {
  questionsSent: number;
  reads: number;
  historyWrites: number;
  savedWrites: number;
  runs: number;
  refused: string[];
  answers: Record<string, unknown>[];
}

/**
 * Bring the managed owner profile online only after this check's own guard is installed. The
 * launch starts offline with Service Workers blocked, closes every restored page, and refuses a
 * profile that still has a registered worker, as the release assurance does.
 */
async function launchGuardedOwnerBrowser(
  options: AiHistoryCheckOptions,
  tracker: Tracker,
): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext(options.profile, {
    executablePath: findBrowserExecutable(),
    headless: true,
    viewport: DESKTOP,
    timeout: 120_000,
    offline: true,
    serviceWorkers: "block",
    args: [...GUARDED_BROWSER_BACKGROUND_ARGS],
  });
  try {
    await context.route("**/*", async (route) => {
      const request = route.request();
      const decision = decideLiveCheckRequest(
        request.method(),
        request.url(),
        options.origin,
        tracker.questionsSent,
      );
      if (!decision.allowed) {
        tracker.refused.push(
          `${maskedRequest(request.method(), request.url())} (${decision.reason})`,
        );
        await route.abort("blockedbyclient");
        return;
      }
      if (decision.kind === "question") tracker.questionsSent += 1;
      else if (decision.kind === "history") tracker.historyWrites += 1;
      else if (decision.kind === "saved") tracker.savedWrites += 1;
      else if (decision.kind === "run") tracker.runs += 1;
      else tracker.reads += 1;
      await route.continue();
    });
    for (const page of context.pages()) await page.close();
    if (context.serviceWorkers().length !== 0)
      fail("managed_browser_service_worker_present");
    context.on("response", async (response) => {
      const url = new URL(response.url());
      if (url.origin !== options.origin) return;
      if (
        response.request().method() !== "POST" ||
        !/^\/api\/assistant\/(query|saved\/[a-f0-9]{32}\/run)$/.test(url.pathname)
      )
        return;
      try {
        tracker.answers.push((await response.json()) as Record<string, unknown>);
      } catch {
        // A failed answer is recorded by the page state instead.
      }
    });
    await context.setOffline(false);
    return context;
  } catch (error) {
    await context.close().catch(() => undefined);
    throw error;
  }
}

/** Structure of a question or run response: counts and statuses only, never content. */
export function answerShape(answer: Record<string, unknown> | undefined) {
  const run = answer?.turn as { assistant?: Record<string, unknown> } | undefined;
  const assistant = run?.assistant ?? answer;
  const shapedGroups = Array.isArray(assistant?.groups)
    ? (assistant.groups as { status?: unknown; items?: unknown }[])
    : [];
  return {
    interpretedBy:
      typeof assistant?.interpretedBy === "string" ? assistant.interpretedBy : null,
    groups: shapedGroups.length,
    items: shapedGroups.reduce(
      (total, group) => total + (Array.isArray(group.items) ? group.items.length : 0),
      0,
    ),
    groupStatuses: shapedGroups.map((group) => String(group.status ?? "unknown")),
  };
}

function turnFor(page: Page, question: string): Locator {
  return page
    .locator("article.dashboard-turn")
    .filter({ hasText: `You asked: ${question}` })
    .last();
}

async function askThroughDashboard(
  page: Page,
  question: (typeof LIVE_QUESTIONS)[number],
  tracker: Tracker,
): Promise<QuestionResult> {
  if (
    !question.followUp &&
    (await page.getByRole("button", { name: "Start a new conversation" }).count())
  )
    await page.getByRole("button", { name: "Start a new conversation" }).click();
  const answersBefore = tracker.answers.length;
  const started = Date.now();
  await page.locator("textarea#question").fill(question.text);
  await page.getByRole("button", { name: "Get answer" }).click();
  await page.waitForFunction(
    (text) =>
      [...document.querySelectorAll("article.dashboard-turn")].some(
        (article) =>
          article.textContent?.includes(`You asked: ${text}`) &&
          article.getAttribute("data-state") !== "pending",
      ),
    question.text,
    { timeout: ANSWER_BUDGET_MS },
  );
  const turn = turnFor(page, question.text);
  const answered = (await turn.getAttribute("data-state")) === "answered";
  let savedToHistory = false;
  if (answered) {
    await turn
      .locator('[data-save-state="saved"]')
      .waitFor({ timeout: 30_000 })
      .then(() => {
        savedToHistory = true;
      })
      .catch(() => undefined);
  }
  return {
    id: question.id,
    answered,
    savedToHistory,
    durationMs: Date.now() - started,
    ...answerShape(tracker.answers.slice(answersBefore).at(-1)),
  };
}

export async function runAiHistoryCheck(
  options: AiHistoryCheckOptions,
): Promise<AiHistoryCheckReport> {
  const failures: string[] = [];
  const versionVerified = { before: false, after: false };
  const tracker: Tracker = {
    questionsSent: 0,
    reads: 0,
    historyWrites: 0,
    savedWrites: 0,
    runs: 0,
    refused: [],
    answers: [],
  };
  const windows: PhaseWindow[] = [];
  const questions: QuestionResult[] = [];
  let reopen: AiHistoryCheckReport["reopen"] = null;
  let saved: AiHistoryCheckReport["saved"] = null;
  let rerun: AiHistoryCheckReport["rerun"] = null;
  let logs: AiHistoryCheckReport["logs"] = null;
  const startedIso = new Date().toISOString();

  const phase = async <T>(name: Phase, body: () => Promise<T>): Promise<T> => {
    const startIso = new Date().toISOString();
    try {
      return await body();
    } finally {
      windows.push({ phase: name, startIso, endIso: new Date().toISOString() });
    }
  };

  try {
    await verifyExactVersion(options);
    versionVerified.before = true;
    let context = await launchGuardedOwnerBrowser(options, tracker);
    try {
      // Questions, asked through the real Dashboard and saved by it as the owner's own history.
      const page = await context.newPage();
      page.setDefaultNavigationTimeout(ROUTE_BUDGET_MS);
      page.setDefaultTimeout(ROUTE_BUDGET_MS);
      await page.goto(`${options.origin}/`, { waitUntil: "domcontentloaded" });
      if (
        !safeSameOrigin(page.url(), options.origin) ||
        new URL(page.url()).pathname !== "/"
      )
        fail("owner_profile_not_signed_in");
      await page.getByRole("navigation", { name: "History" }).waitFor();
      await page.getByRole("navigation", { name: "Saved questions" }).waitFor();
      await phase("questions", async () => {
        for (const question of LIVE_QUESTIONS) {
          questions.push(await askThroughDashboard(page, question, tracker));
        }
      });
      await page.close();

      // A fresh browser context on the same signed-in profile: nothing from the first one
      // survives in memory, so reopening, listing, saving and pinning read stored data only.
      await context.close();
      context = await launchGuardedOwnerBrowser(options, tracker);
      const fresh = await context.newPage();
      fresh.setDefaultNavigationTimeout(ROUTE_BUDGET_MS);
      fresh.setDefaultTimeout(ROUTE_BUDGET_MS);
      const leaseQuestion = LIVE_QUESTIONS[0].text;
      await phase("reopen", async () => {
        await fresh.goto(`${options.origin}/`, { waitUntil: "domcontentloaded" });
        const history = fresh.getByRole("navigation", { name: "History" });
        const entry = history.getByRole("button", { name: leaseQuestion }).first();
        await entry.waitFor();
        let listed = 0;
        for (const question of LIVE_QUESTIONS.filter((entry) => !entry.followUp)) {
          if ((await history.getByRole("button", { name: question.text }).count()) > 0)
            listed += 1;
        }
        await entry.click();
        await turnFor(fresh, leaseQuestion).waitFor();
        reopen = {
          conversationsListed: listed,
          restoredTurns: await fresh
            .locator('article.dashboard-turn[data-restored="true"]')
            .count(),
          historicalLabels: await fresh.getByTestId("turn-history-label").count(),
        };
      });

      let savedOk = false;
      let structured = false;
      let pinned = false;
      let unpinned = false;
      let stillListed = false;
      let savedIdHash: string | null = null;
      const savedNav = fresh.getByRole("navigation", { name: "Saved questions" });
      await phase("save_pin", async () => {
        const turn = turnFor(fresh, leaseQuestion);
        await turn.getByRole("button", { name: "Save question" }).click();
        await turn.getByTestId("turn-question-saved").waitFor();
        savedOk = true;
        const item = savedNav
          .getByTestId("saved-item")
          .filter({ hasText: leaseQuestion })
          .first();
        await item.waitFor();
        structured =
          (await item
            .getByRole("button", { name: "Run for current results" })
            .count()) === 1;
        await item.getByRole("button", { name: "Pin" }).click();
        await savedNav
          .getByText("Pinned. It stays at the top of your saved questions.")
          .waitFor();
        pinned = (await item.getAttribute("data-pinned")) === "true";
        await item.getByRole("button", { name: "Unpin" }).click();
        await savedNav.getByText("Unpinned. It stays in your saved questions.").waitFor();
        unpinned = (await item.getAttribute("data-pinned")) !== "true";
        stillListed = (await item.count()) === 1;
      });

      await phase("rerun", async () => {
        if (!structured) return;
        const answersBefore = tracker.answers.length;
        const item = savedNav
          .getByTestId("saved-item")
          .filter({ hasText: leaseQuestion })
          .first();
        const earlier = await fresh.locator("article.dashboard-turn").count();
        await item.getByRole("button", { name: "Run for current results" }).click();
        await fresh
          .getByTestId("turn-rerun-label")
          .last()
          .waitFor({ timeout: ANSWER_BUDGET_MS });
        const runAnswer = tracker.answers.slice(answersBefore).at(-1);
        const turn = runAnswer?.turn as { rerunOf?: unknown } | undefined;
        if (typeof turn?.rerunOf === "string") savedIdHash = hashedId(turn.rerunOf);
        rerun = {
          answered: true,
          ...answerShape(runAnswer),
          earlierAnswerKept:
            (await fresh.locator("article.dashboard-turn").count()) === earlier + 1 &&
            (await fresh.getByTestId("turn-history-label").count()) >= 1,
        };
      });
      saved = {
        saved: savedOk,
        structured,
        pinned,
        unpinned,
        stillListedAfterUnpin: stillListed,
        savedIdHash,
      };
      await fresh.close();
    } finally {
      await context.close().catch(() => undefined);
    }
    await verifyExactVersion(options);
    versionVerified.after = true;
  } catch (error) {
    failures.push(safeCliFailure(error));
  }

  if (!options.skipLogs && windows.length) {
    try {
      await new Promise((resolveWait) => setTimeout(resolveWait, LOG_SETTLE_MS));
      logs = countLogLines(
        readLogLines(options, startedIso, new Date().toISOString()),
        windows,
      );
    } catch {
      failures.push("log_query_failed");
    }
  }

  // Verdict: each criterion is checked on what actually happened, never on what was attempted.
  const asked = questions.length;
  if (tracker.questionsSent > MAX_LIVE_QUESTIONS)
    failures.push("question_limit_exceeded");
  if (asked !== LIVE_QUESTIONS.length) failures.push("questions_incomplete");
  if (questions.some((question) => !question.answered))
    failures.push("question_not_answered");
  if (questions.some((question) => !question.savedToHistory))
    failures.push("history_not_saved");
  const reopenResult = reopen as AiHistoryCheckReport["reopen"];
  if (
    !reopenResult ||
    reopenResult.restoredTurns < 2 ||
    reopenResult.historicalLabels < 1
  )
    failures.push("reopen_incomplete");
  const savedResult = saved as AiHistoryCheckReport["saved"];
  if (
    !savedResult?.saved ||
    !savedResult.pinned ||
    !savedResult.unpinned ||
    !savedResult.stillListedAfterUnpin
  )
    failures.push("save_pin_incomplete");
  if (!savedResult?.structured) failures.push("saved_question_not_structured");
  const rerunResult = rerun as AiHistoryCheckReport["rerun"];
  if (
    !rerunResult?.answered ||
    rerunResult.interpretedBy !== "stored_plan" ||
    !rerunResult.earlierAnswerKept
  )
    failures.push("rerun_incomplete");
  if (logs) {
    const counts = logs as Record<Phase, LogCounts>;
    if ((counts.reopen?.modelCalls ?? 0) !== 0) failures.push("model_call_on_reopen");
    if ((counts.save_pin?.modelCalls ?? 0) !== 0)
      failures.push("model_call_on_save_or_pin");
    if ((counts.rerun?.modelCalls ?? 0) !== 0) failures.push("model_call_on_rerun");
    if ((counts.rerun?.conversations.stored_plan ?? 0) !== 1)
      failures.push("rerun_not_logged");
    if ((counts.questions?.modelCalls ?? 0) > asked)
      failures.push("more_than_one_model_call_per_question");
  }

  return {
    schemaVersion: AI_HISTORY_CHECK_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    expectedCommit: options.expectedCommit,
    expectedRevision: options.expectedRevision,
    versionVerified,
    questionsAsked: tracker.questionsSent,
    questions,
    reopen: reopenResult,
    saved: savedResult,
    rerun: rerunResult,
    requests: {
      reads: tracker.reads,
      questions: tracker.questionsSent,
      historyWrites: tracker.historyWrites,
      savedWrites: tracker.savedWrites,
      runs: tracker.runs,
      refused: tracker.refused.length,
      refusedRequests: tracker.refused,
    },
    windows,
    logs,
    verdict:
      failures.length === 0 && versionVerified.before && versionVerified.after
        ? "passed"
        : "failed",
    failures,
  };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseAiHistoryCheckArgs(argv);
  const report = await runAiHistoryCheck(options);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.report)
    writeFileSync(options.report, serialized, { encoding: "utf8", flag: "wx" });
  process.stdout.write(serialized);
  return report.verdict === "passed" ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`AI history check refused: ${safeCliFailure(error)}\n`);
      process.exitCode = 2;
    });
