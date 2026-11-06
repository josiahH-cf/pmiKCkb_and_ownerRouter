// @vitest-environment jsdom
// S252 (L36, R-S252-1 inside S248 BEH-S248-2): the owner's decision from an observed reply is
// recorded on the Now card in at most three deliberate actions, nothing preselected, with the same
// S234 approval evidence the Owner response form records. Synthetic values only.
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OWNER_DECISION_RECORD_LABEL,
  RenewalOwnerDecisionFromReply,
} from "@/components/lease-renewal/RenewalOwnerDecisionFromReply";
import type { OwnerApprovalChoices } from "@/lib/lease-renewal/owner-approval-evidence";
import { RenewalWorkspaceActionSchema } from "@/lib/lease-renewal/workspace-state";

const SEQUENCE = "0b6f2a3e-8d1c-4f7a-9e2b-5c4d3a2b1f00";
const CHOICES: OwnerApprovalChoices = {
  roster: [
    { label: "Example Owner LLC", sourceRef: "rentvine:export:portfolio.owners[0].name" },
    { label: "Sample Holdings", sourceRef: "rentvine:export:portfolio.owners[1].name" },
  ],
  replies: [
    {
      sequenceId: SEQUENCE,
      evidenceId: "owner-mailbox:reply-1",
      // The staff mailbox whose thread holds the reply (S233 inbound evidence keeps no address).
      senderEmail: "renewals@example.invalid",
      receivedAt: "2026-11-06T16:02:00.000Z",
    },
  ],
  rosterFingerprint: "f".repeat(64),
};

afterEach(() => cleanup());

function renderForm(choices: OwnerApprovalChoices = CHOICES) {
  const onRecord = vi.fn();
  render(
    <RenewalOwnerDecisionFromReply
      choices={choices}
      disabled={false}
      onRecord={onRecord}
    />,
  );
  return onRecord;
}

describe("S252 L36: the owner's decision from an observed reply", () => {
  it("preselects nothing: no decision is chosen and no approver is offered until approval is chosen", () => {
    renderForm();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    for (const radio of radios) expect(radio).not.toBeChecked();
    expect(screen.queryByLabelText(/Who approved in this reply/)).toBeNull();
  });

  it("names the staff mailbox the reply arrived in, as the S234 reply choice does, never as its sender", () => {
    renderForm();
    const approved = screen.getByRole("radio", {
      name: /^Approved in the reply received/,
    });
    expect(approved).toHaveAccessibleName(
      /^Approved in the reply received .+ in renewals@example\.invalid$/,
    );
    expect(
      screen.queryByRole("radio", { name: /from renewals@example\.invalid/ }),
    ).toBeNull();
  });

  it("records an approval from the reply in three deliberate actions with the S234 evidence", () => {
    const onRecord = renderForm();
    let actions = 0;
    fireEvent.click(
      screen.getByRole("radio", { name: /^Approved in the reply received/ }),
    );
    actions += 1;
    const party = screen.getByLabelText(/Who approved in this reply/);
    expect(party).toHaveValue("");
    fireEvent.change(party, {
      target: { value: "rentvine:export:portfolio.owners[0].name" },
    });
    actions += 1;
    fireEvent.click(screen.getByRole("button", { name: OWNER_DECISION_RECORD_LABEL }));
    actions += 1;
    expect(actions).toBeLessThanOrEqual(3);
    expect(onRecord).toHaveBeenCalledTimes(1);
    const action = onRecord.mock.calls[0]![0];
    expect(action).toEqual({
      kind: "owner_response",
      outcome: "approved_terms",
      approval: {
        party: {
          kind: "owner",
          sourceRef: "rentvine:export:portfolio.owners[0].name",
          label: "Example Owner LLC",
          rosterFingerprint: "f".repeat(64),
        },
        channel: {
          kind: "linked_reply",
          sequenceId: SEQUENCE,
          evidenceId: "owner-mailbox:reply-1",
        },
        occurredAt: "2026-11-06T16:02:00.000Z",
      },
    });
    // The same action the Owner response form records: the route's own schema accepts it.
    expect(RenewalWorkspaceActionSchema.safeParse(action).success).toBe(true);
  });

  it("names what is missing and records nothing when no approver is chosen", () => {
    const onRecord = renderForm();
    fireEvent.click(
      screen.getByRole("radio", { name: /^Approved in the reply received/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: OWNER_DECISION_RECORD_LABEL }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Before recording Approved, choose who approved.",
    );
    expect(onRecord).not.toHaveBeenCalled();
  });

  it("names the missing decision and records nothing before a choice", () => {
    const onRecord = renderForm();
    fireEvent.click(screen.getByRole("button", { name: OWNER_DECISION_RECORD_LABEL }));
    expect(screen.getByRole("alert")).toHaveTextContent("choose the owner's decision");
    expect(onRecord).not.toHaveBeenCalled();
  });

  it("records a decline in two actions and a requested change with its optional note", () => {
    const onRecord = renderForm();
    fireEvent.click(screen.getByRole("radio", { name: "Declined / non-renewal" }));
    fireEvent.click(screen.getByRole("button", { name: OWNER_DECISION_RECORD_LABEL }));
    expect(onRecord).toHaveBeenLastCalledWith({
      kind: "owner_response",
      outcome: "declined_non_renewal",
    });
    fireEvent.click(screen.getByRole("radio", { name: "Asked for a change" }));
    fireEvent.change(screen.getByLabelText(/What the owner asked to change/), {
      target: { value: "Synthetic request for a lower rent." },
    });
    fireEvent.click(screen.getByRole("button", { name: OWNER_DECISION_RECORD_LABEL }));
    expect(onRecord).toHaveBeenLastCalledWith({
      kind: "owner_response",
      outcome: "revision_requested",
      reason: "Synthetic request for a lower rent.",
    });
    for (const call of onRecord.mock.calls)
      expect(RenewalWorkspaceActionSchema.safeParse(call[0]).success).toBe(true);
  });

  it("records no approval when the owner list could not be read", () => {
    const onRecord = renderForm({ ...CHOICES, roster: null });
    fireEvent.click(
      screen.getByRole("radio", { name: /^Approved in the reply received/ }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("could not be read");
    fireEvent.click(screen.getByRole("button", { name: OWNER_DECISION_RECORD_LABEL }));
    expect(onRecord).not.toHaveBeenCalled();
  });
});
