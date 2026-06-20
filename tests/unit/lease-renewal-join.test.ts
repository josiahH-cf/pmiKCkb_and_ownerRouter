import { describe, expect, it } from "vitest";
import {
  deriveAddressKey,
  deriveNameKey,
  proposeJoin,
} from "@/lib/lease-renewal/join";

describe("address join keys", () => {
  it("collapses street-suffix and unit variants to one key", () => {
    expect(deriveAddressKey("100 Birchwood Ln").key).toBe("100 birchwood lane");
    expect(deriveAddressKey("100 Birchwood Lane").key).toBe("100 birchwood lane");
    expect(deriveAddressKey("100 Birchwood Ln.").key).toBe("100 birchwood lane");
    expect(deriveAddressKey("2200 Elmgrove Apt 4").key).toBe("2200 elmgrove unit 4");
    expect(deriveAddressKey("2200 Elmgrove #4").key).toBe("2200 elmgrove unit 4");
  });

  it("matches address variants as a candidate, never an auto-merge", () => {
    const proposal = proposeJoin("100 Birchwood Ln", "100 Birchwood Lane", "address");
    expect(proposal.status).toBe("match");
    expect(proposal.score).toBe(1);
    expect(proposal.recommendation).toBe("use_as_candidate");
    expect(proposal.autoMerge).toBe(false);
  });

  it("routes partial address overlap to review (ambiguous), not a merge", () => {
    const proposal = proposeJoin("2200 Elmgrove Apt 4", "2200 Elmgrove", "address");
    expect(proposal.status).toBe("ambiguous");
    expect(proposal.recommendation).toBe("send_to_review");
    expect(proposal.autoMerge).toBe(false);
  });

  it("rejects unrelated addresses", () => {
    const proposal = proposeJoin("100 Birchwood Ln", "2200 Elmgrove", "address");
    expect(proposal.status).toBe("no_match");
    expect(proposal.recommendation).toBe("reject");
  });
});

describe("name join keys", () => {
  it("reorders the LAST, FIRST form to match First Last", () => {
    expect(deriveNameKey("RIVERS, CASEY").key).toBe("casey rivers");
    expect(deriveNameKey("Casey Rivers").key).toBe("casey rivers");

    const proposal = proposeJoin("RIVERS, CASEY", "Casey Rivers", "name");
    expect(proposal.status).toBe("match");
    expect(proposal.left.confidence).toBe("Likely");
  });

  it("does not match different people", () => {
    expect(proposeJoin("Jordan Maple", "Pat Solstice", "name").status).toBe("no_match");
  });
});

describe("join invariants", () => {
  it("never auto-merges and never recommends a candidate for ambiguous/no_match", () => {
    const samples = [
      proposeJoin("100 Birchwood Ln", "100 Birchwood Lane", "address"),
      proposeJoin("2200 Elmgrove Apt 4", "2200 Elmgrove", "address"),
      proposeJoin("a", "b", "address"),
    ];
    for (const proposal of samples) {
      expect(proposal.autoMerge).toBe(false);
      if (proposal.status !== "match") {
        expect(proposal.recommendation).not.toBe("use_as_candidate");
      }
    }
  });

  it("treats empty keys as no-match (nothing to join on)", () => {
    expect(proposeJoin("", "", "address").score).toBe(0);
    expect(proposeJoin("", "", "address").status).toBe("no_match");
  });
});
