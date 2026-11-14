// S284 W12-05, "Record the tenant's answer": the candidate-side acceptance checks of S276 (intake
// 154) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-tenant-response-review-and-reminder-stop.md (S276).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S276-1, AC-S276-2, AC-S276-3, AC-S276-4, AC-S276-5, AC-S276-6, AC-S276-7
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Choose a response without saving, then save. With follow-ups authorized, confirm the next
//   tick sends none. Fail the pause write and make a reminder due. Tick the follow-up option and
//   read the filled form, then confirm an edited interval.
//
// Starting sequence (journeyW1205 in one-path-november-12-journeys.mjs, the fail-first table):
//   Choose "Accepted" with follow-ups authorized, then tick at the next due time. On the
//   baseline: Saved on selection; the reminder is sent. Adapted for the candidate (R-S276-1): where
//   choosing no longer saves, the journey reads the review and chooses its one Save, so both builds
//   reach the same recorded "Accepted" before the tick. Nothing else in it changed.
//
// How each check is reached, through what staff can do (R-S284-2):
//   - Every response is chosen, saved, cancelled or left on the lease's own Tenant response form,
//     in Full view (the starting sequence, the decline, the write fault) and in Guided view on the
//     Offer the tenant step (Cancel, leaving, the clear and the change request).
//   - Each tenant offer is sent from its own review ("Review tenant offer"), follow-ups ticked and
//     filled as staff fill them, after the owner message, the owner's answer and the dates.
//   - Time passes only through the worker tick (kit.tick makes the named message due first).
//   - Outside parties act through the stand-in hooks: the tenant's reply (deliverOwnerReply, which
//     replies from the sent message's recipient), the one-shot synthetic send hold, and the
//     one-shot refusal of the server's next reminder-pause write (setTenantResponsePauseFault,
//     the "pause write failure" AC-S276-3 injects).
//   - An Admin saves the follow-up interval on Admin > Renewal notice rules.
//   - An Approver uses "Publish the standard follow-up message" in the tenant message editor.
// Nothing here posts an app route; the kit waits for the requests staff clicks make.
// Reads are pages, GET routes, the rehearsal's emulator, the stand-ins' state and logs.
//
// Development iteration only: --w1205-parts start,guided,change,decline,fault,race,form,published
// runs those parts; a check whose parts did not all run is left out (not recorded), so such a run
// never reads Yes.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import {
  deliverOwnerReply,
  holdNextMailSend,
  releaseHeldMailSend,
  setTenantResponsePauseFault,
  standInState,
  tenantResponsePauseFault,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import {
  FIRST_TERM_END,
  prepareTenantOffer,
  reachPrimary,
  sendTenantOffer,
} from "./one-path-november-12-journeys.mjs";
import { plainValue } from "./one-path-november-10-kit.mjs";
import {
  DESK,
  PREPARATION_ROUTE,
  SEQUENCES_ROUTE,
  WORKING_ROUTE,
  WORKSPACE_ROUTE,
} from "./one-path-november-12-kit.mjs";

const CHECKS = [
  "AC-S276-1",
  "AC-S276-2",
  "AC-S276-3",
  "AC-S276-4",
  "AC-S276-5",
  "AC-S276-6",
  "AC-S276-7",
];
/** The parts, in run order, and the checks each one feeds. */
const PARTS = Object.freeze({
  start: ["AC-S276-1", "AC-S276-2", "AC-S276-6"],
  guided: ["AC-S276-1", "AC-S276-4", "AC-S276-5"],
  change: ["AC-S276-1", "AC-S276-2", "AC-S276-4", "AC-S276-5"],
  decline: ["AC-S276-2"],
  fault: ["AC-S276-3"],
  race: ["AC-S276-3"],
  form: ["AC-S276-4", "AC-S276-6", "AC-S276-7"],
  published: ["AC-S276-6", "AC-S276-7"],
});

/** The local demo Editor every staff step here signs in as (lib/auth/session.ts). */
const EDITOR_UID = "local-demo-editor";
const CAUSE = "tenant_response_recorded";
const PAUSED_LINE = "Paused: The tenant's response was recorded by staff";
const PAUSED_CHANGED = "The lease or recipient facts changed";
const STOPPED_LINE =
  "Reminders for this offer are stopped. To send them again, resume them in Communications.";
const STILL_SCHEDULED = "Reminders are still scheduled.";
const STAY_STOPPED =
  "Reminders that were stopped stay stopped until you resume them in Communications.";
const REMINDERS_STOP = "Reminders for this offer stop.";
const UNPUBLISHED_NOTE =
  "The standard follow-up message is not published yet. Write the follow-up, or ask a template approver to publish it.";
const MISSING_BOUND =
  "Enter the complete message, recurrence and at least one stopping bound.";
const FOLLOW_UP_CLOSING =
  "Please let us know whether you plan to stay or leave, and we'll get the documents out if you plan to stay.";
const SIGNOFF = "Kindest Regards,";
/** R-S276-7: the one line under the legend, as staff read it. */
const startLine = (days, published) =>
  `Filled in to start: every ${days} days at 9:00 AM Central, 3 messages in total${published ? ", and the standard follow-up message" : ""}. Change anything before you review.`;
const FOLLOW_UP_TEMPLATE = "Renewal tenant follow-up, standard v1.0";
const TENANT_OFFER_TEMPLATE = /^Renewal tenant .*supplied/;
const DIALOG_SEND = "Review and send";
const REVIEW_TEXT = '[data-renewal-field="exact-review"]';
const FORM = "#renewal-manual-tenant_response";
const OCCURRENCES = "gmail_communication_occurrences";
const LABELS = Object.freeze({
  awaiting_response: "Awaiting response",
  accepted: "Accepted",
  counter_change_requested: "Counter / change requested",
  declined_nonrenewing: "Declined / not renewing",
});
/** The terms sentence every tenant offer states, as the follow-up repeats it (R-S276-8). */
const TERMS_SENTENCE =
  /Rent: \$[\d,]+(?:\.\d\d)? per month, effective \d\d\/\d\d\/\d{4}\. Renewal term: \d\d\/\d\d\/\d{4} through \d\d\/\d\d\/\d{4}\./;

const usDate = (iso) =>
  iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : "";
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const sha = (text) =>
  createHash("sha256")
    .update(String(text ?? ""))
    .digest("hex");
const count = (text, part) => (part ? String(text).split(part).length - 1 : 0);
const centralToday = (days = 0) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Chicago" }).format(
    Date.now() + days * 86_400_000,
  );

function developmentParts() {
  const index = process.argv.indexOf("--w1205-parts");
  if (index < 0) return null;
  return new Set(
    String(process.argv[index + 1] ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

// ---- Reads: the emulator, the stand-ins and their logs, GET routes ---------------------------

async function tenantSequence(ctx, leaseId, sequenceId) {
  const all = await ctx.kit.sequences(leaseId, "renewal_tenant");
  return sequenceId ? (all.find((entry) => entry.id === sequenceId) ?? null) : all.at(-1);
}
const sequenceStates = async (ctx, leaseId) =>
  (await ctx.kit.sequences(leaseId)).map((entry) => `${entry.id}:${entry.state}`).sort();

async function occurrencesOf(ctx, sequenceId) {
  const documents = await ctx.kit.listDocuments(OCCURRENCES);
  return documents
    .map((document) =>
      Object.fromEntries(
        Object.entries(document.fields ?? {}).map(([key, value]) => [
          key,
          plainValue(value),
        ]),
      ),
    )
    .filter((occurrence) => occurrence.sequenceId === sequenceId)
    .sort((a, b) => Number(a.claimedAtMs ?? 0) - Number(b.claimedAtMs ?? 0));
}

async function workspaceState(ctx, page, leaseId) {
  const body = await ctx.kit.read(page, `${WORKSPACE_ROUTE}?leaseId=${leaseId}`);
  return body?.state ?? null;
}

/** The working record and its activity, as a comparable value (what a source change moves). */
async function workingFields(ctx, page, leaseId) {
  const read = await ctx.kit
    .readStatus(page, `${WORKING_ROUTE}?leaseId=${leaseId}`)
    .catch(() => null);
  return JSON.stringify(
    read?.status === 200 ? read.body : { status: read?.status ?? null },
  );
}

function jsonLines(file) {
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
/** Every mailbox call the app made of the mail stand-in, with when. */
const mailCalls = (ctx) =>
  jsonLines(ctx.rehearsal.files.standInLog).filter(
    (entry) => entry.standIn === "mail" && entry.method,
  );
const mailSends = (ctx) =>
  mailCalls(ctx).filter(
    (entry) => entry.method === "POST" && /\/messages\/send$/.test(String(entry.path)),
  );
/** The server's provider boundary log: RentVine and Sheets reads, refusals, comparisons. */
const boundaryLog = (ctx) => jsonLines(ctx.rehearsal.files.networkLog);

const tenantMail = (ctx, leaseId) => ctx.kit.sentTo(ctx.kit.tenantAddresses(leaseId));

const tickCounts = (tick) => ({
  sent: Number(tick?.sent ?? 0),
  held: Number(tick?.held ?? 0),
  paused: Number(tick?.paused ?? 0),
  failures: Number(tick?.failures ?? 0),
});

/** The templates of the renewals Space, as the emulator holds them. */
async function templates(ctx) {
  const documents = await ctx.kit.listDocuments("templates");
  const read = (pattern) => {
    const found = documents
      .map((document) => ({
        updateTime: document.updateTime ?? null,
        ...Object.fromEntries(
          Object.entries(document.fields ?? {}).map(([key, value]) => [
            key,
            plainValue(value),
          ]),
        ),
      }))
      .filter((record) =>
        typeof pattern === "string"
          ? record.name === pattern
          : pattern.test(String(record.name)),
      );
    return {
      count: found.length,
      status: found[0]?.status ?? null,
      bodyHash: found[0] ? sha(found[0].body) : null,
      updateTime: found[0]?.updateTime ?? null,
    };
  };
  return { tenantOffer: read(TENANT_OFFER_TEMPLATE), followUp: read(FOLLOW_UP_TEMPLATE) };
}

/** The Communications card of the lease's tenant message, as staff read it on Outgoing. */
async function communicationsCard(ctx, page, leaseId) {
  const { kit } = ctx;
  await kit.openPath(page, "/gmail-hub");
  await page.getByRole("tab", { name: "Outgoing", exact: true }).click();
  const card = page
    .locator('[role="tabpanel"] article.ui-card')
    .filter({ hasText: `renewal tenant · Lease ${leaseId}` })
    .first();
  return (await kit.shownWithin(card, 60_000)) ? kit.visibleText(card) : "";
}

// ---- Staff steps ---------------------------------------------------------------------------------

/**
 * Communications, Outgoing: open the lease's paused tenant message and, when it is offered and
 * enabled, choose "Resume reviewed sequence" (the staff click; the kit waits for its request).
 */
async function resumeInCommunications(ctx, page, leaseId) {
  const { kit } = ctx;
  await kit.openPath(page, "/gmail-hub");
  await page.getByRole("tab", { name: "Outgoing", exact: true }).click();
  const card = page
    .locator('[role="tabpanel"] article.ui-card')
    .filter({ hasText: `renewal tenant · Lease ${leaseId}` })
    .filter({ hasText: "Paused:" })
    .first();
  if (!(await kit.shownWithin(card, 60_000))) return { shown: false };
  const cardText = await kit.visibleText(card);
  // The saved communication can render before the separate current-target read completes.
  const composition = page
    .waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "GET" &&
          url.pathname === "/api/gmail-hub/composition" &&
          url.searchParams.get("purpose") === "renewal_tenant" &&
          url.searchParams.get("lease") === String(leaseId)
        );
      },
      { timeout: 60_000 },
    )
    .catch(() => null);
  await card.getByRole("button", { name: "Open communication", exact: true }).click();
  const composer = page.getByRole("region", { name: "Workflow communication composer" });
  await composer.waitFor({ timeout: 60_000 });
  const resume = composer.getByRole("button", {
    name: "Resume reviewed sequence",
    exact: true,
  });
  const currentTarget = await composition;
  const compositionStatus = currentTarget?.status() ?? null;
  if (!(await kit.shownWithin(resume, 60_000)))
    return { shown: true, cardText, offered: false, compositionStatus };
  if (
    !currentTarget?.ok() ||
    !(await kit.shownWithin(resume.and(composer.locator("button:enabled")), 30_000))
  )
    return {
      shown: true,
      cardText,
      offered: true,
      enabled: false,
      compositionStatus,
      statuses: await composer.getByRole("status").allInnerTexts(),
    };
  const answer = kit.appResponse(page, SEQUENCES_ROUTE, {
    match: (body) => kit.sequenceAction(body) === "resume",
  });
  await resume.click();
  const response = await answer.catch(() => null);
  const body = response ? await response.json().catch(() => null) : null;
  return {
    shown: true,
    cardText,
    offered: true,
    enabled: true,
    compositionStatus,
    status: response?.status() ?? null,
    state: body?.sequence?.state ?? null,
  };
}

/** A step log the journeys' helpers write to, kept in the private notes. */
function partLog(ctx, part) {
  return {
    add(label, detail = {}) {
      ctx.record({ part, step: label, ...detail });
    },
  };
}

/** The follow-up values the starting sequence's sender fills, as staff type them. */
function journeyFollowUps(days = 7) {
  return {
    subject: "Following up on your renewal offer",
    body: "This is a synthetic rehearsal follow-up about the renewal offer we sent.",
    everyDays: days,
    time: "09:00",
    endDate: centralToday(60),
    sendLimit: 3,
  };
}

/** Owner message, owner answer, dates and the tenant offer sent with follow-ups. */
async function sendOfferWithFollowUps(ctx, page, leaseId, part) {
  const log = partLog(ctx, part);
  await prepareTenantOffer(ctx, page, leaseId, log, { end: FIRST_TERM_END });
  const offer = await sendTenantOffer(ctx, page, leaseId, {
    followUps: journeyFollowUps(),
  });
  log.add("tenant offer sent with follow-ups", { status: offer.status });
  if (offer.status !== 200)
    throw new Error(`The tenant offer was not sent: ${offer.alert ?? offer.error}`);
  const sequenceId =
    offer.sequenceId ?? (await tenantSequence(ctx, leaseId, null))?.id ?? null;
  if (!sequenceId) throw new Error("The sent tenant offer has no communication record.");
  return sequenceId;
}

/** The Tenant response form, opened as staff open it in Full view or on Guided's step. */
async function openTenantForm(ctx, page, leaseId, view) {
  const { kit } = ctx;
  await kit.openLease(
    page,
    leaseId,
    view === "full" ? `?view=full#renewal-manual-tenant_response` : "?step=offer-tenant",
  );
  const form = page.locator(FORM);
  if (!(await kit.shownWithin(form, 20_000))) await kit.reveal(page, FORM);
  const select = form.getByLabel("Tenant response", { exact: true });
  await select.waitFor({ timeout: 30_000 });
  const fullView = await page
    .locator("[data-renewal-full-toggle]")
    .first()
    .getAttribute("aria-pressed")
    .catch(() => null);
  return { form, select, fullView: fullView === "true" };
}

const reviewRegion = (form) =>
  form.getByRole("region", { name: "Review the tenant's response", exact: true });

/** The review's three lines, as staff read them. */
async function reviewLines(ctx, form) {
  const region = reviewRegion(form);
  if (!(await ctx.kit.shownWithin(region, 15_000))) return null;
  const line = (key) =>
    ctx.kit.visibleText(region.locator(`[data-tenant-response-review="${key}"]`));
  return {
    response: await line("response"),
    answers: await line("answers"),
    follows: await line("follows"),
  };
}

const responseWrites = (ctx) =>
  ctx.writes.filter(
    (write) => write.path === WORKSPACE_ROUTE && write.kind === "tenant_response",
  ).length;

/**
 * Save the chosen response with the review's one Save and measure what the save did around it:
 * the request count, every mailbox call and send, the provider boundary's entries, the lease's
 * messages and the working record.
 */
async function saveResponse(ctx, page, form, leaseId) {
  const { kit } = ctx;
  const before = {
    writes: responseWrites(ctx),
    tenantMail: (await tenantMail(ctx, leaseId)).length,
    sequences: await sequenceStates(ctx, leaseId),
    working: await workingFields(ctx, page, leaseId),
    refused: kit.refusedCount(),
  };
  const answer = kit.appResponse(page, WORKSPACE_ROUTE, {
    match: (body) => body?.action?.kind === "tenant_response",
  });
  const clickedAt = Date.now();
  await reviewRegion(form).getByRole("button", { name: "Save", exact: true }).click();
  const response = await answer;
  const body = await response.json().catch(() => null);
  const answeredAt = Date.now();
  // Let anything the save started settle before reading the logs.
  await page.waitForTimeout(1500);
  // The save request's own lifetime: from the click to its answer.
  const during = (entry) => {
    const at = Date.parse(entry.at);
    return at >= clickedAt && at <= answeredAt;
  };
  const window = {
    calls: mailCalls(ctx).filter(during),
    boundary: boundaryLog(ctx).filter(during),
  };
  const after = {
    writes: responseWrites(ctx),
    tenantMail: (await tenantMail(ctx, leaseId)).length,
    sequences: await sequenceStates(ctx, leaseId),
    working: await workingFields(ctx, page, leaseId),
    refused: kit.refusedCount(),
  };
  const cancelledBefore = before.sequences.filter((entry) =>
    entry.endsWith(":cancelled"),
  );
  const cancelledAfter = after.sequences.filter((entry) => entry.endsWith(":cancelled"));
  return {
    status: response.status(),
    reminders: body?.tenantReminders ?? null,
    clickedAt,
    answeredAt,
    requests: after.writes - before.writes,
    gmailCalls: window.calls.length,
    gmailCallPaths: window.calls.map((entry) => `${entry.method} ${entry.path}`),
    sentNothing: after.tenantMail === before.tenantMail,
    cancelledNothing:
      cancelledAfter.length === cancelledBefore.length &&
      after.sequences.length === before.sequences.length,
    // No RentVine or Sheet write, no Sheet read or billed comparison, no refused connection.
    sourceUnchanged:
      after.working === before.working &&
      after.refused === before.refused &&
      !window.boundary.some(
        (entry) =>
          entry.refused ||
          entry.served === "google" ||
          entry.served === "rentcast_stand_in",
      ),
    boundaryEntries: window.boundary.map(
      (entry) => entry.refused ?? entry.served ?? entry.event,
    ),
  };
}

/** Choose a response (nothing is saved) and read the review it shows. */
async function chooseResponse(ctx, page, select, form, value) {
  const writes = responseWrites(ctx);
  await select.selectOption(value);
  const lines = await reviewLines(ctx, form);
  await page.waitForTimeout(2500);
  return { lines, savedOnChoice: responseWrites(ctx) - writes };
}

/** What the form shows after a save: the stopped line, or the alert and its "Stop them". */
async function remindersLine(ctx, form) {
  const { kit } = ctx;
  const stopped = form.locator('[data-renewal-field="tenant-reminders-stopped"]');
  const scheduled = form.locator('[data-renewal-field="tenant-reminders-scheduled"]');
  return {
    stopped: (await kit.shownWithin(stopped, 5_000))
      ? await kit.visibleText(stopped)
      : "",
    scheduled: (await kit.shownWithin(scheduled, 2_000))
      ? await kit.visibleText(scheduled)
      : "",
    stopThem: await scheduled
      .getByRole("button", { name: "Stop them", exact: true })
      .isVisible()
      .catch(() => false),
  };
}

/** The pause a response wrote: its cause, the saving Editor, and the evidence of the response. */
function pausedForResponse(sequence, response) {
  return (
    sequence?.state === "paused" &&
    sequence?.pause?.cause === CAUSE &&
    sequence?.pause?.byUid === EDITOR_UID &&
    response?.actorUid === EDITOR_UID &&
    (sequence?.pause?.evidenceIds ?? []).includes(
      `renewal-tenant-response:${response?.eventId}`,
    )
  );
}

/** "Answers: ..." as the review states the sent offer's snapshot (R-S276-1), built here. */
function expectedAnswers(sequence) {
  const snapshot = sequence?.authorization?.offerSnapshot?.snapshot;
  if (!snapshot) return null;
  const rent = snapshot.base?.rent;
  const rows = snapshot.rows ?? [];
  const cents = rows.reduce((sum, row) => sum + Number(row.amountCents ?? 0), 0);
  const rentText =
    typeof rent === "number" ? `Rent ${USD.format(rent)} per month` : "Rent not entered";
  const dates =
    snapshot.dates?.effectiveDate || snapshot.dates?.endDate
      ? ` from ${usDate(snapshot.dates.effectiveDate)} to ${usDate(snapshot.dates.endDate)}`
      : "";
  const charges = rows.length
    ? `Selected charges: ${USD.format(cents / 100)} in total.`
    : "No other charges selected.";
  return `Answers: ${rentText}${dates}. ${charges}`;
}

// ---- The tenant offer review and its follow-up form ----------------------------------------------

/** "Review tenant offer" opens the review dialog with the exact message shown. */
async function openOfferReview(ctx, page, leaseId) {
  const { kit } = ctx;
  await reachPrimary(ctx, page, leaseId, "offer-tenant", "Review tenant offer");
  await kit.primary(page).click();
  const dialog = page.getByRole("dialog", { name: DIALOG_SEND });
  await dialog.locator(REVIEW_TEXT).waitFor({ timeout: 120_000 });
  return dialog;
}

function followUpParts(dialog) {
  const group = dialog.getByRole("group", { name: "Follow-up message and timing" });
  return {
    option: dialog.getByRole("checkbox", {
      name: /Authorize follow-ups after the tenant offer/,
    }),
    group,
    subject: group.getByLabel("Follow-up subject"),
    body: group.getByLabel("Follow-up message"),
    every: group.getByLabel("Every how many days"),
    time: group.getByLabel("Local send time"),
    zone: group.getByLabel("Timezone"),
    end: group.getByLabel("Inclusive end date"),
    limit: group.getByLabel("Total send limit, including the offer"),
  };
}
const FIELDS = ["subject", "body", "every", "time", "zone", "end", "limit"];

async function followUpValues(ctx, dialog) {
  const parts = followUpParts(dialog);
  const values = {};
  for (const field of FIELDS)
    values[field] = await parts[field].inputValue().catch(() => null);
  const line = parts.group.locator('[data-renewal-field="follow-up-start"]');
  const note = parts.group.locator('[data-renewal-field="follow-up-unpublished"]');
  return {
    ...values,
    line: (await line.count()) ? await ctx.kit.visibleText(line) : "",
    note: (await note.count()) ? await ctx.kit.visibleText(note) : "",
    groupText: await ctx.kit.visibleText(parts.group),
  };
}

async function fillFollowUp(dialog, values) {
  const parts = followUpParts(dialog);
  for (const field of FIELDS)
    if (values[field] !== undefined) await parts[field].fill(String(values[field]));
}

/** The review's subject, body, the offer's terms sentence and its greeting, as staff read them. */
async function offerReview(ctx, dialog) {
  const subject = ctx.kit.squash(
    await dialog
      .locator('[data-renewal-field="review-recipients"] + p strong')
      .first()
      .innerText()
      .catch(() => ""),
  );
  const body = await dialog
    .locator('[data-renewal-field="review-body"]')
    .first()
    .innerText()
    .catch(() => "");
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    subject,
    body,
    greeting: lines[0] ?? "",
    terms: TERMS_SENTENCE.exec(ctx.kit.squash(body))?.[0] ?? null,
  };
}

/** Press the dialog's confirm and wait for the sequences request it makes; status and body. */
async function pressConfirm(ctx, page, dialog, name, kind) {
  const { kit } = ctx;
  const answer = kit.appResponse(page, SEQUENCES_ROUTE, {
    match: (body) => kit.sequenceAction(body) === kind,
    timeout: 180_000,
  });
  await dialog.getByRole("button", { name, exact: true }).click();
  const response = await answer.catch(() => null);
  if (!response) return { status: null, body: null };
  const body = await response.json().catch(() => null);
  if (response.status() === 200)
    await dialog.waitFor({ state: "hidden", timeout: 60_000 }).catch(() => undefined);
  return { status: response.status(), body };
}

/** R-S276-8: an Approver publishes the follow-up copy through the template publication. */
async function publishFollowUpCopy(ctx, leaseId) {
  const { kit } = ctx;
  const approver = await ctx.newPage("Approver");
  try {
    await kit.openLease(approver, leaseId, "?view=full");
    const selector = '[data-renewal-field="follow-up-copy-publication"]';
    if (!(await kit.reveal(approver, selector, 45_000)))
      throw new Error("The Approver's follow-up publication control is unavailable.");
    const answer = kit.appResponse(approver, PREPARATION_ROUTE, {
      match: (body) => body?.kind === "publish_follow_up",
    });
    await approver
      .locator(selector)
      .getByRole("button", {
        name: "Publish the standard follow-up message",
        exact: true,
      })
      .click();
    const response = await answer;
    const body = await response.json().catch(() => null);
    const readback = approver.locator('[data-renewal-field="follow-up-copy-published"]');
    return {
      status: response.status(),
      publication:
        response.ok() &&
        body?.status === "approved" &&
        (await kit.shownWithin(readback, 10_000))
          ? "approved"
          : null,
    };
  } finally {
    await approver.close().catch(() => undefined);
  }
}

/** Admin > Renewal notice rules: save the global follow-up interval as an Admin does. */
async function saveFollowUpInterval(ctx, days) {
  const { kit } = ctx;
  const admin = await ctx.newPage("Admin");
  try {
    await kit.openPath(admin, "/admin?task=renewal#admin-renewal-notice-rules");
    const field = admin.locator("#follow-up-days");
    await field.waitFor({ timeout: 60_000 });
    await field.fill(String(days));
    await admin
      .getByRole("button", { name: "Save reviewed rule set", exact: true })
      .click();
    const saved = admin
      .getByRole("status")
      .filter({ hasText: "Saved as a new immutable policy version." });
    const visible = await kit.shownWithin(saved, 60_000);
    return visible;
  } finally {
    await admin.close().catch(() => undefined);
  }
}

/**
 * Ask the owner: "Record a new approval" with another Amount approved, as staff record a changed
 * owner answer. It moves the working base the tenant offer states (S262 R-S262-2).
 */
async function recordNewOwnerApproval(ctx, page, leaseId, amount) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, "?step=ask-owner");
  const selector = "#renewal-manual-owner_response";
  const form = page.locator(selector);
  if (!(await kit.shownWithin(form, 20_000))) await kit.reveal(page, selector);
  const again = form.getByRole("button", { name: "Record a new approval", exact: true });
  if (await kit.shownWithin(again, 15_000)) await again.click();
  const select = form.getByLabel("Owner response", { exact: true });
  if ((await select.inputValue()) !== "approved_terms")
    await select.selectOption({ label: "Approved" });
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
  const when = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(Date.now() - 60_000));
  const part = (type) => when.find((entry) => entry.type === type)?.value;
  await approval
    .getByLabel("When they approved", { exact: true })
    .fill(
      `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`,
    );
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
  return (await saved).status();
}

// ---- Parts -----------------------------------------------------------------------------------------

/**
 * The starting state: "Accepted" chosen (no request), then saved with Save, with follow-ups
 * authorized; the tick sent none. AC-S276-1 (Full view), AC-S276-2 (accepted), AC-S276-6 (the
 * confirmed authorization equals the reviewed follow-up values).
 */
async function startPart(ctx, page, start, leaseId) {
  const observed = start.observed ?? {};
  const sequence = await tenantSequence(ctx, leaseId, null);
  const state = await workspaceState(ctx, page, leaseId);
  const response = state?.tenantResponse ?? null;
  const writes = responseWrites(ctx);
  const review = String(observed.reviewText ?? "");
  const answers = expectedAnswers(sequence);
  const form = page.locator(FORM);
  const line = await remindersLine(ctx, form);
  const card = await communicationsCard(ctx, page, leaseId);
  const followUp = sequence?.authorization?.followUp ?? null;
  const schedule = sequence?.authorization?.schedule ?? null;
  const reviewed = journeyFollowUps();
  const authorizationEqualsReview =
    followUp?.subject === reviewed.subject &&
    String(followUp?.plainText ?? "").startsWith(reviewed.body) &&
    schedule?.everyDays === reviewed.everyDays &&
    schedule?.time === reviewed.time &&
    schedule?.timeZone === "America/Chicago" &&
    schedule?.endDate === reviewed.endDate &&
    schedule?.sendLimit === reviewed.sendLimit;
  const chosenWithoutSave =
    !start.error &&
    observed.savedOnSelection === false &&
    observed.reviewShownBeforeSave === true;
  const savedOnce = observed.savedWithSave === 200 && writes === 1;
  const summary =
    review.includes("Response: Accepted.") &&
    answers !== null &&
    review.includes(answers) &&
    review.includes(`${REMINDERS_STOP} Next: `);
  const tickSentNone =
    observed.tick?.sent === 0 &&
    observed.tenantMessagesBeforeTick === 1 &&
    observed.tenantMessagesAfterTick === 1 &&
    observed.reminderSent === false;
  const paused = pausedForResponse(sequence, response);
  ctx.record({
    part: "start",
    startError: start.error,
    chosenWithoutSave,
    savedWithSave: observed.savedWithSave ?? null,
    writes,
    review,
    expectedAnswers: answers,
    recordedOutcome: response?.outcome ?? null,
    tick: observed.tick ?? null,
    sequence: {
      state: sequence?.state ?? null,
      cause: sequence?.pause?.cause ?? null,
      byUid: sequence?.pause?.byUid ?? null,
    },
    line,
    cardPaused: card.includes(PAUSED_LINE),
    authorizationEqualsReview,
    schedule,
  });
  return {
    sequenceId: sequence?.id ?? null,
    checks: {
      "AC-S276-1":
        chosenWithoutSave && savedOnce && summary && response?.outcome === "accepted",
      "AC-S276-2":
        tickSentNone &&
        paused &&
        line.stopped === STOPPED_LINE &&
        card.includes(PAUSED_LINE),
      "AC-S276-6": authorizationEqualsReview,
    },
  };
}

/**
 * Guided view on the same lease: Cancel and leaving keep "Accepted"; nothing required; clearing
 * to "Awaiting response" saves with one request and leaves the reminders paused; Resume stays a
 * staff action in Communications. AC-S276-1 (Guided), AC-S276-4 (clear), AC-S276-5.
 */
async function guidedPart(ctx, page, leaseId, sequenceId) {
  const { kit } = ctx;
  const before = await workspaceState(ctx, page, leaseId);
  let { form, select, fullView } = await openTenantForm(ctx, page, leaseId, "guided");
  const shownAccepted = (await select.inputValue()) === "accepted";

  // Cancel: the review shows, nothing is saved, the earlier response comes back.
  const change = await chooseResponse(
    ctx,
    page,
    select,
    form,
    "counter_change_requested",
  );
  const region = reviewRegion(form);
  const noRequired =
    (await region.locator('input[type="checkbox"]').count()) === 0 &&
    (await form.locator('input[type="checkbox"]').count()) === 0 &&
    (await form.locator('[required], [aria-required="true"]').count()) === 0 &&
    (await form.getByLabel("Response source or channel (optional)").inputValue()) ===
      "" &&
    (await region.getByRole("button", { name: "Save", exact: true }).isEnabled());
  await region.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForTimeout(1500);
  const cancelled =
    change.savedOnChoice === 0 &&
    change.lines?.response === `Response: ${LABELS.counter_change_requested}.` &&
    (await select.inputValue()) === "accepted" &&
    (await region.count()) === 0;

  // Leave: choose a decline and type a source, then go to the desk; nothing is saved.
  const writesBeforeLeave = responseWrites(ctx);
  const decline = await chooseResponse(ctx, page, select, form, "declined_nonrenewing");
  const source = form.getByLabel("Response source or channel (optional)");
  await source.fill("Phone call (W12-05 synthetic)");
  await source.blur();
  await page.waitForTimeout(1500);
  await kit.openPath(page, DESK);
  const afterLeave = await workspaceState(ctx, page, leaseId);
  ({ form, select } = await openTenantForm(ctx, page, leaseId, "guided"));
  const left =
    decline.savedOnChoice === 0 &&
    responseWrites(ctx) === writesBeforeLeave &&
    afterLeave?.tenantResponse?.outcome === "accepted" &&
    afterLeave?.tenantResponse?.eventId === before?.tenantResponse?.eventId &&
    (await select.inputValue()) === "accepted";

  // Clear: "Awaiting response" with its own review, one Save, reminders stay paused.
  const pausedBefore = await tenantSequence(ctx, leaseId, sequenceId);
  const clear = await chooseResponse(ctx, page, select, form, "awaiting_response");
  const saved = await saveResponse(ctx, page, form, leaseId);
  const cleared = await workspaceState(ctx, page, leaseId);
  const tick = tickCounts(await kit.tick(sequenceId));
  const pausedAfter = await tenantSequence(ctx, leaseId, sequenceId);
  const stillPaused =
    pausedAfter?.state === "paused" &&
    pausedAfter?.pause?.cause === CAUSE &&
    pausedAfter?.pause?.atMs === pausedBefore?.pause?.atMs &&
    pausedAfter?.authorization?.approvedAtMs ===
      pausedBefore?.authorization?.approvedAtMs &&
    tick.sent === 0;
  const clearSaved =
    clear.savedOnChoice === 0 &&
    clear.lines?.follows === STAY_STOPPED &&
    saved.status === 200 &&
    saved.requests === 1 &&
    cleared?.tenantResponse?.outcome === "awaiting_response";

  // Resume stays a staff action: offered in Communications, and only it resumes.
  const resumed = await resumeInCommunications(ctx, page, leaseId);
  const resumedRecord = await tenantSequence(ctx, leaseId, sequenceId);
  const resumeExplicit =
    stillPaused &&
    resumed.cardText?.includes(PAUSED_LINE) &&
    resumed.enabled === true &&
    resumed.status === 200 &&
    resumedRecord?.state === "active" &&
    Number(resumedRecord?.authorization?.approvedAtMs ?? 0) >
      Number(pausedBefore?.authorization?.approvedAtMs ?? 0);
  ctx.record({
    part: "guided",
    fullView,
    shownAccepted,
    noRequired,
    change: change.lines,
    cancelled,
    left,
    clear: clear.lines,
    saved,
    tick,
    stillPaused,
    resumed: {
      shown: resumed.shown,
      offered: resumed.offered ?? null,
      enabled: resumed.enabled ?? null,
      compositionStatus: resumed.compositionStatus ?? null,
      statuses: resumed.statuses ?? [],
      status: resumed.status ?? null,
      state: resumed.state ?? null,
    },
    resumeExplicit,
  });
  return {
    checks: {
      "AC-S276-1":
        fullView === false &&
        shownAccepted &&
        noRequired &&
        cancelled &&
        left &&
        clearSaved,
      "AC-S276-4": clearSaved && stillPaused && saved.gmailCalls === 0,
      "AC-S276-5":
        saved.sentNothing &&
        saved.cancelledNothing &&
        saved.sourceUnchanged &&
        resumeExplicit,
    },
  };
}

/**
 * A change request recorded in Guided view on a fresh offer with follow-ups. AC-S276-1 (the
 * Guided Save and its summary), AC-S276-2, AC-S276-4 (zero Gmail calls), AC-S276-5.
 */
async function changePart(ctx, page, leaseId) {
  const { kit } = ctx;
  await ctx.resetState();
  const sequenceId = await sendOfferWithFollowUps(ctx, page, leaseId, "change");
  const sent = await tenantSequence(ctx, leaseId, sequenceId);
  const { form, select, fullView } = await openTenantForm(ctx, page, leaseId, "guided");
  const chosen = await chooseResponse(
    ctx,
    page,
    select,
    form,
    "counter_change_requested",
  );
  const saved = await saveResponse(ctx, page, form, leaseId);
  const state = await workspaceState(ctx, page, leaseId);
  const atSave = await tenantSequence(ctx, leaseId, sequenceId);
  const line = await remindersLine(ctx, form);
  const mailBefore = (await tenantMail(ctx, leaseId)).length;
  const tick = tickCounts(await kit.tick(sequenceId));
  const mailAfter = (await tenantMail(ctx, leaseId)).length;
  const afterTick = await tenantSequence(ctx, leaseId, sequenceId);
  const answers = expectedAnswers(sent);
  const summary =
    chosen.savedOnChoice === 0 &&
    chosen.lines?.response === `Response: ${LABELS.counter_change_requested}.` &&
    chosen.lines?.answers === answers &&
    String(chosen.lines?.follows ?? "").startsWith(`${REMINDERS_STOP} Next: `);
  const paused =
    pausedForResponse(atSave, state?.tenantResponse) &&
    pausedForResponse(afterTick, state?.tenantResponse) &&
    tick.sent === 0 &&
    mailAfter === mailBefore &&
    saved.reminders?.state === "stopped" &&
    line.stopped === STOPPED_LINE;
  ctx.record({
    part: "change",
    fullView,
    review: chosen.lines,
    expectedAnswers: answers,
    saved,
    outcome: state?.tenantResponse?.outcome ?? null,
    atSave: {
      state: atSave?.state,
      cause: atSave?.pause?.cause,
      by: atSave?.pause?.byUid,
    },
    tick,
    mail: { before: mailBefore, after: mailAfter },
    line,
  });
  return {
    checks: {
      "AC-S276-1":
        fullView === false &&
        summary &&
        saved.status === 200 &&
        saved.requests === 1 &&
        state?.tenantResponse?.outcome === "counter_change_requested",
      "AC-S276-2": paused,
      "AC-S276-4": saved.gmailCalls === 0,
      "AC-S276-5": saved.sentNothing && saved.cancelledNothing && saved.sourceUnchanged,
    },
  };
}

/**
 * A decline in Full view: paused at save time under the response's cause, never as changed facts,
 * and the decline's own path effect (the non-renewal handoff). AC-S276-2.
 */
async function declinePart(ctx, page, leaseId) {
  const { kit } = ctx;
  await ctx.resetState();
  const sequenceId = await sendOfferWithFollowUps(ctx, page, leaseId, "decline");
  const { form, select } = await openTenantForm(ctx, page, leaseId, "full");
  const chosen = await chooseResponse(ctx, page, select, form, "declined_nonrenewing");
  const saved = await saveResponse(ctx, page, form, leaseId);
  const state = await workspaceState(ctx, page, leaseId);
  const atSave = await tenantSequence(ctx, leaseId, sequenceId);
  const line = await remindersLine(ctx, form);
  const mailBefore = (await tenantMail(ctx, leaseId)).length;
  const tick = tickCounts(await kit.tick(sequenceId));
  const mailAfter = (await tenantMail(ctx, leaseId)).length;
  const afterTick = await tenantSequence(ctx, leaseId, sequenceId);
  const card = await communicationsCard(ctx, page, leaseId);
  await kit.openLease(page, leaseId, "");
  const leaseText = await kit.visibleText(page.locator("main").first());
  const handoff = /Non-renewal handoff/i.test(leaseText);
  const result =
    chosen.savedOnChoice === 0 &&
    chosen.lines?.response === `Response: ${LABELS.declined_nonrenewing}.` &&
    String(chosen.lines?.follows ?? "").startsWith(`${REMINDERS_STOP} Next: `) &&
    saved.status === 200 &&
    saved.requests === 1 &&
    state?.tenantResponse?.outcome === "declined_nonrenewing" &&
    pausedForResponse(atSave, state?.tenantResponse) &&
    pausedForResponse(afterTick, state?.tenantResponse) &&
    saved.reminders?.state === "stopped" &&
    line.stopped === STOPPED_LINE &&
    tick.sent === 0 &&
    mailAfter === mailBefore &&
    card.includes(PAUSED_LINE) &&
    !card.includes(PAUSED_CHANGED) &&
    handoff;
  ctx.record({
    part: "decline",
    review: chosen.lines,
    saved,
    atSave: {
      state: atSave?.state,
      cause: atSave?.pause?.cause,
      by: atSave?.pause?.byUid,
    },
    afterTick: { state: afterTick?.state, cause: afterTick?.pause?.cause },
    tick,
    mail: { before: mailBefore, after: mailAfter },
    line,
    cardPaused: card.includes(PAUSED_LINE),
    cardChanged: card.includes(PAUSED_CHANGED),
    handoff,
  });
  return { checks: { "AC-S276-2": result } };
}

/**
 * The pause write fails at save: the response stays saved, the form offers "Stop them", and a
 * reminder made due afterwards is held, not sent; "Stop them" then answers. AC-S276-3.
 */
async function faultPart(ctx, page, leaseId) {
  const { kit, rehearsal } = ctx;
  await ctx.resetState();
  const sequenceId = await sendOfferWithFollowUps(ctx, page, leaseId, "fault");
  const { form, select } = await openTenantForm(ctx, page, leaseId, "full");
  await chooseResponse(ctx, page, select, form, "accepted");
  setTenantResponsePauseFault(rehearsal, true);
  let saved;
  let fault;
  try {
    saved = await saveResponse(ctx, page, form, leaseId);
  } finally {
    fault = tenantResponsePauseFault(rehearsal);
    setTenantResponsePauseFault(rehearsal, false);
  }
  const state = await workspaceState(ctx, page, leaseId);
  const savedAtMs = Date.parse(state?.tenantResponse?.recordedAt ?? "");
  const line = await remindersLine(ctx, form);
  const atSave = await tenantSequence(ctx, leaseId, sequenceId);
  const mailBefore = (await tenantMail(ctx, leaseId)).length;
  const tick = tickCounts(await kit.tick(sequenceId));
  const held = await tenantSequence(ctx, leaseId, sequenceId);
  const mailAfter = (await tenantMail(ctx, leaseId)).length;
  const sendsAfterSave = mailSends(ctx).filter(
    (entry) => Date.parse(entry.at) > savedAtMs,
  );
  const claimedAfterSave = (await occurrencesOf(ctx, sequenceId)).filter(
    (occurrence) => Number(occurrence.claimedAtMs) > savedAtMs,
  );
  // "Stop them": the retry answers; the reminders are already held, so nothing is left to stop.
  const stopAnswer = kit
    .appResponse(page, WORKSPACE_ROUTE, {
      match: (body) =>
        body?.operation === "stop_tenant_reminders" ||
        body?.action?.kind === "stop_tenant_reminders" ||
        body?.kind === "stop_tenant_reminders",
    })
    .catch(() => null);
  let stopStatus = null;
  if (line.stopThem) {
    await form
      .locator('[data-renewal-field="tenant-reminders-scheduled"]')
      .getByRole("button", { name: "Stop them", exact: true })
      .click();
    stopStatus = (await stopAnswer)?.status() ?? null;
  }
  const afterStop = await remindersLine(ctx, form);
  const stillHeld = await tenantSequence(ctx, leaseId, sequenceId);
  const result =
    fault.fired === true &&
    saved.status === 200 &&
    saved.reminders?.state === "failed" &&
    state?.tenantResponse?.outcome === "accepted" &&
    line.scheduled.startsWith(STILL_SCHEDULED) &&
    line.stopThem &&
    atSave?.state === "active" &&
    !atSave?.pause &&
    tick.sent === 0 &&
    mailAfter === mailBefore &&
    held?.state === "paused" &&
    held?.pause?.cause === CAUSE &&
    sendsAfterSave.length === 0 &&
    claimedAfterSave.every((occurrence) => occurrence.state !== "sent") &&
    stopStatus === 200 &&
    afterStop.scheduled === "" &&
    stillHeld?.state === "paused";
  ctx.record({
    part: "fault",
    fault,
    saved,
    outcome: state?.tenantResponse?.outcome ?? null,
    line,
    atSave: { state: atSave?.state, pause: atSave?.pause?.cause ?? null },
    tick,
    held: { state: held?.state, cause: held?.pause?.cause, by: held?.pause?.byUid },
    mail: { before: mailBefore, after: mailAfter },
    sendsAfterSave: sendsAfterSave.length,
    claimedAfterSave: claimedAfterSave.map((occurrence) => occurrence.state),
    stopStatus,
    afterStop,
  });
  return { checks: { "AC-S276-3": result } };
}

/**
 * The worker against the save, with the pause write failing: the worker claims a due reminder
 * and Save is chosen while it sends. The occurrence claimed before the save is reported as sent;
 * nothing else reaches the mailbox after the save, and the next due reminder is held. AC-S276-3.
 */
async function racePart(ctx, page, leaseId) {
  const { kit, rehearsal } = ctx;
  await ctx.resetState();
  const sequenceId = await sendOfferWithFollowUps(ctx, page, leaseId, "race");
  const { form, select } = await openTenantForm(ctx, page, leaseId, "full");
  await chooseResponse(ctx, page, select, form, "accepted");
  const known = new Set((await occurrencesOf(ctx, sequenceId)).map((entry) => entry.id));
  await holdNextMailSend(rehearsal);
  let ticking;
  let saved;
  let fault;
  let released;
  let claimedFirst = null;
  try {
    setTenantResponsePauseFault(rehearsal, true);
    ticking = kit.tick(sequenceId).catch((error) => ({ error: String(error) }));
    // The synthetic mailbox holds acceptance while staff Save. Its request proves the worker
    // admitted and dispatched this specific occurrence before the response.
    const deadline = Date.now() + 90_000;
    let done = false;
    void ticking.then(() => (done = true));
    while (Date.now() < deadline && !done) {
      if ((await standInState(rehearsal)).mail.sendHeld) {
        const claimed = (await occurrencesOf(ctx, sequenceId)).find(
          (entry) => !known.has(entry.id),
        );
        if (!claimed) throw new Error("The held send has no admitted occurrence.");
        claimedFirst = { state: claimed.state, claimedAtMs: claimed.claimedAtMs };
        break;
      }
      await page.waitForTimeout(150);
    }
    if (!claimedFirst)
      throw new Error("The synthetic mailbox held no admitted reminder.");
    saved = await saveResponse(ctx, page, form, leaseId);
  } finally {
    fault = tenantResponsePauseFault(rehearsal);
    setTenantResponsePauseFault(rehearsal, false);
    released = await releaseHeldMailSend(rehearsal);
    await ticking;
  }
  const firstTick = tickCounts(await ticking);
  const state = await workspaceState(ctx, page, leaseId);
  const savedAtMs = Date.parse(state?.tenantResponse?.recordedAt ?? "");
  const afterRace = await tenantSequence(ctx, leaseId, sequenceId);
  const secondTick = tickCounts(await kit.tick(sequenceId));
  const sequence = await tenantSequence(ctx, leaseId, sequenceId);
  const occurrences = await occurrencesOf(ctx, sequenceId);
  const mail = await tenantMail(ctx, leaseId);
  const mailIds = new Set(mail.map((message) => message.id));
  const providerAttemptsAfterSave = mailCalls(ctx).filter(
    (entry) =>
      entry.method === "POST" &&
      entry.path === "/messages/send" &&
      Date.parse(entry.at) >= savedAtMs,
  ).length;
  const before = occurrences.filter(
    (occurrence) => Number(occurrence.claimedAtMs) < savedAtMs,
  );
  const after = occurrences.filter(
    (occurrence) => Number(occurrence.claimedAtMs) >= savedAtMs,
  );
  const sentBefore = before.filter((occurrence) => occurrence.state === "sent");
  // Every message the mailbox took after the save is an occurrence claimed before it, sent.
  const lateMail = mail.filter((message) => Date.parse(message.at) >= savedAtMs);
  const lateExplained = lateMail.every((message) =>
    sentBefore.some((occurrence) => occurrence.gmailMessageId === message.id),
  );
  const truthful =
    before.every(
      (occurrence) =>
        occurrence.state === "sent" && mailIds.has(String(occurrence.gmailMessageId)),
    ) && Number(sequence?.confirmedCount) === sentBefore.length;
  const result =
    Number.isFinite(savedAtMs) &&
    saved.status === 200 &&
    fault.fired &&
    released.released &&
    Number(claimedFirst.claimedAtMs) < savedAtMs &&
    firstTick.sent === 1 &&
    providerAttemptsAfterSave === 0 &&
    state?.tenantResponse?.outcome === "accepted" &&
    after.every((occurrence) => occurrence.state !== "sent") &&
    lateExplained &&
    truthful &&
    secondTick.sent === 0 &&
    sequence?.state === "paused" &&
    sequence?.pause?.cause === CAUSE;
  ctx.record({
    part: "race",
    claimedFirst,
    fault,
    released,
    saved: { status: saved.status, reminders: saved.reminders, at: saved.clickedAt },
    savedAtMs,
    firstTick,
    afterRace: { state: afterRace?.state, cause: afterRace?.pause?.cause ?? null },
    secondTick,
    occurrences: occurrences.map((occurrence) => ({
      index: occurrence.index,
      state: occurrence.state,
      beforeSave: Number(occurrence.claimedAtMs) < savedAtMs,
    })),
    confirmedCount: sequence?.confirmedCount ?? null,
    providerAttemptsAfterSave,
    tenantMessages: mail.length,
    lateMail: lateMail.length,
    lateExplained,
    truthful,
    final: { state: sequence?.state, cause: sequence?.pause?.cause ?? null },
  });
  return { checks: { "AC-S276-3": result } };
}

/**
 * The follow-up form with the copy unpublished: unticked on open, six starting values and the
 * line, edits kept across untick and tick, the missing stopping bound refused, the values reset
 * on a new review; then the interval changed to 7 and confirmed (the authorization holds what was
 * reviewed). The copy is then published: the tenant offer's publication is untouched and the
 * follow-up authorized before it dispatches as reviewed. Last, a tenant reply with no recorded
 * response pauses under its own cause. AC-S276-4 (reply), AC-S276-6, AC-S276-7.
 */
async function formPart(ctx, page, leaseId) {
  const { kit, rehearsal } = ctx;
  await ctx.resetState();
  await prepareTenantOffer(ctx, page, leaseId, partLog(ctx, "form"), {
    end: FIRST_TERM_END,
  });
  const templatesBefore = await templates(ctx);

  // First review: unticked; tick reads the starting values (copy unpublished).
  let dialog = await openOfferReview(ctx, page, leaseId);
  let parts = followUpParts(dialog);
  const offer = await offerReview(ctx, dialog);
  const untickedOnOpen =
    (await parts.option.isChecked()) === false && (await parts.group.count()) === 0;
  await parts.option.check();
  await parts.group.waitFor({ timeout: 20_000 });
  const started = await followUpValues(ctx, dialog);
  const startingValues =
    started.subject === offer.subject &&
    offer.subject !== "" &&
    started.body === "" &&
    started.every === "10" &&
    started.time === "09:00" &&
    started.zone === "America/Chicago" &&
    started.end === "" &&
    started.limit === "3" &&
    started.line === startLine(10, false);
  const unpublished =
    started.body === "" &&
    started.note === UNPUBLISHED_NOTE &&
    started.line === startLine(10, false);

  // Edit every field, untick, tick: the edits are kept.
  const edits = {
    subject: "W12-05 edited follow-up subject",
    body: "W12-05 edited synthetic follow-up message.",
    every: "5",
    time: "10:30",
    zone: "America/Denver",
    end: centralToday(45),
    limit: "4",
  };
  await fillFollowUp(dialog, edits);
  await parts.option.uncheck();
  const hidden = (await parts.group.count()) === 0;
  await parts.option.check();
  await parts.group.waitFor({ timeout: 20_000 });
  const kept = await followUpValues(ctx, dialog);
  const editsKept = hidden && FIELDS.every((field) => kept[field] === edits[field]);

  // Clear the limit and the end date: the existing refusal names the missing stopping bound.
  await fillFollowUp(dialog, { limit: "", end: "" });
  const refusedText = await kit.visibleText(parts.group);
  const confirmFollowUps = dialog.getByRole("button", {
    name: "Send offer now and authorize follow-ups",
    exact: true,
  });
  const boundRefused =
    refusedText.includes(MISSING_BOUND) && (await confirmFollowUps.isDisabled());

  // A new review opens unticked with the starting values again.
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
  dialog = await openOfferReview(ctx, page, leaseId);
  parts = followUpParts(dialog);
  const reopenedUnticked =
    (await parts.option.isChecked()) === false && (await parts.group.count()) === 0;
  await parts.option.check();
  await parts.group.waitFor({ timeout: 20_000 });
  const reopened = await followUpValues(ctx, dialog);
  const resetOnNewReview =
    reopenedUnticked &&
    reopened.every === "10" &&
    reopened.limit === "3" &&
    reopened.time === "09:00" &&
    reopened.end === "" &&
    reopened.body === "";

  // Change the interval to 7, write the message (unpublished), confirm.
  const reviewedBody = "W12-05 reviewed synthetic follow-up about your renewal offer.";
  await fillFollowUp(dialog, { every: "7", body: reviewedBody });
  const confirmed = await followUpValues(ctx, dialog);
  const sent = await pressConfirm(
    ctx,
    page,
    dialog,
    "Send offer now and authorize follow-ups",
    "send",
  );
  const sequenceId =
    sent.body?.sequence?.id ?? (await tenantSequence(ctx, leaseId, null))?.id;
  const sequence = await tenantSequence(ctx, leaseId, sequenceId);
  const followUp = sequence?.authorization?.followUp ?? null;
  const schedule = sequence?.authorization?.schedule ?? null;
  const authorizationEqualsReview =
    sent.status === 200 &&
    followUp?.subject === confirmed.subject &&
    String(followUp?.plainText ?? "").startsWith(reviewedBody) &&
    schedule?.everyDays === 7 &&
    String(schedule?.everyDays) === confirmed.every &&
    schedule?.time === confirmed.time &&
    schedule?.timeZone === confirmed.zone &&
    (schedule?.endDate ?? "") === confirmed.end &&
    String(schedule?.sendLimit ?? "") === confirmed.limit;

  // Publish the follow-up copy; the offer's publication and the authorized follow-up stand.
  const published = await publishFollowUpCopy(ctx, leaseId);
  const templatesAfter = await templates(ctx);
  const offerPublicationKept =
    templatesBefore.tenantOffer.count === 1 &&
    templatesBefore.tenantOffer.status === "Approved" &&
    templatesAfter.tenantOffer.status === "Approved" &&
    templatesAfter.tenantOffer.bodyHash === templatesBefore.tenantOffer.bodyHash &&
    templatesAfter.tenantOffer.updateTime === templatesBefore.tenantOffer.updateTime &&
    templatesBefore.followUp.count === 0 &&
    templatesAfter.followUp.count === 1 &&
    templatesAfter.followUp.status === "Approved";
  const mailBefore = await tenantMail(ctx, leaseId);
  const tick = tickCounts(await kit.tick(sequenceId));
  const mailAfter = await tenantMail(ctx, leaseId);
  const followUpMail = mailAfter.at(-1);
  const dispatchedAsReviewed =
    tick.sent === 1 &&
    mailAfter.length === mailBefore.length + 1 &&
    String(followUpMail?.text ?? "").includes(reviewedBody) &&
    !String(followUpMail?.text ?? "").includes(
      "We are following up on your lease renewal",
    );

  // A verified tenant reply with no recorded response pauses under its own cause.
  const state = await workspaceState(ctx, page, leaseId);
  const tenantAddress = kit.tenantAddresses(leaseId)[0];
  const reply = await deliverOwnerReply(rehearsal, {
    to: tenantAddress,
    text: "Synthetic tenant reply: we would like to talk about the renewal.",
  });
  const replyTick = tickCounts(await kit.tick());
  const replied = await tenantSequence(ctx, leaseId, sequenceId);
  const replyPause =
    !state?.tenantResponse ||
    state.tenantResponse.outcome === "awaiting_response" ||
    state.tenantResponse.outcome == null;
  const replyPaused =
    replyPause && replied?.state === "paused" && replied?.pause?.cause === "reply";
  ctx.record({
    part: "form",
    offerSubject: offer.subject,
    untickedOnOpen,
    started: { ...started, groupText: undefined },
    startingValues,
    unpublished,
    editsKept,
    kept: { ...kept, groupText: undefined },
    boundRefused,
    resetOnNewReview,
    confirmed: { ...confirmed, groupText: undefined },
    sent: { status: sent.status },
    schedule,
    followUpSubject: followUp?.subject ?? null,
    authorizationEqualsReview,
    published,
    templatesBefore,
    templatesAfter,
    offerPublicationKept,
    tick,
    dispatchedAsReviewed,
    reply: { thread: reply?.threadId ?? null },
    replyTick,
    replied: { state: replied?.state, cause: replied?.pause?.cause ?? null },
    noResponse: replyPause,
  });
  return {
    checks: {
      "AC-S276-4": replyPaused,
      "AC-S276-6":
        untickedOnOpen &&
        startingValues &&
        editsKept &&
        boundRefused &&
        resetOnNewReview &&
        authorizationEqualsReview,
      "AC-S276-7":
        unpublished &&
        published.status === 200 &&
        offerPublicationKept &&
        dispatchedAsReviewed,
    },
  };
}

/**
 * An Admin-saved interval of 14, then the published follow-up composed from the reviewed facts;
 * the reviewed rent changes before confirming and the message follows it; a plain Send then
 * authorizes no follow-up. AC-S276-6, AC-S276-7.
 */
async function publishedPart(ctx, page, leaseId) {
  const { kit } = ctx;
  await ctx.resetState();
  const intervalSaved = await saveFollowUpInterval(ctx, 14);
  await prepareTenantOffer(ctx, page, leaseId, partLog(ctx, "published"), {
    end: FIRST_TERM_END,
  });

  // The Admin's interval, with the copy still unpublished.
  let dialog = await openOfferReview(ctx, page, leaseId);
  let parts = followUpParts(dialog);
  await parts.option.check();
  await parts.group.waitFor({ timeout: 20_000 });
  const admin = await followUpValues(ctx, dialog);
  const fourteen =
    intervalSaved &&
    admin.every === "14" &&
    admin.line === startLine(14, false) &&
    admin.time === "09:00" &&
    admin.limit === "3";
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);

  // Publish, then the composed follow-up.
  const published = await publishFollowUpCopy(ctx, leaseId);
  dialog = await openOfferReview(ctx, page, leaseId);
  parts = followUpParts(dialog);
  const offer = await offerReview(ctx, dialog);
  await parts.option.check();
  await parts.group.waitFor({ timeout: 20_000 });
  const filled = await followUpValues(ctx, dialog);
  const lease = ctx.leases.byId(leaseId);
  const row = kit.row(leaseId);
  const street =
    `${row?.property?.streetNumber ?? ""} ${row?.property?.streetName ?? ""}`.trim();
  const opening =
    /We are following up on your lease renewal offer for (.+)\. Your lease ends on (\d\d\/\d\d\/\d{4})\./.exec(
      filled.body,
    );
  const address = opening?.[1] ?? "";
  const leaseEnd = usDate(lease?.endDate);
  const expected = [
    offer.greeting,
    `We are following up on your lease renewal offer for ${address}. Your lease ends on ${leaseEnd}.`,
    offer.terms,
    FOLLOW_UP_CLOSING,
    SIGNOFF,
  ].join("\n\n");
  const rentText =
    /Rent: (\$[\d,]+(?:\.\d\d)?) per month/.exec(offer.terms ?? "")?.[1] ?? "";
  const signature = /Sender signature: (.+?)(?: Follow-up attachments|$)/.exec(
    filled.groupText,
  )?.[1];
  const composed =
    published.status === 200 &&
    opening !== null &&
    address.startsWith(street) &&
    street !== "" &&
    opening[2] === leaseEnd &&
    offer.terms !== null &&
    filled.body === expected &&
    count(filled.body, address) === 1 &&
    count(filled.body, leaseEnd) === 1 &&
    count(filled.body, rentText) === 1 &&
    count(filled.body, offer.terms) === 1 &&
    filled.body.startsWith(`${offer.greeting}\n\n`) &&
    /^Hello\b/.test(offer.greeting) &&
    filled.body.endsWith(SIGNOFF) &&
    !/\{\{|\}\}|\[/.test(filled.body) &&
    Boolean(signature) &&
    !filled.body.includes(signature) &&
    kit.squash(offer.body).includes(signature) &&
    filled.line === startLine(14, true) &&
    filled.note === "" &&
    filled.subject === offer.subject;

  // Change the reviewed rent on another tab, then confirm: the review is read again and the
  // follow-up message, which staff did not edit, follows the new rent.
  await fillFollowUp(dialog, { every: "7" });
  const other = await ctx.newPage("Editor");
  const newAmount = Number(lease?.rent ?? 0) + 75;
  const approvalStatus = await recordNewOwnerApproval(ctx, other, leaseId, newAmount);
  await other.close().catch(() => undefined);
  const refused = await pressConfirm(
    ctx,
    page,
    dialog,
    "Send offer now and authorize follow-ups",
    "send",
  );
  const changedShown = await kit.shownWithin(
    dialog.locator('[data-renewal-field="review-changed"]'),
    60_000,
  );
  await dialog
    .locator('[data-renewal-field="review-reloading"]')
    .waitFor({ state: "hidden", timeout: 60_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1500);
  const reread = await offerReview(ctx, dialog);
  const followed = await followUpValues(ctx, dialog);
  const newRent = USD.format(newAmount);
  const follows =
    approvalStatus === 200 &&
    refused.status !== 200 &&
    changedShown &&
    reread.terms !== null &&
    reread.terms.includes(newRent) &&
    followed.body.includes(reread.terms) &&
    followed.body.includes(newRent) &&
    !followed.body.includes(rentText) &&
    followed.every === "7";

  // A plain Send: untick and send; the authorization holds no follow-up.
  await parts.option.uncheck();
  const plain = await pressConfirm(ctx, page, dialog, "Send this message", "send");
  const sequenceId =
    plain.body?.sequence?.id ?? (await tenantSequence(ctx, leaseId, null))?.id;
  const sequence = await tenantSequence(ctx, leaseId, sequenceId);
  const plainNoFollowUp =
    plain.status === 200 &&
    sequence?.authorization != null &&
    sequence.authorization.followUp == null &&
    sequence.authorization.schedule == null;
  ctx.record({
    part: "published",
    intervalSaved,
    admin: { ...admin, groupText: undefined },
    fourteen,
    published,
    offerSubject: offer.subject,
    greeting: offer.greeting,
    terms: offer.terms,
    filled: { ...filled, groupText: undefined },
    expectedMatches: filled.body === expected,
    signature: Boolean(signature),
    composed,
    approvalStatus,
    refused: { status: refused.status, error: refused.body?.error ?? null },
    changedShown,
    rereadTerms: reread.terms,
    followedBody: followed.body,
    follows,
    plain: { status: plain.status },
    plainNoFollowUp,
  });
  return {
    checks: {
      "AC-S276-6": fourteen && plainNoFollowUp,
      "AC-S276-7": composed && follows,
    },
  };
}

// ---- The row --------------------------------------------------------------------------------------

/**
 * W12-05 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1205 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S276-1 to AC-S276-7 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1205(ctx, page, start) {
  const only = developmentParts();
  const runs = (part) => !only || only.has(part);
  const leaseId = ctx.leases.prepared.leaseId;
  const results = {};
  const ran = new Set();
  const add = (checks) => {
    for (const [id, value] of Object.entries(checks))
      (results[id] ??= []).push(value === true);
  };
  const part = async (name, run) => {
    if (!runs(name)) return null;
    ran.add(name);
    try {
      const outcome = await run();
      add(outcome.checks);
      return outcome;
    } catch (error) {
      ctx.record({ part: name, error: String(error?.message ?? error).slice(0, 900) });
      add(Object.fromEntries(PARTS[name].map((id) => [id, false])));
      await page
        .screenshot({
          path: `${ctx.rehearsal.runDir}/W12-05-${name}-stopped.png`,
          fullPage: false,
        })
        .catch(() => undefined);
      return null;
    }
  };

  const started = await part("start", () => startPart(ctx, page, start, leaseId));
  const sequenceId =
    started?.sequenceId ?? (await tenantSequence(ctx, leaseId, null))?.id;
  await part("guided", () => guidedPart(ctx, page, leaseId, sequenceId));
  await part("change", () => changePart(ctx, page, leaseId));
  await part("decline", () => declinePart(ctx, page, leaseId));
  await part("fault", () => faultPart(ctx, page, leaseId));
  await part("race", () => racePart(ctx, page, leaseId));
  await part("form", () => formPart(ctx, page, leaseId));
  await part("published", () => publishedPart(ctx, page, leaseId));

  // A check is recorded only when every part that feeds it ran.
  const complete = (id) =>
    Object.entries(PARTS)
      .filter(([, ids]) => ids.includes(id))
      .every(([name]) => ran.has(name));
  const checks = Object.fromEntries(
    CHECKS.filter((id) => results[id] && complete(id)).map((id) => [
      id,
      results[id].every(Boolean),
    ]),
  );
  ctx.record({ candidateChecks: checks, parts: [...ran] });
  return checks;
}
