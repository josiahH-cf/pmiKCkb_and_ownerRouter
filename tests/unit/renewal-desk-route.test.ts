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
    expect(desk).toContain("buildRenewalDeskWindow");
    expect(desk).toContain("parseRenewalDeskQueryV2");
    expect(desk).toContain('renewalRoleCapability("read_workspace")');
    expect(desk).not.toContain("startIso = now.toISOString().slice(0, 10)");
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
    expect(s82).toMatch(/\.renewal-table-scroll \{[\s\S]*?overflow-x: auto;/);
    expect(s82).toMatch(/\.renewal-phase-link \{[\s\S]*?min-height: 44px;/);
    expect(s82).toContain("prefers-reduced-motion");
    // No required fact is hidden by a breakpoint; the table scrolls instead.
    expect(s82).not.toMatch(/display:\s*none/);
    expect(css).toContain(":focus-visible");
  });
});
