// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  startDateFixFromOffer,
  finishDateFix,
} from "@/components/lease-renewal/RenewalDateProposal";
import {
  kickoffFactsFor,
  UNREAD_KICKOFF_SUPPORT,
  type KickoffObservationRow,
} from "@/lib/lease-renewal/kickoff-facts";
import type { CapturedCompResult } from "@/lib/lease-renewal/market-observation";
import {
  WORKING_END_FIELD_ID,
  WORKING_START_FIELD_ID,
} from "@/lib/lease-renewal/message-readiness";
import { RENEWAL_PATH_LABELS } from "@/lib/lease-renewal/renewal-path";
import { projectRenewalPreparation } from "@/lib/lease-renewal/renewal-preparation";
import { renewalStageContextFor } from "@/lib/lease-renewal/renewal-stage-context";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";
import {
  renderWorkspace,
  settle,
  stubRenewalRoutes,
  viewButton,
} from "@/tests/helpers/focus-workspace";
import { fixtureWorkingRecord } from "@/tests/helpers/rent-charge-fixtures";
import { manualFixture } from "@/tests/helpers/renewal-action-fixtures";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S281 on the lease page, Guided and Full (R-S281-1, R-S281-4, R-S281-5, R-S281-11 to
// R-S281-14; ARCH-S281-1, ARCH-S281-5, ARCH-S281-6; BEH-S281-1, BEH-S281-4, BEH-S281-5,
// BEH-S281-8 to BEH-S281-11; AC-S281-1, AC-S281-4, AC-S281-7 to AC-S281-10). Ask the owner leads
// with its facts line before the recipients and the primary action; "Edit" opens the one Rent to
// recommend editor in place; the message and its other ways to send are named groups; the address
// names the step shown without a new history entry; the renewal dates open in place on Offer the
// tenant; a manual record that is the current need is in view and saving it moves focus on.
// Fail-first on the starting state: the facts block came after the message and its delivery
// actions, Ask the owner showed a link to Compare market rent, the one named group held
// everything, the address kept the step it was opened with, and "Enter renewal start date" on the
// offer opened Ask the owner. Values are synthetic.

const LEASE = "lease-318-cedar-7";
const CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const PINNED_NOW = new Date("2026-11-10T17:00:00.000Z");
const RENT_FIELD = "renewal-now-rent-to-recommend";

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

function workingRecord(fields: Parameters<typeof fixtureWorkingRecord>[0], revision = 1) {
  return { ...fixtureWorkingRecord(fields, revision), leaseId: LEASE };
}

function live(working = workingRecord({ terms_rent: { value: 1395, revision: 1 } })) {
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
}

/** Working record saves answer with the saved value; every other route answers as before. */
function routes(state: RenewalWorkspaceState = manual()) {
  return stubRenewalRoutes(state, {
    other({ url, method, body }) {
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
      if (url.startsWith("/api/lease-renewal/working-record") && method === "POST")
        return Response.json({
          record: workingRecord(
            { [String(body?.field)]: { value: body?.value as number, revision: 2 } },
            2,
          ),
        });
      return null;
    },
  });
}

async function open({
  packetLeadPanel,
  step,
  working,
  state = manual(),
}: {
  packetLeadPanel?: ReactNode;
  step?: string;
  working?: ReturnType<typeof workingRecord>;
  state?: RenewalWorkspaceState;
} = {}) {
  const record = working ?? workingRecord({ terms_rent: { value: 1395, revision: 1 } });
  const fake = routes(state);
  await renderWorkspace({
    manual: state,
    view: "default",
    workspace: live(record),
    extra: {
      ...(step ? { selectedStepId: step } : {}),
      ...(packetLeadPanel ? { packetLeadPanel } : {}),
      workingRecord: record,
    },
  });
  await settle();
  return fake;
}

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

function visibleGroups(scope: HTMLElement) {
  return [
    ...scope.querySelectorAll<HTMLDetailsElement>("details[data-renewal-secondary-work]"),
  ].filter((group) => {
    const summary = group.querySelector(":scope > summary");
    return summary !== null && shown(summary);
  });
}

const summaryText = (details: HTMLDetailsElement) =>
  details.querySelector(":scope > summary")?.textContent?.trim();

const follows = (before: Node, after: Node) =>
  Boolean(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING);

async function choose(label: string) {
  const strip = within(screen.getByRole("region", { name: "Guided view" })).getByRole(
    "navigation",
    { name: "Renewal path" },
  );
  await userEvent.setup().click(within(strip).getByRole("button", { name: label }));
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

describe(
  "S281 Ask the owner leads with its facts (R-S281-1)",
  { timeout: 120_000 },
  () => {
    it("ARCH-S281-1 / BEH-S281-1 / AC-S281-1: the facts line comes after the heading and before the primary, and the facts block stays above every named group", async () => {
      const fake = await open({ step: "ask-owner" });
      const card = nowCard();
      expect(card).toHaveAttribute("data-renewal-now-step", "ask-owner");
      // The card's own step heading; the step's mounted controls carry their own headings below.
      const heading = within(card).getByRole("heading", {
        level: 2,
        name: "Ask the owner",
      });
      const facts = card.querySelector<HTMLElement>("[data-renewal-owner-facts]")!;
      const primary = card.querySelector<HTMLElement>("[data-renewal-now-primary]")!;
      expect(facts).not.toBeNull();
      expect(primary).not.toBeNull();
      expect(follows(heading, facts)).toBe(true);
      expect(follows(facts, primary)).toBe(true);
      // The three amounts, in order: Current base rent, the market range, Rent to recommend.
      const base = facts.querySelector('[data-renewal-field="owner-current-base-rent"]')!;
      const market = facts.querySelector('[data-renewal-field="owner-market-range"]')!;
      const recommend = facts.querySelector(
        '[data-renewal-field="owner-recommended-rent"]',
      )!;
      expect(base).toHaveTextContent(/Current base rent/);
      expect(market).toHaveTextContent(
        "RentCast range $1,300 to $1,500 from 3 comparable",
      );
      expect(recommend).toHaveTextContent(/Rent to recommend:?\s*\$1,395/);
      expect(follows(base, market) && follows(market, recommend)).toBe(true);
      // One facts line on the page; the Full block keeps only the pricing basis in Guided.
      expect(
        document.querySelectorAll('[data-renewal-field="owner-pricing-summary"]'),
      ).toHaveLength(1);
      const block = document.getElementById("renewal-owner-pricing-basis")!;
      for (const group of visibleGroups(card)) expect(follows(block, group)).toBe(true);
      // No Rent to recommend editor until "Edit" is chosen.
      expect(document.querySelectorAll(`#${RENT_FIELD}`)).toHaveLength(0);
      expect(fake.writes()).toEqual([]);
    });
  },
);

describe("S281 Rent to recommend in place (R-S281-11)", { timeout: 120_000 }, () => {
  it("ARCH-S281-5 / BEH-S281-8 / AC-S281-7: Edit opens the one editor in place; a typed value survives Full and back; Enter saves $1,425.00 and returns focus to the primary", async () => {
    const fake = await open({ step: "ask-owner" });
    const user = userEvent.setup();
    const edit = within(nowCard()).getByRole("button", {
      name: "Edit rent to recommend",
    });
    await user.click(edit);
    const rent = () => document.querySelectorAll<HTMLInputElement>(`#${RENT_FIELD}`);
    await waitFor(() => expect(document.activeElement).toBe(rent()[0]));
    expect(rent()).toHaveLength(1);
    expect(
      nowCard().querySelector("[data-renewal-owner-facts]")!.contains(rent()[0]!),
    ).toBe(true);
    expect(nowCard()).toHaveAttribute("data-renewal-now-step", "ask-owner");
    await user.clear(rent()[0]!);
    await user.type(rent()[0]!, "1425");
    // One editor at every point; the typed value follows it to Full view and back.
    await user.click(viewButton("Full view"));
    await settle();
    expect(rent()).toHaveLength(1);
    expect(rent()[0]!.closest("#renewal-section-comps")).not.toBeNull();
    expect(rent()[0]!.value).toBe("1425");
    await user.click(viewButton("Full view"));
    await settle();
    expect(rent()).toHaveLength(1);
    expect(nowCard()).toContainElement(rent()[0]!);
    expect(rent()[0]!.value).toBe("1425");
    // Save with Enter: the one save path, then focus on the primary action.
    rent()[0]!.focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(
        fake
          .writes()
          .filter((call) => call.url.startsWith("/api/lease-renewal/working-record")),
      ).toHaveLength(1),
    );
    const save = fake
      .writes()
      .find((call) => call.url.startsWith("/api/lease-renewal/working-record"))!;
    expect(save.body).toMatchObject({ value: 1425 });
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById("renewal-now-primary")),
    );
    await waitFor(() =>
      expect(
        nowCard().querySelector('[data-renewal-field="owner-recommended-rent"]'),
      ).toHaveTextContent("$1,425"),
    );
    expect(rent()).toHaveLength(0);
  });

  it("AC-S281-7: in Full view Edit lands on the one editor in Market rent comparison and offers the way back to Owner approval", async () => {
    await open({ step: "ask-owner" });
    const user = userEvent.setup();
    await user.click(viewButton("Full view"));
    await settle();
    const owner = document.getElementById("renewal-section-owner")!;
    const link = within(owner).getByRole("link", { name: "Edit rent to recommend" });
    link.focus();
    await user.click(link);
    await settle();
    const editor = document.getElementById(RENT_FIELD)!;
    expect(editor.closest("#renewal-section-comps")).not.toBeNull();
    expect(document.activeElement).toBe(editor);
    const back = await screen.findByRole("button", { name: "Return to owner approval" });
    await user.click(back);
    await waitFor(() => expect(owner.contains(document.activeElement)).toBe(true));
    expect(screen.queryByRole("button", { name: "Return to owner approval" })).toBeNull();
  });
});

describe("S281 named groups on the lease (R-S281-12)", { timeout: 120_000 }, () => {
  it("BEH-S281-9 / AC-S281-8: Ask the owner and Offer the tenant show Message, Other ways to send and their record group in order under the primary", async () => {
    const fake = await open();
    for (const [label, record] of [
      [RENEWAL_PATH_LABELS["ask-owner"], "Outreach record"],
      [RENEWAL_PATH_LABELS["offer-tenant"], "Record of contact"],
    ] as const) {
      await choose(label);
      const card = nowCard();
      const groups = visibleGroups(card);
      expect(groups.map(summaryText), label).toEqual([
        "Message",
        "Other ways to send",
        record,
      ]);
      const primary = card.querySelector("[data-renewal-now-primary]");
      for (const group of groups) {
        if (primary) expect(follows(primary, group)).toBe(true);
        if (group.open) expect(group).toHaveAttribute("data-renewal-promoted");
      }
    }
    expect(fake.writes()).toEqual([]);
  });
});

describe(
  "S281 the address names the step shown (R-S281-13)",
  { timeout: 120_000 },
  () => {
    it("ARCH-S281-6 / BEH-S281-10 / AC-S281-9: a selection and a return replace the step in place, with no new history entry", async () => {
      await open();
      const length = window.history.length;
      const step = () => new URL(window.location.href).searchParams.get("step");
      await choose(RENEWAL_PATH_LABELS["offer-tenant"]);
      expect(step()).toBe("offer-tenant");
      await choose(RENEWAL_PATH_LABELS["ask-owner"]);
      expect(step()).toBe("ask-owner");
      await userEvent
        .setup()
        .click(within(nowCard()).getByRole("button", { name: "Show current step" }));
      await settle();
      const current = nowCard().getAttribute("data-renewal-now-step");
      expect(step()).toBe(current);
      expect(window.history.length).toBe(length);
    });

    it("AC-S281-9: a followed advance names the new step in place", async () => {
      const state = manualFixture({
        owner: "approved_terms",
        tenant: "accepted",
        done: ["owner_outreach", "tenant_offer", "information_form"],
      });
      await open({ state, step: "offer-tenant" });
      const length = window.history.length;
      expect(nowCard()).toHaveAttribute("data-renewal-now-step", "offer-tenant");
      const form = document.getElementById("renewal-manual-form_returned")!;
      await userEvent.setup().selectOptions(within(form).getByRole("combobox"), "done");
      await waitFor(() =>
        expect(nowCard()).toHaveAttribute("data-renewal-now-step", "documents"),
      );
      await waitFor(() =>
        expect(new URL(window.location.href).searchParams.get("step")).toBe("documents"),
      );
      expect(window.history.length).toBe(length);
    });
  },
);

describe("S281 renewal dates on the offer (R-S281-14)", { timeout: 120_000 }, () => {
  it("BEH-S281-11 / AC-S281-10: Enter renewal start date opens the one Working renewal terms editor in place on the offer, focused on the start", async () => {
    const fake = await open({ step: "offer-tenant" });
    expect(nowCard()).toHaveAttribute("data-renewal-now-step", "offer-tenant");
    const enter = within(nowCard()).getByRole("button", {
      name: "Enter renewal start date",
    });
    await userEvent.setup().click(enter);
    await settle();
    expect(nowCard()).toHaveAttribute("data-renewal-now-step", "offer-tenant");
    const inPlace = nowCard().querySelector("[data-renewal-working-terms-in-place]")!;
    expect(inPlace).not.toBeNull();
    await waitFor(() =>
      expect(
        document.getElementById(WORKING_START_FIELD_ID)!.contains(document.activeElement),
      ).toBe(true),
    );
    // One editor on the page: Ask the owner's reveal mounts none meanwhile.
    expect(document.querySelectorAll(`#${WORKING_START_FIELD_ID}`)).toHaveLength(1);
    expect(document.querySelectorAll(`#${WORKING_END_FIELD_ID}`)).toHaveLength(1);
    expect(document.querySelector("details[data-renewal-working-terms]")).toBeNull();
    expect(inPlace).toContainElement(document.getElementById(WORKING_END_FIELD_ID));
    expect(fake.writes()).toEqual([]);
  });
});

describe("S281 a manual record in view (R-S281-4)", { timeout: 120_000 }, () => {
  it("AC-S281-4: after preparation, the Documents primary opens delivery even when a packet input is visible", async () => {
    await open({
      state: manualFixture({
        owner: "approved_terms",
        tenant: "accepted",
        done: [
          "owner_outreach",
          "tenant_offer",
          "information_form",
          "form_returned",
          "documents",
        ],
      }),
      step: "documents",
      packetLeadPanel: (
        <div data-packet-lead="packet_input">
          <button type="button">Review packet inputs</button>
        </div>
      ),
    });
    await userEvent
      .setup()
      .click(
        within(nowCard()).getByRole("button", { name: "Deliver the required documents" }),
      );
    const delivery = document.getElementById("renewal-manual-document_delivery");
    await waitFor(() => expect(delivery?.contains(document.activeElement)).toBe(true));
  });

  it("BEH-S281-4 / AC-S281-4: Send the renewal information form lands on its status control in an open group; saving it moves focus to the next action", async () => {
    const state = manualFixture({
      owner: "approved_terms",
      tenant: "accepted",
      done: ["owner_outreach", "tenant_offer"],
    });
    const fake = await open({ state, step: "offer-tenant" });
    const primary = within(nowCard()).getByRole("button", {
      name: "Send the renewal information form",
    });
    const user = userEvent.setup();
    await user.click(primary);
    await settle();
    const control = document.getElementById("renewal-manual-information_form")!;
    await waitFor(() => expect(control.contains(document.activeElement)).toBe(true));
    // The group that holds it is open as current work.
    const group = control.closest<HTMLDetailsElement>(
      "details[data-renewal-secondary-work]",
    );
    if (group) {
      expect(group.open).toBe(true);
      expect(group).toHaveAttribute("data-renewal-promoted");
    }
    await user.selectOptions(within(control).getByRole("combobox"), "done");
    await waitFor(() =>
      expect(JSON.stringify(fake.writes())).toContain("information_form"),
    );
    await waitFor(() =>
      expect(
        document.activeElement === document.getElementById("renewal-now-primary") ||
          document.activeElement === document.getElementById("renewal-now-heading"),
      ).toBe(true),
    );
  });
});

describe("S281 landing and return (R-S281-5)", { timeout: 120_000 }, () => {
  it("BEH-S281-5: Return to tenant offer lands on the Offer step's primary when its earlier landing is gone", async () => {
    await open({ step: "ask-owner" });
    act(() => {
      startDateFixFromOffer("renewalStartDate", "renewal-landing-that-is-gone");
    });
    await settle();
    const back = await screen.findByRole("button", { name: "Return to tenant offer" });
    await userEvent.setup().click(back);
    await settle();
    expect(nowCard()).toHaveAttribute("data-renewal-now-step", "offer-tenant");
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById("renewal-now-primary")),
    );
  });
});
