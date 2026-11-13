import { describe, expect, it } from "vitest";

import {
  KICKOFF_FIX_TARGETS,
  MARKED_FACTS,
  projectRenewalPreparation,
  sendReady,
  withLiveKickoff,
  type RenewalKickoffFacts,
  type RenewalPreparation,
} from "@/lib/lease-renewal/renewal-preparation";

// S279 R-S279-6 (ARCH-S279-3, BEH-S279-5, AC-S279-5): the readiness rows and the message's
// marked values come from one read. A fact the shown message still marks as missing never reads
// ready beside that marker, and each read recomputes the whole list. Synthetic values only.

function kickoffFacts(overrides: Partial<RenewalKickoffFacts> = {}): RenewalKickoffFacts {
  return {
    numbers: {
      contractualRent: 1350,
      rentCharges: [1350],
      leaseEndIso: "2026-12-31",
      workingRent: null,
      sheetRent: null,
      sheetEndIso: null,
      sourceReadable: true,
    },
    comparison: { state: "none" },
    typedRent: null,
    agreementRent: null,
    currentRent: 1350,
    address: "100 Sample Street",
    ownerRecipient: { state: "ready" },
    signature: true,
    templateApproved: true,
    ...overrides,
  };
}

const row = (preparation: RenewalPreparation, key: string) =>
  preparation.items.find((item) => item.key === key)!;

/** The facts a readiness row and a message marker both name. */
const PAIRS = [
  { key: "rent", marker: MARKED_FACTS.rentToRecommend },
  { key: "signature", marker: MARKED_FACTS.signature },
] as const;

describe("S279 R-S279-6: one read behind the readiness list", () => {
  it("BEH-S279-5: a saved rent beside a message that still marks it reads missing until that message is read again", () => {
    const preparation = projectRenewalPreparation(kickoffFacts());
    // Fail-first (A-19): the typed rent read Ready while the message still marked it missing.
    const stale = withLiveKickoff(preparation, {
      typedRent: 1450,
      marked: ["rent to recommend"],
      signature: true,
      recipientReady: true,
      templateApproved: true,
    });
    expect(row(stale, "rent")).toMatchObject({
      ready: false,
      missing: "the rent to recommend",
      fix: {
        label: "Enter the rent to recommend",
        target: KICKOFF_FIX_TARGETS.rentToRecommend,
      },
    });
    expect(row(stale, "marked_values")).toMatchObject({
      ready: false,
      missing: "rent to recommend",
    });
    expect(sendReady(stale)).toBe(false);

    // The refreshed message no longer marks the rent: the whole list reads from that read.
    const refreshed = withLiveKickoff(preparation, {
      typedRent: 1450,
      marked: [],
      signature: true,
      recipientReady: true,
      templateApproved: true,
    });
    expect(row(refreshed, "rent")).toMatchObject({ ready: true, missing: null });
    expect(row(refreshed, "marked_values")).toMatchObject({ ready: true, missing: null });
    expect(refreshed.rent).toMatchObject({ value: 1450, origin: "typed" });
  });

  it("AC-S279-5: at no combination does a ready row stand beside a missing marker for the same fact", () => {
    const preparation = projectRenewalPreparation(kickoffFacts({ signature: false }));
    const markers: readonly (readonly string[])[] = [
      [],
      [MARKED_FACTS.rentToRecommend],
      [MARKED_FACTS.signature],
      [MARKED_FACTS.rentToRecommend, MARKED_FACTS.signature, "property address"],
    ];
    let checked = 0;
    for (const typedRent of [null, 1450])
      for (const signature of [null, false, true])
        for (const marked of [null, ...markers] as const) {
          const live = withLiveKickoff(preparation, {
            typedRent,
            signature,
            marked: marked ? [...marked] : null,
          });
          for (const { key, marker } of PAIRS) {
            checked += 1;
            if (marked?.some((entry) => entry === marker))
              expect(row(live, key).ready, `${key} ${JSON.stringify(marked)}`).toBe(
                false,
              );
          }
        }
    expect(checked).toBe(2 * 3 * 5 * PAIRS.length);
  });

  it("ARCH-S279-3: each read recomputes every row, never a subset carried from an earlier read", () => {
    const preparation = projectRenewalPreparation(kickoffFacts());
    const first = withLiveKickoff(preparation, {
      typedRent: 1450,
      marked: [MARKED_FACTS.rentToRecommend],
    });
    const second = withLiveKickoff(preparation, { typedRent: 1450, marked: [] });
    // The same inputs give the same list; a later read is a whole new list from that read.
    expect(
      withLiveKickoff(preparation, {
        typedRent: 1450,
        marked: [MARKED_FACTS.rentToRecommend],
      }),
    ).toEqual(first);
    expect(second.items).toHaveLength(first.items.length);
    expect(second.items.map((item) => item.key)).toEqual(
      first.items.map((item) => item.key),
    );
    expect(second.missing).not.toContain("the rent to recommend");
    expect(first.missing).toContain("the rent to recommend");
  });
});
