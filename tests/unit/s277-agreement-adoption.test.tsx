// @vitest-environment jsdom
// S277 R-S277-1 / R-S277-2 (ARCH-S277-1, BEH-S277-1, BEH-S277-2, AC-S277-1, AC-S277-6): on a lease
// covered by a verified standing agreement whose working renewal base is empty, the Pricing basis
// owner shows the agreement's result and one action that adopts it through the one adoption
// writer; "Set renewal base rent" lands on that action, never on the basis choice's first radio.
// Fail-first on the starting state: no control in the Pricing basis owner adopts the agreement
// amount (W12-06), and the hidden "Use policy proposal" is not rendered there. The fetch seam is
// counted: nothing is written until staff choose the action. Synthetic values only.
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lease-renewal/live/desk/lease/9102",
  useSearchParams: () => new URLSearchParams("step=offer-tenant"),
}));

import { focusRenewalDashboardControl } from "@/components/lease-renewal/RenewalDashboardNavigation";
import { RenewalPricingForLease } from "@/components/lease-renewal/RenewalPricingForLease";
import {
  RenewalPricingPolicyPanel,
  RenewalPricingPolicyProvider,
} from "@/components/lease-renewal/RenewalPricingPolicy";
import { WorkingBaseBasisLine } from "@/components/lease-renewal/RenewalRentBasis";
import { RenewalWorkingRecordProvider } from "@/components/lease-renewal/RenewalWorkingRecord";
import {
  STANDING_ADOPTION_CONTROL_ID,
  adoptedStandingRule,
  standingAdoptionSave,
} from "@/lib/lease-renewal/standing-agreement";
import type {
  RenewalWorkingRecord,
  WorkingFieldEntry,
} from "@/lib/lease-renewal/working-record";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import { renderWorkspace, stubRenewalRoutes } from "@/tests/helpers/focus-workspace";
import { jsonResponse } from "@/tests/helpers/rent-charge-fixtures";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

const LEASE = "9102";
const CYCLE = "0f1c8f6e-6d1c-4bd3-9d7a-00000000000a";
const AGREEMENT_ID = "6a1f3c2e-5b4d-4e8f-9a7b-1c2d3e4f5a6b";
const POLICY_ID = "5d3f8275-0f4f-4c5c-909b-23103711c953";
const AGREEMENT = "Example Standing Agreement";
const ADOPT = "Use $1,751.00 from the agreement";
const RULE_BASIS = `${AGREEMENT}: raise the current rent by 3 percent, applied to the current rent of $1,700.00 and rounded to $1,751. The owner pre-approved renewals at this rule.`;

const policy = {
  id: POLICY_ID,
  name: "Synthetic three percent",
  kind: "percentage",
  value: 3,
  effectiveFrom: "2026-01-01",
  effectiveThrough: null,
  enabled: true,
  purpose: "Synthetic rule for the rehearsal.",
  version: 1,
  updatedByUid: "admin-1",
  updatedAt: "2026-01-01T15:00:00.000Z",
};
const agreement = {
  id: AGREEMENT_ID,
  name: AGREEMENT,
  policyId: POLICY_ID,
  portfolioId: "42",
  preApprovalStatement: "The owner pre-approves renewals at this rule.",
  effectiveFrom: "2026-01-01",
  endsOn: null,
  agreedBy: "Example Owner",
  agreedHow: "in writing",
  agreedWhen: "January 2026",
  revoked: false,
  version: 1,
  recordedByUid: "admin-1",
  recordedAt: "2026-01-02T15:00:00.000Z",
};
const COVERED = {
  covered: true,
  kind: "standing",
  reason: `Covered by ${AGREEMENT}: no owner message needed. Raise the current rent by 3 percent under the owner's pre-approval, in effect since 01/01/2026.`,
  agreementId: AGREEMENT_ID,
  agreementVersion: 1,
  label: AGREEMENT,
  rule: "Raise the current rent by 3 percent",
  amount: 1751,
  basis: RULE_BASIS,
  effectiveFrom: "2026-01-01",
  policyId: POLICY_ID,
  policyVersion: 1,
  appliedScope: "lease",
};

function pricing(
  authority: Record<string, unknown> = COVERED,
  workingRevision = 0,
): Record<string, unknown> {
  return {
    policies: [policy],
    cursor: null,
    policy,
    proposal: {
      policyId: POLICY_ID,
      policyVersion: 1,
      policyName: policy.name,
      currentRent: 1700,
      amount: 1751,
      reason: "Synthetic three percent v1: $1700.00 current rent, +3%, rounded to $1751.",
      effective: true,
    },
    authority,
    assignment: null,
    leaseAssignment: null,
    portfolioAssignment: null,
    policyChanged: false,
    prefill: null,
    workingRevision,
    manualRevision: 0,
    standingAgreement: agreement,
    basisChoice: { kind: "agreement", agreementId: AGREEMENT_ID },
    basisScope: "lease",
    standingAgreements: [
      {
        ...agreement,
        rule: "Raise the current rent by 3 percent",
        ruleVersion: 1,
        active: true,
      },
    ],
    source: { portfolioId: "42", currentRent: 1700 },
  };
}

function storedEntry(
  value: number,
  extra: Partial<WorkingFieldEntry> = {},
): WorkingFieldEntry {
  return {
    value,
    revision: 1,
    eventId: "0f1c8f6e-6d1c-4bd3-9d7a-000000000101",
    recordedAt: "2026-11-12T18:00:00.000Z",
    recordedByUid: "editor-1",
    recordedByLabel: "editor1@pmikcmetro.com",
    origin: "staff_entry",
    cycleId: CYCLE,
    ...extra,
  };
}

function record(
  fields: Record<string, WorkingFieldEntry>,
  revision = 1,
): RenewalWorkingRecord {
  return {
    schemaVersion: "renewal-working-record/v1",
    leaseId: LEASE,
    revision,
    fields,
    cycle: { cycleId: CYCLE, held: {} },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let pricingPayload: Record<string, unknown>;
let postStatus = 200;

beforeEach(() => {
  pricingPayload = pricing();
  postStatus = 200;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith("/api/lease-renewal/pricing-policy"))
      return jsonResponse(200, pricingPayload);
    if (String(url).startsWith("/api/lease-renewal/working-record")) {
      if (init?.method !== "POST") return jsonResponse(200, { record: null });
      if (postStatus !== 200)
        return jsonResponse(postStatus, {
          error:
            "The working renewal rent changed since this page read it. Review the current value.",
        });
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return jsonResponse(200, {
        record: record({
          terms_rent: storedEntry(body.value as number, {
            origin: body.origin as WorkingFieldEntry["origin"],
            sourceLabel: body.sourceLabel as string,
            context: body.context as string,
          }),
        }),
      });
    }
    throw new Error(`Unexpected request ${String(url)}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function posts() {
  return fetchMock.mock.calls.filter(
    (call) => (call[1] as RequestInit)?.method === "POST",
  );
}

function renderLease(initial: RenewalWorkingRecord | null = null) {
  return render(
    <RenewalWorkingRecordProvider canEdit initialRecord={initial} leaseId={LEASE}>
      <RenewalPricingPolicyProvider
        canEdit
        leaseId={LEASE}
        workingRevision={initial?.revision ?? 0}
      >
        <RenewalPricingPolicyPanel />
        <section aria-label="Offer step">
          <WorkingBaseBasisLine field="renewal-base-rent-basis" />
        </section>
      </RenewalPricingPolicyProvider>
    </RenewalWorkingRecordProvider>,
  );
}

describe("AC-S277-1 adopt the agreement amount where the fix lands", () => {
  it("follows and returns from the adoption while the covered owner step stays off the Guided path", async () => {
    const sample = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
    const manual = emptyRenewalWorkspace(LEASE, CYCLE, {
      kind: "lease_end",
      dateIso: "2026-12-31",
      source: "RentVine lease end",
    });
    const fake = stubRenewalRoutes(manual, {
      other({ url }) {
        if (url.startsWith("/api/lease-renewal/pricing-policy"))
          return Response.json(pricing());
        if (url.startsWith("/api/lease-renewal/working-record"))
          return Response.json({ record: null });
        if (url.startsWith("/api/lease-renewal/notice-review"))
          return Response.json({
            disposition: {
              state: "not_initiated",
              label: "No move-out notice recorded.",
            },
            ready: false,
          });
        if (url.startsWith("/api/lease-renewal/notice-timing-basis"))
          return Response.json({
            timingBasis: { state: "missing", record: null },
            canSelect: false,
          });
        return null;
      },
    });
    await renderWorkspace({
      view: "default",
      workspace: {
        ...sample,
        summary: { ...sample.summary, id: LEASE },
        live: {
          leaseId: LEASE,
          ownerDecision: null,
          ownerDecisionCurrent: false,
          ownerOutcome: null,
          ownerResponseRecordable: false,
          tenantOfferDraftId: null,
          tenantOutcome: null,
          processVersion: sample.process.version,
          complete: false,
        },
      },
      manual,
      extra: { selectedStepId: "offer-tenant", workingRecord: null },
    });
    const now = await screen.findByRole("region", { name: /^Now$/ });
    const path = screen.getByRole("navigation", { name: "Renewal path" });
    const ownerStep = () => within(path).queryByRole("button", { name: "Ask the owner" });
    const adoption = () => document.getElementById(STANDING_ADOPTION_CONTROL_ID);
    await waitFor(() => expect(adoption()).not.toBeNull());
    expect(now).toHaveAttribute("data-renewal-now-step", "offer-tenant");
    expect(ownerStep()).toBeNull();
    expect(adoption()).not.toBeVisible();

    // The full workspace keeps inactive controls mounted. Skip the repeated visibility
    // traversal for every button, then assert this exact accessible control is visible.
    const fix = within(now).getByRole("button", {
      name: "Set renewal base rent",
      hidden: true,
    });
    expect(fix).toBeVisible();
    const originalAdoption = adoption();
    const user = userEvent.setup();
    await user.click(fix);
    expect(now).toContainElement(originalAdoption);
    const useAgreement = await within(originalAdoption!).findByRole("button", {
      name: ADOPT,
    });
    expect(useAgreement).toBeVisible();
    expect(adoption()).toBe(originalAdoption);
    expect(adoption()).toContainElement(useAgreement);
    expect(useAgreement).toHaveFocus();
    expect(ownerStep()).toBeNull();
    expect(within(now).queryByRole("group", { name: "Pricing basis" })).toBeNull();

    await user.click(within(now).getByRole("button", { name: "Return to tenant offer" }));
    await waitFor(() => expect(fix).toHaveFocus());
    expect(adoption()).not.toBeVisible();
    expect(now).toHaveAttribute("data-renewal-now-step", "offer-tenant");
    expect(fake.writes()).toEqual([]);
  });

  it("ARCH-S277-1: the Pricing basis owner of a covered lease with an empty base holds the adoption action and the agreement's result", async () => {
    renderLease();
    const owner = screen.getByRole("region", { name: "Renewal pricing policy" });
    const action = await within(owner).findByRole("button", { name: ADOPT });
    expect(document.getElementById(STANDING_ADOPTION_CONTROL_ID)).toContainElement(
      action,
    );
    expect(
      within(owner).getByText(
        "Example Standing Agreement gives $1,751.00 (3 percent on $1,700.00).",
      ),
    ).toBeInTheDocument();
    // No second amount editor: the action is a button, and the owner holds no amount field.
    expect(within(owner).queryByRole("textbox", { name: /rent/i })).toBeNull();
    // AC-S277-6: opening the lease writes nothing.
    expect(posts()).toHaveLength(0);
  });

  it("AC-S277-1: following the fix's target focuses the adoption action, never Owner decides each renewal", async () => {
    renderLease();
    const action = await screen.findByRole("button", { name: ADOPT });
    expect(screen.getByRole("radio", { name: "Owner decides each renewal" })).not.toBe(
      document.activeElement,
    );
    expect(focusRenewalDashboardControl(STANDING_ADOPTION_CONTROL_ID)).toBe(true);
    expect(document.activeElement).toBe(action);
    expect(document.activeElement).not.toBe(
      screen.getByRole("radio", { name: "Owner decides each renewal" }),
    );
  });

  it("BEH-S277-1: one click saves the agreement amount with the agreement and policy version as its stored basis, and the basis reads the agreement's name", async () => {
    renderLease();
    fireEvent.click(await screen.findByRole("button", { name: ADOPT }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    const body = JSON.parse(String((posts()[0]![1] as RequestInit).body)) as Record<
      string,
      unknown
    >;
    const expected = standingAdoptionSave({
      agreementId: AGREEMENT_ID,
      agreementName: AGREEMENT,
      policyId: POLICY_ID,
      policyVersion: 1,
      basis: RULE_BASIS,
    });
    expect(body).toMatchObject({
      leaseId: LEASE,
      field: "terms_rent",
      value: 1751,
      expectedRevision: 0,
      origin: "adopted_source",
      sourceLabel: expected.sourceLabel,
      context: expected.context,
    });
    expect(
      adoptedStandingRule({ origin: "adopted_source", context: String(body.context) }),
    ).toEqual({ agreementId: AGREEMENT_ID, policyId: POLICY_ID, policyVersion: 1 });
    // Readback: the stored base reads the agreement's name, and the action is gone.
    expect(
      await screen.findByText("$1,751.00 from Example Standing Agreement."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "$1,751.00 from Example Standing Agreement is the renewal base rent. Nothing was sent and no RentVine rent changed.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ADOPT })).toBeNull();
    expect(posts()).toHaveLength(1);
  });

  it("AC-S277-1: a stale read refuses the adoption with the existing recovery and keeps the action", async () => {
    postStatus = 409;
    renderLease();
    fireEvent.click(await screen.findByRole("button", { name: ADOPT }));
    expect(
      await screen.findByText(/changed since this page read it/),
    ).toBeInTheDocument();
    // The existing recovery reads the current record again.
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (call) =>
            String(call[0]).startsWith("/api/lease-renewal/working-record?") &&
            !(call[1] as RequestInit | undefined)?.method,
        ),
      ).toBe(true),
    );
    expect(screen.getByRole("button", { name: ADOPT })).toBeInTheDocument();
  });
});

// W12-06 on the rehearsal: the lease page's pricing read follows the working record's revision
// (RenewalPricingForLease), so every save starts a new read and the panel shows "Reading the
// current policy and agreement." until it answers. What the click did must survive that read.
describe("AC-S277-1 the adoption's outcome survives the pricing read a save starts", () => {
  let stored: RenewalWorkingRecord | null;
  let conflictWith: RenewalWorkingRecord | null;
  const CONFLICT =
    "Another operator changed this value. Your entry is kept; review the current value before saving again.";

  beforeEach(() => {
    stored = null;
    conflictWith = null;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/lease-renewal/pricing-policy"))
        return jsonResponse(
          200,
          pricing(
            typeof stored?.fields.terms_rent?.value === "number" &&
              stored.fields.terms_rent.value !== 1751
              ? { ...COVERED, covered: false }
              : COVERED,
            stored?.revision ?? 0,
          ),
        );
      if (String(url).startsWith("/api/lease-renewal/working-record")) {
        if (init?.method !== "POST") return jsonResponse(200, { record: stored });
        if (conflictWith) {
          // Another operator saved the base after this page read it.
          stored = conflictWith;
          return jsonResponse(409, { error: CONFLICT });
        }
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        stored = record({
          terms_rent: storedEntry(body.value as number, {
            origin: body.origin as WorkingFieldEntry["origin"],
            sourceLabel: body.sourceLabel as string,
            context: body.context as string,
          }),
        });
        return jsonResponse(200, { record: stored });
      }
      throw new Error(`Unexpected request ${String(url)}`);
    });
  });

  function renderLivePage() {
    return render(
      <RenewalWorkingRecordProvider canEdit initialRecord={null} leaseId={LEASE}>
        <RenewalPricingForLease canEdit leaseId={LEASE} live>
          <RenewalPricingPolicyPanel />
        </RenewalPricingForLease>
      </RenewalWorkingRecordProvider>,
    );
  }
  const pricingReads = () =>
    fetchMock.mock.calls.filter((call) =>
      String(call[0]).startsWith("/api/lease-renewal/pricing-policy"),
    ).length;

  it("BEH-S277-1: the saved line stays after the pricing read follows the new revision", async () => {
    renderLivePage();
    fireEvent.click(await screen.findByRole("button", { name: ADOPT }));
    await waitFor(() => expect(pricingReads()).toBeGreaterThanOrEqual(2));
    expect(
      await screen.findByText(
        "$1,751.00 from Example Standing Agreement is the renewal base rent. Nothing was sent and no RentVine rent changed.",
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Reading the current policy and agreement.")).toBeNull(),
    );
    expect(
      screen.getByText(
        "$1,751.00 from Example Standing Agreement is the renewal base rent. Nothing was sent and no RentVine rent changed.",
      ),
    ).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
  });

  it("AC-S277-1: a stale read keeps the existing recovery shown once the record is read again", async () => {
    conflictWith = record({ terms_rent: storedEntry(1760) });
    renderLivePage();
    fireEvent.click(await screen.findByRole("button", { name: ADOPT }));
    // The recovery reads the current record again: another operator's amount holds the base.
    await waitFor(() => expect(pricingReads()).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(screen.queryByRole("button", { name: ADOPT })).toBeNull());
    const recovery = await screen.findByText(/Changed elsewhere\./);
    expect(recovery).toHaveTextContent(CONFLICT);
    expect(document.getElementById(STANDING_ADOPTION_CONTROL_ID)).toContainElement(
      recovery,
    );
    // No retry is offered: nothing can be adopted while another amount holds the base.
    expect(screen.queryByRole("button", { name: "Save my entry" })).toBeNull();
    expect(posts()).toHaveLength(1);
  });
});

describe("R-S277-1 / BEH-S277-2 a typed amount still wins", () => {
  it("BEH-S277-2: a typed $1,760 on a lease whose agreement gives $1,751 offers no adoption and names both amounts", async () => {
    const typed = record({ terms_rent: storedEntry(1760) }, 3);
    pricingPayload = pricing(
      {
        covered: false,
        kind: "standing",
        reason: `The working rent $1,760.00 differs from $1,751.00 under ${AGREEMENT}, so the owner decides this renewal.`,
        label: AGREEMENT,
        rule: "Raise the current rent by 3 percent",
        amount: 1751,
        agreementId: AGREEMENT_ID,
        appliedScope: "lease",
      },
      3,
    );
    renderLease(typed);
    expect(
      await screen.findByText(
        "$1,760.00 entered by staff; the agreement gives $1,751.00.",
      ),
    ).toBeInTheDocument();
    await screen.findByRole("radio", { name: "Owner decides each renewal" });
    expect(screen.queryByRole("button", { name: /from the agreement/ })).toBeNull();
    expect(posts()).toHaveLength(0);
  });

  it("AC-S277-6: without a verified standing agreement the action is absent and the ordinary path is unchanged", async () => {
    pricingPayload = {
      ...pricing({ covered: false, reason: "Separate owner authority is not recorded." }),
      standingAgreement: null,
      basisChoice: null,
      basisScope: null,
      standingAgreements: [],
    };
    renderLease();
    await screen.findByRole("radio", { name: "Owner decides each renewal" });
    expect(screen.queryByRole("button", { name: /from the agreement/ })).toBeNull();
    expect(document.getElementById(STANDING_ADOPTION_CONTROL_ID)).toBeNull();
    expect(posts()).toHaveLength(0);
  });
});
