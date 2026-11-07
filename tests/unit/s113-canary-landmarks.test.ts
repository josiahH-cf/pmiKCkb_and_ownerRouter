import { describe, expect, it } from "vitest";
import type { Page } from "playwright-core";
import {
  assertSettledRoute,
  hasRenewalWorkspaceLandmarks,
  isCancelledRoutePrefetch,
  resolveWorkspacePath,
  workspaceSelectorsForPhase,
} from "../../scripts/run-production-canary";
import {
  projectRenewalStage,
  type RenewalStageContext,
} from "../../lib/lease-renewal/renewal-stage";
import { countIndependentGuidedWorkspaceMismatches } from "../../scripts/run-production-reconciliation";

const names = [
  "Lease details",
  "Market rent comparison",
  "Owner approval",
  "Tenant offer and response",
  "Documents and completion",
];
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
/** A lease that opened in Focus view (S152): no section navigation, one view switch, one pane. */
function focusFixture(
  options: {
    switches?: number;
    focusPressed?: string | null;
    fullPressed?: string | null;
    fullButtons?: number;
    panes?: number;
    paneVisible?: boolean;
    switchVisible?: boolean;
  } = {},
): Page {
  const locator = (count: number, visible = true, pressed?: string | null) => ({
    count: async () => count,
    isVisible: async () => visible,
    getAttribute: async () => pressed ?? null,
  });
  return {
    getByRole: (role: string, args: { name: string }) => {
      if (role === "group" && args.name === "Lease view")
        return {
          ...locator(options.switches ?? 1, options.switchVisible ?? true),
          getByRole: (_role: string, inner: { name: string }) =>
            // S247: the S152 predecessor's switch offers no Guided view.
            inner.name === "Guided view"
              ? locator(0)
              : inner.name === "Focus view"
                ? locator(
                    1,
                    true,
                    options.focusPressed === undefined ? "true" : options.focusPressed,
                  )
                : locator(
                    options.fullButtons ?? 1,
                    true,
                    options.fullPressed === undefined ? "false" : options.fullPressed,
                  ),
        };
      if (role === "region" && args.name === "Focus view")
        return locator(options.panes ?? 1, options.paneVisible ?? true);
      // No Full view section navigation and no legacy phase navigation on a Focus-default page.
      return { ...locator(0), getByRole: () => locator(0) };
    },
  } as unknown as Page;
}
/** S247: a lease that opened in Guided view, rendered exactly as the contract names it. */
interface GuidedOptions {
  switchButtons?: number;
  pressed?: Partial<Record<"Guided view" | "Focus view" | "Full view", string | null>>;
  regions?: number;
  regionVisible?: boolean;
  focusRegions?: number;
  paths?: number;
  steps?: readonly string[];
  currentSteps?: number;
  nows?: number;
  primaries?: number;
  primaryVisible?: boolean;
  sectionNavs?: number;
  sectionLinks?: number;
  badSectionHref?: boolean;
  hiddenSectionLink?: boolean;
  stageLines?: number;
  stageText?: string;
  stageCurrentStep?: string | null;
  pathCurrentStep?: string | null;
  nowStep?: string | null;
  nextSteps?: number;
  nextStepText?: string;
  primaryBeforeContext?: boolean;
  primaryLabel?: string;
  primaryTarget?: string | null;
  primaryTargetPresent?: boolean;
  workFieldsOutsideNow?: number;
  workingFigureFeedbackPresent?: boolean;
  primaryTop?: number;
  primaryBottom?: number;
  viewportHeight?: number;
  viewportWidth?: number;
}
const GUIDED_STEPS = [
  "Check the numbers",
  "Compare market rent",
  "Ask the owner",
  "Offer the tenant",
  "Documents and signatures",
  "Finish up",
  "Complete",
] as const;
function guidedFixture(options: GuidedOptions = {}): Page {
  const locator = (count: number, visible = true, attribute?: string | null) => ({
    count: async () => count,
    isVisible: async () => visible,
    getAttribute: async () => attribute ?? null,
  });
  const pressed = {
    "Guided view": "true",
    "Focus view": "false",
    "Full view": "false",
    ...options.pressed,
  } as Record<string, string | null>;
  const steps = options.steps ?? GUIDED_STEPS;
  const path = {
    ...locator(options.paths ?? 1),
    getByRole: () => ({
      count: async () => steps.length,
      nth: (index: number) => ({ textContent: async () => steps[index] ?? null }),
    }),
    locator: () => ({
      ...locator(options.currentSteps ?? 1),
      evaluate: async () =>
        options.pathCurrentStep === undefined ? "check-numbers" : options.pathCurrentStep,
    }),
  };
  const now = {
    ...locator(
      options.nows ?? 1,
      true,
      options.nowStep === undefined ? "check-numbers" : options.nowStep,
    ),
    evaluate: async () => ({
      primaryBeforeContext: options.primaryBeforeContext ?? true,
      workingFigureFeedbackPresent: options.workingFigureFeedbackPresent ?? true,
      primaryTop: options.primaryTop ?? 100,
      primaryBottom: options.primaryBottom ?? 144,
      viewportHeight: options.viewportHeight ?? 800,
      viewportWidth: options.viewportWidth ?? 1280,
    }),
    locator: (selector: string) =>
      selector.includes("next-step")
        ? {
            ...locator(options.nextSteps ?? 1),
            textContent: async () =>
              options.nextStepText ?? "Next step: Check the numbers",
          }
        : {
            ...locator(
              options.primaries ?? 1,
              options.primaryVisible ?? true,
              options.primaryTarget ?? null,
            ),
            textContent: async () => options.primaryLabel ?? "Check the numbers",
            evaluate: async () => options.primaryTargetPresent ?? true,
          },
  };
  const sections = {
    ...locator(options.sectionNavs ?? 1),
    getByRole: (_role: string, args?: { name?: string }) =>
      args?.name
        ? locator(
            names.includes(args.name) ? 1 : 0,
            !(options.hiddenSectionLink && args.name === names[2]),
            options.badSectionHref && args.name === names[1]
              ? "#renewal-section-owner"
              : `#renewal-section-${ids[names.indexOf(args.name)]}`,
          )
        : locator(options.sectionLinks ?? 5),
  };
  const region = {
    ...locator(options.regions ?? 1, options.regionVisible ?? true),
    evaluate: async () => options.workFieldsOutsideNow ?? 0,
    locator: () => ({
      ...locator(
        options.stageLines ?? 1,
        true,
        options.stageCurrentStep === undefined
          ? "check-numbers"
          : options.stageCurrentStep,
      ),
      textContent: async () =>
        options.stageText ??
        "Checking the numbers, waiting on the PMI KC team, nothing recorded yet",
    }),
    getByRole: (role: string, args: { name: string }) =>
      role === "navigation" && args.name === "Renewal path"
        ? path
        : role === "region" && args.name === "Now"
          ? now
          : role === "navigation" && args.name === "Every section in Full view"
            ? sections
            : locator(0),
  };
  return {
    getByRole: (role: string, args: { name: string }) => {
      if (role === "group" && args.name === "Lease view")
        return {
          ...locator(1),
          getByRole: (_role: string, inner?: { name: string }) =>
            inner?.name
              ? locator(
                  ["Guided view", "Focus view", "Full view"].includes(inner.name) ? 1 : 0,
                  true,
                  pressed[inner.name],
                )
              : locator(options.switchButtons ?? 3),
        };
      if (role === "region" && args.name === "Guided view") return region;
      if (role === "region" && args.name === "Focus view")
        return locator(options.focusRegions ?? 0);
      // No Full view section navigation and no legacy phase navigation on a Guided page.
      return { ...locator(0), getByRole: () => locator(0) };
    },
  } as unknown as Page;
}
describe("S113 candidate and captured predecessor workspace landmarks", () => {
  it("S247: accepts a lease that opened in Guided view only with its exact contract", async () => {
    expect(await hasRenewalWorkspaceLandmarks(guidedFixture())).toBe(true);
    // A month-to-month lease's path starts with its review step.
    expect(
      await hasRenewalWorkspaceLandmarks(
        guidedFixture({ steps: ["Month-to-month review", ...GUIDED_STEPS] }),
      ),
    ).toBe(true);
    for (const options of [
      { switchButtons: 2 },
      { switchButtons: 4 },
      { pressed: { "Guided view": "false" } },
      { pressed: { "Guided view": null } },
      { pressed: { "Focus view": "true" } },
      { pressed: { "Full view": "true" } },
      { regions: 0 },
      { regions: 2 },
      { regionVisible: false },
      { focusRegions: 1 },
      { paths: 0 },
      { paths: 2 },
      { steps: GUIDED_STEPS.slice(0, 6) },
      { steps: [...GUIDED_STEPS].reverse() },
      { steps: ["Compare market rent", ...GUIDED_STEPS.slice(1)] },
      { currentSteps: 0 },
      { currentSteps: 2 },
      { nows: 0 },
      { nows: 2 },
      { primaries: 0 },
      { primaries: 2 },
      { primaryVisible: false },
      { sectionNavs: 0 },
      { sectionLinks: 4 },
      { badSectionHref: true },
      { hiddenSectionLink: true },
      { stageLines: 0 },
      { stageLines: 2 },
      { stageText: " " },
      { stageCurrentStep: null },
      { pathCurrentStep: "ask-owner" },
      { nowStep: "ask-owner" },
      { nextSteps: 0 },
      { nextSteps: 2 },
      { nextStepText: "Next step: " },
      { primaryBeforeContext: false },
      { primaryTop: -1 },
      { primaryBottom: 805 },
      { primaryBottom: NaN },
      { viewportHeight: 0 },
      { viewportWidth: 0 },
      { workFieldsOutsideNow: 1 },
      { workingFigureFeedbackPresent: false },
      {
        primaryLabel: "Add the owner's email on the owner record in RentVine",
        primaryTarget: "renewal-card-message-owner",
      },
      {
        primaryLabel: "Add the owner's email on the owner record in RentVine",
        primaryTarget: "renewal-message-owner-recipients",
        primaryTargetPresent: false,
      },
    ] satisfies GuidedOptions[])
      expect(
        await hasRenewalWorkspaceLandmarks(guidedFixture(options)),
        JSON.stringify(options),
      ).toBe(false);
  });

  it("independently reconciles the visible stage, path and Now step without application projections", () => {
    const snapshot = {
      stageLines: 1,
      stageText: "Checking the numbers, waiting on the PMI KC team, nothing recorded yet",
      stageCurrentStep: "check-numbers",
      pathCurrentStep: "check-numbers",
      nowStep: "check-numbers",
      nextSteps: 1,
      nextStepText: "Next step: Check the numbers",
      primaryBeforeContext: true,
      primaryLabel: "Check the numbers",
      primaryTarget: null,
      primaryTargetPresent: false,
      workFieldsOutsideNow: 0,
      workingFigureFeedbackPresent: true,
      primaryTop: 100,
      primaryBottom: 144,
      viewportHeight: 800,
      viewportWidth: 1280,
    };
    expect(countIndependentGuidedWorkspaceMismatches(snapshot)).toBe(0);
    expect(
      countIndependentGuidedWorkspaceMismatches({
        ...snapshot,
        workingFigureFeedbackPresent: false,
      }),
    ).toBe(1);
    expect(
      countIndependentGuidedWorkspaceMismatches({ ...snapshot, primaryBottom: 805 }),
    ).toBe(1);
    expect(
      countIndependentGuidedWorkspaceMismatches({
        ...snapshot,
        primaryBottom: 1642.25,
        viewportWidth: 390,
      }),
    ).toBe(1);
    expect(
      countIndependentGuidedWorkspaceMismatches({
        ...snapshot,
        primaryBottom: 1586,
        viewportWidth: 390,
      }),
    ).toBe(0);
    expect(
      countIndependentGuidedWorkspaceMismatches({ ...snapshot, primaryTop: -1 }),
    ).toBe(1);
    expect(
      countIndependentGuidedWorkspaceMismatches({ ...snapshot, nowStep: "ask-owner" }),
    ).toBe(1);
    expect(countIndependentGuidedWorkspaceMismatches({ ...snapshot, nextSteps: 2 })).toBe(
      1,
    );
    expect(
      countIndependentGuidedWorkspaceMismatches({ ...snapshot, stageText: "" }),
    ).toBe(1);
    expect(
      countIndependentGuidedWorkspaceMismatches({
        ...snapshot,
        primaryBeforeContext: false,
      }),
    ).toBe(1);
    const recipient = {
      ...snapshot,
      primaryLabel: "Add the owner's email on the owner record in RentVine",
      primaryTarget: "renewal-message-owner-recipients",
      primaryTargetPresent: true,
    };
    expect(countIndependentGuidedWorkspaceMismatches(recipient)).toBe(0);
    expect(
      countIndependentGuidedWorkspaceMismatches({
        ...recipient,
        primaryTarget: "renewal-card-message-owner",
      }),
    ).toBe(1);
    expect(
      countIndependentGuidedWorkspaceMismatches({
        ...recipient,
        primaryTargetPresent: false,
      }),
    ).toBe(1);
    expect(
      countIndependentGuidedWorkspaceMismatches({ ...snapshot, workFieldsOutsideNow: 1 }),
    ).toBe(1);
  });

  it("S250/S251: the lease landmark contract holds for the covered and the assisted variants", async () => {
    const context: RenewalStageContext = {
      leaseId: "9102",
      staffRecordUnavailable: false,
      standingAgreement: null,
      housingAssistance: null,
      numbers: { verified: true, openDifferences: 0 },
      term: { monthToMonth: false, reviewNeeded: false },
      moveOutInitiated: false,
      sourceRenewal: null,
      verification: null,
      handStatus: null,
      lastContactAtIso: null,
      threadCheck: null,
      outreach: null,
    };
    const covered = projectRenewalStage(
      null,
      {
        ...context,
        standingAgreement: {
          label: "Example Standing Agreement",
          reason: "Covered by Example Standing Agreement: no owner message needed",
        },
      },
      { standingCovered: true },
    );
    const assisted = projectRenewalStage(null, {
      ...context,
      leaseId: "9103",
      housingAssistance: { program: "Example Housing Assistance Office" },
    });
    for (const stage of [covered, assisted]) {
      const steps = stage.steps.map((step) => step.label);
      expect(steps[0]).toBe("Check the numbers");
      expect(steps.at(-1)).toBe("Complete");
      expect(stage.steps.filter((step) => step.id === stage.currentStepId)).toHaveLength(
        1,
      );
      expect(await hasRenewalWorkspaceLandmarks(guidedFixture({ steps }))).toBe(true);
    }
    // The assisted order is in the strip the contract reads; the contract is not loosened.
    expect(assisted.steps.map((step) => step.label)).toContain(
      "Contact Example Housing Assistance Office about the renewal process",
    );
    expect(
      await hasRenewalWorkspaceLandmarks(
        guidedFixture({ steps: assisted.steps.map((step) => step.label).slice(1) }),
      ),
    ).toBe(false);
  });

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

  it("S152: accepts a lease that opened in Focus view only with its exact switch and pane", async () => {
    expect(await hasRenewalWorkspaceLandmarks(focusFixture())).toBe(true);
    for (const options of [
      { switches: 0 },
      { switches: 2 },
      { switchVisible: false },
      { focusPressed: "false" },
      { focusPressed: null },
      { fullPressed: "true" },
      { fullButtons: 0 },
      { panes: 0 },
      { panes: 2 },
      { paneVisible: false },
    ])
      expect(
        await hasRenewalWorkspaceLandmarks(focusFixture(options)),
        JSON.stringify(options),
      ).toBe(false);
  });

  it("requires the complete five-section candidate with exact destinations", async () => {
    expect(await hasRenewalWorkspaceLandmarks(pageFixture())).toBe(true);
    for (const options of [
      { missingRegion: "Tenant offer and response" },
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

// A route's landmark is asserted only once the page has settled. Panels that load asynchronously
// (the work board, for example) show a loading state with its own heading first, so an assertion
// taken 750 ms after navigation raced the board's request and reported a missing landmark on a
// healthy page (S115 candidate assurance, 2026-09-16). The settle wait must come first.
describe("settled-route landmark assertion", () => {
  it("does not assert a landmark on a page that never settles and reports it as missing", async () => {
    let asserted = 0;
    const result = await assertSettledRoute(
      async () => false,
      async () => {
        asserted += 1;
        return { passed: true };
      },
    );
    expect(result).toEqual({ passed: false, diagnostic: "landmark_missing" });
    expect(asserted).toBe(0);
  });
  it("asserts the landmark after the page settles and returns that assertion unchanged", async () => {
    const order: string[] = [];
    const result = await assertSettledRoute(
      async () => {
        order.push("settle");
        return true;
      },
      async () => {
        order.push("assert");
        return { passed: false, diagnostic: "auth_mismatch" };
      },
    );
    expect(order).toEqual(["settle", "assert"]);
    expect(result).toEqual({ passed: false, diagnostic: "auth_mismatch" });
  });
});
