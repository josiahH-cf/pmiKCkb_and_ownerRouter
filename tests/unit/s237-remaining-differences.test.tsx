// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RemainingDifferences } from "@/components/lease-renewal/RemainingDifferences";
import { projectRemainingDifferences } from "@/lib/lease-renewal/remaining-differences";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import type { RenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory-model";
import {
  emptyRenewalWorkspace,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

// S237 R-S237-5: after the renewal's updates, each tracked field shows the Working or approved
// value, the latest RentVine or Sheet readback with its read time, and whether they match. A
// field the page did not read says so; nothing claims synchronization. Synthetic values only.

afterEach(cleanup);
const READ = "2026-11-02T15:00:00.000Z";
const entry = (value: number | string, revision = 1) => ({
  value,
  revision,
  eventId: `event-${revision}`,
  recordedAt: "2026-10-20T15:00:00.000Z",
  recordedByUid: "editor-1",
  recordedByLabel: "editor1@pmikcmetro.com",
  origin: "staff_entry" as const,
});
const working: RenewalWorkingRecord = {
  schemaVersion: "renewal-working-record/v1",
  leaseId: "4821",
  revision: 3,
  fields: {
    terms_rent: entry(1800),
    terms_effective_date: entry("2026-12-01"),
    terms_end_date: entry("2027-11-30"),
  },
};
const charge = (startDate: string, amount: string) => ({
  id: `charge-${startDate}`,
  accountId: "rent",
  accountLabel: "Rent",
  classification: "rent" as const,
  current: true,
  projection: {
    leaseRecurringChargeID: `charge-${startDate}`,
    leaseID: "4821",
    accountID: "rent",
    amount,
    description: "Rent",
    dayDue: "1",
    frequency: "1",
    startDate,
    isMoveInCharge: "0",
    isFromImport: "0",
    endDate: null,
    nextChargeDate: null,
  },
});
const inventory = (endDate: string, charges = [charge("12/01/2026", "1800.00")]) =>
  ({
    leaseId: "4821",
    leaseDates: {
      startDate: "2025-12-01",
      endDate,
      increaseEligibilityDate: "2026-12-01",
    },
    asOfDate: "2026-11-02",
    charges,
  }) as unknown as RenewalChargeInventory;
const workspace = (): RenewalWorkspaceState => ({
  ...emptyRenewalWorkspace("4821", "11111111-1111-4111-8111-111111111111", {
    kind: "lease_end",
    dateIso: "2026-11-30",
    source: "RentVine lease end",
  }),
  sourceUpdates: {
    renewal_letter_sent: {
      eventId: "e1",
      intent: { field: "renewal_letter_sent", value: true, source: "Staff record" },
      state: "verified",
    },
  },
});

describe("S237 R-S237-5 remaining differences", () => {
  it("compares each tracked field with its latest readback and read time", () => {
    const rows = projectRemainingDifferences({
      working,
      workspace: workspace(),
      increaseEligibilityIntent: "2026-12-01",
      rentvine: { inventory: inventory("2026-11-30"), readAt: READ },
      sheet: { values: { renewal_letter_sent: "TRUE" }, readAt: READ },
    });
    expect(rows).toEqual([
      {
        key: "lease_end_date",
        label: "Lease end date",
        intended: "2027-11-30",
        readback: "2026-11-30",
        readAt: READ,
        matches: false,
      },
      {
        key: "increase_eligibility_date",
        label: "Increase-eligibility date",
        intended: "2026-12-01",
        readback: "2026-12-01",
        readAt: READ,
        matches: true,
      },
      {
        key: "rent_charge",
        label: "Rent charge from 2026-12-01",
        intended: "$1800.00",
        readback: "$1800.00",
        readAt: READ,
        matches: true,
      },
      {
        key: "sheet:renewal_letter_sent",
        label: expect.stringMatching(/^Sheet: /),
        intended: "Yes",
        readback: "Yes",
        readAt: READ,
        matches: true,
      },
    ]);
  });

  it("says when a source was not read or holds nothing, and never compares then", () => {
    const rows = projectRemainingDifferences({
      working,
      workspace: workspace(),
      rentvine: { inventory: inventory("2027-11-30", []), readAt: READ },
      sheet: null,
    });
    expect(rows.map((row) => [row.key, row.readback, row.matches])).toEqual([
      ["lease_end_date", "2027-11-30", true],
      ["rent_charge", "None in the source", false],
      ["sheet:renewal_letter_sent", "Not read on this page", null],
    ]);
    expect(
      projectRemainingDifferences({
        working: null,
        workspace: null,
        rentvine: null,
        sheet: null,
      }),
    ).toEqual([
      expect.objectContaining({
        key: "lease_end_date",
        intended: "No Working value saved",
        readback: "Not read on this page",
        matches: null,
      }),
      expect.objectContaining({ key: "rent_charge", matches: null }),
    ]);
  });

  it("renders each row with its outcome and no synchronization claim", () => {
    render(
      <RemainingDifferences
        rows={projectRemainingDifferences({
          working,
          workspace: null,
          rentvine: { inventory: inventory("2026-11-30"), readAt: READ },
          sheet: null,
        })}
      />,
    );
    const section = screen.getByRole("region", { name: "What still differs" });
    expect(section).toHaveTextContent(
      /Lease end date: 2027-11-30; source 2026-11-30 \(read .+\)\. Differs\./,
    );
    expect(section).toHaveTextContent(
      /Rent charge from 2026-12-01: \$1800.00; source \$1800.00 \(read .+\)\. Matches\./,
    );
    expect(section).toHaveTextContent(
      "A match is not a claim that RentVine and the Sheet are synchronized.",
    );
  });
});
