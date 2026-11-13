import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BATCH_FILE,
  NOVEMBER_10_CORE_JOURNEYS,
  REHEARSAL_SEED,
  SEQUENCES_ROUTE,
  STAFF_PATH_ACTIONS,
  UNRESOLVED_ACTION,
  checkStaffPathCalls,
  findDirectSequenceCalls,
  formatStaffPathResult,
  selectStaffPathFiles,
} from "../../scripts/lib/one-path-rehearsal/staff-path-check.mjs";
import {
  N1002_STAFF_PATH_FILES,
  STAFF_PATH_ACTIONS as SCORED_ACTIONS,
} from "../browser/one-path-november-12-qualification-verdict.mjs";

// Inline fixtures only: the check is never asserted clean on the real tree. On the starting tree
// the seed and the November 10 core journeys post the route directly (the fail-first record), and
// S275 R-S275-8 replaces those calls.
const W12 = "tests/browser/one-path-november-12-journeys.mjs";
const CONSTANT = 'const SEQUENCES = "/api/gmail-hub/sequences";\n';
const calls = (text) => findDirectSequenceCalls(text, { file: W12 });
const actions = (text) => calls(text).map(({ action }) => action);

// A W12 journey that stays on the staff path: a visible control, a wait on the request that
// click makes, a read, the reply stand-in, the worker tick and the visible reply check.
const staffJourney = [
  'import { deliverOwnerReply } from "../../scripts/lib/one-path-rehearsal/control.mjs";',
  'const SEQUENCES = "/api/gmail-hub/sequences";',
  "export async function journeyW1204(ctx, page) {",
  "  const sent = page.waitForResponse(",
  "    (response) =>",
  "      new URL(response.url()).pathname === SEQUENCES &&",
  '      response.request().postDataJSON()?.action === "send",',
  "  );",
  '  await page.getByRole("button", { name: "Send now" }).click();',
  "  const { sequence } = await (await sent).json();",
  "  await deliverOwnerReply(ctx.rehearsal, { threadId: sequence.threads[0].threadId });",
  "  await ctx.kit.dispatchDue(page, sequence);",
  '  await page.getByRole("button", { name: "Check for a reply now" }).click();',
  '  return (await ctx.kit.read(page, SEQUENCES + "?id=" + sequence.id)).sequence;',
  "}",
  "",
].join("\n");
const shortcut = [
  "export async function replyShortcut(ctx, page, id) {",
  '  return ctx.kit.post(page, SEQUENCES, { action: "refresh", id });',
  "}",
  "",
].join("\n");

describe("ARCH-S284-2 the staff-path rule", () => {
  it.each(STAFF_PATH_ACTIONS)(
    "fails on a direct %s call of the sequences route",
    (action) => {
      const text = [
        CONSTANT + "export async function step(kit, page, id) {",
        "  const answer = await kit.post(page, SEQUENCES, {",
        `    action: "${action}",`,
        "    id,",
        "  });",
        "  return answer;",
        "}",
      ].join("\n");
      expect(calls(text)).toEqual([
        { file: W12, line: 3, column: 24, action, kind: "call" },
      ]);
    },
  );

  it("finds the seed's and N10-02's own call shapes on their call lines", () => {
    // scripts/lib/one-path-rehearsal/seeds.mjs, lines 267 to 274.
    const seed = [
      "async function repliedOwnerMessage({ page, rehearsal }, owner, role, message) {",
      "  const reply = await deliverOwnerReply(rehearsal, {",
      "    to: owner,",
      "    text: role.ownerReply?.text,",
      "  });",
      '  const observed = await route(page, "/api/gmail-hub/sequences", {',
      '    action: "refresh",',
      "    id: message.sequenceId,",
      "  });",
      "  return { reply, observed };",
      "}",
    ].join("\n");
    expect(calls(seed)).toEqual([
      { file: W12, line: 6, column: 26, action: "refresh", kind: "call" },
    ]);
    // tests/browser/one-path-november-10-core-journeys.mjs, lines 581 to 587.
    const n1002 = [
      CONSTANT +
        "export async function journeyN1002({ kit, rehearsal }, page, sequenceId) {",
      "  const reply = await deliverOwnerReply(rehearsal, {",
      "    threadId: sequence.threads[0].threadId,",
      '    text: "Synthetic owner reply: approved at a base rent of 1875 per month.",',
      "  });",
      "  const refreshed = await kit.post(page, SEQUENCES, {",
      '    action: "refresh",',
      "    id: sequenceId,",
      "  });",
      "  return { reply, refreshed };",
      "}",
    ].join("\n");
    expect(calls(n1002)).toEqual([
      { file: W12, line: 7, column: 27, action: "refresh", kind: "call" },
    ]);
  });

  it.each([
    [
      "fetch with a JSON body",
      'await fetch("/api/gmail-hub/sequences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "send", id }) });',
      ["send"],
    ],
    [
      "a template literal with the origin",
      'await fetch(`${origin}/api/gmail-hub/sequences`, { method: "POST", body: JSON.stringify({ action: "schedule" }) });',
      ["schedule"],
    ],
    [
      "Playwright's request with data",
      CONSTANT +
        'await page.request.post(origin + SEQUENCES, { data: { action: "resume", id } });',
      ["resume"],
    ],
    [
      "a concatenated constant",
      'const API = "/api/gmail-hub";\nconst PATH = API + "/sequences";\nawait post(page, PATH, { action: "refresh" });',
      ["refresh"],
    ],
    [
      "a property of a constant object",
      'const ROUTES = { sequences: "/api/gmail-hub/sequences" };\nawait kit.post(page, ROUTES.sequences, { action: "refresh" });',
      ["refresh"],
    ],
    [
      "the route with a query",
      CONSTANT + 'await kit.post(page, SEQUENCES + "?lease=1", { action: "send" });',
      ["send"],
    ],
    [
      "a body held in a constant",
      CONSTANT +
        'const body = { action: "send", id: "x" };\nawait kit.post(page, SEQUENCES, body);',
      ["send"],
    ],
    [
      "a spread",
      CONSTANT +
        'const command = { action: "schedule" };\nawait kit.post(page, SEQUENCES, { ...command, operationId: "y" });',
      ["schedule"],
    ],
    [
      "an action constant",
      CONSTANT +
        'const RESUME = "resume";\nawait kit.post(page, SEQUENCES, { action: RESUME });',
      ["resume"],
    ],
    [
      "a conditional action",
      CONSTANT +
        'await kit.post(page, SEQUENCES, { action: later ? "schedule" : "send" });',
      ["schedule", "send"],
    ],
    [
      "evaluate arguments",
      'await page.evaluate(([url, input]) => fetch(url, { method: "POST", body: JSON.stringify(input) }), ["/api/gmail-hub/sequences", { action: "refresh" }]);',
      ["refresh"],
    ],
    [
      "an options object's url",
      CONSTANT +
        'await page.evaluate(({ path, body }) => fetch(path, { method: "POST", body: JSON.stringify(body) }), { path: SEQUENCES, body: { action: "resume" } });',
      ["resume"],
    ],
    [
      "a Request object",
      'const request = new Request("/api/gmail-hub/sequences", { method: "POST", body: JSON.stringify({ action: "send" }) });',
      ["send"],
    ],
    [
      "a path a helper prefixes with /api",
      'await api(page, "gmail-hub/sequences", { action: "schedule" });',
      ["schedule"],
    ],
  ])("detects %s", (_variant, text, expected) => {
    expect(actions(text)).toEqual(expected);
  });

  it("detects a helper that is given the action, a route it imports and a path parameter", () => {
    const helper =
      CONSTANT +
      'const sequences = (page, body) => kit.post(page, SEQUENCES, body);\nawait sequences(page, { action: "refresh", id: "z" });';
    expect(calls(helper)).toEqual([
      { file: W12, line: 2, column: 35, action: "refresh", kind: "call", actionLine: 3 },
    ]);
    const imported =
      'import { SEQUENCES } from "./one-path-november-12-kit.mjs";\nawait kit.post(page, SEQUENCES, { action: "send" });';
    expect(calls(imported)).toEqual([
      { file: W12, line: 2, column: 7, action: "send", kind: "call", route: "not shown" },
    ]);
    const parameter =
      'export const resume = (kit, page, path, id) => kit.post(page, path, { action: "resume", id });';
    expect(actions(parameter)).toEqual(["resume"]);
  });

  it("detects code held in a string", () => {
    expect(
      calls(
        "await page.evaluate(\"fetch('/api/gmail-hub/sequences', { method: 'POST', body: JSON.stringify({ action: 'send' }) })\");",
      ),
    ).toEqual([{ file: W12, line: 1, column: 21, action: "send", kind: "text" }]);
  });

  it("fails closed on a body whose action the file does not show", () => {
    const generic =
      CONSTANT +
      "export async function command(kit, page, body) {\n  return kit.post(page, SEQUENCES, body);\n}\n";
    expect(actions(generic)).toEqual([UNRESOLVED_ACTION]);
    // A captured staff request replayed directly is still a direct call.
    const replay =
      CONSTANT +
      'const body = request.postDataJSON();\nawait post(page, SEQUENCES, { ...body, operationId: "y" });\n';
    expect(calls(replay)).toEqual([
      {
        file: W12,
        line: 3,
        column: 7,
        action: UNRESOLVED_ACTION,
        kind: "call",
        actionLine: 2,
      },
    ]);
    expect(
      actions(CONSTANT + "await kit.post(page, SEQUENCES, { action: nextAction() });"),
    ).toEqual([UNRESOLVED_ACTION]);
  });

  it.each(["save", "reconcile", "pause", "cancel", "transfer"])(
    "passes the route's %s action",
    (action) => {
      expect(
        calls(
          CONSTANT + `await kit.post(page, SEQUENCES, { action: "${action}", id: "x" });`,
        ),
      ).toEqual([]);
    },
  );

  it("passes reads, waits on a staff click, allow lists, other routes and comments", () => {
    const clean = [
      CONSTANT + '// await kit.post(page, SEQUENCES, { action: "refresh", id });',
      "/* fetch('/api/gmail-hub/sequences', { method: 'POST', body: JSON.stringify({ action: 'send' }) }) */",
      'const sequence = (await kit.read(page, SEQUENCES + "?id=" + id)).sequence;',
      "const sent = page.waitForResponse(",
      '  (response) => new URL(response.url()).pathname === SEQUENCES && response.request().postDataJSON()?.action === "send",',
      ");",
      'await page.getByRole("button", { name: "Send now" }).click();',
      "await sent;",
      'assert.equal((await sent).request().postDataJSON().action, "send");',
      'await journey("W12-04", { allow: ["/api/gmail-hub/sequences"] }, check);',
      'await route(page, "/api/lease-renewal/refresh", { mode: "force" });',
      'await kit.post(page, "/api/gmail-hub/sequences/thread", { action: "refresh" });',
      'await kit.post(page, "/api/gmail-hub/send", { action: "send" });',
      'await context.route("**/api/gmail-hub/sequences", (route) => route.continue());',
      'const note = "Staff read /api/gmail-hub/sequences through Check for a reply now.";',
    ].join("\n");
    expect(calls(clean)).toEqual([]);
  });

  it("AC-S284-2: adding such a call to a W12 journey fails the check again", () => {
    expect(selectStaffPathFiles([W12])).toContain(W12);
    expect(checkStaffPathCalls([{ file: W12, text: staffJourney }])).toEqual({
      route: SEQUENCES_ROUTE,
      actions: [...STAFF_PATH_ACTIONS],
      files: [W12],
      violations: [],
      unparsed: [],
      passed: true,
    });
    const again = checkStaffPathCalls([{ file: W12, text: staffJourney + shortcut }]);
    expect(again.passed).toBe(false);
    expect(again.violations).toEqual([
      { file: W12, line: 17, column: 10, action: "refresh", kind: "call" },
    ]);
  });

  it("lists this batch's files, including later ones, with the seed and the November 10 core journeys", () => {
    expect(
      selectStaffPathFiles([
        "tests/browser/one-path-november-12-qualification-driver.mjs",
        "tests/browser/one-path-november-12-journeys.mjs",
        "tests\\browser\\one-path-november-12-baseline-driver.mjs",
        "tests/browser/one-path-november-12-journeys.mjs",
        "tests/browser/one-path-november-10-qualification-driver.mjs",
        "tests/browser/one-path-november-12-journeys.mjs.bak",
        "tests/browser/fixtures/one-path-november-12-stand-in.mjs",
        "tests/browser/one-path-november-9-mail-checks.mjs",
      ]),
    ).toEqual([
      "tests/browser/one-path-november-12-baseline-driver.mjs",
      "tests/browser/one-path-november-12-journeys.mjs",
      "tests/browser/one-path-november-12-qualification-driver.mjs",
      REHEARSAL_SEED,
      NOVEMBER_10_CORE_JOURNEYS,
    ]);
    expect(
      BATCH_FILE.test("tests/browser/one-path-november-12-w12-14-journeys.mjs"),
    ).toBe(true);
    expect(selectStaffPathFiles([])).toEqual([REHEARSAL_SEED, NOVEMBER_10_CORE_JOURNEYS]);
    // The verdict module holds N10-02 to the staff path on the same two files and actions.
    expect(N1002_STAFF_PATH_FILES).toEqual([REHEARSAL_SEED, NOVEMBER_10_CORE_JOURNEYS]);
    expect(SCORED_ACTIONS).toEqual(STAFF_PATH_ACTIONS);
  });

  it("cannot show a file clean when it does not parse", () => {
    const result = checkStaffPathCalls([{ file: W12, text: "const = ;" }]);
    expect(result.passed).toBe(false);
    expect(result.unparsed).toEqual([
      { file: W12, line: 1, message: "Variable declaration expected." },
    ]);
  });

  it("prints file, line, column and action per call", () => {
    const result = checkStaffPathCalls([
      {
        file: W12,
        text: CONSTANT + 'await kit.post(page, SEQUENCES, { action: "send" });\n',
      },
    ]);
    expect(formatStaffPathResult(result)).toBe(
      [
        `Staff path check failed (S284 R-S284-2): 1 direct call(s) of ${SEQUENCES_ROUTE} in 1 of 1 file(s).`,
        `- ${W12}:2:7 send`,
        "Reach these outcomes through visible controls, the stand-in hooks and the worker tick.",
        `Scanned: ${W12}.`,
        "",
      ].join("\n"),
    );
  });

  it("the CLI exits 1 naming file, line and action, 0 on a clean file and 2 on a missing one", () => {
    const directory = mkdtempSync(join(tmpdir(), "s284-staff-path-"));
    try {
      const dirty = join(directory, "one-path-november-12-journeys.mjs");
      writeFileSync(
        dirty,
        CONSTANT +
          'export const go = (kit, page) => kit.post(page, SEQUENCES, { action: "resume" });\n',
      );
      const clean = join(directory, "one-path-november-12-reads.mjs");
      writeFileSync(
        clean,
        CONSTANT +
          'export const look = (kit, page, id) => kit.read(page, SEQUENCES + "?id=" + id);\n',
      );
      const cli = join(process.cwd(), "scripts/check-staff-path-calls.mjs");
      const run = (...args) =>
        spawnSync(process.execPath, [cli, ...args], {
          encoding: "utf8",
          timeout: 60_000,
        });
      const failed = run(dirty);
      expect(failed.status).toBe(1);
      expect(failed.stderr).toContain(`- ${dirty}:2:34 resume\n`);
      const passed = run(clean);
      expect(passed.status).toBe(0);
      expect(passed.stdout).toContain(
        "Staff path check passed (S284 R-S284-2): 1 file(s)",
      );
      const json = JSON.parse(run("--json", dirty).stdout);
      expect(json).toMatchObject({
        passed: false,
        violations: [{ line: 2, action: "resume" }],
      });
      expect(run(join(directory, "absent.mjs")).status).toBe(2);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
