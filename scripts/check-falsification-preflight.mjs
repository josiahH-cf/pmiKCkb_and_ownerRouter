import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export const OVERSIZE_LIMIT_BYTES = 300 * 1024;

// Files that may legitimately exceed the size limit or that produce secret-scan noise
// without being human-authored secret carriers.
export const OVERSIZE_ALLOWLIST = new Set(["package-lock.json"]);
export const SECRET_SCAN_SKIP = new Set(["package-lock.json"]);

// Informational threshold only. A working-tree diff larger than this is surfaced as a
// warning so an unattended run notices a suspiciously large change, but it never fails
// the preflight.
export const LARGE_DIFF_LINE_WARNING = 1500;

// High-signal credential formats plus one context-aware assignment pattern. Patterns are
// intentionally conservative so the preflight stays green on legitimate repo content
// (document IDs, data-store IDs, and integrity hashes are not flagged).
export const SECRET_PATTERNS = [
  {
    label: "private key block",
    regex: /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----/,
  },
  { label: "AWS access key id", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { label: "Google OAuth client secret", regex: /\bGOCSPX-[0-9A-Za-z_-]{20,}\b/ },
  { label: "GitHub token", regex: /\bgh[posru]_[0-9A-Za-z]{30,}\b/ },
  { label: "Slack token", regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  { label: "Stripe key", regex: /\b[sprk]k_(?:live|test)_[0-9A-Za-z]{16,}\b/ },
  { label: "OpenAI key", regex: /\bsk-[A-Za-z0-9]{32,}\b/ },
  {
    // No word boundary after the label so directly concatenated tokens (for example
    // "API Key0123...") are still caught. The digit-and-letter validator keeps prose and
    // ordinary identifiers from matching.
    label: "credential assignment",
    regex:
      /\b(?:api[_ -]?secret|api[_ -]?key|client[_ -]?secret|secret[_ -]?key|access[_ -]?token|auth[_ -]?token|password|passwd)["']?\s*[:=]?\s*["']?([A-Za-z0-9+/_-]{20,})/i,
    group: 1,
    validate: (value) => /[0-9]/.test(value) && /[A-Za-z]/.test(value),
  },
];

/**
 * Return every secret-pattern finding in a block of text. Each finding is
 * `{ label, match }` where `match` is the matched secret token.
 */
export function findSecretMatches(text) {
  const findings = [];
  for (const { label, regex, group = 0, validate } of SECRET_PATTERNS) {
    const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
    const compiled = new RegExp(regex.source, flags);
    let match;
    while ((match = compiled.exec(text)) !== null) {
      const value = match[group] ?? match[0];
      if (!validate || validate(value)) {
        findings.push({ label, match: value });
      }
      if (match.index === compiled.lastIndex) {
        compiled.lastIndex += 1;
      }
    }
  }
  return findings;
}

/**
 * True when a file is larger than the limit and not allowlisted. `relPath` is compared
 * by both full repo-relative path and basename so the allowlist works on either form.
 */
export function isOversized(
  sizeBytes,
  relPath,
  { limit = OVERSIZE_LIMIT_BYTES, allowlist = OVERSIZE_ALLOWLIST } = {},
) {
  const normalized = String(relPath).split("\\").join("/");
  if (allowlist.has(normalized) || allowlist.has(posix.basename(normalized))) {
    return false;
  }
  return sizeBytes > limit;
}

/** Parse JSON and report validity without throwing. */
export function parseJsonContent(text) {
  try {
    JSON.parse(text);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Extract repo-internal Markdown link targets. External links (http, mailto, tel),
 * pure anchors, and data URIs are ignored.
 */
export function extractInternalDocLinks(markdown) {
  const links = [];
  const linkPattern = /\]\(([^)]+)\)/g;
  let match;
  while ((match = linkPattern.exec(markdown)) !== null) {
    const raw = match[1].trim().split(/\s+/)[0];
    if (!raw) {
      continue;
    }
    if (/^(?:https?:|mailto:|tel:|data:|#)/i.test(raw)) {
      continue;
    }
    const target = raw.split("#")[0].split("?")[0].trim();
    if (target) {
      links.push(target);
    }
  }
  return links;
}

/**
 * Candidate repo-relative paths a Markdown link could resolve to. Both
 * markdown-relative and repo-root-relative resolutions are returned so the existence
 * check passes when either form is valid.
 */
export function resolveDocLinkCandidates(markdownRelPath, target) {
  const fromDir = posix.dirname(String(markdownRelPath).split("\\").join("/"));
  const clean = target.split("#")[0].split("?")[0].trim();
  if (!clean) {
    return [];
  }
  const candidates = clean.startsWith("/")
    ? [clean.slice(1)]
    : [posix.normalize(posix.join(fromDir, clean)), posix.normalize(clean)];
  return candidates.filter((candidate) => candidate && !candidate.startsWith(".."));
}

/**
 * Return Markdown links whose target does not exist under any candidate resolution.
 * `fileExists` receives a repo-relative path and returns a boolean.
 */
export function findMissingDocLinks(markdownRelPath, markdown, fileExists) {
  const missing = [];
  for (const target of extractInternalDocLinks(markdown)) {
    const candidates = resolveDocLinkCandidates(markdownRelPath, target);
    if (candidates.length === 0) {
      continue;
    }
    if (!candidates.some((candidate) => fileExists(candidate))) {
      missing.push({ target, candidates });
    }
  }
  return missing;
}

function maskSecret(value) {
  const text = String(value);
  if (text.length <= 8) {
    return "***";
  }
  return `${text.slice(0, 4)}...(${text.length} chars)`;
}

function isProbablyBinary(buffer) {
  const limit = Math.min(buffer.length, 8000);
  for (let index = 0; index < limit; index += 1) {
    if (buffer[index] === 0) {
      return true;
    }
  }
  return false;
}

function gitFiles(args) {
  try {
    const output = execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return output.split("\0").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Files git would actually ship: tracked plus untracked-but-not-ignored. This respects
 * `.gitignore`, so local-only material (ignored docs, temp artifacts) is never scanned.
 */
export function listCandidateFiles() {
  const tracked = gitFiles(["ls-files", "-z"]);
  const others = gitFiles(["ls-files", "--others", "--exclude-standard", "-z"]);
  return Array.from(new Set([...tracked, ...others]))
    .filter(Boolean)
    .sort();
}

function diffSizeWarnings() {
  try {
    const output = execFileSync("git", ["diff", "--numstat", "--", "."], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    let total = 0;
    for (const line of output.split("\n")) {
      const [added, removed] = line.split("\t");
      if (added === "-" || removed === "-") {
        continue;
      }
      total += Number(added || 0) + Number(removed || 0);
    }
    if (total > LARGE_DIFF_LINE_WARNING) {
      return [
        `Large working-tree diff (${total} changed lines). Review for unintended or unrelated changes.`,
      ];
    }
  } catch {
    // git diff is best-effort and never fails the preflight.
  }
  return [];
}

export function main() {
  const files = listCandidateFiles();
  const problems = [];

  for (const rel of files) {
    const abs = join(root, rel);
    let stats;
    try {
      stats = statSync(abs);
    } catch {
      continue;
    }
    if (!stats.isFile()) {
      continue;
    }

    if (isOversized(stats.size, rel)) {
      problems.push(
        `Oversized file (${(stats.size / 1024).toFixed(1)} KB > ${OVERSIZE_LIMIT_BYTES / 1024} KB): ${rel}`,
      );
    }

    let buffer;
    try {
      buffer = readFileSync(abs);
    } catch {
      continue;
    }
    if (isProbablyBinary(buffer)) {
      continue;
    }
    const text = buffer.toString("utf8");

    if (!SECRET_SCAN_SKIP.has(rel)) {
      for (const finding of findSecretMatches(text)) {
        problems.push(
          `Possible secret (${finding.label}) in ${rel}: ${maskSecret(finding.match)}`,
        );
      }
    }

    if (rel.endsWith(".json")) {
      const parsed = parseJsonContent(text);
      if (!parsed.ok) {
        problems.push(`Invalid JSON in ${rel}: ${parsed.error}`);
      }
    }

    if (rel.endsWith(".md")) {
      for (const miss of findMissingDocLinks(rel, text, (path) =>
        existsSync(join(root, path)),
      )) {
        problems.push(`Missing linked file in ${rel}: ${miss.target}`);
      }
    }
  }

  for (const warning of diffSizeWarnings()) {
    console.warn(`Warning: ${warning}`);
  }

  if (problems.length > 0) {
    console.error("Falsification preflight found issues:");
    for (const problem of problems) {
      console.error(`- ${problem}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Falsification preflight passed across ${files.length} committable files.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
