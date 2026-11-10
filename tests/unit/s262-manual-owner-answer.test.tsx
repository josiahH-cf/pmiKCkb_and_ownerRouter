// @vitest-environment jsdom
// S262 R-S262-1 (AC-S262-1, BEH-S262-2): the manual Owner response records the same reviewed
// answer: Amount approved first on the approving branch, then who approved, how and when, then
// the review and Save. A recommendation that cannot be established reads as unavailable and is
// never filled from the approved rent. Synthetic values only.
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ManualOwnerAnswerApproval } from "@/components/lease-renewal/RenewalOwnerAnswer";
import { RenewalWorkingRecordProvider } from "@/components/lease-renewal/RenewalWorkingRecord";
import type { OwnerApprovalChoices } from "@/lib/lease-renewal/owner-approval-evidence";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";

const LEASE = "701";
const CYCLE = "0f1c8f6e-6d1c-4bd3-9d7a-00000000000a";
const CHOICES: OwnerApprovalChoices = {
  roster: [
    { label: "Example Owner LLC", sourceRef: "rentvine:export:portfolio.owners[0].name" },
  ],
  replies: [],
  rosterFingerprint: "f".repeat(64),
};

const APPROVED_ONLY: RenewalWorkingRecord = {
  schemaVersion: "renewal-working-record/v1",
  leaseId: LEASE,
  revision: 3,
  fields: {
    terms_rent: {
      value: 1875,
      revision: 2,
      eventId: "0f1c8f6e-6d1c-4bd3-9d7a-000000000102",
      recordedAt: "2026-10-02T15:00:00.000Z",
      recordedByUid: "editor-1",
      recordedByLabel: "editor1@pmikcmetro.com",
      origin: "staff_entry",
      cycleId: CYCLE,
      basis: {
        kind: "owner_approval",
        ownerResponseEventId: "0f1c8f6e-6d1c-4bd3-9d7a-000000000040",
      },
    },
  },
  cycle: { cycleId: CYCLE, held: {} },
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function before(first: Element, second: Element) {
  return Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

describe("AC-S262-1 Record the owner's answer on the manual path", () => {
  it("AC-S262-1: Amount approved comes before who approved, how and when; the review shows an unavailable recommendation as unavailable", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(
      <RenewalWorkingRecordProvider canEdit initialRecord={APPROVED_ONLY} leaseId={LEASE}>
        <ManualOwnerAnswerApproval choices={CHOICES} disabled={false} onSave={onSave} />
      </RenewalWorkingRecordProvider>,
    );
    expect(
      screen.getByRole("group", { name: "Record the owner's answer" }),
    ).toBeInTheDocument();
    const amount = screen.getByLabelText(/Amount approved/);
    const who = screen.getByLabelText(/^Who approved/);
    expect(before(amount, who)).toBe(true);
    expect(amount).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Review the owner's answer" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter the amount the owner approved.",
    );
    fireEvent.change(amount, { target: { value: "1900" } });
    fireEvent.change(who, {
      target: { value: "rentvine:export:portfolio.owners[0].name" },
    });
    fireEvent.change(screen.getByLabelText(/How they approved/), {
      target: { value: "conversation" },
    });
    fireEvent.change(screen.getByLabelText(/Participants/), {
      target: { value: "Example Owner LLC and staff" },
    });
    fireEvent.change(screen.getByLabelText(/When they approved/), {
      target: { value: "2026-11-06T10:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review the owner's answer" }));
    expect(
      screen.getByText("Recommended base rent", { selector: "dt" }).nextSibling,
    ).toHaveTextContent("Not available");
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save the owner's answer" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![1]).toEqual({
      amount: 1900,
      scope: "amount_only",
      expectedWorkingRevision: 2,
      expectedRecommendationRevision: 0,
    });
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      party: { kind: "owner", label: "Example Owner LLC" },
      channel: { kind: "conversation", participants: "Example Owner LLC and staff" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("BEH-S262-2: a refused save keeps the review and names the recovery", async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    render(
      <RenewalWorkingRecordProvider canEdit initialRecord={APPROVED_ONLY} leaseId={LEASE}>
        <ManualOwnerAnswerApproval choices={CHOICES} disabled={false} onSave={onSave} />
      </RenewalWorkingRecordProvider>,
    );
    fireEvent.change(screen.getByLabelText(/Amount approved/), {
      target: { value: "1900" },
    });
    fireEvent.change(screen.getByLabelText(/^Who approved/), {
      target: { value: "rentvine:export:portfolio.owners[0].name" },
    });
    fireEvent.change(screen.getByLabelText(/How they approved/), {
      target: { value: "written" },
    });
    fireEvent.change(screen.getByLabelText(/^Channel/), {
      target: { value: "Signed letter" },
    });
    fireEvent.change(screen.getByLabelText(/^Reference/), {
      target: { value: "drive:letter-1" },
    });
    fireEvent.change(screen.getByLabelText(/When they approved/), {
      target: { value: "2026-11-06T10:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review the owner's answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the owner's answer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The owner's answer was not saved. Your entries are kept; review the current values and save again.",
    );
    expect(
      screen.getByRole("button", { name: "Save the owner's answer" }),
    ).toBeInTheDocument();
  });
});
