// S249 review fixes A, D and J at unit level: the Finish up assembly from the final terms, the
// Gmail draft signal and the figure a reviewed message carries. Pure functions over synthetic
// values; nothing reaches a provider, a mailbox or a store.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { carriedRecommendationOf } from "@/lib/lease-renewal/current-renewal-message";
import { effectiveRenewalTerms } from "@/lib/lease-renewal/effective-terms";
import { assembleFinishUpPreparation } from "@/lib/lease-renewal/finish-up-preparation";
import {
  gmailDraftSignal,
  gmailDraftMessageRevisionOf,
  messageRevisionOf,
} from "@/lib/lease-renewal/message-revision";
import { DRAFT_BANNER } from "@/lib/constants";
import { ownerSuggestionSentence } from "@/lib/lease-renewal/renewal-message-content";
import type { FreshOperatingSheetLeaseContext } from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";
import type { RenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory-model";
import type { RecurringChargeProjection } from "@/lib/lease-renewal/writeback/proposal-contract";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";

// ---- D: the "older" signal reads the last created draft ------------------------------------------

describe("S249 D (R-S249-9): a Gmail draft never goes stale silently", () => {
  it("compares the same wording across the required Gmail review banner", () => {
    const message = {
      subject: "Sample renewal",
      body: "Hello Example,\n\nReviewed rent and reason.",
    };
    const draft = { ...message, body: `${DRAFT_BANNER}\n\n${message.body}` };
    const signal = gmailDraftSignal({
      createdHere: null,
      replacedHere: false,
      head: null,
      created: { latest: { executionId: "example-draft", ...draft }, earlier: 0 },
    });
    expect(signal.createdRevision).toBe(messageRevisionOf(message));
    expect(gmailDraftMessageRevisionOf(draft)).toBe(messageRevisionOf(message));
    expect(
      gmailDraftMessageRevisionOf({ ...draft, body: `${draft.body}\nChanged reason.` }),
    ).not.toBe(messageRevisionOf(message));
    expect(draft.body.startsWith(`${DRAFT_BANNER}\n\n`)).toBe(true);
  });

  const revisionA = {
    subject: "Renewal for 100 Sample Street",
    body: "Revision A body.",
  };
  const revisionB = {
    subject: "Renewal for 100 Sample Street",
    body: "Revision B body.",
  };

  it("a cancelled replacement preview moves the head, and the created draft still reads", () => {
    const signal = gmailDraftSignal({
      createdHere: null,
      replacedHere: false,
      // The head is the cancelled attempt: previewed from revision B, never created.
      head: { executionId: "exec-b", outcome: null, preview: revisionB },
      created: {
        latest: { executionId: "exec-a", ...revisionA },
        earlier: 0,
      },
    });
    expect(signal.createdRevision).toBe(messageRevisionOf(revisionA));
    expect(signal.createdRevision).not.toBe(messageRevisionOf(revisionB));
    expect(signal.earlierRemain).toBe(false);
  });

  it("after a confirmed replacement the earlier draft is named as still in Gmail", () => {
    expect(
      gmailDraftSignal({
        createdHere: null,
        replacedHere: false,
        head: null,
        created: { latest: { executionId: "exec-b", ...revisionB }, earlier: 1 },
      }).earlierRemain,
    ).toBe(true);
    expect(
      gmailDraftSignal({
        createdHere: messageRevisionOf(revisionB),
        replacedHere: true,
        head: null,
        created: null,
      }),
    ).toMatchObject({
      createdRevision: messageRevisionOf(revisionB),
      earlierRemain: true,
    });
  });

  it("a draft recorded on the head before the created list existed still reads", () => {
    expect(
      gmailDraftSignal({
        createdHere: null,
        replacedHere: false,
        head: {
          executionId: "exec-a",
          outcome: { status: "created" },
          preview: revisionA,
        },
        created: null,
      }).createdRevision,
    ).toBe(messageRevisionOf(revisionA));
  });
});

// ---- J: the send saves the figure the reviewed message carried -----------------------------------

describe("S249 J (R-S249-5): the reviewed figure the send carried", () => {
  const proposal = {
    value: 1420,
    origin: "comparison",
    basis: "Suggested from the stored comparison.",
  };
  const sentence = ownerSuggestionSentence(1420)!;

  it("is the proposal the composed text states", () => {
    expect(
      carriedRecommendationOf(
        "owner",
        proposal,
        { value: 1420, kind: "proposal" },
        `Hello,\n\n${sentence}`,
      ),
    ).toEqual({ value: 1420, origin: "comparison", basis: proposal.basis });
  });

  it("is none when the figure is typed, edited out of the wording or the message is the tenant's", () => {
    expect(
      carriedRecommendationOf(
        "owner",
        { value: 1400, origin: "typed", basis: "Entered by staff." },
        { value: 1400, kind: "working_offer" },
        ownerSuggestionSentence(1400)!,
      ),
    ).toBeNull();
    expect(
      carriedRecommendationOf(
        "owner",
        proposal,
        { value: 1420, kind: "proposal" },
        "Hello,\n\nThe owner decides the rent.",
      ),
    ).toBeNull();
    expect(
      carriedRecommendationOf(
        "tenant",
        proposal,
        { value: 1420, kind: "proposal" },
        sentence,
      ),
    ).toBeNull();
  });
});

// ---- A: Finish up assembles the RentVine and Sheet previews from the final terms -----------------

function charge(
  overrides: Partial<RecurringChargeProjection>,
): RecurringChargeProjection {
  return {
    leaseRecurringChargeID: "91011",
    leaseID: "9101",
    accountID: "4001",
    amount: "1350.00",
    description: "Rent",
    dayDue: "1",
    frequency: "1",
    startDate: "01/01/2026",
    isMoveInCharge: "0",
    isFromImport: "0",
    endDate: null,
    nextChargeDate: null,
    rentIncreaseID: null,
    importSourceKey: null,
    recurringStatusID: 1,
    ...overrides,
  };
}

const INVENTORY: RenewalChargeInventory = {
  leaseId: "9101",
  leaseDates: {
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    increaseEligibilityDate: null,
  },
  asOfDate: "2026-11-05",
  charges: [
    {
      id: "91011",
      accountId: "4001",
      accountLabel: "Rent",
      classification: "rent",
      current: true,
      projection: charge({}),
    },
  ],
};

const SHEET = {
  leaseId: "9101",
  propertyId: "9501",
  tenantName: "Avery Example",
  sourceReadAtIso: "2026-11-05T15:00:00.000Z",
  header: [],
  columns: new Map([
    ["renewal_date", 3],
    ["current_rent", 4],
  ]),
  tenantColumnIndex: 2,
  association: { kind: "exact" },
  fieldCells: { renewal_date: "D7" },
  row: {
    rowNumber: 7,
    rowKey: null,
    anchorTenantName: "Avery Example",
    currentRentValue: "1350",
    fieldValues: { renewal_date: "12/31/2026", current_rent: "1350" },
    currentRentSourceTriggerKey: null,
    currentRentCandidateFingerprint: null,
  },
} as unknown as FreshOperatingSheetLeaseContext;

function workingRecord(terms: {
  rent?: number;
  effectiveDate?: string;
  endDate?: string;
}): RenewalWorkingRecord {
  const field = (value: unknown) =>
    value === undefined
      ? undefined
      : {
          value,
          origin: "staff_entry",
          sourceLabel: "Staff entry",
          context: null,
          savedAt: "2026-11-05T15:00:00.000Z",
          savedByUid: "synthetic-editor",
          revision: 1,
        };
  return {
    leaseId: "9101",
    revision: 3,
    fields: {
      ...(terms.rent !== undefined ? { terms_rent: field(terms.rent) } : {}),
      ...(terms.effectiveDate !== undefined
        ? { terms_effective_date: field(terms.effectiveDate) }
        : {}),
      ...(terms.endDate !== undefined ? { terms_end_date: field(terms.endDate) } : {}),
    },
  } as unknown as RenewalWorkingRecord;
}

const FINAL = { rent: 1420, effectiveDate: "2027-01-01", endDate: "2027-12-31" };

describe("S249 A (R-S249-14 / L42): Finish up shows the source update previews from the final terms", () => {
  const input = (
    overrides: Partial<Parameters<typeof assembleFinishUpPreparation>[0]> = {},
  ) => ({
    leaseId: "9101",
    terms: effectiveRenewalTerms(workingRecord(FINAL)),
    inventory: INVENTORY,
    sheet: SHEET,
    identity: { addressLabel: "101 Sample Pl", leaseId: "9101" },
    readAtIso: "2026-11-05T15:00:00.000Z",
    ...overrides,
  });

  it("assembles the RentVine lease end and renewal rent and the Sheet renewal date previews", () => {
    const finish = assembleFinishUpPreparation(input());
    expect(finish.terms).toEqual(FINAL);
    expect(finish.applyTarget).toBe("renewal-rent-and-charges");
    expect(finish.rentvine?.state).toBe("ready");
    if (finish.rentvine?.state !== "ready") throw new Error("expected RentVine previews");
    expect(finish.rentvine.previews.map((preview) => preview.key)).toEqual([
      "rentvine-dates",
      "rentvine-rent",
    ]);
    const [dates, rent] = finish.rentvine.previews;
    expect(dates!.facts).toMatchObject({
      lease: "101 Sample Pl, lease 9101",
      target: "Lease renewal dates",
    });
    expect(dates!.facts.proposed).toContain("12/31/2027");
    expect(rent!.facts.current).toBe("No charge yet");
    expect(rent!.facts.proposed).toContain("1420.00");
    expect(rent!.facts.proposed).toContain("01/01/2027");
    expect(finish.sheet?.state).toBe("ready");
    if (finish.sheet?.state !== "ready") throw new Error("expected a Sheet preview");
    expect(finish.sheet.previews[0]!.facts).toMatchObject({
      target: "Renewal date",
      current: "12/31/2026",
    });
    expect(finish.sheet.previews[0]!.facts.source).toContain("cell D7");
  });

  it("waits for final terms and names what they still need", () => {
    const finish = assembleFinishUpPreparation(
      input({ terms: effectiveRenewalTerms(workingRecord({ rent: 1420 })) }),
    );
    expect(finish).toMatchObject({ terms: null, rentvine: null, sheet: null });
    expect(finish.termsMissing).toEqual(["the effective date", "the end date"]);
  });

  it("states an unread source instead of assuming it", () => {
    const finish = assembleFinishUpPreparation(input({ inventory: null, sheet: null }));
    expect(finish.rentvine?.state).toBe("unavailable");
    expect(finish.sheet?.state).toBe("unavailable");
  });

  it("names a source that already holds the terms", () => {
    const finish = assembleFinishUpPreparation(
      input({
        terms: effectiveRenewalTerms(
          workingRecord({
            rent: 1350,
            effectiveDate: "2026-01-01",
            endDate: "2026-12-31",
          }),
        ),
      }),
    );
    expect(finish.rentvine?.state).toBe("current");
  });

  it("is assembly only: the module reads and writes nothing itself", () => {
    const text = readFileSync("lib/lease-renewal/finish-up-preparation.ts", "utf8");
    const imports = [...text.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
    for (const name of imports)
      expect(
        /firestore|fetch|gmail|sequence|execution-service|proposal-store|live-config|external-execution/.test(
          name!,
        ),
        `imports ${name}`,
      ).toBe(false);
    expect(text).not.toMatch(/\bfetch\(|\.set\(|\.create\(|\.update\(/);
  });
});
