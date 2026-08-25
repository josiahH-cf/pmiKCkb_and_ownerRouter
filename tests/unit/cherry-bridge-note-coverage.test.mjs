import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Coverage gate for the eleven "Cherry Bridge Renewal Fixes Needed" client notes (2026-08-24).
//
// Each note N1..N11 must resolve to at least one BOLD acceptance id in a registered overhaul spec.
// Specs opt in by declaring `<!-- cherry-bridge-notes: N1, N2 -->` on their own line; the note map
// at docs/cherry-bridge-renewal-note-map-2026-08-24.md is the human-readable companion and must
// reference every note and every covering suite.
//
// Deleting any one note's coverage fails BY NAME, which is the point: a spec can be rewritten, but a
// note cannot quietly stop being covered.

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SUITES_DIR = join(root, "docs", "feature-suites");
const NOTE_MAP = join(root, "docs", "cherry-bridge-renewal-note-map-2026-08-24.md");
const SENTINEL = "<!-- spec-shape: overhaul-v1 -->";
const EXCLUDED = new Set(["README.md", "TEMPLATE.md"]);

const NOTE_IDS = ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N10", "N11"];

/** One line per note, so a failure names the client's own words rather than an id. */
const NOTE_SUBJECTS = {
  N1: "not an active property",
  N2: "dates need to be in chronological order",
  N3: "house numbers in the addresses",
  N4: "MKD owner policy (no outreach / +3.5%)",
  N5: "the info-form link never changes",
  N6: "current rent is wrong",
  N7: "the comp section needs to be first",
  N8: "tenant name is incorrect",
  N9: "change the tenant text message",
  N10: "align the renewal page with the team's six steps",
  N11: "waiting on / last follow-up / auto-send",
};

const NOTE_MARKER = /<!--\s*cherry-bridge-notes:\s*([^>]*?)\s*-->/;
const AC_DECL = /\*\*(AC-S\d+-\d+)\*\*/g;

function overhaulSpecs() {
  return readdirSync(SUITES_DIR)
    .filter((name) => name.endsWith(".md") && !EXCLUDED.has(name))
    .map((name) => ({ name, text: readFileSync(join(SUITES_DIR, name), "utf8") }))
    .filter((file) => file.text.includes(SENTINEL));
}

/** note id -> [{ spec, acIds }] */
function buildCoverage() {
  const coverage = new Map(NOTE_IDS.map((id) => [id, []]));
  for (const spec of overhaulSpecs()) {
    const match = NOTE_MARKER.exec(spec.text);
    if (!match) continue;
    const declared = match[1]
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);
    const acIds = [...new Set([...spec.text.matchAll(AC_DECL)].map((m) => m[1]))];
    for (const note of declared) {
      if (!coverage.has(note)) {
        coverage.set(note, []);
      }
      coverage.get(note).push({ spec: spec.name, acIds });
    }
  }
  return coverage;
}

describe("Cherry Bridge note coverage", () => {
  const coverage = buildCoverage();

  it("declares no note id outside N1..N11", () => {
    const unknown = [...coverage.keys()].filter((id) => !NOTE_IDS.includes(id));
    expect(
      unknown,
      `Unknown cherry-bridge note id(s) declared: ${unknown.join(", ")}`,
    ).toEqual([]);
  });

  for (const note of NOTE_IDS) {
    describe(`${note} — ${NOTE_SUBJECTS[note]}`, () => {
      it("is claimed by at least one registered overhaul spec", () => {
        const entries = coverage.get(note) ?? [];
        expect(
          entries.length,
          `Client note ${note} ("${NOTE_SUBJECTS[note]}") is not claimed by any spec. Add "${note}" to a spec's <!-- cherry-bridge-notes: ... --> marker.`,
        ).toBeGreaterThan(0);
      });

      it("resolves to at least one bold AC acceptance id", () => {
        const entries = coverage.get(note) ?? [];
        const acIds = entries.flatMap((entry) => entry.acIds);
        expect(
          acIds.length,
          `Client note ${note} ("${NOTE_SUBJECTS[note]}") is claimed by ${
            entries.map((e) => e.spec).join(", ") || "no spec"
          } but resolves to no bold **AC-S<n>-<k>** id.`,
        ).toBeGreaterThan(0);
      });

      it("appears in the human-readable note map", () => {
        const map = readFileSync(NOTE_MAP, "utf8");
        expect(map, `Note map does not mention ${note}.`).toContain(`${note} —`);
      });
    });
  }

  it("routes N4 and N11 back to the owner as decisions rather than silent plans", () => {
    const map = readFileSync(NOTE_MAP, "utf8");
    // These two notes contradict recorded owner rulings (the 2026-08-06 MKD withdrawal and D33).
    // They must be visibly flagged for a decision, not quietly built or quietly dropped.
    for (const note of ["N4", "N11"]) {
      const heading = map.split("\n").find((line) => line.startsWith(`### ${note} —`));
      expect(heading, `Note map has no heading for ${note}.`).toBeTruthy();
      expect(
        heading.toLowerCase(),
        `${note} contradicts a recorded owner ruling and must be marked as needing a decision.`,
      ).toContain("needs your decision");
    }
    expect(map).toContain("2026-08-06");
    expect(map).toContain("D33");
  });

  it("keeps the note map and every Cherry Bridge spec free of customer values", () => {
    const files = [
      { name: "note map", text: readFileSync(NOTE_MAP, "utf8") },
      ...overhaulSpecs().filter((spec) => NOTE_MARKER.test(spec.text)),
    ];
    // A currency figure or a house-numbered street address would mean a real client value was copied
    // out of a gitignored live capture into a tracked document.
    const CURRENCY = /\$\s?\d[\d,]*(?:\.\d{2})?/;
    const STREET =
      /\b\d+\s+(?:[A-Za-z][A-Za-z.'-]*\s+){1,3}(?:Ave|Avenue|St|Street|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Blvd|Ter|Terrace|Pl|Place|Way|Cir|Circle)\b/;
    for (const file of files) {
      // The map quotes the client's own "+3.5%" and "$1000.00" note titles nowhere; assert it.
      expect(CURRENCY.test(file.text), `${file.name} contains a currency figure.`).toBe(
        false,
      );
      expect(STREET.test(file.text), `${file.name} contains a street address.`).toBe(
        false,
      );
    }
  });
});
