import { describe, expect, it } from "vitest";
import {
  allSyntheticCells,
  SYNTHETIC_TAB_FIXTURES,
} from "../fixtures/lease-renewal/synthetic-renewal-sheet";

// High-signal credential formats (mirrors scripts/check-falsification-preflight.mjs SECRET_PATTERNS).
// The committed-file scan in `npm run verify:falsification` is authoritative; this keeps the guard
// inside the unit suite so a regression fails fast.
const HIGH_SIGNAL_SECRET_PATTERNS = [
  /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bGOCSPX-[0-9A-Za-z_-]{20,}\b/,
  /\bsk-[A-Za-z0-9]{32,}\b/,
];

describe("lease-renewal synthetic fixtures — governance", () => {
  it("marks exactly the credential-bearing tabs 4 and 7", () => {
    const credentialTabs = SYNTHETIC_TAB_FIXTURES.filter((f) => f.credentialBearing).map(
      (f) => f.tabNumber,
    );
    expect(credentialTabs.sort()).toEqual([4, 7]);
  });

  it("keeps credential-tab secret cells as digit-free PLACEHOLDER tokens", () => {
    for (const fixture of SYNTHETIC_TAB_FIXTURES.filter((f) => f.credentialBearing)) {
      const header = fixture.grid[0] ?? [];
      const secretColumns = header
        .map((label, index) => ({ label, index }))
        .filter(({ label }) => /password|pin/i.test(label))
        .map(({ index }) => index);

      expect(secretColumns.length, `${fixture.label} has secret columns`).toBeGreaterThan(0);

      for (const row of fixture.grid.slice(1)) {
        for (const col of secretColumns) {
          const value = row[col] ?? "";
          if (value === "") continue;
          expect(value, `${fixture.label} secret cell`).toContain("PLACEHOLDER");
          expect(value, `${fixture.label} secret cell has no digits`).not.toMatch(/[0-9]/);
        }
      }
    }
  });

  it("uses only the synthetic @example.com domain for any email-like cell", () => {
    for (const cell of allSyntheticCells()) {
      const emails = cell.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g) ?? [];
      for (const email of emails) {
        expect(email.toLowerCase(), "synthetic email domain").toMatch(/@example\.com$/);
      }
    }
  });

  it("contains no high-signal secret token in any cell", () => {
    const cells = allSyntheticCells();
    for (const pattern of HIGH_SIGNAL_SECRET_PATTERNS) {
      const hit = cells.find((cell) => pattern.test(cell));
      expect(hit, `pattern ${pattern}`).toBeUndefined();
    }
  });

  it("provides a non-empty grid for every fixture", () => {
    for (const fixture of SYNTHETIC_TAB_FIXTURES) {
      expect(fixture.grid.length, fixture.label).toBeGreaterThan(0);
      expect(fixture.grid.every((row) => row.length > 0), fixture.label).toBe(true);
    }
  });
});
