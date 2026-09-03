// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RenewalDesk } from "@/components/lease-renewal/RenewalDesk";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";
import { loadLiveRenewalDesk } from "@/lib/lease-renewal/live-desk";
import { DEFAULT_RENEWAL_DESK_QUERY_V2 } from "@/lib/lease-renewal/desk-query-v2";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";

const SCALE_ROW_COUNT = 320;
const READ_TIMESTAMP = "2026-09-02T12:00:00.000Z";
const WINDOWS = [{ startIso: "2026-08-01", endIso: "2026-09-30" }];
const LOADER_BUDGET_MS = 15_000;
const RENDER_BUDGET_MS = 5_000;
const ACTIONABLE_ROW_COUNT = 32;
const REVIEW_ROW_COUNT = 16;
const SKIPPED_ROW_COUNT = 16;

type DeskConfig = NonNullable<Parameters<typeof loadLiveRenewalDesk>[2]>;

function leaseIdFor(index: number): string {
  return String(900_000 + index);
}

function rowShape(index: number): {
  endDateIso: string;
  endDateDisplay: string;
  leaseType: string;
} {
  if (index < ACTIONABLE_ROW_COUNT) {
    return index % 2 === 0
      ? {
          endDateIso: "2026-08-31",
          endDateDisplay: "8/31/2026",
          leaseType: "Fixed Term",
        }
      : {
          endDateIso: "2026-09-30",
          endDateDisplay: "9/30/2026",
          leaseType: "Fixed Term",
        };
  }
  if (index < ACTIONABLE_ROW_COUNT + REVIEW_ROW_COUNT) {
    return {
      endDateIso: "2026-09-15",
      endDateDisplay: "9/15/2026",
      leaseType: "Fixed Term",
    };
  }
  if (index < ACTIONABLE_ROW_COUNT + REVIEW_ROW_COUNT + SKIPPED_ROW_COUNT) {
    return {
      endDateIso: "2026-09-30",
      endDateDisplay: "9/30/2026",
      leaseType: "Month to Month",
    };
  }
  return {
    endDateIso: "2027-12-31",
    endDateDisplay: "12/31/2027",
    leaseType: "Fixed Term",
  };
}

function buildScaleFixture() {
  const header = [...SAMPLE_RENEWAL_TABLES[0][0]];
  const evaluatedRows = Array.from({ length: SCALE_ROW_COUNT }, (_, index) => {
    const tenant = `Scale Tenant ${String(index).padStart(3, "0")}`;
    const shape = rowShape(index);
    const rent = 1_000 + index;
    return [
      "",
      "",
      tenant,
      shape.endDateDisplay,
      `$${rent}`,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ];
  });
  const evaluated = [header, ...evaluatedRows];
  const formulas = evaluated.map((row) => [...row]);
  evaluatedRows.forEach((row, index) => {
    const leaseId = leaseIdFor(index);
    formulas[index + 1][2] =
      `=HYPERLINK("https://pmikcmetro.rentvine.com/leases/${leaseId}","${row[2]}")`;
  });
  const exportRows = Array.from({ length: SCALE_ROW_COUNT }, (_, index) => {
    const leaseId = leaseIdFor(index);
    const shape = rowShape(index);
    return {
      lease: {
        leaseID: Number(leaseId),
        endDate: shape.endDateIso,
        leaseType: shape.leaseType,
        tenants: [{ name: `Scale Tenant ${String(index).padStart(3, "0")}` }],
      },
      property: {
        name: `Scale Property ${String(index).padStart(3, "0")}`,
        streetNumber: String(10_000 + index),
        streetName: "Fixture Ave",
      },
      portfolio: {
        owners: [{ companyName: `Scale Owner ${String(index % 16).padStart(2, "0")}` }],
      },
      unit: { rent: String(1_000 + index) },
    };
  });
  return { evaluated, formulas, exportRows };
}

function buildScaleConfig(): DeskConfig {
  const fixture = buildScaleFixture();
  return {
    ok: true,
    rentvineClient: {
      listAllLeasesExport: async () => ({
        rows: fixture.exportRows,
        pages: 13,
        complete: true,
      }),
    },
    rentvineHost: "pmikcmetro.rentvine.com",
    sheetsReader: {
      listTabTitles: async () => ["Lease Renewal"],
      batchGet: async () => ({
        valueRanges: [{ range: "Lease Renewal", values: fixture.evaluated }],
      }),
      batchGetFormulas: async () => ({
        valueRanges: [{ range: "Lease Renewal", values: fixture.formulas }],
      }),
    },
    spreadsheetId: "synthetic-scale-sheet",
  } as unknown as DeskConfig;
}

beforeEach(clearLiveLeaseCache);
afterEach(cleanup);

describe("S82 production-sized loader and render coverage", () => {
  it("loads and renders one unique row and exact destination per 320-row lease cohort", async () => {
    const loadStartedAt = performance.now();
    const result = await loadLiveRenewalDesk(WINDOWS, READ_TIMESTAMP, buildScaleConfig());
    const loadElapsedMs = performance.now() - loadStartedAt;

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(loadElapsedMs).toBeLessThan(LOADER_BUDGET_MS);
    expect(result.view.readComplete).toBe(true);
    expect(result.view.cohort.summary).toMatchObject({
      total: SCALE_ROW_COUNT,
      actionable: ACTIONABLE_ROW_COUNT,
      skipped: SKIPPED_ROW_COUNT,
      needsReview: REVIEW_ROW_COUNT,
      outOfWindow:
        SCALE_ROW_COUNT - ACTIONABLE_ROW_COUNT - REVIEW_ROW_COUNT - SKIPPED_ROW_COUNT,
    });
    expect(result.view.items).toHaveLength(SCALE_ROW_COUNT);
    expect(new Set(result.view.items.map((row) => row.id)).size).toBe(SCALE_ROW_COUNT);
    expect(
      result.view.items.filter((row) => row.sourceDestinations?.rentvine),
    ).toHaveLength(SCALE_ROW_COUNT);

    const renderStartedAt = performance.now();
    render(
      <RenewalDesk
        query={{ ...DEFAULT_RENEWAL_DESK_QUERY_V2, scope: "all" }}
        role="Admin"
        view={result.view}
      />,
    );
    const renderElapsedMs = performance.now() - renderStartedAt;

    expect(renderElapsedMs).toBeLessThan(RENDER_BUDGET_MS);
    expect(
      screen.getByText(
        `Matching: ${SCALE_ROW_COUNT} · Selected scope: ${SCALE_ROW_COUNT} · Total loaded: ${SCALE_ROW_COUNT}`,
      ),
    ).toBeInTheDocument();

    const rows = [
      ...document.querySelectorAll<HTMLTableRowElement>(
        "table.renewal-table tbody tr[data-lease-id]",
      ),
    ];
    expect(rows).toHaveLength(SCALE_ROW_COUNT);
    const renderedIds = rows.map((row) => row.dataset.leaseId ?? "");
    expect(renderedIds.every(Boolean)).toBe(true);
    expect(new Set(renderedIds).size).toBe(SCALE_ROW_COUNT);

    for (const row of rows) {
      const leaseId = row.dataset.leaseId ?? "";
      const workspaceLinks =
        row.querySelectorAll<HTMLAnchorElement>("a.renewal-lease-link");
      const sourceLinks = row.querySelectorAll<HTMLAnchorElement>(
        "a.renewal-source-link",
      );
      const workspaceAvailable = row.dataset.disposition !== "skip";
      expect(row).toHaveAttribute(
        "data-workspace-available",
        workspaceAvailable ? "true" : "false",
      );
      expect(workspaceLinks).toHaveLength(workspaceAvailable ? 1 : 0);
      expect(sourceLinks).toHaveLength(1);
      if (workspaceAvailable) {
        expect(workspaceLinks[0].getAttribute("href")).toContain(
          `/lease-renewal/live/desk/lease/${leaseId}`,
        );
      }
      expect(sourceLinks[0]).toHaveAttribute(
        "href",
        `https://pmikcmetro.rentvine.com/leases/${leaseId}`,
      );
      expect(sourceLinks[0]).toHaveAttribute("target", "_blank");
      expect(sourceLinks[0]).toHaveAttribute("rel", "noopener noreferrer");
    }

    expect(
      new Set(
        rows
          .map(
            (row) => row.querySelector<HTMLAnchorElement>("a.renewal-lease-link")?.href,
          )
          .filter((href): href is string => Boolean(href)),
      ).size,
    ).toBe(SCALE_ROW_COUNT - SKIPPED_ROW_COUNT);
    expect(
      new Set(
        rows.map(
          (row) => row.querySelector<HTMLAnchorElement>("a.renewal-source-link")!.href,
        ),
      ).size,
    ).toBe(SCALE_ROW_COUNT);
  }, 30_000);
});
