import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Spec <-> implementation traceability gate. The concrete mechanism behind "adversarially
// check the build against the spec": every overhaul feature-suite spec (opted in with the
// `<!-- spec-shape: overhaul-v1 -->` sentinel) declares stable acceptance-check ids
// `AC-S<n>-<k>`, and a shipped fact in docs/facts.md cites the AC ids it satisfies. This gate
// makes those references honest — ids are unique, an id's number matches its suite, and no
// fact cites an AC id that does not exist. Structural shape (required sections, README
// registration) is enforced by tests/unit/feature-suite-spec-shape.test.mjs; this is its
// deterministic, runner-independent companion (see docs/autonomous-agent-runner.md).

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export const SUITES_REL = "docs/feature-suites";
export const FACTS_REL = "docs/facts.md";
export const SENTINEL = "<!-- spec-shape: overhaul-v1 -->";
const EXCLUDED = new Set(["README.md", "TEMPLATE.md"]);
// A spec DECLARES an acceptance id where it is bold at its definition bullet (**AC-S17-1**);
// a plain-prose mention (e.g. "asserted by S16 (AC-S16-4)") is a cross-reference, not a declaration,
// so specs can legitimately reference another suite's ids without tripping the suite-number check.
const AC_DECL = /\*\*(AC-S(\d+)-\d+)\*\*/g;
const SUITE_NUMBER = /^#\s+S(\d+)\b/m;

/** Filesystem-free core so a vitest can feed fabricated specs + facts text. */
export function evaluateSpecTraceability({ specs, factsText }) {
  const problems = [];
  const defined = new Map(); // AC id -> suite file name

  for (const spec of specs) {
    const suiteMatch = SUITE_NUMBER.exec(spec.text);
    if (!suiteMatch) {
      problems.push(`${spec.name}: overhaul spec has no "# S<n>" suite heading.`);
      continue;
    }
    const suiteNumber = suiteMatch[1];

    const decls = [...spec.text.matchAll(AC_DECL)];
    if (decls.length === 0) {
      problems.push(
        `${spec.name}: overhaul spec declares no bold **AC-S${suiteNumber}-<k>** acceptance ids.`,
      );
      continue;
    }

    for (const match of decls) {
      const id = match[1];
      const idSuite = match[2];
      if (idSuite !== suiteNumber) {
        problems.push(
          `${spec.name} (S${suiteNumber}): acceptance id ${id} belongs to a different suite (S${idSuite}).`,
        );
      }
      if (defined.has(id) && defined.get(id) !== spec.name) {
        problems.push(
          `Duplicate acceptance id ${id}: defined in both ${defined.get(id)} and ${spec.name}.`,
        );
      }
      defined.set(id, spec.name);
    }
  }

  // Cross-reference: every AC id cited in docs/facts.md must resolve to a defined spec id.
  const cited = new Set(factsText.match(/AC-S\d+-\d+/g) ?? []);
  for (const id of cited) {
    if (!defined.has(id)) {
      problems.push(
        `docs/facts.md cites acceptance id ${id}, which is not defined in any overhaul spec.`,
      );
    }
  }

  return { problems, definedCount: defined.size, specCount: specs.length };
}

export function gatherSpecs(root = ROOT) {
  const dir = join(root, SUITES_REL);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md") && !EXCLUDED.has(name))
    .map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }))
    .filter((file) => file.text.includes(SENTINEL));
}

export function main(root = ROOT) {
  const specs = gatherSpecs(root);
  const factsPath = join(root, FACTS_REL);
  const factsText = existsSync(factsPath) ? readFileSync(factsPath, "utf8") : "";
  const { problems, definedCount, specCount } = evaluateSpecTraceability({
    specs,
    factsText,
  });

  if (problems.length > 0) {
    console.error("Spec-traceability gate found issues:");
    for (const problem of problems) {
      console.error(`- ${problem}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Spec-traceability gate passed: ${definedCount} acceptance ids across ${specCount} overhaul spec(s); all facts.md references resolve.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
