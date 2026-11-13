// S278 R-S278-3 (ARCH-S278-2, AC-S278-3): Finish up's one list is a read projection over the
// recorded facts, the open proposal and the receipts. Synthetic values only.
import { describe, expect, it } from "vitest";

import {
  SOURCE_UPDATES_WORDS,
  nextPendingRowKey,
  projectSourceUpdates,
} from "@/lib/lease-renewal/source-updates-list";
import {
  SHEET_SET_WORDS,
  takeSheetSet,
} from "@/lib/lease-renewal/sheet-writeback/set-words";
import type { FinishUpPreparation } from "@/lib/lease-renewal/finish-up-preparation";
import {
  emptyRenewalWorkspace,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import type { SheetFieldIntent } from "@/lib/lease-renewal/sheet-writeback/field-intent";

const CYCLE = "6f1c0d7e-2b9a-4c11-8d3e-5a7b9c1d2e3f";

function uuid(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

type Entry = RenewalWorkspaceState["sourceUpdates"][string];

function withUpdates(
  updates: Record<string, Partial<Entry> & { intent: SheetFieldIntent }>,
): RenewalWorkspaceState {
  const base = emptyRenewalWorkspace("9101", CYCLE, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
  let index = 1;
  return {
    ...base,
    sourceUpdates: Object.fromEntries(
      Object.entries(updates).map(([field, entry]) => [
        field,
        { eventId: uuid(index++), state: "pending", ...entry } as Entry,
      ]),
    ),
  };
}

/** Five recorded Sheet facts, as on lease 9101 before Documents (audit finding A-18). */
const FIVE = {
  tenant_responded: {
    intent: {
      field: "tenant_responded",
      value: "Done — recorded by staff",
      source: "Staff record",
    },
  },
  owner_pricing_confirmed: {
    intent: { field: "owner_pricing_confirmed", value: true, source: "Staff record" },
  },
  renewal_letter_sent: {
    intent: {
      field: "renewal_letter_sent",
      value: "Done — recorded by staff",
      source: "Staff record",
    },
  },
  market_value: {
    intent: {
      field: "market_value",
      value: 1500,
      source: "Rent to recommend, entered by staff",
    },
    fromRecommendation: {
      field: "terms_rent",
      revision: 3,
      eventId: "rec-1",
      review: "staff_save",
    },
  },
  lease_docs_sent: {
    intent: {
      field: "lease_docs_sent",
      value: "Done — recorded by staff",
      source: "Staff record",
    },
  },
} as const satisfies Record<string, Partial<Entry> & { intent: SheetFieldIntent }>;

const SHEET_NOW = {
  owner_pricing_confirmed: "No",
  renewal_letter_sent: "",
  market_value: "$1,450.00",
  tenant_responded: "Waiting",
  lease_docs_sent: "",
};

describe("S278 ARCH-S278-2: one list of the pending source updates", () => {
  it("AC-S278-3: shows every pending fact once, in list order, with the Sheet's value now, the new value and its basis", () => {
    const list = projectSourceUpdates({
      state: withUpdates(FIVE),
      marketValue: { kind: "none" },
      page: { sheetValues: SHEET_NOW, openSheetProposal: null },
    });
    expect(list.heading).toBe("Source updates (5 pending)");
    expect(list.rows.map((row) => row.field)).toEqual([
      "owner_pricing_confirmed",
      "renewal_letter_sent",
      "market_value",
      "tenant_responded",
      "lease_docs_sent",
    ]);
    expect(new Set(list.rows.map((row) => row.key)).size).toBe(5);
    expect(list.rows[0]).toMatchObject({
      label: "Owner pricing confirmed",
      current: "No",
      next: "Yes",
      basis: "Staff record",
      state: "pending",
      action: { kind: "prepare_source", field: "owner_pricing_confirmed" },
    });
    expect(list.rows[1]?.current).toBe(SOURCE_UPDATES_WORDS.blank);
    expect(list.rows[2]).toMatchObject({ current: "$1,450.00", next: "$1,500.00" });
    // R-S278-4: two or more recorded Sheet cells offer one review.
    expect(list.combined).toMatchObject({
      count: 5,
      label: "Review all 5 Sheet updates",
      remaining: 0,
      marketValue: false,
    });
    expect(list.combined?.entries).toHaveLength(5);
  });

  it("AC-S278-3: while one proposal is open the other rows read 'Finish or discard the open update first'", () => {
    const state = withUpdates({
      ...FIVE,
      renewal_letter_sent: {
        ...FIVE.renewal_letter_sent,
        state: "prepared",
        proposalId: "proposal-x",
      },
    });
    const list = projectSourceUpdates({
      state,
      marketValue: { kind: "none" },
      page: {
        sheetValues: SHEET_NOW,
        openSheetProposal: {
          previewHash: "a".repeat(64),
          fields: ["renewal_letter_sent"],
          settled: false,
        },
      },
    });
    const open = list.rows.find((row) => row.field === "renewal_letter_sent");
    expect(open).toMatchObject({ state: "prepared", action: null, waitsForOpen: false });
    for (const row of list.rows.filter((item) => item.field !== "renewal_letter_sent"))
      expect(row.waitsForOpen).toBe(true);
    expect(list.combined).toBeNull();
    expect(SOURCE_UPDATES_WORDS.openFirst).toBe(
      "Finish or discard the open update first",
    );
  });

  it("AC-S278-3: a confirmed read-back shows done with its receipt time and focus moves to the next waiting row", () => {
    const state = withUpdates({
      ...FIVE,
      owner_pricing_confirmed: {
        ...FIVE.owner_pricing_confirmed,
        state: "verified",
        receiptAt: "2026-11-13T16:42:00.000Z",
      },
    });
    const list = projectSourceUpdates({
      state,
      marketValue: { kind: "none" },
      page: { sheetValues: SHEET_NOW, openSheetProposal: null },
    });
    expect(list.heading).toBe("Source updates (4 pending)");
    expect(list.rows[0]).toMatchObject({
      state: "done",
      receiptAt: "2026-11-13T16:42:00.000Z",
      action: null,
    });
    expect(nextPendingRowKey(list.rows, "sheet:owner_pricing_confirmed")).toBe(
      "sheet:renewal_letter_sent",
    );
    // The last row done: focus wraps to the first row still waiting.
    expect(nextPendingRowKey(list.rows, "sheet:lease_docs_sent")).toBe(
      "sheet:renewal_letter_sent",
    );
  });

  it("AC-S278-3: a conflict or refusal stays on its row with its recovery; the others keep their state", () => {
    const state = withUpdates({
      ...FIVE,
      tenant_responded: {
        ...FIVE.tenant_responded,
        state: "unavailable",
        reason: "This Sheet cell holds a formula, so the app does not replace it.",
      },
    });
    const list = projectSourceUpdates({
      state,
      marketValue: { kind: "none" },
      page: {
        sheetValues: SHEET_NOW,
        openSheetProposal: {
          previewHash: "b".repeat(64),
          fields: ["owner_pricing_confirmed", "renewal_letter_sent", "market_value"],
          settled: true,
          failed: ["market_value"],
        },
      },
    });
    expect(list.rows.find((row) => row.field === "tenant_responded")).toMatchObject({
      state: "unavailable",
      reason: "This Sheet cell holds a formula, so the app does not replace it.",
      action: { kind: "prepare_source" },
    });
    expect(list.rows.find((row) => row.field === "market_value")).toMatchObject({
      state: "unavailable",
      reason: SOURCE_UPDATES_WORDS.declined,
    });
    expect(list.rows.find((row) => row.field === "lease_docs_sent")?.state).toBe(
      "pending",
    );
  });

  it("R-S278-1: the retired comparison value is never listed, and the reviewed recommendation joins the list", () => {
    const state = withUpdates({
      market_value: {
        intent: { field: "market_value", value: 1480, source: "Comparison" },
      },
      renewal_letter_sent: FIVE.renewal_letter_sent,
    });
    const list = projectSourceUpdates({
      state,
      marketValue: {
        kind: "reviewed",
        recommendation: {
          field: "terms_rent",
          revision: 4,
          eventId: "rec-4",
          review: "staff_save",
          value: 1500,
          basisPhrase: "entered by staff",
        },
      },
      page: { sheetValues: SHEET_NOW, openSheetProposal: null },
    });
    const market = list.rows.filter((row) => row.field === "market_value");
    expect(market).toHaveLength(1);
    expect(market[0]).toMatchObject({
      next: "$1,500.00",
      action: { kind: "prepare_market_value" },
    });
    expect(list.combined).toMatchObject({ count: 2, marketValue: true });
  });

  it("R-S278-2: Finish up's previews join the list and open their own form", () => {
    const finishUp: FinishUpPreparation = {
      terms: { rent: 1500, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
      termsMissing: [],
      applyTarget: "renewal-rent-and-charges",
      rentvine: {
        state: "ready",
        previews: [
          {
            key: "rentvine-dates",
            title: "RentVine lease end date",
            facts: {
              lease: "lease 9101",
              source: "RentVine",
              target: "Lease renewal dates",
              current: "ends 12/31/2026",
              proposed: "ends 12/31/2027",
              timing: "Lease end date",
              consequence: "No other lease field changes.",
            },
          },
        ],
        notes: [],
      },
      sheet: {
        state: "ready",
        previews: [
          {
            key: "sheet-renewal_date",
            title: "Operating Sheet renewal date",
            facts: {
              lease: "lease 9101",
              source: "Operating renewal Sheet",
              target: "Renewal date",
              current: "12/31/2026",
              proposed: "12/31/2027",
              timing: "Now",
              consequence: "",
            },
          },
        ],
        notes: [],
      },
    };
    const list = projectSourceUpdates({
      state: withUpdates({}),
      marketValue: { kind: "none" },
      page: {
        sheetValues: { renewal_date: "12/31/2026" },
        finishUp,
        openSheetProposal: null,
      },
    });
    expect(list.rows.map((row) => row.key)).toEqual([
      "sheet-terms:renewal_date",
      "rentvine:rentvine-dates",
    ]);
    expect(list.rows[0]).toMatchObject({
      next: "12/31/2027",
      basis: "Working renewal terms",
      action: { kind: "open_form", previewKey: "sheet-renewal_date" },
    });
    expect(list.rows[1]).toMatchObject({
      current: "ends 12/31/2026",
      next: "ends 12/31/2027",
      action: { kind: "open_form", previewKey: "rentvine-dates" },
    });
    // These reviews stay single: they are not recorded staff facts.
    expect(list.combined).toBeNull();
  });

  it("AC-S278-4: eleven pending cells give a review of ten and say one remains", () => {
    const fields = [
      "owner_pricing_confirmed",
      "renewal_letter_sent",
      "renewal_completed",
      "tenant_responded",
      "info_form_sent",
      "form_returned",
      "lease_docs_sent",
      "rhino_renewed",
      "pet_registered",
      "esign_complete",
      "additional_insured_verified",
    ] as const;
    const state = withUpdates(
      Object.fromEntries(
        fields.map((field) => [
          field,
          { intent: { field, value: "Done", source: "Staff record" } },
        ]),
      ),
    );
    const list = projectSourceUpdates({ state, marketValue: { kind: "none" } });
    expect(list.combined).toMatchObject({
      count: 10,
      label: "Review all 10 Sheet updates",
      remaining: 1,
    });
    expect(SHEET_SET_WORDS.remaining(1)).toBe(
      "1 more Sheet update remains for the next review.",
    );
    const { taken, remaining } = takeSheetSet(list.combined!.entries);
    expect(taken).toHaveLength(10);
    expect(remaining.map((entry) => entry.field)).toEqual([
      "additional_insured_verified",
    ]);
  });

  it("AC-S278-5: projecting the list makes no request and holds no write", () => {
    const state = withUpdates(FIVE);
    const before = JSON.stringify(state);
    projectSourceUpdates({ state, marketValue: { kind: "none" } });
    expect(JSON.stringify(state)).toBe(before);
  });
});
