import { describe, expect, it } from "vitest";
import type { Page } from "playwright-core";
import {
  hasRenewalWorkspaceLandmarks,
  workspaceSelectorsForPhase,
} from "../../scripts/run-production-canary";

const names = ["Lease details", "Comps", "Owner", "Tenant", "Documents and completion"];
const ids = ["lease-details", "comps", "owner", "tenant", "documents"];
function pageFixture(
  options: {
    legacy?: number;
    missingRegion?: string;
    badHref?: boolean;
    hidden?: boolean;
    duplicateNav?: boolean;
  } = {},
): Page {
  const locator = (count: number, visible = true, href?: string) => ({
    count: async () => count,
    isVisible: async () => visible,
    getAttribute: async () => href,
  });
  const dashboard = {
    ...locator(options.legacy ? 0 : options.duplicateNav ? 2 : 1),
    getByRole: (_role: string, args?: { name?: string }) =>
      args?.name
        ? locator(
            names.includes(args.name) ? 1 : 0,
            !options.hidden,
            options.badHref
              ? "#other-lease"
              : `#renewal-section-${ids[names.indexOf(args.name)]}`,
          )
        : locator(5),
  };
  return {
    getByRole: (role: string, args: { name: string }) =>
      role === "region"
        ? locator(args.name === options.missingRegion ? 0 : 1)
        : args.name === "Renewal dashboard sections"
          ? dashboard
          : {
              ...locator(options.legacy ? 1 : 0),
              getByRole: () => locator(options.legacy ?? 0),
            },
  } as unknown as Page;
}
describe("S113 candidate and captured predecessor workspace landmarks", () => {
  it("selects an active or tracked workflow for full dashboard assurance, not an inspection-only lease", () => {
    const selector = workspaceSelectorsForPhase("candidate");
    expect(selector).toHaveLength(1);
    expect(selector[0]).toContain('[data-workspace-available="true"]');
    expect(selector[0]).toContain(
      ':is([data-disposition="actionable"], [data-retention-state="tracked_incomplete"])',
    );
    expect(workspaceSelectorsForPhase("rollback")).toContain("a.renewal-lease-link");
  });

  it("requires the complete five-section candidate with exact destinations", async () => {
    expect(await hasRenewalWorkspaceLandmarks(pageFixture())).toBe(true);
    for (const options of [
      { missingRegion: "Tenant" },
      { badHref: true },
      { hidden: true },
      { duplicateNav: true },
    ])
      expect(await hasRenewalWorkspaceLandmarks(pageFixture(options))).toBe(false);
  });
  it("preserves the complete six-phase predecessor baseline and refuses a partial rail", async () => {
    expect(await hasRenewalWorkspaceLandmarks(pageFixture({ legacy: 6 }))).toBe(true);
    expect(await hasRenewalWorkspaceLandmarks(pageFixture({ legacy: 5 }))).toBe(false);
  });
});
