import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gitIgnoredPaths } from "./check-context-freshness.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const ROOT_DOCS = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "SETUP.md",
  ".github/pull_request_template.md",
]);

const REMOVED_CONTEXT_REFERENCES = [
  "docs/ai-execution-workflow.md",
  "docs/agent-runner/",
  "docs/legacy/",
  "docs/meta-prompts/",
  "docs/router-repo.md",
  "docs/router-repo-template/",
  "docs/specs/",
];

function listedFiles(root = ROOT) {
  try {
    return execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/)
      .map((file) => file.trim().replace(/\\/g, "/"))
      .filter(Boolean);
  } catch {
    return [...ROOT_DOCS, "docs/README.md"];
  }
}

export function activeDocumentFiles(root = ROOT) {
  return [...new Set(listedFiles(root))]
    .filter((file) => existsSync(join(root, file)))
    .filter(
      (file) =>
        ROOT_DOCS.has(file) ||
        (/^(docs|infra)\/.*\.(?:md|html)$/.test(file) &&
          !file.startsWith("docs/brand_pack/") &&
          !file.startsWith("docs/temp/") &&
          !file.startsWith("docs/client_docs/") &&
          !file.startsWith("docs/context_and_calls/")),
    )
    .sort();
}

function normalizeCandidate(candidate) {
  const normalized = candidate
    .trim()
    .replace(/^\.\//, "")
    .replace(/[.,;:]$/, "")
    .split("#")[0];

  if (
    normalized === "" ||
    /[\s<>*…]/.test(normalized) ||
    normalized.startsWith("http://") ||
    normalized.startsWith("https://")
  ) {
    return null;
  }

  return /^(?:AGENTS|CLAUDE|README|SETUP)\.md$/.test(normalized) ||
    /^(?:app|components|docs|infra|lib|public|scripts|tests)\//.test(normalized)
    ? normalized
    : null;
}

export function extractActiveDocPaths(text) {
  const paths = new Set();
  const patterns = [/`([^`\n]+)`/g, /\]\(([^)]+)\)/g];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(String(text))) !== null) {
      const candidate = normalizeCandidate(match[1]);
      if (candidate) paths.add(candidate);
    }
  }

  return [...paths];
}

export function missingRepositoryPaths(paths, root = ROOT) {
  const unique = [...new Set(paths)].filter(Boolean);
  const ignored = gitIgnoredPaths(unique, root);
  return unique.filter(
    (target) => !existsSync(join(root, target)) && !ignored.has(target),
  );
}

export function evaluateActiveDocPaths(root = ROOT) {
  const problems = [];
  const files = activeDocumentFiles(root);
  const documents = files.map((file) => ({
    file,
    text: readFileSync(join(root, file), "utf8"),
  }));
  const missing = new Set(
    missingRepositoryPaths(
      documents.flatMap(({ text }) => extractActiveDocPaths(text)),
      root,
    ),
  );

  for (const { file, text } of documents) {
    for (const removed of REMOVED_CONTEXT_REFERENCES) {
      if (text.includes(removed)) {
        problems.push(`${file} references removed active context: ${removed}`);
      }
    }

    for (const target of extractActiveDocPaths(text)) {
      if (missing.has(target)) {
        problems.push(`${file} references a missing repository path: ${target}`);
      }
    }
  }

  return { files, problems };
}

export function main() {
  const { files, problems } = evaluateActiveDocPaths(ROOT);

  if (problems.length > 0) {
    console.error("Active-document path gate found issues:");
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Active-document path gate passed across ${files.length} present-context files.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
