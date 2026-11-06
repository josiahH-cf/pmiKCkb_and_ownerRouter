// S254 R-S254-4: proof that the rehearsal's stand-ins and control hooks work through the served
// app. Run it with
//
//   bash scripts/run-renewal-one-path-rehearsal.sh --driver tests/browser/one-path-stand-in-proof-driver.mjs
//
// As the local demo Editor it asks the app for a comparison (answered by the comparison stand-in,
// counted by lease), marks the monthly allowance reached and asks again (refused, nothing
// requested), asks for an email rewording twice (accepted, then refused when the model copies the
// instruction), asks the assistant a question, makes one lease's RentVine status unreadable, and
// sends owner messages through the mail stand-in: accepted, unconfirmed and then checked, and
// returned as a failed delivery. Every address is an example.invalid address and nothing leaves
// this machine. The result is written to stand-in-proof.json in the run directory and printed.
//
// A commit without the rehearsal's mail adapter refuses sends in the Demo environment; the mail
// checks then report that, and the driver exits 1.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import { requireLoopbackRehearsalOrigin } from "../../scripts/lib/help-rehearsal-origin.mjs";
import {
  readRehearsal,
  refusedConnections,
  resetComparisonLog,
  setComparisonAllowance,
  setNextSend,
  setRewording,
  setStatusUnreadable,
  standInState,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import {
  forceSourceRefresh,
  routeFromPage,
  sendOwnerMessage,
  sequenceStanding,
} from "../../scripts/lib/one-path-rehearsal/seeds.mjs";

const origin = requireLoopbackRehearsalOrigin(process.env.ONE_PATH_REHEARSAL_ORIGIN);
const runDir = process.env.ONE_PATH_REHEARSAL_RUN_DIR;
assert.ok(runDir, "Run through scripts/run-renewal-one-path-rehearsal.sh.");
const rehearsal = readRehearsal(runDir);
const { prepared, covered, assisted, replied } = rehearsal.roles;
const EDITOR = "local-demo-editor@pmikcmetro.com";

const checks = [];
const check = (name, passed, observed) => {
  checks.push({ name, passed: Boolean(passed), observed });
  process.stdout.write(`${passed ? "ok  " : "FAIL"} ${name}\n`);
};
const mailbox = async () =>
  (await standInState(rehearsal)).mail.mailboxes.find(
    (box) => box.mailbox === EDITOR,
  ) ?? {
    messages: [],
    drafts: [],
  };
// What the app read on a message's thread: "human" for a person's reply, "bounce" for a failed
// delivery. A one-time message is complete once sent, so its incoming mail is kept as evidence.
const inboundKinds = (sequence) => (sequence?.inbound ?? []).map((entry) => entry.kind);

/**
 * S252: this driver's named, self-checking steps. The journey driver
 * (tests/browser/one-path-journey-driver.mjs) imports and runs this function in its own order;
 * run alone, the file runs it once and exits with its result. Resolves with { exitCode, checks }.
 */
export async function runStandInProof() {
  const browser = await chromium.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      timezoneId: "America/Chicago",
    });
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort("blockedbyclient"),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(240_000);
    page.setDefaultNavigationTimeout(240_000);
    await page.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
    assert.ok(
      await page.evaluate(
        `fetch("/api/auth/demo",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({role:"Editor"})}).then(r=>r.ok)`,
      ),
      "Local demo Editor sign-in failed.",
    );
    const route = (path, body) => routeFromPage(page, path, body);

    // Comparison stand-in (L33) and the allowance control (L34).
    await resetComparisonLog(rehearsal);
    const comparison = await route("/api/lease-renewal/market-comps", {
      operation: "comps",
      leaseId: String(prepared),
    });
    let byLease = (await standInState(rehearsal)).comparison.comparisonsByLease;
    check(
      "a comparison for the prepared lease is answered by the stand-in, once",
      comparison.status === 200 &&
        (comparison.body?.compCount ?? 0) >= 3 &&
        byLease[String(prepared)] === 1,
      {
        status: comparison.status,
        compCount: comparison.body?.compCount,
        reason: comparison.body?.reason,
        byLease,
      },
    );
    await route("/api/lease-renewal/market-comps", {
      operation: "comps",
      leaseId: String(prepared),
    });
    byLease = (await standInState(rehearsal)).comparison.comparisonsByLease;
    check(
      "asking again for the same lease requests no second comparison",
      byLease[String(prepared)] === 1,
      { byLease },
    );
    const reached = await setComparisonAllowance(rehearsal, true);
    const refused = await route("/api/lease-renewal/market-comps", {
      operation: "comps",
      leaseId: String(covered),
    });
    byLease = (await standInState(rehearsal)).comparison.comparisonsByLease;
    check(
      "with the monthly allowance reached, the app refuses and requests nothing",
      refused.body?.reason === "out_of_allowance" &&
        byLease[String(covered)] === undefined,
      { reached, status: refused.status, reason: refused.body?.reason, byLease },
    );
    await setComparisonAllowance(rehearsal, false);

    // Model stand-in: rewording accepted, then refused when it copies the instruction (L44).
    const draft = {
      surface: "renewal_message",
      leaseId: String(prepared),
      channel: "owner",
      currentBody:
        "Hello,\n\nThis is an example renewal message for the owner.\n\nThank you,\nExample Staff",
      instruction: "Make the tone a little warmer for the owner.",
    };
    const accepted = await route("/api/email-refinement", draft);
    check(
      "an email rewording returns a revision the app accepts",
      accepted.body?.status === "revised" && accepted.body?.body !== draft.currentBody,
      {
        status: accepted.status,
        result: accepted.body?.status,
        reason: accepted.body?.reason,
      },
    );
    await setRewording(rehearsal, "echo", true);
    const echoed = await route("/api/email-refinement", draft);
    check(
      "a rewording that copies the instruction is refused and says what to change",
      echoed.body?.status === "refused" &&
        /copied your instruction/.test(echoed.body?.reason),
      { status: echoed.status, result: echoed.body?.status, reason: echoed.body?.reason },
    );

    // The assistant answers (L10, L13): the model returns an empty plan and the app's own
    // interpreter answers.
    const before = (await standInState(rehearsal)).model.requests.length;
    const answer = await route("/api/assistant/query", {
      question: "Which lease renewals are due next month?",
    });
    const asked = (await standInState(rehearsal)).model.requests.slice(before);
    check(
      "the assistant answers a question about next month's renewals",
      answer.status === 200 &&
        asked.some((request) => request.kind === "plan") &&
        Boolean(answer.body?.kind) &&
        JSON.stringify(answer.body?.summary ?? "").length > 2,
      {
        status: answer.status,
        modelRequests: asked.map((request) => request.kind),
        kind: answer.body?.kind,
        interpretedBy: answer.body?.interpretedBy,
        summary: JSON.stringify(answer.body?.summary ?? null).slice(0, 300),
        groups: Array.isArray(answer.body?.groups) ? answer.body.groups.length : null,
      },
    );

    // One lease's RentVine status made unreadable (L09). The control changes what RentVine answers;
    // the app shows it after a fresh read, which "Refresh data" asks for.
    const unreadable =
      /[^.\n]*(?:no RentVine status|RentVine status unavailable)[^.\n]*\.?/i;
    const shownOn = async (path) => {
      await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      return page.evaluate(
        `document.body.innerText + "\\n" + [...document.querySelectorAll("[title]")].map((el) => el.getAttribute("title")).join("\\n")`,
      );
    };
    setStatusUnreadable(rehearsal, prepared, "missing");
    const reread = await forceSourceRefresh(page);
    const onDesk =
      unreadable.exec(await shownOn("/lease-renewal/live/desk"))?.[0] ?? null;
    const onLease =
      unreadable.exec(await shownOn(`/lease-renewal/live/desk/lease/${prepared}`))?.[0] ??
      null;
    check(
      "a lease whose RentVine status is unreadable still opens and says so",
      Boolean(reread.body?.refreshed) && (onDesk !== null || onLease !== null),
      { refreshed: reread.body, onDesk, onLease },
    );
    setStatusUnreadable(rehearsal, prepared, "clear");
    const restored = await forceSourceRefresh(page);
    check(
      "clearing the control and reading again shows the status once more",
      Boolean(restored.body?.refreshed) &&
        !unreadable.test(await shownOn("/lease-renewal/live/desk")),
      { refreshed: restored.body },
    );

    // Mail stand-in. The replied lease was sent and answered while the rehearsal was seeded.
    const seed = rehearsal.seeds.find((entry) => entry.name === "replied-owner-message");
    let box = await mailbox();
    check(
      "the replied lease's owner message was accepted and an owner reply delivered (L25, L36)",
      seed?.state === "seeded" &&
        box.messages.some((message) => message.labelIds.includes("SENT")) &&
        box.messages.some((message) => message.labelIds.includes("INBOX")),
      { seed, kept: box.messages.map((message) => [message.labelIds, message.subject]) },
    );
    if (seed?.sequenceId) {
      const sequence = await route(`/api/gmail-hub/sequences?id=${seed.sequenceId}`);
      check(
        "the app's own record of that message holds the reply it read, as a person's reply",
        sequence.status === 200 &&
          inboundKinds(sequence.body?.sequence).includes("human"),
        {
          status: sequence.status,
          standing: sequenceStanding(sequence.body?.sequence),
          inbound: inboundKinds(sequence.body?.sequence),
        },
      );
    }

    // L37: the next send is unconfirmed; the app holds it for a check, and the check finds it.
    await setNextSend(rehearsal, "unconfirmed");
    const unconfirmed = await sendOwnerMessage(page, covered);
    check(
      "an unconfirmed send leaves the message waiting for a check",
      unconfirmed.sent?.body?.sequence?.state === "needs_reconciliation",
      {
        step: unconfirmed.step,
        status: unconfirmed.sent?.status,
        standing: sequenceStanding(unconfirmed.sent?.body?.sequence),
        refusal: unconfirmed.refusal,
      },
    );
    if (unconfirmed.sequenceId) {
      const reconciled = await route("/api/gmail-hub/sequences", {
        action: "reconcile",
        id: unconfirmed.sequenceId,
      });
      check(
        "checking whether it went out finds the message the stand-in kept",
        reconciled.status === 200 &&
          reconciled.body?.sequence?.state !== "needs_reconciliation" &&
          (reconciled.body?.sequence?.threads ?? []).length === 1,
        {
          status: reconciled.status,
          standing: sequenceStanding(reconciled.body?.sequence),
        },
      );
    }

    // L38: the next send comes back as a failed delivery.
    await setNextSend(rehearsal, "bounce");
    const bounced = await sendOwnerMessage(page, assisted);
    let afterBounce = null;
    if (bounced.sequenceId) {
      const observed = await route("/api/gmail-hub/sequences", {
        action: "refresh",
        id: bounced.sequenceId,
      });
      afterBounce = observed.body?.sequence ?? null;
    }
    check(
      "a failed delivery is read as a bounce",
      inboundKinds(afterBounce).includes("bounce"),
      {
        step: bounced.step,
        refusal: bounced.refusal,
        standing: sequenceStanding(afterBounce),
        inbound: inboundKinds(afterBounce),
      },
    );

    box = await mailbox();
    const leaked = (await standInState(rehearsal)).mail.mailboxes
      .flatMap((entry) => entry.messages)
      .flatMap((message) => [message.to, message.cc])
      .join(" ")
      .match(/[^\s<>,;"]+@[^\s<>,;"]+/g)
      ?.filter(
        (address) => !/@example\.invalid$/i.test(address) && !/^local-demo/.test(address),
      );
    check("every kept message went to an example.invalid address", !leaked?.length, {
      kept: box.messages.length,
      replied,
    });
    const refusedHosts = [
      ...new Set(
        refusedConnections(rehearsal).map((entry) => entry.host ?? entry.refused),
      ),
    ];
    // Mail and comparison requests were answered by the stand-ins, so the provider boundary had
    // none of them to refuse; anything else it refused is listed.
    check(
      "no mail or comparison request reached the provider boundary's refusal",
      !refusedHosts.some((host) =>
        /gmail\.googleapis\.com|api\.rentcast\.io/.test(String(host)),
      ),
      { refusedHosts },
    );
  } catch (error) {
    check(
      "the proof ran to its end",
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
  writeFileSync(
    join(runDir, "stand-in-proof.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(
    `one-path stand-in proof: ${result.passed} passed, ${result.failed} failed on ${rehearsal.servedCommit.slice(0, 8)}.\n`,
  );
  return { exitCode: failed.length ? 1 : 0, checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { exitCode } = await runStandInProof();
  process.exit(exitCode);
}
