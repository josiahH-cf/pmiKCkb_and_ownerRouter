import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { HELP_MANUAL } from "@/lib/help";
import { HELP_SCENE_MANIFEST } from "@/lib/help/scenes";
import type { HelpGuide } from "@/lib/help/types";
import { HELP_VERSION } from "@/lib/help/version";
import {
  enumerateStaffRoutes,
  evaluateHelpCoverage,
  runHelpCoverage,
} from "@/scripts/check-help-coverage.mjs";
import {
  checkHelpControlSources,
  collectHelpControls,
  normalizeSourceText,
  runHelpControlSources,
} from "@/scripts/check-help-controls.mjs";
import {
  collectHelpStrings,
  evaluateHelpContent,
} from "@/scripts/check-help-content.mjs";
import {
  evaluateHelpScreenshots,
  pngSize,
  runHelpScreenshots,
} from "@/scripts/check-help-screenshots.mjs";

// S242 R-S242-7..10: the four help gates, each proved failing on a fixture and passing on the tree.

const guide = (overrides: Partial<HelpGuide> = {}): HelpGuide => ({
  id: "fixture-guide",
  section: "search",
  title: "Fixture guide",
  audience: "All staff",
  purpose: "Find a record.",
  prerequisites: [],
  steps: [
    {
      id: "open-search",
      action: "Open search.",
      control: {
        label: "Search records",
        role: "combobox",
        availability: "required",
        source: ["components/search/GlobalEntitySearch.tsx"],
      },
      route: "/search",
      where: "Top of every page",
      result: "The results list opens.",
      effect: "reads",
      scene: "fixture-scene",
    },
  ],
  result: "The record opens.",
  doesNotDo: ["The app does not change a record from search."],
  relatedGuides: [],
  relatedScreens: [],
  lastUpdated: "2026-11-04",
  navItems: ["help"],
  spaces: ["move-in"],
  ...overrides,
});

const manual = (guides: HelpGuide[]) => ({
  guides,
  screens: [],
  glossary: [],
  changelog: [],
});

describe("S242 ARCH-S242-3 / AC-S242-2: coverage gate", () => {
  const inputs = {
    routes: ["/search", "/work"],
    navItems: ["help"],
    spaces: ["move-in"],
    aboutIds: [] as string[],
  };

  it("fails naming an undocumented route, passes when it is allow-listed with a reason", () => {
    const failing = evaluateHelpCoverage({
      ...inputs,
      manual: manual([guide()]),
      allowList: [],
    });
    expect(failing.problems).toContain(
      "Unreferenced route /work: no guide or screen reference documents it.",
    );
    const explained = evaluateHelpCoverage({
      ...inputs,
      manual: manual([guide()]),
      allowList: [
        { kind: "route", id: "/work", reason: "Redirect-only page that opens My Work." },
      ],
    });
    expect(explained.problems).toEqual([]);
  });

  it("an allow-list entry without a reason still fails", () => {
    const result = evaluateHelpCoverage({
      ...inputs,
      manual: manual([guide()]),
      allowList: [{ kind: "route", id: "/work", reason: " " }],
    });
    expect(result.problems.join("\n")).toMatch(
      /Allow-listed route \/work needs a one-line reason/,
    );
  });

  it("fails on orphan help that names a route or id the app does not have", () => {
    const orphan = guide({
      steps: [{ ...guide().steps[0], route: "/no-such-page" }],
    });
    const result = evaluateHelpCoverage({
      ...inputs,
      manual: manual([orphan]),
      allowList: [],
    });
    expect(result.problems).toContain(
      "Orphan help reference: route /no-such-page does not exist in the app.",
    );
  });

  it("matches deep links to their page and still rejects an unknown page", () => {
    const deepLink = (route: string) =>
      guide({ steps: [{ ...guide().steps[0], route }] });
    expect(
      evaluateHelpCoverage({
        ...inputs,
        manual: manual([deepLink("/search?q=example#results"), deepLink("/work#tasks")]),
        allowList: [],
      }).problems,
    ).toEqual([]);
    expect(
      evaluateHelpCoverage({
        ...inputs,
        manual: manual([deepLink("/unknown?q=example#results")]),
        allowList: [],
      }).problems,
    ).toContain("Orphan help reference: route /unknown does not exist in the app.");
  });

  it("removing one documented route from the real content fails naming that route", () => {
    const real = runHelpCoverage();
    expect(real.problems).toEqual([]);
    const screens = HELP_MANUAL.screens.map((screen) => ({
      ...screen,
      routes: screen.routes.filter((route) => route !== "/notifications"),
    }));
    const guides = HELP_MANUAL.guides.map((entry) => ({
      ...entry,
      steps: entry.steps.filter((step) => step.route !== "/notifications"),
    }));
    const result = evaluateHelpCoverage({
      routes: enumerateStaffRoutes(),
      navItems: [...real.referenced.navItem],
      spaces: [...real.referenced.space],
      aboutIds: [...real.referenced.aboutId],
      manual: { ...HELP_MANUAL, screens, guides },
      allowList: [],
    });
    expect(result.problems).toContain(
      "Unreferenced route /notifications: no guide or screen reference documents it.",
    );
  });

  it("enumerates staff routes without api, sign-in or the Vendor portal", () => {
    const routes = enumerateStaffRoutes();
    expect(routes).toContain("/");
    expect(routes).toContain("/help");
    expect(routes).toContain("/lease-renewal/live/desk/lease/[leaseId]");
    expect(routes.some((route) => /^\/(api|sign-in|vendor)(\/|$)/.test(route))).toBe(
      false,
    );
  });
});

describe("S242 ARCH-S242-4 / AC-S242-3: control-name gate", () => {
  it("fails naming the guide, step and expected label when a control is renamed", () => {
    const controls = collectHelpControls(manual([guide()]));
    const renamed = readFileSync(
      join(process.cwd(), "components/search/GlobalEntitySearch.tsx"),
      "utf8",
    ).replaceAll("Search records", "Find records");
    const problems = checkHelpControlSources(controls, (path: string) =>
      path === "components/search/GlobalEntitySearch.tsx" ? renamed : null,
    );
    expect(problems).toEqual([
      'guide fixture-guide step open-search: the interface no longer renders "Search records" (combobox) in components/search/GlobalEntitySearch.tsx.',
    ]);
  });

  it("passes for the real label and folds JSX spacing and entities", () => {
    const controls = collectHelpControls(manual([guide()]));
    expect(
      checkHelpControlSources(controls, (path: string) =>
        readFileSync(join(process.cwd(), path), "utf8"),
      ),
    ).toEqual([]);
    expect(normalizeSourceText('Open this lookup&apos;s{" "}\n   report')).toBe(
      "Open this lookup's report",
    );
  });

  it("an About trigger must match its section help label", () => {
    const about = guide({
      steps: [
        {
          ...guide().steps[0],
          control: {
            label: "About Lease detail",
            role: "button",
            availability: "required",
            source: ["lib/lease-renewal/section-help.ts"],
            aboutId: "section-lease-details",
          },
        },
      ],
    });
    expect(
      checkHelpControlSources(collectHelpControls(manual([about])), () => ""),
    ).toEqual([
      'guide fixture-guide step open-search: expected the About trigger "About Lease details" but the guide names "About Lease detail".',
    ]);
  });

  it("every control the shipped content names matches the interface source", () => {
    expect(runHelpControlSources().problems).toEqual([]);
  });
});

describe("S242 ARCH-S242-5 / AC-S242-4 and S243 ARCH-S243-1 / ARCH-S243-3: screenshot gate", () => {
  const png = (width: number, height: number) => {
    const bytes = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
    bytes.writeUInt32BE(width, 16);
    bytes.writeUInt32BE(height, 20);
    return bytes;
  };
  const scene = {
    id: "fixture-scene",
    guide: "fixture-guide",
    step: "open-search",
    route: "/search",
    role: "Editor",
    fixture: "Synthetic leases",
    viewport: { width: 1280, height: 800 },
    region: "main",
    frame: "viewport",
    source: "rehearsal",
    alt: "Search results",
    caption: "Search results.",
  };
  const evaluate = (overrides: Record<string, unknown> = {}) =>
    evaluateHelpScreenshots({
      manual: manual([guide()]),
      manifest: { version: "V1.0", routeParameters: {}, scenes: [scene] },
      helpVersion: "V1.0",
      images: new Map([["fixture-scene.png", png(1280, 800)]]),
      versions: ["V1.0"],
      ...overrides,
    });

  it("passes a referenced, manifested image", () => {
    expect(evaluate()).toEqual([]);
    expect(pngSize(png(375, 812))).toEqual({ width: 375, height: 812 });
  });

  it("fails when a referenced image is deleted", () => {
    expect(evaluate({ images: new Map() })).toContain(
      "scene fixture-scene has no image public/help/V1.0/fixture-scene.png.",
    );
  });

  it("fails on an image nobody references and on an unmanifested image", () => {
    const problems = evaluate({
      images: new Map([
        ["fixture-scene.png", png(1280, 800)],
        ["stray.png", png(1280, 800)],
      ]),
    });
    expect(problems).toContain(
      "public/help/V1.0/stray.png is missing from the scene manifest.",
    );
    const orphan = evaluateHelpScreenshots({
      manual: manual([guide({ steps: [{ ...guide().steps[0], scene: undefined }] })]),
      manifest: { version: "V1.0", routeParameters: {}, scenes: [scene] },
      helpVersion: "V1.0",
      images: new Map([["fixture-scene.png", png(1280, 800)]]),
      versions: ["V1.0"],
    });
    expect(orphan).toContain("scene fixture-scene is referenced by no step.");
  });

  it("fails a scene naming an unknown guide step", () => {
    const problems = evaluateHelpScreenshots({
      manual: manual([guide()]),
      manifest: {
        version: "V1.0",
        routeParameters: {},
        scenes: [{ ...scene, step: "no-such-step" }],
      },
      helpVersion: "V1.0",
      images: new Map([["fixture-scene.png", png(1280, 800)]]),
      versions: ["V1.0"],
    });
    expect(problems).toContain(
      "scene fixture-scene names unknown guide step fixture-guide#no-such-step.",
    );
  });

  it("a production-blurred scene needs its reason, date and attestation", () => {
    const problems = evaluateHelpScreenshots({
      manual: manual([guide()]),
      manifest: {
        version: "V1.0",
        routeParameters: {},
        scenes: [{ ...scene, source: "production-blurred" }],
      },
      helpVersion: "V1.0",
      images: new Map([["fixture-scene.png", png(1280, 800)]]),
      versions: ["V1.0"],
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        "scene fixture-scene is production-blurred without a reason.",
        "scene fixture-scene is production-blurred without a capture date.",
        "scene fixture-scene is production-blurred without an attestation.",
      ]),
    );
  });

  it("the shipped manifest, images and steps agree", () => {
    expect(HELP_SCENE_MANIFEST.version).toBe(HELP_VERSION);
    expect(runHelpScreenshots()).toEqual([]);
  });
});

describe("S242 R-S242-10 / BEH-S242-5 / AC-S242-7: content rules gate", () => {
  it('a guide containing "coming soon" fails naming the guide; present tense passes', () => {
    const failing = evaluateHelpContent(
      collectHelpStrings(
        { ...manual([guide({ purpose: "Bulk search is coming soon." })]), sections: [] },
        { sectionHelp: {}, dispositions: [] },
      ),
    );
    expect(failing).toEqual([
      'guide fixture-guide purpose: roadmap or hold phrase "coming soon".',
    ]);
    const passing = evaluateHelpContent(
      collectHelpStrings(
        {
          ...manual([guide({ purpose: "Search finds one record at a time." })]),
          sections: [],
        },
        { sectionHelp: {}, dispositions: [] },
      ),
    );
    expect(passing).toEqual([]);
  });

  it("an em dash, a hold identifier or a client name fails with its location", () => {
    const problems = evaluateHelpContent(
      collectHelpStrings(
        {
          ...manual([
            guide({
              purpose: "Open search — then pick a record.",
              result: "The record waits on B-GCP-REINDEX.",
              doesNotDo: ["Dan approves nothing here."],
            }),
          ]),
          sections: [],
        },
        { sectionHelp: {}, dispositions: [] },
      ),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        "guide fixture-guide purpose: em dash.",
        'guide fixture-guide result: hold identifier "B-GCP-REINDEX".',
        'guide fixture-guide "What this does not do" 1: superseded statement "Dan approves".',
      ]),
    );
  });

  it("a verbatim interface label is exempt from the phrase rules only", () => {
    const labelled = guide({
      steps: [
        {
          ...guide().steps[0],
          action: "Choose Prepare future renewal rent.",
          control: { ...guide().steps[0].control, label: "Prepare future renewal rent" },
        },
      ],
    });
    expect(
      evaluateHelpContent(
        collectHelpStrings(
          { ...manual([labelled]), sections: [] },
          { sectionHelp: {}, dispositions: [] },
        ),
      ),
    ).toEqual([]);
  });

  it("the shipped help content passes", () => {
    expect(evaluateHelpContent(collectHelpStrings())).toEqual([]);
  });
});
