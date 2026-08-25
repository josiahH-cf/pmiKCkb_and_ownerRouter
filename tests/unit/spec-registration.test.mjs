import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Registration gate for the overhaul feature-suite specs.
//
// tests/unit/feature-suite-spec-shape.test.mjs already checks that a sentinel spec has the required
// sections and a README table row. Nothing checked the OTHER two registration points: the AGENTS.md
// Route Table (the router agents actually read) and the AGENTS.md Project Map. Verified 2026-08-24:
// zero "Route Table" references existed anywhere under tests/ or scripts/, so a spec could ship
// unroutable and no gate would notice.
//
// This is the companion that closes that hole.

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SUITES_DIR = join(root, "docs", "feature-suites");
const AGENTS = join(root, "AGENTS.md");
const SENTINEL = "<!-- spec-shape: overhaul-v1 -->";
const EXCLUDED = new Set(["README.md", "TEMPLATE.md"]);
const SUITE_TITLE = /^#\s+S(\d+)\b/m;

function overhaulSpecs() {
  return readdirSync(SUITES_DIR)
    .filter((name) => name.endsWith(".md") && !EXCLUDED.has(name))
    .map((name) => ({ name, text: readFileSync(join(SUITES_DIR, name), "utf8") }))
    .filter((file) => file.text.includes(SENTINEL));
}

/** The Route Table section only — a path mentioned elsewhere in AGENTS.md is not a routing entry. */
function routeTableSection(agentsText) {
  const start = agentsText.indexOf("## Route Table");
  expect(start, "AGENTS.md has no '## Route Table' section.").toBeGreaterThan(-1);
  const next = agentsText.indexOf("\n## ", start + 1);
  return agentsText.slice(start, next === -1 ? undefined : next);
}

function projectMapSection(agentsText) {
  const start = agentsText.indexOf("## Project Map");
  expect(start, "AGENTS.md has no '## Project Map' section.").toBeGreaterThan(-1);
  const next = agentsText.indexOf("\n## ", start + 1);
  return agentsText.slice(start, next === -1 ? undefined : next);
}

describe("overhaul spec registration", () => {
  const specs = overhaulSpecs();
  const agentsText = readFileSync(AGENTS, "utf8");
  const routeTable = routeTableSection(agentsText);
  const projectMap = projectMapSection(agentsText);

  it("finds sentinel specs to check", () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  it("names the Route Table and Project Map sections in AGENTS.md", () => {
    expect(routeTable).toContain("| Need ");
    expect(projectMap.length).toBeGreaterThan(0);
  });

  for (const spec of specs) {
    describe(spec.name, () => {
      it("appears in the AGENTS.md Route Table by its exact path", () => {
        expect(
          routeTable.includes(`docs/feature-suites/${spec.name}`),
          `${spec.name} is not routed: add a Route Table row in AGENTS.md citing docs/feature-suites/${spec.name}.`,
        ).toBe(true);
      });

      it("has a Route Table row that names its suite number", () => {
        const suiteNumber = SUITE_TITLE.exec(spec.text)?.[1];
        expect(suiteNumber, `${spec.name} has no "# S<n>" heading.`).toBeTruthy();
        const row = routeTable
          .split("\n")
          .find((line) => line.includes(`docs/feature-suites/${spec.name}`));
        expect(
          new RegExp(`\\bS${suiteNumber}\\b`).test(row),
          `${spec.name}'s Route Table row does not name S${suiteNumber}; the row reads: ${row?.trim()}`,
        ).toBe(true);
      });
    });
  }

  // The Project Map is prose, not a table: it groups suites by range or by name rather than listing
  // every file. When this gate was first written (2026-08-24) it found 27 sentinel suites absent from
  // it. Enumerating all 27 in the router prose would make AGENTS.md worse, not better, so the gap is
  // BASELINED instead: it may shrink, never grow. A NEW spec is not in the baseline and must therefore
  // register itself, which is the fail-first behaviour this gate exists for.
  const PROJECT_MAP_BASELINE = new Set([
    28, 29, 30, 32, 33, 34, 35, 36, 37, 38, 39, 51, 52, 53, 54, 55, 56, 57, 59, 60, 61,
    63, 64, 65, 66, 67, 68,
  ]);

  function projectMapAbsences() {
    const missing = [];
    for (const spec of specs) {
      const suiteNumber = SUITE_TITLE.exec(spec.text)?.[1];
      if (!suiteNumber) continue;
      const n = Number(suiteNumber);
      const named = new RegExp(`\\bS${suiteNumber}\\b`).test(projectMap);
      // A range like "S40–S50" or "S70-S75" covers the suites inside it.
      const inRange = [...projectMap.matchAll(/S(\d+)\s*[–-]\s*S(\d+)/g)].some(
        (m) => n >= Number(m[1]) && n <= Number(m[2]),
      );
      if (!named && !inRange) missing.push({ n, name: spec.name });
    }
    return missing;
  }

  it("adds no new suite to the AGENTS.md Project Map gap", () => {
    const regressions = projectMapAbsences()
      .filter((entry) => !PROJECT_MAP_BASELINE.has(entry.n))
      .map((entry) => `S${entry.n} (${entry.name})`);
    expect(
      regressions,
      `These suites are absent from the AGENTS.md Project Map and are not in the recorded baseline: ${regressions.join(", ")}. Add a Project Map entry.`,
    ).toEqual([]);
  });

  it("keeps the Project Map baseline honest — a registered suite must leave the baseline", () => {
    const stillAbsent = new Set(projectMapAbsences().map((entry) => entry.n));
    const stale = [...PROJECT_MAP_BASELINE].filter((n) => !stillAbsent.has(n));
    expect(
      stale,
      `These suites are now in the Project Map but still listed as baseline exemptions: ${stale.join(", ")}. Remove them from PROJECT_MAP_BASELINE so the gap cannot silently reopen.`,
    ).toEqual([]);
  });

  it("keeps every Route Table path pointing at a file that exists", () => {
    const cited = [...routeTable.matchAll(/`(docs\/feature-suites\/[^`]+\.md)`/g)].map(
      (m) => m[1],
    );
    const present = new Set(readdirSync(SUITES_DIR));
    const dangling = cited.filter((path) => !present.has(path.split("/").pop()));
    expect(
      dangling,
      `Route Table cites missing spec file(s): ${dangling.join(", ")}`,
    ).toEqual([]);
  });
});
