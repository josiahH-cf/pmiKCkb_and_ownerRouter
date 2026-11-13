// @vitest-environment jsdom
// S277 R-S277-3 / R-S277-4 (ARCH-S277-3, BEH-S277-3, BEH-S277-4, AC-S277-3, AC-S277-4): Amount
// approved starts empty and is set only by typing or by one deliberate "Same as recommended
// ($1,400.00)" click; the review states what the chosen coverage means at Documents before Save,
// and while the working dates are unsaved the form links to the one Working renewal terms editor
// with a return that keeps what staff typed. Fail-first on the starting state: no control affirms
// the recommendation and no coverage consequence is stated. Synthetic values only.
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ReturnToTenantOffer,
  finishDateFix,
} from "@/components/lease-renewal/RenewalDateProposal";
import { OWNER_ANSWER_COVERAGE_WORDS } from "@/components/lease-renewal/RenewalOwnerAnswer";
import { RenewalOwnerDecisionFromReply } from "@/components/lease-renewal/RenewalOwnerDecisionFromReply";
import { RenewalWorkingRecordProvider } from "@/components/lease-renewal/RenewalWorkingRecord";
import {
  currentOwnerApproval,
  ownerApprovalNotice,
  OWNER_APPROVAL_NOTICES,
} from "@/lib/lease-documents/owner-approval-binding";
import type { OwnerApprovalChoices } from "@/lib/lease-renewal/owner-approval-evidence";
import type {
  RenewalWorkingRecord,
  WorkingFieldEntry,
} from "@/lib/lease-renewal/working-record";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

const AMOUNT_APPROVED = /Amount approved/;
const SAME = "Same as recommended ($1,400.00)";
const REVIEW = "Review the owner's answer";
const SAVE = "Save the owner's answer";

const LEASE = "9101";
const CYCLE = "0f1c8f6e-6d1c-4bd3-9d7a-00000000000a";
const SEQUENCE = "0b6f2a3e-8d1c-4f7a-9e2b-5c4d3a2b1f00";
const OWNER_REF = "rentvine:export:portfolio.owners[0].name";
const CHOICES: OwnerApprovalChoices = {
  roster: [{ label: "Jordan Sample", sourceRef: OWNER_REF }],
  replies: [
    {
      sequenceId: SEQUENCE,
      evidenceId: "owner-mailbox:reply-1",
      senderEmail: "owner@example.invalid",
      receivedAt: "2026-11-12T18:14:00.000Z",
    },
  ],
  rosterFingerprint: "f".repeat(64),
};

function entry(value: number | string, revision: number): WorkingFieldEntry {
  return {
    value,
    revision,
    eventId: `0f1c8f6e-6d1c-4bd3-9d7a-00000000010${revision}`,
    recordedAt: "2026-11-12T15:00:00.000Z",
    recordedByUid: "editor-1",
    recordedByLabel: "editor1@pmikcmetro.com",
    origin: "staff_entry",
    cycleId: CYCLE,
  };
}

function working(fields: Record<string, WorkingFieldEntry>): RenewalWorkingRecord {
  return {
    schemaVersion: "renewal-working-record/v1",
    leaseId: LEASE,
    revision: 3,
    fields,
    cycle: { cycleId: CYCLE, held: {} },
  };
}

const RECOMMENDED = working({ terms_rent: entry(1400, 1) });
const WITH_DATES = working({
  terms_rent: entry(1400, 1),
  terms_effective_date: entry("2027-01-01", 1),
  terms_end_date: entry("2027-12-31", 1),
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  finishDateFix();
  cleanup();
  vi.unstubAllGlobals();
});

function renderReply(
  record: RenewalWorkingRecord | null = RECOMMENDED,
  onRecord = vi.fn().mockResolvedValue(undefined),
) {
  render(
    <RenewalWorkingRecordProvider canEdit initialRecord={record} leaseId={LEASE}>
      <RenewalOwnerDecisionFromReply
        choices={CHOICES}
        disabled={false}
        onRecord={onRecord}
      />
      <section aria-label="Working renewal terms">
        <ReturnToTenantOffer />
      </section>
    </RenewalWorkingRecordProvider>,
  );
  return onRecord;
}

function chooseApproval() {
  fireEvent.click(screen.getByRole("radio", { name: /^Approved in the reply received/ }));
}

function chooseOwner() {
  fireEvent.change(screen.getByLabelText(/Who approved in this reply/), {
    target: { value: OWNER_REF },
  });
}

describe("AC-S277-3 affirm an equal amount explicitly", () => {
  it("ARCH-S277-3 / AC-S277-3: the field opens empty with the recommendation present, beside the affirmation", () => {
    renderReply();
    chooseApproval();
    expect(screen.getByLabelText(AMOUNT_APPROVED)).toHaveValue("");
    expect(screen.getByRole("button", { name: SAME })).toBeInTheDocument();
  });

  it("BEH-S277-3: the click fills $1,400.00, the review shows both as equal and saving sets the approved base", async () => {
    const onRecord = renderReply();
    chooseApproval();
    fireEvent.click(screen.getByRole("button", { name: SAME }));
    expect(screen.getByLabelText(AMOUNT_APPROVED)).toHaveValue("1400.00");
    chooseOwner();
    fireEvent.click(screen.getByRole("button", { name: REVIEW }));
    // Reviewing saves nothing.
    expect(onRecord).not.toHaveBeenCalled();
    const review = screen.getByRole("region", { name: REVIEW });
    expect(
      within(review).getByText("Recommended base rent").nextSibling,
    ).toHaveTextContent("$1,400 per month");
    expect(within(review).getByText("Amount approved").nextSibling).toHaveTextContent(
      "$1,400 per month, the same as the recommendation",
    );
    fireEvent.click(within(review).getByRole("button", { name: SAVE }));
    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1));
    expect(onRecord.mock.calls[0]![0]).toMatchObject({
      kind: "owner_response",
      outcome: "approved_terms",
      approvedBase: { amount: 1400, scope: "amount_only" },
    });
  });

  it("AC-S277-3: without a recommendation the control is absent; a decline or a requested change shows neither", () => {
    renderReply(null);
    chooseApproval();
    expect(screen.getByLabelText(AMOUNT_APPROVED)).toHaveValue("");
    expect(screen.queryByRole("button", { name: /Same as recommended/ })).toBeNull();
    cleanup();
    renderReply();
    fireEvent.click(screen.getByRole("radio", { name: "Declined / non-renewal" }));
    expect(screen.queryByLabelText(AMOUNT_APPROVED)).toBeNull();
    expect(screen.queryByRole("button", { name: /Same as recommended/ })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Asked for a change" }));
    expect(screen.queryByLabelText(AMOUNT_APPROVED)).toBeNull();
    expect(screen.queryByRole("button", { name: /Same as recommended/ })).toBeNull();
  });
});

describe("AC-S277-4 state the coverage before the answer is saved", () => {
  it("BEH-S277-4: with dates unsaved, the form links to the dates and returns with the typed amount kept; the review states base-rent-only coverage and the Documents consequence", () => {
    renderReply();
    chooseApproval();
    fireEvent.change(screen.getByLabelText(AMOUNT_APPROVED), {
      target: { value: "1425" },
    });
    expect(
      screen.getByText(OWNER_ANSWER_COVERAGE_WORDS.datesFirst, { exact: false }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("link", { name: OWNER_ANSWER_COVERAGE_WORDS.datesLink }),
    );
    const back = screen.getByRole("button", { name: "Return to the owner's answer" });
    fireEvent.click(back);
    const amount = screen.getByLabelText(AMOUNT_APPROVED);
    expect(document.activeElement).toBe(amount);
    expect(amount).toHaveValue("1425");
    expect(
      screen.queryByRole("button", { name: "Return to the owner's answer" }),
    ).toBeNull();
    chooseOwner();
    fireEvent.click(screen.getByRole("button", { name: REVIEW }));
    const review = screen.getByRole("region", { name: REVIEW });
    expect(within(review).getByRole("note")).toHaveTextContent(
      "This answer covers the base rent only. Documents will ask for the owner's approval of the renewal dates and charges.",
    );
  });

  it("BEH-S277-4: with dates saved, the broader choice states that Documents asks for no second approval of the dates", () => {
    renderReply(WITH_DATES);
    chooseApproval();
    expect(
      screen.queryByText(OWNER_ANSWER_COVERAGE_WORDS.datesFirst, { exact: false }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: SAME }));
    fireEvent.click(
      screen.getByRole("radio", { name: /Base rent and the renewal dates/ }),
    );
    chooseOwner();
    fireEvent.click(screen.getByRole("button", { name: REVIEW }));
    const review = screen.getByRole("region", { name: REVIEW });
    expect(within(review).getByRole("note")).toHaveTextContent(
      OWNER_ANSWER_COVERAGE_WORDS.exactTerms,
    );
  });

  it("AC-S277-4: Documents asks for the further approval after a base-only answer and for none after the broader one; coverage equals what staff chose", () => {
    const cycle = emptyRenewalWorkspace(LEASE, CYCLE, {
      kind: "lease_end",
      dateIso: "2026-12-31",
      source: "RentVine lease end",
    });
    const terms = {
      rent: 1400,
      effectiveDate: "2027-01-01",
      endDate: "2027-12-31",
      fieldRevisions: { rent: 2, effectiveDate: 1, endDate: 1 },
      economicsHash: "a".repeat(64),
      chargePolicyVersion: null,
    };
    const approve = (scope: "amount_only" | "exact_terms"): RenewalWorkspaceState =>
      planRenewalWorkspaceAction(
        cycle,
        {
          kind: "owner_response",
          outcome: "approved_terms",
          approval: {
            party: { kind: "representative", name: "Pat Example", capacity: "agent" },
            channel: { kind: "conversation", participants: "Pat Example and staff" },
            occurredAt: "2026-11-12T15:00:00.000Z",
          },
          approvedBase: {
            amount: 1400,
            scope,
            expectedWorkingRevision: 1,
            expectedRecommendationRevision: 0,
          },
        },
        {
          eventId: "0f1c8f6e-6d1c-4bd3-9d7a-000000000500",
          actorUid: "staff-1",
          recordedAt: "2026-11-12T16:00:00.000Z",
          approvedBase: {
            amount: 1400,
            scope,
            cycleId: CYCLE,
            workingRevision: 2,
            recommended: { value: 1400, revision: 1 },
          },
          approvedWorkingTerms: scope === "exact_terms" ? terms : null,
        },
      );
    const stored = working({
      terms_rent: {
        ...entry(1400, 2),
        basis: {
          kind: "owner_approval",
          ownerResponseEventId: "0f1c8f6e-6d1c-4bd3-9d7a-000000000500",
        },
      },
      terms_effective_date: entry("2027-01-01", 1),
      terms_end_date: entry("2027-12-31", 1),
    });
    const baseOnly = currentOwnerApproval({
      workspace: approve("amount_only"),
      working: stored,
      economicsHash: "a".repeat(64),
    });
    expect(baseOnly.state).toBe("amount_only");
    expect(ownerApprovalNotice(baseOnly.coverage)).toBe(
      OWNER_APPROVAL_NOTICES.amount_only,
    );
    const broader = currentOwnerApproval({
      workspace: approve("exact_terms"),
      working: stored,
      economicsHash: "a".repeat(64),
    });
    expect(broader.state).toBe("current");
    expect(ownerApprovalNotice(broader.coverage)).toBeNull();
  });
});
