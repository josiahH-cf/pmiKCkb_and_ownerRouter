// Copy-voice gate (S13 A8, F-VOICE-2). Scans user-facing source for the jargon the operator flagged
// and for em dashes, so the pre-customer copy pass cannot silently regress (S2 fixed four strings; the
// surfaces shipped since re-introduced the pattern — this stops that treadmill).
//
// Rollout is warn-then-fail: jargon phrases hard-fail EVERYWHERE (app, components, and every lib/ file,
// since user-facing copy is often composed in lib and rendered by a component). Em dashes hard-fail in
// the client-facing EMAIL drafts (which reach tenants/owners); em dashes in the operator UI only WARN
// for now — the full operator-UI em-dash purge is a follow-on, and this reports the remaining debt
// without blocking.
//
// Comment handling is block-aware: `/* ... */` blocks (including JSDoc `*` continuation lines) and
// `//` line comments are stripped before scanning, so internal design notes ("Phase-2 control plane")
// never trip the gate, while a real copy line is never skipped merely because it starts with `*`.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// Jargon the operator explicitly rejected. Matched case-insensitively on non-comment text.
export const FORBIDDEN_JARGON = ["control plane", "PMI handles", "source of truth"];

// The em dash (U+2014). An en dash (U+2013, used for numeric ranges) is intentionally allowed.
const EM_DASH = "—";

// Lines carrying the required verbatim draft banner keep their em dash.
function isDraftBannerLine(line) {
  return line.includes("DRAFT_BANNER") || line.includes("Draft — Review before sending");
}

// Index of a `//` line comment, skipping the `//` in a URL scheme (`https://`), or -1.
function lineCommentIndex(line) {
  for (let i = 0; i < line.length - 1; i += 1) {
    if (line[i] === "/" && line[i + 1] === "/" && line[i - 1] !== ":") return i;
  }
  return -1;
}

/**
 * Scan one file's text for copy-voice violations. Pure: returns the jargon hits and em-dash hits with
 * 1-based line numbers; the caller decides severity. Block comments and `//` line comments are stripped
 * (line numbers preserved) so only real code/copy is scanned.
 */
export function scanCopyText(text) {
  const jargon = [];
  const emDashes = [];
  // Blank out block comments while preserving newlines, so JSDoc `*` lines never read as copy.
  const noBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  noBlocks.split(/\r?\n/).forEach((rawLine, index) => {
    const commentAt = lineCommentIndex(rawLine);
    const line = commentAt === -1 ? rawLine : rawLine.slice(0, commentAt);
    const trimmed = line.trim();
    if (trimmed === "") return;
    const lower = line.toLowerCase();
    for (const term of FORBIDDEN_JARGON) {
      if (lower.includes(term.toLowerCase())) {
        jargon.push({ line: index + 1, term, text: trimmed });
      }
    }
    if (line.includes(EM_DASH) && !isDraftBannerLine(line)) {
      emDashes.push({ line: index + 1, text: trimmed });
    }
  });
  return { jargon, emDashes };
}

// Jargon hard-fails in every source root where user-facing copy can originate.
const JARGON_ROOTS = ["app", "components", "lib"];
// Operator-facing rendered copy: em dashes WARN (not blocking) here for now.
const OPERATOR_UI_ROOTS = ["app", "components"];
// Em dashes in these client-facing EMAIL drafts hard-fail (they reach tenants/owners).
export const CLIENT_DRAFT_FILES = [
  "lib/lease-renewal/owner-draft.ts",
  "lib/lease-renewal/tenant-draft.ts",
  "lib/maintenance/owner-notice-draft.ts",
];

function walkSource(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkSource(full, acc);
    } else if (/\.(ts|tsx)$/.test(full) && !/\.(test|spec)\.(ts|tsx)$/.test(full)) {
      acc.push(full);
    }
  }
  return acc;
}

function underRoot(rel, roots) {
  return roots.some((r) => rel === r || rel.startsWith(`${r}/`));
}

export function collectViolations() {
  const errors = [];
  const warnings = [];
  const clientDraftSet = new Set(CLIENT_DRAFT_FILES);

  const files = [...new Set(JARGON_ROOTS.flatMap((r) => walkSource(join(root, r), [])))];
  for (const file of files) {
    const rel = relative(root, file).replace(/\\/g, "/");
    const { jargon, emDashes } = scanCopyText(readFileSync(file, "utf8"));
    for (const hit of jargon) {
      errors.push(`${rel}:${hit.line}  forbidden jargon "${hit.term}"  ${hit.text}`);
    }
    if (clientDraftSet.has(rel)) {
      for (const hit of emDashes) {
        errors.push(`${rel}:${hit.line}  em dash in a client-facing draft  ${hit.text}`);
      }
    } else if (underRoot(rel, OPERATOR_UI_ROOTS)) {
      for (const hit of emDashes) {
        warnings.push(`${rel}:${hit.line}  em dash  ${hit.text}`);
      }
    }
  }

  return { errors, warnings };
}

function main() {
  const { errors, warnings } = collectViolations();

  if (warnings.length > 0) {
    console.warn(
      `Copy-voice: ${warnings.length} em-dash warning(s) in operator UI (not blocking; see F-VOICE-2):`,
    );
    for (const w of warnings.slice(0, 20)) console.warn(`  ${w}`);
    if (warnings.length > 20) console.warn(`  …and ${warnings.length - 20} more.`);
  }

  if (errors.length > 0) {
    console.error(`Copy-voice gate FAILED with ${errors.length} violation(s):`);
    for (const e of errors) console.error(`  ${e}`);
    console.error(
      "\nFix per docs/voice-and-audience.md (Voice rules v2): no jargon, no em dashes in client copy.",
    );
    process.exit(1);
  }

  console.log(
    `Copy-voice gate passed (0 jargon/client-draft violations, ${warnings.length} operator-UI em-dash warning(s)).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
