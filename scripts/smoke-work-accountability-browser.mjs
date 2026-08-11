import { accessSync, constants, mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

const baseUrl = process.env.WORK_BROWSER_BASE_URL?.trim();
if (!baseUrl) {
  throw new Error(
    "WORK_BROWSER_BASE_URL is required and must point to a running local Demo server.",
  );
}

const artifactDir = join(process.cwd(), "temp", "work-accountability-browser");
mkdirSync(artifactDir, { recursive: true });
const cdpUrl = process.env.WORK_BROWSER_CDP_URL?.trim();
const browser = cdpUrl
  ? await chromium.connectOverCDP(cdpUrl)
  : await chromium.launch({
      executablePath: findBrowserExecutable(),
      headless: true,
    });

try {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 900 },
    { name: "mobile-390x844", width: 390, height: 844 },
  ]) {
    const context = cdpUrl
      ? browser.contexts()[0]
      : await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
        });
    if (!context) throw new Error("The connected browser has no usable context.");
    if (cdpUrl) await context.clearCookies();
    const page = await context.newPage();
    if (cdpUrl) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
    }
    await page.route("**/api/work**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname !== "/api/work") {
        await route.continue();
        return;
      }
      if (request.method() === "POST") {
        await route.fulfill({
          contentType: "application/json",
          status: 200,
          body: JSON.stringify({
            session: null,
            reconciliation: { scanned: 0, ended: 0 },
          }),
        });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          snapshot: syntheticSnapshot(),
          roster: syntheticRoster(),
        }),
      });
    });

    await page.goto(`${baseUrl}/sign-in`, { waitUntil: "domcontentloaded" });
    const signedIn = await page.evaluate(async () => {
      const response = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "Admin" }),
      });
      return response.ok;
    });
    assert(signedIn, "Local Demo sign-in did not complete.");

    for (const route of [
      { path: "/work", heading: "My work", file: "my-work" },
      { path: "/admin/team-work", heading: "Team work", file: "team-work" },
    ]) {
      await page.goto(`${baseUrl}${route.path}`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: route.heading, exact: true }).waitFor();
      await page.getByRole("heading", { name: "Review renewal record" }).waitFor();
      await page
        .getByText(/Needs review: connection ended/)
        .first()
        .waitFor();
      await page.getByText(/Retention expired/).waitFor();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      assert(
        overflow <= 1,
        `${route.path} overflowed the ${viewport.width}px viewport by ${overflow}px.`,
      );
      await page.screenshot({
        fullPage: true,
        path: join(artifactDir, `${route.file}-${viewport.name}.png`),
      });
    }
    if (cdpUrl) await page.close();
    else await context.close();
  }
} finally {
  await browser.close();
}

process.stdout.write(
  `S68 browser smoke passed at desktop and 390x844; artifacts: ${artifactDir}\n`,
);

function syntheticSnapshot() {
  const task = {
    id: "browser-task-1",
    space_id: "lease-renewals",
    source: { type: "manual", status: "verified" },
    task_type: "review",
    title: "Review renewal record",
    assignee_uid: "local-demo-admin",
    creator_uid: "local-demo-admin",
    assigner_uid: "local-demo-admin",
    state: "Completed",
    next_action: "Open the owning renewal workspace",
    due_at: "2026-08-10T14:00:00.000Z",
    expectation_snapshot: {
      expectation_id: "browser-expectation-1",
      expectation_key: "lease-renewals:review",
      version: 1,
      minimum_minutes: 30,
      maximum_minutes: 45,
      effective_at: "2026-08-01T12:00:00.000Z",
    },
    created_at: "2026-08-10T12:00:00.000Z",
    updated_at: "2026-08-10T12:10:00.000Z",
    completed_at: "2026-08-10T12:10:00.000Z",
    record_version: 3,
    retention_policy_version: "staff-work-retention:v1.0",
    retention_expires_at: "2027-08-10T12:10:00.000Z",
    legal_hold: false,
  };
  return {
    tasks: [task],
    editable_task_ids: [task.id],
    sessions: [
      {
        id: "browser-session-1",
        task_id: task.id,
        original_task_id: task.id,
        staff_uid: "local-demo-admin",
        state: "Ended",
        original_start_at: "2026-08-10T12:00:00.000Z",
        original_end_at: "2026-08-10T12:10:00.000Z",
        end_reason: "disconnect_review",
        last_acknowledged_activity_at: "2026-08-10T11:55:00.000Z",
        effective_start_at: "2026-08-10T12:00:00.000Z",
        effective_end_at: "2026-08-10T12:10:00.000Z",
        effective_minutes: 10,
        correction_state: "needs_review",
        idempotency_key: "browser-hash",
        record_version: 2,
        created_at: "2026-08-10T12:00:00.000Z",
        updated_at: "2026-08-10T12:10:00.000Z",
        retention_policy_version: "staff-work-retention:v1.0",
        retention_expires_at: "2027-08-10T12:10:00.000Z",
        legal_hold: false,
      },
    ],
    expectations: [],
    mappings: [],
    server_now: "2027-08-11T12:20:00.000Z",
    record_limit: 500,
    may_be_truncated: false,
  };
}

function syntheticRoster() {
  return [
    {
      uid: "local-demo-admin",
      email: "local-demo@pmikcmetro.com",
      role: "Admin",
    },
  ];
}

function findBrowserExecutable() {
  const configured = process.env.WORK_BROWSER_EXECUTABLE?.trim();
  const candidates = configured
    ? [configured]
    : process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        ]
      : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const executable = candidates.find((candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
  if (!executable) {
    throw new Error("Chrome or Edge was not found for the S68 browser smoke.");
  }
  return executable;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
