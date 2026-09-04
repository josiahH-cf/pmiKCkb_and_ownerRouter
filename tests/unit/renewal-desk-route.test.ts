import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("S78 canonical renewal route", () => {
  it("keeps /lease-renewal as the single entry and computes the Live window from month-start", () => {
    expect(source("app/lease-renewal/page.tsx")).toContain(
      'redirect("/lease-renewal/live/desk")',
    );
    const desk = source("app/lease-renewal/live/desk/page.tsx");
    expect(desk).toContain("parseRenewalDeskQueryV2");
    expect(desk).toContain('renewalRoleCapability("read_workspace")');
    expect(desk).toContain('liveReviewHref="/lease-renewal/live"');
    // S110 moved the window rule and the snapshot read into the shared orchestration the desk page
    // and the Dashboard assistant both call, so the month-start rule is pinned there instead. The
    // page still owns its own post-write freshness floor.
    expect(desk).toContain("RENEWAL_SOURCE_REFRESH_COOKIE");
    expect(desk).toContain("loadRenewalAssistantSource");
    const orchestration = source("lib/lease-renewal/assistant-source.ts");
    expect(orchestration).toContain("buildRenewalDeskWindow");
    expect(orchestration).toContain("getLiveLeaseSnapshotAtOrAfter");
    expect(orchestration).toContain("leaseSnapshotResult");
    expect(orchestration).not.toContain("startIso = now.toISOString().slice(0, 10)");
  });

  it("links verification items to their exact actionable Live-review card", () => {
    const workspace = source("app/lease-renewal/live/desk/lease/[leaseId]/page.tsx");
    const review = source("components/lease-renewal/LiveRenewalReview.tsx");
    expect(workspace).toContain("buildLiveRenewalReviewItemHref");
    expect(workspace).toContain("resolutionDestinations=");
    expect(review).toContain("liveRenewalReviewItemId(flag.sourceTriggerKey)");
  });

  it("passes a typed failed source attempt into the workspace loader instead of retrying", () => {
    const workspace = source("app/lease-renewal/live/desk/lease/[leaseId]/page.tsx");
    expect(workspace).toContain("AttemptedLiveLeaseSnapshotResult");
    expect(workspace).toContain('leaseSnapshotAttempt = { status: "unavailable" }');
    expect(workspace).toMatch(
      /loadLiveRenewalLeaseWorkspace\([\s\S]*?leaseSnapshotAttempt,[\s\S]*?\);/,
    );
  });

  it("upgrades the compat lease route to the guarded canonical workspace without dropping the id", () => {
    const compat = source("app/lease-renewal/lease/[leaseId]/page.tsx");
    expect(compat).toContain('renewalRoleCapability("read_workspace")');
    expect(compat).toContain("requirePageSpaceAccess");
    expect(compat).toContain("buildWorkspaceHref");
    expect(compat).toContain("isStableLeaseId(leaseId)");
    expect(compat).toContain("serializeRenewalDeskQueryV2(parseRenewalDeskQueryV2(");
  });

  it("turns the legacy notices URL into the same Editor-readable canonical experience", () => {
    const legacy = source("app/lease-renewal/live/notices/page.tsx");
    expect(legacy).toContain('renewalRoleCapability("read_workspace")');
    expect(legacy).toContain('redirect("/lease-renewal/live/desk")');
    expect(legacy).not.toMatch(/sample data|sample Renewal Desk/i);
    expect(legacy).not.toContain("loadLiveRenewalNotices");
    expect(source("components/lease-renewal/LiveRenewalNotices.tsx")).not.toMatch(
      /Renewal Desk runs on sample data/i,
    );
  });

  it("keeps table controls at 44px targets inside one contained scroll region", () => {
    const css = source("app/globals.css");
    const s82Start = css.indexOf("/* S82: the table-first renewal desk.");
    expect(s82Start).toBeGreaterThan(-1);
    const s82 = css.slice(s82Start, css.indexOf("/* Metric cards", s82Start));
    expect(s82).toMatch(/\.renewal-th-sort-button \{[\s\S]*?min-height: 44px;/);
    expect(s82).toMatch(/\.renewal-th-filter summary \{[\s\S]*?min-height: 44px;/);
    expect(s82).toMatch(
      /\.renewal-filter-chip-remove \{[\s\S]*?min-height: 44px;[\s\S]*?min-width: 44px;/,
    );
    expect(s82).toMatch(
      /\.renewal-table \.renewal-lease-link,[\s\S]*?min-height: 44px;[\s\S]*?min-width: 44px;/,
    );
    expect(s82).toMatch(/\.renewal-table-scroll \{[\s\S]*?overflow-x: auto;/);
    expect(s82).toMatch(/\.renewal-phase-link \{[\s\S]*?min-height: 44px;/);
    expect(s82).toContain("prefers-reduced-motion");
    // No required fact is hidden by a breakpoint; the table scrolls instead.
    expect(s82).not.toMatch(/display:\s*none/);
    expect(css).toContain(":focus-visible");
  });

  it("provides an accessible desk loading boundary and tests a 200% layout-reflow equivalent", () => {
    const loading = source("app/lease-renewal/live/desk/loading.tsx");
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('aria-live="polite"');
    expect(loading).toContain('role="status"');

    const browser = source("scripts/smoke-renewal-desk-browser.mjs");
    expect(browser).toContain("Emulation.setDeviceMetricsOverride");
    expect(browser).toMatch(/width:\s*340,[\s\S]*height:\s*225,/);
    expect(browser).toContain("deviceScaleFactor: 2");
    expect(browser).toContain("document.documentElement.clientWidth");
    expect(browser).toContain("pageOverflow(zoomPage)");
    expect(browser).not.toContain("Emulation.setPageScaleFactor");
  });

  it("holds the local browser smoke to the complete live cohort and bounded keyboard checks", () => {
    const browser = source("scripts/smoke-renewal-desk-browser.mjs");
    expect(browser).toContain("/lease-renewal/live/desk?v=2&scope=all");
    expect(browser).toContain("DESK_ROUTE_DOM_BUDGET_MS");
    expect(browser).toContain("DESK_INTERACTION_BUDGET_MS");
    expect(browser).toContain("assertFullCohortIntegrity(page)");
    expect(browser).toContain("new Set(stableIds).size === stableIds.length");
    expect(browser).toContain("new Set(workspaceHrefs).size === workspaceHrefs.length");
    expect(browser).toContain("row.workspaceHrefs.length === expectedWorkspaceLinks");
    expect(browser).toContain("row.actionHrefs.length === expectedActionLinks");
    expect(browser).toContain('page.keyboard.press("Enter")');
    expect(browser).toContain('page.keyboard.press("ArrowRight")');
    expect(browser).toContain("assertMinimumTargetSize");
  });

  it("uses only workspace-eligible rows and fails assurance when visible busy state never settles", () => {
    const table = source("components/lease-renewal/RenewalDeskTable.tsx");
    expect(table).toContain('row.disposition !== "skip"');
    expect(table).toContain("data-workspace-available=");

    const selector = 'tr[data-workspace-available="true"] a.renewal-lease-link';
    const browser = source("scripts/smoke-renewal-desk-browser.mjs");
    const canary = source("scripts/run-production-canary.ts");
    expect(browser).toContain(selector);
    expect(canary).toContain(selector);
    expect(canary).toContain("workspaceSelectorsForPhase");
    expect(canary).toMatch(/page\.locator\(selector\)\.first\(\)/);
    expect(canary).toContain('[aria-busy="true"]');
    expect(canary).toMatch(
      /if \(\s*passed &&\s*!\(await waitForSettledRoute\(\s*page,\s*remainingAssuranceTime\(deadlineAtMs, LOADED_STATE_TIMEOUT_MS\),\s*\)\)\s*\) \{[\s\S]*?passed = false;/,
    );
    expect(canary).toMatch(
      /async function waitForSettledRoute[\s\S]*?catch \{\s*return false;\s*\}/,
    );
  });

  it.each([
    "https://localhost:3000",
    "http://localhost.example:3000",
    "http://0.0.0.0:3000",
    "http://127.0.0.1:3000/not-an-origin",
  ])(
    "refuses non-loopback or non-HTTP rehearsal base %s before browser work",
    (baseUrl) => {
      const result = spawnSync(
        process.execPath,
        ["scripts/smoke-renewal-desk-browser.mjs", "--base-url", baseUrl],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            DESK_BROWSER_BASE_URL: "",
            DESK_BROWSER_CDP_URL: "",
          },
        },
      );
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "must be an explicit loopback HTTP local-rehearsal origin",
      );
      expect(`${result.stdout}${result.stderr}`).not.toContain(
        "Chrome or Edge was not found",
      );
    },
  );
});
