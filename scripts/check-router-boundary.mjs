import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const requiredFiles = [
  "docs/spec.md",
  "docs/specs/spec-1-technical-spec.md",
  "docs/specs/spec-2-technical-spec.md",
  "docs/specs/spec-3-operating-north-star-spec.md",
  "docs/specs/spec-4-implementation-meta-implementation-spec.md",
  "docs/router-repo.md",
];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    throw new Error(`Missing required file: ${file}`);
  }
}

const constants = readFileSync(join(root, "lib/constants.ts"), "utf8");
for (const expected of [
  "PMI KC KB",
  "Owner Router",
  "Owner Router - PMI KC Metro",
  "Draft — Review before sending",
  "Needs Verification: <fact>",
]) {
  if (!constants.includes(expected)) {
    throw new Error(`Missing shared vocabulary constant: ${expected}`);
  }
}

const routerDoc = readFileSync(join(root, "docs/router-repo.md"), "utf8");
for (const expected of [
  "pmi-kc-owner-router",
  "Owner Router - PMI KC Metro",
  "Owner Router / New",
  "No standalone app",
]) {
  if (!routerDoc.includes(expected)) {
    throw new Error(`Router repo handoff is missing: ${expected}`);
  }
}

const runtimeRoots = ["app", "components", "lib"];
const forbiddenRuntimePatterns = [
  /Owner Router \/ [A-Za-z]/,
  /gmail\.modify/,
  /gmail\.readonly/,
];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!/\.(ts|tsx|css)$/.test(fullPath)) {
      continue;
    }

    const text = readFileSync(fullPath, "utf8");
    for (const pattern of forbiddenRuntimePatterns) {
      if (pattern.test(text)) {
        throw new Error(`Forbidden Router runtime pattern in ${fullPath}: ${pattern}`);
      }
    }
  }
}

for (const runtimeRoot of runtimeRoots) {
  walk(join(root, runtimeRoot));
}

console.log("Router boundary check passed.");
