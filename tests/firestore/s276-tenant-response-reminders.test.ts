// S276 against the real Firestore emulator, with the real work-record store, the real sequence store
// and service, a synthetic tenant renewal target and an isolated mail client standing in for Gmail
// (its call count is the stand-in mailbox). A tenant offer is sent with follow-ups authorized; then
// staff record the tenant's response. Accepted, a change request and a decline each pause the
// unsent reminders at save time under "The tenant's response was recorded by staff" with the
// saving actor, and the next worker tick sends none; a pause that could not be written leaves the
// response saved, offers "Stop them", and dispatch (and, failing its read, the claim) still holds
// the reminder; an occurrence claimed before the save is reported truthfully as sent; clearing the
// response resumes nothing; an observed reply still pauses under its own cause; recording a
// response makes no Gmail call; and Resume stays an explicit staff action. Synthetic values only;
// no provider request.
import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  COMMUNICATION_SEQUENCE_COLLECTIONS,
  FirestoreCommunicationSequenceStore,
  reviewedCommunicationTargetHash,
  sequenceHash,
} from "@/lib/gmail-hub/sequence-store";
import { WorkflowCommunicationSequenceService } from "@/lib/gmail-hub/sequence-service";
import { readRecordedTenantResponse } from "@/lib/gmail-hub/sequence-dependencies";
import {
  plainCommunicationMessage,
  type CommunicationSequence,
  type VerifiedCommunicationTarget,
} from "@/lib/gmail-hub/sequence-model";
import { SEQUENCE_PAUSE_CAUSE_LABELS } from "@/lib/gmail-hub/communication-state";
import {
  TENANT_RESPONSE_PAUSE_CAUSE,
  tenantResponseEvidenceId,
} from "@/lib/gmail-hub/tenant-response-hold";
import { reviewedInput, type ReviewedInput } from "@/lib/gmail-hub/reviewed-inputs";
import { addCalendarDays, localDateAt } from "@/lib/gmail-hub/schedule-calendar";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
import type { WorkflowMimeMessage } from "@/lib/gmail-runtime/workflow-mime";
import type { GmailMessageView } from "@/lib/gmail-runtime/types";
import {
  ensureRenewalWorkRecord,
  getRenewalWorkspace,
  saveRenewalWorkspace,
  stopTenantReminders,
  type TenantReminderControl,
} from "@/lib/firestore/renewal-workspace";
import {
  manualRenewalSummary,
  type RenewalWorkBasis,
} from "@/lib/lease-renewal/workspace-state";
import { manualNonRenewalReason } from "@/lib/lease-renewal/notice-safety";

const projectId = "demo-pmi-s276-tenant-response";
const actor: AuthenticatedUser = {
  uid: "synthetic-s276-staff",
  email: "synthetic-s276-staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const LEASE = "9276";
const ZONE = "America/Chicago";
const TENANT = "tenant@example.invalid";
const BASIS: RenewalWorkBasis = {
  kind: "lease_end",
  dateIso: "2026-12-31",
  source: "RentVine lease end",
};
const context: WorkflowCommunicationContext = {
  lane: "renewals",
  entityType: "renewal_lease",
  entityId: LEASE,
  purpose: "renewal_tenant",
  actionKey: "gmail.renewal_notice.send",
  sourceRefs: [`rentvine:lease:${LEASE}`],
};
let app: App, db: Firestore, testEnv: RulesTestEnvironment;

function contentValues(): ReviewedInput[] {
  return [
    reviewedInput("address", "Property address", "101 Sample Pl"),
    reviewedInput(
      "template",
      "Approved template",
      "Synthetic renewal template",
      "t".repeat(64),
    ),
    reviewedInput("renewalRent", "Renewal rent", "$1,450.00"),
    reviewedInput("renewalStart", "Renewal start date", "01/01/2027"),
    reviewedInput("renewalEnd", "Renewal end date", "12/31/2027"),
  ];
}

/** The lease's current read for the work record's cycle, as a renewal target reports it. */
function targetFor(cycleId: string): VerifiedCommunicationTarget {
  const content = contentValues();
  return {
    context,
    to: [TENANT],
    cc: [],
    sourceRefs: [`rentvine:lease:${LEASE}`],
    label: "101 Sample Pl",
    noticeCycleId: cycleId,
    materialSourceHash: sequenceHash({ to: TENANT, content }),
    reviewedInputs: [
      reviewedInput("to", "To", TENANT),
      reviewedInput("cc", "Cc", null),
      ...content,
    ],
    contentBasis: {
      digest: sequenceHash(content),
      legacyDigest: sequenceHash({ legacy: content }),
      values: content,
    },
  };
}

/** One lease's tenant renewal line with its own clock, work record and stand-in mailbox. */
async function fixture(options: { readTenantResponse?: boolean } = {}) {
  const work = await ensureRenewalWorkRecord(actor, LEASE, db, async () => BASIS);
  const cycleId = work.cycleId;
  // The worker's clock and the work record's clock agree: the offer is authorized just before
  // staff record the response.
  const clock = { ms: Date.now() - 60_000 };
  const store = new FirestoreCommunicationSequenceStore(db);
  const replies: GmailMessageView[] = [];
  const mailbox = new Map<
    string,
    { messageId: string; threadId: string; labelIds: string[]; sentAtMs: number }
  >();
  const hook: { duringSend: (() => Promise<void>) | null } = { duringSend: null };
  const send = vi.fn(async (message: WorkflowMimeMessage) => {
    const during = hook.duringSend;
    hook.duringSend = null;
    if (during) await during();
    const result = {
      messageId: `provider-${mailbox.size + 1}`,
      threadId: "provider-thread",
      labelIds: ["SENT"],
      sentAtMs: clock.ms,
    };
    mailbox.set(message.messageId, result);
    return result;
  });
  const createClient = vi.fn((subject: string) => ({
    subject,
    getProfile: async () => ({
      emailAddress: subject,
      messagesTotal: 0,
      threadsTotal: 0,
      historyId: "100",
    }),
    getThread: async (threadId: string) => ({
      id: threadId,
      messages: [...replies],
      truncated: false,
    }),
    sendWorkflowMessage: send,
    findWorkflowMessage: async (rfcMessageId: string) =>
      mailbox.get(rfcMessageId) ?? null,
  }));
  const service = new WorkflowCommunicationSequenceService({
    store,
    resolveTarget: async () => targetFor(cycleId),
    resolveAttachment: async () => {
      throw new Error("No fixture attachments");
    },
    readActor: async () => actor,
    assertRuntimeAction: async () => undefined,
    assertEffectEnvironment: () => undefined,
    now: () => clock.ms,
    createClient,
    ...(options.readTenantResponse === false
      ? {}
      : {
          readTenantResponse: (sequence: CommunicationSequence) =>
            readRecordedTenantResponse(sequence.context.entityId, db),
        }),
  });

  /** Send the tenant offer now with follow-ups authorized: every 7 days, 3 messages in total. */
  async function offerWithFollowUps(): Promise<CommunicationSequence> {
    const saved = await service.save(
      actor,
      {
        id: randomUUID(),
        context,
        initial: plainCommunicationMessage("Lease renewal", "Your renewal offer."),
        followUp: plainCommunicationMessage(
          "Lease renewal",
          "Following up on your renewal offer.",
        ),
      },
      0,
      randomUUID(),
    );
    const reviewed = targetFor(cycleId);
    const authorized = await service.authorize(actor, {
      id: saved.id,
      expectedVersion: saved.version,
      operationId: randomUUID(),
      action: "send",
      schedule: {
        firstDate: addCalendarDays(localDateAt(clock.ms, ZONE), 7),
        time: "09:00",
        timeZone: ZONE,
        everyDays: 7,
        endDate: null,
        sendLimit: 3,
      },
      reviewedDraftHash: sequenceHash({
        initial: saved.initial,
        followUp: saved.followUp,
      }),
      reviewedTargetHash: reviewedCommunicationTargetHash(reviewed),
      reviewedInputs: reviewed.reviewedInputs ?? null,
    });
    const first = await service.dispatch(authorized.id);
    expect(first.status).toBe("sent");
    expect(first.sequence).toMatchObject({ state: "active", confirmedCount: 1 });
    expect(first.sequence.nextDueAtMs).not.toBeNull();
    return first.sequence;
  }

  /** Staff record the tenant's response through the work record's one save. */
  async function recordResponse(
    outcome:
      | "awaiting_response"
      | "accepted"
      | "counter_change_requested"
      | "declined_nonrenewing"
      | "needs_verification",
    reminders?: TenantReminderControl,
  ) {
    const current = (await getRenewalWorkspace(actor, LEASE, db))!;
    return saveRenewalWorkspace(
      actor,
      {
        leaseId: LEASE,
        cycleId: current.cycleId,
        expectedRevision: current.revision,
        operationId: randomUUID(),
        action: { kind: "tenant_response", outcome },
      },
      db,
      undefined,
      undefined,
      undefined,
      reminders,
    );
  }

  /** Moves the clock past this message's due time; one worker visit. */
  async function tick(id: string) {
    const current = (await store.get(id))!;
    clock.ms = Math.max(clock.ms, (current.nextDueAtMs ?? clock.ms) + 60_000);
    return service.dispatch(id);
  }

  return {
    cycleId,
    clock,
    store,
    service,
    send,
    createClient,
    replies,
    hook,
    offerWithFollowUps,
    recordResponse,
    tick,
  };
}

const failingPause: TenantReminderControl = {
  pause: async () => {
    throw new Error("Injected pause-write failure.");
  },
};

async function occurrenceCount() {
  return (await db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences).get()).size;
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s276-tenant-response-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  await testEnv.clearFirestore();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await testEnv.cleanup();
});

describe("S276 R-S276-2 / R-S276-4: a recorded response stops the offer's reminders at save time", () => {
  it.each(["accepted", "counter_change_requested", "declined_nonrenewing"] as const)(
    "BEH-S276-2 / BEH-S276-3 / AC-S276-2: saving %s pauses the reminders with the new cause and the saving actor, and the next tick sends none",
    async (outcome) => {
      const f = await fixture();
      const offer = await f.offerWithFollowUps();
      const saved = await f.recordResponse(outcome);
      expect(saved.state?.tenantResponse?.outcome).toBe(outcome);
      expect(saved.tenantReminders).toEqual({ state: "stopped", paused: 1 });
      const paused = (await f.store.get(offer.id))!;
      expect(paused).toMatchObject({
        state: "paused",
        nextDueAtMs: null,
        pause: {
          cause: TENANT_RESPONSE_PAUSE_CAUSE,
          byUid: actor.uid,
          evidenceIds: [tenantResponseEvidenceId(saved.state!.tenantResponse!.eventId)],
        },
      });
      // The communication reads the cause as Communications shows it.
      expect(`Paused: ${SEQUENCE_PAUSE_CAUSE_LABELS[paused.pause!.cause]}.`).toBe(
        "Paused: The tenant's response was recorded by staff.",
      );
      const next = await f.tick(offer.id);
      expect(next.status).not.toBe("sent");
      expect(f.send).toHaveBeenCalledTimes(1);
      expect(await occurrenceCount()).toBe(1);
      if (outcome === "declined_nonrenewing") {
        // R-S276-4: the decline's existing effect on the renewal path is unchanged, and the
        // reminder reads as a response, not as changed lease facts.
        expect(manualNonRenewalReason(saved.state)).not.toBeNull();
        expect(manualRenewalSummary(saved.state).nextActivity).toBe(
          "non_renewal_handoff",
        );
        expect((await f.store.get(offer.id))!.pause?.cause).not.toBe("changed_source");
      }
    },
  );

  it("R-S276-2: a response still needing verification leaves the existing reminder authorized", async () => {
    const f = await fixture();
    const offer = await f.offerWithFollowUps();
    const saved = await f.recordResponse("needs_verification");
    expect(saved.state?.tenantResponse?.outcome).toBe("needs_verification");
    expect(saved).not.toHaveProperty("tenantReminders");
    expect(await f.store.get(offer.id)).toMatchObject({
      state: "active",
      nextDueAtMs: offer.nextDueAtMs,
    });
    expect((await f.tick(offer.id)).status).toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(2);
  });
});

describe("S276 R-S276-3: a due reminder is held even when the pause was not written", () => {
  it("BEH-S276-4 / AC-S276-3: the response stays saved, the step offers Stop them, and dispatch holds the reminder", async () => {
    const f = await fixture();
    const offer = await f.offerWithFollowUps();
    const saved = await f.recordResponse("accepted", failingPause);
    expect(saved.state?.tenantResponse?.outcome).toBe("accepted");
    expect(saved.tenantReminders).toEqual({ state: "failed", paused: 0 });
    expect((await f.store.get(offer.id))!.state).toBe("active");
    const held = await f.tick(offer.id);
    expect(held.status).toBe("paused");
    expect(held.sequence.pause?.cause).toBe(TENANT_RESPONSE_PAUSE_CAUSE);
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(await occurrenceCount()).toBe(1);
  });

  it("ARCH-S276-2 / AC-S276-3: with dispatch's read missing the response, the claim transaction holds the reminder", async () => {
    const f = await fixture({ readTenantResponse: false });
    const offer = await f.offerWithFollowUps();
    await f.recordResponse("accepted", failingPause);
    const held = await f.tick(offer.id);
    expect(held.status).toBe("paused");
    expect(held.sequence.pause?.cause).toBe(TENANT_RESPONSE_PAUSE_CAUSE);
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(await occurrenceCount()).toBe(1);
  });

  it("BEH-S276-4: Stop them pauses the reminders the recorded response holds, with the staff member who chose it", async () => {
    const f = await fixture();
    const offer = await f.offerWithFollowUps();
    await f.recordResponse("accepted", failingPause);
    const stopped = await stopTenantReminders(
      actor,
      { leaseId: LEASE, cycleId: f.cycleId },
      db,
    );
    expect(stopped).toEqual({ state: "stopped", paused: 1 });
    expect((await f.store.get(offer.id))!).toMatchObject({
      state: "paused",
      pause: { cause: TENANT_RESPONSE_PAUSE_CAUSE, byUid: actor.uid },
    });
    // Stopping again finds nothing scheduled.
    expect(
      await stopTenantReminders(actor, { leaseId: LEASE, cycleId: f.cycleId }, db),
    ).toEqual({ state: "none", paused: 0 });
  });

  it("AC-S276-3: racing workers after a failed pause make zero provider attempts", async () => {
    const f = await fixture();
    const offer = await f.offerWithFollowUps();
    await f.recordResponse("accepted", failingPause);
    const due = (await f.store.get(offer.id))!.nextDueAtMs!;
    f.clock.ms = due + 60_000;
    await Promise.allSettled(
      Array.from({ length: 4 }, () => f.service.dispatch(offer.id)),
    );
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(await occurrenceCount()).toBe(1);
    expect((await f.store.get(offer.id))!.pause?.cause).toBe(TENANT_RESPONSE_PAUSE_CAUSE);
  });

  it("AC-S276-3: an occurrence claimed before the save is reported truthfully as sent, and nothing follows it", async () => {
    const f = await fixture();
    const offer = await f.offerWithFollowUps();
    // Staff save the response while the worker's admitted attempt is with Gmail.
    f.hook.duringSend = async () => {
      const saved = await f.recordResponse("accepted");
      expect(saved.tenantReminders).toEqual({ state: "stopped", paused: 1 });
    };
    const raced = await f.tick(offer.id);
    expect(raced.status).toBe("sent");
    expect(raced.sequence).toMatchObject({
      state: "paused",
      confirmedCount: 2,
      unresolvedOccurrenceId: null,
      pause: { cause: TENANT_RESPONSE_PAUSE_CAUSE },
    });
    expect(f.send).toHaveBeenCalledTimes(2);
    expect((await f.tick(offer.id)).status).not.toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(2);
  });
});

describe("S276 AC-S276-7: the release holds no review and pauses no message by itself", () => {
  it("AC-S276-7: a pre-release tenant offer with follow-ups dispatches the exact reviewed reminder", async () => {
    const f = await fixture();
    const offer = await f.offerWithFollowUps();
    const authorization = offer.authorization!;
    const followUp = authorization.followUp!;
    // The serving build did not store the S272/S273/S274 review metadata.
    await db
      .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
      .doc(offer.id)
      .update({
        authorizedInputs: FieldValue.delete(),
        authorizedContentBasis: FieldValue.delete(),
        wordingSavedAfterRevision: FieldValue.delete(),
        unsentHistory: FieldValue.delete(),
      });
    const reminder = await f.tick(offer.id);
    expect(reminder.status).toBe("sent");
    expect(reminder.sequence.confirmedCount).toBe(2);
    expect(reminder.sequence.authorization).toEqual(authorization);
    expect(reminder.sequence.pause ?? null).toBeNull();
    expect(f.send.mock.calls[1]?.[0]).toMatchObject({
      to: authorization.to,
      cc: authorization.cc,
      subject: followUp.subject,
      body: followUp.plainText,
      htmlBody: followUp.htmlBody,
    });
    expect(f.send).toHaveBeenCalledTimes(2);
  });
});

describe("S276 R-S276-5 / R-S276-6 and the safety boundary", () => {
  it("BEH-S276-5 / AC-S276-4: clearing the response leaves the reminders paused", async () => {
    const f = await fixture();
    const offer = await f.offerWithFollowUps();
    await f.recordResponse("accepted");
    const cleared = await f.recordResponse("awaiting_response");
    expect(cleared.state?.tenantResponse?.outcome).toBe("awaiting_response");
    expect(cleared).not.toHaveProperty("tenantReminders");
    expect((await f.store.get(offer.id))!).toMatchObject({
      state: "paused",
      pause: { cause: TENANT_RESPONSE_PAUSE_CAUSE },
    });
    expect((await f.tick(offer.id)).status).not.toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it("R-S276-6 / AC-S276-4: a verified tenant reply with no recorded response still pauses under its own cause", async () => {
    const f = await fixture();
    const offer = await f.offerWithFollowUps();
    f.replies.push({
      id: "reply-1",
      threadId: "provider-thread",
      labelIds: ["INBOX"],
      internalDate: String(f.clock.ms + 1_000),
      from: `Synthetic Tenant <${TENANT}>`,
      to: [actor.email],
      cc: [],
      bcc: [],
      subject: "Re: Lease renewal",
      date: new Date(f.clock.ms + 1_000).toUTCString(),
      messageId: "<reply-1@example.invalid>",
      references: [],
      bodyText: "",
      bodyTruncated: false,
      attachments: [],
    });
    const held = await f.tick(offer.id);
    expect(held.status).toBe("paused");
    expect(held.sequence.pause?.cause).toBe("reply");
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it("AC-S276-4 / AC-S276-5: recording a response makes no Gmail call, sends nothing and cancels nothing; Resume stays an explicit staff action", async () => {
    const f = await fixture();
    const offer = await f.offerWithFollowUps();
    const clients = f.createClient.mock.calls.length;
    await f.recordResponse("accepted");
    expect(f.createClient.mock.calls.length).toBe(clients);
    expect(f.send).toHaveBeenCalledTimes(1);
    const paused = (await f.store.get(offer.id))!;
    expect(paused.state).toBe("paused");
    expect(paused.state).not.toBe("cancelled");
    // Ticks never resume it.
    expect((await f.tick(offer.id)).status).not.toBe("sent");
    // Staff Resume it under the existing review, after the response: due at once, and one
    // dispatch sends the follow-up.
    f.clock.ms = Date.now() + 3_600_000;
    const reviewed = targetFor(f.cycleId);
    const resumed = await f.service.authorize(actor, {
      id: offer.id,
      expectedVersion: (await f.store.get(offer.id))!.version,
      operationId: randomUUID(),
      action: "resume",
      schedule: null,
      reviewedDraftHash: sequenceHash({
        initial: paused.initial,
        followUp: paused.followUp,
      }),
      reviewedTargetHash: reviewedCommunicationTargetHash(reviewed),
      reviewedInputs: reviewed.reviewedInputs ?? null,
    });
    expect(resumed.state).toBe("active");
    expect((await f.service.dispatch(offer.id)).status).toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(2);
  });
});
