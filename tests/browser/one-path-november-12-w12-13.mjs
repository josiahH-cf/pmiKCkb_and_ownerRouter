// S284 W12-13, "Ask once, record once": the candidate-side acceptance checks of S285 (intake 163)
// for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-owner-ask-rent-term-and-approver.md (S285).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S285-1, AC-S285-2, AC-S285-3, AC-S285-4, AC-S285-5
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   With the new owner wording unpublished, schedule an owner message and confirm it sends as
//   reviewed. Publish the wording as an approver and read the stated count and the held message.
//   Choose the 12 month end date. Read the owner review with the term, then remove a date and
//   read the hold. Deliver the sole owner's reply with the stand-in and record the answer with
//   the owner selected and the broader coverage. Read Documents. Repeat with two owners on one
//   address and with changed dates.
//
// Starting sequence (journeyW1213 in one-path-november-12-journeys.mjs, the fail-first table):
//   Save a renewal start with no end, read the owner review, deliver the sole owner's reply and
//   open the answer. On the baseline: No end date is offered, the message states no term, the
//   coverage opens on base rent only and no owner is selected. It runs unchanged on the
//   candidate: the new owner wording is unpublished when the row starts, so the owner message it
//   sends states no term (v2.0), as the release leaves it.
//
// What this row does after the starting sequence, through what staff can do (R-S284-2). No route
// is posted by this file; the kit only waits for the requests staff clicks make, and reads GET
// routes the pages read, the emulator and the stand-ins' state.
//   A. On the starting state (the v2.0 owner message sent, the sole owner's reply read): the end
//      choices for a 12 month lease, the calendar boundaries as staff change the start, the 12
//      month choice and its saved basis, a start changed after that save, then Record the
//      owner's answer: the replying owner selected, the coverage of a message that stated no
//      term, a message from an address the owner message never went to, an automatic reply, a
//      bounce, another channel, an owner roster without the replying address, an unreadable
//      roster, and two owners of record on one address (the RentVine stand-in's setOwnerRoster
//      hook, S284 W12-13, test-only), where staff choose and save.
//   B. From the starting state again: an Editor sees no publish control, an Approver reads the
//      ready line; an owner message is scheduled under the current wording, the Approver reads
//      the stated count and keeps the current wording, and the message sends at its time as
//      reviewed. The Approver then publishes with nothing to hold. The assisted lease's owner
//      message reads the same under either version.
//   C. From the starting state again: an owner message is scheduled, the Approver publishes
//      with the stated count, the worker holds that message with the named cause, staff save the
//      dates and repair it in one update; it sends with the term. The sole owner replies; the
//      answer opens with the owner selected and the broader coverage; Documents asks nothing
//      more. The owner approves a 6 month term instead: staff save the new end first and record
//      a new approval of those dates.
//   E. From the starting state again, with the new wording published: the missing dates hold
//      Review, Schedule and the Gmail draft and the fix lands in the editor; the review states
//      the term; a removed date holds it again; a custom response request keeps the term; a
//      date changed after the review no longer matches the reviewed content.
//   F. Another lease whose current term RentVine gives as 11 months adds the current lease's
//      length; a month-to-month lease offers no choice.
// Raw observations go to ctx.record (the private run directory); the row returns booleans only.
//
// Development iteration only: --w1213-parts A,B,C,E,F runs those parts; a check whose parts did
// not all run is left out (not recorded), so such a run never reads Yes.
import {
  bounceSentMessage,
  deliverOwnerReply,
  refusedConnections,
  setOwnerRoster,
  setRentvineOutage,
  setSourceCycleDate,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import {
  confirmReview,
  openOwnerReview,
  reachPrimary,
  refreshData,
  reviewText,
  stepScheduleButton,
  waitForPrimary,
} from "./one-path-november-12-journeys.mjs";
import {
  PREPARATION_ROUTE,
  REFRESH_ROUTE,
  WORKING_ROUTE,
  WORKSPACE_ROUTE,
} from "./one-path-november-12-kit.mjs";
import { serverProviderCalls } from "./one-path-november-12-provider-log.mjs";

const PACKET_INPUTS_ROUTE = "/api/lease-renewal/packet-inputs";
const PARTS = ["A", "B", "C", "E", "F"];
/** The spec's words (R-S285-1 to R-S285-6) and the earlier suites' words they sit beside. */
const WORDS = {
  choiceLine: "Choose a term for the end date, or enter the end date.",
  enterEnd:
    "The renewal start falls on a day that does not repeat in the end month. Enter the renewal end date.",
  standardBasis: "12 month term chosen by staff",
  currentBasis: "current lease length chosen by staff",
  termChanged:
    "The saved end date was chosen as a 12 month term and no longer matches the start date. Review the end date.",
  dayAfter: "Use the day after the current lease ends",
  ready: "New owner wording that asks about the term is ready to publish.",
  reviewWording: "Review the new owner wording",
  publish: "Publish the new owner wording",
  keep: "Keep the current wording",
  published:
    "The new owner wording is published. Owner messages now state the renewal term.",
  wordingUpdated: "The owner message wording was updated",
  datesLine: "Renewal dates: enter the start and end",
  datesReady: "Renewal dates: Ready",
  datesFix: "Enter the renewal dates",
  asked: "The message asked about the rent and these dates.",
  datesChanged: "The renewal dates changed after the owner message was sent.",
  selected:
    "Selected because this reply came from the address the owner message was sent to.",
  recommendation:
    /Our reviewed rental analysis suggests \$[\d,]+(?:\.\d{2})? per month\./,
  v20Request:
    "Take a look below at similar units currently available in that price range and let us know how you want to proceed with this year's rent increase.",
  v21Request:
    "Take a look below at similar units currently available in that price range and let us know how you want to proceed with this year's rent and whether the renewal term works for you.",
  termAny: /The renewal term would run from/g,
  heldOwner: "Owner message held",
  updateOwner: "Review the updated owner message",
  outOfDate: "Scheduled owner message is out of date.",
  coversBaseOnly:
    "The base rent only. The renewal dates and other charges are not covered.",
  exactTerms:
    "This answer covers the base rent and the renewal dates, so Documents asks for no second approval of the dates.",
  amountOnly:
    "This answer covers the base rent only. Documents will ask for the owner's approval of the renewal dates and charges.",
  unavailableRoster: "The lease's current owner list could not be read",
};
const consequence = (count) =>
  count <= 0
    ? "Publishing changes the owner message. No unsent owner message was reviewed with the current wording, so none will be held for review."
    : count === 1
      ? "Publishing changes the owner message. 1 unsent owner message was reviewed with the current wording and will be held for review."
      : `Publishing changes the owner message. ${count} unsent owner messages were reviewed with the current wording and will be held for review.`;
const termSentence = (start, end) =>
  `The renewal term would run from ${usDate(start)} through ${usDate(end)}.`;
const SECOND_OWNER = "Example Second Owner";
const UNLISTED_SENDER = "example.unlisted.sender@example.invalid";
/** A reply that names an amount and a term; neither may be read into the answer (AC-S285-5). */
const DISTRACTING_REPLY =
  "Synthetic reply from the sole owner: yes, approved. If it helps, $1,999.00 for an 18 month term through 06/30/2028.";
const DISTRACTING_DATE = "06/30/2028";
const SIX_MONTH_END = (start) => proposeEnd(start, 6);
/** The other lease (11 months as RentVine serves it below) and the month-to-month lease. */
const LENGTH_LEASE = 9110;
const LENGTH_LEASE_END = "2026-12-31";
const MONTH_TO_MONTH_LEASE = 9135;
/** A RentVine read outage: the lease's owner roster cannot be read. */
const OUTAGE_PATH = "leases/export";
/** Request paths that would write to a provider or hand off a packet (AC-S285-5). */
const PROVIDER_WRITE_PATHS =
  /rentvine-writeback|writeback-approvals|writeback-execute|operating-sheet|sheet-writeback|document-handoff|filled-artifact|dotloop/;
const PROVIDER_HOSTS =
  /rentvine|googleapis|sheets|dotloop|gmail|rentometer|zillow|rentcast/i;

const squash = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
const usDate = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const count = (text, pattern) => (String(text ?? "").match(pattern) ?? []).length;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
/** The text of an HTML part as a reader sees it. */
const htmlText = (html) =>
  squash(
    String(html ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&#39;|&#x27;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#x2F;|&#47;/g, "/")
      .replace(/&amp;/g, "&"),
  );

/** R-S285-1: the day before the same calendar day `months` later, or null when it does not repeat. */
function proposeEnd(startIso, months) {
  const [year, month, day] = String(startIso).split("-").map(Number);
  const total = month - 1 + months;
  const anniversary = new Date(Date.UTC(year + Math.floor(total / 12), total % 12, day));
  if (anniversary.getUTCDate() !== day) return null;
  return new Date(anniversary.getTime() - 86_400_000).toISOString().slice(0, 10);
}
const twelveLabel = (start) =>
  `Use a 12 month term (ends ${usDate(proposeEnd(start, 12))})`;

/** Central wall-clock time `minutesAgo` ago, as a datetime-local input value. */
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

/** A fix that opens another control moves focus after it renders. */
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

function developmentParts() {
  const index = process.argv.indexOf("--w1213-parts");
  if (index < 0) return new Set(PARTS);
  return new Set(
    String(process.argv[index + 1] ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

// ---- Reads ---------------------------------------------------------------------------------------

async function workingRecord(kit, page, leaseId) {
  return (await kit.read(page, `${WORKING_ROUTE}?leaseId=${leaseId}`))?.record ?? null;
}
const entryOf = (record, field) => {
  const entry = record?.fields?.[field] ?? null;
  return entry
    ? {
        value: entry.value ?? null,
        context: entry.context ?? null,
        revision: entry.revision ?? null,
        origin: entry.origin ?? null,
      }
    : null;
};
async function ownerCopy(kit, page, leaseId) {
  const view = await kit.read(
    page,
    `${PREPARATION_ROUTE}?leaseId=${leaseId}&channel=owner`,
  );
  return view?.ownerCopy ?? null;
}
async function ownerResponse(kit, page, leaseId) {
  const workspace = await kit.read(page, `${WORKSPACE_ROUTE}?leaseId=${leaseId}`);
  return workspace?.state?.ownerResponse ?? null;
}
/** The stored answer holds no address: no key that names one and no address as a value. */
function holdsNoAddress(value) {
  const text = JSON.stringify(value ?? null);
  return !/@/.test(text) && !/"[^"]*(?:email|address|sender)[^"]*"\s*:/i.test(text);
}
async function ownerSequences(kit, leaseId) {
  return kit.sequences(leaseId, "renewal_owner");
}
/** The incoming messages read onto the lease's owner threads, counted by their kind. */
async function evidenceKinds(kit, leaseId) {
  const counts = {};
  for (const sequence of await ownerSequences(kit, leaseId))
    for (const entry of sequence.inbound ?? [])
      counts[entry?.kind ?? "unknown"] = (counts[entry?.kind ?? "unknown"] ?? 0) + 1;
  return counts;
}
/** Every unsent authorized owner message on every lease that is held now. */
async function heldOwnerMessages(kit) {
  const documents = await kit.listDocuments("gmail_communication_sequences");
  return documents.filter((document) => {
    const fields = document.fields ?? {};
    const purpose = fields.context?.mapValue?.fields?.purpose?.stringValue ?? null;
    return (
      purpose === "renewal_owner" &&
      fields.state?.stringValue === "paused" &&
      fields.authorization?.mapValue !== undefined &&
      Number(fields.confirmedCount?.integerValue ?? 0) === 0
    );
  }).length;
}
const tickCounts = (tick) => ({
  sent: Number(tick?.sent ?? 0),
  held: Number(tick?.held ?? 0),
  failures: Number(tick?.failures ?? 0),
});

// ---- Working renewal terms -------------------------------------------------------------------------

/** Ask the owner's Working renewal terms, opened as staff open it (Full view when not on the step). */
async function openWorkingTerms(kit, page, leaseId) {
  await kit.openLease(page, leaseId, "?step=ask-owner");
  const terms = page.locator("details[data-renewal-working-terms]:visible").first();
  if (await kit.shownWithin(terms, 30_000)) await kit.openDisclosure(terms);
  else {
    await kit.openLease(page, leaseId, "?view=full#renewal-working-terms");
    await kit.reveal(page, "#renewal-working-terms-end");
  }
  await page.locator("#renewal-working-terms-end").first().waitFor({ timeout: 60_000 });
}

/** The end field as staff read it: its choices, lines, attribution and value. */
async function readEnd(page) {
  return page
    .locator("#renewal-working-terms-end")
    .first()
    .evaluate((node) => {
      const text = (element) =>
        (element?.textContent ?? "").replace(/\s+/g, " ").trim() || null;
      const suggestion = node.querySelector(
        '[data-renewal-field="renewal-end-suggestion"]',
      );
      const holder = node.closest("[data-renewal-working-terms]") ?? document;
      return {
        value: node.querySelector('input[type="date"]')?.value || null,
        choices: suggestion
          ? [...suggestion.querySelectorAll("button")].map((button) => text(button))
          : [],
        choiceLine: suggestion ? text(suggestion.querySelector("p")) : null,
        enter: text(node.querySelector('[data-renewal-field="renewal-end-enter"]')),
        attribution: text(node.querySelector(".working-field-attribution")),
        termChanged: [
          ...holder.querySelectorAll('[data-renewal-field="renewal-end-term-changed"]'),
        ]
          .filter((element) => element.getClientRects().length > 0)
          .map((element) => text(element)),
      };
    });
}
/** Read the end field until `accept` takes it (the field reads the record after it renders). */
async function settledEnd(page, accept, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let read = await readEnd(page);
  while (!accept(read) && Date.now() < deadline) {
    await page.waitForTimeout(750);
    read = await readEnd(page);
  }
  return read;
}

/** Type a renewal start in Working effective date; resolves with the save's status. */
async function typeStart(kit, page, iso, staff) {
  const field = page.locator('#renewal-working-terms-start input[type="date"]').first();
  await field.waitFor({ timeout: 30_000 });
  const saved = kit
    .appResponse(page, WORKING_ROUTE, {
      match: (body) => body?.field === "terms_effective_date",
      timeout: 60_000,
    })
    .catch(() => null);
  await field.fill(iso);
  await field.blur();
  const status = (await saved)?.status() ?? null;
  if (status !== null) staff.startSaves += 1;
  return status;
}
/** Type a renewal end; resolves with the save's status. */
async function typeEnd(kit, page, iso, staff) {
  const field = page.locator('#renewal-working-terms-end input[type="date"]').first();
  await field.waitFor({ timeout: 30_000 });
  const saved = kit
    .appResponse(page, WORKING_ROUTE, {
      match: (body) => body?.field === "terms_end_date",
      timeout: 60_000,
    })
    .catch(() => null);
  await field.fill(iso);
  await field.blur();
  const status = (await saved)?.status() ?? null;
  if (status !== null) staff.endSaves += 1;
  return status;
}
/** One of the end choices, by its exact label; resolves with the save's status. */
async function chooseEnd(kit, page, label, staff) {
  const button = page
    .locator('#renewal-working-terms-end [data-renewal-field="renewal-end-suggestion"]')
    .getByRole("button", { name: label, exact: true });
  await button.waitFor({ timeout: 30_000 });
  const saved = kit
    .appResponse(page, WORKING_ROUTE, {
      match: (body) => body?.field === "terms_end_date",
      timeout: 60_000,
    })
    .catch(() => null);
  await button.click();
  const status = (await saved)?.status() ?? null;
  if (status !== null) staff.endSaves += 1;
  return status;
}
/** "Use the day after the current lease ends"; resolves with the save's status. */
async function chooseDayAfter(kit, page, staff) {
  const choice = page
    .locator("#renewal-working-terms-start")
    .getByRole("button", { name: WORDS.dayAfter, exact: true });
  await choice.waitFor({ timeout: 30_000 });
  const saved = kit
    .appResponse(page, WORKING_ROUTE, {
      match: (body) => body?.field === "terms_effective_date",
      timeout: 60_000,
    })
    .catch(() => null);
  await choice.click();
  const status = (await saved)?.status() ?? null;
  if (status !== null) staff.startSaves += 1;
  return status;
}
/** "Clear the working value" on the end; resolves with the save's status. */
async function clearEnd(kit, page, staff) {
  const button = page
    .locator("#renewal-working-terms-end")
    .getByRole("button", { name: "Clear the working value", exact: true });
  await button.waitFor({ timeout: 30_000 });
  const saved = kit
    .appResponse(page, WORKING_ROUTE, {
      match: (body) => body?.field === "terms_end_date",
      timeout: 60_000,
    })
    .catch(() => null);
  await button.click();
  const status = (await saved)?.status() ?? null;
  if (status !== null) staff.endSaves += 1;
  return status;
}

// ---- Ask the owner: readiness, review, schedule ---------------------------------------------------

/** The step's "What sending needs" lines, each with its readiness. */
async function sendingNeeds(page) {
  return page.locator('ul[aria-label="What sending needs"] > li').evaluateAll((nodes) =>
    nodes
      .filter((node) => node.getClientRects().length > 0 || node.textContent)
      .map((node) => ({
        text: (node.textContent ?? "").replace(/\s+/g, " ").trim(),
        ready: node.getAttribute("data-renewal-ready"),
      })),
  );
}
const datesItem = (needs) =>
  needs.find((item) => /^Renewal dates\b/.test(item.text)) ?? null;

/**
 * Ask the owner, read once its primary settles. When the step asks for a fresh RentVine read
 * first, staff use "Refresh data" (at most twice), as reachPrimary does.
 */
async function askOwner(ctx, page, leaseId, wanted = () => false) {
  const { kit } = ctx;
  let primary = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await kit.openLease(page, leaseId, "?step=ask-owner");
    primary = await waitForPrimary(ctx, page, wanted, 60_000);
    if (wanted(primary) || attempt === 2) break;
    const nowText = await kit.visibleText(kit.now(page));
    const wantsRead =
      /fresh admitted source read|Refresh data|re-read|being read/i.test(nowText) ||
      /refresh/i.test(primary ?? "");
    if (!wantsRead) break;
    await refreshData(ctx, page);
  }
  await page.waitForTimeout(1000);
  return {
    primary,
    now: await kit.visibleText(kit.now(page)),
    needs: await sendingNeeds(page),
  };
}

/**
 * The owner message's own editor (its inputs, the email body and the Gmail draft group), shown
 * the way staff reach it: its disclosure on the step, else Full view. Resolves true when shown.
 */
async function revealOwnerMessage(kit, page, leaseId) {
  const selector = "#renewal-message-owner-inputs";
  if (await kit.reveal(page, selector, 45_000)) return true;
  await kit.openLease(page, leaseId, "?view=full");
  return kit.reveal(page, selector, 45_000);
}
async function ownerBody(kit, page, leaseId) {
  const shown = await revealOwnerMessage(kit, page, leaseId);
  await kit.reveal(page, "#renewal-message-owner-body", 15_000);
  const body = await page
    .locator("#renewal-message-owner-body")
    .first()
    .inputValue()
    .catch(() => null);
  return { shown, body: squash(body) };
}

/** The owner message's review dialog in schedule mode, as staff open it. */
async function openScheduleReview(ctx, page, leaseId) {
  await reachPrimary(ctx, page, leaseId, "ask-owner", "Review owner message");
  const trigger = await stepScheduleButton(ctx, page);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Review and schedule" });
  await dialog
    .locator('[data-renewal-field="exact-review"]')
    .waitFor({ timeout: 120_000 });
  return dialog;
}
/** Schedule the owner message; resolves with the record id and the reviewed body. */
async function scheduleOwnerMessage(ctx, page, leaseId) {
  const dialog = await openScheduleReview(ctx, page, leaseId);
  const body = await reviewBody(ctx, dialog);
  const scheduled = await confirmReview(
    ctx,
    page,
    dialog,
    "Schedule this message",
    "schedule",
  );
  if (scheduled.status === null) ctx.unresolved("W12-13 schedule: no answer");
  return { ...scheduled, body };
}
async function reviewBody(ctx, dialog) {
  const body = dialog.locator('[data-renewal-field="review-body"]').first();
  return (await ctx.kit.shownWithin(body, 10_000))
    ? ctx.kit.visibleText(body)
    : reviewText(ctx, dialog);
}

/** The term sentence's place in one message text: once, directly after the recommendation. */
function termPlacement(text, start, end) {
  const sentence = termSentence(start, end);
  const squashed = squash(text);
  const recommendation = WORDS.recommendation.exec(squashed);
  const after = recommendation
    ? squashed.slice(recommendation.index + recommendation[0].length).trimStart()
    : "";
  return {
    once: count(squashed, new RegExp(escape(sentence), "g")) === 1,
    termCount: count(squashed, WORDS.termAny),
    afterRecommendation: Boolean(recommendation) && after.startsWith(sentence),
    v21Request: squashed.includes(WORDS.v21Request),
    v20Request: squashed.includes(WORDS.v20Request),
  };
}

// ---- The owner wording publication (an Approver's page) -----------------------------------------

async function openPublication(kit, approver, leaseId) {
  const selector = '[data-renewal-field="owner-wording-publication"]';
  await kit.openLease(approver, leaseId, "?step=ask-owner");
  if (!(await kit.reveal(approver, selector, 45_000))) {
    await kit.openLease(approver, leaseId, "?view=full");
    await kit.reveal(approver, selector, 45_000);
  }
  return approver.locator(selector).first();
}
/** "Review the new owner wording": the stated count and the consequence line. */
async function previewPublication(kit, approver, block, staff) {
  const answer = kit
    .appResponse(approver, PREPARATION_ROUTE, {
      match: (body) => body?.kind === "publish_owner_copy" && !body?.confirm,
      timeout: 120_000,
    })
    .catch(() => null);
  await block.getByRole("button", { name: WORDS.reviewWording, exact: true }).click();
  const response = await answer;
  if (response) staff.publishRequests += 1;
  const body = response ? await response.json().catch(() => null) : null;
  const line = block.locator('[data-renewal-field="owner-wording-consequence"]');
  return {
    status: response?.status() ?? null,
    heldCount: typeof body?.heldCount === "number" ? body.heldCount : null,
    line: (await kit.shownWithin(line, 30_000)) ? await kit.visibleText(line) : null,
  };
}
async function confirmPublication(kit, approver, block, staff) {
  const answer = kit
    .appResponse(approver, PREPARATION_ROUTE, {
      match: (body) => body?.kind === "publish_owner_copy" && Boolean(body?.confirm),
      timeout: 120_000,
    })
    .catch(() => null);
  await block.getByRole("button", { name: WORDS.publish, exact: true }).click();
  const response = await answer;
  if (response) staff.publishRequests += 1;
  const published = approver.locator('[data-renewal-field="owner-wording-published"]');
  return {
    status: response?.status() ?? null,
    line: (await kit.shownWithin(published, 30_000))
      ? await kit.visibleText(published)
      : null,
  };
}
/** An Approver publishes the new wording; resolves with the stated count and the readback. */
async function publishWording(ctx, approver, leaseId, staff) {
  const { kit } = ctx;
  const block = await openPublication(kit, approver, leaseId);
  const ready = (await kit.shownWithin(block, 10_000))
    ? await kit.visibleText(block)
    : "";
  const preview = await previewPublication(kit, approver, block, staff);
  const publish = await confirmPublication(kit, approver, block, staff);
  const copy = await ownerCopy(kit, approver, leaseId);
  return {
    ready: ready.includes(WORDS.ready),
    preview,
    publish,
    version: copy?.version ?? null,
    ok:
      ready.includes(WORDS.ready) &&
      preview.status === 200 &&
      preview.line === consequence(preview.heldCount ?? -1) &&
      publish.status === 200 &&
      publish.line === WORDS.published &&
      copy?.version === "v2.1",
  };
}

// ---- Record the owner's answer ---------------------------------------------------------------------

/** The Now card's reply form, as staff reach it while the owner has replied. */
async function replyForm(ctx, page, leaseId) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, "?step=ask-owner");
  await kit.primaryName(page, 45_000);
  const form = page.locator("#renewal-owner-decision-from-reply");
  return (await kit.shownWithin(form, 30_000)) ? form : null;
}
const replyRadios = (form) =>
  form.getByRole("radio", { name: /^Approved in the reply received/ });
/** Choose the reply whose text includes `marker`; resolves with its index or -1. */
async function chooseReply(kit, form, marker) {
  const radios = replyRadios(form);
  const total = await radios.count();
  for (let index = 0; index < total; index += 1) {
    await radios.nth(index).check();
    // The preview reads the chosen reply again; the earlier reply's text leaves first.
    await form.page().waitForTimeout(1000);
    const body = form.locator(
      'section[aria-label="Owner reply"] .renewal-owner-reply-body',
    );
    const deadline = Date.now() + 20_000;
    let text = "";
    while (Date.now() < deadline) {
      text = (await kit.shownWithin(body, 2_000)) ? await kit.visibleText(body) : "";
      if (text) break;
      await form.page().waitForTimeout(500);
    }
    if (text.includes(marker)) return index;
  }
  return -1;
}
/** Who approved, the reason line and the coverage, as the open form shows them. */
async function readAnswer(kit, scope, whoLabel) {
  const who = scope.getByLabel(whoLabel, { exact: true });
  const whoShown = await kit.shownWithin(who, 10_000);
  const read = await scope.evaluate((node) => {
    const text = (element) => (element?.textContent ?? "").replace(/\s+/g, " ").trim();
    const visible = (selector) =>
      [...node.querySelectorAll(selector)]
        .filter((element) => element.getClientRects().length > 0)
        .map(text);
    const radio = (value) => node.querySelector(`input[type="radio"][value="${value}"]`);
    const exact = radio("exact_terms");
    return {
      amountOnlyChecked: radio("amount_only")?.checked ?? null,
      exactShown: Boolean(exact),
      exactChecked: exact?.checked ?? null,
      exactLabel: exact ? text(exact.closest("label")) : null,
      asked: visible('[data-renewal-field="owner-answer-message-asked"]'),
      datesChanged: visible('[data-renewal-field="owner-answer-dates-changed"]'),
      selectedLine: visible('[data-renewal-field="owner-approver-selected"]'),
      unavailable: visible('[data-renewal-field="owner-approval-unavailable"]'),
      amount:
        node.querySelector('[data-renewal-field="owner-answer-amount"] input')?.value ??
        null,
      text: text(node).slice(0, 1500),
    };
  });
  return {
    ...read,
    whoShown,
    who: whoShown ? await who.inputValue() : null,
    whoText: whoShown
      ? squash(
          await who.evaluate((select) => select.selectedOptions[0]?.textContent ?? ""),
        )
      : null,
    owners: whoShown
      ? await who.locator("option").evaluateAll((nodes) =>
          nodes
            .filter((option) => option.value && option.value !== "representative")
            .map((option) => ({
              value: option.value,
              text: (option.textContent ?? "").replace(/\s+/g, " ").trim(),
            })),
        )
      : [],
  };
}
/** "Same as recommended", then "Review the owner's answer": the review's rows. */
async function reviewAnswer(
  kit,
  page,
  scope,
  reviewButtonName = "Review the owner's answer",
) {
  const same = scope.getByRole("button", { name: /^Same as recommended \(/ });
  if (await kit.shownWithin(same, 10_000)) await same.click();
  await scope.getByRole("button", { name: reviewButtonName, exact: true }).click();
  const review = page.getByRole("region", { name: "Review the owner's answer" });
  await review.waitFor({ timeout: 30_000 });
  const field = (name) =>
    kit.visibleText(review.locator(`[data-renewal-field="${name}"]`).first());
  return {
    review,
    read: {
      covers: await field("owner-answer-coverage"),
      statement: await field("owner-answer-coverage-statement"),
      approved: await field("owner-answer-approved"),
      evidence: squash(await review.innerText()).slice(0, 600),
    },
  };
}
async function saveAnswer(kit, page, review, staff) {
  const saved = kit
    .appResponse(page, WORKSPACE_ROUTE, {
      match: (body) => body?.action?.kind === "owner_response",
      timeout: 120_000,
    })
    .catch(() => null);
  await review
    .getByRole("button", { name: "Save the owner's answer", exact: true })
    .click();
  const status = (await saved)?.status() ?? null;
  if (status !== null) staff.ownerResponses += 1;
  return status;
}
/** The Owner response form's approval, opened as staff open it (a new approval when one exists). */
async function manualApproval(kit, page, leaseId) {
  const selector = "#renewal-manual-owner_response";
  await kit.openLease(page, leaseId, "?step=ask-owner");
  if (!(await kit.reveal(page, selector, 45_000))) {
    await kit.openLease(page, leaseId, "?view=full");
    if (!(await kit.reveal(page, selector, 45_000)))
      throw new Error(`Lease ${leaseId} shows no Owner response form.`);
  }
  const form = page.locator(selector);
  const again = form.getByRole("button", { name: "Record a new approval", exact: true });
  if (await kit.shownWithin(again, 10_000)) await again.click();
  else
    await form
      .getByLabel("Owner response", { exact: true })
      .selectOption({ label: "Approved" });
  const approval = form.locator('[data-renewal-field="owner-answer-approval"]');
  await approval.waitFor({ timeout: 30_000 });
  return approval;
}
/** In the Owner response form: How they approved = the linked reply, the reply chosen by index. */
async function chooseLinkedReply(approval, index = -1) {
  await approval
    .getByLabel("How they approved", { exact: true })
    .selectOption("linked_reply");
  const reply = approval.getByLabel("Reply", { exact: true });
  await reply.waitFor({ timeout: 15_000 });
  const values = await reply
    .locator("option")
    .evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));
  if (!values.length) return { replies: 0 };
  await reply.selectOption(values.at(index));
  return { replies: values.length };
}

/** Wait out the source refresh throttle and report the exact current source result. */
async function readOwnerRosterAgain(ctx, page) {
  const button = page.getByRole("button", { name: "Refresh data", exact: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const received = ctx.kit
      .appResponse(page, REFRESH_ROUTE, {
        match: (body) => body?.mode === "force",
        timeout: 60_000,
      })
      .catch(() => null);
    await button.click({ timeout: 30_000 });
    const response = await received;
    const body = response ? await response.json().catch(() => null) : null;
    if (!body?.throttled || attempt === 1) return { status: response?.status(), body };
    await page.waitForTimeout(10_000);
  }
}

/** What Documents shows about the owner's approval: its packet inputs, opened as staff open them. */
async function documentsApproval(kit, page, leaseId) {
  await kit.openLease(page, leaseId, "?step=documents");
  let open = page
    .getByRole("button", { name: "Open packet inputs", exact: true })
    .first();
  let via = "Documents step";
  if (!(await kit.shownWithin(open, 30_000))) {
    await kit.openLease(page, leaseId, "?view=full");
    await kit.reveal(page, `#packet-inputs-${leaseId}`, 30_000);
    open = page.getByRole("button", { name: "Open packet inputs", exact: true }).first();
    via = "Full view";
  }
  if (await kit.shownWithin(open, 20_000)) {
    const read = kit
      .appResponse(page, PACKET_INPUTS_ROUTE, { method: "GET", timeout: 120_000 })
      .catch(() => null);
    await open.click();
    await read;
    const status = page.locator("[data-owner-approval]").first();
    if (await kit.shownWithin(status, 60_000))
      return {
        via,
        state: await status.getAttribute("data-owner-approval"),
        text: await kit.visibleText(status),
      };
  }
  const view = await kit.read(page, `${PACKET_INPUTS_ROUTE}?leaseId=${leaseId}`);
  return {
    via: "packet inputs read",
    state: view?.ownerApproval?.state ?? null,
    text: view?.ownerApproval?.notice ?? null,
  };
}
const documentsAskNothing = (read) =>
  read?.state === "current" &&
  !/renewal dates|effective date|end date/i.test(read?.text ?? "");

/** Communications as staff read it: this lease's owner card and its held lines. */
async function communicationsCard(kit, page, leaseId) {
  await kit.openPath(page, "/gmail-hub");
  await page.getByRole("tab", { name: "Outgoing", exact: true }).click();
  const card = page
    .locator('[role="tabpanel"] article.ui-card')
    .filter({ hasText: `renewal owner · Lease ${leaseId}` })
    .first();
  if (!(await kit.shownWithin(card, 60_000)))
    return { shown: false, lines: [], text: "" };
  return {
    shown: true,
    text: await kit.visibleText(card),
    lines: (
      await card
        .locator('[data-communication-field="pause-changed-inputs"] li')
        .allInnerTexts()
    ).map(squash),
  };
}

// ---- The row -------------------------------------------------------------------------------------

/**
 * W12-13 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1213 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S285-1 to AC-S285-5 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1213(ctx, page, start) {
  const { kit, rehearsal } = ctx;
  const leaseId = ctx.leases.prepared.leaseId;
  const assistedId = ctx.leases.assisted?.leaseId ?? 9103;
  const owners = kit.ownerAddresses(leaseId);
  const tenants = kit.tenantAddresses(leaseId);
  const parts = developmentParts();
  const ran = new Set();
  const errors = {};
  const results = {};
  /** Each staff action this row takes that writes, for AC-S285-5. */
  const staff = {
    endSaves: 0,
    startSaves: 0,
    ownerResponses: 0,
    publishRequests: 0,
    ownerSends: 0,
  };
  const writesAtStart = ctx.writes.length;
  const providerRefusalsAtStart = refusedConnections(rehearsal).filter((entry) =>
    PROVIDER_HOSTS.test(String(entry.host ?? "")),
  ).length;
  /**
   * The mail each part sent, from the stand-in's count at the part's start (a reset starts the
   * stand-ins again and the seed sends the replied lease's message) to its end.
   */
  const mail = [];
  const mailCounts = async () => ({
    toOwner: (await kit.sentTo(owners)).length,
    toTenant: (await kit.sentTo(tenants)).length,
    all: (await kit.sentMail()).length,
  });
  let mailMark = await mailCounts();
  const markMail = async () => {
    mailMark = await mailCounts();
  };
  const noteMail = async (part, expectedOwnerSends) => {
    const now = await mailCounts();
    mail.push({
      part,
      toOwner: now.toOwner - mailMark.toOwner,
      toTenant: now.toTenant - mailMark.toTenant,
      all: now.all - mailMark.all,
      expectedOwnerSends,
    });
  };
  const phase = async (name, body) => {
    try {
      const result = await body();
      results[name] = result;
      const { ok, ...rest } = result ?? {};
      ctx.record({ phase: name, ok: ok ?? null, ...rest });
      return result;
    } catch (error) {
      errors[name] = String(error?.message ?? error).slice(0, 600);
      ctx.record({ phase: name, error: errors[name] });
      results[name] = null;
      return null;
    }
  };
  const ok = (name) => results[name]?.ok === true;
  ctx.record({ phase: "start", error: start.error, observed: start.observed });

  // The starting sequence on the candidate: the start alone is saved, the 12 month choice is
  // offered (one choice for a 12 month lease), the v2.0 message states no term, the reply form
  // opens with the replying owner selected and the coverage on base rent only.
  await phase("starting", async () => {
    const observed = start.observed ?? {};
    const endWrites = ctx.writes
      .slice(0, writesAtStart)
      .filter(
        (write) => write.path === WORKING_ROUTE && write.field === "terms_end_date",
      );
    return {
      endOffer: observed.endOffer ?? null,
      ownerReview: observed.ownerReview ?? null,
      answerForm: observed.answerForm ?? null,
      coverageChecked: observed.coverageChecked ?? null,
      ownerSelected: observed.ownerSelected ?? null,
      endWrites: endWrites.length,
      offered:
        !start.error &&
        observed.startSaved === true &&
        observed.endOffer?.suggestionButtons === 1 &&
        observed.endOffer?.twelveMonthChoice === true,
      noTerm: !start.error && observed.ownerReview?.statesATerm === false,
      selected:
        !start.error &&
        observed.answerForm === "reply" &&
        observed.ownerSelected === true,
      baseOnly: !start.error && observed.coverageChecked === "amount_only",
      ok: !start.error && endWrites.length === 0,
    };
  });

  // ---- A. The end choices and the answer, on the starting state ----------------------------------

  if (parts.has("A")) {
    ran.add("A");
    await phase("boundaries", async () => {
      await openWorkingTerms(kit, page, leaseId);
      const record = await workingRecord(kit, page, leaseId);
      const dayAfter = entryOf(record, "terms_effective_date")?.value ?? null;
      const before = await readEnd(page);
      const cases = [];
      for (const startIso of ["2026-12-01", "2027-01-31", "2027-03-01", "2028-02-29"]) {
        const status = await typeStart(kit, page, startIso, staff);
        const end = proposeEnd(startIso, 12);
        const expected = end ? [twelveLabel(startIso)] : [];
        const read = await settledEnd(page, (value) =>
          end
            ? JSON.stringify(value.choices) === JSON.stringify(expected)
            : value.choices.length === 0 && value.enter === WORDS.enterEnd,
        );
        cases.push({
          start: startIso,
          status,
          expected,
          choices: read.choices,
          enter: read.enter,
          choiceLine: read.choiceLine,
          ok:
            status === 200 &&
            JSON.stringify(read.choices) === JSON.stringify(expected) &&
            (end
              ? read.choiceLine === WORDS.choiceLine && read.enter === null
              : read.enter === WORDS.enterEnd),
        });
      }
      // Back to the day after the current lease ends, the start the 12 month choice is made from.
      const restored = await typeStart(kit, page, dayAfter, staff);
      const after = await settledEnd(
        page,
        (value) =>
          JSON.stringify(value.choices) === JSON.stringify([twelveLabel(dayAfter)]),
      );
      return {
        dayAfter,
        before,
        cases,
        restored,
        after: after.choices,
        // The leap-year end and the February 29 start are both in the set.
        ok:
          /^\d{4}-\d{2}-\d{2}$/.test(String(dayAfter)) &&
          JSON.stringify(before.choices) === JSON.stringify([twelveLabel(dayAfter)]) &&
          cases.length === 4 &&
          cases.every((entry) => entry.ok) &&
          restored === 200 &&
          JSON.stringify(after.choices) === JSON.stringify([twelveLabel(dayAfter)]),
      };
    });
    const dayAfter = results.boundaries?.dayAfter ?? null;

    await phase("choose12", async () => {
      if (!dayAfter) throw new Error("No renewal start was read.");
      const endWritesBefore = ctx.writes.filter(
        (write) => write.path === WORKING_ROUTE && write.field === "terms_end_date",
      ).length;
      const status = await chooseEnd(kit, page, twelveLabel(dayAfter), staff);
      const read = await settledEnd(page, (value) => value.choices.length === 0);
      const entry = entryOf(await workingRecord(kit, page, leaseId), "terms_end_date");
      return {
        endWritesBefore,
        status,
        read,
        entry,
        ok:
          endWritesBefore === 0 &&
          status === 200 &&
          entry?.value === proposeEnd(dayAfter, 12) &&
          entry?.context === WORDS.standardBasis &&
          read.choices.length === 0 &&
          read.value === proposeEnd(dayAfter, 12) &&
          String(read.attribution ?? "").includes(WORDS.standardBasis),
      };
    });

    await phase("startAfterSave", async () => {
      if (!dayAfter) throw new Error("No renewal start was read.");
      const later = "2027-02-01" === dayAfter ? "2027-03-01" : "2027-02-01";
      const changed = await typeStart(kit, page, later, staff);
      const read = await settledEnd(page, (value) =>
        value.termChanged.includes(WORDS.termChanged),
      );
      const entry = entryOf(await workingRecord(kit, page, leaseId), "terms_end_date");
      const restored = await typeStart(kit, page, dayAfter, staff);
      const clean = await settledEnd(page, (value) => value.termChanged.length === 0);
      return {
        later,
        changed,
        termChanged: read.termChanged,
        entry,
        restored,
        cleanAfter: clean.termChanged,
        ok:
          changed === 200 &&
          read.termChanged.includes(WORDS.termChanged) &&
          read.choices.length === 0 &&
          entry?.value === proposeEnd(dayAfter, 12) &&
          entry?.context === WORDS.standardBasis &&
          restored === 200 &&
          clean.termChanged.length === 0,
      };
    });

    // The reply from the sole owner, after the 12 month end was saved: the message stated no term.
    await phase("replyNoTerm", async () => {
      const form = await replyForm(ctx, page, leaseId);
      if (!form) throw new Error("The reply form is not shown.");
      const radios = await replyRadios(form).count();
      const index = await chooseReply(kit, form, "Synthetic reply from the sole owner");
      const read = await readAnswer(kit, form, "Who approved in this reply");
      // Staff change the selection: the line goes, and their choice is kept.
      const who = form.getByLabel("Who approved in this reply", { exact: true });
      await who.selectOption("");
      await page.waitForTimeout(500);
      const changed = await readAnswer(kit, form, "Who approved in this reply");
      await who.selectOption(read.who ?? "");
      await page.waitForTimeout(500);
      const chosenAgain = await readAnswer(kit, form, "Who approved in this reply");
      const end = proposeEnd(dayAfter, 12);
      return {
        radios,
        index,
        read: { ...read, text: undefined },
        changed: { who: changed.who, selectedLine: changed.selectedLine },
        chosenAgain: { who: chosenAgain.who, selectedLine: chosenAgain.selectedLine },
        selected:
          radios === 1 &&
          index === 0 &&
          Boolean(read.who) &&
          read.owners.length === 1 &&
          read.whoText === `${read.owners[0]?.text}` &&
          read.selectedLine.length === 1 &&
          read.selectedLine[0] === WORDS.selected &&
          changed.who === "" &&
          changed.selectedLine.length === 0 &&
          chosenAgain.who === read.who &&
          chosenAgain.selectedLine.length === 0,
        // R-S285-4: a message that stated no term opens on base rent only, the dates offered.
        noTerm:
          read.amountOnlyChecked === true &&
          read.exactShown === true &&
          read.exactChecked === false &&
          read.exactLabel ===
            `Base rent and the renewal dates, ${usDate(dayAfter)} to ${usDate(end)}` &&
          read.asked.length === 0 &&
          read.datesChanged.length === 0 &&
          read.amount === "",
        ok: true,
      };
    });

    // Another channel: Conversation selects nothing; the linked reply selects the owner.
    await phase("manualChannels", async () => {
      const approval = await manualApproval(kit, page, leaseId);
      await approval
        .getByLabel("How they approved", { exact: true })
        .selectOption("conversation");
      await page.waitForTimeout(500);
      const conversation = await readAnswer(kit, approval, "Who approved");
      const linked = await chooseLinkedReply(approval);
      await page.waitForTimeout(800);
      const reply = await readAnswer(kit, approval, "Who approved");
      return {
        conversation: {
          who: conversation.who,
          selectedLine: conversation.selectedLine,
        },
        linked,
        reply: {
          who: reply.who,
          whoText: reply.whoText,
          selectedLine: reply.selectedLine,
        },
        ok:
          conversation.who === "" &&
          conversation.selectedLine.length === 0 &&
          linked.replies === 1 &&
          Boolean(reply.who) &&
          reply.selectedLine.length === 1 &&
          reply.selectedLine[0] === WORDS.selected,
      };
    });

    // A message from an address the owner message never went to, and an automatic reply: both are
    // read onto the lease's thread, neither is offered as the owner's reply, nothing is selected.
    await phase("otherReplies", async () => {
      const kindsBefore = await evidenceKinds(kit, leaseId);
      await deliverOwnerReply(rehearsal, {
        to: owners[0],
        from: UNLISTED_SENDER,
        text: "Synthetic message from an address the owner message never went to.",
      });
      await deliverOwnerReply(rehearsal, {
        to: owners[0],
        automatic: true,
        text: "Synthetic automatic reply: this mailbox is not monitored today.",
      });
      const tick = tickCounts(await kit.tick());
      const kinds = await evidenceKinds(kit, leaseId);
      const form = await replyForm(ctx, page, leaseId);
      if (!form) throw new Error("The reply form is not shown after the replies.");
      const radios = await replyRadios(form).count();
      const unlisted = await chooseReply(kit, form, "never went to");
      const automatic = await chooseReply(kit, form, "automatic reply");
      return {
        tick,
        kindsBefore,
        kinds,
        radios,
        unlisted,
        automatic,
        ok:
          tick.failures === 0 &&
          (kinds.uncertain ?? 0) === (kindsBefore.uncertain ?? 0) + 1 &&
          (kinds.auto_reply ?? 0) === (kindsBefore.auto_reply ?? 0) + 1 &&
          (kinds.human ?? 0) === (kindsBefore.human ?? 0) &&
          radios === 1 &&
          unlisted === -1 &&
          automatic === -1,
      };
    });

    // A failed delivery returned for the owner message: read, and never a reply to choose.
    await phase("bounce", async () => {
      const kindsBefore = await evidenceKinds(kit, leaseId);
      await bounceSentMessage(rehearsal, { to: owners[0] });
      const tick = tickCounts(await kit.tick());
      const kinds = await evidenceKinds(kit, leaseId);
      const form = await replyForm(ctx, page, leaseId);
      let radios = null;
      let viaManual = null;
      if (form) radios = await replyRadios(form).count();
      else {
        const approval = await manualApproval(kit, page, leaseId);
        viaManual = await chooseLinkedReply(approval);
      }
      return {
        tick,
        kindsBefore,
        kinds,
        form: Boolean(form),
        radios,
        viaManual,
        ok:
          tick.failures === 0 &&
          (kinds.bounce ?? 0) === (kindsBefore.bounce ?? 0) + 1 &&
          (kinds.human ?? 0) === (kindsBefore.human ?? 0) &&
          (form ? radios === 1 : viaManual?.replies === 1),
      };
    });

    // The owner's reply came from the address the message went to, and no owner of record has it
    // now (RentVine changed the owners): nothing is selected.
    await phase("noRosterOwner", async () => {
      setOwnerRoster(rehearsal, leaseId, [
        { name: "Example Other Owner", email: "example.other.owner@example.invalid" },
      ]);
      try {
        await kit.openLease(page, leaseId, "?step=ask-owner");
        const refreshed = await readOwnerRosterAgain(ctx, page);
        const approval = await manualApproval(kit, page, leaseId);
        const linked = await chooseLinkedReply(approval);
        const read = await readAnswer(kit, approval, "Who approved");
        return {
          refreshed,
          linked,
          owners: read.owners.map((owner) => owner.text),
          who: read.who,
          selectedLine: read.selectedLine,
          ok:
            refreshed?.status === 200 &&
            refreshed.body?.refreshed === true &&
            refreshed.body.lastError === false &&
            linked.replies === 1 &&
            read.owners.length === 1 &&
            read.owners[0].text.startsWith("Example Other Owner") &&
            read.who === "" &&
            read.selectedLine.length === 0,
        };
      } finally {
        setOwnerRoster(rehearsal, leaseId, null);
        await kit.openLease(page, leaseId, "?step=ask-owner").catch(() => undefined);
        await refreshData(ctx, page).catch(() => undefined);
      }
    });

    // RentVine cannot be read, so the roster cannot: nothing is selected and the form says why.
    await phase("unreadableRoster", async () => {
      let read = null;
      let outageReads = 0;
      let during = null;
      await kit.openLease(page, leaseId, "?step=ask-owner");
      const mark = serverProviderCalls(rehearsal).length;
      try {
        setRentvineOutage(rehearsal, OUTAGE_PATH);
        during = await readOwnerRosterAgain(ctx, page);
        outageReads = serverProviderCalls(rehearsal)
          .slice(mark)
          .filter(
            (call) =>
              call.served === "rentvine" &&
              call.outage === true &&
              call.path?.endsWith(`/${OUTAGE_PATH}`),
          ).length;
        await kit.openLease(page, leaseId, "?step=ask-owner");
        const approval = await manualApproval(kit, page, leaseId);
        read = await readAnswer(kit, approval, "Who approved");
      } catch (error) {
        ctx.record({
          phase: "unreadableRoster",
          during: String(error?.message ?? error),
        });
      } finally {
        setRentvineOutage(rehearsal, null);
      }
      await kit.openLease(page, leaseId, "?step=ask-owner");
      const refreshed = await readOwnerRosterAgain(ctx, page);
      return {
        during,
        outageReads,
        read: read
          ? {
              whoShown: read.whoShown,
              who: read.who,
              selectedLine: read.selectedLine,
              unavailable: read.unavailable,
            }
          : null,
        refreshed,
        ok:
          during?.status === 200 &&
          during.body?.lastError === true &&
          outageReads > 0 &&
          refreshed?.status === 200 &&
          refreshed.body?.lastError === false &&
          read !== null &&
          (!read.whoShown || read.who === "") &&
          read.selectedLine.length === 0 &&
          read.unavailable.some((line) => line.startsWith(WORDS.unavailableRoster)),
      };
    });

    // Two owners of record on one address: nothing selected; staff choose and save.
    await phase("twoOwners", async () => {
      const first = kit.row(leaseId)?.portfolio?.owners?.[0];
      setOwnerRoster(rehearsal, leaseId, [
        { name: first?.name ?? "Jordan Sample", email: owners[0] },
        { name: SECOND_OWNER, email: owners[0] },
      ]);
      try {
        await kit.openLease(page, leaseId, "?step=ask-owner");
        const refreshed = await readOwnerRosterAgain(ctx, page);
        const approval = await manualApproval(kit, page, leaseId);
        const linked = await chooseLinkedReply(approval);
        const read = await readAnswer(kit, approval, "Who approved");
        const second = read.owners.find((owner) => owner.text.startsWith(SECOND_OWNER));
        if (!second) throw new Error("The second owner is not on the roster.");
        await approval
          .getByLabel("Who approved", { exact: true })
          .selectOption(second.value);
        const reviewed = await reviewAnswer(kit, page, approval);
        const status = await saveAnswer(kit, page, reviewed.review, staff);
        const stored = await ownerResponse(kit, page, leaseId);
        return {
          refreshed,
          linked,
          owners: read.owners.map((owner) => owner.text),
          who: read.who,
          selectedLine: read.selectedLine,
          reviewed: reviewed.read,
          status,
          stored: {
            outcome: stored?.outcome ?? null,
            party: stored?.approval?.party ?? null,
            channel: stored?.approval?.channel?.kind ?? null,
            scope: stored?.approvedBase?.scope ?? null,
          },
          noAddress: holdsNoAddress(stored),
          ok:
            refreshed?.status === 200 &&
            refreshed.body?.refreshed === true &&
            refreshed.body.lastError === false &&
            linked.replies === 1 &&
            read.owners.length === 2 &&
            read.who === "" &&
            read.selectedLine.length === 0 &&
            reviewed.read.covers === WORDS.coversBaseOnly &&
            reviewed.read.statement === WORDS.amountOnly &&
            status === 200 &&
            stored?.outcome === "approved_terms" &&
            stored?.approval?.party?.kind === "owner" &&
            stored?.approval?.party?.label === SECOND_OWNER &&
            stored?.approval?.channel?.kind === "linked_reply" &&
            stored?.approvedBase?.scope === "amount_only" &&
            holdsNoAddress(stored),
        };
      } finally {
        setOwnerRoster(rehearsal, leaseId, null);
      }
    });
    await noteMail("A", 0);
  }

  // ---- B. Nothing changes until an Approver publishes ---------------------------------------------

  if (parts.has("B")) {
    ran.add("B");
    await ctx.resetState();
    await markMail();
    let approver = null;
    await phase("editorNoControl", async () => {
      await askOwner(ctx, page, leaseId);
      const copy = await ownerCopy(kit, page, leaseId);
      const shown = await revealOwnerMessage(kit, page, leaseId);
      await page.waitForTimeout(3000);
      const controls = await page
        .locator('[data-renewal-field="owner-wording-publication"]')
        .count();
      const line = await page.getByText(WORDS.ready, { exact: true }).count();
      return {
        copy,
        shown,
        controls,
        line,
        ok:
          copy?.version === "v2.0" &&
          copy?.readyToPublish === true &&
          copy?.canPublish === false &&
          shown &&
          controls === 0 &&
          line === 0,
      };
    });
    await phase("approverReady", async () => {
      approver = await ctx.newPage("Approver");
      const block = await openPublication(kit, approver, leaseId);
      const text = (await kit.shownWithin(block, 10_000))
        ? await kit.visibleText(block)
        : "";
      const copy = await ownerCopy(kit, approver, leaseId);
      return {
        text: text.slice(0, 300),
        copy,
        ok:
          text.includes(WORDS.ready) &&
          text.includes(WORDS.reviewWording) &&
          copy?.canPublish === true &&
          copy?.version === "v2.0",
      };
    });
    const assistedBefore = await phase("assistedBefore", async () => {
      const read = await askOwner(ctx, page, assistedId);
      const { shown, body } = await ownerBody(kit, page, assistedId);
      return {
        shown,
        body,
        datesItem: datesItem(read.needs),
        ok:
          shown &&
          Boolean(body) &&
          count(body, WORDS.termAny) === 0 &&
          !datesItem(read.needs),
      };
    });
    const scheduled = await phase("scheduleUnpublished", async () => {
      const read = await askOwner(
        ctx,
        page,
        leaseId,
        (name) => name === "Review owner message",
      );
      const result = await scheduleOwnerMessage(ctx, page, leaseId);
      const record = (await ownerSequences(kit, leaseId)).find(
        (sequence) => sequence.id === result.sequenceId,
      );
      return {
        primary: read.primary,
        datesItem: datesItem(read.needs),
        status: result.status,
        sequenceId: result.sequenceId,
        state: record?.state ?? null,
        paused: Boolean(record?.pause),
        body: result.body,
        ok:
          read.primary === "Review owner message" &&
          !datesItem(read.needs) &&
          result.status === 200 &&
          Boolean(result.sequenceId) &&
          !record?.pause &&
          count(result.body, WORDS.termAny) === 0 &&
          WORDS.recommendation.test(squash(result.body)),
      };
    });
    await phase("keepWording", async () => {
      if (!approver) throw new Error("No Approver page.");
      const block = await openPublication(kit, approver, leaseId);
      const preview = await previewPublication(kit, approver, block, staff);
      await block.getByRole("button", { name: WORDS.keep, exact: true }).click();
      await approver.waitForTimeout(1000);
      const copy = await ownerCopy(kit, approver, leaseId);
      return {
        preview,
        copy,
        ok:
          preview.status === 200 &&
          preview.heldCount === 1 &&
          preview.line === consequence(1) &&
          copy?.version === "v2.0",
      };
    });
    await phase("sendsAsReviewed", async () => {
      const id = scheduled?.sequenceId;
      if (!id) throw new Error("No scheduled owner message.");
      const tick = tickCounts(await kit.tick(id));
      const record = (await ownerSequences(kit, leaseId)).find(
        (sequence) => sequence.id === id,
      );
      const sent = await kit.sentTo(owners);
      const last = sent.at(-1);
      const reviewed = squash(scheduled.body);
      const recommendation = WORDS.recommendation.exec(reviewed)?.[0] ?? null;
      return {
        tick,
        state: record?.state ?? null,
        pause: record?.pause?.cause ?? null,
        sent: sent.length,
        recommendation,
        ok:
          tick.sent === 1 &&
          tick.held === 0 &&
          !record?.pause &&
          sent.length === 1 &&
          Boolean(recommendation) &&
          squash(last?.text).includes(recommendation) &&
          htmlText(last?.html).includes(recommendation) &&
          count(last?.text, WORDS.termAny) === 0 &&
          squash(last?.text).includes(WORDS.v20Request) &&
          reviewed.includes(WORDS.v20Request),
      };
    });
    if (results.sendsAsReviewed?.ok) staff.ownerSends += 1;
    await phase("publishNoneHeld", async () => {
      if (!approver) throw new Error("No Approver page.");
      const published = await publishWording(ctx, approver, leaseId, staff);
      const held = await heldOwnerMessages(kit);
      return {
        ...published,
        held,
        ok: published.ok && published.preview.heldCount === 0 && held === 0,
      };
    });
    await phase("assistedAfter", async () => {
      const read = await askOwner(ctx, page, assistedId);
      const { shown, body } = await ownerBody(kit, page, assistedId);
      return {
        shown,
        same: body === assistedBefore?.body,
        datesItem: datesItem(read.needs),
        ok:
          shown &&
          Boolean(assistedBefore?.body) &&
          body === assistedBefore.body &&
          count(body, WORDS.termAny) === 0 &&
          !datesItem(read.needs),
      };
    });
    await noteMail("B", 1);
  }

  // ---- C. Publish with a reviewed message unsent: held, repaired once, answered once ---------------

  if (parts.has("C")) {
    ran.add("C");
    await ctx.resetState();
    await markMail();
    const approver = await ctx.newPage("Approver");
    const scheduled = await phase("scheduleBeforePublish", async () => {
      const result = await scheduleOwnerMessage(ctx, page, leaseId);
      return {
        status: result.status,
        sequenceId: result.sequenceId,
        ok: result.status === 200 && Boolean(result.sequenceId),
      };
    });
    const published = await phase("publishWithCount", async () => {
      const result = await publishWording(ctx, approver, leaseId, staff);
      return { ...result, ok: result.ok && result.preview.heldCount === 1 };
    });
    await phase("heldNamed", async () => {
      const id = scheduled?.sequenceId;
      if (!id) throw new Error("No scheduled owner message.");
      const tick = tickCounts(await kit.tick(id));
      const record = (await ownerSequences(kit, leaseId)).find(
        (sequence) => sequence.id === id,
      );
      const held = await heldOwnerMessages(kit);
      const lease = await askOwner(
        ctx,
        page,
        leaseId,
        (name) => name === WORDS.updateOwner,
      );
      const card = await communicationsCard(kit, page, leaseId);
      const sent = await kit.sentTo(owners);
      return {
        tick,
        state: record?.state ?? null,
        pause: record?.pause
          ? {
              cause: record.pause.cause,
              changed: (record.pause.changedInputs ?? []).map((change) => change.key),
            }
          : null,
        held,
        stated: published?.preview?.heldCount ?? null,
        primary: lease.primary,
        now: lease.now.slice(0, 600),
        card: card.lines,
        sent: sent.length,
        ok:
          tick.sent === 0 &&
          tick.held === 1 &&
          record?.state === "paused" &&
          held === 1 &&
          held === published?.preview?.heldCount &&
          lease.primary === WORDS.updateOwner &&
          lease.now.includes(WORDS.heldOwner) &&
          lease.now.includes(`${WORDS.wordingUpdated}.`) &&
          !lease.now.includes(`${WORDS.wordingUpdated} changed`) &&
          card.shown &&
          card.lines.some((line) => line.startsWith(WORDS.wordingUpdated)) &&
          sent.length === 0,
      };
    });
    // Under the published wording with no dates saved: the readiness line and its fix.
    await phase("missingBeforeRepair", async () => {
      const read = await askOwner(
        ctx,
        page,
        leaseId,
        (name) => name === WORDS.updateOwner,
      );
      const item = datesItem(read.needs);
      return {
        primary: read.primary,
        item,
        ok: item?.ready === "missing" && item.text.startsWith(WORDS.datesLine),
      };
    });
    const dates = await phase("datesForRepair", async () => {
      await openWorkingTerms(kit, page, leaseId);
      const startStatus = await chooseDayAfter(kit, page, staff);
      const startIso = entryOf(
        await workingRecord(kit, page, leaseId),
        "terms_effective_date",
      )?.value;
      if (!startIso) throw new Error("The start was not saved.");
      const read = await settledEnd(page, (value) => value.choices.length > 0);
      const endStatus = await chooseEnd(kit, page, twelveLabel(startIso), staff);
      const entry = entryOf(await workingRecord(kit, page, leaseId), "terms_end_date");
      return {
        startIso,
        endIso: entry?.value ?? null,
        choices: read.choices,
        startStatus,
        endStatus,
        ok:
          startStatus === 200 &&
          endStatus === 200 &&
          JSON.stringify(read.choices) === JSON.stringify([twelveLabel(startIso)]) &&
          entry?.value === proposeEnd(startIso, 12) &&
          entry?.context === WORDS.standardBasis,
      };
    });
    const startIso = dates?.startIso ?? null;
    const endIso = dates?.endIso ?? null;
    await phase("repairOnce", async () => {
      if (!startIso || !endIso) throw new Error("No renewal dates were saved.");
      const before = await askOwner(
        ctx,
        page,
        leaseId,
        (name) => name === WORDS.updateOwner,
      );
      const item = datesItem(before.needs);
      await kit.primary(page).click();
      const dialog = page.getByRole("dialog", { name: WORDS.updateOwner });
      await dialog
        .locator('[data-renewal-field="exact-review"]')
        .waitFor({ timeout: 120_000 });
      const body = await reviewBody(ctx, dialog);
      const sendNow = dialog.getByRole("button", { name: "Send now", exact: true });
      if (await kit.shownWithin(sendNow, 5_000)) await sendNow.click();
      const result = await confirmReview(ctx, page, dialog, "Send this message", "send");
      if (result.status === null) ctx.unresolved("W12-13 repair send: no answer");
      const sequences = await ownerSequences(kit, leaseId);
      const record = sequences.find((sequence) => sequence.id === scheduled?.sequenceId);
      const sent = await kit.sentTo(owners);
      const last = sent.at(-1);
      const reviewed = termPlacement(body, startIso, endIso);
      const text = termPlacement(last?.text, startIso, endIso);
      const html = termPlacement(htmlText(last?.html), startIso, endIso);
      return {
        item,
        status: result.status,
        sameMessage: result.sequenceId === scheduled?.sequenceId,
        messages: sequences.length,
        state: record?.state ?? null,
        sent: sent.length,
        reviewed,
        text,
        html,
        ok:
          item?.ready === "ready" &&
          item.text === WORDS.datesReady &&
          result.status === 200 &&
          result.sequenceId === scheduled?.sequenceId &&
          sequences.length === 1 &&
          !record?.pause &&
          sent.length === 1 &&
          [reviewed, text, html].every(
            (placement) =>
              placement.once &&
              placement.termCount === 1 &&
              placement.afterRecommendation &&
              placement.v21Request &&
              !placement.v20Request,
          ),
      };
    });
    if (results.repairOnce?.ok) staff.ownerSends += 1;

    // The sole owner replies to the message that stated the term; it names an amount and a term.
    const answered = await phase("answerWithTerm", async () => {
      if (!startIso || !endIso) throw new Error("No renewal dates were saved.");
      await deliverOwnerReply(rehearsal, { to: owners[0], text: DISTRACTING_REPLY });
      const tick = tickCounts(await kit.tick());
      const form = await replyForm(ctx, page, leaseId);
      if (!form) throw new Error("The reply form is not shown.");
      const index = await chooseReply(kit, form, "Synthetic reply from the sole owner");
      const read = await readAnswer(kit, form, "Who approved in this reply");
      const reviewed = await reviewAnswer(kit, page, form);
      const status = await saveAnswer(kit, page, reviewed.review, staff);
      const stored = await ownerResponse(kit, page, leaseId);
      const entry = entryOf(await workingRecord(kit, page, leaseId), "terms_end_date");
      const label = `Base rent and the renewal dates, ${usDate(startIso)} to ${usDate(endIso)}`;
      return {
        tick,
        index,
        read: { ...read, text: undefined },
        reviewed: reviewed.read,
        status,
        stored: {
          party: stored?.approval?.party ?? null,
          scope: stored?.approvedBase?.scope ?? null,
          terms: stored?.approvedWorkingTerms
            ? {
                start: stored.approvedWorkingTerms.effectiveDate,
                end: stored.approvedWorkingTerms.endDate,
              }
            : null,
        },
        entry,
        // The reply names $1,999.00 and 06/30/2028: neither reaches the answer or the terms.
        nothingRead:
          read.amount === "" &&
          read.exactLabel === label &&
          !String(read.exactLabel).includes(DISTRACTING_DATE) &&
          entry?.value === endIso &&
          reviewed.read.approved !== "" &&
          !reviewed.read.approved.includes("1,999"),
        selected:
          index === 0 &&
          Boolean(read.who) &&
          read.selectedLine.length === 1 &&
          read.selectedLine[0] === WORDS.selected &&
          stored?.approval?.party?.kind === "owner" &&
          stored?.approval?.party?.sourceRef === read.who &&
          holdsNoAddress(stored),
        ok:
          tick.failures === 0 &&
          read.exactChecked === true &&
          read.amountOnlyChecked === false &&
          read.exactLabel === label &&
          read.asked.length === 1 &&
          read.asked[0] === WORDS.asked &&
          read.datesChanged.length === 0 &&
          reviewed.read.covers ===
            `The base rent and the renewal dates, ${usDate(startIso)} to ${usDate(endIso)}. Other charges are not covered.` &&
          reviewed.read.statement === WORDS.exactTerms &&
          status === 200 &&
          stored?.approvedBase?.scope === "exact_terms" &&
          stored?.approvedWorkingTerms?.effectiveDate === startIso &&
          stored?.approvedWorkingTerms?.endDate === endIso,
      };
    });
    await phase("documentsAfterTerm", async () => {
      const read = await documentsApproval(kit, page, leaseId);
      return { ...read, ok: Boolean(answered?.ok) && documentsAskNothing(read) };
    });

    // The owner approves a 6 month term instead: the new end is saved first, then the answer.
    await phase("differentTerm", async () => {
      if (!startIso || !endIso) throw new Error("No renewal dates were saved.");
      const sixMonths = SIX_MONTH_END(startIso);
      await openWorkingTerms(kit, page, leaseId);
      const endStatus = await typeEnd(kit, page, sixMonths, staff);
      const approval = await manualApproval(kit, page, leaseId);
      const opened = await readAnswer(kit, approval, "Who approved");
      const label = `Base rent and the renewal dates, ${usDate(startIso)} to ${usDate(sixMonths)}`;
      await approval.locator('input[type="radio"][value="exact_terms"]').check();
      await chooseLinkedReply(approval, 0);
      await page.waitForTimeout(800);
      const chosen = await readAnswer(kit, approval, "Who approved");
      await approval
        .getByLabel("When they approved", { exact: true })
        .fill(centralLocal(2));
      const reviewed = await reviewAnswer(kit, page, approval);
      const status = await saveAnswer(kit, page, reviewed.review, staff);
      const stored = await ownerResponse(kit, page, leaseId);
      const documents = await documentsApproval(kit, page, leaseId);
      return {
        sixMonths,
        endStatus,
        opened: {
          amountOnlyChecked: opened.amountOnlyChecked,
          exactLabel: opened.exactLabel,
          datesChanged: opened.datesChanged,
          asked: opened.asked,
        },
        chosen: { who: chosen.who, selectedLine: chosen.selectedLine },
        reviewed: reviewed.read,
        status,
        stored: {
          scope: stored?.approvedBase?.scope ?? null,
          terms: stored?.approvedWorkingTerms
            ? {
                start: stored.approvedWorkingTerms.effectiveDate,
                end: stored.approvedWorkingTerms.endDate,
              }
            : null,
        },
        documents,
        ok:
          endStatus === 200 &&
          opened.amountOnlyChecked === true &&
          opened.exactLabel === label &&
          opened.datesChanged.length === 1 &&
          opened.datesChanged[0] === WORDS.datesChanged &&
          opened.asked.length === 0 &&
          Boolean(chosen.who) &&
          chosen.selectedLine[0] === WORDS.selected &&
          reviewed.read.covers ===
            `The base rent and the renewal dates, ${usDate(startIso)} to ${usDate(sixMonths)}. Other charges are not covered.` &&
          status === 200 &&
          stored?.approvedBase?.scope === "exact_terms" &&
          stored?.approvedWorkingTerms?.effectiveDate === startIso &&
          stored?.approvedWorkingTerms?.endDate === sixMonths &&
          holdsNoAddress(stored) &&
          documentsAskNothing(documents),
      };
    });
    await noteMail("C", 1);
  }

  // ---- E. Under the published wording: the dates before the review ------------------------------

  if (parts.has("E")) {
    ran.add("E");
    await ctx.resetState();
    await markMail();
    const approver = await ctx.newPage("Approver");
    await phase("publishFresh", async () => {
      const result = await publishWording(ctx, approver, leaseId, staff);
      return { ...result, ok: result.ok && result.preview.heldCount === 0 };
    });
    await phase("datesMissingHold", async () => {
      const read = await askOwner(ctx, page, leaseId);
      const item = datesItem(read.needs);
      const scheduleEnabled = await kit
        .now(page)
        .getByRole("button", { name: "Schedule", exact: true })
        .evaluateAll((nodes) => nodes.filter((node) => !node.disabled).length);
      await revealOwnerMessage(kit, page, leaseId);
      const draft = page.getByRole("button", {
        name: "Preview unsent Gmail draft",
        exact: true,
      });
      const draftShown = await kit.shownWithin(draft, 15_000);
      const draftDisabled = draftShown ? await draft.isDisabled() : null;
      // The fix: the step's own action names it while it holds the review.
      await askOwner(ctx, page, leaseId);
      const fix =
        (await kit.primaryName(page, 20_000)) === WORDS.datesFix
          ? kit.primary(page)
          : page
              .locator("button[data-renewal-fix-link]")
              .filter({ hasText: WORDS.datesFix })
              .first();
      const fixShown = await kit.shownWithin(fix, 15_000);
      if (fixShown) await fix.click();
      await settleFocus(page);
      const landed = await page.evaluate(() =>
        Boolean(
          document.activeElement?.closest(
            "#renewal-working-terms-start, #renewal-working-terms-end",
          ),
        ),
      );
      return {
        primary: read.primary,
        item,
        scheduleEnabled,
        draftShown,
        draftDisabled,
        fixShown,
        landed,
        ok:
          item?.ready === "missing" &&
          item.text.startsWith(WORDS.datesLine) &&
          read.primary !== "Review owner message" &&
          scheduleEnabled === 0 &&
          draftShown &&
          draftDisabled === true &&
          fixShown &&
          landed,
      };
    });
    const dates = await phase("datesChosen", async () => {
      await openWorkingTerms(kit, page, leaseId);
      const startStatus = await chooseDayAfter(kit, page, staff);
      const startIso = entryOf(
        await workingRecord(kit, page, leaseId),
        "terms_effective_date",
      )?.value;
      if (!startIso) throw new Error("The start was not saved.");
      const half = await askOwner(ctx, page, leaseId);
      await openWorkingTerms(kit, page, leaseId);
      const endStatus = await chooseEnd(kit, page, twelveLabel(startIso), staff);
      const read = await askOwner(
        ctx,
        page,
        leaseId,
        (name) => name === "Review owner message",
      );
      return {
        startIso,
        endIso: proposeEnd(startIso, 12),
        halfItem: datesItem(half.needs),
        item: datesItem(read.needs),
        primary: read.primary,
        ok:
          startStatus === 200 &&
          endStatus === 200 &&
          datesItem(half.needs)?.ready === "missing" &&
          datesItem(read.needs)?.text === WORDS.datesReady &&
          read.primary === "Review owner message",
      };
    });
    const startIso = dates?.startIso ?? null;
    const endIso = dates?.endIso ?? null;
    await phase("reviewWithTerm", async () => {
      if (!startIso) throw new Error("No renewal dates were saved.");
      const { dialog } = await openOwnerReview(ctx, page, leaseId);
      const body = await reviewBody(ctx, dialog);
      const datesLine = await kit.visibleText(
        dialog.locator('[data-renewal-field="review-dates"]').first(),
      );
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await dialog.waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
      const placement = termPlacement(body, startIso, endIso);
      return {
        placement,
        datesLine,
        ok:
          placement.once &&
          placement.afterRecommendation &&
          placement.v21Request &&
          !placement.v20Request,
      };
    });
    await phase("removedDateHold", async () => {
      if (!startIso) throw new Error("No renewal dates were saved.");
      await openWorkingTerms(kit, page, leaseId);
      const cleared = await clearEnd(kit, page, staff);
      const held = await askOwner(ctx, page, leaseId);
      const item = datesItem(held.needs);
      await openWorkingTerms(kit, page, leaseId);
      const offered = await settledEnd(page, (value) => value.choices.length > 0);
      const chosen = await chooseEnd(kit, page, twelveLabel(startIso), staff);
      const back = await askOwner(
        ctx,
        page,
        leaseId,
        (name) => name === "Review owner message",
      );
      return {
        cleared,
        primary: held.primary,
        item,
        offered: offered.choices,
        chosen,
        back: { primary: back.primary, item: datesItem(back.needs) },
        ok:
          cleared === 200 &&
          item?.ready === "missing" &&
          item.text.startsWith(WORDS.datesLine) &&
          held.primary !== "Review owner message" &&
          JSON.stringify(offered.choices) === JSON.stringify([twelveLabel(startIso)]) &&
          chosen === 200 &&
          back.primary === "Review owner message",
      };
    });
    await phase("customRequest", async () => {
      if (!startIso) throw new Error("No renewal dates were saved.");
      const custom =
        "Synthetic custom request: please tell us whether this rent and these dates work for you.";
      await askOwner(ctx, page, leaseId);
      await revealOwnerMessage(kit, page, leaseId);
      const field = page
        .locator("#renewal-message-owner-inputs")
        .getByLabel("Response request (optional wording edit)", { exact: true });
      await field.waitFor({ timeout: 30_000 });
      const saved = kit
        .appResponse(page, PREPARATION_ROUTE, {
          match: (body) => body?.kind === "save",
          timeout: 60_000,
        })
        .catch(() => null);
      await field.fill(custom);
      await field.blur();
      const status = (await saved)?.status() ?? null;
      const body = page.locator("#renewal-message-owner-body").first();
      const preview = page.locator('[aria-label="owner formatted body"]').first();
      const deadline = Date.now() + 30_000;
      let text = "";
      let html = "";
      while (Date.now() < deadline) {
        text = squash(await body.inputValue().catch(() => ""));
        html = await kit.visibleText(preview);
        if (text.includes(custom) && html.includes(custom)) break;
        await page.waitForTimeout(750);
      }
      return {
        status,
        text: termPlacement(text, startIso, endIso),
        html: termPlacement(html, startIso, endIso),
        customInText: text.includes(custom),
        customInHtml: html.includes(custom),
        ok:
          status === 200 &&
          text.includes(custom) &&
          html.includes(custom) &&
          termPlacement(text, startIso, endIso).once &&
          termPlacement(text, startIso, endIso).afterRecommendation &&
          termPlacement(html, startIso, endIso).once,
      };
    });
    await phase("dateChangedAfterReview", async () => {
      if (!startIso) throw new Error("No renewal dates were saved.");
      const result = await scheduleOwnerMessage(ctx, page, leaseId);
      if (result.status !== 200)
        throw new Error(`Not scheduled (HTTP ${result.status}).`);
      const sixMonths = SIX_MONTH_END(startIso);
      await openWorkingTerms(kit, page, leaseId);
      const endStatus = await typeEnd(kit, page, sixMonths, staff);
      const lease = await askOwner(
        ctx,
        page,
        leaseId,
        (name) => name === WORDS.updateOwner,
      );
      const difference = `Renewal end date: ${usDate(endIso)} in the scheduled message, ${usDate(sixMonths)} on the lease.`;
      const tick = tickCounts(await kit.tick(result.sequenceId));
      const record = (await ownerSequences(kit, leaseId)).find(
        (sequence) => sequence.id === result.sequenceId,
      );
      const change = (record?.pause?.changedInputs ?? []).find(
        (entry) => entry.key === "renewalEnd",
      );
      const sent = await kit.sentTo(owners);
      return {
        scheduled: result.status,
        reviewedTerm: termPlacement(result.body, startIso, endIso),
        endStatus,
        primary: lease.primary,
        outOfDate: lease.now.includes(WORDS.outOfDate),
        difference: lease.now.includes(difference),
        tick,
        pause: record?.pause?.cause ?? null,
        change: change ?? null,
        sent: sent.length,
        ok:
          termPlacement(result.body, startIso, endIso).once &&
          endStatus === 200 &&
          lease.primary === WORDS.updateOwner &&
          lease.now.includes(WORDS.outOfDate) &&
          lease.now.includes(difference) &&
          tick.sent === 0 &&
          record?.state === "paused" &&
          change?.previous === usDate(endIso) &&
          change?.current === usDate(sixMonths) &&
          sent.length === 0,
      };
    });
    await noteMail("E", 0);
  }

  // ---- F. Another lease's length, and a month-to-month lease ---------------------------------------

  if (parts.has("F")) {
    ran.add("F");
    await phase("currentLength", async () => {
      const lease = ctx.leases.byId(LENGTH_LEASE);
      setSourceCycleDate(rehearsal, LENGTH_LEASE, LENGTH_LEASE_END);
      try {
        await kit.openLease(page, LENGTH_LEASE, "?step=ask-owner");
        const refreshed = await refreshData(ctx, page);
        await openWorkingTerms(kit, page, LENGTH_LEASE);
        const startIso = "2027-01-01";
        const status = await typeStart(kit, page, startIso, staff);
        const expected = [
          twelveLabel(startIso),
          `Use the current lease's length, 11 months (ends ${usDate(proposeEnd(startIso, 11))})`,
        ];
        const read = await settledEnd(
          page,
          (value) => JSON.stringify(value.choices) === JSON.stringify(expected),
          45_000,
        );
        return {
          lease,
          refreshed,
          status,
          expected,
          choices: read.choices,
          ok: status === 200 && JSON.stringify(read.choices) === JSON.stringify(expected),
        };
      } finally {
        setSourceCycleDate(rehearsal, LENGTH_LEASE, null);
      }
    });
    await phase("monthToMonth", async () => {
      await kit.openLease(page, MONTH_TO_MONTH_LEASE, "?view=full");
      const shown = await kit.reveal(page, "#renewal-working-terms-start", 45_000);
      let status = null;
      if (
        shown &&
        (await page.locator('#renewal-working-terms-start input[type="date"]').count())
      ) {
        status = await typeStart(kit, page, "2026-12-10", staff);
      }
      await page.waitForTimeout(3000);
      const suggestions = await page
        .locator('[data-renewal-field="renewal-end-suggestion"]')
        .count();
      const twelve = await page
        .getByRole("button", { name: /^Use a 12 month term/ })
        .count();
      return {
        editorShown: shown,
        status,
        suggestions,
        twelve,
        ok: suggestions === 0 && twelve === 0 && (status === null || status === 200),
      };
    });
  }

  // ---- AC-S285-5: what was written, sent or changed, and by which staff action -----------------------

  await phase("safety", async () => {
    const writes = ctx.writes.slice(writesAtStart);
    const of = (path, field) =>
      writes.filter((write) => write.path === path && (!field || write.field === field));
    const endWrites = of(WORKING_ROUTE, "terms_end_date").length;
    const startWrites = of(WORKING_ROUTE, "terms_effective_date").length;
    const otherWorking = of(WORKING_ROUTE).filter(
      (write) => !["terms_end_date", "terms_effective_date"].includes(write.field),
    );
    const answers = writes.filter(
      (write) => write.path === WORKSPACE_ROUTE && write.kind === "owner_response",
    ).length;
    const publishes = writes.filter(
      (write) => write.path === PREPARATION_ROUTE && write.kind === "publish_owner_copy",
    );
    const templateWrites = writes.filter((write) => /^\/api\/templates/.test(write.path));
    const providerWrites = writes.filter((write) =>
      PROVIDER_WRITE_PATHS.test(write.path),
    );
    const providerRefusals =
      refusedConnections(rehearsal).filter((entry) =>
        PROVIDER_HOSTS.test(String(entry.host ?? "")),
      ).length - providerRefusalsAtStart;
    const mailOk = mail.every(
      (entry) =>
        entry.toTenant === 0 &&
        entry.toOwner === entry.expectedOwnerSends &&
        entry.all === entry.toOwner,
    );
    return {
      staff,
      endWrites,
      startWrites,
      otherWorking: otherWorking.map((write) => write.field),
      answers,
      publishes: publishes.map((write) => write.role),
      templateWrites: templateWrites.length,
      providerWrites: providerWrites.map((write) => write.path),
      providerRefusals,
      mail,
      ok:
        endWrites === staff.endSaves &&
        startWrites === staff.startSaves &&
        answers === staff.ownerResponses &&
        publishes.length === staff.publishRequests &&
        publishes.every((write) => write.role === "Approver") &&
        templateWrites.length === 0 &&
        providerWrites.length === 0 &&
        providerRefusals === 0 &&
        mailOk,
    };
  });

  ctx.record({
    phase: "summary",
    ran: [...ran],
    readings: Object.fromEntries(
      Object.entries(results).map(([name, value]) => [name, value?.ok ?? "error"]),
    ),
    errors: Object.keys(errors),
  });
  const all = (...names) => names.every(ok);
  const field = (name, key) => results[name]?.[key] === true;
  const checks = {
    "AC-S285-1": {
      parts: ["A", "C", "E", "F"],
      value:
        field("starting", "offered") &&
        ok("starting") &&
        all(
          "boundaries",
          "choose12",
          "startAfterSave",
          "datesForRepair",
          "datesChosen",
          "removedDateHold",
          "currentLength",
          "monthToMonth",
        ),
    },
    "AC-S285-2": {
      parts: ["B", "C", "E"],
      value:
        field("starting", "noTerm") &&
        all(
          "editorNoControl",
          "approverReady",
          "assistedBefore",
          "scheduleUnpublished",
          "keepWording",
          "sendsAsReviewed",
          "publishNoneHeld",
          "assistedAfter",
          "scheduleBeforePublish",
          "publishWithCount",
          "heldNamed",
          "missingBeforeRepair",
          "repairOnce",
          "publishFresh",
          "datesMissingHold",
          "reviewWithTerm",
          "removedDateHold",
          "customRequest",
          "dateChangedAfterReview",
        ),
    },
    "AC-S285-3": {
      parts: ["A", "C"],
      value:
        field("starting", "baseOnly") &&
        field("replyNoTerm", "noTerm") &&
        all("twoOwners", "answerWithTerm", "documentsAfterTerm", "differentTerm"),
    },
    "AC-S285-4": {
      parts: ["A", "C"],
      value:
        field("starting", "selected") &&
        field("replyNoTerm", "selected") &&
        field("answerWithTerm", "selected") &&
        all(
          "manualChannels",
          "otherReplies",
          "bounce",
          "noRosterOwner",
          "unreadableRoster",
          "twoOwners",
          "differentTerm",
        ),
    },
    "AC-S285-5": {
      parts: PARTS,
      value: ok("safety") && field("answerWithTerm", "nothingRead"),
    },
  };
  return Object.fromEntries(
    Object.entries(checks)
      .filter(([, check]) => check.parts.every((part) => ran.has(part)))
      .map(([id, check]) => [id, check.value === true]),
  );
}
