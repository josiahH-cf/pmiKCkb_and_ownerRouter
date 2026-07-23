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

// AC-S29-5: the owner_money exclusion opens ONLY for a server-set Admin-approved rent number, and only at
// the category level. Every other owner-money signal, and every owner-money CONTENT phrase, stays refused.
describe("S29 narrowed owner_money carve-out", () => {
  const provenance = { approved: true as const, value: 2350 };

  it("still refuses owner_money without the server-set provenance (unchanged)", () => {
    expect(inspectGmailDraftSafety({ category: "owner_money" }).allowed).toBe(false);
  });

  it("still refuses owner-money CONTENT even WITH provenance (regex unchanged)", () => {
    for (const phrase of [
      "owner payout",
      "owner funds",
      "owner monies",
      "owner proceeds",
    ]) {
      expect(
        inspectGmailDraftSafety({
          category: "general_question",
          subject: phrase,
          approvedRentSuggestion: provenance,
        }).allowed,
      ).toBe(false);
      // And the same phrase in facts is still refused, provenance or not.
      expect(
        inspectGmailDraftSafety({
          category: "owner_money",
          facts: [phrase],
          approvedRentSuggestion: provenance,
        }).allowed,
      ).toBe(false);
    }
  });

  it("allows an owner_money renewal draft ONLY with a valid server-set approved number", () => {
    // Provenance present + valid, and no owner-money content phrase → the category exclusion is lifted.
    expect(
      inspectGmailDraftSafety({
        category: "owner_money",
        subject: "Renewal coming up for 104 NE Lindsay Ave",
        facts: ["Suggested market value: $2,350"],
        approvedRentSuggestion: provenance,
      }).allowed,
    ).toBe(true);
  });

  it("does not lift legal or tenant-dispute exclusions with the rent provenance", () => {
    expect(
      inspectGmailDraftSafety({
        category: "legal_notices",
        approvedRentSuggestion: provenance,
      }).allowed,
    ).toBe(false);
    expect(
      inspectGmailDraftSafety({
        category: "tenant_disputes",
        approvedRentSuggestion: provenance,
      }).allowed,
    ).toBe(false);
  });

  it("rejects a malformed / non-approved provenance (fails closed)", () => {
    for (const bad of [
      { approved: false, value: 2350 },
      { approved: true, value: 0 },
      { approved: true, value: Number.NaN },
      { approved: true, value: -100 },
    ]) {
      expect(
        inspectGmailDraftSafety({
          category: "owner_money",
          approvedRentSuggestion: bad as never,
        }).allowed,
      ).toBe(false);
    }
  });
});
