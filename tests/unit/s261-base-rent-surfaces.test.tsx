// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import type { RenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory-model";
import {
  renderWorkspace,
  settle,
  stubRenewalRoutes,
  viewButton,
} from "@/tests/helpers/focus-workspace";
import {
  fixtureCharge,
  fixtureInventory,
  fixtureWorkingRecord,
} from "@/tests/helpers/rent-charge-fixtures";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S261 on the lease page (AC-S261-1, BEH-S261-1, R-S261-3, R-S261-4 and the UI ownership rule):
// Check the numbers leads with Current base rent and shows a separate charge apart; the payment
// total and the recurring inventory stay in the read-only verification. A conflicting base leads
// with the existing correction. Compare market rent owns the one editable Rent to recommend; Ask
// the owner reads it with an exact link back. Opening and moving between steps sends nothing.
// Every lease, amount and person is synthetic.

const CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const PINNED_NOW = new Date("2026-11-10T17:00:00.000Z");
const LEASE_PATH = "/lease-renewal/live/desk/lease/lease-318-cedar-7";

const RENT = fixtureCharge("401", {
  accountLabel: "Rent",
  projection: { amount: "900.00", description: "Rent" },
});
const PET_RENT = fixtureCharge("402", {
  accountId: "15",
  accountLabel: "Pet Rent",
  classification: "non_rent",
  projection: { accountID: "15", amount: "40.00", description: "Pet Rent" },
});
const COMBINED_RENT = fixtureCharge("404", {
  accountLabel: "Rent",
  projection: { amount: "940.00", description: "Rent" },
});

function manualState() {
  return emptyRenewalWorkspace("lease-318-cedar-7", CYCLE_ID, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
}

function liveWorkspace() {
  const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
  return {
    ...workspace,
    summary: {
      ...workspace.summary,
      currentRent: 900,
      leaseTotalRent: 940,
      unitListedRent: 1000,
    },
    live: {
      leaseId: "lease-318-cedar-7",
      ownerDecision: null,
      ownerDecisionCurrent: false,
      ownerOutcome: null,
      ownerResponseRecordable: false,
      tenantOfferDraftId: null,
      tenantOutcome: null,
      processVersion: workspace.process.version,
      complete: false,
    },
  };
}

function stubLiveRoutes() {
  return stubRenewalRoutes(manualState(), {
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
}

async function open(
  step: string,
  inventory: RenewalChargeInventory | null,
  workingRent: number | null = 1000,
) {
  const routes = stubLiveRoutes();
  await renderWorkspace({
    manual: manualState(),
    view: "default",
    workspace: liveWorkspace(),
    extra: {
      selectedStepId: step,
      chargeInventory: inventory,
      workingRecord:
        workingRent === null
          ? null
          : fixtureWorkingRecord({ terms_rent: { value: workingRent, revision: 1 } }),
    },
  });
  await settle();
  return routes;
}

function nowCard() {
  const pane = screen.getByRole("region", { name: "Guided view" });
  return within(pane).getByRole("region", { name: "Now" });
}

/** Text a person reads outside the closed verification disclosures. */
function workText(): string {
  const parts: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (
      !parent ||
      parent.closest(
        "[hidden], [data-renewal-focus-hidden], [data-renewal-verification], script, style",
      )
    )
      continue;
    parts.push(node.textContent ?? "");
  }
  return parts.join(" ");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
  router.refresh.mockClear();
  window.history.replaceState(null, "", LEASE_PATH);
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("S261 Check the numbers", { timeout: 120_000 }, () => {
  it("AC-S261-1 / BEH-S261-1: Current base rent leads the rent facts with the pet charge apart; the total and inventory stay in Verification", async () => {
    const routes = await open("check-numbers", fixtureInventory([RENT, PET_RENT]));
    const card = nowCard();
    expect(card).toHaveAttribute("data-renewal-now-step", "check-numbers");
    const base = within(card).getByRole("region", { name: "Current base rent" });
    expect(base).toHaveAttribute("data-renewal-base-rent", "ready");
    expect(base).toHaveTextContent(/Current base rent:?\s*\$900/);
    expect(base).toHaveTextContent(/Pet Rent:?\s*\$40/);
    // Current base rent is the first fact of the numbers check on the card.
    const slot = card.querySelector('[data-renewal-now-slot="prepared-numbers-check"]')!;
    expect(slot.querySelector("[data-renewal-field]")).toHaveAttribute(
      "data-renewal-field",
      "current-base-rent",
    );
    // The payment total and the recurring inventory are only in the read-only verification.
    const work = workText();
    expect(work).not.toMatch(/\$?940(\.00)?/);
    expect(work).not.toMatch(/Recurring charges \(RentVine\)/);
    expect(
      [...document.querySelectorAll("h3")]
        .filter((heading) => heading.textContent === "Recurring charges (RentVine)")
        .every((heading) => heading.closest("[data-renewal-verification]")),
    ).toBe(true);
    expect(
      within(card).queryByRole("button", { name: "Correct the current base rent" }),
    ).toBeNull();
    expect(routes.writes()).toEqual([]);
  });

  it("AC-S261-1: a rent charge that disagrees with the contractual base leads with the existing correction and both sources", async () => {
    const routes = await open("check-numbers", fixtureInventory([COMBINED_RENT]));
    const base = within(nowCard()).getByRole("region", { name: "Current base rent" });
    expect(base).toHaveAttribute("data-renewal-base-rent", "needs_verification");
    expect(base).toHaveTextContent(/Needs verification/);
    expect(base).toHaveTextContent("$940");
    expect(base).toHaveTextContent("$900");
    const correct = within(base).getByRole("button", {
      name: "Correct the current base rent",
    });
    await userEvent.setup().click(correct);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        document.getElementById("renewal-working-current-rent")?.querySelector("input") ??
          null,
      ),
    );
    expect(routes.writes()).toEqual([]);
  });
});

describe("S261 one Rent to recommend owner", { timeout: 120_000 }, () => {
  it("UI ownership (S281 R-S281-11, rewritten on purpose): Ask the owner reads the current base and Rent to recommend before its primary, and Edit opens the one editor in place there", async () => {
    const routes = await open("ask-owner", fixtureInventory([RENT, PET_RENT]));
    const card = nowCard();
    expect(card).toHaveAttribute("data-renewal-now-step", "ask-owner");
    const summaries = document.querySelectorAll<HTMLElement>(
      '[data-renewal-field="owner-pricing-summary"]',
    );
    // One facts line on the page, in the Now card's Work.
    expect(summaries).toHaveLength(1);
    const summary = summaries[0]!;
    expect(card).toContainElement(summary);
    expect(summary.closest("[hidden], [data-renewal-focus-hidden]")).toBeNull();
    expect(summary).toHaveTextContent(/Current base rent:?\s*\$900/);
    expect(summary).toHaveTextContent(/Rent to recommend:?\s*\$1,000/);
    // Closed, no editable rent is shown; "Edit" opens the one editor in place.
    expect(document.querySelectorAll("#renewal-now-rent-to-recommend")).toHaveLength(0);
    const edit = within(summary).getByRole("button", { name: "Edit rent to recommend" });
    expect(edit).toHaveAttribute("aria-expanded", "false");
    await userEvent.setup().click(edit);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        document.getElementById("renewal-now-rent-to-recommend"),
      ),
    );
    expect(nowCard()).toHaveAttribute("data-renewal-now-step", "ask-owner");
    expect(summary).toContainElement(document.activeElement as HTMLElement);
    expect(document.querySelectorAll("#renewal-now-rent-to-recommend")).toHaveLength(1);
    expect((document.activeElement as HTMLInputElement).value).toBe("1000");
    expect(routes.writes()).toEqual([]);
  });

  it("UI ownership: Full view keeps exactly one Rent to recommend editor, in Compare market rent", async () => {
    await open("ask-owner", fixtureInventory([RENT, PET_RENT]));
    await userEvent.setup().click(viewButton("Full view"));
    await settle();
    const editors = screen.getAllByLabelText("Rent to recommend");
    expect(editors).toHaveLength(1);
    expect(editors[0]!.closest("#renewal-section-comps")).not.toBeNull();
    const summary = document.querySelector<HTMLElement>(
      '[data-renewal-field="owner-pricing-summary"]',
    )!;
    expect(summary.closest("#renewal-section-owner")).not.toBeNull();
    expect(
      within(summary).getByRole("link", { name: "Edit rent to recommend" }),
    ).toBeInTheDocument();
  });
});
