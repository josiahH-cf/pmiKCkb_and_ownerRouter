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
const SUITE_TITLE = /^#\s+S\d+\b/m;

function overhaulSpecs() {
  return readdirSync(SUITES_DIR)
    .filter((name) => name.endsWith(".md") && !EXCLUDED.has(name))
    .map((name) => ({ name, text: readFileSync(join(SUITES_DIR, name), "utf8") }))
    .filter((file) => file.text.includes(SENTINEL));
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
