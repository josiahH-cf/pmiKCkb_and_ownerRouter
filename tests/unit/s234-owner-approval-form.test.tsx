// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OwnerApprovalEvidenceForm } from "@/components/lease-renewal/OwnerApprovalEvidenceForm";
import { describeOwnerApproval } from "@/lib/lease-renewal/owner-approval-evidence";

// S234 R-S234-1 (BEH-S234-1): the approval form pre-selects nothing, offers only this lease's
// owner-thread replies, names what is missing, and records nothing while the owner list is
// unreadable. Synthetic owners and replies only.

afterEach(cleanup);
const CHOICES = {
  roster: [
    { label: "Example Owner LLC", sourceRef: "rentvine:export:portfolio.owners[0].name" },
  ],
  replies: [
    {
      sequenceId: "6d0f4a51-8e7c-4f90-b1c2-000000000001",
      evidenceId: "mailbox-key:reply-1",
      senderEmail: "staff@pmikcmetro.com",
      receivedAt: "2026-10-20T15:00:00.000Z",
    },
  ],
};

describe("S234 owner approval form", () => {
  it("pre-selects nothing, names the missing items and posts the chosen reply", () => {
    const onRecord = vi.fn();
    render(
      <OwnerApprovalEvidenceForm
        choices={CHOICES}
        disabled={false}
        onRecord={onRecord}
      />,
    );
    expect(screen.getByLabelText("Who approved")).toHaveValue("");
    expect(screen.getByLabelText("How they approved")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Record approval" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Before recording Approved, add who approved, how they approved, when they approved.",
    );
    expect(onRecord).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Who approved"), {
      target: { value: "rentvine:export:portfolio.owners[0].name" },
    });
    fireEvent.change(screen.getByLabelText("How they approved"), {
      target: { value: "linked_reply" },
    });
    // The reply list starts unchosen even with exactly one reply.
    expect(screen.getByLabelText("Reply")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Reply"), {
      target: {
        value: "6d0f4a51-8e7c-4f90-b1c2-000000000001\u0000mailbox-key:reply-1",
      },
    });
    fireEvent.change(screen.getByLabelText("When they approved"), {
      target: { value: "2026-10-20T11:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record approval" }));
    expect(onRecord).toHaveBeenCalledWith({
      party: { kind: "owner", sourceRef: "rentvine:export:portfolio.owners[0].name" },
      channel: {
        kind: "linked_reply",
        sequenceId: "6d0f4a51-8e7c-4f90-b1c2-000000000001",
        evidenceId: "mailbox-key:reply-1",
      },
      occurredAt: new Date("2026-10-20T11:00").toISOString(),
    });
  });

  it("offers no reply channel without an owner-thread reply and records nothing unreadable", () => {
    const view = render(
      <OwnerApprovalEvidenceForm
        choices={{ roster: CHOICES.roster, replies: [] }}
        disabled={false}
        onRecord={vi.fn()}
      />,
    );
    expect(
      [...(screen.getByLabelText("How they approved") as HTMLSelectElement).options].map(
        (option) => option.value,
      ),
    ).toEqual(["", "written", "conversation"]);
    view.unmount();
    render(
      <OwnerApprovalEvidenceForm
        choices={{ roster: null, replies: [] }}
        disabled={false}
        onRecord={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "The lease's current owner list could not be read, so an approval can't be recorded now.",
    );
    expect(screen.queryByRole("button", { name: "Record approval" })).toBeNull();
  });

  it("reads a recorded approval as who, how and when", () => {
    expect(
      describeOwnerApproval(
        {
          party: {
            kind: "representative",
            name: "Example Agent",
            capacity: "Property manager",
          },
          channel: {
            kind: "written",
            medium: "Signed letter",
            reference: "drive:letter-1",
          },
          occurredAt: "2026-10-20T16:00:00.000Z",
        },
        (iso) => iso.slice(0, 10),
      ),
    ).toBe(
      "Approved by Example Agent (authorized representative, Property manager) through Signed letter (reference drive:letter-1), on 2026-10-20.",
    );
  });
});
