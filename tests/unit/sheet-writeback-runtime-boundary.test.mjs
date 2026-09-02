import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const RUNTIME_ROOTS = ["app", "components", "lib"];
const EXECUTION_MODULE = "@/lib/lease-renewal/sheet-writeback-execution";
const ALLOWED_EXECUTION_IMPORTER = "lib/lease-renewal/sheet-writeback-service.ts";
const RAW_WRITER_IMPLEMENTATION = "lib/google-sheets/write-client.ts";
let runtimeSourceCache;

function runtimeSources() {
  runtimeSourceCache ??= RUNTIME_ROOTS.flatMap((root) => walk(join(ROOT, root))).map(
    (file) => ({
      file: relative(ROOT, file).replaceAll("\\", "/"),
      source: readFileSync(file, "utf8"),
    }),
  );
  return runtimeSourceCache;
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(?:[cm]?[jt]s|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("Sheet write-back runtime boundary", () => {
  it("keeps every app-plane import behind the immutable action service", () => {
    const bypassImports = runtimeSources()
      .filter(({ source }) => source.includes(EXECUTION_MODULE))
      .map(({ file }) => file);

    expect(bypassImports).toEqual([ALLOWED_EXECUTION_IMPORTER]);
  }, 20_000);

  it("keeps legacy direct mutation helpers out of the immutable action service", () => {
    const service = readFileSync(join(ROOT, ALLOWED_EXECUTION_IMPORTER), "utf8");

    expect(service).not.toMatch(/\b(?:executeProposalWriteBack|commitWritebackAtRow)\b/);
  });

  it("keeps raw value-mutation calls inside the provider implementation only", () => {
    // S98 retired the rehearsal-copy proof module; the raw writer stays the only raw-call site.
    const bypassCalls = runtimeSources()
      .filter(({ file }) => file !== RAW_WRITER_IMPLEMENTATION)
      .filter(({ source }) =>
        /\.(?:updateValues|writeValuesIfEmpty|clearValuesIfExactMatch)\s*\(/.test(source),
      )
      .map(({ file }) => file);

    expect(bypassCalls).toEqual([]);
  }, 20_000);
});
