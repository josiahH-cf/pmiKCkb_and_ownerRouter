// S284 W12-11, "Clear an off-cycle hold": the candidate-side acceptance checks of S282 (intake
// 160) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-off-cycle-end-date-review.md (S282).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S282-1, AC-S282-2, AC-S282-3, AC-S282-4, AC-S282-5
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Open the off-cycle lease, read the readiness row and the button, record "Include" with a
//   reason, then change the source end date and correct it to a month end.
//
// Starting sequence (journeyW1211 in one-path-november-12-journeys.mjs, the fail-first table):
//   Open the off-cycle lease and look for a control that clears the block. On the baseline: None
//   exists; five readiness rows read Ready. It runs unchanged on the candidate: its clearing-control
//   count already names the "Include" radio the candidate adds.
//
// What the checks do, in order, on the off-cycle lease (ctx.options.offCycleLeaseId, 9106 in the
// fixture) and only through what staff use:
//   1. With the block standing (no review yet): the owner and tenant "What sending needs" lists, the
//      current step's Now card button and where that button lands (AC-S282-4).
//   2. The desk's counts and the lease's row reason before any decision.
//   3. Save with a decision and no reason: refused in place (AC-S282-1).
//   4. "Keep on hold" with a reason: the stored record and its audit entry, the hold line on the
//      Now card and the stage line, the desk reason and unchanged desk counts (AC-S282-1/2).
//   5. A second Editor opens Check the numbers; the first records "Include". The second page's
//      save, on the version it read, is refused with nothing stored (AC-S282-1, stale version).
//   6. After "Include": the off-cycle hold gone from the Now card. The fixture's off-cycle lease
//      ended before the business date, so the cohort's next hold, "Lease term needs review", stood
//      behind it; staff record the term with its own control on Check the numbers, and then the
//      step's own action leads the Now card. Both readiness lists cleared and agreeing with it,
//      the desk reason, the lease in its month's working batch, and that month's "Prepare" run
//      treating the lease as a target (AC-S282-2, AC-S282-4).
//   7. The source end date (the RentVine stand-in, through the rehearsal's setSourceCycleDate hook,
//      then "Refresh data" as staff do) changes to another off-cycle value, then to the month end,
//      then back to the original value (AC-S282-3).
//   Every review save is measured for sends, provider calls (the server's network log), billed
//   lookups and source values (AC-S282-5).
//
// AC-S282-1 also names a read-only role. The local demo roles (Editor, Approver, Admin) each hold
// the edit capability; the product's one read-only identity is a verification account
// (lib/auth/canary-policy.ts). A third page signs one in the way it signs in, through Google, here
// the rehearsal's own Auth emulator, and the app's session route, then reads the decision and tries
// to save. When that sign-in cannot be made, AC-S282-1 is left out (not recorded, the row
// UNVERIFIED) rather than reported as passed; every other part of it is still run and recorded.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  setSourceCycleDate,
  standInState,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import { plainValue } from "./one-path-november-10-kit.mjs";
import { refreshData, waitForPrimary } from "./one-path-november-12-journeys.mjs";
import { DESK, KICKOFF_ROUTE, WORKSPACE_ROUTE } from "./one-path-november-12-kit.mjs";

/** The words and controls S282 settles (lib/lease-renewal/off-cycle-review.ts). */
const FIX = "Review the lease end date";
const READINESS_KEY = "off_cycle_end_date";
const READINESS_TEXT = "Lease end date: needs review (off-cycle)";
const FORM = "#renewal-off-cycle-review";
const INCLUDE_ID = "renewal-off-cycle-review-include";
const HOLD_ID = "renewal-off-cycle-review-hold";
const REASON_REQUIRED = "Enter a short reason for this decision.";
const CONFLICT = /Another operator changed this item/;
const HOLD_REASON = "Synthetic hold: the owner confirms the mid-month end first";
const INCLUDE_REASON = "Synthetic: the mid-month end matches the signed lease";
const STALE_REASON = "Synthetic: a second reviewer on an older copy";
const READER_REASON = "Synthetic: a read-only reviewer tries to save";
const TERM_REVIEW_ROUTE = "/api/lease-renewal/term-review";
const TERM_CONTEXT = "Synthetic: fixed term, checked against the lease";
/** The verification account the canary policy reads only (lib/auth/canary-policy.ts). */
const VERIFICATION_EMAIL = "canary-editor@pmikcmetro.com";
/** The desk's every-lease table and the work record's emulator collections. */
const DESK_TABLE = `${DESK}?v=2&scope=all`;
const HEADS = ["lease_renewal_workspaces", "lease_renewal_lease_bound_workspaces"];
const ACTIVITY = "lease_renewal_workspace_activity";
/** The development server's own registry lookups, which the network guard refuses as expected. */
const HARNESS_HOSTS = new Set(["registry.npmjs.org"]);

const usDate = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const squash = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
const plainFields = (fields) =>
  Object.fromEntries(
    Object.entries(fields ?? {}).map(([key, value]) => [key, plainValue(value)]),
  );
const workspaceDocId = (leaseId) =>
  createHash("sha256").update(String(leaseId)).digest("hex");
/** The visible text of the first match, or "" at once when nothing matches (no 60 s wait). */
async function textIfAny(locator) {
  if (!(await locator.count())) return "";
  return squash(
    await locator
      .first()
      .innerText({ timeout: 5_000 })
      .catch(() => ""),
  );
}

/** The last day of the ISO date's month. */
function monthEndOf(iso) {
  const [year, month] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}
function shiftDays(iso, days) {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
/** Another date in the same month that is not a month end: two days later, else earlier. */
function otherOffCycleDate(iso) {
  const end = monthEndOf(iso);
  for (const days of [2, 1, -2, -1]) {
    const candidate = shiftDays(iso, days);
    if (candidate.slice(0, 7) === iso.slice(0, 7) && candidate !== end) return candidate;
  }
  return null;
}
/** The Central calendar day of an instant, as staff read it (MM/DD/YYYY). */
function centralDay(instant) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.month}/${parts.day}/${parts.year}`;
}

// ---- Reads: pages, GET routes, the emulator and the stand-ins only ------------------------------

/** The lease's current work record head from the rehearsal's emulator, or null. */
async function workRecord(kit, leaseId) {
  const id = workspaceDocId(leaseId);
  for (const collection of HEADS) {
    const document = await kit.readDocument(`${collection}/${id}`);
    if (document)
      return {
        collection,
        updateTime: document.updateTime ?? null,
        state: plainFields(document.fields),
      };
  }
  return null;
}
async function auditEntry(kit, operationId) {
  if (!/^[A-Za-z0-9_-]+$/.test(String(operationId ?? ""))) return null;
  const document = await kit.readDocument(`${ACTIVITY}/${operationId}`);
  return document ? plainFields(document.fields) : null;
}

/** The server's provider boundary log (served and refused provider requests), parsed. */
function serverNetworkLog(rehearsal) {
  const file = rehearsal.files?.networkLog;
  if (!file || !existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

/** What a review save could reach beyond its own record: mail, comparisons, messages, providers. */
async function effectsMark(ctx, leaseId) {
  const state = await standInState(ctx.rehearsal);
  const messages = (state.mail?.mailboxes ?? []).flatMap((box) => box.messages ?? []);
  const sequences = await ctx.kit.sequences(leaseId);
  return {
    log: serverNetworkLog(ctx.rehearsal).length,
    sent: messages.filter((message) => (message.labelIds ?? []).includes("SENT")).length,
    drafts: messages.filter((message) => (message.labelIds ?? []).includes("DRAFT"))
      .length,
    comparisons: JSON.stringify(state.comparison ?? null),
    sequences: JSON.stringify(
      sequences.map((sequence) => [sequence.state ?? null, sequence.version ?? null]),
    ),
  };
}
/** The provider requests the server made since `log` (a mark), apart from the harness's own. */
function providerCallsSince(rehearsal, log) {
  return serverNetworkLog(rehearsal)
    .slice(log)
    .filter((entry) => entry.served || entry.refused)
    .filter((entry) => !(entry.refused && HARNESS_HOSTS.has(String(entry.host ?? ""))))
    .map((entry) => ({
      served: entry.served ?? null,
      refused: entry.refused ?? null,
      host: entry.host ?? null,
      path: entry.path ?? null,
    }));
}

/** The current step's Now card: its one primary action, its text and the header stage line. */
async function readNow(ctx, page, leaseId, matches = () => false) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId);
  const primary = await waitForPrimary(ctx, page, matches);
  return {
    primary,
    now: (await kit.visibleText(kit.now(page))).slice(0, 900),
    stageLine: await textIfAny(page.locator('[data-renewal-field="stage-line"]')),
    heading: await textIfAny(page.locator("#renewal-now-heading")),
    // A blocker shows as an alert notice above the button it replaces the step's action with.
    alerts: await kit.now(page).locator('p.renewal-notice[role="alert"]').count(),
  };
}

/** One message step's "What sending needs" list, as staff read it, with its Now card's action. */
async function readinessOn(ctx, page, leaseId, step) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, `?step=${step}`);
  const primary = await waitForPrimary(ctx, page);
  // S281 groups the two readiness lists under their respective Message summaries.
  const channel = step === "ask-owner" ? "owner" : "tenant";
  const selector = `[data-renewal-message-work="${channel}"] ul[aria-label="What sending needs"]`;
  const list = page.locator(selector);
  const shown = await kit.reveal(page, selector, 30_000);
  const rows = shown
    ? await list
        .locator(":scope > li")
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            key: node.getAttribute("data-renewal-readiness-key"),
            ready: node.getAttribute("data-renewal-ready"),
            text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
          })),
        )
        .catch(() => [])
    : [];
  return {
    step,
    shown,
    primary,
    rows,
    offCycle:
      rows.find(
        (row) =>
          row.key === READINESS_KEY || /needs review \(off-cycle\)/i.test(row.text),
      ) ?? null,
  };
}

/** The off-cycle review on Check the numbers, opened as staff open it. */
async function openReview(ctx, page, leaseId) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, "?step=check-numbers");
  await waitForPrimary(ctx, page);
  const shown = await kit.reveal(page, FORM, 30_000);
  return { shown, form: page.locator(FORM).first() };
}
async function readReview(ctx, page, leaseId) {
  const { kit } = ctx;
  const { shown, form } = await openReview(ctx, page, leaseId);
  if (!shown)
    return {
      shown: false,
      attached: await page.locator(FORM).count(),
    };
  const historySummary = form.locator("details > summary").first();
  if (await kit.shownWithin(historySummary, 2_000))
    await kit.openDisclosure(form.locator("details").first());
  return {
    shown: true,
    state: await form.getAttribute("data-renewal-off-cycle-state"),
    sentence: await textIfAny(form.locator('[data-renewal-field="off-cycle-end-date"]')),
    decision: await textIfAny(form.locator('[data-renewal-field="off-cycle-decision"]')),
    radios: await form.locator('input[type="radio"]').count(),
    history: await form
      .locator('[data-renewal-field="off-cycle-history"] > li')
      .evaluateAll((nodes) =>
        nodes.map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim()),
      )
      .catch(() => []),
    text: (await kit.visibleText(form)).slice(0, 900),
  };
}

/** The desk's every-lease table: the lease row and the view and reason counts. */
async function readDeskTable(ctx, page, leaseId) {
  const { kit } = ctx;
  await kit.openPath(page, DESK_TABLE);
  const row = page.locator(`tr[data-lease-id="${leaseId}"]`).first();
  const shown = await row
    .waitFor({ state: "attached", timeout: 120_000 })
    .then(() => true)
    .catch(() => false);
  const views = await page
    .locator("nav.renewal-view-switch a[data-view]")
    .evaluateAll((nodes) =>
      nodes.map((node) => [
        node.getAttribute("data-view"),
        node.getAttribute("data-count"),
      ]),
    )
    .catch(() => []);
  const reasons = await page
    .locator('[data-renewal-field="reason-counts"] a[data-reason]')
    .evaluateAll((nodes) =>
      nodes.map((node) => [
        node.getAttribute("data-reason"),
        (node.textContent ?? "").replace(/\s+/g, " ").trim(),
      ]),
    )
    .catch(() => []);
  return {
    shown,
    disposition: shown ? await row.getAttribute("data-disposition") : null,
    status: shown ? await row.getAttribute("data-status") : null,
    reason: shown
      ? await textIfAny(row.locator('[data-renewal-field="inclusion-reason"]'))
      : "",
    counts: JSON.stringify({ views, reasons }),
  };
}

/** The working batch for `month`, reached with its month links as staff move between months. */
async function openBatchMonth(ctx, page, month) {
  const { kit } = ctx;
  await kit.openPath(page, DESK);
  const section = page.locator('section[aria-label="Working batch"]').first();
  await section.waitFor({ timeout: 120_000 });
  for (let step = 0; step < 4; step += 1) {
    const current = await section.getAttribute("data-batch-month");
    if (current === month) return true;
    const links = await page
      .locator("a[data-batch-month-target]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-batch-month-target")),
      );
    const next = links.includes(month)
      ? month
      : links.find((entry) => (month < current ? entry < current : entry > current));
    if (!next) return false;
    await page.locator(`a[data-batch-month-target="${next}"]`).first().click();
    await page
      .locator(`section[aria-label="Working batch"][data-batch-month="${next}"]`)
      .waitFor({ timeout: 120_000 });
    await page
      .waitForLoadState("networkidle", { timeout: 30_000 })
      .catch(() => undefined);
  }
  return (await section.getAttribute("data-batch-month")) === month;
}
async function batchCounts(page) {
  return page
    .locator("button.renewal-batch-count[data-batch-group]")
    .evaluateAll((nodes) =>
      nodes.map((node) => [
        node.getAttribute("data-batch-group"),
        node.getAttribute("data-batch-count"),
      ]),
    )
    .catch(() => []);
}

// ---- Staff steps ---------------------------------------------------------------------------------

/**
 * Choose a decision, type a reason (or none) and choose Save on the review form. Resolves with the
 * workspace answer the click made (or none within 8 s), the request it sent, the form's alert and
 * what the save reached beyond its record (AC-S282-5).
 */
async function saveReview(ctx, page, leaseId, { decision, reason, reopen = true }) {
  const { kit } = ctx;
  // `reopen: false` acts on the form already open on this page, as it was read, with no reload.
  const opened = reopen
    ? await openReview(ctx, page, leaseId)
    : {
        form: page.locator(FORM).first(),
        shown: await kit.shownWithin(page.locator(FORM).first(), 10_000),
      };
  const { shown, form } = opened;
  if (!shown) return { shown: false };
  await form.locator(`#${decision === "include" ? INCLUDE_ID : HOLD_ID}`).check();
  const field = form.getByLabel("Reason", { exact: true });
  await field.fill(reason);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  const before = await effectsMark(ctx, leaseId);
  const writesBefore = ctx.writes.length;
  const answer = kit
    .appResponse(page, WORKSPACE_ROUTE, {
      match: (body) => body?.action?.kind === "end_date_review",
      timeout: reason ? 120_000 : 8_000,
    })
    .catch(() => null);
  await form.getByRole("button", { name: "Save", exact: true }).click();
  const response = await answer;
  // Every provider request the server made for this save is logged before its answer is sent.
  const calls = providerCallsSince(ctx.rehearsal, before.log);
  const request = response ? (response.request().postDataJSON() ?? null) : null;
  const body = response ? await response.json().catch(() => null) : null;
  const alert = form.locator('[role="alert"]').first();
  const alertText = (await kit.shownWithin(
    alert,
    response?.status() === 200 ? 1_000 : 15_000,
  ))
    ? await kit.visibleText(alert)
    : null;
  await page.waitForTimeout(1_500);
  const after = await effectsMark(ctx, leaseId);
  return {
    shown: true,
    status: response?.status() ?? null,
    request,
    error: body?.error ?? null,
    alert: alertText,
    decisionKept: await form
      .locator(`#${decision === "include" ? INCLUDE_ID : HOLD_ID}`)
      .isChecked()
      .catch(() => false),
    reasonKept: await field.inputValue().catch(() => null),
    writes: ctx.writes
      .slice(writesBefore)
      .filter((write) => write.path === WORKSPACE_ROUTE).length,
    effects: {
      providerCalls: calls,
      sent: after.sent - before.sent,
      drafts: after.drafts - before.drafts,
      comparisonsChanged: after.comparisons !== before.comparisons,
      sequencesChanged: after.sequences !== before.sequences,
    },
  };
}

/** AC-S282-5 for one save attempt: nothing sent, no provider call, no lookup, no message change. */
const quiet = (effects) =>
  Boolean(effects) &&
  effects.providerCalls.length === 0 &&
  effects.sent === 0 &&
  effects.drafts === 0 &&
  !effects.comparisonsChanged &&
  !effects.sequencesChanged;

/** AC-S282-1: the stored review and its audit entry hold everything the spec names. */
async function storedReview(
  ctx,
  leaseId,
  saved,
  { decision, reason, endDateIso, startedAt },
) {
  const record = await workRecord(ctx.kit, leaseId);
  const operationId = saved.request?.operationId ?? null;
  const reviews = record?.state?.endDateReviews ?? [];
  const review = reviews.at(-1) ?? null;
  const audit = await auditEntry(ctx.kit, operationId);
  const recordedMs = Date.parse(review?.recordedAt ?? "");
  const checks = {
    saved: saved.status === 200,
    lease:
      record?.state?.leaseId === String(leaseId) &&
      record.collection === HEADS[0] &&
      Boolean(record),
    cycle: Boolean(record?.state?.cycleId) && review?.cycleId === record.state.cycleId,
    endDate: review?.endDateIso === endDateIso,
    decision: review?.decision === decision,
    reason: review?.reason === reason,
    actor: Boolean(review?.actorUid) && /\S+@\S+/.test(String(review?.actorLabel ?? "")),
    time:
      Number.isFinite(recordedMs) &&
      recordedMs >= startedAt - 120_000 &&
      recordedMs <= Date.now() + 120_000,
    event: Boolean(operationId) && review?.eventId === operationId,
    audit:
      audit?.lease_id === String(leaseId) &&
      audit?.cycle_id === record?.state?.cycleId &&
      audit?.action?.kind === "end_date_review" &&
      audit?.action?.decision === decision &&
      audit?.actor_uid === review?.actorUid &&
      (audit?.next_state?.endDateReviews ?? []).some(
        (entry) => entry.eventId === operationId,
      ),
  };
  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    review,
    revision: record?.state?.revision ?? null,
    reviews: reviews.length,
    updateTime: record?.updateTime ?? null,
  };
}

/** Where "Review the lease end date" on the Now card lands, and whether its label is in view. */
async function followFix(ctx, page, leaseId) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId);
  const primary = await waitForPrimary(ctx, page, (name) => name === FIX);
  if (primary !== FIX) return { primary, followed: false };
  await kit.primary(page).click();
  await page
    .waitForFunction((id) => document.activeElement?.id === id, INCLUDE_ID, {
      timeout: 20_000,
    })
    .catch(() => undefined);
  await page.waitForTimeout(1_000);
  const landing = await page.evaluate((id) => {
    const element = document.getElementById(id);
    const focused = Boolean(element) && document.activeElement === element;
    const label = element ? document.querySelector(`label[for="${id}"]`) : null;
    if (!focused || !label) return { focused, label: null };
    const rect = label.getBoundingClientRect();
    const inView =
      rect.height > 0 &&
      rect.width > 0 &&
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth;
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return {
      focused,
      label: (label.textContent ?? "").replace(/\s+/g, " ").trim(),
      inView,
      unobscured: Boolean(hit) && (label.contains(hit) || hit === element),
      rect: {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        viewport: window.innerHeight,
      },
    };
  }, INCLUDE_ID);
  return { primary, followed: true, focus: await kit.focused(page), landing };
}

/**
 * Record the lease term on Check the numbers ("Lease term", with a short context), as staff settle
 * the separate "Lease term needs review" hold of a lease whose RentVine end date has passed.
 */
async function recordFixedTerm(ctx, page, leaseId) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, "?step=check-numbers");
  await waitForPrimary(ctx, page);
  const term = `#lease-term-${leaseId}`;
  const context = `#lease-term-reason-${leaseId}`;
  if (!(await kit.reveal(page, context, 30_000))) return { shown: false };
  const chosen = await page.locator(term).inputValue();
  const saved = kit
    .appResponse(page, TERM_REVIEW_ROUTE, { timeout: 120_000 })
    .catch(() => null);
  // The term saves when it is chosen; an unchanged choice saves with its context, on leaving it.
  if (chosen !== "fixed_term") await page.locator(term).selectOption("fixed_term");
  else {
    await page.locator(context).fill(TERM_CONTEXT);
    await page.locator(context).blur();
  }
  const response = await saved;
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  return { shown: true, chosen, status: response?.status() ?? null };
}

/** The month's "Prepare" run, as staff start it, and what it answered for this lease. */
async function prepareMonth(ctx, page, leaseId, month) {
  const { kit } = ctx;
  if (!(await openBatchMonth(ctx, page, month))) return { reached: false };
  let button = page.locator("[data-kickoff-prepare]").first();
  if (!(await kit.shownWithin(button, 30_000))) return { reached: true, button: false };
  if (await button.isDisabled()) {
    // The run asks for current source data first; staff choose "Refresh data".
    await refreshData(ctx, page);
    await openBatchMonth(ctx, page, month);
    button = page.locator("[data-kickoff-prepare]").first();
  }
  const targets = Number(
    await page
      .locator('section[aria-label="Batch preparation"]')
      .first()
      .getAttribute("data-kickoff-targets")
      .catch(() => null),
  );
  const row = page.locator(`tr[data-batch-lease="${leaseId}"]`).first();
  const group = (await kit.shownWithin(row, 10_000))
    ? await row.getAttribute("data-batch-group")
    : null;
  if (await button.isDisabled())
    return { reached: true, button: true, disabled: true, targets, group };
  const answer = kit
    .appResponse(page, KICKOFF_ROUTE, {
      match: (body) => String(body?.leaseId) === String(leaseId),
      timeout: 600_000,
    })
    .catch(() => null);
  await button.click();
  const response = await answer;
  const body = response ? await response.json().catch(() => null) : null;
  const request = response ? (response.request().postDataJSON() ?? null) : null;
  await page
    .locator("[data-kickoff-progress]")
    .filter({ hasText: /Preparation finished for/ })
    .first()
    .waitFor({ timeout: 600_000 })
    .catch(() => undefined);
  const outcomes = await page
    .locator('ul[aria-label="Preparation results"] > li')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        status: node.getAttribute("data-kickoff-outcome"),
        text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
      })),
    )
    .catch(() => []);
  return {
    reached: true,
    button: true,
    targets,
    group,
    requestMonth: request?.month ?? null,
    status: body?.status ?? null,
    code: body?.code ?? null,
    message: String(body?.message ?? "").slice(0, 240),
    outcomes,
  };
}

/**
 * The product's one read-only identity: a verification account (lib/auth/canary-policy.ts), signed
 * in the way such an account signs in, through Google, here the rehearsal's own Auth emulator on
 * 127.0.0.1, then the app's session route. No password and no provider is involved; the emulator
 * token is a disposable synthetic credential and is never written anywhere.
 */
async function signInVerificationAccount(ctx, page) {
  const host = String(ctx.rehearsal.authEmulatorHost ?? "");
  if (!/^127\.0\.0\.1:\d{1,5}$/.test(host))
    return { signedIn: false, reason: "no emulator" };
  const idpToken = JSON.stringify({
    sub: "rehearsal-verification-editor",
    email: VERIFICATION_EMAIL,
    email_verified: true,
  });
  const response = await fetch(
    `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=rehearsal`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestUri: "http://localhost",
        postBody: `id_token=${encodeURIComponent(idpToken)}&providerId=google.com`,
        returnSecureToken: true,
      }),
      redirect: "error",
    },
  ).catch(() => null);
  const body = response ? await response.json().catch(() => null) : null;
  if (!response?.ok || typeof body?.idToken !== "string")
    return {
      signedIn: false,
      reason: "emulator sign-in",
      status: response?.status ?? null,
      error: String(body?.error?.message ?? "").slice(0, 120),
    };
  const session = await page.evaluate(async (token) => {
    const answer = await fetch("/api/auth/session", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    const text = await answer.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    return { status: answer.status, role: parsed?.user?.role ?? null };
  }, body.idToken);
  return {
    signedIn: session.status === 200,
    status: session.status,
    role: session.role,
  };
}

/** The source end date as the RentVine stand-in serves it, read by the app after "Refresh data". */
async function serveEndDate(ctx, page, leaseId, endDate) {
  setSourceCycleDate(ctx.rehearsal, leaseId, endDate);
  await ctx.kit.openLease(page, leaseId);
  const refreshed = await refreshData(ctx, page);
  return { endDate, refreshed };
}

// ---- Notes: each one short, since the driver keeps 2000 characters of a note ---------------------

const brief = {
  now: (read) => ({
    primary: read.primary,
    heading: read.heading,
    stageLine: read.stageLine.slice(0, 200),
    now: read.now.slice(0, 200),
  }),
  list: (read) => ({
    step: read.step,
    shown: read.shown,
    primary: read.primary,
    rows: read.rows.map((row) => `${row.ready}:${row.text.slice(0, 48)}`),
  }),
  review: (read) => ({
    shown: read.shown,
    attached: read.attached,
    state: read.state,
    sentence: read.sentence,
    decision: read.decision?.slice(0, 160),
    radios: read.radios,
    history: (read.history ?? []).map((entry) => entry.slice(0, 90)),
  }),
  save: (save) => ({
    shown: save.shown,
    status: save.status,
    expectedRevision: save.request?.expectedRevision ?? null,
    alert: save.alert,
    decisionKept: save.decisionKept,
    writes: save.writes,
    effects: save.effects,
  }),
  stored: (stored) => ({
    passed: stored.passed,
    checks: stored.checks,
    revision: stored.revision,
    reviews: stored.reviews,
  }),
};

// ---- The checks ----------------------------------------------------------------------------------

/**
 * W12-11 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1211 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S282-1 to AC-S282-5 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1211(ctx, page, start) {
  const leaseId = ctx.options?.offCycleLeaseId ?? 9106;
  const original = ctx.leases.byId(leaseId)?.endDate ?? null;
  ctx.record({
    startingSequence: start.error ? "stopped" : "completed",
    startError: start.error,
    observed: start.observed,
    leaseId,
    original,
  });
  if (!original) throw new Error(`The fixture holds no end date for lease ${leaseId}.`);
  const startedAt = Date.now();
  const saves = [];
  const results = {};
  try {
    // 1. AC-S282-4 with the block standing: both readiness lists, the button and its landing.
    const blockedNow = await readNow(ctx, page, leaseId, (name) => name === FIX);
    const blockedOwner = await readinessOn(ctx, page, leaseId, "ask-owner");
    const blockedTenant = await readinessOn(ctx, page, leaseId, "offer-tenant");
    const landing = await followFix(ctx, page, leaseId);
    const blockedReview = await readReview(ctx, page, leaseId);
    ctx.record({
      blockedNow: brief.now(blockedNow),
      landing: landing.landing ?? landing,
    });
    ctx.record({
      blockedOwner: brief.list(blockedOwner),
      blockedTenant: brief.list(blockedTenant),
    });
    ctx.record({ blockedReview: brief.review(blockedReview) });
    const rowStands = (list) =>
      list.offCycle?.ready === "missing" && list.offCycle.text.startsWith(READINESS_TEXT);
    const blocked = {
      owner: rowStands(blockedOwner),
      tenant: rowStands(blockedTenant),
      button: blockedNow.primary === FIX,
      landing:
        landing.landing?.focused === true &&
        landing.landing.label === "Include in this renewal month" &&
        landing.landing.inView === true &&
        landing.landing.unobscured === true,
      // ARCH-S282-3: the list holds the row exactly while the Now card names its fix.
      agree:
        (blockedOwner.offCycle !== null) === (blockedNow.primary === FIX) &&
        (blockedTenant.offCycle !== null) === (blockedNow.primary === FIX),
      form:
        blockedReview.shown === true &&
        blockedReview.state === "needs_review" &&
        blockedReview.sentence ===
          `This lease ends ${usDate(original)}, which is not a month end.`,
    };

    // 2. The desk before any decision.
    const deskBefore = await readDeskTable(ctx, page, leaseId);
    await openBatchMonth(ctx, page, original.slice(0, 7));
    const batchBefore = await batchCounts(page);
    ctx.record({ deskBefore, batchBefore });

    // 3. AC-S282-1: a decision with no reason is refused in place, the decision kept.
    const empty = await saveReview(ctx, page, leaseId, {
      decision: "include",
      reason: "",
    });
    saves.push({ name: "no reason", ...empty });
    const emptyRefused =
      empty.shown === true &&
      empty.status === null &&
      empty.writes === 0 &&
      empty.alert === REASON_REQUIRED &&
      empty.decisionKept === true;
    const afterEmpty = await workRecord(ctx.kit, leaseId);

    // 4. "Keep on hold" with a reason.
    const held = await saveReview(ctx, page, leaseId, {
      decision: "hold",
      reason: HOLD_REASON,
    });
    saves.push({ name: "hold", ...held });
    const holdStored = await storedReview(ctx, leaseId, held, {
      decision: "hold",
      reason: HOLD_REASON,
      endDateIso: original,
      startedAt,
    });
    const holdDay = holdStored.review ? centralDay(holdStored.review.recordedAt) : null;
    const holdLine = holdStored.review
      ? `Off-cycle end date on hold: ${HOLD_REASON}. Set by ${holdStored.review.actorLabel} on ${holdDay}.`
      : null;
    const heldNow = await readNow(ctx, page, leaseId, (name) => name === FIX);
    const heldReview = await readReview(ctx, page, leaseId);
    const deskHeld = await readDeskTable(ctx, page, leaseId);
    await openBatchMonth(ctx, page, original.slice(0, 7));
    const batchHeld = await batchCounts(page);
    ctx.record({ held: brief.save(held), holdStored: brief.stored(holdStored) });
    ctx.record({ heldNow: brief.now(heldNow), heldReview: brief.review(heldReview) });
    ctx.record({ deskHeld, batchHeld });
    const holdState = {
      stored: holdStored.passed,
      // The block stays: the fix is still the Now card's action, with the hold's own line.
      block: heldNow.primary === FIX,
      line: Boolean(holdLine) && heldNow.now.includes(holdLine),
      stageLine: Boolean(holdLine) && heldNow.stageLine.includes(holdLine.slice(0, -1)),
      form: heldReview.state === "held",
      deskReason:
        Boolean(holdStored.review) &&
        deskHeld.reason.includes(
          `Off-cycle end date: on hold by ${holdStored.review.actorLabel} on ${holdDay}`,
        ),
      // A held lease stays counted under its existing reason; no count moves.
      counts:
        deskHeld.counts === deskBefore.counts &&
        deskHeld.disposition === deskBefore.disposition &&
        JSON.stringify(batchHeld) === JSON.stringify(batchBefore),
    };

    // 5. A second Editor opens the review as it stands now (the hold) and keeps that page open.
    const second = await ctx.newPage("Editor");
    const secondReview = await readReview(ctx, second, leaseId);
    ctx.record({ secondReview: brief.review(secondReview) });

    // 6. "Include" with a reason, on the first page.
    const included = await saveReview(ctx, page, leaseId, {
      decision: "include",
      reason: INCLUDE_REASON,
    });
    saves.push({ name: "include", ...included });
    const includeStored = await storedReview(ctx, leaseId, included, {
      decision: "include",
      reason: INCLUDE_REASON,
      endDateIso: original,
      startedAt,
    });
    const afterInclude = await workRecord(ctx.kit, leaseId);

    // The second page, still open on the version it read, saves there: refused, nothing stored.
    const stale = await saveReview(ctx, second, leaseId, {
      decision: "hold",
      reason: STALE_REASON,
      reopen: false,
    });
    saves.push({ name: "stale version", ...stale });
    const afterStale = await workRecord(ctx.kit, leaseId);
    const staleAudit = await auditEntry(ctx.kit, stale.request?.operationId);
    const staleRefused =
      secondReview.state === "held" &&
      stale.status === 409 &&
      stale.writes === 1 &&
      CONFLICT.test(stale.alert ?? "") &&
      stale.decisionKept === true &&
      stale.reasonKept === STALE_REASON &&
      staleAudit === null &&
      afterStale?.updateTime === afterInclude?.updateTime &&
      afterStale?.state?.revision === afterInclude?.state?.revision &&
      (afterStale?.state?.endDateReviews ?? []).length ===
        (afterInclude?.state?.endDateReviews ?? []).length;
    ctx.record({
      included: brief.save(included),
      includeStored: brief.stored(includeStored),
    });
    ctx.record({
      stale: brief.save(stale),
      staleAudit: staleAudit !== null,
      staleRevision: [afterInclude?.state?.revision, afterStale?.state?.revision],
      staleRefused,
    });

    // A read-only identity reads the decision and cannot save one; nothing is stored.
    const reader = await ctx.newPage("Editor");
    const readerSession = await signInVerificationAccount(ctx, reader);
    let readOnly = { observed: false, session: readerSession };
    if (readerSession.signedIn) {
      const readerReview = await readReview(ctx, reader, leaseId);
      const beforeReader = await workRecord(ctx.kit, leaseId);
      const attempt =
        readerReview.radios > 0
          ? await saveReview(ctx, reader, leaseId, {
              decision: "hold",
              reason: READER_REASON,
            })
          : null;
      if (attempt) saves.push({ name: "read-only", ...attempt });
      const afterReader = await workRecord(ctx.kit, leaseId);
      const readerAudit = attempt
        ? await auditEntry(ctx.kit, attempt.request?.operationId)
        : null;
      readOnly = {
        observed: true,
        session: readerSession,
        review: brief.review(readerReview),
        attempt: attempt ? brief.save(attempt) : null,
        sees:
          readerReview.shown === true &&
          readerReview.state === "included" &&
          readerReview.decision.startsWith("Off-cycle end date: included by"),
        refused:
          (attempt === null ||
            (attempt.status !== null &&
              attempt.status >= 400 &&
              attempt.status < 500 &&
              Boolean(attempt.alert) &&
              readerAudit === null)) &&
          afterReader?.updateTime === beforeReader?.updateTime &&
          afterReader?.state?.revision === beforeReader?.state?.revision,
      };
    }
    ctx.record({ readOnly });

    // After "Include": the Now card, both lists, the desk and the month's batch and run.
    const includeDay = includeStored.review
      ? centralDay(includeStored.review.recordedAt)
      : null;
    const includedNow = await readNow(
      ctx,
      page,
      leaseId,
      (name) => name !== null && name !== FIX,
    );
    // The off-cycle hold masked any later hold of the cohort's order. The fixture's off-cycle lease
    // ended before the business date, so "Lease term needs review" stands behind it; staff settle
    // it with its own control before the step's own action can lead the Now card.
    const term = /Lease term needs review/i.test(includedNow.stageLine)
      ? await recordFixedTerm(ctx, page, leaseId)
      : null;
    const clearedNow = term
      ? await readNow(ctx, page, leaseId, (name) => name !== null && name !== FIX)
      : includedNow;
    ctx.record({ includedNow: brief.now(includedNow), term });
    const clearedOwner = await readinessOn(ctx, page, leaseId, "ask-owner");
    const clearedTenant = await readinessOn(ctx, page, leaseId, "offer-tenant");
    const includedReview = await readReview(ctx, page, leaseId);
    const deskIncluded = await readDeskTable(ctx, page, leaseId);
    const run = await prepareMonth(ctx, page, leaseId, original.slice(0, 7));
    ctx.record({
      clearedNow: brief.now(clearedNow),
      clearedOwner: brief.list(clearedOwner),
      clearedTenant: brief.list(clearedTenant),
    });
    ctx.record({ includedReview: brief.review(includedReview), deskIncluded });
    ctx.record({ run });
    const rowCleared = (list) =>
      list.shown && (list.offCycle === null || list.offCycle.ready === "ready");
    const cleared = {
      owner: rowCleared(clearedOwner),
      tenant: rowCleared(clearedTenant),
      // The Now card and the list agree: neither names the end date review.
      agree:
        clearedNow.primary !== FIX &&
        clearedOwner.primary !== FIX &&
        clearedTenant.primary !== FIX &&
        !/Off-cycle end date/i.test(clearedNow.now),
    };
    const includeState = {
      stored: includeStored.passed,
      // The off-cycle hold no longer leads the card, and once nothing else holds the lease the
      // step's own action is its primary: no blocker notice and no verification line.
      offCycleGone:
        includedNow.primary !== FIX &&
        !/Off-cycle end date/i.test(includedNow.now) &&
        !/Off-cycle end date/i.test(includedNow.stageLine),
      ownAction:
        (term === null || term.status === 200) &&
        clearedNow.primary !== null &&
        clearedNow.primary !== FIX &&
        clearedNow.alerts === 0 &&
        !/^Needs verification/i.test(clearedNow.stageLine) &&
        !/Off-cycle end date/i.test(clearedNow.now),
      form: includedReview.state === "included",
      deskReason:
        Boolean(includeStored.review) &&
        deskIncluded.reason.includes(
          `Off-cycle end date: included by ${includeStored.review.actorLabel} on ${includeDay}`,
        ),
      monthBatch: run.reached === true && run.group === "this_batch",
      target:
        run.requestMonth === original.slice(0, 7) &&
        run.status !== null &&
        run.status !== "refused" &&
        run.status !== "failed",
    };

    // 7. AC-S282-3: the source end date changes, then is corrected to the month end, then restored.
    const other = otherOffCycleDate(original);
    const monthEnd = monthEndOf(original);
    const changed = await serveEndDate(ctx, page, leaseId, other);
    const changedNow = await readNow(ctx, page, leaseId, (name) => name === FIX);
    const changedReview = await readReview(ctx, page, leaseId);
    const changedOwner = await readinessOn(ctx, page, leaseId, "ask-owner");
    const corrected = await serveEndDate(ctx, page, leaseId, monthEnd);
    const correctedNow = await readNow(
      ctx,
      page,
      leaseId,
      (name) => name !== null && name !== FIX,
    );
    const correctedReview = await readReview(ctx, page, leaseId);
    const correctedOwner = await readinessOn(ctx, page, leaseId, "ask-owner");
    const restored = await serveEndDate(ctx, page, leaseId, null);
    const restoredNow = await readNow(
      ctx,
      page,
      leaseId,
      (name) => name !== null && name !== FIX,
    );
    const restoredReview = await readReview(ctx, page, leaseId);
    ctx.record({
      other,
      changed,
      changedNow: brief.now(changedNow),
      changedOwner: brief.list(changedOwner),
    });
    ctx.record({ changedReview: brief.review(changedReview) });
    ctx.record({
      monthEnd,
      corrected,
      correctedNow: brief.now(correctedNow),
      correctedReview: brief.review(correctedReview),
      correctedOwner: brief.list(correctedOwner),
    });
    ctx.record({
      restored,
      restoredNow: brief.now(restoredNow),
      restoredReview: brief.review(restoredReview),
    });
    const earlier = (changedReview.history ?? []).filter((entry) =>
      entry.startsWith(`Lease end ${usDate(original)}:`),
    );
    const dateChange = {
      // A new off-cycle value asks again: the block is back, the form names the new date.
      blockReturns:
        changed.refreshed?.status === 200 &&
        changedNow.primary === FIX &&
        changedOwner.offCycle?.ready === "missing",
      asksAgain:
        changedReview.state === "needs_review" &&
        changedReview.sentence ===
          `This lease ends ${usDate(other)}, which is not a month end.` &&
        !changedReview.decision,
      history:
        earlier.some((entry) => entry.includes("Include in this renewal month")) &&
        earlier.some((entry) => entry.includes("Keep on hold")),
      // A month-end value: no block and no form.
      monthEnd:
        corrected.refreshed?.status === 200 &&
        correctedReview.shown === false &&
        correctedReview.attached === 0 &&
        correctedNow.primary !== FIX &&
        correctedOwner.offCycle === null,
      // The original value finds its own decision again: the exact recorded value, "Include".
      restored:
        restored.refreshed?.status === 200 &&
        restoredReview.state === "included" &&
        restoredReview.sentence ===
          `This lease ends ${usDate(original)}, which is not a month end.` &&
        restoredReview.decision.startsWith(
          `Off-cycle end date: included by ${includeStored.review?.actorLabel ?? "?"}`,
        ) &&
        restoredNow.primary !== FIX,
    };

    // AC-S282-5: every review save, accepted or refused, reached nothing beyond its record.
    const reviewSaves = saves.filter((save) => save.shown);
    const safety = {
      quiet:
        reviewSaves.length === saves.length &&
        reviewSaves.length >= 4 &&
        reviewSaves.every((save) => quiet(save.effects)),
      // The source value the review names is the one the source still serves.
      sourceUnchanged:
        heldReview.sentence === blockedReview.sentence &&
        includedReview.sentence === blockedReview.sentence,
    };

    const firstPart = {
      emptyRefused,
      emptyStoredNothing: (afterEmpty?.state?.endDateReviews ?? []).length === 0,
      holdStored: holdStored.passed,
      includeStored: includeStored.passed,
      staleRefused,
      readOnlySees: readOnly.sees === true,
      readOnlyRefused: readOnly.refused === true,
    };
    ctx.record({
      verdictParts: {
        blocked,
        holdState,
        firstPart,
        cleared,
        includeState,
        dateChange,
        safety,
      },
    });
    for (const save of saves)
      ctx.record({
        save: save.name,
        status: save.status,
        alert: save.alert,
        writes: save.writes,
        effects: save.effects,
      });

    // AC-S282-1 is recorded only when its read-only identity could sign in (see the file header);
    // otherwise it is left out, never reported as passed.
    if (readOnly.observed) results["AC-S282-1"] = Object.values(firstPart).every(Boolean);
    results["AC-S282-2"] =
      Object.values(holdState).every(Boolean) &&
      Object.values(includeState).every(Boolean);
    results["AC-S282-3"] = Object.values(dateChange).every(Boolean);
    results["AC-S282-4"] =
      Object.values(blocked).every(Boolean) && Object.values(cleared).every(Boolean);
    results["AC-S282-5"] = Object.values(safety).every(Boolean);
    return results;
  } finally {
    // The stand-in serves the fixture's own end date again whatever happened above.
    try {
      setSourceCycleDate(ctx.rehearsal, leaseId, null);
    } catch (error) {
      ctx.record({ restoreSource: String(error?.message ?? error).slice(0, 200) });
    }
  }
}
