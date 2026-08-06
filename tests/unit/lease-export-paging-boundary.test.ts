// S57 architecture sentinel (AC-S57-6): RentVine's /leases/export is page-limited — a bare
// `listLeasesExport` call silently reads 25 of the portfolio's leases, which is the production defect
// this suite fixed. Every module under app/ and lib/ must go through the paged, deduplicated
// `listAllLeasesExport` complete read instead. The only file allowed to reference the raw page read
// is the RentVine client itself, where the pager lives.
//
// The rule is deliberately stricter than "no call without a page parameter": the identifier may not
// appear at all outside the client. That makes a fourth caller written later — bare or "widened" with
// the ignored `limit` param — turn this test red instead of silently truncating.

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCANNED_DIRS = ["app", "lib"] as const;
const ALLOWED_FILES = new Set(["lib/integrations/rentvine/client.ts"]);
const SOURCE_EXT = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const FORBIDDEN = /\blistLeasesExport\b/;

function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFilesUnder(full));
    } else if (entry.isFile() && SOURCE_EXT.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// One shared walk — recursing app/ + lib/ is slow on Windows-mounted filesystems, so both
// assertions read from the same file list. The generous timeout covers cold-cache WSL runs.
const scannedFiles = SCANNED_DIRS.flatMap((dir) => sourceFilesUnder(join(ROOT, dir)));

describe("lease-export paging boundary", () => {
  it(
    "no module under app/ or lib/ references the page-limited listLeasesExport outside the client",
    { timeout: 60_000 },
    () => {
      const offenders: string[] = [];
      for (const file of scannedFiles) {
        const rel = relative(ROOT, file).split(sep).join("/");
        if (ALLOWED_FILES.has(rel)) continue;
        if (FORBIDDEN.test(readFileSync(file, "utf8"))) {
          offenders.push(rel);
        }
      }
      expect(offenders).toEqual([]);
    },
  );

  it("scans a real production tree (self-check that the walk is not vacuous)", () => {
    // The repo has hundreds of source modules under app/ + lib/; an empty or tiny walk means the
    // sentinel silently stopped guarding anything.
    expect(scannedFiles.length).toBeGreaterThan(100);
    // And the allowed client file itself still exists and still contains the raw page read the
    // pager wraps — otherwise the allowlist is stale.
    const client = readFileSync(
      join(ROOT, "lib/integrations/rentvine/client.ts"),
      "utf8",
    );
    expect(client).toMatch(FORBIDDEN);
    expect(client).toMatch(/\blistAllLeasesExport\b/);
  });
});
