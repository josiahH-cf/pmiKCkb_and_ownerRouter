// @vitest-environment jsdom
// S262 R-S262-1..3 (BEH-S262-1, BEH-S262-3, AC-S262-1): "Record the owner's answer" puts the
// Outcome first, then Amount approved on the approving branch only, then the evidence, then an
// explicit review naming the old recommended base, the approved base and the coverage before
// Save. The amount is typed by staff and never filled for them. The labels are the spec's exact
// words, and only existing modules are imported, so the file runs against the code before this
// change. Synthetic values only.
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
  OWNER_DECISION_RECORD_LABEL,
  RenewalOwnerDecisionFromReply,
} from "@/components/lease-renewal/RenewalOwnerDecisionFromReply";
import { RenewalWorkingRecordProvider } from "@/components/lease-renewal/RenewalWorkingRecord";
import type { OwnerApprovalChoices } from "@/lib/lease-renewal/owner-approval-evidence";
import type {
  RenewalWorkingRecord,
  WorkingFieldEntry,
} from "@/lib/lease-renewal/working-record";
import { RenewalWorkspaceActionSchema } from "@/lib/lease-renewal/workspace-state";

const RECORD_OWNER_ANSWER_TITLE = "Record the owner's answer";
const AMOUNT_APPROVED_LABEL = "Amount approved";
const REVIEW_OWNER_ANSWER_LABEL = "Review the owner's answer";
const SAVE_OWNER_ANSWER_LABEL = "Save the owner's answer";
const CONTINUE_TO_TENANT_OFFER_LABEL = "Continue to Offer the tenant";

const LEASE = "701";
const CYCLE = "0f1c8f6e-6d1c-4bd3-9d7a-00000000000a";
const SEQUENCE = "0b6f2a3e-8d1c-4f7a-9e2b-5c4d3a2b1f00";
const CHOICES: OwnerApprovalChoices = {
  roster: [
    { label: "Example Owner LLC", sourceRef: "rentvine:export:portfolio.owners[0].name" },
  ],
  replies: [
    {
      sequenceId: SEQUENCE,
      evidenceId: "owner-mailbox:reply-1",
      senderEmail: "renewals@example.invalid",
      receivedAt: "2026-11-06T16:02:00.000Z",
    },
  ],
  rosterFingerprint: "f".repeat(64),
};

function entry(value: number | string, revision: number): WorkingFieldEntry {
  return {
    value,
    revision,
    eventId: `0f1c8f6e-6d1c-4bd3-9d7a-00000000010${revision}`,
    recordedAt: "2026-10-02T15:00:00.000Z",
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

const RECOMMENDED = working({ terms_rent: entry(1850, 1) });
const WITH_DATES = working({
  terms_rent: entry(1850, 1),
  terms_effective_date: entry("2026-12-01", 1),
  terms_end_date: entry("2027-11-30", 1),
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
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
    </RenewalWorkingRecordProvider>,
  );
  return onRecord;
}

function chooseApproval() {
  fireEvent.click(screen.getByRole("radio", { name: /^Approved in the reply received/ }));
}

function before(first: Element, second: Element) {
  return Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

describe("AC-S262-1 Record the owner's answer from the linked reply", () => {
  it("AC-S262-1: Outcome comes first, Amount approved appears on the approving branch only and before the evidence, and nothing is prefilled", () => {
    renderReply();
    expect(
      screen.getByRole("group", { name: RECORD_OWNER_ANSWER_TITLE }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(new RegExp(AMOUNT_APPROVED_LABEL))).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Declined / non-renewal" }));
    expect(screen.queryByLabelText(new RegExp(AMOUNT_APPROVED_LABEL))).toBeNull();
    chooseApproval();
    const outcome = screen.getByRole("radio", {
      name: /^Approved in the reply received/,
    });
    const amount = screen.getByLabelText(new RegExp(AMOUNT_APPROVED_LABEL));
    const party = screen.getByLabelText(/Who approved in this reply/);
    // Never copied from the $1,850 recommendation.
    expect(amount).toHaveValue("");
    expect(before(outcome, amount)).toBe(true);
    expect(before(amount, party)).toBe(true);
    // Rewritten on purpose for S285 R-S285-4: Base rent only is no longer the default in every
    // case. It is the coverage the form opens on here because no confirmed owner message stated a
    // term (these choices carry none) and no dates are saved.
    expect(CHOICES.ownerMessageTerm ?? null).toBeNull();
    expect(screen.getByRole("radio", { name: "Base rent only" })).toBeChecked();
    // No saved dates: the answer cannot claim to cover them.
    expect(
      screen.queryByRole("radio", { name: /Base rent and the renewal dates/ }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: REVIEW_OWNER_ANSWER_LABEL }),
    ).toBeInTheDocument();
  });

  it("AC-S262-1: a missing amount or invalid precision is named and records nothing", () => {
    const onRecord = renderReply();
    chooseApproval();
    fireEvent.change(screen.getByLabelText(/Who approved in this reply/), {
      target: { value: "rentvine:export:portfolio.owners[0].name" },
    });
    fireEvent.click(screen.getByRole("button", { name: REVIEW_OWNER_ANSWER_LABEL }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter the amount the owner approved.",
    );
    for (const typed of ["1875.555", "-1875", "about 1875"]) {
      fireEvent.change(screen.getByLabelText(new RegExp(AMOUNT_APPROVED_LABEL)), {
        target: { value: typed },
      });
      fireEvent.click(screen.getByRole("button", { name: REVIEW_OWNER_ANSWER_LABEL }));
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Enter the approved monthly amount as 1875 or $1,875.00.",
      );
    }
    expect(onRecord).not.toHaveBeenCalled();
  });

  it("BEH-S262-1: the review names the $1,850 recommendation, the $1,875 approval and what it covers, and Save records both", async () => {
    const onRecord = renderReply();
    chooseApproval();
    fireEvent.change(screen.getByLabelText(new RegExp(AMOUNT_APPROVED_LABEL)), {
      target: { value: "$1,875.00" },
    });
    fireEvent.change(screen.getByLabelText(/Who approved in this reply/), {
      target: { value: "rentvine:export:portfolio.owners[0].name" },
    });
    fireEvent.click(screen.getByRole("button", { name: REVIEW_OWNER_ANSWER_LABEL }));
    // Reviewing saves nothing.
    expect(onRecord).not.toHaveBeenCalled();
    const review = screen.getByRole("region", { name: REVIEW_OWNER_ANSWER_LABEL });
    expect(
      within(review).getByText("Recommended base rent").nextSibling,
    ).toHaveTextContent("$1,850 per month");
    expect(within(review).getByText(AMOUNT_APPROVED_LABEL).nextSibling).toHaveTextContent(
      "$1,875 per month",
    );
    expect(within(review).getByText("Covers").nextSibling).toHaveTextContent(
      "The base rent only. The renewal dates and other charges are not covered.",
    );
    expect(within(review).getByText("Evidence").nextSibling).toHaveTextContent(
      /Example Owner LLC \(owner of record\)/,
    );
    fireEvent.click(
      within(review).getByRole("button", { name: SAVE_OWNER_ANSWER_LABEL }),
    );
    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1));
    const action = onRecord.mock.calls[0]![0];
    expect(action).toMatchObject({
      kind: "owner_response",
      outcome: "approved_terms",
      approval: {
        party: { kind: "owner", label: "Example Owner LLC" },
        channel: { kind: "linked_reply", sequenceId: SEQUENCE },
      },
      approvedBase: {
        amount: 1875,
        scope: "amount_only",
        expectedWorkingRevision: 1,
        expectedRecommendationRevision: 0,
      },
    });
    expect(RenewalWorkspaceActionSchema.safeParse(action).success).toBe(true);
    // After the save: the way on to the tenant offer, which sends nothing.
    expect(
      await screen.findByRole("button", { name: CONTINUE_TO_TENANT_OFFER_LABEL }),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("R-S262-1: an amount equal to the recommendation is affirmed explicitly in the review", () => {
    renderReply();
    chooseApproval();
    fireEvent.change(screen.getByLabelText(new RegExp(AMOUNT_APPROVED_LABEL)), {
      target: { value: "1850" },
    });
    fireEvent.change(screen.getByLabelText(/Who approved in this reply/), {
      target: { value: "rentvine:export:portfolio.owners[0].name" },
    });
    fireEvent.click(screen.getByRole("button", { name: REVIEW_OWNER_ANSWER_LABEL }));
    expect(
      screen.getByText(AMOUNT_APPROVED_LABEL, { selector: "dt" }).nextSibling,
    ).toHaveTextContent("$1,850 per month, the same as the recommendation");
  });

  it("BEH-S262-3: base and dates are offered only when both dates are saved, and the review says what is covered", () => {
    const onRecord = renderReply(WITH_DATES);
    chooseApproval();
    fireEvent.click(
      screen.getByRole("radio", {
        name: "Base rent and the renewal dates, 12/01/2026 to 11/30/2027",
      }),
    );
    fireEvent.change(screen.getByLabelText(new RegExp(AMOUNT_APPROVED_LABEL)), {
      target: { value: "1875" },
    });
    fireEvent.change(screen.getByLabelText(/Who approved in this reply/), {
      target: { value: "rentvine:export:portfolio.owners[0].name" },
    });
    fireEvent.click(screen.getByRole("button", { name: REVIEW_OWNER_ANSWER_LABEL }));
    expect(screen.getByText("Covers").nextSibling).toHaveTextContent(
      "The base rent and the renewal dates, 12/01/2026 to 11/30/2027. Other charges are not covered.",
    );
    fireEvent.click(screen.getByRole("button", { name: SAVE_OWNER_ANSWER_LABEL }));
    expect(onRecord.mock.calls[0]![0].approvedBase).toMatchObject({
      scope: "exact_terms",
    });
  });

  it("BEH-S262-2: a refused save keeps the review and every entry and offers no next step", async () => {
    const onRecord = renderReply(
      RECOMMENDED,
      vi.fn().mockRejectedValue(new Error("conflict")),
    );
    chooseApproval();
    fireEvent.change(screen.getByLabelText(new RegExp(AMOUNT_APPROVED_LABEL)), {
      target: { value: "1875" },
    });
    fireEvent.change(screen.getByLabelText(/Who approved in this reply/), {
      target: { value: "rentvine:export:portfolio.owners[0].name" },
    });
    fireEvent.click(screen.getByRole("button", { name: REVIEW_OWNER_ANSWER_LABEL }));
    fireEvent.click(screen.getByRole("button", { name: SAVE_OWNER_ANSWER_LABEL }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The owner's answer was not saved. Your entries are kept",
    );
    expect(onRecord).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: CONTINUE_TO_TENANT_OFFER_LABEL }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Change the answer" }));
    expect(screen.getByLabelText(new RegExp(AMOUNT_APPROVED_LABEL))).toHaveValue("1875");
  });

  it("R-S262-1: a decline and a requested change record their outcome with no amount", () => {
    const onRecord = renderReply();
    fireEvent.click(screen.getByRole("radio", { name: "Declined / non-renewal" }));
    fireEvent.click(screen.getByRole("button", { name: OWNER_DECISION_RECORD_LABEL }));
    expect(onRecord).toHaveBeenLastCalledWith({
      kind: "owner_response",
      outcome: "declined_non_renewal",
    });
    fireEvent.click(screen.getByRole("radio", { name: "Asked for a change" }));
    fireEvent.click(screen.getByRole("button", { name: OWNER_DECISION_RECORD_LABEL }));
    expect(onRecord).toHaveBeenLastCalledWith({
      kind: "owner_response",
      outcome: "revision_requested",
    });
    for (const call of onRecord.mock.calls)
      expect(call[0]).not.toHaveProperty("approvedBase");
  });
});
