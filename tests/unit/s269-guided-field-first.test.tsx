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

import {
  kickoffFactsFor,
  UNREAD_KICKOFF_SUPPORT,
  type KickoffObservationRow,
} from "@/lib/lease-renewal/kickoff-facts";
import type { CapturedCompResult } from "@/lib/lease-renewal/market-observation";
import { projectRenewalPreparation } from "@/lib/lease-renewal/renewal-preparation";
import { renewalStageContextFor } from "@/lib/lease-renewal/renewal-stage-context";
import { RENEWAL_STAGE_NEXT_STEP } from "@/lib/lease-renewal/renewal-stage";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import {
  renderWorkspace,
  settle,
  stubRenewalRoutes,
  viewButton,
} from "@/tests/helpers/focus-workspace";
import { evidenceInput, message } from "@/tests/helpers/outreach-evidence-fixtures";
import { fixtureWorkingRecord } from "@/tests/helpers/rent-charge-fixtures";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S269 on the lease page (AC-S269-1 to AC-S269-4, BEH-S269-1 to BEH-S269-4): from the outcome
// heading, one short cue, then the active input group, exact fix or wait; the field the outcome
// owns comes before ready facts and evidence; a cross-outcome fix opens the owning field and
// offers the exact return; nothing here saves, sends, looks up or changes the stage.
// Fail-first on the base source (9b3bb69e + S261/S266/S268): no data-renewal-priority-* contract,
// Compare market rent led with its generic "Compare market rent" button above the comparable rows,
// the tenant offer named no missing base and no return existed. Values are synthetic.

const LEASE = "lease-318-cedar-7";
const CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const PINNED_NOW = new Date("2026-11-10T17:00:00.000Z");

const manual = () =>
  emptyRenewalWorkspace(LEASE, CYCLE_ID, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });

const comparison = {
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

const row: KickoffObservationRow = {
  id: "this-cycle",
  leaseId: LEASE,
  cycleId: CYCLE_ID,
  recordedAt: "2026-11-04T15:00:00.000Z",
  result: comparison,
};

function live(base = getRenewalLeaseWorkspace(LEASE)!) {
  return {
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
  };
}

function routes() {
  return stubRenewalRoutes(manual(), {
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

function nowCard() {
  return within(screen.getByRole("region", { name: "Guided view" })).getByRole("region", {
    name: "Now",
  });
}

function work() {
  return nowCard().querySelector<HTMLElement>("[data-renewal-work]")!;
}

/** Shown to a person: not hidden, and not inside a closed disclosure (a summary is shown). */
function shown(element: Element) {
  return (
    !element.closest("[hidden], [data-renewal-focus-hidden]") &&
    (!element.parentElement?.closest("details:not([open])") || element.matches("summary"))
  );
}

/** The first editable control a person meets under the outcome heading. */
function firstEditable(scope: HTMLElement) {
  return [...scope.querySelectorAll<HTMLElement>("input, select, textarea")].find(
    (field) =>
      shown(field) &&
      !field.matches('[type="hidden"], :disabled, [readonly]') &&
      !field.closest("[data-renewal-verification]"),
  );
}

async function openComparison() {
  const base = getRenewalLeaseWorkspace(LEASE)!;
  const working = fixtureWorkingRecord({ terms_rent: { value: 1395, revision: 1 } });
  const workspace = {
    ...live(base),
    renewalStageContext: {
      ...renewalStageContextFor({ ...base.summary, guidance: base.guidance }, null, null),
      preparation: projectRenewalPreparation(
        kickoffFactsFor({
          leaseId: LEASE,
          cycleDateIso: "2026-12-31",
          contractualRent: 1350,
          leaseEndIso: "2026-12-31",
          workingCurrentRent: null,
          address: "318 Cedar Street, Unit 7",
          dataCheck: null,
          manual: manual(),
          working,
          sourceReadable: true,
          ownerRecipient: { state: "ready" },
          support: {
            ...UNREAD_KICKOFF_SUPPORT,
            observationsByLease: new Map([[LEASE, [row]]]),
          },
        }),
      ),
    },
  };
  const fake = routes();
  await renderWorkspace({
    manual: manual(),
    view: "default",
    workspace,
    extra: { selectedStepId: "compare-market", workingRecord: working },
  });
  await settle();
  return fake;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
  router.refresh.mockClear();
  window.history.replaceState(null, "", `/lease-renewal/live/desk/lease/${LEASE}`);
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("S269 field-first Guided work", { timeout: 120_000 }, () => {
  it("AC-S269-2 / BEH-S269-2: a usable comparison leads with Rent to recommend and the action that follows, never the generic opening button", async () => {
    const fake = await openComparison();
    expect(nowCard()).toHaveAttribute("data-renewal-now-step", "compare-market");
    expect(work()).toHaveAttribute("data-renewal-priority-state", "act");
    expect(work()).toHaveAttribute("data-renewal-priority-lead", "rent-to-recommend");
    // The heading, then the active group, then the next step: one primary, the following action.
    const primary = nowCard().querySelector("[data-renewal-now-primary]")!;
    expect(primary).toHaveTextContent("Continue to Ask the owner");
    expect(primary.closest("[data-renewal-active-group]")).not.toBeNull();
    expect(
      within(nowCard()).queryByRole("button", { name: "Compare market rent" }),
    ).toBeNull();
    // The first editable control under the heading is the actual field the outcome owns.
    expect(firstEditable(nowCard())).toBe(
      document.getElementById("renewal-now-rent-to-recommend"),
    );
    // The saved estimate or range stays beside it; the comparable rows are Verification only.
    expect(nowCard()).toHaveTextContent("RentCast range $1,300 to $1,500");
    const comparables = [
      ...nowCard().querySelectorAll('ol[aria-label="Comparables"]'),
    ].filter(shown);
    expect(comparables).toEqual([]);
    await userEvent.setup().click(primary);
    await waitFor(() =>
      expect(nowCard()).toHaveAttribute("data-renewal-now-step", "ask-owner"),
    );
    expect(fake.writes()).toEqual([]);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("AC-S269-2 / AC-S269-3: a missing base on the offer is an exact link with its reason, and the exact return keeps the case", async () => {
    const fake = routes();
    await renderWorkspace({
      manual: manual(),
      view: "default",
      workspace: live(),
      extra: { selectedStepId: "offer-tenant" },
    });
    await settle();
    expect(nowCard()).toHaveAttribute("data-renewal-now-step", "offer-tenant");
    expect(work()).toHaveAttribute("data-renewal-priority-lead", "renewal-base-rent");
    expect(work()).toHaveAttribute("data-renewal-priority-owner", "compare-market");
    const cue = work().querySelector("[data-renewal-priority-cue]")!;
    expect(cue).toHaveTextContent("The offer needs the renewal base rent.");
    // The cue comes first under the heading, then the active group.
    expect(work().firstElementChild).toBe(cue);
    const fix = within(nowCard()).getByRole("button", { name: "Set renewal base rent" });
    expect(fix).toHaveAttribute("data-renewal-now-primary");
    const user = userEvent.setup();
    await user.click(fix);
    // The owning field opens and takes focus; it is not operated.
    await waitFor(() =>
      expect(nowCard()).toHaveAttribute("data-renewal-now-step", "compare-market"),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        document.getElementById("renewal-now-rent-to-recommend"),
      ),
    );
    expect((document.activeElement as HTMLInputElement).value).toBe("");
    const back = within(nowCard()).getByRole("button", {
      name: "Return to tenant offer",
    });
    expect(back.closest("[data-renewal-return]")).not.toBeNull();
    await user.click(back);
    await waitFor(() =>
      expect(nowCard()).toHaveAttribute("data-renewal-now-step", "offer-tenant"),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(nowCard()).getByRole("button", { name: "Set renewal base rent" }),
      ),
    );
    expect(
      within(nowCard()).queryByRole("button", { name: "Return to tenant offer" }),
    ).toBeNull();
    expect(fake.writes()).toEqual([]);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("AC-S269-1 / BEH-S269-1: an uncertain owner send leads with the same attempt and no Send competes with it", async () => {
    const base = getRenewalLeaseWorkspace(LEASE)!;
    const workspace = {
      ...live(base),
      renewalStageContext: {
        ...renewalStageContextFor(
          { ...base.summary, guidance: base.guidance },
          evidenceInput([
            message({ cycleId: CYCLE_ID, acceptedAtMs: null, unconfirmed: true }),
          ]),
          null,
        ),
        cycleDateIso: "2026-12-31",
      },
    };
    const fake = routes();
    await renderWorkspace({ manual: manual(), view: "default", workspace });
    await settle();
    expect(nowCard()).toHaveAttribute("data-renewal-now-step", "ask-owner");
    expect(work()).toHaveAttribute("data-renewal-priority-state", "reconcile");
    expect(work()).toHaveAttribute("data-renewal-work-state", "reconcile");
    const primary = nowCard().querySelector("[data-renewal-now-primary]")!;
    expect(primary).toHaveTextContent(RENEWAL_STAGE_NEXT_STEP.checkSend);
    const competing = [...nowCard().querySelectorAll("button, a[href]")]
      .filter(shown)
      .filter((control) =>
        /^(send|review and send|review owner message|schedule)/i.test(
          control.textContent?.trim() ?? "",
        ),
      );
    expect(competing).toEqual([]);
    expect(fake.writes()).toEqual([]);
  });

  it("AC-S269-4: Guided stays the default with one Work status and the Full toggle, and switching views keeps the same field and value", async () => {
    const fake = await openComparison();
    expect(viewButton("Full view")).toHaveAttribute("aria-pressed", "false");
    const rent = () =>
      document.querySelectorAll<HTMLInputElement>("#renewal-now-rent-to-recommend");
    // One editor in each view: the Now card's active Work in Guided, Compare market rent in Full.
    expect(rent()).toHaveLength(1);
    expect(nowCard()).toContainElement(rent()[0]!);
    const user = userEvent.setup();
    // An unsaved entry is kept by its one owner across the switch, and nothing is saved.
    await user.clear(rent()[0]!);
    await user.type(rent()[0]!, "1450");
    await user.click(viewButton("Full view"));
    await settle();
    expect(rent()).toHaveLength(1);
    expect(rent()[0]!.closest("#renewal-section-comps")).not.toBeNull();
    expect(rent()[0]!.value).toBe("1450");
    expect(document.querySelectorAll("section[data-renewal-outcome]")).toHaveLength(7);
    await user.click(viewButton("Full view"));
    await settle();
    expect(rent()).toHaveLength(1);
    expect(nowCard()).toContainElement(rent()[0]!);
    expect(rent()[0]!.value).toBe("1450");
    expect(work()).toHaveAttribute("data-renewal-priority-lead", "rent-to-recommend");
    expect(fake.writes()).toEqual([]);
  });
});
