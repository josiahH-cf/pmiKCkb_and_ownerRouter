// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { formatDateTime } from "@/components/approval/ApprovalQueueModel";
import { RenewalDeskTable } from "@/components/lease-renewal/RenewalDeskTable";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import { projectCycleSourceDateChange } from "@/lib/lease-renewal/cycle-source-date";
import type {
  DeskLeaseGuidance,
  DeskLeaseRow,
  DeskLeaseSummaryBase,
} from "@/lib/lease-renewal/desk-model";
import { withRenewalDeskQueryKeys } from "@/lib/lease-renewal/desk-query";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  OVERALL_STATUS_URGENCY_RANK,
} from "@/lib/lease-renewal/desk-query-v2";
import { formatNoticeDate } from "@/lib/lease-renewal/notice-rules";
import { formatWorkStatusRecordedAt } from "@/lib/lease-renewal/work-status";
import { fixedTermProjection } from "@/tests/helpers/lease-term-fixtures";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S126 (F06): the inventory fixture date 2026-10-01 reads 10/01/2026 on the desk, in the workspace
// header and in app-owned history and message text, while every canonical value (dateTime, filter
// value, URL) stays ISO. Rendering issues no request and records nothing. Values are synthetic.

afterEach(cleanup);

const FIXTURE_DATE = "2026-10-01";
const FIXTURE_LABEL = "10/01/2026";

function guidance(): DeskLeaseGuidance {
  return {
    currentBaseRent: 1500,
    currentBaseRentSource: "RentVine",
    rentVerification: {
      state: "verified",
      verifiedByResolutionDiffers: false,
      destination: { kind: "workspace_phase", stepId: "verify-renewal" },
    },
    overallStatus: "ready",
    urgencyRank: OVERALL_STATUS_URGENCY_RANK.ready,
    isBlocked: false,
    blockers: [],
    action: {
      kind: "act",
      label: "Record the owner decision.",
      destination: { kind: "workspace_phase", stepId: "owner-decision" },
    },
  };
}

function row(id: string, overrides: Partial<DeskLeaseSummaryBase> = {}): DeskLeaseRow {
  const base: DeskLeaseSummaryBase = {
    id,
    addressLabel: `${id} Main St`,
    propertyNameLabel: null,
    tenantNameLabel: "Tenant Alpha",
    tenantNameLabels: ["Tenant Alpha"],
    ownerNameLabels: ["Owner Alpha"],
    identity: {
      address: { label: `${id} Main St`, sourceRef: `rentvine:lease:${id}:property` },
      property: null,
      tenants: [
        { label: "Tenant Alpha", sourceRef: `rentvine:lease:${id}:tenants[0].name` },
      ],
      owners: [
        {
          label: "Owner Alpha",
          sourceRef: `rentvine:lease:${id}:portfolio.owners[0].name`,
        },
      ],
    },
    endDateIso: FIXTURE_DATE,
    disposition: "actionable",
    reason: "actionable",
    reasonLabel: "Ready to work",
    leaseTerm: fixedTermProjection(FIXTURE_DATE),
    currentRent: 1500,
    unitListedRent: 1500,
    retention: { state: "window", label: "Inside the current-month renewal window" },
    processVersion: "renewal-v1",
    workflowStepId: "owner-decision",
    stageIndex: 1,
    stageLabel: "Owner decision",
    nextAction: "Record the owner decision.",
    openConflicts: 0,
    ...overrides,
  };
  return {
    ...withRenewalDeskQueryKeys(base),
    processState: {
      status: "active",
      currentStepId: "owner-decision",
      currentStepState: "ready",
    },
    guidance: guidance(),
  };
}

const shortcuts = { available: false, tokenFor: () => null } as const;

describe("S126 one visible convention on the renewal desk (AC-S126-1, AC-S126-3, AC-S126-4)", () => {
  it("renders the fixture date as 10/01/2026 while the dateTime, filter value and URL stay ISO", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[
          row("L1", {
            cycleSourceDate: projectCycleSourceDateChange(
              { kind: "lease_end", dateIso: "2026-09-30", source: "Reviewed lease" },
              FIXTURE_DATE,
            ),
          }),
        ]}
        shortcuts={shortcuts}
        sourceReadOk
        state={{
          ...DEFAULT_RENEWAL_DESK_QUERY_V2,
          from: FIXTURE_DATE,
          through: "2026-10-31",
        }}
        totalInScope={1}
        totalLoaded={1}
      />,
    );
    const time = document.querySelector(`time[datetime="${FIXTURE_DATE}"]`);
    expect(time).not.toBeNull();
    expect(time).toHaveTextContent(FIXTURE_LABEL);
    const dateLink = time?.closest("a");
    expect(dateLink?.getAttribute("href")).toContain(`endDate=${FIXTURE_DATE}`);
    expect(dateLink?.getAttribute("href")).not.toContain("10/01");
    // The cycle source-date note reads both dates in the convention.
    const note = document.querySelector('[data-renewal-field="cycle-source-date"]');
    expect(note).toHaveTextContent("09/30/2026");
    expect(note).toHaveTextContent(FIXTURE_LABEL);
    expect(note?.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // Native pickers keep their ISO values and gain a companion line in the convention.
    const from = document.querySelector(
      'input[type="date"][name="from"]',
    ) as HTMLInputElement;
    expect(from.type).toBe("date");
    expect(from.defaultValue).toBe(FIXTURE_DATE);
    const hints = Array.from(document.querySelectorAll("[data-renewal-date-hint]"));
    expect(hints.length).toBeGreaterThanOrEqual(3);
    expect(
      hints.some((hint) => hint.textContent?.includes(`Selected ${FIXTURE_LABEL}`)),
    ).toBe(true);
    expect(hints.some((hint) => hint.textContent?.includes("MM/DD/YYYY"))).toBe(true);
    // No year-first full date remains as visible text in the row.
    const rowText = screen.getByText("L1 Main St").closest("tr")?.textContent ?? "";
    expect(rowText).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("shows the lease end in the workspace header and subtitle as 10/01/2026", () => {
    const value = getRenewalLeaseWorkspace("lease-318-cedar-7");
    if (!value) throw new Error("sample workspace missing");
    render(
      <RenewalWorkspace
        role="Editor"
        workspace={{ ...value, summary: { ...value.summary, endDateIso: FIXTURE_DATE } }}
        workStatus={{ available: true, record: null, history: [], currentCycleId: null }}
      />,
    );
    const header = document.querySelector(".renewal-workspace-identity-lease");
    expect(header).toHaveTextContent(`ends ${FIXTURE_LABEL}`);
    expect(header?.textContent).not.toContain(FIXTURE_DATE);
  });
});

describe("S126 app-owned history and message text (AC-S126-1, AC-S126-2)", () => {
  it("keeps timestamps on their instant with an explicit zone and puts message dates in the convention", () => {
    expect(formatWorkStatusRecordedAt("2026-07-15T15:00:00.000Z")).toBe(
      "07/15/2026, 10:00 AM CDT",
    );
    expect(formatWorkStatusRecordedAt("not a time")).toBe("not a time");
    expect(formatDateTime("2026-01-15T15:00:00.000Z")).toBe("01/15/2026, 9:00 AM CST");
    expect(formatNoticeDate("2026-06-15")).toBe("06/15/2026");
    expect(formatNoticeDate("garbage")).toBe("garbage");
  });
});

describe("S126 surface inventory (AC-S126-6)", () => {
  it("names every app-owned formatter surface, and each one routes through the shared utility", () => {
    const root = process.cwd();
    const inventory = readFileSync(join(root, "docs/date-display-inventory.md"), "utf8");
    const listed = Array.from(
      inventory.matchAll(/^\| [^|]+\| `([^`]+\.tsx?)`/gm),
      (match) => match[1],
    );
    expect(listed.length).toBeGreaterThanOrEqual(20);
    for (const rel of new Set(listed)) {
      const source = readFileSync(join(root, rel), "utf8");
      expect(source, rel).toContain('from "@/lib/date-display"');
    }
    // Every named test exists and the utility itself is covered.
    expect(inventory).toContain("tests/unit/s126-date-display.test.ts");
    expect(inventory).toContain("tests/unit/s126-date-surfaces.test.tsx");
    // Browser-locale or zone-less formatting is gone from the inventoried surfaces.
    for (const rel of new Set(listed)) {
      const source = readFileSync(join(root, rel), "utf8");
      expect(source, rel).not.toMatch(/toLocaleString\(\)|toLocaleDateString\(/);
      expect(source, rel).not.toMatch(/new Intl\.DateTimeFormat\(undefined/);
    }
  });
});
