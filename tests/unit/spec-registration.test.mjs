import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const suitesDir = join(root, "docs", "feature-suites");
const index = readFileSync(join(suitesDir, "README.md"), "utf8");
const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
const sentinel = "<!-- spec-shape: overhaul-v1 -->";
const excluded = new Set(["README.md", "TEMPLATE.md"]);

function activeSpecs() {
  return readdirSync(suitesDir)
    .filter((name) => name.endsWith(".md") && !excluded.has(name))
    .map((name) => ({ name, text: readFileSync(join(suitesDir, name), "utf8") }))
    .filter((file) => file.text.includes(sentinel));
}

describe("active feature-suite registration", () => {
  const specs = activeSpecs();

  it("routes agents through the single current suite index", () => {
    expect(agents).toContain("Active suites: `docs/feature-suites/README.md`");
    expect(agents).not.toMatch(/docs\/feature-suites\/(?!README\.md)[^`\s]+\.md/);
  });

  it("finds current sentinel specs", () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  for (const spec of specs) {
    it(`registers ${spec.name} exactly once with its suite number`, () => {
      const suite = /^#\s+S(\d+)\b/m.exec(spec.text)?.[1];
      expect(suite, `${spec.name} has no S<n> heading`).toBeTruthy();

      const path = `docs/feature-suites/${spec.name}`;
      expect(index.split(path)).toHaveLength(2);
      const row = index.split("\n").find((line) => line.includes(path));
      expect(row).toMatch(new RegExp(`^\\| S${suite}\\s+\\|`));
    });
  }

  it("keeps every indexed suite path resolvable", () => {
    const cited = [...index.matchAll(/`(docs\/feature-suites\/[^`]+\.md)`/g)].map(
      (match) => match[1],
    );
    const missing = cited.filter((path) => !existsSync(join(root, path)));
    expect(missing).toEqual([]);
  });
});
