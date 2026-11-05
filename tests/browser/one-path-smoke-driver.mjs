// S254 R-S254-3: the one-path rehearsal's smoke driver, and the model for a journey driver. Run it
// through scripts/run-renewal-one-path-rehearsal.sh (it is the default driver). It signs in as the
// local demo Editor, opens Renewals with no action and counts the rows of the default list, with
// one counting rule that reads the same on the starting commit and on the candidate:
//
//   a row is a lease named by a row marker on an element the page is showing (an element with a
//   layout box, so a row inside a closed group is not counted); where a page shows no marked row,
//   a row is a lease that a link the page is showing opens.
//
// ROW_MARKERS names the markers. The worklist table marks each row with data-lease-id on the
// starting commit and on main. EXTENSION POINT: S246's working batch marks its rows on its lane
// with data-batch-lease; confirm that name when S246 merges, and add any other row marker here.
//
// It asserts only what holds on any commit: the desk lists leases, and every listed lease is one
// of the "November 5 mix". What each commit lists is the measurement, written to smoke.json in the
// run directory and printed. Synthetic data only; the page can reach nothing but the rehearsal.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import { requireLoopbackRehearsalOrigin } from "../../scripts/lib/help-rehearsal-origin.mjs";
import { readRehearsal } from "../../scripts/lib/one-path-rehearsal/control.mjs";

const origin = requireLoopbackRehearsalOrigin(process.env.ONE_PATH_REHEARSAL_ORIGIN);
const runDir = process.env.ONE_PATH_REHEARSAL_RUN_DIR;
assert.ok(runDir, "Run through scripts/run-renewal-one-path-rehearsal.sh.");
const rehearsal = readRehearsal(runDir);
const ROW_MARKERS = ["data-lease-id", "data-batch-lease"];
const ROW = ROW_MARKERS.map((marker) => `[${marker}]`).join(", ");
const LEASE_LINK = "a[href*='/lease-renewal/live/desk/lease/']";

// Evaluated in the page as plain source text.
const COUNT = `(() => {
  const markers = ${JSON.stringify(ROW_MARKERS)};
  const unique = (values) => [...new Set(values.filter(Boolean))];
  const shown = (el) => el.getClientRects().length > 0;
  const byMarker = {};
  for (const marker of markers)
    byMarker[marker] = unique(
      [...document.querySelectorAll("[" + marker + "]")]
        .filter(shown)
        .map((el) => el.getAttribute(marker)),
    );
  const linked = unique(
    [...document.querySelectorAll("a[href]")]
      .filter(shown)
      .map(
        (a) => /\\/lease-renewal\\/live\\/desk\\/lease\\/(\\d+)/.exec(a.getAttribute("href") ?? "")?.[1],
      ),
  );
  return {
    byMarker,
    rows: unique(Object.values(byMarker).flat()),
    linked,
    counted: /Matching:\\s*\\d+[^\\n]*/.exec(document.body.innerText)?.[0] ?? null,
    headings: [...document.querySelectorAll("h1, h2")]
      .filter(shown)
      .map((heading) => heading.textContent.trim())
      .filter(Boolean)
      .slice(0, 10),
  };
})()`;

const browser = await chromium.launch({
  executablePath: resolveBrowserExecutable(),
  headless: true,
});
let exitCode = 1;
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
  const signedIn = await page.evaluate(
    `fetch("/api/auth/demo",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({role:"Editor"})}).then(r=>r.ok)`,
  );
  assert.ok(signedIn, "Local demo Editor sign-in failed.");

  // Renewals with no action: the bare route, as staff open it.
  await page.goto(`${origin}/lease-renewal`, { waitUntil: "domcontentloaded" });
  try {
    await page.locator(`${ROW}, ${LEASE_LINK}`).first().waitFor({ state: "attached" });
  } catch (error) {
    writeFileSync(
      join(runDir, "smoke-failure.txt"),
      `${page.url()}\n${(await page.locator("body").innerText()).slice(0, 4000)}\n`,
    );
    await page
      .screenshot({ path: join(runDir, "smoke-failure.png") })
      .catch(() => undefined);
    throw error;
  }
  // The list fills in as its reads finish; count once two looks a moment apart agree.
  let counted = await page.evaluate(COUNT);
  for (let look = 0; look < 40; look += 1) {
    await page.waitForTimeout(1500);
    const next = await page.evaluate(COUNT);
    const settled =
      next.rows.length === counted.rows.length &&
      next.linked.length === counted.linked.length;
    counted = next;
    if (settled && look >= 1) break;
  }

  const rule = counted.rows.length
    ? ROW_MARKERS.filter((marker) => counted.byMarker[marker].length).join(" and ")
    : "lease links";
  const listed = (counted.rows.length ? counted.rows : counted.linked).map(Number);
  const groupOf = (leaseId) =>
    Object.entries(rehearsal.groups).find(([, ids]) => ids.includes(leaseId))?.[0] ??
    null;
  const byGroup = {};
  for (const leaseId of listed) {
    const group = groupOf(leaseId) ?? "not_in_the_mix";
    byGroup[group] = (byGroup[group] ?? 0) + 1;
  }
  const everyLease = Object.values(rehearsal.groups).flat();
  const result = {
    servedCommit: rehearsal.servedCommit,
    overlay: rehearsal.overlay,
    businessDate: rehearsal.businessDate,
    workingMonth: rehearsal.workingMonth,
    url: page.url().replace(origin, ""),
    countingRule: rule,
    rowsByMarker: Object.fromEntries(
      ROW_MARKERS.map((marker) => [marker, counted.byMarker[marker].length]),
    ),
    defaultRows: listed.length,
    byGroup,
    closedLeasesListed: byGroup.closed ?? 0,
    notListed: everyLease.filter((leaseId) => !listed.includes(leaseId)).sort(),
    pageCount: counted.counted,
    headings: counted.headings,
    seeds: rehearsal.seeds.map((seed) => `${seed.name}: ${seed.state}`),
  };
  writeFileSync(join(runDir, "smoke.json"), `${JSON.stringify(result, null, 2)}\n`);
  // What the page said, for whoever reads the count later. Synthetic values only.
  writeFileSync(
    join(runDir, "smoke-desk.txt"),
    `${page.url().replace(origin, "")}\n${await page.locator("body").innerText()}\n`,
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  assert.ok(listed.length > 0, "The default Renewals list shows no lease.");
  assert.equal(
    byGroup.not_in_the_mix ?? 0,
    0,
    "The default list shows a lease that is not in the November 5 mix.",
  );
  process.stdout.write(
    `one-path smoke: ${listed.length} default row(s) on ${rehearsal.servedCommit.slice(0, 8)} (${rule}); ${result.closedLeasesListed} closed lease(s) listed.\n`,
  );
  exitCode = 0;
} catch (error) {
  process.stderr.write(`${String(error?.stack ?? error)}\n`);
} finally {
  await browser.close().catch(() => undefined);
}
process.exit(exitCode);
