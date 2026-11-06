import { describe, expect, it } from "vitest";

import { observationPreparation } from "@/lib/lease-renewal/current-renewal-message";
import { storedComparisonFor } from "@/lib/lease-renewal/kickoff-facts";
import type { RenewalMarketObservation } from "@/lib/lease-renewal/market-observation";
import { projectMessageMarketEvidence } from "@/lib/lease-renewal/message-market-evidence";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";

// S249 R-S249-2 / L32: a comparison stored for this lease and cycle reaches the owner message's
// range and comparables with no second run and nothing saved. Synthetic values only.

const CYCLE = "11111111-1111-4111-8111-111111111111";
const result = {
  source: "RentCast",
  confidence: "Likely" as const,
  rangeLow: 1300,
  rangeHigh: 1500,
  pointEstimate: 1400,
  compCount: 3,
  retrievedAt: "2026-11-04T15:00:00.000Z",
  comparables: [
    { rent: 1380, distanceMiles: 0.4 },
    { rent: 1420, distanceMiles: 0.6 },
    { rent: 1460, distanceMiles: 0.9 },
  ],
};
const observation = (id: string, cycleId: string, recordedAt: string) =>
  ({
    id,
    leaseId: "9101",
    cycleId,
    result,
    market: {},
    recordedAt,
  }) as unknown as RenewalMarketObservation;
const manual = { cycleId: CYCLE, preparation: null } as unknown as RenewalWorkspaceState;

describe("S249 R-S249-2: the stored comparison reaches the message", () => {
  it("the newest stored lookup for the cycle is read as the preparation the message draws on", () => {
    const rows = [
      observation("older", CYCLE, "2026-11-01T10:00:00.000Z"),
      observation("newest", CYCLE, "2026-11-04T15:00:00.000Z"),
      observation(
        "other-cycle",
        "22222222-2222-4222-8222-222222222222",
        "2026-11-05T09:00:00.000Z",
      ),
    ];
    const stored = storedComparisonFor({ manual, observations: rows });
    expect(stored?.observationId).toBe("newest");
    const preparation = observationPreparation(rows, stored!);
    expect(preparation?.observationId).toBe("newest");
    expect(preparation?.market.rangeBasis).toBe("provider");
    expect(preparation?.market.provider?.comps).toHaveLength(3);
    const evidence = projectMessageMarketEvidence({
      preparation,
      currentBaseRent: 1350,
      selectedWorkingOffer: null,
    });
    expect(evidence.range).toMatchObject({ low: 1300, high: 1500 });
  });

  it("a staff record's saved preparation comes first", () => {
    const saved = {
      cycleId: CYCLE,
      preparation: {
        market: {
          provider: { ...result, comps: result.comparables },
          rangeLow: 1250,
          rangeHigh: 1450,
          rangeBasis: "reviewed",
        },
        source: "Staff review",
        observationId: "saved",
        recordedAt: "2026-11-03T10:00:00.000Z",
        recordedByUid: "u1",
        revision: 2,
      },
    } as unknown as RenewalWorkspaceState;
    const stored = storedComparisonFor({
      manual: saved,
      observations: [observation("newest", CYCLE, "2026-11-04T15:00:00.000Z")],
    });
    expect(stored?.observationId).toBe("saved");
  });

  it("no stored lookup and no saved preparation: nothing is read as a comparison", () => {
    expect(storedComparisonFor({ manual, observations: [] })).toBeNull();
  });
});
