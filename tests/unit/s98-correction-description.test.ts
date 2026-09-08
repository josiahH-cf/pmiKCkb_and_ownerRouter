import { describe, expect, it } from "vitest";
import { LEASE_EXECUTION_DEFINITIONS } from "@/lib/lease-renewal/execution/matrix";

describe("S98 correction capability presented to reviewers", () => {
  for (const key of [
    "google_sheets.renewal_checklist.row_append",
    "google_sheets.renewal_checklist.field_update",
  ]) {
    it(`${key} describes the available manual correction, without a fixed-row inverse claim`, () => {
      const description = LEASE_EXECUTION_DEFINITIONS.find(
        (entry) => entry.key === key,
      )?.correction;
      expect(description).toContain("receipt");
      expect(description).toContain("verified Sheet destination");
      expect(description).toContain("manual correction");
      expect(description).not.toMatch(
        /defines the (reversal|correction)|deleting only|compare-and-setting/,
      );
    });
  }
});
