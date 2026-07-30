import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const ROOTS = [
  "app/admin/vendors/page.tsx",
  "app/api/admin/vendors/live/actions/route.ts",
  "components/admin/LiveVendorLifecyclePanel.tsx",
  "lib/vendor/live-lifecycle-runtime.ts",
  "lib/vendor/live-lifecycle-service.ts",
];

const EXACT_FORBIDDEN = new Set([
  "components/admin/VendorAdminPanel.tsx",
  "lib/maintenance/test-workflow.ts",
  "lib/release/synthetic-execution.ts",
  "lib/vendor/admin-runtime.ts",
  "lib/vendor/test-identity.ts",
]);

describe("Live Vendor lifecycle runtime boundary", () => {
  it("recursively excludes synthetic and legacy Vendor workflow modules", () => {
    const graph = collectRuntimeGraph(ROOTS);
    const exactMatches = [...graph].filter((file) => EXACT_FORBIDDEN.has(file));
    const patternMatches = [...graph].filter((file) =>
      /^(?:components|lib)\/(?:[^/]+\/)*(?:test-|synthetic-)[^/]*\.[cm]?[jt]sx?$/i.test(
        file,
      ),
    );

    expect({
      exactMatches,
      patternMatches,
    }).toEqual({ exactMatches: [], patternMatches: [] });
  });
});

function collectRuntimeGraph(entries) {
  const seen = new Set();
  const pending = [...entries];

  while (pending.length > 0) {
    const relative = normalize(pending.pop());
    if (seen.has(relative)) continue;
    seen.add(relative);

    const absolute = path.join(REPO_ROOT, relative);
    const source = stripComments(fs.readFileSync(absolute, "utf8"));
    for (const specifier of importSpecifiers(source)) {
      const resolved = resolveRepoImport(absolute, specifier);
      if (resolved && !seen.has(resolved)) pending.push(resolved);
    }
  }

  return seen;
}

function importSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

function resolveRepoImport(importer, specifier) {
  let base;
  if (specifier.startsWith("@/")) {
    base = path.join(REPO_ROOT, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(importer), specifier);
  } else {
    return null;
  }

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
  ]) {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
    const relative = normalize(path.relative(REPO_ROOT, candidate));
    if (relative.startsWith("../")) return null;
    return relative;
  }
  return null;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

function normalize(file) {
  return file.split(path.sep).join("/");
}
