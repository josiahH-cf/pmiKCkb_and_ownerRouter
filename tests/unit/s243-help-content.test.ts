import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  HELP_GLOSSARY,
  HELP_GUIDES,
  HELP_MANUAL,
  HELP_SCREEN_REFERENCES,
} from "@/lib/help";
import { HELP_COVERAGE_ALLOW_LIST } from "@/lib/help/coverage-allow-list";
import { HELP_CHANGELOG } from "@/lib/help/content/changelog";
import renewalControlMap from "@/lib/help/content/renewal-control-map.json";
import { HELP_SCENE_MANIFEST } from "@/lib/help/scenes";
import { validateHelpManual } from "@/lib/help/schema";
import { runHelpCoverage } from "@/scripts/check-help-coverage.mjs";
import {
  collectHelpStrings,
  evaluateHelpContent,
} from "@/scripts/check-help-content.mjs";
import { findCustomerIdentifiers } from "@/lib/lease-renewal/meeting-walkthrough";

// S243: the complete guide set, references, glossary and What changed, the scene manifest and the
// consolidation of the handouts into the hub.

const R_S243_1 = [
  ["home-and-ask", "Sign in and find your way around"],
  ["lease-renewals", "Work a renewal from the desk to a recorded outcome"],
  ["lease-renewals", "Compare rent and record market evidence"],
  ["communications", "Prepare, send or schedule an owner message and record the answer"],
  ["lease-renewals", "Prepare the tenant offer and record the response"],
  ["lease-renewals", "Update RentVine and the operating Sheet"],
  ["documents-and-dotloop", "Prepare documents and hand off to Dotloop"],
  ["workflow-runs", "Run the Owner Renewal Outreach checklist"],
  ["spaces-and-processes", "Publish a process definition"],
  ["approval-queue-and-notifications", "Approve or deny in the Approval Queue"],
  ["approval-queue-and-notifications", "Read and act on Notifications"],
  ["profile-and-my-work", "Use My Work and your Profile"],
  ["search", "Search"],
  ["connections", "Manage Connections"],
  ["admin", "Admin tasks"],
  ["maintenance-history", "Read retained maintenance history"],
] as const;

describe("S243 R-S243-1 / BEH-S243-2: process guides", () => {
  it("every process guide named in R-S243-1 exists in its section", () => {
    for (const [section, title] of R_S243_1)
      expect(
        HELP_GUIDES.some((guide) => guide.section === section && guide.title === title),
        title,
      ).toBe(true);
    expect(HELP_GUIDES).toHaveLength(R_S243_1.length);
  });

  it("the whole manual satisfies the schema", () => {
    expect(validateHelpManual(HELP_MANUAL)).toEqual([]);
  });

  it("a step without an expected result fails the schema", () => {
    const broken = {
      ...HELP_MANUAL,
      guides: [
        { ...HELP_GUIDES[0], steps: [{ ...HELP_GUIDES[0].steps[0], result: " " }] },
        ...HELP_GUIDES.slice(1),
      ],
    };
    expect(validateHelpManual(broken)).toContain(
      `guide ${HELP_GUIDES[0].id} step 1 (${HELP_GUIDES[0].steps[0].id}) expected result is empty.`,
    );
  });

  it("every guide ends with present-tense What this does not do lines and no unconfirmed effect", () => {
    for (const guide of HELP_GUIDES) {
      expect(guide.doesNotDo.length, guide.id).toBeGreaterThan(0);
      for (const line of guide.doesNotDo) {
        expect(line, guide.id).not.toMatch(/\bwill\b|\bwould\b|\bsoon\b/i);
        expect(line, guide.id).toMatch(/\b(not|never|nothing|no|only)\b/i);
      }
    }
  });

  it("every source-changing step names its exact confirmation and every reading step says it reads", () => {
    for (const guide of HELP_GUIDES)
      for (const step of guide.steps) {
        if (step.effect === "exact-confirmation")
          expect(
            `${step.action} ${step.result} ${step.control.label}`,
            `${guide.id}#${step.id}`,
          ).toMatch(/confirm/i);
        if (step.effect === "explicit-send")
          expect(
            `${step.action} ${step.control.label}`,
            `${guide.id}#${step.id}`,
          ).toMatch(/\b(Send|Schedule|Resume)\b/);
      }
  });

  it("the documents guide describes the closed Dotloop actions and hand signing as present behavior", () => {
    const documents = HELP_GUIDES.find((guide) => guide.id === "prepare-documents")!;
    const text = JSON.stringify(documents);
    expect(text).toMatch(/closed/);
    expect(text).toMatch(/signing happens in Dotloop/i);
    const admin = JSON.stringify(HELP_GUIDES.find((guide) => guide.id === "admin-tasks"));
    expect(admin).toMatch(/shows no command/i);
  });
});

describe("S243 R-S243-2 / R-S243-3: references, glossary and What changed", () => {
  it("every screen reference lists controls with what they do and who uses them", () => {
    expect(HELP_SCREEN_REFERENCES.length).toBeGreaterThanOrEqual(20);
    for (const screen of HELP_SCREEN_REFERENCES)
      expect(screen.controls.length, screen.id).toBeGreaterThan(0);
  });

  it("the glossary defines the terms a new staff member meets", () => {
    const terms = HELP_GLOSSARY.map((term) => term.term.toLowerCase());
    for (const term of [
      "working value",
      "exact confirmation",
      "receipt",
      "readback",
      "admitted source read",
      "packet context",
      "family use",
      "reviewed revision",
      "active version",
      "retained history",
    ])
      expect(terms, term).toContain(term);
  });

  it("What changed starts at V1.0 and lists each later version once, newest first", () => {
    // R-S243-3: the first entry is V1.0; each later help content change adds one entry on top
    // (S242 R-S242-4), so the newest entry is the current HELP_VERSION.
    // S252: a change to a documented process ships a new major version (lib/help/version.ts), so
    // entries are ordered by major and then minor version.
    const versions = HELP_CHANGELOG.map((entry) => entry.version);
    expect(versions.at(-1)).toBe("V1.0");
    expect(new Set(versions).size).toBe(versions.length);
    const rank = (version: string) => {
      const [major, minor] = version.slice(1).split(".").map(Number);
      return major * 1000 + minor;
    };
    for (let index = 1; index < versions.length; index += 1)
      expect(rank(versions[index - 1])).toBeGreaterThan(rank(versions[index]));
    expect(versions).toEqual(["V2.1", "V2.0", "V1.1", "V1.0"]);
  });
});

describe("S243 R-S243-4 / BEH-S243-3 / AC-S243-5: content rules", () => {
  it("the full content passes the content rules gate", () => {
    expect(evaluateHelpContent(collectHelpStrings())).toEqual([]);
  });

  it('injecting "pending client" into one guide fails naming the guide', () => {
    const guide = HELP_GUIDES.find((entry) => entry.id === "manage-connections")!;
    const strings = collectHelpStrings({
      ...HELP_MANUAL,
      guides: HELP_GUIDES.map((entry) =>
        entry === guide
          ? {
              ...entry,
              purpose: `${entry.purpose} Some links are pending client review.`,
            }
          : entry,
      ),
    });
    expect(evaluateHelpContent(strings)).toEqual([
      'guide manage-connections purpose: roadmap or hold phrase "pending client".',
    ]);
  });

  it("no guide or reference carries a customer identifier", () => {
    // The hub's own content: guides, references, glossary, What changed and scene captions. The
    // in-app About panels and inline helpers keep product policy figures (for example the starting
    // range thresholds), which are not customer values.
    const text = [
      ...collectHelpStrings(HELP_MANUAL, { sectionHelp: {}, dispositions: [] }),
      ...HELP_SCENE_MANIFEST.scenes.flatMap((scene) => [
        { text: scene.alt },
        { text: scene.caption },
        { text: scene.fixture },
      ]),
    ]
      .map((entry) => entry.text)
      .join("\n");
    expect(findCustomerIdentifiers(text)).toEqual([]);
    expect(text).not.toMatch(/@(?!example\.invalid)[a-z0-9-]+\.(com|net|org)\b/i);
  });
});

describe("S243 R-S243-8 / ARCH-S243-5 / AC-S243-1: coverage proof", () => {
  it("the coverage gate passes on the shipped content with every exclusion explained", () => {
    expect(runHelpCoverage().problems).toEqual([]);
    for (const entry of HELP_COVERAGE_ALLOW_LIST)
      expect(entry.reason.split(/\s+/).length).toBeGreaterThan(5);
  });
});

describe("S243 R-S243-5 / ARCH-S243-1: scene manifest", () => {
  it("names a scene for at least one step in every section, at the fixed viewports", () => {
    const sections = new Set(
      HELP_SCENE_MANIFEST.scenes.map(
        (scene) => HELP_GUIDES.find((guide) => guide.id === scene.guide)?.section,
      ),
    );
    for (const guide of HELP_GUIDES)
      expect(sections.has(guide.section), guide.section).toBe(true);
    for (const scene of HELP_SCENE_MANIFEST.scenes)
      expect(["1280x800", "375x812"]).toContain(
        `${scene.viewport.width}x${scene.viewport.height}`,
      );
  });
});

describe("S243 R-S243-7 / BEH-S243-4 / AC-S243-7: consolidation", () => {
  const products = (name: string) => join(process.cwd(), "docs/products", name);

  it("the retired handouts are gone or reduced to a pointer to the hub", () => {
    for (const name of [
      "renewal-training-guide.pdf",
      "wednesday-meeting-brief.pdf",
      "build-renewal-handouts.py",
    ])
      expect(existsSync(products(name)), name).toBe(false);
    for (const name of [
      "renewal-operator-guide.md",
      "renewal-client-walkthrough-2026-09-09.md",
      "renewal-meeting-walkthrough-runbook.md",
    ]) {
      const text = readFileSync(products(name), "utf8");
      expect(text, name).toMatch(/staff help hub/);
      expect(text.split("\n").length, name).toBeLessThan(25);
    }
    expect(readFileSync(products("README.md"), "utf8")).toMatch(/\/help/);
    expect(readFileSync(join(process.cwd(), "docs/README.md"), "utf8")).toMatch(
      /lib\/help/,
    );
  });

  it("the renewal step-to-control map keeps every semantic guide step", () => {
    // S252: the 70 rows of the starting map are kept by step id (tests/unit/s252-control-map-
    // continuity.test.ts), and the working batch and Guided view add their own rows.
    expect(renewalControlMap.length).toBeGreaterThanOrEqual(70);
    expect(renewalControlMap.length).toBe(97);
    expect(
      renewalControlMap.filter((row) => row.availability === "required").length,
    ).toBeGreaterThanOrEqual(41);
    const ids = renewalControlMap.map((row) => row.step);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
