import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const S66_RUNTIME_ROOT = join(ROOT, "lib/lease-documents");
const SOURCE_EXTENSIONS = /\.(?:ts|tsx)$/;

const FORBIDDEN_PROVIDER_TOKENS = [
  "lease-renewal/execution/providers",
  "DotloopProvider",
  "BoomProvider",
  "createLoop(",
  "uploadDocument(",
  "fetch(",
  "dotloop.loop.create_from_template",
  "dotloop.document.upload",
] as const;

const FORBIDDEN_PRICE_TOKENS = ["$" + "100", "10" + "000"] as const;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.test(entry.name) ? [path] : [];
  });
}

function violations(
  files: readonly { path: string; source: string }[],
  tokens: readonly string[],
): string[] {
  return files.flatMap(({ path, source }) =>
    tokens.filter((token) => source.includes(token)).map((token) => `${token}: ${path}`),
  );
}

describe("S66 packet-truth structural boundaries", () => {
  const runtime = sourceFiles(S66_RUNTIME_ROOT).map((path) => ({
    path: relative(ROOT, path).replaceAll("\\", "/"),
    source: readFileSync(path, "utf8"),
  }));

  it("constructs no Dotloop/Boom/provider action and performs no network I/O", () => {
    expect(violations(runtime, FORBIDDEN_PROVIDER_TOKENS)).toEqual([]);
  });

  it("contains no discussed/default charge constant", () => {
    expect(violations(runtime, FORBIDDEN_PRICE_TOKENS)).toEqual([]);
  });

  it("keeps Boom explicitly outside the permitted document-source boundary", () => {
    const evaluator = readFileSync(join(S66_RUNTIME_ROOT, "evaluate-packet.ts"), "utf8");
    expect(evaluator).toContain('source.system.toLowerCase() !== "boom"');
    expect(evaluator).not.toMatch(/from\s+["'][^"']*boom[^"']*["']/i);
  });

  it("keeps the S34 binder inert and exact-current/hash guarded", () => {
    const binder = readFileSync(
      join(S66_RUNTIME_ROOT, "dotloop-packet-binding.ts"),
      "utf8",
    );
    expect(binder).toContain('snapshot.visibleState !== "Ready for preview"');
    expect(binder).toContain("confirmedPayloadHash !== snapshot.payloadHash");
    expect(binder).not.toMatch(/execute\(|reconcile\(|new\s+\w*Provider/);
  });

  it("turns red for a forbidden provider construction and default price (sentinel self-check)", () => {
    const candidate = [
      {
        path: "lib/lease-documents/forbidden.ts",
        source: `new DotloopProvider(); const defaultCharge = ${FORBIDDEN_PRICE_TOKENS[1]};`,
      },
    ];
    expect(violations(candidate, FORBIDDEN_PROVIDER_TOKENS)).toEqual([
      "DotloopProvider: lib/lease-documents/forbidden.ts",
    ]);
    expect(violations(candidate, FORBIDDEN_PRICE_TOKENS)).toEqual([
      `${FORBIDDEN_PRICE_TOKENS[1]}: lib/lease-documents/forbidden.ts`,
    ]);
  });
});
