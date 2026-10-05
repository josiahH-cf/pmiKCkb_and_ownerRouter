// Actual compiled owners with bounded synthetic adapters. No provider/business effect dispatch.
import assert from "node:assert/strict";
import { mkdirSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import setup from "../e2e/global-setup.mjs";
assert.match(process.cwd(), /^\/tmp\/pmi-kc-vitest-run-recovery\/worktree$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
assert.equal(process.env.FIREBASE_PROJECT_ID, "pmi-kc-kb-batch005-browser-test");
const mount = join(process.cwd(), "app/vendor/batch005-recovery");
assert.equal(existsSync(mount), false);
mkdirSync(mount, { recursive: true });
writeFileSync(
  join(mount, "page.tsx"),
  'export { RecoveryFixturePage as default } from "@/tests/browser/owner-fixtures";\n',
  { flag: "wx" },
);
let origin;
const teardown = await setup({
  provide(key, value) {
    if (key === "e2eBaseUrl") origin = value;
  },
});
assert.equal(new URL(origin).hostname, "localhost");
const browser = await chromium.launch({
  executablePath: resolveBrowserExecutable(),
  headless: true,
});
const output = join(
  "/tmp",
  "batch005-recovery-browser-" + new Date().toISOString().replaceAll(":", "-"),
);
mkdirSync(output, { mode: 0o700 });
const observations = [];
const errors = [];
const refused = [];
const data = {
  suggestion: {
    suggestedRent: 2400,
    status: "suggested",
    comps: [{ rent: 2400, source: "Local verified comp" }],
    rationale: "Local fixture rationale",
  },
  approval: null,
  canApprove: true,
};
let page;
try {
  for (const theme of ["light", "dark"])
    for (const width of [320, 390, 1440])
      for (const effectMode of ["lost_response", "server_error", "response_body_error"]) {
        const context = await browser.newContext({
          viewport: { width, height: 1000 },
          hasTouch: true,
          reducedMotion: "reduce",
        });
        page = await context.newPage();
        page.on("pageerror", (error) => errors.push(error.message));
        let reads = 0;
        let historyReads = 0;
        let historyAvailable = false;
        const holdBodies = [];
        await page.route("**/api/**", async (route) => {
          const request = route.request(),
            url = new URL(request.url());
          if (request.method() !== "GET") {
            if (url.pathname === "/api/admin/communications-retention/holds") {
              holdBodies.push(request.postData());
              if (holdBodies.length === 2) {
                refused.push({
                  method: request.method(),
                  path: url.pathname,
                  handling: "local_exact_replay_no_dispatch",
                });
                return route.fulfill({ json: { status: "duplicate", legalHold: true } });
              }
            }
            if (
              ["/api/report-issue", "/api/admin/communications-retention/holds"].includes(
                url.pathname,
              ) &&
              effectMode === "response_body_error"
            ) {
              refused.push({
                method: request.method(),
                path: url.pathname,
                handling: "local_invalid_receipt_no_dispatch",
              });
              return route.fulfill({
                status: 202,
                contentType: "application/json",
                body: '{"received":',
              });
            }
            if (
              effectMode === "server_error" &&
              [
                "/api/admin/support-reports",
                "/api/report-issue",
                "/api/admin/communications-retention/holds",
                "/api/admin/operational-pages",
              ].includes(url.pathname)
            ) {
              refused.push({
                method: request.method(),
                path: url.pathname,
                handling: "local_synthetic_500_no_dispatch",
              });
              return route.fulfill({
                status: 500,
                json: { error: "Local uncertain readback fixture" },
              });
            }
            refused.push({
              method: request.method(),
              path: url.pathname,
              handling: "aborted_before_dispatch",
            });
            return route.abort("blockedbyclient");
          }
          if (url.pathname === "/api/admin/operational-pages") {
            historyReads++;
            return route.fulfill(
              !historyAvailable
                ? { status: 503, json: { error: "Local history unavailable" } }
                : { json: { heads: [], versions: [] } },
            );
          }
          if (url.pathname === "/api/lease-renewal/rent-suggestion") {
            reads++;
            return route.fulfill(
              reads === 1
                ? { status: 503, json: { error: "Local source unavailable" } }
                : { json: data },
            );
          }
          return route.continue();
        });
        const response = await page.goto(origin + "/vendor/batch005-recovery", {
          waitUntil: "networkidle",
          timeout: 90000,
        });
        assert.equal(response.status(), 200);
        await page.evaluate(
          (theme) => document.documentElement.setAttribute("data-theme", theme),
          theme,
        );
        const rent = page.getByRole("region", { name: "Rent suggestion" }),
          report = page.getByRole("region", { name: "Feedback status" });
        await rent.getByRole("alert").filter({ hasText: "unavailable" }).waitFor();
        assert.equal(
          await rent.getByText("Loading the comp-derived suggestion…").count(),
          0,
        );
        const retry = rent.getByRole("button", { name: "Retry current suggestion" });
        await retry.focus();
        await page.keyboard.press("Enter");
        await rent.getByText("Local verified comp", { exact: true }).waitFor();
        const reason = rent.getByRole("textbox", { name: /Reason/ });
        await reason.fill("Retain reviewed local reason");
        await rent.getByRole("button", { name: "Approve this number" }).focus();
        await page.keyboard.press("Enter");
        await rent.getByRole("alert").filter({ hasText: "not confirmed" }).waitFor();
        assert.equal(await reason.inputValue(), "Retain reviewed local reason");
        assert.equal(
          await rent.getByRole("button", { name: "Approve this number" }).isDisabled(),
          true,
        );
        await rent.getByRole("button", { name: "Check current suggestion" }).click();
        await page.waitForFunction(
          () =>
            !document
              .querySelector('[aria-label="Rent suggestion"]')
              ?.textContent.includes("Checking current suggestion"),
        );
        assert.equal(
          await rent.getByRole("button", { name: "Approve this number" }).isDisabled(),
          true,
        );
        const note = report.getByRole("textbox", {
          name: "Optional note recorded on the status change",
        });
        await note.fill("Retain local pending audit note");
        await report.getByRole("button", { name: "Resolve" }).focus();
        await page.keyboard.press("Enter");
        await report.getByRole("alert").filter({ hasText: "not confirmed" }).waitFor();
        assert.equal(await note.inputValue(), "Retain local pending audit note");
        assert.equal(
          await report.getByRole("button", { name: "Resolve" }).isDisabled(),
          true,
        );
        assert.equal(
          await report
            .getByRole("link", { name: "Reload current feedback" })
            .getAttribute("href"),
          "/admin",
        );
        const feedback = page.getByRole("region", {
          name: "Feedback submission",
          exact: true,
        });
        await feedback.getByRole("button", { name: "Feedback", exact: true }).click();
        const description = feedback.getByRole("textbox", { name: /Your feedback/ });
        await description.fill("Retain this local feedback description");
        await feedback.getByRole("button", { name: "Send feedback" }).focus();
        await page.keyboard.press("Enter");
        await feedback.getByRole("alert").filter({ hasText: "not confirmed" }).waitFor();
        assert.equal(
          await description.inputValue(),
          "Retain this local feedback description",
        );
        assert.equal(
          await feedback.getByRole("button", { name: "Send feedback" }).isDisabled(),
          true,
        );
        await page.keyboard.press("Escape");
        assert.equal(await feedback.getByRole("dialog").count(), 0);
        assert.equal(
          await feedback
            .getByRole("button", { name: "Feedback", exact: true })
            .evaluate((element) => document.activeElement === element),
          true,
        );
        await feedback.getByRole("button", { name: "Feedback", exact: true }).click();
        assert.equal(
          await feedback.getByRole("textbox", { name: /Your feedback/ }).inputValue(),
          "Retain this local feedback description",
        );
        assert.equal(
          await feedback.getByRole("button", { name: "Send feedback" }).isDisabled(),
          true,
        );
        await feedback.getByRole("button", { name: "Cancel" }).click();
        const crash = page.getByRole("region", { name: "Crash report submission" });
        await crash.getByRole("button", { name: "Report this problem" }).click();
        await crash.getByRole("alert").filter({ hasText: "not confirmed" }).waitFor();
        assert.equal(
          await crash.getByRole("button", { name: "Report this problem" }).isDisabled(),
          true,
        );
        await crash.getByRole("button", { name: "Try again" }).click();
        await crash.getByText("Local page recoveries: 1", { exact: true }).waitFor();
        const retention = page.getByRole("region", {
          name: "Retention decision recovery",
        });
        await retention
          .getByRole("textbox", { name: "Record ID" })
          .fill("local-bodyless-record");
        await retention
          .getByRole("textbox", { name: "Case reference" })
          .fill("Local case");
        await retention
          .getByRole("textbox", { name: "Plain-English reason" })
          .fill("Retain this local decision reason");
        await retention.getByRole("button", { name: "Apply legal hold" }).click();
        await retention.getByRole("alert").filter({ hasText: "not confirmed" }).waitFor();
        assert.equal(
          await retention
            .getByRole("textbox", { name: "Plain-English reason" })
            .inputValue(),
          "Retain this local decision reason",
        );
        assert.equal(
          await retention.getByRole("button", { name: "Apply legal hold" }).isDisabled(),
          true,
        );
        await retention.getByRole("button", { name: "Retry exact decision" }).click();
        await retention.getByText(/Already recorded: legal hold active/).waitFor();
        assert.equal(holdBodies.length, 2);
        assert.equal(holdBodies[0], holdBodies[1]);
        const builder = page.getByRole("region", { name: "Operational page recovery" });
        await builder
          .getByRole("alert")
          .filter({ hasText: "history unavailable" })
          .waitFor();
        historyAvailable = true;
        await builder.getByRole("button", { name: "Reload page history" }).click();
        await builder.getByRole("button", { name: "Reload page history" }).waitFor();
        await builder
          .getByRole("textbox", { name: "Page address slug" })
          .fill("local-page");
        await builder
          .getByRole("textbox", { name: "Page title" })
          .fill("Retained local page");
        await builder
          .getByRole("textbox", { name: "Reason for this version" })
          .fill("Local reviewed reason");
        await builder.getByRole("button", { name: "Add text" }).click();
        await builder
          .getByRole("textbox", { name: "Paragraph text" })
          .fill("Local safe page text");
        await builder
          .getByRole("button", { name: "Save immutable draft and preview" })
          .click();
        await builder.getByRole("alert").filter({ hasText: "not confirmed" }).waitFor();
        assert.equal(
          await builder.getByRole("textbox", { name: "Page title" }).inputValue(),
          "Retained local page",
        );
        assert.equal(
          await builder
            .getByRole("button", { name: "Save immutable draft and preview" })
            .isDisabled(),
          true,
        );
        await builder.getByRole("button", { name: "Reload page history" }).click();
        await builder.getByRole("button", { name: "Reload page history" }).waitFor();
        assert.equal(
          await builder
            .getByRole("button", { name: "Save immutable draft and preview" })
            .isDisabled(),
          true,
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 2,
          ),
          true,
        );
        observations.push({
          theme,
          width,
          effectMode,
          keyboardRecovery: "passed",
          failedRead: "passed",
          uncertainEffectFence: "passed",
          unsavedInput: "preserved",
          layout: "passed",
          syntheticAdaptersOnly: true,
          feedbackCreationFence: "passed",
          dialogInputAndFocus: "preserved",
          crashPageRecovery: "passed",
          legalHoldExactReplay: "passed",
          pageHistoryRecovery: "passed",
        });
        await context.close();
      }
  assert.deepEqual(errors, []);
  assert.equal(
    refused.filter((r) => r.path === "/api/lease-renewal/rent-suggestion").length,
    18,
  );
  assert.equal(
    refused.filter((r) => r.handling === "local_exact_replay_no_dispatch").length,
    18,
  );
  assert.equal(refused.filter((r) => r.path === "/api/admin/support-reports").length, 18);
  assert.equal(refused.filter((r) => r.path === "/api/report-issue").length, 36);
  assert.equal(
    refused.filter((r) => r.handling === "local_synthetic_500_no_dispatch").length,
    30,
  );
  assert.equal(
    refused.filter((r) => r.path === "/api/admin/communications-retention/holds").length,
    36,
  );
  assert.equal(
    refused.filter((r) => r.path === "/api/admin/operational-pages").length,
    18,
  );
  assert.equal(refused.length, 126);
  writeFileSync(
    join(output, "checks.json"),
    JSON.stringify(
      {
        observations,
        errors,
        refused,
        businessEffectsDispatched: 0,
        humanVerdict: "NOT RUN — no human observer",
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      outcome: "passed",
      observations: observations.length,
      refused: refused.length,
      privateEvidence: output,
    }),
  );
} catch (error) {
  if (page && !page.isClosed())
    await page.screenshot({ path: join(output, "failed.png"), fullPage: true });
  writeFileSync(
    join(output, "failed.json"),
    JSON.stringify({ failure: error.message, observations, errors, refused }, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  console.error(
    JSON.stringify({
      outcome: "failed",
      failure: error.message,
      privateEvidence: output,
    }),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
  await teardown();
  rmSync(mount, { recursive: true });
}
