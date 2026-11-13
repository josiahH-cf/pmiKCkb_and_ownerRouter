// S284 W12-09, "What needs me": the candidate-side acceptance checks of S280 (intake 158) for the
// November 12 qualification matrix.
//
// Spec: docs/feature-suites/staff-waiting-on-you-renewal-work.md (S280).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S280-1, AC-S280-2, AC-S280-3, AC-S280-4, AC-S280-5, AC-S280-6, AC-S280-7
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Read the Dashboard after a reply, a hold and an unconfirmed send on your own leases. Create a
//   Sheet rent and date difference on three leases and read four screens, then make RentVine
//   unreadable on one. Age the renewal read. Read the notification menu as an Editor and as an
//   Admin.
//
// Starting sequence (journeyW1209 in one-path-november-12-journeys.mjs, the fail-first table):
//   Create rent differences on three leases and read the Dashboard. On the baseline: One unnamed
//   "Current rent" row. It runs on the candidate unchanged; there it reads no "Current rent" row
//   at all, because S280 R-S280-6 makes a readable RentVine and Sheet rent difference information.
//   Its own cleanup serves the fixture's Sheet cells again before these checks start.
//
// How the checks reach each state (R-S284-2): staff controls only. The Editor sends, schedules,
// records answers, saves the renewal dates, uses "Refresh data", "Refresh" and the links of each
// screen; the Sheet stand-in serves changed cells (setSheetCells), the RentVine stand-in fails one
// lease's read (setRentvineOutage), the mail stand-in delivers an owner reply and loses one send
// (setNextSend "unconfirmed-lost": nothing is kept, so the outcome is known); time passes only
// through the worker tick and, for the renewal read's 60 second freshness limit, by waiting with no
// renewal page open. Nothing here posts an app route: every request is one a visible control makes,
// and the reads are pages, GET routes, the rehearsal's own emulator and the stand-ins' state.
//
//   P1  the starting state: the Dashboard as the Editor and as the Approver (the replied lease's
//       owner message was sent by the Editor in the seed, with the owner's reply read onto it).
//   P2  the team line: the Dashboard, the bare Renewal Desk, My Work's empty state and the task
//       question "What work is assigned to me today?".
//   P3  a Sheet rent and a Sheet lease end that differ from RentVine on the three leases with a
//       Sheet row: the numbers check, the Dashboard, the Approval Queue and Live renewal review.
//   P4  RentVine unreadable on one of them (its lease read fails): the same screens; a different
//       app working rent remains a decision on the lease and is then cleared through its control.
//   P5  the Sheet rent unreadable on all three, so each rent difference is a decision again: named
//       rows, their links, the counts on the Dashboard, the Approval Queue and Live renewal review.
//   P6  the renewal read aged past its limit: retained rows, Refresh, and a decision control on a
//       retained row.
//   P7  the viewer's own follow-through: an owner reply on the prepared lease, then its scheduled
//       tenant offer out of date, then held by the worker, then an unconfirmed tenant offer on the
//       replied lease. The Editor and the Approver read the Dashboard after each.
//   P8  the notification menu and its families as the Editor, the Approver and the Admin.
//   Every Dashboard open is measured for AC-S280-6: the page's own non-GET requests, sent mail,
//   comparison and model lookups, emulator documents changed and any reply body in a response.
//
// AC-S280-3 in this rehearsal. The live review reconciles the Sheet against RentVine, which reads
// only the current rent and the lease end; after R-S280-6 a readable difference in either is
// information on every screen, so the only RentVine and Sheet difference that is still a decision is
// one the rule keeps as a decision (here the Sheet rent that cannot be read). The "two fields" are
// therefore the rent (decision rows) and the lease end (information rows): rows equal the lease and
// field pairs when each pair is shown exactly once, as a decision or as information. The market
// value and owner decision conflicts of AC-S280-7 have no second source in the live review.
// The two independent reconciliation cases run on the served tree under the network guard.
import {
  deliverOwnerReply,
  setNextSend,
  setRentvineOutage,
  setSheetCells,
  standInState,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import {
  CHANGED_TERM_END,
  FIRST_TERM_END,
  enterRenewalDates,
  refreshData,
  scheduleTenantOffer,
  sendOwnerMessage,
  sendTenantOffer,
} from "./one-path-november-12-journeys.mjs";
import { DESK, WORKING_ROUTE, WORKSPACE_ROUTE } from "./one-path-november-12-kit.mjs";
import {
  serverProviderCalls,
  sheetWriteAttempts,
} from "./one-path-november-12-provider-log.mjs";
import { runRehearsalVitest } from "./one-path-november-12-unit-run.mjs";

export const W1209_CHECKS = Object.freeze([
  "AC-S280-1",
  "AC-S280-2",
  "AC-S280-3",
  "AC-S280-4",
  "AC-S280-5",
  "AC-S280-6",
  "AC-S280-7",
]);

/** R-S280-1, word for word (lib/attention/renewal-follow-through-words.ts). */
export const FOLLOW_WORDS = Object.freeze({
  basis: "Because you sent this message.",
  reply: { owner: "record the owner's decision", tenant: "record the tenant's response" },
  held: { owner: "review the held owner message", tenant: "review the held offer" },
  out_of_date: {
    owner: "update the out-of-date owner message",
    tenant: "update the out-of-date offer",
  },
  unconfirmed: {
    owner: "check whether the owner message went out",
    tenant: "check whether the offer went out",
  },
});
const STEP = Object.freeze({ owner: "ask-owner", tenant: "offer-tenant" });
const LIVE = "/lease-renewal/live";
const QUEUE = "/approval-queue";
const SOURCE_DIFFERENCE_TEST = "tests/unit/s280-source-difference-rule.test.ts";
const DESK_LINK = "Open the Renewal Desk.";
/** R-S280-4 and the stale sentence it removed. */
const RETAINED_READ =
  /^Renewal data last read (\d{2}\/\d{2}\/\d{4}, \d{1,2}:\d{2} [AP]M C[SD]T)/;
const REFRESH_FAILED =
  "The renewal data could not be read just now. The renewal rows shown are from the last read.";
const OLD_STALE = /Retained comparisons cannot establish current decisions/i;
/** The owner's reply this row delivers on the prepared lease. */
export const OWNER_REPLY_TEXT =
  "Synthetic owner reply for the waiting-on-you check: please go ahead.";
/** The renewal read is stale 60 s after it was made (lib/lease-renewal/live-lease-cache.ts). */
const AGE_MS = 75_000;
const RETIRED_FAMILIES = ["maintenance_tickets", "maintenance_communications"];
const ADMIN_FAMILIES = [
  "approval_queue",
  "connections_setup",
  "space_coverage",
  "team_review",
  "renewal_communications",
  "support_reports",
];
const STAFF_FAMILIES = ["approval_queue", "renewal_communications"];

const squash = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
const usDate = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
/** "$1,300" as the numbers check writes an amount; "$1,300.00" as the information line does. */
const noteMoney = (amount) =>
  `$${(Number.isInteger(amount) ? String(amount) : amount.toFixed(2)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
const lineMoney = (amount) =>
  `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** The last day of the month before an ISO month-end date. */
function monthEndBefore(iso) {
  const [year, month] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
}
const unique = (values) => new Set(values).size === values.length;

// ---- What the Dashboard shows -------------------------------------------------------------------

/** The "Waiting on you" panel as staff read it, from its rendered markup. */
function panelFrom(root) {
  const text = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
  const follow = [
    ...root.querySelectorAll('[data-testid="attention-follow-through"] > li'),
  ].map((li) => ({
    kind: li.getAttribute("data-kind"),
    label: text(li.querySelector("a")),
    href: li.querySelector("a")?.getAttribute("href") ?? null,
    basis: text(li.querySelector("span.muted")),
  }));
  const lists = [...root.querySelectorAll("ul.dashboard-attention-list")].filter(
    (list) => !list.hasAttribute("data-testid"),
  );
  const rows = lists.flatMap((list) =>
    [...list.children].map((li) => ({
      label: text(li.querySelector("a")),
      href: li.querySelector("a")?.getAttribute("href") ?? null,
      authority: li.getAttribute("data-authority"),
      retained: li.getAttribute("data-retained") === "true",
      buttons: li.querySelectorAll("button").length,
      text: text(li).slice(0, 240),
    })),
  );
  const team = root.querySelector('[data-testid="renewal-team-line"]');
  const retained = root.querySelector('[data-testid="renewal-read-retained"]');
  const more = root.querySelector('[data-testid="attention-more-renewal"]');
  return {
    count: text(root.querySelector('[data-testid="attention-count"]')) || null,
    follow,
    rows,
    team: team
      ? {
          count: team.getAttribute("data-count"),
          text: text(team),
          href: team.querySelector("a")?.getAttribute("href") ?? null,
          link: text(team.querySelector("a")),
        }
      : null,
    retained: retained
      ? {
          text: text(retained),
          refresh: [...retained.querySelectorAll("button")].map(text),
        }
      : null,
    more: more ? { text: text(more), href: more.getAttribute("href") } : null,
    issue: text(root.querySelector('[data-testid="renewal-review-issue"]')) || null,
    followUnavailable: Boolean(
      root.querySelector('[data-testid="attention-follow-through-unavailable"]'),
    ),
    tryAgain: [...root.querySelectorAll("button")].filter(
      (button) => text(button) === "Try again",
    ).length,
    statusLines: [...root.querySelectorAll('[role="status"]')].map(text),
    text: text(root),
  };
}

/** Every emulator document's update time, by path (the rehearsal's own disposable project). */
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

function documentChanges(before, after) {
  if (!before || !after) return null;
  const changed = [];
  for (const [path, time] of Object.entries(after))
    if (before[path] !== time) changed.push(path);
  for (const path of Object.keys(before)) if (!(path in after)) changed.push(path);
  return changed;
}

/** Sent mail, comparison lookups and model requests the stand-ins have seen. */
async function outsideCounts(rehearsal) {
  const state = await standInState(rehearsal);
  return {
    sent: (state.mail?.mailboxes ?? [])
      .flatMap((box) => box.messages ?? [])
      .filter((message) => (message.labelIds ?? []).includes("SENT")).length,
    lookups: (state.comparison?.requests ?? []).length,
    model: (state.model?.requests ?? []).length,
  };
}

// ---- Steps staff take ---------------------------------------------------------------------------

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

/** The owner's approval in the owner response editor, as staff record it. */
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
  const status = (await saved).status();
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  return { status };
}

/** "Refresh data" on the bare desk: RentVine and the operating Sheet are read again. */
async function refreshFromDesk(ctx, page) {
  await ctx.kit.openPath(page, DESK);
  return refreshData(ctx, page);
}

// ---- The check ------------------------------------------------------------------------------------

/**
 * W12-09 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1209 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S280-1 to AC-S280-7 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1209(ctx, page, start) {
  const { kit, rehearsal } = ctx;
  const failures = [];
  /** Run one part; a part that stops is recorded and reads as not observed. */
  async function part(name, work) {
    try {
      const result = await work();
      ctx.record({ part: name, result });
      return result;
    } catch (error) {
      const message = String(error?.message ?? error).slice(0, 700);
      failures.push(name);
      ctx.record({ part: name, error: message });
      return null;
    }
  }
  ctx.record({
    startingSequence: start.error ? { stopped: start.error } : start.observed,
  });

  const prepared = Number(ctx.leases.prepared?.leaseId ?? 9101);
  const replied = Number(ctx.leases.replied?.leaseId ?? kit.mix.roles?.replied?.leaseId);
  /** The three leases the operating Sheet holds a row for. */
  const sheetLeases = (kit.mix.sheet?.rows ?? [])
    .map((row) => Number(row.leaseId))
    .filter((leaseId) => kit.row(leaseId));
  const fact = (leaseId) => {
    const row = kit.row(leaseId);
    const property = row?.property ?? {};
    return {
      leaseId,
      address: `${property.streetNumber} ${property.streetName}`,
      rent: Number(ctx.leases.byId(leaseId)?.rent ?? row?.unit?.rent),
      end: String(ctx.leases.byId(leaseId)?.endDate ?? row?.lease?.endDate),
    };
  };
  const replyTexts = [OWNER_REPLY_TEXT, kit.mix.roles?.replied?.ownerReply?.text].filter(
    Boolean,
  );

  // Pages: the Editor's (from the starting sequence), then the Approver's and the Admin's.
  const pages = { Editor: page };
  const keyWarnings = [];
  const watchConsole = (role, open) =>
    open.on("console", (message) => {
      const text = message.text();
      if (/same key|unique "key"/i.test(text))
        keyWarnings.push({ role, at: open.url(), text: text.slice(0, 200) });
    });
  watchConsole("Editor", page);
  async function rolePage(role) {
    if (!pages[role]) {
      pages[role] = await ctx.newPage(role);
      watchConsole(role, pages[role]);
    }
    return pages[role];
  }
  /** Leave a page where it reads no renewal data (the aging waits need no reader). */
  const park = async (open) =>
    open.goto("about:blank", { waitUntil: "load" }).catch(() => undefined);

  // ---- The Dashboard, measured (AC-S280-6) --------------------------------------------------
  const dashboardReads = [];
  /**
   * Open the Dashboard on `open` and read "Waiting on you". The open is a read window: nothing
   * else acts while it runs, and what it caused is measured.
   */
  async function dashboard(role, label, { until = null, tries = 1 } = {}) {
    const open = await rolePage(role);
    let read = null;
    for (let attempt = 1; attempt <= tries; attempt += 1) {
      const writesBefore = ctx.writes.length;
      const outsideBefore = await outsideCounts(rehearsal);
      const documentsBefore = await emulatorDocuments(rehearsal);
      const bodies = [];
      const pending = [];
      const listen = (response) => {
        const url = new URL(response.url());
        if (url.origin !== ctx.origin) return;
        const type = response.headers()["content-type"] ?? "";
        if (!/json|html|text|x-component/.test(type)) return;
        pending.push(
          response
            .text()
            .then((body) => {
              for (const words of replyTexts)
                if (body.includes(words)) bodies.push(url.pathname);
            })
            .catch(() => undefined),
        );
      };
      open.on("response", listen);
      await kit.openPath(open, "/");
      const panel = open.locator('section[aria-label="Waiting on you"]:not([aria-busy])');
      await panel.waitFor({ timeout: 120_000 });
      await open
        .locator('[data-testid="renewal-team-line"]')
        .waitFor({ timeout: 45_000 })
        .catch(() => undefined);
      await open.waitForTimeout(1_500);
      const panelRead = await panel.evaluate(panelFrom);
      open.off("response", listen);
      await Promise.all(pending);
      const writes = ctx.writes.slice(writesBefore);
      const outsideAfter = await outsideCounts(rehearsal);
      const documentsAfter = await emulatorDocuments(rehearsal);
      const changed = documentChanges(documentsBefore, documentsAfter);
      read = {
        role,
        label,
        attempt,
        panel: panelRead,
        safety: {
          writes,
          sent: outsideAfter.sent - outsideBefore.sent,
          lookups: outsideAfter.lookups - outsideBefore.lookups,
          model: outsideAfter.model - outsideBefore.model,
          documentsChanged: changed,
          replyBodyIn: [...new Set(bodies)],
          replyBodyInPanel: replyTexts.some((words) => panelRead.text.includes(words)),
        },
      };
      dashboardReads.push(read);
      ctx.record({ dashboard: { ...read, panel: { ...panelRead, text: undefined } } });
      if (!until || until(read.panel)) break;
    }
    return read;
  }

  /** One follow-through row read against the rule R-S280-1 states. */
  function followRow(panel, leaseId, audience, kind) {
    const address = fact(leaseId).address;
    const words = FOLLOW_WORDS[kind][audience];
    const matching = panel.follow.filter(
      (row) =>
        row.kind === kind &&
        row.label.endsWith(`: ${words}`) &&
        new RegExp(`/lease/${leaseId}(?:\\?|$)`).test(row.href ?? ""),
    );
    const row = matching[0] ?? null;
    const href = row?.href ?? "";
    return {
      count: matching.length,
      row,
      named:
        Boolean(row && row.label === `${row.label.split(": ")[0]}: ${words}`) &&
        Boolean(row?.label.startsWith(address)),
      basis:
        row?.basis === `· ${FOLLOW_WORDS.basis}` || row?.basis === FOLLOW_WORDS.basis,
      step: new URLSearchParams(href.split("?")[1] ?? "").get("step") === STEP[audience],
    };
  }
  const rowOk = (read) => read.count === 1 && read.named && read.basis && read.step;
  /** Each lease and audience shows at most one row of the viewer's own (one current message). */
  const onePerMessage = (panel) =>
    unique(
      panel.follow.map((row) => {
        const lease = /\/lease\/(\d+)/.exec(row.href ?? "")?.[1];
        const step = new URLSearchParams((row.href ?? "").split("?")[1] ?? "").get(
          "step",
        );
        return `${lease}:${step}`;
      }),
    );

  /** Follow a follow-through row's link from the Dashboard and read where it lands. */
  async function followLink(leaseId, audience, kind) {
    const words = FOLLOW_WORDS[kind][audience];
    await kit.openPath(page, "/");
    const list = page.locator('[data-testid="attention-follow-through"]');
    await list.waitFor({ timeout: 120_000 });
    const link = list
      .locator(`li[data-kind="${kind}"] a[href*="/lease/${leaseId}"]`)
      .filter({ hasText: words })
      .first();
    await link.click();
    await page.waitForURL((url) => url.pathname.includes(`/lease/${leaseId}`), {
      timeout: 120_000,
    });
    await page
      .getByRole("region", { name: "Current renewal stage" })
      .waitFor({ timeout: 120_000 });
    const url = new URL(page.url());
    return {
      path: url.pathname,
      step: url.searchParams.get("step"),
      opened: url.searchParams.get("step") === STEP[audience],
    };
  }

  // ---- What each screen shows for the Sheet differences ------------------------------------------

  async function numbersCheck(leaseId) {
    await kit.openLease(page, leaseId, "?step=check-numbers");
    const section = page.locator('section[aria-label="Numbers check"]').first();
    const shown = await kit.shownWithin(section, 90_000);
    if (!shown) return { leaseId, shown: false };
    await page.waitForTimeout(1_000);
    return {
      leaseId,
      shown: true,
      state: await section.getAttribute("data-renewal-numbers"),
      line: squash(
        await section.locator('[data-renewal-field="numbers-line"]').innerText(),
      ),
      notes: (
        await section
          .locator('[data-renewal-field="sheet-note"]')
          .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""))
      ).map(squash),
    };
  }

  async function approvalQueue() {
    await kit.openPath(page, QUEUE);
    const inbox = page.locator('[aria-label="Needs your decision"]').first();
    await inbox.waitFor({ timeout: 120_000 });
    await page.waitForTimeout(1_000);
    const inboxText = await kit.visibleText(inbox);
    const total = /Nothing needs your decision/.test(inboxText)
      ? 0
      : Number(/(\d+) things? needs? your decision/.exec(inboxText)?.[1] ?? NaN);
    const rows = await inbox.locator("li").evaluateAll((nodes) =>
      nodes.map((node) => ({
        label: (node.querySelector("strong")?.textContent ?? "").trim(),
        href: node.querySelector("a")?.getAttribute("href") ?? null,
      })),
    );
    const unavailable = await page
      .getByText("Renewal review and write-back status are unavailable", { exact: false })
      .count();
    const other = page
      .locator("details")
      .filter({ has: page.locator("summary", { hasText: "Other views" }) })
      .first();
    await kit.openDisclosure(other);
    const tab = page.getByRole("tab", { name: /^Renewal reviews/ });
    await tab.waitFor({ timeout: 30_000 });
    const tabText = squash(await tab.innerText());
    const writebackText = squash(
      await page.getByRole("tab", { name: /^Write-back proposals/ }).innerText(),
    );
    await tab.click();
    const panel = page.locator('[aria-label="Renewal review"]').first();
    await panel.waitFor({ timeout: 30_000 });
    const tabRows = await panel.locator("ul.ui-rows > li").evaluateAll((nodes) =>
      nodes.map((node) => ({
        label: (node.querySelector("strong")?.textContent ?? "").trim(),
        href: node.querySelector("a")?.getAttribute("href") ?? null,
      })),
    );
    return {
      total,
      rows,
      unavailable: unavailable > 0,
      renewalTab: Number(/\((\d+)\)/.exec(tabText)?.[1] ?? 0),
      writebackTab: Number(/\((\d+)\)/.exec(writebackText)?.[1] ?? 0),
      tabRows,
    };
  }

  async function liveReview(open = page, hash = "") {
    await kit.openPath(open, `${LIVE}${hash}`);
    await open
      .getByRole("heading", { name: "Live renewal review" })
      .waitFor({ timeout: 120_000 });
    await open.waitForTimeout(1_000);
    return open.evaluate(() => {
      const text = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
      const section = document.querySelector('section[data-group="information"]');
      return {
        cards: [...document.querySelectorAll("article.lr-flag-card")].map((card) => ({
          id: card.id,
          head: text(card.querySelector("header strong")),
          resolveForms: card.querySelectorAll(".lr-resolve-form").length,
          text: text(card).slice(0, 300),
        })),
        info: [...document.querySelectorAll('section[data-group="information"] li')].map(
          (li) => ({
            id: li.id,
            field: li.getAttribute("data-field"),
            line: text(li.querySelector("p")),
            link: li.querySelector("a")?.getAttribute("href") ?? null,
            linkText: text(li.querySelector("a")),
          }),
        ),
        infoIntro: text(section?.querySelector("p.muted")),
        infoDecisionWords: /High|Needs human approval|severity/.test(text(section)),
        status:
          [...document.querySelectorAll("p.muted")]
            .map(text)
            .find((line) => line.startsWith("Data status:")) ?? null,
        blocker:
          text(document.querySelector('p.workflow-blocker[role="status"]')) || null,
        hash: location.hash,
        target: location.hash
          ? text(
              document
                .getElementById(location.hash.slice(1))
                ?.querySelector("header strong, p"),
            )
          : null,
      };
    });
  }

  /** The four screens for the three Sheet leases. */
  async function fourScreens(label) {
    const numbers = [];
    for (const leaseId of sheetLeases) numbers.push(await numbersCheck(leaseId));
    const dash = await dashboard("Editor", label);
    const queue = await approvalQueue();
    const live = await liveReview();
    return { numbers, dashboard: dash.panel, queue, live };
  }
  const namesSheetLease = (label, field) =>
    sheetLeases.some((leaseId) => label.startsWith(`${fact(leaseId).address}`)) &&
    label.endsWith(`: ${field}`);

  // ==== P1: the starting state ====================================================================
  const effectsAtStart = await part("effects at start", async () => ({
    outside: await outsideCounts(rehearsal),
    maintenance: await maintenanceRecords(kit),
  }));
  const p1 = await part("P1 Dashboard at the start", async () => ({
    editor: await dashboard("Editor", "start", {
      until: (panel) => followRow(panel, replied, "owner", "reply").count === 1,
      tries: 2,
    }),
    approver: await dashboard("Approver", "start (Approver)"),
  }));

  // ==== P2: the team line ==========================================================================
  const p2 = await part("P2 team line", async () => {
    const dash = await dashboard("Editor", "team line");
    // The bare desk is the working batch the line counts.
    await kit.openPath(page, DESK);
    const batch = page.getByRole("region", { name: "Working batch", exact: true });
    await batch.waitFor({ timeout: 120_000 });
    const desk = await batch.evaluate((root) => {
      const text = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
      const monthly = [...root.querySelectorAll("button.renewal-batch-count")].find(
        (button) => text(button).startsWith("Monthly renewals"),
      );
      const leases = new Set(
        [
          ...root.querySelectorAll(
            '[data-batch-lease][data-batch-group="carried_over"], [data-batch-lease][data-batch-group="this_batch"]',
          ),
        ].map((row) => row.getAttribute("data-batch-lease")),
      );
      return {
        month: root.getAttribute("data-batch-month"),
        monthly: Number(/(\d+)\s*$/.exec(text(monthly))?.[1] ?? NaN),
        thisBatch: Number(
          root
            .querySelector(".renewal-batch-summary")
            ?.getAttribute("data-batch-count") ?? NaN,
        ),
        carriedOver: Number(
          /^(\d+) carried over/.exec(
            text(root.querySelector(".renewal-batch-note")),
          )?.[1] ?? NaN,
        ),
        listedRows: leases.size,
      };
    });
    // The line's link, followed from the Dashboard.
    await kit.openPath(page, "/");
    const link = page
      .locator('[data-testid="renewal-team-line"] a')
      .filter({ hasText: DESK_LINK });
    await link.waitFor({ timeout: 60_000 });
    await link.click();
    await page.waitForURL((url) => url.pathname === DESK, { timeout: 120_000 });
    const landed = page.getByRole("region", { name: "Working batch", exact: true });
    await landed.waitFor({ timeout: 120_000 });
    const landedMonth = await landed.getAttribute("data-batch-month");
    // My Work's empty state.
    await kit.openPath(page, "/work");
    const empty = page
      .getByRole("region", { name: "Assigned tasks" })
      .getByRole("status")
      .filter({ hasText: /^No tasks assigned/ });
    const emptyShown = await kit.shownWithin(empty, 60_000);
    const workLine = page.locator('[data-testid="renewal-team-line"]').first();
    const workShown = await kit.shownWithin(workLine, 45_000);
    const work = workShown
      ? {
          count: await workLine.getAttribute("data-count"),
          text: await kit.visibleText(workLine),
          href: await workLine.locator("a").getAttribute("href"),
        }
      : null;
    // The task question keeps its task meaning.
    await kit.openPath(page, "/");
    const question = page.getByRole("textbox", { name: "Question", exact: true });
    await question.waitFor({ timeout: 60_000 });
    await question.fill("What work is assigned to me today?");
    await page.getByRole("button", { name: "Get answer", exact: true }).click();
    const answer = page.getByRole("region", { name: "Assistant answer", exact: true });
    await answer.waitFor({ timeout: 180_000 });
    await page.waitForTimeout(2_000);
    const answerText = await kit.visibleText(answer);
    const answerLinks = await answer
      .locator("a")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    return {
      dashboard: dash.panel.team,
      desk,
      landed: { month: landedMonth, sameMonth: landedMonth === desk.month },
      work: { emptyShown, line: work },
      answer: { text: answerText.slice(0, 600), links: answerLinks.slice(0, 10) },
    };
  });

  // ==== P3: a Sheet rent and lease end that differ, on three leases ==============================
  const sheetEnd = (leaseId) => monthEndBefore(fact(leaseId).end);
  const serveDifferences = (rentCell) => {
    for (const leaseId of sheetLeases)
      setSheetCells(rehearsal, leaseId, {
        3: usDate(sheetEnd(leaseId)),
        4: rentCell(leaseId),
      });
  };
  const readableRent = (leaseId) =>
    `$${(fact(leaseId).rent - 50).toLocaleString("en-US")}`;
  const sourceVariantStart = serverProviderCalls(rehearsal).length;
  const p3 = await part("P3 Sheet rent and lease end differ", async () => {
    serveDifferences(readableRent);
    const refreshed = await refreshFromDesk(ctx, page);
    return { refreshed, ...(await fourScreens("Sheet differences")) };
  });

  // ==== P4: RentVine unreadable on one lease =====================================================
  const unreadableLease =
    sheetLeases.find((leaseId) => leaseId !== prepared && leaseId !== replied) ??
    sheetLeases[1];
  const p4 = await part("P4 RentVine unreadable on one lease", async () => {
    setRentvineOutage(rehearsal, `leases/${unreadableLease}`);
    try {
      const refreshed = await refreshFromDesk(ctx, page);
      const numbers = await numbersCheck(unreadableLease);
      const dash = await dashboard("Editor", "RentVine unreadable");
      const queue = await approvalQueue();
      const live = await liveReview();
      return {
        leaseId: unreadableLease,
        refreshed,
        numbers,
        dashboard: dash.panel,
        queue,
        live,
      };
    } finally {
      setRentvineOutage(rehearsal, null);
    }
  });

  const workingRent = await part(
    "P4 an app working rent differs from RentVine",
    async () => {
      const leaseId = sheetLeases.find((id) => id !== prepared && id !== replied);
      if (!leaseId) throw new Error("No comparison lease without message work.");
      const target = "#renewal-working-current-rent input";
      await kit.openLease(page, leaseId, "?view=full");
      if (!(await kit.reveal(page, target)))
        throw new Error("The working current rent control could not be opened.");
      const field = page.locator(target).first();
      const prior = await field.inputValue();
      const amount = fact(leaseId).rent + 25;
      const save = async (value) => {
        const response = kit.appResponse(page, WORKING_ROUTE, {
          match: (body) => body?.field === "current_rent",
        });
        if (value === "") {
          await page
            .locator("#renewal-working-current-rent")
            .getByRole("button", { name: "Clear the working value", exact: true })
            .click();
        } else {
          await field.fill(value);
          await field.blur();
        }
        return (await response).status();
      };
      const mark = ctx.writes.length;
      const priorEffects = await outsideCounts(rehearsal);
      const saved = await save(String(amount));
      let numbers;
      let restored;
      try {
        numbers = await numbersCheck(leaseId);
      } finally {
        await kit.openLease(page, leaseId, "?view=full");
        if (!(await kit.reveal(page, target)))
          throw new Error(
            "The working current rent could not be restored through the control.",
          );
        restored = await save(prior);
      }
      const afterEffects = await outsideCounts(rehearsal);
      return {
        leaseId,
        amount,
        saved,
        numbers,
        restored,
        effects: JSON.stringify(priorEffects) === JSON.stringify(afterEffects),
        writes: ctx.writes
          .slice(mark)
          .filter((write) => write.path !== "/api/personal-view"),
      };
    },
  );
  const sourceVariantCalls = serverProviderCalls(rehearsal).slice(sourceVariantStart);
  const sourceWrites = {
    sheets: sheetWriteAttempts(sourceVariantCalls).length,
    rentvine: sourceVariantCalls.filter((entry) => entry.refused === "rentvine_write")
      .length,
  };

  // ==== P5: the Sheet rent cannot be read, so the rent difference is a decision ===================
  const p5 = await part("P5 decisions on three leases", async () => {
    serveDifferences(() => "TBD");
    const refreshed = await refreshFromDesk(ctx, page);
    const dash = await dashboard("Editor", "three decisions");
    const queue = await approvalQueue();
    const live = await liveReview();
    // Each Dashboard row's own link, followed.
    const opened = [];
    for (const row of dash.panel.rows.filter((entry) =>
      (entry.href ?? "").startsWith(`${LIVE}#`),
    )) {
      await kit.openPath(page, "/");
      const link = page
        .locator('section[aria-label="Waiting on you"] ul.dashboard-attention-list a')
        .filter({ hasText: row.label })
        .first();
      await link.waitFor({ timeout: 120_000 });
      await link.click();
      await page.waitForURL((url) => url.pathname === LIVE, { timeout: 120_000 });
      await page
        .getByRole("heading", { name: "Live renewal review" })
        .waitFor({ timeout: 120_000 });
      const id = (row.href ?? "").split("#")[1] ?? "";
      const target = await page
        .locator(`[id="${id}"] header strong`)
        .first()
        .innerText()
        .catch(() => null);
      opened.push({
        label: row.label,
        hash: new URL(page.url()).hash,
        target: squash(target),
      });
    }
    return { refreshed, dashboard: dash.panel, queue, live, opened };
  });

  // ==== P6: the renewal read ages past its limit ==================================================
  const p6 = await part("P6 retained rows", async () => {
    for (const open of Object.values(pages)) await park(open);
    await page.waitForTimeout(AGE_MS);
    const aged = await dashboard("Editor", "aged read");
    // Refresh, in place.
    const refresh = page
      .locator('[data-testid="renewal-read-retained"] button')
      .filter({ hasText: "Refresh" });
    let afterRefresh = null;
    if (await kit.shownWithin(refresh, 10_000)) {
      const answer = kit
        .appResponse(page, "/api/dashboard/attention", {
          method: "GET",
          timeout: 45_000,
        })
        .catch(() => null);
      await refresh.click();
      const response = await answer;
      await page
        .locator('[data-testid="renewal-read-retained"] button')
        .filter({ hasText: "Checking" })
        .waitFor({ state: "detached", timeout: 10_000 })
        .catch(() => undefined);
      await page.waitForTimeout(1_500);
      afterRefresh = {
        status: response?.status() ?? null,
        panel: await page
          .locator('section[aria-label="Waiting on you"]:not([aria-busy])')
          .evaluate(panelFrom),
      };
    }
    // A decision control on a retained row: the row's own item, opened on a read past its limit.
    await park(page);
    await page.waitForTimeout(AGE_MS);
    const target = (aged.panel.rows.find((row) => row.retained) ?? aged.panel.rows[0])
      ?.href;
    const hash = target?.includes("#") ? `#${target.split("#")[1]}` : "";
    const staleItem = await liveReview(page, hash);
    // The stale read started the background re-read; the item is read again once it lands.
    let currentItem = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await page.waitForTimeout(5_000);
      currentItem = await liveReview(page, hash);
      if (/Data status: fresh/.test(currentItem.status ?? "")) break;
    }
    // The retained Dashboard row's link, followed.
    await park(page);
    await page.waitForTimeout(AGE_MS);
    const agedAgain = await dashboard("Editor", "aged read again");
    let followed = null;
    const retainedRow = agedAgain.panel.rows.find((row) => row.retained);
    if (retainedRow) {
      const link = page
        .locator('section[aria-label="Waiting on you"] li[data-retained="true"] a')
        .first();
      await link.click();
      await page.waitForURL((url) => url.pathname === LIVE, { timeout: 120_000 });
      await page
        .getByRole("heading", { name: "Live renewal review" })
        .waitFor({ timeout: 120_000 });
      followed = await liveReview(page, new URL(page.url()).hash);
    }
    return {
      aged: aged.panel,
      afterRefresh,
      staleItem,
      currentItem,
      agedAgain: agedAgain.panel,
      followed,
    };
  });

  // The fixture's Sheet cells again for the follow-through below.
  await part("Sheet cells restored", async () => {
    for (const leaseId of sheetLeases) setSheetCells(rehearsal, leaseId, null);
    return refreshFromDesk(ctx, page);
  });

  // ==== P7: the viewer's own renewal follow-through ===============================================
  const p7 = {};
  p7.reply = await part("P7 owner reply on the prepared lease", async () => {
    const sent = await sendOwnerMessage(ctx, page, prepared);
    if (sent.status !== 200)
      throw new Error(`The owner message was not sent: ${sent.alert ?? sent.error}`);
    const reply = await deliverOwnerReply(rehearsal, {
      to: kit.ownerAddresses(prepared)[0],
      text: OWNER_REPLY_TEXT,
    });
    const tick = await kit.tick();
    const editor = await dashboard("Editor", "owner reply", {
      until: (panel) => followRow(panel, prepared, "owner", "reply").count === 1,
      tries: 3,
    });
    const approver = await dashboard("Approver", "owner reply (Approver)");
    const link = await followLink(prepared, "owner", "reply");
    return {
      sent: { status: sent.status },
      reply: { thread: Boolean(reply.threadId) },
      tick: { observed: tick?.watchObserved ?? null },
      editor,
      approver,
      link,
    };
  });
  p7.outOfDate = await part("P7 scheduled offer out of date", async () => {
    const answer = await recordOwnerApproval(
      ctx,
      page,
      prepared,
      fact(prepared).rent + 50,
    );
    const dates = await enterRenewalDates(ctx, page, prepared, {
      start: "day-after",
      end: FIRST_TERM_END,
    });
    const scheduled = await scheduleTenantOffer(ctx, page, prepared);
    if (scheduled.status !== 200)
      throw new Error(`The tenant offer was not scheduled: ${scheduled.alert}`);
    const changed = await enterRenewalDates(ctx, page, prepared, {
      end: CHANGED_TERM_END,
    });
    const editor = await dashboard("Editor", "offer out of date", {
      until: (panel) => followRow(panel, prepared, "tenant", "out_of_date").count === 1,
      tries: 3,
    });
    const link = await followLink(prepared, "tenant", "out_of_date");
    return {
      answer,
      dates,
      scheduled: { status: scheduled.status, sequenceId: scheduled.sequenceId },
      changed,
      editor,
      link,
    };
  });
  p7.held = await part("P7 offer held by the worker", async () => {
    const sequenceId = p7.outOfDate?.scheduled?.sequenceId;
    if (!sequenceId) throw new Error("No scheduled offer to hold.");
    const tick = await kit.tick(sequenceId);
    const held = (await kit.sequences(prepared, "renewal_tenant")).find(
      (sequence) => sequence.id === sequenceId,
    );
    const editor = await dashboard("Editor", "offer held", {
      until: (panel) => followRow(panel, prepared, "tenant", "held").count === 1,
      tries: 3,
    });
    const link = await followLink(prepared, "tenant", "held");
    return {
      tick: {
        sent: tick?.sent ?? null,
        held: tick?.held ?? null,
        paused: tick?.paused ?? null,
      },
      record: { state: held?.state ?? null, pause: held?.pause?.cause ?? null },
      editor,
      link,
    };
  });
  p7.unconfirmed = await part("P7 unconfirmed offer on the replied lease", async () => {
    const tenants = kit.tenantAddresses(replied);
    const sentBefore = (await kit.sentTo(tenants)).length;
    const answer = await recordOwnerApproval(ctx, page, replied, fact(replied).rent + 50);
    const dates = await enterRenewalDates(ctx, page, replied, {
      start: "day-after",
      end: FIRST_TERM_END,
    });
    await setNextSend(rehearsal, "unconfirmed-lost");
    let offer;
    try {
      offer = await sendTenantOffer(ctx, page, replied);
    } finally {
      await setNextSend(rehearsal, "normal");
    }
    if (offer.status >= 400) await page.keyboard.press("Escape").catch(() => undefined);
    const record = (await kit.sequences(replied, "renewal_tenant")).at(-1) ?? null;
    const sentAfter = (await kit.sentTo(tenants)).length;
    const editor = await dashboard("Editor", "offer unconfirmed", {
      until: (panel) => followRow(panel, replied, "tenant", "unconfirmed").count === 1,
      tries: 3,
    });
    const approver = await dashboard("Approver", "offer unconfirmed (Approver)");
    const link = await followLink(replied, "tenant", "unconfirmed");
    return {
      answer,
      dates,
      offer: { status: offer.status, state: offer.state, alert: offer.alert },
      record: {
        state: record?.state ?? null,
        unresolved: Boolean(record?.unresolvedOccurrenceId),
        confirmed: record?.confirmedCount ?? null,
      },
      // The stand-in kept nothing, so nothing reached the tenants: the outcome is known.
      tenantMailKept: sentAfter - sentBefore,
      editor,
      approver,
      link,
    };
  });

  // ==== P8: the notification menu and its families ================================================
  const p8 = await part("P8 notifications", async () => {
    const reads = {};
    for (const role of ["Editor", "Approver", "Admin"]) {
      const open = await rolePage(role);
      await kit.openPath(open, "/");
      const button = open.locator(".notification-button").first();
      await button.waitFor({ timeout: 60_000 });
      await button.click();
      const region = open.getByRole("region", { name: "Notifications" });
      await region.waitFor({ timeout: 30_000 });
      const types = region
        .locator("details")
        .filter({ has: open.locator("summary", { hasText: "Notification types" }) })
        .first();
      const typesShown = await kit.shownWithin(types, 30_000);
      if (typesShown) await kit.openDisclosure(types);
      await open.waitForTimeout(1_000);
      const menu = await region.evaluate((root) => {
        const text = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
        return {
          families: [...root.querySelectorAll(".notification-family-list li")].map(text),
          items: [...root.querySelectorAll("button.notification-item")].map((node) => ({
            title: text(node.querySelector("strong")),
            text: text(node).slice(0, 200),
          })),
          markAll: [...root.querySelectorAll("button")].some(
            (node) => text(node) === "Mark all read",
          ),
        };
      });
      let markedAll = null;
      if (role === "Editor" && menu.markAll) {
        const marked = kit.appResponse(open, "/api/notifications/mark-all-read", {
          timeout: 60_000,
        });
        await region.getByRole("button", { name: "Mark all read", exact: true }).click();
        markedAll = (await marked.catch(() => null))?.status() ?? null;
      }
      await open.keyboard.press("Escape").catch(() => undefined);
      const feed = await kit.read(open, "/api/notifications?full=true");
      reads[role] = {
        menu,
        markedAll,
        feed: {
          families: (feed.families ?? []).map((family) => family.key),
          labels: (feed.families ?? []).map((family) => family.label),
          notifications: (feed.notifications ?? []).map((item) => ({
            family: item.family ?? null,
            title: String(item.title ?? "").slice(0, 120),
          })),
          standing: (feed.standing ?? []).map((signal) => signal.lane),
        },
      };
    }
    return { reads, maintenance: await maintenanceRecords(kit) };
  });

  // ==== Verdicts ====================================================================================
  const checks = {};
  const verdicts = {};

  // AC-S280-1: one row per kind, named, with its basis and its step; another sender's never.
  {
    const start = p1?.editor?.panel;
    const startReply = start ? followRow(start, replied, "owner", "reply") : null;
    const reply = p7.reply?.editor?.panel;
    const replyRow = reply ? followRow(reply, prepared, "owner", "reply") : null;
    const out = p7.outOfDate?.editor?.panel;
    const outRow = out ? followRow(out, prepared, "tenant", "out_of_date") : null;
    const held = p7.held?.editor?.panel;
    const heldRow = held ? followRow(held, prepared, "tenant", "held") : null;
    const unconfirmed = p7.unconfirmed?.editor?.panel;
    const unconfirmedRow = unconfirmed
      ? followRow(unconfirmed, replied, "tenant", "unconfirmed")
      : null;
    const approverReads = [p1?.approver, p7.reply?.approver, p7.unconfirmed?.approver];
    const editorLeases = [prepared, replied];
    const approverClean = approverReads.every(
      (read) =>
        read &&
        !read.panel.followUnavailable &&
        !read.panel.follow.some((row) =>
          editorLeases.some((leaseId) => (row.href ?? "").includes(`/lease/${leaseId}`)),
        ),
    );
    const cleared = {
      // A reply to record leaves the list once the answer is recorded (R-S280-1).
      preparedReply: out ? followRow(out, prepared, "owner", "reply").count === 0 : false,
      repliedReply: unconfirmed
        ? followRow(unconfirmed, replied, "owner", "reply").count === 0
        : false,
      outOfDateBecameHeld: held
        ? followRow(held, prepared, "tenant", "out_of_date").count === 0
        : false,
    };
    const kinds = {
      reply: Boolean(replyRow && rowOk(replyRow)),
      out_of_date: Boolean(outRow && rowOk(outRow)),
      held: Boolean(heldRow && rowOk(heldRow)),
      unconfirmed: Boolean(
        unconfirmedRow &&
        rowOk(unconfirmedRow) &&
        p7.unconfirmed?.record?.unresolved &&
        p7.unconfirmed?.tenantMailKept === 0,
      ),
    };
    const links = {
      reply: p7.reply?.link?.opened === true,
      out_of_date: p7.outOfDate?.link?.opened === true,
      held: p7.held?.link?.opened === true,
      unconfirmed: p7.unconfirmed?.link?.opened === true,
    };
    const onePer = [start, reply, out, held, unconfirmed].every(
      (panel) => panel && onePerMessage(panel),
    );
    verdicts["AC-S280-1"] = {
      kinds,
      links,
      cleared,
      approverClean,
      onePer,
      // The seeded replied lease (its owner message sent by the Editor in the seed): recorded.
      seededReply: startReply ? rowOk(startReply) : null,
    };
    checks["AC-S280-1"] =
      Object.values(kinds).every(Boolean) &&
      Object.values(links).every(Boolean) &&
      Object.values(cleared).every(Boolean) &&
      approverClean &&
      onePer;
  }

  // AC-S280-2: the team line's count is the desk's working batch, on the Dashboard and in My
  // Work's empty state; the task question still answers from tasks.
  {
    const team = p2?.dashboard;
    const desk = p2?.desk;
    const deskCount = desk ? desk.thisBatch + desk.carriedOver : NaN;
    const count = team ? Number(team.count) : NaN;
    const sentence = (n) =>
      n === 1
        ? "1 renewal has a next action for the team."
        : `${n} renewals have a next action for the team.`;
    const dashboardLine = Boolean(
      team &&
      Number.isInteger(count) &&
      team.text === `${sentence(count)} ${DESK_LINK}` &&
      team.href === DESK &&
      team.link === DESK_LINK,
    );
    const agreesWithDesk = Boolean(
      desk &&
      count === deskCount &&
      count === desk.monthly &&
      (desk.listedRows === 0 || desk.listedRows === deskCount),
    );
    const work = p2?.work;
    const workLine = Boolean(
      work?.emptyShown &&
      work.line &&
      Number(work.line.count) === count &&
      work.line.text === `${sentence(count)} ${DESK_LINK}` &&
      work.line.href === DESK,
    );
    const answer = p2?.answer;
    const taskMeaning = Boolean(
      answer &&
      /assigned to you|My Work|task/i.test(answer.text) &&
      !/next action for the team/i.test(answer.text),
    );
    verdicts["AC-S280-2"] = {
      count,
      deskCount,
      dashboardLine,
      agreesWithDesk,
      landed: p2?.landed ?? null,
      workLine,
      taskMeaning,
    };
    checks["AC-S280-2"] =
      dashboardLine &&
      agreesWithDesk &&
      Boolean(p2?.landed?.sameMonth) &&
      workLine &&
      taskMeaning;
  }

  // AC-S280-7: four surfaces show the RentVine/Sheet rule. The two non-live source conflicts
  // are checked independently against the reconciliation pipeline.
  {
    const base = p3;
    const numbersOk =
      base?.numbers?.length === sheetLeases.length &&
      base.numbers.every((read) => {
        const lease = fact(read.leaseId);
        return (
          read.shown &&
          read.state === "agree" &&
          read.line === "Numbers agree" &&
          read.notes.includes(
            `The operating Sheet shows ${noteMoney(lease.rent - 50)} for the current rent. This is information; RentVine is the basis.`,
          ) &&
          read.notes.includes(
            `The operating Sheet shows ${usDate(sheetEnd(read.leaseId))} for the lease end. This is information; RentVine is the basis.`,
          )
        );
      });
    const differenceRow = (label) =>
      namesSheetLease(label, "Current rent") ||
      namesSheetLease(label, "Renewal date") ||
      /^(Current rent|Renewal date)$/.test(label);
    const dashboardOk = Boolean(
      base?.dashboard && !base.dashboard.rows.some((row) => differenceRow(row.label)),
    );
    const queueOk = Boolean(
      base?.queue &&
      !base.queue.unavailable &&
      !base.queue.rows.some((row) => differenceRow(row.label)) &&
      !base.queue.tabRows.some((row) => differenceRow(row.label)) &&
      base.queue.renewalTab === 0,
    );
    const expectedInfo = sheetLeases.flatMap((leaseId) => {
      const lease = fact(leaseId);
      return [
        {
          leaseId,
          field: "current_rent",
          tail: `: the operating Sheet shows ${lineMoney(lease.rent - 50)} and RentVine shows ${lineMoney(lease.rent)}. RentVine is the basis.`,
        },
        {
          leaseId,
          field: "renewal_date",
          tail: `: the operating Sheet shows ${usDate(sheetEnd(leaseId))} and RentVine shows ${usDate(lease.end)}. RentVine is the basis.`,
        },
      ];
    });
    const infoMatches = (info, expected) =>
      info.filter(
        (row) =>
          row.field === expected.field &&
          row.line.startsWith(fact(expected.leaseId).address) &&
          row.line.endsWith(expected.tail),
      ).length;
    const liveOk = Boolean(
      base?.live &&
      !base.live.cards.some((card) => differenceRow(card.head)) &&
      base.live.info.length === expectedInfo.length &&
      expectedInfo.every((expected) => infoMatches(base.live.info, expected) === 1) &&
      base.live.info.every((row) => row.link?.endsWith("#renewal-rent-and-charges")) &&
      unique(base.live.info.map((row) => row.id)) &&
      !base.live.infoDecisionWords,
    );
    // RentVine unreadable on one lease: the numbers check raises the difference, the Sheet value
    // is not information for it on any screen, and the other leases keep their information rows.
    const unreadable = p4;
    const unreadableLabel = fact(unreadableLease).address;
    const unreadableOk = Boolean(
      unreadable?.numbers?.shown &&
      unreadable.numbers.state === "difference" &&
      !unreadable.numbers.notes.some((note) => note.includes("for the current rent")) &&
      unreadable.live &&
      !unreadable.live.info.some(
        (row) => row.field === "current_rent" && row.line.startsWith(unreadableLabel),
      ) &&
      expectedInfo
        .filter(
          (expected) =>
            expected.field === "current_rent" && expected.leaseId !== unreadableLease,
        )
        .every((expected) => infoMatches(unreadable.live.info, expected) === 1),
    );
    const workingRentOk = Boolean(
      workingRent?.saved === 200 &&
      workingRent.restored === 200 &&
      workingRent.effects &&
      workingRent.numbers.shown &&
      workingRent.numbers.state === "difference" &&
      workingRent.numbers.line.includes(noteMoney(workingRent.amount)) &&
      workingRent.writes.length === 2 &&
      workingRent.writes.every((write) => write.path === WORKING_ROUTE),
    );
    const pipeline = await runRehearsalVitest(rehearsal, "w1209-source-rule", "unit", [
      SOURCE_DIFFERENCE_TEST,
    ]);
    const pipelineCases = ["market_value", "owner_pricing_confirmed"].map((field) => {
      const title = `AC-S280-7: the ${field} conflict stays a decision and nothing is applied`;
      const cases = pipeline.cases.filter(
        (entry) => entry.file === SOURCE_DIFFERENCE_TEST && entry.name.endsWith(title),
      );
      return { field, passed: cases.length === 1 && cases[0].status === "passed" };
    });
    const pipelineOk =
      pipeline.code === 0 &&
      pipeline.refused === 0 &&
      pipeline.totals?.failed === 0 &&
      pipelineCases.every((entry) => entry.passed);
    verdicts["AC-S280-7"] = {
      numbersOk,
      dashboardOk,
      queueOk,
      liveOk,
      unreadableOk,
      workingRentOk,
      sourceWrites,
      pipelineOnly: {
        cases: pipelineCases,
        totals: pipeline.totals,
        networkRefusals: pipeline.refused,
        code: pipeline.code,
        error: pipeline.error,
        tail: pipeline.tail,
      },
    };
    checks["AC-S280-7"] =
      numbersOk &&
      dashboardOk &&
      queueOk &&
      liveOk &&
      unreadableOk &&
      workingRentOk &&
      sourceWrites.sheets === 0 &&
      sourceWrites.rentvine === 0 &&
      pipelineOk;
  }

  // AC-S280-3: named rows, one per lease and field, own links, and counts that agree.
  {
    const read = p5;
    const decisionRows = (rows) =>
      rows.filter((row) => namesSheetLease(row.label, "Current rent"));
    const dashRows = read ? decisionRows(read.dashboard.rows) : [];
    const shownCount = read
      ? read.dashboard.follow.length +
        read.dashboard.rows.length +
        Number(/and (\d+) more/.exec(read.dashboard.more?.text ?? "")?.[1] ?? 0)
      : NaN;
    const dashboardOk = Boolean(
      read &&
      dashRows.length === sheetLeases.length &&
      unique(dashRows.map((row) => row.label)) &&
      unique(dashRows.map((row) => row.href)) &&
      dashRows.every((row) =>
        (row.href ?? "").startsWith(`${LIVE}#renewal-review-item-`),
      ) &&
      !read.dashboard.rows.some((row) => /^Current rent$/.test(row.label)) &&
      Number(read.dashboard.count) === shownCount,
    );
    const linksOk = Boolean(
      read &&
      read.opened.length === dashRows.length &&
      read.opened.every((entry) => entry.target === entry.label),
    );
    const queue = read?.queue;
    const queueRows = queue ? decisionRows(queue.rows) : [];
    const tabRows = queue ? decisionRows(queue.tabRows) : [];
    const queueOk = Boolean(
      queue &&
      !queue.unavailable &&
      queue.total === queue.rows.length &&
      queueRows.length === sheetLeases.length &&
      queue.renewalTab === tabRows.length &&
      tabRows.length === sheetLeases.length &&
      unique(queue.tabRows.map((row) => row.label)) &&
      unique(queueRows.map((row) => row.label)),
    );
    const live = read?.live;
    const liveCards = live
      ? live.cards.filter((card) => namesSheetLease(card.head, "Current rent"))
      : [];
    const liveDates = live
      ? live.info.filter(
          (row) =>
            row.field === "renewal_date" &&
            sheetLeases.some((leaseId) => row.line.startsWith(fact(leaseId).address)),
        )
      : [];
    const pairsOk = Boolean(
      live &&
      liveCards.length === sheetLeases.length &&
      unique(liveCards.map((card) => card.id)) &&
      liveDates.length === sheetLeases.length &&
      !live.info.some((row) => row.field === "current_rent"),
    );
    verdicts["AC-S280-3"] = {
      dashboardRows: dashRows.length,
      shownCount,
      dashboardOk,
      linksOk,
      queueOk,
      pairsOk,
      keyWarnings: keyWarnings.length,
    };
    checks["AC-S280-3"] =
      dashboardOk && linksOk && queueOk && pairsOk && keyWarnings.length === 0;
  }

  // AC-S280-4: retained rows with their read time and Refresh; a decision needs the current read.
  {
    const read = p6;
    const retainedOk = (panel) =>
      Boolean(
        panel &&
        panel.rows.filter((row) => row.retained).length >= sheetLeases.length &&
        panel.rows.filter((row) => row.retained).every((row) => row.buttons === 0) &&
        RETAINED_READ.test(panel.retained?.text ?? "") &&
        panel.retained.refresh.includes("Refresh") &&
        panel.tryAgain === 0 &&
        !OLD_STALE.test(panel.issue ?? "") &&
        !OLD_STALE.test(panel.text),
      );
    const after = read?.afterRefresh;
    const refreshOk = Boolean(
      after &&
      after.status === 200 &&
      ((after.panel.rows.filter((row) => namesSheetLease(row.label, "Current rent"))
        .length === sheetLeases.length &&
        !after.panel.rows.some((row) => row.retained) &&
        !after.panel.retained) ||
        after.panel.statusLines.includes(REFRESH_FAILED)),
    );
    // On the read past its limit the item offers no decision control; once the read is current it
    // does. A control is only ever shown beside a current ("fresh") read.
    const controls = (live) =>
      live ? live.cards.reduce((sum, card) => sum + card.resolveForms, 0) : -1;
    const freshOnly = (live) =>
      Boolean(
        live && (controls(live) === 0 || /Data status: fresh/.test(live.status ?? "")),
      );
    const staleOk = Boolean(
      read?.staleItem &&
      !/Data status: fresh/.test(read.staleItem.status ?? "") &&
      controls(read.staleItem) === 0 &&
      Boolean(read.staleItem.blocker),
    );
    const currentOk = Boolean(
      read?.currentItem &&
      /Data status: fresh/.test(read.currentItem.status ?? "") &&
      controls(read.currentItem) > 0,
    );
    const followedOk = Boolean(read?.followed && freshOnly(read.followed));
    verdicts["AC-S280-4"] = {
      aged: retainedOk(read?.aged),
      refreshOk,
      staleOk,
      currentOk,
      agedAgain: retainedOk(read?.agedAgain),
      followedOk,
    };
    checks["AC-S280-4"] =
      retainedOk(read?.aged) &&
      refreshOk &&
      staleOk &&
      currentOk &&
      retainedOk(read?.agedAgain) &&
      followedOk;
  }

  // AC-S280-5: families per role, no maintenance item, stored maintenance records unchanged.
  {
    const reads = p8?.reads;
    const keys = (role) => reads?.[role]?.feed?.families ?? null;
    /** Exactly the families the rule serves: `required` always, `optional` only by Space access. */
    const served = (list, required, optional = []) =>
      Array.isArray(list) &&
      required.every((key) => list.includes(key)) &&
      list.every((key) => required.includes(key) || optional.includes(key));
    const menuLabels = (role) => reads?.[role]?.menu?.families ?? [];
    const noMaintenance = ["Editor", "Approver", "Admin"].every(
      (role) =>
        reads?.[role] &&
        !reads[role].feed.notifications.some((item) =>
          RETIRED_FAMILIES.includes(item.family),
        ) &&
        !reads[role].menu.items.some((item) => /maintenance/i.test(item.title)) &&
        !menuLabels(role).some((label) => /maintenance/i.test(label)),
    );
    const staffOk = ["Editor", "Approver"].every(
      (role) =>
        served(keys(role), ["approval_queue"], ["renewal_communications"]) &&
        !menuLabels(role).some((label) =>
          /Connections to set up|Space coverage|Team review|Feedback/.test(label),
        ) &&
        !(reads[role].feed.standing ?? []).some((lane) =>
          ["connection", "coverage"].includes(lane),
        ),
    );
    const adminOk =
      served(
        keys("Admin"),
        ADMIN_FAMILIES.filter((key) => !STAFF_FAMILIES.includes(key)).concat(
          "approval_queue",
        ),
        ["renewal_communications"],
      ) &&
      ["Connections to set up", "Space coverage"].every((label) =>
        menuLabels("Admin").some((entry) => entry.startsWith(label)),
      );
    const storedOk = Boolean(
      effectsAtStart?.maintenance &&
      p8?.maintenance &&
      JSON.stringify(effectsAtStart.maintenance) === JSON.stringify(p8.maintenance),
    );
    verdicts["AC-S280-5"] = { staffOk, adminOk, noMaintenance, storedOk };
    checks["AC-S280-5"] = staffOk && adminOk && noMaintenance && storedOk;
  }

  // AC-S280-6: opening the Dashboard starts no lookup, save or send; no row shows a reply body.
  {
    const windows = dashboardReads.map((read) => ({
      role: read.role,
      label: read.label,
      writes: read.safety.writes.filter((write) => write.path !== "/api/auth/demo")
        .length,
      sent: read.safety.sent,
      lookups: read.safety.lookups,
      model: read.safety.model,
      sequencesChanged: (read.safety.documentsChanged ?? ["unread"]).filter(
        (path) => path === "unread" || path.startsWith("gmail_communication_sequences/"),
      ).length,
      documentsChanged: read.safety.documentsChanged,
      replyBody: read.safety.replyBodyIn.length > 0 || read.safety.replyBodyInPanel,
    }));
    const clean = (window) =>
      window.writes === 0 &&
      window.sent === 0 &&
      window.lookups === 0 &&
      window.model === 0 &&
      window.sequencesChanged === 0 &&
      !window.replyBody;
    // A reply was on the Dashboard's leases while it was read (the seeded one and this row's own).
    const withReplies = dashboardReads.filter((read) =>
      read.panel.follow.some((row) => row.kind === "reply"),
    ).length;
    verdicts["AC-S280-6"] = {
      windows: windows.length,
      unclean: windows.filter((window) => !clean(window)),
      documentsChanged: [
        ...new Set(windows.flatMap((window) => window.documentsChanged ?? [])),
      ],
      withReplies,
    };
    checks["AC-S280-6"] = windows.length >= 10 && windows.every(clean) && withReplies > 0;
  }

  ctx.record({ verdicts, failures, keyWarnings: keyWarnings.slice(0, 10) });
  return checks;
}

/** Stored maintenance records (S280 never touches them): each document's update time. */
async function maintenanceRecords(kit) {
  const out = {};
  for (const collection of ["maintenance_ticket_notifications", "maintenance_tickets"]) {
    const documents = await kit.listDocuments(collection).catch(() => null);
    out[collection] = documents
      ? Object.fromEntries(
          documents.map((document) => [
            document.name.split("/").pop(),
            document.updateTime,
          ]),
        )
      : null;
  }
  return out;
}
