import { describe, expect, it } from "vitest";

import {
  SUGGESTED_DEDUCTION_LABEL,
  buildEvidencePacket,
  type EvidenceLine,
} from "@/lib/move-out/evidence-packet";

// Move-Out evidence packet (space-teeth E2f): a transparent, integer-cents SUGGESTED deduction that
// is never final, never posts anywhere, and never invents the statutory deadline or legal wording.

const LINES: EvidenceLine[] = [
  {
    key: "inspection",
    label: "Move-out inspection charges",
    amountCents: 12550,
    source: "zInspector move-out report",
  },
  {
    key: "vendor",
    label: "Cleaning vendor bid",
    amountCents: 8999,
    source: "Vendor bid (operator-entered)",
  },
  {
    key: "lock",
    label: "Lock change owner charge",
    amountCents: 21000,
    source: "Lock-change vendor (owner-billed)",
  },
];

describe("buildEvidencePacket", () => {
  it("sums integer cents to an exact total (no floating drift)", () => {
    const packet = buildEvidencePacket({ lines: LINES });
    expect(packet.suggestedDeductionCents).toBe(42549);
    expect(packet.suggestedDeductionFormatted).toBe("$425.49");
  });

  it("avoids float drift on inputs that would drift as dollars (0.10 + 0.20)", () => {
    const packet = buildEvidencePacket({
      lines: [
        { key: "a", label: "A", amountCents: 10, source: "op" },
        { key: "b", label: "B", amountCents: 20, source: "op" },
      ],
    });
    expect(packet.suggestedDeductionCents).toBe(30);
    expect(packet.suggestedDeductionFormatted).toBe("$0.30");
  });

  it("always labels the total SUGGESTION-ONLY and keeps every line's source", () => {
    const packet = buildEvidencePacket({ lines: LINES });
    expect(packet.suggestedDeductionLabel).toBe(SUGGESTED_DEDUCTION_LABEL);
    expect(packet.suggestedDeductionLabel).toContain("SUGGESTION ONLY");
    expect(packet.suggestedDeductionLabel).toContain("owner approval required");
    expect(packet.lines).toHaveLength(3);
    for (const line of packet.lines) {
      expect(line.source.length).toBeGreaterThan(0);
    }
  });

  it("keeps the statutory deadline + legal wording as Needs-Verification placeholders (never computed)", () => {
    const packet = buildEvidencePacket({ lines: LINES });
    expect(packet.statutoryDeadline.startsWith("Needs Verification:")).toBe(true);
    expect(packet.legalWordingNote.startsWith("Needs Verification:")).toBe(true);
    // No numeric/date value is fabricated for the deadline.
    expect(packet.statutoryDeadline).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("passes through a human-supplied, legally-reviewed deadline verbatim", () => {
    const packet = buildEvidencePacket({
      lines: LINES,
      statutoryDeadlineNote:
        "Return within 30 days of lease termination (confirmed by counsel).",
    });
    expect(packet.statutoryDeadline).toBe(
      "Return within 30 days of lease termination (confirmed by counsel).",
    );
  });

  it("defaults to the provisional $500 sign-off threshold, flagged Needs Verification (note #5)", () => {
    const packet = buildEvidencePacket({ lines: LINES });
    expect(packet.repairSignoffThresholdCents).toBe(50000);
    expect(packet.repairSignoffThresholdFormatted).toBe("$500");
    expect(packet.repairSignoffThresholdVerified).toBe(false);
    expect(packet.repairSignoffThresholdLabel).toContain("Needs Verification");
    // Every LINES amount is under $500, so nothing needs sign-off.
    expect(packet.signoffRequired).toBe(false);
    expect(packet.linesNeedingSignoff).toHaveLength(0);
  });

  it("flags a line at or above the threshold as needing owner sign-off", () => {
    const packet = buildEvidencePacket({
      lines: [
        ...LINES,
        {
          key: "big-bid",
          label: "Drywall repair bid",
          amountCents: 65000,
          source: "Vendor bid",
        },
      ],
    });
    expect(packet.signoffRequired).toBe(true);
    expect(packet.linesNeedingSignoff.map((line) => line.key)).toEqual(["big-bid"]);
  });

  it("honors a Dan-confirmed threshold override and clears the Needs-Verification label", () => {
    const packet = buildEvidencePacket({
      lines: LINES,
      repairSignoffThresholdCents: 20000, // $200
      repairSignoffThresholdVerified: true,
    });
    expect(packet.repairSignoffThresholdFormatted).toBe("$200");
    expect(packet.repairSignoffThresholdVerified).toBe(true);
    expect(packet.repairSignoffThresholdLabel).toBe("");
    // The $210 lock charge is now at/above $200.
    expect(packet.linesNeedingSignoff.map((line) => line.key)).toEqual(["lock"]);
  });

  it("is draft-only and never posts to a system of record", () => {
    const packet = buildEvidencePacket({ lines: LINES });
    expect(packet.production_allowed).toBe(false);
    expect(packet.send_allowed).toBe(false);
    expect(packet.kind).toBe("move_out_evidence_packet");
    // The packet is inert data — no ledger/QuickBooks/bank field exists on it.
    expect(Object.keys(packet)).not.toContain("posted");
    expect(Object.keys(packet)).not.toContain("ledger");
  });
});
