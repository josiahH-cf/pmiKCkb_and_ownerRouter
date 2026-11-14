// @vitest-environment jsdom

// S249 review fixes (items A, C, D, H, I, J of the independent review of 21ff79c6) in mounted
// components. The fetch seam is counted; nothing reaches a server, a provider or a mailbox.
// Synthetic values only (Example and Sample names, example.invalid addresses).
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
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import { fixtureWorkingRecord } from "@/tests/helpers/rent-charge-fixtures";
import { standingRuleContext } from "@/lib/lease-renewal/standing-agreement";
import { MESSAGE_CONTROL_IDS } from "@/lib/lease-renewal/message-readiness";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const working = vi.hoisted(() => ({
  current: null as null | {
    record: RenewalWorkingRecord | null;
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
    month: "2026-12",
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

  // S283 R-S283-2: the button states its count ("Prepare 2 December 2026 leases"); the name
  // pattern below is rewritten on purpose.
  const PREPARE_OR_CONTINUE = /Prepare \d+ (of \d+ )?December|Continue December/;

  it("leaving the batch mid-loop stops it: nothing further is sent and the next page is never refreshed", async () => {
    const view = render(<RenewalKickoffPreparation {...props} />);
    fireEvent.click(screen.getByRole("button", { name: PREPARE_OR_CONTINUE }));
    await advance(50);
    expect(calls).toEqual(["9101"]);
    view.unmount();
    // The first answer arrives after the staff member left.
    await act(async () => pending[0]?.resolve());
    await advance(6000);
    expect(calls).toEqual(["9101"]);
    expect(router.refresh).not.toHaveBeenCalled();
    expect(pending[0]?.signal?.aborted).toBe(true);
  });

  it.each(["pagehide", "beforeunload"])(
    "%s stops an interrupted foreground run before React unmount; explicit continuation reuses the exact operation",
    async (eventName) => {
      const view = render(<RenewalKickoffPreparation {...props} />);
      fireEvent.click(screen.getByRole("button", { name: PREPARE_OR_CONTINUE }));
      await advance(50);
      const original = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
      expect(original).toMatchObject({
        leaseId: "9101",
        cycleDateIso: "2026-12-31",
        month: "2026-12",
        trigger: "staff",
      });
      expect(original.operationId).toEqual(expect.any(String));

      // A hard navigation can reject its fetch before React ever unmounts.
      fireEvent(window, new Event(eventName));
      await advance(0);
      await act(async () => pending[0]?.resolve());
      await advance(6000);
      expect(calls).toEqual(["9101"]);
      expect(pending[0]?.signal?.aborted).toBe(true);
      expect(router.refresh).not.toHaveBeenCalled();

      view.unmount();
      await advance(0);
      render(<RenewalKickoffPreparation {...props} />);
      await advance(0);
      expect(calls).toEqual(["9101"]);
      const continuation = screen.getByRole("button", {
        name: "Continue December 2026 preparation",
      });
      expect(continuation).toBeEnabled();
      fireEvent.click(continuation);
      await advance(50);
      expect(calls).toEqual(["9101", "9101"]);
      expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body))).toEqual(
        original,
      );
      for (let round = 0; round < 4; round += 1) {
        await act(async () => {
          for (const entry of pending.splice(0)) entry.resolve();
        });
        await advance(50);
      }
      expect(calls).toEqual(["9101", "9101", "9104"]);
      expect(maxInFlight).toBe(1);
      expect(router.refresh).toHaveBeenCalledTimes(1);
    },
  );

  it("a canceled beforeunload leaves an explicit Continue action in the still-mounted page", async () => {
    render(<RenewalKickoffPreparation {...props} />);
    fireEvent.click(screen.getByRole("button", { name: PREPARE_OR_CONTINUE }));
    await advance(50);
    const original = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    // Another browser listener may cancel departure; React stays mounted and no pageshow fires.
    fireEvent(window, new Event("beforeunload", { cancelable: true }));
    await advance(0);
    await act(async () => pending[0]?.resolve());
    await advance(6000);
    expect(calls).toEqual(["9101"]);
    expect(pending[0]?.signal?.aborted).toBe(true);
    expect(router.refresh).not.toHaveBeenCalled();
    const continuation = screen.getByRole("button", {
      name: "Continue December 2026 preparation",
    });
    expect(continuation).toBeEnabled();
    fireEvent.click(continuation);
    await advance(50);
    expect(calls).toEqual(["9101", "9101"]);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body))).toEqual(
      original,
    );
    for (let round = 0; round < 4; round += 1) {
      await act(async () => {
        for (const entry of pending.splice(0)) entry.resolve();
      });
      await advance(50);
    }
    expect(calls).toEqual(["9101", "9101", "9104"]);
    expect(maxInFlight).toBe(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("a persisted pageshow restores an idle Continue action without silently resuming the abandoned run", async () => {
    render(<RenewalKickoffPreparation {...props} />);
    fireEvent.click(screen.getByRole("button", { name: PREPARE_OR_CONTINUE }));
    await advance(50);
    const original = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    fireEvent(window, new PageTransitionEvent("pagehide", { persisted: true }));
    await advance(0);
    await act(async () => pending[0]?.resolve());
    await advance(6000);
    expect(calls).toEqual(["9101"]);
    expect(router.refresh).not.toHaveBeenCalled();

    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
    await advance(0);
    expect(calls).toEqual(["9101"]);
    const continuation = screen.getByRole("button", {
      name: "Continue December 2026 preparation",
    });
    expect(continuation).toBeEnabled();
    fireEvent.click(continuation);
    await advance(50);
    expect(calls).toEqual(["9101", "9101"]);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body))).toEqual(
      original,
    );
    for (let round = 0; round < 4; round += 1) {
      await act(async () => {
        for (const entry of pending.splice(0)) entry.resolve();
      });
      await advance(50);
    }
    expect(calls).toEqual(["9101", "9101", "9104"]);
    expect(maxInFlight).toBe(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("a remount never runs a second loop beside the first; an explicit continuation rechecks the same targets", async () => {
    const first = render(<RenewalKickoffPreparation {...props} />);
    fireEvent.click(screen.getByRole("button", { name: PREPARE_OR_CONTINUE }));
    await advance(50);
    expect(calls).toEqual(["9101"]);
    first.unmount();
    await advance(0);
    render(<RenewalKickoffPreparation {...props} />);
    fireEvent.click(screen.getByRole("button", { name: PREPARE_OR_CONTINUE }));
    await advance(50);
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

for (const sourceLabel of [
  "Standing agreement Example agreement, rule v1",
  "Pricing policy v1",
]) {
  it(`shows the recorded ${sourceLabel} basis without a duplicate editor on Ask the owner`, () => {
    const save = vi.fn(async () => true);
    working.current = {
      record: fixtureWorkingRecord({
        terms_rent: { value: 1751, revision: 1, origin: "adopted_source", sourceLabel },
      }),
      canEdit: true,
      save,
    };
    mountOwner();
    expect(screen.queryByLabelText("Rent to recommend")).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
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

  it("does not save a recommendation as a side effect of sending", async () => {
    const save = vi.fn(async () => true);
    working.current = { record: null, canEdit: true, save };
    mountOwner();
    fireEvent.click(await screen.findByRole("button", { name: "Review and send" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Send this message" }));
    await screen.findByText(/Sent. Gmail accepted/);
    expect(save).not.toHaveBeenCalled();
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

it("rebuilds an adopted standing rent only on the explicit choice and keeps a failed save recoverable", async () => {
  const basis = {
    agreementId: "2c3d4e5f-6071-4b82-9c93-ad4e5f6a7b8c",
    policyId: "1b2c3d4e-5f60-4a71-8b82-9c3d4e5f6a7b",
    policyVersion: 1,
  };
  const currentBasis = { ...basis, policyVersion: 2 };
  const saveRent = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  const record = fixtureWorkingRecord({
    terms_rent: { value: 1751, revision: 1, origin: "adopted_source" },
  });
  working.current = {
    record: {
      ...record,
      leaseId: "9101",
      fields: {
        ...record.fields,
        terms_rent: {
          ...record.fields.terms_rent!,
          context: standingRuleContext({ ...basis, basis: "Original 3 percent rule." }),
        },
      },
    },
    canEdit: true,
    save: saveRent,
  };
  const earlier = {
    agreement: "Synthetic standing agreement",
    earlier: "Raise rent by 3 percent",
    current: "Raise rent by 4 percent",
    currentRent: 1768,
    currentBasis,
  };
  const payload = tenantPreparation({ ruleBasis: basis, earlierRule: earlier });
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        return Response.json({
          ...payload,
          inputs: body.inputs,
          ruleBasis: body.ruleBasis,
          earlierRule: null,
          saved: {
            revision: 1,
            inputs: body.inputs,
            signatureEmail: null,
            signatureActorUid: null,
          },
        });
      }
      return Response.json(payload);
    }),
  );
  render(
    <RenewalNowCardProvider preparation={null}>
      <StepCard step="offer-tenant" />
      <RenewalMessagePreparation canEdit channel="tenant" />
    </RenewalNowCardProvider>,
  );
  const rebuild = await screen.findByRole("button", {
    name: "Rebuild with the current rule",
  });
  expect(saveRent).not.toHaveBeenCalled();
  fireEvent.click(rebuild);
  await screen.findByText(
    "The rent could not be rebuilt. Your saved rent is kept; choose Rebuild with the current rule to retry.",
  );
  expect(posts).toHaveLength(0);
  expect(
    screen.getByRole("button", { name: "Rebuild with the current rule" }),
  ).toBeVisible();
  fireEvent.click(rebuild);
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(saveRent).toHaveBeenLastCalledWith(
    "terms_rent",
    1768,
    expect.objectContaining({
      origin: "adopted_source",
      context: expect.stringContaining(":v2."),
    }),
  );
  expect(posts[0].ruleBasis).toEqual(currentBasis);
  expect(
    screen.queryByText(
      "The rent could not be rebuilt. Your saved rent is kept; choose Rebuild with the current rule to retry.",
    ),
  ).toBeNull();
});

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

  it.each(["owner", "tenant"] as const)(
    "shows one current exact Gmail recovery in either view for %s",
    async (channel) => {
      const executionId = `exec_${"d".repeat(40)}`;
      const payload = tenantPreparation({
        facts: tenantFacts({ channel }),
        draftAttempt: {
          executionId,
          state: "Needs reconciliation",
          recoveryAvailable: true,
          outcome: null,
        },
      });
      const commands: unknown[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init?: RequestInit) => {
          if ((init?.method ?? "GET") === "GET") return Response.json(payload);
          commands.push(JSON.parse(String(init?.body)));
          return Response.json({
            status: "reconciliation",
            resolution: "needs_review",
            channel,
            executionId,
            reason: "The exact attempt still needs review.",
          });
        }),
      );
      const step = channel === "owner" ? "ask-owner" : "offer-tenant";
      const ui = (guided: boolean) => (
        <RenewalNowCardProvider preparation={null}>
          {guided ? <StepCard step={step} /> : null}
          <RenewalMessagePreparation canEdit channel={channel} />
        </RenewalNowCardProvider>
      );
      const view = render(ui(true));
      const name = "Recover exact Gmail attempt";
      const guided = await within(screen.getByRole("region", { name: "Now" })).findByRole(
        "button",
        { name },
      );
      expect(screen.getAllByRole("button", { name })).toEqual([guided]);
      expect(commands).toEqual([]);
      fireEvent.click(guided);
      await waitFor(() =>
        expect(commands).toEqual([
          { kind: "draft", channel, leaseId: "9101", reconcile: { executionId } },
        ]),
      );
      await screen.findByText("The exact attempt still needs review.");
      view.rerender(ui(false));
      await waitFor(() =>
        expect(screen.getAllByRole("button", { name })).toEqual([
          within(screen.getByRole("region", { name: "Unsent Gmail draft" })).getByRole(
            "button",
            { name },
          ),
        ]),
      );
      expect(commands).toHaveLength(1);
    },
  );

  it("offers the tenant recipient source handoff directly from its missing-input row", async () => {
    mountTenant(
      tenantPreparation({
        recipients: {
          status: "blocked",
          reasons: ["Synthetic tenant email is missing."],
        },
      }),
    );
    const fix = await screen.findByRole("button", {
      name: "Check tenant email addresses in RentVine",
    });
    fireEvent.click(fix);
    const link = screen.getByRole("link", { name: "Open lease record in RentVine" });
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute("href", "https://fixture.rentvine.invalid/leases/9101");
    expect(
      document.getElementById(MESSAGE_CONTROL_IDS.recipients("tenant")),
    ).toHaveTextContent("Synthetic tenant email is missing.");
    expect(vi.mocked(fetch).mock.calls.every((call) => !call[1]?.method)).toBe(true);
  });

  it("offers the tenant template publication handoff from its own missing-input row", async () => {
    mountTenant(
      tenantPreparation({
        publication: {
          status: "needs_approval",
          reason: "An Approver reviews this synthetic tenant template.",
        },
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ask an Approver to publish the tenant template",
      }),
    );
    const target = document.getElementById(MESSAGE_CONTROL_IDS.publication("tenant"))!;
    expect(target).toHaveFocus();
    expect(target.closest("details")).toHaveAttribute("open");
    expect(target).toHaveTextContent(
      "An Approver reviews this synthetic tenant template.",
    );
    expect(vi.mocked(fetch).mock.calls.every((call) => !call[1]?.method)).toBe(true);
  });

  it("leads an incomplete tenant offer to its actual marked values and exact shared form setting", async () => {
    mountTenant(
      tenantPreparation({
        facts: tenantFacts({
          ownerTerms: {
            rent: 1437,
            effectiveDate: "2027-01-01",
            endDate: "2027-12-31",
            source: "Synthetic reviewed terms",
          },
        }),
        inputs: {
          ...emptyMessagePreparationInputs(),
          signature: {
            name: "Example Staff",
            role: null,
            phone: null,
            hours: null,
            website: null,
            source: "Synthetic staff entry",
          },
        },
      }),
    );
    const review = await screen.findByRole("button", {
      name: "Review the marked values",
    });
    const readiness = document.getElementById(MESSAGE_CONTROL_IDS.readiness("tenant"))!;
    const link = within(readiness).getByRole("link", {
      name: "Shared resource link: Renewal information form",
    });
    expect(link).toHaveAttribute(
      "href",
      "/connections#renewal-resource-entry-renewal_information_form",
    );
    fireEvent.click(review);
    expect(readiness.querySelector("summary")).toHaveFocus();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getAllByRole("button", { name: "Review the marked values" }),
    ).toHaveLength(1);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.every(
          ([url, init]) => String(url).includes("/message-preparation") && !init?.method,
        ),
    ).toBe(true);
  });

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
