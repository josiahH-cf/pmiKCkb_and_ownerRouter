// Synthetic rent/charge fixtures for the S153/S157/S160 lease-workspace tests. No real lease,
// party, address or amount appears here.

import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import type {
  RenewalChargeInventory,
  RenewalChargeOption,
} from "@/lib/lease-renewal/writeback/charge-inventory-model";

export const FIXTURE_LEASE_ID = "4821";
const RECORDED_AT = "2026-10-02T15:00:00.000Z";

export function fixtureCharge(
  id: string,
  overrides: Omit<Partial<RenewalChargeOption>, "projection"> & {
    projection?: Partial<RenewalChargeOption["projection"]>;
  } = {},
): RenewalChargeOption {
  const { projection, ...rest } = overrides;
  return {
    id,
    accountId: "9",
    accountLabel: "Rent account",
    classification: "rent",
    current: true,
    ...rest,
    projection: {
      leaseRecurringChargeID: id,
      leaseID: FIXTURE_LEASE_ID,
      accountID: "9",
      amount: "1180.00",
      description: "Rent",
      dayDue: "1",
      frequency: "1",
      startDate: "2026-02-01",
      endDate: null,
      nextChargeDate: "2026-11-01",
      isMoveInCharge: "0",
      isFromImport: "0",
      rentIncreaseID: null,
      importSourceKey: null,
      recurringStatusID: 1,
      ...projection,
    },
  };
}

export function fixtureInventory(
  charges: RenewalChargeOption[],
  leaseDates: Partial<RenewalChargeInventory["leaseDates"]> = {},
): RenewalChargeInventory {
  return {
    leaseId: FIXTURE_LEASE_ID,
    asOfDate: "2026-10-02",
    leaseDates: {
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      increaseEligibilityDate: null,
      ...leaseDates,
    },
    charges,
  };
}

export const PET_FEE = fixtureCharge("302", {
  accountId: "12",
  accountLabel: "Pet fee",
  classification: "non_rent",
  projection: { accountID: "12", amount: "35.00", description: "Pet fee" },
});

export const INSURANCE_FEE = fixtureCharge("304", {
  accountId: "14",
  accountLabel: "Insurance",
  classification: "non_rent",
  projection: { accountID: "14", amount: "12.00", description: "Insurance" },
});

export const FUTURE_RENT = fixtureCharge("303", {
  accountLabel: "Rent account",
  current: false,
  projection: {
    amount: "1300.00",
    description: "Future rent",
    startDate: "2027-01-01",
    endDate: "2027-12-31",
    recurringStatusID: 2,
  },
});

export const ENDED_RENT = fixtureCharge("305", {
  accountLabel: "Rent account",
  current: false,
  projection: {
    amount: "1100.00",
    description: "Earlier rent",
    startDate: "2025-01-01",
    endDate: "2026-01-31",
    recurringStatusID: 3,
  },
});

export function fixtureWorkingRecord(
  fields: Record<
    string,
    {
      value: number | string | null;
      revision: number;
      origin?: "staff_entry" | "adopted_source";
      sourceLabel?: string;
    }
  >,
  revision = 1,
): RenewalWorkingRecord {
  return {
    schemaVersion: "renewal-working-record/v1",
    leaseId: FIXTURE_LEASE_ID,
    revision,
    fields: Object.fromEntries(
      Object.entries(fields).map(([field, entry]) => [
        field,
        {
          value: entry.value,
          revision: entry.revision,
          eventId: `0f1c8f6e-6d1c-4bd3-9d7a-00000000000${entry.revision}`,
          recordedAt: RECORDED_AT,
          recordedByUid: "editor-1",
          recordedByLabel: "editor1@pmikcmetro.com",
          origin: entry.origin ?? ("staff_entry" as const),
          ...(entry.sourceLabel ? { sourceLabel: entry.sourceLabel } : {}),
        },
      ]),
    ),
  };
}

export function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

export function postedBody(call: unknown[]): Record<string, unknown> {
  const init = call[1] as { body?: string } | undefined;
  return JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
}
