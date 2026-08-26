import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const map = readFileSync(
  join(root, "docs", "cherry-bridge-renewal-note-map-2026-08-24.md"),
  "utf8",
);
const noteIds = ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N10", "N11"];

function noteRows() {
  return map
    .split(/\r?\n/)
    .filter((line) => /^\| N\d+\s+\|/.test(line))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

describe("Cherry Bridge present-disposition coverage", () => {
  const rows = noteRows();

  it("retains each client note exactly once without keeping obsolete suite narratives", () => {
    expect(rows.map((row) => row[0])).toEqual(noteIds);
    expect(new Set(rows.map((row) => row[0])).size).toBe(noteIds.length);
  });

  it("gives every note a present status, disposition, and evidence target", () => {
    for (const row of rows) {
      expect(row).toHaveLength(5);
      expect(row[2]).toMatch(
        /^(Complete|Current ruling|Active|Open verification|Active with permanent boundary)$/,
      );
      expect(row[3].length).toBeGreaterThan(20);
      expect(row[4]).toMatch(/`(?:AGENTS\.md|docs\/|lib\/)/);
    }
  });

  it("keeps the superseding MKD and direct-send rulings explicit", () => {
    const n4 = rows.find((row) => row[0] === "N4");
    const n11 = rows.find((row) => row[0] === "N11");
    expect(n4?.[3]).toContain("normal reviewed outreach");
    expect(n4?.[3]).toContain("No skip-outreach path");
    expect(n11?.[3]).toContain("automatic client send remains forbidden under D33");
  });

  it("keeps the reported resident mismatch open until the exact lease is retested", () => {
    const n8 = rows.find((row) => row[0] === "N8");
    expect(n8?.[2]).toBe("Open verification");
    expect(n8?.[3]).toContain("exact reported lease still needs a client retest");
  });

  it("contains no customer amount or street address", () => {
    expect(map).not.toMatch(/\$\s?\d[\d,]*(?:\.\d{2})?/);
    expect(map).not.toMatch(
      /\b\d+\s+(?:[A-Za-z][A-Za-z.'-]*\s+){1,3}(?:Ave|Avenue|St|Street|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Blvd|Ter|Terrace|Pl|Place|Way|Cir|Circle)\b/,
    );
  });
});
