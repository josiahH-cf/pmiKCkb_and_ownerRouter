// @vitest-environment jsdom

// S276 ARCH-S276-3, BEH-S276-6, AC-S276-6 and AC-S276-7 at the tenant offer review: the follow-up
// option starts unticked and a plain Send authorizes no follow-up; ticking it fills the subject,
// the published follow-up message, the notice rules' interval, 9:00 AM, Central and a limit of 3,
// with the line that says so; staff edits survive unticking and ticking again; the existing
// stopping-bound refusal still applies; the confirmed authorization equals the reviewed values
// field for field; with the copy unpublished the message is blank and the form says why; and a
// review read again after a real change carries an unedited follow-up message to the new facts.
// Synthetic values only; no provider request.
import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

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
import { reviewedInput } from "@/lib/gmail-hub/reviewed-inputs";
import { addCalendarDays, localDateAt } from "@/lib/gmail-hub/schedule-calendar";
import {
  composeFollowUpBody,
  type FollowUpStartRead,
} from "@/lib/lease-renewal/follow-up-copy";

const LEASE = "9276";
const CYCLE = "5c1d2e3f-4a5b-4c6d-8e7f-000000009276";
const ZONE = "America/Chicago";
const SUBJECT = "Lease Renewal for 101 Sample Pl";
const FACTS = {
  address: "101 Sample Pl",
  leaseEndDate: "2026-12-31",
  rent: 1450,
  effectiveDate: "2027-01-01",
  endDate: "2027-12-31",
  names: ["Synthetic Tenant"],
  firstNames: ["Sam"],
};
const BODY = composeFollowUpBody(FACTS);
const CHANGED_BODY = composeFollowUpBody({ ...FACTS, rent: 1500 });
const LINE =
  "Filled in to start: every 10 days at 9:00 AM Central, 3 messages in total, and the standard follow-up message. Change anything before you review.";

function data(): PreparedMessageData {
  return {
    channel: "tenant",
    leaseId: LEASE,
    canEdit: true,
    subject: SUBJECT,
    plainText: "Hello Sam,\n\nYour lease ends on 12/31/2026.",
    htmlBody: "<p>Hello Sam,</p><p>Your lease ends on 12/31/2026.</p>",
    revision: "0a1b2c3d4e5f",
    to: "tenant@example.invalid",
    cc: [],
    recipientReasons: [],
    senderEmail: "example-staff@example.invalid",
    templateApproved: true,
    lastEditedAt: "2026-11-12T15:00:00.000Z",
    marked: [],
    signaturePresent: true,
    reason: "",
    composerHref: `/gmail-hub?compose=renewal_tenant&lease=${LEASE}`,
    draft: { available: true, pending: false, createdRevision: null, preview: null },
    notice: "",
  };
}

function handlers(): PreparedMessageHandlers {
  return {
    onSaveSignature: vi.fn<PreparedMessageHandlers["onSaveSignature"]>(() => null),
    onReasonChange: vi.fn<PreparedMessageHandlers["onReasonChange"]>(),
    onReasonCommit: vi.fn<PreparedMessageHandlers["onReasonCommit"]>(),
    onFlush: vi.fn<PreparedMessageHandlers["onFlush"]>(async () => true),
    onCopy: vi.fn<PreparedMessageHandlers["onCopy"]>(async () => undefined),
    onOpenComposer: vi.fn<PreparedMessageHandlers["onOpenComposer"]>(),
    onDraftPreview: vi.fn<PreparedMessageHandlers["onDraftPreview"]>(
      async () => undefined,
    ),
    onDraftCreate: vi.fn<PreparedMessageHandlers["onDraftCreate"]>(async () => undefined),
  };
}

function OfferTenantCard() {
  const nowCard = useRenewalNowCard();
  const primary = nowCard?.primaries["offer-tenant"];
  return (
    <section aria-label="Now" data-renewal-now-step="offer-tenant">
      <h2 id="renewal-now-heading" tabIndex={-1}>
        Now: Offer the tenant
      </h2>
      {primary ? (
        <button
          disabled={primary.disabled}
          onClick={(event) => primary.run(event.currentTarget)}
          type="button"
        >
          {primary.label}
        </button>
      ) : null}
      {(["message-preview", "review-and-send"] as const).map((slot) => (
        <div
          data-renewal-now-slot-key={nowSlotKey("offer-tenant", slot)}
          key={slot}
          ref={nowCard?.slotRef}
        />
      ))}
    </section>
  );
}

const requests: Array<{ url: string; body: Record<string, unknown> | null }> = [];
/** What each composition read carries for the follow-up form, in order; the last repeats. */
let followUps: Array<FollowUpStartRead | undefined>;
let sends: Array<{ status: number; payload: Record<string, unknown> }>;
let saves = 0;

function respond(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  requests.length = 0;
  saves = 0;
  sends = [];
  followUps = [{ intervalDays: 10, published: true, body: BODY }];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : null;
      requests.push({ url, body });
      if (url.startsWith("/api/gmail-hub/composition")) {
        const followUp = followUps.length > 1 ? followUps.shift() : followUps[0];
        return respond({
          context: {
            lane: "renewals",
            purpose: "renewal_tenant",
            entityType: "renewal_lease",
            entityId: LEASE,
          },
          initial: { subject: SUBJECT, paragraphs: [[{ text: "Hello Sam," }]] },
          target: {
            to: ["tenant@example.invalid"],
            cc: [],
            blockers: [],
            noticeCycleId: CYCLE,
            reviewedInputs: [reviewedInput("to", "To", "tenant@example.invalid")],
          },
          signatureParagraph: [{ text: "Example Staff" }],
          reviewedTargetHash: "target-1",
          messageRevision: "0a1b2c3d4e5f",
          ...(followUp ? { followUp } : {}),
        });
      }
      if (url === "/api/gmail-hub/sequences" && body?.action === "save") {
        saves += 1;
        const draft = body.draft as {
          id: string;
          context: unknown;
          initial: unknown;
          followUp: unknown;
        };
        return respond({
          sequence: {
            id: draft.id,
            version: saves,
            context: draft.context,
            senderEmail: "example-staff@example.invalid",
            initial: draft.initial,
            followUp: draft.followUp,
            threads: [],
            updatedAtMs: Date.now(),
          },
          reviewedDraftHash: `draft-${saves}`,
        });
      }
      if (url === "/api/gmail-hub/sequences" && body?.action === "send") {
        const next = sends.shift();
        if (next) return respond(next.payload, next.status);
        return respond({
          sequence: {
            id: body.id,
            version: 9,
            threads: [{ threadId: "t" }],
            nextDueAtMs: null,
          },
        });
      }
      return respond({ error: "unexpected" }, 500);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openReview() {
  render(
    <RenewalNowCardProvider preparation={null}>
      <OfferTenantCard />
      <PreparedMessageSlot data={data()} {...handlers()} />
    </RenewalNowCardProvider>,
  );
  await act(async () =>
    fireEvent.click(await screen.findByRole("button", { name: "Review and send" })),
  );
  return screen.findByRole("dialog", {}, { timeout: 8000 });
}

const option = () =>
  screen.getByRole("checkbox", { name: "Authorize follow-ups after the tenant offer" });
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const sendRequests = () => requests.filter((entry) => entry.body?.action === "send");
const followUpSaves = () =>
  requests.filter(
    (entry) =>
      entry.body?.action === "save" &&
      (entry.body.draft as { followUp: unknown }).followUp !== null,
  );

describe("S276 ARCH-S276-3: the follow-up form opens filled in", () => {
  it("AC-S276-6: the option is unticked on open and a plain Send authorizes no follow-up", async () => {
    await openReview();
    expect(option()).not.toBeChecked();
    expect(
      screen.queryByRole("group", { name: "Follow-up message and timing" }),
    ).toBeNull();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Send this message" })),
    );
    await waitFor(() => expect(sendRequests()).toHaveLength(1));
    expect(sendRequests()[0]!.body).toMatchObject({ action: "send", schedule: null });
    expect(followUpSaves()).toHaveLength(0);
  });

  it("BEH-S276-6 / AC-S276-6: ticking fills the subject, message, 10 days, 9:00 AM, Central and a limit of 3, with the line; the confirmed authorization holds the edited interval", async () => {
    await openReview();
    await act(async () => fireEvent.click(option()));
    const plan = screen.getByRole("group", { name: "Follow-up message and timing" });
    expect(plan).toHaveTextContent(LINE);
    expect(field("Follow-up subject").value).toBe(SUBJECT);
    expect(
      (screen.getByLabelText("Follow-up message") as HTMLTextAreaElement).value,
    ).toBe(BODY);
    expect(field("Every how many days").value).toBe("10");
    expect(field("Local send time").value).toBe("09:00");
    expect(field("Timezone").value).toBe(ZONE);
    expect(field("Inclusive end date").value).toBe("");
    expect(field("Total send limit, including the offer").value).toBe("3");
    // Nothing is authorized by ticking: no follow-up is saved or sent yet.
    expect(followUpSaves()).toHaveLength(0);
    expect(sendRequests()).toHaveLength(0);
    // Change the interval to 7 and confirm: the authorization holds exactly the reviewed values.
    fireEvent.change(field("Every how many days"), { target: { value: "7" } });
    const reviewedAtMs = Date.now();
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Send offer now and authorize follow-ups" }),
      ),
    );
    await waitFor(() => expect(sendRequests()).toHaveLength(1));
    const saved = followUpSaves()[0]!.body!.draft as {
      followUp: { subject: string; paragraphs: Array<Array<{ text: string }>> };
    };
    expect(saved.followUp.subject).toBe(SUBJECT);
    expect(saved.followUp.paragraphs.map((runs) => runs[0]!.text)).toEqual([
      ...BODY.split("\n\n"),
      "Example Staff",
    ]);
    expect(sendRequests()[0]!.body!.schedule).toEqual({
      firstDate: addCalendarDays(localDateAt(reviewedAtMs, ZONE), 7),
      time: "09:00",
      timeZone: ZONE,
      everyDays: 7,
      endDate: null,
      sendLimit: 3,
    });
  });

  it("AC-S276-6: unticking and ticking again keeps what staff last typed", async () => {
    await openReview();
    await act(async () => fireEvent.click(option()));
    fireEvent.change(field("Follow-up subject"), { target: { value: "Checking in" } });
    fireEvent.change(field("Every how many days"), { target: { value: "5" } });
    fireEvent.change(field("Local send time"), { target: { value: "10:30" } });
    fireEvent.change(field("Total send limit, including the offer"), {
      target: { value: "4" },
    });
    await act(async () => fireEvent.click(option()));
    expect(
      screen.queryByRole("group", { name: "Follow-up message and timing" }),
    ).toBeNull();
    await act(async () => fireEvent.click(option()));
    expect(field("Follow-up subject").value).toBe("Checking in");
    expect(field("Every how many days").value).toBe("5");
    expect(field("Local send time").value).toBe("10:30");
    expect(field("Total send limit, including the offer").value).toBe("4");
  });

  it("AC-S276-6: clearing the limit and the end date leaves the existing stopping-bound refusal", async () => {
    await openReview();
    await act(async () => fireEvent.click(option()));
    fireEvent.change(field("Total send limit, including the offer"), {
      target: { value: "" },
    });
    expect(
      screen.getByText(
        "Enter the complete message, recurrence and at least one stopping bound.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Send offer now and authorize follow-ups" }),
    ).toBeDisabled();
  });
});

describe("S276 R-S276-8: the follow-up copy at the form", () => {
  it("AC-S276-7: with the copy unpublished the message is blank, the form names the unpublished copy and the timing is filled in", async () => {
    followUps = [{ intervalDays: 10, published: false, body: null }];
    await openReview();
    await act(async () => fireEvent.click(option()));
    const plan = screen.getByRole("group", { name: "Follow-up message and timing" });
    expect(plan).toHaveTextContent(
      "The standard follow-up message is not published yet. Write the follow-up, or ask a template approver to publish it.",
    );
    expect(plan).toHaveTextContent(
      "Filled in to start: every 10 days at 9:00 AM Central, 3 messages in total. Change anything before you review.",
    );
    expect(
      (screen.getByLabelText("Follow-up message") as HTMLTextAreaElement).value,
    ).toBe("");
    expect(field("Every how many days").value).toBe("10");
    expect(field("Local send time").value).toBe("09:00");
    expect(field("Total send limit, including the offer").value).toBe("3");
    expect(
      screen.getByRole("button", { name: "Send offer now and authorize follow-ups" }),
    ).toBeDisabled();
  });

  it("AC-S276-6: an Admin-saved interval of 14 reads 14", async () => {
    followUps = [{ intervalDays: 14, published: true, body: BODY }];
    await openReview();
    await act(async () => fireEvent.click(option()));
    expect(field("Every how many days").value).toBe("14");
    expect(
      screen.getByRole("group", { name: "Follow-up message and timing" }),
    ).toHaveTextContent("every 14 days at 9:00 AM Central");
  });

  it("AC-S276-7: the reviewed rent changes before confirming and an unedited follow-up message follows it", async () => {
    followUps = [
      { intervalDays: 10, published: true, body: BODY },
      { intervalDays: 10, published: true, body: CHANGED_BODY },
    ];
    sends.push({
      status: 409,
      payload: {
        code: "target_changed",
        changes: [
          {
            key: "renewalRent",
            label: "Renewal rent",
            previous: "$1,450.00",
            current: "$1,500.00",
          },
        ],
        error: "The recipients or source facts changed after the preview.",
      },
    });
    const dialog = await openReview();
    await act(async () => fireEvent.click(option()));
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Send offer now and authorize follow-ups" }),
      ),
    );
    await waitFor(() =>
      expect(dialog).toHaveTextContent("Renewal rent: was $1,450.00, now $1,500.00"),
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Follow-up message") as HTMLTextAreaElement).value,
      ).toBe(CHANGED_BODY),
    );
    expect(
      (screen.getByLabelText("Follow-up message") as HTMLTextAreaElement).value,
    ).toContain("$1,500.00");
  });
});
