import { describe, expect, it } from "vitest";

import { RenewalMarketBasisSchema } from "@/lib/lease-renewal/market-basis-schema";
import {
  RENTCAST_QUERY_POLICY,
  buildMarketCompQueryBasis,
} from "@/lib/lease-renewal/market-comp-query-basis";
import { leaseViewsFromExport } from "@/lib/integrations/rentvine/lease-mapper";
import { compCacheKey } from "@/lib/lease-renewal/rentcast-quota";
import {
  RenewalWorkspaceActionSchema,
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
} from "@/lib/lease-renewal/workspace-state";

const meta = (eventId: string) => ({
  actorUid: "operator",
  recordedAt: "2026-09-16T12:00:00.000Z",
  eventId,
});

const initial = () =>
  emptyRenewalWorkspace("701", "b4bc3b81-c402-4f62-a2e2-c605c67867fb", {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });

describe("S118 reviewed recommendation to Sheet market value and the five-mile default", () => {
  it("AC-S118-3: saving preparation with a PMI recommendation records only the market_value Sheet intent, with its basis markers", () => {
    const next = planRenewalWorkspaceAction(
      initial(),
      {
        kind: "preparation",
        source: "Reviewed RentCast result and two listings",
        rangeLow: 1450,
        rangeHigh: 1650,
        pmiNumber: 1550,
        rangeBasis: "provider",
        recommendationBasis: "provider",
      },
      meta("f2d3b4d1-3d6e-4c9b-8e0c-1a2b3c4d5e6f"),
    );
    expect(next.preparation?.market).toEqual({
      rangeLow: 1450,
      rangeHigh: 1650,
      pmiNumber: 1550,
      rangeBasis: "provider",
      recommendationBasis: "provider",
    });
    expect(Object.keys(next.sourceUpdates)).toEqual(["market_value"]);
    expect(next.sourceUpdates.market_value).toEqual({
      eventId: "f2d3b4d1-3d6e-4c9b-8e0c-1a2b3c4d5e6f",
      intent: {
        field: "market_value",
        value: 1550,
        source: "Reviewed RentCast result and two listings",
      },
      state: "pending",
    });
    // The persisted market basis accepts the markers and refuses an invented one.
    expect(RenewalMarketBasisSchema.parse(next.preparation!.market)).toEqual(
      next.preparation!.market,
    );
    expect(() =>
      RenewalMarketBasisSchema.parse({ pmiNumber: 1550, recommendationBasis: "guess" }),
    ).toThrow();
    expect(() =>
      RenewalWorkspaceActionSchema.parse({
        kind: "preparation",
        source: "Typed",
        rangeBasis: "market",
      }),
    ).toThrow();
  });

  it("AC-S118-3: a starting-rule range without a recommendation prepares no Sheet value and clears a stale pending one", () => {
    const withValue = planRenewalWorkspaceAction(
      initial(),
      {
        kind: "preparation",
        source: "First review",
        pmiNumber: 1500,
        recommendationBasis: "reviewed",
      },
      meta("0d3f6c1e-9d61-4c1c-9a63-6a1e1d7b2c11"),
    );
    expect(withValue.sourceUpdates.market_value?.state).toBe("pending");
    const withoutValue = planRenewalWorkspaceAction(
      withValue,
      {
        kind: "preparation",
        source: "Second review, recommendation withdrawn",
        rangeLow: 800,
        rangeHigh: 1200,
        rangeBasis: "starting_rule",
      },
      meta("bd1b5a4a-2c76-4b8e-9d9e-2b5f0c9d8a22"),
    );
    expect(withoutValue.sourceUpdates).toEqual({});
    expect(withoutValue.preparation?.market).toEqual({
      rangeLow: 800,
      rangeHigh: 1200,
      rangeBasis: "starting_rule",
    });
    // A verified Sheet value stays on record; only an unconfirmed one is withdrawn.
    const verified = {
      ...withValue,
      sourceUpdates: {
        market_value: {
          ...withValue.sourceUpdates.market_value,
          state: "verified" as const,
        },
      },
    };
    expect(
      planRenewalWorkspaceAction(
        verified,
        { kind: "preparation", source: "Third review" },
        meta("9c8b7a6f-5e4d-4c3b-8a2f-1e0d9c8b7a33"),
      ).sourceUpdates.market_value?.state,
    ).toBe("verified");
  });

  it("AC-S118-2: a new source-resolved query carries the five-mile default into the request policy and cache identity", () => {
    expect(RENTCAST_QUERY_POLICY.maxRadiusMiles).toBe(5);
    const [view] = leaseViewsFromExport([
      {
        lease: { leaseID: "L1", endDate: "2026-10-31", tenants: [{ name: "Tenant" }] },
        unit: { beds: 2, fullBaths: 1, halfBaths: 0, size: "900", postalCode: "64118" },
        property: {
          streetNumber: "104",
          streetName: "NE Lindsay Ave",
          city: "Kansas City",
          stateID: "MO",
          postalCode: "64118",
        },
      },
    ]);
    const basis = buildMarketCompQueryBasis(view, "L1");
    expect(basis.policy.maxRadiusMiles).toBe(5);
    const key = (radius: number) =>
      compCacheKey({
        address: basis.addressLabel,
        ...basis.query,
        maxRadiusMiles: radius,
        requestedCompCount: basis.policy.requestedCompCount,
        lookupSubjectAttributes: basis.policy.lookupSubjectAttributes,
        providerVersion: basis.policy.providerVersion,
      });
    expect(key(5)).not.toBe(key(2));
    expect(key(3)).not.toBe(key(5));
  });
});
