// S62 sentinel (AC-S62-7): no code path lets an owner-policy rule write `offeredRent`. The offered
// rent stays operator-entered — a rule that moved it directly would land outside the S29 carve-out
// and inside the owner_money hard exclusion. Two structural bans enforce it:
//   1. The owner-policy modules never reference `offeredRent` at all.
//   2. The renewal-progress WRITE path (the pure planner, the Firestore store, and the progress
//      route) never imports the owner-policy rule store, so a rule cannot reach a decision write.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const OWNER_POLICY_FILES = [
  "lib/firestore/owner-policy-rules.ts",
  "app/api/admin/owner-policy-rules/route.ts",
  "components/admin/OwnerPolicyRulesAdminPanel.tsx",
] as const;

const PROGRESS_WRITE_PATH_FILES = [
  "lib/lease-renewal/renewal-progress.ts",
  "lib/firestore/lease-renewal-progress.ts",
  "app/api/lease-renewal/renewal-progress/route.ts",
  "components/lease-renewal/RenewalProgressControls.tsx",
] as const;

describe("offered-rent writer boundary (AC-S62-7)", () => {
  it("owner-policy modules never reference offeredRent", () => {
    for (const rel of OWNER_POLICY_FILES) {
      const source = readFileSync(join(ROOT, rel), "utf8");
      expect(/\bofferedRent\b|\boffered_rent\b/.test(source), rel).toBe(false);
    }
  });

  it("the renewal-progress write path never imports the owner-policy rule store", () => {
    for (const rel of PROGRESS_WRITE_PATH_FILES) {
      const source = readFileSync(join(ROOT, rel), "utf8");
      expect(/owner-policy-rules/.test(source), rel).toBe(false);
    }
  });

  it("scans real files (self-check that the boundary is not vacuous)", () => {
    for (const rel of [...OWNER_POLICY_FILES, ...PROGRESS_WRITE_PATH_FILES]) {
      expect(readFileSync(join(ROOT, rel), "utf8").length).toBeGreaterThan(100);
    }
  });
});
