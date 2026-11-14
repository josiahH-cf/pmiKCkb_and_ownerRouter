// S284 W12-08, "One status for everyone": the candidate-side acceptance checks of S279 (intake
// 157) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-one-status-from-one-record.md (S279).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S279-1, AC-S279-2, AC-S279-3, AC-S279-4, AC-S279-5, AC-S279-6
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   After a confirmed send read the step, the card and the desk row. Create a real disagreement.
//   Read the same lease as an Editor and as an Approver. Record a tenant acceptance and read the
//   stage.
//
// Starting sequence (journeyW1208 in one-path-november-12-journeys.mjs, the fail-first table):
//   Read one lease as two staff members with different mailbox links. On the baseline: Different
//   waiting status for the same lease. The sequence runs unchanged on the candidate; only its
//   "needs-check" note count reads 0 there, because S279 R-S279-3 moved the check into the stage
//   line on purpose. If it stopped, the harness is reset and it runs once more.
//
// How the checks reach each state (R-S284-2): staff controls only. The Editor sends, schedules,
// records answers and uses "Check for a reply now"; the mail stand-in delivers the owner's and the
// tenant's replies and returns the bounce; time passes only through the worker tick (kit.tick).
// Nothing here posts an app route: every request is one a visible control makes, and the reads are
// pages, GET routes, the rehearsal's own emulator and the stand-ins' state.
//
//   Part A, the starting state carried on (lease "prepared"):
//     R1  the journey's state: an app-confirmed owner send, the owner's reply delivered and the
//         Editor's own linked thread refreshed. Editor and Approver read; the Admin and the Editor
//         read the notice rules line; a signed-out browser reads nothing.
//     R2  "Check for a reply now": the owner's reply observed. Editor and Approver read.
//     R3  the Editor records "No response" after the reply: a real owner disagreement. Editor and
//         Approver read; the check's fix opens the owner response editor.
//     R4  the owner's approval and the renewal dates, then the tenant offer sent from its review: an
//         app-confirmed send with the older owner thread (and the Editor's link to it) on the lease.
//     R5  the tenant's reply delivered and observed.
//     R6  the Editor records "Awaiting response" after the reply: a real tenant disagreement. Editor
//         and Approver read; the check's fix opens the tenant response editor.
//     R7  the tenant's acceptance recorded against the offer it answers: the stage.
//   Part B, after the harness reset:
//     C   readiness: "Prepare this lease" on a lease not yet prepared, then the saves that feed the
//         list (Rent to recommend cleared and entered again, Reason to include), watched at every
//         DOM mutation of the page for a ready row beside a missing marker for the same fact.
//     R8  the owner message scheduled from its review.
//     R9  the worker tick sends it: an app-confirmed send with no reply.
//     R10 the stand-in returns a bounce for it, observed by "Check for a reply now".
//   Every read window (R1 to R10, all roles) is measured for AC-S279-6: the non-GET requests the
//   pages made, sent mail, comparison lookups, emulator documents changed, and whether a reply's
//   body reached a status line or any response. The one response left out is the owner decision
//   editor's own read of the reply it shows the person recording the decision (counted).
//
// "Who" is compared word for word as the lines show it. A stage line leads with its stage from the
// closed list (R-S279-4, "the existing bounded status"), so a stage named "Waiting on owner
// response" is the stage, and the who is the waiting phrase ("Waiting on the owner since",
// ", waiting on the PMI KC team since", the card's "Waiting on ...").
import {
  bounceSentMessage,
  deliverOwnerReply,
  standInState,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import {
  FIRST_TERM_END,
  confirmReview,
  enterRenewalDates,
  journeyW1208,
  reachPrimary,
  sendTenantOffer,
  stepScheduleButton,
  waitForPrimary,
} from "./one-path-november-12-journeys.mjs";
import { DESK, WORKING_ROUTE, WORKSPACE_ROUTE } from "./one-path-november-12-kit.mjs";

export const W1208_CHECKS = Object.freeze([
  "AC-S279-1",
  "AC-S279-2",
  "AC-S279-3",
  "AC-S279-4",
  "AC-S279-5",
  "AC-S279-6",
]);

/** R-S279-5, word for word. */
export const POLICY_LINE =
  "Renewal notice rules are not confirmed. Next: an Admin confirms them in Admin, Renewal notice rules.";
export const POLICY_HREF = "/admin?task=renewal#admin-renewal-notice-rules";
const POLICY_PLACE = "Admin, Renewal notice rules";
/** The starting state's wording of the same line (follow-up-projection before S279). */
const OLD_POLICY_NEXT = /Ask an Admin to confirm and version the client timing policy/i;
/** The journey's owner reply, and the tenant reply this file delivers. */
export const OWNER_REPLY_TEXT = "Synthetic owner reply for the two-reader check.";
export const TENANT_REPLY_TEXT =
  "Synthetic tenant reply for the one status check: we would like to renew.";
/** Stages of the closed list (lib/lease-renewal/work-status.ts) for work after the tenant offer. */
const AFTER_OFFER_STAGES = [
  "Preparing lease documents / Dotloop",
  "Waiting on signatures",
  "Completing follow-up",
  "Complete: staff status",
];
const CHECK_WORDS = "The staff record says";
const MARKERS = Object.freeze({
  rent: {
    row: /^Rent to recommend:/i,
    marker: "[needs verification: rent to recommend]",
  },
  signature: {
    row: /^Your signature:/i,
    marker: "[needs verification: sender signature]",
  },
});
const DATE = String.raw`(\d{2}/\d{2}/\d{4})`;

const squash = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
const count = (text, words) => String(text ?? "").split(words).length - 1;

// ---- Reading what staff read ------------------------------------------------------------------

/** One region's visible text with its line breaks kept; "" when it is not on the page. */
async function linesOf(locator) {
  const element = locator.first();
  if ((await element.count()) === 0) return [];
  const text = await element.innerText({ timeout: 5_000 }).catch(() => "");
  return text
    .split("\n")
    .map((line) => squash(line))
    .filter(Boolean);
}

async function textOf(locator) {
  const element = locator.first();
  if ((await element.count()) === 0) return null;
  return squash(await element.innerText({ timeout: 5_000 }).catch(() => ""));
}

/** The "Waiting and follow-up" card's status lines, without the person's own controls. */
function cardStatus(lines) {
  const keep = [
    /^Waiting on /,
    /^No external party is currently waiting/,
    /^Waiting state needs verification/,
    /^Last verified contact:/,
    /^No contact recorded yet/,
    /^Last contact: /,
    /^Renewal notice rules are not confirmed/,
    /^Policy version /,
    /^Timing policy/,
    /^Follow-up due/,
    /^Next follow-up review:/,
    /^No follow-up date/,
    /^Follow-up timing is disabled/,
    /^No external follow-up is due/,
    /^Next: /,
  ];
  return lines.filter((line) => keep.some((pattern) => pattern.test(line)));
}

/**
 * Read a page once it has finished reading, as staff do: no message part still says "Reading the
 * current ..." (at most 60 s), then a moment for the last render.
 */
async function settled(page) {
  await page
    .waitForFunction(
      () =>
        !/Reading the current|Opening lease|Updating renewals/i.test(
          document.body.innerText,
        ),
      null,
      { timeout: 60_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(1_000);
}

/**
 * The lease as one staff member reads it: the stage header and the Now card in Guided view, the
 * "Waiting and follow-up" card in Full view, and the lease's rows on the Renewals desk.
 */
async function readLease(ctx, page, leaseId, step) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, step ? `?step=${step}` : "");
  await waitForPrimary(ctx, page, () => false, 40_000);
  await settled(page);
  const now = kit.now(page);
  const fix = page.locator('[data-renewal-field="check-fix"]');
  const guidedBody = await page.evaluate(() => document.body.innerText);
  // Where each visible copy of the check's words sits, for the record.
  const checkPlaces = await page.evaluate((words) => {
    const places = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.includes(words)) continue;
      const element = node.parentElement;
      if (!element || !element.checkVisibility()) continue;
      const holder = element.closest("[id], [aria-label], [data-renewal-field]");
      places.push(
        holder
          ? `${holder.tagName.toLowerCase()}#${holder.id || ""}[${holder.getAttribute("aria-label") ?? holder.getAttribute("data-renewal-field") ?? ""}]`
          : element.tagName.toLowerCase(),
      );
    }
    return places;
  }, CHECK_WORDS);
  const guided = {
    url: new URL(page.url()).search,
    stageLine: await kit.stageLine(page),
    stageKey: await page
      .locator('[data-renewal-field="stage-line"]')
      .first()
      .getAttribute("data-renewal-stage")
      .catch(() => null),
    fixCount: await fix.count(),
    fixText: await textOf(fix),
    fixHref: (await fix.count()) ? await fix.first().getAttribute("href") : null,
    waiting: await textOf(now.locator('[data-renewal-field="waiting"]:visible')),
    replyCheck: await textOf(now.locator('[data-renewal-field="reply-check"] p').first()),
    replyCheckButton: await now
      .getByRole("button", { name: "Check for a reply now", exact: true })
      .count(),
    nowDetail: await textOf(page.locator('[data-renewal-field="now-detail"]:visible')),
    primary: await kit.primaryName(page, 5_000),
    checkWordsOnScreen: count(guidedBody, CHECK_WORDS),
    checkPlaces,
    needsCheckOnScreen: count(guidedBody, "Needs a check"),
    unresolvedSource: /unresolved source/i.test(guidedBody),
    oldPolicyWords: OLD_POLICY_NEXT.test(guidedBody),
  };
  await kit.openLease(page, leaseId, "?view=full");
  const shown = await kit.reveal(page, "#renewal-card-follow-up", 30_000);
  await settled(page);
  const card = page.locator("#renewal-card-follow-up");
  const cardLines = shown ? await linesOf(card) : [];
  const notice = card.locator('[data-renewal-field="notice-rules-unconfirmed"]');
  const noticeLink = notice.locator("a");
  const fullBody = await page.evaluate(() => document.body.innerText);
  const full = {
    stageLine: await kit.stageLine(page),
    cardShown: shown,
    cardStatus: cardStatus(cardLines),
    policy: await textOf(notice),
    policyLinks: await noticeLink.count(),
    policyHref: (await noticeLink.count())
      ? await noticeLink.first().getAttribute("href")
      : null,
    policyLinkText: await textOf(noticeLink),
    // The person's own linked thread: its control sits in a closed disclosure, so it is counted
    // in the card's markup rather than by its accessible role.
    linkedThreadControls: await card
      .locator("button", { hasText: /^\s*Refresh this linked thread\s*$/ })
      .count(),
    waitingLines: await page
      .locator('[data-renewal-field="waiting"]:visible')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.innerText.replace(/\s+/g, " ").trim()),
      )
      .catch(() => []),
    checkWordsOnScreen: count(fullBody, CHECK_WORDS),
    unresolvedSource: /unresolved source/i.test(fullBody),
    oldPolicyWords: OLD_POLICY_NEXT.test(fullBody),
  };
  await kit.openPath(page, DESK);
  const batch = await kit.deskRow(page, leaseId);
  const tableRow = page.locator(`tr[data-lease-id="${leaseId}"]`).first();
  const inTable = (await tableRow.count()) > 0;
  const deskBody = await page.evaluate(() => document.body.innerText);
  const desk = {
    batchShown: batch.shown,
    stage: batch.stage ?? null,
    next: batch.next ?? null,
    table: inTable
      ? {
          status: await tableRow.getAttribute("data-status"),
          visible: await tableRow.isVisible().catch(() => false),
          waitingOn: await textOf(tableRow.locator('[data-renewal-field="waiting-on"]')),
          check: await textOf(tableRow.locator('[data-renewal-field="status-check"]')),
          evidence: await textOf(
            tableRow.locator('[data-renewal-field="status-evidence"]'),
          ),
        }
      : null,
    checkWordsOnScreen: count(deskBody, CHECK_WORDS),
  };
  return { role: page.__role ?? null, guided, full, desk };
}

/**
 * The stages of the closed list whose names start "Waiting on" (lib/lease-renewal/work-status.ts).
 * A stage line leads with its stage, "the existing bounded status" (R-S279-4); who the lease waits
 * on is the waiting phrase the lines carry ("Waiting on the owner since", ", waiting on the PMI KC
 * team since", the card's "Waiting on ..."), so a stage name is not read as one.
 */
const WAITING_STAGE_NAMES =
  /\bWaiting on (?:owner response|tenant response|signatures)\b/gi;

/** The words a line uses for who the lease waits on, exactly as shown; null when it names no one. */
export function whoIn(text) {
  const value = String(text ?? "").replace(WAITING_STAGE_NAMES, "");
  if (/No external party is currently waiting/i.test(value)) return "no external party";
  return (
    /\bwaiting on:? ([^.,;:|]+?)(?=\s+since\b|\s*[.,;:|]|\s*$)/i.exec(value)?.[1] ?? null
  );
}
const sinceIn = (text) =>
  new RegExp(`since ${DATE}`).exec(String(text ?? ""))?.[1] ?? null;
function contactIn(text) {
  const value = String(text ?? "");
  if (/No contact recorded yet/i.test(value)) return "none";
  if (/Last contact: Needs Verification/i.test(value)) return "needs verification";
  return new RegExp(`Last (?:verified )?contact:? ${DATE}`).exec(value)?.[1] ?? null;
}

/**
 * AC-S279-1: the step line, the card and the desk row, read together. Each fact (who, since when,
 * last contact) has one value across every surface that states it; the desk row's stage line is
 * the lease's word for word; the card never reads an unresolved source.
 */
export function agreement(read) {
  const problems = [];
  const surfaces = {
    stageLine: read.guided.stageLine,
    stepWaiting: read.guided.waiting,
    card: read.full.cardStatus.join(" | "),
    deskRow: read.desk.stage,
    deskTable: read.desk.table?.visible ? read.desk.table.waitingOn : null,
  };
  const facts = { who: {}, since: {}, contact: {} };
  for (const [surface, text] of Object.entries(surfaces)) {
    if (!text) continue;
    const who = whoIn(text);
    if (who) facts.who[surface] = who;
    const since = sinceIn(text);
    if (since) facts.since[surface] = since;
    const contact =
      surface === "stageLine" || surface === "deskRow" ? null : contactIn(text);
    if (contact) facts.contact[surface] = contact;
  }
  for (const [fact, values] of Object.entries(facts))
    if (new Set(Object.values(values)).size > 1)
      problems.push(`${fact} differs: ${JSON.stringify(values)}`);
  // The lease answers the question at all: some surface says who and what the last contact was.
  if (!Object.keys(facts.who).length)
    problems.push("no surface says who the lease waits on");
  if (!Object.keys(facts.contact).length)
    problems.push("no surface gives the last contact");
  if (!read.desk.batchShown) problems.push("no desk row");
  else if (read.desk.stage !== read.guided.stageLine)
    problems.push(`desk row "${read.desk.stage}" is not the stage line`);
  if (read.full.stageLine !== read.guided.stageLine)
    problems.push("the Full view stage line differs from Guided view");
  if (!read.full.cardShown) problems.push("no Waiting and follow-up card");
  if (
    Object.values(facts.who).includes("an unresolved source") ||
    read.full.unresolvedSource
  )
    problems.push("an unresolved source");
  if (facts.contact.card === "needs verification")
    problems.push("the card's last contact needs verification");
  // Beside the step's own waiting line the card adds only its follow-up date and policy note.
  if (
    read.guided.waiting &&
    read.full.cardStatus.some((line) =>
      /^(Waiting on |No external party|Waiting state|Last verified contact|No contact recorded|Last contact)/.test(
        line,
      ),
    )
  )
    problems.push("the card repeats the step's waiting line");
  return { agree: problems.length === 0, problems, facts };
}

/** AC-S279-2: what every staff member reads alike (not the person's own link or attention). */
function statusOf(read) {
  return {
    stageLine: read.guided.stageLine,
    fix: read.guided.fixCount ? `${read.guided.fixText} -> ${read.guided.fixHref}` : null,
    waiting: read.guided.waiting,
    replyCheck: read.guided.replyCheck,
    nowDetail: read.guided.nowDetail,
    fullStageLine: read.full.stageLine,
    card: read.full.cardStatus,
    fullWaiting: read.full.waitingLines,
    deskStage: read.desk.stage,
    deskNext: read.desk.next,
    deskTable: read.desk.table
      ? {
          status: read.desk.table.status,
          waitingOn: read.desk.table.waitingOn,
          check: read.desk.table.check,
          evidence: read.desk.table.evidence,
        }
      : null,
  };
}
const sameStatus = (a, b) => JSON.stringify(statusOf(a)) === JSON.stringify(statusOf(b));

const noCheck = (read) =>
  !/Needs a check/i.test(read.guided.stageLine) &&
  read.guided.checkWordsOnScreen === 0 &&
  read.full.checkWordsOnScreen === 0 &&
  !/Needs a check/i.test(read.desk.stage ?? "") &&
  read.desk.checkWordsOnScreen === 0 &&
  read.desk.table?.status !== "needs_check";

/**
 * R-S279-3: the check in both facts and the fix, once on each screen. `who` is "owner" or
 * "tenant"; the reply date is a business date.
 */
function checkShownOnce(read, who) {
  const sentence = new RegExp(
    `^Needs a check: The staff record says waiting on the ${who}\\. The ${who} replied on ${DATE}\\. Record the response\\.$`,
    "i",
  );
  return (
    sentence.test(read.guided.stageLine) &&
    read.guided.checkWordsOnScreen === 1 &&
    read.full.checkWordsOnScreen === 1 &&
    read.guided.fixCount === 1 &&
    read.guided.fixText === "Record the response" &&
    read.guided.fixHref === `#renewal-manual-${who}_response` &&
    read.desk.stage === read.guided.stageLine &&
    read.desk.checkWordsOnScreen === 1
  );
}

// ---- What a read may not cause (AC-S279-6) -----------------------------------------------------

/** Every emulator document's update time, by path, for the rehearsal's disposable project. */
async function emulatorDocuments(rehearsal) {
  if (!/^127\.0\.0\.1:\d+$/.test(rehearsal.firestoreEmulatorHost ?? "")) return null;
  if (rehearsal.projectId !== "pmi-kc-kb-one-path-rehearsal-test") return null;
  const root = `http://${rehearsal.firestoreEmulatorHost}/v1/projects/${rehearsal.projectId}/databases/(default)/documents`;
  const headers = { authorization: "Bearer owner", "content-type": "application/json" };
  const listed = await fetch(`${root}:listCollectionIds`, {
    method: "POST",
    headers,
    body: JSON.stringify({ pageSize: 500 }),
    redirect: "error",
  }).then((response) => (response.ok ? response.json() : null));
  if (!listed) return null;
  const documents = {};
  for (const collection of listed.collectionIds ?? []) {
    let token = "";
    do {
      const response = await fetch(
        `${root}/${collection}?pageSize=300${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`,
        { headers, redirect: "error" },
      );
      if (!response.ok) return null;
      const body = await response.json();
      for (const document of body.documents ?? [])
        documents[document.name.split("/documents/")[1]] = document.updateTime;
      token = body.nextPageToken ?? "";
    } while (token);
  }
  return documents;
}

async function outsideCounts(rehearsal) {
  const state = await standInState(rehearsal);
  const sent = (state.mail?.mailboxes ?? [])
    .flatMap((box) => box.messages ?? [])
    .filter((message) => (message.labelIds ?? []).includes("SENT")).length;
  const lookups = Object.values(state.comparison?.comparisonsByLease ?? {}).reduce(
    (sum, value) => sum + (Array.isArray(value) ? value.length : Number(value) || 0),
    0,
  );
  return { sent, lookups, modelRequests: state.comparison?.modelRequests ?? null };
}

/**
 * The owner decision editor's own read of one observed reply (RenewalOwnerDecisionFromReply), which
 * shows the reply to the person recording the decision by design. It is not a status read; every
 * other response a read window receives is searched, and these are counted.
 */
const DECISION_REPLY_READ = "/api/gmail-hub/sequences/thread";

/** Same-origin responses the pages receive while reading, searched for a reply's body. */
function watchBodies(ctx, pages, editorReplyReads) {
  const leaks = [];
  const pending = [];
  const listen = (response) => {
    const url = new URL(response.url());
    if (url.origin !== ctx.origin) return;
    if (url.pathname === DECISION_REPLY_READ) {
      editorReplyReads.push(url.pathname);
      return;
    }
    const type = response.headers()["content-type"] ?? "";
    if (!/json|html|text|x-component/.test(type)) return;
    pending.push(
      response
        .text()
        .then((text) => {
          for (const words of [OWNER_REPLY_TEXT, TENANT_REPLY_TEXT])
            if (text.includes(words)) leaks.push({ path: url.pathname, words });
        })
        .catch(() => undefined),
    );
  };
  for (const page of pages) page.on("response", listen);
  return async () => {
    for (const page of pages) page.off("response", listen);
    await Promise.all(pending);
    return leaks;
  };
}

/**
 * Measure one read window: run `reads` (pages that only read) and report what they caused. A read
 * window never includes a staff action; it starts after the last one settled.
 */
async function readWindow(ctx, label, pages, reads, safety) {
  const { rehearsal } = ctx;
  for (const page of pages)
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => undefined);
  await pages[0].waitForTimeout(1_500);
  const writesBefore = ctx.writes.length;
  const outsideBefore = await outsideCounts(rehearsal);
  const documentsBefore = await emulatorDocuments(rehearsal).catch(() => null);
  const editorReplyReads = [];
  const stop = watchBodies(ctx, pages, editorReplyReads);
  let result;
  let error = null;
  try {
    result = await reads();
  } catch (failure) {
    error = String(failure?.message ?? failure).slice(0, 400);
  }
  const leaks = await stop();
  // Every status line this window read: none carries a reply's body.
  const statusText = JSON.stringify(result ?? null);
  for (const words of [OWNER_REPLY_TEXT, TENANT_REPLY_TEXT])
    if (statusText.includes(words)) leaks.push({ path: "status lines", words });
  for (const page of pages) {
    if (page.isClosed()) continue;
    const html = await page.content().catch(() => "");
    for (const words of [OWNER_REPLY_TEXT, TENANT_REPLY_TEXT])
      if (html.includes(words)) leaks.push({ path: new URL(page.url()).pathname, words });
  }
  const outsideAfter = await outsideCounts(rehearsal);
  const documentsAfter = await emulatorDocuments(rehearsal).catch(() => null);
  const writes = ctx.writes
    .slice(writesBefore)
    .filter((write) => !/^\/(?:api\/auth\/|__nextjs)/.test(write.path));
  const changed =
    documentsBefore && documentsAfter
      ? Object.keys({ ...documentsBefore, ...documentsAfter }).filter(
          (path) => documentsBefore[path] !== documentsAfter[path],
        )
      : null;
  const window = {
    label,
    writes: writes.map((write) =>
      `${write.role} ${write.path} ${write.kind ?? ""}`.trim(),
    ),
    sent: outsideAfter.sent - outsideBefore.sent,
    lookups: outsideAfter.lookups - outsideBefore.lookups,
    modelRequests:
      outsideAfter.modelRequests === null || outsideBefore.modelRequests === null
        ? null
        : outsideAfter.modelRequests - outsideBefore.modelRequests,
    documentsChanged: changed,
    leaks,
    editorReplyReads: editorReplyReads.length,
    error,
  };
  safety.push(window);
  ctx.record({
    w1208: "read window",
    ...window,
    documentsChanged: changed?.slice(0, 20),
  });
  if (error) throw new Error(`${label}: ${error}`);
  return result;
}

const windowClean = (window) =>
  window.error === null &&
  window.writes.length === 0 &&
  window.sent === 0 &&
  window.lookups === 0 &&
  (window.modelRequests ?? 0) === 0 &&
  Array.isArray(window.documentsChanged) &&
  window.documentsChanged.length === 0 &&
  window.leaks.length === 0;

// ---- Staff actions ----------------------------------------------------------------------------

/** "Check for a reply now" on the step's Now card; resolves once the check settled. */
async function checkForReply(ctx, page, leaseId, step) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, `?step=${step}`);
  await waitForPrimary(ctx, page, () => false, 40_000);
  const button = kit
    .now(page)
    .getByRole("button", { name: "Check for a reply now", exact: true });
  if (!(await kit.shownWithin(button, 30_000))) return { shown: false };
  await button.click();
  await page
    .getByRole("button", { name: /Checking for a reply/ })
    .waitFor({ state: "detached", timeout: 120_000 })
    .catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(2_000);
  return {
    shown: true,
    line: await textOf(kit.now(page).locator('[data-renewal-field="reply-check"] p')),
  };
}

/** The response editor in Full view, opened as staff open it. */
async function responseEditor(ctx, page, leaseId, who) {
  const { kit } = ctx;
  const selector = `#renewal-manual-${who}_response`;
  await kit.openLease(page, leaseId, `?view=full${selector}`);
  const form = page.locator(selector);
  if (!(await kit.shownWithin(form, 20_000))) await kit.reveal(page, selector);
  await form.waitFor({ timeout: 30_000 });
  return form;
}

/** The tenant answer saves only when staff confirm its S276 review. */
async function saveReviewedTenantResponse(ctx, page, form, outcome) {
  const review = form.getByRole("region", {
    name: "Review the tenant's response",
    exact: true,
  });
  const save = review.getByRole("button", { name: "Save", exact: true });
  await save.waitFor({ timeout: 30_000 });
  const response = ctx.kit.appResponse(page, WORKSPACE_ROUTE, {
    match: (body) =>
      body?.action?.kind === "tenant_response" && body.action.outcome === outcome,
    timeout: 60_000,
  });
  await save.click();
  return (await response).status();
}

/**
 * Record "No response" (owner) or "Awaiting response" (tenant) after the reply, as staff do: the
 * response stays at that answer and the source is typed. The owner saves on input and blur; the
 * tenant's form waits for the review's Save.
 */
async function recordStillWaiting(ctx, page, leaseId, who) {
  const { kit } = ctx;
  const form = await responseEditor(ctx, page, leaseId, who);
  const select = form.getByLabel(`${who === "owner" ? "Owner" : "Tenant"} response`, {
    exact: true,
  });
  const waiting = who === "owner" ? "no_response" : "awaiting_response";
  const source = form.getByLabel("Response source or channel (optional)", {
    exact: true,
  });
  if (who === "tenant") {
    if ((await select.inputValue()) !== waiting) await select.selectOption(waiting);
    await source.fill("Phone message left for the tenant; no answer yet");
    return { status: await saveReviewedTenantResponse(ctx, page, form, waiting) };
  }
  const saved = kit.appResponse(page, WORKSPACE_ROUTE, {
    match: (body) => body?.action?.kind === "owner_response",
    timeout: 60_000,
  });
  if ((await select.inputValue()) !== waiting) await select.selectOption(waiting);
  else {
    await source.fill("Phone message left for the owner; no answer yet");
    await source.press("Tab");
  }
  const response = await saved.catch(() => null);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  return { status: response?.status() ?? null };
}

/** The owner's approval in the response editor, as recordOwnerAnswer records it. */
async function recordOwnerApproval(ctx, page, leaseId, amount) {
  const { kit } = ctx;
  const form = await responseEditor(ctx, page, leaseId, "owner");
  await form
    .getByLabel("Owner response", { exact: true })
    .selectOption({ label: "Approved" });
  const approval = form.locator('[data-renewal-field="owner-answer-approval"]');
  await approval.waitFor({ timeout: 30_000 });
  await approval.getByLabel("Amount approved", { exact: true }).fill(String(amount));
  const who = approval.getByLabel("Who approved", { exact: true });
  const owners = await who
    .locator("option")
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.value)
        .filter((value) => value && value !== "representative"),
    );
  if (!owners.length) throw new Error(`Lease ${leaseId} lists no owner of record.`);
  await who.selectOption(owners[0]);
  await approval
    .getByLabel("How they approved", { exact: true })
    .selectOption("conversation");
  await approval
    .getByLabel("Participants", { exact: true })
    .fill("Synthetic owner and renewal staff");
  const when = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(Date.now() - 2 * 60_000))
    .replace(" ", "T");
  await approval.getByLabel("When they approved", { exact: true }).fill(when);
  await approval
    .getByRole("button", { name: "Review the owner's answer", exact: true })
    .click();
  const review = page.getByRole("region", { name: "Review the owner's answer" });
  await review.waitFor({ timeout: 30_000 });
  const saved = kit.appResponse(page, WORKSPACE_ROUTE, {
    match: (body) => body?.action?.kind === "owner_response",
  });
  await review
    .getByRole("button", { name: "Save the owner's answer", exact: true })
    .click();
  return { status: (await saved).status() };
}

/** The tenant's acceptance, then the offer it answers, in the tenant response editor. */
async function recordTenantAcceptance(ctx, page, leaseId, sequenceId) {
  const { kit } = ctx;
  const form = await responseEditor(ctx, page, leaseId, "tenant");
  await form.getByLabel("Tenant response", { exact: true }).selectOption("accepted");
  const accepted = await saveReviewedTenantResponse(ctx, page, form, "accepted");
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  const answer = form.locator('[data-renewal-offer-answer="tenant"]');
  const which = answer.getByLabel("Which offer does this answer respond to?", {
    exact: true,
  });
  let linked = null;
  let offered = null;
  if (await kit.shownWithin(which, 30_000)) {
    const values = await which
      .locator("option")
      .evaluateAll((nodes) => nodes.map((node) => node.value));
    const choice = sequenceId
      ? values.find((value) => value.startsWith(`sent:${sequenceId}:`))
      : null;
    if (choice) {
      offered = choice.split(":")[0];
      await which.selectOption(choice);
      const saved = kit.appResponse(page, WORKSPACE_ROUTE, {
        match: (body) =>
          body?.action?.kind === "tenant_response" &&
          body.action.outcome === "accepted" &&
          body.offer?.sequenceId === sequenceId,
        timeout: 60_000,
      });
      await answer
        .getByRole("button", { name: "Record the offer this answers", exact: true })
        .click();
      linked = (await saved.catch(() => null))?.status() ?? null;
      await page
        .waitForLoadState("networkidle", { timeout: 30_000 })
        .catch(() => undefined);
    }
  }
  return { accepted, offered, linked };
}

/** The check's fix in the stage line, followed as staff follow it, on the current step. */
async function followFix(ctx, page, leaseId, who) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId);
  await waitForPrimary(ctx, page, () => false, 30_000);
  const link = page.locator('[data-renewal-field="check-fix"]').first();
  if (!(await kit.shownWithin(link, 15_000))) return { shown: false };
  await link.click();
  const target = page.locator(`#renewal-manual-${who}_response`);
  const visible = await kit.shownWithin(target, 20_000);
  await page.waitForTimeout(1_500);
  const focused = await page.evaluate((id) => {
    const element = document.getElementById(id);
    return Boolean(
      element && document.activeElement && element.contains(document.activeElement),
    );
  }, `renewal-manual-${who}_response`);
  return { shown: true, visible, focused, url: new URL(page.url()).search };
}

/** Ask the owner: the step's Schedule, the dialog's own date and time, then confirm. */
async function scheduleOwnerMessage(ctx, page, leaseId) {
  await reachPrimary(ctx, page, leaseId, "ask-owner", "Review owner message");
  const trigger = await stepScheduleButton(ctx, page);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Review and schedule" });
  await dialog
    .locator('[data-renewal-field="exact-review"]')
    .waitFor({ timeout: 120_000 });
  return confirmReview(ctx, page, dialog, "Schedule this message", "schedule");
}

// ---- Readiness, watched at every rendered moment (AC-S279-5) ------------------------------------

/**
 * Installed before any page script on every load of the watching page: at each DOM mutation, each
 * message section's readiness rows are read beside that section's message preview. A fact whose
 * row reads Ready while the preview still carries its missing marker is reported at once.
 */
function readinessWatcher(markers) {
  const facts = Object.entries(markers).map(([fact, entry]) => ({
    fact,
    row: new RegExp(entry.row.source, entry.row.flags),
    marker: entry.marker,
  }));
  let scheduled = false;
  let last = "";
  const inspect = () => {
    scheduled = false;
    const sections = document.querySelectorAll("section.renewal-now-message");
    const seen = [];
    for (const section of sections) {
      const rows = [
        ...section.querySelectorAll(
          'ul[aria-label="What sending needs"] li[data-renewal-ready]',
        ),
      ];
      const preview = (
        section.querySelector('[data-renewal-field="message-preview"]')?.textContent ?? ""
      ).toLowerCase();
      if (!rows.length || !preview) continue;
      for (const { fact, row, marker } of facts) {
        const item = rows.find((entry) => row.test((entry.textContent ?? "").trim()));
        if (!item) continue;
        const ready = item.getAttribute("data-renewal-ready") === "ready";
        const marked = preview.includes(marker);
        seen.push({ fact, ready, marked });
      }
    }
    // Each distinct rendered state once; a contradiction is always among them.
    const signature = JSON.stringify(seen);
    if (!seen.length || signature === last) return;
    last = signature;
    window.__w1208Readiness?.({ at: Date.now(), seen });
  };
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(inspect);
  }).observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  });
}

/** A fresh Editor page that reports every rendered readiness state. */
async function watchedEditorPage(ctx) {
  const page = await ctx.newPage("Editor");
  const samples = [];
  await page.exposeFunction("__w1208Readiness", (sample) => {
    samples.push(sample);
  });
  await page.addInitScript(readinessWatcher, {
    rent: {
      row: { source: MARKERS.rent.row.source, flags: "i" },
      marker: MARKERS.rent.marker,
    },
    signature: {
      row: { source: MARKERS.signature.row.source, flags: "i" },
      marker: MARKERS.signature.marker,
    },
  });
  return { page, samples };
}

/** Prepare a lease not yet prepared, then the saves that feed its list, all watched. */
async function readinessJourney(ctx, log) {
  const { kit, leases } = ctx;
  const { page, samples } = await watchedEditorPage(ctx);
  const candidates = ["missingRecipient", "replied", "assisted", "covered"]
    .map((role) => leases[role]?.leaseId)
    .filter(Boolean);
  let leaseId = null;
  let prepared = null;
  for (const candidate of candidates) {
    await kit.openLease(page, candidate, "?step=compare-market");
    await waitForPrimary(ctx, page, () => false, 30_000);
    const button = page.getByRole("button", { name: "Prepare this lease", exact: true });
    if (!(await kit.shownWithin(button, 5_000))) continue;
    leaseId = candidate;
    const answer = kit.appResponse(page, "/api/lease-renewal/kickoff-preparation", {
      timeout: 180_000,
    });
    await button.click();
    const response = await answer.catch(() => null);
    await page
      .waitForLoadState("networkidle", { timeout: 60_000 })
      .catch(() => undefined);
    await page.waitForTimeout(3_000);
    prepared = {
      leaseId,
      status: response?.status() ?? null,
      message: await textOf(page.getByRole("status").filter({ hasText: /./ })),
    };
    break;
  }
  log.push({ phase: "prepare", prepared });
  leaseId ??= String(leases.prepared.leaseId);
  // The owner message's own list and preview, then each save that feeds them.
  await kit.openLease(page, leaseId, "?step=ask-owner");
  await waitForPrimary(ctx, page, () => false, 40_000);
  await kit.openLease(page, leaseId, "?view=full");
  await kit.reveal(page, "#renewal-now-rent-to-recommend", 30_000);
  const rent = page.locator("input#renewal-now-rent-to-recommend").first();
  const saves = [];
  if (await kit.shownWithin(rent, 10_000)) {
    // Typed, cleared and typed again: the message's marker and the row move together each time.
    const before = await rent.inputValue();
    const basis = await textOf(page.locator('[data-renewal-field="rent-basis"]'));
    const suggested = Number(
      (/Suggested \$([\d,]+(?:\.\d+)?)/.exec(basis ?? "")?.[1] ?? "").replace(/,/g, ""),
    );
    const amount = String(
      Number(before) > 0
        ? Number(before)
        : suggested > 0
          ? suggested
          : Number(leases.byId(leaseId)?.rent ?? 1500) + 25,
    );
    const values = before ? ["", amount] : [amount, "", amount];
    for (const value of values) {
      const saved = kit.appResponse(page, WORKING_ROUTE, {
        match: (body) => body?.field === "terms_rent",
        timeout: 60_000,
      });
      await rent.fill(value);
      await rent.press("Tab");
      saves.push({
        field: "Rent to recommend",
        value,
        status: (await saved.catch(() => null))?.status() ?? null,
      });
      await page
        .waitForLoadState("networkidle", { timeout: 30_000 })
        .catch(() => undefined);
      await page.waitForTimeout(4_000);
    }
  } else saves.push({ field: "Rent to recommend", shown: false });
  const reason = page.getByLabel("Reason to include", { exact: true }).first();
  if (await kit.shownWithin(reason, 10_000)) {
    await reason.fill("Current market conditions in the neighborhood");
    await reason.press("Tab");
    await page
      .waitForLoadState("networkidle", { timeout: 30_000 })
      .catch(() => undefined);
    await page.waitForTimeout(4_000);
    saves.push({ field: "Reason to include", shown: true });
  } else saves.push({ field: "Reason to include", shown: false });
  await kit.openLease(page, leaseId, "?step=ask-owner");
  await waitForPrimary(ctx, page, () => false, 40_000);
  await page.waitForTimeout(3_000);
  log.push({ phase: "saves", leaseId, saves });
  const contradictions = samples.flatMap((sample) =>
    sample.seen
      .filter((entry) => entry.ready && entry.marked)
      .map((entry) => ({ at: sample.at, fact: entry.fact })),
  );
  const states = {};
  for (const sample of samples)
    for (const entry of sample.seen)
      states[
        `${entry.fact} ${entry.ready ? "ready" : "missing"}${entry.marked ? " marked" : ""}`
      ] = true;
  await page.close().catch(() => undefined);
  return {
    leaseId,
    prepared,
    saves,
    samples: samples.length,
    states: Object.keys(states),
    contradictions,
  };
}

// ---- The row ------------------------------------------------------------------------------------

/** Record a long observation in parts the notes file keeps whole. */
function note(ctx, label, value) {
  const text = JSON.stringify(value);
  for (let index = 0, part = 1; index < text.length; index += 1_700, part += 1)
    ctx.record({ w1208: label, part, text: text.slice(index, index + 1_700) });
}

/**
 * W12-08 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1208 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S279-1 to AC-S279-6 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1208(ctx, page, start) {
  const { kit, rehearsal } = ctx;
  const leaseId = String(ctx.leases.prepared.leaseId);
  const ownerAddress = kit.ownerAddresses(leaseId)[0];
  const tenantAddress = kit.tenantAddresses(leaseId)[0];
  const safety = [];
  const failures = {};
  const reads = {};
  const actions = {};
  const fail = (id, reason) => {
    (failures[id] ??= []).push(String(reason).slice(0, 400));
  };
  let starting = start;
  if (starting.error) {
    ctx.record({ w1208: "starting sequence stopped", error: starting.error });
    await ctx.resetState();
    try {
      const again = await journeyW1208(ctx, page);
      starting = { observed: again.observed, steps: again.steps, error: null };
    } catch (failure) {
      starting = {
        observed: null,
        steps: [],
        error: String(failure?.message ?? failure),
      };
    }
  }
  note(ctx, "starting sequence", { error: starting.error, observed: starting.observed });

  const approver = await ctx.newPage("Approver");
  const both = async (label, step) =>
    readWindow(
      ctx,
      label,
      [page, approver],
      async () => ({
        editor: await readLease(ctx, page, leaseId, step),
        approver: await readLease(ctx, approver, leaseId, step),
      }),
      safety,
    );
  const editorOnly = async (label, step) =>
    readWindow(
      ctx,
      label,
      [page],
      async () => readLease(ctx, page, leaseId, step),
      safety,
    );

  // ---- Part A --------------------------------------------------------------------------------
  const partA = async () => {
    if (starting.error) throw new Error(`starting sequence: ${starting.error}`);
    reads.R1 = await both(
      "R1 confirmed send, Editor's linked thread refreshed",
      "ask-owner",
    );
    note(ctx, "R1", reads.R1);
    // The notice rules line for an Admin, and a browser with no staff session.
    const admin = await ctx.newPage("Admin");
    reads.admin = await readWindow(
      ctx,
      "R1 Admin",
      [admin],
      async () => {
        const read = await readLease(ctx, admin, leaseId, "ask-owner");
        const link = admin
          .locator(
            '#renewal-card-follow-up [data-renewal-field="notice-rules-unconfirmed"] a',
          )
          .first();
        await kit.openLease(admin, leaseId, "?view=full");
        await kit.reveal(admin, "#renewal-card-follow-up", 30_000);
        let opened = null;
        if (await kit.shownWithin(link, 15_000)) {
          await link.click();
          await admin.waitForURL(/\/admin/, { timeout: 120_000 }).catch(() => undefined);
          const panel = admin.locator("#admin-renewal-notice-rules");
          opened = {
            url: `${new URL(admin.url()).pathname}${new URL(admin.url()).search}${new URL(admin.url()).hash}`,
            panelShown: await kit.shownWithin(panel, 60_000),
          };
        }
        return { read, opened };
      },
      safety,
    );
    await admin.close().catch(() => undefined);
    note(ctx, "R1 Admin", reads.admin);
    const outside = await ctx.newPage("Approver");
    reads.signedOut = await readWindow(
      ctx,
      "R1 signed out",
      [outside],
      async () => {
        await kit.openPath(outside, "/");
        const signOut = outside
          .getByRole("button", { name: "Sign out", exact: true })
          .first();
        const signedOut = await kit.shownWithin(signOut, 30_000);
        if (signedOut) {
          await signOut.click();
          await outside
            .waitForURL(/\/sign-in/, { timeout: 60_000 })
            .catch(() => undefined);
        }
        await outside
          .goto(ctx.origin + kit.href(leaseId, "?step=ask-owner"), {
            waitUntil: "domcontentloaded",
            timeout: 120_000,
          })
          .catch(() => undefined);
        await outside
          .waitForLoadState("networkidle", { timeout: 30_000 })
          .catch(() => undefined);
        const body = await outside
          .evaluate(() => document.body.innerText)
          .catch(() => "");
        const workspace = await kit
          .readStatus(outside, `${WORKSPACE_ROUTE}?leaseId=${leaseId}`)
          .catch((error) => ({ status: null, body: String(error) }));
        return {
          signOutShown: signedOut,
          path: new URL(outside.url()).pathname,
          stageLines: await outside.locator('[data-renewal-field="stage-line"]').count(),
          waitingWords: /Waiting on|Needs a check|Last contact|replied/i.test(body),
          workspaceStatus: workspace.status,
          workspaceCarriesStatus: /stageLine|leaseWaiting|waiting/i.test(
            JSON.stringify(workspace.body ?? ""),
          ),
        };
      },
      safety,
    );
    await outside.close().catch(() => undefined);
    note(ctx, "R1 signed out", reads.signedOut);

    actions.ownerReplyCheck = await checkForReply(ctx, page, leaseId, "ask-owner");
    reads.R2 = await both("R2 owner reply observed", "ask-owner");
    note(ctx, "R2", { actions: actions.ownerReplyCheck, reads: reads.R2 });

    actions.ownerStillWaiting = await recordStillWaiting(ctx, page, leaseId, "owner");
    reads.R3 = await both("R3 owner disagreement", null);
    actions.ownerFix = await followFix(ctx, page, leaseId, "owner");
    note(ctx, "R3", {
      actions: [actions.ownerStillWaiting, actions.ownerFix],
      reads: reads.R3,
    });

    const amount = Number(ctx.leases.byId(leaseId)?.rent ?? 0) + 50;
    actions.ownerApproval = await recordOwnerApproval(ctx, page, leaseId, amount);
    actions.dates = await enterRenewalDates(ctx, page, leaseId, {
      start: "day-after",
      end: FIRST_TERM_END,
    });
    actions.tenantSend = await sendTenantOffer(ctx, page, leaseId);
    note(ctx, "tenant offer", {
      approval: actions.ownerApproval,
      dates: actions.dates,
      send: { status: actions.tenantSend.status, alert: actions.tenantSend.alert },
    });
    if (actions.tenantSend.status !== 200)
      throw new Error(`The tenant offer was not sent: ${actions.tenantSend.alert}`);
    reads.R4 = await editorOnly(
      "R4 tenant offer confirmed, older owner thread",
      "offer-tenant",
    );
    note(ctx, "R4", reads.R4);

    await deliverOwnerReply(rehearsal, { to: tenantAddress, text: TENANT_REPLY_TEXT });
    actions.tenantReplyCheck = await checkForReply(ctx, page, leaseId, "offer-tenant");
    reads.R5 = await editorOnly("R5 tenant reply observed", "offer-tenant");
    note(ctx, "R5", { actions: actions.tenantReplyCheck, reads: reads.R5 });

    actions.tenantStillWaiting = await recordStillWaiting(ctx, page, leaseId, "tenant");
    reads.R6 = await both("R6 tenant disagreement", null);
    actions.tenantFix = await followFix(ctx, page, leaseId, "tenant");
    note(ctx, "R6", {
      actions: [actions.tenantStillWaiting, actions.tenantFix],
      reads: reads.R6,
    });

    actions.acceptance = await recordTenantAcceptance(
      ctx,
      page,
      leaseId,
      actions.tenantSend.sequenceId,
    );
    reads.R7 = await editorOnly("R7 tenant acceptance recorded", "offer-tenant");
    note(ctx, "R7", { actions: actions.acceptance, reads: reads.R7 });
  };

  // ---- Part B --------------------------------------------------------------------------------
  const partB = async () => {
    await ctx.resetState();
    const log = [];
    try {
      reads.readiness = await readinessJourney(ctx, log);
    } catch (failure) {
      reads.readiness = { error: String(failure?.message ?? failure).slice(0, 400), log };
    }
    note(ctx, "readiness", reads.readiness);
    actions.scheduled = await scheduleOwnerMessage(ctx, page, leaseId);
    if (actions.scheduled.status !== 200)
      throw new Error(`The owner message was not scheduled: ${actions.scheduled.alert}`);
    reads.R8 = await editorOnly("R8 owner message scheduled", "ask-owner");
    note(ctx, "R8", { action: actions.scheduled, reads: reads.R8 });
    // Time passes only through the worker tick. A tick that waits on a lease read in flight sends
    // nothing; the next one does, as the minute worker would.
    const ticks = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const tick = await kit.tick(actions.scheduled.sequenceId);
      ticks.push({
        sent: tick?.sent ?? null,
        held: tick?.held ?? null,
        waited: tick?.waited ?? null,
        paused: tick?.paused ?? null,
        failures: tick?.failures ?? null,
      });
      if ((tick?.sent ?? 0) > 0 || (tick?.held ?? 0) > 0 || (tick?.paused ?? 0) > 0)
        break;
    }
    actions.tick = {
      ticks,
      ownerMessages: (await kit.sentTo([ownerAddress])).length,
    };
    reads.R9 = await editorOnly(
      "R9 scheduled owner message sent by the worker",
      "ask-owner",
    );
    note(ctx, "R9", { tick: actions.tick, reads: reads.R9 });
    actions.bounce = await bounceSentMessage(rehearsal, { to: ownerAddress })
      .then(() => "returned")
      .catch((error) => String(error?.message ?? error).slice(0, 200));
    actions.bounceCheck = await checkForReply(ctx, page, leaseId, "ask-owner");
    reads.R10 = await editorOnly("R10 owner message bounced", "ask-owner");
    note(ctx, "R10", {
      actions: [actions.bounce, actions.bounceCheck],
      reads: reads.R10,
    });
  };

  let partAError = null;
  try {
    await partA();
  } catch (failure) {
    partAError = String(failure?.message ?? failure).slice(0, 600);
    ctx.record({ w1208: "part A stopped", error: partAError });
  }
  let partBError = null;
  try {
    await partB();
  } catch (failure) {
    partBError = String(failure?.message ?? failure).slice(0, 600);
    ctx.record({ w1208: "part B stopped", error: partBError });
  }

  // ---- AC-S279-1: one source for waiting ------------------------------------------------------
  const states = {
    "confirmed send, Editor's linked thread refreshed (Editor)": reads.R1?.editor,
    "confirmed send, Editor's linked thread refreshed (Approver)": reads.R1?.approver,
    "confirmed send, no reply (tenant)": reads.R4,
    "confirmed send, no reply (owner, worker)": reads.R9,
    scheduled: reads.R8,
    "reply (owner)": reads.R2?.editor,
    "reply (tenant)": reads.R5,
    bounce: reads.R10,
    "tenant acceptance recorded": reads.R7,
  };
  const agreements = {};
  for (const [state, read] of Object.entries(states)) {
    if (!read) {
      fail("AC-S279-1", `${state}: not read`);
      continue;
    }
    agreements[state] = agreement(read);
    if (!agreements[state].agree)
      fail("AC-S279-1", `${state}: ${agreements[state].problems.join("; ")}`);
  }
  // Each state is the one named: the step reads it.
  if (
    reads.R8 &&
    !/scheduled/i.test(`${reads.R8.guided.stageLine} ${reads.R8.guided.waiting}`)
  )
    fail("AC-S279-1", "R8 does not read as a scheduled message");
  if (
    reads.R2 &&
    !/replied/i.test(
      `${reads.R2.editor.guided.stageLine} ${reads.R2.editor.guided.nowDetail}`,
    )
  )
    fail("AC-S279-1", "R2 does not read as an owner reply");
  if (
    reads.R5 &&
    !/replied/i.test(`${reads.R5.guided.stageLine} ${reads.R5.guided.nowDetail}`)
  )
    fail("AC-S279-1", "R5 does not read as a tenant reply");
  if (
    reads.R10 &&
    !/deliver|bounce|address/i.test(
      `${reads.R10.guided.stageLine} ${reads.R10.guided.nowDetail}`,
    )
  )
    fail("AC-S279-1", "R10 does not read as a failed delivery");
  for (const [name, read] of Object.entries(reads))
    for (const entry of name.startsWith("R")
      ? [read?.editor ?? read, read?.approver].filter(Boolean)
      : [])
      if (entry?.full?.unresolvedSource || entry?.guided?.unresolvedSource)
        fail("AC-S279-1", `${name}: reads "an unresolved source"`);

  // ---- AC-S279-2: the same status for every staff member --------------------------------------
  const linksDiffer =
    (reads.R1?.editor.full.linkedThreadControls ?? 0) > 0 &&
    reads.R1?.approver.full.linkedThreadControls === 0;
  if (!linksDiffer)
    fail("AC-S279-2", "the Editor and the Approver do not have different mailbox links");
  for (const name of ["R1", "R2", "R3", "R6"]) {
    const pair = reads[name];
    if (!pair) fail("AC-S279-2", `${name}: not read`);
    else if (!sameStatus(pair.editor, pair.approver))
      fail(
        "AC-S279-2",
        `${name}: ${JSON.stringify({ editor: statusOf(pair.editor), approver: statusOf(pair.approver) }).slice(0, 300)}`,
      );
  }
  const out = reads.signedOut;
  if (
    !out ||
    !out.signOutShown ||
    out.stageLines !== 0 ||
    out.waitingWords ||
    !(out.workspaceStatus >= 400) ||
    out.workspaceCarriesStatus
  )
    fail("AC-S279-2", `a reader without access read a status: ${JSON.stringify(out)}`);

  // ---- AC-S279-3: like with like ---------------------------------------------------------------
  for (const [name, read] of [
    ["R1 Editor", reads.R1?.editor],
    ["R1 Approver", reads.R1?.approver],
    ["R4", reads.R4],
    ["R9", reads.R9],
  ]) {
    if (!read) fail("AC-S279-3", `${name}: not read`);
    else if (!noCheck(read))
      fail("AC-S279-3", `${name}: a check after an app-confirmed send`);
  }
  if (!/^Waiting on the tenant since /.test(reads.R4?.guided.waiting ?? ""))
    fail("AC-S279-3", "R4 is not waiting on the tenant after the confirmed send");
  if (
    actions.tick?.ownerMessages !== 1 ||
    !/^Waiting on the owner since /.test(reads.R9?.guided.waiting ?? "")
  )
    fail(
      "AC-S279-3",
      `R9: the worker's send was not confirmed: ${JSON.stringify(actions.tick)}`,
    );
  for (const [name, who, fix] of [
    ["R3", "owner", actions.ownerFix],
    ["R6", "tenant", actions.tenantFix],
  ]) {
    if (actions[`${who}StillWaiting`]?.status !== 200)
      fail("AC-S279-3", `${name}: the recorded waiting answer was not saved`);
    const pair = reads[name];
    if (!pair) {
      fail("AC-S279-3", `${name}: not read`);
      continue;
    }
    for (const role of ["editor", "approver"])
      if (!checkShownOnce(pair[role], who))
        fail(
          "AC-S279-3",
          `${name} ${role}: "${pair[role].guided.stageLine}" (${pair[role].guided.checkWordsOnScreen}/${pair[role].full.checkWordsOnScreen} on screen)`,
        );
    if (!(fix?.shown && fix.visible && fix.focused))
      fail(
        "AC-S279-3",
        `${name}: the fix did not open the ${who} response editor: ${JSON.stringify(fix)}`,
      );
  }

  // ---- AC-S279-4: the stage after an acceptance, and the policy line --------------------------
  const R7 = reads.R7;
  if (!R7) fail("AC-S279-4", "R7: not read");
  else {
    if (
      actions.acceptance?.accepted !== 200 ||
      actions.acceptance.offered !== "sent" ||
      actions.acceptance.linked !== 200
    )
      fail(
        "AC-S279-4",
        `the acceptance was not recorded: ${JSON.stringify(actions.acceptance)}`,
      );
    if (/Preparing tenant offer/i.test(`${R7.guided.stageLine} ${R7.desk.stage}`))
      fail("AC-S279-4", `the stage reads "${R7.guided.stageLine}"`);
    if (!AFTER_OFFER_STAGES.some((stage) => R7.guided.stageLine.startsWith(stage)))
      fail("AC-S279-4", `the stage names no outstanding work: "${R7.guided.stageLine}"`);
    if (R7.desk.stage !== R7.guided.stageLine)
      fail("AC-S279-4", `the desk row reads "${R7.desk.stage}"`);
  }
  for (const [name, read] of [
    ["Editor", reads.R1?.editor],
    ["Approver", reads.R1?.approver],
  ]) {
    if (!read) fail("AC-S279-4", `${name}: no policy line read`);
    else if (read.full.policy !== POLICY_LINE || read.full.policyLinks !== 0)
      fail(
        "AC-S279-4",
        `${name} reads "${read.full.policy}" with ${read.full.policyLinks} link(s)`,
      );
    if (read?.full.oldPolicyWords || read?.guided.oldPolicyWords)
      fail("AC-S279-4", `${name} still reads the old policy next step`);
  }
  const adminRead = reads.admin?.read;
  if (
    !adminRead ||
    adminRead.full.policy !== POLICY_LINE ||
    adminRead.full.policyLinks !== 1 ||
    adminRead.full.policyHref !== POLICY_HREF ||
    adminRead.full.policyLinkText !== POLICY_PLACE ||
    !reads.admin.opened?.panelShown
  )
    fail(
      "AC-S279-4",
      `the Admin's policy line: ${JSON.stringify({ policy: adminRead?.full.policy, href: adminRead?.full.policyHref, opened: reads.admin?.opened })}`,
    );

  // ---- AC-S279-5: one read behind the readiness list ------------------------------------------
  const readiness = reads.readiness;
  if (!readiness || readiness.error) fail("AC-S279-5", `not run: ${readiness?.error}`);
  else {
    if (readiness.prepared?.status !== 200)
      fail("AC-S279-5", `Prepare did not run: ${JSON.stringify(readiness.prepared)}`);
    if (readiness.samples === 0) fail("AC-S279-5", "no readiness list was rendered");
    if (readiness.contradictions.length)
      fail(
        "AC-S279-5",
        `ready beside missing: ${JSON.stringify(readiness.contradictions.slice(0, 5))}`,
      );
    if (
      !readiness.states.some((state) => /^rent missing/.test(state)) ||
      !readiness.states.some((state) => /^rent ready/.test(state))
    )
      fail(
        "AC-S279-5",
        `the saves did not move the rent row: ${readiness.states.join(", ")}`,
      );
    if (readiness.saves.some((save) => save.status !== undefined && save.status !== 200))
      fail("AC-S279-5", `a save failed: ${JSON.stringify(readiness.saves)}`);
  }

  // ---- AC-S279-6: reads cause nothing ---------------------------------------------------------
  if (safety.length < 10) fail("AC-S279-6", `only ${safety.length} read windows ran`);
  for (const window of safety)
    if (!windowClean(window))
      fail(
        "AC-S279-6",
        `${window.label}: ${JSON.stringify({ ...window, documentsChanged: window.documentsChanged?.slice(0, 8) })}`,
      );

  if (partAError) fail("AC-S279-1", `part A stopped: ${partAError}`);
  if (partBError) fail("AC-S279-1", `part B stopped: ${partBError}`);
  note(ctx, "agreements", agreements);
  note(ctx, "failures", failures);
  return Object.fromEntries(W1208_CHECKS.map((id) => [id, !failures[id]]));
}
