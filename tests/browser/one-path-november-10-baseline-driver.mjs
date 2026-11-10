// S271 R-S271-1. Read-only rendered baseline for the November 10 contract on the S254 loopback
// rehearsal. Each probe records what the served build shows before implementation; the expected
// fail-first or preservation reading is in docs/evidence/renewal-walkthrough-baseline-2026-11-10.md.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { Socket } from "node:net";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import { requireLoopbackRehearsalOrigin } from "../../scripts/lib/help-rehearsal-origin.mjs";
import { readRehearsal } from "../../scripts/lib/one-path-rehearsal/control.mjs";

assert.equal(globalThis.fetch.name, "guardedFetch");
assert.equal(Socket.prototype.connect.name, "guardedConnect");
const origin = requireLoopbackRehearsalOrigin(process.env.ONE_PATH_REHEARSAL_ORIGIN);
const runDir = process.env.ONE_PATH_REHEARSAL_RUN_DIR;
const rehearsal = readRehearsal(runDir);
assert.equal(rehearsal.servedCommit, rehearsal.servedVersion);

const results = [];
const attempted = [];
const desk = "/lease-renewal/live/desk";
const lease = (role, search = "") => desk + "/lease/" + rehearsal.roles[role] + search;

async function signedIn(browser, role) {
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 1280, height: 800 },
    timezoneId: "America/Chicago",
  });
  const page = await context.newPage();
  await page.goto(origin + "/sign-in");
  assert.ok(
    await page.evaluate(
      (body) =>
        fetch("/api/auth/demo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        }).then((response) => response.ok),
      JSON.stringify({ role }),
    ),
  );
  // Reading the baseline never writes: every request off the origin and every non-read is refused.
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort("blockedbyclient");
    if (["GET", "HEAD", "OPTIONS"].includes(request.method())) return route.continue();
    attempted.push(role + " " + request.method() + " " + url.pathname);
    return route.abort("blockedbyclient");
  });
  return { context, page };
}

async function settle(page, href) {
  await page.goto(origin + href, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
}

async function openOutcome(page, role, step) {
  await settle(page, lease(role, "?step=" + step));
  await page
    .getByRole("region", { name: "Current renewal stage" })
    .waitFor({ timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
}

const text = (page, value) => page.getByText(value, { exact: false }).count();
const probe = (id, check, observed, expectation) =>
  results.push({ id, check, observed, expectation });

const browser = await chromium.launch({
  executablePath: resolveBrowserExecutable(),
  headless: true,
});
try {
  const { page } = await signedIn(browser, "Editor");

  // N10-01 / S261: Check the numbers and the owner step on the prepared (one pet) lease.
  await openOutcome(page, "prepared", "check-numbers");
  probe(
    "N10-01",
    "Check the numbers names the S270 Verify lease numbers group",
    await text(page, "Verify lease numbers"),
    "fail-first: 0 before S270",
  );
  probe(
    "N10-01",
    "Current base rent label present on the lease",
    await text(page, "Current base rent"),
    "preservation: the S153 label renders",
  );
  await openOutcome(page, "prepared", "ask-owner");
  const ownerOutcome = page.locator('[data-renewal-outcome="ask-owner"]');
  probe(
    "N10-01",
    "Edit rent to recommend link in Ask the owner",
    await ownerOutcome.getByRole("link", { name: "Edit rent to recommend" }).count(),
    "fail-first: 0 before S261/S269",
  );

  // N10-02 / S262: the replied lease's owner response.
  await openOutcome(page, "replied", "ask-owner");
  probe(
    "N10-02",
    "Amount approved field in the owner response",
    await page.getByLabel("Amount approved").count(),
    "fail-first: 0 before S262",
  );
  probe(
    "N10-02",
    "Continue to Offer the tenant after a saved response",
    await page.getByRole("link", { name: "Continue to Offer the tenant" }).count(),
    "observed baseline",
  );

  // N10-03 / S263: date suggestion and return target.
  await openOutcome(page, "prepared", "ask-owner");
  probe(
    "N10-03",
    "Use the day after the current lease ends choice",
    await page
      .getByRole("button", { name: "Use the day after the current lease ends" })
      .count(),
    "fail-first: 0 before S263",
  );
  await openOutcome(page, "prepared", "offer-tenant");
  probe(
    "N10-03",
    "Return to tenant offer route",
    await text(page, "Return to tenant offer"),
    "fail-first: 0 before S263",
  );

  // N10-04 / S264: the tenant offer's charge review.
  probe(
    "N10-04",
    "Review offer charges in Offer the tenant",
    await text(page, "Review offer charges"),
    "fail-first: 0 before S264",
  );
  probe(
    "N10-04",
    "Optional charge picker rendered in Offer the tenant",
    await page.locator('[data-renewal-outcome="offer-tenant"] details').count(),
    "observed baseline: buried optional picker",
  );

  // N10-07 / N10-08 / S269 / S270: Guided entry on the current step.
  await settle(page, lease("prepared"));
  await page
    .getByRole("region", { name: "Current renewal stage" })
    .waitFor({ timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  probe(
    "N10-08",
    "Secondary Work groups open on Guided entry",
    await page.locator("details[data-renewal-secondary-work][open]").count(),
    "fail-first: above 0 before S270 (groups open by default in Guided)",
  );
  probe(
    "N10-08",
    "Secondary Work groups on Guided entry",
    await page.locator("details[data-renewal-secondary-work]").count(),
    "observed baseline",
  );
  // The S260 Work status entry is the summary of the header disclosure, not a button role.
  probe(
    "N10-07",
    "Shared Work status entries",
    await page.locator('summary[aria-label="Work status"]').count(),
    "preservation: 1",
  );
  probe(
    "N10-07",
    "Full view toggle",
    await page.getByRole("button", { name: "Full view", exact: true }).count(),
    "preservation: 1",
  );

  // N10-09 / S266: ordinary unrecorded assistance stays Not set.
  await openOutcome(page, "prepared", "check-numbers");
  probe(
    "N10-09",
    "Housing assistance present on Check the numbers",
    await text(page, "Housing assistance"),
    "preservation: the S251 field renders",
  );

  // N10-10 / S268: the documents outcome.
  await openOutcome(page, "prepared", "documents");
  probe(
    "N10-10",
    "Source pending handoff in Documents and signatures",
    await text(page, "Source pending"),
    "fail-first: 0 before S268",
  );
  probe(
    "N10-10",
    "Verify forms and signing evidence group",
    await text(page, "Verify forms and signing evidence"),
    "fail-first: 0 before S270",
  );

  // Admin surfaces for S264 and S265.
  const admin = await signedIn(browser, "Admin");
  await settle(admin.page, "/admin#admin-renewal-packet-policy");
  await admin.page.waitForTimeout(2_000);
  probe(
    "N10-04",
    "Admin Offer charge mappings section",
    await text(admin.page, "Offer charge mappings"),
    "fail-first: 0 before S264",
  );
  await settle(admin.page, "/connections");
  await admin.page.waitForTimeout(2_000);
  const tenantResources = admin.page.locator(
    [
      "#renewal-resource-entry-insurance_flyer",
      "#renewal-resource-entry-rbp_flyer",
      "#renewal-resource-entry-renewal_information_form",
    ].join(", "),
  );
  probe(
    "N10-05",
    "All resource location entries on Connections",
    await admin.page.locator('form[id^="renewal-resource-entry-"]').count(),
    "observed baseline: tenant resources plus legal-form locations",
  );
  probe(
    "N10-05",
    "The three tenant resource entries",
    await tenantResources.count(),
    "preservation: 3",
  );
  probe(
    "N10-05",
    "Tenant audience evidence on the tenant resource entries",
    await tenantResources.getByText(/audience/i).count(),
    "fail-first: 0 before S265",
  );
  assert.deepEqual(attempted, [], "Reading the baseline attempted a mutation");
} finally {
  await browser.close();
  const result = {
    source: rehearsal.servedVersion,
    fixture: "November 5 mix",
    purpose: "S271 R-S271-1 baseline probes only",
    results,
    attempted,
    human: "NOT RUN",
  };
  writeFileSync(
    join(runDir, "november-10-baseline.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  process.stdout.write(JSON.stringify(result) + "\n");
}
