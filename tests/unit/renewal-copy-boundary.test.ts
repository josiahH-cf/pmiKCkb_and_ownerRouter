import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const PRODUCTION_ROOTS = [join(ROOT, "app"), join(ROOT, "lib")];

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(path) && !/\.(test|spec)\.tsx?$/.test(path)) files.push(path);
  }
  return files;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

function relativePath(path: string): string {
  return relative(ROOT, path).replace(/\\/g, "/");
}

const productionSources = PRODUCTION_ROOTS.flatMap(sourceFiles).map((path) => ({
  path: relativePath(path),
  source: stripComments(readFileSync(path, "utf8")),
}));

describe("S74 renewal copy authority boundary", () => {
  it("keeps the model-assistance route and copy governance outside every writer seam", () => {
    for (const path of [
      "app/api/lease-renewal/renewal-copy-assist/route.ts",
      "lib/lease-renewal/renewal-copy-governance.ts",
    ]) {
      const source = stripComments(readFileSync(join(ROOT, path), "utf8"));
      expect(source, path).not.toMatch(
        /@\/lib\/(?:external-execution|gmail(?:-runtime|-hub)?|firebase|firestore|integrations\/google|lease-renewal\/rentvine)/,
      );
      expect(source, path).not.toMatch(
        /\b(?:sendMessage|createDraft|prepareGovernedDraft)\s*\(/,
      );
      expect(source, path).not.toMatch(/\bconsole\.(?:log|info|warn|error)\s*\(/);
    }
  });

  it("allows only the governed preview assembler to call the renewal action builder", () => {
    const callers = productionSources
      .filter(({ source }) => /\bbuildRenewalNoticeDraftAction\s*\(/.test(source))
      .map(({ path }) => path)
      .sort();

    expect(callers).toEqual([
      "lib/lease-renewal/execution/renewal-draft-preview.ts",
      "lib/lease-renewal/execution/renewal-draft-request.ts",
    ]);
  });

  it("allows only the authenticated renewal draft route to call the governed service", () => {
    const callers = productionSources
      .filter(({ source }) => /\bprepareRenewalNoticeDraft\s*\(/.test(source))
      .map(({ path }) => path)
      .sort();

    expect(callers).toEqual([
      "app/api/lease-renewal/renewal-notice-draft/route.ts",
      "lib/lease-renewal/execution/renewal-notice-draft-service.ts",
    ]);
  });
});
