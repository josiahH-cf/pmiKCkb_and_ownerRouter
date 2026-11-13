// @vitest-environment jsdom
// S285 R-S285-1 (ARCH-S285-1, BEH-S285-1, AC-S285-1, AC-S285-5): in the one Working renewal terms
// editor, with a start chosen or saved and the current-cycle end empty, "Use a 12 month term (ends
// 12/31/2027)" sits beside manual entry of the end. One click fills the end and the existing save
// stores it with its basis. Opening and closing the editor without a choice stores nothing. A
// February 29 start offers no choice; a changed start recomputes an unsaved choice; a saved end
// stays when the start changes later and the inconsistency is shown. Only the HTTP seam is
// simulated. Synthetic dates only.
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RenewalEndDateCheck,
  RenewalEndSuggestion,
  RenewalLeaseEndProvider,
  RenewalStartSuggestion,
  WORKING_END_CONTROL_ID,
  WORKING_START_CONTROL_ID,
  finishDateFix,
  type RenewalLeaseEndFacts,
} from "@/components/lease-renewal/RenewalDateProposal";
import {
  RenewalWorkingRecordProvider,
  WorkingDateField,
} from "@/components/lease-renewal/RenewalWorkingRecord";
import { verifiedLeaseEnd } from "@/lib/lease-renewal/renewal-date-proposal";
import type {
  RenewalWorkingRecord,
  WorkingFieldEntry,
} from "@/lib/lease-renewal/working-record";

const LEASE = "2851";
const CYCLE = "0f1c8f6e-6d1c-4bd3-9d7a-000000002851";

function entry(value: string, revision: number, context?: string): WorkingFieldEntry {
  return {
    value,
    revision,
    eventId: `0f1c8f6e-6d1c-4bd3-9d7a-00000000040${revision}`,
    recordedAt: "2026-11-12T15:00:00.000Z",
    recordedByUid: "editor-1",
    recordedByLabel: "editor1@pmikcmetro.com",
    origin: "staff_entry",
    cycleId: CYCLE,
    ...(context ? { context } : {}),
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

const FACTS: RenewalLeaseEndFacts = {
  leaseEnd: verifiedLeaseEnd({ rentvineEndIso: "2026-12-31", sourceReadable: true }),
  term: "fixed_term",
  nonRenewal: false,
  currentLease: { startIso: "2026-01-01", endIso: "2026-12-31" },
};

const START_SAVED = working({ terms_effective_date: entry("2027-01-01", 1) });
const USE_12 = "Use a 12 month term (ends 12/31/2027)";

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
  facts: RenewalLeaseEndFacts | null = FACTS,
  record: RenewalWorkingRecord = START_SAVED,
) {
  return render(
    <RenewalLeaseEndProvider value={facts}>
      <RenewalWorkingRecordProvider canEdit initialRecord={record} leaseId={LEASE}>
        <WorkingDateField
          controlId={WORKING_START_CONTROL_ID}
          field="terms_effective_date"
          label="Working effective date"
        >
          <RenewalStartSuggestion />
        </WorkingDateField>
        <WorkingDateField
          controlId={WORKING_END_CONTROL_ID}
          field="terms_end_date"
          label="Working term end date"
        >
          <RenewalEndSuggestion />
          <RenewalEndDateCheck />
        </WorkingDateField>
      </RenewalWorkingRecordProvider>
    </RenewalLeaseEndProvider>,
  );
}

describe("BEH-S285-1 the suggested end date in Working renewal terms", () => {
  it("BEH-S285-1: with 01/01/2027 saved and no end, one click fills the end and the save stores it with its basis", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        record: working(
          {
            terms_effective_date: entry("2027-01-01", 1),
            terms_end_date: entry("2027-12-31", 1, "12 month term chosen by staff"),
          },
          3,
        ),
      }),
    );
    renderTerms();
    // Showing the choice fills nothing and saves nothing.
    expect(screen.getByLabelText("Working term end date")).toHaveValue("");
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: USE_12 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    expect(body).toMatchObject({
      leaseId: LEASE,
      field: "terms_end_date",
      value: "2027-12-31",
      expectedRevision: 0,
      expectedCycleId: CYCLE,
      context: "12 month term chosen by staff",
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Working term end date")).toHaveValue("2027-12-31"),
    );
    // Once an end is saved no choice is offered.
    expect(screen.queryByRole("button", { name: USE_12 })).toBeNull();
    expect(screen.getByText(/12 month term chosen by staff/)).toBeInTheDocument();
  });

  it("AC-S285-1 / AC-S285-5: mounting and unmounting the editor without a choice saves nothing", () => {
    const view = renderTerms();
    expect(screen.getByRole("button", { name: USE_12 })).toBeInTheDocument();
    view.unmount();
    renderTerms().unmount();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-S285-1: a 6 month current lease adds the current length as a second choice", () => {
    renderTerms({
      ...FACTS,
      currentLease: { startIso: "2026-07-01", endIso: "2026-12-31" },
    });
    expect(screen.getByRole("button", { name: USE_12 })).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Use the current lease's length, 6 months (ends 06/30/2027)",
      }),
    ).toBeInTheDocument();
  });

  it("AC-S285-1: a February 29 start offers no choice and the line asks staff to enter the end", () => {
    renderTerms(FACTS, working({ terms_effective_date: entry("2028-02-29", 1) }));
    expect(screen.queryByRole("button", { name: /Use a 12 month term/ })).toBeNull();
    expect(
      screen.getByText(
        "The renewal start falls on a day that does not repeat in the end month. Enter the renewal end date.",
      ),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("R-S285-1: month-to-month, non-renewal and no start show no option", () => {
    const cases: Array<[RenewalLeaseEndFacts, RenewalWorkingRecord]> = [
      [{ ...FACTS, term: "month_to_month" }, START_SAVED],
      [{ ...FACTS, nonRenewal: true }, START_SAVED],
      [FACTS, working()],
    ];
    for (const [facts, record] of cases) {
      const view = renderTerms(facts, record);
      expect(screen.queryByRole("button", { name: /Use a 12 month term/ })).toBeNull();
      view.unmount();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-S285-1: before the start is saved, the offered end follows the start staff chose", () => {
    // The start's own save waits; the choice reads the start as chosen.
    fetchMock.mockReturnValue(new Promise(() => undefined));
    renderTerms(FACTS, working());
    expect(screen.queryByRole("button", { name: /Use a 12 month term/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Working effective date"), {
      target: { value: "2027-02-01" },
    });
    expect(
      screen.getByRole("button", { name: "Use a 12 month term (ends 01/31/2028)" }),
    ).toBeInTheDocument();
  });

  it("AC-S285-1: a chosen end that is not saved yet follows a changed start", async () => {
    // Every save waits: the chosen end stays unsaved while the start changes.
    fetchMock.mockReturnValue(new Promise(() => undefined));
    renderTerms(FACTS, working());
    fireEvent.change(screen.getByLabelText("Working effective date"), {
      target: { value: "2027-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: USE_12 }));
    await waitFor(() =>
      expect(screen.getByLabelText("Working term end date")).toHaveValue("2027-12-31"),
    );
    fireEvent.change(screen.getByLabelText("Working effective date"), {
      target: { value: "2027-03-01" },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Working term end date")).toHaveValue("2028-02-29"),
    );
  });

  it("AC-S285-1: after saving, a changed start leaves the saved end and shows the inconsistency", () => {
    renderTerms(
      FACTS,
      working({
        terms_effective_date: entry("2027-02-01", 2),
        terms_end_date: entry("2027-12-31", 1, "12 month term chosen by staff"),
      }),
    );
    expect(screen.getByLabelText("Working term end date")).toHaveValue("2027-12-31");
    expect(
      screen.getByText(
        "The saved end date was chosen as a 12 month term and no longer matches the start date. Review the end date.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Use a 12 month term/ })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
