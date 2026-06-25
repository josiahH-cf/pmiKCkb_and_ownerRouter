import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Context-freshness gate. The companion of plan-status-sync and the falsification preflight:
// a deterministic doc validator that makes the solidified-context spine (docs/facts.md) honest and
// keeps docs/loop-state.md a short, current pointer rather than a second history. Routing already
// exists; this guards the three owner failure modes — poisoned/stale context, unlabeled
// assumptions, and not looking in the right place — at the root.

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export const FACTS_PATH = "docs/facts.md";
export const LOOP_STATE_PATH = "docs/loop-state.md";
export const STATUS_PATH = "docs/status.md";

// docs/loop-state.md must stay a pointer, not a changelog. This single cap structurally prevents the
// ~999-line regression that buried the current state.
export const LOOP_STATE_MAX_LINES = 140;

export const ALLOWED_STATUSES = ["Verified", "Assumption", "Open"];
export const REQUIRED_LEDGER_COLUMNS = [
  "id",
  "claim",
  "status",
  "evidence",
  "verified-on",
  "supersedes",
  "review-by",
];

// The active governance set the orphan-marker check greps. Deliberately excludes docs/status.md
// (append-only history) and docs/legacy/ + docs/specs/ (preserved archives) — a marker may live
// there as history without being "active guidance".
export const ACTIVE_GOVERNANCE = [
  "AGENTS.md",
  "docs/north-star.md",
  "docs/plan.md",
  "docs/implement.md",
  "docs/autonomous-agent-runner.md",
  "docs/ai-execution-workflow.md",
  "docs/products/README.md",
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value) {
  return typeof value === "string" && ISO_DATE.test(value.trim());
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Highest YYYY-MM-DD found anywhere in the text, or null. ISO dates sort lexically. */
export function maxIsoDate(text) {
  const matches = String(text).match(/\d{4}-\d{2}-\d{2}/g);
  if (!matches || matches.length === 0) {
    return null;
  }
  return matches.reduce((max, date) => (date > max ? date : max), matches[0]);
}

/** Repo-relative path tokens (a slash plus a dotted extension), with any #anchor stripped. */
export function extractPathTokens(text) {
  const tokens = [];
  const pattern = /([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/g;
  let match;
  while ((match = pattern.exec(String(text))) !== null) {
    tokens.push(match[1].split("#")[0]);
  }
  return tokens;
}

/** Parse the first Markdown table under a `## Heading` into { headers, rows }. Cells are trimmed. */
export function parseSectionTable(markdown, heading) {
  const start = markdown.indexOf(heading);
  if (start === -1) {
    return null;
  }
  const rest = markdown.slice(start + heading.length);
  const end = rest.indexOf("\n## ");
  const section = end === -1 ? rest : rest.slice(0, end);

  const rows = section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  if (rows.length < 2) {
    return { headers: [], rows: [] };
  }

  const cells = (line) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

  const headers = cells(rows[0]).map((header) => header.toLowerCase());
  const data = [];
  for (const line of rows.slice(1)) {
    const cols = cells(line);
    if (cols.every((cell) => cell === "" || /^:?-{2,}:?$/.test(cell))) {
      continue; // separator row
    }
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (cols[index] ?? "").trim();
    });
    data.push(record);
  }
  return { headers, rows: data };
}

/** Filesystem-free checks on docs/facts.md so a vitest can feed it a fabricated table. */
export function checkFactsText(factsText) {
  const problems = [];
  const warnings = [];

  for (const heading of ["## Fact Ledger", "## Supersede Log", "## Open Questions"]) {
    if (!factsText.includes(heading)) {
      problems.push(`docs/facts.md is missing the "${heading}" section.`);
    }
  }

  const ledger = parseSectionTable(factsText, "## Fact Ledger");
  if (!ledger || ledger.rows.length === 0) {
    problems.push("docs/facts.md has no populated Fact Ledger table.");
    return { problems, warnings, ledger: ledger ?? { headers: [], rows: [] } };
  }

  for (const column of REQUIRED_LEDGER_COLUMNS) {
    if (!ledger.headers.includes(column)) {
      problems.push(`Fact Ledger is missing the "${column}" column.`);
    }
  }

  const ids = new Set(ledger.rows.map((row) => row.id).filter(Boolean));
  const now = today();
  for (const row of ledger.rows) {
    const id = row.id || "(no id)";
    if (!ALLOWED_STATUSES.includes(row.status)) {
      problems.push(
        `Fact ${id}: status "${row.status}" must be one of ${ALLOWED_STATUSES.join(", ")}.`,
      );
    }
    if (row.status === "Verified") {
      if (!row.evidence || row.evidence === "—") {
        problems.push(`Verified fact ${id} has no evidence.`);
      }
      if (!isIsoDate(row["verified-on"])) {
        problems.push(`Verified fact ${id} has no valid ISO verified-on date.`);
      }
    }
    if (row.supersedes && row.supersedes !== "—" && !ids.has(row.supersedes)) {
      problems.push(`Fact ${id} supersedes unknown id "${row.supersedes}".`);
    }
    if (isIsoDate(row["review-by"]) && row["review-by"] < now) {
      warnings.push(
        `Fact ${id} is past its review-by date (${row["review-by"]}); re-verify it.`,
      );
    }
  }

  return { problems, warnings, ledger };
}

/** Full gate: reads docs/facts.md, docs/loop-state.md, docs/status.md and the active set. */
export function evaluateContextFreshness(root = ROOT) {
  const read = (rel) => {
    const abs = join(root, rel);
    return existsSync(abs) ? readFileSync(abs, "utf8") : null;
  };
  const fileExists = (rel) => existsSync(join(root, rel));

  const factsText = read(FACTS_PATH);
  if (factsText === null) {
    return { problems: [`Missing required file: ${FACTS_PATH}`], warnings: [] };
  }

  const { problems, warnings, ledger } = checkFactsText(factsText);

  // Evidence path tokens must exist (no doc points at a deleted path).
  for (const row of ledger.rows) {
    for (const token of extractPathTokens(row.evidence)) {
      if (!fileExists(token)) {
        problems.push(
          `Fact ${row.id || "(no id)"} cites a path that does not exist: ${token}`,
        );
      }
    }
  }

  // Supersede log: replaced-by must resolve, where-old-text-lived path must exist, and each marker
  // must NOT still read as active guidance anywhere in the active governance set.
  const supersede = parseSectionTable(factsText, "## Supersede Log");
  const ids = new Set(ledger.rows.map((row) => row.id).filter(Boolean));
  if (supersede) {
    for (const row of supersede.rows) {
      const replacedBy = row["replaced-by-id"];
      if (replacedBy && replacedBy !== "—" && !ids.has(replacedBy)) {
        problems.push(
          `Supersede log row "${row["superseded-id"]}" points at unknown id "${replacedBy}".`,
        );
      }
      for (const token of extractPathTokens(row["where-old-text-lived"])) {
        if (!fileExists(token)) {
          problems.push(`Supersede log cites a path that does not exist: ${token}`);
        }
      }
      const marker = row.marker;
      if (marker && marker !== "—") {
        for (const govFile of ACTIVE_GOVERNANCE) {
          const text = read(govFile);
          if (text && text.includes(marker)) {
            problems.push(
              `Orphaned superseded rule: marker "${marker}" (${row["superseded-id"]}) still reads as active guidance in ${govFile}. Delete it.`,
            );
          }
        }
      }
    }
  }

  // Loop-state must stay a short, current pointer.
  const loopText = read(LOOP_STATE_PATH);
  if (loopText === null) {
    problems.push(`Missing required file: ${LOOP_STATE_PATH}`);
  } else {
    const lineCount = loopText.split("\n").length;
    if (lineCount > LOOP_STATE_MAX_LINES) {
      problems.push(
        `${LOOP_STATE_PATH} is ${lineCount} lines (> ${LOOP_STATE_MAX_LINES}); it must stay a pointer, not a history. Move detail to ${STATUS_PATH}.`,
      );
    }
    const loopDate = (loopText.match(/Last updated:\s*(\d{4}-\d{2}-\d{2})/) || [])[1];
    if (!loopDate) {
      problems.push(`${LOOP_STATE_PATH} has no "Last updated: YYYY-MM-DD" line.`);
    } else {
      const statusText = read(STATUS_PATH);
      const statusMax = statusText ? maxIsoDate(statusText) : null;
      if (statusMax && loopDate < statusMax) {
        problems.push(
          `${LOOP_STATE_PATH} (Last updated ${loopDate}) is older than the newest ${STATUS_PATH} entry (${statusMax}); update the resume pointer.`,
        );
      }
    }
  }

  return { problems, warnings };
}

export function main() {
  const { problems, warnings } = evaluateContextFreshness(ROOT);

  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }

  if (problems.length > 0) {
    console.error("Context-freshness gate found issues:");
    for (const problem of problems) {
      console.error(`- ${problem}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    "Context-freshness gate passed: docs/facts.md and docs/loop-state.md are current.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
