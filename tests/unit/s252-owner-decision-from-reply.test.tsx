// @vitest-environment jsdom
// S252 (L36, R-S252-1 inside S248 BEH-S248-2): the owner's decision from an observed reply is
// recorded on the Now card with nothing preselected and the same S234 approval evidence the Owner
// response form records. S262 R-S262-1: an approval also names its Amount approved and is saved
// only from an explicit review. Synthetic values only.
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

  // S262 R-S262-1 supersedes the three-action approval: after the Outcome come Amount approved,
  // who approved, and an explicit review before Save. The S234 evidence is unchanged.
  it("records an approval from the reply with its Amount approved, the S234 evidence and an explicit review", async () => {
    const onRecord = renderForm();
    fireEvent.click(
      screen.getByRole("radio", { name: /^Approved in the reply received/ }),
    );
    fireEvent.change(screen.getByLabelText(/Amount approved/), {
      target: { value: "1875" },
    });
    const party = screen.getByLabelText(/Who approved in this reply/);
    expect(party).toHaveValue("");
    fireEvent.change(party, {
      target: { value: "rentvine:export:portfolio.owners[0].name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review the owner's answer" }));
    expect(onRecord).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save the owner's answer" }));
    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1));
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
      approvedBase: {
        amount: 1875,
        scope: "amount_only",
        expectedWorkingRevision: 0,
        expectedRecommendationRevision: 0,
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
    fireEvent.change(screen.getByLabelText(/Amount approved/), {
      target: { value: "1875" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review the owner's answer" }));
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
    expect(screen.getByText(/current owner list could not be read/)).toBeVisible();
    fireEvent.change(screen.getByLabelText(/Amount approved/), {
      target: { value: "1875" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review the owner's answer" }));
    expect(onRecord).not.toHaveBeenCalled();
  });
});

const LINKED_CHOICES: OwnerApprovalChoices = {
  ...CHOICES,
  replies: [{ ...CHOICES.replies[0]!, threadId: "thread-owner", messageId: "reply-1" }],
};

describe("S248 L36: read the observed owner reply before recording its meaning", () => {
  it("reads the exact linked message as plain text and leaves the decision unselected", async () => {
    const body = "Synthetic owner reply.\nPlease use <b>these terms</b>.";
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          thread: {
            messages: [
              { id: "outbound-1", bodyText: "An older outgoing message." },
              { id: "reply-1", bodyText: body, bodyTruncated: true },
            ],
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    renderForm(LINKED_CHOICES);
    expect(screen.getByText("Reading the owner's reply.")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByText(/Please use/)).toHaveTextContent("<b>these terms</b>"),
    );
    expect(document.querySelector(".renewal-owner-reply-body b")).toBeNull();
    expect(screen.queryByText("An older outgoing message.")).toBeNull();
    expect(screen.getByText(/Part of this reply is shown/)).toBeVisible();
    const url = new URL(fetch.mock.calls[0]![0], "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      id: SEQUENCE,
      thread: "thread-owner",
      sender: "renewals@example.invalid",
    });
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
  });

  it.each([false, true])(
    "keeps staff entries and keyboard focus through a failed read (Tab while reading: %s)",
    async (continueToDecision) => {
      let finish!: (response: Response) => void;
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(new Response("{}", { status: 503 }))
        .mockImplementationOnce(
          () => new Promise<Response>((resolve) => (finish = resolve)),
        );
      vi.stubGlobal("fetch", fetch);
      const onRecord = renderForm(LINKED_CHOICES);
      const choice = screen.getByRole("radio", { name: "Asked for a change" });
      fireEvent.click(choice);
      const note = screen.getByLabelText(/What the owner asked to change/);
      fireEvent.change(note, {
        target: { value: "Keep this staff note." },
      });
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "reply text could not be read",
      );
      const user = userEvent.setup();
      note.focus();
      await user.tab({ shift: true });
      expect(choice).toHaveFocus();
      await user.tab({ shift: true });
      const retry = screen.getByRole("button", { name: "Try again" });
      expect(retry).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(screen.getByText("Reading the owner's reply.")).toBeVisible();
      expect(retry).toHaveFocus();
      expect(retry).toHaveAttribute("aria-disabled", "true");
      await user.keyboard("{Enter}");
      expect(fetch).toHaveBeenCalledTimes(2);
      if (continueToDecision) {
        await user.tab();
        expect(choice).toHaveFocus();
      }
      act(() =>
        finish(
          new Response(
            JSON.stringify({
              thread: {
                messages: [{ id: "reply-1", bodyText: "Synthetic reply recovered." }],
              },
            }),
          ),
        ),
      );
      expect(await screen.findByText("Synthetic reply recovered.")).toBeVisible();
      await waitFor(() =>
        expect(
          continueToDecision
            ? choice
            : screen.getByRole("heading", { name: "Owner reply" }),
        ).toHaveFocus(),
      );
      expect(screen.getByLabelText(/What the owner asked to change/)).toHaveValue(
        "Keep this staff note.",
      );
      expect(onRecord).not.toHaveBeenCalled();
    },
  );

  it("reports an unavailable exact message instead of showing another thread message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            thread: { messages: [{ id: "outbound-1", bodyText: "Another message." }] },
          }),
        ),
      ),
    );
    renderForm(LINKED_CHOICES);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "reply text could not be read",
    );
    expect(screen.queryByText("Another message.")).toBeNull();
  });
});
