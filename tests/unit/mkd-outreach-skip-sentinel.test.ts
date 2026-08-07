// S62 sentinel (AC-S62-9). The 2026-08-05 premise that MKD owners need no outreach is WITHDRAWN by
// owner direction (Q5, 2026-08-06): owner recipients are emailed through the normal reviewed
// process. This sentinel makes the ban structural: no module on the draft-composition path may
// import the owner-policy rule store, so no rule can suppress an owner draft, auto-record an owner
// decision, or leave a skipped-outreach mark. A rule's ONLY outlet is the S29 suggestion plane.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

// The renewal draft-composition path, end to end.
const DRAFT_PATH_FILES = [
  "lib/lease-renewal/recipient-resolution.ts",
  "lib/lease-renewal/execution/renewal-draft-preview.ts",
  "lib/lease-renewal/execution/renewal-draft-request.ts",
  "lib/lease-renewal/execution/renewal-notice-draft-service.ts",
  "app/api/lease-renewal/renewal-notice-draft/route.ts",
  "lib/lease-renewal/owner-draft.ts",
  "lib/lease-renewal/live-notices.ts",
] as const;

describe("MKD outreach-skip sentinel (AC-S62-9)", () => {
  it("no draft-composition module imports the owner-policy rule store", () => {
    for (const rel of DRAFT_PATH_FILES) {
      const source = readFileSync(join(ROOT, rel), "utf8");
      expect(/owner-policy-rules/.test(source), rel).toBe(false);
    }
  });

  it("no draft-composition module carries a skip/suppress-by-portfolio concept", () => {
    for (const rel of DRAFT_PATH_FILES) {
      const source = readFileSync(join(ROOT, rel), "utf8");
      expect(
        /outreach[_-]?skip|skip[_-]?outreach|suppressOwnerDraft/i.test(source),
        rel,
      ).toBe(false);
    }
  });

  it("scans real files (self-check that the sentinel is not vacuous)", () => {
    for (const rel of DRAFT_PATH_FILES) {
      expect(readFileSync(join(ROOT, rel), "utf8").length).toBeGreaterThan(100);
    }
  });
});
