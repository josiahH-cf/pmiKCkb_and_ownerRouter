// Redaction gate for the rule-tuning-as-PR loop (S13 Wave 3 H4). Enforces that ONLY rules,
// thresholds, and SYNTHETIC scenarios ever reach GitHub: the client-data trees (live golden captures,
// client_docs) must stay gitignored AND no file under them may be tracked by git. A rule-tuning PR
// that accidentally stages a captured golden set or a client doc fails this gate before it can merge.
//
//   npm run verify:redaction
//
// Deterministic; reads .gitignore + `git ls-files`. The pure evaluator is unit-tested with mock input.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Trees that hold real client data and must never be tracked/committed. */
export const REDACTED_TREES = ["golden-data/", "docs/client_docs/"];

/** Pure evaluation: given the .gitignore lines and the git-tracked file list, find redaction problems. */
export function evaluateRedaction({ gitignoreLines, trackedFiles }) {
  const problems = [];
  const normalized = gitignoreLines.map((line) =>
    line.trim().replace(/^\//, "").replace(/\/$/, ""),
  );

  for (const tree of REDACTED_TREES) {
    const bare = tree.replace(/\/$/, "");
    if (!normalized.includes(bare)) {
      problems.push(`${tree} must be gitignored (add it to .gitignore).`);
    }
  }

  const leaked = trackedFiles.filter((file) =>
    REDACTED_TREES.some((tree) => file.startsWith(tree) || file.startsWith(`/${tree}`)),
  );
  if (leaked.length > 0) {
    problems.push(
      `Client-data files are tracked by git and would reach GitHub: ${leaked.join(
        ", ",
      )}. Only rules, thresholds, and synthetic scenarios may be committed.`,
    );
  }

  return { ok: problems.length === 0, problems };
}

export function main() {
  const gitignoreLines = readFileSync(".gitignore", "utf8").split(/\r?\n/);
  let trackedFiles = [];
  try {
    const out = execSync(`git ls-files ${REDACTED_TREES.join(" ")}`, {
      encoding: "utf8",
    });
    trackedFiles = out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    // No git or no matches — treat as no tracked client-data files.
    trackedFiles = [];
  }

  const result = evaluateRedaction({ gitignoreLines, trackedFiles });
  if (result.ok) {
    console.log(
      "Redaction check passed: client-data trees stay gitignored and no client-data file is tracked.",
    );
  } else {
    for (const problem of result.problems) console.error(`REDACTION: ${problem}`);
    process.exitCode = 1;
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
