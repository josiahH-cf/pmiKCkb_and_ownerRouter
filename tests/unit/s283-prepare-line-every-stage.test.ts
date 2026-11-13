import { describe, expect, it } from "vitest";

import {
  preparationScope,
  preparationScopeLine,
  preparationTargets,
  type PreparationRow,
} from "@/lib/lease-renewal/preparation-scope";
import {
  preparationComparisonNeeded,
  type RenewalBatchRowView,
} from "@/lib/lease-renewal/renewal-batch-row";
import {
  projectRenewalPreparation,
  type RenewalComparisonFacts,
} from "@/lib/lease-renewal/renewal-preparation";
import type { RenewalOwnerAuthority } from "@/lib/lease-renewal/renewal-pricing-policy";

// S283 R-S283-2 / BEH-S283-2: the line beside "Prepare" states how many shown leases need a
// comparison, and that count equals the lookups the run then makes. A shown lease whose owner step
// is already underway (its batch row has no kickoff yet) is still sent and still looked up when
// nothing is stored, so the line counts it instead of dropping every count. Found while writing the
// W12-12 rehearsal check: in the November 5 mix the replied lease has no kickoff row, so the month's line
// stated no comparison count at all while the run made a lookup for it. Synthetic values only.

const CYCLE = "2026-12-31";

function shown(
  leaseId: string,
  extra: Partial<
    Pick<PreparationRow, "kickoff" | "comparisonNeeded" | "preparationEligible">
  >,
): PreparationRow {
  return {
    leaseId,
    canOpen: true,
    address: `${leaseId} Sample Pl`,
    unit: null,
    tenants: [],
    placement: { kind: "dated", dateIso: CYCLE },
    ...extra,
  };
}

type DeskFacts = Parameters<typeof preparationComparisonNeeded>[0];

function deskFacts(
  comparison: RenewalComparisonFacts | null,
  authority?: RenewalOwnerAuthority,
): DeskFacts {
  return {
    kickoff: comparison
      ? projectRenewalPreparation({
          numbers: {
            contractualRent: 1300,
            rentCharges: null,
            leaseEndIso: CYCLE,
            workingRent: null,
            sheetRent: null,
            sheetEndIso: null,
            sourceReadable: true,
          },
          comparison,
          typedRent: null,
          agreementRent: null,
          currentRent: 1300,
          ownerRecipient: null,
          signature: null,
          templateApproved: null,
          address: "101 Sample Pl",
        })
      : undefined,
    renewalPricing: authority
      ? {
          authority,
          policy: null,
          proposal: null,
          assignment: null,
          leaseAssignment: null,
          portfolioAssignment: null,
          policyChanged: false,
          agreements: [],
          standingAgreement: null,
          basisChoice: null,
          basisScope: null,
          rentSource: "RentVine",
        }
      : undefined,
  };
}

describe("BEH-S283-2 the line counts every shown lease, whatever its stage", () => {
  it("counts a lease whose owner step is underway and has no stored comparison", () => {
    const targets = preparationTargets([
      shown("9101", { kickoff: { needsComparison: false }, comparisonNeeded: false }),
      shown("9103", { kickoff: null, comparisonNeeded: false }),
      shown("9105", { kickoff: null, comparisonNeeded: true }),
    ]);
    expect(targets.map((target) => target.needsComparison)).toEqual([false, false, true]);
    expect(
      preparationScopeLine(
        preparationScope({
          shownTargets: targets,
          monthTotal: 5,
          allowance: { remaining: 50, total: 50 },
        }),
      ),
    ).toBe(
      "3 leases shown. 1 needs a comparison; 2 already have one. Monthly allowance: 50 of 50 left.",
    );
  });

  it("keeps the earlier kickoff reading for a row projected without the new fact", () => {
    const [target] = preparationTargets([
      shown("9104", { kickoff: { needsComparison: true } }),
    ]);
    expect(target?.needsComparison).toBe(true);
  });

  it("states no count when one shown lease's need cannot be read", () => {
    const targets = preparationTargets([
      shown("9101", { comparisonNeeded: false }),
      shown("9104", { kickoff: { needsComparison: true }, comparisonNeeded: null }),
    ]);
    expect(targets[1]).not.toHaveProperty("needsComparison");
    expect(preparationScopeLine(preparationScope({ shownTargets: targets }))).toBe(
      "2 leases shown.",
    );
  });

  it("omits an ineligible dated row from the targets while keeping the eligible rows", () => {
    const targets = preparationTargets([
      shown("9101", { comparisonNeeded: true, preparationEligible: false }),
      shown("9104", { comparisonNeeded: true, preparationEligible: true }),
    ]);
    expect(targets.map((target) => target.leaseId)).toEqual(["9104"]);
  });
});

describe("BEH-S283-2 a lookup is needed exactly where the preparation service would make one", () => {
  it("needs one when nothing is stored and this cycle's lookup has not run", () => {
    expect(preparationComparisonNeeded(deskFacts({ state: "none" }))).toBe(true);
    expect(preparationComparisonNeeded(deskFacts({ state: "allowance_reached" }))).toBe(
      true,
    );
  });

  it("needs none for a stored comparison, a claimed lookup or a housing assistance hold", () => {
    expect(
      preparationComparisonNeeded(deskFacts({ state: "none", attempted: true })),
    ).toBe(false);
    expect(
      preparationComparisonNeeded(deskFacts({ state: "held_back", reason: "Held back" })),
    ).toBe(false);
    expect(
      preparationComparisonNeeded(
        deskFacts({
          state: "stored",
          comparison: {
            observationId: null,
            observedAtIso: "2026-11-13T18:20:00.000Z",
            source: "Synthetic comparison",
            rangeLow: 1300,
            rangeHigh: 1500,
            compCount: 2,
            comps: [{ rent: 1300 }, { rent: 1500 }],
          },
        }),
      ),
    ).toBe(false);
  });

  it("needs none where a standing agreement covers the owner step or could not be confirmed to", () => {
    const authorities: RenewalOwnerAuthority[] = [
      { covered: true, reason: "The standing agreement covers this renewal." },
      { covered: false, unconfirmed: true, reason: "Coverage could not be confirmed." },
    ];
    for (const authority of authorities)
      expect(preparationComparisonNeeded(deskFacts({ state: "none" }, authority))).toBe(
        false,
      );
  });

  it("is unknown without preparation facts or when they could not be read", () => {
    expect(preparationComparisonNeeded(deskFacts(null))).toBeNull();
    expect(preparationComparisonNeeded(deskFacts({ state: "unreadable" }))).toBeNull();
  });

  it("leaves the field optional on a batch row", () => {
    const row: Pick<RenewalBatchRowView, "comparisonNeeded"> = {};
    expect(row.comparisonNeeded).toBeUndefined();
  });
});
