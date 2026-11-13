// S274 ARCH-S274-1, ARCH-S274-2, ARCH-S274-3 and R-S274-7, at the sequence service with a fake
// store and an isolated mail client: confirm compares only on a settled lease read (joined and read
// again within the bound), says "still reading" past the bound with nothing written, and names
// each changed input of a real change; dispatch tells a read still settling from a change before
// any claim, waits without a pause, and holds a settled difference with its changed inputs; the
// worker counts the waits. Synthetic values only; no provider request.
import type { Firestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "../helpers/fake-firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  COMMUNICATION_SEQUENCE_COLLECTIONS,
  FirestoreCommunicationSequenceStore,
  reviewedCommunicationTargetHash,
  sequenceHash,
} from "@/lib/gmail-hub/sequence-store";
import {
  WorkflowCommunicationSequenceService,
  settleCommunicationTarget,
  type SequenceMailClient,
} from "@/lib/gmail-hub/sequence-service";
import {
  plainCommunicationMessage,
  type VerifiedCommunicationTarget,
} from "@/lib/gmail-hub/sequence-model";
import {
  LEASE_READ_NOT_SETTLED_MESSAGE,
  LeaseReadNotSettledError,
  CommunicationTargetChangedError,
  reviewedInput,
  type ReviewedInput,
} from "@/lib/gmail-hub/reviewed-inputs";
import {
  CommunicationWorkerStore,
  runCommunicationWorker,
} from "@/lib/gmail-hub/sequence-worker";
import {
  describeSequenceObservation,
  describeWorkerHealth,
} from "@/lib/gmail-hub/communication-state";

const actor: AuthenticatedUser = {
  uid: "staff-one",
  email: "staff-one@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const context = {
  lane: "renewals" as const,
  entityType: "renewal_lease" as const,
  entityId: "274",
  purpose: "renewal_owner" as const,
  actionKey: "gmail.renewal_notice.send",
  sourceRefs: ["rentvine:lease:274"],
};

function inputs(rent: string, to = "owner@example.invalid"): ReviewedInput[] {
  return [
    reviewedInput("to", "To", to),
    reviewedInput("cc", "Cc", null),
    reviewedInput("rentToRecommend", "Rent to recommend", rent),
  ];
}

function target(
  overrides: Partial<VerifiedCommunicationTarget> = {},
): VerifiedCommunicationTarget {
  return {
    context,
    to: ["owner@example.invalid"],
    cc: [],
    sourceRefs: context.sourceRefs,
    materialSourceHash: "a".repeat(64),
    label: "Synthetic fixture lease",
    reviewedInputs: inputs("$1,400.00"),
    readSettlement: { state: "settled" },
    ...overrides,
  };
}

const NOT_READY: Partial<VerifiedCommunicationTarget> = {
  materialSourceHash: "9".repeat(64),
  readSettlement: { state: "not_settled", reason: "generation_not_ready" },
};

function setup() {
  const db = new FakeFirestore();
  const store = new FirestoreCommunicationSequenceStore(db as unknown as Firestore);
  let nowMs = Date.parse("2026-11-13T15:00Z");
  /** Each read answers the next queued target; once used up, the current one. */
  const queue: VerifiedCommunicationTarget[] = [];
  let current = target();
  const resolveTarget = vi.fn(async () => queue.shift() ?? current);
  const waits: number[] = [];
  const waitForLeaseRead = vi.fn(async (ms: number) => {
    waits.push(ms);
  });
  const send = vi.fn(async () => ({
    messageId: "message-1",
    threadId: "thread-1",
    labelIds: ["SENT"],
  }));
  const client = (subject: string): SequenceMailClient => ({
    subject,
    getProfile: async () => ({
      emailAddress: actor.email,
      messagesTotal: 1,
      threadsTotal: 1,
      historyId: "100",
    }),
    getThread: async (id) => ({ id, truncated: false, historyId: "100", messages: [] }),
    sendWorkflowMessage: send,
    findWorkflowMessage: async () => ({
      messageId: "message-1",
      threadId: "thread-1",
      labelIds: ["SENT"],
      sentAtMs: nowMs,
    }),
  });
  const claim = vi.spyOn(store, "claim");
  const deps = {
    store,
    resolveTarget,
    waitForLeaseRead,
    resolveAttachment: vi.fn(),
    readActor: vi.fn(async () => actor),
    createClient: vi.fn(client),
    assertRuntimeAction: vi.fn(async () => undefined),
    assertEffectEnvironment: vi.fn(),
    now: () => nowMs,
  };
  const service = new WorkflowCommunicationSequenceService(deps);
  const draft = {
    id: randomUUID(),
    context,
    initial: plainCommunicationMessage("Lease update", "A reviewed update."),
    followUp: null,
  };
  /** The saved draft: saved once, then read as it stands (a refused confirm writes nothing). */
  async function save() {
    return (await store.get(draft.id)) ?? service.save(actor, draft, 0, randomUUID());
  }
  /** Authorize against the review the staff member saw (`reviewed`). */
  async function authorize(
    action: "send" | "schedule",
    reviewed: VerifiedCommunicationTarget = target(),
  ) {
    const s = await save();
    return service.authorize(actor, {
      id: s.id,
      expectedVersion: s.version,
      operationId: randomUUID(),
      action,
      schedule:
        action === "schedule"
          ? {
              firstDate: "2026-11-14",
              time: "09:00",
              timeZone: "America/Chicago",
              everyDays: null,
              endDate: null,
              sendLimit: 1,
            }
          : null,
      reviewedTargetHash: reviewedCommunicationTargetHash(reviewed),
      reviewedDraftHash: sequenceHash({ initial: s.initial, followUp: s.followUp }),
      reviewedInputs: reviewed.reviewedInputs ?? null,
    });
  }
  return {
    db,
    store,
    service,
    deps,
    queue,
    waits,
    send,
    claim,
    resolveTarget,
    authorize,
    setCurrent: (next: VerifiedCommunicationTarget) => {
      current = next;
    },
    setNow: (ms: number) => {
      nowMs = ms;
    },
    now: () => nowMs,
  };
}

describe("S274 ARCH-S274-1: confirm compares only on a settled read", () => {
  it("ARCH-S274-1 / AC-S274-1: a read superseded by an admission in flight is read again and the message is authorized", async () => {
    const f = setup();
    f.queue.push(target(NOT_READY));
    const sequence = await f.authorize("schedule");
    expect(sequence.state).toBe("active");
    expect(sequence.authorization).not.toBeNull();
    // Joined once, then the settled read compared equal.
    expect(f.waits).toEqual([1_500]);
    expect(f.resolveTarget).toHaveBeenCalledWith(actor, context, { settle: true });
  });

  it("R-S274-2 / AC-S274-1: a retirement status unavailable only because the read is not fresh settles inside the bound", async () => {
    const f = setup();
    f.queue.push(
      target({
        materialSourceHash: "8".repeat(64),
        readSettlement: { state: "not_settled", reason: "retirement_not_fresh" },
      }),
      target({
        materialSourceHash: "8".repeat(64),
        readSettlement: { state: "not_settled", reason: "retirement_not_fresh" },
      }),
    );
    expect((await f.authorize("schedule")).state).toBe("active");
    expect(f.waits).toEqual([1_500, 3_000]);
  });

  it("a refused admission (floors advanced while reading) is a read in flight, read again", async () => {
    const f = setup();
    f.resolveTarget.mockRejectedValueOnce(new LeaseReadNotSettledError("read_in_flight"));
    expect((await f.authorize("schedule")).state).toBe("active");
    expect(f.waits).toEqual([1_500]);
  });

  it("BEH-S274-5 / AC-S274-2: past the bound the result is the typed still-reading one, and nothing is written, sent or paused", async () => {
    const f = setup();
    f.setCurrent(target(NOT_READY));
    const s = await f.service.save(
      actor,
      {
        id: randomUUID(),
        context,
        initial: plainCommunicationMessage("Lease update", "A reviewed update."),
        followUp: null,
      },
      0,
      randomUUID(),
    );
    const before = await f.store.get(s.id);
    const refusal = f.service.authorize(actor, {
      id: s.id,
      expectedVersion: s.version,
      operationId: randomUUID(),
      action: "send",
      schedule: null,
      reviewedTargetHash: reviewedCommunicationTargetHash(target()),
      reviewedDraftHash: sequenceHash({ initial: s.initial, followUp: s.followUp }),
    });
    await expect(refusal).rejects.toBeInstanceOf(LeaseReadNotSettledError);
    await expect(refusal).rejects.toThrow(LEASE_READ_NOT_SETTLED_MESSAGE);
    // Three re-reads over about ten seconds, then stop.
    expect(f.waits).toEqual([1_500, 3_000, 5_000]);
    expect(f.resolveTarget).toHaveBeenCalledTimes(4);
    const after = await f.store.get(s.id);
    expect(after).toEqual(before);
    expect(after?.authorization).toBeNull();
    expect(after?.pause).toBeNull();
    expect(f.send).not.toHaveBeenCalled();
  });

  it("an unreadable source is never treated as unchanged: it is refused at once, not waited on", async () => {
    const f = setup();
    f.resolveTarget.mockRejectedValueOnce(new Error("source offline"));
    await expect(f.authorize("send")).rejects.toThrow("source offline");
    expect(f.waits).toEqual([]);
    expect(f.send).not.toHaveBeenCalled();
  });

  it("ARCH-S274-3 / AC-S274-4: a settled difference is refused once with each changed input and both values", async () => {
    const f = setup();
    f.setCurrent(
      target({ materialSourceHash: "b".repeat(64), reviewedInputs: inputs("$1,425.00") }),
    );
    const refusal = f.authorize("send");
    await expect(refusal).rejects.toBeInstanceOf(CommunicationTargetChangedError);
    const error = (await refusal.catch(
      (e: unknown) => e,
    )) as CommunicationTargetChangedError;
    expect(error.code).toBe("target_changed");
    expect(error.changes).toEqual([
      {
        key: "rentToRecommend",
        label: "Rent to recommend",
        previous: "$1,400.00",
        current: "$1,425.00",
      },
    ]);
    expect(error.message).toContain("Rent to recommend: was $1,400.00, now $1,425.00");
    expect(f.waits).toEqual([]);
    expect(f.send).not.toHaveBeenCalled();
  });

  it("BEH-S274-2: a second confirmation of the reloaded review sends that message exactly once", async () => {
    const f = setup();
    const changed = target({
      materialSourceHash: "b".repeat(64),
      reviewedInputs: inputs("$1,425.00"),
    });
    f.setCurrent(changed);
    await expect(f.authorize("send")).rejects.toBeInstanceOf(
      CommunicationTargetChangedError,
    );
    const sequence = await f.authorize("send", changed);
    const result = await f.service.dispatch(sequence.id);
    expect(result.status).toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it("R-S274-6: an authorization keeps the inputs its review displayed, beside the authorization", async () => {
    const f = setup();
    const sequence = await f.authorize("schedule");
    expect(sequence.authorizedInputs).toEqual({
      revision: sequence.authorization!.revision,
      inputs: inputs("$1,400.00"),
    });
  });
});

describe("S274 ARCH-S274-2: dispatch tells not settled from changed before any claim", () => {
  it("BEH-S274-3 / AC-S274-3: a due message checked during an admitted read is neither sent nor paused, and sends on the next settled check", async () => {
    const f = setup();
    const scheduled = await f.authorize("schedule");
    f.setNow((scheduled.nextDueAtMs ?? f.now()) + 60_000);
    f.queue.push(target(NOT_READY));
    const waited = await f.service.dispatch(scheduled.id);
    expect(waited.status).toBe("awaiting_source");
    expect(waited.waitedOnLeaseRead).toBe(true);
    expect(waited.sequence.state).toBe("active");
    expect(waited.sequence.pause).toBeNull();
    expect(waited.sequence.observation).toMatchObject({
      state: "unavailable",
      reason: "lease_read_settling",
    });
    expect(f.claim).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
    // The worker does not wait inside a run: one read, re-checked on the next run.
    expect(f.waits).toEqual([]);
    const next = await f.service.dispatch(scheduled.id);
    expect(next.status).toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it("BEH-S274-4 / AC-S274-5: a settled difference holds the message with each changed input and both values", async () => {
    const f = setup();
    const scheduled = await f.authorize("schedule");
    f.setNow((scheduled.nextDueAtMs ?? f.now()) + 60_000);
    f.setCurrent(
      target({ materialSourceHash: "b".repeat(64), reviewedInputs: inputs("$1,425.00") }),
    );
    const held = await f.service.dispatch(scheduled.id);
    expect(held.status).toBe("paused");
    expect(held.sequence.pause).toMatchObject({
      cause: "changed_source",
      changedInputs: [
        {
          key: "rentToRecommend",
          label: "Rent to recommend",
          previous: "$1,400.00",
          current: "$1,425.00",
        },
      ],
    });
    expect(f.claim).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
  });

  it("an authorization that kept no inputs holds with the cause alone; no value is guessed", async () => {
    const f = setup();
    const scheduled = await f.authorize("schedule");
    // As a record authorized before the inputs were kept.
    const ref = f.db
      .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
      .doc(scheduled.id);
    const { authorizedInputs, ...earlier } = (await ref.get()).data() as Record<
      string,
      unknown
    >;
    expect(authorizedInputs).toBeDefined();
    await ref.set(earlier);
    f.setNow((scheduled.nextDueAtMs ?? f.now()) + 60_000);
    f.setCurrent(target({ materialSourceHash: "b".repeat(64) }));
    const held = await f.service.dispatch(scheduled.id);
    expect(held.sequence.pause?.cause).toBe("changed_source");
    expect(held.sequence.pause?.changedInputs).toBeUndefined();
  });

  it("an unreadable source still waits as before, with its own reason and no lease-read count", async () => {
    const f = setup();
    const scheduled = await f.authorize("schedule");
    f.setNow((scheduled.nextDueAtMs ?? f.now()) + 60_000);
    f.resolveTarget.mockRejectedValueOnce(new Error("source offline"));
    const result = await f.service.dispatch(scheduled.id);
    expect(result.status).toBe("awaiting_source");
    expect(result.waitedOnLeaseRead).toBeUndefined();
    expect(result.sequence.observation?.reason).toBe("source_unavailable");
  });
});

describe("S274 R-S274-7: the worker counts the waits", () => {
  it("R-S274-7 / AC-S274-3: the last-run counts show the wait, hold none and name no record or address", async () => {
    const f = setup();
    const scheduled = await f.authorize("schedule");
    f.setNow((scheduled.nextDueAtMs ?? f.now()) + 60_000);
    vi.spyOn(f.store, "list").mockImplementation(async () => ({
      sequences: [(await f.store.get(scheduled.id))!],
      cursor: null,
    }));
    const workers = new CommunicationWorkerStore(f.db as unknown as Firestore);
    f.queue.push(target(NOT_READY));
    const first = await runCommunicationWorker({
      service: f.service,
      store: workers,
      now: f.now,
    });
    expect(first).toMatchObject({ sent: 0, held: 0, waitedOnLeaseRead: 1 });
    const lastRun = await workers.readLastRun(f.now());
    expect(lastRun?.counts).toMatchObject({ sent: 0, held: 0, waitedOnLeaseRead: 1 });
    expect(JSON.stringify(lastRun)).not.toMatch(/@|owner|Lease update/);
    const lines = describeWorkerHealth(
      {
        lastRun,
        complete: true,
        oldestPastDue: null,
        oldestObservation: null,
        neverChecked: 0,
      },
      f.now() + 60_000,
      () => "11/14/2026, 9:00 AM CST",
    );
    expect(lines[0]).toContain("1 waited on a lease read");
    f.setNow(f.now() + 120_000);
    const second = await runCommunicationWorker({
      service: f.service,
      store: workers,
      now: f.now,
    });
    expect(second).toMatchObject({ sent: 1, held: 0, waitedOnLeaseRead: 0 });
  });

  it("the wait reads as a wait on a lease read, not as a hold or an incoming failure", () => {
    expect(
      describeSequenceObservation(
        {
          checkedAtMs: 0,
          state: "unavailable",
          historyId: null,
          reason: "lease_read_settling",
          unavailableSinceMs: 0,
        },
        120_000,
      ),
    ).toBe(
      "Waiting on a lease read: the lease was being re-read at the due time, so the message waits for the next check (last check 2 min ago)",
    );
  });
});

describe("S274 ARCH-S274-1: the settle helper", () => {
  it("returns the first settled target and never waits more than the bound", async () => {
    const waits: number[] = [];
    let reads = 0;
    const result = await settleCommunicationTarget(
      async () => {
        reads += 1;
        return target(NOT_READY);
      },
      [1, 2, 3],
      async (ms) => {
        waits.push(ms);
      },
    );
    expect(result).toEqual({ state: "not_settled", reason: "generation_not_ready" });
    expect(reads).toBe(4);
    expect(waits).toEqual([1, 2, 3]);
    expect(
      await settleCommunicationTarget(
        async () => target(),
        [],
        async () => undefined,
      ),
    ).toMatchObject({ state: "settled" });
  });
});
