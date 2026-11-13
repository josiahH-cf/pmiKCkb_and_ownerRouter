// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import {
  KICKOFF_PREPARATION_ROUTE,
  RenewalKickoffPreparation,
} from "@/components/lease-renewal/RenewalKickoffPreparation";
import { RenewalWorkingBatch } from "@/components/lease-renewal/RenewalWorkingBatch";
import { UNREAD_KICKOFF_SUPPORT } from "@/lib/lease-renewal/kickoff-facts";
import { preparationAllowanceCount } from "@/lib/lease-renewal/kickoff-support";
import {
  matchesBatchSearch,
  prepareButtonLabel,
  preparationScope,
  preparationScopeLine,
  preparationTargets,
  type PreparationTarget,
} from "@/lib/lease-renewal/preparation-scope";
import type { RenewalBatchRowView } from "@/lib/lease-renewal/renewal-batch-row";

// S283 R-S283-2, ARCH-S283-2, ARCH-S283-4, BEH-S283-2, BEH-S283-3 and AC-S283-2/AC-S283-6:
// "Prepare {month} leases" covers the selected month's eligible leases the table shows under the
// active filters and search, states its count and the allowance before the click, sends only those
// targets, never retargets a run that started, and stops posting once the server answers that the
// allowance is reached. Synthetic leases only; every request is answered by an in-memory stub and
// nothing reaches a provider.

const MONTH = "2026-12";
const TODAY = "2026-11-13";
const EXAMPLE = ["101 Example Ln", "102 Example Ln", "103 Example Ct", "104 Example Way"];
const SAMPLE = [
  "201 Sample Pl",
  "202 Sample Pl",
  "203 Sample Rd",
  "204 Sample Rd",
  "205 Sample Ave",
];

function batchRow(
  index: number,
  address: string,
  needsComparison: boolean,
): RenewalBatchRowView {
  const day = String(index + 1).padStart(2, "0");
  const dateIso = `${MONTH}-${day}`;
  return {
    key: `lease-${index}`,
    leaseId: String(9100 + index),
    canOpen: true,
    address,
    unit: null,
    tenants: [`Synthetic Tenant ${index}`],
    placement: { kind: "dated", dateIso },
    sortDateIso: dateIso,
    sortLabel: address,
    dateLabel: `Ends 12/${day}/2026`,
    dateIso,
    dateNote: null,
    stageLine: "Check the numbers",
    nextStep: { label: "Check the numbers", stepId: "check-numbers", controlId: null },
    tags: [],
    statusNote: null,
    suggestion: null,
    reason: null,
    sourceRenewal: null,
    kickoffGroup: "missing",
    kickoff: {
      line: "Needs an input",
      missing: [],
      needsComparison,
      allowanceReached: false,
      cycleDateIso: dateIso,
    },
    currentBaseRent: null,
    recommendedRent: null,
  } as unknown as RenewalBatchRowView;
}

// Nine December leases: four on "Example" streets (three need a comparison), five on "Sample".
const ROWS: RenewalBatchRowView[] = [
  ...EXAMPLE.map((address, index) => batchRow(index, address, index < 3)),
  ...SAMPLE.map((address, index) => batchRow(index + 4, address, true)),
];

let posted: string[] = [];
let answers: Record<string, string> = {};

beforeEach(() => {
  posted = [];
  answers = {};
  router.refresh.mockReset();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/lease-renewal/live/desk");
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) !== KICKOFF_PREPARATION_ROUTE)
        return Response.json({}, { status: 404 });
      const body = JSON.parse(String(init?.body)) as { leaseId: string };
      posted.push(body.leaseId);
      const status = answers[body.leaseId] ?? "prepared";
      return Response.json({
        status,
        message:
          status === "allowance_reached"
            ? "Comparison not run: monthly allowance reached"
            : "The comparison is stored for this cycle.",
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ARCH-S283-2 the scope counts come from the server-resolved targets and the allowance", () => {
  it("ARCH-S283-2 the allowance read returns counts only, and an unread usage is null", () => {
    expect(preparationAllowanceCount({ remaining: 41, allowance: 50 })).toEqual({
      remaining: 41,
      total: 50,
    });
    expect(preparationAllowanceCount(null)).toBeNull();
    expect(UNREAD_KICKOFF_SUPPORT.allowance).toBeNull();
  });

  it("ARCH-S283-2 the counts carry no lease value", () => {
    const targets = preparationTargets(ROWS.slice(0, 4));
    const scope = preparationScope({
      shownTargets: targets,
      monthTotal: 9,
      allowance: { remaining: 41, total: 50 },
    });
    expect(scope).toEqual({
      shown: 4,
      total: 9,
      needComparison: 3,
      haveComparison: 1,
      allowance: { remaining: 41, total: 50 },
      covered: 3,
    });
    expect(JSON.stringify(scope)).not.toMatch(/Example|9100|Tenant/);
  });

  it("BEH-S283-2 the button and the line state the subset before the click", () => {
    const targets = preparationTargets(ROWS.slice(0, 4));
    const scope = preparationScope({
      shownTargets: targets,
      monthTotal: 9,
      allowance: { remaining: 41, total: 50 },
    });
    expect(prepareButtonLabel("December 2026", scope)).toBe(
      "Prepare 4 of 9 December 2026 leases",
    );
    expect(preparationScopeLine(scope)).toBe(
      "4 leases shown. 3 need a comparison; 1 already has one. Monthly allowance: 41 of 50 left.",
    );
    const whole = preparationScope({
      shownTargets: preparationTargets(ROWS),
      monthTotal: 9,
    });
    expect(prepareButtonLabel("December 2026", whole)).toBe(
      "Prepare 9 December 2026 leases",
    );
  });

  it("BEH-S283-3 when the allowance cannot cover the comparisons needed the line says how many it covers", () => {
    const scope = preparationScope({
      shownTargets: preparationTargets(ROWS),
      monthTotal: 9,
      allowance: { remaining: 2, total: 50 },
    });
    expect(preparationScopeLine(scope)).toBe(
      "9 leases shown. 8 need a comparison; 1 already has one. Monthly allowance: 2 of 50 left. It covers 2 of the 8 comparisons needed.",
    );
    expect(
      preparationScopeLine(
        preparationScope({ shownTargets: preparationTargets(ROWS), allowance: null }),
      ),
    ).toContain("Monthly allowance: not read.");
  });

  it("R-S283-2 the search matches every word in the address, unit or tenant names", () => {
    expect(matchesBatchSearch(ROWS[0]!, "example")).toBe(true);
    expect(matchesBatchSearch(ROWS[0]!, "101 example")).toBe(true);
    expect(matchesBatchSearch(ROWS[0]!, "synthetic tenant 0")).toBe(true);
    expect(matchesBatchSearch(ROWS[4]!, "example")).toBe(false);
    expect(matchesBatchSearch(ROWS[4]!, "   ")).toBe(true);
  });
});

describe("ARCH-S283-4 a filter narrows the run and never widens it", () => {
  function batch() {
    return render(
      <RenewalWorkingBatch
        initial={{ month: null, group: null, tag: null, sort: null }}
        kickoff={{
          canPrepare: true,
          sourceCurrent: true,
          allowance: { remaining: 41, total: 50 },
        }}
        rows={ROWS}
        todayIso={TODAY}
      />,
    );
  }

  it("ARCH-S283-4 with nothing filtered the whole month is prepared", async () => {
    batch();
    const button = screen.getByRole("button", { name: "Prepare 9 December 2026 leases" });
    expect(posted).toEqual([]);
    fireEvent.click(button);
    await screen.findByText("Preparation finished for December 2026.");
    expect([...posted].sort()).toEqual(ROWS.map((row) => row.leaseId).sort());
  });

  it("ARCH-S283-4 BEH-S283-2 with a search showing four of nine, only those four are prepared", async () => {
    batch();
    fireEvent.change(screen.getByRole("searchbox", { name: /Search this month/ }), {
      target: { value: "Example" },
    });
    // AC-S283-6: changing the filter starts no lookup.
    expect(posted).toEqual([]);
    const button = await screen.findByRole("button", {
      name: "Prepare 4 of 9 December 2026 leases",
    });
    expect(
      screen.getByText(
        "4 leases shown. 3 need a comparison; 1 already has one. Monthly allowance: 41 of 50 left.",
      ),
    ).toBeVisible();
    fireEvent.click(button);
    await screen.findByText("Preparation finished for December 2026.");
    expect([...posted].sort()).toEqual(
      ROWS.slice(0, 4)
        .map((row) => row.leaseId)
        .sort(),
    );
  });

  it("ARCH-S283-4 an open count group shows none of this batch, so nothing is prepared", () => {
    // The batch reads its open group from the address, as a staff member's link sets it.
    window.history.replaceState(null, "", "/lease-renewal/live/desk?group=completed");
    render(
      <RenewalWorkingBatch
        initial={{ month: null, group: "completed", tag: null, sort: null }}
        kickoff={{ canPrepare: true, sourceCurrent: true, allowance: null }}
        rows={ROWS}
        todayIso={TODAY}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Prepare 0 of 9 December 2026 leases" }),
    ).toBeDisabled();
  });
});

describe("BEH-S283-3 the run stops at the allowance and never retargets", () => {
  const TARGETS: PreparationTarget[] = preparationTargets(ROWS.slice(0, 4));

  it("BEH-S283-3 once the server answers the allowance is reached, nothing more is posted and the rest are listed as not run", async () => {
    answers[TARGETS[1]!.leaseId] = "allowance_reached";
    render(
      <RenewalKickoffPreparation
        allowance={{ remaining: 1, total: 50 }}
        canPrepare
        month={MONTH}
        monthTotal={9}
        targets={TARGETS}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare 4 of 9 December 2026 leases" }),
    );
    await screen.findByText(/Preparation finished for December 2026\./);
    expect(posted).toEqual([TARGETS[0]!.leaseId, TARGETS[1]!.leaseId]);
    const results = screen.getByRole("list", { name: "Preparation results" });
    expect(results.querySelectorAll('[data-kickoff-outcome="not_run"]')).toHaveLength(2);
    expect(results).toHaveTextContent(
      `${TARGETS[2]!.address}: Not run: the monthly allowance is reached.`,
    );
    expect(screen.getByText(/2 leases were not run\./)).toBeInTheDocument();
  });

  it("AC-S283-2 changing the filter during a run does not retarget it, and Continue rechecks the same run's remaining targets", async () => {
    answers[TARGETS[1]!.leaseId] = "allowance_reached";
    const view = render(
      <RenewalKickoffPreparation
        canPrepare
        month={MONTH}
        monthTotal={9}
        targets={TARGETS}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare 4 of 9 December 2026 leases" }),
    );
    // The filter changes to one other lease mid-run: the run's targets do not change.
    view.rerender(
      <RenewalKickoffPreparation
        canPrepare
        month={MONTH}
        monthTotal={9}
        targets={preparationTargets(ROWS.slice(5, 6))}
      />,
    );
    await screen.findByText(/Preparation finished for December 2026\./);
    expect(posted).toEqual([TARGETS[0]!.leaseId, TARGETS[1]!.leaseId]);
    // Continue: the remaining targets of that same run (the server revalidates each one).
    delete answers[TARGETS[1]!.leaseId];
    posted = [];
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Continue December 2026 preparation" }),
      ).toBeEnabled(),
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Continue December 2026 preparation" }),
      );
    });
    await waitFor(() =>
      expect(posted).toEqual(TARGETS.slice(1).map((target) => target.leaseId)),
    );
    expect(posted).not.toContain(ROWS[5]!.leaseId);
  });

  it("AC-S283-6 opening and rerendering start no lookup", () => {
    const view = render(
      <RenewalKickoffPreparation canPrepare month={MONTH} targets={TARGETS} />,
    );
    view.rerender(<RenewalKickoffPreparation canPrepare month="2027-01" targets={[]} />);
    view.unmount();
    expect(posted).toEqual([]);
  });
});
