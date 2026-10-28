// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SYNTHETIC_APPROVAL } from "../helpers/owner-approval";
import { SYNTHETIC_APPROVAL_CHOICES } from "../helpers/owner-approval-form";
import { fixtureWorkingRecord } from "../helpers/rent-charge-fixtures";
import {
  applyFakeLeaseDetail,
  withFakeLeaseDetail,
} from "@/tests/helpers/rentvine-detail-fake";
import {
  RenewalManualProvider,
  RenewalManualSection,
} from "@/components/lease-renewal/RenewalManualWorkspace";
import { RenewalDocumentHandoff } from "@/components/lease-renewal/RenewalDocumentHandoff";
import { RenewalWorkingRecordProvider } from "@/components/lease-renewal/RenewalWorkingRecord";
import {
  currentOwnerApproval,
  ownerApprovalNotice,
} from "@/lib/lease-documents/owner-approval-binding";
import { leaseViewsFromExport } from "@/lib/integrations/rentvine/lease-mapper";
import type { DateWindow } from "@/lib/lease-renewal/cohort";
import { loadLiveRenewalDesk } from "@/lib/lease-renewal/live-desk";
import {
  clearLiveLeaseCache,
  type LiveLeaseSnapshotResult,
} from "@/lib/lease-renewal/live-lease-cache";
import {
  describeOwnerApprovalCoverage,
  describeOwnerApprovalCoverageShort,
  ownerApprovalCoverage,
} from "@/lib/lease-renewal/owner-approval-coverage";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
  type ApprovedWorkingTerms,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

// S234 R-S234-3 (BEH-S234-2, AC-S234-2): the recorded owner approval's coverage of the Working
// terms and charges reads the same everywhere it is shown: rent, effective date, end date and the
// charges each make it stale on their own, with that reason. Synthetic records only.

vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));
beforeEach(clearLiveLeaseCache);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CYCLE = "1c0a4d7e-7d3b-4a6e-9f4c-2a5f9e6b8d10";
const ECONOMICS = "e".repeat(64);
const BINDING: ApprovedWorkingTerms = {
  rent: 1750,
  effectiveDate: "2026-12-01",
  endDate: "2027-11-30",
  fieldRevisions: { rent: 1, effectiveDate: 1, endDate: 1 },
  economicsHash: ECONOMICS,
  chargePolicyVersion: "1",
};
const format = {
  money: (value: number) => `$${value.toFixed(2)}`,
  date: (iso: string) => iso,
};
function approved(binding: ApprovedWorkingTerms | null = BINDING): RenewalWorkspaceState {
  return planRenewalWorkspaceAction(
    emptyRenewalWorkspace("4821", CYCLE, {
      kind: "lease_end",
      dateIso: "2026-08-31",
      source: "RentVine lease end",
    }),
    { kind: "owner_response", outcome: "approved_terms", approval: SYNTHETIC_APPROVAL },
    {
      actorUid: "operator",
      recordedAt: "2026-07-18T12:00:00.000Z",
      eventId: "approval",
      approvedWorkingTerms: binding,
    },
  );
}
function working(
  over: Partial<
    Record<"rent" | "effective" | "end", { value: number | string; revision: number }>
  > = {},
) {
  return fixtureWorkingRecord({
    terms_rent: over.rent ?? { value: 1750, revision: 1 },
    terms_effective_date: over.effective ?? { value: "2026-12-01", revision: 1 },
    terms_end_date: over.end ?? { value: "2027-11-30", revision: 1 },
  });
}

describe("S234 owner approval coverage (R-S234-3)", () => {
  it("names each Working term that changed on its own, including a re-save of the same value", () => {
    const cases = [
      [{ rent: { value: 1800, revision: 2 } }, ["rent"], "rent"],
      [
        { effective: { value: "2026-12-15", revision: 2 } },
        ["effective_date"],
        "effective date",
      ],
      [{ end: { value: "2027-12-31", revision: 2 } }, ["end_date"], "end date"],
      [{ rent: { value: 1750, revision: 2 } }, ["rent"], "rent"],
      [
        { rent: { value: 1800, revision: 2 }, end: { value: "2027-12-31", revision: 2 } },
        ["rent", "end_date"],
        "rent and end date",
      ],
    ] as const;
    for (const [over, changed, words] of cases) {
      const coverage = ownerApprovalCoverage({
        workspace: approved(),
        working: working(over),
        economicsHash: ECONOMICS,
      });
      expect(coverage).toMatchObject({ state: "terms_changed", changed });
      expect(describeOwnerApprovalCoverage(coverage, format)).toBe(
        `Owner approval no longer covers: ${words} changed. Record the owner's approval of the current terms.`,
      );
      expect(describeOwnerApprovalCoverageShort(coverage, format)).toBe(
        `Owner approval no longer covers: ${words} changed.`,
      );
      // The packet reads the same rule and names the same fields.
      const packet = currentOwnerApproval({
        workspace: approved(),
        working: working(over),
        economicsHash: ECONOMICS,
      });
      expect(packet.state).toBe("terms_changed");
      expect(packet.coverage).toEqual(coverage);
      expect(ownerApprovalNotice(packet.coverage)).toBe(
        `The Working renewal ${words} changed after the owner's approval was recorded. Record the owner's approval of the current terms.`,
      );
    }
  });

  it("says what the approval covers, stales on the charges alone and never reads legacy terms", () => {
    const covered = ownerApprovalCoverage({
      workspace: approved(),
      working: working(),
      economicsHash: ECONOMICS,
    });
    expect(describeOwnerApprovalCoverage(covered, format)).toBe(
      "Owner approval covers the Working terms, $1750.00 per month from 2026-12-01 to 2027-11-30 (Working revisions: rent 1, effective date 1, end date 1), and the calculated charges.",
    );
    const charges = ownerApprovalCoverage({
      workspace: approved(),
      working: working(),
      economicsHash: "f".repeat(64),
    });
    expect(describeOwnerApprovalCoverage(charges, format)).toBe(
      "Owner approval no longer covers: charges changed. Record the owner's approval of the current terms and charges.",
    );
    // A caller that cannot read the charges never claims they are covered.
    const unchecked = ownerApprovalCoverage({
      workspace: approved(),
      working: working(),
      economicsHash: null,
    });
    expect(unchecked).toMatchObject({ state: "current", chargesChecked: false });
    expect(describeOwnerApprovalCoverageShort(unchecked, format)).toBe(
      "Owner approval covers $1750.00 from 2026-12-01 to 2027-11-30 (Working revisions 1, 1, 1); charges are checked on the lease page.",
    );
    // An approval with only legacy owner-response terms covers no Working terms.
    const legacy = planRenewalWorkspaceAction(
      emptyRenewalWorkspace("4821", CYCLE, {
        kind: "lease_end",
        dateIso: "2026-08-31",
        source: "RentVine lease end",
      }),
      {
        kind: "owner_response",
        outcome: "approved_terms",
        approval: SYNTHETIC_APPROVAL,
        terms: { rent: 1750, effectiveDate: "2026-12-01", endDate: "2027-11-30" },
      },
      { actorUid: "operator", recordedAt: "2026-07-18T12:00:00.000Z", eventId: "legacy" },
    );
    expect(
      ownerApprovalCoverage({
        workspace: legacy,
        working: working(),
        economicsHash: ECONOMICS,
      }).state,
    ).toBe("no_working_terms");
    expect(
      describeOwnerApprovalCoverageShort(
        ownerApprovalCoverage({
          workspace: null,
          working: working(),
          economicsHash: null,
        }),
        format,
      ),
    ).toBeNull();
  });

  it("states the coverage on the desk row for this term's approval, naming what changed", async () => {
    const READ_TS = "2026-07-19T00:00:00.000Z";
    const WINDOWS: DateWindow[] = [{ startIso: "2026-08-01", endIso: "2026-09-30" }];
    const rows = [
      {
        lease: {
          leaseID: 4821,
          endDate: "2026-08-31",
          leaseType: "Fixed Term",
          tenants: [{ name: "Jordan Maple" }],
        },
        property: { name: "Maple Court", streetNumber: "4821", streetName: "Maple Ct" },
        portfolio: { owners: [{ companyName: "Maple Holdings LLC" }] },
        unit: { rent: "1250.00" },
      },
    ] as Record<string, unknown>[];
    const views = leaseViewsFromExport(rows);
    applyFakeLeaseDetail(views, rows);
    const snapshot: LiveLeaseSnapshotResult = {
      snapshot: {
        views,
        complete: true,
        readAtMs: Date.parse(READ_TS),
        detailComplete: true,
        detailUnavailableCount: 0,
      },
      currency: {
        state: "fresh",
        ageMs: 0,
        readAtMs: Date.parse(READ_TS),
        refreshing: false,
        lastError: false,
      },
    };
    const config = {
      ok: true as const,
      rentvineClient: withFakeLeaseDetail({
        listAllLeasesExport: async () => ({ rows, pages: 1, complete: true }),
      }),
      rentvineHost: "pmikcmetro.rentvine.com",
      sheetsReader: {
        listTabTitles: async () => ["Lease Renewal"],
        batchGet: async () => ({
          valueRanges: [{ range: "Lease Renewal", values: SAMPLE_RENEWAL_TABLES[0] }],
        }),
        batchGetFormulas: async () => ({
          valueRanges: [{ range: "Lease Renewal", values: SAMPLE_RENEWAL_TABLES[0] }],
        }),
      },
      spreadsheetId: "sheet-id",
    } as unknown as Parameters<typeof loadLiveRenewalDesk>[2];
    const desk = async (record: ReturnType<typeof working> | undefined) => {
      clearLiveLeaseCache();
      const result = await loadLiveRenewalDesk(
        WINDOWS,
        READ_TS,
        config,
        undefined,
        undefined,
        [],
        undefined,
        true,
        snapshot,
        undefined,
        new Map([["4821", approved()]]),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        record ? new Map([["4821", record]]) : undefined,
      );
      if (result.status !== "ok") throw new Error(result.status);
      return result.view.items.find((item) => item.id === "4821")!.ownerApprovalCoverage;
    };
    expect(await desk(working())).toBe(
      "Owner approval covers $1,750.00 from 12/01/2026 to 11/30/2027 (Working revisions 1, 1, 1); charges are checked on the lease page.",
    );
    expect(await desk(working({ rent: { value: 1800, revision: 2 } }))).toBe(
      "Owner approval no longer covers: rent changed.",
    );
    // Without a Working read the desk says nothing about coverage.
    expect(await desk(undefined)).toBeUndefined();
  });

  it("shows the same coverage in the Owner response section and on the document handoff", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "Not read in this test." }, { status: 503 }),
      ),
    );
    const mount = (record: ReturnType<typeof working>, economicsHash: string | null) =>
      render(
        <RenewalWorkingRecordProvider canEdit initialRecord={record} leaseId="4821">
          <RenewalManualProvider
            initialState={approved()}
            leaseId="4821"
            ownerApproval={{ ...SYNTHETIC_APPROVAL_CHOICES, economicsHash }}
          >
            <RenewalManualSection section="owner" />
            <RenewalDocumentHandoff canApprove={false} />
          </RenewalManualProvider>
        </RenewalWorkingRecordProvider>,
      );
    const lines = (view: ReturnType<typeof mount>) =>
      [
        ...view.container.querySelectorAll(
          '[data-renewal-field="owner-approval-coverage"]',
        ),
      ].map((node) => node.textContent);
    const stale = mount(working({ rent: { value: 1800, revision: 2 } }), ECONOMICS);
    expect(lines(stale)).toEqual([
      "Owner approval no longer covers: rent changed. Record the owner's approval of the current terms.",
      "Owner approval no longer covers: rent changed. Record the owner's approval of the current terms.",
    ]);
    stale.unmount();
    const current = mount(working(), ECONOMICS);
    expect(lines(current)).toEqual([
      "Owner approval covers the Working terms, $1,750.00 per month from 12/01/2026 to 11/30/2027 (Working revisions: rent 1, effective date 1, end date 1), and the calculated charges.",
      "Owner approval covers the Working terms, $1,750.00 per month from 12/01/2026 to 11/30/2027 (Working revisions: rent 1, effective date 1, end date 1), and the calculated charges.",
    ]);
    current.unmount();
    const charges = mount(working(), "f".repeat(64));
    expect(lines(charges)[0]).toBe(
      "Owner approval no longer covers: charges changed. Record the owner's approval of the current terms and charges.",
    );
  });
});
