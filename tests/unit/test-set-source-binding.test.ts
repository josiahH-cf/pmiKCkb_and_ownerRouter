import { describe, expect, it } from "vitest";

import { assertTestSetSheetBindingIdentity } from "@/lib/lease-renewal/test-set-source-binding";

describe("S63 exact source binding", () => {
  it("accepts only the Sheet row whose RentVine lease link matches the secure designation", () => {
    expect(() =>
      assertTestSetSheetBindingIdentity({
        leaseId: "fixture-lease-a",
        rowJoinId: "lease:fixture-lease-a",
      }),
    ).not.toThrow();

    for (const rowJoinId of [null, "unit:fixture-lease-a", "lease:fixture-lease-b"]) {
      expect(() =>
        assertTestSetSheetBindingIdentity({
          leaseId: "fixture-lease-a",
          rowJoinId,
        }),
      ).toThrow(/source_identity_mismatch/);
    }
  });
});
