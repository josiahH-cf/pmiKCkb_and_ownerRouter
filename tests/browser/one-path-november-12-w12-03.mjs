// S284 W12-03, "Send through a lease re-read": the candidate-side acceptance checks of S274
// (intake 152) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-send-refusal-only-for-real-changes.md (S274).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S274-1, AC-S274-2, AC-S274-3, AC-S274-4, AC-S274-5, AC-S274-6
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Wait 90 seconds in an open review and Send, ten times. Change a recipient, the rent and a
//   date between review and Send. Make a message due during a read in flight and after a real
//   change.
//
// Starting sequence (journeyW1203 in one-path-november-12-journeys.mjs, the fail-first table):
//   Inject an admission that commits between the floor reads and the notice observation, then
//   confirm. On the baseline: The "recipients or source facts changed" refusal with nothing
//   edited. It runs unchanged on the candidate: the owner review, a wait past the lease read's
//   minute, then "Send this message". Its tries count toward AC-S274-1's ten only when they waited
//   the full 90 seconds (driver option --w1203-wait 90); every try it made must have sent.
//
// How each check is reached, through what staff can do (R-S284-2):
//   - The lease page's own controls in a second signed-in Editor tab make the real changes: Rent
//     to recommend on Compare market, the renewal end date in Working renewal terms, and "Refresh
//     data" after the owner's contact changed in RentVine.
//   - Outside parties act through the stand-in hooks: RentVine's owner address
//     (setOwnerEmail, S284 W12-03, test-only), RentVine answering its export slowly
//     (setRentvineLatency, S284 W12-03, test-only) and a RentVine read outage (setRentvineOutage).
//   - Time passes only through the worker tick (kit.tick, which makes the named message due).
//   - "A lease read in flight" is another app instance reading RentVine, which the rehearsal's one
//     server never has by itself: startLeaseReadsElsewhere runs the served commit's own notice
//     admission in a separate process, as each instance does before each read, and RentVine's
//     export answers in 1.5 s, so every read the server or the worker makes meanwhile is
//     superseded before it settles (S284 W12-03, harness only; the other instance reads no
//     provider and sends nothing). Stopping both lets the next read settle.
// Nothing here posts an app route; the kit only waits for the requests staff clicks make.
//
// AC-S274-5 asks that "Communications and the lease show" a hold's changed inputs. R-S274-6 names
// the lease step's display as S273's (renewal-held-and-outdated-message-visibility.md, R-S273-1 and
// R-S273-3: a held message is projected and named on the step), and S274 leaves lease-page display
// out of scope. The check reads the lease step and stays false until that display exists.
//
// Development iteration only: --w1203-parts change,reading,due,hold,timed runs those parts; a
// check whose part did not run is left out (not recorded), so such a run never reads Yes.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  setOwnerEmail,
  setRentvineLatency,
  setRentvineOutage,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import { startLeaseReadsElsewhere } from "../../scripts/lib/one-path-rehearsal/lease-reads-elsewhere.mjs";
import {
  CHANGED_TERM_END,
  FIRST_TERM_END,
  enterRenewalDates,
  observeTimedOwnerConfirmation,
  reachPrimary,
  recordOwnerAnswer,
  refreshData,
  reviewText,
  stepScheduleButton,
} from "./one-path-november-12-journeys.mjs";
import {
  SEQUENCES_ROUTE,
  WORKING_ROUTE,
  WORKSPACE_ROUTE,
} from "./one-path-november-12-kit.mjs";

const CHECKS = [
  "AC-S274-1",
  "AC-S274-2",
  "AC-S274-3",
  "AC-S274-4",
  "AC-S274-5",
  "AC-S274-6",
];
/** BEH-S274-1: ten confirmations, each after 90 seconds in an open review. */
export const TIMED_CONFIRMATIONS = 10;
export const TIMED_WAIT_SECONDS = 90;
/** R-S274-3: the one line staff read when the lease read does not settle within the bound. */
export const STILL_READING =
  "The lease is being re-read. Nothing was sent. Try again in a moment.";
/** R-S274-5: the refusal's lead, kept from the earlier refusal. */
const CHANGED_LEAD = "The recipients or source facts changed after the preview.";
const PAUSED_CHANGED = "The lease or recipient facts changed";
const WAIT_LINE = /Waiting on a lease read/;
const DIALOG_SEND = "Review and send";
const DIALOG_SCHEDULE = "Review and schedule";
const SEND = "Send this message";
const SCHEDULE = "Schedule this message";
const REVIEW_TEXT = '[data-renewal-field="exact-review"]';
const DIALOG_ERROR = '.ui-dialog-error[role="alert"]';
const RENT_FIELD = "#renewal-now-rent-to-recommend";
/** The synthetic address RentVine serves for the prepared lease's owner after the change. */
const CHANGED_OWNER_EMAIL = "jordan.sample.changed@example.invalid";
/** The notice marker's fields before S274; the change adds none (AC-S274-6). */
const MARKER_FIELDS = [
  "observedAt",
  "scopeHash",
  "semanticHash",
  "sourceReadAt",
  "version",
];
const OUTAGE_PATH = "leases/export";
/** How slowly RentVine answers its export while a read is in flight elsewhere. */
const SLOW_EXPORT_MS = 1500;

/**
 * Run `act` while another instance keeps reading RentVine and RentVine answers its export slowly,
 * then let the reads settle. Resolves with `act`'s result and the other instance's counts.
 */
async function whileReadInFlightElsewhere(ctx, act) {
  setRentvineLatency(ctx.rehearsal, OUTAGE_PATH, SLOW_EXPORT_MS);
  let elsewhere = null;
  try {
    elsewhere = await startLeaseReadsElsewhere(ctx.rehearsal);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return await act();
  } finally {
    const counts = elsewhere ? await elsewhere.stop() : null;
    setRentvineLatency(ctx.rehearsal, null);
    ctx.record({ part: "read in flight elsewhere", elsewhere: counts });
  }
}

const usDate = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
/** $1,425.00, as the review and the changed-input lines state money. */
export function money(value) {
  const [whole, cents] = Math.abs(Number(value)).toFixed(2).split(".");
  return `${Number(value) < 0 ? "-" : ""}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}
/** The amount as a message may state it: $1,425 or $1,425.00. */
const moneyPattern = (value) =>
  new RegExp(`${money(value).replace("$", "\\$").replace(/\.00$/, "")}(?:\\.00)?(?!\\d)`);

function developmentParts() {
  const index = process.argv.indexOf("--w1203-parts");
  if (index < 0) return null;
  return new Set(
    String(process.argv[index + 1] ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

// ---- Staff steps ---------------------------------------------------------------------------------

/**
 * Open the step's review dialog as staff do: the owner message on Ask the owner, the tenant offer
 * on Offer the tenant; "send" is the step's primary ("Review ..."), "schedule" its Schedule button.
 */
async function openReview(ctx, page, leaseId, channel, mode) {
  const { kit } = ctx;
  const step = channel === "owner" ? "ask-owner" : "offer-tenant";
  await reachPrimary(
    ctx,
    page,
    leaseId,
    step,
    channel === "owner" ? "Review owner message" : "Review tenant offer",
  );
  const trigger =
    mode === "schedule" ? await stepScheduleButton(ctx, page) : kit.primary(page);
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: mode === "schedule" ? DIALOG_SCHEDULE : DIALOG_SEND,
  });
  await dialog.locator(REVIEW_TEXT).waitFor({ timeout: 120_000 });
  return dialog;
}

/**
 * Press the dialog's confirm button and wait for the sequences request that click makes (its kind
 * is `requestKind`). Resolves with the answer's status and body, or nulls when none arrived.
 */
async function pressConfirm(ctx, page, dialog, buttonName, requestKind) {
  const { kit } = ctx;
  const answer = kit.appResponse(page, SEQUENCES_ROUTE, {
    match: (body) => kit.sequenceAction(body) === requestKind,
    timeout: 150_000,
  });
  await dialog.getByRole("button", { name: buttonName, exact: true }).click();
  const response = await answer.catch(() => null);
  if (!response) return { status: null, body: null };
  const body = await response.json().catch(() => null);
  if (response.status() === 200)
    await dialog.waitFor({ state: "hidden", timeout: 60_000 }).catch(() => undefined);
  return { status: response.status(), body };
}

/** What the open dialog shows: its message, its error line and its confirm button. */
async function dialogState(ctx, dialog, buttonName) {
  const { kit } = ctx;
  const open = await dialog.isVisible().catch(() => false);
  const button = dialog.getByRole("button", { name: buttonName, exact: true });
  const error = dialog.locator(DIALOG_ERROR);
  return {
    open,
    text: open ? await reviewText(ctx, dialog) : "",
    error: (await kit.shownWithin(error, 5_000)) ? await kit.visibleText(error) : null,
    buttonShown: open && (await button.isVisible().catch(() => false)),
    buttonEnabled: open && (await button.isEnabled().catch(() => false)),
  };
}

/**
 * After a refusal for a real change: watch the dialog read its review again in place. Resolves with
 * whether a sample showed the loading line with confirm disabled, whether confirm was ever enabled
 * while loading, and the changed-input lines once the reloaded review shows.
 */
async function watchReload(ctx, dialog, buttonName) {
  const { kit } = ctx;
  const loading = dialog.locator('[data-renewal-field="review-reloading"]');
  const changed = dialog.locator('[data-renewal-field="review-changed"]');
  const button = dialog.getByRole("button", { name: buttonName, exact: true });
  let loadingDisabled = false;
  let loadingEnabled = false;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const isLoading = await loading.isVisible().catch(() => false);
    if (isLoading) {
      if (await button.isEnabled().catch(() => false)) loadingEnabled = true;
      else loadingDisabled = true;
    }
    if (await changed.isVisible().catch(() => false)) break;
    if (!(await dialog.isVisible().catch(() => false))) break;
    await dialog.page().waitForTimeout(100);
  }
  const shown = await kit.shownWithin(changed, 2_000);
  return {
    loadingDisabled,
    loadingEnabled,
    changedShown: shown,
    lead: shown ? await kit.visibleText(changed.locator("p").first()) : "",
    lines: shown
      ? (await changed.locator("li").allInnerTexts()).map((line) => kit.squash(line))
      : [],
    dialogOpen: await dialog.isVisible().catch(() => false),
    buttonEnabled: await button.isEnabled().catch(() => false),
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
async function changeRentToRecommend(ctx, page, leaseId, amount, { open = true } = {}) {
  const { kit } = ctx;
  if (open) await kit.openLease(page, leaseId, "?step=compare-market");
  const field = page.locator(RENT_FIELD);
  await field.waitFor({ timeout: 60_000 });
  const saved = kit.appResponse(page, WORKING_ROUTE, {
    match: (body) => ["terms_rent", "recommended_rent"].includes(body?.field),
  });
  await field.fill(String(amount));
  await field.press("Enter");
  return (await saved).status();
}

// ---- Reads: the emulator, the mail stand-in and the Communications hub ----------------------------

/** The prepared lease's notice marker document, as the emulator holds it (raw, for byte equality). */
async function readMarker(rehearsal, leaseId) {
  if (!/^127\.0\.0\.1:\d+$/.test(String(rehearsal.firestoreEmulatorHost)))
    throw new Error("The rehearsal's Firestore emulator is not on 127.0.0.1.");
  const workspace = createHash("sha256").update(String(leaseId)).digest("hex");
  const response = await fetch(
    `http://${rehearsal.firestoreEmulatorHost}/v1/projects/${rehearsal.projectId}` +
      `/databases/(default)/documents/lease_renewal_workspaces/${workspace}/approval_safety/notice`,
    { headers: { authorization: "Bearer owner" }, redirect: "error" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`The marker read answered ${response.status}.`);
  const document = await response.json();
  return { raw: JSON.stringify(document.fields ?? null), fields: document.fields ?? {} };
}
const markerShapeKept = (marker) =>
  marker !== null &&
  JSON.stringify(Object.keys(marker.fields).sort()) === JSON.stringify(MARKER_FIELDS) &&
  JSON.stringify(
    Object.keys(marker.fields.sourceReadAt?.mapValue?.fields ?? {}).sort(),
  ) === JSON.stringify(["lease", "status"]);

/**
 * How many new lease read generations the server started so far (its network log): the export and
 * status table reads, each admitted against the notice markers. A single lease's detail or charge
 * read is not a generation and admits nothing.
 */
function serverGenerationReads(rehearsal) {
  try {
    return readFileSync(rehearsal.files.networkLog, "utf8")
      .split("\n")
      .filter(
        (line) =>
          line.includes('"served":"rentvine"') &&
          /"path":"\/api\/manager\/leases\/(?:export|statuses)"/.test(line),
      ).length;
  } catch {
    return null;
  }
}

async function ownerSequences(ctx, leaseId) {
  return ctx.kit.sequences(leaseId, "renewal_owner");
}
const pausedOrAuthorized = (sequences) => ({
  paused: sequences.filter((sequence) => sequence.state === "paused" || sequence.pause)
    .length,
  authorized: sequences.filter((sequence) => sequence.authorization).length,
});
const tickCounts = (tick) => ({
  sent: Number(tick?.sent ?? 0),
  held: Number(tick?.held ?? 0),
  waited: Number(tick?.waitedOnLeaseRead ?? 0),
  failures: Number(tick?.failures ?? 0),
});

/**
 * Communications as staff read it: Outgoing, the worker health lines and this lease's card for
 * `purposeWords` ("renewal owner"); with `composer`, the card's communication opened.
 */
async function readCommunications(
  ctx,
  page,
  leaseId,
  purposeWords,
  { composer = false },
) {
  const { kit } = ctx;
  await kit.openPath(page, "/gmail-hub");
  await page.getByRole("tab", { name: "Outgoing", exact: true }).click();
  const health = page.locator('[data-communication-field="worker-health"]').first();
  const healthText = (await kit.shownWithin(health, 60_000))
    ? await kit.visibleText(health)
    : "";
  const card = page
    .locator('[role="tabpanel"] article.ui-card')
    .filter({ hasText: `${purposeWords} · Lease ${leaseId}` })
    .first();
  const cardShown = await kit.shownWithin(card, 60_000);
  const result = {
    healthText,
    cardShown,
    cardText: cardShown ? await kit.visibleText(card) : "",
    cardChanged: cardShown
      ? (
          await card
            .locator('[data-communication-field="pause-changed-inputs"] li')
            .allInnerTexts()
        ).map((line) => kit.squash(line))
      : [],
    composerText: "",
    composerChanged: [],
  };
  if (composer && cardShown) {
    await card.getByRole("button", { name: "Open communication", exact: true }).click();
    const region = page.getByRole("region", { name: "Workflow communication composer" });
    if (await kit.shownWithin(region, 60_000)) {
      await page
        .waitForLoadState("networkidle", { timeout: 30_000 })
        .catch(() => undefined);
      result.composerText = await kit.visibleText(region);
      result.composerChanged = (
        await region
          .locator('[data-communication-field="pause-changed-inputs"] li')
          .allInnerTexts()
      ).map((line) => kit.squash(line));
    }
  }
  return result;
}

/** The held message's differences, as staff read them on the lease's Now card. */
async function readLeaseHold(ctx, page, leaseId, line) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, "?step=ask-owner");
  const now = kit.now(page);
  const changedValue = now
    .locator('[data-renewal-field="now-detail"]')
    .filter({ hasText: /^Owner message held on / })
    .filter({ hasText: line });
  const review = kit
    .primary(page)
    .filter({ hasText: /^Review the updated owner message$/ });
  return (
    (await kit.shownWithin(changedValue, 20_000)) &&
    (await kit.shownWithin(review, 5_000))
  );
}

// ---- AC-S274-1: ten confirmations after 90 seconds, nothing edited ---------------------------------

async function timedConfirmation(ctx, page, leaseId, attempt) {
  await ctx.resetState();
  const dialog = await openReview(ctx, page, leaseId, "owner", "send");
  return {
    attempt,
    ...(await observeTimedOwnerConfirmation(
      ctx,
      page,
      leaseId,
      dialog,
      TIMED_WAIT_SECONDS,
    )),
  };
}

const passedTimedConfirmation = (entry) =>
  entry.waitedMs >= TIMED_WAIT_SECONDS * 1000 &&
  entry.status === 200 &&
  entry.refusedAsChanged === false &&
  entry.reviewUnchanged === true &&
  entry.postsBeforeConfirm === 0 &&
  entry.sendRequests === 1 &&
  entry.postsDuringTry.length === 1 &&
  entry.postsDuringTry[0] === SEQUENCES_ROUTE &&
  entry.workingRecordUnchanged === true &&
  entry.ownerMessagesSent === 1 &&
  entry.receiptMatches === true;

async function timedPart(ctx, page, leaseId, start) {
  const startTries = start.observed?.tries ?? [];
  const counted = startTries.filter(passedTimedConfirmation).length;
  const inWindow = startTries.filter(
    (entry) => entry.waitedMs >= TIMED_WAIT_SECONDS * 1000,
  );
  const failed = startTries.some(
    (entry) => entry.status !== 200 || entry.refusedAsChanged,
  );
  // A full-window attempt with missing evidence cannot be replaced by a later passing attempt.
  if (start.error || failed || counted !== inWindow.length)
    return {
      "AC-S274-1": false,
      summary: { startTries: startTries.length, counted, failed: true },
    };
  const tries = [];
  for (let attempt = counted + 1; attempt <= TIMED_CONFIRMATIONS; attempt += 1) {
    const result = await timedConfirmation(ctx, page, leaseId, attempt);
    tries.push(result);
    ctx.record({ part: "timed", ...result });
    if (!passedTimedConfirmation(result)) break;
  }
  const sends = counted + tries.filter(passedTimedConfirmation).length;
  const refusals = tries.filter(
    (entry) => entry.status !== 200 || entry.refusedAsChanged,
  ).length;
  return {
    "AC-S274-1":
      !start.error &&
      startTries.length > 0 &&
      sends === TIMED_CONFIRMATIONS &&
      refusals === 0,
    summary: { startTries: startTries.length, counted, sends, refusals },
  };
}

// ---- AC-S274-2 (and AC-S274-6 at confirm): a read that does not settle, then an unreadable one ----

async function readingPart(ctx, page, leaseId) {
  const { kit, rehearsal } = ctx;
  await ctx.resetState();
  const owners = kit.ownerAddresses(leaseId);
  const dialog = await openReview(ctx, page, leaseId, "owner", "send");
  const before = await dialogState(ctx, dialog, SEND);
  const mailBefore = (await kit.sentTo(owners)).length;
  const markerBefore = await readMarker(rehearsal, leaseId);
  // Another instance keeps reading RentVine while staff confirm: the read never settles in time.
  const startedAt = Date.now();
  const reading = await whileReadInFlightElsewhere(ctx, () =>
    pressConfirm(ctx, page, dialog, SEND, "send"),
  );
  reading.seconds = Math.round((Date.now() - startedAt) / 1000);
  if (reading.status === null) ctx.unresolved("W12-03 still-reading send: no answer");
  const during = await dialogState(ctx, dialog, SEND);
  const sequencesDuring = await ownerSequences(ctx, leaseId);
  const mailDuring = (await kit.sentTo(owners)).length;
  const stillReading = {
    typed:
      reading.status === 409 &&
      reading.body?.code === "lease_read_not_settled" &&
      reading.body?.retryable === true &&
      reading.body?.error === STILL_READING,
    line: during.error === STILL_READING,
    contentKept: during.open && during.text === before.text && before.text.length > 0,
    buttonKept: during.buttonShown && during.buttonEnabled,
    mailUnchanged: mailDuring === mailBefore,
    nothingPausedOrAuthorized:
      pausedOrAuthorized(sequencesDuring).paused === 0 &&
      pausedOrAuthorized(sequencesDuring).authorized === 0,
  };
  if (reading.status === 200 || mailDuring !== mailBefore) {
    // It sent on a read that was still in progress: nothing further here can be shown.
    ctx.record({
      part: "reading",
      reading: { status: reading.status, seconds: reading.seconds },
      stillReading,
    });
    return {
      "AC-S274-2": false,
      safety: { unsettledNotSent: false, unreadableRefused: false },
    };
  }

  // The same review, once RentVine cannot be read: an unreadable source is never "unchanged".
  setRentvineOutage(rehearsal, OUTAGE_PATH);
  let unreadable;
  try {
    unreadable = during.buttonEnabled
      ? await pressConfirm(ctx, page, dialog, SEND, "send")
      : { status: null, body: null };
  } finally {
    setRentvineOutage(rehearsal, null);
  }
  const afterOutage = await dialogState(ctx, dialog, SEND);
  const sequencesOutage = await ownerSequences(ctx, leaseId);
  const mailOutage = (await kit.sentTo(owners)).length;
  const unreadableRefused =
    unreadable.status !== null &&
    unreadable.status >= 400 &&
    !["target_changed", "lease_read_not_settled"].includes(unreadable.body?.code) &&
    mailOutage === mailBefore &&
    pausedOrAuthorized(sequencesOutage).authorized === 0;

  // Trying again once RentVine reads: it sends, once.
  let retry = { status: null, body: null };
  let retryDialog = dialog;
  if (!afterOutage.open || !afterOutage.buttonEnabled) {
    if (afterOutage.open)
      await dialog
        .getByRole("button", { name: "Cancel", exact: true })
        .click()
        .catch(() => undefined);
    retryDialog = await openReview(ctx, page, leaseId, "owner", "send");
  }
  retry = await pressConfirm(ctx, page, retryDialog, SEND, "send");
  if (retry.status === null) ctx.unresolved("W12-03 retry send: no answer");
  const mailAfter = await kit.sentTo(owners);
  const markerAfter = await readMarker(rehearsal, leaseId);
  ctx.record({
    part: "reading",
    reading: {
      status: reading.status,
      code: reading.body?.code ?? null,
      seconds: reading.seconds,
    },
    stillReading,
    during: {
      error: during.error,
      open: during.open,
      buttonEnabled: during.buttonEnabled,
    },
    unreadable: {
      status: unreadable.status,
      code: unreadable.body?.code ?? null,
      error: String(unreadable.body?.error ?? "").slice(0, 200),
      dialogOpen: afterOutage.open,
      buttonEnabled: afterOutage.buttonEnabled,
    },
    retry: { status: retry.status, sent: mailAfter.length },
  });
  const retrySent = retry.status === 200 && mailAfter.length === 1;
  return {
    "AC-S274-2": Object.values(stillReading).every(Boolean) && retrySent,
    safety: {
      unsettledNotSent:
        stillReading.mailUnchanged && stillReading.nothingPausedOrAuthorized,
      unreadableRefused,
      sentOnceAfter: retrySent,
      markerShape: markerShapeKept(markerBefore) && markerShapeKept(markerAfter),
    },
  };
}

// ---- AC-S274-3 (and AC-S274-6 at dispatch): due during a read in flight, then unreadable ----------

/** Schedule the owner message from the lease as staff do; resolves with its record id. */
async function scheduleOwnerMessage(ctx, page, leaseId) {
  const dialog = await openReview(ctx, page, leaseId, "owner", "schedule");
  const scheduled = await pressConfirm(ctx, page, dialog, SCHEDULE, "schedule");
  if (scheduled.status === null) ctx.unresolved("W12-03 schedule: no answer");
  if (scheduled.status !== 200)
    throw new Error(`The owner message was not scheduled (HTTP ${scheduled.status}).`);
  const id = scheduled.body?.sequence?.id;
  if (!id) throw new Error("The schedule answer named no message.");
  return id;
}

/** One worker tick while a lease read is in flight elsewhere; then the reads settle. */
async function tickDuringReadElsewhere(ctx, sequenceId) {
  return whileReadInFlightElsewhere(ctx, () => ctx.kit.tick(sequenceId));
}

async function duePart(ctx, page, leaseId) {
  const { kit, rehearsal } = ctx;
  await ctx.resetState();
  const owners = kit.ownerAddresses(leaseId);
  const sequenceId = await scheduleOwnerMessage(ctx, page, leaseId);
  const find = async () =>
    (await ownerSequences(ctx, leaseId)).find((sequence) => sequence.id === sequenceId);
  const scheduled = await find();

  const waitTick = tickCounts(await tickDuringReadElsewhere(ctx, sequenceId));
  const waiting = await find();
  const mailWaiting = (await kit.sentTo(owners)).length;
  const hub = await readCommunications(ctx, page, leaseId, "renewal owner", {
    composer: true,
  });
  const waited =
    waitTick.sent === 0 &&
    waitTick.held === 0 &&
    waitTick.waited >= 1 &&
    mailWaiting === 0 &&
    waiting?.state === scheduled?.state &&
    !waiting?.pause &&
    waiting?.observation?.reason === "lease_read_settling";
  const waitShown =
    new RegExp(`\\b${waitTick.waited} waited on a lease read\\b`).test(hub.healthText) &&
    /\b0 sent\b/.test(hub.healthText) &&
    /\b0 held\b/.test(hub.healthText) &&
    hub.cardShown &&
    WAIT_LINE.test(hub.cardText) &&
    !/Paused:/.test(hub.cardText) &&
    /The lease was being re-read at the due time\. Nothing was sent/.test(
      hub.composerText,
    );

  // RentVine cannot be read at the next due check: nothing is sent, held as a pause or counted as a
  // wait on a read in progress.
  setRentvineOutage(rehearsal, OUTAGE_PATH);
  let outageTick;
  try {
    outageTick = tickCounts(await kit.tick(sequenceId));
  } finally {
    setRentvineOutage(rehearsal, null);
  }
  const unreadable = await find();
  const mailUnreadable = (await kit.sentTo(owners)).length;
  const unreadableHeld =
    outageTick.sent === 0 &&
    outageTick.waited === 0 &&
    mailUnreadable === 0 &&
    !unreadable?.pause &&
    unreadable?.observation?.reason === "source_unavailable";

  // The next check reads a settled lease with nothing changed: it sends, once.
  const settledTick = tickCounts(await kit.tick(sequenceId));
  const sent = await find();
  const mailSent = await kit.sentTo(owners);
  const sentOnce = settledTick.sent === 1 && mailSent.length === 1 && !sent?.pause;
  ctx.record({
    part: "due",
    scheduledState: scheduled?.state ?? null,
    waitTick,
    waiting: {
      state: waiting?.state ?? null,
      pause: waiting?.pause?.cause ?? null,
      reason: waiting?.observation?.reason ?? null,
    },
    hub: {
      health: hub.healthText.slice(0, 400),
      cardShown: hub.cardShown,
      waitLine: WAIT_LINE.test(hub.cardText),
      composerWait: /The lease was being re-read/.test(hub.composerText),
    },
    outageTick,
    unreadable: {
      state: unreadable?.state ?? null,
      pause: unreadable?.pause?.cause ?? null,
      reason: unreadable?.observation?.reason ?? null,
    },
    settledTick,
    sentState: sent?.state ?? null,
    ownerMessagesSent: mailSent.length,
  });
  return {
    flow: { waited, waitShown, sentOnce },
    safety: { unsettledNotSent: waited, unreadableHeld },
  };
}

// ---- AC-S274-5 (and the pause half of AC-S274-3): a settled difference at the due time -----------

async function holdPart(ctx, page, leaseId) {
  const { kit } = ctx;
  await ctx.resetState();
  const owners = kit.ownerAddresses(leaseId);
  const before = await readRentToRecommend(ctx, page, leaseId);
  if (!(before > 0)) throw new Error("The prepared lease shows no Rent to recommend.");
  const after = before + 25;
  const sequenceId = await scheduleOwnerMessage(ctx, page, leaseId);
  const find = async () =>
    (await ownerSequences(ctx, leaseId)).find((sequence) => sequence.id === sequenceId);
  const scheduled = await find();

  const waitTick = tickCounts(await tickDuringReadElsewhere(ctx, sequenceId));
  const waiting = await find();
  const waited =
    waitTick.sent === 0 &&
    waitTick.held === 0 &&
    waitTick.waited >= 1 &&
    !waiting?.pause &&
    waiting?.state === scheduled?.state;

  const saved = await changeRentToRecommend(ctx, page, leaseId, after);
  const holdTick = tickCounts(await kit.tick(sequenceId));
  const held = await find();
  const mail = (await kit.sentTo(owners)).length;
  const line = `Rent to recommend: was ${money(before)}, now ${money(after)}`;
  const stored = (held?.pause?.changedInputs ?? []).find(
    (change) => change.key === "rentToRecommend",
  );
  const paused =
    saved === 200 &&
    holdTick.sent === 0 &&
    holdTick.held === 1 &&
    mail === 0 &&
    held?.state === "paused" &&
    held?.pause?.cause === "changed_source";
  const storedBoth =
    stored?.label === "Rent to recommend" &&
    stored?.previous === money(before) &&
    stored?.current === money(after);
  const hub = await readCommunications(ctx, page, leaseId, "renewal owner", {
    composer: true,
  });
  const communicationsShow =
    hub.cardShown &&
    hub.cardText.includes(`Paused: ${PAUSED_CHANGED}`) &&
    hub.cardChanged.includes(line) &&
    hub.composerChanged.includes(line);
  const leaseShows = await readLeaseHold(
    ctx,
    page,
    leaseId,
    `Rent to recommend: ${money(before)} in the scheduled message, ${money(after)} on the lease.`,
  );
  ctx.record({
    part: "hold",
    waitTick,
    holdTick,
    saved,
    state: held?.state ?? null,
    cause: held?.pause?.cause ?? null,
    changedInputs: (held?.pause?.changedInputs ?? []).map((change) => change.key),
    storedBoth,
    hub: {
      cardShown: hub.cardShown,
      cardChanged: hub.cardChanged.length,
      composerChanged: hub.composerChanged.length,
      cardLine: hub.cardChanged.includes(line),
      composerLine: hub.composerChanged.includes(line),
    },
    leaseShows,
  });
  return {
    "AC-S274-5": paused && storedBoth && communicationsShow && leaseShows,
    flow: { waited, paused },
    safety: { unsettledNotSent: waited },
  };
}

// ---- AC-S274-4 (and the marker half of AC-S274-6): a real change between review and Send --------

/**
 * Confirm a review after one input changed elsewhere; the refusal must name exactly that input with
 * both values, the dialog must reload in place with confirm disabled while it loads, and one more
 * confirmation must send the reloaded message.
 */
async function refusedThenSent(ctx, page, dialog, { key, line, beforeConfirm }) {
  const before = await dialogState(ctx, dialog, SEND);
  const context = beforeConfirm ? await beforeConfirm() : {};
  const refused = await pressConfirm(ctx, page, dialog, SEND, "send");
  if (refused.status === null) ctx.unresolved("W12-03 changed send: no answer");
  const afterRefusal = context.afterRefusal ? await context.afterRefusal() : {};
  const reload = await watchReload(ctx, dialog, SEND);
  const reloaded = await dialogState(ctx, dialog, SEND);
  const changes = Array.isArray(refused.body?.changes) ? refused.body.changes : [];
  const named =
    refused.status === 409 &&
    refused.body?.code === "target_changed" &&
    changes.length === 1 &&
    changes[0]?.key === key &&
    reload.changedShown &&
    reload.lead.startsWith(CHANGED_LEAD) &&
    reload.lines.length === 1 &&
    reload.lines[0] === line;
  const inPlace =
    reload.dialogOpen &&
    reload.loadingDisabled &&
    !reload.loadingEnabled &&
    reload.buttonEnabled &&
    reloaded.text !== before.text;
  const second = reload.buttonEnabled
    ? await pressConfirm(ctx, page, dialog, SEND, "send")
    : { status: null, body: null };
  if (reload.buttonEnabled && second.status === null)
    ctx.unresolved("W12-03 second send: no answer");
  return {
    named,
    inPlace,
    secondStatus: second.status,
    reloadedText: reloaded.text,
    changes: changes.map((change) => change.key),
    lines: reload.lines.length,
    afterRefusal,
  };
}

async function changePart(ctx, page, leaseId) {
  const { kit, rehearsal } = ctx;
  const other = await ctx.newPage("Editor");
  const owners = kit.ownerAddresses(leaseId);
  const tenants = kit.tenantAddresses(leaseId);
  const kinds = {};
  const marker = {};

  // The rent to recommend, changed on Compare market in another tab.
  await ctx.resetState();
  const rentBefore = await readRentToRecommend(ctx, other, leaseId);
  const rentAfter = rentBefore + 25;
  const ownerDialog = await openReview(ctx, page, leaseId, "owner", "send");
  const rent = await refusedThenSent(ctx, page, ownerDialog, {
    key: "rentToRecommend",
    line: `Rent to recommend: was ${money(rentBefore)}, now ${money(rentAfter)}`,
    beforeConfirm: async () => {
      // A deliberate read first, so the confirm itself starts no lease read (the marker check).
      await refreshData(ctx, other);
      const saved = await changeRentToRecommend(ctx, other, leaseId, rentAfter);
      const readsBefore = serverGenerationReads(rehearsal);
      const markerBefore = await readMarker(rehearsal, leaseId);
      return {
        afterRefusal: async () => ({
          saved,
          readsBetween:
            readsBefore === null ? null : serverGenerationReads(rehearsal) - readsBefore,
          identical: markerBefore?.raw === (await readMarker(rehearsal, leaseId))?.raw,
          shape: markerShapeKept(markerBefore),
        }),
      };
    },
  });
  const rentMail = await kit.sentTo(owners);
  kinds.rent =
    rent.afterRefusal.saved === 200 &&
    rent.named &&
    rent.inPlace &&
    moneyPattern(rentAfter).test(rent.reloadedText) &&
    rent.secondStatus === 200 &&
    rentMail.length === 1 &&
    moneyPattern(rentAfter).test(`${rentMail[0]?.text ?? ""} ${rentMail[0]?.html ?? ""}`);
  marker.identical =
    rent.afterRefusal.readsBetween === 0 && rent.afterRefusal.identical === true;
  marker.shape = rent.afterRefusal.shape === true;
  ctx.record({
    part: "change rent",
    ...rent,
    reloadedText: undefined,
    ownerMessages: rentMail.length,
  });

  // The renewal end date, changed in Working renewal terms in another tab, on the tenant offer.
  const answer = await recordOwnerAnswer(ctx, page, leaseId, { amount: rentAfter });
  const dates = await enterRenewalDates(ctx, page, leaseId, {
    start: "day-after",
    end: FIRST_TERM_END,
  });
  if (answer.status !== 200 || dates.start !== 200 || dates.end !== 200)
    throw new Error(
      `The tenant offer could not be prepared: ${JSON.stringify({ answer: answer.status, dates })}`,
    );
  const tenantDialog = await openReview(ctx, page, leaseId, "tenant", "send");
  const endDate = await refusedThenSent(ctx, page, tenantDialog, {
    key: "renewalEnd",
    line: `Renewal end date: was ${usDate(FIRST_TERM_END)}, now ${usDate(CHANGED_TERM_END)}`,
    beforeConfirm: async () => {
      const changed = await enterRenewalDates(ctx, other, leaseId, {
        end: CHANGED_TERM_END,
      });
      return { afterRefusal: async () => ({ saved: changed.end }) };
    },
  });
  const tenantMail = await kit.sentTo(tenants);
  const tenantText = `${tenantMail[0]?.text ?? ""} ${tenantMail[0]?.html ?? ""}`;
  kinds.endDate =
    endDate.afterRefusal.saved === 200 &&
    endDate.named &&
    endDate.inPlace &&
    endDate.reloadedText.includes(usDate(CHANGED_TERM_END)) &&
    endDate.secondStatus === 200 &&
    tenantMail.length === 1 &&
    tenantText.includes(usDate(CHANGED_TERM_END)) &&
    !tenantText.includes(usDate(FIRST_TERM_END));
  ctx.record({
    part: "change end date",
    ...endDate,
    reloadedText: undefined,
    tenantMessages: tenantMail.length,
  });

  // A recipient: the owner's address changed in RentVine, read again with "Refresh data".
  await ctx.resetState();
  const ownerAgain = await openReview(ctx, page, leaseId, "owner", "send");
  let recipient;
  try {
    recipient = await refusedThenSent(ctx, page, ownerAgain, {
      key: "to",
      line: `To: was ${owners[0]}, now ${CHANGED_OWNER_EMAIL}`,
      beforeConfirm: async () => {
        setOwnerEmail(rehearsal, leaseId, CHANGED_OWNER_EMAIL);
        await kit.openLease(other, leaseId);
        const refreshed = await refreshData(ctx, other);
        return { afterRefusal: async () => ({ refreshed: refreshed.status }) };
      },
    });
  } finally {
    setOwnerEmail(rehearsal, leaseId, null);
  }
  const toChanged = await kit.sentTo([CHANGED_OWNER_EMAIL]);
  const toEarlier = await kit.sentTo(owners);
  kinds.recipient =
    recipient.afterRefusal.refreshed === 200 &&
    recipient.named &&
    recipient.inPlace &&
    recipient.reloadedText.includes(CHANGED_OWNER_EMAIL) &&
    recipient.secondStatus === 200 &&
    toChanged.length === 1 &&
    toEarlier.length === 0;
  ctx.record({
    part: "change recipient",
    ...recipient,
    reloadedText: undefined,
    toChanged: toChanged.length,
    toEarlier: toEarlier.length,
  });

  return {
    "AC-S274-4": kinds.rent && kinds.endDate && kinds.recipient,
    kinds,
    safety: { markerIdentical: marker.identical, markerShape: marker.shape },
  };
}

// ---- The row --------------------------------------------------------------------------------------

/**
 * W12-03 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1203 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S274-1 to AC-S274-6 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1203(ctx, page, start) {
  const leaseId = ctx.leases.prepared.leaseId;
  const parts = developmentParts();
  const runs = (part) => !parts || parts.has(part);
  ctx.record({
    startingSequence: start.error ? "stopped" : "completed",
    startTries: (start.observed?.tries ?? []).map((entry) => ({
      attempt: entry.attempt,
      waitedSeconds: entry.waitedSeconds,
      waitedMs: entry.waitedMs,
      status: entry.status,
      refused: entry.refusedAsChanged,
      receiptMatches: entry.receiptMatches,
    })),
    parts: parts ? [...parts] : "all",
  });
  const results = {};
  const failed = (part, error) => {
    ctx.record({ part, error: String(error?.message ?? error).slice(0, 900) });
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

  const change = await attempt("change", () => changePart(ctx, page, leaseId));
  const reading = await attempt("reading", () => readingPart(ctx, page, leaseId));
  const due = await attempt("due", () => duePart(ctx, page, leaseId));
  const hold = await attempt("hold", () => holdPart(ctx, page, leaseId));
  const timed = await attempt("timed", () => timedPart(ctx, page, leaseId, start));

  if (change !== undefined) results["AC-S274-4"] = change?.["AC-S274-4"] === true;
  if (reading !== undefined) results["AC-S274-2"] = reading?.["AC-S274-2"] === true;
  if (due !== undefined && hold !== undefined)
    results["AC-S274-3"] =
      due?.flow.waited === true &&
      due?.flow.waitShown === true &&
      due?.flow.sentOnce === true &&
      hold?.flow.waited === true &&
      hold?.flow.paused === true;
  if (hold !== undefined) results["AC-S274-5"] = hold?.["AC-S274-5"] === true;
  if (timed !== undefined) results["AC-S274-1"] = timed?.["AC-S274-1"] === true;
  if ([change, reading, due, hold].every((value) => value !== undefined))
    results["AC-S274-6"] =
      reading?.safety.unsettledNotSent === true &&
      reading?.safety.unreadableRefused === true &&
      reading?.safety.sentOnceAfter === true &&
      reading?.safety.markerShape === true &&
      due?.safety.unsettledNotSent === true &&
      due?.safety.unreadableHeld === true &&
      hold?.safety.unsettledNotSent === true &&
      change?.safety.markerIdentical === true &&
      change?.safety.markerShape === true;
  ctx.record({
    checks: results,
    timed: timed?.summary ?? null,
    kinds: change?.kinds ?? null,
    safety: {
      reading: reading?.safety ?? null,
      due: due?.safety ?? null,
      hold: hold?.safety ?? null,
      change: change?.safety ?? null,
    },
  });
  return Object.fromEntries(
    CHECKS.filter((id) => id in results).map((id) => [id, results[id]]),
  );
}
