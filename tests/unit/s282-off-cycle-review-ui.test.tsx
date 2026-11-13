// @vitest-environment jsdom

// S282 R-S282-1, R-S282-4 (AC-S282-1, AC-S282-4, BEH-S282-1, BEH-S282-2, BEH-S282-5): the off-cycle
// end date review form on Check the numbers and the readiness row both send lists show while the
// hold stands. Fail-first on the starting state: the form did not exist, and the readiness list
// held only its fixed send keys, so five rows read Ready while the send was blocked.
// Synthetic values only; nothing here reads a source or sends.
import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { OffCycleReviewForm } from "@/components/lease-renewal/RenewalOffCycleReview";
import {
  nowSlotKey,
  RenewalNowCardProvider,
  useRenewalNowCard,
} from "@/components/lease-renewal/RenewalNowCardContext";
import {
  PreparedMessageSlot,
  type PreparedMessageData,
  type PreparedMessageHandlers,
} from "@/components/lease-renewal/RenewalPreparedMessage";
import {
  OFF_CYCLE_REVIEW_FIRST_CONTROL,
  OFF_CYCLE_REVIEW_TARGET,
  offCycleReadinessItem,
  offCycleStageBlocker,
  type OffCycleEndDateReview,
} from "@/lib/lease-renewal/off-cycle-review";
import {
  projectRenewalPreparation,
  type RenewalKickoffFacts,
} from "@/lib/lease-renewal/renewal-preparation";
import type { RenewalWorkspaceAction } from "@/lib/lease-renewal/workspace-state";

const OFF_CYCLE_END = "2027-01-14";
const CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const STAFF = "editor1@pmikcmetro.com";

function review(
  decision: "include" | "hold",
  endDateIso = OFF_CYCLE_END,
  n = 1,
): OffCycleEndDateReview {
  return {
    eventId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    cycleId: CYCLE_ID,
    endDateIso,
    decision,
    reason: decision === "include" ? "Owner confirmed the date" : "Waiting on the owner",
    actorUid: "editor-1",
    actorLabel: STAFF,
    recordedAt: "2026-11-13T16:00:00.000Z",
  };
}

function form(
  props: Partial<Parameters<typeof OffCycleReviewForm>[0]> = {},
  onRecord = vi.fn<(action: RenewalWorkspaceAction) => Promise<void>>(
    async () => undefined,
  ),
) {
  render(
    <OffCycleReviewForm
      canEdit
      fact={{ endDateIso: OFF_CYCLE_END }}
      onRecord={onRecord}
      reviews={[]}
      {...props}
    />,
  );
  return { onRecord };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("R-S282-1: the review form on Check the numbers", () => {
  it("R-S282-1: names the date, its source, the two decisions, a reason and Save, with a link to retirement", () => {
    form();
    const region = screen.getByRole("region", { name: "Lease end date review" });
    expect(region).toHaveAttribute("id", OFF_CYCLE_REVIEW_TARGET);
    expect(region).toHaveTextContent(
      "This lease ends 01/14/2027, which is not a month end.",
    );
    expect(region).toHaveTextContent("Source: RentVine lease end date.");
    const include = screen.getByRole("radio", { name: "Include in this renewal month" });
    expect(include).toHaveAttribute("id", OFF_CYCLE_REVIEW_FIRST_CONTROL);
    expect(include).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Keep on hold" })).not.toBeChecked();
    expect(screen.getByRole("textbox", { name: "Reason" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(region).toHaveTextContent(
      "To leave this lease out of renewal work, use Retire from renewals under Record work.",
    );
    expect(screen.getByRole("button", { name: "Record work" })).toBeInTheDocument();
  });

  it("AC-S282-1: Save without a reason is refused in place with the typed decision kept", async () => {
    const { onRecord } = form();
    fireEvent.click(screen.getByRole("radio", { name: "Keep on hold" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a short reason for this decision.",
    );
    expect(screen.getByRole("radio", { name: "Keep on hold" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Reason" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(onRecord).not.toHaveBeenCalled();
  });

  it("AC-S282-1: Save without a decision is refused in place with the typed reason kept", async () => {
    const { onRecord } = form();
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), {
      target: { value: "Owner confirmed" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose Include in this renewal month or Keep on hold.",
    );
    expect(screen.getByRole("textbox", { name: "Reason" })).toHaveValue(
      "Owner confirmed",
    );
    expect(onRecord).not.toHaveBeenCalled();
  });

  it("BEH-S282-2: Save records one review for the exact end date shown, through the staff record", async () => {
    const { onRecord } = form();
    fireEvent.click(screen.getByRole("radio", { name: "Include in this renewal month" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), {
      target: { value: "  Owner confirmed the date  " },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(onRecord).toHaveBeenCalledTimes(1);
    expect(onRecord).toHaveBeenCalledWith({
      kind: "end_date_review",
      decision: "include",
      endDateIso: OFF_CYCLE_END,
      reason: "Owner confirmed the date",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
  });

  it("AC-S282-1: a refused save keeps the entries and shows the reason", async () => {
    const onRecord = vi.fn<(action: RenewalWorkspaceAction) => Promise<void>>(
      async () => {
        throw new Error(
          "Another operator changed this item. Review the current record, then save your entry again if it still applies.",
        );
      },
    );
    form({}, onRecord);
    fireEvent.click(screen.getByRole("radio", { name: "Keep on hold" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), {
      target: { value: "Waiting on the owner" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/Another operator changed/);
    expect(screen.getByRole("radio", { name: "Keep on hold" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Reason" })).toHaveValue(
      "Waiting on the owner",
    );
  });

  it("BEH-S282-3: a recorded hold shows its reason, who set it and when", () => {
    form({ reviews: [review("hold")] });
    expect(screen.getByRole("region", { name: "Lease end date review" })).toHaveAttribute(
      "data-renewal-off-cycle-state",
      "held",
    );
    expect(screen.getByText(/Off-cycle end date: on hold by/)).toHaveTextContent(
      `Off-cycle end date: on hold by ${STAFF} on 11/13/2026. Reason: Waiting on the owner.`,
    );
  });

  it("BEH-S282-4: a decision for another end date is history, and this date asks again", () => {
    form({ reviews: [review("include", "2027-01-20", 1)] });
    const region = screen.getByRole("region", { name: "Lease end date review" });
    expect(region).toHaveAttribute("data-renewal-off-cycle-state", "needs_review");
    expect(screen.queryByText(/included by/)).toBeNull();
    const history = screen.getByText("Earlier decisions").closest("details")!;
    expect(history.querySelectorAll("li")).toHaveLength(1);
    expect(history.querySelector("li")).toHaveTextContent(
      /Lease end 01\/20\/2027: Include in this renewal month\. Owner confirmed the date\. Recorded by editor1@pmikcmetro\.com/,
    );
  });

  it("BEH-S282-5: a read-only person sees the decision and cannot save one", () => {
    form({ canEdit: false, reviews: [review("include")] });
    expect(screen.getByText(/Off-cycle end date: included by/)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(
      screen.getByText(
        "You can read this review. Recording one needs Editor access in Renewals.",
      ),
    ).toBeInTheDocument();
  });
});

const FACTS: RenewalKickoffFacts = {
  numbers: {
    contractualRent: 1350,
    rentCharges: [1350],
    leaseEndIso: OFF_CYCLE_END,
    workingRent: null,
    sheetRent: null,
    sheetEndIso: null,
    sourceReadable: true,
  },
  comparison: {
    state: "stored",
    comparison: {
      observationId: "observation-1",
      observedAtIso: "2026-11-04T15:00:00.000Z",
      source: "RentCast",
      rangeLow: 1300,
      rangeHigh: 1500,
      compCount: 3,
      comps: [
        { rent: 1380, distanceMiles: 0.4 },
        { rent: 1420, distanceMiles: 0.6 },
        { rent: 1460, distanceMiles: 0.9 },
      ],
    },
  },
  typedRent: 1420,
  agreementRent: null,
  currentRent: 1350,
  ownerRecipient: { state: "ready" },
  signature: true,
  templateApproved: true,
  address: "100 Sample Street",
};

function data(): PreparedMessageData {
  return {
    channel: "owner",
    leaseId: "9106",
    canEdit: true,
    subject: "Lease renewal for 100 Sample Street",
    plainText:
      "Hello Example,\n\nOur reviewed rental analysis suggests $1,420.00 per month.",
    htmlBody:
      "<p>Hello Example,</p><p>Our reviewed rental analysis suggests $1,420.00 per month.</p>",
    revision: "0a1b2c3d4e5f",
    to: "owner@example.invalid",
    cc: [],
    recipientReasons: [],
    senderEmail: "example-staff@example.invalid",
    templateApproved: true,
    lastEditedAt: "2026-11-05T15:00:00.000Z",
    marked: [],
    signaturePresent: true,
    reason: "",
    composerHref: "/gmail-hub?compose=renewal_owner&lease=9106",
    draft: { available: true, pending: false, createdRevision: null, preview: null },
    notice: "",
  };
}

function handlers(): PreparedMessageHandlers {
  return {
    onSaveSignature: vi.fn(() => null),
    onReasonChange: vi.fn(),
    onReasonCommit: vi.fn(),
    onFlush: vi.fn(async () => true),
    onCopy: vi.fn(async () => undefined),
    onOpenComposer: vi.fn(),
    onDraftPreview: vi.fn(async () => undefined),
    onDraftCreate: vi.fn(async () => undefined),
  } as unknown as PreparedMessageHandlers;
}

/** The Now card's ask-owner step: its two slots and its one primary action. */
function AskOwnerCard() {
  const nowCard = useRenewalNowCard();
  const primary = nowCard?.primaries["ask-owner"];
  return (
    <section aria-label="Now" data-renewal-now-step="ask-owner">
      {primary ? (
        <button onClick={(event) => primary.run(event.currentTarget)} type="button">
          {primary.label}
        </button>
      ) : null}
      {(["message-preview", "review-and-send"] as const).map((slot) => (
        <div
          data-renewal-now-slot-key={nowSlotKey("ask-owner", slot)}
          key={slot}
          ref={nowCard?.slotRef}
        />
      ))}
    </section>
  );
}

function readiness(reviews: readonly OffCycleEndDateReview[]) {
  const blocker = offCycleStageBlocker({ endDateIso: OFF_CYCLE_END }, reviews);
  render(
    <RenewalNowCardProvider preparation={projectRenewalPreparation(FACTS)}>
      <AskOwnerCard />
      <PreparedMessageSlot
        data={data()}
        offCycleHold={offCycleReadinessItem(blocker)}
        {...handlers()}
      />
    </RenewalNowCardProvider>,
  );
  return screen.getByRole("list", { name: "What sending needs" });
}

describe("AC-S282-4 / BEH-S282-1: the readiness list names the hold and the action names the fix", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 500 })),
    );
  });

  it("BEH-S282-1: while the hold stands the end date row is not ready and the action reads Review the lease end date", async () => {
    const list = readiness([]);
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveAttribute("data-renewal-ready", "missing");
    expect(rows[0]).toHaveTextContent("Lease end date: needs review (off-cycle)");
    expect(
      rows.filter((row) => row.getAttribute("data-renewal-ready") === "ready"),
    ).toHaveLength(rows.length - 1);
    expect(
      await screen.findByRole("button", { name: "Review the lease end date" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review and send" })).toBeNull();
  });

  it("AC-S282-4: a recorded hold keeps the row; Include removes it and the action returns to Review and send", async () => {
    const held = readiness([review("hold")]);
    expect(held).toHaveTextContent("Lease end date: needs review (off-cycle)");
    cleanup();
    const included = readiness([review("include")]);
    expect(included).not.toHaveTextContent(/Lease end date/);
    expect(
      within(included)
        .getAllByRole("listitem")
        .every((row) => row.getAttribute("data-renewal-ready") === "ready"),
    ).toBe(true);
    expect(
      await screen.findByRole("button", { name: "Review and send" }),
    ).toBeInTheDocument();
  });
});
