// @vitest-environment jsdom
// S277 R-S277-5 (BEH-S277-5, AC-S277-5): the monthly table prints Current base rent and Rent to
// recommend as currency, labels a working correction "Working $1,350.00", and adds "Approved
// $1,425.00" under Rent to recommend when the owner approved an amount for this term. The column
// set is unchanged (S246 R-S246-7). Fail-first on the starting state: both cells printed a bare
// two-decimal number ("1400.00") and no approved amount. Synthetic portfolio; nothing is fetched.
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { RenewalWorkingBatch } from "@/components/lease-renewal/RenewalWorkingBatch";
import {
  projectRenewalBatchRow,
  projectRenewalBatchRows,
  type RenewalBatchRowView,
} from "@/lib/lease-renewal/renewal-batch-row";
import {
  S246_LEASES,
  S246_READ_TS,
  S246_TODAY,
  loadS246Desk,
  s246Row,
} from "@/tests/helpers/s246-portfolio";

const CONTEXT = { sourceReadAtIso: S246_READ_TS, todayIso: S246_TODAY };
const APPROVED = S246_LEASES.activeInMonth;
const PLAIN = S246_LEASES.activeInMonthSecond;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  window.history.replaceState(null, "", "/lease-renewal/live/desk");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AC-S277-5 the monthly table's rent cells", () => {
  it("R-S277-5: the batch row carries the approved amount of this term and whether the base is a working correction", async () => {
    const view = await loadS246Desk();
    const desk = s246Row(view, APPROVED);
    const approved = projectRenewalBatchRow(
      { ...desk, workingCurrentRent: 1350, ownerApprovedRent: 1425 },
      CONTEXT,
    );
    expect(approved).toMatchObject({
      currentBaseRent: 1350,
      currentBaseRentWorking: true,
      approvedRent: 1425,
    });
    const plain = projectRenewalBatchRow(
      { ...desk, workingCurrentRent: null, ownerApprovedRent: undefined },
      CONTEXT,
    );
    expect(plain.currentBaseRentWorking).toBe(false);
    expect(plain.approvedRent).toBeNull();
  });

  it("BEH-S277-5: after an approval of $1,425 against a $1,400 recommendation the row shows $1,400.00 and Approved $1,425.00, with currency and the same columns", async () => {
    const rows: RenewalBatchRowView[] = projectRenewalBatchRows(
      (await loadS246Desk()).items,
      CONTEXT,
    ).map((row) =>
      row.leaseId === APPROVED
        ? {
            ...row,
            currentBaseRent: 1350,
            currentBaseRentWorking: true,
            recommendedRent: {
              value: 1400,
              basis:
                "Suggested from the stored comparison: Median of 5 comparable rents ($1,350 to $1,450).",
            },
            recommendedBasis: "suggested from the stored comparison",
            approvedRent: 1425,
          }
        : row.leaseId === PLAIN
          ? {
              ...row,
              currentBaseRent: 1200,
              currentBaseRentWorking: false,
              recommendedRent: { value: 1260, basis: "Entered by staff." },
              recommendedBasis: "entered by staff",
              approvedRent: null,
            }
          : row,
    );
    render(
      <RenewalWorkingBatch
        initial={{ month: null, group: null }}
        rows={rows}
        todayIso={S246_TODAY}
      />,
    );
    const headers = [
      ...document.querySelectorAll<HTMLElement>(".renewal-batch-table thead th"),
    ].map((th) => th.textContent?.trim());
    expect(headers).toEqual([
      "Lease and tenants",
      "Next action",
      "Cycle or review date",
      "Stage and context",
      "Current base rent",
      "Rent to recommend",
    ]);
    const cell = (leaseId: string, name: "base" | "recommended") =>
      document.querySelector<HTMLElement>(
        `tr[data-batch-lease="${leaseId}"] [data-batch-cell="${name}"]`,
      )!;
    expect(cell(APPROVED, "base")).toHaveTextContent("Working $1,350.00");
    const recommended = cell(APPROVED, "recommended");
    expect(recommended).toHaveTextContent("$1,400.00");
    expect(recommended.querySelector("[data-batch-approved-rent]")).toHaveTextContent(
      "Approved $1,425.00",
    );
    expect(recommended.querySelector("[data-batch-rent-basis]")).toHaveTextContent(
      "suggested from the stored comparison",
    );
    // A row with no approval for this term has no approved line; plain amounts print as currency.
    expect(cell(PLAIN, "base")).toHaveTextContent(/^\$1,200\.00$/);
    expect(cell(PLAIN, "recommended")).toHaveTextContent("$1,260.00");
    expect(
      cell(PLAIN, "recommended").querySelector("[data-batch-approved-rent]"),
    ).toBeNull();
    // No bare two-decimal amounts remain in the rent cells.
    expect(recommended.textContent).not.toMatch(/(^|[^$\d,])1400\.00/);
  });
});
