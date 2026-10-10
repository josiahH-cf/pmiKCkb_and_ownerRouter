// Compiled maintenance creation/recovery, assessment and PMI closeout over the owning emulator store.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFileSync, writeFileSync, mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import { createLocalZoomContext } from "./local-zoom.mjs";
assert.match(process.cwd(), /^\/tmp\/pmi-kc-operations-browser-[^/]+\/worktree$/);
assert.equal(process.env.FIREBASE_PROJECT_ID, "pmi-kc-kb-operations-browser-test");
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
const output = process.env.OPERATIONS_BROWSER_OUTPUT;
assert.ok(output?.startsWith("/home/josiah/.local/state/pmi-kc-operations-20261009/"));
mkdirSync(output, { recursive: true, mode: 0o700 });
const fixture = "@/tests/browser/operations-maintenance-fixture";
for (const path of [
  "app/api/maintenance/tickets/route.ts",
  "app/api/maintenance/tickets/[ticketId]/route.ts",
  "app/api/maintenance/tickets/[ticketId]/activity/route.ts",
  "app/api/maintenance/tickets/[ticketId]/history/route.ts",
  "app/api/maintenance/tickets/[ticketId]/artifacts/route.ts",
  "app/api/maintenance/tickets/[ticketId]/vendor-work/route.ts",
  "app/api/maintenance/tickets/[ticketId]/operations/cancel/route.ts",
  "app/api/maintenance/vendors/route.ts",
  "app/api/maintenance/reports/route.ts",
  "app/api/maintenance/operating-policies/route.ts",
  "app/api/maintenance/tickets/[ticketId]/review-context/route.ts",
  "app/api/staff/business-profile/route.ts",
  "app/api/admin/application-presentation/route.ts",
]) {
  let source = readFileSync(path, "utf8");
  source = source
    .replaceAll('from "@/lib/auth/session"', `from "${fixture}"`)
    .replaceAll('from "@/lib/maintenance/assignees"', `from "${fixture}"`);
  writeFileSync(path, source);
}
for (const path of [
  "app/api/vendor/tickets/[ticketId]/work/route.ts",
  "app/api/vendor/tickets/[ticketId]/artifacts/route.ts",
]) {
  let source = readFileSync(path, "utf8");
  writeFileSync(path, source.replaceAll('from "@/lib/vendor/auth"', `from "${fixture}"`));
}
let settingsSource = readFileSync("lib/firestore/presentation-settings.ts", "utf8");
assert.ok(
  settingsSource.includes("return await getAuth(getFirebaseAdminApp()).getUser(uid)"),
);
writeFileSync(
  "lib/firestore/presentation-settings.ts",
  settingsSource.replace(
    "return await getAuth(getFirebaseAdminApp()).getUser(uid)",
    `return await (await import("${fixture}")).verifyExistingStaff(uid)`,
  ),
);
writeFileSync(
  "app/admin/presentation/page.tsx",
  `export {PresentationSurfaceFixture as default} from "${fixture}";`,
);
writeFileSync(
  "app/maintenance/policies/page.tsx",
  `export {PolicySurfaceFixture as default} from "${fixture}";`,
);
let caseSource = readFileSync("lib/firestore/maintenance-case-records.ts", "utf8");
writeFileSync(
  "lib/firestore/maintenance-case-records.ts",
  caseSource.replaceAll('from "@/lib/maintenance/case-source"', `from "${fixture}"`),
);
writeFileSync(
  "app/vendor/tickets/[ticketId]/page.tsx",
  `export {VendorSurfaceFixture as default} from "${fixture}";`,
);
writeFileSync(
  "app/maintenance/vendors/page.tsx",
  `export {RosterSurfaceFixture as default} from "${fixture}";`,
);
let source = readFileSync("lib/maintenance/verified-ticket-property.ts", "utf8");
writeFileSync(
  "lib/maintenance/verified-ticket-property.ts",
  source.replaceAll('from "@/lib/maintenance/live-unit-source"', `from "${fixture}"`),
);
writeFileSync(
  "app/maintenance/page.tsx",
  `export {SurfaceFixture as default} from "${fixture}";`,
);
writeFileSync(
  "app/api/maintenance/units/search/route.ts",
  `export {unitsGET as GET} from "${fixture}";`,
);
mkdirSync("app/api/operations-verification-only", { recursive: true });
writeFileSync(
  "app/api/operations-verification-only/route.ts",
  `export {controlPOST as POST} from "${fixture}";`,
);
writeFileSync(
  "app/maintenance/history/page.tsx",
  `export {ReportSurfaceFixture as default} from "${fixture}";`,
);
let loseReportSave = true,
  loseCreation = true,
  loseEdit = true,
  loseCoreFile = true,
  loseVendorReport = true,
  loseVendorFile = true,
  losePolicySave = true,
  loseProfileSave = true,
  loseDisplaySave = true,
  loseUrgencyReview = true;
const configPath = join(process.cwd(), "next.config.ts");
const sourceConfig = readFileSync(configPath, "utf8");
assert.ok(sourceConfig.includes("const nextConfig: NextConfig = {"));
writeFileSync(
  configPath,
  sourceConfig.replace(
    "const nextConfig: NextConfig = {",
    "const nextConfig: NextConfig = { experimental: { cpus: 2 },",
  ),
);
const port = await new Promise((resolve) => {
  const socket = createServer();
  socket.listen(0, "127.0.0.1", () => {
    const p = socket.address().port;
    socket.close(() => resolve(p));
  });
});
const origin = `http://localhost:${port}`,
  log = createWriteStream(join(output, "server.log")),
  built = await new Promise((resolve, reject) => {
    const build = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
      env: {
        ...process.env,
        NEXT_E2E_ISOLATED_BUILD: "true",
        NEXT_TELEMETRY_DISABLED: "1",
        OPERATIONS_BROWSER_FIXTURE: "true",
        ENVIRONMENT_KIND: "production",
        DATA_CONTEXT: "live",
        LOCAL_DEMO_AUTH: "false",
        ASK_DEMO_MODE: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    build.stdout.pipe(log, { end: false });
    build.stderr.pipe(log, { end: false });
    build.once("error", reject);
    build.once("exit", (code) =>
      code === 0
        ? resolve(true)
        : reject(
            new Error(`Compiled fixture build failed (${code}); inspect server.log`),
          ),
    );
  }),
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
    {
      env: {
        ...process.env,
        NEXT_E2E_ISOLATED_BUILD: "true",
        NEXT_TELEMETRY_DISABLED: "1",
        OPERATIONS_BROWSER_FIXTURE: "true",
        ENVIRONMENT_KIND: "production",
        DATA_CONTEXT: "live",
        LOCAL_DEMO_AUTH: "false",
        ASK_DEMO_MODE: "false",
      },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser, zoom;
const errors = [],
  requests = [],
  checks = [];
async function ready() {
  for (let n = 0; n < 120; n++) {
    if (server.exitCode !== null) throw new Error("Local Next exited");
    try {
      const r = await fetch(origin, { signal: AbortSignal.timeout(10000) });
      await r.text();
      if (r.ok) return;
      if (r.status >= 500)
        throw new Error(`Fixture returned ${r.status}; inspect server.log`);
    } catch (e) {
      if (e.message.startsWith("Fixture returned")) throw e;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Local fixture did not start");
}
async function control(body) {
  const r = await fetch(`${origin}/api/operations-verification-only`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(r.status, 200);
  return r.json();
}
async function configure(context) {
  await context.route("**/*", async (route) => {
    const request = route.request(),
      u = new URL(request.url());
    if (u.origin !== origin) return route.abort("blockedbyclient");
    if (!u.pathname.startsWith("/api/")) return route.continue();
    requests.push({ path: u.pathname, method: request.method() });
    if (
      u.pathname.startsWith("/api/maintenance/tickets") ||
      u.pathname === "/api/maintenance/units/search" ||
      u.pathname === "/api/maintenance/vendors" ||
      u.pathname === "/api/maintenance/reports" ||
      u.pathname === "/api/maintenance/operating-policies" ||
      u.pathname === "/api/staff/business-profile" ||
      u.pathname === "/api/admin/application-presentation" ||
      u.pathname.startsWith("/api/vendor/tickets/")
    ) {
      if (
        request.method() === "POST" &&
        ((u.pathname === "/api/maintenance/operating-policies" && losePolicySave) ||
          (u.pathname === "/api/staff/business-profile" && loseProfileSave) ||
          (u.pathname === "/api/admin/application-presentation" && loseDisplaySave))
      ) {
        if (u.pathname === "/api/maintenance/operating-policies") losePolicySave = false;
        if (u.pathname === "/api/staff/business-profile") loseProfileSave = false;
        if (u.pathname === "/api/admin/application-presentation") loseDisplaySave = false;
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        return route.abort("failed");
      }
      if (
        request.method() === "POST" &&
        u.pathname === "/api/maintenance/reports" &&
        loseReportSave
      ) {
        loseReportSave = false;
        const committed = await route.fetch();
        assert.ok(committed.ok());
        return route.abort("failed");
      }
      if (
        request.method() === "POST" &&
        u.pathname === "/api/maintenance/tickets" &&
        loseCreation
      ) {
        loseCreation = false;
        const committed = await route.fetch();
        assert.ok(committed.ok());
        return route.abort("failed");
      }
      if (request.method() === "POST" && u.pathname.endsWith("/artifacts")) {
        const body = request.postDataJSON();
        if (
          u.pathname.startsWith("/api/maintenance/") &&
          body.action === "upload" &&
          loseCoreFile
        ) {
          loseCoreFile = false;
          await route.fetch();
          return route.abort("failed");
        }
        if (u.pathname.startsWith("/api/vendor/") && loseVendorFile) {
          loseVendorFile = false;
          await route.fetch();
          return route.abort("failed");
        }
      }
      if (
        request.method() === "POST" &&
        u.pathname.startsWith("/api/vendor/") &&
        u.pathname.endsWith("/work") &&
        loseVendorReport
      ) {
        loseVendorReport = false;
        const committed = await route.fetch();
        assert.ok(committed.ok());
        return route.abort("failed");
      }
      if (
        request.method() === "PATCH" &&
        request.postDataJSON().op === "urgency_review" &&
        loseUrgencyReview
      ) {
        loseUrgencyReview = false;
        const committed = await route.fetch();
        assert.ok(committed.ok());
        return route.abort("failed");
      }
      if (request.method() === "PATCH" && loseEdit) {
        loseEdit = false;
        const committed = await route.fetch();
        assert.ok(committed.ok());
        return route.abort("failed");
      }
      return route.continue();
    }
    return route.abort("blockedbyclient");
  });
  context.on("page", (page) => page.on("pageerror", (e) => errors.push(e.message)));
}
async function layout(page, name) {
  assert.ok(
    await page.locator("body").evaluate((el) => el.scrollWidth <= innerWidth + 2),
    `${name}: page overflow`,
  );
  if (name.includes("200")) await zoom.screenshot(page, join(output, `${name}.png`));
  else await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
  checks.push(name);
}
async function verifyPresentation(context) {
  const settingsPage = await context.newPage();
  await settingsPage.goto(`${origin}/admin/presentation`);
  const profileSection = settingsPage.getByRole("region", {
    name: "Staff business profile",
  });
  await profileSection
    .getByRole("button", { name: "Save business profile", exact: true })
    .waitFor();
  await profileSection
    .getByLabel("name", { exact: true })
    .fill("Fixture staff business name");
  await profileSection
    .getByLabel("businessTitle", { exact: true })
    .fill("Property Manager");
  await profileSection
    .getByLabel("source", { exact: true })
    .fill("private-fixture:staff-reviewed-contact");
  await profileSection
    .getByLabel("Change reason", { exact: true })
    .fill("Reviewed existing staff business details");
  await profileSection
    .getByRole("button", { name: "Save business profile", exact: true })
    .click();
  await settingsPage.waitForFunction(() =>
    Array.from(document.querySelectorAll("button")).some(
      (button) =>
        button.textContent?.trim() === "Check original save" &&
        !button.matches(":disabled"),
    ),
  );
  await settingsPage.reload();
  await settingsPage.waitForFunction(() =>
    Array.from(document.querySelectorAll("input")).some(
      (input) =>
        input.getAttribute("aria-label") === "name" &&
        input.value === "Fixture staff business name",
    ),
  );
  assert.equal(
    requests.filter(
      (r) => r.path === "/api/staff/business-profile" && r.method === "POST",
    ).length,
    1,
  );
  const displaySection = settingsPage.getByRole("region", {
    name: "Application display name",
  });
  const chosenName =
    "Fixture Operations Communications and Maintenance Workspace with a Long Staff Display Name";
  await displaySection.getByLabel("Display name", { exact: true }).fill(chosenName);
  await displaySection
    .getByLabel("Change reason", { exact: true })
    .fill("Reviewed fixture application presentation");
  await displaySection
    .getByRole("button", { name: "Save display name", exact: true })
    .click();
  await settingsPage.waitForFunction(() =>
    Array.from(document.querySelectorAll("button")).some(
      (button) =>
        button.textContent?.trim() === "Check original save" &&
        !button.matches(":disabled"),
    ),
  );
  await settingsPage.reload();
  await settingsPage.waitForFunction(
    (name) =>
      Array.from(document.querySelectorAll("input")).some(
        (input) => input.value === name,
      ),
    chosenName,
  );
  await settingsPage.waitForFunction((name) => document.title.includes(name), chosenName);
  await settingsPage.getByText(chosenName, { exact: true }).first().waitFor();
  assert.ok((await settingsPage.title()).includes(chosenName));
  assert.equal(
    requests.filter(
      (r) => r.path === "/api/admin/application-presentation" && r.method === "POST",
    ).length,
    1,
  );
  await layout(settingsPage, "settings-wide");
  await settingsPage.setViewportSize({ width: 320, height: 900 });
  await layout(settingsPage, "settings-320");
  checks.push(
    "compiled existing staff profile and public display name recover original saves; optional contacts remain blank and a long current name reaches title/header without changing identity or roles",
  );
}

try {
  await ready();
  for (const path of [
    "/maintenance",
    "/api/maintenance/units/search?q=local",
    "/api/maintenance/tickets?creation_id=10f3de4b-2f2c-470a-8bd4-524ddbd075ab",
    "/api/maintenance/tickets/fixture-missing",
  ]) {
    const warm = await fetch(origin + path);
    await warm.text();
    assert.equal(warm.status, 200);
  }
  browser = await chromium.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await configure(context);
  if (process.env.OPERATIONS_BROWSER_SCENARIO === "presentation") {
    await verifyPresentation(context);
    const result = await control({});
    assert.deepEqual(errors, []);
    assert.equal(result.counts.action_executions, 0);
    assert.equal(result.counts.workflow_communication_sequences, 0);
    writeFileSync(
      join(output, "result.json"),
      JSON.stringify(
        {
          result: "passed",
          checks,
          requests,
          errors,
          counts: result.counts,
          scope:
            "Production-compiled profile/display-name HTTP and owning emulator stores with synthetic auth; no other maintenance journey, live effect or human observation.",
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        result: "passed",
        scenario: "presentation",
        output,
        checks: checks.length,
      }),
    );
  } else {
    const page = await context.newPage();
    await page.goto(`${origin}/maintenance`);
    await page.locator(".appearance-trigger[data-ready=true]").waitFor();
    await page.getByLabel("Assigned to me").check();
    const words =
      "Local fixture tap continues dripping after troubleshooting. Keep these reported words.";
    await page.getByRole("textbox", { name: "Issue", exact: true }).fill(words);
    await page.getByLabel("Unit / location", { exact: false }).fill("local");
    await page
      .getByRole("button", { name: "Local 801 Fixture Lane", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Review reported issue", exact: true })
      .click();
    await page.getByRole("button", { name: "Create ticket", exact: true }).click();
    await page.getByRole("button", { name: "Check creation result" }).waitFor();
    assert.equal(
      await page.getByRole("textbox", { name: "Issue", exact: true }).inputValue(),
      words,
    );
    assert.ok(new URL(page.url()).searchParams.get("creation_id"));
    assert.equal((await control({})).counts.maintenance_tickets, 1);
    assert.equal(
      requests.filter((r) => r.path === "/api/maintenance/tickets" && r.method === "POST")
        .length,
      1,
    );
    await control({ failed: true });
    await page.reload();
    await page.getByRole("link", { name: /Open created ticket:/ }).waitFor();
    assert.equal(
      await page.getByRole("textbox", { name: "Issue", exact: true }).inputValue(),
      words,
    );
    const ticketId = new URL(page.url()).searchParams.get("ticket_id");
    assert.ok(ticketId);
    assert.equal((await control({})).counts.maintenance_ticket_activity, 1);
    checks.push(
      "lost creation response followed by reload and a source outage recovers exactly one app ticket/activity and the owned capture words; no replacement POST",
    );
    await page.getByLabel("Assigned to me").check();
    await page.getByRole("button", { name: "Reveal created ticket" }).click();
    let card = page.locator(`#maintenance-ticket-${ticketId}`);
    await card.getByRole("heading", { name: "Assess issue", exact: true }).waitFor();
    assert.equal(await page.getByLabel("Assigned to me").isChecked(), true);
    assert.equal(await card.locator('a[href*="maintenance_owner_notice"]').count(), 0);
    checks.push(
      "shared queue reveals the confirmed ticket under unchanged filters and starts at assessment without a forced owner message",
    );
    await control({ failed: false });
    const stale = await context.newPage();
    await stale.goto(`${origin}/maintenance?ticket_id=${ticketId}`);
    await stale.locator(".appearance-trigger[data-ready=true]").waitFor();
    const staleCard = stale.locator(`#maintenance-ticket-${ticketId}`);
    await staleCard
      .getByLabel("Issue assessment and proposed work")
      .fill("Second tab words remain after its conflict");
    await card.getByLabel("Assessment outcome").selectOption("resolved_troubleshooting");
    await card
      .getByLabel("Issue assessment and proposed work")
      .fill("Fixture valve adjusted. PMI troubleshooting evidence retained.");
    await card
      .getByLabel("Retained assessment evidence references (one per line)")
      .fill("staff-note:browser-fixture-observation");
    await card.getByRole("button", { name: "Save assessment", exact: true }).click();
    await page.getByRole("button", { name: "Check original edit" }).waitFor();
    assert.equal(
      await card.getByLabel("Issue assessment and proposed work").inputValue(),
      "Fixture valve adjusted. PMI troubleshooting evidence retained.",
    );
    assert.equal(
      await card.getByRole("button", { name: "Save assessment" }).isDisabled(),
      true,
    );
    await staleCard.getByRole("button", { name: "Save assessment" }).click();
    await stale
      .getByRole("button", { name: "Read current ticket after conflict" })
      .waitFor();
    assert.equal(
      await staleCard.getByLabel("Issue assessment and proposed work").inputValue(),
      "Second tab words remain after its conflict",
    );
    assert.equal(
      await staleCard.getByRole("button", { name: "Save assessment" }).isDisabled(),
      true,
    );
    await stale
      .getByRole("button", { name: "Read current ticket after conflict" })
      .click();
    await stale.getByText(/Current ticket read/).waitFor();
    assert.equal(
      await staleCard.getByLabel("Issue assessment and proposed work").inputValue(),
      "Second tab words remain after its conflict",
    );
    await stale.close();
    await page.reload();
    await page.locator(".appearance-trigger[data-ready=true]").waitFor();
    card = page.locator(`#maintenance-ticket-${ticketId}`);
    await card
      .getByRole("heading", {
        name: "Resolved by troubleshooting — PMI closeout",
        exact: true,
      })
      .waitFor();
    await page.getByText(/Original app edit committed at ticket version 2/).waitFor();
    assert.equal((await control({})).counts.maintenance_ticket_operations, 1);
    checks.push(
      "lost assessment response reconciles by original operation after reload; a stale tab cannot overwrite it and keeps its words while reading the changed ticket",
    );
    await card.getByLabel("Next case stage").selectOption("closed");
    await card
      .getByLabel("Reason for the stage change")
      .fill("PMI accepted the retained troubleshooting evidence");
    await card.getByRole("button", { name: "Apply case stage" }).click();
    await card
      .getByRole("button", { name: "Reopen for assessment", exact: true })
      .waitFor();
    let result = await control({});
    assert.equal(result.tickets[0].status, "Closed");
    assert.equal(result.tickets[0].record_version, 3);
    assert.equal(result.counts.maintenance_ticket_activity, 3);
    assert.equal(result.counts.action_executions, 0);
    assert.equal(result.counts.workflow_communication_sequences, 0);
    await card
      .getByLabel("Reason for the stage change")
      .fill("Fixture issue recurred; PMI reopens it deliberately");
    await card
      .getByRole("button", { name: "Reopen for assessment", exact: true })
      .click();
    await card.getByRole("heading", { name: "Assess issue", exact: true }).waitFor();
    result = await control({});
    assert.equal(result.tickets[0].record_version, 4);
    assert.equal(result.counts.maintenance_tickets, 1);
    checks.push(
      "PMI closes with retained evidence and explicitly reopens the same case, with attributable activity and no provider/send/payment effects",
    );

    await control({ action: "seedVendor", ticketId });
    await page.reload();
    await page.locator(".appearance-trigger[data-ready=true]").waitFor();
    card = page.locator(`#maintenance-ticket-${ticketId}`);
    const facts = card.locator(".maintenance-case-facts"),
      vendorWork = card.locator(".maintenance-vendor-work");
    await facts.locator(":scope > summary").click();
    await facts
      .getByText("Correct property, unit or event-date lease", { exact: true })
      .click();
    await facts.getByLabel("Work association").selectOption("lease");
    await facts.getByLabel("Actual property ID", { exact: true }).fill("901");
    await facts.getByLabel("Actual unit ID", { exact: true }).fill("801");
    await facts.getByLabel("Actual event-date lease ID", { exact: true }).fill("701");
    await facts.getByLabel("Work event date", { exact: true }).fill("2026-10-08");
    await facts
      .getByLabel("Retained identity and tenancy evidence reference")
      .fill("private-evidence:browser-reviewed-agreement");
    await facts
      .getByLabel("Correction reason", { exact: true })
      .fill("Staff reviewed the fixture tenancy applicable to this event date");
    await facts.getByRole("button", { name: "Save association", exact: true }).click();
    await facts.getByText(/Event-date applicability recorded by staff/).waitFor();
    assert.equal((await control({})).tickets[0].maintenance_association.leaseId, "701");
    checks.push(
      "compiled case correction stores the actual event-date identity once and distinguishes staff tenancy review from current-occupancy evidence",
    );
    await facts.getByText("Retain an approved core file", { exact: true }).click();
    await facts.getByLabel("Actual PDF or work image", { exact: true }).setInputFiles({
      name: "reviewed-core.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nReviewed core evidence fixture\n%%EOF"),
    });
    await facts.getByLabel(/I approve indefinite retention/).check();
    await facts.getByRole("button", { name: "Retain exact file", exact: true }).click();
    await facts
      .getByRole("button", { name: "Check original retained file", exact: true })
      .waitFor();
    await facts
      .getByRole("button", { name: "Check original retained file", exact: true })
      .click();
    await facts
      .getByText("Original retained file verified; no duplicate upload was created.", {
        exact: true,
      })
      .waitFor();
    assert.equal((await control({})).counts.maintenance_retained_artifacts, 1);
    await facts.locator(":scope > summary").click();
    await facts
      .getByRole("link", { name: "Download exact retained file", exact: true })
      .waitFor();
    checks.push(
      "compiled core upload loses its response after immutable storage, then reconciles the exact hash/identity without another copy",
    );
    await facts
      .getByText("Record or correct financial evidence", { exact: true })
      .click();
    await facts.getByLabel("Amount allocated to this case (USD)").fill("110.00");
    await facts
      .getByLabel("Actual vendor identity (when applicable)")
      .selectOption("browser-vendor");
    await facts
      .getByLabel("Original invoice, credit or quote ID")
      .fill("INV-BROWSER-ONE");
    await facts
      .getByLabel("Retained source evidence reference", { exact: true })
      .fill("private-evidence:browser-original-invoice");
    await facts.getByLabel("Original complete source total (USD)").fill("110.00");
    await facts.getByLabel("Service date", { exact: true }).fill("2026-10-08");
    await facts.getByLabel("Invoice date (if known)").fill("2026-10-09");
    await facts
      .getByLabel("Line 1 description", { exact: true })
      .fill("Fixture labor and tax");
    await facts.getByLabel("Line 1 amount (USD)", { exact: true }).fill("110.00");
    await facts
      .getByLabel("Review or correction reason")
      .fill("PMI recorded original reported invoice evidence");
    await facts
      .getByRole("button", { name: "Save financial evidence", exact: true })
      .click();
    await facts
      .getByText("Vendor invoice allocation: $110.00", { exact: false })
      .waitFor();
    assert.equal((await control({})).counts.maintenance_financial_entries, 1);
    assert.ok((await facts.innerText()).includes("Provider-verified payment"));
    checks.push(
      "compiled financial entry preserves invoice meaning and distinct unknown payment totals instead of claiming paid or posting accounting",
    );
    const rosterPage = await context.newPage();
    await rosterPage.goto(`${origin}/maintenance/vendors`);
    await rosterPage.locator(".appearance-trigger[data-ready=true]").waitFor();
    await rosterPage.getByLabel("Actual vendor account").selectOption("browser-vendor");
    await rosterPage
      .getByLabel("Contact and preference evidence reference")
      .fill("private-evidence:browser-vendor-approved-contact");
    await rosterPage
      .getByLabel("Change reason", { exact: true })
      .fill("Reviewed primary fixture vendor");
    await rosterPage.getByLabel("Service categories (one per line)").fill("Plumbing");
    await rosterPage
      .getByRole("combobox", { name: /^Preference/ })
      .selectOption("primary");
    await rosterPage.getByLabel("Availability").selectOption("available");
    await rosterPage.getByLabel(/I verified this actual contact/).check();
    await rosterPage
      .getByRole("button", { name: "Save vendor preferences", exact: true })
      .click();
    await rosterPage.getByText(/Vendor preferences saved at version 1/).waitFor();
    await rosterPage.close();
    await page.reload();
    await page.locator(".appearance-trigger[data-ready=true]").waitFor();
    await vendorWork.locator(":scope > summary").click();
    await vendorWork
      .getByLabel("Suitable verified vendor")
      .selectOption("browser-vendor");
    await vendorWork
      .getByLabel("Suitability or alternative-selection reason")
      .fill("Deliberate verified primary for fixture plumbing");
    await vendorWork
      .getByRole("button", { name: "Select reviewed vendor", exact: true })
      .click();
    await vendorWork.getByText(/selection version 1/).waitFor();
    await vendorWork
      .getByText("Prepare or correct reviewed work packet", { exact: true })
      .click();
    await vendorWork
      .getByLabel("Actual issue", { exact: true })
      .fill("Reviewed fixture leak");
    await vendorWork.getByLabel("Verified work location").fill("Local 801 Fixture Lane");
    await vendorWork
      .getByLabel("Applicable access details (blank if not established)")
      .fill("Ask PMI to coordinate actual access before entering");
    await vendorWork
      .getByLabel("Actual scope and limits")
      .fill("Inspect the fixture. Request actual work authorization before paid work.");
    await vendorWork
      .getByLabel("Packet change reason")
      .fill("PMI reviewed exact vendor-visible facts");
    await vendorWork.getByLabel(/reviewed-core.pdf/).check();
    await vendorWork.getByLabel(/I reviewed these exact facts/).check();
    await vendorWork
      .getByRole("button", { name: "Save reviewed vendor packet", exact: true })
      .click();
    await vendorWork.getByText("Current reviewed work", { exact: true }).waitFor();
    checks.push(
      "compiled roster/primary selection and reviewed minimized packet save separately from assignment, external delivery and spending authority",
    );
    const vp = await context.newPage();
    await vp.goto(`${origin}/vendor/tickets/${ticketId}`);
    await vp.getByText("Reviewed fixture leak", { exact: true }).waitFor();
    assert.ok(
      !(await vp.locator("body").innerText()).includes("PRIVATE STAFF DISCUSSION"),
    );
    await vp.getByRole("link", { name: /Read approved job attachment/ }).waitFor();
    await vp
      .getByLabel("Actual description", { exact: true })
      .fill("Vendor arrived at the verified fixture location");
    await vp.getByLabel("Work log meaning").selectOption("arrived");
    await vp
      .getByLabel("Initial report or revision reason")
      .fill("Reported actual fixture arrival");
    await vp
      .getByRole("button", { name: "Submit exact report for PMI review", exact: true })
      .click();
    await vp
      .getByRole("button", { name: "Check original report", exact: true })
      .waitFor();
    assert.equal(
      await vp.getByLabel("Actual description", { exact: true }).inputValue(),
      "Vendor arrived at the verified fixture location",
    );
    await vp.reload();
    await vp.getByText(/Original report recorded at version 1/).waitFor();
    assert.equal((await control({})).counts.maintenance_vendor_contributions, 1);
    checks.push(
      "compiled vendor reports work without mailbox connection, survives a lost committed response/reload and recovers one original report; private staff discussion stays absent",
    );
    await vp.getByLabel("Select or capture actual evidence").setInputFiles({
      name: "vendor-original.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nVendor original invoice evidence fixture\n%%EOF"),
    });
    await vp.getByLabel(/actual relevant core work evidence/).check();
    await vp
      .getByRole("button", { name: "Retain exact selected file", exact: true })
      .click();
    await vp
      .getByRole("button", { name: "Check original retained file", exact: true })
      .waitFor();
    await vp
      .getByRole("button", { name: "Check original retained file", exact: true })
      .click();
    await vp
      .getByText("Original retained file verified; no upload was repeated.", {
        exact: true,
      })
      .waitFor();
    assert.equal((await control({})).counts.maintenance_vendor_artifacts, 1);
    if (
      await vp
        .getByRole("button", { name: "Start a separate report", exact: true })
        .count()
    )
      await vp
        .getByRole("button", { name: "Start a separate report", exact: true })
        .click();
    await vp.getByLabel("Report type").selectOption("completion");
    await vp
      .getByLabel("Actual description", { exact: true })
      .fill("Vendor reports work finished, pending PMI actual review");
    await vp
      .getByLabel("Unresolved issues or remaining work")
      .fill("PMI must inspect and decide final closeout");
    await vp
      .getByLabel("Initial report or revision reason")
      .fill("Vendor completion request only");
    await vp
      .getByRole("button", { name: "Submit exact report for PMI review", exact: true })
      .click();
    await vp.getByText("Vendor completion request only", { exact: false }).count();
    await vp
      .getByRole("heading", { name: /completion · version 1 · PMI review pending/ })
      .waitFor();
    assert.notEqual((await control({})).tickets[0].status, "Closed");
    checks.push(
      "compiled vendor retains an original document by hash after a lost response and requests completion while final closure remains with PMI",
    );
    await layout(vp, "vendor-wide");
    await vp.setViewportSize({ width: 760, height: 1000 });
    await layout(vp, "vendor-760");
    await vp.setViewportSize({ width: 320, height: 900 });
    await layout(vp, "vendor-320");
    await vp.setViewportSize({ width: 1440, height: 1000 });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await layout(page, "maintenance-wide");
    await page.setViewportSize({ width: 760, height: 1000 });
    await layout(page, "maintenance-760");
    await page.setViewportSize({ width: 320, height: 900 });
    await layout(page, "maintenance-320");
    zoom = await createLocalZoomContext(origin);
    await configure(zoom.context);
    const zp = await zoom.context.newPage();
    await zp.goto(`${origin}/maintenance?ticket_id=${ticketId}`);
    await zp.locator(".appearance-trigger[data-ready=true]").waitFor();
    await zoom.setZoom(zp, 2);
    await layout(zp, "maintenance-200-percent");
    const vz = await zoom.context.newPage();
    await vz.goto(`${origin}/vendor/tickets/${ticketId}`);
    await vz.getByText("Reviewed fixture leak", { exact: true }).waitFor();
    await zoom.setZoom(vz, 2);
    await layout(vz, "vendor-200-percent");
    const rp = await context.newPage();
    await rp.goto(`${origin}/maintenance/history`);
    await rp.locator(".appearance-trigger[data-ready=true]").waitFor();
    await rp.getByLabel("Actual property ID", { exact: true }).fill("901");
    await rp
      .getByRole("button", { name: "Prepare complete report", exact: true })
      .click();
    await rp.getByRole("heading", { name: /Property 901/ }).waitFor();
    assert.ok((await rp.locator("body").innerText()).includes("$110.00"));
    await rp.getByLabel(/I reviewed these selected facts/).check();
    await rp.getByLabel(/Retain this snapshot and the exact PDF/).check();
    await rp
      .getByRole("button", { name: "Save reviewed report and exports", exact: true })
      .click();
    await rp.waitForFunction(() =>
      Array.from(document.querySelectorAll("button")).some(
        (button) =>
          button.textContent?.trim() === "Check original report save" &&
          !button.matches(":disabled"),
      ),
    );
    const reportId = new URL(rp.url()).searchParams.get("report_id");
    assert.ok(reportId);
    await rp.reload();
    await rp.getByRole("link", { name: "Download original PDF", exact: true }).waitFor();
    assert.equal(
      requests.filter((r) => r.path === "/api/maintenance/reports" && r.method === "POST")
        .length,
      1,
    );
    for (const format of ["pdf", "csv"]) {
      const response = await fetch(
        `${origin}/api/maintenance/reports?report_id=${reportId}&format=${format}`,
      );
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      writeFileSync(join(output, `compiled-report.${format}`), bytes);
      if (format === "csv") {
        assert.ok(bytes.toString().includes('"11000"'));
        assert.ok(!bytes.toString().includes("PRIVATE STAFF DISCUSSION"));
      } else assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    }
    checks.push(
      "compiled report saves matching owner-ready facts/PDF/CSV, survives a lost committed response and recovers the original without another save",
    );
    await layout(rp, "report-wide");
    await rp.setViewportSize({ width: 320, height: 900 });
    await layout(rp, "report-320");
    await rp.setViewportSize({ width: 1440, height: 1000 });
    const policyPage = await context.newPage();
    await policyPage.goto(`${origin}/maintenance/policies`);
    await policyPage
      .getByRole("button", { name: "Read selected current policy" })
      .click();
    await policyPage.getByText("Saved scope version: 0.", { exact: true }).waitFor();
    await policyPage.getByLabel("Policy title").fill("Fixture approved emergency policy");
    await policyPage.getByLabel("Saved state").selectOption("approved");
    await policyPage.getByLabel(/Effective date/).fill("2026-10-01");
    await policyPage
      .getByLabel(/Actual policy source evidence/)
      .fill("private-fixture:reviewed-policy-source");
    await policyPage
      .getByLabel("Ordinary report acknowledgement")
      .fill("Fixture acknowledgement from reviewed policy.");
    await policyPage
      .getByLabel(/Change, correction or revocation reason/)
      .fill("Reviewed actual fixture operating policy");
    await policyPage
      .getByRole("button", { name: "Save reviewed policy version", exact: true })
      .click();
    await policyPage
      .getByRole("button", { name: "Check original policy save", exact: true })
      .waitFor();
    await policyPage.reload();
    await policyPage.getByText(/Original policy version 1 is recorded/).waitFor();
    assert.equal(
      requests.filter(
        (r) => r.path === "/api/maintenance/operating-policies" && r.method === "POST",
      ).length,
      1,
    );
    await layout(policyPage, "policy-wide");
    await policyPage.setViewportSize({ width: 320, height: 900 });
    await layout(policyPage, "policy-320");
    checks.push(
      "compiled actual policy controls retain one approved version after a lost committed response and reload; no phone contact or live handoff is invented",
    );
    const patchesBeforeReview = requests.filter(
      (r) => r.method === "PATCH" && r.path === `/api/maintenance/tickets/${ticketId}`,
    ).length;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.reload();
    card = page.locator(`#maintenance-ticket-${ticketId}`);
    await card.getByText("Urgency and responsibility review", { exact: true }).click();
    const reviews = card.locator(".maintenance-reviews");
    await reviews
      .getByLabel("Reviewed urgency issue summary", { exact: true })
      .fill("Fixture smoke and fire reported now");
    await reviews
      .getByLabel("Reviewed urgency issue facts", { exact: true })
      .fill(
        "Fixture actual staff-reviewed report of active smoke and fire. This is a local verification fixture.",
      );
    await reviews.getByLabel("Happening now", { exact: true }).selectOption("yes");
    await reviews
      .getByLabel("Urgency review reason", { exact: true })
      .fill(
        "Staff corrected the actual fixture report and reviewed the shared emergency floor",
      );
    await reviews
      .getByLabel("Actual urgency evidence (one per line)", { exact: true })
      .fill("private-fixture:corrected-active-fire-report");
    await reviews
      .getByRole("button", { name: "Save staff urgency review", exact: true })
      .click();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("button")).some(
        (b) => b.textContent?.trim() === "Check original edit" && !b.matches(":disabled"),
      ),
    );
    await page.reload();
    await page.getByText(/Original app edit committed at ticket version/).waitFor();
    card = page.locator(`#maintenance-ticket-${ticketId}`);
    const currentReviews = card.locator(".maintenance-reviews");
    if ((await currentReviews.getAttribute("open")) === null)
      await currentReviews
        .getByText("Urgency and responsibility review", { exact: true })
        .click();
    await currentReviews
      .getByLabel("Responsibility review state", { exact: true })
      .selectOption("disputed");
    await currentReviews
      .getByLabel("Responsibility review reason", { exact: true })
      .fill(
        "Fixture resident disputes responsibility; no liability or amount has been agreed",
      );
    await currentReviews
      .getByLabel("Actual resident concern or refusal (optional)", { exact: true })
      .fill("Fixture resident asks PMI to investigate before any charge is considered");
    await currentReviews
      .getByRole("button", { name: "Save staff responsibility review", exact: true })
      .click();
    await currentReviews
      .getByText(/Staff responsibility review recorded\. Proposed amounts/)
      .waitFor();
    const reviewed = (await control({})).tickets.find((t) => t.id === ticketId);
    assert.equal(reviewed.priority, "Emergency");
    assert.equal(reviewed.responsibility_decision.state, "disputed");
    assert.equal(reviewed.responsibility_decision.proposedAmountCents, null);
    assert.equal(reviewed.responsibility_decision.ledgerPosting, "not_executed");
    assert.equal(
      requests.filter(
        (r) => r.method === "PATCH" && r.path === `/api/maintenance/tickets/${ticketId}`,
      ).length,
      patchesBeforeReview + 2,
    );
    await layout(page, "maintenance-reviews-wide");
    await page.setViewportSize({ width: 320, height: 900 });
    await layout(page, "maintenance-reviews-320");
    checks.push(
      "compiled shared urgency and disputed responsibility review preserve the emergency floor, recover one lost reviewed edit and create no new charge/payment/provider effect",
    );
    await verifyPresentation(context);
    await control({ action: "revokeVendor", ticketId });
    await vp
      .getByRole("button", { name: "Read current assigned work", exact: true })
      .click();
    await vp
      .getByRole("button", { name: "Submit exact report for PMI review", exact: true })
      .waitFor();
    await vp.waitForFunction(() =>
      Array.from(document.querySelectorAll("button")).some(
        (b) =>
          b.textContent?.trim() === "Submit exact report for PMI review" &&
          b.matches(":disabled"),
      ),
    );
    assert.equal(
      await vp
        .getByRole("button", { name: "Submit exact report for PMI review", exact: true })
        .isDisabled(),
      true,
    );
    const denied = await fetch(`${origin}/api/vendor/tickets/${ticketId}/work`);
    assert.ok([403, 404].includes(denied.status));
    checks.push(
      "compiled current assignment revocation refuses fresh work and holds new submissions after a prior readable visit",
    );
    result = await control({});
    assert.equal(result.counts.maintenance_financial_entries, 1);
    assert.equal(result.counts.maintenance_retained_artifacts, 1);
    assert.equal(result.counts.maintenance_vendor_contributions, 2);
    assert.equal(result.counts.maintenance_vendor_artifacts, 1);
    assert.equal(result.counts.maintenance_report_snapshots, 1);
    assert.equal(result.counts.action_executions, 0);
    assert.equal(result.counts.workflow_communication_sequences, 0);
    assert.deepEqual(errors, []);
    assert.equal(
      requests.filter((r) => r.path === "/api/maintenance/tickets" && r.method === "POST")
        .length,
      1,
    );
    writeFileSync(
      join(output, "result.json"),
      JSON.stringify(
        {
          result: "passed",
          checks,
          requests,
          errors,
          counts: result.counts,
          scope:
            "Actual compiled capture/shared queue/lifecycle, HTTP handlers and owning emulator transactions; synthetic auth/unit-source adapters. No live customer/provider effects or human observation.",
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ result: "passed", output, checks: checks.length }));
  }
} catch (error) {
  writeFileSync(
    join(output, "failed-result.json"),
    JSON.stringify(
      { result: "failed", message: String(error), checks, requests, errors },
      null,
      2,
    ),
  );
  for (const [i, p] of (browser?.contexts().flatMap((c) => c.pages()) ?? []).entries()) {
    writeFileSync(join(output, `failed-${i}.html`), await p.content().catch(() => ""));
    await p.screenshot({ path: join(output, `failed-${i}.png`) }).catch(() => {});
  }
  throw error;
} finally {
  await zoom?.context.close();
  await browser?.close();
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
  await new Promise((resolve) => {
    if (server.exitCode !== null) return resolve();
    server.once("exit", resolve);
    setTimeout(() => {
      try {
        process.kill(-server.pid, "SIGKILL");
      } catch {}
      resolve();
    }, 5000);
  });
  log.end();
}
