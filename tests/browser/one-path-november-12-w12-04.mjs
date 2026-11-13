// S284 W12-04, "The reply reaches the decision": the candidate-side acceptance checks of S275
// (intake 153) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-replies-reach-the-lease.md (S275).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S275-1, AC-S275-2, AC-S275-3, AC-S275-4, AC-S275-5, AC-S275-6
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Send an owner message, deliver a reply with the stand-in, tick, and read the desk and the
//   lease. Repeat with the lease's own check and with a failing mailbox read. Follow the
//   notification.
//
// Starting sequence (journeyW1204 in one-path-november-12-journeys.mjs, the fail-first table):
//   Send an owner message, deliver a reply, tick, open the desk and the lease, use every visible
//   refresh. On the baseline: The lease keeps waiting; no visible control shows the reply. The
//   sequence runs unchanged on the candidate: "Refresh worklist" and "Refresh attention" now read
//   "Reload worklist" and "Reload linked conversations" (R-S275-5), and the journey records a
//   control it does not find as not shown, so it still reaches the same state on both builds.
//
// HOW THE CHECKS ARE MADE. Every action is a control staff can see, an outside party acts only
// through the stand-in hooks of scripts/lib/one-path-rehearsal/control.mjs (a delivered reply, an
// unreadable thread) and time passes only through kit.tick. Reads are pages, GET routes, the
// rehearsal's own Firestore emulator and the stand-ins' state. The phases, in order:
//   owner    the starting sequence's state: the desk row right after the tick and again, the lease
//            step, the reply text read live and the evidence choice with nothing selected.
//   tenant   the same lease: staff save the owner's answer from the reply (the worker then stops
//            visiting that message), send the tenant offer, the tenant replies, one tick; the desk
//            and the step for the tenant. Then "Retire from renewals" closes the cycle (the worker
//            stops visiting the tenant message).
//   check    from the starting state: Communications on load; two sent owner messages (9101 and
//            9105); a reply on 9105 and "Check Gmail now" (the notification and the Linked
//            conversations row); a reply on 9101 with the mailbox cursor past it and its thread
//            unreadable, "Check Gmail now" again (one not checked, the other observed, the failure
//            line on the lease); then the lease's own "Check for a reply now", with no tick.
//   end      from the starting state: R-S275-7 (a message from before the marker, with an earlier
//            reply, observed once with its actual received time), the 4,000 terminal record bound
//            and a passed lease end date.
//   cancel   from the starting state: a tenant offer with follow-ups is visited, then cancelled
//            with "Cancel future messages", then no longer visited.
//   replay   the static staff-path check of the seed and the journey drivers, and N10-02 on the
//            staff path (the S271 replay's own row when this run made it, else that one journey).
// Each "starting state" is the compiled synthetic-mail run's (the seeds without the replied owner
// message), so the phases meet the same leases on a development and a compiled run.
//
// FIXTURES FOR WHAT NO STAFF CONTROL OR HOOK CAN MAKE (kit.patchDocument's "few named fixtures"),
// each written to the rehearsal's own emulator only, as the tick helper moves a due time:
//   - "the mailbox cursor past the reply" (AC-S275-2): the staff mailbox's history cursor is set
//     to the stand-in mailbox's current history id after the reply, as a cursor that passed the
//     reply before S275 (audit finding A-03) left it;
//   - "a sequence completed before the change" (R-S275-7): after its reply the mailbox cursor moves
//     past that reply (as the history read before S275 left it), the sent message's replyWatch
//     marker is removed and the worker's catch-up record is cleared, as on release;
//   - "4,000 terminal records" (ARCH-S275-1): copies of a real message, completed and not watched
//     or cancelled, under other lease ids;
//   - "the lease end date has passed" (AC-S275-4): the work record's cycle date is moved to
//     yesterday, standing in for time that a rehearsal cannot pass.
//
// DEVELOPMENT ONLY: `--w1204-phases owner,tenant` after `--` runs only those phases; a check whose
// phases did not all run is left out (the row reads UNVERIFIED, never Yes).
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { S271_DRIVER } from "../../scripts/lib/one-path-rehearsal/compiled-mail.mjs";
import {
  deliverOwnerReply,
  setMailThreadUnreadable,
  standInState,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import { resetRehearsalState } from "../../scripts/lib/one-path-rehearsal/reset.mjs";
import { SEED_STEPS } from "../../scripts/lib/one-path-rehearsal/seeds.mjs";
import {
  checkStaffPathCalls,
  selectStaffPathFiles,
} from "../../scripts/lib/one-path-rehearsal/staff-path-check.mjs";
import { plainValue } from "./one-path-november-10-kit.mjs";
import {
  FIRST_TERM_END,
  enterRenewalDates,
  recordOwnerAnswer,
  sendOwnerMessage,
  sendTenantOffer,
  waitForPrimary,
} from "./one-path-november-12-journeys.mjs";
import {
  DESK,
  SEQUENCES_COLLECTION,
  SEQUENCES_ROUTE,
  WORKING_ROUTE,
  WORKSPACE_ROUTE,
} from "./one-path-november-12-kit.mjs";

const OWNER_DECISION = "Record the owner's decision";
/**
 * The lease's own name for that step since S262 R-S262-1 ("this is Record the owner's answer"); the
 * desk row keeps S248's "Record the owner's decision".
 */
const OWNER_ANSWER = "Record the owner's answer";
const ownerDecisionLeads = (name) => name === OWNER_DECISION || name === OWNER_ANSWER;
const TENANT_DECISION = "Record the tenant's decision";
const CHECK_NOW = "Check for a reply now";
const CHECKING_NOW = "Checking for a reply…";
const CHECK_GMAIL = "Check Gmail now";
const OWNER_REPLY_FORM = "#renewal-owner-decision-from-reply";
const TENANT_REPLY_FORM = "#renewal-tenant-decision-from-reply";
const OWNER_REPLY_CHOICE = /^Approved in the reply received /;
const TENANT_REPLY_CHOICE = /^Accepted in the reply received /;
/** The controls that read stored data only and no longer read as Gmail refreshes (R-S275-5). */
const RETIRED_REFRESH_LABELS = [
  "Refresh linked Gmail now",
  "Refresh worklist",
  "Refresh attention",
];
const GMAIL_REFRESH_ROUTE = "/api/gmail-hub/refresh";
const DISPOSITION_ROUTE = "/api/lease-renewal/cycle-disposition";
const WORKER_STATE =
  "gmail_communication_worker_state/linked-observation-and-dispatch-v1";
const MAILBOX_STATE = "gmail_mailbox_state";
const WORKSPACE_HEADS = "lease_renewal_workspaces";
const PRELOAD = "tests/browser/renewal-novdec-journey-network.mjs";
/** The worker's page limit in the tick helper (maxSequences) and on the compiled worker route. */
const WORKER_PAGE_LIMIT = 50;
const TERMINAL_FIXTURES = 4000;
/** The Gmail OAuth scopes the app declared before S275 (lib/gmail-runtime/scopes.ts). */
const APPROVED_GMAIL_SCOPES = ["readonly", "compose", "labels", "modify"];

/** Each acceptance check is the conjunction of these observed parts (all must have run). */
const CHECK_PARTS = Object.freeze({
  "AC-S275-1": ["owner.tick", "tenant.tick"],
  "AC-S275-2": [
    "check.lastChecked",
    "check.failingIsolated",
    "check.failureLine",
    "check.cursorPassed",
    "check.noTickSameState",
  ],
  "AC-S275-3": [
    "check.oneGmailCheck",
    "check.notification",
    "check.notificationAccess",
    "check.rowOpensInPlace",
  ],
  "AC-S275-4": [
    "tenant.answerEnds",
    "tenant.cycleCloses",
    "end.catchUp",
    "end.bound",
    "end.leaseEndPasses",
    "cancel.cancelEnds",
  ],
  "AC-S275-5": ["replay.noDirectRefresh", "replay.n1002"],
  "AC-S275-6": [
    "safety.noWatch",
    "safety.noScope",
    "safety.noBody",
    "safety.noUnsavedDecision",
  ],
});
const PHASES = ["owner", "tenant", "check", "end", "cancel", "replay"];
/** The parts each phase decides; a phase that stops reads its undecided parts as failed. */
const PHASE_PARTS = Object.freeze({
  owner: ["owner.tick"],
  tenant: ["tenant.answerEnds", "tenant.tick", "tenant.cycleCloses"],
  check: [
    "check.oneGmailCheck",
    "check.lastChecked",
    "check.notification",
    "check.notificationAccess",
    "check.rowOpensInPlace",
    "check.failingIsolated",
    "check.failureLine",
    "check.cursorPassed",
    "check.noTickSameState",
  ],
  end: ["end.catchUp", "end.bound", "end.leaseEndPasses"],
  cancel: ["cancel.cancelEnds"],
  replay: ["replay.noDirectRefresh", "replay.n1002"],
});

const squash = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
const CENTRAL_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  month: "2-digit",
  day: "2-digit",
  year: "numeric",
});
/** "11/13/2026" for an instant, on the Central business calendar. */
const centralDay = (at) => CENTRAL_DAY.format(new Date(at));
/** YYYY-MM-DD on the Central business calendar, `days` from now. */
const centralIso = (days = 0) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Chicago" }).format(
    Date.now() + days * 86_400_000,
  );
const latest = (sequences) => sequences.at(-1) ?? null;

/** The phases to run: all, or the development option `--w1204-phases a,b`. */
function selectedPhases() {
  const index = process.argv.indexOf("--w1204-phases");
  if (index < 0) return new Set(PHASES);
  return new Set(
    String(process.argv[index + 1] ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => PHASES.includes(entry)),
  );
}

// ---- The rehearsal's own emulator (127.0.0.1, a *-test project) --------------------------------

function emulatorBase(rehearsal) {
  if (!/^127\.0\.0\.1:\d{1,5}$/.test(String(rehearsal.firestoreEmulatorHost)))
    throw new Error("The rehearsal's Firestore emulator is not on 127.0.0.1.");
  if (!/^pmi-kc-kb-[a-z0-9-]+-test$/.test(String(rehearsal.projectId)))
    throw new Error("The rehearsal's emulator project is not a rehearsal test project.");
  return `http://${rehearsal.firestoreEmulatorHost}/v1/projects/${rehearsal.projectId}/databases/(default)/documents`;
}
async function emulatorCall(rehearsal, suffix, { method = "GET", body } = {}) {
  const response = await fetch(`${emulatorBase(rehearsal)}${suffix}`, {
    method,
    headers: {
      authorization: "Bearer owner",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(
      `The emulator answered ${method} ${suffix.slice(0, 60)} with ${response.status}: ${text.slice(0, 200)}`,
    );
  return text ? JSON.parse(text) : {};
}
const plainFields = (document) =>
  document
    ? Object.fromEntries(
        Object.entries(document.fields ?? {}).map(([key, value]) => [
          key,
          plainValue(value),
        ]),
      )
    : null;

/**
 * Every document the emulator holds, as JSON text, for the persisted-body search: one kindless
 * query over all collections, or, if the emulator refuses it, each root collection page by page.
 */
async function allDocumentText(rehearsal) {
  try {
    const rows = await emulatorCall(rehearsal, ":runQuery", {
      method: "POST",
      body: { structuredQuery: { from: [{ allDescendants: true }] } },
    });
    const documents = (Array.isArray(rows) ? rows : [])
      .map((row) => row.document)
      .filter(Boolean);
    return { method: "kindless", count: documents.length, documents };
  } catch {
    const documents = [];
    const { collectionIds = [] } = await emulatorCall(rehearsal, ":listCollectionIds", {
      method: "POST",
      body: { pageSize: 500 },
    });
    for (const collection of collectionIds) {
      let token = "";
      do {
        const page = await emulatorCall(
          rehearsal,
          `/${collection}?pageSize=300${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`,
        );
        documents.push(...(page.documents ?? []));
        token = page.nextPageToken ?? "";
      } while (token);
    }
    return { method: "collections", count: documents.length, documents };
  }
}

// ---- The check ----------------------------------------------------------------------------------

/**
 * W12-04 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1204 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S275-1 to AC-S275-6 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1204(ctx, page, start) {
  const { kit, rehearsal } = ctx;
  const phases = selectedPhases();
  const tag = `W1204-${Date.now().toString(36)}`;
  const parts = {};
  const savesMade = { owner_response: 0, tenant_response: 0 };
  const bodyScans = [];
  const unsavedDecisions = [];
  const record = (entry) => ctx.record(entry);
  const decide = (name, value, detail = undefined) => {
    parts[name] = value === true;
    record({
      part: name,
      passed: parts[name],
      ...(detail === undefined ? {} : { detail }),
    });
    return parts[name];
  };
  const screenshot = (name) =>
    page
      .screenshot({ path: join(rehearsal.runDir, `W12-04-${name}.png`) })
      .catch(() => undefined);
  const prepared = Number(ctx.leases.prepared.leaseId);
  const replied = Number(ctx.leases.replied?.leaseId ?? 9105);

  // ---- Reads -------------------------------------------------------------------------------------

  const sequenceDoc = async (id) =>
    plainFields(await kit.readDocument(`${SEQUENCES_COLLECTION}/${id}`));
  const workspace = async (leaseId) =>
    (await kit.read(page, `${WORKSPACE_ROUTE}?leaseId=${leaseId}`))?.state ?? null;
  const inboundOn = async (threadId, messageId = null) =>
    (await standInState(rehearsal)).mail.mailboxes
      .flatMap((box) => box.messages ?? [])
      .filter(
        (message) =>
          message.threadId === threadId &&
          (message.labelIds ?? []).includes("INBOX") &&
          (!messageId || message.id === messageId),
      )
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  /** Whether the worker left this record untouched between two reads. */
  const unvisited = (before, after) =>
    Boolean(before && after) &&
    JSON.stringify(before.observation ?? null) ===
      JSON.stringify(after.observation ?? null) &&
    before.updatedAtMs === after.updatedAtMs &&
    JSON.stringify(before.observedMessageIds ?? []) ===
      JSON.stringify(after.observedMessageIds ?? []);
  const summary = (sequence) =>
    sequence
      ? {
          state: sequence.state ?? null,
          replyWatch: sequence.replyWatch ?? "absent",
          ended: sequence.replyWatchEnded?.reason ?? null,
          confirmed: sequence.confirmedCount ?? null,
          inbound: (sequence.inbound ?? []).length,
          observation: sequence.observation
            ? {
                state: sequence.observation.state ?? null,
                reason: sequence.observation.reason ?? null,
                checkedAtMs: sequence.observation.checkedAtMs ?? null,
              }
            : null,
          updatedAtMs: sequence.updatedAtMs ?? null,
        }
      : null;
  const tick = async (label, sequenceId = undefined) => {
    const result = await kit.tick(sequenceId);
    const counts = Object.fromEntries(
      Object.entries(result ?? {}).filter(([, value]) => typeof value === "number"),
    );
    record({ tick: label, status: result?.status ?? null, counts });
    return { ...counts, status: result?.status ?? null };
  };
  /** The persisted-body search: no document of the emulator holds any of these reply texts. */
  const scanForBodies = async (label, texts) => {
    const wanted = texts.filter(Boolean);
    const { method, count, documents } = await allDocumentText(rehearsal);
    const found = wanted.filter((text) =>
      documents.some((document) => JSON.stringify(document).includes(text)),
    );
    bodyScans.push({ label, method, documents: count, texts: wanted.length, found });
    record({ bodyScan: label, method, documents: count, texts: wanted.length, found });
  };
  /** A decision is on the record only after the staff save; read before any save. */
  const noDecisionYet = async (label, leaseId, audience) => {
    const state = await workspace(leaseId);
    const answer = audience === "owner" ? state?.ownerResponse : state?.tenantResponse;
    // "No response" and "Awaiting response" are not answers (reply-watch.ts reads them the same).
    const clean =
      (answer ?? null) === null ||
      ["no_response", "awaiting_response"].includes(String(answer.outcome));
    unsavedDecisions.push({ label, clean });
    record({
      unsavedDecision: label,
      clean,
      workRecord: Boolean(state),
      outcome: answer?.outcome ?? null,
    });
    return clean;
  };

  // ---- Staff steps -------------------------------------------------------------------------------

  /**
   * The lease's step as staff read it: its primary, the Now card text and the stage line. `wanted`
   * (a name or a test) is the primary to wait for; the settled one is returned either way.
   */
  async function readStep(leaseId, step, wanted) {
    await kit.openLease(page, leaseId, `?step=${step}`);
    const matches = typeof wanted === "function" ? wanted : (name) => name === wanted;
    const primary = await waitForPrimary(ctx, page, matches, 60_000);
    const nowText = (await kit.visibleText(kit.now(page))).slice(0, 2000);
    const stageLine = await kit.stageLine(page);
    return {
      primary,
      nowText,
      stageLine,
      // The stage line and the Now card together, where "Owner replied {date}" reads.
      text: `${stageLine} ${nowText}`,
      checkLine: await readCheckLine(),
    };
  }
  async function readCheckLine() {
    const line = kit.now(page).locator("[data-renewal-reply-check]").first();
    if (!(await kit.shownWithin(line, 5_000))) return null;
    return {
      state: await line.getAttribute("data-renewal-reply-check"),
      text: squash(await line.innerText()),
    };
  }
  /**
   * The reply decision on the Now card: the reply text read live, the evidence choices and how
   * many are selected on arrival. Choosing the reply (a choice, never a save) then shows "Who
   * approved in this reply" (owner only), whose value is read. The page is left without saving.
   */
  async function readDecision(form, choice, sequenceId, { who = null } = {}) {
    const fieldset = page.locator(form);
    if (!(await kit.shownWithin(fieldset, 30_000))) return { shown: false };
    const body = fieldset
      .locator(".renewal-owner-reply-body, .renewal-tenant-reply-body")
      .first();
    const bodyShown = await kit.shownWithin(body, 45_000);
    const radios = fieldset.locator('input[type="radio"]');
    const checkedOnArrival = await radios.evaluateAll(
      (nodes) => nodes.filter((node) => node.checked).length,
    );
    const choices = fieldset.getByRole("radio", { name: choice });
    const values = await choices.evaluateAll((nodes) => nodes.map((node) => node.value));
    const index = values.findIndex((value) => value.includes(sequenceId));
    let whoValue = null;
    let amountValue = null;
    if (index >= 0 && who) {
      await choices.nth(index).check();
      const select = fieldset.getByLabel(who, { exact: true });
      if (await kit.shownWithin(select, 15_000)) whoValue = await select.inputValue();
      const amount = fieldset.getByLabel("Amount approved", { exact: true });
      if (await kit.shownWithin(amount, 5_000)) amountValue = await amount.inputValue();
    }
    return {
      shown: true,
      replyText: bodyShown ? squash(await body.innerText()) : null,
      radios: await radios.count(),
      checkedOnArrival,
      choices: values.length,
      namesThisMessage: index >= 0,
      whoValue,
      amountValue,
    };
  }
  /** The desk row of a lease, read on the desk. */
  async function readDesk(leaseId) {
    await kit.openPath(page, DESK);
    const row = await kit.deskRow(page, leaseId);
    return {
      shown: row.shown,
      stage: row.stage ?? null,
      next: row.next ?? null,
      text: row.text ?? null,
    };
  }
  /** "Check for a reply now" on the waiting step: its requests' statuses, then the settled step. */
  async function checkFromLease(leaseId, step) {
    await kit.openLease(page, leaseId, `?step=${step}`);
    await waitForPrimary(ctx, page);
    const button = kit.now(page).getByRole("button", { name: CHECK_NOW, exact: true });
    if (!(await kit.shownWithin(button, 30_000))) return { shown: false };
    const statuses = [];
    const listen = (response) => {
      const request = response.request();
      if (
        new URL(response.url()).pathname === SEQUENCES_ROUTE &&
        request.method() === "POST" &&
        kit.sequenceAction(request.postDataJSON() ?? {}) === "refresh"
      )
        statuses.push(response.status());
    };
    page.on("response", listen);
    const first = kit.appResponse(page, SEQUENCES_ROUTE, {
      match: (body) => kit.sequenceAction(body) === "refresh",
    });
    await button.click();
    await first.catch(() => null);
    await kit
      .now(page)
      .getByRole("button", { name: CHECKING_NOW, exact: true })
      .waitFor({ state: "hidden", timeout: 120_000 })
      .catch(() => undefined);
    await page
      .waitForLoadState("networkidle", { timeout: 30_000 })
      .catch(() => undefined);
    await page.waitForTimeout(1500);
    page.off("response", listen);
    return { shown: true, statuses, checkLine: await readCheckLine() };
  }
  /** "Check Gmail now" on Communications; its answer and the status line it shows. */
  async function checkGmailNow() {
    await kit.openPath(page, "/gmail-hub");
    const button = page.getByRole("button", { name: CHECK_GMAIL, exact: true });
    if (!(await kit.shownWithin(button, 60_000))) return { shown: false };
    const answer = kit.appResponse(page, GMAIL_REFRESH_ROUTE, { timeout: 180_000 });
    await button.click();
    const response = await answer.catch(() => null);
    const body = response ? await response.json().catch(() => null) : null;
    const status = page.locator('[data-communication-field="check-gmail"] p').first();
    await kit.shownWithin(status, 30_000);
    return {
      shown: true,
      status: response?.status() ?? null,
      result: body?.status ?? null,
      sequences: body?.sequences ?? null,
      line: squash(await status.innerText().catch(() => "")),
    };
  }
  /** Rent to recommend on Compare market rent, as staff enter it on a lease not prepared ahead. */
  async function enterRentToRecommend(leaseId, amount) {
    await kit.openLease(page, leaseId, "?step=compare-market");
    const field = page.locator("#renewal-now-rent-to-recommend");
    if (!(await kit.shownWithin(field, 60_000))) return null;
    const saved = kit.appResponse(page, WORKING_ROUTE, {
      match: (body) => ["terms_rent", "recommended_rent"].includes(body?.field),
    });
    await field.fill(String(amount));
    await field.press("Enter");
    return (await saved).status();
  }
  /** Send the lease's owner message through its review, as staff do; the sent record. */
  async function sendOwner(leaseId) {
    const existing = latest(await kit.sequences(leaseId, "renewal_owner"));
    if (existing?.confirmedCount > 0) return existing;
    let sent = null;
    try {
      sent = await sendOwnerMessage(ctx, page, leaseId);
    } catch (error) {
      // A lease that was not prepared ahead asks for its rent to recommend first.
      const rent = Number(ctx.leases.byId(leaseId)?.rent ?? 0);
      const entered = await enterRentToRecommend(leaseId, rent);
      record({
        rentToRecommend: leaseId,
        status: entered,
        after: String(error).slice(0, 200),
      });
      sent = await sendOwnerMessage(ctx, page, leaseId);
    }
    if (sent.status >= 500) ctx.unresolved(`owner send on lease ${leaseId}`);
    if (sent.status !== 200)
      throw new Error(
        `Lease ${leaseId}: the owner message was not sent (${sent.alert ?? sent.error}).`,
      );
    const sequence = latest(await kit.sequences(leaseId, "renewal_owner"));
    record({ ownerSent: leaseId, sequence: summary(sequence) });
    return sequence;
  }
  /** The owner's answer saved from the reply: choose it, Amount approved, who, review, save. */
  async function saveOwnerAnswerFromReply(leaseId, sequenceId, amount) {
    await kit.openLease(page, leaseId, "?step=ask-owner");
    await waitForPrimary(ctx, page, ownerDecisionLeads, 60_000);
    const fieldset = page.locator(OWNER_REPLY_FORM);
    await fieldset.waitFor({ timeout: 30_000 });
    const choices = fieldset.getByRole("radio", { name: OWNER_REPLY_CHOICE });
    const values = await choices.evaluateAll((nodes) => nodes.map((node) => node.value));
    const index = values.findIndex((value) => value.includes(sequenceId));
    if (index < 0)
      throw new Error("The reply on this message is not an evidence choice.");
    await choices.nth(index).check();
    await fieldset.getByLabel("Amount approved", { exact: true }).fill(String(amount));
    const who = fieldset.getByLabel("Who approved in this reply", { exact: true });
    const owners = await who
      .locator("option")
      .evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));
    await who.selectOption(owners[0]);
    await fieldset
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
    savesMade.owner_response += 1;
    return (await saved).status();
  }
  /** "Record work", "Retire from renewals", a reason and the dialog's confirmation. */
  async function retireCycle(leaseId) {
    await kit.openLease(page, leaseId);
    await page.locator("#renewal-record-work").click();
    const retire = page
      .getByRole("button", { name: "Retire from renewals", exact: true })
      .first();
    await retire.waitFor({ timeout: 30_000 });
    await retire.click();
    const dialog = page.getByRole("dialog", { name: "Retire from renewals" });
    await dialog.waitFor({ timeout: 30_000 });
    await dialog
      .getByLabel("Reason", { exact: true })
      .fill("Synthetic rehearsal: the renewal cycle is closed.");
    const answer = kit.appResponse(page, DISPOSITION_ROUTE, { timeout: 120_000 });
    await dialog
      .getByRole("button", { name: "Retire from renewals", exact: true })
      .click();
    const response = await answer.catch(() => null);
    return response?.status() ?? null;
  }
  /** The run's starting state again (the compiled synthetic-mail seeds), every page signed in. */
  async function resetToStart(label) {
    const at = Date.now();
    const seeds = await resetRehearsalState({
      rehearsal: { ...rehearsal, automaticComparisonHeld: true },
      browser: page.context().browser(),
      steps: SEED_STEPS.filter(({ name }) => name !== "replied-owner-message"),
    });
    await page.goto(`${ctx.origin}/sign-in`, { waitUntil: "domcontentloaded" });
    await kit.signIn(page, "Editor");
    record({
      reset: label,
      seconds: Math.round((Date.now() - at) / 1000),
      seeds: seeds.map((seed) => `${seed.name}=${seed.state}`).join(" "),
    });
  }

  // ---- owner: the starting sequence's state (tick path) -------------------------------------------

  async function phaseOwner() {
    if (start.error) throw new Error(`The starting sequence stopped: ${start.error}`);
    const owner = latest(await kit.sequences(prepared, "renewal_owner"));
    const threadId = owner?.threads?.[0]?.threadId;
    const reply = (await inboundOn(threadId)).at(-1);
    if (!reply)
      throw new Error("The starting sequence's reply is not in the stand-in mailbox.");
    const day = centralDay(reply.at);
    const deskAfterTick = start.observed?.deskRows?.[0] ?? null;
    const desk = await readDesk(prepared);
    const step = await readStep(prepared, "ask-owner", ownerDecisionLeads);
    const decision = await readDecision(OWNER_REPLY_FORM, OWNER_REPLY_CHOICE, owner.id, {
      who: "Who approved in this reply",
    });
    const unsaved = await noDecisionYet("owner (tick)", prepared, "owner");
    await scanForBodies("owner (tick)", [squash(reply.text)]);
    const observed = {
      sequence: summary(await sequenceDoc(owner.id)),
      deskAfterTick,
      desk,
      step: {
        primary: step.primary,
        stageLine: step.stageLine,
        checkLine: step.checkLine,
      },
      decision,
      day,
    };
    record({ phase: "owner", ...observed, nowText: step.nowText.slice(0, 600) });
    const repliedLine = `Owner replied ${day}`;
    decide(
      "owner.tick",
      deskAfterTick?.next === OWNER_DECISION &&
        desk.next === OWNER_DECISION &&
        `${desk.stage} ${desk.text}`.includes(repliedLine) &&
        ownerDecisionLeads(step.primary) &&
        step.text.includes(repliedLine) &&
        decision.shown === true &&
        decision.replyText === squash(reply.text) &&
        decision.namesThisMessage === true &&
        decision.checkedOnArrival === 0 &&
        decision.whoValue === "" &&
        decision.amountValue === "" &&
        unsaved,
    );
    return { owner, reply };
  }

  // ---- tenant: the owner's answer, the tenant's reply and a closed cycle ---------------------------

  async function phaseTenant(ownerReply) {
    const owner = latest(await kit.sequences(prepared, "renewal_owner"));
    const rent = Number(ctx.leases.prepared.rent ?? 0);
    // The owner's answer, saved by staff from the reply; then the worker stops visiting it.
    const savedStatus = await saveOwnerAnswerFromReply(prepared, owner.id, rent + 50);
    const answered = await workspace(prepared);
    const watchedBefore = await sequenceDoc(owner.id);
    const firstTick = await tick("after the owner's answer");
    const ended = await sequenceDoc(owner.id);
    const secondTick = await tick("again");
    const afterEnd = await sequenceDoc(owner.id);
    record({
      phase: "tenant/answer",
      savedStatus,
      answer: answered?.ownerResponse?.outcome ?? null,
      channel: answered?.ownerResponse?.approval?.channel?.kind ?? null,
      before: summary(watchedBefore),
      ended: summary(ended),
      after: summary(afterEnd),
      firstTick,
      secondTick,
    });
    decide(
      "tenant.answerEnds",
      savedStatus === 200 &&
        answered?.ownerResponse?.outcome === "approved_terms" &&
        answered.ownerResponse.approval?.channel?.kind === "linked_reply" &&
        watchedBefore?.replyWatch === true &&
        ended?.replyWatch === false &&
        ended?.replyWatchEnded?.reason === "answer_recorded" &&
        unvisited(ended, afterEnd),
    );

    // The tenant offer, sent once from the lease; the tenant replies; one worker run.
    const dates = await enterRenewalDates(ctx, page, prepared, {
      start: "day-after",
      end: FIRST_TERM_END,
    });
    const offer = await sendTenantOffer(ctx, page, prepared);
    if (offer.status >= 500) ctx.unresolved("tenant offer send");
    if (offer.status !== 200)
      throw new Error(`The tenant offer was not sent: ${offer.alert ?? offer.error}`);
    const tenant = await sequenceDoc(
      offer.sequenceId ?? latest(await kit.sequences(prepared, "renewal_tenant")).id,
    );
    const tenantText = `Synthetic tenant reply ${tag}: we accept the renewal offer.`;
    const delivered = await deliverOwnerReply(rehearsal, {
      threadId: tenant.threads[0].threadId,
      text: tenantText,
    });
    const reply = (await inboundOn(delivered.threadId, delivered.messageId)).at(-1);
    const replyTick = await tick("after the tenant reply");
    const day = centralDay(reply.at);
    const desk = await readDesk(prepared);
    const step = await readStep(prepared, "offer-tenant", TENANT_DECISION);
    const decision = await readDecision(
      TENANT_REPLY_FORM,
      TENANT_REPLY_CHOICE,
      tenant.id,
    );
    const unsaved = await noDecisionYet("tenant (tick)", prepared, "tenant");
    const tenantAfter = await sequenceDoc(tenant.id);
    record({
      phase: "tenant/reply",
      dates,
      offerStatus: offer.status,
      sentRecord: summary(tenant),
      afterTick: summary(tenantAfter),
      replyTick,
      desk,
      step: {
        primary: step.primary,
        stageLine: step.stageLine,
        checkLine: step.checkLine,
      },
      decision,
      day,
      nowText: step.nowText.slice(0, 600),
    });
    const repliedLine = `Tenant replied ${day}`;
    decide(
      "tenant.tick",
      tenant.state === "completed" &&
        tenant.replyWatch === true &&
        (tenantAfter?.inbound ?? []).some((entry) => entry.messageId === reply.id) &&
        desk.next === TENANT_DECISION &&
        `${desk.stage} ${desk.text}`.includes(repliedLine) &&
        step.primary === TENANT_DECISION &&
        step.text.includes(repliedLine) &&
        decision.shown === true &&
        decision.replyText === squash(reply.text) &&
        decision.namesThisMessage === true &&
        decision.checkedOnArrival === 0 &&
        unsaved,
    );
    await scanForBodies("owner and tenant", [
      squash(ownerReply?.text ?? ""),
      squash(reply.text),
    ]);

    // Close the cycle: "Retire from renewals"; then the worker stops visiting the tenant message.
    const retired = await retireCycle(prepared);
    const closeTick = await tick("after the retirement");
    const closed = await sequenceDoc(tenant.id);
    const laterTick = await tick("again");
    const afterClose = await sequenceDoc(tenant.id);
    record({
      phase: "tenant/close",
      retired,
      closed: summary(closed),
      after: summary(afterClose),
      closeTick,
      laterTick,
    });
    decide(
      "tenant.cycleCloses",
      retired === 200 &&
        closed?.replyWatch === false &&
        closed?.replyWatchEnded?.reason === "cycle_closed" &&
        unvisited(closed, afterClose),
    );
  }

  // ---- check: the visible checks, the notification and a failing thread read ---------------------

  async function phaseCheck() {
    await resetToStart("check");
    // Communications on load: one "Check Gmail now"; the stored-data reloads read as reloads.
    await kit.openPath(page, "/gmail-hub");
    const onLoad = {};
    for (const tab of ["Incoming", "Scheduled", "Outgoing", "Drafts"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await page.waitForTimeout(800);
      onLoad[tab] = await page
        .getByRole("button", { name: CHECK_GMAIL, exact: true })
        .evaluateAll(
          (nodes) => nodes.filter((node) => node.getClientRects().length > 0).length,
        );
    }
    await kit.openPath(page, "/gmail-hub");
    await page.waitForTimeout(1500);
    const shownOnArrival = await page
      .getByRole("button", { name: CHECK_GMAIL, exact: true })
      .evaluateAll(
        (nodes) => nodes.filter((node) => node.getClientRects().length > 0).length,
      );
    const retiredLabels = {};
    for (const label of RETIRED_REFRESH_LABELS)
      retiredLabels[label] = await page.getByRole("button", { name: label }).count();
    record({ phase: "check/communications", onLoad, shownOnArrival, retiredLabels });
    decide(
      "check.oneGmailCheck",
      shownOnArrival === 1 &&
        onLoad.Incoming === 1 &&
        onLoad.Scheduled === 1 &&
        onLoad.Outgoing === 0 &&
        onLoad.Drafts === 0 &&
        Object.values(retiredLabels).every((count) => count === 0),
    );

    // Two sent owner messages in the Editor's mailbox: 9101 (A) and 9105 (B).
    const a = await sendOwner(prepared);
    const b = await sendOwner(replied);
    const mailboxKey = Buffer.from(a.senderEmail.trim().toLowerCase(), "utf8").toString(
      "base64url",
    );
    const mailboxState = async () =>
      plainFields(await kit.readDocument(`${MAILBOX_STATE}/${mailboxKey}`));
    // The mailbox's history cursor exists before the replies, as the minute worker keeps it in
    // production; on an empty rehearsal the first "Check Gmail now" registers it.
    let registered = await mailboxState();
    if (!registered) {
      const first = await checkGmailNow();
      registered = await mailboxState();
      record({ phase: "check/register", first, cursor: registered?.history_id ?? null });
    }

    // The last check time on the waiting step after a clean check.
    await checkGmailNow();
    const waiting = await readStep(prepared, "ask-owner", "Record owner response");
    record({
      phase: "check/last-checked",
      step: waiting.primary,
      line: waiting.checkLine,
    });
    decide(
      "check.lastChecked",
      waiting.checkLine?.state === "checked" &&
        /^Last checked for a reply: \d{2}\/\d{2}\/\d{4}, \d{1,2}:\d{2} [AP]M C[SD]T$/.test(
          waiting.checkLine.text,
        ) &&
        !ownerDecisionLeads(waiting.primary),
    );

    // B: a reply, then "Check Gmail now": the history names it, so a notification is raised.
    const textB = `Synthetic owner reply ${tag} B: approved as offered.`;
    const replyB = await deliverOwnerReply(rehearsal, {
      threadId: b.threads[0].threadId,
      text: textB,
    });
    const checkB = await checkGmailNow();
    const bAfter = await sequenceDoc(b.id);
    const label = squash(bAfter?.workflowLabel ?? "");
    await kit.openPath(page, DESK);
    const items = await kit.notificationItems(page);
    const item = items.find(
      (entry) => entry.title === "Owner replied" && label && entry.text.includes(label),
    );
    let opened = null;
    if (item) {
      await page.locator(".notification-button").first().click();
      const region = page.getByRole("region", { name: "Notifications" });
      await region.waitFor({ timeout: 30_000 });
      await region
        .locator("button.notification-item")
        .filter({ hasText: "Owner replied" })
        .filter({ hasText: label })
        .first()
        .click();
      await page
        .waitForURL(
          (url) =>
            url.pathname === `${DESK}/lease/${replied}` &&
            url.searchParams.get("step") === "ask-owner",
          { timeout: 90_000 },
        )
        .catch(() => undefined);
      const url = new URL(page.url());
      await kit
        .now(page)
        .waitFor({ timeout: 90_000 })
        .catch(() => undefined);
      opened = {
        path: url.pathname,
        step: url.searchParams.get("step"),
        heading: squash(
          await page
            .locator("#renewal-now-heading")
            .innerText()
            .catch(() => ""),
        ),
      };
    }
    record({
      phase: "check/notification",
      checkB,
      bReplyRecorded: (bAfter?.inbound ?? []).some(
        (entry) => entry.messageId === replyB.messageId,
      ),
      label,
      item: item ?? null,
      opened,
      titles: items.map((entry) => entry.title),
    });
    decide(
      "check.notification",
      Boolean(item) &&
        !item.text.includes(textB) &&
        !/@/.test(`${item.title} ${item.text}`) &&
        opened?.path === `${DESK}/lease/${replied}` &&
        opened?.step === "ask-owner" &&
        /Ask the owner/.test(opened?.heading ?? ""),
    );
    // Another staff member without this communication's workflow link sees no such notification.
    const approver = await ctx.newPage("Approver");
    await kit.openPath(approver, DESK);
    const theirs = await kit.notificationItems(approver);
    await approver.close().catch(() => undefined);
    record({
      phase: "check/notification-access",
      approverTitles: theirs.map((entry) => entry.title),
    });
    decide(
      "check.notificationAccess",
      Boolean(item) &&
        !theirs.some(
          (entry) => /replied/i.test(entry.title) && label && entry.text.includes(label),
        ),
    );

    // Linked conversations: the row names the lease and opens the communication in place.
    await kit.openPath(page, "/gmail-hub");
    const panel = page.locator('[aria-label="Workflow communication attention"]');
    const row = panel
      .getByRole("link")
      .filter({ hasText: `${label} · Renewal communication` })
      .first();
    let inPlace = null;
    if (label && (await kit.shownWithin(row, 60_000))) {
      // The row as staff read it before choosing it (the composer then takes its place).
      const rowText = squash(await row.innerText().catch(() => ""));
      await page.evaluate(() => {
        window.__w1204Kept = "kept";
      });
      await row.click();
      const composer = page.getByRole("region", {
        name: "Workflow communication composer",
      });
      const shown = await kit.shownWithin(composer, 60_000);
      inPlace = {
        rowText,
        shown,
        communication: new URL(page.url()).searchParams.get("communication"),
        kept: await page.evaluate(() => window.__w1204Kept === "kept"),
      };
    }
    record({ phase: "check/row", inPlace });
    decide(
      "check.rowOpensInPlace",
      inPlace?.shown === true &&
        inPlace.kept === true &&
        inPlace.communication === b.id &&
        inPlace.rowText.startsWith(label),
    );

    // A: a reply; the mailbox cursor moves past it; A's thread cannot be read; "Check Gmail now".
    const textA = `Synthetic owner reply ${tag} A: approved at the recommended rent.`;
    const replyA = await deliverOwnerReply(rehearsal, {
      threadId: a.threads[0].threadId,
      text: textA,
    });
    const stand = (await standInState(rehearsal)).mail.mailboxes.find(
      (box) => box.mailbox === a.senderEmail.trim().toLowerCase(),
    );
    const passedAt = String(stand?.historyId ?? "");
    await kit.patchDocument(`${MAILBOX_STATE}/${mailboxKey}`, ["history_id"], {
      history_id: { stringValue: passedAt },
    });
    await setMailThreadUnreadable(rehearsal, a.threads[0].threadId);
    const aBefore = await sequenceDoc(a.id);
    const bBefore = await sequenceDoc(b.id);
    const failingAt = Date.now();
    const failing = await checkGmailNow();
    const aFailed = await sequenceDoc(a.id);
    const bObserved = await sequenceDoc(b.id);
    await page.getByRole("tab", { name: "Outgoing", exact: true }).click();
    const cardA = page
      .locator('[role="tabpanel"] article.ui-card')
      .filter({ hasText: `· Lease ${prepared}` })
      .filter({ hasText: "renewal owner" })
      .first();
    const incomingA = (await kit.shownWithin(cardA, 30_000))
      ? squash(
          await cardA
            .locator('[data-communication-field="incoming-checked"]')
            .innerText()
            .catch(() => ""),
        )
      : null;
    const failedStep = await readStep(prepared, "ask-owner", "Record owner response");
    const leaseCheckFailing = await checkFromLease(prepared, "ask-owner");
    const stillWaiting = await readStep(prepared, "ask-owner", "Record owner response");
    record({
      phase: "check/failing",
      failing,
      aBefore: summary(aBefore),
      aFailed: summary(aFailed),
      bBefore: summary(bBefore),
      bObserved: summary(bObserved),
      incomingA,
      failedStep: { primary: failedStep.primary, line: failedStep.checkLine },
      leaseCheckFailing,
      stillWaiting: { primary: stillWaiting.primary, line: stillWaiting.checkLine },
    });
    const failureLine =
      /^Reply check failed at \d{2}\/\d{2}\/\d{4}, \d{1,2}:\d{2} [AP]M C[SD]T\. Try again\.$/;
    decide(
      "check.failingIsolated",
      failing.status === 200 &&
        Number(failing.sequences?.notChecked ?? 0) === 1 &&
        Number(failing.sequences?.observed ?? 0) >= 1 &&
        /could not be read this time/.test(failing.line) &&
        aFailed?.observation?.state !== "current" &&
        Number(aFailed?.observation?.checkedAtMs ?? 0) >= failingAt &&
        !(aFailed?.inbound ?? []).some((entry) => entry.messageId === replyA.messageId) &&
        /^Incoming (not checked this run|could not be read cleanly)/.test(
          incomingA ?? "",
        ) &&
        bObserved?.observation?.state === "current" &&
        Number(bObserved?.observation?.checkedAtMs ?? 0) >= failingAt,
    );
    decide(
      "check.failureLine",
      failedStep.checkLine?.state === "failed" &&
        failureLine.test(failedStep.checkLine.text) &&
        !ownerDecisionLeads(failedStep.primary) &&
        leaseCheckFailing.shown === true &&
        leaseCheckFailing.checkLine?.state === "failed" &&
        failureLine.test(leaseCheckFailing.checkLine?.text ?? "") &&
        !ownerDecisionLeads(stillWaiting.primary),
    );

    // The thread reads again. With no worker run and the cursor still past the reply, the lease's
    // own "Check for a reply now" brings the reply to the step.
    await setMailThreadUnreadable(rehearsal, null);
    const cursor = (await mailboxState())?.history_id ?? null;
    const workerBefore = plainFields(await kit.readDocument(WORKER_STATE));
    const leaseCheck = await checkFromLease(prepared, "ask-owner");
    const workerAfter = plainFields(await kit.readDocument(WORKER_STATE));
    const aFound = await sequenceDoc(a.id);
    const day = centralDay(
      (await inboundOn(replyA.threadId, replyA.messageId)).at(-1)?.at,
    );
    const step = await readStep(prepared, "ask-owner", ownerDecisionLeads);
    const decision = await readDecision(OWNER_REPLY_FORM, OWNER_REPLY_CHOICE, a.id, {
      who: "Who approved in this reply",
    });
    const desk = await readDesk(prepared);
    const unsaved = await noDecisionYet("check (lease check)", prepared, "owner");
    record({
      phase: "check/lease-check",
      passedAt,
      cursor,
      leaseCheck,
      workerRuns: {
        before: workerBefore?.finishedAtMs ?? null,
        after: workerAfter?.finishedAtMs ?? null,
      },
      aFound: summary(aFound),
      step: { primary: step.primary, line: step.checkLine },
      decision,
      desk,
    });
    decide(
      "check.cursorPassed",
      /^\d+$/.test(passedAt) &&
        /^\d+$/.test(String(cursor ?? "")) &&
        BigInt(cursor) >= BigInt(passedAt) &&
        (aFound?.inbound ?? []).some((entry) => entry.messageId === replyA.messageId),
    );
    decide(
      "check.noTickSameState",
      leaseCheck.shown === true &&
        leaseCheck.statuses.length >= 1 &&
        leaseCheck.statuses.every((status) => status === 200) &&
        (workerBefore?.finishedAtMs ?? null) === (workerAfter?.finishedAtMs ?? null) &&
        ownerDecisionLeads(step.primary) &&
        step.text.includes(`Owner replied ${day}`) &&
        desk.next === OWNER_DECISION &&
        decision.shown === true &&
        decision.replyText === squash(textA) &&
        decision.namesThisMessage === true &&
        decision.checkedOnArrival === 0 &&
        decision.whoValue === "" &&
        unsaved,
    );
    await scanForBodies("check", [textA, textB]);
  }

  // ---- end: the catch-up, the 4,000 terminal record bound and a passed lease end -----------------

  async function phaseEnd() {
    await resetToStart("end");
    const a = await sendOwner(prepared);
    const b = await sendOwner(replied);
    // R-S275-7: B gets a reply that the history read before S275 passed without recording (the
    // mailbox cursor moves past it, audit finding A-03), B becomes a record from before the marker
    // (no replyWatch), and the worker's one-time catch-up is cleared, as on release.
    const text = `Synthetic owner reply ${tag} earlier: please renew.`;
    const delivered = await deliverOwnerReply(rehearsal, {
      threadId: b.threads[0].threadId,
      text,
    });
    const reply = (await inboundOn(delivered.threadId, delivered.messageId)).at(-1);
    await delay(2500);
    const mailboxKey = Buffer.from(b.senderEmail.trim().toLowerCase(), "utf8").toString(
      "base64url",
    );
    const stand = (await standInState(rehearsal)).mail.mailboxes.find(
      (box) => box.mailbox === b.senderEmail.trim().toLowerCase(),
    );
    const cursorPath = `${MAILBOX_STATE}/${mailboxKey}`;
    const cursorBefore =
      plainFields(await kit.readDocument(cursorPath))?.history_id ?? null;
    if (cursorBefore !== null)
      await kit.patchDocument(cursorPath, ["history_id"], {
        history_id: { stringValue: String(stand?.historyId ?? "") },
      });
    await kit.patchDocument(`${SEQUENCES_COLLECTION}/${b.id}`, ["replyWatch"], {});
    if (await kit.readDocument(WORKER_STATE))
      await kit.patchDocument(WORKER_STATE, ["catchUp"], {});
    const legacy = await sequenceDoc(b.id);
    record({
      phase: "end/legacy",
      cursorBefore,
      cursorAfter: plainFields(await kit.readDocument(cursorPath))?.history_id ?? null,
      standInHistory: stand?.historyId ?? null,
      a: summary(await sequenceDoc(a.id)),
    });
    const caughtTick = await tick("catch-up");
    const caught = await sequenceDoc(b.id);
    const nextTick = await tick("after the catch-up");
    const afterCatchUp = await sequenceDoc(b.id);
    const step = await readStep(replied, "ask-owner", ownerDecisionLeads);
    const entry = (caught?.inbound ?? []).find(
      (inbound) => inbound.messageId === delivered.messageId,
    );
    record({
      phase: "end/catch-up",
      legacy: summary(legacy),
      caught: summary(caught),
      after: summary(afterCatchUp),
      caughtTick,
      nextTick,
      receivedAtMs: entry?.receivedAtMs ?? null,
      replyAt: reply?.at ?? null,
      step: { primary: step.primary, stageLine: step.stageLine },
    });
    decide(
      "end.catchUp",
      legacy?.replyWatch === undefined &&
        Number(caughtTick.caughtUp ?? 0) === 1 &&
        Boolean(entry) &&
        entry.receivedAtMs === Date.parse(reply.at) &&
        caught?.replyWatch === true &&
        Number(nextTick.caughtUp ?? 0) === 0 &&
        (afterCatchUp?.inbound ?? []).filter(
          (inbound) => inbound.messageId === delivered.messageId,
        ).length === 1 &&
        ownerDecisionLeads(step.primary) &&
        step.text.includes(`Owner replied ${centralDay(reply.at)}`),
    );
    await scanForBodies("end", [text]);

    // ARCH-S275-1: 4,000 terminal records (completed and not watched, or cancelled) beside the
    // two watched messages; one run observes both within the worker's page limit.
    const source = await kit.readDocument(`${SEQUENCES_COLLECTION}/${a.id}`);
    const name = (id) =>
      `projects/${rehearsal.projectId}/databases/(default)/documents/${SEQUENCES_COLLECTION}/${id}`;
    const fixture = (index) => {
      const id = `w1204-terminal-${String(index).padStart(5, "0")}`;
      const completed = index % 2 === 0;
      return {
        update: {
          name: name(id),
          fields: {
            ...source.fields,
            id: { stringValue: id },
            state: { stringValue: completed ? "completed" : "cancelled" },
            replyWatch: { booleanValue: false },
            ...(completed
              ? {
                  replyWatchEnded: {
                    mapValue: {
                      fields: {
                        reason: { stringValue: "answer_recorded" },
                        atMs: { integerValue: String(Date.now()) },
                      },
                    },
                  },
                }
              : {}),
            context: {
              mapValue: {
                fields: {
                  ...source.fields.context.mapValue.fields,
                  entityId: { stringValue: String(990_000 + index) },
                },
              },
            },
          },
        },
      };
    };
    for (let first = 0; first < TERMINAL_FIXTURES; first += 500)
      await emulatorCall(rehearsal, ":commit", {
        method: "POST",
        body: {
          writes: Array.from({ length: 500 }, (_, offset) => fixture(first + offset)),
        },
      });
    const aBefore = await sequenceDoc(a.id);
    const bBefore = await sequenceDoc(b.id);
    const sampleBefore = await kit.readDocument(
      `${SEQUENCES_COLLECTION}/w1204-terminal-00000`,
    );
    const boundAt = Date.now();
    const boundTick = await tick("with 4,000 terminal records");
    const aAfter = await sequenceDoc(a.id);
    const bAfter = await sequenceDoc(b.id);
    const sampleAfter = await kit.readDocument(
      `${SEQUENCES_COLLECTION}/w1204-terminal-00000`,
    );
    record({
      phase: "end/bound",
      boundTick,
      a: { before: summary(aBefore), after: summary(aAfter) },
      b: { before: summary(bBefore), after: summary(bAfter) },
    });
    decide(
      "end.bound",
      boundTick.status === "processed" &&
        Number(boundTick.inspected ?? 0) <= WORKER_PAGE_LIMIT &&
        Number(boundTick.watched ?? 0) <= WORKER_PAGE_LIMIT &&
        Number(boundTick.watched ?? 0) >= 2 &&
        Number(boundTick.watchObserved ?? 0) >= 2 &&
        Number(aAfter?.observation?.checkedAtMs ?? 0) >= boundAt &&
        Number(bAfter?.observation?.checkedAtMs ?? 0) >= boundAt &&
        sampleBefore?.updateTime === sampleAfter?.updateTime,
    );

    // The lease end date has passed: A's work record cycle date moves to yesterday.
    const head = `${WORKSPACE_HEADS}/${createHash("sha256").update(String(prepared)).digest("hex")}`;
    const headDoc = plainFields(await kit.readDocument(head));
    if (headDoc?.basis?.dateIso)
      await kit.patchDocument(head, ["basis.dateIso"], {
        basis: { mapValue: { fields: { dateIso: { stringValue: centralIso(-1) } } } },
      });
    const watchedBefore = await sequenceDoc(a.id);
    const endTick = await tick("after the lease end date");
    const ended = await sequenceDoc(a.id);
    const laterTick = await tick("again");
    const afterEnd = await sequenceDoc(a.id);
    record({
      phase: "end/lease-end",
      basis: headDoc?.basis ?? null,
      before: summary(watchedBefore),
      ended: summary(ended),
      after: summary(afterEnd),
      endTick,
      laterTick,
    });
    decide(
      "end.leaseEndPasses",
      Boolean(headDoc?.basis?.dateIso) &&
        watchedBefore?.replyWatch === true &&
        ended?.replyWatch === false &&
        ended?.replyWatchEnded?.reason === "lease_end_passed" &&
        unvisited(ended, afterEnd),
    );
  }

  // ---- cancel: an open tenant offer with follow-ups, visited, then cancelled ---------------------

  async function phaseCancel() {
    await resetToStart("cancel");
    await sendOwner(prepared);
    const rent = Number(ctx.leases.prepared.rent ?? 0);
    const answer = await recordOwnerAnswer(ctx, page, prepared, { amount: rent + 50 });
    savesMade.owner_response += 1;
    if (answer.status !== 200) throw new Error("The owner's answer was not saved.");
    const dates = await enterRenewalDates(ctx, page, prepared, {
      start: "day-after",
      end: FIRST_TERM_END,
    });
    const offer = await sendTenantOffer(ctx, page, prepared, {
      followUps: {
        subject: "Following up on your renewal offer",
        body: "This is a synthetic rehearsal follow-up about the renewal offer we sent.",
        everyDays: 7,
        time: "09:00",
        endDate: centralIso(60),
        sendLimit: 3,
      },
    });
    if (offer.status >= 500) ctx.unresolved("tenant offer send with follow-ups");
    if (offer.status !== 200)
      throw new Error(`The tenant offer was not sent: ${offer.alert ?? offer.error}`);
    const id =
      offer.sequenceId ?? latest(await kit.sequences(prepared, "renewal_tenant")).id;
    const open = await sequenceDoc(id);
    const visitAt = Date.now();
    const visitTick = await tick("an open message");
    const visited = await sequenceDoc(id);
    // "Cancel future messages" on the opened communication.
    await kit.openPath(page, `/gmail-hub?communication=${encodeURIComponent(id)}`);
    const composer = page.getByRole("region", {
      name: "Workflow communication composer",
    });
    await composer.waitFor({ timeout: 60_000 });
    const cancelled = kit.appResponse(page, SEQUENCES_ROUTE, {
      match: (body) => kit.sequenceAction(body) === "cancel",
    });
    await composer
      .getByRole("button", { name: "Cancel future messages", exact: true })
      .click();
    const cancelStatus = (await cancelled).status();
    const afterCancel = await sequenceDoc(id);
    const firstTick = await tick("after the cancel");
    const once = await sequenceDoc(id);
    const secondTick = await tick("again");
    const twice = await sequenceDoc(id);
    record({
      phase: "cancel",
      answer,
      dates,
      open: summary(open),
      visited: summary(visited),
      visitTick,
      cancelStatus,
      afterCancel: summary(afterCancel),
      once: summary(once),
      twice: summary(twice),
      firstTick,
      secondTick,
    });
    decide(
      "cancel.cancelEnds",
      open?.state === "active" &&
        Number(open?.confirmedCount ?? 0) === 1 &&
        Number(visited?.observation?.checkedAtMs ?? 0) >= visitAt &&
        cancelStatus === 200 &&
        afterCancel?.state === "cancelled" &&
        afterCancel?.replyWatch !== true &&
        unvisited(afterCancel, once) &&
        unvisited(once, twice),
    );
  }

  // ---- replay: no direct refresh post in the seed and the drivers; N10-02 on the staff path ----

  async function phaseReplay() {
    const files = selectStaffPathFiles(
      readdirSync("tests/browser").map((name) => `tests/browser/${name}`),
    );
    const scan = checkStaffPathCalls(
      files.map((file) => ({ file, text: readFileSync(file, "utf8") })),
    );
    const refreshes = scan.violations.filter(({ action }) => action === "refresh");
    record({
      phase: "replay/static",
      files: scan.files.length,
      violations: scan.violations.length,
      refreshes: refreshes.length,
      unparsed: scan.unparsed.length,
    });
    decide(
      "replay.noDirectRefresh",
      scan.files.includes("scripts/lib/one-path-rehearsal/seeds.mjs") &&
        scan.files.includes("tests/browser/one-path-november-10-core-journeys.mjs") &&
        scan.violations.length === 0 &&
        scan.unparsed.length === 0,
    );
    decide("replay.n1002", await novemberTenTwo());
  }

  /**
   * N10-02 on the staff path: the S271 replay's own row when this run already made it on this
   * build (a full qualification run replays before its W12 rows), else that journey alone, from
   * the starting state, through the S271 driver as the replay runs it.
   */
  async function novemberTenTwo() {
    const verdictFile = join(rehearsal.runDir, "s271-verdict.json");
    const rowsFile = join(rehearsal.runDir, "s271-journeys.jsonl");
    const rowOf = () =>
      existsSync(rowsFile)
        ? (readFileSync(rowsFile, "utf8")
            .split("\n")
            .filter(Boolean)
            .flatMap((line) => {
              try {
                const entry = JSON.parse(line);
                return entry.id === "N10-02" && entry.verdict ? [entry] : [];
              } catch {
                return [];
              }
            })
            .at(-1) ?? null)
        : null;
    const startedAt = performance.timeOrigin;
    const replayedHere =
      existsSync(verdictFile) && statSync(verdictFile).mtimeMs >= startedAt && rowOf();
    let exit = null;
    if (!replayedHere) {
      await resetToStart("N10-02");
      exit = await runS271("N10-02");
    }
    const row = rowOf();
    record({
      phase: "replay/n10-02",
      reused: Boolean(replayedHere),
      exit,
      verdict: row?.verdict ?? null,
      source: row?.source ?? null,
      reason: row?.reason ? String(row.reason).slice(0, 400) : null,
    });
    return (
      row?.verdict === "Yes" && row.source === rehearsal.servedVersion && !row.missing
    );
  }
  function runS271(only) {
    return new Promise((done) => {
      const names = [
        "PATH",
        "HOME",
        "TMPDIR",
        "LANG",
        "TZ",
        "PLAYWRIGHT_CHROME_PATH",
        "DESK_BROWSER_EXECUTABLE",
        "PLAYWRIGHT_BROWSERS_PATH",
        "NOVDEC_JOURNEY_NETWORK_LOG",
        "ONE_PATH_REHEARSAL_ORIGIN",
        "ONE_PATH_REHEARSAL_RUN_DIR",
        "S260_SYNTHETIC_WORKER_TOKEN",
        "FIRESTORE_EMULATOR_HOST",
        "FIREBASE_AUTH_EMULATOR_HOST",
        "FIREBASE_PROJECT_ID",
        "GOOGLE_CLOUD_PROJECT",
      ];
      const env = Object.fromEntries(
        names
          .filter((name) => process.env[name] !== undefined)
          .map((name) => [name, process.env[name]]),
      );
      const log = createWriteStream(
        join(rehearsal.runDir, "november-12-w12-04-n10-02.log"),
        {
          flags: "a",
        },
      );
      const child = spawn(
        process.execPath,
        ["--import", `./${PRELOAD}`, S271_DRIVER, "--only", only],
        { stdio: ["ignore", "pipe", "pipe"], env },
      );
      child.stdout.pipe(log, { end: false });
      child.stderr.pipe(log, { end: false });
      const timer = setTimeout(() => child.kill("SIGTERM"), 45 * 60 * 1000);
      child.on("error", () => {
        clearTimeout(timer);
        log.end();
        done(1);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        log.end();
        done(code ?? 1);
      });
    });
  }

  // ---- safety: no watch, no scope, no body, no decision without the save -------------------------

  function safetyChecks() {
    const standInLog = rehearsal.files?.standInLog;
    const mailCalls =
      standInLog && existsSync(standInLog)
        ? readFileSync(standInLog, "utf8")
            .split("\n")
            .filter(Boolean)
            .flatMap((line) => {
              try {
                const entry = JSON.parse(line);
                return entry.standIn === "mail" && entry.method ? [entry] : [];
              } catch {
                return [];
              }
            })
        : null;
    const watchCalls = (mailCalls ?? []).filter(
      (entry) => entry.path === "/watch" || entry.path === "/stop",
    ).length;
    const watchWrites = ctx.writes.filter((write) =>
      /^\/api\/gmail-hub\/(watch|pubsub)/.test(write.path),
    ).length;
    record({
      safety: "watch",
      mailCalls: mailCalls?.length ?? null,
      watchCalls,
      watchWrites,
    });
    decide("safety.noWatch", mailCalls !== null && watchCalls === 0 && watchWrites === 0);

    // The served source declares exactly the four approved Gmail scopes and no other.
    const scopesFile = "lib/gmail-runtime/scopes.ts";
    const scopes = existsSync(scopesFile) ? readFileSync(scopesFile, "utf8") : "";
    const declared = [...scopes.matchAll(/\$\{GMAIL_SCOPE_PREFIX\}([a-z.]+)`/g)].map(
      (match) => match[1],
    );
    const literal = [];
    const walk = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx|mjs|js)$/.test(entry.name))
          for (const match of readFileSync(path, "utf8").matchAll(
            /googleapis\.com\/auth\/gmail\.([a-z.]+)/g,
          ))
            literal.push({ path, scope: match[1] });
      }
    };
    for (const directory of ["lib", "app", "components"])
      if (existsSync(directory)) walk(directory);
    record({ safety: "scope", declared, literal });
    decide(
      "safety.noScope",
      JSON.stringify([...declared].sort()) ===
        JSON.stringify([...APPROVED_GMAIL_SCOPES].sort()) &&
        literal.every(({ scope }) => APPROVED_GMAIL_SCOPES.includes(scope)),
    );

    decide(
      "safety.noBody",
      bodyScans.length > 0 && bodyScans.every((scan) => scan.found.length === 0),
      bodyScans,
    );
    // Each answer on the record came from a staff save this row made, and none came before it.
    const answerWrites = {
      owner_response: ctx.writes.filter(
        (write) => write.path === WORKSPACE_ROUTE && write.kind === "owner_response",
      ).length,
      tenant_response: ctx.writes.filter(
        (write) => write.path === WORKSPACE_ROUTE && write.kind === "tenant_response",
      ).length,
    };
    record({ safety: "decision", answerWrites, savesMade, unsavedDecisions });
    decide(
      "safety.noUnsavedDecision",
      unsavedDecisions.length > 0 &&
        unsavedDecisions.every((entry) => entry.clean) &&
        answerWrites.owner_response === savesMade.owner_response &&
        answerWrites.tenant_response === savesMade.tenant_response,
    );
  }

  // ---- Run the phases in order; a phase that stops fails its own undecided parts ---------------

  const runPhase = async (name, run) => {
    if (!phases.has(name)) return undefined;
    const at = Date.now();
    try {
      const value = await run();
      record({ phaseDone: name, seconds: Math.round((Date.now() - at) / 1000) });
      return value;
    } catch (error) {
      await screenshot(name);
      record({
        phaseStopped: name,
        seconds: Math.round((Date.now() - at) / 1000),
        error: String(error?.message ?? error).slice(0, 900),
      });
      for (const part of PHASE_PARTS[name])
        if (!(part in parts)) decide(part, false, "the phase stopped before this part");
      return undefined;
    }
  };
  const owner = await runPhase("owner", phaseOwner);
  await runPhase("tenant", () => phaseTenant(owner?.reply ?? null));
  await runPhase("check", phaseCheck);
  await runPhase("end", phaseEnd);
  await runPhase("cancel", phaseCancel);
  await runPhase("replay", phaseReplay);
  // AC-S275-6 reads the whole row; it is decided only when every phase ran.
  if (PHASES.every((name) => phases.has(name))) safetyChecks();

  const checks = {};
  for (const [id, needed] of Object.entries(CHECK_PARTS))
    if (needed.every((part) => part in parts))
      checks[id] = needed.every((part) => parts[part] === true);
  record({ candidateChecks: checks, phases: [...phases], parts });
  return checks;
}
