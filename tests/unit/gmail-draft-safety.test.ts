import { describe, expect, it } from "vitest";

import {
  inspectGmailDraftSafety,
  normalizeGmailDraftCategory,
} from "@/lib/gmail-inbox-zero/draft-safety";

describe("Gmail draft canonical safety", () => {
  it.each([
    ["vendor", "vendor"],
    ["Vendor invoices", "vendor"],
    ["legal/notices", "legal_notices"],
    ["legal notice", "legal_notices"],
    ["Owner Monies", "owner_money"],
    ["tenant-disputes", "tenant_disputes"],
  ])("normalizes %j to %s", (input, expected) => {
    expect(normalizeGmailDraftCategory(input)).toBe(expected);
  });

  it("fails closed for blank and unknown categories", () => {
    expect(inspectGmailDraftSafety({ category: "" }).allowed).toBe(false);
    expect(inspectGmailDraftSafety({ category: "misc" }).allowed).toBe(false);
  });

  it("detects excluded intent in subject and facts under an allowed category", () => {
    expect(
      inspectGmailDraftSafety({ category: "vendor", subject: "Tenant rights notice" })
        .allowed,
    ).toBe(false);
    expect(
      inspectGmailDraftSafety({
        category: "vendor",
        subject: "Routine question",
        facts: ["owner funds decision"],
      }).allowed,
    ).toBe(false);
  });
});
