import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { main } from "@/scripts/seed-action-registry";

// Regression guard for the QA finding F1 (2026-07-22): the seed script keeps its own executable
// allow-list, and a production_allowed flip (e.g. gmail.maintenance_owner_notice.draft_create in Slice 6)
// that is NOT added to it makes `npm run seed:action-registry` REFUSE. The dry-run validates the
// committed ACTION_REGISTRY_SEED against that allow-list and throws on any surprise flip, so asserting it
// resolves means every currently-executable entry is allow-listed.
describe("seed-action-registry executable allow-list", () => {
  it("accepts every current production_allowed seed entry (dry-run does not refuse)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(main(["--dry-run"])).resolves.toBeUndefined();
    log.mockRestore();
  });

  it("refuses a flip of a D33 permanently-closed direct send, so the allow-list is not wider than the seed", () => {
    // The seed script keeps its own allow-list; it must not quietly permit `gmail.message.send`.
    const source = readFileSync(
      join(process.cwd(), "scripts", "seed-action-registry.ts"),
      "utf8",
    );
    const allowlist = source.slice(source.indexOf("const EXECUTABLE_ALLOWLIST"));
    const block = allowlist.slice(0, allowlist.indexOf("]);"));
    for (const key of [
      "gmail.message.send",
      "gmail.renewal_notice.send",
      "gmail.maintenance_owner_notice.send",
    ]) {
      expect(block, key).not.toContain(`"${key}"`);
    }
  });
});
