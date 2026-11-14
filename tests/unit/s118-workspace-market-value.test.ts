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

describe("S118 market evidence, the S278 Market value source and the five-mile default", () => {
  // S278 R-S278-1 (pinned on purpose): the Sheet market value takes the reviewed Rent to
  // recommend (lib/lease-renewal/market-value-source.ts). The comparison figure this form saves,
  // often the provider's point estimate, no longer prepares a Sheet value; the range stays app
  // evidence. tests/unit/s278-market-value-source.test.ts covers the new source.
  it("AC-S118-3 / R-S278-1: saving preparation keeps its figures and basis markers as app evidence and records no Sheet value", () => {
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
    expect(next.sourceUpdates).toEqual({});
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

  it("AC-S118-3 / R-S278-1: a comparison save withdraws an unconfirmed retired value, keeps a verified one and leaves the recommendation's value alone", () => {
    // An unconfirmed Market value an earlier comparison figure prepared (before S278).
    const legacy = {
      ...initial(),
      sourceUpdates: {
        market_value: {
          eventId: "0d3f6c1e-9d61-4c1c-9a63-6a1e1d7b2c11",
          intent: { field: "market_value" as const, value: 1500, source: "First review" },
          state: "pending" as const,
        },
      },
    };
    const withoutValue = planRenewalWorkspaceAction(
      legacy,
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
      ...legacy,
      sourceUpdates: {
        market_value: {
          ...legacy.sourceUpdates.market_value,
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
    // A Market value prepared from the reviewed Rent to recommend is not the comparison's.
    const fromRecommendation = {
      ...legacy,
      sourceUpdates: {
        market_value: {
          ...legacy.sourceUpdates.market_value,
          intent: {
            field: "market_value" as const,
            value: 1500,
            source: "Rent to recommend, entered by staff",
          },
          fromRecommendation: {
            field: "terms_rent" as const,
            revision: 2,
            eventId: "rec-event-1",
            review: "staff_save" as const,
          },
        },
      },
    };
    expect(
      planRenewalWorkspaceAction(
        fromRecommendation,
        { kind: "preparation", source: "Fourth review", pmiNumber: 1480 },
        meta("1c8b7a6f-5e4d-4c3b-8a2f-1e0d9c8b7a44"),
      ).sourceUpdates.market_value,
    ).toEqual(fromRecommendation.sourceUpdates.market_value);
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
