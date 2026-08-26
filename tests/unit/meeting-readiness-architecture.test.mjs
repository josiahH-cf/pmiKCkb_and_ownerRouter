import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

/**
 * Frozen architecture outcome for the 2026-08-26 meeting-readiness slice.
 *
 * This is intentionally separate from the implementation modules. It names the required seams and
 * safety boundaries so deleting or bypassing one produces a specific deterministic failure.
 */
describe("2026-08-26 meeting-readiness architecture outcome", () => {
  it("keeps live reads and the narrowly allowlisted RentVine write transport separate", () => {
    expect(existsSync(resolve(root, "lib/integrations/rentvine/write-client.ts"))).toBe(
      true,
    );
    const readClient = read("lib/integrations/rentvine/client.ts");
    const writeClient = read("lib/integrations/rentvine/write-client.ts");

    expect(readClient).toContain('method: "GET"');
    expect(readClient).not.toContain('method: "POST"');
    expect(writeClient).toContain('method: "POST"');
    expect(writeClient).not.toMatch(/method:\s*"DELETE"/);
    expect(writeClient).not.toMatch(/method:\s*"PUT"/);
  });

  it("has a separate rehearsal-Sheet binding and guarded round-trip proof", () => {
    expect(existsSync(resolve(root, "lib/lease-renewal/rehearsal-sheet.ts"))).toBe(true);
    expect(existsSync(resolve(root, "scripts/prove-rehearsal-sheet-write.ts"))).toBe(
      true,
    );
    expect(read("lib/lease-renewal/rehearsal-sheet.ts")).toContain(
      "RENEWAL_REHEARSAL_SHEET_ID",
    );
    expect(read("app/admin/page.tsx")).toContain("RenewalRehearsalSheetPanel");
  });

  it("ships the nontechnical meeting artifacts and a public bodyless version endpoint", () => {
    for (const path of [
      "docs/pmi-kc-client-action-center-2026-08-26.html",
      "docs/pmi-kc-meeting-agenda-2026-08-26.html",
      "app/api/version/route.ts",
    ]) {
      expect(existsSync(resolve(root, path)), path).toBe(true);
    }
  });

  it("opens only the approved RentCast read key and keeps RentVine writeback closed", () => {
    const seed = read("lib/integrations/action-registry-seed.ts");
    const block = (key) => {
      const start = seed.indexOf(`key: "${key}"`);
      const next = seed.indexOf("\n  {", start + 1);
      return seed.slice(start, next === -1 ? undefined : next);
    };

    expect(block("rentcast.rental_listings.search")).toContain(
      "production_allowed: true",
    );
    expect(block("rentvine.lease.renewal_writeback")).toContain(
      "production_allowed: false",
    );
  });

  it("does not advertise the unbacked owner-email compatibility Space", () => {
    expect(read("lib/spaces.ts")).toContain('id: "owner-email"');
    expect(read("lib/spaces.ts")).toMatch(
      /id:\s*"owner-email"[\s\S]{0,240}showInDirectory:\s*false/,
    );
    expect(read("app/spaces/page.tsx")).toContain("showInDirectory !== false");
  });
});
