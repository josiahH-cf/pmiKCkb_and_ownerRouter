// @vitest-environment jsdom

// S276 ARCH-S276-1, BEH-S276-1, BEH-S276-4, BEH-S276-5, AC-S276-1 and AC-S276-5 on the mounted
// tenant response form (Guided and Full render this one form): choosing a response sends no
// request; the review names the response, the offer it answers from the current offer snapshot
// and what follows; Cancel keeps the earlier response; Save sends exactly one request. A pause
// that could not be written reads "Reminders are still scheduled." with "Stop them", which pauses
// through the workspace route and records nothing. No note, checkbox or attestation is required.
// Synthetic values only; no provider request.
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  RenewalManualProvider,
  RenewalManualSection,
} from "@/components/lease-renewal/RenewalManualWorkspace";
import {
  RenewalNowCardProvider,
  useRenewalNowCard,
} from "@/components/lease-renewal/RenewalNowCardContext";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import type { OfferAnswersView } from "@/lib/lease-renewal/offer-answers";
import type { TenantReminderStop } from "@/lib/gmail-hub/tenant-response-hold";
import { SYNTHETIC_APPROVAL } from "../helpers/owner-approval";

const LEASE = "9276";
const CYCLE = "b4bc3b81-c402-4f62-a2e2-c605c6789276";
const META = { actorUid: "synthetic-s276-staff", recordedAt: "2026-11-12T18:00:00.000Z" };
let event = 0;
const apply = (state: RenewalWorkspaceState, action: RenewalWorkspaceAction) =>
  planRenewalWorkspaceAction(state, action, { ...META, eventId: `e${++event}` });

/** The tenant offer is delivered and the owner approved; the tenant has not answered yet. */
function offerDelivered(): RenewalWorkspaceState {
  let state = emptyRenewalWorkspace(LEASE, CYCLE, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
  state = apply(state, { kind: "activity", activity: "owner_outreach", outcome: "done" });
  state = apply(state, {
    kind: "owner_response",
    outcome: "approved_terms",
    approval: SYNTHETIC_APPROVAL,
  });
  state = apply(state, { kind: "activity", activity: "tenant_offer", outcome: "done" });
  return state;
}

const VIEW: OfferAnswersView = {
  current: {
    snapshotId: `offer:${LEASE}:${CYCLE}:aaaa`,
    snapshotHash: "a".repeat(64),
    summary: "Rent $1,450.00 per month; Pet rent $35.00 per month",
    charged: true,
    terms: {
      rent: 1450,
      effectiveDate: "2027-01-01",
      endDate: "2027-12-31",
      chargesCents: 3500,
      chargeCount: 1,
    },
  },
  candidates: [
    {
      kind: "linked_communication",
      sequenceId: "sequence-1",
      occurrenceId: "occurrence-1",
      at: "2026-11-12T18:00:00.000Z",
      snapshotId: `offer:${LEASE}:${CYCLE}:aaaa`,
      summary: "Rent $1,450.00 per month; Pet rent $35.00 per month",
      current: true,
    },
  ],
  tenant: null,
  owner: null,
  acceptance: null,
};

/** Stands in for the tenant message read that carries the offer answers view. */
function OfferRead({ view }: { view: OfferAnswersView | null }) {
  const nowCard = useRenewalNowCard();
  const set = nowCard?.setOfferAnswers;
  useEffect(() => {
    set?.({ view, failed: false });
  }, [set, view]);
  return null;
}

let state: RenewalWorkspaceState;
let reminders: TenantReminderStop;
let stopAnswer: TenantReminderStop;
const posts: Array<Record<string, unknown>> = [];

beforeEach(() => {
  posts.length = 0;
  state = offerDelivered();
  reminders = { state: "stopped", paused: 1 };
  stopAnswer = { state: "stopped", paused: 1 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.body) return Response.json({});
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(body);
      if (body.operation === "stop_tenant_reminders")
        return Response.json({ tenantReminders: stopAnswer });
      if (body.operation !== "record") return Response.json({});
      state = planRenewalWorkspaceAction(state, body.action as RenewalWorkspaceAction, {
        ...META,
        eventId: String(body.operationId),
      });
      return Response.json({ state, duplicate: false, tenantReminders: reminders });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(view: OfferAnswersView | null = VIEW) {
  render(
    <RenewalNowCardProvider preparation={null}>
      <OfferRead view={view} />
      <RenewalManualProvider leaseId={LEASE} initialState={state}>
        <RenewalManualSection section="tenant" />
      </RenewalManualProvider>
    </RenewalNowCardProvider>,
  );
  return document.getElementById("renewal-manual-tenant_response")!;
}

const workspacePosts = () => posts.filter((body) => body.operation === "record");

describe("S276 ARCH-S276-1: the tenant response is committed only by its Save", () => {
  it("ARCH-S276-1 / AC-S276-1: changing the select sends no request", async () => {
    const form = mount();
    fireEvent.change(within(form).getByLabelText("Tenant response"), {
      target: { value: "accepted" },
    });
    await act(async () => undefined);
    expect(posts).toHaveLength(0);
    expect(state.tenantResponse ?? null).toBeNull();
  });

  it("BEH-S276-1 / AC-S276-1: the review names the offer amounts and dates and says reminders stop; Save sends one request", async () => {
    const form = mount();
    fireEvent.change(within(form).getByLabelText("Tenant response"), {
      target: { value: "accepted" },
    });
    const review = await within(form).findByRole("region", {
      name: "Review the tenant's response",
    });
    expect(review).toHaveTextContent("Response: Accepted.");
    expect(review).toHaveTextContent(
      "Answers: Rent $1,450.00 per month from 01/01/2027 to 12/31/2027. Selected charges: $35.00 in total.",
    );
    expect(review).toHaveTextContent(
      "Reminders for this offer stop. Next: send the renewal information form.",
    );
    // No required note, checkbox or attestation exists.
    expect(within(review).queryByRole("checkbox")).toBeNull();
    expect(within(form).queryByRole("checkbox")).toBeNull();
    await act(async () =>
      fireEvent.click(within(review).getByRole("button", { name: "Save" })),
    );
    await waitFor(() => expect(workspacePosts()).toHaveLength(1));
    expect(workspacePosts()[0]!.action).toEqual({
      kind: "tenant_response",
      outcome: "accepted",
    });
    await waitFor(() => expect(state.tenantResponse?.outcome).toBe("accepted"));
    await waitFor(() =>
      expect(
        within(form).queryByRole("region", { name: "Review the tenant's response" }),
      ).toBeNull(),
    );
    expect(
      form.querySelector('[data-renewal-field="tenant-reminders-stopped"]'),
    ).toHaveTextContent(
      "Reminders for this offer are stopped. To send them again, resume them in Communications.",
    );
    expect(workspacePosts()).toHaveLength(1);
  });

  it("BEH-S276-1: Cancel keeps the earlier response and sends nothing", async () => {
    state = apply(state, { kind: "tenant_response", outcome: "needs_verification" });
    const form = mount();
    const select = within(form).getByLabelText("Tenant response") as HTMLSelectElement;
    expect(select.value).toBe("needs_verification");
    fireEvent.change(select, { target: { value: "accepted" } });
    const review = await within(form).findByRole("region", {
      name: "Review the tenant's response",
    });
    fireEvent.click(within(review).getByRole("button", { name: "Cancel" }));
    expect(select.value).toBe("needs_verification");
    expect(
      within(form).queryByRole("region", { name: "Review the tenant's response" }),
    ).toBeNull();
    expect(posts).toHaveLength(0);
  });

  it("R-S276-1: with no offer sent from the app the review says so", async () => {
    const form = mount({ ...VIEW, candidates: [] });
    fireEvent.change(within(form).getByLabelText("Tenant response"), {
      target: { value: "declined_nonrenewing" },
    });
    const review = await within(form).findByRole("region", {
      name: "Review the tenant's response",
    });
    expect(review).toHaveTextContent("Answers: No offer has been sent from the app yet.");
    expect(review).toHaveTextContent(
      "Reminders for this offer stop. Next: record the non-renewal handoff.",
    );
  });

  it("R-S276-1: the optional source is saved with the Save, not on leaving the field", async () => {
    const form = mount();
    fireEvent.change(within(form).getByLabelText("Tenant response"), {
      target: { value: "accepted" },
    });
    const sourceField = within(form).getByLabelText(
      "Response source or channel (optional)",
    );
    fireEvent.change(sourceField, { target: { value: "Tenant call" } });
    fireEvent.blur(sourceField);
    await act(async () => undefined);
    expect(posts).toHaveLength(0);
    await act(async () =>
      fireEvent.click(within(form).getByRole("button", { name: "Save" })),
    );
    await waitFor(() => expect(workspacePosts()).toHaveLength(1));
    expect(workspacePosts()[0]!.action).toEqual({
      kind: "tenant_response",
      outcome: "accepted",
      source: "Tenant call",
    });
  });
});

describe("S276 R-S276-3 and R-S276-5 at the form", () => {
  it("BEH-S276-4: a pause that could not be written keeps the response saved and offers Stop them", async () => {
    reminders = { state: "failed", paused: 0 };
    const form = mount();
    fireEvent.change(within(form).getByLabelText("Tenant response"), {
      target: { value: "accepted" },
    });
    await act(async () =>
      fireEvent.click(within(form).getByRole("button", { name: "Save" })),
    );
    await waitFor(() => expect(state.tenantResponse?.outcome).toBe("accepted"));
    await waitFor(() =>
      expect(
        form.querySelector('[data-renewal-field="tenant-reminders-scheduled"]'),
      ).not.toBeNull(),
    );
    const alert = form.querySelector<HTMLElement>(
      '[data-renewal-field="tenant-reminders-scheduled"]',
    )!;
    expect(alert).toHaveTextContent("Reminders are still scheduled.");
    expect(alert).toHaveAttribute("role", "alert");
    await act(async () =>
      fireEvent.click(within(alert).getByRole("button", { name: "Stop them" })),
    );
    await waitFor(() =>
      expect(posts.at(-1)).toEqual({
        operation: "stop_tenant_reminders",
        leaseId: LEASE,
        cycleId: CYCLE,
      }),
    );
    // Stop them records nothing on the work record.
    expect(workspacePosts()).toHaveLength(1);
    await waitFor(() =>
      expect(within(form).queryByText("Reminders are still scheduled.")).toBeNull(),
    );
  });

  it("BEH-S276-5: clearing the response says stopped reminders stay stopped until resumed", async () => {
    state = apply(state, { kind: "tenant_response", outcome: "accepted" });
    const form = mount();
    fireEvent.change(within(form).getByLabelText("Tenant response"), {
      target: { value: "awaiting_response" },
    });
    const review = await within(form).findByRole("region", {
      name: "Review the tenant's response",
    });
    expect(review).toHaveTextContent(
      "Reminders that were stopped stay stopped until you resume them in Communications.",
    );
    expect(review).not.toHaveTextContent("Reminders for this offer stop.");
  });
});
