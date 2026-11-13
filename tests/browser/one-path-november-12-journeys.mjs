// S284 R-S284-1 / R-S284-2: the fourteen starting sequences of the November 12 staff workflow
// audit (W12-01 to W12-14), as journeys a later suite extends into the W12 matrix. Each journey
// reaches its state the way staff can: visible controls in the browser, outside parties only
// through the stand-in hooks of scripts/one-path-rehearsal-control.mjs, and time only through the
// worker tick helper. No journey posts an app route; it waits for the request a staff click makes
// and reads state through pages, GET routes, the rehearsal's emulator and the stand-ins.
//
// A journey returns a plain observation ({ observed, steps }): counts, states, booleans, which
// control has focus, which strings render. Expectations live with the caller: the baseline driver
// (one-path-november-12-baseline-driver.mjs) compares them with the fail-first table, and the
// qualification driver compares them with each suite's acceptance checks.
//
// ctx: { kit (createStaffKit), rehearsal, leases (role -> { leaseId, ... }), record(entry),
//        newPage(role) (a signed-in page in a fresh guarded context), resetState() (the harness
//        reset), options }.
import {
  deliverOwnerReply,
  setSheetCells,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import { seedRenewalProcessDraft } from "../../scripts/lib/one-path-rehearsal/process-draft-seed.mjs";
import {
  DESK,
  KICKOFF_ROUTE,
  REFRESH_ROUTE,
  SEQUENCES_ROUTE,
  WORKING_ROUTE,
  WORKSPACE_ROUTE,
} from "./one-path-november-12-kit.mjs";

/** The audit's two term ends on lease 9101: the scheduled offer's, then the changed one. */
export const FIRST_TERM_END = "2027-12-31";
export const CHANGED_TERM_END = "2027-06-30";
const usDate = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const DIALOG_SEND = "Review and send";
const DIALOG_SCHEDULE = "Review and schedule";
const REVIEW_TEXT = '[data-renewal-field="exact-review"]';

/** Central wall-clock time `minutes` ago, as a datetime-local input value. */
function centralLocal(minutesAgo = 2) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(Date.now() - minutesAgo * 60_000))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * A fix that opens another step moves focus after that step renders. Wait until focus has left
 * the step's primary action (at most 15 s), then let the scroll settle.
 */
async function settleFocus(page) {
  await page
    .waitForFunction(
      () =>
        document.activeElement &&
        document.activeElement !== document.body &&
        document.activeElement.id !== "renewal-now-primary",
      null,
      { timeout: 15_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(800);
}

function stepLog() {
  const steps = [];
  return {
    steps,
    add(label, detail = {}) {
      steps.push({ at: new Date().toISOString(), label, ...detail });
    },
  };
}

// ---- Staff steps: each is a visible control, and each waits for the request the click makes ----

/** "Refresh data" on the desk or the lease header; resolves with the refresh answer's status. */
export async function refreshData(ctx, page) {
  const { kit } = ctx;
  const button = page.locator("#renewal-refresh").first();
  if (!(await kit.shownWithin(button, 30_000))) return { shown: false };
  const answer = kit.appResponse(page, REFRESH_ROUTE, { timeout: 120_000 });
  await button.click();
  const response = await answer.catch(() => null);
  const body = response ? await response.json().catch(() => null) : null;
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  return {
    shown: true,
    status: response?.status() ?? null,
    refreshed: body?.refreshed ?? null,
  };
}

/**
 * Open a lease step and wait until its one primary action reads `wanted` (a string or a pattern).
 * When the step asks for a fresh RentVine read first, use "Refresh data" as staff do, at most
 * three times. Resolves with the primary's name; throws with what the step showed instead.
 */
export async function reachPrimary(ctx, page, leaseId, step, wanted) {
  const { kit } = ctx;
  const matches = (name) =>
    name !== null && (typeof wanted === "string" ? name === wanted : wanted.test(name));
  let name = null;
  let refreshes = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await kit.openLease(page, leaseId, step ? `?step=${step}` : "");
    name = await waitForPrimary(ctx, page, matches);
    if (matches(name)) return { name, refreshes };
    const nowText = await kit.visibleText(kit.now(page));
    const wantsRead =
      /fresh admitted source read|Refresh data|re-read|being read/i.test(nowText) ||
      /refresh/i.test(name ?? "");
    if (!wantsRead || attempt === 3) break;
    await refreshData(ctx, page);
    refreshes += 1;
  }
  const nowText = await kit.visibleText(kit.now(page));
  throw new Error(
    `Lease ${leaseId} ${step ?? "current step"}: the primary reads "${name}", not "${wanted}". Now: ${nowText.slice(0, 500)}`,
  );
}

/**
 * The step's primary action once the step has finished reading: its message parts first show
 * "Reading the current ..." and the step's general label, then the message's own action. Waits up
 * to 90 s for a name `matches` accepts, and otherwise returns the settled name.
 */
export async function waitForPrimary(ctx, page, matches = () => false, timeout = 90_000) {
  const { kit } = ctx;
  const deadline = Date.now() + timeout;
  let name = await kit.primaryName(page, 45_000);
  let settledSince = null;
  while (Date.now() < deadline) {
    if (matches(name)) return name;
    const loading = /Reading the current|Opening lease|Updating renewals/i.test(
      await kit.visibleText(kit.now(page)),
    );
    if (!loading) {
      settledSince ??= Date.now();
      // Nothing is still reading: give the name ten more seconds to change, then accept it.
      if (Date.now() - settledSince > 10_000) return name;
    } else settledSince = null;
    await page.waitForTimeout(1000);
    name = await kit.primaryName(page, 5_000);
  }
  return name;
}

/** Click a review entry and wait for its dialog with the exact review shown. */
async function openReviewDialog(ctx, page, trigger, title) {
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: title });
  await dialog.locator(REVIEW_TEXT).waitFor({ timeout: 120_000 });
  return dialog;
}

/** The review dialog's message text, as staff read it. */
export async function reviewText(ctx, dialog) {
  return ctx.kit.visibleText(dialog.locator(REVIEW_TEXT));
}

/**
 * Confirm an open review dialog with its named button and wait for the sequences request that click
 * makes (`requestKind` is the kind of request the button sends). Resolves with the answer's status,
 * the message record id and state, and the dialog's alert when it stays open.
 */
export async function confirmReview(
  ctx,
  page,
  dialog,
  buttonName,
  requestKind,
  { onNoAnswer } = {},
) {
  const { kit } = ctx;
  const answer = kit.appResponse(page, SEQUENCES_ROUTE, {
    match: (body) => kit.sequenceAction(body) === requestKind,
    timeout: 180_000,
  });
  const observed = onNoAnswer ? answer.catch(() => null) : answer;
  await dialog.getByRole("button", { name: buttonName, exact: true }).click();
  const response = await observed;
  if (!response) {
    onNoAnswer();
    return { status: null, sequenceId: null, state: null, alert: null, error: null };
  }
  const body = await response.json().catch(() => null);
  const status = response.status();
  let alert = null;
  if (status >= 400) {
    const shown = dialog.locator('.ui-dialog-error[role="alert"]');
    alert = (await kit.shownWithin(shown, 15_000))
      ? await kit.visibleText(shown)
      : (body?.error ?? null);
  } else {
    await dialog.waitFor({ state: "hidden", timeout: 60_000 }).catch(() => undefined);
  }
  return {
    status,
    sequenceId: body?.sequence?.id ?? null,
    state: body?.sequence?.state ?? null,
    alert,
    error: status >= 400 ? String(body?.error ?? "").slice(0, 300) : null,
  };
}

/** Ask the owner: "Review owner message" opens the review dialog. */
export async function openOwnerReview(ctx, page, leaseId) {
  const reached = await reachPrimary(
    ctx,
    page,
    leaseId,
    "ask-owner",
    "Review owner message",
  );
  const dialog = await openReviewDialog(ctx, page, ctx.kit.primary(page), DIALOG_SEND);
  return { dialog, refreshes: reached.refreshes };
}

/** Ask the owner: review the owner message and choose "Send this message". */
export async function sendOwnerMessage(ctx, page, leaseId) {
  const { dialog, refreshes } = await openOwnerReview(ctx, page, leaseId);
  const sent = await confirmReview(ctx, page, dialog, "Send this message", "send");
  return { ...sent, refreshes };
}

/**
 * Record the owner's answer by hand, as staff do while waiting on the owner: "Record owner
 * response", Owner response "Approved", Amount approved, who, how ("Conversation") and when, then
 * "Review the owner's answer" and "Save the owner's answer". Nothing is preselected for them.
 */
export async function recordOwnerAnswer(ctx, page, leaseId, { amount }) {
  const { kit } = ctx;
  await reachPrimary(ctx, page, leaseId, "ask-owner", "Record owner response");
  await kit.primary(page).click();
  const form = page.locator("#renewal-manual-owner_response");
  // The form sits in the step's options disclosure; the fix opens it, or staff open it.
  if (!(await kit.shownWithin(form, 20_000)))
    await kit.reveal(page, "#renewal-manual-owner_response");
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
  await approval.getByLabel("When they approved", { exact: true }).fill(centralLocal(2));
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
  const response = await saved;
  return { status: response.status(), ownersOfRecord: owners.length };
}

/** Ask the owner's "Working renewal terms", opened as staff open it. */
async function workingTerms(ctx, page, leaseId) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, "?step=ask-owner");
  const terms = page.locator("details[data-renewal-working-terms]:visible").first();
  if (await kit.shownWithin(terms, 30_000)) await kit.openDisclosure(terms);
  else {
    await kit.openLease(page, leaseId, "?view=full#renewal-working-terms");
    await kit.reveal(page, "#renewal-working-terms-end");
  }
  return page;
}

/**
 * Enter the renewal dates in Working renewal terms. `start` is "day-after" (the offered choice),
 * a YYYY-MM-DD date or null; `end` is a YYYY-MM-DD date or null. Resolves with each save's status.
 */
export async function enterRenewalDates(
  ctx,
  page,
  leaseId,
  { start = null, end = null },
) {
  const { kit } = ctx;
  await workingTerms(ctx, page, leaseId);
  const result = {};
  if (start === "day-after") {
    const choice = page.locator("#renewal-working-terms-start").getByRole("button", {
      name: "Use the day after the current lease ends",
      exact: true,
    });
    await choice.waitFor({ timeout: 30_000 });
    const saved = kit.appResponse(page, WORKING_ROUTE, {
      match: (body) => body?.field === "terms_effective_date",
    });
    await choice.click();
    result.start = (await saved).status();
  } else if (start) {
    const field = page.getByLabel("Working effective date", { exact: true });
    const saved = kit.appResponse(page, WORKING_ROUTE, {
      match: (body) => body?.field === "terms_effective_date",
    });
    await field.fill(start);
    await field.blur();
    result.start = (await saved).status();
  }
  if (end) {
    const field = page.locator('#renewal-working-terms-end input[type="date"]').first();
    await field.waitFor({ timeout: 30_000 });
    const saved = kit.appResponse(page, WORKING_ROUTE, {
      match: (body) => body?.field === "terms_end_date",
    });
    await field.fill(end);
    await field.blur();
    result.end = (await saved).status();
  }
  return result;
}

/** What the end date field offers after a start is saved: suggestion buttons and text. */
export async function readEndDateOffer(ctx, page, leaseId) {
  const { kit } = ctx;
  await workingTerms(ctx, page, leaseId);
  const field = page.locator("#renewal-working-terms-end").first();
  await field.waitFor({ timeout: 30_000 });
  const text = await kit.visibleText(field);
  return {
    suggestionButtons: await field.getByRole("button", { name: /^Use / }).count(),
    suggestedEndText: /Suggested end/i.test(text),
    twelveMonthChoice: /12 month|twelve month/i.test(text),
  };
}

/** Owner send, the owner's answer and the renewal dates: what a tenant offer needs on the lease. */
export async function prepareTenantOffer(ctx, page, leaseId, log, { end }) {
  const owner = await sendOwnerMessage(ctx, page, leaseId);
  log.add("owner message sent", { status: owner.status, refreshes: owner.refreshes });
  if (owner.status !== 200)
    throw new Error(`The owner message was not sent: ${owner.alert ?? owner.error}`);
  const amount = Number(ctx.leases.byId(leaseId)?.rent ?? 0) + 50;
  const answer = await recordOwnerAnswer(ctx, page, leaseId, { amount });
  log.add("owner answer recorded", answer);
  if (answer.status !== 200) throw new Error(`The owner's answer was not saved.`);
  const dates = await enterRenewalDates(ctx, page, leaseId, { start: "day-after", end });
  log.add("renewal dates entered", dates);
  if (dates.start !== 200 || dates.end !== 200)
    throw new Error(`The renewal dates were not saved: ${JSON.stringify(dates)}`);
  return { owner, answer, dates, amount };
}

/**
 * The step's "Schedule" button as staff reach it: in the Now card, or (S281 R-S281-12) inside the
 * step's "Other ways to send" group, which is closed on entry and opened by its summary.
 */
export async function stepScheduleButton(ctx, page) {
  const { kit } = ctx;
  const group = page
    .locator('details[data-renewal-group="Other ways to send"]:visible')
    .first();
  if (await kit.shownWithin(group, 3_000)) {
    await kit.openDisclosure(group);
    const inGroup = group.getByRole("button", { name: "Schedule", exact: true });
    if (await kit.shownWithin(inGroup, 10_000)) return inGroup;
  }
  const schedule = kit.now(page).getByRole("button", { name: "Schedule", exact: true });
  if (await kit.shownWithin(schedule, 20_000)) return schedule;
  return page.getByRole("button", { name: "Schedule", exact: true }).first();
}

/** Offer the tenant: "Schedule" in the step, the dialog's date and time as offered, then confirm. */
export async function scheduleTenantOffer(ctx, page, leaseId) {
  await reachPrimary(ctx, page, leaseId, "offer-tenant", "Review tenant offer");
  const trigger = await stepScheduleButton(ctx, page);
  const dialog = await openReviewDialog(ctx, page, trigger, DIALOG_SCHEDULE);
  const firstDate = await dialog
    .locator('input[type="date"]')
    .first()
    .inputValue()
    .catch(() => null);
  const time = await dialog
    .locator('input[type="time"]')
    .first()
    .inputValue()
    .catch(() => null);
  const text = await reviewText(ctx, dialog);
  const confirmed = await confirmReview(
    ctx,
    page,
    dialog,
    "Schedule this message",
    "schedule",
  );
  return { ...confirmed, firstDate, time, reviewedText: text };
}

/**
 * Offer the tenant: "Review tenant offer" and send. With `followUps`, the dialog's "Authorize
 * follow-ups after the tenant offer" is ticked and its form filled as staff fill it.
 */
export async function sendTenantOffer(ctx, page, leaseId, { followUps = null } = {}) {
  const { kit } = ctx;
  await reachPrimary(ctx, page, leaseId, "offer-tenant", "Review tenant offer");
  const dialog = await openReviewDialog(ctx, page, kit.primary(page), DIALOG_SEND);
  const text = await reviewText(ctx, dialog);
  if (!followUps)
    return {
      ...(await confirmReview(ctx, page, dialog, "Send this message", "send")),
      reviewedText: text,
    };
  await dialog
    .getByRole("checkbox", { name: /Authorize follow-ups after the tenant offer/ })
    .check();
  const plan = dialog.getByRole("group", { name: "Follow-up message and timing" });
  await plan.waitFor({ timeout: 20_000 });
  await plan.getByLabel("Follow-up subject").fill(followUps.subject);
  await plan.getByLabel("Follow-up message").fill(followUps.body);
  await plan.getByLabel("Every how many days").fill(String(followUps.everyDays));
  await plan.getByLabel("Local send time").fill(followUps.time);
  const zone = plan.getByLabel("Timezone");
  if (!(await zone.inputValue().catch(() => ""))) await zone.fill("America/Chicago");
  await plan.getByLabel("Inclusive end date").fill(followUps.endDate);
  await plan
    .getByLabel("Total send limit, including the offer")
    .fill(String(followUps.sendLimit));
  const confirmed = await confirmReview(
    ctx,
    page,
    dialog,
    "Send offer now and authorize follow-ups",
    "send",
  );
  return { ...confirmed, reviewedText: text };
}

/** Communications: open the lease's paused message on Outgoing and choose its Resume control. */
export async function resumeFromCommunications(ctx, page, leaseId, purposeWords) {
  const { kit } = ctx;
  await kit.openPath(page, "/gmail-hub");
  await page.getByRole("tab", { name: "Outgoing", exact: true }).click();
  const card = page
    .locator('[role="tabpanel"] article.ui-card')
    .filter({ hasText: `${purposeWords} · Lease ${leaseId}` })
    .filter({ hasText: "Paused:" })
    .first();
  await card.waitFor({ timeout: 60_000 });
  const cardText = await kit.visibleText(card);
  await card.getByRole("button", { name: "Open communication", exact: true }).click();
  const composer = page.getByRole("region", { name: "Workflow communication composer" });
  await composer.waitFor({ timeout: 60_000 });
  const resume = composer.getByRole("button", {
    name: "Resume reviewed sequence",
    exact: true,
  });
  // A build that refuses this Resume (S272 R-S272-5) shows its reason in place of the control
  // once the communication's lease read answers; until then Resume shows but stays disabled.
  const refusal = composer.locator('[data-communication-field="refusal"]');
  await resume.or(refusal).first().waitFor({ timeout: 60_000 });
  await page
    .waitForFunction(
      () => {
        const region = document.querySelector(
          'section[aria-label="Workflow communication composer"]',
        );
        if (!region) return false;
        if (region.querySelector('[data-communication-field="refusal"]')) return true;
        return [...region.querySelectorAll("button")].some(
          (button) =>
            (button.textContent ?? "").trim() === "Resume reviewed sequence" &&
            !button.disabled,
        );
      },
      null,
      { timeout: 60_000 },
    )
    .catch(() => undefined);
  if (!(await resume.isVisible())) {
    const shown = async (name) =>
      (await composer.getByRole("button", { name, exact: true }).count()) > 0;
    return {
      cardText,
      offered: false,
      controlsShown: {
        send: await shown("Send"),
        schedule: await shown("Schedule"),
        resume: false,
      },
      refusalReason: await refusal.first().getAttribute("data-refusal-reason"),
      dialogShown: (await page.getByRole("dialog").count()) > 0,
      status: null,
      state: null,
      statusLine: await kit.visibleText(composer.locator('p[role="status"]').first()),
    };
  }
  const controls = {
    send: await composer.getByRole("button", { name: "Send", exact: true }).isEnabled(),
    schedule: await composer
      .getByRole("button", { name: "Schedule", exact: true })
      .isEnabled(),
    resume: await resume.isEnabled(),
  };
  const before = page.getByRole("dialog");
  const answer = kit.appResponse(page, SEQUENCES_ROUTE, {
    match: (body) => kit.sequenceAction(body) === "resume",
  });
  await resume.click();
  const response = await answer;
  const body = await response.json().catch(() => null);
  return {
    cardText,
    offered: true,
    controlsEnabled: controls,
    dialogShown: (await before.count()) > 0,
    status: response.status(),
    state: body?.sequence?.state ?? null,
    statusLine: await kit.visibleText(composer.locator('p[role="status"]').first()),
  };
}

// ---- Observations -----------------------------------------------------------------------------

/** The Offer the tenant step as staff read it: the scheduled line, the message, any warning. */
export async function readOfferStep(ctx, page, leaseId) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, "?step=offer-tenant");
  const now = kit.now(page);
  await kit.shownWithin(now, 30_000);
  const primary = await waitForPrimary(ctx, page);
  const text = await kit.visibleText(now);
  const detail = await kit.visibleText(page.locator('[data-renewal-field="now-detail"]'));
  return {
    primary,
    nowDetail: detail,
    stageLine: await kit.stageLine(page),
    scheduledLine: /scheduled for/i.test(`${detail} ${text}`),
    mentionsFirstEnd: text.includes(usDate(FIRST_TERM_END)),
    mentionsChangedEnd: text.includes(usDate(CHANGED_TERM_END)),
    outOfDateWarnings: (text.match(/out of date|outdated|no longer matches/gi) ?? [])
      .length,
    heldOrPausedMentions: (
      text.match(/\bpaused\b|\bheld\b|not sent|earlier attempt|lease changed/gi) ?? []
    ).length,
  };
}

const latest = (sequences) => sequences.at(-1) ?? null;
const pickTick = (tick) => ({
  sent: tick?.sent ?? null,
  held: tick?.held ?? null,
  paused: tick?.paused ?? null,
  failures: tick?.failures ?? null,
  scanned: tick?.scanned ?? tick?.examined ?? null,
});
const sequenceSummary = (sequence) =>
  sequence
    ? {
        state: sequence.state ?? null,
        pause: sequence.pause?.cause ?? null,
        confirmed: sequence.confirmedCount ?? null,
        inbound: (sequence.inbound ?? []).length,
        threads: (sequence.threads ?? []).length,
      }
    : null;

// ---- W12-01 / W12-02: a scheduled tenant offer, a changed end date and the worker -------------

async function scheduledOfferWithChangedEnd(ctx, page, log) {
  const leaseId = ctx.leases.prepared.leaseId;
  await prepareTenantOffer(ctx, page, leaseId, log, { end: FIRST_TERM_END });
  const scheduled = await scheduleTenantOffer(ctx, page, leaseId);
  log.add("tenant offer scheduled", {
    status: scheduled.status,
    firstDate: scheduled.firstDate,
    time: scheduled.time,
  });
  if (scheduled.status !== 200)
    throw new Error(`The tenant offer was not scheduled: ${scheduled.alert}`);
  const changed = await enterRenewalDates(ctx, page, leaseId, { end: CHANGED_TERM_END });
  log.add("renewal end date changed", changed);
  return { leaseId, scheduled, changed };
}

/** W12-02: read the lease before the tick, then the lease, the desk and the notifications after. */
export async function journeyW1202(ctx, page) {
  const { kit } = ctx;
  const log = stepLog();
  const { leaseId, scheduled, changed } = await scheduledOfferWithChangedEnd(
    ctx,
    page,
    log,
  );
  const scheduledRecord = (await kit.sequences(leaseId, "renewal_tenant")).find(
    (sequence) => sequence.id === scheduled.sequenceId,
  );
  const before = await readOfferStep(ctx, page, leaseId);
  const notificationsBefore = await kit.notifications(page);
  const tick = await kit.tick(scheduled.sequenceId);
  log.add("worker tick", pickTick(tick));
  const held = (await kit.sequences(leaseId, "renewal_tenant")).find(
    (sequence) => sequence.id === scheduled.sequenceId,
  );
  const after = await readOfferStep(ctx, page, leaseId);
  const notificationsAfter = await kit.notifications(page);
  await kit.openPath(page, DESK);
  const desk = await kit.deskRow(page, leaseId);
  const authorized = String(scheduledRecord?.authorization?.initial?.plainText ?? "");
  return {
    observed: {
      endDateChangeSaved: changed.end === 200,
      scheduledAuthorizationEnd: authorized.includes(usDate(FIRST_TERM_END))
        ? "first"
        : authorized.includes(usDate(CHANGED_TERM_END))
          ? "changed"
          : "unread",
      beforeTick: before,
      tick: pickTick(tick),
      heldMessage: sequenceSummary(held),
      afterTick: after,
      deskAfterTick: { stage: desk.stage ?? null, next: desk.next ?? null },
      unreadNotificationsBefore: notificationsBefore.unread,
      unreadNotificationsAfter: notificationsAfter.unread,
    },
    steps: log.steps,
  };
}

/** S273 R-S273-3: the Offer step's primary while it holds the step on a held or outdated offer. */
const HELD_OFFER_PRIMARY =
  /^Review the updated offer$|^Review this tenant communication$/;

/**
 * W12-01's "send a new offer from the lease". The baseline's Offer step still reads "Review tenant
 * offer" and the offer is sent as before. A build whose step holds on the held offer (S273
 * R-S273-3: "Review the updated offer" and "Cancel the scheduled offer") offers no new send there;
 * that is recorded with the primary it read, and nothing is clicked.
 */
async function newOfferFromLease(ctx, page, leaseId) {
  await ctx.kit.openLease(page, leaseId, "?step=offer-tenant");
  // The held state shows once the step's message read answers; any other name is taken only
  // after it has stayed the same for ten seconds with nothing still reading.
  const primary = await waitForPrimary(ctx, page, (name) =>
    HELD_OFFER_PRIMARY.test(name),
  );
  if (HELD_OFFER_PRIMARY.test(primary ?? ""))
    return { offered: false, primary, status: null, alert: null };
  return { offered: true, primary, ...(await sendTenantOffer(ctx, page, leaseId)) };
}

/** W12-01: the same, then a new offer from the lease, Resume on the paused one, and a tick. */
export async function journeyW1201(ctx, page) {
  const { kit } = ctx;
  const log = stepLog();
  const { leaseId, scheduled } = await scheduledOfferWithChangedEnd(ctx, page, log);
  const firstTick = await kit.tick(scheduled.sequenceId);
  log.add("worker tick", pickTick(firstTick));
  const held = (await kit.sequences(leaseId, "renewal_tenant")).find(
    (sequence) => sequence.id === scheduled.sequenceId,
  );
  const fresh = await newOfferFromLease(ctx, page, leaseId);
  log.add("new tenant offer sent from the lease", {
    offered: fresh.offered,
    primary: fresh.primary,
    status: fresh.status,
  });
  const resumed = await resumeFromCommunications(ctx, page, leaseId, "renewal tenant");
  log.add("Resume reviewed sequence", {
    offered: resumed.offered,
    status: resumed.status,
    state: resumed.state,
    dialogShown: resumed.dialogShown,
  });
  const secondTick = await kit.tick(scheduled.sequenceId);
  log.add("worker tick", pickTick(secondTick));
  const messages = await kit.sentTo(kit.tenantAddresses(leaseId));
  const ends = messages.map((message) => {
    const text = `${message.subject ?? ""} ${message.text ?? ""} ${message.html ?? ""}`;
    return text.includes(usDate(CHANGED_TERM_END))
      ? "changed"
      : text.includes(usDate(FIRST_TERM_END))
        ? "first"
        : "neither";
  });
  return {
    observed: {
      scheduledSequenceId: scheduled.sequenceId,
      firstTick: pickTick(firstTick),
      heldMessage: sequenceSummary(held),
      newOfferStatus: fresh.status,
      newOffer: {
        offered: fresh.offered,
        primary: fresh.primary,
        status: fresh.status,
        alert: fresh.alert ?? null,
      },
      resume: {
        offered: resumed.offered,
        status: resumed.status,
        state: resumed.state,
        dialogShown: resumed.dialogShown,
        controlsEnabled: resumed.controlsEnabled ?? null,
        controlsShown: resumed.controlsShown ?? null,
        refusalReason: resumed.refusalReason ?? null,
      },
      secondTick: pickTick(secondTick),
      tenantMessages: messages.length,
      tenantThreads: new Set(messages.map((message) => message.threadId)).size,
      messageEndDates: ends,
      differentEndDates: new Set(ends.filter((end) => end !== "neither")).size > 1,
    },
    steps: log.steps,
  };
}

// ---- W12-03: a Send confirmed after the lease read has gone stale ------------------------------

/**
 * W12-03: open the owner review, leave it open past the 60 second lease read window, then confirm.
 * The confirm's own request starts the RentVine re-read whose admission may commit between its
 * floor reads and its notice observation. Up to `attempts` tries; a try that sends needs the
 * harness reset before the next one.
 */
export async function journeyW1203(ctx, page) {
  const { kit } = ctx;
  const log = stepLog();
  const leaseId = ctx.leases.prepared.leaseId;
  const attempts = Number(ctx.options?.w1203Attempts ?? 3);
  const waitSeconds = Number(ctx.options?.w1203WaitSeconds ?? 75);
  const tries = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) {
      await ctx.resetState();
      log.add("harness reset before the next try");
    }
    const { dialog, refreshes } = await openOwnerReview(ctx, page, leaseId);
    const result = {
      attempt,
      refreshesBeforeReview: refreshes,
      ...(await observeTimedOwnerConfirmation(ctx, page, leaseId, dialog, waitSeconds)),
    };
    tries.push(result);
    log.add("confirm after waiting", {
      attempt,
      status: result.status,
      refused: result.refusedAsChanged,
    });
    if (result.refusedAsChanged || result.status !== 200) break;
  }
  return {
    observed: {
      tries,
      refusedOnTry: tries.find((entry) => entry.refusedAsChanged)?.attempt ?? null,
      waitSeconds,
    },
    steps: log.steps,
  };
}

/** Observe the open review through one wait and one staff confirmation, including its receipt. */
export async function observeTimedOwnerConfirmation(ctx, page, leaseId, dialog, seconds) {
  const { kit } = ctx;
  const workingUrl = `${WORKING_ROUTE}?leaseId=${leaseId}`;
  const workingBefore = (await kit.read(page, workingUrl))?.record;
  const owners = kit.ownerAddresses(leaseId);
  const mailBefore = new Set((await kit.sentTo(owners)).map(({ id }) => id));
  const reviewBefore = await reviewText(ctx, dialog);
  const reads = new Set();
  const posts = [];
  let sendRequests = 0;
  const listen = (request) => {
    const url = new URL(request.url());
    if (url.origin !== ctx.origin) return;
    if (request.method() === "GET") reads.add(url.pathname);
    else {
      posts.push(url.pathname);
      if (request.method() === "POST" && url.pathname === SEQUENCES_ROUTE) {
        try {
          if (kit.sequenceAction(request.postDataJSON()) === "send") sendRequests += 1;
        } catch {
          // An unreadable command does not count as a send confirmation.
        }
      }
    }
  };
  page.on("request", listen);
  let waitedMs;
  let reviewUnchanged;
  let postsBeforeConfirm;
  let readsDuringWait;
  let confirmed;
  try {
    const opened = performance.now();
    await page.waitForTimeout(seconds * 1000);
    reviewUnchanged =
      reviewBefore.length > 0 && (await reviewText(ctx, dialog)) === reviewBefore;
    waitedMs = Math.floor(performance.now() - opened);
    postsBeforeConfirm = posts.length;
    readsDuringWait = [...reads].slice(0, 20);
    confirmed = await confirmReview(ctx, page, dialog, "Send this message", "send", {
      onNoAnswer: () => ctx.unresolved?.("W12-03 timed send: no answer"),
    });
  } finally {
    page.off("request", listen);
  }
  const workingAfter = (await kit.read(page, workingUrl))?.record;
  const sent = (await kit.sentTo(owners)).filter(({ id }) => !mailBefore.has(id));
  const receiptRead =
    confirmed.status === 200 && confirmed.sequenceId
      ? await kit
          .read(page, `${SEQUENCES_ROUTE}?id=${confirmed.sequenceId}`)
          .catch(() => null)
      : null;
  const sequence = receiptRead?.sequence;
  const [receipt] = receiptRead?.attempts ?? [];
  const [mail] = sent;
  return {
    waitedMs,
    waitedSeconds: Math.floor(waitedMs / 1000),
    status: confirmed.status,
    alert: confirmed.alert,
    refusedAsChanged: /recipients or source facts changed/i.test(
      `${confirmed.alert ?? ""} ${confirmed.error ?? ""}`,
    ),
    reviewUnchanged,
    postsBeforeConfirm,
    postsDuringTry: posts,
    sendRequests,
    readsDuringWait,
    workingRecordUnchanged:
      Boolean(workingBefore?.fields && workingAfter?.fields) &&
      JSON.stringify(workingBefore.fields) === JSON.stringify(workingAfter.fields),
    ownerMessagesSent: sent.length,
    receiptMatches:
      Boolean(sequence) &&
      sequence.id === confirmed.sequenceId &&
      sequence.confirmedCount === 1 &&
      sequence.unresolvedOccurrenceId === null &&
      receiptRead?.attemptsTruncated === false &&
      receiptRead.attempts.length === 1 &&
      receipt?.sequenceId === sequence.id &&
      receipt.authorizationRevision === sequence.authorization?.revision &&
      receipt.index === 0 &&
      receipt.state === "sent" &&
      Boolean(mail) &&
      receipt.gmailMessageId === mail.id &&
      receipt.gmailThreadId === mail.threadId &&
      receipt.rfcMessageId === mail.rfcMessageId,
  };
}

// ---- W12-04: an owner reply and every visible refresh ------------------------------------------

async function ownerWaitState(ctx, page, leaseId) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, "?step=ask-owner");
  const now = kit.now(page);
  const primary = await waitForPrimary(ctx, page);
  const text = await kit.visibleText(now);
  return {
    stageLine: await kit.stageLine(page),
    waitingOnOwner: /Waiting on (the )?owner/i.test(
      `${await kit.stageLine(page)} ${text}`,
    ),
    primary,
    replyDecisionForms: await page.locator("#renewal-owner-decision-from-reply").count(),
    replyChoices: await page
      .getByRole("radio", { name: /^Approved in the reply received/ })
      .count(),
    ownerRepliedText: /Owner replied/i.test(text),
  };
}

/** W12-04: send the owner message, deliver a reply, tick, then use each visible refresh. */
export async function journeyW1204(ctx, page) {
  const { kit, rehearsal } = ctx;
  const log = stepLog();
  const leaseId = ctx.leases.prepared.leaseId;
  const sent = await sendOwnerMessage(ctx, page, leaseId);
  log.add("owner message sent", { status: sent.status });
  if (sent.status !== 200)
    throw new Error(`The owner message was not sent: ${sent.alert}`);
  const replyText = "Synthetic owner reply: approved at the recommended rent.";
  const reply = await deliverOwnerReply(rehearsal, {
    to: kit.ownerAddresses(leaseId)[0],
    text: replyText,
  });
  log.add("owner reply delivered by the stand-in", { threadId: Boolean(reply.threadId) });
  const tick = await kit.tick();
  log.add("worker tick", pickTick(tick));
  const used = [];
  const seen = {};
  // The desk, then its "Refresh data".
  await kit.openPath(page, DESK);
  seen.desk = await kit.deskRow(page, leaseId);
  const deskRefresh = await refreshData(ctx, page);
  used.push({ control: "Refresh data (desk)", ...deskRefresh });
  seen.deskAfterRefresh = await kit.deskRow(page, leaseId);
  // The lease, then its "Refresh data".
  seen.lease = await ownerWaitState(ctx, page, leaseId);
  const leaseRefresh = await refreshData(ctx, page);
  used.push({ control: "Refresh data (lease)", ...leaseRefresh });
  seen.leaseAfterRefresh = await ownerWaitState(ctx, page, leaseId);
  // Communications: the worklist and attention refreshes shown on load, and the opened message.
  await kit.openPath(page, "/gmail-hub");
  for (const name of ["Refresh worklist", "Refresh attention"]) {
    const button = page.getByRole("button", { name, exact: true }).first();
    if (await kit.shownWithin(button, 20_000)) {
      await button.click();
      await page
        .waitForLoadState("networkidle", { timeout: 30_000 })
        .catch(() => undefined);
      used.push({ control: name, shown: true });
    } else used.push({ control: name, shown: false });
  }
  await page.getByRole("tab", { name: "Outgoing", exact: true }).click();
  const card = page
    .locator('[role="tabpanel"] article.ui-card')
    .filter({ hasText: `renewal owner · Lease ${leaseId}` })
    .first();
  let opened = null;
  if (await kit.shownWithin(card, 30_000)) {
    await card.getByRole("button", { name: "Open communication", exact: true }).click();
    const composer = page.getByRole("region", {
      name: "Workflow communication composer",
    });
    await composer.waitFor({ timeout: 60_000 });
    opened = {
      refreshLinkedIncoming: await composer
        .getByRole("button", { name: "Refresh linked incoming", exact: true })
        .count(),
    };
    const check = composer.getByRole("button", {
      name: "Check recorded status",
      exact: true,
    });
    if (await kit.shownWithin(check, 10_000)) {
      await check.click();
      await page.waitForTimeout(2000);
      used.push({ control: "Check recorded status", shown: true });
    }
  }
  seen.leaseAfterCommunications = await ownerWaitState(ctx, page, leaseId);
  await kit.openPath(page, DESK);
  seen.deskAtEnd = await kit.deskRow(page, leaseId);
  const record = latest(await kit.sequences(leaseId, "renewal_owner"));
  const states = [seen.lease, seen.leaseAfterRefresh, seen.leaseAfterCommunications];
  return {
    observed: {
      sendStatus: sent.status,
      replyDelivered: Boolean(reply.messageId),
      tick: pickTick(tick),
      refreshControlsUsed: used,
      openedCommunication: opened,
      leaseReads: states,
      deskRows: [seen.desk, seen.deskAfterRefresh, seen.deskAtEnd].map((row) => ({
        stage: row?.stage ?? null,
        next: row?.next ?? null,
      })),
      leaseKeptWaiting: states.every((state) => state.waitingOnOwner),
      replyShownOnLease: states.some(
        (state) =>
          state.replyDecisionForms > 0 ||
          state.replyChoices > 0 ||
          state.ownerRepliedText,
      ),
      ownerMessageRecord: sequenceSummary(record),
    },
    steps: log.steps,
  };
}

// ---- W12-05: the tenant's "Accepted" with follow-ups authorized --------------------------------

/** W12-05: send the tenant offer with follow-ups, choose "Accepted", then tick at the next due time. */
export async function journeyW1205(ctx, page) {
  const { kit } = ctx;
  const log = stepLog();
  const leaseId = ctx.leases.prepared.leaseId;
  await prepareTenantOffer(ctx, page, leaseId, log, { end: FIRST_TERM_END });
  const endDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Chicago",
  }).format(Date.now() + 60 * 86_400_000);
  const offer = await sendTenantOffer(ctx, page, leaseId, {
    followUps: {
      subject: "Following up on your renewal offer",
      body: "This is a synthetic rehearsal follow-up about the renewal offer we sent.",
      everyDays: 7,
      time: "09:00",
      endDate,
      sendLimit: 3,
    },
  });
  log.add("tenant offer sent with follow-ups", { status: offer.status });
  if (offer.status !== 200)
    throw new Error(`The tenant offer was not sent: ${offer.alert ?? offer.error}`);
  const sequenceId =
    offer.sequenceId ?? latest(await kit.sequences(leaseId, "renewal_tenant"))?.id;
  const mailBefore = (await kit.sentTo(kit.tenantAddresses(leaseId))).length;
  await kit.openLease(page, leaseId, "?view=full#renewal-manual-tenant_response");
  const scope = page.locator("#renewal-manual-tenant_response");
  if (!(await kit.shownWithin(scope, 20_000)))
    await kit.reveal(page, "#renewal-manual-tenant_response");
  const select = scope.getByLabel("Tenant response", { exact: true });
  await select.waitFor({ timeout: 30_000 });
  const saved = kit
    .appResponse(page, WORKSPACE_ROUTE, {
      match: (body) => body?.action?.kind === "tenant_response",
      timeout: 15_000,
    })
    .catch(() => null);
  await select.selectOption("accepted");
  const response = await saved;
  const reviewRegion = page.getByRole("region", { name: /Review the tenant/i });
  const reviewShown = await reviewRegion.count();
  log.add('tenant response "Accepted" chosen', { status: response?.status() ?? null });
  // S276 R-S276-1 (W12-05 candidate adaptation): where choosing no longer saves, staff read the
  // review and choose its one Save, so both builds reach the same recorded "Accepted" before the
  // tick. On a build that saves on selection there is no review and nothing more is clicked.
  let reviewText = null;
  let savedWithSave = null;
  if (response === null && reviewShown > 0) {
    reviewText = await kit.visibleText(reviewRegion.first());
    const answer = kit.appResponse(page, WORKSPACE_ROUTE, {
      match: (body) => body?.action?.kind === "tenant_response",
    });
    await reviewRegion.first().getByRole("button", { name: "Save", exact: true }).click();
    savedWithSave = (await answer).status();
    log.add('tenant response "Accepted" saved with Save', { status: savedWithSave });
  }
  const workspace = await kit.read(page, `${WORKSPACE_ROUTE}?leaseId=${leaseId}`);
  const tick = await kit.tick(sequenceId);
  log.add("worker tick at the next due time", pickTick(tick));
  const mailAfter = (await kit.sentTo(kit.tenantAddresses(leaseId))).length;
  const record = (await kit.sequences(leaseId, "renewal_tenant")).find(
    (sequence) => sequence.id === sequenceId,
  );
  return {
    observed: {
      offerStatus: offer.status,
      savedOnSelection: response !== null && response.status() === 200,
      reviewShownBeforeSave: reviewShown > 0,
      reviewText,
      savedWithSave,
      recordedOutcome: workspace?.state?.tenantResponse?.outcome ?? null,
      tick: pickTick(tick),
      tenantMessagesBeforeTick: mailBefore,
      tenantMessagesAfterTick: mailAfter,
      reminderSent: mailAfter > mailBefore,
      followUpRecord: sequenceSummary(record),
    },
    steps: log.steps,
  };
}

// ---- W12-06: "Set renewal base rent" on the covered lease ---------------------------------------

/** W12-06: follow "Set renewal base rent" on the covered lease's Offer step and read the focus. */
export async function journeyW1206(ctx, page) {
  const { kit } = ctx;
  const log = stepLog();
  const leaseId = ctx.leases.covered.leaseId;
  await kit.openLease(page, leaseId, "?step=offer-tenant");
  const primary = await waitForPrimary(
    ctx,
    page,
    (name) => name === "Set renewal base rent",
  );
  // The fix leads to the lease's Pricing basis; staff follow it once the page has read it.
  const basisLoaded = await page
    .locator("#renewal-pricing-basis")
    .waitFor({ state: "attached", timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  log.add("Offer step read", { primary, basisLoaded });
  let focus = null;
  let landed = null;
  if (primary === "Set renewal base rent") {
    await kit.primary(page).click();
    await settleFocus(page);
    focus = await kit.focused(page);
    landed = await page.evaluate(() => {
      const basis = document.getElementById("renewal-pricing-basis");
      return {
        step: new URL(window.location.href).searchParams.get("step"),
        fullView:
          document
            .querySelector("[data-renewal-full-toggle]")
            ?.getAttribute("aria-pressed") === "true",
        heading: (document.getElementById("renewal-now-heading")?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120),
        pricingBasisShown: Boolean(basis && basis.getClientRects().length > 0),
      };
    });
    log.add('"Set renewal base rent" followed', {
      focus: focus?.label ?? null,
      ...landed,
    });
  }
  const adopt = await page
    .getByRole("button", {
      name: /^Use (policy proposal|\$[\d,]+)|agreement amount|standing agreement/i,
    })
    .count();
  const adoptLinks = await page
    .getByRole("link", { name: /^Use \$[\d,]+|agreement amount/i })
    .count();
  const baseTotal = await kit.visibleText(
    page.locator('[data-offer-charge-total="base"]').first(),
  );
  const pricingChoices = await page
    .locator("#renewal-pricing-basis input[type=radio]")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        label: (node.closest("label")?.textContent ?? "").replace(/\s+/g, " ").trim(),
        checked: node.checked,
      })),
    )
    .catch(() => []);
  return {
    observed: {
      primary,
      pricingBasisLoadedBeforeClick: basisLoaded,
      focus,
      landed,
      focusOnOwnerDecides: /Owner decides each renewal/.test(focus?.label ?? ""),
      adoptionControls: adopt + adoptLinks,
      renewalBaseRent: baseTotal || null,
      pricingChoices,
    },
    steps: log.steps,
  };
}

// ---- W12-07: the pending Market value after a reviewed recommendation ----------------------------

/** W12-07: save a Rent to recommend that differs from the point estimate, then read Market value. */
export async function journeyW1207(ctx, page) {
  const { kit } = ctx;
  const log = stepLog();
  const leaseId = ctx.leases.prepared.leaseId;
  await kit.openLease(page, leaseId, "?step=compare-market");
  const field = page.locator("#renewal-now-rent-to-recommend");
  await field.waitFor({ timeout: 60_000 });
  const before = await field.inputValue().catch(() => "");
  const recommendation = Number(ctx.leases.byId(leaseId)?.rent ?? 0) + 75;
  const saved = kit.appResponse(page, WORKING_ROUTE, {
    match: (body) => ["terms_rent", "recommended_rent"].includes(body?.field),
  });
  await field.fill(String(recommendation));
  await field.press("Enter");
  const savedResponse = await saved;
  log.add("Rent to recommend saved", {
    status: savedResponse.status(),
    field: savedResponse.request().postDataJSON()?.field ?? null,
  });
  // The comparison inputs, as staff adjust them: the starting range's low figure, then Tab.
  await kit.openLease(page, leaseId, "?view=full#renewal-market-comparison-controls");
  const controls = page.locator("#renewal-market-comparison-controls");
  await controls.waitFor({ state: "attached", timeout: 60_000 });
  // "Comparison inputs and deliberate rerun", closed on arrival, opened by its summary.
  const holder = controls.locator("details").first();
  if ((await holder.count()) > 0) await kit.openDisclosure(holder);
  const marketText = await kit.visibleText(controls);
  const pointEstimate = Number(
    (/point estimate \$([\d,]+(?:\.\d+)?)/i.exec(marketText)?.[1] ?? "").replace(
      /,/g,
      "",
    ),
  );
  const low = controls.getByLabel(/^Market rent: low estimate/).first();
  let preparation = null;
  if (await kit.shownWithin(low, 30_000)) {
    const current = Number((await low.inputValue()) || 0);
    const next = current > 0 ? current - 25 : Number(ctx.leases.byId(leaseId)?.rent ?? 0);
    const prepared = kit.appResponse(page, WORKSPACE_ROUTE, {
      match: (body) => body?.action?.kind === "preparation",
      timeout: 60_000,
    });
    await low.fill(String(next));
    await low.press("Tab");
    const response = await prepared.catch(() => null);
    preparation = response
      ? {
          status: response.status(),
          pmiNumber: response.request().postDataJSON()?.action?.pmiNumber ?? null,
        }
      : null;
    log.add("starting range low figure adjusted", preparation ?? { saved: false });
  }
  await kit.openLease(page, leaseId, "?step=finish-up");
  let updates = page.locator("#renewal-manual-source-updates");
  if (!(await kit.shownWithin(updates, 20_000))) {
    await kit.openLease(page, leaseId, "?view=full#renewal-manual-source-updates");
    updates = page.locator("#renewal-manual-source-updates");
  }
  const items = await updates
    .locator("li")
    .evaluateAll((nodes) =>
      nodes.map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim()),
    )
    .catch(() => []);
  const marketLine = items.find((text) => /^Market value\b/i.test(text)) ?? null;
  const pending = Number(
    (/Market value:?\s*\$?([\d,]+(?:\.\d+)?)/i.exec(marketLine ?? "")?.[1] ?? "").replace(
      /,/g,
      "",
    ),
  );
  return {
    observed: {
      rentToRecommendBefore: before || null,
      recommendationSaved: savedResponse.status() === 200 ? recommendation : null,
      pointEstimate:
        Number.isFinite(pointEstimate) && pointEstimate > 0 ? pointEstimate : null,
      preparationSave: preparation,
      marketValueLineShown: marketLine !== null,
      pendingMarketValue: Number.isFinite(pending) && pending > 0 ? pending : null,
      pendingIsPointEstimate:
        Number.isFinite(pending) && pending > 0 && pending === pointEstimate,
      pendingIsRecommendation: pending === recommendation,
      sourceUpdateItems: items.length,
    },
    steps: log.steps,
  };
}

// ---- W12-08: one lease read by two staff members -------------------------------------------------

/** W12-08: the Editor's sent message and linked thread, then the same lease read as the Approver. */
export async function journeyW1208(ctx, page) {
  const { kit, rehearsal } = ctx;
  const log = stepLog();
  const leaseId = ctx.leases.prepared.leaseId;
  const sent = await sendOwnerMessage(ctx, page, leaseId);
  log.add("owner message sent by the Editor", { status: sent.status });
  if (sent.status !== 200)
    throw new Error(`The owner message was not sent: ${sent.alert}`);
  await deliverOwnerReply(rehearsal, {
    to: kit.ownerAddresses(leaseId)[0],
    text: "Synthetic owner reply for the two-reader check.",
  });
  log.add("owner reply delivered by the stand-in");
  // The Editor refreshes the linked thread the send recorded for the Editor's own mailbox.
  await kit.openLease(page, leaseId, "?view=full#renewal-card-follow-up");
  const card = page.locator("#renewal-card-follow-up");
  let linkRefresh = { shown: false };
  if (await kit.shownWithin(card, 30_000)) {
    const details = card
      .locator("details")
      .filter({ hasText: "Link or refresh exact Gmail evidence" })
      .first();
    if ((await details.count()) > 0) {
      await kit.openDisclosure(details);
      const button = details.getByRole("button", {
        name: "Refresh this linked thread",
        exact: true,
      });
      if (await kit.shownWithin(button, 15_000)) {
        const answer = kit.appResponse(page, "/api/gmail-hub/communications/refresh", {
          timeout: 60_000,
        });
        await button.click();
        const response = await answer.catch(() => null);
        linkRefresh = { shown: true, status: response?.status() ?? null };
        await page.waitForTimeout(1500);
      }
    }
  }
  log.add('Editor "Refresh this linked thread"', linkRefresh);
  const readAs = async (reader, role) => {
    await kit.openLease(reader, leaseId, "?step=ask-owner");
    const stage = await kit.stageLine(reader);
    const needsCheck = await reader.locator('[data-renewal-field="needs-check"]').count();
    await kit.openPath(reader, DESK);
    const desk = await kit.deskRow(reader, leaseId);
    await kit.openLease(reader, leaseId, "?view=full#renewal-card-follow-up");
    const control = await reader
      .getByRole("button", { name: "Refresh this linked thread", exact: true })
      .count();
    return {
      role,
      stageLine: stage,
      needsCheckNotes: needsCheck,
      deskStage: desk.stage ?? null,
      linkedThreadControls: control,
    };
  };
  const editor = await readAs(page, "Editor");
  const approverPage = await ctx.newPage("Approver");
  const approver = await readAs(approverPage, "Approver");
  return {
    observed: {
      sendStatus: sent.status,
      linkRefresh,
      editor,
      approver,
      differentStatus:
        editor.stageLine !== approver.stageLine ||
        editor.deskStage !== approver.deskStage,
    },
    steps: log.steps,
  };
}

// ---- W12-09: RentVine and Sheet rent differences on the Dashboard -------------------------------

/** W12-09: serve different Sheet rents on three leases, read RentVine again, read the Dashboard. */
export async function journeyW1209(ctx, page) {
  const { kit, rehearsal } = ctx;
  const log = stepLog();
  const sheetRows = kit.mix.sheet?.rows ?? [];
  const differing = [];
  try {
    for (const row of sheetRows) {
      const lease = ctx.leases.byId(row.leaseId);
      if (!lease) continue;
      const sheetRent = Number(String(row.cells[4] ?? "").replace(/[^0-9.]/g, ""));
      if (sheetRent > 0 && sheetRent !== lease.rent) {
        differing.push(String(row.leaseId));
        continue;
      }
      setSheetCells(rehearsal, row.leaseId, {
        4: `$${(lease.rent - 50).toLocaleString("en-US")}`,
      });
      differing.push(String(row.leaseId));
    }
    log.add("Sheet rents differ from RentVine", { leases: differing.length });
    await kit.openPath(page, DESK);
    const refreshed = await refreshData(ctx, page);
    log.add("Refresh data (desk)", refreshed);
    await kit.openPath(page, "/");
    const panel = page.locator('section[aria-label="Waiting on you"]');
    await panel.waitFor({ timeout: 60_000 });
    let stale = await kit.visibleText(
      panel.locator('[data-testid="renewal-review-issue"]'),
    );
    if (/stale/i.test(stale)) {
      const again = panel.getByRole("button", { name: "Try again", exact: true });
      if (await kit.shownWithin(again, 10_000)) {
        await again.click();
        await page.waitForTimeout(5000);
        log.add('Dashboard "Try again"');
      }
      stale = await kit.visibleText(
        panel.locator('[data-testid="renewal-review-issue"]'),
      );
    }
    const rows = await panel
      .locator("ul.dashboard-attention-list > li")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          label: (node.querySelector("a")?.textContent ?? "").trim(),
          text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
          authority: node.getAttribute("data-authority"),
        })),
      )
      .catch(() => []);
    const addresses = differing.map((leaseId) => {
      const property = kit.row(leaseId)?.property ?? {};
      return `${property.streetNumber} ${property.streetName}`;
    });
    const rentRows = rows.filter((row) => /^Current rent\b/i.test(row.label));
    return {
      observed: {
        leasesWithDifferences: differing.length,
        refreshStatus: refreshed.status ?? null,
        staleNotice: stale || null,
        attentionRows: rows.length,
        currentRentRows: rentRows.length,
        currentRentRowsNamingALease: rentRows.filter(
          (row) =>
            addresses.some((address) => row.text.includes(address)) ||
            differing.some((leaseId) => row.text.includes(leaseId)),
        ).length,
        rowLabels: rows.map((row) => row.label),
      },
      steps: log.steps,
    };
  } finally {
    for (const row of sheetRows)
      if (kit.row(row.leaseId)) setSheetCells(rehearsal, row.leaseId, null);
  }
}

// ---- W12-10: the Communications composer opened from a lease ------------------------------------

/** W12-10: "Open in Communications" from the lease, wait two seconds, close the composer's tab. */
export async function journeyW1210(ctx, page) {
  const { kit } = ctx;
  const log = stepLog();
  const leaseId = ctx.leases.prepared.leaseId;
  const draftsBefore = (await kit.sequences(leaseId)).filter(
    (sequence) => sequence.state === "draft",
  ).length;
  await reachPrimary(ctx, page, leaseId, "ask-owner", "Review owner message");
  const link = page.locator('a[data-renewal-field="composer-link"]').first();
  // S281 R-S281-12 moved "Open in Communications" into the closed "Other ways to send" group on
  // purpose: open the disclosure that holds it by its summary, as staff do. Where the link is
  // already shown (the baseline) this opens nothing, so both builds reach the same state.
  await kit.reveal(page, 'a[data-renewal-field="composer-link"]');
  await link.waitFor({ timeout: 30_000 });
  const posts = [];
  const opened = page.context().waitForEvent("page", { timeout: 60_000 });
  await link.click();
  const composerPage = await opened;
  composerPage.on("request", (request) => {
    if (request.method() !== "GET") posts.push(new URL(request.url()).pathname);
  });
  await composerPage.waitForLoadState("domcontentloaded").catch(() => undefined);
  const composer = composerPage.getByRole("region", {
    name: "Workflow communication composer",
  });
  const shown = await kit.shownWithin(composer, 90_000);
  await composerPage.waitForTimeout(2000);
  const url = composerPage.url();
  await composerPage.close();
  log.add("composer opened and closed", { shown });
  await page.waitForTimeout(1500);
  const draftsAfter = (await kit.sequences(leaseId)).filter(
    (sequence) => sequence.state === "draft",
  ).length;
  return {
    observed: {
      composerShown: shown,
      addressNamesACommunication: /[?&]communication=/.test(url),
      writesWhileOpen: [...new Set(posts)],
      draftsBefore,
      draftsAfter,
      newDrafts: draftsAfter - draftsBefore,
    },
    steps: log.steps,
  };
}

// ---- W12-11: the off-cycle lease ----------------------------------------------------------------

/** The readiness list of a lease's owner message, once the message has been read. */
async function ownerReadiness(ctx, page, leaseId) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, "?step=ask-owner");
  await waitForPrimary(ctx, page);
  const list = page.locator('ul[aria-label="What sending needs"]').first();
  await kit.shownWithin(list, 30_000);
  return list
    .locator(":scope > li")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        ready: node.getAttribute("data-renewal-ready"),
        text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
      })),
    )
    .catch(() => []);
}

/** W12-11: open the off-cycle lease, read its readiness rows and look for a clearing control. */
export async function journeyW1211(ctx, page) {
  const { kit } = ctx;
  const log = stepLog();
  const leaseId = ctx.options?.offCycleLeaseId ?? 9106;
  const readCurrent = async () => {
    await kit.openLease(page, leaseId);
    const primary = await waitForPrimary(ctx, page);
    const now = kit.now(page);
    const text = await kit.visibleText(now);
    return {
      heading: await kit.visibleText(page.locator("#renewal-now-heading")),
      stageLine: await kit.stageLine(page),
      blocker:
        (await kit.visibleText(now.locator('p.renewal-notice[role="alert"]').first())) ||
        null,
      primary,
      offCycleNotice: /Off-cycle end date/i.test(text),
    };
  };
  let current = await readCurrent();
  let rows = await ownerReadiness(ctx, page, leaseId);
  log.add("off-cycle lease opened", {
    heading: current.heading,
    readiness: rows.length,
  });
  // The owner message's readiness needs a rent to recommend; staff enter one on Compare market
  // rent when the lease has none, as on any lease that was not prepared.
  let rentEntered = null;
  const rent = rows.find((row) => /Rent to recommend/i.test(row.text));
  if (rent && rent.ready !== "ready") {
    await kit.openLease(page, leaseId, "?step=compare-market");
    const field = page.locator("#renewal-now-rent-to-recommend");
    if (await kit.shownWithin(field, 60_000)) {
      const saved = kit.appResponse(page, WORKING_ROUTE, {
        match: (body) => ["terms_rent", "recommended_rent"].includes(body?.field),
      });
      await field.fill(String(Number(ctx.leases.byId(leaseId)?.rent ?? 0) + 50));
      await field.press("Enter");
      rentEntered = (await saved).status();
      log.add("Rent to recommend entered", { status: rentEntered });
      current = await readCurrent();
      rows = await ownerReadiness(ctx, page, leaseId);
    }
  }
  const clearing = async () =>
    (await page
      .getByRole("button", {
        name: /^(Include|Confirm (the )?(lease )?end date|Clear (the )?hold|Keep (this|the) (end )?date|Mark .*reviewed|Record .*review)/i,
      })
      .count()) + (await page.getByRole("radio", { name: /^Include\b/i }).count());
  // The current step, where the hold shows, and its one action.
  await kit.openLease(page, leaseId);
  await waitForPrimary(ctx, page);
  const clearingBefore = await clearing();
  let focus = null;
  if (current.primary) {
    await kit.primary(page).click();
    await settleFocus(page);
    focus = await kit.focused(page);
    log.add("the step's primary followed", { focus: focus?.label ?? null });
  }
  return {
    observed: {
      currentStep: current.heading,
      stageLine: current.stageLine,
      blocker: current.blocker,
      offCycleNotice: current.offCycleNotice,
      primary: current.primary,
      primaryNamesTheProblem: /Off-cycle|end date/i.test(current.primary ?? ""),
      rentToRecommendEntered: rentEntered,
      readinessRows: rows.length,
      readyRows: rows.filter((row) => row.ready === "ready").length,
      readiness: rows.map((row) => row.text),
      readinessIncludesEndDate: rows.some((row) => /end date|off-cycle/i.test(row.text)),
      clearingControls: clearingBefore,
      clearingControlsAfterPrimary: await clearing(),
      focusAfterPrimary: focus,
    },
    steps: log.steps,
  };
}

// ---- W12-12: Prepare under a filter ---------------------------------------------------------------

/**
 * The Working batch search term of the candidate adaptation below: in the November 5 mix it shows
 * 5 of the 9 monthly rows by address (every tenant name reads "Example", so the desk table's term
 * would show all nine there), 3 of the month's 5 preparation targets.
 */
export const W1212_BATCH_SEARCH = "Sample";

/**
 * W12-12: narrow the month with the visible filter staff have, then "Prepare {month} leases" on the
 * Working batch. The baseline's Working batch has no filter of its own; its desk table filters
 * the leases ("Filter lease/location") and the Working batch control returns to the month.
 *
 * Candidate adaptation (S283 R-S283-2): on a build whose Working batch has its own search box,
 * Prepare follows that box and not the desk table's filter, so after the same desk table steps the
 * sequence also types W1212_BATCH_SEARCH (or ctx.options.w1212Search) into it before Prepare, the
 * way staff narrow the month on that build. On the baseline (no such box) nothing changes. The
 * extra observations (the search, the shown targets, the line, the leases posted and the lookups
 * by lease) are additive.
 */
export async function journeyW1212(ctx, page) {
  const { kit } = ctx;
  const log = stepLog();
  const term = ctx.options?.w1212Filter ?? "Example";
  await kit.openPath(page, DESK);
  const batch = page.locator('section[aria-label="Working batch"]').first();
  await batch.waitFor({ timeout: 90_000 });
  const monthly = page.getByRole("button", { name: /^Monthly renewals \d+/ }).first();
  const monthlyText = (await kit.shownWithin(monthly, 15_000))
    ? kit.squash(await monthly.innerText())
    : null;
  const monthlyLeases = await page
    .locator("tr[data-batch-lease]")
    .evaluateAll((nodes) =>
      [...new Set(nodes.map((node) => node.getAttribute("data-batch-lease")))].filter(
        Boolean,
      ),
    );
  const batchSearch = batch.getByRole("searchbox").or(batch.getByLabel(/search|filter/i));
  const batchFilterControls = await batchSearch.count();
  // The desk's table filter, as staff use it, then back to the Working batch.
  await page.getByRole("link", { name: "All leases and filters", exact: true }).click();
  await page
    .locator("#renewal-filter-lease")
    .waitFor({ state: "attached", timeout: 90_000 });
  const filterSummary = page
    .locator("details")
    .filter({ has: page.locator("#renewal-filter-lease") })
    .first();
  if ((await filterSummary.count()) > 0) await kit.openDisclosure(filterSummary);
  await page.locator("#renewal-filter-lease").waitFor({ timeout: 30_000 });
  await page.locator("#renewal-filter-lease").fill(term);
  await page
    .locator("form")
    .filter({ has: page.locator("#renewal-filter-lease") })
    .getByRole("button", { name: "Apply", exact: true })
    .click();
  await page.waitForURL(/[?&]lease=/, { timeout: 90_000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  const filteredLeases = await page
    .locator("tr[data-lease-id]")
    .evaluateAll((nodes) =>
      [...new Set(nodes.map((node) => node.getAttribute("data-lease-id")))].filter(
        Boolean,
      ),
    );
  const shownOfMonth = filteredLeases.filter((leaseId) =>
    monthlyLeases.includes(leaseId),
  );
  log.add("desk table filtered", {
    term,
    shown: filteredLeases.length,
    shownOfMonth: shownOfMonth.length,
  });
  await page.getByRole("link", { name: "Working batch", exact: true }).click();
  await batch.waitFor({ timeout: 90_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  const shownAfterReturn = await page
    .locator("tr[data-batch-lease]")
    .evaluateAll(
      (nodes) => new Set(nodes.map((node) => node.getAttribute("data-batch-lease"))).size,
    );
  // The candidate adaptation: narrow the month in the Working batch's own search box.
  let batchSearchTerm = null;
  if (batchFilterControls > 0) {
    batchSearchTerm = ctx.options?.w1212Search ?? W1212_BATCH_SEARCH;
    await batch.getByRole("searchbox").first().fill(batchSearchTerm);
    await page.waitForTimeout(800);
    log.add("Working batch searched", { term: batchSearchTerm });
  }
  const shownRows = await page
    .locator('section[aria-label="Working batch"] tr[data-batch-lease]')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        leaseId: node.getAttribute("data-batch-lease"),
        group: node.getAttribute("data-batch-group"),
        preparation: node.getAttribute("data-batch-preparation"),
      })),
    );
  const shownTargetRows = [
    ...new Set(
      shownRows
        .filter((row) => row.group === "this_batch" && row.preparation !== "held")
        .map((row) => row.leaseId),
    ),
  ].filter(Boolean);
  let prepare = page.locator("[data-kickoff-prepare]").first();
  await prepare.waitFor({ timeout: 60_000 });
  if (await prepare.isDisabled()) {
    await refreshData(ctx, page);
    prepare = page.locator("[data-kickoff-prepare]").first();
    await prepare.waitFor({ timeout: 60_000 });
  }
  const buttonName = kit.squash(await prepare.innerText());
  const preparation = page.locator('section[aria-label="Batch preparation"]').first();
  const targets = Number((await preparation.getAttribute("data-kickoff-targets")) ?? NaN);
  const monthTargets = Number(
    (await preparation.getAttribute("data-kickoff-month-targets")) ?? NaN,
  );
  const scopeLine = kit.squash(
    await preparation
      .locator("[data-kickoff-scope]")
      .first()
      .innerText()
      .catch(() => ""),
  );
  const posted = [];
  const listen = (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === KICKOFF_ROUTE
    ) {
      try {
        posted.push(String(request.postDataJSON()?.leaseId ?? ""));
      } catch {
        posted.push("");
      }
    }
  };
  page.on("request", listen);
  const comparisonsBefore = await kit.comparisons();
  await prepare.click();
  await page
    .locator("[data-kickoff-progress]")
    .filter({ hasText: /Preparation finished/ })
    .or(page.getByText(/Preparation finished for/))
    .first()
    .waitFor({ timeout: 600_000 })
    .catch(() => undefined);
  await page.waitForTimeout(2000);
  page.off("request", listen);
  const comparisonsAfter = await kit.comparisons();
  const outcomes = await page
    .locator('ul[aria-label="Preparation results"] > li')
    .count()
    .catch(() => 0);
  const prepared = [...new Set(posted.filter(Boolean))];
  const lookupsByLease = Object.fromEntries(
    Object.entries(comparisonsAfter)
      .map(([leaseId, count]) => [leaseId, count - (comparisonsBefore[leaseId] ?? 0)])
      .filter(([, count]) => count !== 0),
  );
  return {
    observed: {
      monthlyRenewalsButton: monthlyText,
      monthlyLeases: monthlyLeases.length,
      workingBatchFilterControls: batchFilterControls,
      filterTerm: term,
      filteredShown: filteredLeases.length,
      filteredShownOfMonth: shownOfMonth.length,
      rowsShownAfterReturn: shownAfterReturn,
      prepareButton: buttonName,
      buttonNamesACount: /\d/.test(buttonName.replace(/\b\d{4}\b/g, "")),
      targets: Number.isFinite(targets) ? targets : null,
      leasesPrepared: prepared.length,
      preparedOutsideFilter: prepared.filter((leaseId) => !shownOfMonth.includes(leaseId))
        .length,
      resultRows: outcomes,
      comparisonRequests:
        Object.values(comparisonsAfter).reduce((sum, count) => sum + count, 0) -
        Object.values(comparisonsBefore).reduce((sum, count) => sum + count, 0),
      // The candidate adaptation's observations (null or empty on the baseline).
      workingBatchSearch: batchSearchTerm,
      rowsShownAfterSearch: new Set(shownRows.map((row) => row.leaseId)).size,
      shownTargets: shownTargetRows,
      monthTargets: Number.isFinite(monthTargets) ? monthTargets : null,
      scopeLine: scopeLine || null,
      postedLeases: posted.filter(Boolean),
      preparedOutsideShown: prepared.filter(
        (leaseId) => !shownTargetRows.includes(leaseId),
      ).length,
      lookupsByLease,
    },
    steps: log.steps,
  };
}

// ---- W12-13: a start with no end, the owner review, the sole owner's reply and the answer ---------

/** W12-13: save a start only, read the owner review, deliver the sole owner's reply, open the answer. */
export async function journeyW1213(ctx, page) {
  const { kit, rehearsal } = ctx;
  const log = stepLog();
  const leaseId = ctx.leases.prepared.leaseId;
  const start = await enterRenewalDates(ctx, page, leaseId, { start: "day-after" });
  log.add("renewal start saved with no end", start);
  const endOffer = await readEndDateOffer(ctx, page, leaseId);
  const { dialog } = await openOwnerReview(ctx, page, leaseId);
  const text = await reviewText(ctx, dialog);
  const startIso = (await kit.read(page, `${WORKING_ROUTE}?leaseId=${leaseId}`))?.record
    ?.fields?.terms_effective_date?.value;
  // The phrases a term would be stated in; the matches, not the message, are kept.
  const termPhrases = [
    ...new Set(
      (
        text.match(
          /\b\d{1,2}[- ]month\b|\btwelve[- ]month\b|\blease term\b|\brenewal term\b|\bthrough \d{2}\/\d{2}\/\d{4}\b|\b\d{2}\/\d{2}\/\d{4} (?:to|through) \d{2}\/\d{2}\/\d{4}\b/gi,
        ) ?? []
      ).map((phrase) => phrase.toLowerCase().replace(/\d/g, "#")),
    ),
  ];
  const review = {
    statesATerm: termPhrases.length > 0,
    termPhrases,
    mentionsStartDate: startIso ? text.includes(usDate(String(startIso))) : null,
  };
  const sent = await confirmReview(ctx, page, dialog, "Send this message", "send");
  log.add("owner message sent", { status: sent.status });
  if (sent.status !== 200)
    throw new Error(`The owner message was not sent: ${sent.alert}`);
  const owners = kit.ownerAddresses(leaseId);
  await deliverOwnerReply(rehearsal, {
    to: owners[0],
    text: "Synthetic reply from the sole owner: approved, please renew.",
  });
  const tick = await kit.tick();
  log.add("sole owner's reply delivered; worker tick", pickTick(tick));
  // Open the answer: the step's own control while waiting on the owner.
  await kit.openLease(page, leaseId, "?step=ask-owner");
  const primary = await kit.primaryName(page, 30_000);
  let answer = { primary };
  const replyForm = page.locator("#renewal-owner-decision-from-reply");
  if (await kit.shownWithin(replyForm, 5_000)) {
    const choice = replyForm.getByRole("radio", {
      name: /^Approved in the reply received/,
    });
    if ((await choice.count()) > 0) await choice.first().check();
    answer = {
      ...answer,
      form: "reply",
      who: await replyForm
        .getByLabel("Who approved in this reply", { exact: true })
        .inputValue()
        .catch(() => null),
      coverage: await replyForm
        .locator(
          'input[type="radio"][value="amount_only"], input[type="radio"][value="exact_terms"]',
        )
        .evaluateAll((nodes) =>
          nodes.map((node) => ({ value: node.value, checked: node.checked })),
        ),
    };
  } else if (primary === "Record owner response") {
    await kit.primary(page).click();
    const form = page.locator("#renewal-manual-owner_response");
    if (!(await kit.shownWithin(form, 20_000)))
      await kit.reveal(page, "#renewal-manual-owner_response");
    await form
      .getByLabel("Owner response", { exact: true })
      .selectOption({ label: "Approved" });
    const approval = form.locator('[data-renewal-field="owner-answer-approval"]');
    await approval.waitFor({ timeout: 30_000 });
    answer = {
      ...answer,
      form: "manual",
      who: await approval.getByLabel("Who approved", { exact: true }).inputValue(),
      replyChannelOffered:
        (await approval
          .getByLabel("How they approved", { exact: true })
          .locator('option[value="linked_reply"]')
          .count()) > 0,
      coverage: await approval
        .locator('input[type="radio"]')
        .evaluateAll((nodes) =>
          nodes.map((node) => ({ value: node.value, checked: node.checked })),
        ),
    };
  }
  log.add("owner's answer opened", { form: answer.form ?? null });
  const coverage = answer.coverage ?? [];
  return {
    observed: {
      startSaved: start.start === 200,
      endDateOffered: endOffer.suggestionButtons > 0 || endOffer.suggestedEndText,
      endOffer,
      ownerReview: review,
      ownersOfRecord: owners.length,
      replyDelivered: true,
      tick: pickTick(tick),
      answerForm: answer.form ?? null,
      answerPrimary: answer.primary,
      replyChannelOffered: answer.replyChannelOffered ?? null,
      coverageOptions: coverage.map((option) => option.value),
      coverageChecked: coverage.find((option) => option.checked)?.value ?? null,
      ownerSelected: Boolean(answer.who),
    },
    steps: log.steps,
  };
}

// ---- W12-14: the renewal Spaces and Start run -----------------------------------------------------

/** W12-14: the renewal Space cards, then Start run on Owner Renewal Outreach. */
export async function journeyW1214(ctx, page) {
  const { kit, rehearsal } = ctx;
  const log = stepLog();
  // The production process seed's Draft, with placeholder staff (the rehearsal seeds none).
  const seeded = await seedRenewalProcessDraft(rehearsal, "owner-renewal-outreach");
  log.add("Owner Renewal Outreach process Draft seeded (harness)", seeded);
  await kit.openPath(page, "/spaces");
  const cards = await page.locator("a.space-card").evaluateAll((nodes) =>
    nodes.map((node) => ({
      name: (node.querySelector("h2")?.textContent ?? "").trim(),
      state: (node.querySelector(".space-card-state-pill")?.textContent ?? "").trim(),
      href: node.getAttribute("href"),
    })),
  );
  const renewal = cards.filter((card) =>
    /Lease Renewals|Owner Renewal Outreach|Tenant Renewal Notice/.test(card.name),
  );
  const outreach = page
    .locator("a.space-card")
    .filter({ hasText: "Owner Renewal Outreach" })
    .first();
  await outreach.click();
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  const overview = page.getByRole("link", { name: "Overview", exact: true }).first();
  if (await kit.shownWithin(overview, 30_000)) await overview.click();
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  const start = page.getByRole("button", { name: "Start run", exact: true }).first();
  const startShown = await kit.shownWithin(start, 60_000);
  let attempt = null;
  if (startShown) {
    const answer = kit.appResponse(
      page,
      "/api/process-definitions/owner-renewal-outreach/runs",
      { timeout: 60_000 },
    );
    await start.click();
    const response = await answer.catch(() => null);
    const error = page.locator("p.form-error").first();
    attempt = {
      status: response?.status() ?? null,
      message: (await kit.shownWithin(error, 15_000))
        ? await kit.visibleText(error)
        : null,
    };
    log.add("Start run", attempt);
  }
  return {
    observed: {
      processDraft: seeded?.action ?? null,
      renewalSpaceCards: renewal.map(({ name, state }) => ({ name, state })),
      cardsReadingNeedsAProcess: renewal.filter((card) =>
        /Needs a process/.test(card.state),
      ).length,
      startRunShown: startShown,
      startRunStatus: attempt?.status ?? null,
      startRunMessage: attempt?.message ?? null,
    },
    steps: log.steps,
  };
}

/** The fourteen journeys by id, in table order. */
export const W12_JOURNEYS = Object.freeze({
  "W12-01": journeyW1201,
  "W12-02": journeyW1202,
  "W12-03": journeyW1203,
  "W12-04": journeyW1204,
  "W12-05": journeyW1205,
  "W12-06": journeyW1206,
  "W12-07": journeyW1207,
  "W12-08": journeyW1208,
  "W12-09": journeyW1209,
  "W12-10": journeyW1210,
  "W12-11": journeyW1211,
  "W12-12": journeyW1212,
  "W12-13": journeyW1213,
  "W12-14": journeyW1214,
});
