// S284 W12-14, "One place to work a renewal": the candidate-side acceptance checks of S286
// (intake 164) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-spaces-guidance-without-runs.md (S286).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S286-1, AC-S286-2, AC-S286-3, AC-S286-4, AC-S286-5, AC-S286-6
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Open each renewal Space and its card. Request a run start for each renewal process. Open a
//   seeded earlier run and read My Work. Start a run on another Space.
//
// Starting sequence (journeyW1214 in one-path-november-12-journeys.mjs, the fail-first table):
//   Open the Owner Renewal Outreach Space and click Start run. Read the renewal Space cards. On
//   the baseline: "Could not start a run." and a card that reads "Needs a process". It runs on the
//   candidate unchanged: it seeds the same Draft and opens the same Space, which now offers no
//   Overview view and no Start run, so it records startRunShown false after its own waits.
//
// HOW THIS ROW REACHES EACH STATE. The rehearsal seeds no process definition, and S286 removed
// every staff control that starts a renewal run, so each state comes from the visible control
// where one exists and otherwise from the harness (runProcessHarness in
// scripts/lib/one-path-rehearsal/process-draft-seed.mjs), which writes the rehearsal emulator
// through the served commit's own services:
//   - definitions as production seeds them (placeholder staff; real staff on Move-In), real staff
//     recorded through the definition save service, publication and rollback through the
//     publication services (no route offers a process rollback), a retired status (no service
//     retires a definition), and an earlier renewal run kept from before S286;
//   - staff controls: the Spaces cards, the Space pages and their Open the Renewal Desk link, the
//     definition form's Save (source links, action references and wording, never the run owner or
//     approver), Start run on the Move-In Space, the run page, My Work, Help and a Dashboard
//     question;
//   - refusal probes: a renewal run has no staff control left, so a run start, a step change and an
//     outcome change are each requested from the signed-in page itself, the way the removed
//     controls asked, and must be refused with the staff sentence and change nothing.
// The rehearsal configures every connector, so the rendered cards cannot show a missing
// connection; the connection-first rule is read from the served card-state module over the
// stored definitions (harness "card-states") and recorded as such.
// Raw observations go to ctx.record; nothing here sends, schedules or refreshes a message.
import { standInState } from "../../scripts/lib/one-path-rehearsal/control.mjs";
import { runProcessHarness } from "../../scripts/lib/one-path-rehearsal/process-draft-seed.mjs";
import { plainValue } from "./one-path-november-10-kit.mjs";

/** The three renewal Spaces, their processes, cards and how a card opens its Space. */
const RENEWAL = Object.freeze([
  {
    space: "lease-renewals",
    definition: "lease-renewal",
    card: "Lease Renewals",
    subtitle: "Work leases on the Renewals desk",
    page: "/spaces/lease-renewals",
  },
  {
    space: "owner-renewal-outreach",
    definition: "owner-renewal-outreach",
    card: "Owner Renewal Outreach + Comp Lookup",
    subtitle: "Read how owner outreach is done",
    page: "/spaces/owner-renewal-outreach?tab=process",
  },
  {
    space: "tenant-renewal-notice",
    definition: "tenant-renewal-notice",
    card: "Tenant Renewal Notice + DotLoop Follow-Up",
    subtitle: "Read how the tenant offer and documents are done",
    page: "/spaces/tenant-renewal-notice?tab=process",
  },
]);
const RENEWAL_DEFINITIONS = RENEWAL.map((entry) => entry.definition);
const OTHER_SPACE = { space: "move-in", definition: "move-in", card: "Move-In" };
const EARLIER_RUN = "w1214-earlier-renewal-run";
const ROLES = ["Editor", "Approver", "Admin"];

// The spec's staff sentences and labels (S286 R-S286-1 to R-S286-5).
const START_REFUSAL =
  "Renewal work is done on the Renewal Desk. This process is guidance.";
const RECORD_NOTICE =
  "This run is kept as a record. Renewal work continues on the Renewal Desk.";
const RUN_OWNER_FIELD = "Run owner (staff account ID)";
const DEFAULT_APPROVER_FIELD = "Default approver (staff account ID)";
const FIELD_NOTE = "Not used: this process starts no runs";
const NO_PUBLISHED = "Renewals are worked on the Renewal Desk.";
const GUIDANCE_HEADING = "How this work is done";
const DESK_LINK = "Open the Renewal Desk";
const DESK_PATH = "/lease-renewal/live/desk";
const GUIDANCE_LABEL = "Guidance";
const DESK_LABEL = "Worked on the Renewal Desk";
const NEUTRAL_TONE = "reference";
const SAVED = "Process definition saved.";
const PLACEHOLDER = /placeholder/i;
// Every control a run or checklist offers (SpaceDeskRunPanel, WorkflowRunClient).
const RUN_CONTROL = "^(Start run|Starting…|Check|Skip|Clear|Complete run|Fail run)$";
// Wording the renewal Spaces, their cards and Help carried before S286.
const RUN_WORDING = [
  "Open the owner outreach checklist",
  "Open the tenant offer and documents checklist",
  "Use this page for the process and checklist",
  "Open renewal work",
  "with Start run beside each one",
];
const HELP_PAGES = Object.freeze([
  {
    path: "/help/workflow-runs/outreach-checklist",
    says: [
      "Read a renewal process as guidance",
      "Renewal work is done on the Renewal Desk",
      DESK_LINK,
    ],
  },
  {
    path: "/help/reference/spaces",
    says: [
      "The three renewal cards read Guidance when their process is published and Worked on the Renewal Desk when it is not",
    ],
  },
  { path: "/help/reference/space", says: ["It starts no run and has no checklist."] },
  {
    path: "/help/reference/process-definition",
    says: [FIELD_NOTE, "A renewal process has no Start run."],
  },
]);

const squash = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
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
const sameList = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/**
 * A short form of a part's result for the private notes, which keep 2,000 characters a line:
 * inventories as counts, cards as name, state and tone, and no page text.
 */
function compact(result) {
  return JSON.parse(
    JSON.stringify(result ?? null, (key, value) => {
      if (key === "text") return undefined;
      if (value && typeof value === "object" && Array.isArray(value.versions))
        return {
          runs: value.runs.length,
          renewalRuns: value.renewalRuns.length,
          otherRuns: value.otherRuns.length,
          definitions: value.definitions.length,
          versions: value.versions.length,
        };
      if (key === "cards" && Array.isArray(value))
        return value.map((card) => `${card.name}=${card.state}/${card.tone}`);
      if (
        value &&
        typeof value === "object" &&
        "subtabs" in value &&
        "deskLinks" in value
      )
        return [
          `${value.role ?? "Editor"} ${value.space ?? value.path}:`,
          `guidance=${value.guidance} desk=${value.deskSentence}`,
          `steps=${value.steps.length}${value.storedSteps ? `/${value.storedSteps.length}` : ""}`,
          `sources=${value.sourcesHeading}/${value.sourceLinks}`,
          `links=${value.deskLinks.join("|")}`,
          `controls=${value.controls.buttons.join("|")}/${value.controls.checkboxes}`,
          `tabs=${value.subtabs} runLinks=${value.runLinks} recent=${value.recentRuns}`,
          `inProgress=${value.inProgress} wording=${value.runWording.length}`,
        ].join(" ");
      return value;
    }),
  );
}

// ---- Reads: pages, the emulator and the stand-ins ------------------------------------------

/** The Internal Processes cards and the Anticipated work line, as a staff member reads them. */
async function readCards(kit, page) {
  await kit.openPath(page, "/spaces");
  await page.locator("a.space-card").first().waitFor({ timeout: 90_000 });
  const cards = await page.locator("a.space-card").evaluateAll((nodes) =>
    nodes.map((node) => {
      const pill = node.querySelector(".space-card-state-pill");
      return {
        name: (node.querySelector("h2")?.textContent ?? "").trim(),
        subtitle: (node.querySelector("p.muted")?.textContent ?? "").trim(),
        state: (pill?.textContent ?? "").trim(),
        tone: pill?.getAttribute("data-tone") ?? null,
        href: node.getAttribute("href"),
        text: (node.textContent ?? "").replace(/\s+/g, " ").trim(),
      };
    }),
  );
  const anticipated = squash(
    await page
      .locator('section[aria-label="Anticipated work"]')
      .first()
      .innerText()
      .catch(() => ""),
  );
  return { cards, anticipated };
}

/** The words the page holds, collapsed disclosures included, without framework data scripts. */
function pageWords(page) {
  return page.evaluate(() => {
    const copy = document.body.cloneNode(true);
    for (const node of copy.querySelectorAll("script, style, noscript, template"))
      node.remove();
    return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
  });
}

/**
 * Buttons a run or checklist offers, and checkboxes, anywhere on the page outside the app's top
 * bar (whose notification menu holds the notification-type checkboxes on every page).
 */
function runControls(page) {
  return page.evaluate((pattern) => {
    const control = new RegExp(pattern);
    const content = (node) => !node.closest("header.topbar");
    return {
      buttons: [...document.querySelectorAll("button")]
        .filter(content)
        .map((button) => (button.innerText ?? "").replace(/\s+/g, " ").trim())
        .filter((name) => control.test(name)),
      checkboxes: [...document.querySelectorAll('input[type="checkbox"]')].filter(content)
        .length,
    };
  }, RUN_CONTROL);
}

/** One renewal Space page: the guidance, its link to the desk and any run control. */
async function readSpacePage(kit, page, path) {
  await kit.openPath(page, path);
  const guidance = page
    .locator('section[aria-labelledby="renewal-guidance-heading"]')
    .first();
  const shown = await kit.shownWithin(guidance, 90_000);
  const text = shown ? squash(await guidance.innerText()) : "";
  const pageText = await pageWords(page);
  const url = new URL(page.url());
  return {
    path,
    landed: url.pathname + url.search,
    guidance: shown,
    heading: shown ? squash(await guidance.locator("h2").first().innerText()) : null,
    deskSentence: text.includes(NO_PUBLISHED),
    steps: shown ? await guidance.locator("ol > li > strong").allInnerTexts() : [],
    sourcesHeading: shown
      ? await guidance.locator("h3", { hasText: "Sources" }).count()
      : 0,
    sourceLinks: shown ? await guidance.locator("ul a[href]").count() : 0,
    deskLinks: await page
      .getByRole("link", { name: DESK_LINK, exact: true })
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href"))),
    controls: await runControls(page),
    subtabs: await page.locator('nav[aria-label="Space views"]').count(),
    runLinks: await page.locator('a[href*="/workflow-runs/"]').count(),
    recentRuns: (await page.getByText("Recent runs", { exact: true }).count()) > 0,
    inProgress: pageText.includes("In Progress"),
    runWording: RUN_WORDING.filter((words) => pageText.includes(words)),
  };
}

/** A guidance page without a published process: the desk sentence, the link and no run control. */
const readsDeskSentence = (read) =>
  read.guidance &&
  read.heading === GUIDANCE_HEADING &&
  read.deskSentence &&
  read.steps.length === 0 &&
  read.deskLinks.length === 1 &&
  read.deskLinks[0] === DESK_PATH &&
  read.controls.buttons.length === 0 &&
  read.controls.checkboxes === 0 &&
  read.subtabs === 0 &&
  read.runLinks === 0 &&
  read.runWording.length === 0;

/** A guidance page with the published process: its steps in order, Sources, the link, no control. */
const readsPublishedGuidance = (read, steps) =>
  read.guidance &&
  read.heading === GUIDANCE_HEADING &&
  !read.deskSentence &&
  steps.length > 0 &&
  sameList(read.steps.map(squash), steps.map(squash)) &&
  read.sourcesHeading === 1 &&
  read.sourceLinks >= 1 &&
  read.deskLinks.length === 1 &&
  read.deskLinks[0] === DESK_PATH &&
  read.controls.buttons.length === 0 &&
  read.controls.checkboxes === 0 &&
  read.subtabs === 0 &&
  read.runLinks === 0 &&
  read.runWording.length === 0;

/** Run, definition and version ids in the rehearsal emulator, with the renewal runs apart. */
async function inventory(kit) {
  const runs = await kit.listDocuments("workflow_runs");
  const ids = async (collection) => (await kit.listDocuments(collection)).map(idOf);
  return {
    runs: runs.map(idOf).sort(),
    renewalRuns: runs
      .filter((run) =>
        RENEWAL_DEFINITIONS.includes(plainValue(run.fields?.definition_id)),
      )
      .map(idOf)
      .sort(),
    otherRuns: runs
      .filter((run) => plainValue(run.fields?.definition_id) === OTHER_SPACE.definition)
      .map(idOf)
      .sort(),
    definitions: (await ids("process_definitions")).sort(),
    versions: (await ids("process_definition_versions")).sort(),
  };
}
const sameInventory = (left, right) =>
  sameList(left.runs, right.runs) &&
  sameList(left.definitions, right.definitions) &&
  sameList(left.versions, right.versions);

/** What the stand-ins and the network boundary hold: sends, drafts, lookups and refusals. */
async function sideEffects(kit, rehearsal) {
  const state = await standInState(rehearsal);
  const boxes = state.mail?.mailboxes ?? [];
  return {
    sent: boxes
      .flatMap((box) => box.messages ?? [])
      .filter((message) => (message.labelIds ?? []).includes("SENT")).length,
    drafts: boxes.reduce((sum, box) => sum + (box.drafts ?? []).length, 0),
    lookups: (state.comparison?.requests ?? []).length,
    modelRequests: (state.model?.requests ?? []).length,
    refused: kit.refusedCount(),
  };
}

/** A stored definition's run owner and approver and its publication state. */
async function storedDefinition(kit, definitionId) {
  const stored = fieldsOf(await kit.readDocument(`process_definitions/${definitionId}`));
  return stored
    ? {
        status: stored.status,
        ownerUid: stored.owner_uid,
        approverUid: stored.default_approver_uid,
        versionId: stored.active_version_id ?? null,
        steps: (stored.steps ?? []).map((step) => step.title),
      }
    : null;
}

/** The earlier run's stored record with its Timeline, checks and Activity, byte for byte. */
async function runRecord(kit, runId) {
  const related = async (collection) =>
    (await kit.listDocuments(collection))
      .filter((document) => plainValue(document.fields?.run_id) === runId)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return JSON.stringify({
    run: await kit.readDocument(`workflow_runs/${runId}`),
    timeline: await related("workflow_run_timeline"),
    checks: await related("workflow_run_step_checks"),
    activity: await related("workflow_run_step_check_activity"),
  });
}

// ---- Refusal probes: the requests the removed controls made, from the signed-in page ----------

/** A run start for one process, as the removed Start run asked for it. */
function requestRunStart(page, definitionId) {
  return page.evaluate(async (id) => {
    const response = await fetch(
      `/api/process-definitions/${encodeURIComponent(id)}/runs`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    const body = await response.json().catch(() => null);
    return { status: response.status, error: body?.error ?? null };
  }, definitionId);
}

/** A checklist step change on a run, as the removed Check button asked for it. */
function requestStepCheck(page, runId, stepId) {
  return page.evaluate(
    async ([id, step]) => {
      const response = await fetch(
        `/api/workflow-runs/${encodeURIComponent(id)}/step-checks`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ step_id: step, status: "Checked" }),
        },
      );
      const body = await response.json().catch(() => null);
      return { status: response.status, error: body?.error ?? null };
    },
    [runId, stepId],
  );
}

/** Completing a run, as the removed Complete run button asked for it. */
function requestRunCompletion(page, runId) {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/workflow-runs/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "complete" }),
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, error: body?.error ?? null };
  }, runId);
}

const refused = (answer, sentence) => answer.status === 409 && answer.error === sentence;

// ---- Staff controls -----------------------------------------------------------------------

/**
 * Open a process definition page and Save it after `edit` changed the form, as staff do. Resolves
 * with what the page showed and what the Save request carried.
 */
async function saveDefinition(ctx, page, definitionId, edit) {
  const { kit } = ctx;
  await kit.openPath(page, `/processes/${definitionId}`);
  const save = page.getByRole("button", { name: "Save", exact: true }).first();
  await save.waitFor({ timeout: 90_000 });
  const read = {
    ownerInputs: await page.getByLabel(RUN_OWNER_FIELD, { exact: true }).count(),
    approverInputs: await page
      .getByLabel(DEFAULT_APPROVER_FIELD, { exact: true })
      .count(),
    ownerNote:
      (await page
        .getByText(`${RUN_OWNER_FIELD} ${FIELD_NOTE}`, { exact: true })
        .count()) === 1,
    approverNote:
      (await page
        .getByText(`${DEFAULT_APPROVER_FIELD} ${FIELD_NOTE}`, { exact: true })
        .count()) === 1,
    renewalWork:
      (await page.getByRole("heading", { name: "Renewal work", exact: true }).count()) >
      0,
    startRun:
      (await page.getByRole("button", { name: "Start run", exact: true }).count()) +
      (await page.getByRole("heading", { name: "Start run", exact: true }).count()),
  };
  await edit(page);
  const answer = kit.appResponse(page, `/api/process-definitions/${definitionId}`, {
    method: "PATCH",
    timeout: 90_000,
  });
  await save.click();
  const response = await answer.catch(() => null);
  let sent = null;
  try {
    sent = response?.request().postDataJSON() ?? null;
  } catch {
    sent = null;
  }
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  const message = squash(
    await page
      .locator(".workflow-definition-editor .panel-heading p.muted")
      .first()
      .innerText()
      .catch(() => ""),
  );
  return {
    ...read,
    status: response?.status() ?? null,
    message,
    sentStaffFields: sent
      ? ["owner_uid", "default_approver_uid"].filter((field) => field in sent)
      : null,
  };
}

/** Synthetic source links, and no pending action references, through the definition form. */
function reviewedContent(definitionId) {
  return async (page) => {
    await page
      .getByLabel("Source links", { exact: true })
      .fill(
        `Synthetic ${definitionId} procedure | https://example.invalid/w12-14/${definitionId}-procedure`,
      );
    await page.getByLabel("Pending or future action references").fill("");
  };
}

/** Ask the Dashboard one question and read the answer the page received. */
async function askDashboard(ctx, page, question) {
  const { kit } = ctx;
  await kit.openPath(page, "/");
  const box = page.getByRole("textbox", { name: "Question", exact: true });
  await box.waitFor({ timeout: 90_000 });
  await box.fill(question);
  const answer = kit.appResponse(page, "/api/assistant/query", { timeout: 180_000 });
  await page.getByRole("button", { name: "Get answer", exact: true }).click();
  const response = await answer.catch(() => null);
  const body = response ? await response.json().catch(() => null) : null;
  const items = (body?.groups ?? []).flatMap((group) => group.items ?? []);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  return {
    status: response?.status() ?? null,
    interpretedBy: body?.interpretedBy ?? null,
    groups: (body?.groups ?? []).map((group) => group.title ?? null),
    refs: items.map((item) => item.ref?.id ?? null),
    hrefs: items.map((item) => item.href ?? null),
    runLinksShown: await page
      .getByRole("region", { name: "Conversation" })
      .locator('a[href*="/workflow-runs/"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")))
      .catch(() => []),
  };
}

// ---- The checks ---------------------------------------------------------------------------

/**
 * W12-14 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1214 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S286-1 to AC-S286-6 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1214(ctx, page, start) {
  const { kit, rehearsal } = ctx;
  const harness = (operation) => runProcessHarness(rehearsal, operation);
  const failures = [];
  /** Run one part; a part that stops is recorded and reads as not observed. */
  async function part(name, work, summary = compact) {
    try {
      const result = await work();
      ctx.record({ part: name, result: summary(result) });
      return result;
    } catch (error) {
      const message = String(error?.message ?? error).slice(0, 600);
      failures.push(name);
      ctx.record({ part: name, error: message });
      return null;
    }
  }
  ctx.record({
    startingSequence: start.error ? { stopped: start.error } : start.observed,
  });

  // The starting state again, so every renewal card is first read with no definition at all
  // (the starting sequence seeded the owner Draft before its own read).
  const reset = await part("reset", async () => {
    const seeds = await ctx.resetState();
    return { seeds: seeds?.length ?? null };
  });
  const effectsAtStart = await part("effects-start", () => sideEffects(kit, rehearsal));
  const seen = { runs: new Set(), definitions: new Set(), versions: new Set() };
  const snapshot = async () => {
    const now = await inventory(kit);
    for (const key of Object.keys(seen)) for (const id of now[key]) seen[key].add(id);
    return now;
  };
  const pages = { Editor: page };
  for (const role of ["Approver", "Admin"])
    pages[role] = await part(
      `sign in ${role}`,
      () => ctx.newPage(role),
      () => "signed in",
    );

  // ---- AC-S286-1 and AC-S286-4: no definition ----------------------------------------------
  const before1 = await part("inventory before the first reads", () => snapshot());
  const cardsNone = await part("cards with no definition", () => readCards(kit, page));
  const pagesNone = await part("renewal Spaces with no definition", async () => {
    const reads = [];
    for (const role of ROLES)
      for (const entry of RENEWAL)
        reads.push({
          role,
          space: entry.space,
          ...(await readSpacePage(kit, pages[role], entry.page)),
        });
    return reads;
  });
  const deskFollowed = await part("Open the Renewal Desk", async () => {
    await readSpacePage(kit, page, RENEWAL[1].page);
    await page.getByRole("link", { name: DESK_LINK, exact: true }).first().click();
    await page.waitForURL((url) => url.pathname === DESK_PATH, { timeout: 120_000 });
    const rows = page.locator("tr[data-batch-lease]");
    const shown = await kit.shownWithin(rows.first(), 120_000);
    return { landed: new URL(page.url()).pathname, rows: shown ? await rows.count() : 0 };
  });
  const help = await part("Help", async () => {
    const reads = [];
    for (const entry of HELP_PAGES) {
      await kit.openPath(page, entry.path);
      await page.locator("h1").first().waitFor({ timeout: 90_000 });
      const text = await pageWords(page);
      reads.push({
        path: entry.path,
        says: entry.says.filter((words) => text.includes(words)).length,
        of: entry.says.length,
        runWording: RUN_WORDING.filter((words) => text.includes(words)),
      });
    }
    return reads;
  });
  const after1 = await part("inventory after the first reads", () => snapshot());

  // ---- Drafts with placeholder staff, and Move-In with real staff --------------------------
  const drafts = await part("drafts seeded", async () => {
    const seeded = [];
    for (const definitionId of RENEWAL_DEFINITIONS)
      seeded.push(await harness({ op: "seed", definitionId, staff: "placeholder" }));
    seeded.push(
      await harness({ op: "seed", definitionId: OTHER_SPACE.definition, staff: "real" }),
    );
    return seeded;
  });
  const cardsDraft = await part("cards with drafts", () => readCards(kit, page));
  const pageDraft = await part("a renewal Space with a draft", () =>
    readSpacePage(kit, page, RENEWAL[2].page),
  );

  // ---- AC-S286-2: placeholder staff ------------------------------------------------------------
  const placeholderStarts = await part("run starts with placeholder staff", async () => {
    const before = await snapshot();
    const staff = {};
    for (const definitionId of RENEWAL_DEFINITIONS)
      staff[definitionId] = await storedDefinition(kit, definitionId);
    const answers = [];
    for (const role of ["Editor", "Admin"])
      for (const definitionId of RENEWAL_DEFINITIONS)
        answers.push({
          role,
          definitionId,
          ...(await requestRunStart(pages[role], definitionId)),
        });
    const after = await snapshot();
    return { staff, answers, before, after };
  });

  // ---- AC-S286-5: save, publish and roll back with the two fields empty ---------------------
  const definitionForm = await part("definition form", async () => {
    const result = { saves: [], published: {}, stored: {} };
    for (const definitionId of RENEWAL_DEFINITIONS) {
      const storedBefore = await storedDefinition(kit, definitionId);
      const saved = await saveDefinition(
        ctx,
        page,
        definitionId,
        reviewedContent(definitionId),
      );
      const storedAfter = await storedDefinition(kit, definitionId);
      result.saves.push({ definitionId, ...saved, storedBefore, storedAfter });
      result.published[definitionId] = await harness({ op: "publish", definitionId });
    }
    // A second reviewed version of the tenant process, then a rollback to the first.
    const tenant = "tenant-renewal-notice";
    const first = result.published[tenant];
    const firstVersion = JSON.stringify(
      await kit.readDocument(`process_definition_versions/${first.versionId}`),
    );
    const resaved = await saveDefinition(ctx, page, tenant, async (form) => {
      const outcome = form.getByLabel("Short outcome", { exact: true });
      await outcome.fill(`${await outcome.inputValue()} (reviewed again)`);
    });
    const second = await harness({ op: "publish", definitionId: tenant });
    const rolledBack = await harness({
      op: "rollback",
      definitionId: tenant,
      targetVersionId: first.versionId,
    });
    const firstVersionAfter = JSON.stringify(
      await kit.readDocument(`process_definition_versions/${first.versionId}`),
    );
    result.tenant = {
      resaved,
      second,
      rolledBack,
      firstVersionUnchanged:
        firstVersion !== "null" && firstVersion === firstVersionAfter,
      storedAfter: await storedDefinition(kit, tenant),
    };
    // A non-renewal definition still asks for its run owner.
    const otherBefore = await storedDefinition(kit, OTHER_SPACE.definition);
    const other = await saveDefinition(
      ctx,
      page,
      OTHER_SPACE.definition,
      async (form) => {
        await form.getByLabel(RUN_OWNER_FIELD, { exact: true }).fill("");
      },
    );
    result.other = {
      ...other,
      storedBefore: otherBefore,
      storedAfter: await storedDefinition(kit, OTHER_SPACE.definition),
    };
    return result;
  });
  await snapshot();
  const cardsPublished = await part("cards with published processes", () =>
    readCards(kit, page),
  );

  // ---- AC-S286-1: the published guidance for every role -------------------------------------
  const pagesPublished = await part(
    "renewal Spaces with published processes",
    async () => {
      const before = await snapshot();
      const reads = [];
      for (const role of ROLES)
        for (const entry of RENEWAL) {
          const stored = await storedDefinition(kit, entry.definition);
          reads.push({
            role,
            space: entry.space,
            storedSteps: stored?.steps ?? [],
            ...(await readSpacePage(kit, pages[role], entry.page)),
          });
        }
      const after = await snapshot();
      return { reads, before, after };
    },
  );

  // ---- AC-S286-2: real staff recorded --------------------------------------------------------
  const realStaffStarts = await part("run starts with real staff recorded", async () => {
    const recorded = [];
    for (const definitionId of RENEWAL_DEFINITIONS)
      recorded.push(await harness({ op: "record-staff", definitionId }));
    const staff = {};
    for (const definitionId of RENEWAL_DEFINITIONS)
      staff[definitionId] = await storedDefinition(kit, definitionId);
    const before = await snapshot();
    const answers = [];
    for (const role of ["Editor", "Admin"])
      for (const definitionId of RENEWAL_DEFINITIONS)
        answers.push({
          role,
          definitionId,
          ...(await requestRunStart(pages[role], definitionId)),
        });
    const after = await snapshot();
    // Published again with the staff recorded, so the earlier run below pins a current version.
    const republished = [];
    for (const definitionId of RENEWAL_DEFINITIONS)
      republished.push(await harness({ op: "publish", definitionId }));
    return { recorded, staff, answers, before, after, republished };
  });

  // ---- AC-S286-2: a run on another Space still starts ----------------------------------------
  const otherStart = await part("Start run on Move-In", async () => {
    const before = await snapshot();
    await kit.openPath(page, `/spaces/${OTHER_SPACE.space}`);
    const button = page.getByRole("button", { name: "Start run", exact: true }).first();
    const shown = await kit.shownWithin(button, 90_000);
    let status = null;
    if (shown) {
      const answer = kit.appResponse(
        page,
        `/api/process-definitions/${OTHER_SPACE.definition}/runs`,
        { timeout: 90_000 },
      );
      await button.click();
      status = (await answer.catch(() => null))?.status() ?? null;
    }
    const checklist = await kit.shownWithin(
      page.getByRole("button", { name: "Check", exact: true }).first(),
      60_000,
    );
    const after = await snapshot();
    return { shown, status, checklist, before, after };
  });

  // ---- AC-S286-3: an earlier renewal run kept as a record ------------------------------------
  const earlier = await part("earlier renewal run", async () => {
    const seeded = await harness({
      op: "earlier-run",
      definitionId: "owner-renewal-outreach",
      runId: EARLIER_RUN,
    });
    const recordBefore = await runRecord(kit, EARLIER_RUN);
    const before = await snapshot();

    await kit.openPath(page, `/workflow-runs/${EARLIER_RUN}`);
    const checklist = page.locator("aside.panel", {
      has: page.getByRole("heading", { name: "Checklist", exact: true }),
    });
    const shown = await kit.shownWithin(checklist.first(), 90_000);
    const field = async (label) =>
      squash(
        await page
          .locator(".queue-detail-field", { has: page.getByText(label, { exact: true }) })
          .locator("strong")
          .first()
          .innerText()
          .catch(() => ""),
      );
    const runPage = {
      shown,
      notice: shown
        ? (await checklist.first().innerText()).includes(RECORD_NOTICE)
        : false,
      steps: shown
        ? (await checklist.first().locator("ol > li").allInnerTexts()).map(squash)
        : [],
      nextAction: await field("Next Action"),
      version: await field("Definition version"),
      timeline: (
        await page.locator(".workflow-timeline-panel article").allInnerTexts()
      ).map(squash),
      controls: await runControls(page),
      notes: await page.getByLabel("Notes", { exact: true }).count(),
      deskLinks: await page
        .getByRole("link", { name: DESK_LINK, exact: true })
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href"))),
    };

    // The removed checklist's Check, on the run's second (still open) step.
    const openStep = seeded.stepIds?.[1] ?? null;
    const probes = [];
    for (const role of ["Editor", "Admin"]) {
      probes.push({
        role,
        kind: "step",
        ...(openStep
          ? await requestStepCheck(pages[role], EARLIER_RUN, openStep)
          : { status: null, error: "no open step" }),
      });
      probes.push({
        role,
        kind: "complete",
        ...(await requestRunCompletion(pages[role], EARLIER_RUN)),
      });
    }

    await kit.openPath(page, "/work");
    await page
      .waitForLoadState("networkidle", { timeout: 60_000 })
      .catch(() => undefined);
    const workText = squash(await page.locator("body").innerText());
    const myWork = {
      runLinks: await page.locator(`a[href*="/workflow-runs/${EARLIER_RUN}"]`).count(),
      namesRun: workText.includes(EARLIER_RUN),
      nextAction: workText.includes(`Next: ${seeded.checkedStep}`),
    };

    const cards = await readCards(kit, page);
    const ownerCard = cards.cards.find((card) => card.name === RENEWAL[1].card) ?? null;

    const summary = await readSpacePage(kit, page, RENEWAL[1].page);
    await kit.openPath(page, `/spaces/${OTHER_SPACE.space}?tab=process`);
    await page
      .getByText("Recent runs", { exact: true })
      .first()
      .waitFor({ timeout: 90_000 });
    const otherSummary = squash(await page.locator("body").innerText());

    const otherRunId = (await inventory(kit)).otherRuns[0] ?? null;
    const shared = await askDashboard(ctx, page, "Which process runs are open?");

    const recordAfter = await runRecord(kit, EARLIER_RUN);
    const after = await snapshot();
    return {
      seeded,
      runPage,
      probes,
      myWork,
      ownerCard,
      summary,
      otherSummaryListsRun:
        otherSummary.includes("Recent runs") && otherSummary.includes("In Progress"),
      otherRunId,
      shared,
      recordUnchanged:
        recordBefore === recordAfter && JSON.parse(recordBefore).run !== null,
      before,
      after,
    };
  });

  // ---- AC-S286-4: retired definitions, and the connection rule --------------------------------
  const retired = await part("retired definitions", async () => {
    const results = [];
    for (const definitionId of RENEWAL_DEFINITIONS)
      results.push(await harness({ op: "retire", definitionId }));
    const cards = await readCards(kit, page);
    const before = await snapshot();
    const ownerPage = await readSpacePage(kit, page, RENEWAL[1].page);
    const after = await snapshot();
    return { results, cards, ownerPage, before, after };
  });
  const cardStates = await part("card-state rule with a missing connection", () =>
    harness({ op: "card-states" }),
  );
  const finalInventory = await part("inventory at the end", () => snapshot());
  const effectsAtEnd = await part("effects-end", () => sideEffects(kit, rehearsal));

  // ---- Verdicts ----------------------------------------------------------------------------
  // Each acceptance check is the conjunction of its named parts; each part set is recorded.
  const cardFor = (read, name) => read?.cards.find((card) => card.name === name) ?? null;
  const renewalCardsRead = (read, label) =>
    Boolean(read) &&
    RENEWAL.every((entry) => {
      const card = cardFor(read, entry.card);
      return (
        card &&
        card.state === label &&
        card.tone === NEUTRAL_TONE &&
        !/Needs a process/.test(card.text)
      );
    });
  const otherCards = (read) =>
    (read?.cards ?? []).filter(
      (card) => !RENEWAL.some((entry) => entry.card === card.name),
    );
  const stable = (read) =>
    otherCards(read).filter((card) => card.name !== OTHER_SPACE.card);
  const placeholderStaff = (stored) =>
    Boolean(stored) &&
    PLACEHOLDER.test(stored.ownerUid) &&
    PLACEHOLDER.test(stored.approverUid);
  const realStaff = (stored) =>
    Boolean(stored) &&
    typeof stored.ownerUid === "string" &&
    typeof stored.approverUid === "string" &&
    !PLACEHOLDER.test(stored.ownerUid) &&
    !PLACEHOLDER.test(stored.approverUid);
  const startsRefused = (probe, staffIs) =>
    Boolean(probe) &&
    probe.answers.length === 2 * RENEWAL_DEFINITIONS.length &&
    probe.answers.every((answer) => refused(answer, START_REFUSAL)) &&
    RENEWAL_DEFINITIONS.every((definitionId) => staffIs(probe.staff[definitionId])) &&
    sameInventory(probe.before, probe.after) &&
    probe.after.renewalRuns.length === 0;
  const savedEmpty = (save) =>
    Boolean(save) &&
    save.ownerInputs === 0 &&
    save.approverInputs === 0 &&
    save.ownerNote &&
    save.approverNote &&
    save.status === 200 &&
    save.message === SAVED &&
    Array.isArray(save.sentStaffFields) &&
    save.sentStaffFields.length === 0;

  const ac1Parts = {
    noDefinitionPages:
      Array.isArray(pagesNone) &&
      pagesNone.length === ROLES.length * RENEWAL.length &&
      pagesNone.every(readsDeskSentence),
    draftPage: Boolean(pageDraft) && readsDeskSentence(pageDraft),
    publishedPages:
      Boolean(pagesPublished) &&
      pagesPublished.reads.length === ROLES.length * RENEWAL.length &&
      pagesPublished.reads.every((read) =>
        readsPublishedGuidance(read, read.storedSteps),
      ),
    ownerSixSteps:
      Boolean(pagesPublished) &&
      pagesPublished.reads
        .filter((read) => read.space === "owner-renewal-outreach")
        .every((read) => read.steps.length === 6),
    deskLinkWorks:
      Boolean(deskFollowed) && deskFollowed.landed === DESK_PATH && deskFollowed.rows > 0,
    navigation:
      Boolean(cardsNone) &&
      RENEWAL.every((entry) => {
        const card = cardFor(cardsNone, entry.card);
        return (
          card &&
          card.subtitle === entry.subtitle &&
          !/\brun\b|checklist/i.test(card.text) &&
          (entry.space === "lease-renewals"
            ? String(card.href).startsWith("/lease-renewal")
            : card.href === entry.page)
        );
      }) &&
      !/Start run/.test(cardsNone.anticipated) &&
      cardsNone.anticipated.includes("with a link to where each is worked"),
    help:
      Array.isArray(help) &&
      help.length === HELP_PAGES.length &&
      help.every((read) => read.says === read.of && read.runWording.length === 0),
    definitionPagesOfferNoStart:
      Boolean(definitionForm) &&
      definitionForm.saves.every((save) => save.startRun === 0 && save.renewalWork),
  };

  const ac2Parts = {
    placeholderRefused: startsRefused(placeholderStarts, placeholderStaff),
    realStaffRefused: startsRefused(realStaffStarts, realStaff),
    otherSpaceStarts:
      Boolean(otherStart) &&
      otherStart.shown &&
      otherStart.status === 201 &&
      otherStart.checklist &&
      otherStart.after.otherRuns.length === otherStart.before.otherRuns.length + 1 &&
      otherStart.after.runs.length === otherStart.before.runs.length + 1 &&
      otherStart.after.renewalRuns.length === 0,
  };

  const ac3Parts = earlier
    ? {
        seededAsBefore: earlier.seeded.startRefusal === START_REFUSAL,
        opensAsRecord: earlier.runPage.shown && earlier.runPage.notice,
        pinnedStepsAndChecks: sameList(
          earlier.runPage.steps,
          earlier.seeded.steps.map(
            (title, index) => `${title}: ${index === 0 ? "Done" : "To do"}`,
          ),
        ),
        noNextAction: earlier.runPage.nextAction === "None",
        pinnedVersion: earlier.runPage.version === earlier.seeded.versionId,
        history: earlier.runPage.timeline.some((entry) => /started by/.test(entry)),
        noControls:
          earlier.runPage.controls.buttons.length === 0 &&
          earlier.runPage.controls.checkboxes === 0 &&
          earlier.runPage.notes === 0,
        deskLink: earlier.runPage.deskLinks.includes(DESK_PATH),
        changesRefused:
          earlier.probes.length === 4 &&
          earlier.probes.every((probe) => refused(probe, RECORD_NOTICE)),
        absentFromMyWork:
          earlier.myWork.runLinks === 0 &&
          !earlier.myWork.namesRun &&
          !earlier.myWork.nextAction,
        absentFromSpaceCard:
          Boolean(earlier.ownerCard) &&
          earlier.ownerCard.state === GUIDANCE_LABEL &&
          !/In Progress|Next:/.test(earlier.ownerCard.text),
        absentFromProcessSummary:
          earlier.summary.runLinks === 0 &&
          !earlier.summary.recentRuns &&
          !earlier.summary.inProgress &&
          earlier.otherSummaryListsRun,
        absentFromSharedContext:
          earlier.shared.status === 200 &&
          Boolean(earlier.otherRunId) &&
          earlier.shared.refs.includes(`run:${earlier.otherRunId}`) &&
          !earlier.shared.refs.includes(`run:${EARLIER_RUN}`) &&
          !earlier.shared.hrefs.some((href) => String(href).includes(EARLIER_RUN)) &&
          !earlier.shared.runLinksShown.some((href) =>
            String(href).includes(EARLIER_RUN),
          ),
        recordUnchanged: earlier.recordUnchanged,
        nothingCreated: sameInventory(earlier.before, earlier.after),
      }
    : { observed: false };

  const ac4Parts = {
    noDefinition: renewalCardsRead(cardsNone, DESK_LABEL),
    draftsSeeded:
      Array.isArray(drafts) && drafts.every((seeded) => seeded?.action === "created"),
    draft: renewalCardsRead(cardsDraft, DESK_LABEL),
    published: renewalCardsRead(cardsPublished, GUIDANCE_LABEL),
    retired:
      Boolean(retired) &&
      renewalCardsRead(retired.cards, DESK_LABEL) &&
      retired.results.every((result) => result.status === "Retired") &&
      readsDeskSentence(retired.ownerPage),
    otherSpacesKept:
      Boolean(cardsNone && cardsDraft && cardsPublished && retired) &&
      sameList(stable(cardsNone), stable(cardsDraft)) &&
      sameList(stable(cardsNone), stable(cardsPublished)) &&
      sameList(stable(cardsNone), stable(retired.cards)) &&
      // A Space that still runs keeps the blocked state with no process and the draft state after.
      cardFor(cardsNone, OTHER_SPACE.card)?.state === "Needs a process" &&
      cardFor(cardsNone, OTHER_SPACE.card)?.tone === "blocked" &&
      cardFor(cardsDraft, OTHER_SPACE.card)?.state === "Draft process" &&
      cardFor(retired.cards, OTHER_SPACE.card)?.state === "Draft process",
    // The rehearsal configures every connector; the served card-state rule over the stored
    // definitions with RentVine's values missing (harness "card-states").
    connectionFirst:
      Boolean(cardStates) &&
      cardStates["lease-renewals"]?.rentvineMissing === "connections-needed" &&
      cardStates["lease-renewals"]?.present === "renewal-desk" &&
      ["owner-renewal-outreach", "tenant-renewal-notice"].every(
        (space) => cardStates[space]?.rentvineMissing === "renewal-desk",
      ),
  };

  const tenantFirst = definitionForm?.published?.["tenant-renewal-notice"] ?? null;
  const ac5Parts = definitionForm
    ? {
        savedWithFieldsEmpty:
          definitionForm.saves.length === RENEWAL_DEFINITIONS.length &&
          definitionForm.saves.every(
            (save) =>
              savedEmpty(save) &&
              placeholderStaff(save.storedBefore) &&
              save.storedAfter?.ownerUid === save.storedBefore.ownerUid &&
              save.storedAfter?.approverUid === save.storedBefore.approverUid,
          ),
        published: RENEWAL_DEFINITIONS.every((definitionId) => {
          const published = definitionForm.published[definitionId];
          return published?.status === "Active" && published?.readback === "verified";
        }),
        resavedAndRepublished:
          savedEmpty(definitionForm.tenant.resaved) &&
          definitionForm.tenant.second?.readback === "verified" &&
          definitionForm.tenant.second?.versionId !== tenantFirst?.versionId,
        rolledBack:
          Boolean(tenantFirst?.versionId) &&
          definitionForm.tenant.rolledBack?.rollbackOfVersionId ===
            tenantFirst.versionId &&
          definitionForm.tenant.firstVersionUnchanged,
        placeholdersKept: placeholderStaff(definitionForm.tenant.storedAfter),
        otherStillRequired:
          definitionForm.other.ownerInputs === 1 &&
          definitionForm.other.status !== null &&
          definitionForm.other.status >= 400 &&
          definitionForm.other.message !== SAVED &&
          definitionForm.other.storedAfter?.ownerUid ===
            definitionForm.other.storedBefore?.ownerUid &&
          Boolean(definitionForm.other.storedAfter?.ownerUid),
      }
    : { observed: false };

  const finalIds = finalInventory
    ? {
        runs: new Set(finalInventory.runs),
        definitions: new Set(finalInventory.definitions),
        versions: new Set(finalInventory.versions),
      }
    : null;
  const ac6Parts = {
    countsEqualAroundEveryCheck:
      Boolean(before1 && after1) &&
      sameInventory(before1, after1) &&
      Boolean(placeholderStarts) &&
      sameInventory(placeholderStarts.before, placeholderStarts.after) &&
      Boolean(realStaffStarts) &&
      sameInventory(realStaffStarts.before, realStaffStarts.after) &&
      Boolean(pagesPublished) &&
      sameInventory(pagesPublished.before, pagesPublished.after) &&
      Boolean(earlier) &&
      sameInventory(earlier.before, earlier.after) &&
      Boolean(retired) &&
      sameInventory(retired.before, retired.after),
    nothingDeleted:
      Boolean(finalIds) &&
      Object.keys(seen).every((key) =>
        [...seen[key]].every((id) => finalIds[key].has(id)),
      ),
    noSendLookupOrProvider:
      Boolean(effectsAtStart && effectsAtEnd) &&
      effectsAtEnd.sent === effectsAtStart.sent &&
      effectsAtEnd.drafts === effectsAtStart.drafts &&
      effectsAtEnd.lookups === effectsAtStart.lookups &&
      effectsAtEnd.refused === effectsAtStart.refused,
    earlierRecordUnchanged: Boolean(earlier?.recordUnchanged),
    onlyTheEarlierRenewalRun:
      Boolean(finalInventory) &&
      finalInventory.renewalRuns.length === 1 &&
      finalInventory.renewalRuns[0] === EARLIER_RUN,
  };

  const parts = {
    "AC-S286-1": ac1Parts,
    "AC-S286-2": ac2Parts,
    "AC-S286-3": ac3Parts,
    "AC-S286-4": ac4Parts,
    "AC-S286-5": ac5Parts,
    "AC-S286-6": ac6Parts,
  };
  const checks = Object.fromEntries(
    Object.entries(parts).map(([id, named]) => [
      id,
      Object.values(named).every((value) => value === true),
    ]),
  );
  for (const [id, named] of Object.entries(parts))
    ctx.record({ check: id, passed: checks[id], parts: named });
  ctx.record({
    checks,
    stopped: failures,
    reset: reset ? "done" : "stopped",
    effectsAtStart,
    effectsAtEnd,
  });
  return checks;
}
