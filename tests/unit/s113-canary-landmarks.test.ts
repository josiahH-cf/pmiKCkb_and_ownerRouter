import { describe, expect, it } from "vitest";
import type { Page } from "playwright-core";
import {
  hasRenewalWorkspaceLandmarks,
  isCancelledRoutePrefetch,
  resolveWorkspacePath,
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
  it("separates observed framework prefetch cancellation from failed navigation, API reads and mutations", () => {
    const origin = "https://app.example";
    const request = {
      method: () => "GET",
      resourceType: () => "fetch",
      isNavigationRequest: () => false,
      headers: () => ({ "next-router-prefetch": "1" }),
      failure: () => ({ errorText: "net::ERR_ABORTED" }),
      url: () => `${origin}/work?_rsc=opaque`,
    };
    expect(isCancelledRoutePrefetch(request, origin)).toBe(true);
    for (const changed of [
      { method: () => "POST" },
      { resourceType: () => "document" },
      { isNavigationRequest: () => true },
      { headers: () => ({}) },
      { failure: () => ({ errorText: "net::ERR_CONNECTION_RESET" }) },
      { failure: () => null },
      { url: () => `${origin}/api/work` },
      { url: () => `${origin}/_next/static/example.js` },
      { url: () => "https://elsewhere.example/work" },
    ])
      expect(isCancelledRoutePrefetch({ ...request, ...changed }, origin)).toBe(false);
  });

  it("uses the captured predecessor link when its old table lacks the new eligibility attributes", async () => {
    const page = {
      locator: (selector: string) => ({
        first: () => ({
          count: async () => (selector === "a.renewal-lease-link" ? 1 : 0),
          getAttribute: async () => {
            if (selector !== "a.renewal-lease-link") throw new Error("locator_timeout");
            return "/lease-renewal/live/desk/lease/701?deskView=v%3D2";
          },
        }),
      }),
    } as unknown as Page;
    await expect(
      resolveWorkspacePath(page, "https://app.example", "rollback"),
    ).resolves.toBe("/lease-renewal/live/desk/lease/701?deskView=v%3D2");
    await expect(
      resolveWorkspacePath(page, "https://app.example", "candidate"),
    ).resolves.toBeNull();
  });

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
