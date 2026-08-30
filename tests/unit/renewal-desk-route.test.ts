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
    expect(desk).toContain("parseRenewalDeskQuery");
    expect(desk).toContain('renewalRoleCapability("read_workspace")');
    expect(desk).not.toContain("startIso = now.toISOString().slice(0, 10)");
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

  it("keeps every control and action at a keyboard-visible 44px target with narrow fact parity", () => {
    const css = source("app/globals.css");
    expect(css).toMatch(
      /\.renewal-desk-control input,[\s\S]*?\.renewal-desk-control select \{[\s\S]*?min-height: 44px;/,
    );
    expect(css).toMatch(/\.renewal-desk-control-actions a \{[\s\S]*?min-height: 44px;/);
    const s78Start = css.indexOf("/* S78: dense, URL-backed renewal triage.");
    const s78 = css.slice(s78Start, css.indexOf("/* Metric cards", s78Start));
    expect(s78).toContain("@media (max-width: 760px)");
    expect(s78).toContain(".renewal-fact-grid");
    expect(s78).not.toMatch(/display:\s*none/);
    expect(css).toContain(":focus-visible");
  });
});
