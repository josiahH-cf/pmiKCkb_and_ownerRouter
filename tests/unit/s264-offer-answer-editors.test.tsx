// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  offerAnswersViewOf,
  OwnerOfferApproval,
  OwnerOfferCoverageLine,
  TenantOfferAnswer,
  useOfferAnswers,
  type OfferAnswersView,
} from "@/components/lease-renewal/RenewalOfferAnswers";
import {
  RenewalNowCardProvider,
  useRenewalNowCard,
} from "@/components/lease-renewal/RenewalNowCardContext";

// S264 R-S264-6 at the existing response editors: a tenant decision records which exact offer it
// answers (a confirmed send, or an app-prepared offer staff verified was sent, with where they
// verified it, or not one exact offer); a wait shows nothing; the coverage line is the server's,
// shown only for the work record's current answer. The owner's choice to cover the reviewed
// offer's charges appears only for an offer with charges. The view comes with the tenant
// message's own read through the Now card context; the editors make no request of their own.

afterEach(() => cleanup());

const VIEW: OfferAnswersView = {
  current: {
    snapshotId: "offer:7263:cycle:abc",
    snapshotHash: "a".repeat(64),
    summary: "Rent $920.00 per month; Pet rent $50.00 per month",
    charged: true,
  },
  candidates: [
    {
      kind: "linked_communication",
      sequenceId: "sequence-1",
      occurrenceId: "occurrence-1",
      at: "2026-11-09T16:00:00.000Z",
      snapshotId: "offer:7263:cycle:old",
      summary: "Rent $920.00 per month; Pet rent $45.00 per month",
      current: false,
    },
    {
      kind: "external_offer",
      executionId: "exec_created",
      at: "2026-11-08T16:00:00.000Z",
      snapshotId: "offer:7263:cycle:old",
      summary: "Rent $920.00 per month; Pet rent $45.00 per month",
      current: false,
    },
  ],
  tenant: {
    outcome: "accepted",
    eventId: "event-1",
    attribution: "linked_communication",
    answered: "Rent $920.00 per month; Pet rent $45.00 per month",
    coverage: "earlier_offer",
    line: "Current acceptance needs verification: it answers an earlier offer. Pet rent changed ($45.00 to $50.00).",
  },
  owner: {
    eventId: "event-owner",
    scope: "offer_snapshot",
    coverage: "earlier_offer",
    line: "The owner approved an earlier offer, so the current offer's charges are not covered. Pet rent changed ($45.00 to $50.00).",
  },
};

describe("S264 AC-S264-6 the tenant response names the exact offer it answers", () => {
  it("shows the recorded coverage and records a confirmed send, a verified external offer or no one exact offer", () => {
    const onRecord = vi.fn();
    render(
      <TenantOfferAnswer
        answers={{ view: VIEW, failed: false }}
        canEdit
        eventId="event-1"
        onRecord={onRecord}
        outcome="accepted"
        pending={false}
      />,
    );
    expect(screen.getByRole("note")).toHaveTextContent(
      "Current acceptance needs verification: it answers an earlier offer. Pet rent changed ($45.00 to $50.00).",
    );
    expect(screen.getByText(/^Answers the offer:/)).toHaveTextContent(
      "Answers the offer: Rent $920.00 per month; Pet rent $45.00 per month.",
    );
    const choice = screen.getByLabelText("Which offer does this answer respond to?");
    expect([...(choice as HTMLSelectElement).options].map((option) => option.textContent)).toEqual([
      "Choose the offer",
      "Sent 11/9/2026: Rent $920.00 per month; Pet rent $45.00 per month",
      "Gmail draft prepared 11/8/2026, sent from Gmail: Rent $920.00 per month; Pet rent $45.00 per month",
      "Not one exact offer (record the answer as it is)",
    ]);
    const button = screen.getByRole("button", { name: "Record the offer this answers" });
    expect(button).toBeDisabled();
    fireEvent.change(choice, { target: { value: "sent:sequence-1:occurrence-1" } });
    fireEvent.click(button);
    expect(onRecord).toHaveBeenLastCalledWith({
      kind: "linked_communication",
      sequenceId: "sequence-1",
      occurrenceId: "occurrence-1",
    });
    // An external offer needs where staff verified it was sent.
    fireEvent.change(choice, { target: { value: "draft:exec_created" } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Where you verified it was sent"), {
      target: { value: "Synthetic Gmail Sent entry, 11/09/2026" },
    });
    fireEvent.click(button);
    expect(onRecord).toHaveBeenLastCalledWith({
      kind: "external_offer",
      executionId: "exec_created",
      reference: "Synthetic Gmail Sent entry, 11/09/2026",
    });
    fireEvent.change(choice, { target: { value: "unattributed" } });
    fireEvent.click(button);
    expect(onRecord).toHaveBeenLastCalledWith({ kind: "unattributed" });
  });

  it("a read of another answer shows no coverage for this one; the offer can still be named", () => {
    render(
      <TenantOfferAnswer
        answers={{ view: VIEW, failed: false }}
        canEdit
        eventId="event-2"
        onRecord={() => undefined}
        outcome="accepted"
        pending={false}
      />,
    );
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Answers the offer:/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Which offer does this answer respond to?")).toBeEnabled();
  });

  it("a wait or a check answers no offer, and an unread view asks nothing; an unreadable one says so", () => {
    const { container, rerender } = render(
      <TenantOfferAnswer
        answers={{ view: VIEW, failed: false }}
        canEdit
        eventId="event-1"
        onRecord={() => undefined}
        outcome="awaiting_response"
        pending={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <TenantOfferAnswer
        answers={{ view: null, failed: false }}
        canEdit
        eventId="event-1"
        onRecord={() => undefined}
        outcome="accepted"
        pending={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <TenantOfferAnswer
        answers={{ view: null, failed: true }}
        canEdit
        eventId="event-1"
        onRecord={() => undefined}
        outcome="accepted"
        pending={false}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The offers this answer could respond to could not be read. Reload to review them.",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("S264 AC-S264-6 the owner approval covers the offer's charges only when chosen", () => {
  it("offers the choice with the reviewed charges, and shows the recorded coverage of the current answer", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <>
        <OwnerOfferApproval
          answers={{ view: VIEW, failed: false }}
          checked={false}
          disabled={false}
          onChange={onChange}
        />
        <OwnerOfferCoverageLine answers={{ view: VIEW }} eventId="event-owner" />
      </>,
    );
    const box = screen.getByLabelText("The owner approved these exact offer charges");
    expect(screen.getByText(/as listed\.$/)).toHaveTextContent(
      "Rent $920.00 per month; Pet rent $50.00 per month. Choose this only when the owner approved these charges as listed.",
    );
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(document.querySelector('[data-offer-answer-line="owner"]')).toHaveTextContent(
      VIEW.owner!.line,
    );
    rerender(<OwnerOfferCoverageLine answers={{ view: VIEW }} eventId="event-other" />);
    expect(document.querySelector('[data-offer-answer-line="owner"]')).toBeNull();
  });

  it("an offer with no charge rows asks nothing", () => {
    const { container } = render(
      <OwnerOfferApproval
        answers={{
          view: { ...VIEW, current: { ...VIEW.current!, charged: false } },
          failed: false,
        }}
        checked={false}
        disabled={false}
        onChange={() => undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("S264 AC-S264-6 the view travels with the tenant message read", () => {
  it("keeps only a view in the expected shape", () => {
    expect(offerAnswersViewOf(VIEW)).toBe(VIEW);
    expect(offerAnswersViewOf(undefined)).toBeNull();
    expect(offerAnswersViewOf({ ...VIEW, candidates: [{ kind: "newest_draft" }] })).toBeNull();
    expect(offerAnswersViewOf({ ...VIEW, tenant: { outcome: "accepted" } })).toBeNull();
    expect(
      offerAnswersViewOf({ ...VIEW, owner: { ...VIEW.owner!, eventId: undefined } }),
    ).toBeNull();
  });

  it("the response editors read the view the tenant message published, with no request", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    function Publisher() {
      const setOfferAnswers = useRenewalNowCard()?.setOfferAnswers;
      useEffect(() => {
        setOfferAnswers?.({ view: VIEW, failed: false });
      }, [setOfferAnswers]);
      return null;
    }
    function Editor() {
      return (
        <TenantOfferAnswer
          answers={useOfferAnswers()}
          canEdit={false}
          eventId="event-1"
          onRecord={() => undefined}
          outcome="accepted"
          pending={false}
        />
      );
    }
    render(
      <RenewalNowCardProvider preparation={null}>
        <Publisher />
        <Editor />
      </RenewalNowCardProvider>,
    );
    expect(screen.getByRole("note")).toHaveTextContent(VIEW.tenant!.line);
    expect(
      screen.queryByLabelText("Which offer does this answer respond to?"),
    ).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
