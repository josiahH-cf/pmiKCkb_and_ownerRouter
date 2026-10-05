import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import setup from "../e2e/global-setup.mjs";

const startingLayout = process.env.BATCH005_STARTING_LAYOUT_ONLY === "true";
assert.equal(
  process.cwd(),
  startingLayout
    ? "/tmp/pmi-kc-batch005-start-browser"
    : "/tmp/pmi-kc-vitest-run-recovery/worktree",
);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
assert.equal(process.env.FIREBASE_PROJECT_ID, "pmi-kc-kb-batch005-browser-test");
const mount = join(process.cwd(), "app/vendor/batch005-publication-recovery");
assert.equal(existsSync(mount), false);
mkdirSync(mount, { recursive: true });
writeFileSync(
  join(mount, "page.tsx"),
  'import { OperationalPageBuilderPanel } from "@/components/admin/OperationalPageBuilderPanel"; export default function Page() { return <main className="vendor-shell"><h1>Local publication recovery</h1><OperationalPageBuilderPanel spaces={[{id:"local-space",name:"Local Space"}]} /></main>; }\n',
  { flag: "wx" },
);
const schema = readFileSync("lib/operational-pages/schema.ts", "utf8");
const confirmation = (name) =>
  schema.match(new RegExp(`export const ${name} =\\s*"([^"]+)"`))[1];
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
  (startingLayout
    ? "batch005-publication-layout-starting-"
    : "batch005-publication-recovery-browser-") +
    new Date().toISOString().replaceAll(":", "-"),
);
mkdirSync(output, { mode: 0o700 });
const observations = [],
  intercepted = [],
  errors = [];
let page;
try {
  for (const theme of ["light", "dark"])
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        hasTouch: true,
        reducedMotion: "reduce",
      });
      page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      const version = {
        id: "local-publication-version",
        pageId: "local-page",
        versionNumber: 1,
        state: "draft",
        previewHash: "b".repeat(64),
        createdByUid: "local-admin",
        createdAt: "2026-10-04T00:00:00.000Z",
        definition: {
          pageType: "operational_process",
          spaceId: "local-space",
          slug: "local-page",
          title: "Local page",
          components: [{ type: "text", text: "Local safe text" }],
        },
      };
      let publications = 0;
      await page.route("**/api/**", async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (url.pathname === "/api/admin/operational-pages") {
          if (request.method() === "GET")
            return route.fulfill({ json: { heads: [], versions: [version] } });
          const body = request.postDataJSON();
          intercepted.push({
            path: url.pathname,
            operation: body.operation,
            handling: "local_adapter_no_dispatch",
          });
          if (body.operation === "draft") return route.fulfill({ json: { version } });
          if (body.operation === "approve")
            return route.fulfill({
              json: {
                approval: { versionId: version.id, previewHash: version.previewHash },
              },
            });
          assert.equal(body.operation, "publish");
          publications++;
          return route.fulfill({
            status: 409,
            json: { error: "Operational page publication readback failed." },
          });
        }
        if (request.method() !== "GET") {
          intercepted.push({ path: url.pathname, handling: "aborted_before_dispatch" });
          return route.abort("blockedbyclient");
        }
        return route.continue();
      });
      assert.equal(
        (
          await page.goto(origin + "/vendor/batch005-publication-recovery", {
            waitUntil: "networkidle",
            timeout: 90000,
          })
        ).status(),
        200,
      );
      await page.evaluate(
        (theme) => document.documentElement.setAttribute("data-theme", theme),
        theme,
      );
      await page.getByRole("textbox", { name: "Page address slug" }).fill("local-page");
      await page.getByRole("textbox", { name: "Page title" }).fill("Local page");
      await page
        .getByRole("textbox", { name: "Reason for this version" })
        .fill("Retained local reason");
      await page.getByRole("button", { name: "Add text" }).click();
      await page.getByRole("textbox", { name: "Paragraph text" }).fill("Local safe text");
      await page
        .getByRole("button", { name: "Save immutable draft and preview" })
        .click();
      await page
        .getByRole("region", { name: "Exact operational page preview" })
        .waitFor();
      if (!startingLayout) {
        await page
          .getByRole("checkbox", {
            name: confirmation("OPERATIONAL_PAGE_APPROVAL_CONFIRMATION"),
          })
          .check();
        await page.getByRole("button", { name: "Approve exact version" }).click();
        await page
          .getByRole("checkbox", {
            name: confirmation("OPERATIONAL_PAGE_PUBLICATION_CONFIRMATION"),
          })
          .check();
        const publish = page.getByRole("button", { name: "Publish approved version" });
        await publish.focus();
        await page.keyboard.press("Enter");
        await page.getByRole("alert").filter({ hasText: "not confirmed" }).waitFor();
        assert.equal(await publish.isDisabled(), true);
        assert.equal(
          await page
            .getByRole("textbox", { name: "Reason for this version" })
            .inputValue(),
          "Retained local reason",
        );
        const reload = page.getByRole("button", { name: "Reload page history" });
        await reload.focus();
        await page.keyboard.press("Enter");
        await page.getByRole("combobox", { name: "Review a saved version" }).waitFor();
        assert.equal(await publish.isDisabled(), true);
        assert.equal(publications, 1);
        assert.equal(
          await page
            .getByText("Published and read back. The page remains read-only.", {
              exact: true,
            })
            .count(),
          0,
        );
      }
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
        true,
      );
      observations.push({
        theme,
        width,
        keyboardRecovery: "passed",
        uncertainPostCommitConflict: "fenced",
        input: "preserved",
        publications,
        layout: "passed",
      });
      await context.close();
    }
  assert.deepEqual(errors, []);
  assert.equal(intercepted.length, startingLayout ? 6 : 18);
  writeFileSync(
    join(output, "checks.json"),
    JSON.stringify(
      {
        observations,
        intercepted,
        errors,
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
      intercepted: intercepted.length,
      privateEvidence: output,
    }),
  );
} catch (error) {
  if (page && !page.isClosed())
    await page.screenshot({ path: join(output, "failed.png"), fullPage: true });
  writeFileSync(
    join(output, "failed.json"),
    JSON.stringify(
      { error: error.message, observations, intercepted, businessEffectsDispatched: 0 },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  throw error;
} finally {
  await browser.close();
  await teardown();
  rmSync(mount, { recursive: true, force: true });
}
