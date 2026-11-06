// S250 / S251: the two variants keep one path, through the one-path rehearsal. Run it with
//
//   bash scripts/run-renewal-one-path-rehearsal.sh --overlay --driver tests/browser/one-path-variants-driver.mjs
//
// (drop --overlay to run a committed tree). As the local demo Editor it works the November 5 mix
// in a browser and checks, each by name and self-checking: the desk counts after the S251
// classification change (L03, L05) with the voucher lease's suggestion (L52); the covered lease's
// Ask the owner, path and Rent to recommend with the "Standing agreement" tag (L46); "Pricing
// basis" on the Now card with its scope choice saved on one action (L48); a typed rent that leaves
// the agreement, then the rule's result typed back (L47); the stage and next step on the desk row,
// the lease page and an assistant answer for both variants (L12, L13); the assisted order and its
// tag (L49); Keep the current rent and Propose a change (L50), with the assisted lease's comparison
// requests before and after (L33); a lease with the fact not set (L52); no value carried to another
// lease, a portfolio or a policy (L70); and, last, Do not renew moving the assisted lease to the
// non-renewal handoff (L51). The counts are read before L51 because Do not renew moves the lease.
//
// The comparison and mail stand-ins answer every provider call. The result goes to variants.json
// in the run directory. Synthetic data only; nothing leaves this machine.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
import { chromium } from "playwright-core";

import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import { requireLoopbackRehearsalOrigin } from "../../scripts/lib/help-rehearsal-origin.mjs";
import {
  readRehearsal,
  refusedConnections,
  standInState,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
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
const { prepared, covered, assisted } = rehearsal.roles;
const VOUCHER_LEASE = "9113";
const AGREEMENT = "Example Standing Agreement";
const RULE = "Raise the current rent by 3 percent";
const PROGRAM = "Example Housing Assistance Office";
const RULE_RENT = 1751;
const NOT_PART = "Not part of this lease's path";
const EXPECTED_COUNTS = {
  this_batch: 5,
  carried_over: 4,
  renewed_in_rentvine: 3,
  month_to_month_reviews: 3,
  non_renewals: 1,
  coming_up_later: 12,
  not_targets: 10,
};

const checks = [];
const check = (name, passed, observed) => {
  checks.push({ name, passed: Boolean(passed), observed });
  process.stdout.write(`${passed ? "ok  " : "FAIL"} ${name}\n`);
};
const leasePath = (leaseId, query = "") =>
  `/lease-renewal/live/desk/lease/${leaseId}${query}`;
const comparisonsFor = async (leaseId) =>
  (await standInState(rehearsal)).comparison.comparisonsByLease?.[String(leaseId)] ?? 0;
const squash = (text) => (text ?? "").replace(/\s+/g, " ").trim();

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
  await page.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
  assert.ok(
    await page.evaluate(
      `fetch("/api/auth/demo",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({role:"Editor"})}).then(r=>r.ok)`,
    ),
    "Local demo Editor sign-in failed.",
  );
  const route = (path, body) => routeFromPage(page, path, body);
  const guided = () => page.getByRole("region", { name: "Guided view", exact: true });
  const now = () => guided().getByRole("region", { name: "Now", exact: true });
  const strip = () =>
    guided().getByRole("navigation", { name: "Renewal path", exact: true });
  const open = async (leaseId, query = "") => {
    await page.goto(`${origin}${leasePath(leaseId, query)}`, {
      waitUntil: "domcontentloaded",
    });
    await guided().waitFor({ state: "visible" });
    await page.waitForTimeout(2000);
  };
  const stripSteps = async () =>
    (await strip().getByRole("button").allTextContents()).map(squash);
  const stepState = async (label) =>
    strip()
      .locator("li", { has: page.getByRole("button", { name: label, exact: true }) })
      .getAttribute("data-renewal-path-state");
  const current = async () =>
    squash(await strip().locator('[aria-current="step"]').textContent());
  const stageLine = async () =>
    squash(await guided().locator('[data-renewal-field="stage-line"]').textContent());
  const nextLine = async () =>
    squash(
      await guided().locator('[data-renewal-field="next-step"]').first().textContent(),
    );
  const chooseStep = async (label) => {
    await strip().getByRole("button", { name: label, exact: true }).click();
    await page.waitForTimeout(800);
  };
  const desk = async (query = "") => {
    await page.goto(`${origin}/lease-renewal/live/desk${query}`, {
      waitUntil: "domcontentloaded",
    });
    await page.locator("[data-batch-total]").waitFor({ state: "attached" });
    await page.waitForTimeout(1500);
  };
  const counts = () =>
    page.evaluate(() => {
      const found = {};
      for (const element of document.querySelectorAll(
        "[data-batch-group][data-batch-count]",
      )) {
        const group = element.getAttribute("data-batch-group");
        if (!(group in found))
          found[group] = Number(element.getAttribute("data-batch-count"));
      }
      const summary = document.querySelector(".renewal-batch-summary[data-batch-count]");
      if (summary) found.this_batch = Number(summary.getAttribute("data-batch-count"));
      const total = document.querySelector("[data-batch-total]");
      return { ...found, total: Number(total?.getAttribute("data-batch-total")) };
    });
  const openGroup = async (group) => {
    const button = page.locator(`button[data-batch-group="${group}"]`).first();
    if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
    await page.waitForTimeout(800);
  };
  const row = (leaseId) => page.locator(`li[data-batch-lease="${leaseId}"]`).first();
  const rowTags = async (leaseId) =>
    row(leaseId)
      .locator("[data-batch-tag]")
      .evaluateAll((items) => items.map((item) => item.getAttribute("data-batch-tag")));
  const rowStage = async (leaseId) =>
    squash(await row(leaseId).locator(".renewal-batch-stage").textContent());
  const rowNext = async (leaseId) =>
    squash(await row(leaseId).locator("[data-batch-next-step]").textContent());

  // 1. Counts after the S251 classification change, before anything moves a lease (L03, L05).
  const comparisonsAtStart = await comparisonsFor(assisted);
  await desk();
  const seen = await counts();
  check(
    "the desk reads This batch 5, Carried over 4, Renewed in RentVine 3, Month-to-month 3, Non-renewals 1, Coming up later 12, Not renewal targets 10, 38 in total",
    Object.entries(EXPECTED_COUNTS).every(([group, count]) => seen[group] === count) &&
      seen.total === 38,
    seen,
  );
  check(
    "the covered and the assisted leases carry their tags on the desk row (L46, L49)",
    (await rowTags(covered)).includes("standing_agreement") &&
      (await rowTags(assisted)).includes("housing_assistance"),
    { covered: await rowTags(covered), assisted: await rowTags(assisted) },
  );
  const deskRows = {};
  for (const leaseId of [covered, assisted])
    deskRows[leaseId] = { stage: await rowStage(leaseId), next: await rowNext(leaseId) };

  // L52: the voucher lease stays in Coming up later and shows the suggestion; nothing changes.
  await openGroup("coming_up_later");
  const voucherRow = row(VOUCHER_LEASE);
  const voucherWorking = await route(
    `/api/lease-renewal/working-record?leaseId=${VOUCHER_LEASE}`,
  );
  check(
    "the voucher lease stays in Coming up later with the suggestion, no tag and the fact not set (L52)",
    (await voucherRow.count()) === 1 &&
      squash(await voucherRow.locator("[data-batch-suggestion]").textContent()) ===
        "RentVine mentions housing assistance. Set the field?" &&
      (await rowTags(VOUCHER_LEASE)).length === 0 &&
      !voucherWorking.body?.record?.fields?.housing_assistance,
    {
      rows: await voucherRow.count(),
      fact: voucherWorking.body?.record?.fields?.housing_assistance ?? null,
    },
  );
  // R-S251-11: the additive tag key narrows the batch; the plain batch still reads as before.
  await desk("?tag=housing_assistance");
  const narrowed = await page
    .locator("li[data-batch-lease]")
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-batch-lease")));
  check(
    "the batch narrows to the Housing assistance tag with ?tag=housing_assistance",
    narrowed.length >= 1 && narrowed.every((id) => id === String(assisted)),
    { narrowed },
  );

  // 2. L46 on the covered lease.
  await open(covered, "?step=ask-owner");
  const coveredLine = `Covered by ${AGREEMENT}: no owner message needed`;
  const askOwnerDetail = squash(await now().textContent());
  check(
    "Ask the owner reads Covered by the agreement and the path continues at Offer the tenant (L46)",
    askOwnerDetail.includes(coveredLine) &&
      (await stepState("Ask the owner")) === "covered" &&
      (await current()) === "Offer the tenant",
    { current: await current(), askOwner: await stepState("Ask the owner") },
  );
  await chooseStep("Compare market rent");
  const rentField = page.locator("#renewal-now-rent-to-recommend");
  const rentBasis = squash(
    await page
      .locator('.renewal-now-rent [data-renewal-field="rent-basis"]')
      .textContent(),
  );
  check(
    "Rent to recommend is the rule applied to the current rent, with its basis shown (L46)",
    Number(await rentField.inputValue()) === RULE_RENT &&
      rentBasis.includes(AGREEMENT) &&
      rentBasis.includes("$1,700.00"),
    { value: await rentField.inputValue(), basis: rentBasis },
  );

  // 3. L48: Pricing basis on the Now card, as the Editor; nothing preselected; one save.
  const basis = now().locator("#renewal-now-pricing-basis");
  const options = (
    await basis.locator("fieldset").first().locator("label").allTextContents()
  ).map(squash);
  const preselected = await basis.locator("input:checked").count();
  await basis.getByLabel(`${AGREEMENT}: ${RULE}`, { exact: true }).check();
  const scopes = (
    await basis.locator("fieldset").nth(1).locator("label").allTextContents()
  ).map(squash);
  const scopePreselected = await basis
    .locator("fieldset")
    .nth(1)
    .locator("input:checked")
    .count();
  await basis.getByLabel("This lease only", { exact: true }).check();
  const saves = [];
  const onSave = (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/pricing-policy")
    )
      saves.push(request.postData());
  };
  page.on("request", onSave);
  await basis.getByRole("button", { name: "Save pricing basis", exact: true }).click();
  await page.waitForTimeout(2500);
  page.off("request", onSave);
  const afterBasis = await route(`/api/lease-renewal/pricing-policy?leaseId=${covered}`);
  check(
    'Pricing basis lists "Owner decides each renewal" and the agreement by name and rule, asks the scope and saves on one action (L48)',
    JSON.stringify(options) ===
      JSON.stringify(["Owner decides each renewal", `${AGREEMENT}: ${RULE}`]) &&
      preselected === 0 &&
      JSON.stringify(scopes) ===
        JSON.stringify(["This lease only", "Every lease in this owner's portfolio"]) &&
      scopePreselected === 0 &&
      saves.length === 1 &&
      afterBasis.body?.leaseAssignment?.standing?.kind === "agreement" &&
      afterBasis.body?.authority?.covered === true,
    { options, preselected, scopes, scopePreselected, saves: saves.length },
  );
  // L70 for an agreement application: the rule only, on no other portfolio or lease.
  const preparedPricing = await route(
    `/api/lease-renewal/pricing-policy?leaseId=${prepared}`,
  );
  const allAgreements = await route("/api/lease-renewal/pricing-policy?standing=all");
  check(
    "applying the agreement carries its rule only and reaches no other lease or portfolio (L70)",
    preparedPricing.body?.authority?.covered !== true &&
      !preparedPricing.body?.standingAgreement &&
      (allAgreements.body?.standingAgreements ?? []).length === 1 &&
      !("rent" in (allAgreements.body?.standingAgreements?.[0] ?? {})) &&
      afterBasis.body?.leaseAssignment?.policyId == null,
    {
      preparedCovered: preparedPricing.body?.authority?.covered ?? null,
      agreements: (allAgreements.body?.standingAgreements ?? []).length,
    },
  );

  // 4. L47: a different typed rent keeps the typed rent and returns the lease to Ask the owner.
  await open(covered, "?step=compare-market");
  await page.locator("#renewal-now-rent-to-recommend").fill("1800");
  await page.locator("#renewal-now-rent-to-recommend").blur();
  await page.waitForTimeout(3000);
  await open(covered, "?step=ask-owner");
  const leftText = squash(await page.locator("body").textContent());
  check(
    "a different typed rent is kept and the lease returns to Ask the owner with the reason in words (L47)",
    (await current()) === "Ask the owner" &&
      leftText.includes("The working rent $1,800.00 differs from $1,751"),
    { current: await current() },
  );
  // L70 for a typed rent: it becomes no agreement, policy or other lease's value.
  const others = await Promise.all(
    [prepared, assisted].map((leaseId) =>
      route(`/api/lease-renewal/working-record?leaseId=${leaseId}`),
    ),
  );
  const policies = await route("/api/lease-renewal/pricing-policy");
  check(
    "the typed rent is suggested on no other lease, portfolio or policy (L70)",
    others.every((answer) => answer.body?.record?.fields?.terms_rent?.value !== 1800) &&
      !JSON.stringify(policies.body?.policies ?? []).includes("1800"),
    { policies: (policies.body?.policies ?? []).length },
  );
  // Restore the covered state by typing the rule's result (clearing would be a staff choice).
  await open(covered, "?step=compare-market");
  await page.locator("#renewal-now-rent-to-recommend").fill(String(RULE_RENT));
  await page.locator("#renewal-now-rent-to-recommend").blur();
  await page.waitForTimeout(3000);
  await open(covered);
  check(
    "typing the rule's result back covers the lease again",
    (await current()) === "Offer the tenant",
    { current: await current() },
  );

  // 5. L12 / L13 for both variants: Guided view, the variant in the strip, one Now card, and the
  // same stage and next step on the desk row, the lease page and an assistant answer.
  for (const leaseId of [covered, assisted]) {
    await open(leaseId);
    const steps = await stripSteps();
    const page13 = { stage: await stageLine(), next: await nextLine() };
    const answer = await route("/api/assistant/query", {
      question: `What is the stage of lease ${leaseId}?`,
    });
    const answerText = JSON.stringify(answer.body ?? {});
    check(
      `lease ${leaseId} opens in Guided view with its variant in the path strip and one Now card (L12)`,
      steps[0] === "Check the numbers" &&
        steps.at(-1) === "Complete" &&
        (await guided().getByRole("region", { name: "Now", exact: true }).count()) ===
          1 &&
        (await guided().locator("[data-renewal-now-primary]").count()) === 1 &&
        (leaseId === assisted
          ? steps.includes(`Contact ${PROGRAM} about the renewal process`)
          : (await stepState("Ask the owner")) === "covered"),
      { steps },
    );
    check(
      `lease ${leaseId}: the stage and next step read the same on the desk row, the lease page and an assistant answer (L13)`,
      deskRows[leaseId].stage === page13.stage &&
        page13.next.endsWith(deskRows[leaseId].next) &&
        answer.status === 200 &&
        answerText.includes(page13.stage),
      { desk: deskRows[leaseId], page: page13, assistant: answerText.slice(0, 400) },
    );
  }

  // 6. L49: the assisted order, with nothing preselected.
  await open(assisted);
  const assistedSteps = await stripSteps();
  const after = assistedSteps.slice(assistedSteps.indexOf("Check the numbers") + 1, 4);
  await chooseStep("Ask the owner whether to renew this tenant");
  const answerRegion = page.locator("#renewal-assisted-renewal-answer");
  const answerOptions = (
    await answerRegion.locator("fieldset label").allTextContents()
  ).map(squash);
  await chooseStep("Rent for this renewal");
  const rentRegion = page.locator("#renewal-assisted-rent-choice");
  const rentOptions = (await rentRegion.locator("fieldset label").allTextContents()).map(
    squash,
  );
  check(
    "the assisted lease's steps after Check the numbers are the program contact, the renewing question and the rent, none preselected (L49)",
    JSON.stringify(after) ===
      JSON.stringify([
        `Contact ${PROGRAM} about the renewal process`,
        "Ask the owner whether to renew this tenant",
        "Rent for this renewal",
      ]) &&
      JSON.stringify(answerOptions) ===
        JSON.stringify(["Renew", "Do not renew", "No answer yet"]) &&
      JSON.stringify(rentOptions) ===
        JSON.stringify(["Keep the current rent", "Propose a change"]) &&
      (await answerRegion.locator("input:checked").count()) === 0 &&
      (await rentRegion.locator("input:checked").count()) === 0,
    { after, answerOptions, rentOptions },
  );

  // 7. L50 with L33: Keep, then Propose; the comparison requests before and after Propose.
  await rentRegion.getByLabel("Keep the current rent", { exact: true }).check();
  await rentRegion
    .getByRole("button", { name: "Record the rent choice", exact: true })
    .click();
  await page.waitForTimeout(3000);
  await open(assisted);
  const keepStates = {
    compare: await stepState("Compare market rent"),
    ask: await stepState("Ask the owner"),
  };
  const beforePropose = await comparisonsFor(assisted);
  await chooseStep("Rent for this renewal");
  await page
    .locator("#renewal-assisted-rent-choice")
    .getByLabel("Propose a change", { exact: true })
    .check();
  await page
    .locator("#renewal-assisted-rent-choice")
    .getByRole("button", { name: "Record the rent choice", exact: true })
    .click();
  await page.waitForTimeout(3000);
  await open(assisted);
  const proposeStates = {
    compare: await stepState("Compare market rent"),
    ask: await stepState("Ask the owner"),
  };
  check(
    `Keep the current rent shows the comparison and the owner's rent decision as "${NOT_PART}", and Propose a change brings them in (L50)`,
    keepStates.compare === "not_part" &&
      keepStates.ask === "not_part" &&
      proposeStates.compare !== "not_part" &&
      proposeStates.ask !== "not_part",
    { keepStates, proposeStates },
  );
  await desk();
  await page.waitForTimeout(4000);
  const afterPropose = await comparisonsFor(assisted);
  check(
    "the batch requested no comparison for the assisted lease until Propose a change was chosen (L33)",
    comparisonsAtStart === 0 && beforePropose === 0,
    { comparisonsAtStart, beforePropose, afterPropose },
  );

  // 8. L52: a lease with Housing assistance not set shows no housing assistance step.
  await open(prepared);
  const preparedSteps = await stripSteps();
  check(
    "a lease with Housing assistance not set shows no housing assistance step (L52)",
    !preparedSteps.some((step) =>
      /housing|program|renew this tenant|Rent for this renewal/i.test(step),
    ),
    { preparedSteps },
  );

  // 9. L51, last: Do not renew moves the assisted lease to the existing non-renewal handoff.
  await open(assisted);
  await chooseStep("Ask the owner whether to renew this tenant");
  const region = page.locator("#renewal-assisted-renewal-answer");
  await region.getByLabel("Do not renew", { exact: true }).check();
  await region
    .getByRole("button", { name: "Record the owner’s answer", exact: true })
    .click();
  await page.waitForTimeout(3000);
  await open(assisted);
  const handoffStage = await current();
  await desk();
  await openGroup("non_renewals");
  check(
    "recording Do not renew moves the assisted lease to the non-renewal handoff (L51)",
    handoffStage === "Non-renewal handoff" && (await row(assisted).count()) === 1,
    { current: handoffStage, inNonRenewals: await row(assisted).count() },
  );

  // L58: no connection was refused by the boundary during the run.
  const refused = await refusedConnections(rehearsal);
  check("no connection was refused during the run (L58)", refused.length === 0, {
    refused: refused.slice(0, 5),
  });
} catch (error) {
  check(
    "the variants driver ran to its end",
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
writeFileSync(join(runDir, "variants.json"), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(
  `one-path variants: ${result.passed} passed, ${result.failed} failed on ${rehearsal.servedCommit.slice(0, 8)}.\n`,
);
process.exit(failed.length ? 1 : 0);
