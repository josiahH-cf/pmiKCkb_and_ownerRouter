// @vitest-environment jsdom

// S249 R-S249-7 to R-S249-12 / BEH-S249-1, BEH-S249-2, BEH-S249-4: the Now card block the lease's
// one message record fills. "Review and send" is the step's one primary action; it saves the
// message, reads the lease composition, saves the communication draft and shows the exact review;
// one confirmation sends it under the existing reviewed hashes. Schedule, Create Gmail draft
// instead and Copy are secondary on the same card. Synthetic values only.
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
  COMPOSITION_REREAD_WAITS_MS,
  onlyGenerationBeingReplaced,
  PreparedMessageSlot,
  type PreparedMessageData,
  type PreparedMessageHandlers,
} from "@/components/lease-renewal/RenewalPreparedMessage";
import { messageRevisionLabel } from "@/lib/lease-renewal/message-revision";
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

function data(overrides: Partial<PreparedMessageData> = {}): PreparedMessageData {
  return {
    channel: "owner",
    leaseId: "9101",
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
    composerHref: "/gmail-hub?compose=renewal_owner&lease=9101",
    draft: { available: true, pending: false, createdRevision: null, preview: null },
    notice: "",
    ...overrides,
  };
}

function handlers() {
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

/** The Now card's ask-owner step: its two slots and its one primary action. */
function AskOwnerCard() {
  const nowCard = useRenewalNowCard();
  const primary = nowCard?.primaries["ask-owner"];
  return (
    <section aria-label="Now">
      {primary ? (
        <p>
          <button disabled={primary.disabled} onClick={primary.run} type="button">
            {primary.label}
          </button>
          {primary.reason ? <span data-testid="send-needs">{primary.reason}</span> : null}
        </p>
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

function mount(
  overrides: Partial<PreparedMessageData> = {},
  on = handlers(),
  facts = FACTS,
) {
  const view = render(
    <RenewalNowCardProvider preparation={projectRenewalPreparation(facts)}>
      <AskOwnerCard />
      <PreparedMessageSlot data={data(overrides)} {...on} />
    </RenewalNowCardProvider>,
  );
  return { view, on };
}

let fetchMock: ReturnType<typeof vi.fn>;
const requests: Array<{ url: string; body: Record<string, unknown> | null }> = [];
/** The blockers each composition read answers with, in order; none once the list is used up. */
const compositionBlockers: string[][] = [];

function respond(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  requests.length = 0;
  compositionBlockers.length = 0;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : null;
    requests.push({ url, body });
    if (url.startsWith("/api/gmail-hub/composition"))
      return respond({
        context: {
          purpose: "renewal_owner",
          entityType: "renewal_lease",
          entityId: "9101",
        },
        initial: {
          subject: "Lease renewal for 100 Sample Street",
          paragraphs: [
            [{ text: "Our reviewed rental analysis suggests $1,420.00 per month." }],
          ],
        },
        target: {
          to: ["owner@example.invalid"],
          cc: [],
          blockers: compositionBlockers.shift() ?? [],
        },
        reviewedTargetHash: "target-hash",
        messageRevision: "0a1b2c3d4e5f",
      });
    if (url === "/api/gmail-hub/sequences" && body?.action === "save")
      return respond({
        sequence: {
          id: (body.draft as { id: string }).id,
          version: 1,
          senderEmail: "example-staff@example.invalid",
          initial: {
            subject: "Lease renewal for 100 Sample Street",
            paragraphs: [
              [{ text: "Our reviewed rental analysis suggests $1,420.00 per month." }],
            ],
          },
          threads: [],
        },
        reviewedDraftHash: "draft-hash",
      });
    if (url === "/api/gmail-hub/sequences" && body?.action === "send")
      return respond({
        sequence: { id: body.id, version: 2, threads: [{ threadId: "t" }] },
      });
    return respond({ error: "unexpected" }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("S249 the prepared owner message on the Now card", () => {
  it("BEH-S249-1: shows the comparison, the prefilled rent with its basis and the message preview with no action", () => {
    mount();
    expect(screen.getByRole("region", { name: "Stored comparison" })).toBeInTheDocument();
    const rent = screen.getByLabelText("Rent to recommend") as HTMLInputElement;
    expect(Number(rent.value)).toBeGreaterThan(0);
    expect(
      screen.getByText(/This is a proposal until you send or change it\./),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Reason to include")).toBeInTheDocument();
    expect(screen.getByRole("document", { name: "Message preview" })).toHaveTextContent(
      "Our reviewed rental analysis suggests $1,420.00 per month.",
    );
    expect(
      screen.getByText(
        new RegExp(`Message revision ${messageRevisionLabel("0a1b2c3d4e5f")}`),
      ),
    ).toHaveTextContent(/Last edited/);
    // The secondary actions sit on the same card; nothing ran.
    for (const name of ["Schedule", "Create Gmail draft instead", "Copy"])
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps exact-attempt recovery on Now while another draft is unavailable", async () => {
    const recover = vi.fn(async () => undefined);
    const on = { ...handlers(), onDraftRecover: recover };
    mount(
      {
        draft: {
          available: false,
          pending: false,
          createdRevision: null,
          preview: null,
          recoveryRequired: true,
        },
      },
      on,
    );
    const button = await screen.findByRole("button", {
      name: "Recover exact Gmail attempt",
    });
    expect(button.closest('[aria-label="Now"]')).not.toBeNull();
    expect(button).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Create Gmail draft instead" }),
    ).toBeDisabled();
    fireEvent.click(button);
    expect(recover).toHaveBeenCalledOnce();
    expect(on.onDraftPreview).not.toHaveBeenCalled();
    expect(on.onDraftCreate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled();
  });

  it("R-S249-6: typing a reason goes to the one message record", () => {
    const { on } = mount();
    fireEvent.change(screen.getByLabelText("Reason to include"), {
      target: { value: "Current market conditions" },
    });
    fireEvent.blur(screen.getByLabelText("Reason to include"));
    expect(on.onReasonChange).toHaveBeenCalledWith("Current market conditions");
    expect(on.onReasonCommit).toHaveBeenCalled();
  });

  it("AC-S249-1 / R-S249-8: Review and send shows the exact review and sends on one confirmation", async () => {
    const { on } = mount();
    const primary = await screen.findByRole("button", { name: "Review and send" });
    await act(async () => fireEvent.click(primary));
    const dialog = await screen.findByRole("dialog");
    expect(on.onFlush).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveTextContent("owner@example.invalid");
    expect(dialog).toHaveTextContent("Lease renewal for 100 Sample Street");
    expect(dialog).toHaveTextContent(
      "Our reviewed rental analysis suggests $1,420.00 per month.",
    );
    // Nothing is sent before the confirmation.
    expect(requests.some((entry) => entry.body?.action === "send")).toBe(false);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Send this message" })),
    );
    await waitFor(() =>
      expect(requests.some((entry) => entry.body?.action === "send")).toBe(true),
    );
    const send = requests.find((entry) => entry.body?.action === "send")!;
    expect(send.body).toMatchObject({
      reviewedDraftHash: "draft-hash",
      reviewedTargetHash: "target-hash",
      schedule: null,
    });
    expect(requests.filter((entry) => entry.body?.action === "send")).toHaveLength(1);
  });

  it("BEH-S249-1: a review read while the lease read is being replaced is read again and then shown", async () => {
    compositionBlockers.push([NOTICE_GENERATION_NOT_READY]);
    mount();
    await act(async () =>
      fireEvent.click(await screen.findByRole("button", { name: "Review and send" })),
    );
    const dialog = await screen.findByRole("dialog", {}, { timeout: 4000 });
    expect(dialog).toHaveTextContent("owner@example.invalid");
    const reads = requests.filter((entry) =>
      entry.url.startsWith("/api/gmail-hub/composition"),
    );
    expect(reads).toHaveLength(2);
    // Reads only: nothing is sent before the one confirmation.
    expect(requests.some((entry) => entry.body?.action === "send")).toBe(false);
  });

  it("BEH-S249-1: any other blocker is shown at once and the review is not read again", async () => {
    compositionBlockers.push(["A verified owner recipient is needed."]);
    mount();
    await act(async () =>
      fireEvent.click(await screen.findByRole("button", { name: "Review and send" })),
    );
    expect(
      await screen.findByText(
        "This message cannot be sent yet: A verified owner recipient is needed.",
      ),
    ).toBeInTheDocument();
    expect(
      requests.filter((entry) => entry.url.startsWith("/api/gmail-hub/composition")),
    ).toHaveLength(1);
    expect(requests.some((entry) => entry.url === "/api/gmail-hub/sequences")).toBe(
      false,
    );
  });

  it("the review is read again only for the replaced generation alone, a bounded few times", () => {
    expect(onlyGenerationBeingReplaced([NOTICE_GENERATION_NOT_READY])).toBe(true);
    expect(
      onlyGenerationBeingReplaced([
        NOTICE_GENERATION_NOT_READY,
        "A verified owner recipient is needed.",
      ]),
    ).toBe(false);
    expect(onlyGenerationBeingReplaced([])).toBe(false);
    expect(onlyGenerationBeingReplaced(undefined)).toBe(false);
    expect(COMPOSITION_REREAD_WAITS_MS.length).toBeLessThanOrEqual(3);
    expect(COMPOSITION_REREAD_WAITS_MS.reduce((sum, ms) => sum + ms, 0)).toBeLessThan(
      10_000,
    );
  });

  it("R-S249-9: a Gmail draft made from an earlier revision reads older and offers its replacement", () => {
    mount({
      draft: {
        available: true,
        pending: false,
        createdRevision: "ffffffffffff",
        preview: null,
      },
    });
    expect(
      screen.getByText(/The Gmail draft is older than this message/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Replace the Gmail draft" }),
    ).toBeInTheDocument();
  });

  it("R-S249-9: a draft carrying this revision does not read older", () => {
    mount({
      draft: {
        available: true,
        pending: false,
        createdRevision: "0a1b2c3d4e5f",
        preview: null,
      },
    });
    expect(screen.queryByText(/The Gmail draft is older than this message/)).toBeNull();
  });

  it("BEH-S249-4 / L45: with no signature, Send names it, the card sets it up and a refused save names the fields", async () => {
    const on = handlers();
    on.onSaveSignature.mockImplementationOnce(
      () => "To save your signature, add: Sender name.",
    );
    mount({ signaturePresent: false }, on, { ...FACTS, signature: false });
    expect(screen.getByTestId("send-needs")).toHaveTextContent("your signature");
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Review and send" })),
    );
    const form = screen.getByRole("form", { name: "Your signature" });
    await act(async () => fireEvent.submit(form));
    expect(
      screen.getByText("To save your signature, add: Sender name."),
    ).toBeInTheDocument();
    // Nothing was prepared for sending while the signature is missing.
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Sender name"), {
      target: { value: "Example Staff" },
    });
    await act(async () => fireEvent.submit(form));
    expect(on.onSaveSignature).toHaveBeenLastCalledWith({
      name: "Example Staff",
      role: "",
      phone: "",
    });
  });

  it("L29: a lease with no rent to recommend is asked for one before Send", () => {
    mount({}, handlers(), { ...FACTS, comparison: { state: "none" } });
    expect(screen.getByTestId("send-needs")).toHaveTextContent("the rent to recommend");
    expect(screen.getByRole("button", { name: "Schedule" })).toBeDisabled();
  });
});
