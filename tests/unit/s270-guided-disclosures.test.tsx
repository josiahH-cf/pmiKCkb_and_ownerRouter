// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import { focusRenewalDashboardControl } from "@/components/lease-renewal/RenewalDashboardNavigation";
import {
  finishDateFix,
  startDateFixFromOffer,
} from "@/components/lease-renewal/RenewalDateProposal";
import {
  MESSAGE_CONTROL_IDS,
  WORKING_START_FIELD_ID,
} from "@/lib/lease-renewal/message-readiness";
import { fixtureWorkingRecord } from "@/tests/helpers/rent-charge-fixtures";
import {
  RENEWAL_PATH_LABELS,
  RENEWAL_PATH_STANDARD_STEPS,
} from "@/lib/lease-renewal/renewal-path";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import {
  renderWorkspace,
  settle,
  stubRenewalRoutes,
  viewButton,
  type RouteFakeOptions,
} from "@/tests/helpers/focus-workspace";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S270 (AC-S270-1 to AC-S270-4, BEH-S270-1 to BEH-S270-4): each outcome shows its active Work
// first, then one named secondary Work disclosure, then one named read-only Verification. Both
// start closed on ordinary entry, a view switch or another outcome; an exact link opens only the
// ancestors of its target and focuses it; a failed save keeps its group open; closing a group with
// focus inside returns focus to its summary; Verification hosts no control that operates anything.
// Fail-first on the base source: every secondary Work group opened by default in Guided (the
// November 10 baseline counted nine open), with the earlier names ("Correct lease facts and review
// source updates", two separate owner and tenant groups, "Record completion or non-renewal") and
// "Verify <step>" Verification names. Values are synthetic.

const LEASE = "lease-318-cedar-7";
const CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const PINNED_NOW = new Date("2026-11-10T17:00:00.000Z");

const GROUPS: Record<(typeof RENEWAL_PATH_STANDARD_STEPS)[number], string | null> = {
  "check-numbers": "Correct other lease facts",
  "compare-market": "Comparison inputs and deliberate rerun",
  "ask-owner": "Owner message options and outreach record",
  "offer-tenant": "Tenant offer options and record of contact",
  documents: "Other packet and handoff work",
  "finish-up": "Other follow-ups",
  complete: null,
};
const VERIFICATION: Record<(typeof RENEWAL_PATH_STANDARD_STEPS)[number], string> = {
  "check-numbers": "Verify lease numbers",
  "compare-market": "Verify market comparison",
  "ask-owner": "Verify owner terms and outreach",
  "offer-tenant": "Verify offer facts and delivery",
  documents: "Verify forms and signing evidence",
  "finish-up": "Verify follow-up and source updates",
  complete: "Verify completion",
};

const manual = () =>
  emptyRenewalWorkspace(LEASE, CYCLE_ID, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });

function live() {
  const base = getRenewalLeaseWorkspace(LEASE)!;
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

function routes(options: Partial<RouteFakeOptions> = {}) {
  return stubRenewalRoutes(manual(), {
    ...options,
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
  options: Partial<RouteFakeOptions> = {},
  extra: Parameters<typeof renderWorkspace>[0] = {},
) {
  const fake = routes(options);
  await renderWorkspace({
    manual: manual(),
    view: "default",
    workspace: live(),
    ...extra,
  });
  await settle();
  return fake;
}

/** Working renewal terms with every value saved, so the dates are not the current work. */
const savedTerms = () => ({
  ...fixtureWorkingRecord({
    terms_rent: { value: 1450, revision: 1 },
    terms_effective_date: { value: "2027-01-01", revision: 2 },
    terms_end_date: { value: "2027-12-31", revision: 3 },
  }),
  leaseId: LEASE,
});

function nowCard() {
  return within(screen.getByRole("region", { name: "Guided view" })).getByRole("region", {
    name: "Now",
  });
}

function shown(element: Element) {
  return (
    !element.closest("[hidden], [data-renewal-focus-hidden]") &&
    (!element.parentElement?.closest("details:not([open])") || element.matches("summary"))
  );
}

/** The named groups a person can see in the Now card, by summary text. */
function visibleGroups(scope: HTMLElement) {
  return [
    ...scope.querySelectorAll<HTMLDetailsElement>("details[data-renewal-secondary-work]"),
  ].filter((group) => {
    const summary = group.querySelector(":scope > summary");
    return summary !== null && shown(summary);
  });
}

function visibleVerification(scope: HTMLElement) {
  return [
    ...scope.querySelectorAll<HTMLDetailsElement>("details[data-renewal-verification]"),
  ].filter((details) => shown(details.querySelector(":scope > summary")!));
}

const summaryText = (details: HTMLDetailsElement) =>
  details.querySelector(":scope > summary")?.textContent?.trim();

async function choose(step: (typeof RENEWAL_PATH_STANDARD_STEPS)[number]) {
  const strip = within(screen.getByRole("region", { name: "Guided view" })).getByRole(
    "navigation",
    { name: "Renewal path" },
  );
  await userEvent
    .setup()
    .click(within(strip).getByRole("button", { name: RENEWAL_PATH_LABELS[step] }));
  await settle();
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
  finishDateFix();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("S270 named Guided disclosures", { timeout: 120_000 }, () => {
  it("AC-S270-1 / BEH-S270-1: every outcome shows active Work, then its one named group, then its named Verification, all closed", async () => {
    const fake = await open();
    for (const step of RENEWAL_PATH_STANDARD_STEPS) {
      await choose(step);
      const card = nowCard();
      expect(card).toHaveAttribute("data-renewal-now-step", step);
      const groups = visibleGroups(card);
      expect(
        groups.map(summaryText),
        `${step}: one named secondary Work group, or none for an outcome without one`,
      ).toEqual(GROUPS[step] ? [GROUPS[step]] : []);
      const verification = visibleVerification(card);
      expect(verification.map(summaryText), `${step}: one named Verification`).toEqual([
        VERIFICATION[step],
      ]);
      expect(verification[0]!.open, `${step}: Verification starts closed`).toBe(false);
      for (const group of groups) {
        // Native disclosure semantics, closed unless it holds the current work.
        expect(group.querySelector(":scope > summary")).not.toBeNull();
        if (group.open) expect(group).toHaveAttribute("data-renewal-promoted");
        // Work, then the group, then Verification.
        expect(
          card.querySelector("[data-renewal-work]")!.compareDocumentPosition(group) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
          group.compareDocumentPosition(verification[0]!) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
    }
    // Every unrelated group in the page is closed; only a promoted one may be open.
    for (const group of document.querySelectorAll<HTMLDetailsElement>(
      "details[data-renewal-secondary-work][open]",
    ))
      expect(group).toHaveAttribute("data-renewal-promoted");
    expect(fake.writes()).toEqual([]);
  });

  it("AC-S270-1: each group holds its outcome's optional work, with the governing Work above it", async () => {
    const fake = await open();
    await choose("check-numbers");
    const numbers = visibleGroups(nowCard())[0]!;
    // The optional Housing assistance editor sits in Correct other lease facts.
    const housing = nowCard().querySelector<HTMLElement>("[data-renewal-housing-slot]")!;
    expect(housing).toHaveAttribute("data-renewal-housing-slot", "optional");
    expect(numbers.contains(housing)).toBe(true);
    expect(numbers.contains(document.getElementById("renewal-rent-and-charges"))).toBe(
      true,
    );

    await choose("ask-owner");
    const owner = visibleGroups(nowCard())[0]!;
    // The current base and recommendation with its edit link stay in Work, above the group.
    const pricing = document.getElementById("renewal-owner-pricing-basis")!;
    expect(owner.contains(pricing)).toBe(false);
    expect(
      pricing.compareDocumentPosition(owner) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(owner.contains(document.getElementById("renewal-manual-owner_response"))).toBe(
      true,
    );

    await choose("finish-up");
    const followUps = visibleGroups(nowCard())[0]!;
    // The first open follow-up and the source updates are the Work; the rest wait in the group.
    expect(followUps.contains(document.getElementById("renewal-manual-insurance"))).toBe(
      false,
    );
    expect(
      followUps.contains(document.getElementById("renewal-manual-source-updates")),
    ).toBe(false);
    expect(followUps.contains(document.getElementById("renewal-manual-rhino"))).toBe(
      true,
    );

    // Verification opened on one outcome starts closed again after another outcome.
    await choose("check-numbers");
    const evidence = visibleVerification(nowCard())[0]!;
    await userEvent.setup().click(evidence.querySelector(":scope > summary")!);
    expect(evidence.open).toBe(true);
    await choose("compare-market");
    await choose("check-numbers");
    expect(visibleVerification(nowCard())[0]!.open).toBe(false);
    expect(fake.writes()).toEqual([]);
  });

  it("AC-S270-1: Full view uses the same named group and Verification in each outcome, closed", async () => {
    const fake = await open();
    await userEvent.setup().click(viewButton("Full view"));
    await settle();
    const outcomes = [
      ...document.querySelectorAll<HTMLElement>("section[data-renewal-outcome]"),
    ];
    expect(outcomes.map((section) => section.dataset.renewalOutcome)).toEqual([
      ...RENEWAL_PATH_STANDARD_STEPS,
    ]);
    for (const section of outcomes) {
      const step = section.dataset
        .renewalOutcome as (typeof RENEWAL_PATH_STANDARD_STEPS)[number];
      const groups = [
        ...section.querySelectorAll<HTMLDetailsElement>(
          "details[data-renewal-secondary-work]",
        ),
      ];
      expect(groups.map(summaryText), `${step} group`).toEqual(
        GROUPS[step] ? [GROUPS[step]] : [],
      );
      expect(groups.every((group) => !group.open)).toBe(true);
      const verification = [
        ...section.querySelectorAll<HTMLDetailsElement>(
          "details[data-renewal-verification]",
        ),
      ];
      expect(verification.map(summaryText), `${step} Verification`).toEqual([
        VERIFICATION[step],
      ]);
      expect(verification[0]!.open).toBe(false);
    }
    expect(fake.writes()).toEqual([]);
  });

  it("AC-S270-3 / BEH-S270-3: Verification hosts no control that operates, and opening or closing any disclosure sends nothing", async () => {
    const fake = await open();
    const user = userEvent.setup();
    await user.click(viewButton("Full view"));
    await settle();
    const before = fake.calls.length;
    const disclosures = [
      ...document.querySelectorAll<HTMLDetailsElement>(
        "details[data-renewal-verification], details[data-renewal-secondary-work]",
      ),
    ];
    expect(disclosures.length).toBeGreaterThanOrEqual(13);
    for (const details of disclosures) {
      await user.click(details.querySelector(":scope > summary")!);
      await user.click(details.querySelector(":scope > summary")!);
    }
    for (const details of document.querySelectorAll("details[data-renewal-verification]"))
      expect(
        details.querySelector(
          "button:not(.info-tip-trigger), input, select, textarea, form, [contenteditable=true], a[data-renewal-effect]",
        ),
      ).toBeNull();
    await settle();
    expect(fake.calls.length).toBe(before);
    expect(fake.writes()).toEqual([]);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("AC-S270-2 / AC-S270-4: an exact link opens only the ancestors of its target and focuses it; closing returns focus to the summary; a view switch closes it again", async () => {
    const fake = await open();
    act(() => {
      focusRenewalDashboardControl("renewal-manual-owner_outreach");
    });
    await settle();
    expect(nowCard()).toHaveAttribute("data-renewal-now-step", "ask-owner");
    const target = document.getElementById("renewal-manual-owner_outreach")!;
    await waitFor(() => expect(target.contains(document.activeElement)).toBe(true));
    const group = target.closest<HTMLDetailsElement>(
      "details[data-renewal-secondary-work]",
    )!;
    expect(summaryText(group)).toBe("Owner message options and outreach record");
    expect(group.open).toBe(true);
    // Verification and the other groups stay closed.
    for (const details of visibleVerification(nowCard()))
      expect(details.open).toBe(false);
    // Closing the group while focus is inside returns focus to its summary.
    act(() => {
      group.open = false;
      group.dispatchEvent(new Event("toggle"));
    });
    expect(document.activeElement).toBe(group.querySelector(":scope > summary"));
    act(() => {
      group.open = true;
      group.dispatchEvent(new Event("toggle"));
    });
    const user = userEvent.setup();
    await user.click(viewButton("Full view"));
    await settle();
    await user.click(viewButton("Full view"));
    await settle();
    expect(group.open).toBe(false);
    expect(fake.writes()).toEqual([]);
  });

  it("AC-S270-2: a failed save keeps its group open as current work through a view switch, with the typed choice kept", async () => {
    await open({ refuseRecords: { status: 503, error: "The record store is busy." } });
    await choose("ask-owner");
    const target = document.getElementById("renewal-manual-owner_outreach")!;
    const group = target.closest<HTMLDetailsElement>(
      "details[data-renewal-secondary-work]",
    )!;
    const user = userEvent.setup();
    await user.click(group.querySelector(":scope > summary")!);
    const outcome = within(target).getByLabelText("Owner outreach outcome");
    await user.selectOptions(outcome, "done");
    await waitFor(() =>
      expect(target.querySelector('[data-autosave="failed"]')).not.toBeNull(),
    );
    await waitFor(() => expect(group).toHaveAttribute("data-renewal-promoted"));
    await user.click(viewButton("Full view"));
    await settle();
    expect(group.open).toBe(true);
    await user.click(viewButton("Full view"));
    await settle();
    expect(group.open).toBe(true);
    expect(outcome).toHaveValue("done");
  });

  it("S270 Ask the owner: the one Working renewal terms editor is its own named reveal, and an exact date fix from the offer opens it as current work, not the options group", async () => {
    const fake = await open({}, { extra: { workingRecord: savedTerms() } });
    await choose("ask-owner");
    const reveal = () =>
      nowCard().querySelector<HTMLDetailsElement>("details[data-renewal-working-terms]")!;
    const group = visibleGroups(nowCard())[0]!;
    expect(reveal()).not.toBeNull();
    expect(summaryText(reveal())).toMatch(/^Working renewal terms/);
    // In Work, above the options group, and the one place its dates are edited.
    expect(group.contains(reveal())).toBe(false);
    expect(
      reveal().compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(document.querySelectorAll(`#${WORKING_START_FIELD_ID}`)).toHaveLength(1);
    expect(reveal().contains(document.getElementById(WORKING_START_FIELD_ID))).toBe(true);
    // Saved dates are not the current work: closed.
    expect(reveal().open).toBe(false);
    expect(reveal()).not.toHaveAttribute("data-renewal-promoted");

    // "Enter renewal start date" from Offer the tenant opens only this reveal, as current work.
    await choose("offer-tenant");
    act(() => {
      startDateFixFromOffer("renewalStartDate", MESSAGE_CONTROL_IDS.readiness("tenant"));
      focusRenewalDashboardControl(WORKING_START_FIELD_ID);
    });
    await settle();
    expect(nowCard()).toHaveAttribute("data-renewal-now-step", "ask-owner");
    await waitFor(() => expect(reveal()).toHaveAttribute("data-renewal-promoted"));
    expect(reveal().open).toBe(true);
    expect(
      document.getElementById(WORKING_START_FIELD_ID)!.contains(document.activeElement),
    ).toBe(true);
    expect(group.open).toBe(false);
    expect(group).not.toHaveAttribute("data-renewal-promoted");
    // "Return to tenant offer" ends the fix; the reveal is closed on its next entry.
    await userEvent
      .setup()
      .click(within(reveal()).getByRole("button", { name: "Return to tenant offer" }));
    await settle();
    expect(reveal()).not.toHaveAttribute("data-renewal-promoted");
    await choose("check-numbers");
    await choose("ask-owner");
    expect(reveal().open).toBe(false);
    expect(fake.writes()).toEqual([]);
  });

  it("R-S269-3: a typed, unsaved entry in the next follow-up stays when it moves from Other follow-ups into Finish up's Work", async () => {
    const fake = await open();
    await choose("finish-up");
    const rest = visibleGroups(nowCard())[0]!;
    expect(summaryText(rest)).toBe("Other follow-ups");
    const rhino = () => document.getElementById("renewal-manual-rhino")!;
    expect(rest.contains(rhino())).toBe(true);
    // Typed, not saved: fireEvent keeps focus where it is, so no blur saves the entry.
    fireEvent.change(within(rhino()).getByLabelText("Comment (optional)"), {
      target: { value: "Left a voicemail for the tenant" },
    });
    // The lead follow-up is recorded; the next one moves into Work.
    const insurance = document.getElementById("renewal-manual-insurance")!;
    expect(rest.contains(insurance)).toBe(false);
    fireEvent.change(within(insurance).getByRole("combobox"), {
      target: { value: "done" },
    });
    await waitFor(() => expect(rest.contains(rhino())).toBe(false));
    await settle();
    expect(within(rhino()).getByLabelText("Comment (optional)")).toHaveValue(
      "Left a voicemail for the tenant",
    );
    // Only the insurance record was saved; the typed comment is still an unsaved entry.
    expect(JSON.stringify(fake.writes())).not.toContain("Left a voicemail");
  });
});
