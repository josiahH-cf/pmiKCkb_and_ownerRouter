import { describe, expect, it } from "vitest";

import { operationalCurrentRent } from "@/lib/lease-renewal/current-rent";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import type {
  RenewalChargeInventory,
  RenewalChargeOption,
} from "@/lib/lease-renewal/writeback/charge-inventory-model";

// S153: one shared meaning of current rent. Values are synthetic.

function charge(
  id: string,
  amount: string,
  classification: RenewalChargeOption["classification"],
  current: boolean | null,
): RenewalChargeOption {
  return {
    id,
    accountId: `acct-${id}`,
    accountLabel: classification === "rent" ? "Rent" : "Pet fee",
    classification,
    current,
    projection: {
      leaseRecurringChargeID: id,
      leaseID: "701",
      accountID: `acct-${id}`,
      amount,
      description: "Synthetic charge",
      dayDue: "1",
      frequency: "1",
      startDate: "2026-01-01",
      isMoveInCharge: "0",
      isFromImport: "0",
      endDate: null,
      nextChargeDate: null,
      rentIncreaseID: null,
      importSourceKey: null,
      recurringStatusID: 1,
    },
  };
}

function inventory(charges: RenewalChargeOption[]): RenewalChargeInventory {
  return {
    leaseId: "701",
    leaseDates: { startDate: "2026-01-01", endDate: "2026-12-31" } as never,
    asOfDate: "2026-10-02",
    charges,
  };
}

function working(value: number | null): RenewalWorkingRecord {
  return {
    schemaVersion: "renewal-working-record/v1",
    leaseId: "701",
    revision: 1,
    fields: {
      current_rent: {
        value,
        revision: 1,
        eventId: "0f1c8f6e-6d1c-4bd3-9d7a-000000000001",
        recordedAt: "2026-10-02T15:00:00.000Z",
        recordedByUid: "editor-1",
        recordedByLabel: "editor1@pmikcmetro.com",
        origin: "staff_entry",
      },
    },
  };
}

describe("S153 operational current rent", () => {
  it("BEH-S153-1/2: one current rent-account charge is the current rent; other charges and the contractual amount never inflate it", () => {
    const result = operationalCurrentRent({
      inventory: inventory([
        charge("1", "1850.00", "rent", true),
        charge("2", "35.00", "non_rent", true),
        charge("3", "12.50", "non_rent", true),
      ]),
      contractualRent: 1800,
    });
    expect(result).toMatchObject({
      amount: 1850,
      basis: "rent_charge",
      chargeEvidence: "single",
      contractualRent: 1800,
      attention: null,
    });
    expect(result.rentCharge?.id).toBe("1");
  });

  it("AC-S153-1/BEH-S153-5: several current rent charges yield no selected or summed rent; the contractual amount keeps its own label", () => {
    const result = operationalCurrentRent({
      inventory: inventory([
        charge("1", "900.00", "rent", true),
        charge("2", "950.00", "rent", true),
      ]),
      contractualRent: 1800,
    });
    expect(result.chargeEvidence).toBe("several");
    expect(result.rentCharge).toBeNull();
    expect(result.candidates.map((item) => item.id)).toEqual(["1", "2"]);
    expect(result).toMatchObject({ amount: 1800, basis: "contractual" });
    expect(result.amount).not.toBe(1850);
    expect(result.attention).toMatch(/none is selected or added together/);
  });

  it("AC-S153-2: a future rent charge and current fees never change the current rent", () => {
    const result = operationalCurrentRent({
      inventory: inventory([
        charge("1", "1850.00", "rent", true),
        charge("2", "1995.00", "rent", false),
        charge("3", "35.00", "non_rent", true),
      ]),
      contractualRent: 1850,
    });
    expect(result).toMatchObject({ amount: 1850, basis: "rent_charge" });
    expect(result.candidates.map((item) => item.id)).toEqual(["1"]);
  });

  it("BEH-S153-5: an unclear schedule or unclassified account is shown as evidence and never chosen", () => {
    const unclearSchedule = operationalCurrentRent({
      inventory: inventory([charge("1", "1850.00", "rent", null)]),
      contractualRent: 1800,
    });
    expect(unclearSchedule).toMatchObject({
      chargeEvidence: "unclear",
      basis: "contractual",
      amount: 1800,
    });
    const unknownAccount = operationalCurrentRent({
      inventory: inventory([
        charge("1", "1850.00", "rent", true),
        charge("2", "1850.00", "unknown", true),
      ]),
      contractualRent: null,
    });
    expect(unknownAccount).toMatchObject({
      chargeEvidence: "unclear",
      basis: "none",
      amount: null,
    });
    expect(unknownAccount.candidates).toHaveLength(2);
  });

  it("BEH-S153-5: an unavailable or empty inventory is reported without inventing a charge", () => {
    expect(
      operationalCurrentRent({ inventory: null, contractualRent: 1800 }),
    ).toMatchObject({
      chargeEvidence: "unavailable",
      basis: "contractual",
      amount: 1800,
    });
    expect(
      operationalCurrentRent({ inventory: inventory([]), contractualRent: null }),
    ).toMatchObject({ chargeEvidence: "none", basis: "none", amount: null });
  });

  it("BEH-S153-6/9: a retained working value leads everywhere and keeps the charge evidence visible", () => {
    const withCharges = operationalCurrentRent({
      working: working(1875),
      inventory: inventory([
        charge("1", "900.00", "rent", true),
        charge("2", "950.00", "rent", true),
      ]),
      contractualRent: 1800,
    });
    expect(withCharges).toMatchObject({
      amount: 1875,
      basis: "working",
      chargeEvidence: "several",
      contractualRent: 1800,
    });
    // The desk reads no charges: the same working value still leads.
    expect(
      operationalCurrentRent({ working: working(1875), contractualRent: 1800 }),
    ).toMatchObject({ amount: 1875, basis: "working", chargeEvidence: "not_read" });
    // A cleared working value falls back to the source evidence.
    expect(
      operationalCurrentRent({ working: working(null), contractualRent: 1800 }),
    ).toMatchObject({ amount: 1800, basis: "contractual" });
  });
});
