import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Freshness guard for the intentionally small present-truth plan. Historical cross-product phase
// inventories were retired during the context reset; this test now protects the active outcome,
// current implementation baseline, bounded closure sequence, and explicit delivery rule instead of
// forcing superseded meeting artifacts back into current documentation.

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const PLAN_PATH = join(root, "docs", "plan.md");

describe("plan.md present-truth freshness", () => {
  const plan = readFileSync(PLAN_PATH, "utf8")
    .replace(/\s+/g, " ")
    .replace(/[\u2013\u2014]/g, "-");
  it("keeps only the current authorized outcome, delivery sequence and captured external seams", () => {
    for (const heading of [
      "## Authorized outcome",
      "## Delivery sequence",
      "## Captured baseline and external seams",
    ])
      expect(plan).toContain(heading);
    expect(plan).not.toContain("## Cross-Product Phases");
    expect(plan).toContain("S227-S229");
    expect(plan).toContain("No older READY program");
  });
  it("preserves exact renewal authority, closed Dotloop writes and actual release qualification", () => {
    expect(plan).toMatch(/[a-f0-9]{40}/);
    expect(plan).toMatch(/pmi-kc-app-[a-z0-9-]+/);
    for (const contract of [
      "integrations@pmikcmetro.com",
      "Both Dotloop write keys remain closed",
      "fresh confirmed renewal delivery",
      "worker skips old authorizations",
      "No protected activation metadata changes",
      "fixtures/emulators",
      "bash scripts/verify.sh",
      "exact-head green CI",
      "receipt-bound candidate",
      "300,000 ms",
      "Clear the queue only after delivery is proved",
    ])
      expect(plan).toContain(contract);
    expect(plan).toContain(
      "No customer send, draft, provider business write or production test record is verification proof",
    );
  });
});
