import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Shape gate for the overhaul feature-suite specs. Any spec that opts in with the
// `<!-- spec-shape: overhaul-v1 -->` sentinel on line 1 must carry every required section
// (so the loop can adversarially check the build against a complete, machine-defined spec),
// declare at least one `AC-` acceptance-check id, and be registered in the README table.
// Scoped to the sentinel so the 13 pre-existing S1–S13 specs are not retroactively forced
// into the new shape. Companion of plan-status-sync.test.mjs / check-context-freshness.mjs;
// AC-id uniqueness + facts.md cross-reference are enforced by npm run verify:spec-traceability.

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SUITES_DIR = join(root, "docs", "feature-suites");
const SENTINEL = "<!-- spec-shape: overhaul-v1 -->";
const HANDOFF_SENTINEL = /^<!-- feature-handoff: [a-z0-9-]+ -->$/m;
const STRICT_HANDOFF_BUNDLES = new Set([
  "renewal-stabilization-v2",
  "source-of-truth-writeback-v1",
  "maintenance-provider-sync-v1",
  "maintenance-intake-v1",
  "temporary-space-pilot-v2",
]);
const EXCLUDED = new Set(["README.md", "TEMPLATE.md"]);

// The exact bold-inline section headings an overhaul spec must contain.
const REQUIRED_SECTIONS = [
  "**Goal.**",
  "**What it is / how it functions.**",
  "**Open questions & assumptions.**",
  "**Cross-product impacts.**",
  "**Adversarial acceptance checks.**",
  "**Forbidden actions / hard gates.**",
  "**Ordered prompt sequence.**",
  "**Deletion/merge recommendation.**",
];

const AC_ID = /AC-S\d+-\d+/;
const ARCH_ID = /ARCH-S\d+-\d+/g;
const BEH_ID = /BEH-S\d+-\d+/g;
const SUITE_TITLE = /^#\s+S\d+\b/m;

const HANDOFF_REQUIRED_SECTIONS = [
  "**Current state / intended end state.**",
  "**Actors and entry conditions.**",
  "**In scope / out of scope.**",
  "**Architecture outcome (deterministic, fail-first).**",
  "**Behavior outcome (deterministic, fail-first).**",
  "**Human litmus outcome.**",
  "**Authority and evidence map.**",
  "**Requirement-to-outcome traceability.**",
  "**Preservation set.**",
  "**Dependencies / sequencing.**",
  "**Standalone delivery contract.**",
  "**Verification and delivery contract.**",
];

function overhaulSpecs() {
  return readdirSync(SUITES_DIR)
    .filter((name) => name.endsWith(".md") && !EXCLUDED.has(name))
    .map((name) => ({ name, text: readFileSync(join(SUITES_DIR, name), "utf8") }))
    .filter((file) => file.text.includes(SENTINEL));
}

function handoffSpecs() {
  return overhaulSpecs().filter((file) => {
    const bundle = file.text.match(/^<!-- feature-handoff: ([a-z0-9-]+) -->$/m)?.[1];
    return bundle !== undefined && STRICT_HANDOFF_BUNDLES.has(bundle);
  });
}

describe("overhaul feature-suite spec shape", () => {
  const specs = overhaulSpecs();
  const readme = readFileSync(join(SUITES_DIR, "README.md"), "utf8");

  it("finds the feature-suites directory", () => {
    expect(readdirSync(SUITES_DIR).length).toBeGreaterThan(0);
  });

  for (const spec of specs) {
    describe(spec.name, () => {
      it("has an S-numbered title heading", () => {
        expect(
          SUITE_TITLE.test(spec.text),
          `${spec.name} needs a "# S<n> — Title" heading`,
        ).toBe(true);
      });

      it("contains every required section", () => {
        for (const section of REQUIRED_SECTIONS) {
          expect(
            spec.text.includes(section),
            `${spec.name} is missing section ${section}`,
          ).toBe(true);
        }
      });

      it("declares at least one AC- acceptance-check id", () => {
        expect(
          AC_ID.test(spec.text),
          `${spec.name} has no AC-S<n>-<k> acceptance id`,
        ).toBe(true);
      });

      it("is registered in the README suite table", () => {
        expect(
          readme.includes(`docs/feature-suites/${spec.name}`),
          `${spec.name} is not registered in docs/feature-suites/README.md`,
        ).toBe(true);
      });
    });
  }
});

describe("strict standalone feature handoff shape", () => {
  const specs = handoffSpecs();
  const readme = readFileSync(join(SUITES_DIR, "README.md"), "utf8");

  it("finds registered standalone handoff specifications", () => {
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(readme).toContain(`docs/feature-suites/${spec.name}`);
    }
  });

  for (const spec of specs) {
    describe(spec.name, () => {
      it("contains every standalone handoff section", () => {
        expect(spec.text.split(/\r?\n/)[1]).toMatch(HANDOFF_SENTINEL);
        for (const section of HANDOFF_REQUIRED_SECTIONS) {
          expect(
            spec.text.includes(section),
            `${spec.name} is missing standalone handoff section ${section}`,
          ).toBe(true);
        }
      });

      it("declares and traces every architecture and behavior outcome", () => {
        const architectureIds = new Set(spec.text.match(ARCH_ID) ?? []);
        const behaviorIds = new Set(spec.text.match(BEH_ID) ?? []);
        expect(
          architectureIds.size,
          `${spec.name} needs at least one architecture outcome id`,
        ).toBeGreaterThan(0);
        expect(
          behaviorIds.size,
          `${spec.name} needs at least one behavior outcome id`,
        ).toBeGreaterThan(0);

        for (const id of [...architectureIds, ...behaviorIds]) {
          const references = spec.text.split(id).length - 1;
          expect(
            references,
            `${spec.name} must reference ${id} outside its declaration`,
          ).toBeGreaterThanOrEqual(2);
        }

        expect(
          spec.text.match(/^###\s+\S.+$/gm)?.length ?? 0,
          `${spec.name} needs at least one named human-litmus entry`,
        ).toBeGreaterThan(0);
      });

      it("declares deterministic terminal states and bundle registration", () => {
        expect(spec.text).toContain("ALL_GATES_GREEN");
        expect(spec.text).toContain("BUDGET_EXHAUSTED");
        expect(spec.text).toContain("BLOCKED");
        expect(readme).toContain(`docs/feature-suites/${spec.name}`);
      });
    });
  }
});
