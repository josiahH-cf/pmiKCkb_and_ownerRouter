import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const PRODUCT_ROOTS = ["app", "components", "lib", "scripts"] as const;
const ALLOWED_COMPATIBILITY_FILE = "lib/lease-renewal/legacy-market-basis.ts";
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/;
const HISTORICAL_PROVIDER = ["zill", "ow"].join("");
const HISTORICAL_URL_KEY = ["comps", "Url"].join("");
const HISTORICAL_URL_RECORD_KEY = ["comps", "_url"].join("");

function sourceFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.test(entry.name) ? [path] : [];
  });
}

function findCurrentDependencyViolations(
  files: readonly { path: string; source: string }[],
): string[] {
  const providerPattern = new RegExp(HISTORICAL_PROVIDER, "i");
  return files
    .filter(({ path }) => path !== ALLOWED_COMPATIBILITY_FILE)
    .filter(
      ({ source }) =>
        providerPattern.test(source) ||
        source.includes(HISTORICAL_URL_KEY) ||
        source.includes(HISTORICAL_URL_RECORD_KEY),
    )
    .map(({ path }) => path)
    .sort();
}

describe("S28/S60 current market-truth boundary", () => {
  it("has no current label, URL, request target, API key, storage key, or behavior", () => {
    const files = PRODUCT_ROOTS.flatMap((directory) =>
      sourceFiles(join(ROOT, directory)).map((path) => ({
        path: relative(ROOT, path).replaceAll("\\", "/"),
        source: readFileSync(path, "utf8"),
      })),
    );
    expect(findCurrentDependencyViolations(files)).toEqual([]);
  }, 20_000);

  it("turns red for a forbidden current request target (sentinel self-check)", () => {
    const forbiddenHost = `https://www.${HISTORICAL_PROVIDER}.com/homes/example`;
    expect(
      findCurrentDependencyViolations([
        { path: "app/forbidden-current-lookup.ts", source: `fetch("${forbiddenHost}")` },
      ]),
    ).toEqual(["app/forbidden-current-lookup.ts"]);
  });
});
