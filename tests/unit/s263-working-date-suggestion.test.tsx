// @vitest-environment jsdom
// S263 R-S263-1..4 (BEH-S263-1, BEH-S263-3, BEH-S263-4, AC-S263-1, AC-S263-3, AC-S263-4): Working
// renewal terms shows the verified current lease end and, for an eligible fixed term with an
// empty start, "Use the day after the current lease ends". Showing it saves nothing; choosing it
// saves that date with its basis for the server to check. A date fix opened from the tenant offer
// can return there. Only the HTTP seam is simulated. Synthetic dates only.
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CurrentLeaseEndFact,
  RenewalEndDateCheck,
  RenewalEndSuggestion,
  RenewalLeaseEndProvider,
  RenewalStartSuggestion,
  ReturnToTenantOffer,
  WORKING_START_CONTROL_ID,
  finishDateFix,
  startDateFixFromOffer,
  type RenewalLeaseEndFacts,
} from "@/components/lease-renewal/RenewalDateProposal";
import {
  RENEWAL_FOCUS_REQUEST_EVENT,
  RENEWAL_STEP_PRIMARY_REQUEST_EVENT,
} from "@/components/lease-renewal/RenewalDashboardNavigation";
import {
  RenewalWorkingRecordProvider,
  WorkingDateField,
} from "@/components/lease-renewal/RenewalWorkingRecord";
import { verifiedLeaseEnd } from "@/lib/lease-renewal/renewal-date-proposal";
import type {
  RenewalWorkingRecord,
  WorkingFieldEntry,
} from "@/lib/lease-renewal/working-record";

const LEASE = "701";
const CYCLE = "0f1c8f6e-6d1c-4bd3-9d7a-00000000000a";

function entry(value: string, revision: number): WorkingFieldEntry {
  return {
    value,
    revision,
    eventId: `0f1c8f6e-6d1c-4bd3-9d7a-00000000030${revision}`,
    recordedAt: "2026-10-02T15:00:00.000Z",
    recordedByUid: "editor-1",
    recordedByLabel: "editor1@pmikcmetro.com",
    origin: "staff_entry",
    cycleId: CYCLE,
  };
}

function working(
  fields: Record<string, WorkingFieldEntry> = {},
  revision = 2,
): RenewalWorkingRecord {
  return {
    schemaVersion: "renewal-working-record/v1",
    leaseId: LEASE,
    revision,
    fields,
    cycle: { cycleId: CYCLE, held: {} },
  };
}

const ELIGIBLE: RenewalLeaseEndFacts = {
  leaseEnd: verifiedLeaseEnd({ rentvineEndIso: "2026-11-30", sourceReadable: true }),
  term: "fixed_term",
  nonRenewal: false,
};

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  act(() => finishDateFix());
});

function renderTerms(
  facts: RenewalLeaseEndFacts | null = ELIGIBLE,
  record: RenewalWorkingRecord = working(),
) {
  return render(
    <RenewalLeaseEndProvider value={facts}>
      <RenewalWorkingRecordProvider canEdit initialRecord={record} leaseId={LEASE}>
        <ReturnToTenantOffer />
        <CurrentLeaseEndFact />
        <WorkingDateField
          controlId={WORKING_START_CONTROL_ID}
          field="terms_effective_date"
          label="Working effective date"
        >
          <RenewalStartSuggestion />
        </WorkingDateField>
        <WorkingDateField field="terms_end_date" label="Working term end date">
          {/* S285 R-S285-1: the editor now offers end choices beside manual entry. */}
          <RenewalEndSuggestion />
          <RenewalEndDateCheck />
        </WorkingDateField>
      </RenewalWorkingRecordProvider>
    </RenewalLeaseEndProvider>,
  );
}

const USE_DAY_AFTER = "Use the day after the current lease ends";

describe("AC-S263-1 the next-day start in Working renewal terms", () => {
  it("BEH-S263-1: shows the verified end and the next day, saves nothing until chosen, then saves that date with its basis", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        record: working({ terms_effective_date: entry("2026-12-01", 1) }, 3),
      }),
    );
    renderTerms();
    expect(screen.getByText(/Current lease ends:/)).toHaveTextContent(
      "Current lease ends: 11/30/2026 (RentVine).",
    );
    expect(
      screen.getByText(
        "Suggested start: 12/01/2026, the day after the current lease ends on 11/30/2026. Choose it, or enter the start date.",
      ),
    ).toBeInTheDocument();
    // Loading the suggestion fills nothing and saves nothing.
    expect(screen.getByLabelText("Working effective date")).toHaveValue("");
    expect(fetchMock).not.toHaveBeenCalled();
    // The fix target is the field itself.
    expect(document.getElementById(WORKING_START_CONTROL_ID)).toContainElement(
      screen.getByLabelText("Working effective date"),
    );
    fireEvent.click(screen.getByRole("button", { name: USE_DAY_AFTER }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    expect(body).toMatchObject({
      leaseId: LEASE,
      field: "terms_effective_date",
      value: "2026-12-01",
      expectedRevision: 0,
      expectedCycleId: CYCLE,
      dateProposal: { kind: "day_after_lease_end", leaseEndIso: "2026-11-30" },
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: USE_DAY_AFTER })).toBeNull(),
    );
    expect(screen.getByLabelText("Working effective date")).toHaveValue("2026-12-01");
  });

  it("AC-S263-1: month to month, a non-renewal, a saved start or an unverified end get no suggestion", () => {
    const cases: Array<[RenewalLeaseEndFacts, RenewalWorkingRecord]> = [
      [{ ...ELIGIBLE, term: "month_to_month" }, working()],
      [{ ...ELIGIBLE, term: "needs_review" }, working()],
      [{ ...ELIGIBLE, nonRenewal: true }, working()],
      [ELIGIBLE, working({ terms_effective_date: entry("2026-12-15", 1) })],
      [
        {
          ...ELIGIBLE,
          leaseEnd: verifiedLeaseEnd({
            rentvineEndIso: "2027-11-30",
            sourceReadable: true,
            recordedLeaseEndIso: "2026-11-30",
          }),
        },
        working(),
      ],
    ];
    for (const [facts, record] of cases) {
      const view = renderTerms(facts, record);
      expect(screen.queryByRole("button", { name: USE_DAY_AFTER })).toBeNull();
      expect(screen.queryByText(/Suggested start/)).toBeNull();
      view.unmount();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-S263-4: an unverified current lease end names its problem and offers Verify current lease end", () => {
    const requested: string[] = [];
    const listener = (event: Event) =>
      requested.push((event as CustomEvent<{ id: string }>).detail.id);
    document.addEventListener(RENEWAL_FOCUS_REQUEST_EVENT, listener);
    renderTerms({
      ...ELIGIBLE,
      leaseEnd: verifiedLeaseEnd({ rentvineEndIso: "2026-11-30", sourceReadable: false }),
    });
    expect(screen.getByText(/Current lease end is not verified/)).toHaveTextContent(
      "Refresh the lease to verify the current lease end.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Verify current lease end" }));
    document.removeEventListener(RENEWAL_FOCUS_REQUEST_EVENT, listener);
    expect(requested).toEqual(["renewal-correct-a-fact"]);
  });

  // Rewritten on purpose for S285 R-S285-1: an end is now offered as a term staff choose, but only
  // while the current-cycle end is empty. A saved end always wins and is never changed for staff.
  it("R-S263-2/3 (as amended by R-S285-1): a saved end offers no end choice, and a saved end that is not after the start is shown for review", () => {
    renderTerms(
      ELIGIBLE,
      working({
        terms_effective_date: entry("2026-12-01", 1),
        terms_end_date: entry("2026-11-30", 1),
      }),
    );
    expect(
      screen.getByText(
        "The saved renewal end date is not after the start date. Review the end date.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Suggested end/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Use a 12 month term/ })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("AC-S263-4 Return to tenant offer", () => {
  it("BEH-S263-4: a date fix opened from Offer the tenant offers the way back, and only then", () => {
    renderTerms();
    expect(screen.queryByRole("button", { name: "Return to tenant offer" })).toBeNull();
    // The offer's readiness control the fix started from is still on the page.
    const landing = document.createElement("div");
    landing.id = "renewal-message-tenant-readiness";
    document.body.append(landing);
    act(() =>
      startDateFixFromOffer("renewalStartDate", "renewal-message-tenant-readiness"),
    );
    const requested: string[] = [];
    const listener = (event: Event) =>
      requested.push((event as CustomEvent<{ id: string }>).detail.id);
    document.addEventListener(RENEWAL_FOCUS_REQUEST_EVENT, listener);
    fireEvent.click(screen.getByRole("button", { name: "Return to tenant offer" }));
    document.removeEventListener(RENEWAL_FOCUS_REQUEST_EVENT, listener);
    landing.remove();
    expect(requested).toEqual(["renewal-message-tenant-readiness"]);
    expect(screen.queryByRole("button", { name: "Return to tenant offer" })).toBeNull();
  });

  // Rewritten on purpose for S281 R-S281-5: when the earlier landing element is absent, the
  // return lands on the Offer step's primary action instead.
  it("R-S281-5: with its landing element gone, the return asks for the Offer step's primary action", () => {
    renderTerms();
    act(() =>
      startDateFixFromOffer("renewalStartDate", "renewal-message-tenant-readiness"),
    );
    const focusRequests: string[] = [];
    const stepRequests: string[] = [];
    const onFocus = (event: Event) =>
      focusRequests.push((event as CustomEvent<{ id: string }>).detail.id);
    const onStep = (event: Event) =>
      stepRequests.push((event as CustomEvent<{ stepId: string }>).detail.stepId);
    document.addEventListener(RENEWAL_FOCUS_REQUEST_EVENT, onFocus);
    document.addEventListener(RENEWAL_STEP_PRIMARY_REQUEST_EVENT, onStep);
    fireEvent.click(screen.getByRole("button", { name: "Return to tenant offer" }));
    document.removeEventListener(RENEWAL_FOCUS_REQUEST_EVENT, onFocus);
    document.removeEventListener(RENEWAL_STEP_PRIMARY_REQUEST_EVENT, onStep);
    expect(stepRequests).toEqual(["offer-tenant"]);
    expect(focusRequests).not.toContain("renewal-message-tenant-readiness");
    expect(screen.queryByRole("button", { name: "Return to tenant offer" })).toBeNull();
  });
});
