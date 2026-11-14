// @vitest-environment jsdom

// S281 on the prepared message (R-S281-1, R-S281-2, R-S281-3, R-S281-12; ARCH-S281-1,
// BEH-S281-2, BEH-S281-3, BEH-S281-9; AC-S281-2, AC-S281-3, AC-S281-8). In the outcome layout the
// message renders in its card as named groups below the step's primary action: "Message" (the
// wording, its readiness list and "Reason to include") and "Other ways to send" (Schedule,
// "Create Gmail draft instead", Copy and "Open in Communications"). The exact review shows the
// recipients, the lease in staff terms and the amounts and dates first, then the timing, and the
// body last in its own scroll area, with no internal identifier. After a confirmed send neither
// group is rendered and the exact sent message is read in Verification with its receipt.
// Fail-first on the starting state: the message and its delivery actions were one block with no
// group names, the review showed "Lease {id} · Cycle {id}" after the body, and a sent step still
// rendered "Reason to include" and the readiness list. Every value here is synthetic.
import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lease-renewal/live/desk/lease/9101",
  useSearchParams: () => new URLSearchParams(),
}));

import { RenewalFocusViewProvider } from "@/components/lease-renewal/RenewalFocusViewContext";
import {
  RenewalNowCardProvider,
  useRenewalNowCard,
} from "@/components/lease-renewal/RenewalNowCardContext";
import {
  PreparedMessageSlot,
  recipientsLine,
  type PreparedMessageData,
  type PreparedMessageHandlers,
  type SentMessageReceipt,
} from "@/components/lease-renewal/RenewalPreparedMessage";
import { renewalLeaseLabel } from "@/components/lease-renewal/RenewalMessagePreparation";
import {
  projectRenewalPreparation,
  type RenewalKickoffFacts,
} from "@/lib/lease-renewal/renewal-preparation";

const LEASE = "9101";
const CYCLE = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";

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
  address: "101 Sample Pl",
};

const LEASE_LABEL = renewalLeaseLabel("101 Sample Pl", "2026-12-31");

function data(overrides: Partial<PreparedMessageData> = {}): PreparedMessageData {
  return {
    channel: "owner",
    leaseId: LEASE,
    canEdit: true,
    subject: "Lease renewal for 101 Sample Pl",
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
    leaseLabel: LEASE_LABEL,
    reason: "",
    composerHref: `/gmail-hub?compose=renewal_owner&lease=${LEASE}`,
    draft: { available: true, pending: false, createdRevision: null, preview: null },
    notice: "",
    ...overrides,
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
  };
}

/** The step's one primary action and its recipients line, as the Now card shows them. */
function NowPrimary() {
  const primary = useRenewalNowCard()?.primaries["ask-owner"];
  if (!primary) return null;
  return (
    <section aria-label="Now" data-renewal-now-step="ask-owner">
      <h2 id="renewal-now-heading" tabIndex={-1}>
        Now: Ask the owner
      </h2>
      {primary.recipients ? (
        <p data-testid="now-recipients">{primary.recipients}</p>
      ) : null}
      <button
        disabled={primary.disabled}
        onClick={(event) => primary.run(event.currentTarget)}
        type="button"
      >
        {primary.label}
      </button>
    </section>
  );
}

function mount({
  overrides = {},
  sent = null,
  view = "guided",
}: {
  overrides?: Partial<PreparedMessageData>;
  sent?: SentMessageReceipt | null;
  view?: "guided" | "full";
} = {}) {
  return render(
    <RenewalFocusViewProvider allowLegacyFocus={false} initialView={view}>
      <RenewalNowCardProvider preparation={projectRenewalPreparation(FACTS)}>
        <NowPrimary />
        <div data-testid="card">
          <PreparedMessageSlot
            compactFull
            data={data(overrides)}
            deliveryHeld={sent !== null}
            sent={sent}
            {...handlers()}
          />
        </div>
        <details data-renewal-verification>
          <summary>Verify owner terms and outreach</summary>
          <div id="renewal-sent-message-owner" />
        </details>
      </RenewalNowCardProvider>
    </RenewalFocusViewProvider>,
  );
}

const groups = () => [
  ...document.querySelectorAll<HTMLDetailsElement>(
    "details[data-renewal-secondary-work]",
  ),
];
const groupNamed = (name: string) =>
  groups().find(
    (group) => group.querySelector(":scope > summary")?.textContent?.trim() === name,
  );

let fetchMock: ReturnType<typeof vi.fn>;
const requests: Array<{ url: string; method: string }> = [];

function respond(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  requests.length = 0;
  window.history.replaceState(null, "", `/lease-renewal/live/desk/lease/${LEASE}`);
  window.sessionStorage.clear();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : null;
    requests.push({ url, method: init?.method ?? "GET" });
    if (url.startsWith("/api/gmail-hub/composition"))
      return respond({
        context: {
          purpose: "renewal_owner",
          entityType: "renewal_lease",
          entityId: LEASE,
        },
        initial: {
          subject: "Lease renewal for 101 Sample Pl",
          paragraphs: [
            [{ text: "Our reviewed rental analysis suggests $1,420.00 per month." }],
          ],
        },
        target: {
          to: ["owner@example.invalid"],
          cc: [],
          blockers: [],
          noticeCycleId: CYCLE,
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
            subject: "Lease renewal for 101 Sample Pl",
            paragraphs: [
              [{ text: "Our reviewed rental analysis suggests $1,420.00 per month." }],
            ],
          },
          threads: [],
        },
        reviewedDraftHash: "draft-hash",
      });
    if (url.startsWith("/api/gmail-hub/sequences?id=sent-owner-1"))
      return respond({
        sequence: {
          id: "sent-owner-1",
          context: { entityId: LEASE, purpose: "renewal_owner" },
          initial: {
            subject: "Lease renewal for 101 Sample Pl",
            paragraphs: [[{ text: "The exact sent wording for the owner." }]],
            attachmentIds: [],
          },
          authorization: { to: ["owner@example.invalid"] },
        },
      });
    return respond({ error: "unexpected" }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("S281 named message groups (R-S281-12)", () => {
  it("AC-S281-8 / BEH-S281-9: the message and the other ways to send are named groups in order, closed while the message is ready", async () => {
    mount();
    await waitFor(() => expect(groupNamed("Message")).toBeDefined());
    expect(
      groups().map((group) => group.querySelector(":scope > summary")?.textContent),
    ).toEqual(["Message", "Other ways to send"]);
    const message = groupNamed("Message")!;
    const otherWays = groupNamed("Other ways to send")!;
    expect(
      message.compareDocumentPosition(otherWays) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Closed on entry while nothing leads them.
    expect(message.open).toBe(false);
    expect(otherWays.open).toBe(false);
    // Each named control is inside its group.
    expect(message).toContainElement(screen.getByLabelText("Reason to include"));
    expect(message).toContainElement(
      screen.getByRole("list", { name: "What sending needs" }),
    );
    expect(message).toContainElement(
      screen.getByRole("document", { name: "Message preview" }),
    );
    for (const name of ["Schedule", "Create Gmail draft instead", "Copy"])
      expect(otherWays).toContainElement(screen.getByRole("button", { name }));
    expect(otherWays).toContainElement(
      screen.getByRole("link", { name: "Open in Communications" }),
    );
    // Rendering the groups reads and writes nothing.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-S281-8: a failing readiness line opens Message on its own, with its fix in view", async () => {
    mount({ overrides: { signaturePresent: false } });
    await waitFor(() =>
      expect(groupNamed("Message")).toHaveAttribute("data-renewal-promoted"),
    );
    const message = groupNamed("Message")!;
    expect(message.open).toBe(true);
    expect(message).toContainElement(
      screen.getByRole("list", { name: "What sending needs" }),
    );
    expect(groupNamed("Other ways to send")!.open).toBe(false);
  });

  it("R-S281-1: the recipients line travels with the step's one primary action", async () => {
    mount({ overrides: { cc: ["staff@example.invalid"] } });
    expect(await screen.findByTestId("now-recipients")).toHaveTextContent(
      "To: owner@example.invalid · Cc: staff@example.invalid",
    );
    expect(recipientsLine(null, [])).toBeNull();
    expect(recipientsLine("owner@example.invalid", [])).toBe("To: owner@example.invalid");
  });
});

describe("S281 a sent step reads as sent (R-S281-3)", () => {
  it("AC-S281-3 / BEH-S281-3: no readiness list, no Reason to include and no message groups; the exact sent message and its receipt are in Verification", async () => {
    mount({
      sent: {
        sequenceId: "sent-owner-1",
        sentAtMs: Date.parse("2026-11-10T16:00:00.000Z"),
        senderEmail: "example-staff@example.invalid",
      },
    });
    const evidence = document.getElementById("renewal-sent-message-owner")!;
    await waitFor(() =>
      expect(evidence).toHaveTextContent("The exact sent wording for the owner."),
    );
    expect(evidence).toHaveTextContent(/Sent .* from example-staff@example\.invalid/);
    expect(evidence).toHaveTextContent("to owner@example.invalid");
    expect(evidence.closest("details[data-renewal-verification]")).not.toBeNull();
    expect(screen.queryByRole("list", { name: "What sending needs" })).toBeNull();
    expect(screen.queryByLabelText("Reason to include")).toBeNull();
    expect(groupNamed("Message")).toBeUndefined();
    expect(groupNamed("Other ways to send")).toBeUndefined();
    // Reading the sent message is a read only.
    expect(requests.every((request) => request.method === "GET")).toBe(true);
    // Verification holds nothing that operates.
    expect(
      evidence.querySelector(
        "button, input, select, textarea, form, [contenteditable=true]",
      ),
    ).toBeNull();
  });
});

describe("S281 the exact review keeps the decision in view (R-S281-2)", () => {
  it("AC-S281-2 / BEH-S281-2: recipients, the lease in staff terms and the amounts come before the body, which scrolls in its own area; no internal id is shown", async () => {
    mount({ view: "full" });
    const primary = await screen.findByRole("button", { name: "Review and send" });
    await act(async () => fireEvent.click(primary));
    const dialog = await screen.findByRole("dialog", { name: "Review and send" });
    expect(dialog).toHaveClass("renewal-review-dialog");
    const review = dialog.querySelector<HTMLElement>(
      '[data-renewal-field="exact-review"]',
    )!;
    const order = [
      "review-recipients",
      "review-lease",
      "review-terms",
      "review-body",
    ].map((field) => review.querySelector(`[data-renewal-field="${field}"]`)!);
    for (const element of order) expect(element).not.toBeNull();
    for (let index = 1; index < order.length; index += 1)
      expect(
        order[index - 1]!.compareDocumentPosition(order[index]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    // The body is last in the review and is its own scroll area.
    const body = review.querySelector('[data-renewal-field="review-body"]')!;
    expect(review.lastElementChild).toBe(body);
    expect(body).toHaveAttribute("role", "region");
    expect(body).toHaveClass("renewal-review-body");
    // The lease reads in staff terms; the internal ids are not shown.
    expect(review).toHaveTextContent(
      "101 Sample Pl, renewal for the lease ending 12/31/2026",
    );
    expect(review).not.toHaveTextContent(LEASE);
    expect(review).not.toHaveTextContent(CYCLE);
    expect(review).not.toHaveTextContent(/Cycle/);
    // The buttons follow the review in the dialog.
    expect(
      review.compareDocumentPosition(dialog.querySelector(".ui-dialog-actions")!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("AC-S281-2: Schedule puts its date and time ahead of the message body", async () => {
    mount({ view: "full" });
    const schedule = await screen.findByRole("button", { name: "Schedule" });
    await act(async () => fireEvent.click(schedule));
    const dialog = await screen.findByRole("dialog", { name: "Review and schedule" });
    const date = await waitFor(() => {
      const field = dialog.querySelector<HTMLInputElement>('input[type="date"]');
      expect(field).not.toBeNull();
      return field!;
    });
    const body = dialog.querySelector('[data-renewal-field="review-body"]')!;
    expect(
      date.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renewalLeaseLabel reads the lease in staff terms, and nothing without an address", () => {
    expect(renewalLeaseLabel("101 Sample Pl", "2026-12-31")).toBe(
      "101 Sample Pl, renewal for the lease ending 12/31/2026",
    );
    expect(renewalLeaseLabel("101 Sample Pl", null)).toBe("101 Sample Pl, renewal");
    expect(renewalLeaseLabel(null, "2026-12-31")).toBeNull();
  });
});
