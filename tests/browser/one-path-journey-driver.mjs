// S252 R-S252-1, R-S252-2, R-S252-7, R-S252-11 and ARCH-S252-1: the one-path renewal journey with
// its action budgets, through the one-path rehearsal. Run it with
//
//   bash scripts/run-renewal-one-path-rehearsal.sh --overlay --driver tests/browser/one-path-journey-driver.mjs
//
// (drop --overlay for a committed tree). Modeled on tests/browser/one-path-smoke-driver.mjs. What it
// does depends on what the rehearsal serves:
//
//   the candidate, with the mail adapter (the default)
//     Each builder's named, self-checking steps are imported and run unchanged, and every phase
//     after the first starts from the rehearsal's starting state again
//     (scripts/lib/one-path-rehearsal/reset.mjs). The served app answers a lease looked up earlier
//     in the run from its own comparison cache, so the two phases that count comparison requests
//     run first. In order:
//     1. The S249 kickoff (one-path-kickoff-driver.mjs), on the harness's own starting state: its
//        L33 and L35 counts need leases no earlier phase has looked up or opened the batch for.
//     2. The S254 stand-in proof (one-path-stand-in-proof-driver.mjs), whose comparison checks
//        ask for carried-over leases nothing else looks up.
//     3. The S254 smoke count (one-path-smoke-driver.mjs), then on the same state:
//        the journey on the "November 5 mix", in the R-S252-2 order: desk batch, the kickoff on
//        the prepared lease FOLLOWED FROM THE IN-APP GUIDE (lib/help/content, read as data: L61),
//        numbers, comparison, owner message, send evidence, owner reply, decision, tenant offer and
//        the rest of the path to Complete (L53), the standing agreement variant (covered lease),
//        the housing assistance variant (assisted lease, its L33 count read before any Propose a
//        change), values kept to their lease (AC-S252-5, L70), recipients (R-S252-11), the
//        renewed-in-source closure (L04, BEH-S246-2), reload continuity (L18) and the release
//        canary's own landmark predicates read against the rehearsal (R-S252-7).
//     4. The S247/S248 guided path (one-path-guided-path-driver.mjs).
//     5. The S250/S251 variants (one-path-variants-driver.mjs; Do not renew last, after every
//        count).
//     `-- --phases <name,...>` runs only the named phases, in this order.
//     Then L58 over the whole run: every send, schedule, Gmail draft creation and source update the
//        journey made showed its exact review and asked for its own confirmation, and the
//        refused-connection log names no production host, provider or mailbox.
//   the candidate with --no-mail-adapter
//     the S249 verification-session proof (one-path-kickoff-verification-driver.mjs, imported).
//   a named commit (--commit, for example the starting commit 6491c06f)
//     the kickoff on the prepared lease followed from THAT commit's own in-app guides, counted by
//     the same rule (L24, the ARCH-S252-1 fail-first). The starting commit refuses a send in the
//     Demo environment, so its count covers the actions up to and including the confirmation.
//
// THE BUDGETS (R-S252-1), counted from this driver's own step log (journey-kit.mjs): Renewals
// shows the working batch with no action and one action opens a lease (L01, L08); the prepared
// kickoff takes at most three actions on one page (L23); after the confirmed send the lease waits
// on the owner with no further action (L25); the owner's decision from an observed reply takes at
// most three actions with nothing preselected (L36); no path step needs another page (L17, L53);
// the stage and the primary action are on the first screen at 1280 by 800 and within two screens
// at 390 (L14). No budget is met by removing a review or a confirmation (AC-S252-1): each send is
// counted with its exact review and its own confirmation.
//
// Every check is named and decides itself; the result goes to journey.json in the run directory.
// Synthetic data only; the page reaches nothing but the rehearsal.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
import { chromium } from "playwright-core";

import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import { requireLoopbackRehearsalOrigin } from "../../scripts/lib/help-rehearsal-origin.mjs";
import {
  deliverOwnerReply,
  readRehearsal,
  refusedConnections,
  standInState,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import {
  budgetResult,
  clickAndFollow,
  countActions,
  createStepLog,
  followGuide,
  openPages,
} from "../../scripts/lib/one-path-rehearsal/journey-kit.mjs";
import {
  guideStep,
  kickoffSteps,
  readServedGuides,
  runGuardedTsx,
} from "../../scripts/lib/one-path-rehearsal/read-guides.mjs";
import {
  rehearsalMix,
  resetRehearsalState,
} from "../../scripts/lib/one-path-rehearsal/reset.mjs";
import { routeFromPage } from "../../scripts/lib/one-path-rehearsal/seeds.mjs";

// The rehearsal's network boundary must be active in THIS process before anything runs.
if (
  globalThis.fetch?.name !== "guardedFetch" ||
  net.Socket.prototype.connect.name !== "guardedConnect"
) {
  process.stderr.write(
    "The rehearsal network boundary is not loaded in the driver process; nothing was run.\n",
  );
  process.exit(2);
}

const origin = requireLoopbackRehearsalOrigin(process.env.ONE_PATH_REHEARSAL_ORIGIN);
const runDir = process.env.ONE_PATH_REHEARSAL_RUN_DIR;
assert.ok(runDir, "Run through scripts/run-renewal-one-path-rehearsal.sh.");
const rehearsal = readRehearsal(runDir);
const { prepared, covered, assisted, missingRecipient, replied } = rehearsal.roles;
const MODE = rehearsal.namedCommit
  ? "named-commit"
  : rehearsal.mailAdapter === false
    ? "verification"
    : "candidate";
const STARTING_COMMIT = "6491c06f3773e92c0bd811d4360371523e24d643";
// The kickoff as the starting commit's own guides teach it, step by step (L24). Every control is
// read from that commit's lib/help/content; the plan only says which guide steps make up the
// kickoff and what a step's sentence asks to choose first. Steps that only read, and optional
// copies or drafts, are left out, so this is the fewest actions those guides allow.
const STARTING_KICKOFF = [
  { ref: "work-a-renewal#open-a-lease" },
  { ref: "work-a-renewal#choose-full-view" },
  { ref: "compare-rent#open-market-comparison" },
  { ref: "compare-rent#run-one-lookup" },
  { ref: "compare-rent#set-pmi-recommendation", value: "1410" },
  { ref: "compare-rent#enter-working-terms", value: "1410" },
  { ref: "owner-message#open-owner-approval" },
  {
    ref: "owner-message#save-communications-draft",
    // "choose Compose owner message in Communications, review ... in the new tab, then choose
    // Save draft"
    before: [{ role: "link", label: "Compose owner message in Communications" }],
  },
  { ref: "owner-message#send-or-schedule" },
];
const PROVIDER_OR_PRODUCTION =
  /googleapis|google\.com|gmail|rentvine|rentcast|dotloop|run\.app|pmikc|firebase(io)?\.com|anthropic|openai|leadsimple/i;
// Next.js's own development server asks the public npm registry for its dist-tags and advisories
// (node_modules/next/dist/server/dev/hot-reloader-shared-utils.js, lib/upgrade). The boundary
// refuses both; neither is production, a provider or a mailbox (see the S252 evidence, L58).
const DEV_TOOL_HOSTS = new Set(["registry.npmjs.org"]);

const checks = [];
const budgets = [];
const phases = [];
const log = createStepLog();
const check = (id, name, passed, observed) => {
  checks.push({ id, name, passed: Boolean(passed), observed });
  process.stdout.write(`${passed ? "ok  " : "FAIL"} ${id}: ${name}\n`);
};
const budget = (id, name, args) => {
  const result = { id, ...budgetResult(name, args) };
  budgets.push(result);
  process.stdout.write(
    `${result.passed ? "ok  " : "FAIL"} ${id}: budget ${name}: ${result.actions} action(s), ${result.pages} page(s)${result.failures.length ? ` (${result.failures.join("; ")})` : ""}\n`,
  );
  return result;
};
const squash = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
const leasePath = (leaseId, query = "") =>
  `/lease-renewal/live/desk/lease/${leaseId}${query}`;

/** Every review and confirmation shown for a send, schedule, draft or source update (L58). */
const effects = [];

async function newPage(browser, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({
    viewport,
    timezoneId: "America/Chicago",
    locale: "en-US",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);
  page.setDefaultNavigationTimeout(240_000);
  return { context, page };
}

async function signIn(page, role) {
  await page.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
  const ok = await page.evaluate(
    (name) =>
      fetch("/api/auth/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: name }),
      }).then((response) => response.ok),
    role,
  );
  assert.ok(ok, `Local demo ${role} sign-in failed.`);
}

const lease = (page) => {
  const guided = () => page.getByRole("region", { name: "Guided view", exact: true });
  const now = () => guided().getByRole("region", { name: "Now", exact: true });
  const strip = () =>
    guided().getByRole("navigation", { name: "Renewal path", exact: true });
  const viewButton = (name) =>
    page
      .getByRole("group", { name: "Lease view", exact: true })
      .getByRole("button", { name, exact: true });
  return {
    guided,
    now,
    strip,
    viewButton,
    async open(leaseId, query = "") {
      await page.goto(`${origin}${leasePath(leaseId, query)}`, {
        waitUntil: "domcontentloaded",
      });
      await page
        .getByRole("group", { name: "Lease view", exact: true })
        .waitFor({ state: "visible" });
      await guided().waitFor({ state: "visible" });
      await page.waitForTimeout(1500);
    },
    async stageLine() {
      return squash(
        await guided()
          .locator('[data-renewal-field="stage-line"]')
          .textContent()
          .catch(() => ""),
      );
    },
    async currentStep() {
      return (
        (await guided()
          .locator('[data-renewal-field="stage-line"]')
          .getAttribute("data-renewal-current-step")
          .catch(() => null)) ?? null
      );
    },
    /** The one next step at this point: how many next-step lines and primary actions are shown. */
    async nextStep() {
      return {
        lines: await guided().locator('[data-renewal-field="next-step"]').count(),
        text: squash(
          await guided()
            .locator('[data-renewal-field="next-step"]')
            .first()
            .textContent()
            .catch(() => ""),
        ),
        primaries: await now().locator("[data-renewal-now-primary]").count(),
        primary: squash(
          await now()
            .locator("[data-renewal-now-primary]")
            .first()
            .textContent()
            .catch(() => ""),
        ),
        guidedPressed: await viewButton("Guided view")
          .getAttribute("aria-pressed")
          .catch(() => null),
      };
    },
    async nowText() {
      return squash(
        await now()
          .textContent()
          .catch(() => ""),
      );
    },
  };
};

async function shownWithin(locator, timeout) {
  return locator
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
}

async function waitForStep(page, leaseId, want, maxMs = 60_000) {
  const view = lease(page);
  const started = Date.now();
  let currentStep = null;
  while (Date.now() - started < maxMs) {
    await view.open(leaseId);
    currentStep = await view.currentStep();
    if (want.includes(currentStep)) return currentStep;
    await page.waitForTimeout(2500);
  }
  return currentStep;
}

/** A dialog's exact review, then its own confirmation (L58, AC-S252-1). */
async function reviewAndConfirm(page, phase, kind, dialogName, confirmName) {
  const dialog = page.getByRole("dialog", { name: dialogName });
  const reviewShown = await shownWithin(
    dialog.locator('[data-renewal-field="exact-review"]'),
    120_000,
  );
  const exact = reviewShown
    ? squash(await dialog.locator('[data-renewal-field="exact-review"]').textContent())
    : "";
  const confirm = dialog.getByRole("button", { name: confirmName, exact: true });
  const confirmShown = reviewShown && (await shownWithin(confirm, 30_000));
  if (confirmShown) {
    await confirm.click();
    log.act(phase, "confirmation", confirmName);
    await dialog.waitFor({ state: "hidden", timeout: 120_000 }).catch(() => undefined);
  }
  effects.push({ phase, kind, reviewShown, confirmShown, confirmed: confirmShown });
  return { reviewShown, confirmShown, exact };
}

// ---------------------------------------------------------------------------------------------
// The candidate journey.

async function journey(browser) {
  const { context, page } = await newPage(browser);
  const view = lease(page);
  const route = (path, body) => routeFromPage(page, path, body);
  const mix = rehearsalMix(rehearsal);
  const ownerEmailOf = (leaseId) =>
    mix.leases.find((row) => row.lease.leaseID === Number(leaseId))?.portfolio.owners[0]
      ?.email ?? null;
  // The sequence id of each send the page makes, for the owner reply's thread read.
  const sends = [];
  page.on("response", (response) => {
    const request = response.request();
    if (
      request.method() !== "POST" ||
      !new URL(request.url()).pathname.endsWith("/api/gmail-hub/sequences")
    )
      return;
    let sent = {};
    try {
      sent = JSON.parse(request.postData() ?? "{}");
    } catch {
      sent = {};
    }
    if (sent.action !== "send") return;
    void response
      .json()
      .catch(() => ({}))
      .then((body) =>
        sends.push({
          id: sent.id,
          status: response.status(),
          state: body?.sequence?.state,
        }),
      );
  });
  const writes = [];
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.origin === origin &&
      request.method() !== "GET" &&
      url.pathname.startsWith("/api/")
    )
      writes.push(`${request.method()} ${url.pathname}`);
  });
  await signIn(page, "Editor");
  writes.length = 0;
  const comparisonsBefore =
    (await standInState(rehearsal)).comparison.comparisonsByLease ?? {};

  // J01 desk batch (L01): Renewals with no action shows the working batch.
  let mark = log.mark();
  await page.goto(`${origin}/lease-renewal`, { waitUntil: "domcontentloaded" });
  const batch = page.getByRole("region", { name: "This batch", exact: true });
  await batch.waitFor({ state: "visible" });
  await page.waitForTimeout(2000);
  const desk = {
    url: page.url().replace(origin, ""),
    summary: squash(await page.locator(".renewal-batch-summary").first().textContent()),
    rows: (
      await batch
        .locator("[data-batch-lease]")
        .evaluateAll((items) =>
          items.map((item) => item.getAttribute("data-batch-lease")),
        )
    ).map(Number),
  };
  const working = [...rehearsal.groups.working_month].sort();
  budget(
    "journey.desk-batch",
    "opening Renewals shows the working batch with no action",
    {
      counted: countActions(log.since(mark)),
      pages: openPages(context).length,
      maxActions: 0,
      maxPages: 1,
      extra: {
        "This batch lists exactly the working-month leases":
          JSON.stringify([...new Set(desk.rows)].sort()) === JSON.stringify(working),
        "the month and the count are stated in words above the list": /\w/.test(
          desk.summary,
        ),
      },
    },
  );
  check(
    "journey.desk-batch",
    "Renewals opens on the working batch with the month and count in words and the five working-month leases",
    JSON.stringify([...new Set(desk.rows)].sort()) === JSON.stringify(working),
    desk,
  );

  // J02 to J05: the kickoff, followed from the in-app guide (L61, L23), with the journey's
  // checks at each step.
  const manual = await readServedGuides(rehearsal);
  const kickoff = kickoffSteps(manual);
  check(
    "journey.guide-kickoff-read",
    'the in-app guide "Work a renewal from the desk to a recorded outcome" teaches a kickoff that ends in a send',
    Array.isArray(kickoff) && kickoff.length > 0,
    {
      version: manual.version,
      steps: (kickoff ?? []).map(
        (step) => `${step.ref} (${step.control.role} "${step.control.label}")`,
      ),
    },
  );
  const state = { page, maxPages: 1 };
  const deskMark = log.mark();
  mark = log.mark();
  const kickoffObserved = {};
  const followed = await followGuide({
    state,
    steps: kickoff ?? [],
    log,
    phase: "kickoff",
    leaseId: prepared,
    onStep: async (step, result) => {
      if (step.id === "open-a-lease" && result.ok) {
        await page
          .getByRole("group", { name: "Lease view", exact: true })
          .waitFor({ state: "visible" });
        await view.guided().waitFor({ state: "visible" });
        await page.waitForTimeout(1500);
        const next = await view.nextStep();
        kickoffObserved.opened = {
          url: page.url().replace(origin, ""),
          pages: openPages(context).length,
          guidedPressed: next.guidedPressed,
          currentStep: await view.currentStep(),
          primary: next.primary,
        };
        budget(
          "journey.open-lease",
          "one action opens a lease in the same tab at its current step",
          {
            counted: countActions(log.since(deskMark)),
            pages: openPages(context).length,
            maxActions: 1,
            maxPages: 1,
            extra: {
              "the lease page is open": kickoffObserved.opened.url.startsWith(
                leasePath(prepared),
              ),
              "Guided view is pressed": next.guidedPressed === "true",
            },
          },
        );
        // L14 at 1280 by 800: the stage line, the path strip and the primary action are on the
        // first screen with no scrolling.
        const boxes = await page.evaluate(() => {
          const box = (selector) => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return { top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
          };
          return {
            scrollY: Math.round(window.scrollY),
            height: window.innerHeight,
            stage: box('[data-renewal-field="stage-line"]'),
            strip: box('[aria-label="Guided view"] nav[aria-label="Renewal path"]'),
            primary: box('[aria-label="Guided view"] [data-renewal-now-primary]'),
          };
        });
        kickoffObserved.layout1280 = boxes;
      }
      if (step.id === "read-the-path") {
        kickoffObserved.path = await view
          .strip()
          .locator("[data-renewal-path-step]")
          .evaluateAll((items) =>
            items.map(
              (item) =>
                `${item.getAttribute("data-renewal-path-step")}:${item.getAttribute("data-renewal-path-state")}`,
            ),
          );
      }
      if (step.id === "read-the-prepared-message") {
        await shownWithin(
          view.now().locator('[data-renewal-field="rent-basis"]'),
          60_000,
        );
        await shownWithin(
          view.now().getByRole("document", { name: "Message preview" }),
          60_000,
        );
        kickoffObserved.prepared = {
          comparison: await view
            .now()
            .locator('[data-renewal-comparison="stored"]')
            .count(),
          comparisonAge: await view
            .now()
            .locator('[data-renewal-field="comparison-age"]')
            .count(),
          comps: await view.now().locator('[aria-label="Comparables"] li').count(),
          rent: await view
            .now()
            .getByLabel("Rent to recommend")
            .inputValue()
            .catch(() => null),
          basis: squash(
            await view
              .now()
              .locator('[data-renewal-field="rent-basis"]')
              .textContent()
              .catch(() => ""),
          ),
          preview: await view
            .now()
            .getByRole("document", { name: "Message preview" })
            .count(),
        };
      }
      if (step.id === "review-and-send" && result.ok) {
        const dialog = page.getByRole("dialog", { name: "Review and send" });
        const reviewShown = await shownWithin(
          dialog.locator('[data-renewal-field="exact-review"]'),
          120_000,
        );
        kickoffObserved.review = {
          reviewShown,
          exact: reviewShown
            ? squash(
                await dialog.locator('[data-renewal-field="exact-review"]').textContent(),
              ).slice(0, 400)
            : null,
          confirmShown: await dialog
            .getByRole("button", { name: "Send this message", exact: true })
            .isVisible()
            .catch(() => false),
        };
        effects.push({
          phase: "kickoff",
          kind: "send (owner message)",
          reviewShown,
          confirmShown: kickoffObserved.review.confirmShown,
          confirmed: false,
        });
      }
      if (step.effect === "explicit-send" && result.ok) {
        await page
          .getByRole("dialog", { name: "Review and send" })
          .waitFor({ state: "hidden", timeout: 120_000 })
          .catch(() => undefined);
        const effect = effects.findLast((entry) => entry.phase === "kickoff");
        if (effect) effect.confirmed = true;
      }
    },
  });
  const kickoffCount = countActions(log.since(mark));
  const mail = (await standInState(rehearsal)).mail;
  const ownerAddress = ownerEmailOf(prepared);
  const sentToOwner = mail.mailboxes
    .flatMap((box) => box.messages ?? [])
    .filter((message) => ownerAddress && JSON.stringify(message).includes(ownerAddress));
  check(
    "journey.kickoff-from-guide",
    "the kickoff completes using only the controls the in-app guide names (L61)",
    followed.length === (kickoff ?? []).length && followed.every((entry) => entry.ok),
    followed,
  );
  const l14 = kickoffObserved.layout1280;
  check(
    "journey.layout",
    "at 1280 by 800 the stage, the path strip and the primary action are on the first screen with no scrolling (L14)",
    l14 &&
      l14.scrollY === 0 &&
      [l14.stage, l14.strip, l14.primary].every(
        (box) => box && box.top >= 0 && box.bottom <= l14.height,
      ),
    l14,
  );
  check(
    "journey.numbers",
    "on the prepared lease Check the numbers and Compare market rent read done and the Now card is on Ask the owner (L21)",
    (kickoffObserved.path ?? []).includes("check-numbers:done") &&
      (kickoffObserved.path ?? []).includes("compare-market:done") &&
      kickoffObserved.opened?.currentStep === "ask-owner",
    { path: kickoffObserved.path, opened: kickoffObserved.opened },
  );
  const comparisonsAfter =
    (await standInState(rehearsal)).comparison.comparisonsByLease ?? {};
  check(
    "journey.comparison",
    "the stored comparison, Rent to recommend with its basis and the owner message preview show with no action, and no second comparison is requested (L22, L32)",
    kickoffObserved.prepared?.comparison === 1 &&
      kickoffObserved.prepared?.comparisonAge === 1 &&
      kickoffObserved.prepared?.comps > 0 &&
      Number(kickoffObserved.prepared?.rent) > 0 &&
      /Suggested from the stored comparison/.test(
        kickoffObserved.prepared?.basis ?? "",
      ) &&
      kickoffObserved.prepared?.preview === 1 &&
      (comparisonsAfter[prepared] ?? 0) === (comparisonsBefore[prepared] ?? 0),
    {
      prepared: kickoffObserved.prepared,
      before: comparisonsBefore[prepared] ?? 0,
      after: comparisonsAfter[prepared] ?? 0,
    },
  );
  check(
    "journey.review-shown",
    "the send showed its exact review and asked for its own confirmation before anything was sent (L58, AC-S252-1)",
    kickoffObserved.review?.reviewShown === true &&
      kickoffObserved.review?.confirmShown === true,
    kickoffObserved.review ?? null,
  );
  budget(
    "journey.kickoff-budget",
    "kickoff for the prepared lease in at most three actions on one page",
    {
      counted: kickoffCount,
      pages: Math.max(state.maxPages, openPages(context).length),
      maxActions: 3,
      maxPages: 1,
      extra: {
        "the exact review was shown": kickoffObserved.review?.reviewShown === true,
        "its own confirmation was asked for and given": effects.some(
          (entry) => entry.phase === "kickoff" && entry.confirmed,
        ),
        "the mail stand-in accepted the owner message":
          sentToOwner.length > 0 || sends.some((entry) => entry.status === 200),
      },
    },
  );

  // J06 send evidence (L25): the lease waits on the owner with no further entry.
  mark = log.mark();
  await view.open(prepared);
  const waiting = {
    stage: await view.stageLine(),
    origin: squash(
      await view
        .now()
        .locator('[data-renewal-field="derived-origin"]')
        .textContent()
        .catch(() => ""),
    ),
  };
  await page.goto(`${origin}/lease-renewal/live/desk`, { waitUntil: "domcontentloaded" });
  const preparedRow = page.locator(`[data-batch-lease="${prepared}"]`).first();
  await preparedRow.waitFor({ state: "attached" });
  waiting.row = squash(await preparedRow.textContent()).slice(0, 300);
  budget(
    "journey.send-evidence",
    "after the confirmed send the lease waits on the owner with no further action",
    {
      counted: countActions(log.since(mark)),
      pages: openPages(context).length,
      maxActions: 0,
      maxPages: 1,
      extra: {
        "the lease page reads Waiting on owner response":
          /^Waiting on owner response/.test(waiting.stage),
        "the desk row reads the same": waiting.row.includes("Waiting on owner response"),
        "the record names the message it came from": waiting.origin.length > 0,
      },
    },
  );

  // J07 owner reply (L36, first half).
  const sendRecord = sends.findLast((entry) => entry.status === 200) ?? null;
  const reply = await deliverOwnerReply(rehearsal, {
    to: ownerEmailOf(prepared) ?? undefined,
    text: "Synthetic owner reply: the renewal terms are approved.",
  }).catch((error) => ({ error: String(error?.message ?? error) }));
  if (sendRecord?.id)
    await route("/api/gmail-hub/sequences", { action: "refresh", id: sendRecord.id });
  await view.open(prepared);
  const replyNow = await view.nowText();
  const replyNext = await view.nextStep();
  check(
    "journey.owner-reply",
    'the observed reply reads "Owner replied" with "Record the owner\'s decision" as the next step (L36)',
    /Owner replied/.test(replyNow) &&
      replyNext.text.includes("Record the owner's decision"),
    { reply, sendRecord, now: replyNow.slice(0, 400), next: replyNext },
  );

  // J07b the working terms the decision approves. The prepared kickoff fills the rent from the
  // sent message; the effective date and the term end date are the staff member's two entries in
  // Working renewal terms, logged in their own phase so they are not counted as the decision.
  const preparedEnd = mix.leases.find((row) => row.lease.leaseID === Number(prepared))
    ?.lease.endDate;
  const termsObserved = { preparedEnd };
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(preparedEnd ?? ""))) {
    const day = new Date(`${preparedEnd}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1);
    const effective = day.toISOString().slice(0, 10);
    // A twelve-month term: it ends on the same day of the year as the current lease.
    const termEnd = `${Number(preparedEnd.slice(0, 4)) + 1}${preparedEnd.slice(4)}`;
    for (const [name, value] of [
      ["Working effective date", effective],
      ["Working term end date", termEnd],
    ]) {
      const field = page.getByLabel(name, { exact: true });
      if (!(await shownWithin(field, 15_000))) continue;
      await field.fill(value);
      await field.blur();
      log.act("terms", "entry", name);
      termsObserved[name] = value;
      await page.waitForTimeout(2500);
    }
  }
  await view.open(prepared);

  // J08 the owner's decision from the observed reply (L36): at most three actions, nothing
  // preselected.
  mark = log.mark();
  const decisionObserved = {};
  const decision = view.now().locator('[data-renewal-field="owner-decision-from-reply"]');
  const decisionShown = await shownWithin(decision, 30_000);
  const preselected = decisionShown
    ? await decision.locator('input[type="radio"]:checked').count()
    : null;
  if (decisionShown) {
    await decision
      .getByRole("radio", { name: /^Approved in the reply received/ })
      .first()
      .check();
    log.act("decision", "choice", "Approved in the reply received …");
    const party = decision.getByLabel("Who approved in this reply");
    await party.waitFor({ state: "visible" });
    const partyPreselected = await party.inputValue();
    await party.selectOption({ index: 1 });
    log.act("decision", "choice", "Who approved in this reply");
    const saved = page
      .waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/lease-renewal/workspace",
        { timeout: 20_000 },
      )
      .then(async (response) => ({
        status: response.status(),
        body: await response.text().then((text) => text.slice(0, 400)),
      }))
      .catch(() => null);
    await decision
      .getByRole("button", { name: "Record this decision", exact: true })
      .click();
    log.act("decision", "confirmation", "Record this decision");
    decisionObserved.saved = await saved;
    decisionObserved.alert = squash(
      await decision
        .locator('[role="alert"]')
        .textContent({ timeout: 2000 })
        .catch(() => ""),
    );
    decisionObserved.partyPreselected = partyPreselected;
    effects.push({
      phase: "decision",
      kind: "staff record (owner decision)",
      reviewShown: true,
      confirmShown: true,
      confirmed: decisionObserved.saved?.status === 200,
      partyPreselected,
    });
  }
  const afterDecision = await waitForStep(page, prepared, ["offer-tenant"], 45_000);
  decisionObserved.afterDecision = afterDecision;
  decisionObserved.now = (await view.nowText()).slice(0, 400);
  check(
    "journey.owner-decision-recorded",
    "the decision chosen on the Now card is recorded through the staff record and the lease moves on to Offer the tenant (L36)",
    decisionObserved.saved?.status === 200 && afterDecision === "offer-tenant",
    decisionObserved,
  );
  budget(
    "journey.owner-decision",
    "the owner's decision from an observed reply in at most three actions, nothing preselected",
    {
      counted: countActions(log.since(mark)),
      pages: openPages(context).length,
      maxActions: 3,
      maxPages: 1,
      extra: {
        "the decision control is on the Now card": decisionShown,
        "no outcome is preselected": preselected === 0,
        "the lease moves on to Offer the tenant": afterDecision === "offer-tenant",
      },
    },
  );

  // J09 to J13: the rest of the path to Complete on the guided path (L53, L17), with hand records
  // where a provider step is closed, and exactly one next step at every point.
  const points = [];
  const otherPages = [];
  // Every staff record on the path, by route and status, so a record that did not hold is named.
  const pathWrites = [];
  const onPathWrite = async (response) => {
    const request = response.request();
    if (request.method() !== "POST" || !request.url().includes("/api/lease-renewal/"))
      return;
    let body = null;
    try {
      body = JSON.parse(request.postData() ?? "null");
    } catch {
      body = null;
    }
    pathWrites.push({
      route: new URL(request.url()).pathname,
      status: response.status(),
      kind: body?.action?.kind ?? body?.kind ?? null,
      outcome: body?.action?.outcome ?? body?.outcome ?? null,
      activity: body?.action?.activity ?? body?.activity ?? null,
    });
  };
  page.on("response", onPathWrite);
  mark = log.mark();
  let completed = false;
  let tenantOffer = null;
  for (let round = 0; round < 24 && !completed; round += 1) {
    await view.open(prepared);
    const step = await view.currentStep();
    const next = await view.nextStep();
    points.push({ step, ...next, stage: (await view.stageLine()).slice(0, 120) });
    if (step === "complete") {
      const complete = page.locator("#renewal-manual-complete");
      const recorded = /recorded complete by staff/.test(
        squash(await complete.textContent().catch(() => "")),
      );
      if (recorded) {
        completed = true;
        break;
      }
      const button = complete.getByRole("button", {
        name: "Record staff completion",
        exact: true,
      });
      if (await shownWithin(button, 15_000)) {
        await button.click();
        log.act("path", "confirmation", "Record staff completion");
        effects.push({
          phase: "path",
          kind: "staff record (completion)",
          reviewShown: true,
          confirmShown: true,
          confirmed: true,
        });
        await page.waitForTimeout(3000);
        continue;
      }
      break;
    }
    if (step === "offer-tenant") {
      const primary = view.now().locator("[data-renewal-now-primary]");
      // The tenant offer is the lease's one tenant message record, which loads after the page;
      // its Review and send becomes the Now card's primary once it has loaded.
      await shownWithin(view.now().locator("[data-renewal-message-revision]"), 60_000);
      await page.waitForTimeout(1000);
      const label = squash(await primary.textContent().catch(() => ""));
      const review = primary;
      const offerRecord = page.locator("details#renewal-manual-tenant_offer");
      const offerDone = /:\s*done\b/i.test(
        squash(
          await offerRecord
            .locator("summary")
            .textContent()
            .catch(() => ""),
        ),
      );
      points.at(-1).now = (await view.nowText()).slice(0, 600);
      points.at(-1).records = {
        tenantOffer: squash(
          await offerRecord.textContent({ timeout: 2000 }).catch(() => ""),
        ).slice(0, 300),
        tenantResponse: squash(
          await page
            .locator("#renewal-manual-tenant_response")
            .textContent({ timeout: 2000 })
            .catch(() => ""),
        ).slice(0, 400),
        ownerResponse: squash(
          await page
            .locator("#renewal-manual-owner_response > p")
            .allTextContents()
            .then((texts) => texts.join(" | "))
            .catch(() => ""),
        ).slice(0, 400),
      };
      // What sending needs, as the card names it. The tenant offer needs a verified renewal
      // information form link, a company resource the app refuses to verify for a synthetic host
      // (lib/lease-renewal/resource-locations.ts), so in the rehearsal the offer is recorded by hand.
      const sendNeeds = squash(
        await view
          .now()
          .locator('[data-renewal-field="send-needs"]')
          .first()
          .textContent({ timeout: 2000 })
          .catch(() => ""),
      );
      points.at(-1).sendNeeds = sendNeeds;
      if (
        !tenantOffer &&
        label === "Review and send" &&
        !sendNeeds &&
        (await review.isEnabled())
      ) {
        await review.click();
        log.act("path", "choice", "Review and send (tenant offer)");
        const sent = await reviewAndConfirm(
          page,
          "path",
          "send (tenant offer)",
          "Review and send",
          "Send this message",
        );
        tenantOffer = sent.confirmShown ? "sent" : "review refused";
        await page.waitForTimeout(3000);
        continue;
      }
      if (
        !tenantOffer &&
        !offerDone &&
        (await offerRecord.isVisible().catch(() => false))
      ) {
        // No send is offered for this lease's tenant offer: the hand record the app offers.
        tenantOffer = "recorded by staff";
        points.at(-1).tenantSend = {
          review: await review.isVisible().catch(() => false),
          reviewEnabled: await review.isEnabled().catch(() => false),
          needs: squash(
            await page
              .locator('[data-renewal-field="send-needs"]')
              .first()
              .textContent()
              .catch(() => ""),
          ),
        };
        if (!(await offerRecord.evaluate((element) => element.open))) {
          await offerRecord.locator("summary").click();
          log.act("path", "choice", "open Tenant offer delivered");
        }
        await offerRecord.locator("select").first().selectOption("done");
        log.act("path", "choice", "Tenant offer delivered: Done");
        await page.waitForTimeout(3000);
        continue;
      }
      // The tenant accepted: the one next step is the step's renewal information form.
      if (/information form/i.test(next.text ?? "")) {
        if ((await recordHandOutcomes(page, "offer-tenant")) > 0) {
          await page.waitForTimeout(2000);
          continue;
        }
      }
      // The offer is out: record the tenant's answer.
      const response = page.getByLabel("Tenant response", { exact: true });
      if (
        (await shownWithin(response, 10_000)) &&
        (await response.inputValue()) !== "accepted"
      ) {
        await response.selectOption("accepted");
        log.act("path", "choice", "Tenant response: Accepted");
        await page.waitForTimeout(3000);
        continue;
      }
      points.at(-1).stuck = { label, tenantOffer, offerDone };
      break;
    }
    if (step === "documents" || step === "finish-up") {
      const done = await recordHandOutcomes(page, step);
      if (done === 0) {
        points.at(-1).stuck = { now: (await view.nowText()).slice(0, 500) };
        break;
      }
      await page.waitForTimeout(2000);
      continue;
    }
    points.at(-1).stuck = { now: (await view.nowText()).slice(0, 500) };
    break;
  }
  page.off("response", onPathWrite);
  for (const page of openPages(context))
    if (page !== state.page) otherPages.push(page.url());
  const pathCount = countActions(log.since(mark));
  await page.goto(`${origin}/lease-renewal/live/desk`, { waitUntil: "domcontentloaded" });
  await page.getByRole("region", { name: "Working batch", exact: true }).waitFor();
  const completedRow = squash(
    await page
      .locator(`[data-batch-lease="${prepared}"]`)
      .first()
      .textContent()
      .catch(() => ""),
  ).slice(0, 300);
  check(
    "journey.complete",
    "the prepared lease is taken from the desk to Complete on the guided path with hand records where a provider step is closed (L53)",
    completed,
    {
      points,
      tenantOffer,
      termsObserved,
      pathActions: pathCount,
      pathWrites,
      completedRow,
    },
  );
  check(
    "journey.one-next-step",
    "exactly one next step is named at every point, in Guided view, with no visit to another page (L53, L17)",
    points.length > 0 &&
      points.every(
        (point) =>
          point.guidedPressed === "true" &&
          point.primaries === 1 &&
          (point.step === "complete" ? point.lines <= 1 : point.lines === 1),
      ) &&
      openPages(context).length === 1 &&
      otherPages.length === 0,
    { points, pages: openPages(context).length, otherPages },
  );

  // J14 the standing agreement variant on the covered lease (L46).
  await view.open(covered, "?step=ask-owner");
  const coveredNow = await view.nowText();
  const coveredCurrent = await view.currentStep();
  await page.goto(`${origin}/lease-renewal/live/desk`, { waitUntil: "domcontentloaded" });
  const coveredTags = await page
    .locator(`[data-batch-lease="${covered}"] [data-batch-tag]`)
    .evaluateAll((items) => items.map((item) => item.textContent?.trim()))
    .catch(() => []);
  check(
    "journey.standing-agreement",
    'the covered lease reads "Covered by {agreement}: no owner message needed", continues at Offer the tenant and carries the "Standing agreement" tag (L46)',
    /Covered by .+: no owner message needed/.test(coveredNow) &&
      coveredCurrent === "offer-tenant" &&
      coveredTags.includes("Standing agreement"),
    { now: coveredNow.slice(0, 300), current: coveredCurrent, tags: coveredTags },
  );

  // J15 recipients (R-S252-11 "Revised recipients not kept in a draft", AC-S252-5): a message's
  // recipients are the lease's verified recipients; no control on the lease page lets staff type
  // one, so no typed recipient can be carried to another lease.
  await view.open(covered, "?step=offer-tenant");
  const recipientFields = await page.evaluate(() =>
    [...document.querySelectorAll("input, textarea, select")]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const label =
          element.getAttribute("aria-label") ??
          (element.id
            ? document.querySelector(`label[for="${element.id}"]`)?.textContent
            : null) ??
          "";
        return label.trim();
      })
      .filter((label) => /^(to|cc|bcc|recipients?)\b/i.test(label)),
  );
  const coveredMessage = await view.nowText();
  check(
    "journey.recipients",
    "a message's recipients are the lease's verified recipients and no field on the lease page takes a typed recipient (R-S252-11, AC-S252-5)",
    recipientFields.length === 0,
    {
      recipientFields,
      toLine: (/To:? [^.]*@example\.invalid/.exec(coveredMessage) ?? [null])[0],
    },
  );

  // J16 the housing assistance variant on the assisted lease (L49, L33 before any Propose a
  // change).
  await view.open(assisted);
  const assistedSteps = await view
    .strip()
    .locator("[data-renewal-path-step]")
    .evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-renewal-path-step")),
    );
  const assistedComparisons =
    (await standInState(rehearsal)).comparison.comparisonsByLease?.[assisted] ?? 0;
  await page.goto(`${origin}/lease-renewal/live/desk`, { waitUntil: "domcontentloaded" });
  const assistedTags = await page
    .locator(`[data-batch-lease="${assisted}"] [data-batch-tag]`)
    .evaluateAll((items) => items.map((item) => item.textContent?.trim()))
    .catch(() => []);
  const order = assistedSteps.slice(
    assistedSteps.indexOf("check-numbers") + 1,
    assistedSteps.indexOf("check-numbers") + 4,
  );
  check(
    "journey.housing-assistance",
    'the assisted lease continues after Check the numbers with the program contact, the owner\'s renewal answer and the rent choice, carries the "Housing assistance" tag, and no comparison is requested for it (L49, L33)',
    JSON.stringify(order) ===
      JSON.stringify([
        "assisted-program-contact",
        "assisted-owner-renewal-answer",
        "assisted-rent",
      ]) &&
      assistedTags.includes("Housing assistance") &&
      assistedComparisons === 0,
    { steps: assistedSteps, tags: assistedTags, comparisons: assistedComparisons },
  );

  // J17 values stay on their lease (AC-S252-5, L70): a rent and a date typed on the replied lease
  // are suggested on no other lease, portfolio or policy.
  const RENT = 1437;
  const DATE = "2027-02-17";
  await view.open(replied, "?step=ask-owner");
  const rentField = page.getByLabel("Working monthly rent", { exact: true });
  const dateField = page.getByLabel("Working effective date", { exact: true });
  let typed = false;
  if ((await shownWithin(rentField, 20_000)) && (await shownWithin(dateField, 5_000))) {
    await rentField.fill(String(RENT));
    await rentField.blur();
    log.optional("values", "Working monthly rent (typed for AC-S252-5)");
    await dateField.fill(DATE);
    await dateField.blur();
    log.optional("values", "Working effective date (typed for AC-S252-5)");
    await page.waitForTimeout(3000);
    typed = true;
  }
  const own = await route(`/api/lease-renewal/working-record?leaseId=${replied}`);
  const others = await Promise.all(
    [prepared, covered, assisted, missingRecipient].map(async (leaseId) => ({
      leaseId,
      record:
        (await route(`/api/lease-renewal/working-record?leaseId=${leaseId}`)).body
          ?.record ?? null,
      pricing:
        (await route(`/api/lease-renewal/pricing-policy?leaseId=${leaseId}`)).body ??
        null,
    })),
  );
  const policies = await route("/api/lease-renewal/pricing-policy");
  const agreements = await route("/api/lease-renewal/pricing-policy?standing=all");
  const carried = (value) =>
    others
      .filter(
        ({ record, pricing }) =>
          JSON.stringify(record ?? {}).includes(String(value)) ||
          JSON.stringify(pricing ?? {}).includes(String(value)),
      )
      .map(({ leaseId }) => leaseId);
  check(
    "journey.cross-lease-values",
    "a rent and a date typed on one lease are kept on that lease and suggested on no other lease, portfolio or policy (AC-S252-5, L70)",
    typed &&
      own.body?.record?.fields?.terms_rent?.value === RENT &&
      carried(RENT).length === 0 &&
      carried(DATE).length === 0 &&
      !JSON.stringify(policies.body ?? {}).includes(String(RENT)) &&
      !JSON.stringify(agreements.body ?? {}).includes(String(RENT)) &&
      !JSON.stringify(policies.body ?? {}).includes(DATE),
    {
      typed,
      ownRent: own.body?.record?.fields?.terms_rent?.value ?? null,
      ownDate: own.body?.record?.fields?.terms_effective_date?.value ?? null,
      rentOn: carried(RENT),
      dateOn: carried(DATE),
    },
  );

  // J18 renewed-in-source closure (L04, BEH-S246-2): a lease renewed in RentVine is recorded
  // complete only with a staff confirmation and leaves the open groups.
  const renewed = rehearsal.groups.renewed_in_rentvine[0];
  await page.goto(`${origin}/lease-renewal/live/desk`, { waitUntil: "domcontentloaded" });
  await page.getByRole("region", { name: "Working batch", exact: true }).waitFor();
  const groupOf = async (leaseId) =>
    page.evaluate((id) => {
      const counts = Object.fromEntries(
        [...document.querySelectorAll("button[data-batch-group]")].map((button) => [
          button.getAttribute("data-batch-group"),
          Number(button.getAttribute("data-batch-count")),
        ]),
      );
      const listed = [...document.querySelectorAll(`[data-batch-lease="${id}"]`)].map(
        (row) => row.getAttribute("data-batch-group"),
      );
      const lists = Object.fromEntries(
        [...document.querySelectorAll("[data-batch-list]")].map((list) => [
          list.getAttribute("data-batch-list"),
          Number(list.getAttribute("data-batch-count")),
        ]),
      );
      return { counts, lists, listed };
    }, String(leaseId));
  const countButton = page.locator('button[data-batch-group="renewed_in_rentvine"]');
  const before = await groupOf(renewed);
  mark = log.mark();
  await countButton.click();
  log.act("closure", "choice", "Renewed in RentVine, confirm and close");
  const renewedPanel = page.locator('[data-batch-open-group="renewed_in_rentvine"]');
  await renewedPanel.waitFor({ state: "visible" });
  const offered = await renewedPanel
    .locator(`[data-batch-lease="${renewed}"]`)
    .getByRole("button")
    .allTextContents();
  await renewedPanel
    .locator(`[data-batch-lease="${renewed}"]`)
    .getByRole("button", { name: "Record staff completion", exact: true })
    .click();
  log.act("closure", "choice", "Record staff completion");
  const confirmDialog = page.getByRole("dialog");
  const confirmShown = await shownWithin(confirmDialog, 15_000);
  const confirmText = confirmShown
    ? squash(await confirmDialog.textContent()).slice(0, 300)
    : "";
  if (confirmShown) {
    await confirmDialog
      .getByRole("button", { name: "Record staff completion", exact: true })
      .click();
    log.act("closure", "confirmation", "Record staff completion (confirm)");
    await confirmDialog
      .waitFor({ state: "hidden", timeout: 60_000 })
      .catch(() => undefined);
  }
  effects.push({
    phase: "closure",
    kind: "staff record (completion with RentVine evidence)",
    reviewShown: confirmShown,
    confirmShown,
    confirmed: confirmShown,
  });
  await page.waitForTimeout(3000);
  await page.goto(`${origin}/lease-renewal/live/desk`, { waitUntil: "domcontentloaded" });
  await page.getByRole("region", { name: "Working batch", exact: true }).waitFor();
  await page.waitForTimeout(2000);
  let after = await groupOf(renewed);
  // The lease is listed only when its group's list is open: open each counted group in turn.
  let landed = after.listed[0] ?? null;
  for (const group of Object.keys(after.counts)) {
    if (landed) break;
    await page.locator(`button[data-batch-group="${group}"]`).click();
    await page.waitForTimeout(1200);
    after = await groupOf(renewed);
    landed = after.listed.find((value) => value) ?? null;
    await page.locator(`button[data-batch-group="${group}"]`).click();
    await page.waitForTimeout(600);
  }
  const total = (snapshot) =>
    Object.values(snapshot.counts).reduce((sum, value) => sum + value, 0) +
    (snapshot.lists.this_batch ?? 0) +
    (snapshot.lists.carried_over ?? 0);
  check(
    "journey.renewed-in-source-closure",
    "a lease renewed in RentVine offers Record staff completion or Keep working, completes only after its own confirmation, and then leaves the renewed and open groups with every lease still counted once (L04, BEH-S246-2)",
    offered.includes("Record staff completion") &&
      offered.includes("Keep working") &&
      confirmShown &&
      !["renewed_in_rentvine", "this_batch", "carried_over"].includes(landed ?? "") &&
      (after.counts.renewed_in_rentvine ?? 0) ===
        (before.counts.renewed_in_rentvine ?? 0) - 1 &&
      total(after) === total(before),
    {
      renewed,
      offered,
      confirmText,
      landed,
      before,
      after,
      actions: countActions(log.since(mark)).actions,
    },
  );

  // J18b L14 on each of the first four steps, not only the step a lease happens to be on: the
  // missing-recipient lease, each step opened from the path strip (a read; nothing is recorded),
  // read at the top of the page. At 1280 by 800 the stage line, the path strip and the Now card's
  // primary action are on the first screen; at 390 wide the primary action is within two screens,
  // with no sideways scroll.
  const LAYOUT_STEPS = [
    "Check the numbers",
    "Compare market rent",
    "Ask the owner",
    "Offer the tenant",
  ];
  const viewportBefore = page.viewportSize();
  const stepLayouts = [];
  for (const [width, height, screens] of [
    [1280, 800, 1],
    [390, 844, 2],
  ]) {
    await page.setViewportSize({ width, height });
    for (const label of LAYOUT_STEPS) {
      await view.open(missingRecipient);
      const stepButton = view.strip().getByRole("button", { name: label, exact: true });
      if (await stepButton.count()) {
        await stepButton.click();
        log.read("layout", `path strip: ${label}`);
        await page.waitForTimeout(800);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      const boxes = await page.evaluate(() => {
        const box = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return { top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
        };
        return {
          scrollY: Math.round(window.scrollY),
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          stage: box('[data-renewal-field="stage-line"]'),
          strip: box('[aria-label="Guided view"] nav[aria-label="Renewal path"]'),
          primary: box('[aria-label="Guided view"] [data-renewal-now-primary]'),
        };
      });
      stepLayouts.push({
        width,
        step: label,
        heading: squash(
          await view
            .now()
            .locator("h2#renewal-now-heading")
            .textContent()
            .catch(() => ""),
        ),
        limit: height * screens,
        ...boxes,
      });
    }
  }
  if (viewportBefore) await page.setViewportSize(viewportBefore);
  const onScreen = (box, limit) => Boolean(box) && box.top >= 0 && box.bottom <= limit;
  check(
    "journey.layout-steps",
    "on Check the numbers, Compare market rent, Ask the owner and Offer the tenant the stage line, the path strip and the primary action are on the first screen at 1280 by 800, and the primary action is within two screens at 390 (L14)",
    stepLayouts.length === LAYOUT_STEPS.length * 2 &&
      stepLayouts.every(
        (entry) =>
          entry.scrollY === 0 &&
          !entry.overflow &&
          entry.heading.endsWith(entry.step) &&
          onScreen(entry.primary, entry.limit) &&
          (entry.width !== 1280 ||
            (onScreen(entry.stage, entry.limit) && onScreen(entry.strip, entry.limit))),
      ),
    { lease: missingRecipient, stepLayouts },
  );

  // J19 reload continuity (L18): the same view, step and place, and typing the existing autosave
  // keeps (R-S247-9: "unsaved typing is kept by the existing autosave") is there after the reload.
  // The missing-recipient lease's Ask the owner step: a Working monthly rent typed there saves when
  // the person leaves the field, and the place is a scrolled Now card.
  const KEPT_RENT = "1388";
  await view.open(missingRecipient);
  await view.strip().getByRole("button", { name: "Ask the owner", exact: true }).click();
  await page.waitForTimeout(800);
  const keptField = page.getByLabel("Working monthly rent", { exact: true });
  let typedRent = null;
  if (await shownWithin(keptField, 15_000)) {
    await keptField.fill(KEPT_RENT);
    await keptField.blur();
    log.optional("reload", "Working monthly rent (typed for L18)");
    typedRent = KEPT_RENT;
    await page.waitForTimeout(3000);
  }
  await page.mouse.wheel(0, 400);
  log.scroll("reload", "scroll 400 px");
  await page.waitForTimeout(2000);
  const placeBefore = await page.evaluate(() => Math.round(window.scrollY));
  await page.reload({ waitUntil: "domcontentloaded" });
  await view.guided().waitFor({ state: "visible" });
  await page.waitForTimeout(5000);
  const digits = (value) =>
    String(value ?? "")
      .replace(/[^0-9]/g, "")
      .replace(/00$/, "");
  const reloaded = {
    heading: squash(await view.now().locator("h2#renewal-now-heading").textContent()),
    pressed: await view.viewButton("Guided view").getAttribute("aria-pressed"),
    scrollY: await page.evaluate(() => Math.round(window.scrollY)),
    placeBefore,
    kept: typedRent ? await keptField.inputValue().catch(() => null) : null,
  };
  check(
    "journey.reload-continuity",
    "a reload in the middle of a step returns to the same view, step and place, with typed text kept by the autosave (L18)",
    reloaded.heading.endsWith("Ask the owner") &&
      reloaded.pressed === "true" &&
      Math.abs(reloaded.scrollY - placeBefore) <= 80 &&
      typedRent !== null &&
      digits(reloaded.kept).startsWith(KEPT_RENT),
    { ...reloaded, typedRent },
  );

  // J20 the release canary's own landmark predicates against the rehearsal (R-S252-7).
  const canary = await runGuardedTsx(
    rehearsal,
    "scripts/lib/one-path-rehearsal/canary-landmarks-run.ts",
    {
      HOME: process.env.HOME,
      ONE_PATH_REHEARSAL_ORIGIN: origin,
      ONE_PATH_CANARY_LEASES: [prepared, covered, assisted].join(","),
      ...Object.fromEntries(
        ["PLAYWRIGHT_CHROME_PATH", "DESK_BROWSER_EXECUTABLE", "PLAYWRIGHT_BROWSERS_PATH"]
          .filter((name) => process.env[name])
          .map((name) => [name, process.env[name]]),
      ),
    },
  ).catch((error) => ({ error: String(error?.message ?? error).slice(0, 800) }));
  check(
    "journey.canary-landmarks",
    "the canary's desk table, its workspace and the prepared, covered and assisted lease pages meet the canary's own landmark predicates, read only, and the canary visits no bare batch route (R-S252-7)",
    canary.desk?.heading === 1 &&
      canary.desk?.rows === Object.values(rehearsal.groups).flat().length &&
      Boolean(canary.desk?.workspacePath) &&
      (canary.leases ?? []).length === 4 &&
      (canary.leases ?? []).every((entry) => entry.landmarks === true) &&
      canary.visitsBareBatch === false &&
      // The development server's own error overlay posts stack frames to /__nextjs_*; that is
      // not the app and a production build has no such route. Every other attempt counts.
      (canary.blockedMutations ?? []).filter((entry) => !entry.includes(" /__nextjs_"))
        .length === 0,
    canary,
  );

  const comparisonsEnd =
    (await standInState(rehearsal)).comparison.comparisonsByLease ?? {};
  phases.push({
    name: "journey",
    writes: writes.length,
    comparisonsByLease: comparisonsEnd,
  });
  await context.close();
}

/** Documents and Finish up by hand: each shown follow-up recorded Done or Not applicable. */
async function recordHandOutcomes(page, step) {
  // The renewal information form is sent and returned by hand here: its link is a company
  // resource the rehearsal cannot verify (lib/lease-renewal/resource-locations.ts).
  const handDone = step === "documents" || step === "offer-tenant";
  const ids =
    step === "offer-tenant"
      ? ["information_form", "form_returned"]
      : step === "documents"
        ? ["documents", "document_delivery", "signatures"]
        : [
            "insurance",
            "rhino",
            "pet",
            "charges",
            "inspection",
            "filter",
            "utilities",
            "assisted_housing",
          ];
  let recorded = 0;
  for (const id of ids) {
    const details = page.locator(`details#renewal-manual-${id}`);
    if (!(await details.isVisible().catch(() => false))) continue;
    const open = await details.evaluate((element) => element.open);
    if (!open) {
      await details.locator("summary").click();
      log.act("path", "choice", `open ${id}`);
    }
    const select = details.locator("select").first();
    const value = await select.inputValue();
    if (value === "done" || value === "not_applicable") continue;
    const options = await select
      .locator("option")
      .evaluateAll((items) => items.map((item) => item.value));
    const choice =
      handDone || !options.includes("not_applicable") ? "done" : "not_applicable";
    await select.selectOption(choice);
    log.act("path", "choice", `${id}: ${choice}`);
    recorded += 1;
    await page.waitForTimeout(1500);
  }
  return recorded;
}

// ---------------------------------------------------------------------------------------------
// A named commit: the kickoff followed from that commit's own guides (L24).

async function namedCommitKickoff(browser) {
  const { context, page } = await newPage(browser, { width: 1360, height: 900 });
  await signIn(page, "Editor");
  const manual = await readServedGuides(rehearsal);
  const steps = STARTING_KICKOFF.map((entry) => {
    const step = guideStep(manual, entry.ref);
    return step
      ? { ...step, plan: entry }
      : { ref: entry.ref, missing: true, plan: entry };
  });
  check(
    "named.guides-read",
    "the served commit's in-app guides name every step of the kickoff plan",
    steps.every((step) => !step.missing),
    steps.map((step) =>
      step.missing
        ? `${step.ref}: not in this commit's guides`
        : `${step.ref} (${step.control.role} "${step.control.label}")`,
    ),
  );
  const state = { page, maxPages: 1 };
  await page.goto(`${origin}/lease-renewal`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const mark = log.mark();
  const results = [];
  for (const step of steps.filter((entry) => !entry.missing)) {
    for (const before of step.plan.before ?? []) {
      const control = state.page
        .getByRole(before.role, { name: before.label, exact: true })
        .first();
      const shown = await shownWithin(control, 90_000);
      if (!shown) {
        results.push({
          ref: step.ref,
          ok: false,
          error: `"${before.label}" is not shown`,
        });
        break;
      }
      await clickAndFollow(
        state,
        control,
        log,
        "named",
        "choice",
        `${before.label} (named in the step)`,
        step,
      );
      await state.page.waitForTimeout(3000);
    }
    const [result] = await followGuide({
      state,
      steps: [step],
      log,
      phase: "named",
      leaseId: prepared,
      values: { [step.id]: step.plan.value, [step.ref]: step.plan.value },
      timeout: 90_000,
    });
    // A lookup or a save finishes before the next step, as staff wait for it.
    await state.page.waitForTimeout(step.ref.endsWith("run-one-lookup") ? 15_000 : 2500);
    if (!result.ok && step.control.role === "button") {
      // A confirmation the page shows but does not let staff choose (for example a send the Demo
      // environment refuses) is reported with what the page said, and counted separately.
      const control = state.page
        .getByRole("button", { name: step.control.label, exact: true })
        .first();
      result.shownNotEnabled =
        (await control.isVisible().catch(() => false)) &&
        !(await control.isEnabled().catch(() => true));
    }
    results.push(result);
    if (!result.ok && !result.shownNotEnabled) break;
  }
  const counted = countActions(log.since(mark));
  const confirmationShownNotEnabled = results.some((result) => result.shownNotEnabled);
  const pages = Math.max(state.maxPages, openPages(context).length);
  const result = budget(
    "named.kickoff-budget",
    "kickoff for the prepared lease in at most three actions on one page, following this commit's own guides",
    {
      counted,
      pages,
      maxActions: 3,
      maxPages: 1,
      extra: {},
    },
  );
  check(
    "named.kickoff-followed",
    "the kickoff was followed from this commit's guides up to and including the confirmation",
    results.length === steps.length &&
      results.every((entry) => entry.ok || entry.shownNotEnabled),
    {
      results,
      pageUrls: openPages(context).map((open) =>
        new URL(open.url()).pathname.replace(/\d+/g, "{id}"),
      ),
      confirmationShownNotEnabled,
      actionsWithTheConfirmation: counted.actions + (confirmationShownNotEnabled ? 1 : 0),
    },
  );
  phases.push({
    name: "named-commit-kickoff",
    servedCommit: rehearsal.servedCommit,
    startingCommit: rehearsal.servedCommit === STARTING_COMMIT,
    actions: counted.actions,
    actionsWithTheConfirmation: counted.actions + (confirmationShownNotEnabled ? 1 : 0),
    pages,
    budgetPassed: result.passed,
    labels: counted.labels,
  });
  await context.close();
}

// ---------------------------------------------------------------------------------------------
// Builder phases: each imported and run unchanged, from the rehearsal's starting state.

async function builderPhase(browser, name, file, exportName, { reset = true } = {}) {
  let seeds = null;
  if (reset) {
    seeds = await resetRehearsalState({ rehearsal, browser }).catch((error) => [
      {
        name: "reset",
        state: "failed",
        detail: String(error?.message ?? error).slice(0, 400),
      },
    ]);
    const failed = seeds.filter(
      (seed) => seed.state === "failed" || seed.state === "skipped",
    );
    process.stdout.write(
      `phase ${name}: reset and seeded (${seeds.map((seed) => `${seed.name}: ${seed.state}`).join(", ")})\n`,
    );
    if (failed.some((seed) => seed.name === "reset")) {
      check(
        `${name}.reset`,
        "the rehearsal was put back to its starting state",
        false,
        seeds,
      );
      phases.push({ name, seeds, passed: 0, failed: 1 });
      return;
    }
  }
  const driverModule = await import(new URL(file, import.meta.url).href);
  const outcome = await driverModule[exportName]().catch((error) => ({
    exitCode: 1,
    checks: [
      {
        name: "the phase ran to its end",
        passed: false,
        observed: String(error?.stack ?? error).slice(0, 1500),
      },
    ],
  }));
  for (const [index, entry] of (outcome.checks ?? []).entries())
    check(
      `${name}.${String(index + 1).padStart(2, "0")}`,
      entry.name,
      entry.passed !== false,
      entry.observed,
    );
  phases.push({
    name,
    file,
    seeds: seeds?.map((seed) => `${seed.name}: ${seed.state}`) ?? null,
    exitCode: outcome.exitCode,
    passed: (outcome.checks ?? []).filter((entry) => entry.passed !== false).length,
    failed: (outcome.checks ?? []).filter((entry) => entry.passed === false).length,
  });
}

// ---------------------------------------------------------------------------------------------

function refusedSummary() {
  const refused = refusedConnections(rehearsal);
  const hosts = [
    ...new Set(refused.map((entry) => entry.host ?? entry.refused ?? "unknown")),
  ];
  const aimed = refused.filter(
    (entry) =>
      PROVIDER_OR_PRODUCTION.test(String(entry.host ?? entry.refused ?? "")) ||
      String(entry.refused ?? "").startsWith("rentvine") ||
      String(entry.refused ?? "").startsWith("rentcast"),
  );
  const unexplained = refused.filter(
    (entry) => !DEV_TOOL_HOSTS.has(String(entry.host ?? "")) && !aimed.includes(entry),
  );
  return { refused: refused.length, hosts, aimed, unexplained };
}

/** The candidate's phases in their run order: [name, driver file, exported function]. */
const CANDIDATE_PHASES = [
  ["s249-kickoff", "./one-path-kickoff-driver.mjs", "runKickoff"],
  ["s254-stand-in-proof", "./one-path-stand-in-proof-driver.mjs", "runStandInProof"],
  ["s254-smoke", "./one-path-smoke-driver.mjs", "runSmoke"],
  ["journey", null, null],
  ["s247-s248-guided-path", "./one-path-guided-path-driver.mjs", "runGuidedPath"],
  ["s250-s251-variants", "./one-path-variants-driver.mjs", "runVariants"],
];
// `-- --phases journey,s249-kickoff` runs only those phases (in the order above), for example
// while a step is being repaired. A run with every phase is the evidence run.
const phasesArgument = process.argv.indexOf("--phases");
const selectedPhases =
  phasesArgument >= 0 ? new Set(process.argv[phasesArgument + 1].split(",")) : null;
const SELECTED = (name) => selectedPhases === null || selectedPhases.has(name);

async function resetForJourney(browser) {
  const seeds = await resetRehearsalState({ rehearsal, browser });
  process.stdout.write(
    `phase journey: reset and seeded (${seeds.map((seed) => `${seed.name}: ${seed.state}`).join(", ")})\n`,
  );
}

const browser = await chromium.launch({
  executablePath: resolveBrowserExecutable(),
  headless: true,
});
let exitCode = 1;
try {
  if (MODE === "named-commit") {
    await namedCommitKickoff(browser);
  } else if (MODE === "verification") {
    await builderPhase(
      browser,
      "s249-verification",
      "./one-path-kickoff-verification-driver.mjs",
      "runKickoffVerification",
      { reset: false },
    );
  } else {
    // The order keeps one phase from spoiling the next. The served app answers a lease looked up
    // earlier in the run from its own comparison cache (see reset.mjs), so the two phases that
    // count comparison requests come first: the S249 kickoff on the harness's starting state,
    // then the stand-in proof. Every later phase starts from the starting state again; the journey
    // follows the smoke count on the same state.
    let first = true;
    for (const [name, file, exportName] of CANDIDATE_PHASES) {
      if (!SELECTED(name)) continue;
      if (name === "journey") {
        if (!first && !SELECTED("s254-smoke")) await resetForJourney(browser);
        await journey(browser).catch((error) =>
          check(
            "journey.ran",
            "the journey ran to its end",
            false,
            String(error?.stack ?? error).slice(0, 2000),
          ),
        );
      } else await builderPhase(browser, name, file, exportName, { reset: !first });
      first = false;
    }
    // L58 over the whole run.
    if (SELECTED("journey"))
      check(
        "journey.reviews-and-confirmations",
        "every send, schedule, Gmail draft creation and staff completion the journey made showed its exact review and asked for its own confirmation (L58, AC-S252-1)",
        effects.length > 0 &&
          effects.every((entry) => entry.reviewShown && entry.confirmShown),
        effects,
      );
  }
  const refused = refusedSummary();
  check(
    "run.refused-connections",
    "the refused-connection log shows no call to production, a provider or a mailbox, and every other refusal is a named development-tool check (L58)",
    refused.aimed.length === 0 && refused.unexplained.length === 0,
    refused,
  );
  exitCode =
    checks.every((entry) => entry.passed) && budgets.every((entry) => entry.passed)
      ? 0
      : 1;
} catch (error) {
  check(
    "run.ran",
    "the journey driver ran to its end",
    false,
    String(error?.stack ?? error).slice(0, 2000),
  );
  exitCode = 1;
} finally {
  await browser.close().catch(() => undefined);
}
const result = {
  mode: MODE,
  runId: runDir.split("/").at(-1),
  servedCommit: rehearsal.servedCommit,
  harnessCommit: rehearsal.harnessCommit,
  overlay: rehearsal.overlay,
  namedCommit: rehearsal.namedCommit,
  businessDate: rehearsal.businessDate,
  workingMonth: rehearsal.workingMonth,
  passed: checks.filter((entry) => entry.passed).length,
  failed: checks.filter((entry) => !entry.passed).length,
  budgets,
  phases,
  checks,
  stepLog: log.entries,
};
writeFileSync(join(runDir, "journey.json"), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(
  `one-path journey (${MODE}): ${result.passed} passed, ${result.failed} failed; budgets ${budgets.filter((entry) => entry.passed).length} of ${budgets.length} within bounds on ${rehearsal.servedCommit.slice(0, 8)}.\n`,
);
for (const entry of budgets)
  process.stdout.write(
    `  budget ${entry.id}: ${entry.actions} action(s), ${entry.pages} page(s), bound ${entry.maxActions ?? "-"} / ${entry.maxPages ?? "-"}: ${entry.passed ? "within" : "OUTSIDE"}\n`,
  );
process.exit(exitCode);
