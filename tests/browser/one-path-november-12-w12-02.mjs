// S284 W12-02, "See the held message": the candidate-side acceptance checks of S273 (intake 151)
// for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-held-and-outdated-message-visibility.md (S273).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S273-1, AC-S273-2, AC-S273-3, AC-S273-4, AC-S273-5, AC-S273-6
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Before any tick, read the out-of-date state with both values on the lease and the desk. After
//   a tick, read the hold, the notification and the earlier attempt. Update in one confirmation.
//
// Starting sequence (journeyW1202 in one-path-november-12-journeys.mjs, the fail-first table):
//   After the end date change and before any tick, read the lease. After the tick, read the lease
//   and the notifications. On the baseline: New wording above the old schedule; after the hold,
//   no trace and no notification. It runs unchanged on the candidate.
//
// How each state is reached, through what staff can do (R-S284-2): the Editor's visible controls
// (the step's review and its Schedule, "Review the updated ...", the cancel confirmation and its
// dismissal, Working renewal terms, Rent to recommend, the lease's Email body, the Communications
// composer and the notification menu); the mail stand-in's next-send hook for an unconfirmed send;
// a RentVine read outage for the failure after the wording save; and time only through the worker
// tick (kit.tick makes the named message due) and real waiting. Nothing here posts an app route;
// every request is one a visible control makes, and the reads are pages, GET routes, the
// rehearsal's own emulator and the stand-ins' state.
//
//   Part "tenant" (lease "prepared", carried on from the starting sequence, BEH-S273-1 to -4):
//     T1 the starting sequence's reads: before the tick the Offer step reads out of date with both
//        end dates; after the tick it reads held with its time and the values.
//     T2 after the tick: the desk row's one cue, the notification (the sender's feed and menu, the
//        link it opens, another staff member's feed), Verification opened with zero effects, a
//        second tick that sends and resumes nothing, and the update review and the cancel
//        confirmation each dismissed with zero effects.
//     T3 "Review the updated offer" with the carried date and time and one confirmation: one
//        sequence, the original time, the new wording, the stored time after a reload, the earlier
//        attempt listed, the desk row scheduled with no cue.
//     T4 before any tick: a third end date, then the lease's own wording alone, each read on the
//        lease and the desk with both values; each put back reads current again.
//     T5 the tick at that time with the stand-in's next send unconfirmed: the step and the desk
//        row read unconfirmed; the step's "Check whether the message went out" settles it (the
//        worker never does); the mailbox holds exactly one tenant message with the current end
//        date.
//   Part "communication" (after the harness reset; owner message): wording edited on the
//     communication itself reads held for that cause, never out of date.
//   Part "owner" (after the harness reset; BEH-S273-5): the owner message scheduled a few minutes
//     ahead, Rent to recommend changed and read on the lease and the desk before any tick, the
//     tick's hold and its notification, then, once the time has passed, the update with "Send
//     now" and a RentVine outage after the wording save (held, with the retry), the retry sent with
//     the stand-in's next send unconfirmed, and "Check whether the message went out": exactly one
//     owner sequence and one owner message with the new rent.
//
// Not reachable through staff controls in this rehearsal, and proven by S273's backend tests
// instead: a lease read that does not settle keeping the prior state (AC-S273-2, keepSettledMessageBases)
// and a user without workflow access (AC-S273-5; here another staff member's feed is read). The
// difference labels are S274's reviewed-input labels ("Renewal end date"), which the spec's
// example calls "Term end".
//
// "Verification lists the earlier attempt" (AC-S273-3) is read as R-S273-5 defines the list:
// cancelled, held and then updated, and unconfirmed and then resolved. A held message that has not
// been updated is the step's current state (read with its cause and time), so the earlier attempt
// is read in Verification once the update ended it, and opening Verification is measured for zero
// effects both while the message is held and after. What Verification shows right after the tick
// is recorded.
//
// Development iteration only: --w1202-parts tenant,communication,owner runs those parts; a check
// whose part did not run is left out (not recorded), so such a run never reads Yes.
import {
  setNextSend,
  setRentvineOutage,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import {
  CHANGED_TERM_END,
  FIRST_TERM_END,
  enterRenewalDates,
  reachPrimary,
  reviewText,
  stepScheduleButton,
  waitForPrimary,
} from "./one-path-november-12-journeys.mjs";
import {
  DESK,
  PREPARATION_ROUTE,
  SEQUENCES_ROUTE,
  WORKING_ROUTE,
  ownerRecommendationAmounts,
} from "./one-path-november-12-kit.mjs";

const CHECKS = [
  "AC-S273-1",
  "AC-S273-2",
  "AC-S273-3",
  "AC-S273-4",
  "AC-S273-5",
  "AC-S273-6",
];
/** A third end date for the before-tick read after the update (T4). */
export const THIRD_TERM_END = "2027-09-30";
const usDate = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
/** The settled date and time format (lib/date-display.ts formatBusinessTimestamp). */
const STAMP = String.raw`\d{2}/\d{2}/\d{4}, \d{1,2}:\d{2} [AP]M C[SD]T`;
const REVIEW_TEXT = '[data-renewal-field="exact-review"]';
const DIALOG_ERROR = '.ui-dialog-error[role="alert"]';
const DIALOG_SCHEDULE = "Review and schedule";
const SEND = "Send this message";
const SCHEDULE = "Schedule this message";
const RENT_FIELD = "#renewal-now-rent-to-recommend";
const OUTAGE_PATH = "leases/export";
const OCCURRENCES = "gmail_communication_occurrences";
const NOTICE_TITLE = "Renewal message held";
const CHANGED_CAUSE = "The lease or recipient facts changed";
const EDITED_CAUSE = "The message was edited after review";
const UNCONFIRMED_CAUSE = "The send could not be confirmed; checking";
const WORDING_CHANGED =
  "The lease's message wording was edited after this message was reviewed.";
const WORDING_EDIT = " Synthetic wording edit for the W12-02 check.";
const SUBJECT_EDIT = " (edited in Communications)";

/** The audience's words and places (R-S273-3: "owner message" where the tenant step says "offer"). */
const TENANT = Object.freeze({
  audience: "tenant",
  step: "offer-tenant",
  purpose: "renewal_tenant",
  hub: "renewal tenant",
  outOfDate: "Scheduled offer is out of date.",
  held: "Offer held",
  review: "Review the updated offer",
  cancel: "Cancel the scheduled offer",
  open: "Review this tenant communication",
  sendReview: "Review tenant offer",
  verification: "Verify offer facts and delivery",
  noticeWhat: "tenant offer",
  scheduledWho: "Tenant",
});
const OWNER = Object.freeze({
  audience: "owner",
  step: "ask-owner",
  purpose: "renewal_owner",
  hub: "renewal owner",
  outOfDate: "Scheduled owner message is out of date.",
  held: "Owner message held",
  review: "Review the updated owner message",
  cancel: "Cancel the scheduled owner message",
  open: "Review this owner communication",
  sendReview: "Review owner message",
  verification: "Verify owner terms and outreach",
  noticeWhat: "owner message",
  scheduledWho: "Owner",
});

const BUSINESS_STAMP = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});
/** An instant as the app prints it: "11/13/2026, 9:00 AM CST". */
const stamp = (ms) =>
  typeof ms === "number" && Number.isFinite(ms) ? BUSINESS_STAMP.format(ms) : null;
/** A stored wall date and time ("2026-11-14", "09:00") as the app prints it, without the zone. */
function wallStamp(date, time) {
  const [hour, minute] = String(time).split(":").map(Number);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${usDate(date)}, ${twelve}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}
/** Central wall clock `minutes` from now, as the schedule fields take it. */
function centralAhead(minutes) {
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
      .formatToParts(new Date(Date.now() + minutes * 60_000))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}
export function money(value) {
  const [whole, cents] = Math.abs(Number(value)).toFixed(2).split(".");
  return `${Number(value) < 0 ? "-" : ""}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}
const squash = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
const escape = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** "Renewal end date: 12/31/2027 in the scheduled message, 06/30/2027 on the lease." */
const bothValues = (label, previous, current) =>
  `${label}: ${previous} in the scheduled message, ${current} on the lease.`;

function developmentParts() {
  const index = process.argv.indexOf("--w1202-parts");
  if (index < 0) return null;
  return new Set(
    String(process.argv[index + 1] ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

/**
 * Run one read or step; a failure is recorded and reads as `fallback` (which never passes a
 * check), so the steps after it still run and are still measured.
 */
async function guard(ctx, name, run, fallback) {
  try {
    return await run();
  } catch (error) {
    ctx.record({ step: name, error: String(error?.message ?? error).slice(0, 900) });
    return fallback;
  }
}
const NO_STEP = Object.freeze({
  read: false,
  primary: null,
  detail: "",
  nowText: "",
  stageLine: "",
  cancelLabel: null,
  scheduledAt: null,
  outOfDate: false,
  outOfDateWords: 0,
  heldLine: null,
  heldAt: null,
  notConfirmed: false,
  text: "",
});
const NO_DESK = Object.freeze({
  shown: false,
  stage: null,
  next: null,
  text: "",
  cues: -1,
  cueKind: null,
  cueText: null,
  cueHref: null,
  attempts: 0,
});
const NO_VERIFICATION = Object.freeze({
  summary: "",
  text: "",
  attempts: [],
  zeroEffects: false,
  windowWrites: [],
});

// ---- Reading what staff read ------------------------------------------------------------------

/** Wait until no message part still says it is reading (at most 60 s), then a moment more. */
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
 * The step as staff read it in Guided view: the primary, the Now card's detail line and text, the
 * stage line, the second action in the message group and any stored scheduled time.
 */
async function readStep(ctx, page, leaseId, who, wanted = null) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, `?step=${who.step}`);
  const matches = (name) =>
    wanted === null
      ? false
      : typeof wanted === "string"
        ? name === wanted
        : wanted.test(name ?? "");
  const primary = await waitForPrimary(ctx, page, matches, wanted ? 90_000 : 40_000);
  await settled(page);
  const now = kit.now(page);
  const nowText = await kit.visibleText(now);
  const detail = await kit.visibleText(
    page.locator('[data-renewal-field="now-detail"]').first(),
  );
  const stageLine = await kit.stageLine(page);
  const cancel = page.locator('[data-renewal-field="unsent-cancel"] button').first();
  const cancelLabel = (await cancel.count())
    ? squash(await cancel.textContent().catch(() => ""))
    : null;
  const all = `${stageLine} ${detail} ${nowText}`;
  const scheduledAt =
    new RegExp(`message scheduled for (${STAMP})`, "i").exec(all)?.[1] ?? null;
  return {
    read: true,
    primary,
    detail,
    nowText: nowText.slice(0, 1200),
    stageLine,
    cancelLabel,
    scheduledAt,
    outOfDate: all.includes(who.outOfDate),
    outOfDateWords: (all.match(/out of date/gi) ?? []).length,
    heldLine:
      new RegExp(
        `${escape(who.held)} on (${STAMP})(?: because the lease changed\\.|: ([^.]+)\\.)`,
      ).exec(all)?.[0] ?? null,
    heldAt: new RegExp(`${escape(who.held)} on (${STAMP})`).exec(all)?.[1] ?? null,
    notConfirmed: /The send was not confirmed/.test(all),
    text: all,
  };
}

/** The lease's row on the Renewals desk: its stage line, next step and the one message cue. */
async function readDesk(ctx, page, leaseId, wantCue = null) {
  const { kit } = ctx;
  let read = null;
  // A desk read of the current values is bounded (8 s); a slow first read shows the stored state
  // with no cue, so staff reload once, as they would.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await kit.openPath(page, DESK);
    const row = await kit.deskRow(page, leaseId);
    const rowLocator = page.locator(`tr[data-batch-lease="${leaseId}"]`).first();
    const cue = rowLocator.locator("[data-batch-message-cue]");
    const cues = row.shown ? await cue.count() : 0;
    read = {
      shown: row.shown,
      stage: row.stage ?? null,
      next: row.next ?? null,
      // The whole row (the kit's own read keeps its first 400 characters).
      text: row.shown ? squash(await rowLocator.innerText().catch(() => "")) : "",
      cues,
      cueKind: cues ? await cue.first().getAttribute("data-batch-message-cue") : null,
      cueText: cues
        ? squash(
            await cue
              .first()
              .innerText()
              .catch(() => ""),
          )
        : null,
      cueHref: cues ? await cue.first().getAttribute("href") : null,
      attempts: attempt + 1,
    };
    if (wantCue === null || read.cueKind === wantCue) break;
  }
  return read;
}

/** The step's sequences of one audience on the lease, oldest first. */
const sequencesOf = (ctx, leaseId, who) => ctx.kit.sequences(leaseId, who.purpose);
const addressesOf = (ctx, leaseId, who) =>
  who.audience === "owner"
    ? ctx.kit.ownerAddresses(leaseId)
    : ctx.kit.tenantAddresses(leaseId);
const sentText = (message) =>
  `${message.subject ?? ""} ${message.text ?? ""} ${message.html ?? ""}`;

/** What one moment's effects look like: the sequences, the occurrences, the mail, the writes. */
async function effects(ctx, leaseId, who) {
  const sequences = await sequencesOf(ctx, leaseId, who);
  return {
    writes: ctx.writes.length,
    sequences: sequences.map((sequence) => ({
      id: sequence.id,
      version: sequence.version,
      updatedAtMs: sequence.updatedAtMs,
      state: sequence.state,
    })),
    occurrences: (await ctx.kit.listDocuments(OCCURRENCES)).length,
    mail: (await ctx.kit.sentTo(addressesOf(ctx, leaseId, who))).length,
  };
}
const sameEffects = (a, b) =>
  a.writes === b.writes &&
  a.occurrences === b.occurrences &&
  a.mail === b.mail &&
  JSON.stringify(a.sequences) === JSON.stringify(b.sequences);
/** The non-GET requests the row's pages made since `from`, by route and kind. */
const writesSince = (ctx, from) => ctx.writes.slice(from);
const sequenceWrites = (writes, kind) =>
  writes.filter(
    (write) => write.path === SEQUENCES_ROUTE && (!kind || write.kind === kind),
  ).length;

/**
 * Verification, opened as staff open it: its text and the "Earlier attempts" lines, with every
 * effect measured before and after (AC-S273-3: opening it saves, claims and dispatches nothing).
 */
async function readVerification(ctx, page, leaseId, who) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, `?step=${who.step}`);
  await waitForPrimary(ctx, page, () => false, 40_000);
  await settled(page);
  let details = page.locator(`#renewal-evidence-${who.step}`);
  if (!(await kit.shownWithin(details.locator(":scope > summary"), 10_000))) {
    await kit.openLease(page, leaseId, `?view=full&step=${who.step}`);
    await settled(page);
    details = page.locator(`#renewal-evidence-${who.step}`);
  }
  const summary = squash(
    await details
      .locator(":scope > summary")
      .innerText({ timeout: 20_000 })
      .catch(() => ""),
  );
  // Measured around the opening itself: the page has loaded and settled.
  const before = await effects(ctx, leaseId, who);
  await kit.openDisclosure(details);
  await page.waitForTimeout(3_000);
  const text = await kit.visibleText(details);
  const attempts = (
    await details
      .locator('[data-renewal-field="earlier-attempts"] li')
      .allInnerTexts()
      .catch(() => [])
  ).map(squash);
  const after = await effects(ctx, leaseId, who);
  const window = writesSince(ctx, before.writes);
  return {
    summary,
    text: text.slice(0, 1500),
    attempts,
    // Nothing saved, claimed or dispatched: no request from the page and no record changed.
    zeroEffects: window.length === 0 && sameEffects(before, after),
    windowWrites: window.map((write) => `${write.path} ${write.kind ?? ""}`.trim()),
    before,
    after,
  };
}

/** The renewal hold notices in the person's own feed (GET), with every field as served. */
async function holdNotices(ctx, page) {
  const feed = await ctx.kit.read(page, "/api/notifications?limit=50");
  const items = Array.isArray(feed)
    ? feed
    : (feed?.notifications ?? feed?.items ?? feed?.feed ?? []);
  return {
    unread: feed?.unreadCount ?? feed?.unread ?? null,
    held: items.filter((item) => item?.title === NOTICE_TITLE),
  };
}

/**
 * Open the notification menu, choose the hold notice, and read where it lands. Resolves with the
 * menu's lines for it, the landing path and step, and whether the step is shown.
 */
async function followNotice(ctx, page, leaseId, who) {
  const { kit } = ctx;
  await kit.openPath(page, DESK);
  const button = page.locator(".notification-button").first();
  await button.waitFor({ timeout: 30_000 });
  await button.click();
  const region = page.getByRole("region", { name: "Notifications" });
  await region.waitFor({ timeout: 30_000 });
  const item = region
    .locator("button.notification-item")
    .filter({ hasText: NOTICE_TITLE });
  await item
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  const lines = (await item.allInnerTexts().catch(() => [])).map(squash);
  if (!lines.length) {
    await page.keyboard.press("Escape").catch(() => undefined);
    return { lines, landed: null, step: null, stepShown: false };
  }
  await item.first().click();
  await page
    .waitForURL((url) => url.pathname.includes(`/lease/${leaseId}`), { timeout: 120_000 })
    .catch(() => undefined);
  const url = new URL(page.url());
  const stepShown = await kit.shownWithin(
    page.getByRole("region", { name: "Current renewal stage" }),
    120_000,
  );
  return {
    lines,
    landed: url.pathname,
    step: url.searchParams.get("step"),
    stepShown,
    onLease: url.pathname.endsWith(`/lease/${leaseId}`),
    onStep: url.searchParams.get("step") === who.step,
  };
}

/** The hold notice's limits: its words, its link, and no body or address anywhere in it. */
function noticeShape(notice, ctx, leaseId, who, { bodyWords }) {
  const json = JSON.stringify(notice);
  const addresses = [
    ...ctx.kit.tenantAddresses(leaseId),
    ...ctx.kit.ownerAddresses(leaseId),
  ];
  const message = String(notice?.message ?? "");
  return {
    words: new RegExp(
      `^The ${escape(who.noticeWhat)} for .+ was held because the lease changed\\.$`,
    ).test(message),
    href:
      String(notice?.href ?? "").includes(String(leaseId)) &&
      String(notice?.href ?? "").includes(who.step),
    noAddress:
      !json.includes("@") && addresses.every((address) => !json.includes(address)),
    noBody: bodyWords.every((words) => !json.includes(words)),
  };
}

// ---- Staff steps ------------------------------------------------------------------------------

/**
 * Open the step's review dialog for its scheduled send ("Schedule" in the step), fill the date and
 * time when given, and confirm "Schedule this message". Resolves with the answer and the fields.
 */
async function scheduleFromStep(ctx, page, leaseId, who, at = null) {
  const { kit } = ctx;
  await reachPrimary(ctx, page, leaseId, who.step, who.sendReview);
  const trigger = await stepScheduleButton(ctx, page);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: DIALOG_SCHEDULE });
  await dialog.locator(REVIEW_TEXT).waitFor({ timeout: 120_000 });
  const date = dialog.locator('input[type="date"]').first();
  const time = dialog.locator('input[type="time"]').first();
  if (at) {
    await date.fill(at.date);
    await time.fill(at.time);
  }
  const fields = { date: await date.inputValue(), time: await time.inputValue() };
  const answer = kit.appResponse(page, SEQUENCES_ROUTE, {
    match: (body) => kit.sequenceAction(body) === "schedule",
    timeout: 180_000,
  });
  await dialog.getByRole("button", { name: SCHEDULE, exact: true }).click();
  const response = await answer.catch(() => null);
  if (!response) ctx.unresolved("W12-02 schedule: no answer");
  const body = response ? await response.json().catch(() => null) : null;
  if (response?.status() === 200)
    await dialog.waitFor({ state: "hidden", timeout: 60_000 }).catch(() => undefined);
  const status = page.locator("p[role='status']").filter({ hasText: /^Scheduled/ });
  const statusLine = (await kit.shownWithin(status.first(), 20_000))
    ? squash(await status.first().innerText())
    : null;
  return {
    status: response?.status() ?? null,
    sequenceId: body?.sequence?.id ?? null,
    nextDueAtMs: body?.sequence?.nextDueAtMs ?? null,
    fields,
    statusLine,
  };
}

/** Open "Review the updated ..." from the step and read the dialog as staff read it. */
async function openUpdateReview(ctx, page, leaseId, who) {
  const { kit } = ctx;
  await reachPrimary(ctx, page, leaseId, who.step, who.review);
  await kit.primary(page).click();
  const dialog = page.getByRole("dialog", { name: who.review });
  await dialog.locator(REVIEW_TEXT).waitFor({ timeout: 120_000 });
  return { dialog, read: await updateDialogState(ctx, dialog) };
}

async function updateDialogState(ctx, dialog) {
  const { kit } = ctx;
  const timing = dialog.locator('[data-renewal-field="update-timing"]');
  const error = dialog.locator(DIALOG_ERROR);
  const text = await reviewText(ctx, dialog);
  return {
    open: await dialog.isVisible().catch(() => false),
    timing: (await timing.count()) ? await kit.visibleText(timing.first()) : null,
    date: await dialog
      .locator('input[type="date"]')
      .first()
      .inputValue({ timeout: 2_000 })
      .catch(() => null),
    time: await dialog
      .locator('input[type="time"]')
      .first()
      .inputValue({ timeout: 2_000 })
      .catch(() => null),
    sendNow: await dialog.getByRole("button", { name: "Send now", exact: true }).count(),
    scheduleInstead: await dialog
      .getByRole("button", { name: "Schedule instead", exact: true })
      .count(),
    confirmSend: await dialog.getByRole("button", { name: SEND, exact: true }).count(),
    confirmSchedule: await dialog
      .getByRole("button", { name: SCHEDULE, exact: true })
      .count(),
    text: text.slice(0, 2000),
    recommendations: ownerRecommendationAmounts(text),
    error: (await kit.shownWithin(error, 3_000)) ? await kit.visibleText(error) : null,
  };
}

/** Dismiss an open dialog with its own "Cancel" button. */
async function dismiss(dialog) {
  await dialog
    .getByRole("button", { name: "Cancel", exact: true })
    .last()
    .click()
    .catch(() => dialog.page().keyboard.press("Escape"));
  await dialog.waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
}

/**
 * Confirm the open update review with its button and wait for both requests the one confirmation
 * makes: the wording save, then the authorization (`kind`). `around` wraps the click (a stand-in
 * hook set before it, cleared after).
 */
async function confirmUpdate(ctx, page, dialog, kind, { before, after } = {}) {
  const { kit } = ctx;
  const saved = kit.appResponse(page, SEQUENCES_ROUTE, {
    match: (body) => kit.sequenceAction(body) === "save",
    timeout: 180_000,
  });
  const authorized = kit.appResponse(page, SEQUENCES_ROUTE, {
    match: (body) => kit.sequenceAction(body) === kind,
    timeout: 180_000,
  });
  await before?.();
  let save = null;
  let auth = null;
  try {
    await dialog
      .getByRole("button", { name: kind === "send" ? SEND : SCHEDULE, exact: true })
      .click();
    save = await saved.catch(() => null);
    auth = await authorized.catch(() => null);
  } finally {
    await after?.();
  }
  const body = auth ? await auth.json().catch(() => null) : null;
  if (auth?.status() === 200)
    await dialog.waitFor({ state: "hidden", timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(1_500);
  const status = page.locator("p[role='status']").filter({ hasText: /\S/ });
  const statusLines = (await status.allInnerTexts().catch(() => [])).map(squash);
  return {
    saveStatus: save?.status() ?? null,
    authStatus: auth?.status() ?? null,
    authCode: body?.code ?? null,
    sequence: body?.sequence
      ? {
          id: body.sequence.id,
          state: body.sequence.state,
          nextDueAtMs: body.sequence.nextDueAtMs ?? null,
        }
      : null,
    statusLines,
    dialog: await updateDialogState(ctx, dialog),
  };
}

/** Compare market's Rent to recommend, as staff read it. */
async function readRentToRecommend(ctx, page, leaseId) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, "?step=compare-market");
  const field = page.locator(RENT_FIELD);
  await field.waitFor({ timeout: 60_000 });
  return Number(String(await field.inputValue()).replace(/[$,\s]/g, ""));
}

/** Change Rent to recommend on Compare market as staff do; resolves with the save's status. */
async function changeRentToRecommend(ctx, page, leaseId, amount) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, "?step=compare-market");
  const field = page.locator(RENT_FIELD);
  await field.waitFor({ timeout: 60_000 });
  const saved = kit.appResponse(page, WORKING_ROUTE, {
    match: (body) => ["terms_rent", "recommended_rent"].includes(body?.field),
  });
  await field.fill(String(amount));
  await field.press("Enter");
  return (await saved).status();
}

/**
 * The lease's own message wording (the step's "Email body"): `edit` appends a sentence, or puts
 * back `restore`. Leaving the field saves it. Resolves with the save's status and the text before.
 */
async function editLeaseWording(
  ctx,
  page,
  leaseId,
  who,
  { append = null, restore = null },
) {
  const { kit } = ctx;
  const selector = `#renewal-message-${who.audience}-body`;
  await kit.openLease(page, leaseId, `?step=${who.step}`);
  await settled(page);
  if (!(await kit.reveal(page, selector, 30_000))) {
    await kit.openLease(page, leaseId, `?view=full&step=${who.step}`);
    await settled(page);
    await kit.reveal(page, selector, 30_000);
  }
  const field = page.locator(selector).first();
  await field.waitFor({ state: "visible", timeout: 30_000 });
  const before = await field.inputValue();
  const saved = kit.appResponse(page, PREPARATION_ROUTE, { timeout: 120_000 });
  await field.fill(restore ?? `${before}${append ?? ""}`);
  await field.press("Tab");
  const response = await saved.catch(() => null);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  return { status: response?.status() ?? null, before };
}

/**
 * An unconfirmed send, settled as staff settle it: the step's "Check whether the message went out"
 * reads the mailbox for that exact message (no new send). Resolves with the answer's status.
 */
async function checkWentOut(ctx, page, leaseId, who) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, `?step=${who.step}`);
  const name = "Check whether the message went out";
  const inNow = kit.now(page).getByRole("button", { name, exact: true });
  const button = (await kit.shownWithin(inNow, 60_000))
    ? inNow
    : page.getByRole("button", { name, exact: true }).first();
  await button.waitFor({ timeout: 30_000 });
  const answer = kit.appResponse(page, SEQUENCES_ROUTE, {
    match: (body) => kit.sequenceAction(body) === "reconcile",
    timeout: 120_000,
  });
  await button.click();
  const response = await answer.catch(() => null);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  return { status: response?.status() ?? null };
}

/** Wait until the wall clock is past `ms` (real waiting; the schedule's own time passes). */
async function waitUntil(page, ms) {
  const left = ms - Date.now();
  if (left > 0) await page.waitForTimeout(left);
}

// ---- Part "tenant": the starting state carried on (BEH-S273-1 to BEH-S273-4) -------------------

async function tenantPart(ctx, page, start) {
  const { kit, rehearsal } = ctx;
  const leaseId = ctx.leases.prepared.leaseId;
  const who = TENANT;
  const observed = start.observed;
  if (!observed) throw new Error(`The starting sequence stopped: ${start.error}`);
  const firstEnd = usDate(FIRST_TERM_END);
  const changedEnd = usDate(CHANGED_TERM_END);
  const thirdEnd = usDate(THIRD_TERM_END);
  const endLine = (previous, current) =>
    bothValues("Renewal end date", previous, current);
  const tenants = kit.tenantAddresses(leaseId);

  // T1: the starting sequence's own reads.
  const before = observed.beforeTick ?? {};
  const after = observed.afterTick ?? {};
  const t1 = {
    beforeOutOfDate:
      String(before.nowDetail ?? "").includes(who.outOfDate) &&
      String(before.nowDetail ?? "").includes(endLine(firstEnd, changedEnd)) &&
      before.primary === who.review,
    afterHeld:
      new RegExp(`${escape(who.held)} on ${STAMP} because the lease changed\\.`).test(
        String(after.nowDetail ?? ""),
      ) &&
      String(after.nowDetail ?? "").includes(endLine(firstEnd, changedEnd)) &&
      after.primary === who.review,
    tickHeld:
      Number(observed.tick?.held ?? 0) === 1 && Number(observed.tick?.sent ?? 0) === 0,
    paused:
      observed.heldMessage?.state === "paused" &&
      observed.heldMessage?.pause === "changed_source" &&
      observed.heldMessage?.confirmed === 0,
    oneNewUnread:
      Number(observed.unreadNotificationsAfter ?? 0) ===
      Number(observed.unreadNotificationsBefore ?? 0) + 1,
  };
  const sequencesAtStart = await sequencesOf(ctx, leaseId, who);
  const held = sequencesAtStart.find((sequence) => sequence.state === "paused");
  if (!held) throw new Error("The starting sequence left no held tenant offer.");
  const schedule = held.authorization?.schedule ?? null;
  const heldBody = String(held.authorization?.initial?.plainText ?? "");
  // A few words of the message body, to look for in the notice (never there).
  const bodyWords = heldBody
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 40)
    .slice(0, 3)
    .map((line) => line.slice(0, 40));

  // T2: after the tick, the desk, the notification, Verification and the second tick.
  const stepHeld = await guard(
    ctx,
    "tenant step held",
    () => readStep(ctx, page, leaseId, who, who.review),
    NO_STEP,
  );
  const deskHeld = await guard(
    ctx,
    "tenant desk held",
    () => readDesk(ctx, page, leaseId, "held"),
    NO_DESK,
  );
  const feed = await guard(ctx, "tenant notices", () => holdNotices(ctx, page), {
    held: [],
  });
  const shape = feed.held[0]
    ? noticeShape(feed.held[0], ctx, leaseId, who, { bodyWords })
    : null;
  const followed = await guard(
    ctx,
    "tenant notice followed",
    () => followNotice(ctx, page, leaseId, who),
    {},
  );
  const otherFeed = await guard(
    ctx,
    "another staff member's notices",
    async () => holdNotices(ctx, await ctx.newPage("Approver")),
    null,
  );
  const verificationHeld = await guard(
    ctx,
    "tenant verification held",
    () => readVerification(ctx, page, leaseId, who),
    NO_VERIFICATION,
  );
  const quiet = await effects(ctx, leaseId, who);
  // One more worker run with nothing made due: it holds what it held and sends nothing.
  const secondTick = await kit.tick();
  const afterSecond = (await sequencesOf(ctx, leaseId, who)).find(
    (sequence) => sequence.id === held.id,
  );
  const feedAfterSecond = await guard(
    ctx,
    "tenant notices after a second tick",
    () => holdNotices(ctx, page),
    { held: [] },
  );
  const noAutomatic =
    Number(secondTick?.sent ?? 0) === 0 &&
    afterSecond?.state === "paused" &&
    afterSecond?.version === held.version &&
    (await kit.sentTo(tenants)).length === quiet.mail;

  // AC-S273-6: the update review and the cancel confirmation, each dismissed, change nothing.
  const { dismissed, reviewShown, cancelDialog } = await guard(
    ctx,
    "tenant dismissals",
    async () => {
      const dismissFrom = await effects(ctx, leaseId, who);
      const opened = await openUpdateReview(ctx, page, leaseId, who);
      await dismiss(opened.dialog);
      await kit.openLease(page, leaseId, `?step=${who.step}`);
      await settled(page);
      const cancelShown = await kit.reveal(
        page,
        '[data-renewal-field="unsent-cancel"] button',
        30_000,
      );
      let cancelDialog = { shown: false };
      if (cancelShown) {
        await page.locator('[data-renewal-field="unsent-cancel"] button').first().click();
        const dialog = page.getByRole("dialog", { name: `${who.cancel}?` });
        cancelDialog = {
          shown: await kit.shownWithin(dialog, 30_000),
          text: await kit.visibleText(dialog).catch(() => ""),
        };
        if (cancelDialog.shown) await dismiss(dialog);
      }
      const dismissTo = await effects(ctx, leaseId, who);
      return {
        reviewShown: opened.read,
        cancelDialog,
        // The review's own preparation may save the lease's pending wording first (never the
        // message), so only the message's requests and records are compared.
        dismissed: {
          review:
            opened.read.open &&
            sequenceWrites(writesSince(ctx, dismissFrom.writes)) === 0 &&
            sameEffects({ ...dismissFrom, writes: 0 }, { ...dismissTo, writes: 0 }),
          cancel: cancelShown && cancelDialog.shown,
          cancelUnchanged:
            sequenceWrites(writesSince(ctx, dismissFrom.writes)) === 0 &&
            sameEffects({ ...dismissFrom, writes: 0 }, { ...dismissTo, writes: 0 }),
        },
      };
    },
    {
      dismissed: { review: false, cancel: false, cancelUnchanged: false },
      reviewShown: {},
      cancelDialog: {},
    },
  );

  // T3: "Review the updated offer" with the carried date and time, and one confirmation.
  const update = await openUpdateReview(ctx, page, leaseId, who);
  const carried = {
    line:
      update.read.timing?.startsWith(
        "The date and time are carried from the earlier review.",
      ) ?? false,
    date: update.read.date === schedule?.firstDate,
    time: update.read.time === schedule?.time,
    newWording:
      update.read.text.includes(changedEnd) && !update.read.text.includes(firstEnd),
  };
  const updateFrom = ctx.writes.length;
  const confirmed = await confirmUpdate(ctx, page, update.dialog, "schedule");
  const updateWrites = writesSince(ctx, updateFrom);
  const afterUpdate = await sequencesOf(ctx, leaseId, who);
  const one = afterUpdate.length === 1 ? afterUpdate[0] : null;
  const originalWall = schedule ? wallStamp(schedule.firstDate, schedule.time) : null;
  const storedAt = stamp(one?.nextDueAtMs);
  const updated = {
    oneConfirmation:
      confirmed.saveStatus === 200 &&
      confirmed.authStatus === 200 &&
      sequenceWrites(updateWrites, "save") === 1 &&
      sequenceWrites(updateWrites, "schedule") === 1 &&
      sequenceWrites(updateWrites) === 2,
    oneSequence: afterUpdate.length === 1 && one?.id === held.id,
    scheduled: one?.state === "active" && one?.nextDueAtMs !== null,
    originalTime: Boolean(originalWall && storedAt?.startsWith(originalWall)),
    newWording:
      String(one?.authorization?.initial?.plainText ?? "").includes(changedEnd) &&
      !String(one?.authorization?.initial?.plainText ?? "").includes(firstEnd),
    statusLine: confirmed.statusLines.some(
      (line) =>
        line === `Scheduled for ${storedAt}. It counts as sent once Gmail accepts it.`,
    ),
  };
  const stepScheduled = await guard(
    ctx,
    "tenant step scheduled",
    () => readStep(ctx, page, leaseId, who),
    NO_STEP,
  );
  const deskScheduled = await guard(
    ctx,
    "tenant desk scheduled",
    () => readDesk(ctx, page, leaseId),
    NO_DESK,
  );
  const verificationUpdated = await guard(
    ctx,
    "tenant verification updated",
    () => readVerification(ctx, page, leaseId, who),
    NO_VERIFICATION,
  );
  const listed = verificationUpdated.attempts.some((line) =>
    new RegExp(
      `^Held on ${STAMP} \\(${escape(CHANGED_CAUSE)}\\), then updated on ${STAMP}\\.$`,
    ).test(line),
  );

  // T4: before any tick, a third end date, then the lease's own wording alone.
  const third = await guard(
    ctx,
    "tenant third end date",
    () => enterRenewalDates(ctx, page, leaseId, { end: THIRD_TERM_END }),
    {},
  );
  const stepThird = await guard(
    ctx,
    "tenant step third",
    () => readStep(ctx, page, leaseId, who, who.review),
    NO_STEP,
  );
  const deskThird = await guard(
    ctx,
    "tenant desk third",
    () => readDesk(ctx, page, leaseId, "out_of_date"),
    NO_DESK,
  );
  const back = await guard(
    ctx,
    "tenant end date back",
    () => enterRenewalDates(ctx, page, leaseId, { end: CHANGED_TERM_END }),
    {},
  );
  const stepBack = await guard(
    ctx,
    "tenant step back",
    () => readStep(ctx, page, leaseId, who),
    NO_STEP,
  );
  const wording = await guard(
    ctx,
    "tenant lease wording",
    () => editLeaseWording(ctx, page, leaseId, who, { append: WORDING_EDIT }),
    { status: null, before: null },
  );
  const stepWording = await guard(
    ctx,
    "tenant step wording",
    () => readStep(ctx, page, leaseId, who, who.review),
    NO_STEP,
  );
  const deskWording = await guard(
    ctx,
    "tenant desk wording",
    () => readDesk(ctx, page, leaseId, "out_of_date"),
    NO_DESK,
  );
  const wordingBack =
    wording.before === null
      ? { status: null }
      : await guard(
          ctx,
          "tenant lease wording back",
          () => editLeaseWording(ctx, page, leaseId, who, { restore: wording.before }),
          { status: null },
        );
  const stepWordingBack = await guard(
    ctx,
    "tenant step wording back",
    () => readStep(ctx, page, leaseId, who),
    NO_STEP,
  );
  const outOfDate = {
    thirdSaved: third.end === 200,
    stepThird:
      stepThird.outOfDate &&
      stepThird.text.includes(endLine(changedEnd, thirdEnd)) &&
      stepThird.primary === who.review &&
      stepThird.cancelLabel === who.cancel,
    deskThird:
      deskThird.cueKind === "out_of_date" &&
      deskThird.cueText === "Scheduled message out of date" &&
      String(deskThird.cueHref ?? "").includes(`step=${who.step}`) &&
      deskThird.text.includes(changedEnd) &&
      deskThird.text.includes(thirdEnd),
    currentAgain:
      back.end === 200 &&
      stepBack.read &&
      !stepBack.outOfDate &&
      stepBack.outOfDateWords === 0 &&
      stepBack.scheduledAt === storedAt,
    wordingSaved: wording.status === 200,
    stepWording:
      stepWording.outOfDate &&
      stepWording.text.includes(WORDING_CHANGED) &&
      stepWording.primary === who.review,
    deskWording:
      deskWording.cueKind === "out_of_date" &&
      deskWording.cueText === "Scheduled message out of date",
    wordingCurrentAgain:
      wordingBack.status === 200 &&
      stepWordingBack.read &&
      !stepWordingBack.outOfDate &&
      stepWordingBack.outOfDateWords === 0,
  };

  // T5: the tick at that time, with the stand-in's next send unconfirmed, then one more tick.
  const mailBefore = (await kit.sentTo(tenants)).length;
  await setNextSend(rehearsal, "unconfirmed");
  const sendTick = await kit.tick(held.id);
  const unconfirmedRecord = (await sequencesOf(ctx, leaseId, who))[0];
  const stepUnconfirmed = await guard(
    ctx,
    "tenant step unconfirmed",
    () => readStep(ctx, page, leaseId, who),
    NO_STEP,
  );
  const deskUnconfirmed = await guard(
    ctx,
    "tenant desk unconfirmed",
    () => readDesk(ctx, page, leaseId),
    NO_DESK,
  );
  // The worker never settles an unconfirmed send by itself; staff check whether it went out.
  const settleTick = await guard(
    ctx,
    "tenant check whether it went out",
    () => checkWentOut(ctx, page, leaseId, who),
    { status: null },
  );
  const finalRecords = await sequencesOf(ctx, leaseId, who);
  const sent = await kit.sentTo(tenants);
  const verificationSent = await guard(
    ctx,
    "tenant verification sent",
    () => readVerification(ctx, page, leaseId, who),
    NO_VERIFICATION,
  );
  if (
    finalRecords[0]?.unresolvedOccurrenceId ||
    finalRecords[0]?.state === "needs_reconciliation"
  )
    ctx.unresolved("W12-02 tenant offer: the unconfirmed send did not settle");
  const unconfirmed = {
    held:
      Boolean(unconfirmedRecord?.unresolvedOccurrenceId) ||
      unconfirmedRecord?.state === "needs_reconciliation",
    step: stepUnconfirmed.notConfirmed && stepUnconfirmed.primary !== who.sendReview,
    desk: /not confirmed/i.test(deskUnconfirmed.text) && deskUnconfirmed.cues === 0,
  };
  const delivered = {
    oneSequence: finalRecords.length === 1 && finalRecords[0]?.id === held.id,
    confirmed: Number(finalRecords[0]?.confirmedCount ?? 0) === 1,
    oneMessage: mailBefore === 0 && sent.length === 1,
    newValue:
      sent.length === 1 &&
      sentText(sent[0]).includes(changedEnd) &&
      !sentText(sent[0]).includes(firstEnd) &&
      !sentText(sent[0]).includes(thirdEnd),
    resolvedListed: verificationSent.attempts.some((line) =>
      new RegExp(
        `^Not confirmed from ${STAMP} \\(${escape(UNCONFIRMED_CAUSE)}\\), then resolved on ${STAMP}\\.$`,
      ).test(line),
    ),
  };

  const record = {
    part: "tenant",
    t1,
    stepHeld: pick(stepHeld),
    deskHeld,
    notices: {
      count: feed.held.length,
      afterSecondTick: feedAfterSecond.held.length,
      shape,
      message: feed.held[0]?.message ?? null,
      followed,
      otherStaff: otherFeed?.held.length ?? null,
    },
    verificationHeld: { ...verificationHeld, before: undefined, after: undefined },
    secondTick: tickPick(secondTick),
    noAutomatic,
    reviewShown: { ...reviewShown, text: undefined },
    cancelDialog,
    dismissed,
    carried,
    confirmed: { ...confirmed, dialog: undefined },
    updated,
    storedAt,
    stepScheduled: pick(stepScheduled),
    deskScheduled,
    verificationUpdated: { ...verificationUpdated, before: undefined, after: undefined },
    listed,
    outOfDate,
    stepThird: pick(stepThird),
    deskThird,
    stepWording: pick(stepWording),
    deskWording,
    sendTick: tickPick(sendTick),
    checkedWentOut: settleTick,
    unconfirmed,
    stepUnconfirmed: pick(stepUnconfirmed),
    deskUnconfirmed,
    delivered,
    attemptsAfterSend: verificationSent.attempts,
  };
  ctx.record(record);
  return {
    // R-S273-1 for the tenant: held, scheduled (with the stored time after a reload) and unconfirmed,
    // on the step and the desk row.
    projection:
      t1.afterHeld &&
      stepHeld.heldAt !== null &&
      deskHeld.cueKind === "held" &&
      deskHeld.cueText === "Message held" &&
      String(deskHeld.cueHref ?? "").includes(`step=${who.step}`) &&
      updated.statusLine &&
      stepScheduled.scheduledAt === storedAt &&
      deskScheduled.cues === 0 &&
      new RegExp(`scheduled for ${escape(storedAt ?? "-")}`, "i").test(
        deskScheduled.text,
      ) &&
      unconfirmed.held &&
      unconfirmed.step &&
      unconfirmed.desk,
    outOfDate: t1.beforeOutOfDate && Object.values(outOfDate).every(Boolean),
    held:
      t1.afterHeld &&
      t1.tickHeld &&
      t1.paused &&
      stepHeld.heldAt !== null &&
      verificationHeld.zeroEffects &&
      verificationUpdated.zeroEffects &&
      listed,
    update:
      Object.values(carried).every(Boolean) &&
      Object.values(updated).every(Boolean) &&
      Object.values(delivered).every(Boolean),
    notice:
      t1.oneNewUnread &&
      feed.held.length === 1 &&
      feedAfterSecond.held.length === 1 &&
      Boolean(shape && Object.values(shape).every(Boolean)) &&
      followed.onLease === true &&
      followed.onStep === true &&
      followed.stepShown === true &&
      otherFeed !== null &&
      otherFeed.held.length === 0,
    safety:
      noAutomatic && dismissed.review && dismissed.cancel && dismissed.cancelUnchanged,
  };
}

const pick = (step) => ({
  primary: step.primary,
  detail: step.detail,
  stageLine: step.stageLine,
  cancelLabel: step.cancelLabel,
  scheduledAt: step.scheduledAt,
  outOfDate: step.outOfDate,
  heldLine: step.heldLine,
  notConfirmed: step.notConfirmed,
});
const tickPick = (tick) => ({
  sent: tick?.sent ?? null,
  held: tick?.held ?? null,
  failures: tick?.failures ?? null,
});

// ---- Part "communication": wording edited on the communication itself (AC-S273-2) --------------

async function communicationPart(ctx, page) {
  const { kit } = ctx;
  await ctx.resetState();
  const leaseId = ctx.leases.prepared.leaseId;
  const who = OWNER;
  const scheduled = await scheduleFromStep(ctx, page, leaseId, who);
  if (scheduled.status !== 200)
    throw new Error(`The owner message was not scheduled (HTTP ${scheduled.status}).`);
  const stepScheduled = await readStep(ctx, page, leaseId, who);
  // Open it in Communications as staff do: Outgoing, the lease's card, "Open communication".
  await kit.openPath(page, "/gmail-hub");
  await page.getByRole("tab", { name: "Outgoing", exact: true }).click();
  const card = page
    .locator('[role="tabpanel"] article.ui-card')
    .filter({ hasText: `${who.hub} · Lease ${leaseId}` })
    .first();
  await card.waitFor({ timeout: 60_000 });
  await card.getByRole("button", { name: "Open communication", exact: true }).click();
  const composer = page.getByRole("region", { name: "Workflow communication composer" });
  await composer.waitFor({ timeout: 60_000 });
  const subject = composer.getByLabel("Initial message subject").first();
  await subject.waitFor({ timeout: 60_000 });
  const saved = kit.appResponse(page, SEQUENCES_ROUTE, {
    match: (body) => kit.sequenceAction(body) === "save",
    timeout: 120_000,
  });
  await subject.fill(`${await subject.inputValue()}${SUBJECT_EDIT}`);
  const save = await saved.catch(() => null);
  await page.waitForTimeout(1_500);
  const record = (await sequencesOf(ctx, leaseId, who))[0];
  const step = await guard(
    ctx,
    "communication step",
    () => readStep(ctx, page, leaseId, who, who.open),
    NO_STEP,
  );
  const desk = await guard(
    ctx,
    "communication desk",
    () => readDesk(ctx, page, leaseId, "held"),
    NO_DESK,
  );
  const result = {
    scheduled: scheduled.status === 200 && stepScheduled.scheduledAt !== null,
    saved: save?.status() === 200,
    pausedForEdit: record?.state === "paused" && record?.pause?.cause === "edited",
    noOutOfDate: step.read && !step.outOfDate && step.outOfDateWords === 0,
    noDifferences: !/ in the scheduled message, /.test(step.text),
    heldForCause:
      new RegExp(`${escape(who.held)} on ${STAMP}: ${escape(EDITED_CAUSE)}\\.`).test(
        step.text,
      ) && step.primary === who.open,
    deskCue: desk.cueKind === "held" && desk.cueText === "Message held",
  };
  ctx.record({
    part: "communication",
    scheduled: { status: scheduled.status, fields: scheduled.fields },
    stepScheduled: pick(stepScheduled),
    step: pick(step),
    desk,
    result,
  });
  return { noOutOfDate: Object.values(result).every(Boolean) };
}

// ---- Part "owner": the same for an owner message (BEH-S273-5) ---------------------------------

async function ownerPart(ctx, page) {
  const { kit, rehearsal } = ctx;
  await ctx.resetState();
  const leaseId = ctx.leases.prepared.leaseId;
  const who = OWNER;
  const owners = kit.ownerAddresses(leaseId);
  const rentBefore = await readRentToRecommend(ctx, page, leaseId);
  if (!(rentBefore > 0))
    throw new Error("The prepared lease shows no Rent to recommend.");
  const rentAfter = rentBefore + 25;
  // A few minutes ahead, so the earlier time has passed by the update (R-S273-4's other case).
  const at = centralAhead(4);
  const scheduled = await scheduleFromStep(ctx, page, leaseId, who, at);
  if (scheduled.status !== 200)
    throw new Error(`The owner message was not scheduled (HTTP ${scheduled.status}).`);
  const storedAt = stamp(scheduled.nextDueAtMs);
  const stepScheduled = await guard(
    ctx,
    "owner step scheduled",
    () => readStep(ctx, page, leaseId, who),
    NO_STEP,
  );
  const deskScheduled = await guard(
    ctx,
    "owner desk scheduled",
    () => readDesk(ctx, page, leaseId),
    NO_DESK,
  );
  const scheduledRecord = (await sequencesOf(ctx, leaseId, who))[0];
  const ownerBody = String(scheduledRecord?.authorization?.initial?.plainText ?? "");
  const bodyWords = ownerBody
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 40)
    .slice(0, 3)
    .map((line) => line.slice(0, 40));

  // Before any tick: Rent to recommend changed, read on the lease and the desk.
  const rentSaved = await changeRentToRecommend(ctx, page, leaseId, rentAfter);
  const rentLine = bothValues("Rent to recommend", money(rentBefore), money(rentAfter));
  const stepOut = await guard(
    ctx,
    "owner step out of date",
    () => readStep(ctx, page, leaseId, who, who.review),
    NO_STEP,
  );
  const deskOut = await guard(
    ctx,
    "owner desk out of date",
    () => readDesk(ctx, page, leaseId, "out_of_date"),
    NO_DESK,
  );
  const unreadBefore = (await kit.notifications(page)).unread;

  // One tick: the hold, its notification and the step.
  const tick = await kit.tick(scheduledRecord.id);
  const heldRecord = (await sequencesOf(ctx, leaseId, who))[0];
  const stepHeld = await guard(
    ctx,
    "owner step held",
    () => readStep(ctx, page, leaseId, who, who.review),
    NO_STEP,
  );
  const deskHeld = await guard(
    ctx,
    "owner desk held",
    () => readDesk(ctx, page, leaseId, "held"),
    NO_DESK,
  );
  const unreadAfter = (await kit.notifications(page)).unread;
  const feed = await guard(ctx, "owner notices", () => holdNotices(ctx, page), {
    held: [],
  });
  const shape = feed.held[0]
    ? noticeShape(feed.held[0], ctx, leaseId, who, { bodyWords })
    : null;
  const followed = await guard(
    ctx,
    "owner notice followed",
    () => followNotice(ctx, page, leaseId, who),
    {},
  );
  const verificationHeld = await guard(
    ctx,
    "owner verification held",
    () => readVerification(ctx, page, leaseId, who),
    NO_VERIFICATION,
  );

  // Once the earlier time has passed: the update starts empty with Send now.
  await waitUntil(page, (scheduled.nextDueAtMs ?? Date.now()) + 15_000);
  const { pastTime, sendMode, failed, failWrites } = await guard(
    ctx,
    "owner update with a failure after the save",
    async () => {
      const first = await openUpdateReview(ctx, page, leaseId, who);
      const pastTime = {
        line:
          first.read.timing?.startsWith(
            "The earlier send time has passed. Choose a new date and time, or send now.",
          ) ?? false,
        empty: !first.read.date && !first.read.time,
        sendNowOffered: first.read.sendNow === 1,
        newWording: first.read.recommendations.includes(money(rentAfter)),
      };
      await first.dialog.getByRole("button", { name: "Send now", exact: true }).click();
      const sendMode = await updateDialogState(ctx, first.dialog);
      // A failure after the wording save: RentVine cannot be read for the authorization.
      const failFrom = ctx.writes.length;
      const failed = await confirmUpdate(ctx, page, first.dialog, "send", {
        before: () => setRentvineOutage(rehearsal, OUTAGE_PATH),
        after: () => setRentvineOutage(rehearsal, null),
      });
      if (failed.authStatus === null) ctx.unresolved("W12-02 owner update: no answer");
      if (failed.dialog.open) await dismiss(first.dialog);
      return { pastTime, sendMode, failed, failWrites: writesSince(ctx, failFrom) };
    },
    {
      pastTime: { ran: false },
      sendMode: { confirmSend: 0 },
      failed: { saveStatus: null, authStatus: null, dialog: {} },
      failWrites: [],
    },
  );
  setRentvineOutage(rehearsal, null);
  const afterFailure = await sequencesOf(ctx, leaseId, who);
  const stepRetry = await guard(
    ctx,
    "owner step retry",
    () => readStep(ctx, page, leaseId, who, who.review),
    NO_STEP,
  );
  const mailAfterFailure = (await kit.sentTo(owners)).length;
  const wordingAfterFailure = (afterFailure[0]?.initial?.paragraphs ?? [])
    .map((paragraph) => paragraph.map((run) => run.text).join(""))
    .join("\n");
  const failure = {
    savedThenRefused:
      failed.saveStatus === 200 &&
      failed.authStatus !== null &&
      failed.authStatus >= 400 &&
      sequenceWrites(failWrites, "save") === 1 &&
      sequenceWrites(failWrites, "send") === 1,
    oneSequence: afterFailure.length === 1 && afterFailure[0]?.id === scheduledRecord.id,
    heldWithNewWording:
      afterFailure[0]?.state === "paused" &&
      ownerRecommendationAmounts(wordingAfterFailure).includes(money(rentAfter)),
    retryOffered: stepRetry.primary === who.review && stepRetry.heldAt !== null,
    nothingSent: mailAfterFailure === 0,
  };

  // The retry: one confirmation, sent with the stand-in's next send unconfirmed.
  const retry = await openUpdateReview(ctx, page, leaseId, who);
  if (retry.read.confirmSend === 0)
    await retry.dialog.getByRole("button", { name: "Send now", exact: true }).click();
  const retryFrom = ctx.writes.length;
  const retried = await confirmUpdate(ctx, page, retry.dialog, "send", {
    before: () => setNextSend(rehearsal, "unconfirmed"),
  });
  const retryWrites = writesSince(ctx, retryFrom);
  if (retried.authStatus === null) ctx.unresolved("W12-02 owner retry: no answer");
  if (retried.dialog.open) await dismiss(retry.dialog);
  const unconfirmedRecord = (await sequencesOf(ctx, leaseId, who))[0];
  const stepUnconfirmed = await guard(
    ctx,
    "owner step unconfirmed",
    () => readStep(ctx, page, leaseId, who),
    NO_STEP,
  );
  const deskUnconfirmed = await guard(
    ctx,
    "owner desk unconfirmed",
    () => readDesk(ctx, page, leaseId),
    NO_DESK,
  );
  const settleTick = await guard(
    ctx,
    "owner check whether it went out",
    () => checkWentOut(ctx, page, leaseId, who),
    { status: null },
  );
  const finalRecords = await sequencesOf(ctx, leaseId, who);
  if (
    finalRecords[0]?.unresolvedOccurrenceId ||
    finalRecords[0]?.state === "needs_reconciliation"
  )
    ctx.unresolved("W12-02 owner message: the unconfirmed send did not settle");
  const sent = await kit.sentTo(owners);
  const verificationSent = await guard(
    ctx,
    "owner verification sent",
    () => readVerification(ctx, page, leaseId, who),
    NO_VERIFICATION,
  );
  const attempts = verificationSent.attempts;
  const recommendations = {
    plain: ownerRecommendationAmounts(sent[0]?.text),
    html: ownerRecommendationAmounts(sent[0]?.html),
  };

  const result = {
    scheduled:
      scheduled.statusLine ===
        `Scheduled for ${storedAt}. It counts as sent once Gmail accepts it.` &&
      stepScheduled.scheduledAt === storedAt &&
      deskScheduled.cues === 0 &&
      new RegExp(`scheduled for ${escape(storedAt ?? "-")}`, "i").test(
        deskScheduled.text,
      ),
    outOfDateStep:
      rentSaved === 200 &&
      stepOut.outOfDate &&
      stepOut.text.includes(rentLine) &&
      stepOut.primary === who.review &&
      stepOut.cancelLabel === who.cancel,
    outOfDateDesk:
      deskOut.cueKind === "out_of_date" &&
      deskOut.cueText === "Scheduled message out of date" &&
      deskOut.text.includes(money(rentBefore)) &&
      deskOut.text.includes(money(rentAfter)),
    heldStep:
      Number(tick?.held ?? 0) === 1 &&
      Number(tick?.sent ?? 0) === 0 &&
      heldRecord?.state === "paused" &&
      heldRecord?.pause?.cause === "changed_source" &&
      new RegExp(`${escape(who.held)} on ${STAMP} because the lease changed\\.`).test(
        stepHeld.text,
      ) &&
      stepHeld.text.includes(rentLine) &&
      stepHeld.primary === who.review,
    heldDesk: deskHeld.cueKind === "held" && deskHeld.cueText === "Message held",
    verificationQuiet: verificationHeld.zeroEffects && verificationSent.zeroEffects,
    notice:
      Number(unreadAfter ?? 0) === Number(unreadBefore ?? 0) + 1 &&
      feed.held.length === 1 &&
      Boolean(shape && Object.values(shape).every(Boolean)) &&
      followed.onLease === true &&
      followed.onStep === true,
    pastTime: Object.values(pastTime).every(Boolean) && sendMode.confirmSend === 1,
    failure: Object.values(failure).every(Boolean),
    retried:
      retried.saveStatus === 200 &&
      retried.authStatus === 200 &&
      sequenceWrites(retryWrites, "save") === 1 &&
      sequenceWrites(retryWrites, "send") === 1,
    unconfirmed:
      (Boolean(unconfirmedRecord?.unresolvedOccurrenceId) ||
        unconfirmedRecord?.state === "needs_reconciliation") &&
      stepUnconfirmed.notConfirmed &&
      /not confirmed/i.test(deskUnconfirmed.text),
    delivered:
      finalRecords.length === 1 &&
      finalRecords[0]?.id === scheduledRecord.id &&
      Number(finalRecords[0]?.confirmedCount ?? 0) === 1 &&
      sent.length === 1 &&
      Object.values(recommendations).every(
        (amounts) => amounts.length === 1 && amounts[0] === money(rentAfter),
      ),
    listed:
      attempts.some((line) =>
        new RegExp(
          `^Held on ${STAMP} \\(${escape(CHANGED_CAUSE)}\\), then updated on ${STAMP}\\.$`,
        ).test(line),
      ) &&
      attempts.some((line) =>
        new RegExp(
          `^Not confirmed from ${STAMP} \\(${escape(UNCONFIRMED_CAUSE)}\\), then resolved on ${STAMP}\\.$`,
        ).test(line),
      ),
  };
  ctx.record({
    part: "owner",
    at,
    storedAt,
    rent: { before: rentBefore, after: rentAfter, saved: rentSaved },
    stepScheduled: pick(stepScheduled),
    deskScheduled,
    stepOut: pick(stepOut),
    deskOut,
    tick: tickPick(tick),
    stepHeld: pick(stepHeld),
    deskHeld,
    notices: {
      unreadBefore,
      unreadAfter,
      count: feed.held.length,
      message: feed.held[0]?.message ?? null,
      shape,
      followed,
    },
    verificationHeld: { ...verificationHeld, before: undefined, after: undefined },
    pastTime,
    sendMode: { ...sendMode, text: undefined },
    failed: { ...failed, dialog: { ...failed.dialog, text: undefined } },
    failure,
    stepRetry: pick(stepRetry),
    retried: { ...retried, dialog: { ...retried.dialog, text: undefined } },
    stepUnconfirmed: pick(stepUnconfirmed),
    deskUnconfirmed,
    checkedWentOut: settleTick,
    attempts,
    recommendations,
    result,
  });
  return {
    projection:
      result.scheduled && result.heldStep && result.heldDesk && result.unconfirmed,
    outOfDate: result.outOfDateStep && result.outOfDateDesk,
    held: result.heldStep && result.verificationQuiet && result.listed,
    update: result.pastTime && result.failure && result.retried && result.delivered,
    notice: result.notice,
  };
}

// ---- AC-S273-6: every send, schedule, resume and cancel request came from a confirmation -------

/**
 * The row's own requests to the sequences route, by kind, against the confirmations this row made
 * (the starting sequence: the owner send and the tenant schedule).
 */
function confirmationsOnly(ctx, expected) {
  const counts = {};
  for (const write of ctx.writes)
    if (write.path === SEQUENCES_ROUTE)
      counts[write.kind] = (counts[write.kind] ?? 0) + 1;
  return {
    counts,
    expected,
    matches:
      (counts.resume ?? 0) === 0 &&
      (counts.cancel ?? 0) === 0 &&
      (counts.send ?? 0) === expected.send &&
      (counts.schedule ?? 0) === expected.schedule,
  };
}

// ---- The row --------------------------------------------------------------------------------------

/**
 * W12-02 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1202 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S273-1 to AC-S273-6 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1202(ctx, page, start) {
  const parts = developmentParts();
  const runs = (part) => !parts || parts.has(part);
  ctx.record({
    startingSequence: start.error ? "stopped" : "completed",
    startError: start.error,
    parts: parts ? [...parts] : "all",
  });
  const failed = (part, error) => {
    ctx.record({
      part,
      error: String(error?.stack ?? error?.message ?? error).slice(0, 1500),
    });
    return null;
  };
  const attempt = async (part, run) => {
    if (!runs(part)) return undefined;
    try {
      return await run();
    } catch (error) {
      return failed(part, error);
    }
  };

  const tenant = await attempt("tenant", () => tenantPart(ctx, page, start));
  // The starting sequence sent the owner message and scheduled the tenant offer; the tenant part
  // confirmed one update (a schedule). The owner part's resets clear the writes' meaning, so the
  // request accounting is read before them.
  const tenantRequests =
    tenant !== undefined ? confirmationsOnly(ctx, { send: 1, schedule: 2 }) : null;
  const communication = await attempt("communication", () =>
    communicationPart(ctx, page),
  );
  const owner = await attempt("owner", () => ownerPart(ctx, page));

  const results = {};
  const all = [tenant, communication, owner];
  if (tenant !== undefined && owner !== undefined) {
    results["AC-S273-1"] = tenant?.projection === true && owner?.projection === true;
    results["AC-S273-3"] = tenant?.held === true && owner?.held === true;
    results["AC-S273-4"] = tenant?.update === true && owner?.update === true;
    results["AC-S273-5"] = tenant?.notice === true && owner?.notice === true;
  }
  if (all.every((value) => value !== undefined))
    results["AC-S273-2"] =
      tenant?.outOfDate === true &&
      owner?.outOfDate === true &&
      communication?.noOutOfDate === true;
  if (all.every((value) => value !== undefined)) {
    // BEH-S273-5 repeats AC-S273-1 to AC-S273-4 for the owner; nothing sent, cancelled or resumed
    // without the confirmation shown.
    const later = confirmationsOnly(ctx, {
      // The tenant part's own, then the communication part's schedule, then the owner part's
      // schedule and its two sends (the refused one and the retry).
      send: 1 + 2,
      schedule: 2 + 1 + 1,
    });
    ctx.record({ requests: { tenant: tenantRequests, whole: later } });
    results["AC-S273-6"] =
      tenant?.safety === true &&
      tenantRequests?.matches === true &&
      later.matches &&
      [1, 2, 3, 4].every((n) => results[`AC-S273-${n}`] === true);
  }
  ctx.record({ checks: results, parts: { tenant, communication, owner } });
  return Object.fromEntries(
    CHECKS.filter((id) => id in results).map((id) => [id, results[id]]),
  );
}
