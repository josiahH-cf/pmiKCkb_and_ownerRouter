// S285 R-S285-6 (ARCH-S285-2, BEH-S285-5, AC-S285-2): the release itself holds no review and pauses
// no message. With owner copy v2.1 present and unpublished, an owner message authorized on v2.0 is
// dispatched as reviewed; a new owner review works as before. When an approver publishes v2.1, the
// count stated beforehand equals the messages then held, each hold names "The owner message wording
// was updated", and each is repaired by one update from the lease. Run at the sequence service with
// the real sequence store on a fake Firestore and an isolated mail client; the renewal target is
// built from the same content-basis helper the lease target uses. Synthetic values only; no
// provider request.
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
  type SequenceMailClient,
} from "@/lib/gmail-hub/sequence-service";
import {
  plainCommunicationMessage,
  type VerifiedCommunicationTarget,
} from "@/lib/gmail-hub/sequence-model";
import {
  OWNER_WORDING_UPDATED_INPUT,
  changedInputLine,
  reviewedInput,
  type ReviewedInput,
} from "@/lib/gmail-hub/reviewed-inputs";
import { CommunicationSequenceRefusedError } from "@/lib/gmail-hub/current-message";
import { addCalendarDays, localDateAt } from "@/lib/gmail-hub/schedule-calendar";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
import {
  OWNER_COPY_PUBLICATION_NAMES,
  ownerTermContentBasis,
} from "@/lib/lease-renewal/owner-copy-version";
import { countOwnerMessagesHeldOnPublish } from "@/lib/firestore/renewal-owner-copy-publication";

const actor: AuthenticatedUser = {
  uid: "synthetic-s285-staff",
  email: "synthetic-s285-staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const LEASE = "2850";
const CYCLE = "5c1d2e3f-4a5b-4c6d-8e7f-000000002850";
/** 11/12/2026, 12:00 PM CST. */
const NOW = Date.parse("2026-11-12T18:00:00.000Z");
const ZONE = "America/Chicago";
const V20 = { name: OWNER_COPY_PUBLICATION_NAMES["v2.0"], hash: "a".repeat(64) };
const V21 = { name: OWNER_COPY_PUBLICATION_NAMES["v2.1"], hash: "b".repeat(64) };

interface Facts {
  /** True once v2.1's own publication reads back approved. */
  published: boolean;
  rent: number;
  start: string | null;
  end: string | null;
  to: string;
  notice: string;
}

const context = (): WorkflowCommunicationContext => ({
  lane: "renewals",
  entityType: "renewal_lease",
  entityId: LEASE,
  purpose: "renewal_owner",
  actionKey: "gmail.renewal_notice.send",
  sourceRefs: [`rentvine:lease:${LEASE}`],
});

const money = (value: number) =>
  `$${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
const shown = (iso: string | null) =>
  iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : null;

/** The owner content basis exactly as the lease target builds it (sequence-dependencies). */
function ownerContent(f: Facts, publication: typeof V20, version: "v2.0" | "v2.1") {
  return {
    address: "101 Sample Pl",
    publication: publication.hash,
    ownerIntent: "recommend_rent",
    currentRent: 1400,
    rent: f.rent,
    range: { low: 1350, high: 1500 },
    ...ownerTermContentBasis(version, { effectiveDate: f.start, endDate: f.end }),
  };
}

function ownerValues(
  f: Facts,
  publication: typeof V20,
  version: "v2.0" | "v2.1",
): ReviewedInput[] {
  return [
    reviewedInput("address", "Property address", "101 Sample Pl"),
    reviewedInput("template", "Approved template", publication.name, publication.hash),
    reviewedInput("ownerIntent", "Owner question", "Recommend a rent"),
    reviewedInput("rentToRecommend", "Rent to recommend", money(f.rent)),
    ...(version === "v2.1"
      ? [
          reviewedInput("renewalStart", "Renewal start date", shown(f.start)),
          reviewedInput("renewalEnd", "Renewal end date", shown(f.end)),
        ]
      : []),
  ];
}

function targetFor(
  ctx: WorkflowCommunicationContext,
  f: Facts,
): VerifiedCommunicationTarget {
  const publication = f.published ? V21 : V20;
  const version = f.published ? "v2.1" : "v2.0";
  const content = ownerContent(f, publication, version);
  const values = ownerValues(f, publication, version);
  return {
    context: ctx,
    to: [f.to],
    cc: [],
    sourceRefs: [`rentvine:lease:${LEASE}`],
    label: "101 Sample Pl",
    noticeCycleId: CYCLE,
    signatureSetup: {
      uid: actor.uid,
      email: actor.email,
      revision: 1,
      contentHash: "s".repeat(64),
      choice: "blank",
    },
    materialSourceHash: sequenceHash({
      to: f.to,
      notice: f.notice,
      contentBasis: content,
    }),
    ...(f.published
      ? {
          priorOwnerWordingMaterialSourceHash: sequenceHash({
            to: f.to,
            notice: f.notice,
            contentBasis: ownerContent(f, V20, "v2.0"),
          }),
        }
      : {}),
    reviewedInputs: [
      reviewedInput("to", "To", f.to),
      reviewedInput("cc", "Cc", null),
      ...values,
      reviewedInput("notice", "Notice status", null, f.notice),
    ],
    contentBasis: {
      digest: sequenceHash(content),
      legacyDigest: sequenceHash({ legacy: content }),
      values,
    },
  };
}

const wording = (f: Facts) =>
  plainCommunicationMessage(
    "Lease Renewal for 101 Sample Pl",
    f.published
      ? `Our reviewed rental analysis suggests ${money(f.rent)} per month. The renewal term would run from ${shown(f.start)} through ${shown(f.end)}.`
      : `Our reviewed rental analysis suggests ${money(f.rent)} per month.`,
  );

function setup() {
  const db = new FakeFirestore({ fieldPaths: true });
  const store = new FirestoreCommunicationSequenceStore(db as unknown as Firestore);
  let nowMs = NOW;
  const facts: Facts = {
    published: false,
    rent: 1425,
    start: "2027-01-01",
    end: "2027-12-31",
    to: "owner@example.invalid",
    notice: "none",
  };
  let sends = 0;
  const send = vi.fn(async () => {
    sends += 1;
    return { messageId: `message-${sends}`, threadId: "thread-1", labelIds: ["SENT"] };
  });
  const client = (subject: string): SequenceMailClient => ({
    subject,
    getProfile: async () => ({
      emailAddress: subject,
      messagesTotal: 1,
      threadsTotal: 1,
      historyId: "100",
    }),
    getThread: async (id) => ({ id, truncated: false, historyId: "100", messages: [] }),
    sendWorkflowMessage: send,
    findWorkflowMessage: async () => ({
      messageId: `message-${sends}`,
      threadId: "thread-1",
      labelIds: ["SENT"],
      sentAtMs: nowMs,
    }),
  });
  const service = new WorkflowCommunicationSequenceService({
    store,
    resolveTarget: vi.fn(
      async (_actor: AuthenticatedUser, ctx: WorkflowCommunicationContext) =>
        targetFor(ctx, facts),
    ),
    resolveAttachment: vi.fn(),
    readActor: vi.fn(async () => actor),
    createClient: vi.fn(client),
    assertRuntimeAction: vi.fn(async () => undefined),
    assertEffectEnvironment: vi.fn(),
    now: () => nowMs,
  });
  const scheduleFor = (ms: number) => ({
    firstDate: addCalendarDays(localDateAt(ms, ZONE), 1),
    time: "09:00",
    timeZone: ZONE,
    everyDays: null,
    endDate: null,
    sendLimit: 1,
  });
  async function draft() {
    return service.save(
      actor,
      { id: randomUUID(), context: context(), initial: wording(facts), followUp: null },
      0,
      randomUUID(),
    );
  }
  async function authorize(id: string, action: "send" | "schedule" | "resume") {
    const current = (await store.get(id))!;
    const reviewed = targetFor(current.context, facts);
    return service.authorize(actor, {
      id,
      expectedVersion: current.version,
      operationId: randomUUID(),
      action,
      schedule: action === "schedule" ? scheduleFor(nowMs) : null,
      reviewedDraftHash: sequenceHash({
        initial: current.initial,
        followUp: current.followUp,
      }),
      reviewedTargetHash: reviewedCommunicationTargetHash(reviewed),
      reviewedInputs: reviewed.reviewedInputs ?? null,
    });
  }
  /** "Update from the lease": the lease's current message saved on the communication once. */
  async function updateFromLease(id: string) {
    const current = (await store.get(id))!;
    return service.save(
      actor,
      {
        id,
        context: current.context,
        initial: wording(facts),
        followUp: current.followUp,
      },
      current.version,
      randomUUID(),
    );
  }
  async function tick(id: string) {
    const current = (await store.get(id))!;
    nowMs = Math.max(nowMs, (current.nextDueAtMs ?? nowMs) + 60_000);
    return service.dispatch(id);
  }
  /** The count the publish control states, over the stored records. */
  function heldCount() {
    return countOwnerMessagesHeldOnPublish(db as unknown as Firestore);
  }
  /** Every stored owner communication held for changed facts now. */
  function heldNow() {
    return [...db.store.entries()].filter(
      ([path, data]) =>
        path.startsWith(`${COMMUNICATION_SEQUENCE_COLLECTIONS.sequences}/`) &&
        data.state === "paused" &&
        (data.pause as { cause?: string } | undefined)?.cause === "changed_source",
    ).length;
  }
  return {
    db,
    store,
    send,
    facts,
    draft,
    authorize,
    updateFromLease,
    tick,
    heldCount,
    heldNow,
  };
}

describe("AC-S285-2 the release holds no review and pauses no message", () => {
  it("ARCH-S285-2 / BEH-S285-5: with v2.1 present and unpublished, an owner message authorized under v2.0 sends at its time as reviewed", async () => {
    const f = setup();
    const scheduled = await f.authorize((await f.draft()).id, "schedule");
    expect(scheduled.authorization!.initial.plainText).not.toContain("renewal term");
    const result = await f.tick(scheduled.id);
    expect(result.status).not.toBe("paused");
    expect(f.send).toHaveBeenCalledTimes(1);
    const after = (await f.store.get(scheduled.id))!;
    expect(after.pause ?? null).toBeNull();
    expect(after.confirmedCount).toBe(1);
    expect(f.send.mock.calls.length).toBe(1);
  });

  it("BEH-S285-5: before publication a new owner review authorizes as before", async () => {
    const f = setup();
    const sent = await f.authorize((await f.draft()).id, "send");
    expect(sent.state).not.toBe("paused");
    expect(
      sent.authorizedContentBasis?.values.some((v) => v.key === "renewalStart"),
    ).toBe(false);
  });
});

describe("AC-S285-2 publishing v2.1 holds exactly the messages it counted, each with the named cause", () => {
  it("R-S285-6: the stated count equals the messages held, each names the wording update and is repaired in one update", async () => {
    const f = setup();
    const scheduled = await f.authorize((await f.draft()).id, "schedule");
    const stated = await f.heldCount();
    expect(stated).toBe(1);
    expect(f.heldNow()).toBe(0);
    // An approver publishes v2.1: its record reads back approved and is the copy in use.
    f.facts.published = true;
    const held = await f.tick(scheduled.id);
    expect(held.status).toBe("paused");
    expect(held.sequence.pause).toMatchObject({
      cause: "changed_source",
      changedInputs: [OWNER_WORDING_UPDATED_INPUT],
    });
    expect(changedInputLine(held.sequence.pause!.changedInputs![0]!)).toBe(
      "The owner message wording was updated",
    );
    expect(f.send).not.toHaveBeenCalled();
    expect(f.heldNow()).toBe(stated);
    // Resume with the wording reviewed under v2.0 is refused and names the cause.
    const resume = f.authorize(scheduled.id, "resume");
    await expect(resume).rejects.toBeInstanceOf(CommunicationSequenceRefusedError);
    await expect(resume).rejects.toThrow("The owner message wording was updated.");
    // One update from the lease, then the one-click Schedule authorizes the new wording.
    const updated = await f.updateFromLease(scheduled.id);
    const rescheduled = await f.authorize(updated.id, "schedule");
    expect(rescheduled.state).toBe("active");
    expect(rescheduled.authorization!.initial.plainText).toContain(
      "The renewal term would run from 01/01/2027 through 12/31/2027.",
    );
    // After the repair nothing is counted again: it was reviewed with the new wording.
    expect(await f.heldCount()).toBe(0);
  });

  it("R-S285-3: under v2.1 a later date change refuses the reviewed wording and names the date", async () => {
    const f = setup();
    f.facts.published = true;
    const scheduled = await f.authorize((await f.draft()).id, "schedule");
    f.facts.end = "2027-06-30";
    expect((await f.tick(scheduled.id)).status).toBe("paused");
    await expect(f.authorize(scheduled.id, "resume")).rejects.toMatchObject({
      refusal: {
        reason: "wording_predates_change",
        audience: "owner",
        changes: [
          {
            key: "renewalEnd",
            label: "Renewal end date",
            previous: "12/31/2027",
            current: "06/30/2027",
          },
        ],
      },
    });
    expect(f.send).not.toHaveBeenCalled();
  });
});
