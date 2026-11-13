// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import { RenewalDeskTable } from "@/components/lease-renewal/RenewalDeskTable";
import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
import { DEFAULT_RENEWAL_DESK_QUERY_V2 } from "@/lib/lease-renewal/desk-query-v2";
import { leaseWaitingFor, type LeaseWaiting } from "@/lib/lease-renewal/lease-waiting";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";
import {
  focusPane,
  renderWorkspace,
  settle,
  stubRenewalRoutes,
} from "@/tests/helpers/focus-workspace";
import { evidenceInput, message } from "@/tests/helpers/outreach-evidence-fixtures";
import { actionFixture, manualFixture } from "@/tests/helpers/renewal-action-fixtures";

// S232 R-S232-4 (BEH-S232-3): the desk row and Focus show one status, who the lease waits on and
// the record behind it; a disagreement reads "Needs a check" with both facts; a brand-new record
// shows its next action, never the "Owner decision" phase label. S279 (rewritten on purpose,
// R-S279-2 / R-S279-3): the disagreement is the staff record against the lease's own message
// evidence, with the fix, never one viewer's linked Gmail thread; on the lease page the stage line
// carries it once. Synthetic records only; nothing here reaches a provider.

const PINNED_NOW = new Date("2026-09-30T17:00:00.000Z");
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The owner replied on 09/29; the staff record saved "No response" on 09/30, after it. */
function ownerReplied(state: RenewalWorkspaceState): LeaseWaiting {
  return leaseWaitingFor(
    state,
    evidenceInput([
      message({
        cycleId: state.cycleId,
        acceptedAtMs: Date.parse("2026-09-28T15:00:00.000Z"),
        replyAtMs: Date.parse("2026-09-29T15:00:00.000Z"),
      }),
    ]),
    { leaseId: state.leaseId, cycleDateIso: "2026-12-31" },
  );
}
const CHECK =
  "The staff record says waiting on the owner. The owner replied on 09/29/2026. Record the response.";

function row(
  manual: RenewalWorkspaceState | null,
  leaseWaiting?: LeaseWaiting,
): DeskLeaseRow {
  const { workspace } = actionFixture({ manual });
  const summary = workspace.summary;
  return {
    ...summary,
    ...(leaseWaiting ? { leaseWaiting } : {}),
    guidance: workspace.guidance,
    processState: null,
  };
}

function statusCell(rowIndex: number) {
  return document.querySelectorAll<HTMLElement>('[data-renewal-field="overall-status"]')[
    rowIndex
  ]!;
}

function lines(scope: HTMLElement) {
  const text = (field: string) =>
    scope.querySelector(`[data-renewal-field="${field}"]`)?.textContent ?? null;
  return {
    waiting: text("waiting-on"),
    check: text("status-check"),
    evidence: text("status-evidence"),
  };
}

describe("S232 desk row and Focus status (R-S232-4)", { timeout: 60_000 }, () => {
  it("shows status, waiting-on and evidence on every row, and Needs a check with both facts", () => {
    const awaitingOwner = manualFixture({
      owner: "no_response",
      done: ["owner_outreach"],
    });
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[
          row(null),
          row(awaitingOwner),
          row(awaitingOwner, ownerReplied(awaitingOwner)),
        ]}
        shortcuts={{ available: false, tokenFor: () => null }}
        sourceReadOk
        sourceReadAtIso="2026-09-30T17:00:00.000Z"
        state={{ ...DEFAULT_RENEWAL_DESK_QUERY_V2 }}
        totalInScope={3}
        totalLoaded={3}
      />,
    );
    const fresh = statusCell(0);
    expect(fresh).toHaveTextContent("Ready");
    expect(fresh).not.toHaveTextContent("Owner decision");
    expect(lines(fresh)).toEqual({
      waiting: "Waiting on: the PMI KC team",
      check: null,
      evidence:
        "From the RentVine read at 09/30/2026, 12:00 PM CDT; nothing recorded by staff yet",
    });
    // The next action replaces the phase label, in the row's action cell.
    expect(
      document.querySelectorAll('[data-renewal-field="action"]')[0],
    ).toHaveTextContent("Owner outreach");

    expect(within(statusCell(1)).getByRole("link", { name: "Waiting" })).toBeVisible();
    expect(lines(statusCell(1))).toEqual({
      waiting: "Waiting on: the owner",
      check: null,
      evidence: "From the staff record, saved 09/30/2026, 7:00 AM CDT",
    });

    const conflict = statusCell(2);
    expect(conflict).toHaveAttribute("data-lease-status", "needs_check");
    expect(conflict).toHaveTextContent("Needs a check");
    // No single status to filter by, so the badge is not a status link.
    expect(
      within(conflict).queryByRole("link", { name: /Needs a check|Waiting/ }),
    ).toBeNull();
    expect(lines(conflict)).toEqual({
      waiting: null,
      check: CHECK,
      evidence: "From the staff record, saved 09/30/2026, 7:00 AM CDT",
    });
    // The relabeled step filter still exists for saved links.
    expect(screen.getByLabelText("Recorded progress step")).toBeInTheDocument();
  });

  it("reads Needs a check in Focus from the lease's own message evidence, the check shown once", async () => {
    const manual = manualFixture({ owner: "no_response", done: ["owner_outreach"] });
    stubRenewalRoutes(manual);
    const { workspace } = actionFixture({ manual });
    await renderWorkspace({
      workspace: {
        ...workspace,
        summary: { ...workspace.summary, leaseWaiting: ownerReplied(manual) },
      },
      manual,
    });
    const status = within(focusPane())
      .getByText(/^Lease status:/)
      .closest("p") as HTMLElement;
    expect(status).toHaveTextContent("Lease status: Needs a check");
    // S279 R-S279-3: the stage line above carries the sentence and its fix; Focus does not repeat it.
    expect(lines(status).check).toBeNull();
  });

  it("shows the desk row's lines in Focus and updates them from the readback after a save", async () => {
    const manual = manualFixture();
    stubRenewalRoutes(manual);
    const user = userEvent.setup();
    const { workspace } = actionFixture({ manual });
    await renderWorkspace({ workspace, manual });
    const status = () =>
      within(focusPane())
        .getByText(/^Lease status:/)
        .closest("p") as HTMLElement;
    expect(status()).toHaveTextContent("Lease status: Ready");
    const desk = row(manual);
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[desk]}
        shortcuts={{ available: false, tokenFor: () => null }}
        sourceReadOk
        sourceReadAtIso={workspace.dataCurrency?.readAtIso ?? null}
        state={{ ...DEFAULT_RENEWAL_DESK_QUERY_V2 }}
        totalInScope={1}
        totalLoaded={1}
      />,
    );
    expect(lines(status())).toEqual(lines(statusCell(0)));
    expect(lines(status()).waiting).toBe("Waiting on: the PMI KC team");

    const form = document.getElementById("renewal-manual-owner_outreach")!;
    await user.selectOptions(
      within(form).getByLabelText("Owner outreach outcome"),
      "done",
    );
    await settle();
    expect(status()).toHaveTextContent("Lease status: Waiting");
    expect(lines(status())).toEqual({
      waiting: "Waiting on: the owner",
      check: null,
      evidence: "From the staff record, saved 09/30/2026, 12:00 PM CDT",
    });
  });
});
