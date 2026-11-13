// @vitest-environment jsdom

// S274 BEH-S274-2, BEH-S274-5, R-S274-2, R-S274-3 and R-S274-5 at the lease review dialog: a Send
// refused while the lease is still being re-read keeps the review, its content and its button and
// says so in one line; a Send refused for a real change reloads the review in place, names each
// changed value with its previous value, keeps confirm disabled while reloading and sends the
// reloaded message on one more confirmation. Synthetic values only; no provider request.
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
  compositionWaitsOnRead,
  PreparedMessageSlot,
  type PreparedMessageData,
  type PreparedMessageHandlers,
} from "@/components/lease-renewal/RenewalPreparedMessage";
import {
  LEASE_READ_NOT_SETTLED_MESSAGE,
  reviewedInput,
} from "@/lib/gmail-hub/reviewed-inputs";
import { NOTICE_GENERATION_NOT_READY } from "@/lib/lease-renewal/notice-source-error";
import {
  projectRenewalPreparation,
  type RenewalKickoffFacts,
} from "@/lib/lease-renewal/renewal-preparation";

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
      "Hello Example,\n\nOur reviewed rental analysis suggests $1,400.00 per month.",
    htmlBody:
      "<p>Hello Example,</p><p>Our reviewed rental analysis suggests $1,400.00 per month.</p>",
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

function mount() {
  return render(
    <RenewalNowCardProvider preparation={projectRenewalPreparation(FACTS)}>
      <AskOwnerCard />
      <PreparedMessageSlot data={data()} {...handlers()} />
    </RenewalNowCardProvider>,
  );
}

const requests: Array<{ url: string; body: Record<string, unknown> | null }> = [];
/** What each composition read answers, in order; the last entry repeats. */
let compositions: Array<{
  rent: string;
  blockers?: string[];
  readSettlement?: { state: "settled" } | { state: "not_settled"; reason: string };
  hold?: Promise<void>;
}>;
/** What each send answers, in order; then a send that Gmail accepted. */
let sends: Array<{ status: number; payload: Record<string, unknown> }>;
let saves = 0;

function respond(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function composition(rent: string) {
  return {
    subject: "Lease renewal for 100 Sample Street",
    paragraphs: [[{ text: `Our reviewed rental analysis suggests ${rent} per month.` }]],
  };
}

beforeEach(() => {
  requests.length = 0;
  saves = 0;
  compositions = [{ rent: "$1,400.00" }];
  sends = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : null;
      requests.push({ url, body });
      if (url.startsWith("/api/gmail-hub/composition")) {
        const next = compositions.length > 1 ? compositions.shift()! : compositions[0]!;
        if (next.hold) await next.hold;
        return respond({
          context: {
            purpose: "renewal_owner",
            entityType: "renewal_lease",
            entityId: "9101",
          },
          initial: composition(next.rent),
          target: {
            to: ["owner@example.invalid"],
            cc: [],
            blockers: next.blockers ?? [],
            ...(next.readSettlement ? { readSettlement: next.readSettlement } : {}),
            reviewedInputs: [
              reviewedInput("to", "To", "owner@example.invalid"),
              reviewedInput("rentToRecommend", "Rent to recommend", next.rent),
            ],
          },
          reviewedTargetHash: `target-${next.rent}`,
          messageRevision: "0a1b2c3d4e5f",
        });
      }
      if (url === "/api/gmail-hub/sequences" && body?.action === "save") {
        saves += 1;
        const draft = body.draft as { id: string; initial: unknown };
        return respond({
          sequence: {
            id: draft.id,
            version: saves,
            senderEmail: "example-staff@example.invalid",
            initial: draft.initial,
            threads: [],
          },
          reviewedDraftHash: `draft-${saves}`,
        });
      }
      if (url === "/api/gmail-hub/sequences" && body?.action === "send") {
        const next = sends.shift();
        if (next) return respond(next.payload, next.status);
        return respond({
          sequence: { id: body.id, version: 9, threads: [{ threadId: "t" }] },
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
  mount();
  await act(async () =>
    fireEvent.click(await screen.findByRole("button", { name: "Review and send" })),
  );
  return screen.findByRole("dialog", {}, { timeout: 8000 });
}

const sendRequests = () => requests.filter((entry) => entry.body?.action === "send");

describe("S274 the lease review dialog at Send", () => {
  it("R-S274-5: Send carries the inputs the review displayed, only to name what changed", async () => {
    await openReview();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Send this message" })),
    );
    await waitFor(() => expect(sendRequests()).toHaveLength(1));
    expect(sendRequests()[0]!.body).toMatchObject({
      reviewedTargetHash: "target-$1,400.00",
      reviewedInputs: [
        { key: "to", label: "To", value: "owner@example.invalid" },
        { key: "rentToRecommend", label: "Rent to recommend", value: "$1,400.00" },
      ],
    });
  });

  it("BEH-S274-5 / AC-S274-2: a lease read still settling keeps the review, its content and its button, in one line", async () => {
    sends.push({
      status: 409,
      payload: {
        code: "lease_read_not_settled",
        reason: "generation_not_ready",
        retryable: true,
        error: LEASE_READ_NOT_SETTLED_MESSAGE,
      },
    });
    const dialog = await openReview();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Send this message" })),
    );
    await waitFor(() => expect(dialog).toHaveTextContent(LEASE_READ_NOT_SETTLED_MESSAGE));
    // The exact line, with no "changed" wording and nothing appended.
    expect(dialog).not.toHaveTextContent(/changed after the preview/);
    expect(dialog).not.toHaveTextContent(/nothing is sent twice/);
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(dialog).toHaveTextContent("owner@example.invalid");
    expect(dialog).toHaveTextContent("suggests $1,400.00 per month");
    expect(screen.getByRole("button", { name: "Send this message" })).toBeEnabled();
    // Nothing was read again; a second Send is the same review and sends.
    expect(
      requests.filter((entry) => entry.url.startsWith("/api/gmail-hub/composition")),
    ).toHaveLength(1);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Send this message" })),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sendRequests()).toHaveLength(2);
    expect(sendRequests()[1]!.body).toMatchObject({
      reviewedTargetHash: "target-$1,400.00",
    });
  });

  it("BEH-S274-2 / AC-S274-4: a real change is refused once, the review reloads in place with the change named, and a second Send sends the reloaded message", async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    sends.push({
      status: 409,
      payload: {
        code: "target_changed",
        changes: [
          {
            key: "rentToRecommend",
            label: "Rent to recommend",
            previous: "$1,400.00",
            current: "$1,425.00",
          },
        ],
        error:
          "The recipients or source facts changed after the preview. Rent to recommend: was $1,400.00, now $1,425.00. Review the current message before Send or Schedule.",
      },
    });
    compositions = [{ rent: "$1,400.00" }, { rent: "$1,425.00", hold }];
    const dialog = await openReview();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Send this message" })),
    );
    // Reloading in place: confirm stays disabled until the current review reads back.
    await waitFor(() =>
      expect(
        screen.getByText("Loading the current message from the lease…"),
      ).toBeVisible(),
    );
    expect(screen.getByRole("button", { name: "Send this message" })).toBeDisabled();
    await act(async () => release());
    await waitFor(() =>
      expect(dialog).toHaveTextContent("Rent to recommend: was $1,400.00, now $1,425.00"),
    );
    expect(dialog).toHaveTextContent(
      "The recipients or source facts changed after the preview. The message below is current. Confirm again to send it.",
    );
    expect(dialog).toHaveTextContent("suggests $1,425.00 per month");
    expect(screen.getByRole("dialog")).toBe(dialog);
    // The lease message is not saved again by the reload; the communication draft is.
    expect(saves).toBe(2);
    expect(sendRequests()).toHaveLength(1);
    const confirm = screen.getByRole("button", { name: "Send this message" });
    expect(confirm).toBeEnabled();
    await act(async () => fireEvent.click(confirm));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sendRequests()).toHaveLength(2);
    expect(sendRequests()[1]!.body).toMatchObject({
      reviewedTargetHash: "target-$1,425.00",
      reviewedDraftHash: "draft-2",
      reviewedInputs: [
        { key: "to", label: "To", value: "owner@example.invalid" },
        { key: "rentToRecommend", label: "Rent to recommend", value: "$1,425.00" },
      ],
    });
  });

  it("R-S274-2: a review read on a lease read that did not settle is read again before it is shown", async () => {
    compositions = [
      {
        rent: "$1,400.00",
        blockers: [
          "Retirement status is unavailable. Refresh the current cycle before preparing or releasing a message.",
        ],
        readSettlement: { state: "not_settled", reason: "retirement_not_fresh" },
      },
      { rent: "$1,400.00" },
    ];
    const dialog = await openReview();
    expect(dialog).toHaveTextContent("owner@example.invalid");
    expect(
      requests.filter((entry) => entry.url.startsWith("/api/gmail-hub/composition")),
    ).toHaveLength(2);
    expect(sendRequests()).toHaveLength(0);
  });

  it("only an unsettled read or the replaced generation alone is read again", () => {
    expect(compositionWaitsOnRead({ blockers: [NOTICE_GENERATION_NOT_READY] })).toBe(
      true,
    );
    expect(
      compositionWaitsOnRead({
        blockers: ["A verified owner recipient is needed."],
        readSettlement: { state: "not_settled", reason: "retirement_not_fresh" },
      }),
    ).toBe(true);
    expect(
      compositionWaitsOnRead({
        blockers: ["A verified owner recipient is needed."],
        readSettlement: { state: "settled" },
      }),
    ).toBe(false);
    expect(compositionWaitsOnRead({ blockers: [] })).toBe(false);
  });
});
