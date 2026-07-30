import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const ENTRYPOINTS = [
  "lib/vendor/live-lifecycle-contract.ts",
  "lib/vendor/live-lifecycle-provider.ts",
  "lib/firestore/vendor-lifecycle-executions.ts",
];

describe("Live Vendor lifecycle runtime import boundary", () => {
  it("has no reachable synthetic, release-rehearsal, Test workflow, or test-fixture module", () => {
    const graph = reachableLocalModules(ENTRYPOINTS);
    expect(graph).toEqual(
      expect.arrayContaining(ENTRYPOINTS.map((entry) => path.normalize(entry))),
    );
    expect(graph).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /(?:^|[/\\])(?:release[/\\]synthetic|maintenance[/\\]test-workflow|vendor[/\\]test-|tests?[/\\])/i,
        ),
      ]),
    );
  });
});

function reachableLocalModules(entries: readonly string[]) {
  const pending = entries.map((entry) => path.normalize(entry));
  const visited = new Set<string>();

  while (pending.length) {
    const relative = pending.pop()!;
    if (visited.has(relative)) continue;
    visited.add(relative);
    const source = readFileSync(path.join(ROOT, relative), "utf8");
    for (const specifier of localImportSpecifiers(source)) {
      const resolved = resolveLocalModule(specifier);
      if (resolved && !visited.has(resolved)) pending.push(resolved);
    }
  }
  return Array.from(visited).sort();
}

function localImportSpecifiers(source: string) {
  const values: string[] = [];
  const pattern =
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["'](@\/[^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) values.push(match[1]!);
  return values;
}

function resolveLocalModule(specifier: string) {
  const base = path.join(ROOT, specifier.slice(2));
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate)) return path.relative(ROOT, candidate);
  }
  return null;
}
