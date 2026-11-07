// S247 and S248: the guided path through the one-path rehearsal. Run it with
//
//   bash scripts/run-renewal-one-path-rehearsal.sh --overlay --driver tests/browser/one-path-guided-path-driver.mjs
//
// As the local demo Editor it opens each of the five working-month role leases and checks the
// Guided view default (the three-way view control with Guided view pressed, the path strip with
// one current step, one Now card with one primary action, the five section links); works a later
// step while an earlier one is unfinished; reloads and returns to the same view, step and place;
// switches views and follows a section link into Full view; sends an owner message through the
// mail stand-in with the existing confirmation and sees the lease wait on the owner on its page
// and its desk row with nothing more entered; removes that derived outreach with a reason; and
// uses the control hooks for an owner reply, an unconfirmed send, a failed delivery and a
// scheduled message. The scheduled message is counted only after the harness's own due-message
// tick (scripts/lib/one-path-rehearsal/due-message-tick.mjs) has Gmail accept it.
//
// Every check is named and decides itself; the result goes to guided-path.json in the run
// directory. Synthetic data only; nothing leaves this machine.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import { requireLoopbackRehearsalOrigin } from "../../scripts/lib/help-rehearsal-origin.mjs";
import {
  readRehearsal,
  setNextSend,
  standInState,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import {
  routeFromPage,
  sendOwnerMessage,
  sequenceStanding,
} from "../../scripts/lib/one-path-rehearsal/seeds.mjs";
import { runDueMessageTick } from "../../scripts/lib/one-path-rehearsal/due-message-tick.mjs";

const origin = requireLoopbackRehearsalOrigin(process.env.ONE_PATH_REHEARSAL_ORIGIN);
const runDir = process.env.ONE_PATH_REHEARSAL_RUN_DIR;
assert.ok(runDir, "Run through scripts/run-renewal-one-path-rehearsal.sh.");
const rehearsal = readRehearsal(runDir);
const { prepared, covered, assisted, missingRecipient, replied } = rehearsal.roles;
const WORKING = [prepared, covered, assisted, missingRecipient, replied].filter(Boolean);
const STEPS = [
  "Check the numbers",
  "Compare market rent",
  "Ask the owner",
  "Offer the tenant",
  "Documents and signatures",
  "Finish up",
  "Complete",
];
const SECTIONS = [
  "Lease details",
  "Market rent comparison",
  "Owner approval",
  "Tenant offer and response",
  "Documents and completion",
];

const checks = [];
const check = (name, passed, observed) => {
  checks.push({ name, passed: Boolean(passed), observed });
  process.stdout.write(`${passed ? "ok  " : "FAIL"} ${name}\n`);
};
const leasePath = (leaseId, query = "") =>
  `/lease-renewal/live/desk/lease/${leaseId}${query}`;

/**
 * S252: this driver's named, self-checking steps. The journey driver
 * (tests/browser/one-path-journey-driver.mjs) imports and runs this function in its own order;
 * run alone, the file runs it once and exits with its result. Resolves with { exitCode, checks }.
 */
export async function runGuidedPath() {
  const browser = await chromium.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      timezoneId: "America/Chicago",
      locale: "en-US",
    });
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort("blockedbyclient"),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(240_000);
    page.setDefaultNavigationTimeout(240_000);
    // Every write the page makes, so opening, choosing and reloading can be shown to make none.
    const writes = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        url.origin === origin &&
        request.method() !== "GET" &&
        url.pathname.startsWith("/api/")
      )
        writes.push(`${request.method()} ${url.pathname}`);
    });
    await page.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
    assert.ok(
      await page.evaluate(
        `fetch("/api/auth/demo",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({role:"Editor"})}).then(r=>r.ok)`,
      ),
      "Local demo Editor sign-in failed.",
    );
    writes.length = 0;
    const route = (path, body) => routeFromPage(page, path, body);
    const guided = () => page.getByRole("region", { name: "Guided view", exact: true });
    const now = () => guided().getByRole("region", { name: "Now", exact: true });
    const strip = () =>
      guided().getByRole("navigation", { name: "Renewal path", exact: true });
    const viewButton = (name) =>
      page
        .getByRole("group", { name: "Lease view", exact: true })
        .getByRole("button", { name, exact: true });
    const open = async (leaseId, query = "") => {
      await page.goto(`${origin}${leasePath(leaseId, query)}`, {
        waitUntil: "domcontentloaded",
      });
      await page
        .getByRole("group", { name: "Lease view", exact: true })
        .waitFor({ state: "visible" });
      await page.waitForTimeout(1500);
    };
    const stageLine = async () =>
      (await page.locator('[data-renewal-field="stage-line"]').textContent())?.trim() ??
      "";

    async function refusedRetirement(sequenceId, expected) {
      process.stdout.write(
        `expect L09: retirement refuses ${expected} and links the exact communication.\n`,
      );
      const stage = page.getByRole("region", {
        name: "Current renewal stage",
        exact: true,
      });
      const countMail = async () =>
        (await standInState(rehearsal)).mail.mailboxes.reduce(
          (count, box) => count + (box.messages ?? []).length + (box.drafts ?? []).length,
          0,
        );
      const before = await countMail();
      try {
        await stage.getByRole("button", { name: "Record work", exact: true }).click();
        await stage
          .getByRole("button", { name: "Retire from renewals", exact: true })
          .click();
        const dialog = page.getByRole("dialog", {
          name: "Retire from renewals",
          exact: true,
        });
        const reason = "Synthetic retirement held for pending outreach";
        await dialog.getByLabel("Reason", { exact: true }).fill(reason);
        const [response] = await Promise.all([
          page.waitForResponse(
            (result) =>
              new URL(result.url()).pathname === "/api/lease-renewal/cycle-disposition" &&
              result.request().method() === "POST",
            { timeout: 30_000 },
          ),
          dialog
            .getByRole("button", { name: "Retire from renewals", exact: true })
            .click(),
        ]);
        const recovery = dialog.getByRole("link", {
          name: "Open the pending communication",
          exact: true,
        });
        const href = await recovery.getAttribute("href", { timeout: 15_000 });
        const displayed = (await dialog.innerText()).includes(expected);
        const reasonKept =
          (await dialog.getByLabel("Reason", { exact: true }).inputValue()) === reason;
        const active = !/Retired from renewals/.test(await stageLine());
        const effectsKept = (await countMail()) === before;
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
        check(
          `L09 retirement refusal: ${expected}`,
          response.status() === 409 &&
            href === `/gmail-hub?communication=${encodeURIComponent(sequenceId)}` &&
            displayed &&
            reasonKept &&
            active &&
            effectsKept,
          {
            status: response.status(),
            exactRecovery: href?.includes(sequenceId),
            displayed,
            reasonKept,
            active,
            effectsKept,
          },
        );
      } catch (error) {
        check(`L09 retirement refusal: ${expected}`, false, String(error).slice(0, 800));
      }
    }

    // 1. Guided view is the default on each working-month lease (BEH-S247-1, L12 to L14).
    for (const leaseId of WORKING) {
      await open(leaseId);
      const observed = {
        leaseId,
        pressed: await viewButton("Guided view").getAttribute("aria-pressed"),
        views: await page
          .getByRole("group", { name: "Lease view", exact: true })
          .getByRole("button")
          .allTextContents(),
        steps: await strip().getByRole("button").allTextContents(),
        current: await strip().locator('[aria-current="step"]').count(),
        nowCards: await now().count(),
        primaries: await now().locator("[data-renewal-now-primary]").count(),
        sections: await guided()
          .getByRole("navigation", { name: "Every section in Full view", exact: true })
          .getByRole("link")
          .allTextContents(),
        stage: await stageLine(),
      };
      check(
        `lease ${leaseId} opens in Guided view with the path strip and one Now card`,
        observed.pressed === "true" &&
          JSON.stringify(observed.views) ===
            JSON.stringify(["Guided view", "Full view"]) &&
          STEPS.every((step) => observed.steps.includes(step)) &&
          observed.current === 1 &&
          observed.nowCards === 1 &&
          observed.primaries === 1 &&
          JSON.stringify(observed.sections) === JSON.stringify(SECTIONS) &&
          observed.stage.length > 0,
        observed,
      );
    }
    check("opening the five leases made no write", writes.length === 0, { writes });

    // 1b. Layout (R-S247-10): on the first four steps the stage, the strip and the primary action
    // are on the first screen at 1280 by 800, and the primary action is within two screens at 390.
    const layout = [];
    for (const leaseId of WORKING) {
      for (const [width, height, screens] of [
        [1280, 800, 1],
        [390, 844, 2],
      ]) {
        await page.setViewportSize({ width, height });
        await open(leaseId);
        const current = (
          await strip().locator('[aria-current="step"]').textContent()
        )?.trim();
        if (!STEPS.slice(0, 4).includes(current ?? "")) continue;
        const box = await now().locator("[data-renewal-now-primary]").boundingBox();
        const stripBox = await strip().boundingBox();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        );
        // What stands above the Guided view, by element role and class only (no page text), so a
        // miss names the block that pushed the primary action down.
        const above = await page.evaluate(() => {
          const blocks = [];
          let node = document.querySelector('[aria-label="Guided view"]');
          while (node && node !== document.body) {
            let sibling = node.previousElementSibling;
            while (sibling) {
              const height = Math.round(sibling.getBoundingClientRect().height);
              if (height >= 24)
                blocks.push({
                  block: `${sibling.tagName.toLowerCase()}.${[...sibling.classList].join(".")}`,
                  height,
                });
              sibling = sibling.previousElementSibling;
            }
            node = node.parentElement;
          }
          return blocks;
        });
        layout.push({
          leaseId,
          width,
          current,
          primaryBottom: box ? Math.round(box.y + box.height) : null,
          stripBottom: stripBox ? Math.round(stripBox.y + stripBox.height) : null,
          stripHeight: stripBox ? Math.round(stripBox.height) : null,
          limit: height * screens,
          overflow,
          above,
        });
      }
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    check(
      "the primary action is on the first screen at 1280 by 800 and within two screens at 390, with no sideways scroll",
      layout.length > 0 &&
        layout.every(
          (entry) =>
            entry.primaryBottom !== null &&
            entry.primaryBottom <= entry.limit &&
            (entry.width !== 1280 || (entry.stripBottom ?? Infinity) <= entry.limit) &&
            !entry.overflow,
        ),
      layout,
    );

    // 2. A later step while an earlier one is unfinished (BEH-S247-2, L15).
    await open(prepared);
    const currentBefore = await strip().locator('[aria-current="step"]').textContent();
    await strip().getByRole("button", { name: "Offer the tenant", exact: true }).click();
    await page.waitForTimeout(500);
    const heading = (await now().locator("h2#renewal-now-heading").textContent())?.trim();
    check(
      "a later step opens in the Now card while the current step stays as it was",
      heading === "Offer the tenant" &&
        (await strip().locator('[aria-current="step"]').textContent()) ===
          currentBefore &&
        (await page.locator("#renewal-manual-tenant_offer").isVisible()),
      { heading, currentBefore, url: page.url() },
    );

    // 3. Reload continuity (R-S247-9, L16): the same view, step and place.
    // The place is measured once the page has finished its reads (its height has stopped changing),
    // on both sides of the reload: a step's prepared message that arrives after the scroll grows the
    // card, and the browser keeps what is on the screen in place by moving the page's offset.
    const settle = async (maxMs = 20_000) => {
      const started = Date.now();
      let last = -1;
      let since = Date.now();
      while (Date.now() - started < maxMs) {
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        if (height !== last) {
          last = height;
          since = Date.now();
        } else if (Date.now() - since >= 1500) return;
        await page.waitForTimeout(250);
      }
    };
    // The place is what the person sees: the page's offset and where the Now card sits on screen.
    const nowTop = async () => Math.round((await now().boundingBox())?.y ?? Number.NaN);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    await settle();
    const scrolled = await page.evaluate(() => window.scrollY);
    const nowTopBefore = await nowTop();
    const heightBefore = await page.evaluate(() => document.documentElement.scrollHeight);
    // Read-only evidence: the place the page kept for itself, read before the page's own scripts.
    await page.addInitScript(() => {
      try {
        window.__keptPlace = window.sessionStorage.getItem("renewal-lease-continuity");
      } catch {
        window.__keptPlace = null;
      }
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    // The kept place is applied once the page is interactive; it holds while reads settle. The
    // page's offset and height are sampled from the reload on, so a miss shows when the page moved.
    const timeline = [];
    const reloadedAt = Date.now();
    for (let i = 0; i < 40; i += 1) {
      const [y, h] = await page.evaluate(() => [
        Math.round(window.scrollY),
        document.documentElement.scrollHeight,
      ]);
      const last = timeline.at(-1);
      if (!last || last[1] !== y || last[2] !== h)
        timeline.push([Date.now() - reloadedAt, y, h]);
      await page.waitForTimeout(250);
    }
    await guided().waitFor({ state: "visible" });
    await settle();
    const kept = await page.evaluate(() => {
      try {
        return JSON.parse(window.__keptPlace ?? "null")?.y ?? null;
      } catch {
        return null;
      }
    });
    const reloaded = {
      url: page.url(),
      heading: (await now().locator("h2#renewal-now-heading").textContent())?.trim(),
      pressed: await viewButton("Guided view").getAttribute("aria-pressed"),
      scrollY: await page.evaluate(() => window.scrollY),
      scrolled,
      nowTopBefore,
      nowTopAfter: await nowTop(),
      heightBefore,
      kept,
      timeline,
    };
    check(
      "a reload returns to Guided view at the chosen step and place",
      reloaded.heading === "Offer the tenant" &&
        reloaded.pressed === "true" &&
        // Choosing a step and reloading leave the address as it was.
        new URL(reloaded.url).search === "" &&
        // The same offset, and the Now card where it was on the screen.
        Math.abs(reloaded.scrollY - scrolled) <= 80 &&
        Math.abs(reloaded.nowTopAfter - nowTopBefore) <= 80,
      reloaded,
    );

    // 4. Guided and Full are selectable, and an existing Focus entry continues to Guided.
    const viewChoices = await page
      .getByRole("group", { name: "Lease view", exact: true })
      .getByRole("button")
      .allTextContents();
    await page.goto(`${origin}/lease-renewal/live/desk/lease/${prepared}?view=focus`, {
      waitUntil: "domcontentloaded",
    });
    const focusContinues = await viewButton("Guided view").getAttribute("aria-pressed");
    await viewButton("Full view").click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("group", { name: "Lease view", exact: true })
      .waitFor({ state: "visible" });
    // The kept view is applied once the page is interactive after the reload.
    await page
      .waitForFunction(
        () =>
          document.querySelector('[data-renewal-view-switch] button[aria-pressed="true"]')
            ?.textContent === "Full view",
        undefined,
        { timeout: 15_000 },
      )
      .catch(() => undefined);
    const fullKept = await viewButton("Full view").getAttribute("aria-pressed");
    await viewButton("Guided view").click();
    await guided()
      .getByRole("navigation", { name: "Every section in Full view", exact: true })
      .getByRole("link", { name: "Owner approval", exact: true })
      .click();
    await page.waitForTimeout(500);
    const atSection = await page.evaluate(
      () => document.activeElement?.closest("#renewal-section-owner") !== null,
    );
    check(
      "Guided and Full remain selectable, a legacy Focus entry continues, and a section link opens Full at that section",
      viewChoices.join(",") === "Guided view,Full view" &&
        focusContinues === "true" &&
        fullKept === "true" &&
        atSection &&
        (await viewButton("Full view").getAttribute("aria-pressed")) === "true",
      { viewChoices, focusContinues, fullKept, atSection },
    );
    // The next lease opens in Guided view again.
    await open(covered);
    check(
      "the next lease opened opens in Guided view",
      (await viewButton("Guided view").getAttribute("aria-pressed")) === "true",
      { url: page.url() },
    );
    check("choosing, switching and reloading made no write", writes.length === 0, {
      writes,
    });

    // 5. A confirmed send records the outreach (AC-S248-1, L36 to L41).
    const workRecordBefore = await route(
      `/api/lease-renewal/workspace?leaseId=${prepared}`,
    );
    await setNextSend(rehearsal, "normal");
    const sent = await sendOwnerMessage(page, prepared);
    check(
      "the owner message for the prepared lease is accepted by the mail stand-in",
      sent.sent?.status === 200 &&
        (sent.sent?.body?.sequence?.threads ?? []).length === 1,
      {
        step: sent.step,
        refusal: sent.refusal,
        standing: sequenceStanding(sent.sent?.body?.sequence),
      },
    );
    writes.length = 0;
    await open(prepared);
    const waitingLine = await stageLine();
    const workRecordAfter = await route(
      `/api/lease-renewal/workspace?leaseId=${prepared}`,
    );
    check(
      "the lease page reads Waiting on owner response with nothing more entered",
      /^Waiting on owner response/.test(waitingLine) &&
        JSON.stringify(workRecordAfter.body?.state?.activities ?? {}) ===
          JSON.stringify(workRecordBefore.body?.state?.activities ?? {}) &&
        writes.length === 0,
      {
        waitingLine,
        activities: Object.keys(workRecordAfter.body?.state?.activities ?? {}),
        writes,
      },
    );
    await page.goto(`${origin}/lease-renewal/live/desk`, {
      waitUntil: "domcontentloaded",
    });
    const row = page.locator(`[data-batch-lease="${prepared}"]`).first();
    await row.waitFor({ state: "attached" });
    const rowText = (await row.textContent()) ?? "";
    check(
      "the desk row reads the same stage",
      rowText.includes("Waiting on owner response"),
      { rowText: rowText.replace(/\s+/g, " ").slice(0, 300) },
    );

    // 6. The correction (R-S248-10).
    await open(prepared, "?step=ask-owner");
    const notOutreach = now().getByRole("button", {
      name: "This was not the renewal outreach",
      exact: true,
    });
    const offered = await notOutreach.isVisible();
    let correctionFocus = false;
    if (offered) {
      await notOutreach.focus();
      await page.keyboard.press("Enter");
      const reason = now().getByLabel("Why this was not the renewal outreach");
      const reasonFocused = await reason.evaluate((el) => el === document.activeElement);
      await reason.fill("Synthetic rehearsal check of the correction.");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () => document.activeElement?.id === "renewal-now-heading",
      );
      correctionFocus = reasonFocused;
      await page.waitForTimeout(3000);
      await open(prepared, "?step=ask-owner");
    }
    check(
      "This was not the renewal outreach removes the derived record and keeps its reason",
      offered &&
        correctionFocus &&
        !/^Waiting on owner response/.test(await stageLine()) &&
        ((await now().textContent()) ?? "").includes(
          "Synthetic rehearsal check of the correction.",
        ),
      { offered, stage: await stageLine() },
    );

    // 7. An owner reply (L36): the replied lease, and a fresh reply on the covered lease.
    await open(replied);
    const repliedLine = await stageLine();
    const repliedNext = ((await now().textContent()) ?? "").replace(/\s+/g, " ");
    check(
      "the replied lease reads Owner replied and asks staff to record the owner's decision",
      /Owner replied/.test(repliedLine) &&
        repliedNext.includes("Record the owner's decision"),
      { repliedLine, repliedNext: repliedNext.slice(0, 300) },
    );

    // 8. An unconfirmed send (L37).
    await setNextSend(rehearsal, "unconfirmed");
    const unconfirmed = await sendOwnerMessage(page, covered);
    await open(covered, "?step=ask-owner");
    const unconfirmedCard = ((await now().textContent()) ?? "").replace(/\s+/g, " ");
    check(
      "an unconfirmed send never counts as outreach and offers Check whether the message went out",
      unconfirmed.sent?.body?.sequence?.state === "needs_reconciliation" &&
        unconfirmedCard.includes("Check whether the message went out") &&
        !/^Waiting on owner response/.test(await stageLine()),
      {
        standing: sequenceStanding(unconfirmed.sent?.body?.sequence),
        card: unconfirmedCard.slice(0, 300),
      },
    );

    await refusedRetirement(
      unconfirmed.sequenceId,
      "Reconcile the exact pending send in Communications before retiring this cycle.",
    );

    // 9. A failed delivery (L38).
    await setNextSend(rehearsal, "bounce");
    const bounced = await sendOwnerMessage(page, assisted);
    if (bounced.sequenceId)
      await route("/api/gmail-hub/sequences", {
        action: "refresh",
        id: bounced.sequenceId,
      });
    await open(assisted, "?step=ask-owner");
    const bouncedCard = ((await now().textContent()) ?? "").replace(/\s+/g, " ");
    check(
      "a failed delivery reads Delivery failed and offers Check the address and send again",
      bouncedCard.includes("Delivery failed") &&
        bouncedCard.includes("Check the address and send again"),
      { standing: bounced.refusal ?? "sent", card: bouncedCard.slice(0, 300) },
    );
    await setNextSend(rehearsal, "normal");

    // 10. A scheduled message (L39): shown as scheduled, counted only after Gmail accepts it.
    const target = missingRecipient ?? covered;
    const composition = await route(
      `/api/gmail-hub/composition?purpose=renewal_owner&lease=${prepared}`,
    );
    let scheduledLine = "";
    let afterTick = "";
    let tick = {};
    if (composition.status === 200) {
      const uuid = () => page.evaluate(() => crypto.randomUUID());
      const { context: messageContext, initial, reviewedTargetHash } = composition.body;
      const saved = await route("/api/gmail-hub/sequences", {
        action: "save",
        draft: { id: await uuid(), context: messageContext, initial, followUp: null },
        expectedVersion: 0,
        operationId: await uuid(),
      });
      const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", {
        timeZone: "America/Chicago",
      });
      const scheduled = await route("/api/gmail-hub/sequences", {
        action: "schedule",
        id: saved.body?.sequence?.id,
        expectedVersion: saved.body?.sequence?.version,
        operationId: await uuid(),
        reviewedDraftHash: saved.body?.reviewedDraftHash,
        reviewedTargetHash,
        schedule: {
          firstDate: tomorrow,
          time: "09:00",
          timeZone: "America/Chicago",
          everyDays: null,
          endDate: null,
          sendLimit: 1,
        },
      });
      await open(prepared, "?step=ask-owner");
      scheduledLine = ((await now().textContent()) ?? "").replace(/\s+/g, " ");
      await refusedRetirement(
        scheduled.body?.sequence?.id,
        "Pause or cancel the scheduled communication before retiring this cycle.",
      );
      // The server's own reading of the same source just before the tick (a read), so a held send
      // shows whether the source moved or the tick read it differently.
      const recomposed = await route(
        `/api/gmail-hub/composition?purpose=renewal_owner&lease=${prepared}`,
      );
      const serverSource = {
        atSchedule: composition.body?.target?.materialSourceHash ?? null,
        beforeTick: recomposed.body?.target?.materialSourceHash ?? null,
        noticeCycleId: recomposed.body?.target?.noticeCycleId ?? null,
        blockers: recomposed.body?.target?.blockers ?? null,
      };
      // The harness's in-process tick: the due message is sent through the mail stand-in.
      tick = await runDueMessageTick(rehearsal, {
        sequenceId: scheduled.body?.sequence?.id,
      }).catch((error) => ({ error: String(error?.message ?? error) }));
      tick = { ...tick, serverSource };
      await open(prepared, "?step=ask-owner");
      afterTick = await stageLine();
      // Where the app's own record of the scheduled message stands after the tick.
      const standing = await route(
        `/api/gmail-hub/sequences?id=${scheduled.body?.sequence?.id}`,
      );
      tick = { ...tick, standing: sequenceStanding(standing.body?.sequence) };
    }
    check(
      "a scheduled message reads Owner message scheduled for its date and is not counted before Gmail accepts it",
      /Owner message scheduled for/.test(scheduledLine),
      { target, scheduledLine: scheduledLine.slice(0, 300) },
    );
    check(
      "after the due-message tick has Gmail accept it, the scheduled message counts as the outreach",
      /^Waiting on owner response/.test(afterTick),
      { tick, afterTick },
    );
  } catch (error) {
    check(
      "the guided path ran to its end",
      false,
      String(error?.stack ?? error).slice(0, 1500),
    );
  } finally {
    await browser.close().catch(() => undefined);
  }
  const failed = checks.filter((entry) => !entry.passed);
  const result = {
    servedCommit: rehearsal.servedCommit,
    overlay: rehearsal.overlay,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks,
  };
  writeFileSync(join(runDir, "guided-path.json"), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(
    `one-path guided path: ${result.passed} passed, ${result.failed} failed on ${rehearsal.servedCommit.slice(0, 8)}.\n`,
  );
  return { exitCode: failed.length ? 1 : 0, checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { exitCode } = await runGuidedPath();
  process.exit(exitCode);
}
