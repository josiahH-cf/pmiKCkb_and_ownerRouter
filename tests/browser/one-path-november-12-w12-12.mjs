// S284 W12-12, "Plain, accurate screens": the candidate-side acceptance checks of S283 (intake
// 161) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/staff-surface-accuracy-cleanup.md (S283).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S283-1, AC-S283-2, AC-S283-3, AC-S283-4, AC-S283-5, AC-S283-6, AC-S283-7, AC-S283-8
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Read each listed date rendering. Filter the month to four of nine leases, read the Prepare
//   button and line, run it and reach the allowance. Read the three pages for internal text as an
//   Editor. Read the notice basis line as an Editor and change it as an Admin. Read Connections
//   and the bulk actions. Read the steps of a standing-agreement lease and a default in
//   Documents. Double-click Start run on a Space that still runs.
//
// Starting sequence (journeyW1212 in one-path-november-12-journeys.mjs, the fail-first table):
//   Filter December to four of nine leases and click Prepare. On the baseline: All nine leases
//   are prepared and the button names no count. On a build whose Working batch has its own search
//   box (S283), the same sequence also types W1212_BATCH_SEARCH there before Prepare, because
//   Prepare follows the Working batch's own filters; the desk table's filter does not carry over.
//   In the November 5 mix no single search shows exactly four of the nine monthly rows (every
//   tenant name reads "Example"), so the adaptation shows 5 of the 9 rows, 3 of the 5 targets.
//
// HOW THIS ROW REACHES EACH STATE. Staff controls only: the Working batch's search box, its count
// groups, its month links and an address carrying its tag filter, Prepare and Continue, the lease
// steps and their Schedule control, the Admin notice basis selection, the Connections cards, the
// Approval Queue, Help, the process forms and Start run on the Move-In Space. Outside parties and
// time act only through the rehearsal hooks: the comparison allowance (setComparisonAllowance) and
// the process harness (runProcessHarness: the Move-In definition with placeholder, then real,
// staff, which no staff control records). The allowance is set reached part way through a run by
// holding that run's first request in the browser while the hook writes the count, then letting
// it go. One named fixture is written to the rehearsal emulator for a read: a synthetic Approval
// Queue item, because the bulk actions show only beside an item and nothing in the rehearsal
// creates one; it is never acted on. Three kinds of hand request are refusal probes only, each
// expected to change nothing (the run start key sent again must return the run already made): a
// preparation target outside the month or not eligible, a notice basis selection by an Editor, an
// Approver and a stale Admin, and the same run start key sent again after the staff click. Nothing
// here posts the sequences route, ticks the worker or sends a message.
// Raw observations go to ctx.record; no page text or lease value goes into the report.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  refusedConnections,
  setComparisonAllowance,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import { runProcessHarness } from "../../scripts/lib/one-path-rehearsal/process-draft-seed.mjs";
import {
  confirmReview,
  reachPrimary,
  stepScheduleButton,
} from "./one-path-november-12-journeys.mjs";
import { DESK, KICKOFF_ROUTE } from "./one-path-november-12-kit.mjs";
import { firestoreValue, plainValue } from "./one-path-november-10-kit.mjs";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const monthInWords = (month) =>
  /^\d{4}-\d{2}$/.test(String(month))
    ? `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
    : null;
const squash = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
const sum = (values) => values.reduce((total, value) => total + Number(value ?? 0), 0);
const sameSet = (left, right) =>
  left.length === right.length && left.every((value) => right.includes(value));

// ---- The spec's staff words (S283 R-S283-1 to R-S283-7) ---------------------------------------
const SETTLED_INSTANT =
  /^(\d{2})\/(\d{2})\/(\d{4}), (\d{1,2}):(\d{2}) (AM|PM) (CST|CDT)$/;
const SCHEDULED_LINE =
  /Scheduled for (\d{2}\/\d{2}\/\d{4}, \d{1,2}:\d{2} (?:AM|PM) (?:CST|CDT))\. It counts as sent once Gmail accepts it\./;
const SCHEDULED_ROW =
  /^Scheduled for (\d{2}\/\d{2}\/\d{4}, \d{1,2}:\d{2} (?:AM|PM) (?:CST|CDT))$/;
const PREPARE_BUTTON = /^Prepare (\d+)(?: of (\d+))? ([A-Z][a-z]+ \d{4}) leases?$/;
const SCOPE_LINE =
  /^(\d+) leases? shown\.(?: (\d+) needs? a comparison; (\d+) already ha(?:s|ve) one\.)? Monthly allowance: (\d+) of (\d+) left\.(?: It covers (\d+) of the (\d+) comparisons? needed\.)?$/;
const NOT_RUN_MESSAGE = "Not run: the monthly allowance is reached.";
const ENGINEERING_SENTENCE = "Keep external actions blocked until";
const RETIRED_CHIP = "Not part of this lease's path";
const RETIRED_CHIP_CURLY = "Not part of this lease’s path";
const NEEDS_VERIFICATION = "Needs Verification: PMI KC has not confirmed this form use.";
const ENGINEERING_DEFAULT = "Engineering default, not yet approved by the client";
const ADMIN_FIELD_HINT =
  "Engineering default. Choosing a use here records it as a new configuration version.";
const RUN_OWNER_LABEL = "Run owner (staff account ID)";
const APPROVER_LABEL = "Default approver (staff account ID)";
const PEOPLE_AND_ACCESS = "Admin, People and access";
const UNUSED_STEP_LINE = "This lease does not use that step. Showing the current step.";
const STANDING_LINE = "Standing agreement: the owner step is skipped.";
const ASSISTED_LINE =
  "Housing assistance: the market comparison and the owner's rent decision are skipped unless you propose a change.";
const BASIS_NOT_SET =
  "Notice timing basis: not set. An Admin sets it in Renewal notice rules.";
const BASIS_SAVED =
  /^Notice timing: counted from (?:the lease end date|the expected move-out date), in calendar days, (\d+) days?\. Applies to every renewal\. Set on (\d{2}\/\d{2}\/\d{4})\.(?: Change in Admin)?$/;
const CHANGE_IN_ADMIN = "Change in Admin";
const BASIS_ADMIN_PATH = "/admin";
const BASIS_ROUTE = "/api/lease-renewal/notice-timing-basis";
const QUICKBOOKS_STATE = "This app has no QuickBooks sign-in.";
const BULK_OPTIONS = [
  "Approve",
  "Return for Revision",
  "Assign",
  "Snooze",
  "Disable Action",
];
const PLACEHOLDER_REFUSAL =
  "This process has no assigned staff member yet. An Admin assigns one before a run can start.";
const OTHER_SPACE = { space: "move-in", definition: "move-in" };
/** Documents' form family table (LeasePacketReadiness), inside the step's own disclosures. */
const FORMS_SECTION = 'section[aria-label="Form families for this lease"]';
/** A date in daylight time for the scheduled owner message (the rehearsal date is in November). */
const DAYLIGHT_DATE = "2027-03-16";
const DAYLIGHT_TIME = "09:00";
// The December search shows these three of five targets. Four earlier leases are carryovers.
const DECEMBER_TARGETS = ["9101", "9102", "9103", "9104", "9105"];
const DECEMBER_SAMPLE_TARGETS = ["9101", "9103", "9105"];
const DECEMBER_CARRYOVERS = ["9106", "9107", "9108", "9109"];
// The next month's fixed-term targets have no cached comparison from December's search run.
const JANUARY_TARGETS = ["9110", "9111", "9112", "9113", "9114", "9115", "9116"];
const JANUARY_AVE_TARGET = "9114";

// R-S283-1: the renderings S283 lists, scanned for direct formatting (ARCH-S283-1).
const LISTED_DATE_FILES = [
  "components/lease-renewal/RenewalPreparedMessage.tsx",
  "components/lease-renewal/RenewalOfferAnswers.tsx",
  "components/lease-renewal/RenewalMessagePreparation.tsx",
  "components/lease-renewal/LeasePacketReadiness.tsx",
  "components/lease-renewal/RenewalManualWorkspace.tsx",
  "components/gmail-hub/CommunicationComposer.tsx",
  "components/gmail-hub/WorkflowCommunicationsHub.tsx",
  "lib/gmail-hub/schedule-calendar.ts",
  "lib/lease-documents/returned-state-view.ts",
];
const DIRECT_FORMATTING = [
  /toLocale(?:Date|Time)?String\(/,
  /month:\s*"(?:short|long|numeric)"/,
  /dateStyle:|timeStyle:/,
  /format\w*\(\s*new Date\([^)]*\)\.toISOString\(\)/,
  /Scheduled for \$\{scheduleDate\} at \$\{scheduleTime\}/,
];
// Date shapes no listed surface may show (R-S283-1): ISO dates, month-name dates, 24-hour times,
// instants without a zone and two-digit years.
const OTHER_DATE_SHAPES = [
  ["iso-date", /\b\d{4}-\d{2}-\d{2}\b/g],
  [
    "month-name-date",
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}, \d{4}\b/g,
  ],
  ["24-hour-time", /\b(?:[01]\d|2[0-3]):[0-5]\d\b(?!:?\d* ?(?:AM|PM))/g],
  [
    "instant-without-zone",
    /\b\d{2}\/\d{2}\/\d{4},? \d{1,2}:\d{2} ?(?:AM|PM)\b(?! (?:CST|CDT|[A-Z]{2,5}\b))/g,
  ],
  ["two-digit-year", /\b\d{1,2}\/\d{1,2}\/\d{2}\b(?!\d)/g],
];

// ---- Small reads -------------------------------------------------------------------------------

/** The words a page shows (closed disclosures and framework data scripts excluded). */
const shownText = (locator) => locator.innerText().then(squash, () => "");

/** The words a page holds, collapsed disclosures included, without framework data scripts. */
function pageWords(page) {
  return page.evaluate(() => {
    const copy = document.body.cloneNode(true);
    for (const node of copy.querySelectorAll("script, style, noscript, template"))
      node.remove();
    return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
  });
}

/** Every other date shape in a text, as `kind: match` (at most 12). */
function otherDateShapes(text) {
  const found = [];
  for (const [kind, pattern] of OTHER_DATE_SHAPES)
    for (const match of String(text).matchAll(pattern))
      found.push(`${kind}: ${match[0]}`);
  return [...new Set(found)].slice(0, 12);
}

const fieldsOf = (document) =>
  document
    ? Object.fromEntries(
        Object.entries(document.fields ?? {}).map(([key, value]) => [
          key,
          plainValue(value),
        ]),
      )
    : null;
const idOf = (document) => String(document.name).split("/").at(-1);

/**
 * What the stand-ins and the boundary hold: lookups by lease, sends, runs, and the requests the
 * app's own server made off this machine that the boundary refused (a provider write would be one).
 */
async function effects(kit, rehearsal) {
  const lookups = await kit.comparisons();
  const sent = (await kit.sentMail()).length;
  const runs = (await kit.listDocuments("workflow_runs")).map(idOf).sort();
  return {
    lookups,
    lookupTotal: sum(Object.values(lookups)),
    sent,
    runs,
    refused: refusedConnections(rehearsal).filter((entry) => entry.from === "server")
      .length,
  };
}
const lookupDelta = (before, after) =>
  Object.fromEntries(
    Object.entries(after.lookups)
      .map(([leaseId, count]) => [leaseId, count - (before.lookups[leaseId] ?? 0)])
      .filter(([, count]) => count !== 0),
  );

/** Requests a page makes after `mark` (an index into ctx.writes), by path. */
const writesSince = (ctx, mark) => ctx.writes.slice(mark).map((write) => write.path);

/** The preparation POSTs and answers a page makes while watched. */
function watchPreparation(page) {
  const posts = [];
  const answers = [];
  const onRequest = (request) => {
    if (request.method() !== "POST") return;
    if (new URL(request.url()).pathname !== KICKOFF_ROUTE) return;
    let body = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = null;
    }
    posts.push({
      leaseId: String(body?.leaseId ?? ""),
      month: body?.month ?? null,
      at: Date.now(),
    });
  };
  const onResponse = (response) => {
    const request = response.request();
    if (request.method() !== "POST") return;
    if (new URL(response.url()).pathname !== KICKOFF_ROUTE) return;
    void response
      .json()
      .catch(() => null)
      .then((body) =>
        answers.push({
          leaseId: String(body?.leaseId ?? ""),
          status: body?.status ?? null,
          http: response.status(),
          at: Date.now(),
        }),
      );
  };
  page.on("request", onRequest);
  page.on("response", onResponse);
  return {
    posts,
    answers,
    stop() {
      page.off("request", onRequest);
      page.off("response", onResponse);
    },
  };
}

// ---- The Working batch ------------------------------------------------------------------------

async function openBatch(kit, page, search = "") {
  await kit.openPath(page, DESK + search);
  const batch = page.locator('section[aria-label="Working batch"]').first();
  await batch.waitFor({ timeout: 120_000 });
  await page
    .locator('section[aria-label="Batch preparation"]')
    .first()
    .waitFor({ timeout: 90_000 });
  return batch;
}

async function openAllowanceBatch(kit, page) {
  const batch = await openBatch(kit, page);
  const next = batch
    .getByRole("navigation", { name: "Working month" })
    .getByRole("link", { name: /^Next month/ });
  const month = await next.getAttribute("data-batch-month-target");
  if (!monthInWords(month))
    throw new Error("The next working month has no valid target.");
  await next.click();
  const selected = page.locator(
    `section[aria-label="Working batch"][data-batch-month="${month}"]`,
  );
  await selected.getByRole("region", { name: "Batch preparation" }).waitFor({
    timeout: 90_000,
  });
  return selected;
}

/** The Working batch rows in table order, once each, with their group, need and tags. */
async function batchRows(page) {
  const rows = await page
    .locator('section[aria-label="Working batch"] tr[data-batch-lease]')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        leaseId: node.getAttribute("data-batch-lease"),
        group: node.getAttribute("data-batch-group"),
        preparation: node.getAttribute("data-batch-preparation"),
        needs: node.getAttribute("data-batch-preparation") === "true",
        tags: [...node.querySelectorAll("[data-batch-tag]")].map((tag) =>
          tag.getAttribute("data-batch-tag"),
        ),
      })),
    );
  const seen = new Set();
  return rows.filter((row) => {
    if (!row.leaseId || seen.has(row.leaseId)) return false;
    seen.add(row.leaseId);
    return true;
  });
}
const thisBatch = (rows) =>
  rows
    .filter((row) => row.group === "this_batch" && row.preparation !== "held")
    .map((row) => row.leaseId);

/** The Prepare button and its line, as staff read them. */
async function readPrepare(kit, page) {
  const section = page.locator('section[aria-label="Batch preparation"]').first();
  await section.waitFor({ timeout: 90_000 });
  const button = section.locator("[data-kickoff-prepare]").first();
  const shown = await kit.shownWithin(button, 30_000);
  const line = squash(
    await section
      .locator("[data-kickoff-scope]")
      .first()
      .innerText()
      .catch(() => ""),
  );
  const month = await page
    .locator('section[aria-label="Working batch"]')
    .first()
    .getAttribute("data-batch-month");
  return {
    month,
    button: shown ? squash(await button.innerText()) : null,
    disabled: shown ? await button.isDisabled() : null,
    line,
    targets: Number(await section.getAttribute("data-kickoff-targets")),
    monthTargets: Number(await section.getAttribute("data-kickoff-month-targets")),
  };
}

/** The button names the shown count, and "of" the month's total when they differ. */
function buttonStates(read, shown, total) {
  const match = PREPARE_BUTTON.exec(read?.button ?? "");
  if (!match) return false;
  const words = monthInWords(read.month);
  if (match[3] !== words) return false;
  if (Number(match[1]) !== shown) return false;
  return shown === total ? match[2] === undefined : Number(match[2]) === total;
}

/** The line's numbers: shown, need, have, allowance left and total, covers and needed. */
function parseLine(line) {
  const match = SCOPE_LINE.exec(line ?? "");
  if (!match) return null;
  const number = (value) => (value === undefined ? null : Number(value));
  return {
    shown: number(match[1]),
    need: number(match[2]),
    have: number(match[3]),
    left: number(match[4]),
    total: number(match[5]),
    covers: number(match[6]),
    needed: number(match[7]),
  };
}

/**
 * Prepare (or Continue), then wait for this run to finish: an earlier run's finished line is
 * marked first, so only the line this run writes counts.
 */
async function clickPrepareAndFinish(kit, page) {
  await page
    .locator("[data-kickoff-progress]")
    .evaluateAll((nodes) =>
      nodes.forEach((node) => node.setAttribute("data-w1212-earlier", "")),
    )
    .catch(() => undefined);
  const button = page.locator("[data-kickoff-prepare]").first();
  await button.click();
  await page
    .locator("[data-kickoff-progress]:not([data-w1212-earlier])")
    .filter({ hasText: /Preparation finished/ })
    .first()
    .waitFor({ timeout: 600_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1500);
  return {
    progress: squash(
      await page
        .locator("[data-kickoff-progress]:not([data-w1212-earlier])")
        .first()
        .innerText()
        .catch(() => ""),
    ),
    outcomes: await page
      .locator('ul[aria-label="Preparation results"] > li')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          status: node.getAttribute("data-kickoff-outcome"),
          text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
        })),
      )
      .catch(() => []),
    dialogs: await page.getByRole("dialog").count(),
  };
}

/** A preparation request by hand, from the signed-in page: a refusal probe. */
function requestPreparation(page, body) {
  return page.evaluate(
    async ([route, input]) => {
      const response = await fetch(route, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const answer = await response.json().catch(() => null);
      return {
        http: response.status,
        status: answer?.status ?? null,
        code: answer?.code ?? null,
      };
    },
    [KICKOFF_ROUTE, body],
  );
}

// ---- The notice basis ---------------------------------------------------------------------------

/** The saved basis as the route reads it, for the signed-in role of `page`. */
async function basisRead(kit, page) {
  const body = await kit.read(page, BASIS_ROUTE);
  return {
    state: body?.timingBasis?.state ?? null,
    version: body?.timingBasis?.record?.version ?? null,
    canSelect: body?.canSelect === true,
  };
}

/** A selection by hand, from the signed-in page: a refusal probe. */
function requestBasisSelection(page, input) {
  return page.evaluate(
    async ([route, body]) => {
      const response = await fetch(route, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { http: response.status };
    },
    [BASIS_ROUTE, input],
  );
}

/** The basis line on one lease, with any control near it. */
async function readBasisLine(kit, page, leaseId) {
  await kit.openLease(page, leaseId);
  const line = page.locator('section[aria-label="Notice timing basis"]').first();
  await line.waitFor({ state: "attached", timeout: 60_000 });
  await page
    .waitForFunction(
      () =>
        document
          .querySelector('section[aria-label="Notice timing basis"]')
          ?.getAttribute("data-notice-basis-line") !== "loading",
      null,
      { timeout: 60_000 },
    )
    .catch(() => undefined);
  const text = squash(await line.innerText().catch(() => ""));
  return {
    leaseId,
    state: await line.getAttribute("data-notice-basis-line"),
    text,
    controls: await line.locator("select, input, button").count(),
    changeLinks: await line
      .getByRole("link", { name: CHANGE_IN_ADMIN, exact: true })
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href"))),
    // A selector anywhere on the lease page.
    pageSelectors: await page.getByLabel("Documented notice basis").count(),
  };
}

/**
 * Every render of the basis line while a slowed lease loads: the lease's own reads are each held
 * 2.5 s, and a mutation observer records, for every change, whether the line shows words and
 * whether it sits above the step (the step heading, or before it in the page).
 */
async function slowLoadRenders(kit, page, leaseId) {
  await page.addInitScript(() => {
    const renders = [];
    window.__basisRenders = renders;
    const sample = () => {
      const line = document.querySelector('section[aria-label="Notice timing basis"]');
      const words = (line?.textContent ?? "").trim();
      if (!line || !words) {
        renders.push({ words: false });
        return;
      }
      const step = document.querySelector("#renewal-now-heading");
      const above =
        !step ||
        Boolean(line.compareDocumentPosition(step) & Node.DOCUMENT_POSITION_FOLLOWING) ||
        line.getBoundingClientRect().top < step.getBoundingClientRect().top;
      renders.push({ words: true, step: Boolean(step), above });
    };
    new MutationObserver(sample).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  const slowed = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      slowed.push(new URL(request.url()).pathname);
      await new Promise((done) => setTimeout(done, 2500));
    }
    await route.fallback();
  });
  try {
    await kit.openLease(page, leaseId);
    await page.waitForTimeout(4000);
  } finally {
    await page.unroute("**/api/**").catch(() => undefined);
  }
  const renders = await page.evaluate(() => window.__basisRenders ?? []);
  const withWords = renders.filter((render) => render.words);
  return {
    slowedReads: slowed.length,
    renders: renders.length,
    rendersWithLine: withWords.length,
    lineAboveStep: withWords.filter((render) => render.above).length,
  };
}

// ---- The Approval Queue -------------------------------------------------------------------------

const QUEUE_FIXTURE_ID = "w1212-synthetic-bulk-read";

/** The one synthetic queue item the bulk actions are read beside (see the controls part). */
async function queueItemFixture(kit) {
  const now = new Date().toISOString();
  const item = {
    id: QUEUE_FIXTURE_ID,
    data_mode: "live",
    process_run_ref: { id: QUEUE_FIXTURE_ID, label: "Synthetic W12-12 rehearsal item" },
    item_type: "ApprovalPackage",
    source_trigger_key: `rehearsal:${QUEUE_FIXTURE_ID}`,
    status: "Ready for Approval",
    risk: "Low",
    audience_group: "Team follow-up",
    assignee_uid: "local-demo-editor",
    required_approver_uid: "local-demo-approver",
    created_by_uid: "local-demo-admin",
    action_needed: "Synthetic rehearsal item: read the bulk actions beside it.",
    direct_link: "/approval-queue",
    created_at: now,
    updated_at: now,
  };
  await kit.patchDocument(
    `approval_queue_items/${QUEUE_FIXTURE_ID}`,
    Object.keys(item),
    Object.fromEntries(
      Object.entries(item).map(([key, value]) => [key, firestoreValue(value)]),
    ),
    { exists: false },
  );
  return {
    id: QUEUE_FIXTURE_ID,
    written: Boolean(await kit.readDocument(`approval_queue_items/${QUEUE_FIXTURE_ID}`)),
  };
}

// ---- Process runs ---------------------------------------------------------------------------------

/** A run start sent again by hand with a key a staff click already sent: a replay probe. */
function requestRunStart(page, definitionId, body) {
  return page.evaluate(
    async ([id, input]) => {
      const response = await fetch(
        `/api/process-definitions/${encodeURIComponent(id)}/runs`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const answer = await response.json().catch(() => null);
      return {
        http: response.status,
        runId: answer?.run?.id ?? answer?.id ?? null,
        error: answer?.error ?? null,
      };
    },
    [definitionId, body],
  );
}

// ---- The checks ---------------------------------------------------------------------------------

/**
 * W12-12 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1212 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S283-1 to AC-S283-8 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1212(ctx, page, start) {
  const { kit, rehearsal } = ctx;
  const harness = (operation) => runProcessHarness(rehearsal, operation);
  const failures = [];
  // The signed-in pages a part opens; each part closes its own when it ends.
  let opened = [];
  const open = async (role) => {
    const extra = await ctx.newPage(role);
    opened.push(extra);
    return extra;
  };
  /** Run one part; a part that stops is recorded and reads as not observed. */
  async function part(name, work) {
    opened = [];
    try {
      const result = await work();
      ctx.record({ part: name, result });
      return result;
    } catch (error) {
      const message = String(error?.message ?? error).slice(0, 700);
      failures.push(name);
      ctx.record({ part: name, error: message });
      return null;
    } finally {
      for (const extra of opened)
        if (!extra.isClosed())
          await extra
            .context()
            .close()
            .catch(() => undefined);
      opened = [];
    }
  }
  ctx.record({
    startingSequence: start.error ? { stopped: start.error } : start.observed,
  });
  const observedStart = start.error ? null : start.observed;
  const effectsAtStart = await part("effects at the start", () =>
    effects(kit, rehearsal),
  );

  // ---- AC-S283-2 and AC-S283-6: reading the desk starts nothing --------------------------------
  const deskReads = await part("desk reads", async () => {
    const reader = await open("Editor");
    const mark = ctx.writes.length;
    const before = await effects(kit, rehearsal);
    await openBatch(kit, reader);
    const rows = await batchRows(reader);
    const unfiltered = await readPrepare(kit, reader);
    // The search box narrows the table; a word no lease carries shows none.
    const search = reader
      .locator('section[aria-label="Working batch"]')
      .first()
      .getByRole("searchbox")
      .first();
    await search.fill(observedStart?.workingBatchSearch ?? "Sample");
    await reader.waitForTimeout(800);
    const searched = await readPrepare(kit, reader);
    const searchedRows = await batchRows(reader);
    await search.fill("");
    await reader.waitForTimeout(800);
    // A count group open: the monthly rows leave the table, and Prepare covers none.
    const groupButton = reader
      .locator('section[aria-label="Working batch"] button[data-batch-group]')
      .first();
    const groupName = squash(await groupButton.innerText().catch(() => ""));
    await groupButton.click();
    await reader.waitForTimeout(1200);
    const grouped = await readPrepare(kit, reader);
    await groupButton.click();
    await reader.waitForTimeout(1200);
    // Another month and back.
    const months = reader.locator('nav[aria-label="Working month"]');
    await months
      .getByRole("link", { name: /Next month/ })
      .first()
      .click();
    await reader
      .waitForFunction(
        (month) =>
          document
            .querySelector('section[aria-label="Working batch"]')
            ?.getAttribute("data-batch-month") !== month,
        unfiltered.month,
        { timeout: 60_000 },
      )
      .catch(() => undefined);
    await reader.waitForTimeout(1500);
    const nextMonth = await readPrepare(kit, reader);
    await months
      .getByRole("link", { name: /^Return to / })
      .first()
      .click()
      .catch(() => undefined);
    await reader
      .waitForFunction(
        (month) =>
          document
            .querySelector('section[aria-label="Working batch"]')
            ?.getAttribute("data-batch-month") === month,
        unfiltered.month,
        { timeout: 60_000 },
      )
      .catch(() => undefined);
    await reader.waitForTimeout(1500);
    const backAgain = await readPrepare(kit, reader);
    // The tag filter, as a link carries it.
    const tag = rows.find((row) => row.group === "this_batch" && row.tags.length)
      ?.tags[0];
    let tagged = null;
    let taggedRows = [];
    if (tag) {
      await openBatch(kit, reader, `?tag=${encodeURIComponent(tag)}`);
      tagged = await readPrepare(kit, reader);
      taggedRows = await batchRows(reader);
    }
    await reader.waitForTimeout(1500);
    const after = await effects(kit, rehearsal);
    const writes = writesSince(ctx, mark);
    return {
      rows,
      unfiltered,
      searched,
      searchedTargets: thisBatch(searchedRows),
      groupName,
      grouped,
      nextMonth,
      backAgain,
      tag: tag ?? null,
      tagged,
      taggedTargets: thisBatch(taggedRows),
      lookups: lookupDelta(before, after),
      preparationPosts: writes.filter((path) => path === KICKOFF_ROUTE).length,
      writes,
      sentBefore: before.sent,
      sentAfter: after.sent,
    };
  });
  const monthTargets = deskReads ? thisBatch(deskReads.rows) : [];

  // ---- AC-S283-2: a tag filter run prepares only the tagged leases shown ----------------------
  const tagRun = await part("tag filter run", async () => {
    if (!deskReads?.tag) return { skipped: "no This batch row carries a tag" };
    const runner = await open("Editor");
    await openBatch(kit, runner, `?tag=${encodeURIComponent(deskReads.tag)}`);
    const shown = thisBatch(await batchRows(runner));
    const read = await readPrepare(kit, runner);
    const before = await effects(kit, rehearsal);
    const watch = watchPreparation(runner);
    const finished = await clickPrepareAndFinish(kit, runner);
    watch.stop();
    const after = await effects(kit, rehearsal);
    return {
      shown,
      read,
      finished,
      posted: watch.posts.map((post) => post.leaseId),
      answers: watch.answers,
      lookups: lookupDelta(before, after),
    };
  });

  // ---- AC-S283-2: targets outside the month or not eligible are refused by hand -------------
  const probes = await part("preparation refusal probes", async () => {
    const prober = await open("Editor");
    await kit.openPath(prober, DESK);
    const month = deskReads?.unfiltered?.month ?? "2026-12";
    const later = ctx.leases.byId(9110);
    const carried = deskReads?.rows.find((row) => row.group === "carried_over")?.leaseId;
    const carriedFacts = carried ? ctx.leases.byId(carried) : null;
    const notice = ctx.leases.byId(9138);
    const candidates = [
      later && { kind: "another month", leaseId: "9110", cycle: later.endDate },
      carriedFacts && {
        kind: "carried over",
        leaseId: String(carried),
        cycle: carriedFacts.endDate,
      },
      notice && { kind: "move-out notice", leaseId: "9138", cycle: notice.endDate },
    ].filter(Boolean);
    const before = await effects(kit, rehearsal);
    const answers = [];
    for (const probe of candidates)
      answers.push({
        kind: probe.kind,
        leaseId: probe.leaseId,
        ...(await requestPreparation(prober, {
          leaseId: probe.leaseId,
          trigger: "staff",
          month,
          cycleDateIso: probe.cycle,
          operationId: randomUUID(),
        })),
      });
    const after = await effects(kit, rehearsal);
    return { month, answers, lookups: lookupDelta(before, after) };
  });

  // ---- AC-S283-2: an unfiltered run reaches the allowance part way through -------------------
  const allowanceRun = await part("unfiltered run to the allowance", async () => {
    // The reset clears stored comparisons, but the served build's address cache survives it.
    // Choose the next month through the desk so the earlier filtered run cannot warm its targets.
    await ctx.resetState();
    const runner = await open("Editor");
    const batch = await openAllowanceBatch(kit, runner);
    const rows = await batchRows(runner);
    const snapshot = thisBatch(rows);
    const read = await readPrepare(kit, runner);
    const before = await effects(kit, rehearsal);
    const needing = rows
      .filter((row) => row.group === "this_batch" && row.needs)
      .map((row) => row.leaseId);
    if (!sameSet(snapshot, JANUARY_TARGETS) || !sameSet(needing, JANUARY_TARGETS))
      throw new Error(
        `The allowance fixture needs seven unprepared next-month targets. Shown: ${snapshot.join(", ")}. Needing comparisons: ${needing.join(", ")}.`,
      );
    // Hold the first request while staff change the visible filter and the stand-in
    // leaves one comparison available. A later target must hit the allowance.
    let release = () => undefined;
    const gate = new Promise((done) => (release = done));
    let heldLease = null;
    let signalHeld = () => undefined;
    const held = new Promise((done) => (signalHeld = done));
    await runner.route(`**${KICKOFF_ROUTE}`, async (route) => {
      if (route.request().method() === "POST" && heldLease === null) {
        try {
          heldLease = String(route.request().postDataJSON()?.leaseId ?? "");
        } catch {
          heldLease = "";
        }
        signalHeld();
        await gate;
      }
      await route.fallback();
    });
    const watch = watchPreparation(runner);
    const button = runner.locator("[data-kickoff-prepare]").first();
    await button.click();
    const heldInTime = await Promise.race([
      held.then(() => true),
      new Promise((done) => setTimeout(() => done(false), 60_000)),
    ]);
    // Mid-run: the search narrows the table to rows the run already holds and leaves out others.
    const search = batch.getByRole("searchbox");
    let shownMidRun;
    let allowance;
    try {
      await search.fill("Ave");
      await batch
        .locator(
          `tbody[data-batch-list="this_batch"][data-batch-count="1"] tr[data-batch-lease="${JANUARY_AVE_TARGET}"]`,
        )
        .waitFor({ timeout: 30_000 });
      shownMidRun = thisBatch(await batchRows(runner));
      allowance = await setComparisonAllowance(rehearsal, false, 1);
    } finally {
      release();
    }
    await runner
      .locator("[data-kickoff-progress]")
      .filter({ hasText: /Preparation finished/ })
      .first()
      .waitFor({ timeout: 600_000 })
      .catch(() => undefined);
    await runner.waitForTimeout(2000);
    await runner.unroute(`**${KICKOFF_ROUTE}`).catch(() => undefined);
    const progress = squash(
      await runner
        .locator("[data-kickoff-progress]")
        .first()
        .innerText()
        .catch(() => ""),
    );
    const outcomes = await runner
      .locator('ul[aria-label="Preparation results"] > li')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          status: node.getAttribute("data-kickoff-outcome"),
          text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
        })),
      )
      .catch(() => []);
    const dialogs = await runner.getByRole("dialog").count();
    watch.stop();
    const afterStop = await effects(kit, rehearsal);
    const posts = watch.posts.map((post) => post.leaseId);
    const answers = [...watch.answers];

    // The line before a click while the allowance is reached: how many it covers.
    const reader = await open("Editor");
    await openAllowanceBatch(kit, reader);
    const atAllowance = await readPrepare(kit, reader);

    // Open again, and Continue the same run with nothing filtered.
    const reopened = await setComparisonAllowance(rehearsal, false);
    await search.fill("");
    await batch
      .locator(
        `tbody[data-batch-list="this_batch"][data-batch-count="${JANUARY_TARGETS.length}"]`,
      )
      .waitFor({ timeout: 30_000 });
    const continueButton = runner.locator("[data-kickoff-prepare]").first();
    const continueName = squash(await continueButton.innerText().catch(() => ""));
    const continueWatch = watchPreparation(runner);
    const continued = await clickPrepareAndFinish(kit, runner);
    continueWatch.stop();
    const afterContinue = await effects(kit, rehearsal);
    // The month as it reads now, in a fresh visit.
    const fresh = await open("Editor");
    await openAllowanceBatch(kit, fresh);
    const finalRows = await batchRows(fresh);
    const finalRead = await readPrepare(kit, fresh);
    return {
      snapshot,
      effectsAtStart: before,
      needing,
      read,
      heldInTime,
      heldLease,
      shownMidRun,
      allowance,
      posts,
      postMonths: [...new Set(watch.posts.map((post) => post.month))],
      answers,
      progress,
      outcomes,
      dialogs,
      lookupsToStop: lookupDelta(before, afterStop),
      atAllowance,
      reopened,
      continueName,
      continuePosts: continueWatch.posts.map((post) => post.leaseId),
      continueMonths: [...new Set(continueWatch.posts.map((post) => post.month))],
      continueAnswers: continueWatch.answers,
      continued,
      lookupsInContinue: lookupDelta(afterStop, afterContinue),
      finalRead,
      finalNeeding: finalRows
        .filter((row) => row.group === "this_batch" && row.needs)
        .map((row) => row.leaseId),
    };
  });

  // ---- AC-S283-1: dates and instants --------------------------------------------------------
  const dates = await part("dates and instants", async () => {
    const mark = ctx.writes.length;
    const leaseId = String(ctx.leases.prepared?.leaseId ?? 9101);
    const before = await effects(kit, rehearsal);
    await reachPrimary(ctx, page, leaseId, "ask-owner", "Review owner message");
    const trigger = await stepScheduleButton(ctx, page);
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Review and schedule" });
    await dialog
      .locator('[data-renewal-field="exact-review"]')
      .waitFor({ timeout: 120_000 });
    const dateInput = dialog.locator('input[type="date"]').first();
    const timeInput = dialog.locator('input[type="time"]').first();
    const offered = {
      date: await dateInput.inputValue().catch(() => null),
      time: await timeInput.inputValue().catch(() => null),
    };
    await dateInput.fill(DAYLIGHT_DATE);
    await timeInput.fill(DAYLIGHT_TIME);
    const entered = {
      date: await dateInput.inputValue().catch(() => null),
      time: await timeInput.inputValue().catch(() => null),
    };
    const dialogShapes = otherDateShapes(await shownText(dialog));
    const confirmed = await confirmReview(
      ctx,
      page,
      dialog,
      "Schedule this message",
      "schedule",
    );
    // The confirmation line the step shows once the schedule is stored.
    await page
      .getByText(SCHEDULED_LINE)
      .first()
      .waitFor({ timeout: 30_000 })
      .catch(() => undefined);
    const statusAfter =
      (await shownText(page.locator("div.page").first())).match(SCHEDULED_LINE)?.[1] ??
      null;
    // The lease again, as staff come back to it.
    await kit.openLease(page, leaseId, "?step=ask-owner");
    await page.waitForTimeout(2000);
    const leaseText = await shownText(page.locator("div.page").first());
    const leaseScheduled = [
      ...leaseText.matchAll(
        /Scheduled for (\d{2}\/\d{2}\/\d{4}, \d{1,2}:\d{2} (?:AM|PM) (?:CST|CDT))/g,
      ),
    ].map((match) => match[1]);
    const leaseShapes = otherDateShapes(leaseText);
    // Documents: the current facts' time, an instant in standard time today.
    await kit.openLease(page, leaseId, "?step=documents");
    const forms = page
      .locator('section[aria-label="Form families for this lease"]')
      .first();
    await kit.reveal(page, FORMS_SECTION, 60_000);
    const formsText = await shownText(forms);
    const checkedAt =
      /Current facts checked (\d{2}\/\d{2}\/\d{4}, \d{1,2}:\d{2} (?:AM|PM) (?:CST|CDT))\./.exec(
        formsText,
      )?.[1] ?? null;
    const documentsShapes = otherDateShapes(
      await shownText(page.locator("div.page").first()),
    );
    // Communications: every tab's lines.
    await kit.openPath(page, "/gmail-hub");
    const tabs = page.getByRole("tab");
    await tabs
      .first()
      .waitFor({ timeout: 90_000 })
      .catch(() => undefined);
    const communications = { tabs: [], scheduled: [], instants: [], shapes: [] };
    for (const name of ["Incoming", "Outgoing", "Drafts", "Scheduled"]) {
      const tab = page.getByRole("tab", { name, exact: true });
      if (!(await kit.shownWithin(tab, 10_000))) continue;
      await tab.click();
      await page.waitForTimeout(1500);
      await page
        .getByText("Loading worklist…")
        .waitFor({ state: "hidden", timeout: 60_000 })
        .catch(() => undefined);
      const text = await shownText(page.locator("div.page").first());
      const lines = await page
        .locator('[data-communication-field="next-due"]')
        .allInnerTexts()
        .catch(() => []);
      const cards = await page
        .locator("article.ui-card")
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            heading: (node.querySelector("h2")?.textContent ?? "")
              .replace(/\s+/g, " ")
              .trim(),
            due: (
              node.querySelector('[data-communication-field="next-due"]')?.textContent ??
              ""
            )
              .replace(/\s+/g, " ")
              .trim(),
          })),
        )
        .catch(() => []);
      communications.tabs.push({ name, cards: cards.length });
      for (const card of cards)
        if (card.heading.endsWith(`Lease ${leaseId}`) && card.due)
          communications.scheduled.push(card.due);
      communications.instants.push(
        ...[
          ...text.matchAll(
            /\b\d{2}\/\d{2}\/\d{4}, \d{1,2}:\d{2} (?:AM|PM) (?:CST|CDT)\b/g,
          ),
        ].map((match) => match[0]),
      );
      communications.shapes.push(...otherDateShapes(text));
      communications.lines = [...(communications.lines ?? []), ...lines.map(squash)];
    }
    // The ARCH-S283-1 source check over the listed files, as served.
    const sources = LISTED_DATE_FILES.map((file) => {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      return {
        file,
        direct: DIRECT_FORMATTING.filter((pattern) => pattern.test(source)).map(String),
      };
    });
    const after = await effects(kit, rehearsal);
    return {
      leaseId,
      offered,
      entered,
      dialogShapes,
      confirmed: {
        status: confirmed.status,
        state: confirmed.state,
        alert: confirmed.alert,
      },
      statusAfter,
      leaseScheduled,
      leaseShapes,
      checkedAt,
      documentsShapes,
      communications: {
        tabs: communications.tabs,
        scheduled: [...new Set(communications.scheduled)],
        instants: [...new Set(communications.instants)].slice(0, 12),
        shapes: [...new Set(communications.shapes)].slice(0, 12),
      },
      sources,
      lookups: lookupDelta(before, after),
      sentBefore: before.sent,
      sentAfter: after.sent,
      writes: writesSince(ctx, mark),
    };
  });

  // ---- AC-S283-3: the three pages for internal text, as an Editor ------------------------------
  const wording = await part("internal text as an Editor", async () => {
    const mark = ctx.writes.length;
    const reader = await open("Editor");
    // Live renewal review.
    await kit.openPath(reader, "/lease-renewal/live");
    await reader.locator("div.page").first().waitFor({ timeout: 90_000 });
    await reader.waitForTimeout(1500);
    const liveWords = await pageWords(reader);
    const live = {
      rendered: liveWords.length > 200,
      engineering: liveWords.includes(ENGINEERING_SENTENCE),
      exactNextAction: liveWords.includes("Exact next action"),
    };
    // Documents on two leases.
    const documents = [];
    for (const leaseId of ["9101", "9104"]) {
      await kit.openLease(reader, leaseId, "?step=documents");
      const forms = reader
        .locator('section[aria-label="Form families for this lease"]')
        .first();
      const shown = await kit.reveal(reader, FORMS_SECTION, 60_000);
      const read = shown
        ? await forms.evaluate((node) => {
            const copy = node.cloneNode(true);
            const verification = [
              ...copy.querySelectorAll('[data-renewal-field="packet-fact-verification"]'),
            ];
            const lines = verification.flatMap((element) =>
              [...element.querySelectorAll("li")].map((item) =>
                (item.textContent ?? "").trim(),
              ),
            );
            for (const element of verification) element.remove();
            return {
              outside: (copy.textContent ?? "").replace(/\s+/g, " ").trim(),
              verificationLines: lines,
              verificationShown: verification.length,
            };
          })
        : null;
      const keys = [
        ...new Set(
          (read?.verificationLines ?? []).flatMap(
            (line) => line.match(/\b[a-z][a-z_]*\.[a-z][a-z0-9_.]*\b/g) ?? [],
          ),
        ),
      ];
      const rawOutside = [
        ...new Set([
          ...keys.filter((key) => read?.outside.includes(key)),
          ...((read?.outside ?? "").match(
            /\b(?:property|management|lease|unit|tenant|tenants|owner|owners|portfolio|terms|renewal|packet|animals|household)\.[a-z][a-z0-9_]*\b/g,
          ) ?? []),
        ]),
      ];
      documents.push({
        leaseId,
        shown,
        verificationShown: read?.verificationShown ?? 0,
        keys: keys.length,
        rawOutside,
      });
    }
    // The process forms: create on Processes, and edit on a definition.
    await kit.openPath(reader, "/processes");
    await reader
      .getByRole("heading", { name: "Create Process" })
      .waitFor({ timeout: 90_000 });
    const createWords = await pageWords(reader);
    const create = {
      ownerLabel: await reader.getByLabel(RUN_OWNER_LABEL, { exact: true }).count(),
      approverLabel: await reader.getByLabel(APPROVER_LABEL, { exact: true }).count(),
      hints: (createWords.match(new RegExp(PEOPLE_AND_ACCESS, "g")) ?? []).length,
      uid: /Owner UID|Approver UID/.test(createWords),
    };
    await harness({
      op: "seed",
      definitionId: OTHER_SPACE.definition,
      staff: "placeholder",
    });
    await kit.openPath(reader, `/processes/${OTHER_SPACE.definition}`);
    await reader.locator("div.page").first().waitFor({ timeout: 90_000 });
    await reader.waitForTimeout(1500);
    const editWords = await pageWords(reader);
    const edit = {
      ownerLabel: editWords.includes(RUN_OWNER_LABEL),
      approverLabel: editWords.includes(APPROVER_LABEL),
      hints: (editWords.match(new RegExp(PEOPLE_AND_ACCESS, "g")) ?? []).length,
      uid: /Owner UID|Approver UID/.test(editWords),
    };
    // Where the hint sends an Admin: People and access names each staff record's account ID.
    const admin = await open("Admin");
    await kit.openPath(admin, "/admin?task=people");
    await admin.locator("div.page").first().waitFor({ timeout: 90_000 });
    await admin.waitForTimeout(1500);
    const accountIds = (
      (await pageWords(admin)).match(/Account ID [A-Za-z0-9_-]+/g) ?? []
    ).length;
    return { live, documents, create, edit, accountIds, writes: writesSince(ctx, mark) };
  });

  // ---- AC-S283-5: the notice basis line, the route and the Admin change ---------------------
  const basis = await part("notice basis", async () => {
    const editor = await open("Editor");
    const approver = await open("Approver");
    const admin = await open("Admin");
    await kit.openPath(editor, DESK);
    await kit.openPath(approver, DESK);
    await kit.openPath(admin, DESK);
    const initial = await basisRead(kit, editor);
    const lines = {
      Editor: await readBasisLine(kit, editor, "9101"),
      Approver: await readBasisLine(kit, approver, "9101"),
      Admin: await readBasisLine(kit, admin, "9101"),
    };
    const reads = {
      Editor: await basisRead(kit, editor),
      Approver: await basisRead(kit, approver),
      Admin: await basisRead(kit, admin),
    };
    // A direct request from an Editor and an Approver: refused, nothing written.
    const expectedVersion = initial.version ?? 0;
    const decisionId = "notice-basis/2026-10-02/q2";
    const refusals = {};
    for (const [role, rolePage] of [
      ["Editor", editor],
      ["Approver", approver],
    ])
      refusals[role] = await requestBasisSelection(rolePage, {
        decisionId,
        expectedVersion,
        operationId: randomUUID(),
      });
    const afterRefusals = await basisRead(kit, admin);
    // A slow lease load: the line is never above the step.
    const slowPage = await open("Editor");
    const slow = await slowLoadRenders(kit, slowPage, "9102");
    // The Admin follows "Change in Admin" and selects the documented basis once.
    const changeLink = admin
      .locator('section[aria-label="Notice timing basis"]')
      .getByRole("link", { name: CHANGE_IN_ADMIN, exact: true })
      .first();
    let followed = null;
    if (await kit.shownWithin(changeLink, 10_000)) {
      await changeLink.click();
      await admin.waitForURL((url) => url.pathname === BASIS_ADMIN_PATH, {
        timeout: 120_000,
      });
      followed =
        new URL(admin.url()).pathname +
        new URL(admin.url()).search +
        new URL(admin.url()).hash;
    } else {
      await kit.openPath(admin, "/admin?task=renewal#admin-move-out-timing-basis");
    }
    const panel = admin.locator("#admin-move-out-timing-basis").first();
    await panel.waitFor({ timeout: 90_000 });
    const select = panel.getByLabel("Documented notice basis");
    await select.waitFor({ timeout: 60_000 });
    const options = await select
      .locator("option")
      .evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));
    let selection = null;
    if (initial.state !== "saved" && options.length) {
      const saved = kit.appResponse(admin, BASIS_ROUTE, {
        method: "PATCH",
        timeout: 90_000,
      });
      await select.selectOption(options[0]);
      const response = await saved.catch(() => null);
      await admin
        .locator('[data-notice-basis-selection-state="saved"]')
        .first()
        .waitFor({ timeout: 60_000 })
        .catch(() => undefined);
      selection = {
        http: response?.status() ?? null,
        state: await admin
          .locator("[data-notice-basis-selection-state]")
          .first()
          .getAttribute("data-notice-basis-selection-state"),
        message: squash(
          await panel
            .locator('[role="status"]')
            .allInnerTexts()
            .then((texts) => texts.join(" "))
            .catch(() => ""),
        ),
        versionLine:
          /Current saved version (\d+)/.exec(await shownText(panel))?.[1] ?? null,
      };
    }
    const afterSelection = await basisRead(kit, admin);
    // A stale version from the Admin: refused, nothing written.
    const stale = await requestBasisSelection(admin, {
      decisionId,
      expectedVersion,
      operationId: randomUUID(),
    });
    const afterStale = await basisRead(kit, admin);
    // Every lease reads the new line.
    const leases = [];
    for (const leaseId of ["9101", "9102", "9104"])
      leases.push(await readBasisLine(kit, editor, leaseId));
    const adminAfter = await readBasisLine(kit, admin, "9101");
    return {
      initial,
      lines,
      reads,
      refusals,
      afterRefusals,
      slow,
      followed,
      options: options.length,
      selection,
      afterSelection,
      stale,
      afterStale,
      leases,
      adminAfter,
    };
  });

  // ---- AC-S283-7: Connections, the bulk actions, Help and the control map --------------------
  const controls = await part("connections and bulk actions", async () => {
    // The bulk actions show only beside queue items, and nothing in the rehearsal creates one
    // (process submission is retired; no maintenance or external action proposal runs here). One
    // named synthetic item, assigned to the Editor with the Approver as its approver (an Admin
    // sees every item), is written to the rehearsal's emulator for the read. It is never acted on.
    const fixture = await queueItemFixture(kit);
    const mark = ctx.writes.length;
    const roles = {};
    for (const role of ["Editor", "Approver", "Admin"]) {
      const rolePage = await open(role);
      await kit.openPath(rolePage, "/connections");
      const cards = rolePage.locator("details.connection-service");
      await cards.first().waitFor({ timeout: 90_000 });
      const all = await cards.evaluateAll((nodes) =>
        nodes.map((node) =>
          (node.querySelector("summary strong")?.textContent ?? "").trim(),
        ),
      );
      const quickbooks = cards
        .filter({ has: rolePage.locator("summary strong", { hasText: /^QuickBooks$/ }) })
        .first();
      await kit.openDisclosure(quickbooks);
      await rolePage.waitForTimeout(500);
      const quickbooksRead = {
        text: await shownText(quickbooks),
        buttons: await quickbooks
          .locator("button, a.button, summary")
          .evaluateAll((nodes) =>
            nodes
              .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
              .filter(
                (name) =>
                  /connect|set up|sign in/i.test(name) && !/^QuickBooks/.test(name),
              ),
          ),
      };
      // Every other card still opens with its own controls.
      const others = [];
      for (const [index, name] of all.entries()) {
        if (!name || name === "QuickBooks") continue;
        const card = cards.nth(index);
        await kit.openDisclosure(card).catch(() => undefined);
        others.push({
          name,
          controls: await card
            .evaluate(
              (node) =>
                [...node.querySelectorAll("button, select, input, summary")].filter(
                  (control) => control.parentElement !== node,
                ).length,
            )
            .catch(() => 0),
        });
      }
      await kit.openPath(rolePage, "/approval-queue");
      await rolePage.locator("div.page").first().waitFor({ timeout: 90_000 });
      const otherViews = rolePage.locator("details").filter({
        has: rolePage.locator("summary", { hasText: "Other views" }),
      });
      await kit.openDisclosure(otherViews);
      await otherViews.getByRole("tab", { name: "All items", exact: true }).click();
      const bulk = otherViews.getByRole("region", { name: "Bulk actions", exact: true });
      const bulkShown = await kit.shownWithin(bulk, 30_000);
      const bulkRead = bulkShown
        ? {
            options: await bulk
              .locator("select")
              .first()
              .locator("option")
              .evaluateAll((nodes) =>
                nodes.map((node) => (node.textContent ?? "").trim()),
              ),
            execute: /Execute/.test(await shownText(bulk)),
          }
        : null;
      const queueEmpty = bulkShown
        ? null
        : squash(await shownText(rolePage.locator("div.page").first())).slice(0, 200);
      roles[role] = {
        cards: all.length,
        quickbooks: quickbooksRead,
        others,
        bulk: bulkRead,
        queueEmpty,
      };
    }
    // Help and the control map.
    const help = [];
    const reader = await open("Editor");
    for (const path of [
      "/help/reference/connections",
      "/help/reference/approval-queue",
    ]) {
      await kit.openPath(reader, path);
      await reader.locator("h1").first().waitFor({ timeout: 90_000 });
      const words = await pageWords(reader);
      help.push({
        path,
        quickbooks: words.includes("QuickBooks"),
        quickbooksConnect:
          /(?:Connect|Set up) QuickBooks|QuickBooks[^.]{0,60}\b(?:Connect button|Connect control|connects)\b/.test(
            words,
          ),
        bulkExecute: /Bulk[^.]{0,200}\bExecute\b|\bExecute\b[^.]{0,80}\bbulk\b/i.test(
          words,
        ),
      });
    }
    const mapFiles = [
      "lib/help/content/renewal-control-map.json",
      "lib/help/renewal-controls.ts",
    ];
    const controlMap = mapFiles.map((file) => {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      return {
        file,
        quickbooksConnect:
          /QuickBooks[^\n]{0,80}Connect|Connect[^\n]{0,80}QuickBooks/i.test(source),
        bulkExecute: /bulk[^\n]{0,80}Execute|Execute[^\n]{0,80}bulk/i.test(source),
      };
    });
    return { fixture, roles, help, controlMap, writes: writesSince(ctx, mark) };
  });

  // ---- AC-S283-8: the steps on each path, and a default in Documents ----------------------------
  const paths = await part("path steps and defaults", async () => {
    const reader = await open("Editor");
    const variants = [
      {
        kind: "standing agreement",
        leaseId: "9102",
        unused: "ask-owner",
        line: STANDING_LINE,
      },
      {
        kind: "housing assistance",
        leaseId: "9103",
        unused: "compare-market",
        line: ASSISTED_LINE,
      },
      { kind: "month-to-month", leaseId: "9135", unused: null, line: null },
      { kind: "move-out notice", leaseId: "9138", unused: "offer-tenant", line: null },
    ];
    const reads = [];
    for (const variant of variants) {
      await kit.openLease(reader, variant.leaseId);
      await reader.waitForTimeout(1000);
      const strip = await reader
        .locator('nav[aria-label="Renewal path"] li[data-renewal-path-step]')
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            id: node.getAttribute("data-renewal-path-step"),
            state: node.getAttribute("data-renewal-path-state"),
          })),
        );
      const pathLine = squash(
        await reader
          .locator('[data-renewal-field="path-line"]')
          .first()
          .innerText()
          .catch(() => ""),
      );
      const words = await pageWords(reader);
      const heading = squash(
        await reader
          .locator("#renewal-now-heading")
          .first()
          .innerText()
          .catch(() => ""),
      );
      const unused =
        variant.unused ??
        ["compare-market", "ask-owner", "offer-tenant", "documents"].find(
          (id) => !strip.some((step) => step.id === id),
        ) ??
        null;
      let link = null;
      if (unused) {
        await kit.openLease(reader, variant.leaseId, `?step=${unused}`);
        await reader.waitForTimeout(1000);
        link = {
          step: unused,
          line: squash(
            await reader
              .locator('[data-renewal-field="unused-step-link"]')
              .first()
              .innerText()
              .catch(() => ""),
          ),
          heading: squash(
            await reader
              .locator("#renewal-now-heading")
              .first()
              .innerText()
              .catch(() => ""),
          ),
        };
      }
      reads.push({
        ...variant,
        strip,
        pathLine,
        heading,
        retiredChip: words.includes(RETIRED_CHIP) || words.includes(RETIRED_CHIP_CURLY),
        link,
      });
    }
    // A default in Documents and in the process readiness view.
    await kit.openLease(reader, "9101", "?step=documents");
    const forms = reader
      .locator('section[aria-label="Form families for this lease"]')
      .first();
    await kit.reveal(reader, FORMS_SECTION, 60_000);
    const formRows = await forms
      .locator("tbody tr")
      .evaluateAll((nodes) =>
        nodes.map((node) =>
          (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 400),
        ),
      )
      .catch(() => []);
    const documentsWords = await pageWords(reader);
    await kit.openPath(reader, "/lease-renewal/readiness");
    await reader.locator("div.page").first().waitFor({ timeout: 90_000 });
    await reader.waitForTimeout(1500);
    const readinessWords = await pageWords(reader);
    const admin = await open("Admin");
    await kit.openPath(admin, "/admin?task=renewal#admin-renewal-packet-policy");
    await admin
      .locator("#admin-renewal-packet-policy")
      .first()
      .waitFor({ timeout: 90_000 });
    await admin.waitForTimeout(1500);
    const adminWords = await pageWords(admin);
    return {
      reads,
      documents: {
        needsVerificationRows: formRows.filter((row) => row.includes(NEEDS_VERIFICATION))
          .length,
        rows: formRows.length,
        heldRows: formRows
          .filter((row) => row.includes(NEEDS_VERIFICATION))
          .filter((row) => /\bHeld\b|\bBlocked\b|\bholds?\b/i.test(row)).length,
        engineering: documentsWords.includes(ENGINEERING_DEFAULT),
        retiredChip:
          documentsWords.includes(RETIRED_CHIP) ||
          documentsWords.includes(RETIRED_CHIP_CURLY),
      },
      readiness: {
        needsVerification: (
          readinessWords.match(
            new RegExp(NEEDS_VERIFICATION.replace(/[.]/g, "\\."), "g"),
          ) ?? []
        ).length,
        engineering: readinessWords.includes(ENGINEERING_DEFAULT),
      },
      adminHint: adminWords.includes(ADMIN_FIELD_HINT),
    };
  });

  // ---- AC-S283-4: Start run once on a Space that still runs, and a refusal with its reason -----
  const runs = await part("start run on Move-In", async () => {
    const starter = await open("Editor");
    // The definition with placeholder staff (seeded above for the edit form): a refused start.
    await harness({
      op: "seed",
      definitionId: OTHER_SPACE.definition,
      staff: "placeholder",
    }).catch(() => undefined);
    const runsBefore = (await effects(kit, rehearsal)).runs;
    await kit.openPath(starter, `/spaces/${OTHER_SPACE.space}`);
    const button = starter
      .getByRole("button", { name: "Start run", exact: true })
      .first();
    const shownRefusal = await kit.shownWithin(button, 90_000);
    let refusal = null;
    if (shownRefusal) {
      const answer = kit.appResponse(
        starter,
        `/api/process-definitions/${OTHER_SPACE.definition}/runs`,
        { timeout: 90_000 },
      );
      await button.click();
      const response = await answer.catch(() => null);
      await starter.waitForTimeout(1000);
      refusal = {
        http: response?.status() ?? null,
        text: squash(
          await starter
            .locator("p.form-error")
            .first()
            .innerText()
            .catch(() => ""),
        ),
      };
    }
    const runsAfterRefusal = (await effects(kit, rehearsal)).runs;
    // Real staff recorded: a double click starts one run.
    const recorded = await harness({
      op: "record-staff",
      definitionId: OTHER_SPACE.definition,
    });
    await kit.openPath(starter, `/spaces/${OTHER_SPACE.space}`);
    const startButton = starter
      .getByRole("button", { name: "Start run", exact: true })
      .first();
    const shown = await kit.shownWithin(startButton, 90_000);
    const requests = [];
    const listen = (request) => {
      if (request.method() !== "POST") return;
      if (
        new URL(request.url()).pathname !==
        `/api/process-definitions/${OTHER_SPACE.definition}/runs`
      )
        return;
      try {
        requests.push(request.postDataJSON() ?? {});
      } catch {
        requests.push({});
      }
    };
    starter.on("request", listen);
    let answers = [];
    if (shown) {
      const first = kit.appResponse(
        starter,
        `/api/process-definitions/${OTHER_SPACE.definition}/runs`,
        { timeout: 90_000 },
      );
      await startButton.dblclick();
      const response = await first.catch(() => null);
      answers.push({
        http: response?.status() ?? null,
        body: await response?.json().catch(() => null),
      });
      await starter.waitForTimeout(3000);
    }
    starter.off("request", listen);
    const checklist = await kit.shownWithin(
      starter.getByRole("button", { name: "Check", exact: true }).first(),
      60_000,
    );
    const runsAfterStart = (await effects(kit, rehearsal)).runs;
    const created = runsAfterStart.filter((id) => !runsAfterRefusal.includes(id));
    // The same key once more, by hand: the same run, nothing new.
    const key = requests[0]?.start_key ?? null;
    const replay = key
      ? await requestRunStart(starter, OTHER_SPACE.definition, {
          ...(requests[0]?.expected_revision
            ? { expected_revision: requests[0].expected_revision }
            : {}),
          start_key: key,
        })
      : null;
    const runsAfterReplay = (await effects(kit, rehearsal)).runs;
    const createdRun = created[0]
      ? fieldsOf(await kit.readDocument(`workflow_runs/${created[0]}`))
      : null;
    return {
      runsBefore: runsBefore.length,
      shownRefusal,
      refusal,
      runsAfterRefusal: runsAfterRefusal.length,
      recorded: { status: recorded?.status ?? null },
      shown,
      requests: requests.map((request) => ({
        key: Boolean(request.start_key),
        sameKey: request.start_key === key,
      })),
      answers: answers.map((answer) => ({
        http: answer.http,
        runId: answer.body?.run?.id ?? answer.body?.id ?? null,
      })),
      checklist,
      created,
      storedKey: createdRun ? createdRun.start_key === key : null,
      replay,
      runsAfterReplay: runsAfterReplay.length,
      runsAfterStart: runsAfterStart.length,
    };
  });

  const effectsAtEnd = await part("effects at the end", () => effects(kit, rehearsal));
  ctx.record({ failedParts: failures });

  // ================================ Verdicts ================================================

  // AC-S283-1: settled dates and instants, both zones, native inputs, no other shape, source check.
  const ac1 = (() => {
    if (!dates) return false;
    const scheduledLease = dates.statusAfter;
    const daylight = (value) => SETTLED_INSTANT.exec(value ?? "")?.[7] === "CDT";
    const standard = (value) => SETTLED_INSTANT.exec(value ?? "")?.[7] === "CST";
    const expected = `${DAYLIGHT_DATE.slice(5, 7)}/${DAYLIGHT_DATE.slice(8, 10)}/${DAYLIGHT_DATE.slice(0, 4)}, 9:00 AM CDT`;
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(dates.offered.date ?? "") &&
      /^\d{2}:\d{2}$/.test(dates.offered.time ?? "") &&
      dates.entered.date === DAYLIGHT_DATE &&
      dates.entered.time === DAYLIGHT_TIME &&
      dates.confirmed.status === 200 &&
      scheduledLease === expected &&
      daylight(scheduledLease) &&
      dates.communications.scheduled.some(
        (line) => SCHEDULED_ROW.exec(line)?.[1] === expected,
      ) &&
      standard(dates.checkedAt) &&
      dates.communications.instants.every((value) => SETTLED_INSTANT.test(value)) &&
      dates.leaseShapes.length === 0 &&
      dates.documentsShapes.length === 0 &&
      dates.communications.shapes.length === 0 &&
      dates.sources.every((source) => source.direct.length === 0)
    );
  })();

  // AC-S283-2: the shown leases only, the button and line first, the stop at the allowance.
  const ac2 = (() => {
    if (!observedStart || !deskReads || !allowanceRun || !probes) return false;
    const total = monthTargets.length;
    // The starting sequence: the Working batch search, its button, line, posts and lookups.
    const startShown = observedStart.shownTargets ?? [];
    const startLine = parseLine(observedStart.scopeLine);
    const startLookups = sum(Object.values(observedStart.lookupsByLease ?? {}));
    const startOk =
      Boolean(observedStart.workingBatchSearch) &&
      observedStart.monthlyLeases ===
        DECEMBER_TARGETS.length + DECEMBER_CARRYOVERS.length &&
      observedStart.rowsShownAfterSearch === 5 &&
      sameSet(monthTargets, DECEMBER_TARGETS) &&
      sameSet(
        deskReads.rows
          .filter((row) => row.group === "carried_over")
          .map((row) => row.leaseId),
        DECEMBER_CARRYOVERS,
      ) &&
      sameSet(startShown, DECEMBER_SAMPLE_TARGETS) &&
      observedStart.monthTargets === total &&
      buttonStates(
        { button: observedStart.prepareButton, month: deskReads.unfiltered.month },
        startShown.length,
        total,
      ) &&
      startLine !== null &&
      startLine.shown === startShown.length &&
      startLine.need !== null &&
      startLine.need + startLine.have === startShown.length &&
      startLine.need === startLookups &&
      sameSet([...new Set(observedStart.postedLeases ?? [])], startShown) &&
      (observedStart.postedLeases ?? []).length === startShown.length &&
      Object.keys(observedStart.lookupsByLease ?? {}).every((leaseId) =>
        startShown.includes(leaseId),
      );
    // Reading, searching, a count group, another month and a tag: the counts, and nothing starts.
    const unfiltered = deskReads.unfiltered;
    const readsOk =
      buttonStates(unfiltered, total, total) &&
      parseLine(unfiltered.line)?.shown === total &&
      unfiltered.targets === total &&
      buttonStates(deskReads.searched, deskReads.searchedTargets.length, total) &&
      sameSet(deskReads.searchedTargets, startShown) &&
      deskReads.grouped.targets === 0 &&
      deskReads.grouped.disabled === true &&
      buttonStates(deskReads.grouped, 0, total) &&
      deskReads.nextMonth.month !== unfiltered.month &&
      deskReads.backAgain.month === unfiltered.month &&
      Object.keys(deskReads.lookups).length === 0 &&
      deskReads.preparationPosts === 0;
    // The tag filter run: only the tagged lease(s) shown were posted.
    const tagOk =
      tagRun &&
      !tagRun.skipped &&
      tagRun.shown.length > 0 &&
      tagRun.shown.length < total &&
      buttonStates(tagRun.read, tagRun.shown.length, total) &&
      sameSet([...new Set(tagRun.posted)], tagRun.shown) &&
      tagRun.posted.length === tagRun.shown.length &&
      tagRun.finished.dialogs === 0;
    // By hand: another month's lease and ineligible leases are refused, with no lookup.
    const probesOk =
      probes.answers.length >= 2 &&
      probes.answers.some((answer) => answer.kind === "another month") &&
      probes.answers.every(
        (answer) =>
          answer.status === "refused" && answer.http >= 400 && answer.http < 500,
      ) &&
      Object.keys(probes.lookups).length === 0;
    // The unfiltered run: the whole month as its targets, the filter changed mid-run without a
    // new target, the allowance reached part way through, posting stopped and the rest listed.
    const run = allowanceRun;
    const reachedAt = run.answers.findIndex(
      (answer) => answer.status === "allowance_reached",
    );
    const reachedLease = reachedAt >= 0 ? run.answers[reachedAt].leaseId : null;
    const reachedIndex = reachedLease ? run.snapshot.indexOf(reachedLease) : -1;
    const rest = reachedIndex >= 0 ? run.snapshot.slice(reachedIndex + 1) : [];
    const notRun = run.outcomes.filter((outcome) => outcome.status === "not_run");
    const hidden = run.snapshot.filter((leaseId) => !run.shownMidRun.includes(leaseId));
    const runOk =
      run.heldInTime &&
      run.heldLease === run.snapshot[0] &&
      run.read.month === deskReads.nextMonth.month &&
      run.read.month !== unfiltered.month &&
      buttonStates(run.read, JANUARY_TARGETS.length, JANUARY_TARGETS.length) &&
      sameSet(run.snapshot, JANUARY_TARGETS) &&
      sameSet(run.needing, JANUARY_TARGETS) &&
      sameSet(run.shownMidRun, [JANUARY_AVE_TARGET]) &&
      sameSet(run.postMonths, [run.read.month]) &&
      reachedIndex === 1 &&
      sum(Object.values(run.lookupsToStop)) === 1 &&
      run.lookupsToStop[run.snapshot[0]] === 1 &&
      sameSet(run.posts, run.snapshot.slice(0, reachedIndex + 1)) &&
      run.posts.length === reachedIndex + 1 &&
      rest.length > 0 &&
      notRun.length === rest.length &&
      notRun.every((outcome) => outcome.text.endsWith(NOT_RUN_MESSAGE)) &&
      run.outcomes.length === run.snapshot.length &&
      new RegExp(
        `The monthly allowance is reached, so ${rest.length} leases? (?:was|were) not run\\.`,
      ).test(run.progress) &&
      hidden.length > 0 &&
      hidden.some((leaseId) => run.posts.includes(leaseId)) &&
      run.dialogs === 0;
    const atAllowance = parseLine(run.atAllowance.line);
    const allowanceLineOk =
      atAllowance !== null &&
      atAllowance.left === 0 &&
      atAllowance.need !== null &&
      atAllowance.need > 0 &&
      atAllowance.covers === 0 &&
      atAllowance.needed === atAllowance.need;
    // Continue: the same run's unsettled targets only, then the whole month is prepared.
    const unsettled = [reachedLease, ...rest];
    const continueOk =
      /^Continue [A-Z][a-z]+ \d{4} preparation$/.test(run.continueName) &&
      sameSet(run.continueMonths, [run.read.month]) &&
      sameSet(run.continuePosts, unsettled) &&
      run.continuePosts.length === unsettled.length &&
      run.continueAnswers.every((answer) =>
        [
          "prepared",
          "reused",
          "covered",
          "held_back",
          "no_usable",
          "already_claimed",
        ].includes(answer.status),
      ) &&
      parseLine(run.finalRead.line)?.need === 0;
    ctx.record({
      verdict: "AC-S283-2",
      startOk,
      readsOk,
      tagOk: Boolean(tagOk),
      probesOk,
      runOk,
      allowanceLineOk,
      continueOk,
    });
    return (
      startOk &&
      readsOk &&
      Boolean(tagOk) &&
      probesOk &&
      runOk &&
      allowanceLineOk &&
      continueOk
    );
  })();

  // AC-S283-3: no engineering sentence, no raw key outside Verification, no "Owner UID".
  const ac3 = (() => {
    if (!wording) return false;
    return (
      wording.live.rendered &&
      !wording.live.engineering &&
      !wording.live.exactNextAction &&
      wording.documents.length === 2 &&
      wording.documents.every((read) => read.shown && read.rawOutside.length === 0) &&
      wording.documents.some((read) => read.verificationShown > 0 && read.keys > 0) &&
      wording.create.ownerLabel === 1 &&
      wording.create.approverLabel === 1 &&
      wording.create.hints >= 2 &&
      !wording.create.uid &&
      wording.edit.ownerLabel &&
      wording.edit.approverLabel &&
      wording.edit.hints >= 2 &&
      !wording.edit.uid &&
      wording.accountIds > 0
    );
  })();

  // AC-S283-4: a double click starts one run; the same key returns the same run; a refusal says why.
  const ac4 = (() => {
    if (!runs) return false;
    return (
      runs.shownRefusal &&
      runs.refusal?.http >= 400 &&
      runs.refusal.text === PLACEHOLDER_REFUSAL &&
      runs.runsAfterRefusal === runs.runsBefore &&
      runs.shown &&
      runs.requests.length === 1 &&
      runs.requests[0].key &&
      runs.created.length === 1 &&
      runs.checklist &&
      runs.storedKey === true &&
      runs.replay?.http >= 200 &&
      runs.replay.http < 300 &&
      runs.replay.runId === runs.created[0] &&
      runs.runsAfterReplay === runs.runsAfterStart
    );
  })();

  // AC-S283-5: the read-only line for every role, the refused route, the Admin change, the order.
  const ac5 = (() => {
    if (!basis) return false;
    const readOnly = (line) =>
      line.controls === 0 && line.changeLinks.length === 0 && line.pageSelectors === 0;
    const notSetFirst = basis.initial.state === "missing";
    const firstLineOk = notSetFirst
      ? ["Editor", "Approver", "Admin"].every((role) =>
          basis.lines[role].text.startsWith(BASIS_NOT_SET),
        )
      : false;
    const savedLine = (line) => BASIS_SAVED.test(line.text);
    return (
      firstLineOk &&
      readOnly(basis.lines.Editor) &&
      readOnly(basis.lines.Approver) &&
      basis.lines.Admin.changeLinks.length === 1 &&
      basis.lines.Admin.changeLinks[0] ===
        "/admin?task=renewal#admin-move-out-timing-basis" &&
      basis.lines.Admin.pageSelectors === 0 &&
      !basis.reads.Editor.canSelect &&
      !basis.reads.Approver.canSelect &&
      basis.reads.Admin.canSelect &&
      basis.refusals.Editor.http === 403 &&
      basis.refusals.Approver.http === 403 &&
      basis.afterRefusals.state === basis.initial.state &&
      basis.afterRefusals.version === basis.initial.version &&
      basis.slow.slowedReads > 0 &&
      basis.slow.rendersWithLine > 0 &&
      basis.slow.lineAboveStep === 0 &&
      basis.followed?.startsWith("/admin?task=renewal") &&
      basis.selection?.http === 200 &&
      basis.selection.state === "saved" &&
      basis.afterSelection.state === "saved" &&
      basis.afterSelection.version === (basis.initial.version ?? 0) + 1 &&
      basis.selection.versionLine === String(basis.afterSelection.version) &&
      basis.stale.http === 409 &&
      basis.afterStale.version === basis.afterSelection.version &&
      basis.leases.length === 3 &&
      basis.leases.every((line) => savedLine(line) && readOnly(line)) &&
      savedLine(basis.adminAfter) &&
      basis.adminAfter.changeLinks.length === 1
    );
  })();

  // AC-S283-6: nothing paid, sent, run or written by reading; lookups only after a click.
  const ac6 = (() => {
    if (
      !effectsAtStart ||
      !effectsAtEnd ||
      !deskReads ||
      !dates ||
      !wording ||
      !controls ||
      !basis ||
      !tagRun ||
      !allowanceRun
    )
      return false;
    const readOnlyWrites = [
      ...deskReads.writes,
      ...wording.writes,
      ...controls.writes,
    ].filter((path) => !["/api/personal-view", "/api/auth/demo"].includes(path));
    const clickLookups =
      sum(Object.values(allowanceRun?.lookupsToStop ?? {})) +
      sum(Object.values(allowanceRun?.lookupsInContinue ?? {}));
    const totalLookups =
      effectsAtEnd.lookupTotal - allowanceRun.effectsAtStart.lookupTotal;
    return (
      Object.keys(deskReads.lookups).length === 0 &&
      deskReads.preparationPosts === 0 &&
      deskReads.sentAfter === deskReads.sentBefore &&
      readOnlyWrites.length === 0 &&
      Object.keys(dates.lookups).length === 0 &&
      Object.keys(probes?.lookups ?? { x: 1 }).length === 0 &&
      totalLookups === clickLookups &&
      effectsAtEnd.sent === allowanceRun.effectsAtStart.sent &&
      effectsAtEnd.refused === effectsAtStart.refused &&
      (runs
        ? effectsAtEnd.runs.length - allowanceRun.effectsAtStart.runs.length ===
          runs.created.length
        : false)
    );
  })();

  // AC-S283-7: QuickBooks with its state and no connect action, no bulk Execute, Help and the map.
  const ac7 = (() => {
    if (!controls) return false;
    const roles = Object.values(controls.roles);
    return (
      roles.length === 3 &&
      roles.every(
        (role) =>
          role.quickbooks.text.includes("Not connected") &&
          role.quickbooks.text.includes(QUICKBOOKS_STATE) &&
          role.quickbooks.buttons.length === 0 &&
          role.bulk !== null &&
          JSON.stringify(role.bulk.options) === JSON.stringify(BULK_OPTIONS) &&
          !role.bulk.execute,
      ) &&
      controls.roles.Admin.others.some((card) => card.controls > 0) &&
      controls.help.every((page) => !page.quickbooksConnect && !page.bulkExecute) &&
      controls.help.some((page) => page.quickbooks) &&
      controls.controlMap.every((file) => !file.quickbooksConnect && !file.bulkExecute)
    );
  })();

  // AC-S283-8: only the applicable steps, the path line, the unused-step link, Needs Verification.
  const ac8 = (() => {
    if (!paths) return false;
    const read = (kind) => paths.reads.find((entry) => entry.kind === kind);
    const applicable = (entry) =>
      entry.strip.length > 0 &&
      entry.strip.every((step) => !["not_part", "covered"].includes(step.state)) &&
      !entry.retiredChip;
    const standing = read("standing agreement");
    const assisted = read("housing assistance");
    const monthly = read("month-to-month");
    const notice = read("move-out notice");
    const linkOk = (entry) =>
      entry.link === null ||
      (entry.link.line === UNUSED_STEP_LINE && entry.link.heading === entry.heading);
    // A standard step absent from the strip is named by the path line.
    const standard = [
      "check-numbers",
      "compare-market",
      "ask-owner",
      "offer-tenant",
      "documents",
    ];
    const explained = (entry) =>
      standard.every((id) => entry.strip.some((step) => step.id === id)) ||
      entry.pathLine.length > 0;
    return (
      [standing, assisted, monthly, notice].every(
        (entry) => entry && applicable(entry) && linkOk(entry) && explained(entry),
      ) &&
      !standing.strip.some((step) => step.id === "ask-owner") &&
      standing.pathLine.includes(STANDING_LINE) &&
      standing.link !== null &&
      assisted.pathLine.includes(ASSISTED_LINE) &&
      assisted.link !== null &&
      notice.pathLine.length > 0 &&
      notice.link !== null &&
      paths.documents.needsVerificationRows > 0 &&
      !paths.documents.engineering &&
      !paths.documents.retiredChip &&
      paths.readiness.needsVerification > 0 &&
      !paths.readiness.engineering &&
      paths.adminHint
    );
  })();

  return {
    "AC-S283-1": ac1,
    "AC-S283-2": ac2,
    "AC-S283-3": ac3,
    "AC-S283-4": ac4,
    "AC-S283-5": ac5,
    "AC-S283-6": ac6,
    "AC-S283-7": ac7,
    "AC-S283-8": ac8,
  };
}
