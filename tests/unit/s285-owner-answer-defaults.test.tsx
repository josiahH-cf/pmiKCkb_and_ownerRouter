// @vitest-environment jsdom
// S285 R-S285-4 / R-S285-5 (ARCH-S285-3, BEH-S285-3, BEH-S285-4, AC-S285-3, AC-S285-4, AC-S285-5):
// "Record the owner's answer" opens on the coverage the owner message asked for and with the owner
// who replied selected, when that is certain. Both are projections: staff can change either before
// the review, and only their save stores the answer, with the fields an approval stores today and
// no address. Only the existing modules' HTTP seam is simulated. Synthetic values only.
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RenewalOwnerDecisionFromReply } from "@/components/lease-renewal/RenewalOwnerDecisionFromReply";
import { OwnerApprovalEvidenceForm } from "@/components/lease-renewal/OwnerApprovalEvidenceForm";
import { RenewalWorkingRecordProvider } from "@/components/lease-renewal/RenewalWorkingRecord";
import type { OwnerApprovalChoices } from "@/lib/lease-renewal/owner-approval-evidence";
import {
  matchReplyApprover,
  ownerAnswerCoverageDefault,
  statedTermFromReviewedValues,
} from "@/lib/lease-renewal/owner-copy-version";
import type {
  RenewalWorkingRecord,
  WorkingFieldEntry,
} from "@/lib/lease-renewal/working-record";

const LEASE = "2852";
const CYCLE = "0f1c8f6e-6d1c-4bd3-9d7a-000000002852";
const SEQUENCE = "0b6f2a3e-8d1c-4f7a-9e2b-5c4d3a2b2852";
const OWNER = {
  label: "Jordan Sample",
  sourceRef: "rentvine:export:portfolio.owners[0].name",
};
const OTHER = {
  label: "Casey Sample",
  sourceRef: "rentvine:export:portfolio.owners[1].name",
};
const SELECTED_LINE =
  "Selected because this reply came from the address the owner message was sent to.";

function entry(value: number | string, revision: number): WorkingFieldEntry {
  return {
    value,
    revision,
    eventId: `0f1c8f6e-6d1c-4bd3-9d7a-00000000050${revision}`,
    recordedAt: "2026-11-12T15:00:00.000Z",
    recordedByUid: "editor-1",
    recordedByLabel: "editor1@pmikcmetro.com",
    origin: "staff_entry",
    cycleId: CYCLE,
  };
}

function working(start: string, end: string): RenewalWorkingRecord {
  return {
    schemaVersion: "renewal-working-record/v1",
    leaseId: LEASE,
    revision: 4,
    fields: {
      terms_rent: entry(1400, 1),
      terms_effective_date: entry(start, 1),
      terms_end_date: entry(end, 1),
    },
    cycle: { cycleId: CYCLE, held: {} },
  };
}

const DATES = working("2027-01-01", "2027-12-31");

function choices(overrides: Partial<OwnerApprovalChoices> = {}): OwnerApprovalChoices {
  return {
    roster: [OWNER, OTHER],
    replies: [
      {
        sequenceId: SEQUENCE,
        evidenceId: "owner-mailbox:reply-1",
        senderEmail: "renewals@pmikcmetro.com",
        receivedAt: "2026-11-12T18:14:00.000Z",
        approver: OWNER,
      },
    ],
    rosterFingerprint: "f".repeat(64),
    ownerMessageTerm: { start: "2027-01-01", end: "2027-12-31" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderReply(
  value: OwnerApprovalChoices,
  record: RenewalWorkingRecord = DATES,
  onRecord = vi.fn().mockResolvedValue(undefined),
) {
  render(
    <RenewalWorkingRecordProvider canEdit initialRecord={record} leaseId={LEASE}>
      <RenewalOwnerDecisionFromReply
        choices={value}
        disabled={false}
        onRecord={onRecord}
      />
    </RenewalWorkingRecordProvider>,
  );
  fireEvent.click(screen.getByRole("radio", { name: /^Approved in the reply received/ }));
  return onRecord;
}

const BROADER = "Base rent and the renewal dates, 01/01/2027 to 12/31/2027";

describe("AC-S285-3 the coverage the owner message asked for", () => {
  it("BEH-S285-3: a message that stated the term, dates unchanged: the form opens on the broader coverage and says why", () => {
    renderReply(choices());
    expect(screen.getByRole("radio", { name: BROADER })).toBeChecked();
    expect(
      screen.getByText("The message asked about the rent and these dates."),
    ).toBeInTheDocument();
  });

  it("AC-S285-3: dates changed after the message: it opens on Base rent only with the reason", () => {
    renderReply(choices(), working("2027-01-01", "2027-06-30"));
    expect(screen.getByRole("radio", { name: "Base rent only" })).toBeChecked();
    expect(
      screen.getByText("The renewal dates changed after the owner message was sent."),
    ).toBeInTheDocument();
  });

  it("AC-S285-3: a message sent before this suite, with no term: Base rent only", () => {
    renderReply(choices({ ownerMessageTerm: null }));
    expect(screen.getByRole("radio", { name: "Base rent only" })).toBeChecked();
    expect(screen.queryByText(/The message asked about/)).toBeNull();
    expect(screen.queryByText(/changed after the owner message/)).toBeNull();
  });

  it("AC-S285-3 / AC-S285-5: in every case the saved coverage equals what staff chose in the review", () => {
    const onRecord = renderReply(choices());
    // Staff choose Base rent only although the form opened on the broader coverage.
    fireEvent.click(screen.getByRole("radio", { name: "Base rent only" }));
    fireEvent.change(screen.getByLabelText(/Amount approved/), {
      target: { value: "1425" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review the owner's answer" }));
    expect(screen.getByText("Covers").nextSibling).toHaveTextContent(
      "The base rent only. The renewal dates and other charges are not covered.",
    );
    // Nothing is stored before the explicit save.
    expect(onRecord).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save the owner's answer" }));
    expect(onRecord.mock.calls[0]![0].approvedBase).toMatchObject({
      amount: 1425,
      scope: "amount_only",
    });
  });

  it("BEH-S285-3: with the default broader coverage, the review states it and the save records exact terms", () => {
    const onRecord = renderReply(choices());
    fireEvent.change(screen.getByLabelText(/Amount approved/), {
      target: { value: "1425" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review the owner's answer" }));
    expect(screen.getByText("Covers").nextSibling).toHaveTextContent(
      "The base rent and the renewal dates, 01/01/2027 to 12/31/2027. Other charges are not covered.",
    );
    expect(
      screen.getByText(
        "This answer covers the base rent and the renewal dates, so Documents asks for no second approval of the dates.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save the owner's answer" }));
    const action = onRecord.mock.calls[0]![0];
    expect(action.approvedBase).toMatchObject({ amount: 1425, scope: "exact_terms" });
    expect(action.approval.party).toEqual({
      kind: "owner",
      sourceRef: OWNER.sourceRef,
      label: OWNER.label,
      rosterFingerprint: "f".repeat(64),
    });
  });

  it("BEH-S285-4: a different approved term saved first: the coverage names the new dates", () => {
    renderReply(choices(), working("2027-01-01", "2027-06-30"));
    expect(
      screen.getByRole("radio", {
        name: "Base rent and the renewal dates, 01/01/2027 to 06/30/2027",
      }),
    ).toBeInTheDocument();
  });

  it("ARCH-S285-3: the default is a projection of the stated term and the saved dates", () => {
    const stated = { start: "2027-01-01", end: "2027-12-31" };
    expect(
      ownerAnswerCoverageDefault({
        statedTerm: stated,
        workingDates: { start: "2027-01-01", end: "2027-12-31" },
      }),
    ).toEqual({ scope: "exact_terms", reason: "message_asked" });
    expect(
      ownerAnswerCoverageDefault({
        statedTerm: stated,
        workingDates: { start: "2027-01-01", end: "2027-06-30" },
      }),
    ).toEqual({ scope: "amount_only", reason: "dates_changed" });
    expect(ownerAnswerCoverageDefault({ statedTerm: null, workingDates: null })).toEqual({
      scope: "amount_only",
      reason: "no_term_stated",
    });
    expect(
      statedTermFromReviewedValues([
        { key: "renewalStart", value: "01/01/2027" },
        { key: "renewalEnd", value: "12/31/2027" },
      ]),
    ).toEqual(stated);
    expect(
      statedTermFromReviewedValues([{ key: "rentToRecommend", value: "$1,425.00" }]),
    ).toBeNull();
  });
});

describe("AC-S285-4 the owner who replied", () => {
  it("BEH-S285-3: a reply from the address the message went to for one roster owner opens with that owner selected", () => {
    renderReply(choices());
    expect(screen.getByLabelText(/Who approved in this reply/)).toHaveValue(
      OWNER.sourceRef,
    );
    expect(screen.getByText(SELECTED_LINE)).toBeInTheDocument();
  });

  it("AC-S285-4: staff change the selection and the record stores their choice", () => {
    const onRecord = renderReply(choices());
    fireEvent.change(screen.getByLabelText(/Who approved in this reply/), {
      target: { value: OTHER.sourceRef },
    });
    expect(screen.queryByText(SELECTED_LINE)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Amount approved/), {
      target: { value: "1425" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review the owner's answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the owner's answer" }));
    const approval = onRecord.mock.calls[0]![0].approval;
    expect(approval.party).toMatchObject({ kind: "owner", sourceRef: OTHER.sourceRef });
    // The stored record holds no address field.
    expect(JSON.stringify(approval)).not.toMatch(/@/);
    expect(Object.keys(approval.party).sort()).toEqual(
      ["kind", "label", "rosterFingerprint", "sourceRef"].sort(),
    );
  });

  it("AC-S285-4: with no matched owner nothing is selected", () => {
    renderReply(
      choices({
        replies: [
          {
            sequenceId: SEQUENCE,
            evidenceId: "owner-mailbox:reply-1",
            senderEmail: "renewals@pmikcmetro.com",
            receivedAt: "2026-11-12T18:14:00.000Z",
          },
        ],
      }),
    );
    expect(screen.getByLabelText(/Who approved in this reply/)).toHaveValue("");
    expect(screen.queryByText(SELECTED_LINE)).toBeNull();
  });

  it("AC-S285-4: the manual form selects the matched owner only for a chosen thread reply", () => {
    const onRecord = vi.fn();
    render(
      <OwnerApprovalEvidenceForm
        choices={choices()}
        disabled={false}
        onRecord={onRecord}
      />,
    );
    expect(screen.getByLabelText("Who approved")).toHaveValue("");
    // Another channel: nothing selected.
    fireEvent.change(screen.getByLabelText("How they approved"), {
      target: { value: "written" },
    });
    expect(screen.getByLabelText("Who approved")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("How they approved"), {
      target: { value: "linked_reply" },
    });
    expect(screen.getByLabelText("Who approved")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Reply"), {
      target: { value: `${SEQUENCE}\u0000owner-mailbox:reply-1` },
    });
    expect(screen.getByLabelText("Who approved")).toHaveValue(OWNER.sourceRef);
    expect(screen.getByText(SELECTED_LINE)).toBeInTheDocument();
  });

  it("ARCH-S285-3: the server match selects one roster owner and nothing in the five other cases", () => {
    const roster = [
      { ...OWNER, email: "jordan@example.invalid" },
      { ...OTHER, email: "casey@example.invalid" },
    ];
    const reply = {
      kind: "human",
      fromSentTo: true,
      sentTo: ["Jordan@example.invalid"],
      roster,
    };
    expect(matchReplyApprover(reply)).toEqual(OWNER);
    // Two roster owners share that address.
    expect(
      matchReplyApprover({
        ...reply,
        roster: [roster[0]!, { ...OTHER, email: "jordan@example.invalid" }],
      }),
    ).toBeNull();
    // The sender matches no roster owner.
    expect(
      matchReplyApprover({ ...reply, sentTo: ["someone-else@example.invalid"] }),
    ).toBeNull();
    // The reply came from another participant, not the address the message was sent to.
    expect(matchReplyApprover({ ...reply, fromSentTo: false })).toBeNull();
    // An automatic reply and a bounce.
    expect(matchReplyApprover({ ...reply, kind: "auto_reply" })).toBeNull();
    expect(matchReplyApprover({ ...reply, kind: "bounce" })).toBeNull();
    // An unreadable roster.
    expect(matchReplyApprover({ ...reply, roster: null })).toBeNull();
    // Only the roster entry comes back, never an address.
    expect(JSON.stringify(matchReplyApprover(reply))).not.toMatch(/@/);
  });
});
