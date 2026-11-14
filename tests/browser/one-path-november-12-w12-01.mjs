// S284 W12-01, "Only the current offer goes out": the candidate-side acceptance checks of S272
// (intake 150) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-one-current-message-per-audience.md (S272).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S272-1, AC-S272-2, AC-S272-3, AC-S272-4, AC-S272-5, AC-S272-6
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Schedule a tenant offer, change the working end date, tick, then try every release action.
//   Update it from the lease and send once. Repeat for an owner message and for a seeded
//   duplicate.
//
// Starting sequence (journeyW1201 in one-path-november-12-journeys.mjs, the fail-first table):
//   Schedule a tenant offer, change the end date, tick, send a new offer from the lease, click
//   "Resume reviewed sequence", tick. On the baseline: The stand-in mailbox holds two tenant
//   messages with different end dates on one thread. Two steps of it were adapted so it runs to
//   its end on a build that withholds them, and each reached the same state on both builds: the
//   step's "Schedule" is found inside the "Other ways to send" group when the Now card does not
//   show it (S281 R-S281-12 closes that group on entry), the new offer is sent only when the Offer
//   step's primary still reads "Review tenant offer" (S273 holds the step on the held offer with
//   "Review the updated offer"; that is recorded and nothing is clicked), and "Resume reviewed
//   sequence" is clicked only when Communications shows it (S272 R-S272-5 shows the reason in its
//   place; that is recorded with the controls shown).
//
// How each part is reached, through what staff can do (R-S284-2):
//   - tenant (the starting state, lease "prepared"): the held offer in Communications, its reason
//     and the controls it leaves, "Update from the lease" and one Send. The seeded duplicates are
//     records no staff control can make any more, written into the rehearsal's own Firestore
//     emulator like the November 10 kit's legacy fixtures: a copy of the held offer as it was
//     authorized (older than the confirmed send), paused or due, and two copies with no kept
//     content basis (an authorization from before S272), one held for changed facts and one paused
//     by staff. Time passes only through kit.tick.
//   - owner (the harness reset): two untouched-then-edited composers opened with "Open in
//     Communications", the owner message scheduled from Ask the owner, three Communications tabs
//     opened while it was scheduled, Rent to recommend changed on Compare market, a tick, then
//     Send, Schedule and Resume in those tabs; "Update from the lease" and one Send.
//   - duplicate (the harness reset): three lease tabs with the owner review open; two schedule at
//     the same moment; the refused one tries again while the first is scheduled, paused by staff,
//     cancelled; the second is paused and resumed unchanged, its send is left unconfirmed by the
//     mail stand-in's next-send hook, a third tab tries to send, and "Check admitted send" settles
//     it. The stand-in then delivers the owner's reply and staff reply from Communications.
// Nothing here posts an app route; the kit only waits for the requests staff clicks make.
//
// Development iteration only: --w1201-parts tenant,owner,duplicate runs those parts; a check whose
// part did not run is left out (not recorded), so such a run never reads Yes.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  deliverOwnerReply,
  setNextSend,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import {
  CHANGED_TERM_END,
  FIRST_TERM_END,
  reachPrimary,
  refreshData,
  stepScheduleButton,
} from "./one-path-november-12-journeys.mjs";
import {
  SEQUENCES_ROUTE,
  WORKING_ROUTE,
  ownerRecommendationAmounts,
} from "./one-path-november-12-kit.mjs";

const CHECKS = [
  "AC-S272-1",
  "AC-S272-2",
  "AC-S272-3",
  "AC-S272-4",
  "AC-S272-5",
  "AC-S272-6",
];
const SEQUENCES = "gmail_communication_sequences";
const OCCURRENCES = "gmail_communication_occurrences";
const COMPOSITION_ROUTE = "/api/gmail-hub/composition";
const COMPOSER = "Workflow communication composer";
const REVIEW_TEXT = '[data-renewal-field="exact-review"]';
const DIALOG_ERROR = '.ui-dialog-error[role="alert"]';
const RENT_FIELD = "#renewal-now-rent-to-recommend";

// The staff words S272 settles (communication-state.ts), read as staff read them.
const WORDING_TEXT =
  "This message was written before the lease changed. Update it from the lease, or cancel it.";
const UPDATED_STATUS =
  "Updated from the lease. Nothing was sent. Review the message, then Send or Schedule it.";
const NEWER_LABEL = "A newer message for this renewal was sent";
const INSTANT = String.raw`\d{2}/\d{2}/\d{4}, \d{1,2}:\d{2} [AP]M C[SD]T`;
const NEWER_TEXT = new RegExp(
  `^A newer message for this renewal was sent on ${INSTANT}\\. Cancel this one\\.$`,
);
const SCHEDULED_STATE = new RegExp(`^Scheduled for ${INSTANT}$`);
const PAUSED_STATE = new RegExp(`^Paused on ${INSTANT}$`);
const OWNER_SCHEDULED = new RegExp(
  `^An owner message for this renewal is already scheduled for ${INSTANT}\\. Open it to update or cancel it\\.$`,
);
const OWNER_PAUSED = new RegExp(
  `^An owner message for this renewal was paused on ${INSTANT} and is not sent\\. Open it to update or cancel it\\.$`,
);
const OWNER_UNCONFIRMED =
  "An owner message for this renewal has a send that is not confirmed yet. Open it to check that send.";
const NEEDS_NOTICE_REFRESH =
  /Notice evidence needs a fresh admitted source read|Notice approval safety is unavailable or source generations conflict|Current notice evidence could not be verified/;

const usDate = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const END_LINE = `Renewal end date: ${usDate(FIRST_TERM_END)} in this message, ${usDate(CHANGED_TERM_END)} on the lease.`;
/** $1,425.00, as the reviewed values state money. */
function money(value) {
  const [whole, cents] = Math.abs(Number(value)).toFixed(2).split(".");
  return `${Number(value) < 0 ? "-" : ""}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}
const textOf = (message) =>
  `${message?.subject ?? ""} ${message?.text ?? ""} ${message?.html ?? ""}`;
const all = (values) => values.length > 0 && values.every(Boolean);

function developmentParts() {
  const index = process.argv.indexOf("--w1201-parts");
  if (index < 0) return null;
  return new Set(
    String(process.argv[index + 1] ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

// ---- Reads: the emulator and the mail stand-in --------------------------------------------------

async function sequenceById(ctx, leaseId, purpose, id) {
  return (
    (await ctx.kit.sequences(leaseId, purpose)).find((entry) => entry.id === id) ?? null
  );
}
const brief = (sequence) =>
  sequence
    ? {
        id: sequence.id,
        state: sequence.state ?? null,
        pause: sequence.pause?.cause ?? null,
        evidence: sequence.pause?.evidenceIds ?? [],
        confirmed: sequence.confirmedCount ?? null,
        unresolved: Boolean(sequence.unresolvedOccurrenceId),
        revision: sequence.authorization?.revision ?? null,
        approvedAtMs: sequence.authorization?.approvedAtMs ?? null,
        nextDueAtMs: sequence.nextDueAtMs ?? null,
        keptBasis: Boolean(sequence.authorizedContentBasis),
      }
    : null;
const mailSendAttempts = ({ rehearsal }) =>
  readFileSync(rehearsal.files.standInLog, "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse)
    .filter(
      (entry) =>
        entry.standIn === "mail" &&
        entry.method === "POST" &&
        entry.path === "/messages/send",
    ).length;
const tickRead = (tick) => ({
  status: tick?.status ?? null,
  inspected: tick?.inspected ?? null,
  sent: tick?.sent ?? null,
  held: tick?.held ?? null,
  failures: tick?.failures ?? null,
});
/** Wait until `read` returns a value `ready` accepts (at most `ms`); resolves with the last value. */
async function settle(read, ready, ms = 20_000) {
  const deadline = Date.now() + ms;
  let value = await read();
  while (!ready(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    value = await read();
  }
  return value;
}

/**
 * A seeded copy of a stored message, as a record no staff control makes any more: written into the
 * rehearsal's own emulator under a new id. `change(fields)` edits the copy's REST fields.
 */
async function seedCopy(ctx, original, change) {
  const id = randomUUID();
  const fields = structuredClone(original.fields);
  fields.id = { stringValue: id };
  fields.updatedAtMs = { integerValue: String(Date.now()) };
  change(fields);
  await ctx.kit.patchDocument(`${SEQUENCES}/${id}`, Object.keys(fields), fields, {
    exists: false,
  });
  return id;
}
const integer = (value) => ({ integerValue: String(value) });
const text = (value) => ({ stringValue: String(value) });

// ---- Communications: the composer as staff read it -----------------------------------------------

/** Open one communication's detail and wait until its lease read (the recipients) has answered. */
async function openComposer(ctx, page, sequenceId) {
  await ctx.kit.openPath(
    page,
    `/gmail-hub?communication=${encodeURIComponent(sequenceId)}`,
  );
  return settleComposer(ctx, page);
}
/** The exact lease target a saved tenant composer fetched, with its displayed Resume readiness. */
async function openLegacyStaffResume(ctx, page, leaseId, id) {
  const response = page
    .waitForResponse(
      (entry) => {
        const url = new URL(entry.url());
        return (
          url.origin === ctx.origin &&
          url.pathname === COMPOSITION_ROUTE &&
          url.searchParams.get("purpose") === "renewal_tenant" &&
          url.searchParams.get("lease") === String(leaseId) &&
          entry.request().method() === "GET"
        );
      },
      { timeout: 60_000 },
    )
    .catch(() => null);
  await ctx.kit.openPath(page, `/gmail-hub?communication=${encodeURIComponent(id)}`);
  const answer = await response;
  const body = await answer?.json().catch(() => null);
  const view = await readComposer(ctx, page);
  const resume = composerButton(page, "Resume reviewed sequence");
  const ready =
    answer?.ok() === true &&
    view.refusals.length === 0 &&
    (await ctx.kit.shownWithin(resume.and(page.locator("button:enabled")), 10_000));
  return {
    ready,
    status: answer?.status() ?? null,
    blockers: body?.target?.blockers ?? [],
    error: body?.error ?? null,
    view: summarize(view),
  };
}
async function settleComposer(ctx, page) {
  const composer = page.getByRole("region", { name: COMPOSER });
  await composer.waitFor({ timeout: 90_000 });
  await composer
    .locator("[data-communication-state], [aria-label='Initial message body']")
    .first()
    .waitFor({ timeout: 60_000 })
    .catch(() => undefined);
  // The composer decides its refusal and enables Send or Resume only once its lease read (the
  // composition) answers; until then Send and Resume show disabled and no reason line shows.
  await page
    .waitForFunction(
      (name) => {
        const region = document.querySelector(`section[aria-label="${name}"]`);
        if (!region) return false;
        if (region.querySelector('[data-communication-field="refusal"]')) return true;
        return [...region.querySelectorAll("button")].some(
          (button) =>
            [
              "Send",
              "Resume reviewed sequence",
              "Check admitted send",
              "Read linked thread",
            ].includes((button.textContent ?? "").trim()) && !button.disabled,
        );
      },
      COMPOSER,
      { timeout: 45_000 },
    )
    .catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  return composer;
}

async function readComposer(ctx, page) {
  const { kit } = ctx;
  const composer = page.getByRole("region", { name: COMPOSER });
  const count = (name) => composer.getByRole("button", { name, exact: true }).count();
  const stateLine = composer.locator("[data-communication-state]").first();
  const hasState = (await stateLine.count()) > 0;
  return {
    state: hasState ? await stateLine.getAttribute("data-communication-state") : null,
    stateLine: hasState ? await kit.visibleText(stateLine) : "",
    refusals: await composer
      .locator('[data-communication-field="refusal"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const squash = (value) =>
            String(value ?? "")
              .replace(/\s+/g, " ")
              .trim();
          return {
            reason: node.getAttribute("data-refusal-reason"),
            text: squash(node.querySelector(":scope > p")?.textContent),
            lines: [
              ...node.querySelectorAll('ul[aria-label="Changed on the lease"] li'),
            ].map((item) => squash(item.textContent)),
            buttons: [...node.querySelectorAll("button")].map((item) =>
              squash(item.textContent),
            ),
            links: [...node.querySelectorAll("a")].map((item) => ({
              text: squash(item.textContent),
              href: item.getAttribute("href"),
            })),
          };
        }),
      ),
    buttons: {
      send: await count("Send"),
      schedule: await count("Schedule"),
      resume: await count("Resume reviewed sequence"),
      update: await count("Update from the lease"),
      cancel: await count("Cancel future messages"),
      pause: await count("Pause"),
      reconcile: await count("Check admitted send"),
    },
    scheduleFieldset: await composer
      .locator("fieldset")
      .filter({
        has: page.locator("legend", { hasText: "Schedule this reviewed communication" }),
      })
      .count(),
    resumeTiming: await composer
      .locator('[data-communication-field="resume-timing"]')
      .count(),
    openLease: await composer
      .getByRole("link", { name: "Open the lease", exact: true })
      .count(),
    pauseLines: (
      await composer
        .locator("p")
        .filter({ hasText: /^Paused: / })
        .allInnerTexts()
    )
      .map((line) => kit.squash(line))
      .slice(0, 3),
    statuses: (await composer.locator('p[role="status"]').allInnerTexts()).map((line) =>
      kit.squash(line),
    ),
    alerts: (await composer.locator('[role="alert"]').allInnerTexts()).map((line) =>
      kit.squash(line),
    ),
    body: await kit.visibleText(
      composer.locator('[aria-label="Initial message body"]').first(),
    ),
    dialogs: await page.getByRole("dialog").count(),
  };
}
/** No Resume, Send or Schedule, no schedule form and no resume timing (R-S272-5). */
const withheld = (view) =>
  view.buttons.send === 0 &&
  view.buttons.schedule === 0 &&
  view.buttons.resume === 0 &&
  view.scheduleFieldset === 0 &&
  view.resumeTiming === 0;
const refusalOf = (view, reason) =>
  view.refusals.find((refusal) => refusal.reason === reason) ?? null;
const summarize = (view) => ({
  state: view.state,
  stateLine: view.stateLine,
  refusals: view.refusals,
  buttons: view.buttons,
  scheduleFieldset: view.scheduleFieldset,
  resumeTiming: view.resumeTiming,
  openLease: view.openLease,
  pauseLines: view.pauseLines,
  statuses: view.statuses.slice(0, 4),
  alerts: view.alerts.slice(0, 3),
  dialogs: view.dialogs,
});

/** Click a composer control and wait for the sequences request it makes (`action`). */
async function clickFor(ctx, page, control, action, method = "POST") {
  const { kit } = ctx;
  // A read (method GET) carries no request body to match.
  const wanted = (body) => method !== "POST" || kit.sequenceAction(body) === action;
  const answer = kit
    .appResponse(page, SEQUENCES_ROUTE, { method, match: wanted, timeout: 150_000 })
    .catch(() => null);
  await control.click();
  const response = await answer;
  const body = response ? await response.json().catch(() => null) : null;
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(1000);
  return {
    status: response?.status() ?? null,
    code: body?.code ?? null,
    reason: body?.refusal?.reason ?? null,
    refusal: body?.refusal ?? null,
    error: body?.error ? String(body.error).slice(0, 600) : null,
    sequence: body?.sequence ? brief(body.sequence) : null,
  };
}
const composerButton = (page, name) =>
  page.getByRole("region", { name: COMPOSER }).getByRole("button", { name, exact: true });

// ---- The lease: the owner review and its "Other ways to send" -----------------------------------

/** Ask the owner: open the review dialog for Send (the primary) or Schedule. */
async function openOwnerDialog(ctx, page, leaseId, mode) {
  await reachPrimary(ctx, page, leaseId, "ask-owner", "Review owner message");
  const trigger =
    mode === "schedule" ? await stepScheduleButton(ctx, page) : ctx.kit.primary(page);
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: mode === "schedule" ? "Review and schedule" : "Review and send",
  });
  await dialog.locator(REVIEW_TEXT).waitFor({ timeout: 120_000 });
  return dialog;
}
const CONFIRM = { schedule: "Schedule this message", send: "Send this message" };

/** Press the dialog's confirm and wait for its sequences request; read what the dialog then says. */
async function confirmDialog(ctx, page, dialog, mode) {
  const { kit } = ctx;
  const answer = kit.appResponse(page, SEQUENCES_ROUTE, {
    match: (body) => kit.sequenceAction(body) === mode,
    timeout: 180_000,
  });
  const shown = dialog.locator(DIALOG_ERROR);
  const previous = (await shown.isVisible()) ? await ctx.kit.visibleText(shown) : null;
  await dialog.getByRole("button", { name: CONFIRM[mode], exact: true }).click();
  return readDialogAnswer(ctx, dialog, await answer.catch(() => null), previous);
}
async function readDialogAnswer(ctx, dialog, response, previous = null) {
  const { kit } = ctx;
  const body = response ? await response.json().catch(() => null) : null;
  const status = response?.status() ?? null;
  let alert = null;
  let link = null;
  if (status !== null && status >= 400) {
    const shown = dialog.locator(DIALOG_ERROR);
    if (await kit.shownWithin(shown, 20_000)) {
      // The text follows the answer; wait for it to replace an earlier refusal's.
      const deadline = Date.now() + 10_000;
      alert = await kit.visibleText(shown);
      while (previous !== null && alert === previous && Date.now() < deadline) {
        await dialog.page().waitForTimeout(500);
        alert = await kit.visibleText(shown);
      }
    }
    const anchor = dialog
      .locator('[data-renewal-field="refused-communication"] a')
      .first();
    if (await kit.shownWithin(anchor, 5_000))
      link = {
        text: kit.squash(await anchor.innerText()),
        href: await anchor.getAttribute("href"),
      };
  } else if (status === 200) {
    await dialog.waitFor({ state: "hidden", timeout: 60_000 }).catch(() => undefined);
  }
  return {
    status,
    code: body?.code ?? null,
    reason: body?.refusal?.reason ?? null,
    relatedState: body?.refusal?.relatedState ?? null,
    relatedSequenceId: body?.refusal?.relatedSequenceId ?? null,
    sequenceId: body?.sequence?.id ?? null,
    alert,
    link,
  };
}

/** "Open in Communications" in the step's "Other ways to send": the composer opens in a new tab. */
async function openComposerFromLease(ctx, page) {
  const { kit } = ctx;
  const group = page
    .locator('details[data-renewal-group="Other ways to send"]:visible')
    .first();
  if (await kit.shownWithin(group, 10_000)) await kit.openDisclosure(group);
  const link = page.locator('[data-renewal-field="composer-link"]:visible').first();
  await link.waitFor({ timeout: 30_000 });
  const opened = page.context().waitForEvent("page", { timeout: 60_000 });
  await link.click();
  const tab = await opened;
  tab.setDefaultTimeout(60_000);
  await tab.waitForLoadState("domcontentloaded").catch(() => undefined);
  await settleComposer(ctx, tab);
  return tab;
}
/** Staff edit the message body once (an untouched composer makes no record), and it saves. */
async function editBody(ctx, page, words) {
  const { kit } = ctx;
  const body = page
    .getByRole("region", { name: COMPOSER })
    .locator('[aria-label="Initial message body"]')
    .first();
  await body.waitFor({ timeout: 30_000 });
  const saved = kit.appResponse(page, SEQUENCES_ROUTE, {
    match: (request) => kit.sequenceAction(request) === "save",
    timeout: 60_000,
  });
  await body.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(words);
  const response = await saved.catch(() => null);
  await page.waitForTimeout(800);
  return response?.status() ?? null;
}

/** Compare market's Rent to recommend, read and changed as staff do. */
async function rentToRecommend(ctx, page, leaseId) {
  await ctx.kit.openLease(page, leaseId, "?step=compare-market");
  const field = page.locator(RENT_FIELD);
  await field.waitFor({ timeout: 60_000 });
  return Number(String(await field.inputValue()).replace(/[$,\s]/g, ""));
}
async function changeRentToRecommend(ctx, page, amount) {
  const { kit } = ctx;
  const field = page.locator(RENT_FIELD);
  await field.waitFor({ timeout: 60_000 });
  const saved = kit.appResponse(page, WORKING_ROUTE, {
    match: (body) => ["terms_rent", "recommended_rent"].includes(body?.field),
  });
  await field.fill(String(amount));
  await field.press("Enter");
  return (await saved).status();
}

// ---- Part 1: the held tenant offer, the legacy records and the seeded duplicates ---------------

async function tenantPart(ctx, page, start) {
  const { kit } = ctx;
  const leaseId = ctx.leases.prepared.leaseId;
  const tenants = kit.tenantAddresses(leaseId);
  const observed = start.observed;
  const out = { leaseId, start: null };
  const sequences = await kit.sequences(leaseId, "renewal_tenant");
  const heldId =
    observed?.scheduledSequenceId ??
    sequences.find((entry) => entry.state === "paused" && entry.authorization)?.id ??
    null;
  const held = sequences.find((entry) => entry.id === heldId) ?? null;
  const sentAtStart = await kit.sentTo(tenants);
  out.start = {
    error: start.error,
    held: brief(held),
    firstTick: observed?.firstTick ?? null,
    newOffer: observed?.newOffer ?? null,
    resume: observed?.resume ?? null,
    secondTick: observed?.secondTick ?? null,
    tenantMessages: sentAtStart.length,
  };
  if (!held) return out;
  const original = await kit.readDocument(`${SEQUENCES}/${held.id}`);

  // The held offer in Communications: its reason, the changed value and the controls it leaves.
  await openComposer(ctx, page, held.id);
  const heldView = await readComposer(ctx, page);
  out.heldView = summarize(heldView);

  // A record from before S272 (no kept content basis), held for changed facts: refused, no values.
  const legacyHeldId = await seedCopy(ctx, original, (fields) => {
    delete fields.authorizedContentBasis;
    delete fields.wordingSavedAfterRevision;
  });
  await openComposer(ctx, page, legacyHeldId);
  out.legacyHeldView = summarize(await readComposer(ctx, page));
  out.legacyHeldCancel = await clickFor(
    ctx,
    page,
    composerButton(page, "Cancel future messages"),
    "cancel",
  );

  // "Update from the lease", then one Send.
  await openComposer(ctx, page, held.id);
  const beforeUpdate = await sequenceById(ctx, leaseId, "renewal_tenant", held.id);
  const update = await clickFor(
    ctx,
    page,
    composerButton(page, "Update from the lease"),
    "save",
  );
  await page
    .getByRole("region", { name: COMPOSER })
    .locator('p[role="status"]', { hasText: UPDATED_STATUS })
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  const updatedView = await readComposer(ctx, page);
  const afterUpdate = await sequenceById(ctx, leaseId, "renewal_tenant", held.id);
  out.update = {
    save: update.status,
    view: summarize(updatedView),
    bodyReadsChangedEnd: updatedView.body.includes(usDate(CHANGED_TERM_END)),
    bodyReadsFirstEnd: updatedView.body.includes(usDate(FIRST_TERM_END)),
    before: brief(beforeUpdate),
    after: brief(afterUpdate),
    tenantMessages: (await kit.sentTo(tenants)).length,
  };
  const send = await clickFor(ctx, page, composerButton(page, "Send"), "send");
  const afterSend = await settle(
    () => kit.sentTo(tenants),
    (messages) => messages.length > sentAtStart.length,
  );
  const sentTick = await kit.tick();
  const afterTick = await kit.sentTo(tenants);
  const newMessages = afterTick.slice(sentAtStart.length);
  out.send = {
    status: send.status,
    error: send.error,
    dialogs: await page.getByRole("dialog").count(),
    sequence: brief(await sequenceById(ctx, leaseId, "renewal_tenant", held.id)),
    afterSend: afterSend.length - sentAtStart.length,
    tick: { sent: sentTick?.sent ?? null },
    afterTick: newMessages.length,
    readsChangedEnd: newMessages.map((message) =>
      textOf(message).includes(usDate(CHANGED_TERM_END)),
    ),
    readsFirstEnd: newMessages.map((message) =>
      textOf(message).includes(usDate(FIRST_TERM_END)),
    ),
  };

  // The seeded duplicates: the held offer as it was authorized, older than that confirmed send.
  const olderPausedId = await seedCopy(ctx, original, () => undefined);
  const olderDueId = await seedCopy(ctx, original, (fields) => {
    fields.state = text("active");
    fields.nextDueAtMs = integer(Date.now() - 1000);
    // The real active record carries null; observe writes this field before dispatch.
    fields.pause = { nullValue: null };
  });
  await openComposer(ctx, page, olderPausedId);
  out.olderPausedView = summarize(await readComposer(ctx, page));
  await openComposer(ctx, page, olderDueId);
  out.olderDueView = summarize(await readComposer(ctx, page));
  const beforeRace = (await kit.sentTo(tenants)).length;
  const attemptsBefore = mailSendAttempts(ctx);
  const occurrencesBefore = (await kit.listDocuments(OCCURRENCES)).length;
  const writesBefore = ctx.writes.length;
  const raceDue = await kit.tick(olderDueId);
  const racePaused = await kit.tick();
  out.race = {
    ticks: [tickRead(raceDue), tickRead(racePaused)],
    due: brief(await sequenceById(ctx, leaseId, "renewal_tenant", olderDueId)),
    paused: brief(await sequenceById(ctx, leaseId, "renewal_tenant", olderPausedId)),
    sentDuring: (await kit.sentTo(tenants)).length - beforeRace,
    sendAttempts: mailSendAttempts(ctx) - attemptsBefore,
    newOccurrences: (await kit.listDocuments(OCCURRENCES)).length - occurrencesBefore,
    staffWrites: ctx.writes.length - writesBefore,
    newerSendId: held.id,
  };
  await openComposer(ctx, page, olderDueId);
  out.olderDueAfterView = summarize(await readComposer(ctx, page));
  for (const [part, view] of [
    ["older paused before tick", out.olderPausedView],
    ["older due before tick", out.olderDueView],
    ["older due after tick", out.olderDueAfterView],
  ]) {
    ctx.record({
      part,
      state: view.state,
      refusals: view.refusals,
      buttons: view.buttons,
      scheduleFieldset: view.scheduleFieldset,
      resumeTiming: view.resumeTiming,
    });
  }
  ctx.record({ part: "older dispatch checks", ...out.race });
  // Communications' Outgoing list names the new cause on the stopped message's row.
  await kit.openPath(page, "/gmail-hub");
  await page.getByRole("tab", { name: "Outgoing", exact: true }).click();
  const row = page
    .getByRole("tabpanel", { name: "Outgoing", exact: true })
    .locator("article.ui-card")
    .filter({ hasText: `renewal tenant · Lease ${leaseId}` })
    .filter({
      has: page
        .getByText(`Paused: ${NEWER_LABEL}`, { exact: true })
        .and(page.locator('[data-communication-field="pause-cause"]')),
    })
    .first();
  out.rowLabel = await kit.shownWithin(row, 30_000);
  if (out.rowLabel) {
    await row.getByRole("button", { name: "Open communication", exact: true }).click();
    out.rowTarget = new URL(page.url()).searchParams.get("communication") === olderDueId;
  }
  // Cancel both, as the reason line says.
  for (const id of [olderPausedId, olderDueId]) {
    await openComposer(ctx, page, id);
    out[`cancel-${id === olderDueId ? "due" : "paused"}`] = await clickFor(
      ctx,
      page,
      composerButton(page, "Cancel future messages"),
      "cancel",
    );
  }

  ctx.record({
    part: "older worklist and cancellation",
    rowLabel: out.rowLabel,
    rowTarget: out.rowTarget ?? false,
    pausedCancel: out["cancel-paused"]?.status,
    dueCancel: out["cancel-due"]?.status,
    tenantMessages: (await kit.sentTo(tenants)).length - sentAtStart.length,
  });

  // A record from before S272 paused by staff, authorized after that send: it resumes as today.
  const legacyStaffId = await seedCopy(ctx, original, (fields) => {
    const now = Date.now();
    delete fields.authorizedContentBasis;
    delete fields.wordingSavedAfterRevision;
    fields.authorization.mapValue.fields.approvedAtMs = integer(now);
    fields.pause = {
      mapValue: {
        fields: {
          cause: text("staff"),
          byUid: fields.responsibleUid ?? text("staff"),
          atMs: integer(now),
          evidenceIds: { arrayValue: {} },
        },
      },
    };
  });
  let legacy = await openLegacyStaffResume(ctx, page, leaseId, legacyStaffId);
  ctx.record({ part: "legacy staff Resume target", ...legacy });
  if (
    !legacy.ready &&
    [...legacy.blockers, legacy.error].some((line) => NEEDS_NOTICE_REFRESH.test(line))
  ) {
    // The lease source aged while the earlier checks ran. Staff use its normal refresh before
    // reopening the same unchanged sequence; this does not replace the reviewed message.
    await kit.openLease(page, leaseId, "?step=offer-tenant");
    const refreshed = await refreshData(ctx, page);
    legacy = await openLegacyStaffResume(ctx, page, leaseId, legacyStaffId);
    ctx.record({
      part: "legacy staff Resume after source refresh",
      refreshed,
      ...legacy,
    });
  }
  out.legacyStaffView = legacy.view;
  const beforeResume = (await kit.sentTo(tenants)).length;
  if (legacy.ready) {
    const resumedAt = Date.now();
    out.legacyStaffResume = await clickFor(
      ctx,
      page,
      composerButton(page, "Resume reviewed sequence"),
      "resume",
    );
    out.legacyStaffResume.dueAtOnce =
      out.legacyStaffResume.sequence?.state === "active" &&
      Number(out.legacyStaffResume.sequence?.nextDueAtMs) <= resumedAt + 60_000;
    out.legacyStaffResume.dialogs = await page.getByRole("dialog").count();
  }
  // Nothing goes out in this check: no tick runs before it is cancelled.
  out.legacyStaffCancel = await clickFor(
    ctx,
    page,
    composerButton(page, "Cancel future messages"),
    "cancel",
  );
  out.legacyStaffSent = (await kit.sentTo(tenants)).length - beforeResume;
  out.finalTenantMessages = (await kit.sentTo(tenants)).length - sentAtStart.length;
  return out;
}

function tenantVerdicts(out) {
  const start = out.start;
  const heldView = out.heldView;
  const wording = heldView ? refusalOf(heldView, "wording_predates_change") : null;
  const startRefused =
    !start.error &&
    start.held?.state === "paused" &&
    start.held?.pause === "changed_source" &&
    Number(start.firstTick?.sent ?? 0) === 0 &&
    (start.newOffer?.offered === false || Number(start.newOffer?.status) === 409) &&
    start.resume?.offered === false &&
    Number(start.secondTick?.sent ?? 0) === 0 &&
    start.tenantMessages === 0;
  const reasonShown =
    !!wording &&
    wording.text === WORDING_TEXT &&
    wording.lines.includes(END_LINE) &&
    wording.buttons.includes("Update from the lease") &&
    heldView.buttons.cancel === 1 &&
    withheld(heldView) &&
    heldView.dialogs === 0;
  const update = out.update;
  const updateOnly =
    !!update &&
    update.save === 200 &&
    update.view.statuses.some((line) => line.startsWith(UPDATED_STATUS)) &&
    update.view.refusals.length === 0 &&
    update.view.buttons.send === 1 &&
    update.view.dialogs === 0 &&
    update.bodyReadsChangedEnd &&
    !update.bodyReadsFirstEnd &&
    update.tenantMessages === start.tenantMessages &&
    update.after?.state === "paused" &&
    update.after?.revision === update.before?.revision &&
    update.after?.approvedAtMs === update.before?.approvedAtMs;
  const send = out.send;
  const sentOnce =
    !!send &&
    send.status === 200 &&
    send.dialogs === 0 &&
    send.afterSend === 1 &&
    send.afterTick === 1 &&
    all(send.readsChangedEnd) &&
    send.readsFirstEnd.every((value) => !value);
  const legacyHeld = out.legacyHeldView;
  const legacyHeldRefusal = legacyHeld
    ? refusalOf(legacyHeld, "wording_predates_change")
    : null;
  const legacyRefusedWithoutValues =
    !!legacyHeldRefusal &&
    legacyHeldRefusal.text === WORDING_TEXT &&
    legacyHeldRefusal.lines.length === 0 &&
    withheld(legacyHeld) &&
    out.legacyHeldCancel?.status === 200;
  const legacyStaff = out.legacyStaffView;
  const legacyStaffResumes =
    !!legacyStaff &&
    legacyStaff.refusals.length === 0 &&
    legacyStaff.buttons.resume === 1 &&
    out.legacyStaffResume?.status === 200 &&
    out.legacyStaffResume?.dueAtOnce === true &&
    out.legacyStaffResume?.dialogs === 0 &&
    out.legacyStaffCancel?.status === 200 &&
    out.legacyStaffSent === 0;
  const newer = (view) => (view ? refusalOf(view, "newer_message_sent") : null);
  const newerShown = (view) => {
    const refusal = newer(view);
    return (
      !!refusal &&
      NEWER_TEXT.test(refusal.text) &&
      refusal.links.some((link) => link.text === "Open the lease") &&
      !refusal.buttons.includes("Update from the lease") &&
      view.buttons.update === 0 &&
      view.buttons.cancel === 1 &&
      view.buttons.pause === 0 &&
      withheld(view)
    );
  };
  const race = out.race;
  const olderStopped =
    newerShown(out.olderPausedView) &&
    newerShown(out.olderDueView) &&
    newerShown(out.olderDueAfterView) &&
    !!race &&
    race.ticks.every(
      (tick) =>
        tick.status === "processed" &&
        tick.inspected >= 2 &&
        tick.failures === 0 &&
        tick.sent === 0,
    ) &&
    race.ticks[0].held === 1 &&
    race.sentDuring === 0 &&
    race.sendAttempts === 0 &&
    race.newOccurrences === 0 &&
    race.staffWrites === 0 &&
    race.due?.state === "paused" &&
    race.due?.pause === "newer_message_sent" &&
    race.due?.nextDueAtMs === null &&
    race.due?.evidence.includes(`communication:${race.newerSendId}`) &&
    race.paused?.state === "paused" &&
    out.rowLabel === true &&
    out.rowTarget === true &&
    out["cancel-paused"]?.status === 200 &&
    out["cancel-due"]?.status === 200 &&
    out.finalTenantMessages === 1;
  const states =
    !!heldView &&
    PAUSED_STATE.test(heldView.stateLine) &&
    heldView.pauseLines.some((line) =>
      line.startsWith("Paused: The lease or recipient facts changed"),
    );
  return {
    startRefused,
    reasonShown,
    updateOnly,
    sentOnce,
    legacyRefusedWithoutValues,
    legacyStaffResumes,
    olderStopped,
    states,
  };
}

// ---- Part 2: the owner message, its stale tabs and Update from the lease ------------------------

async function ownerPart(ctx, page) {
  const { kit } = ctx;
  await ctx.resetState();
  const leaseId = ctx.leases.prepared.leaseId;
  const owners = kit.ownerAddresses(leaseId);
  const out = { leaseId };
  const sentBefore = (await kit.sentTo(owners)).length;

  // Two drafts for one lease and audience, each edited once: both are kept and neither blocks.
  await reachPrimary(ctx, page, leaseId, "ask-owner", "Review owner message");
  const drafts = [];
  for (let index = 0; index < 2; index += 1) {
    const tab = await openComposerFromLease(ctx, page);
    const saved = await editBody(ctx, tab, ` Draft ${index + 1}.`);
    const view = await readComposer(ctx, tab);
    drafts.push({ saved, refusals: view.refusals.length, send: view.buttons.send });
    await tab.close().catch(() => undefined);
  }
  const unauthorized = (await kit.sequences(leaseId, "renewal_owner")).filter(
    (entry) => entry.state === "draft" && !entry.authorization,
  );
  out.drafts = { tabs: drafts, kept: unauthorized.length };

  // The owner message, scheduled from the lease with those drafts present.
  const dialog = await openOwnerDialog(ctx, page, leaseId, "schedule");
  const scheduled = await confirmDialog(ctx, page, dialog, "schedule");
  out.scheduled = scheduled;
  if (scheduled.status !== 200 || !scheduled.sequenceId) return out;
  const id = scheduled.sequenceId;

  // Three Communications tabs opened while it is scheduled, as staff leave them open.
  const stale = [];
  for (let index = 0; index < 3; index += 1) {
    const tab = await ctx.newPage("Editor");
    await openComposer(ctx, tab, id);
    stale.push(tab);
  }
  const scheduledView = await readComposer(ctx, stale[0]);
  out.scheduledView = summarize(scheduledView);
  await composerButton(stale[1], "Schedule").click();
  await stale[1]
    .getByRole("button", { name: "Schedule messages", exact: true })
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);

  // Rent to recommend changes on the lease, then the worker holds the message. The value the
  // message was reviewed on is the one kept with its authorization (the field shows only a value
  // staff typed; a proposal reads as its basis).
  const kept = (
    (await sequenceById(ctx, leaseId, "renewal_owner", id))?.authorizedContentBasis
      ?.values ?? []
  ).find((input) => input.label === "Rent to recommend");
  const shownRent = await rentToRecommend(ctx, page, leaseId);
  const keptRent = Number(String(kept?.value ?? "").replace(/[$,\s]/g, ""));
  const oldRent = keptRent > 0 ? keptRent : shownRent;
  out.keptRent = { kept: kept?.value ?? null, shown: shownRent };
  const newRent = oldRent + 35;
  out.rent = { old: oldRent, new: newRent };
  out.rentSave = await changeRentToRecommend(ctx, page, newRent);
  const tick = await kit.tick(id);
  const heldRecord = await sequenceById(ctx, leaseId, "renewal_owner", id);
  out.hold = {
    tick: { sent: tick?.sent ?? null, held: tick?.held ?? null },
    record: brief(heldRecord),
  };

  // Every release action in the tabs opened before the change.
  const attempts = {};
  attempts.send = await clickFor(ctx, stale[0], composerButton(stale[0], "Send"), "send");
  attempts.send.alerts = (await readComposer(ctx, stale[0])).alerts;
  attempts.schedule = await clickFor(
    ctx,
    stale[1],
    stale[1].getByRole("button", { name: "Schedule messages", exact: true }),
    "schedule",
  );
  attempts.schedule.alerts = (await readComposer(ctx, stale[1])).alerts;
  await clickFor(
    ctx,
    stale[2],
    composerButton(stale[2], "Check recorded status"),
    null,
    "GET",
  );
  const resume = composerButton(stale[2], "Resume reviewed sequence");
  if (await kit.shownWithin(resume, 15_000)) {
    attempts.resume = await clickFor(ctx, stale[2], resume, "resume");
    attempts.resume.alerts = (await readComposer(ctx, stale[2])).alerts;
  } else
    attempts.resume = {
      offered: false,
      view: summarize(await readComposer(ctx, stale[2])),
    };
  out.attempts = attempts;
  const afterAttempts = await sequenceById(ctx, leaseId, "renewal_owner", id);
  out.afterAttempts = brief(afterAttempts);
  out.sentDuringAttempts = (await kit.sentTo(owners)).length - sentBefore;
  for (const tab of stale) await tab.close().catch(() => undefined);

  // The message read fresh: its reason and the value, then "Update from the lease" and one Send.
  await openComposer(ctx, page, id);
  out.freshView = summarize(await readComposer(ctx, page));
  const update = await clickFor(
    ctx,
    page,
    composerButton(page, "Update from the lease"),
    "save",
  );
  await page
    .getByRole("region", { name: COMPOSER })
    .locator('p[role="status"]', { hasText: UPDATED_STATUS })
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  const updatedView = await readComposer(ctx, page);
  out.update = {
    save: update.status,
    view: summarize(updatedView),
    bodyReadsNewRent: ownerRecommendationAmounts(updatedView.body).includes(
      money(newRent),
    ),
    sentAfterUpdate: (await kit.sentTo(owners)).length - sentBefore,
    record: brief(await sequenceById(ctx, leaseId, "renewal_owner", id)),
  };
  const send = await clickFor(ctx, page, composerButton(page, "Send"), "send");
  const afterSend = await settle(
    () => kit.sentTo(owners),
    (messages) => messages.length > sentBefore,
  );
  await kit.tick();
  const afterTick = await kit.sentTo(owners);
  const messages = afterTick.slice(sentBefore);
  out.send = {
    status: send.status,
    error: send.error,
    afterSend: afterSend.length - sentBefore,
    afterTick: messages.length,
    recommendations: messages.map(({ text, html }) => ({
      plain: ownerRecommendationAmounts(text),
      html: ownerRecommendationAmounts(html),
    })),
  };
  return out;
}

function ownerVerdicts(out) {
  const rent = out.rent;
  const rentLine = rent
    ? `Rent to recommend: ${money(rent.old)} in this message, ${money(rent.new)} on the lease.`
    : null;
  const namesRent = (attempt) => {
    if (!rent || !attempt) return false;
    const words = [
      attempt.error ?? "",
      ...(attempt.alerts ?? []),
      ...(attempt.refusal?.changes ?? []).map(
        (change) => `${change.label}: ${change.previous} ${change.current}`,
      ),
    ].join(" ");
    return (
      words.includes("Rent to recommend") &&
      words.includes(money(rent.old)) &&
      words.includes(money(rent.new))
    );
  };
  // A stale tab is refused before anything is written: S274's settled-read refusal answers first
  // when its review predates the change (R-S272-2 runs on that settled read); either one names
  // the value.
  const refused = (attempt) =>
    !!attempt &&
    attempt.status === 409 &&
    (attempt.code === "target_changed" ||
      (attempt.code === "sequence_refused" &&
        attempt.reason === "wording_predates_change")) &&
    namesRent(attempt);
  const attempts = out.attempts ?? {};
  const resumeRefused =
    refused(attempts.resume) ||
    (attempts.resume?.offered === false &&
      !!refusalOf(attempts.resume.view, "wording_predates_change") &&
      withheld(attempts.resume.view));
  const fresh = out.freshView;
  const freshRefusal = fresh ? refusalOf(fresh, "wording_predates_change") : null;
  const update = out.update;
  const send = out.send;
  return {
    drafts:
      !!out.drafts &&
      out.drafts.tabs.length === 2 &&
      out.drafts.tabs.every(
        (tab) => tab.saved === 200 && tab.refusals === 0 && tab.send === 1,
      ) &&
      out.drafts.kept >= 2 &&
      out.scheduled?.status === 200,
    scheduledState:
      !!out.scheduledView &&
      SCHEDULED_STATE.test(out.scheduledView.stateLine) &&
      out.scheduledView.refusals.length === 0 &&
      out.scheduledView.buttons.send === 1 &&
      out.scheduledView.buttons.schedule === 1 &&
      out.scheduledView.buttons.pause === 1 &&
      out.scheduledView.buttons.cancel === 1 &&
      out.scheduledView.dialogs === 0,
    held:
      out.rentSave === 200 &&
      out.hold?.record?.state === "paused" &&
      out.hold?.record?.pause === "changed_source",
    refusedEverywhere:
      refused(attempts.send) &&
      refused(attempts.schedule) &&
      resumeRefused &&
      out.sentDuringAttempts === 0 &&
      out.afterAttempts?.state === "paused" &&
      out.afterAttempts?.revision === out.hold?.record?.revision &&
      out.afterAttempts?.approvedAtMs === out.hold?.record?.approvedAtMs,
    reasonShown:
      !!freshRefusal &&
      freshRefusal.text === WORDING_TEXT &&
      freshRefusal.lines.includes(rentLine) &&
      withheld(fresh) &&
      fresh.dialogs === 0,
    updateOnly:
      !!update &&
      update.save === 200 &&
      update.view.statuses.some((line) => line.startsWith(UPDATED_STATUS)) &&
      update.view.refusals.length === 0 &&
      update.bodyReadsNewRent &&
      update.sentAfterUpdate === 0 &&
      update.record?.state === "paused",
    sentOnce:
      !!send &&
      send.status === 200 &&
      send.afterSend === 1 &&
      send.afterTick === 1 &&
      all(
        send.recommendations.map(({ plain, html }) =>
          [plain, html].every(
            (amounts) => amounts.length === 1 && amounts[0] === money(rent.new),
          ),
        ),
      ),
  };
}

// ---- Part 3: one unsent message per lease, cycle and audience (the owner review in three tabs) ---

async function duplicatePart(ctx, page) {
  const { kit, rehearsal } = ctx;
  await ctx.resetState();
  const leaseId = ctx.leases.prepared.leaseId;
  const owners = kit.ownerAddresses(leaseId);
  const out = { leaseId };
  const sentBefore = (await kit.sentTo(owners)).length;
  const second = await ctx.newPage("Editor");
  const third = await ctx.newPage("Editor");
  const tabs = [
    { page, dialog: await openOwnerDialog(ctx, page, leaseId, "schedule") },
    { page: second, dialog: await openOwnerDialog(ctx, second, leaseId, "schedule") },
  ];
  const sendDialog = await openOwnerDialog(ctx, third, leaseId, "send");

  // Two confirmations at the same moment.
  const answers = tabs.map((tab) =>
    kit.appResponse(tab.page, SEQUENCES_ROUTE, {
      match: (body) => kit.sequenceAction(body) === "schedule",
      timeout: 180_000,
    }),
  );
  await Promise.all(
    tabs.map((tab) =>
      tab.dialog.getByRole("button", { name: CONFIRM.schedule, exact: true }).click(),
    ),
  );
  const raced = [];
  for (const [index, tab] of tabs.entries())
    raced.push(
      await readDialogAnswer(ctx, tab.dialog, await answers[index].catch(() => null)),
    );
  out.race = raced;
  const winner = raced.findIndex((answer) => answer.status === 200);
  const loser = raced.findIndex((answer) => answer.status !== 200);
  out.authorizedAfterRace = (await kit.sequences(leaseId, "renewal_owner")).filter(
    (entry) => entry.authorization,
  ).length;
  if (winner < 0 || loser < 0) return out;
  const firstId = raced[winner].sequenceId;
  const refused = tabs[loser];

  // The refused tab tries again while the first is scheduled.
  out.whileScheduled = await confirmDialog(ctx, refused.page, refused.dialog, "schedule");
  // Staff open that communication from the link, in a new tab, and pause it.
  const helper = await ctx.newPage("Editor");
  const href = out.whileScheduled.link?.href ?? raced[loser].link?.href ?? null;
  out.linkHref = href;
  if (href) {
    await kit.openPath(helper, href);
    await settleComposer(ctx, helper);
  } else await openComposer(ctx, helper, firstId);
  out.firstView = summarize(await readComposer(ctx, helper));
  out.pause = await clickFor(ctx, helper, composerButton(helper, "Pause"), "pause");
  out.whilePaused = await confirmDialog(ctx, refused.page, refused.dialog, "schedule");
  // After it is cancelled, the second one confirms.
  out.cancel = await clickFor(
    ctx,
    helper,
    composerButton(helper, "Cancel future messages"),
    "cancel",
  );
  out.afterCancel = await confirmDialog(ctx, refused.page, refused.dialog, "schedule");
  const secondId = out.afterCancel.sequenceId;
  if (out.afterCancel.status !== 200 || !secondId) return out;

  // The second message: paused by staff and resumed with nothing changed, it is due at once.
  await openComposer(ctx, helper, secondId);
  out.secondPause = await clickFor(ctx, helper, composerButton(helper, "Pause"), "pause");
  const resumedAt = Date.now();
  out.secondResume = await clickFor(
    ctx,
    helper,
    composerButton(helper, "Resume reviewed sequence"),
    "resume",
  );
  out.secondResume.dialogs = await helper.getByRole("dialog").count();
  out.secondResume.dueAtOnce =
    out.secondResume.sequence?.state === "active" &&
    Number(out.secondResume.sequence?.nextDueAtMs) <= resumedAt + 60_000;
  // Its send is left unconfirmed by the stand-in; a tick with no message made due sends it.
  await setNextSend(rehearsal, "unconfirmed");
  const tick = await kit.tick();
  out.unconfirmedTick = { sent: tick?.sent ?? null };
  out.unconfirmedRecord = brief(
    await sequenceById(ctx, leaseId, "renewal_owner", secondId),
  );
  out.whileUnconfirmed = await confirmDialog(ctx, third, sendDialog, "send");
  // Staff check the admitted send; it is confirmed and nothing goes out twice.
  await openComposer(ctx, helper, secondId);
  out.reconcile = await clickFor(
    ctx,
    helper,
    composerButton(helper, "Check admitted send"),
    "reconcile",
  );
  const settled = await settle(
    () => sequenceById(ctx, leaseId, "renewal_owner", secondId),
    (record) =>
      Number(record?.confirmedCount ?? 0) >= 1 && !record?.unresolvedOccurrenceId,
  );
  out.reconciled = brief(settled);
  await kit.tick();
  const messages = (await kit.sentTo(owners)).slice(sentBefore);
  out.ownerMessages = messages.length;
  out.authorizedAtEnd = (await kit.sequences(leaseId, "renewal_owner"))
    .filter((entry) => entry.authorization)
    .map((entry) => ({ id: entry.id, state: entry.state }));
  out.ids = { first: firstId, second: secondId };

  // The owner replies; staff answer from Communications. A reply is not an initial message.
  const thread = messages.at(-1)?.threadId ?? null;
  await deliverOwnerReply(rehearsal, {
    to: owners[0],
    ...(thread ? { threadId: thread } : {}),
    text: "Synthetic owner reply: please send the offer at the recommended rent.",
  });
  await kit.tick();
  // "Read linked thread" in the communication's history shows the reply with its reply link.
  await openComposer(ctx, helper, secondId);
  const readThread = helper.getByRole("button", {
    name: "Read linked thread",
    exact: true,
  });
  if (await kit.shownWithin(readThread.first(), 30_000)) await readThread.first().click();
  const replyLink = helper
    .getByRole("region", { name: "Linked incoming history" })
    .locator("article")
    .filter({ hasText: "Human response" })
    .getByRole("link", { name: "Reply in Communications", exact: true })
    .first();
  if (await kit.shownWithin(replyLink, 30_000)) {
    const replyHref = await replyLink.getAttribute("href");
    const replyTab = await ctx.newPage("Editor");
    await kit.openPath(replyTab, replyHref);
    await settleComposer(ctx, replyTab);
    out.replySaved = await editBody(ctx, replyTab, "Thank you. We will send the offer.");
    const replyView = await readComposer(ctx, replyTab);
    out.replyView = summarize(replyView);
    const before = (await kit.sentTo(owners)).length;
    out.replySend = await clickFor(
      ctx,
      replyTab,
      composerButton(replyTab, "Send"),
      "send",
    );
    const after = await settle(
      () => kit.sentTo(owners),
      (list) => list.length > before,
    );
    out.replySent = after.length - before;
    out.replyThread = thread !== null && after.at(-1)?.threadId === thread;
  } else out.replyLink = false;
  return out;
}

function duplicateVerdicts(out) {
  const race = out.race ?? [];
  const won = race.filter((answer) => answer.status === 200);
  const lost = race.filter((answer) => answer.status !== 200);
  const firstId = out.ids?.first ?? won[0]?.sequenceId ?? null;
  const namesFirst = (answer) =>
    answer?.relatedSequenceId === firstId &&
    answer?.link?.text === "Open that communication" &&
    String(answer?.link?.href ?? "").endsWith(
      `communication=${encodeURIComponent(firstId)}`,
    );
  const unsent = (answer, state, matches) =>
    !!answer &&
    answer.status === 409 &&
    answer.code === "sequence_refused" &&
    answer.reason === "unsent_message_exists" &&
    answer.relatedState === state &&
    matches(answer.alert ?? "");
  const secondId = out.ids?.second ?? null;
  return {
    concurrent:
      race.length === 2 &&
      won.length === 1 &&
      lost.length === 1 &&
      lost[0].code === "sequence_refused" &&
      lost[0].reason === "unsent_message_exists" &&
      out.authorizedAfterRace === 1,
    scheduled:
      unsent(out.whileScheduled, "scheduled", (alert) => OWNER_SCHEDULED.test(alert)) &&
      namesFirst(out.whileScheduled),
    paused:
      out.pause?.status === 200 &&
      unsent(out.whilePaused, "paused", (alert) => OWNER_PAUSED.test(alert)) &&
      namesFirst(out.whilePaused),
    cancelThenConfirm: out.cancel?.status === 200 && out.afterCancel?.status === 200,
    unconfirmed:
      out.unconfirmedRecord?.unresolved === true &&
      unsent(
        out.whileUnconfirmed,
        "unconfirmed",
        (alert) => alert === OWNER_UNCONFIRMED,
      ) &&
      out.whileUnconfirmed?.relatedSequenceId === secondId,
    oneMessage:
      out.reconcile?.status === 200 &&
      Number(out.reconciled?.confirmed) === 1 &&
      out.ownerMessages === 1 &&
      (out.authorizedAtEnd ?? []).filter((entry) => !["cancelled"].includes(entry.state))
        .length === 1,
    pauseResumeOnce:
      out.secondPause?.status === 200 &&
      out.secondResume?.status === 200 &&
      out.secondResume?.dialogs === 0 &&
      out.secondResume?.dueAtOnce === true &&
      out.ownerMessages === 1,
    scheduledState:
      !!out.firstView &&
      SCHEDULED_STATE.test(out.firstView.stateLine) &&
      out.firstView.refusals.length === 0 &&
      out.firstView.buttons.send === 1,
    reply:
      out.replySaved === 200 &&
      !!out.replyView &&
      out.replyView.refusals.length === 0 &&
      out.replySend?.status === 200 &&
      out.replySent === 1 &&
      out.replyThread === true,
  };
}

// ---- The checks -----------------------------------------------------------------------------------

/**
 * W12-01 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1201 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S272-1 to AC-S272-6 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1201(ctx, page, start) {
  const parts = developmentParts();
  const runs = (part) => !parts || parts.has(part);
  const verdicts = {};
  const failure = (part, error) => {
    ctx.record({ part, error: String(error?.stack ?? error).slice(0, 1500) });
    return null;
  };
  let tenant = null;
  let owner = null;
  let duplicate = null;
  if (runs("tenant")) {
    const out = await tenantPart(ctx, page, start).catch((error) =>
      failure("tenant", error),
    );
    ctx.record({ part: "tenant", out });
    tenant = out ? tenantVerdicts(out) : null;
    ctx.record({ part: "tenant verdicts", tenant });
  }
  if (runs("owner")) {
    const out = await ownerPart(ctx, page).catch((error) => failure("owner", error));
    ctx.record({ part: "owner", out });
    owner = out ? ownerVerdicts(out) : null;
    ctx.record({ part: "owner verdicts", owner });
  }
  if (runs("duplicate")) {
    const out = await duplicatePart(ctx, page).catch((error) =>
      failure("duplicate", error),
    );
    ctx.record({ part: "duplicate", out });
    // A send this part left unconfirmed and never settled is an effect whose outcome is unknown.
    if (
      out &&
      out.unconfirmedRecord?.unresolved &&
      !(Number(out.reconciled?.confirmed) >= 1)
    )
      ctx.unresolved("W12-01 owner send left unconfirmed");
    duplicate = out ? duplicateVerdicts(out) : null;
    ctx.record({ part: "duplicate verdicts", duplicate });
  }
  const pass = (value) => value === true;
  const tenantRan = runs("tenant");
  const ownerRan = runs("owner");
  const duplicateRan = runs("duplicate");
  // AC-S272-1: a changed content value refuses the unchanged wording on every release action, named,
  // with nothing dispatched, for a tenant offer and an owner message; Update then sends it once.
  if (tenantRan && ownerRan)
    verdicts["AC-S272-1"] =
      !!tenant &&
      !!owner &&
      [
        tenant.startRefused,
        tenant.reasonShown,
        tenant.updateOnly,
        tenant.sentOnce,
        owner.held,
        owner.refusedEverywhere,
        owner.reasonShown,
        owner.updateOnly,
        owner.sentOnce,
      ].every(pass);
  // AC-S272-2: one unsent initial message per lease, cycle and audience.
  if (duplicateRan)
    verdicts["AC-S272-2"] =
      !!duplicate &&
      [
        duplicate.concurrent,
        duplicate.scheduled,
        duplicate.paused,
        duplicate.unconfirmed,
        duplicate.cancelThenConfirm,
        duplicate.oneMessage,
      ].every(pass);
  // AC-S272-3: an older authorization after a newer confirmed send never dispatches.
  if (tenantRan) verdicts["AC-S272-3"] = !!tenant && pass(tenant.olderStopped);
  // AC-S272-4: a staff pause and Resume with unchanged facts sends once.
  if (duplicateRan)
    verdicts["AC-S272-4"] =
      !!duplicate && [duplicate.pauseResumeOnce, duplicate.oneMessage].every(pass);
  // AC-S272-5: the controls, the reason lines and the times with their zone, with no dialog.
  if (tenantRan && ownerRan && duplicateRan)
    verdicts["AC-S272-5"] =
      !!tenant &&
      !!owner &&
      !!duplicate &&
      [
        tenant.states,
        tenant.reasonShown,
        tenant.updateOnly,
        tenant.olderStopped,
        owner.scheduledState,
        owner.reasonShown,
        duplicate.scheduledState,
      ].every(pass);
  // AC-S272-6: no kept content basis, a reply and two drafts.
  if (tenantRan && ownerRan && duplicateRan)
    verdicts["AC-S272-6"] =
      !!tenant &&
      !!owner &&
      !!duplicate &&
      [
        tenant.legacyRefusedWithoutValues,
        tenant.legacyStaffResumes,
        owner.drafts,
        duplicate.reply,
      ].every(pass);
  ctx.record({ candidateChecks: verdicts });
  return Object.fromEntries(
    CHECKS.filter((id) => id in verdicts).map((id) => [id, verdicts[id]]),
  );
}
