// @vitest-environment jsdom

// S273 R-S273-3 / R-S273-4 / BEH-S273-4 / BEH-S273-5 / AC-S273-4 at the lease review dialog: an
// out-of-date owner message's one repair, "Review the updated owner message", opens the existing
// review with the lease's current message for the same communication; nothing is saved until the
// one confirmation, which saves the wording to that communication and authorizes it with its
// version check at the carried time (or, when that time passed, with empty fields and Send now
// offered); a failure after the save leaves it held and the step offers the retry; "Cancel the
// scheduled owner message" is its own confirmed action. Synthetic values only; no provider request.
import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { RenewalFocusViewProvider } from "@/components/lease-renewal/RenewalFocusViewContext";
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
import {
  UNSENT_MESSAGE_WORDS,
  type UnsentMessageView,
} from "@/lib/lease-renewal/unsent-message";
import {
  projectRenewalPreparation,
  type RenewalKickoffFacts,
} from "@/lib/lease-renewal/renewal-preparation";

const SEQUENCE = "4b1c1f7e-0000-4000-8000-000000009273";
const SENDER = "example-staff@example.invalid";

const FACTS: RenewalKickoffFacts = {
  numbers: {
    contractualRent: 1350,
    rentCharges: [1350],
    leaseEndIso: "2026-12-31",
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
  typedRent: null,
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
    leaseId: "9101",
    canEdit: true,
    subject: "Lease renewal for 100 Sample Street",
    plainText:
      "Hello Example,\n\nOur reviewed rental analysis suggests $1,425.00 per month.",
    htmlBody:
      "<p>Hello Example,</p><p>Our reviewed rental analysis suggests $1,425.00 per month.</p>",
    revision: "0a1b2c3d4e5f",
    to: "owner@example.invalid",
    cc: [],
    recipientReasons: [],
    senderEmail: SENDER,
    templateApproved: true,
    lastEditedAt: "2026-11-05T15:00:00.000Z",
    marked: [],
    signaturePresent: true,
    reason: "",
    composerHref: "/gmail-hub?compose=renewal_owner&lease=9101",
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

/** The step's out-of-date owner message, as the stage projection gives it. */
function outOfDate(sendAtMs: number): UnsentMessageView {
  const sendAt = new Date(sendAtMs);
  return {
    sequenceId: SEQUENCE,
    audience: "owner",
    state: "scheduled",
    kind: "scheduled_out_of_date",
    line: "Scheduled owner message is out of date.",
    differences: [
      "Rent to recommend: $1,400.00 in the scheduled message, $1,425.00 on the lease.",
    ],
    primary: { label: "Review the updated owner message", action: "update" },
    secondary: { label: "Cancel the scheduled owner message", action: "cancel" },
    cue: { kind: "out_of_date", label: UNSENT_MESSAGE_WORDS.cueOutOfDate },
    atMs: sendAtMs,
    cause: null,
    sendAt: {
      date: sendAt.toISOString().slice(0, 10),
      time: "09:00",
      timeZone: "America/Chicago",
      atMs: sendAtMs,
    },
    authorizationRevision: 1,
  };
}

function AskOwnerCard() {
  const nowCard = useRenewalNowCard();
  const primary = nowCard?.primaries["ask-owner"];
  return (
    <section aria-label="Now" data-renewal-now-step="ask-owner">
      <h2 id="renewal-now-heading" tabIndex={-1}>
        Now: Ask the owner
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
          data-renewal-now-slot-key={nowSlotKey("ask-owner", slot)}
          key={slot}
          ref={nowCard?.slotRef}
        />
      ))}
    </section>
  );
}

function mount(view: UnsentMessageView, outcomeLayout = false) {
  return render(
    <RenewalFocusViewProvider allowLegacyFocus={!outcomeLayout}>
      <RenewalNowCardProvider preparation={projectRenewalPreparation(FACTS)}>
        <AskOwnerCard />
        <PreparedMessageSlot
          compactFull={outcomeLayout}
          data={data()}
          deliveryHeld
          unsent={view}
          {...handlers()}
        />
      </RenewalNowCardProvider>
    </RenewalFocusViewProvider>,
  );
}

const requests: Array<{ url: string; body: Record<string, unknown> | null }> = [];
let storedSender = SENDER;
let storedVersion = 4;
/** What each authorization answers, in order; then the stored scheduled communication. */
let authorizations: Array<{ status: number; payload: Record<string, unknown> }>;
const STORED_DUE = Date.parse("2026-11-13T15:00:00.000Z");

function respond(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function storedSequence() {
  return {
    id: SEQUENCE,
    version: storedVersion,
    context: {
      lane: "renewals",
      entityType: "renewal_lease",
      entityId: "9101",
      purpose: "renewal_owner",
      actionKey: "gmail.renewal_notice.send",
      sourceRefs: ["rentvine:lease:9101"],
    },
    state: "active",
    confirmedCount: 0,
    authorization: { revision: 1 },
    unresolvedOccurrenceId: null,
    senderEmail: storedSender,
    initial: {
      subject: "Lease renewal for 100 Sample Street",
      paragraphs: [
        [{ text: "Our reviewed rental analysis suggests $1,400.00 per month." }],
      ],
      attachmentIds: [],
    },
    followUp: null,
    threads: [],
  };
}

beforeEach(() => {
  requests.length = 0;
  storedSender = SENDER;
  storedVersion = 4;
  authorizations = [];
  router.refresh.mockReset();
  router.push.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : null;
      requests.push({ url, body });
      if (url.startsWith("/api/gmail-hub/sequences?id="))
        return respond({ sequence: storedSequence() });
      if (url.startsWith("/api/gmail-hub/composition"))
        return respond({
          context: storedSequence().context,
          initial: {
            subject: "Lease renewal for 100 Sample Street",
            paragraphs: [
              [{ text: "Our reviewed rental analysis suggests $1,425.00 per month." }],
            ],
            attachmentIds: [],
          },
          target: {
            to: ["owner@example.invalid"],
            cc: [],
            blockers: [],
            reviewedInputs: [
              reviewedInput("to", "To", "owner@example.invalid"),
              reviewedInput("rentToRecommend", "Rent to recommend", "$1,425.00"),
            ],
          },
          reviewedTargetHash: "c".repeat(64),
        });
      if (url === "/api/gmail-hub/sequences" && body?.action === "save") {
        storedVersion += 1;
        const draft = body.draft as { id: string; initial: unknown };
        return respond({
          sequence: { ...storedSequence(), id: draft.id, initial: draft.initial },
          reviewedDraftHash: "d".repeat(64),
        });
      }
      if (
        url === "/api/gmail-hub/sequences" &&
        (body?.action === "schedule" || body?.action === "send")
      ) {
        const next = authorizations.shift();
        if (next) return respond(next.payload, next.status);
        storedVersion += 1;
        return respond({
          sequence: {
            ...storedSequence(),
            nextDueAtMs: body.action === "schedule" ? STORED_DUE : null,
            threads: body.action === "send" ? [{ threadId: "t" }] : [],
          },
        });
      }
      if (url === "/api/gmail-hub/sequences" && body?.action === "cancel") {
        storedVersion += 1;
        return respond({ sequence: { ...storedSequence(), state: "cancelled" } });
      }
      return respond({ error: "unexpected" }, 500);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const posted = (action: string) =>
  requests.filter(
    (entry) => entry.url === "/api/gmail-hub/sequences" && entry.body?.action === action,
  );

async function openUpdate(view: UnsentMessageView, outcomeLayout = false) {
  mount(view, outcomeLayout);
  await act(async () =>
    fireEvent.click(
      await screen.findByRole("button", { name: "Review the updated owner message" }),
    ),
  );
  return screen.findByRole("dialog", {}, { timeout: 8000 });
}

describe("S273 R-S273-4: one review updates the same communication", () => {
  it("BEH-S273-4 / BEH-S273-5: the review shows the lease's current message and saves nothing until the one confirmation, which saves to the same communication and schedules it at the carried time", async () => {
    const future = Date.now() + 3 * 86_400_000;
    const dialog = await openUpdate(outOfDate(future), true);
    expect(
      within(dialog).getByText("Review the updated owner message"),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent("suggests $1,425.00 per month");
    expect(dialog).toHaveTextContent(UNSENT_MESSAGE_WORDS.carriedTime);
    expect(dialog.querySelector('input[type="date"]')).toHaveValue(
      new Date(future).toISOString().slice(0, 10),
    );
    expect(dialog.querySelector('input[type="time"]')).toHaveValue("09:00");
    // Reading the review saves, claims and dispatches nothing.
    expect(posted("save")).toHaveLength(0);
    expect(posted("schedule")).toHaveLength(0);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Schedule this message" })),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posted("save")).toHaveLength(1);
    expect(posted("save")[0]!.body).toMatchObject({
      draft: { id: SEQUENCE },
      expectedVersion: 4,
    });
    expect(posted("schedule")).toHaveLength(1);
    expect(posted("schedule")[0]!.body).toMatchObject({
      id: SEQUENCE,
      expectedVersion: 5,
      reviewedDraftHash: "d".repeat(64),
      schedule: {
        firstDate: new Date(future).toISOString().slice(0, 10),
        time: "09:00",
      },
    });
    // R-S273-7: the stored time, in the settled format.
    const status = await screen.findByText(
      "Scheduled for 11/13/2026, 9:00 AM CST. It counts as sent once Gmail accepts it.",
    );
    expect(status).toBeVisible();
    expect(status).toHaveAttribute("role", "status");
    expect(status.closest("details")).toBeNull();
    expect(
      screen.getByText("Message", { exact: true }).closest("details"),
    ).not.toHaveAttribute("open");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("AC-S273-4: a past time starts the fields empty and Send now is offered", async () => {
    const dialog = await openUpdate(outOfDate(Date.now() - 86_400_000));
    expect(dialog).toHaveTextContent(UNSENT_MESSAGE_WORDS.noCarriedTime);
    expect(dialog.querySelector('input[type="date"]')).toHaveValue("");
    expect(screen.getByRole("button", { name: "Schedule this message" })).toBeDisabled();
    await act(async () =>
      fireEvent.click(within(dialog).getByRole("button", { name: "Send now" })),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Send this message" })),
    );
    await waitFor(() => expect(posted("send")).toHaveLength(1));
    expect(posted("save")).toHaveLength(1);
    expect(posted("send")[0]!.body).toMatchObject({ id: SEQUENCE, schedule: null });
  });

  it("AC-S273-4: a failure after the wording saved leaves it held, refreshes the step and retries on the same communication", async () => {
    authorizations.push({
      status: 409,
      payload: { error: "Synthetic authorization failure." },
    });
    const dialog = await openUpdate(outOfDate(Date.now() + 3 * 86_400_000));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Schedule this message" })),
    );
    await waitFor(() =>
      expect(dialog).toHaveTextContent("Synthetic authorization failure."),
    );
    expect(posted("save")).toHaveLength(1);
    expect(router.refresh).toHaveBeenCalled();
    // The retry saves over the saved version, then schedules the same communication.
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Schedule this message" })),
    );
    await waitFor(() => expect(posted("schedule")).toHaveLength(2));
    expect(posted("save")[1]!.body).toMatchObject({
      draft: { id: SEQUENCE },
      expectedVersion: 5,
    });
    expect(
      new Set(requests.flatMap((entry) => (entry.body?.id ? [entry.body.id] : []))),
    ).toEqual(new Set([SEQUENCE]));
  });

  it("R-S273-4: another sender's message is not updated here", async () => {
    storedSender = "another-staff@example.invalid";
    mount(outOfDate(Date.now() + 86_400_000));
    await act(async () =>
      fireEvent.click(
        await screen.findByRole("button", { name: "Review the updated owner message" }),
      ),
    );
    expect(
      await screen.findByText(UNSENT_MESSAGE_WORDS.notResponsible),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      requests.some((entry) => entry.url.startsWith("/api/gmail-hub/composition")),
    ).toBe(false);
    expect(posted("save")).toHaveLength(0);
  });
});

describe("S273 R-S273-3: Cancel the scheduled owner message is its own confirmed action", () => {
  it("AC-S273-6: cancel asks first, then cancels the same communication; nothing is sent", async () => {
    mount(outOfDate(Date.now() + 86_400_000));
    await act(async () =>
      fireEvent.click(
        await screen.findByRole("button", { name: "Cancel the scheduled owner message" }),
      ),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Cancel the scheduled owner message?");
    expect(posted("cancel")).toHaveLength(0);
    await act(async () =>
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Cancel the scheduled owner message",
        }),
      ),
    );
    await waitFor(() => expect(posted("cancel")).toHaveLength(1));
    expect(posted("cancel")[0]!.body).toMatchObject({
      action: "cancel",
      id: SEQUENCE,
      expectedVersion: 4,
    });
    expect(posted("send")).toHaveLength(0);
    expect(posted("schedule")).toHaveLength(0);
    expect(await screen.findByText(UNSENT_MESSAGE_WORDS.cancelled)).toBeInTheDocument();
  });

  it("R-S273-3: held for another cause opens its existing recovery in Communications", async () => {
    render(
      <RenewalNowCardProvider preparation={projectRenewalPreparation(FACTS)}>
        <AskOwnerCard />
        <PreparedMessageSlot
          data={data()}
          deliveryHeld
          unsent={{
            ...outOfDate(Date.now() + 86_400_000),
            state: "held",
            kind: "held_other",
            line: "Owner message held on 11/12/2026, 12:21 PM CST: Paused by staff.",
            differences: [],
            primary: {
              label: "Review this owner communication",
              action: "open_communication",
            },
            secondary: null,
          }}
          {...handlers()}
        />
      </RenewalNowCardProvider>,
    );
    await act(async () =>
      fireEvent.click(
        await screen.findByRole("button", { name: "Review this owner communication" }),
      ),
    );
    expect(router.push).toHaveBeenCalledWith(
      `/gmail-hub?communication=${encodeURIComponent(SEQUENCE)}`,
    );
    expect(screen.queryByRole("button", { name: /Cancel the scheduled/ })).toBeNull();
    expect(requests.filter((entry) => entry.body)).toHaveLength(0);
  });
});
