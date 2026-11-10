// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  kickoffFactsFor,
  UNREAD_KICKOFF_SUPPORT,
  type KickoffObservationRow,
  type KickoffSupportRead,
} from "@/lib/lease-renewal/kickoff-facts";
import type { CapturedCompResult } from "@/lib/lease-renewal/market-observation";
import {
  KICKOFF_WORDS,
  projectRenewalPreparation,
} from "@/lib/lease-renewal/renewal-preparation";
import { renewalStageContextFor } from "@/lib/lease-renewal/renewal-stage-context";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import {
  renderWorkspace,
  settle,
  stubRenewalRoutes,
} from "@/tests/helpers/focus-workspace";
import { fixtureWorkingRecord } from "@/tests/helpers/rent-charge-fixtures";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S261 R-S261-4 / ARCH-S261-4 / BEH-S261-4 / AC-S261-4: returning to a lease finds the work already
// saved for its exact lease and cycle, or the exact reason it is not there, before anything offers
// a new paid lookup or preparation. Opening the lease starts nothing. Values are synthetic.

const LEASE = "lease-318-cedar-7";
const CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const OTHER_CYCLE = "c5cd4c92-d503-4e73-b3f3-d716d78978a0";
const PINNED_NOW = new Date("2026-11-10T17:00:00.000Z");

const manual = () =>
  emptyRenewalWorkspace(LEASE, CYCLE_ID, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });

const comparison: CapturedCompResult = {
  source: "RentCast",
  confidence: "Likely",
  rangeLow: 1300,
  rangeHigh: 1500,
  pointEstimate: 1400,
  compCount: 3,
  retrievedAt: "2026-11-04T15:00:00.000Z",
  comparables: [
    { rent: 1380, distanceMiles: 0.4 },
    { rent: 1420, distanceMiles: 0.6 },
    { rent: 1460, distanceMiles: 0.9 },
  ],
} as unknown as CapturedCompResult;

function row(id: string, cycleId: string): KickoffObservationRow {
  return {
    id,
    leaseId: LEASE,
    cycleId,
    recordedAt: "2026-11-04T15:00:00.000Z",
    result: comparison,
  };
}

function preparation(support: KickoffSupportRead, typedRent: number | null = null) {
  return projectRenewalPreparation(
    kickoffFactsFor({
      leaseId: LEASE,
      cycleDateIso: "2026-12-31",
      contractualRent: 1350,
      leaseEndIso: "2026-12-31",
      workingCurrentRent: null,
      address: "318 Cedar Street, Unit 7",
      dataCheck: null,
      manual: manual(),
      working:
        typedRent === null
          ? null
          : fixtureWorkingRecord({ terms_rent: { value: typedRent, revision: 1 } }),
      sourceReadable: true,
      ownerRecipient: { state: "ready" },
      support,
    }),
  );
}

async function reopen(support: KickoffSupportRead, typedRent: number | null = null) {
  const base = getRenewalLeaseWorkspace(LEASE)!;
  const workspace = {
    ...base,
    live: {
      leaseId: LEASE,
      ownerDecision: null,
      ownerDecisionCurrent: false,
      ownerOutcome: null,
      ownerResponseRecordable: false,
      tenantOfferDraftId: null,
      tenantOutcome: null,
      processVersion: base.process.version,
      complete: false,
    },
    renewalStageContext: {
      ...renewalStageContextFor({ ...base.summary, guidance: base.guidance }, null, null),
      preparation: preparation(support, typedRent),
    },
  };
  const routes = stubRenewalRoutes(manual(), {
    other({ url }) {
      if (url.includes("/api/lease-renewal/notice-review"))
        return Response.json({
          disposition: { state: "not_initiated", label: "No move-out notice recorded." },
          ready: false,
        });
      if (url.includes("/api/lease-renewal/notice-timing-basis"))
        return Response.json({
          timingBasis: { state: "missing", record: null },
          canSelect: false,
        });
      return null;
    },
  });
  await renderWorkspace({
    manual: manual(),
    view: "default",
    workspace,
    extra: {
      selectedStepId: "compare-market",
      workingRecord:
        typedRent === null
          ? null
          : fixtureWorkingRecord({ terms_rent: { value: typedRent, revision: 1 } }),
    },
  });
  await settle();
  const pane = screen.getByRole("region", { name: "Guided view" });
  return { routes, card: within(pane).getByRole("region", { name: "Now" }) };
}

/** The Now card's own comparison slot (the step's read-only verification repeats it). */
function slot(card: HTMLElement): HTMLElement {
  return card.querySelector<HTMLElement>('[data-renewal-now-slot="stored-comparison"]')!;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
  window.history.replaceState(null, "", `/lease-renewal/live/desk/lease/${LEASE}`);
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("S261 resume prepared work", { timeout: 120_000 }, () => {
  it("R-S261-4: a preparation that failed earlier for this cycle states its exact reason and is not offered again by itself", () => {
    const failed = preparation({
      ...UNREAD_KICKOFF_SUPPORT,
      observationsByLease: new Map(),
      preparationsByLease: new Map([
        [
          LEASE,
          {
            cycleKey: "2026-12-31",
            state: "failed",
            reason: "The comparison did not answer.",
          },
        ],
      ]),
    });
    expect(failed.comparison).toMatchObject({ state: "none", attempted: true });
    expect(failed.comparison.line).toContain("The comparison did not answer.");
    // A failure on another cycle date is not this cycle's.
    const elsewhere = preparation({
      ...UNREAD_KICKOFF_SUPPORT,
      observationsByLease: new Map(),
      preparationsByLease: new Map([
        [
          LEASE,
          {
            cycleKey: "2025-12-31",
            state: "failed",
            reason: "The comparison did not answer.",
          },
        ],
      ]),
    });
    expect(elsewhere.comparison).toMatchObject({ state: "none" });
    expect(elsewhere.comparison.line).not.toContain("did not answer");
  });

  it("BEH-S261-4 / AC-S261-4: reopening shows this cycle's saved comparison and Rent to recommend, never another cycle's, and opening sends nothing", async () => {
    const { routes, card } = await reopen(
      {
        ...UNREAD_KICKOFF_SUPPORT,
        observationsByLease: new Map([
          [LEASE, [row("this-cycle", CYCLE_ID), row("other-cycle", OTHER_CYCLE)]],
        ]),
      },
      1395,
    );
    expect(card).toHaveAttribute("data-renewal-now-step", "compare-market");
    const stored = within(slot(card)).getByRole("region", { name: "Stored comparison" });
    expect(stored).toHaveAttribute("data-renewal-comparison", "stored");
    expect(stored).toHaveTextContent("RentCast range $1,300 to $1,500");
    expect(
      within(card).queryByRole("button", { name: KICKOFF_WORDS.prepareLease }),
    ).toBeNull();
    expect(
      (document.getElementById("renewal-now-rent-to-recommend") as HTMLInputElement)
        .value,
    ).toBe("1395");
    expect(routes.writes()).toEqual([]);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("BEH-S261-4: reopening after a failed preparation shows its reason instead of a new lookup, and opening sends nothing", async () => {
    const { routes, card } = await reopen({
      ...UNREAD_KICKOFF_SUPPORT,
      observationsByLease: new Map(),
      preparationsByLease: new Map([
        [
          LEASE,
          {
            cycleKey: "2026-12-31",
            state: "failed",
            reason: "The comparison did not answer.",
          },
        ],
      ]),
    });
    const stored = within(slot(card)).getByRole("region", { name: "Stored comparison" });
    expect(stored).toHaveTextContent("The comparison did not answer.");
    expect(
      within(card).queryByRole("button", { name: KICKOFF_WORDS.prepareLease }),
    ).toBeNull();
    expect(routes.writes()).toEqual([]);
  });
});
