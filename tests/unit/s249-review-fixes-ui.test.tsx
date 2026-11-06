// @vitest-environment jsdom

// S249 review fixes (items A, C, D, H, I, J of the independent review of 21ff79c6) in mounted
// components. The fetch seam is counted; nothing reaches a server, a provider or a mailbox.
// Synthetic values only (Example and Sample names, example.invalid addresses).
import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const working = vi.hoisted(() => ({
  current: null as null | {
    record: null;
    canEdit: boolean;
    save: (...args: unknown[]) => Promise<boolean>;
  },
}));
vi.mock("@/components/lease-renewal/RenewalWorkingRecord", () => ({
  useRenewalWorkingRecord: () => working.current,
}));
vi.mock("@/components/lease-renewal/RenewalManualWorkspace", () => ({
  useRenewalManualWorkspace: () => ({ leaseId: "9101", state: null }),
}));

import {
  AUTOMATIC_START_IDLE_MS,
  KICKOFF_PREPARATION_ROUTE,
  RenewalKickoffPreparation,
} from "@/components/lease-renewal/RenewalKickoffPreparation";
import { RenewalMessagePreparation } from "@/components/lease-renewal/RenewalMessagePreparation";
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

/** The refusal the reason reads (H), in the edited wording's style. */
const REASON_REFUSAL =
  "Keep amounts, dates, links and contacts out of the reason to include; the message states them in their labeled fact fields.";
/** The lasting line after a confirmed replacement (D). */
const EARLIER_DRAFT_REMAINS =
  "An earlier, older Gmail draft of this message is still in your Gmail drafts. Delete it in Gmail so only the current draft is sent.";
import {
  composeRenewalMessage,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import { DRAFT_BANNER } from "@/lib/constants";
import {
  KICKOFF_WORDS,
  projectRenewalPreparation,
  type RenewalKickoffFacts,
} from "@/lib/lease-renewal/renewal-preparation";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  working.current = null;
  router.refresh.mockReset();
});

function respond(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ---- C: the automatic loop stops when the batch is left, and one loop runs per tab ---------------

describe("S249 C: the preparation loop belongs to the view that started it", () => {
  const TARGETS = [
    { leaseId: "9101", address: "101 Sample Pl", cycleDateIso: "2026-12-31" },
    { leaseId: "9104", address: "104 Example Ln", cycleDateIso: "2026-12-31" },
  ];
  const props = {
    targets: TARGETS,
    canPrepare: true,
    automaticStart: { enabled: true, version: 0, canChange: false },
    rehearsal: false,
  };
  let inFlight = 0;
  let maxInFlight = 0;
  let pending: Array<{ resolve: () => void; signal: AbortSignal | null | undefined }> =
    [];
  let calls: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    Object.defineProperty(window.navigator, "webdriver", {
      configurable: true,
      get: () => false,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    inFlight = 0;
    maxInFlight = 0;
    pending = [];
    calls = [];
    // A fetch that answers only when the test says so, and rejects when its wait is stopped.
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (String(url) !== KICKOFF_PREPARATION_ROUTE)
          return Promise.resolve(respond({}, 404));
        calls.push(JSON.parse(String(init?.body)).leaseId as string);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise<Response>((resolve, reject) => {
          let settled = false;
          const settle = () => {
            if (settled) return;
            settled = true;
            inFlight -= 1;
          };
          init?.signal?.addEventListener("abort", () => {
            settle();
            reject(new DOMException("Stopped", "AbortError"));
          });
          pending.push({
            signal: init?.signal,
            resolve: () => {
              settle();
              resolve(
                respond({
                  status: "prepared",
                  message: "The comparison is stored for this cycle.",
                }),
              );
            },
          });
        });
      }),
    );
  });

  const advance = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };

  it("leaving the batch mid-loop stops it: nothing further is sent and the next page is never refreshed", async () => {
    const view = render(<RenewalKickoffPreparation {...props} />);
    await advance(AUTOMATIC_START_IDLE_MS + 50);
    expect(calls).toEqual(["9101"]);
    view.unmount();
    // The first answer arrives after the staff member left.
    await act(async () => pending[0]?.resolve());
    await advance(AUTOMATIC_START_IDLE_MS * 4);
    expect(calls).toEqual(["9101"]);
    expect(router.refresh).not.toHaveBeenCalled();
    expect(pending[0]?.signal?.aborted).toBe(true);
  });

  it("a remount never runs a second loop beside the first; it starts again from the server's state", async () => {
    const first = render(<RenewalKickoffPreparation {...props} />);
    await advance(AUTOMATIC_START_IDLE_MS + 50);
    expect(calls).toEqual(["9101"]);
    first.unmount();
    render(<RenewalKickoffPreparation {...props} />);
    await advance(AUTOMATIC_START_IDLE_MS + 50);
    // Answer whatever the remounted view asked, one lease at a time.
    for (let round = 0; round < 4; round += 1) {
      await act(async () => {
        for (const entry of pending.splice(0)) entry.resolve();
      });
      await advance(50);
    }
    expect(maxInFlight).toBe(1);
    expect(calls).toEqual(["9101", "9101", "9104"]);
  });
});

// ---- The Now card's owner message (I, J, H) ------------------------------------------------------

const FACTS: RenewalKickoffFacts = {
  numbers: {
    contractualRent: 1350,
    rentCharges: null,
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
      "Hello Example,\n\nOur reviewed rental analysis suggests $1,405.00 per month.",
    htmlBody:
      "<p>Hello Example,</p><p>Our reviewed rental analysis suggests $1,405.00 per month.</p>",
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

function StepCard({ step }: Readonly<{ step: "ask-owner" | "offer-tenant" }>) {
  const nowCard = useRenewalNowCard();
  const primary = nowCard?.primaries[step];
  return (
    <section aria-label="Now">
      {primary ? (
        <button disabled={primary.disabled} onClick={primary.run} type="button">
          {primary.label}
        </button>
      ) : null}
      {(["message-preview", "review-and-send"] as const).map((slot) => (
        <div
          data-renewal-now-slot-key={nowSlotKey(step, slot)}
          key={slot}
          ref={nowCard?.slotRef}
        />
      ))}
    </section>
  );
}

function mountOwner(overrides: Partial<PreparedMessageData> = {}) {
  return render(
    <RenewalNowCardProvider preparation={projectRenewalPreparation(FACTS)}>
      <StepCard step="ask-owner" />
      <PreparedMessageSlot data={data(overrides)} {...handlers()} />
    </RenewalNowCardProvider>,
  );
}

it("shows changed-fact feedback and deliberate wording recovery on the Now card", async () => {
  const returnWording = vi.fn();
  const undo = vi.fn();
  render(
    <RenewalNowCardProvider preparation={projectRenewalPreparation(FACTS)}>
      <StepCard step="ask-owner" />
      <PreparedMessageSlot
        data={data({ wordingChangedSince: true, canUndoWording: true })}
        {...handlers()}
        onReturnToStandardWording={returnWording}
        onUndoWording={undo}
      />
    </RenewalNowCardProvider>,
  );
  expect(
    await screen.findByText(/Information changed after this wording was written/),
  ).toBeVisible();
  expect(returnWording).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Return to the standard wording" }));
  expect(returnWording).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Undo the last refinement" }));
  expect(undo).toHaveBeenCalledOnce();
});

const SEQUENCE = (id: string, version = 1) => ({
  id,
  version,
  senderEmail: "example-staff@example.invalid",
  initial: {
    subject: "Lease renewal for 100 Sample Street",
    paragraphs: [
      [{ text: "Our reviewed rental analysis suggests $1,405.00 per month." }],
    ],
  },
  threads: [],
});

describe("S249 I and J: Review and send", () => {
  const requests: Array<{ url: string; body: Record<string, unknown> | null }> = [];
  let lostSaves = 0;
  beforeEach(() => {
    requests.length = 0;
    lostSaves = 0;
    const saved = new Map<string, number>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
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
            initial: SEQUENCE("x").initial,
            target: { to: ["owner@example.invalid"], cc: [], blockers: [] },
            reviewedTargetHash: "target-hash",
            messageRevision: "0a1b2c3d4e5f",
            // The figure the composed message carries, as the server composed it.
            carriedRecommendation: {
              value: 1405,
              origin: "comparison",
              basis: "Suggested from the stored comparison.",
            },
          });
        if (url === "/api/gmail-hub/sequences" && body?.action === "save") {
          const id = (body.draft as { id: string }).id;
          // The server saves the operation once; a retry of the same one replays it.
          if (!saved.has(String(body.operationId)))
            saved.set(String(body.operationId), 1);
          if (lostSaves > 0) {
            lostSaves -= 1;
            throw new TypeError("The connection was lost after the save.");
          }
          return respond({ sequence: SEQUENCE(id), reviewedDraftHash: "draft-hash" });
        }
        if (url === "/api/gmail-hub/sequences" && body?.action === "send")
          return respond({
            sequence: { id: body.id, version: 2, threads: [{ threadId: "t" }] },
          });
        return respond({ error: "unexpected" }, 500);
      }),
    );
  });

  it("I: a save whose answer was lost is sent again with the same operation and draft id, so one communication exists", async () => {
    lostSaves = 1;
    mountOwner();
    await act(async () =>
      fireEvent.click(await screen.findByRole("button", { name: "Review and send" })),
    );
    await screen.findByRole("dialog");
    const saves = requests.filter((entry) => entry.body?.action === "save");
    expect(saves.length).toBe(2);
    const ids = new Set(saves.map((entry) => (entry.body!.draft as { id: string }).id));
    const operations = new Set(saves.map((entry) => entry.body!.operationId));
    expect(ids.size).toBe(1);
    expect(operations.size).toBe(1);
  });

  it("J: after the send, the working rent saved is the figure the reviewed message carried", async () => {
    const save = vi.fn(async () => true);
    working.current = { record: null, canEdit: true, save };
    mountOwner();
    await act(async () =>
      fireEvent.click(await screen.findByRole("button", { name: "Review and send" })),
    );
    await screen.findByRole("dialog");
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Send this message" })),
    );
    await waitFor(() => expect(save).toHaveBeenCalled());
    // The page's own projection suggests a different figure; the send carried 1405.
    const projected = projectRenewalPreparation(FACTS).rent.value;
    expect(projected).not.toBe(1405);
    expect(save).toHaveBeenCalledWith(
      "terms_rent",
      1405,
      expect.objectContaining({ origin: "adopted_source" }),
    );
  });
});

describe("S249 H: the Now card says what to take out of the reason", () => {
  it("a reason with a digit reads the labeled-fields refusal; a plain one reads none", () => {
    const view = mountOwner({ reason: "Rents rose 5 percent nearby" });
    expect(screen.getByRole("alert")).toHaveTextContent(REASON_REFUSAL);
    view.unmount();
    mountOwner({ reason: "Current market conditions" });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

// ---- D: the created draft reads older after a cancelled replacement ------------------------------

function tenantFacts(overrides: Partial<RenewalMessageFacts> = {}): RenewalMessageFacts {
  return {
    channel: "tenant",
    names: ["Avery Example"],
    firstNames: ["Avery"],
    address: "101 Sample Pl",
    currentBaseRent: null,
    leaseEndDate: "2026-12-31",
    ownerTerms: null,
    range: null,
    suggestedRent: null,
    comps: [],
    trend: null,
    sparseCompsQualification: null,
    charges: emptyMessagePreparationInputs().charges,
    insuranceTransition: null,
    leaseOrigin: null,
    otherChargesComparison: null,
    informationForm: null,
    insuranceFlyer: null,
    rbpFlyer: null,
    signature: null,
    attachments: [],
    ...overrides,
  };
}

function tenantPreparation(overrides: Record<string, unknown> = {}) {
  return {
    senderEmail: "sample.op@pmikcmetro.com",
    cycleId: "6c37bdcd-8264-4249-813f-0289307dd725",
    saved: null,
    inputs: emptyMessagePreparationInputs(),
    facts: tenantFacts(),
    sourceFingerprint: "a".repeat(64),
    bodyBaseHash: "b".repeat(64),
    bodyOverride: null,
    subjectOverride: null,
    signatureMatchesActor: false,
    signatureOrigin: { kind: "none" },
    retainedSignature: null,
    chargeInventory: null,
    publication: { status: "approved", ref: "tenant-renewal:v2.0" },
    notices: [],
    policyGates: [],
    draftAttempt: null,
    createdDrafts: null,
    previousDraftAttempts: [],
    recipients: { status: "ready", to: "avery.example@example.invalid", cc: [] },
    destinations: {
      gmailDrafts: {
        href: "https://mail.google.com/mail/u/sample.op@pmikcmetro.com/#drafts",
        label: "Gmail Drafts for sample.op@pmikcmetro.com",
      },
      lease: {
        href: "https://fixture.rentvine.invalid/leases/9101",
        label: "Lease 9101",
      },
      messages: {
        href: "https://fixture.rentvine.invalid/leases/9101/messages",
        label: "Lease 9101 messages",
      },
      owners: [],
    },
    ...overrides,
  };
}

describe("S249 D: the Gmail draft signal reads the last created draft", () => {
  function mountTenant(payload: Record<string, unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        (init?.method ?? "GET") === "GET" ? Response.json(payload) : Response.json({}),
      ),
    );
    return render(
      <RenewalNowCardProvider preparation={null}>
        <StepCard step="offer-tenant" />
        <RenewalMessagePreparation canEdit channel="tenant" />
      </RenewalNowCardProvider>,
    );
  }
  const shown = composeRenewalMessage(tenantFacts());

  it("reads a freshly created banner-marked draft as the current message after reload", async () => {
    mountTenant(
      tenantPreparation({
        createdDrafts: {
          latest: {
            executionId: `exec_${"d".repeat(40)}`,
            subject: shown.subject,
            body: `${DRAFT_BANNER}\n\n${shown.plainText}`,
            recordedAt: "2026-11-06T15:00:00.000Z",
          },
          earlier: 0,
        },
      }),
    );
    await screen.findByText("The unsent Gmail draft carries this message revision.");
    expect(screen.queryByText(new RegExp(KICKOFF_WORDS.draftOlder))).toBeNull();
    expect(screen.queryByRole("button", { name: KICKOFF_WORDS.replaceDraft })).toBeNull();
  });

  it("after a replacement preview is cancelled, the draft created from the earlier revision reads older", async () => {
    mountTenant(
      tenantPreparation({
        // The head moved to the cancelled replacement attempt: previewed, never created.
        draftAttempt: {
          executionId: `exec_${"b".repeat(40)}`,
          state: "Ready",
          recoveryAvailable: true,
          outcome: null,
          preview: { subject: shown.subject, body: shown.plainText },
        },
        createdDrafts: {
          latest: {
            executionId: `exec_${"a".repeat(40)}`,
            subject: shown.subject,
            body: "Hello Avery,\n\nAn earlier revision of this message.",
            recordedAt: "2026-11-05T14:00:00.000Z",
          },
          earlier: 0,
        },
      }),
    );
    expect(
      await screen.findByText(new RegExp(KICKOFF_WORDS.draftOlder)),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: KICKOFF_WORDS.replaceDraft }),
    ).toBeInTheDocument();
  });

  it("after a confirmed replacement, a lasting line says the earlier draft is still in Gmail", async () => {
    mountTenant(
      tenantPreparation({
        createdDrafts: {
          latest: {
            executionId: `exec_${"c".repeat(40)}`,
            subject: shown.subject,
            body: shown.plainText,
            recordedAt: "2026-11-05T15:00:00.000Z",
          },
          earlier: 1,
        },
      }),
    );
    expect(await screen.findByText(EARLIER_DRAFT_REMAINS)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(KICKOFF_WORDS.draftOlder))).toBeNull();
  });
});
