// S278 R-S278-4 / R-S278-6 (ARCH-S278-3, AC-S278-4, AC-S278-6): the shape of one confirmation of
// a lease row's listed cells, the reference that binds it to the recorded facts, and the single
// update contract it leaves unchanged. Pure; synthetic values only.
import { describe, expect, it } from "vitest";

import { hashSheetHeader } from "@/lib/lease-renewal/sheet-writeback/execution-service";
import {
  buildSheetWritebackProposal,
  type SheetFieldUpdateEffectInput,
  type SheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import {
  SheetSetShapeError,
  assertSheetSetConfirmation,
  isSheetCellSet,
  recheckSheetSet,
} from "@/lib/lease-renewal/sheet-writeback/set-run";
import {
  SHEET_SET_MAX_CELLS,
  orderSheetSetEntries,
  takeSheetSet,
} from "@/lib/lease-renewal/sheet-writeback/set-words";
import {
  manualSheetReference,
  manualSheetSetHash,
  manualSheetSetReference,
  parseManualSheetReference,
} from "@/lib/lease-renewal/sheet-writeback/manual-reference";
import {
  SheetWorkspaceResolutionError,
  assertProposalMatchesFreshLeaseContext,
  effectForSheetFieldIntent,
  type FreshOperatingSheetLeaseContext,
} from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";
import type { SheetFieldIntent } from "@/lib/lease-renewal/sheet-writeback/field-intent";

const NOW = Date.parse("2026-11-13T12:00:00.000Z");
const CYCLE = "6f1c0d7e-2b9a-4c11-8d3e-5a7b9c1d2e3f";
const RUNTIME_BINDING = {
  version: "operating-sheet-runtime/v1",
  revision: "pmi-kc-app-test-enabled-a",
  policy: "explicit-owner-enabled/v1",
} as const;
const HEADER = ["Tenant", "Letter", "Market", "Docs"];
const COLUMNS = new Map([
  ["tenant_name", 0],
  ["renewal_letter_sent", 1],
  ["market_value", 2],
  ["lease_docs_sent", 3],
]);
const INTENTS: SheetFieldIntent[] = [
  {
    field: "renewal_letter_sent",
    value: "Done — recorded by staff",
    source: "Staff record",
  },
  { field: "market_value", value: 1500, source: "Rent to recommend, entered by staff" },
  { field: "lease_docs_sent", value: "Done — recorded by staff", source: "Staff record" },
];

function context(
  values: Record<string, string> = {
    renewal_letter_sent: "",
    market_value: "$1,450.00",
    lease_docs_sent: "",
  },
  rowNumber = 41,
): FreshOperatingSheetLeaseContext {
  return {
    leaseId: "115",
    propertyId: "84",
    tenantName: "Exact Tenant",
    sourceReadAtIso: new Date(NOW).toISOString(),
    header: HEADER,
    columns: COLUMNS,
    tenantColumnIndex: 0,
    association: { kind: "exact_link", rowNumber },
    row: {
      rowNumber,
      rowKey: null,
      anchorTenantName: "Exact Tenant",
      currentRentValue: "1400",
      fieldValues: values,
      formulaFields: [],
      currentRentSourceTriggerKey: null,
      currentRentCandidateFingerprint: null,
    },
  };
}

function proposal(
  effects: SheetFieldUpdateEffectInput[] = INTENTS.map((intent) =>
    effectForSheetFieldIntent(context(), intent),
  ),
): SheetWritebackProposal {
  return buildSheetWritebackProposal({
    runtimeBinding: RUNTIME_BINDING,
    generationId: "proposal-set-12345678",
    spreadsheetId: "sheet-live-1",
    tabTitle: "Lease Renewal",
    headerHash: hashSheetHeader(HEADER, COLUMNS),
    headerWidth: HEADER.length,
    tenantColumnIndex: 0,
    scope: { kind: "lease_workspace", leaseId: "115", propertyId: "84" },
    actorUid: "editor-1",
    actorEmail: "editor@pmikcmetro.com",
    actorRole: "Editor",
    sourceReadAtIso: new Date(NOW).toISOString(),
    evidenceRef: manualSheetSetReference(
      "115",
      CYCLE,
      effects.map((effect, index) => ({
        field: effect.field,
        eventId: `00000000-0000-4000-8000-00000000000${index + 1}`,
      })),
    ),
    effects,
    nowMs: NOW,
  });
}

describe("S278 ARCH-S278-3: one confirmation binds the ordered effect hashes of one row", () => {
  it("a three-cell proposal of one row is one set, and its confirmation names its effects in order", () => {
    const set = proposal();
    expect(set.effects).toHaveLength(3);
    expect(isSheetCellSet(set)).toBe(true);
    const hashes = set.effects.map((effect) => effect.effectHash);
    expect(() => assertSheetSetConfirmation(set, hashes)).not.toThrow();
    expect(() => assertSheetSetConfirmation(set, [...hashes].reverse())).toThrow(
      SheetSetShapeError,
    );
    expect(() => assertSheetSetConfirmation(set, hashes.slice(0, 2))).toThrow(
      SheetSetShapeError,
    );
  });

  it("AC-S278-4: cells from two rows, current rent or a repeated field are never one set", () => {
    const [letter, market] = INTENTS.map((intent) =>
      effectForSheetFieldIntent(context(), intent),
    );
    const otherRow = effectForSheetFieldIntent(context(undefined, 42), INTENTS[2]!);
    expect(isSheetCellSet(proposal([letter!, otherRow]))).toBe(false);
    expect(isSheetCellSet(proposal([letter!, letter!]))).toBe(false);
    const rent: SheetFieldUpdateEffectInput = {
      ...market!,
      field: "current_rent",
      source: "Working current rent",
      staffIntent: { field: "current_rent", value: 1500, source: "Working current rent" },
    };
    expect(isSheetCellSet(proposal([letter!, rent]))).toBe(false);
  });

  it("AC-S278-4: at most ten cells, the first ten in list order", () => {
    expect(SHEET_SET_MAX_CELLS).toBe(10);
    const entries = [
      "utility_proof",
      "owner_pricing_confirmed",
      "market_value",
      "renewal_letter_sent",
      "air_filter_setup",
      "tenant_responded",
      "info_form_sent",
      "form_returned",
      "lease_docs_sent",
      "rhino_renewed",
      "pet_registered",
    ].map((field) => ({ field, eventId: field }));
    expect(
      orderSheetSetEntries(entries)
        .map((entry) => entry.field)
        .slice(0, 3),
    ).toEqual(["owner_pricing_confirmed", "renewal_letter_sent", "market_value"]);
    const { taken, remaining } = takeSheetSet(entries);
    expect(taken).toHaveLength(10);
    expect(remaining.map((entry) => entry.field)).toEqual(["utility_proof"]);
  });

  it("the set reference binds the ordered recorded events, and the single form is unchanged", () => {
    const entries = [
      { field: "renewal_letter_sent", eventId: "00000000-0000-4000-8000-000000000001" },
      { field: "market_value", eventId: "00000000-0000-4000-8000-000000000002" },
    ];
    const reference = parseManualSheetReference(
      manualSheetSetReference("115", CYCLE, entries),
    );
    expect(reference).toEqual({
      kind: "set",
      leaseId: "115",
      cycleId: CYCLE,
      setHash: manualSheetSetHash(entries),
    });
    expect(manualSheetSetHash([...entries].reverse())).not.toBe(
      manualSheetSetHash(entries),
    );
    expect(
      parseManualSheetReference(manualSheetReference("115", CYCLE, entries[0]!.eventId)),
    ).toEqual({
      kind: "single",
      leaseId: "115",
      cycleId: CYCLE,
      eventId: entries[0]!.eventId,
    });
    expect(parseManualSheetReference("workspace:115:fresh-live-join")).toBeNull();
  });

  it("R-S278-4: the whole-set recheck names every listed cell whose value changed", () => {
    const set = proposal();
    expect(recheckSheetSet(set, context())).toEqual({ changed: [] });
    expect(
      recheckSheetSet(
        set,
        context({
          renewal_letter_sent: "",
          market_value: "$1,475.00",
          lease_docs_sent: "Sent",
        }),
      ),
    ).toEqual({ changed: ["Market value", "Lease documents sent"] });
    expect(recheckSheetSet(set, context(undefined, 43))).toEqual({
      changed: ["the lease's row"],
    });
    // A listed field that now has its own selected cell is a change too.
    expect(
      recheckSheetSet(set, context(), {
        row: null,
        cells: {
          market_value: {
            value: { tabTitle: "Lease Renewal", cell: "C41" },
            selectedBy: "Sample Staff",
            selectedAtIso: new Date(NOW).toISOString(),
          },
        } as never,
      }),
    ).toEqual({ changed: ["Market value"] });
  });

  it("each cell is revalidated on its own, right before and after its own write", () => {
    const set = proposal();
    const [first, second] = set.effects;
    // The first cell written: the second cell's own check still passes.
    const afterFirst = context({
      renewal_letter_sent: "Done — recorded by staff",
      market_value: "$1,450.00",
      lease_docs_sent: "",
    });
    expect(() =>
      assertProposalMatchesFreshLeaseContext(
        set,
        afterFirst,
        null,
        false,
        second!.effectHash,
      ),
    ).not.toThrow();
    expect(() =>
      assertProposalMatchesFreshLeaseContext(
        set,
        afterFirst,
        null,
        true,
        first!.effectHash,
      ),
    ).not.toThrow();
    // A set proposal checked without naming its cell is stale.
    expect(() => assertProposalMatchesFreshLeaseContext(set, context(), null)).toThrow(
      SheetWorkspaceResolutionError,
    );
  });

  it("AC-S278-6: a single update keeps its own one-effect preview and check", () => {
    const single = proposal([effectForSheetFieldIntent(context(), INTENTS[0]!)]);
    expect(single.effects).toHaveLength(1);
    expect(() =>
      assertProposalMatchesFreshLeaseContext(single, context(), null),
    ).not.toThrow();
    // A single proposal is still a valid one-cell set shape, but it keeps its own confirmation
    // in the route ("Apply Sheet update"); the combined confirmation needs two or more cells to
    // be offered at all.
    expect(isSheetCellSet(single)).toBe(true);
  });
});
