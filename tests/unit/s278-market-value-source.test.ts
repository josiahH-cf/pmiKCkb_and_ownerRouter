// S278 R-S278-1: the operating Sheet "Market value" takes the reviewed current-cycle Rent to
// recommend, never the hidden provider-filled comparison figure. Synthetic values only.
import { describe, expect, it } from "vitest";

import {
  MARKET_VALUE_WORDS,
  marketValueBindingCurrent,
  marketValueSheetIntent,
  marketValueSource,
  recommendationBinding,
  type MarketValueSource,
} from "@/lib/lease-renewal/market-value-source";
import { projectSourceUpdates } from "@/lib/lease-renewal/source-updates-list";
import type { LeaseOutreachEvidenceInput } from "@/lib/lease-renewal/outreach-evidence";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
} from "@/lib/lease-renewal/workspace-state";
import type {
  RenewalWorkingRecord,
  WorkingFieldEntry,
} from "@/lib/lease-renewal/working-record";

const CYCLE = "6f1c0d7e-2b9a-4c11-8d3e-5a7b9c1d2e3f";
const SAVED_AT = "2026-11-12T15:00:00.000Z";

function entry(overrides: Partial<WorkingFieldEntry> = {}): WorkingFieldEntry {
  return {
    value: 1500,
    revision: 3,
    eventId: "e1a2b3c4-0000-4000-8000-000000000001",
    recordedAt: SAVED_AT,
    recordedByUid: "staff-1",
    recordedByLabel: "Sample Staff",
    origin: "staff_entry",
    cycleId: CYCLE,
    ...overrides,
  };
}

/** A recommendation the monthly preparation saved from the stored comparison (S249). */
function prepared(value = 1500): WorkingFieldEntry {
  return entry({
    value,
    origin: "adopted_source",
    sourceLabel: "Stored comparison",
    recordedByLabel: "Sample Staff",
    context: JSON.stringify({
      cycleId: CYCLE,
      cycleDateIso: "2026-12-31",
      basis: "Median of 5 comparables.",
    }),
  });
}

function record(rent: WorkingFieldEntry): RenewalWorkingRecord {
  return {
    schemaVersion: "renewal-working-record/v1",
    leaseId: "9101",
    revision: rent.revision,
    fields: { terms_rent: rent },
  };
}

function ownerSend(sentAtMs: number): LeaseOutreachEvidenceInput {
  return {
    readable: true,
    messages: [
      {
        sequenceId: "seq-owner-1",
        audience: "owner",
        cycleId: CYCLE,
        createdAtMs: sentAtMs - 60_000,
        scheduledForMs: null,
        unconfirmed: false,
        accepted: [
          {
            occurrenceId: "a".repeat(64),
            sentAtMs,
            senderEmail: "staff@pmikcmetro.com",
          },
        ],
        replies: [],
        failedDeliveries: [],
      },
    ],
    records: [],
    drafts: [],
  };
}

function workspace() {
  return emptyRenewalWorkspace("9101", CYCLE, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
}

function pendingMarketValue(source: MarketValueSource) {
  const list = projectSourceUpdates({ state: workspace(), marketValue: source });
  return list.rows.find((row) => row.field === "market_value") ?? null;
}

describe("S278 R-S278-1: Market value from the reviewed recommendation", () => {
  it("ARCH-S278-1 / BEH-S278-1: a $1,480 point estimate and a staff-saved $1,500 recommendation prepare $1,500.00 with its basis", () => {
    // The comparison save carries the provider's point estimate; it no longer feeds the Sheet.
    const afterComparison = planRenewalWorkspaceAction(
      workspace(),
      {
        kind: "preparation",
        source: "Reviewed RentCast result",
        rangeLow: 1400,
        rangeHigh: 1600,
        pmiNumber: 1480,
        rangeBasis: "provider",
        recommendationBasis: "provider",
      },
      { actorUid: "staff-1", recordedAt: SAVED_AT, eventId: "evt-preparation-0001" },
    );
    expect(afterComparison.sourceUpdates.market_value).toBeUndefined();
    expect(afterComparison.preparation?.market.pmiNumber).toBe(1480);

    const source = marketValueSource({ record: record(entry()), cycleId: CYCLE });
    expect(source).toMatchObject({
      kind: "reviewed",
      recommendation: { value: 1500, review: "staff_save", field: "terms_rent" },
    });
    if (source.kind !== "reviewed") throw new Error("expected a reviewed recommendation");
    expect(marketValueSheetIntent(source.recommendation)).toEqual({
      field: "market_value",
      value: 1500,
      source: "Rent to recommend, entered by staff",
    });
    const row = pendingMarketValue(source);
    expect(row).toMatchObject({
      label: "Market value",
      next: "$1,500.00",
      basis: "Rent to recommend, entered by staff",
      action: { kind: "prepare_market_value" },
    });
  });

  it("BEH-S278-2: a lease prepared only by the monthly run shows no Market value until its recommendation is reviewed", () => {
    const untouched = marketValueSource({ record: record(prepared()), cycleId: CYCLE });
    expect(untouched).toEqual({ kind: "not_reviewed", value: 1500 });
    expect(pendingMarketValue(untouched)).toBeNull();
    expect(MARKET_VALUE_WORDS.notReviewed).toMatch(/once staff review it/);

    // A staff-confirmed owner message review that states it, sent after it was saved.
    const viaOwnerReview = marketValueSource({
      record: record(prepared()),
      cycleId: CYCLE,
      outreach: ownerSend(Date.parse(SAVED_AT) + 3_600_000),
    });
    expect(viaOwnerReview).toMatchObject({
      kind: "reviewed",
      recommendation: { review: "owner_message_review", value: 1500 },
    });
    expect(pendingMarketValue(viaOwnerReview)?.basis).toBe(
      "Rent to recommend, suggested from the stored comparison, stated in the reviewed owner message",
    );

    // An owner message sent before the recommendation was saved does not state it.
    expect(
      marketValueSource({
        record: record(prepared()),
        cycleId: CYCLE,
        outreach: ownerSend(Date.parse(SAVED_AT) - 3_600_000),
      }).kind,
    ).toBe("not_reviewed");

    // A staff save of the recommendation reviews it.
    const edited = marketValueSource({
      record: record(entry({ value: 1525, revision: 4 })),
      cycleId: CYCLE,
    });
    expect(pendingMarketValue(edited)?.next).toBe("$1,525.00");
  });

  it("AC-S278-1: varied independently, the pending value always equals the reviewed recommendation", () => {
    for (const estimate of [1480, 1500, 1620]) {
      for (const recommendation of [1395, 1500, 1610.5]) {
        const state = planRenewalWorkspaceAction(
          workspace(),
          {
            kind: "preparation",
            source: "Comparison",
            pmiNumber: estimate,
            recommendationBasis: "provider",
          },
          { actorUid: "staff-1", recordedAt: SAVED_AT, eventId: `evt-${estimate}` },
        );
        expect(state.sourceUpdates.market_value).toBeUndefined();
        const source = marketValueSource({
          record: record(entry({ value: recommendation })),
          cycleId: CYCLE,
        });
        const row = projectSourceUpdates({ state, marketValue: source }).rows.find(
          (item) => item.field === "market_value",
        );
        expect(row?.next).toBe(
          `$${recommendation.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
        );
      }
    }
  });

  it("AC-S278-1: a prepared Market value stays bound to the exact recommendation entry", () => {
    const source = marketValueSource({ record: record(entry()), cycleId: CYCLE });
    if (source.kind !== "reviewed") throw new Error("expected a reviewed recommendation");
    const binding = recommendationBinding(source.recommendation);
    expect(marketValueBindingCurrent(binding, 1500, source)).toBe(true);
    // A changed recommendation (new revision) makes the prepared value out of date.
    const changed = marketValueSource({
      record: record(entry({ value: 1550, revision: 5, eventId: "e-new" })),
      cycleId: CYCLE,
    });
    expect(marketValueBindingCurrent(binding, 1500, changed)).toBe(false);
    expect(marketValueBindingCurrent(binding, 1500, { kind: "none" })).toBe(false);
  });

  it("AC-S278-5: reading the source writes nothing and no recommendation means no Market value", () => {
    const empty = marketValueSource({ record: null, cycleId: CYCLE });
    expect(empty).toEqual({ kind: "none" });
    expect(pendingMarketValue(empty)).toBeNull();
  });
});
