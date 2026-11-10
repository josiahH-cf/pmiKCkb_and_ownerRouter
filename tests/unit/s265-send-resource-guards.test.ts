import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { GmailRuntimeError } from "@/lib/gmail-runtime/client";
import {
  FirestoreCommunicationSequenceStore,
  sequenceHash,
} from "@/lib/gmail-hub/sequence-store";
import {
  WorkflowCommunicationSequenceService,
  type SequenceMailClient,
} from "@/lib/gmail-hub/sequence-service";
import type {
  CommunicationSequence,
  RichCommunicationMessage,
  VerifiedCommunicationTarget,
} from "@/lib/gmail-hub/sequence-model";
import type { WorkflowMimeMessage } from "@/lib/gmail-runtime/workflow-mime";
import { RenewalResourceSettingsSchema } from "@/lib/lease-renewal/resource-locations";
import {
  TENANT_RESOURCE_PURPOSES,
  tenantResourceUses,
} from "@/lib/lease-renewal/tenant-resource-evidence";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import { FakeFirestore } from "../helpers/fake-firestore";

// S265 AC-S265-4 (R-S265-3/4, ARCH-S265-4, BEH-S265-3/4) on the real communication service and the
// real Firestore sequence store over a fake database, with guarded synthetic Gmail adapters. The
// authorization freezes the evidence of the resources each exact message includes; the immediate
// send and the scheduled dispatch recheck it against a fresh settings read, and the durable claim
// rereads it inside its transaction. A same-link proof change, a revocation, an expiry and a
// restricted proof for a different recipient refuse that unsent occurrence before dispatch. A change
// to an omitted resource adds and invalidates nothing; a legacy authorization holds only when its
// stored content includes a resource; confirmed and uncertain attempts keep their evidence.

const actor: AuthenticatedUser = {
  uid: "s265-sender",
  email: "s265-sender@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const TENANT = "tenant-one@fixture-rental.net";
const context = {
  lane: "renewals" as const,
  entityType: "renewal_lease" as const,
  entityId: "265",
  purpose: "renewal_tenant" as const,
  actionKey: "gmail.renewal_notice.send",
  sourceRefs: ["rentvine:lease:265"],
};
const URLS = {
  insurance_flyer: "https://fixture-rental.net/insurance-flyer.pdf",
  rbp_flyer: "https://fixture-rental.net/rbp-flyer.pdf",
  renewal_information_form: "https://fixture-rental.net/renewal-form",
} as const;
type Id = keyof typeof URLS;

function checked(id: Id, proofVersion: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    url: URLS[id],
    verified: true,
    recordedAt: "2026-11-10T15:00:00.000Z",
    recordedByUid: "fixture-admin",
    tenantAccess: {
      purpose: TENANT_RESOURCE_PURPOSES[id],
      destination: URLS[id],
      documentVersion: `${id} 2026-11`,
      audience: { kind: "tenant_wide" },
      method: "signed_out_open",
      result: "current_document",
      checkedBy: "Fixture Resource Owner",
      checkedOn: "2026-11-10",
      validUntil: "2026-12-31",
      proof: { id: String(proofVersion % 10).repeat(32), version: proofVersion },
      ...overrides,
    },
  };
}
function offer(includeRbp: boolean, subject = "Lease Renewal for 265 Fixture Lane") {
  return {
    subject,
    layout: "renewal" as const,
    attachmentIds: [],
    paragraphs: [
      [{ text: "Hello Fixture," }],
      [{ text: "Rent: $1,100.00 per month, effective 01/01/2027." }],
      ...(includeRbp
        ? [[{ text: "Resident Benefits Package information", href: URLS.rbp_flyer }]]
        : []),
      [{ text: "Kindest Regards," }],
    ],
  } satisfies RichCommunicationMessage;
}
const reminder: RichCommunicationMessage = {
  subject: "Lease Renewal for 265 Fixture Lane",
  layout: "renewal",
  attachmentIds: [],
  paragraphs: [[{ text: "A reminder about your renewal offer." }]],
};

function setup(entries: Record<string, unknown>) {
  const db = new FakeFirestore();
  const store = new FirestoreCommunicationSequenceStore(db as unknown as Firestore);
  let nowMs = Date.parse("2026-11-12T15:00:00.000Z");
  let version = 1;
  const writeSettings = (next: Record<string, unknown>) =>
    db.seed("renewal_resource_locations/current", { version: version++, entries: next });
  writeSettings(entries);
  const readSettings = () =>
    RenewalResourceSettingsSchema.parse(
      db.store.get("renewal_resource_locations/current"),
    );
  const target = (): VerifiedCommunicationTarget => ({
    context,
    to: [TENANT],
    cc: [],
    sourceRefs: context.sourceRefs,
    materialSourceHash: "a".repeat(64),
    label: "Synthetic fixture lease",
    tenantResources: tenantResourceUses(readSettings(), businessDateIso(nowMs)),
    tenantResourceRequired: [],
  });
  const sent = new Map<
    string,
    { messageId: string; threadId: string; sentAtMs: number }
  >();
  let failNextSend: "ambiguous" | null = null;
  let beforeClaim: (() => void) | null = null;
  const send = vi.fn(async (message: WorkflowMimeMessage) => {
    const result = {
      messageId: `provider-${sent.size + 1}`,
      threadId: "provider-thread",
      labelIds: ["SENT"],
      sentAtMs: nowMs,
    };
    sent.set(message.messageId, result);
    if (failNextSend === "ambiguous") {
      failNextSend = null;
      throw new GmailRuntimeError("Synthetic lost response", 503, true);
    }
    return result;
  });
  const getProfile = vi.fn(async () => {
    const hook = beforeClaim;
    beforeClaim = null;
    hook?.();
    return {
      emailAddress: actor.email,
      messagesTotal: 0,
      threadsTotal: 0,
      historyId: "100",
    };
  });
  const createClient = (subject: string): SequenceMailClient => ({
    subject,
    getProfile,
    getThread: vi.fn(async (id: string) => ({
      id,
      truncated: false,
      historyId: "100",
      messages: [],
    })),
    sendWorkflowMessage: send,
    findWorkflowMessage: vi.fn(async (id: string) => {
      const found = sent.get(id);
      return found ? { ...found, labelIds: ["SENT"] } : null;
    }),
  });
  const service = new WorkflowCommunicationSequenceService({
    store,
    resolveTarget: vi.fn(async () => target()),
    resolveAttachment: vi.fn(),
    readActor: vi.fn(async () => actor),
    createClient,
    assertRuntimeAction: vi.fn(async () => undefined),
    assertEffectEnvironment: vi.fn(),
    now: () => nowMs,
  });
  async function authorize(
    initial: RichCommunicationMessage,
    followUp: RichCommunicationMessage | null,
    action: "send" | "schedule" | "resume",
    existing?: CommunicationSequence,
  ) {
    const s =
      existing ??
      (await service.save(
        actor,
        { id: randomUUID(), context, initial, followUp },
        0,
        randomUUID(),
      ));
    const current = target();
    return service.authorize(actor, {
      id: s.id,
      expectedVersion: s.version,
      operationId: randomUUID(),
      action,
      schedule:
        action === "schedule"
          ? {
              firstDate: "2026-11-13",
              time: "09:00",
              timeZone: "America/Chicago",
              everyDays: followUp ? 3 : null,
              endDate: null,
              sendLimit: followUp ? 2 : 1,
            }
          : null,
      reviewedTargetHash: sequenceHash({
        to: current.to,
        cc: current.cc,
        materialSourceHash: current.materialSourceHash,
      }),
      reviewedDraftHash: sequenceHash({ initial: s.initial, followUp: s.followUp }),
    });
  }
  async function dueTick(sequence: CommunicationSequence) {
    const latest = (await store.get(sequence.id)) ?? sequence;
    nowMs = Math.max(nowMs, (latest.nextDueAtMs ?? nowMs) + 60_000);
    return service.dispatch(sequence.id);
  }
  return {
    db,
    store,
    service,
    send,
    authorize,
    dueTick,
    writeSettings,
    setNow: (value: number) => {
      nowMs = value;
    },
    failNextSend: () => {
      failNextSend = "ambiguous";
    },
    beforeClaim: (hook: () => void) => {
      beforeClaim = hook;
    },
  };
}

describe("S265 AC-S265-4: the immediate send and the scheduled dispatch recheck included proof", () => {
  it("freezes the included proof at authorization and sends now with the same proof", async () => {
    const f = setup({ rbp_flyer: checked("rbp_flyer", 5) });
    const authorized = await f.authorize(offer(true), null, "send");
    expect(authorized.authorization?.resourceBasis).toEqual({
      initial: [
        {
          id: "rbp_flyer",
          purpose: TENANT_RESOURCE_PURPOSES.rbp_flyer,
          url: URLS.rbp_flyer,
          documentVersion: "rbp_flyer 2026-11",
          audience: { kind: "tenant_wide" },
          proof: { id: "5".repeat(32), version: 5 },
          validUntil: "2026-12-31",
        },
      ],
      followUp: null,
    });
    const outcome = await f.service.dispatch(authorized.id);
    expect(outcome.status).toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it("refuses to authorize a message that includes an unproven or restricted-elsewhere link", async () => {
    const legacy = setup({
      rbp_flyer: {
        id: "rbp_flyer",
        url: URLS.rbp_flyer,
        verified: true,
        recordedAt: "2026-09-10T12:00:00.000Z",
        recordedByUid: "fixture-admin",
      },
    });
    await expect(legacy.authorize(offer(true), null, "send")).rejects.toThrow(
      "The Resident Benefits Package information link is Source pending. No tenant audience check is recorded for this link.",
    );
    const restricted = setup({
      rbp_flyer: checked("rbp_flyer", 5, {
        audience: {
          kind: "restricted",
          recipients: ["another-tenant@fixture-rental.net"],
        },
        method: "sharing_list",
      }),
    });
    await expect(restricted.authorize(offer(true), null, "send")).rejects.toThrow(
      /restricted to named recipients and does not cover everyone/,
    );
    expect(legacy.send).not.toHaveBeenCalled();
    expect(restricted.send).not.toHaveBeenCalled();
  });

  it("pauses a scheduled occurrence when the proof changes or is revoked at the same link, before any send", async () => {
    for (const change of ["new proof", "revoked", "restricted elsewhere"] as const) {
      const f = setup({ rbp_flyer: checked("rbp_flyer", 5) });
      const scheduled = await f.authorize(offer(true), null, "schedule");
      expect(scheduled.state).toBe("active");
      const before = scheduled.authorization;
      if (change === "new proof") f.writeSettings({ rbp_flyer: checked("rbp_flyer", 6) });
      else if (change === "revoked") {
        const { tenantAccess: _removed, ...rest } = checked("rbp_flyer", 5);
        void _removed;
        f.writeSettings({ rbp_flyer: rest });
      } else
        f.writeSettings({
          rbp_flyer: checked("rbp_flyer", 7, {
            audience: {
              kind: "restricted",
              recipients: ["another-tenant@fixture-rental.net"],
            },
            method: "sharing_list",
          }),
        });
      const outcome = await f.dueTick(scheduled);
      expect(outcome.status, change).toBe("paused");
      expect(outcome.sequence.pause, change).toMatchObject({
        cause: "resource_changed",
        evidenceIds: ["renewal-resource:rbp_flyer"],
      });
      expect(f.send, change).not.toHaveBeenCalled();
      // The reviewed bytes and their evidence are kept for the re-review.
      expect(outcome.sequence.authorization, change).toEqual(before);
    }
  });

  it("pauses a scheduled occurrence whose proof expired before its due time", async () => {
    const f = setup({ rbp_flyer: checked("rbp_flyer", 5, { validUntil: "2026-11-12" }) });
    const scheduled = await f.authorize(offer(true), null, "schedule");
    const outcome = await f.dueTick(scheduled); // due November 13 at 9:00 a.m.
    expect(outcome.status).toBe("paused");
    expect(outcome.sequence.pause?.cause).toBe("resource_changed");
    expect(f.send).not.toHaveBeenCalled();
  });

  it("a change between the dispatch check and the claim is refused inside the claim transaction", async () => {
    const f = setup({ rbp_flyer: checked("rbp_flyer", 5) });
    const authorized = await f.authorize(offer(true), null, "send");
    f.beforeClaim(() => f.writeSettings({ rbp_flyer: checked("rbp_flyer", 6) }));
    const outcome = await f.service.dispatch(authorized.id);
    expect(outcome.status).toBe("not_due");
    expect(f.send).not.toHaveBeenCalled();
    expect(outcome.sequence.unresolvedOccurrenceId).toBeNull();
    // The next tick's check names the change and pauses for review.
    expect((await f.service.dispatch(authorized.id)).sequence.pause?.cause).toBe(
      "resource_changed",
    );
  });

  it("a change to a resource the message omits invalidates nothing and adds nothing", async () => {
    const f = setup({
      rbp_flyer: checked("rbp_flyer", 5),
      insurance_flyer: checked("insurance_flyer", 1),
    });
    const scheduled = await f.authorize(offer(true), null, "schedule");
    f.writeSettings({
      rbp_flyer: checked("rbp_flyer", 5),
      insurance_flyer: checked("insurance_flyer", 2),
      renewal_information_form: checked("renewal_information_form", 3),
    });
    const outcome = await f.dueTick(scheduled);
    expect(outcome.status).toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.send.mock.calls[0][0].body).not.toMatch(/information form|insurance flyer/i);
  });

  it("re-review after a pause freezes the current proof and the occurrence then sends", async () => {
    const f = setup({ rbp_flyer: checked("rbp_flyer", 5) });
    const scheduled = await f.authorize(offer(true), null, "schedule");
    f.writeSettings({ rbp_flyer: checked("rbp_flyer", 6) });
    const paused = await f.dueTick(scheduled);
    expect(paused.status).toBe("paused");
    const resumed = await f.authorize(offer(true), null, "resume", paused.sequence);
    expect(resumed.authorization?.resourceBasis?.initial[0].proof.version).toBe(6);
    expect((await f.service.dispatch(resumed.id)).status).toBe("sent");
  });
});

describe("S265 AC-S265-4: legacy authorizations, follow-ups and uncertain attempts", () => {
  async function asLegacy(
    f: ReturnType<typeof setup>,
    sequence: CommunicationSequence,
  ): Promise<CommunicationSequence> {
    return f.store.write({
      id: sequence.id,
      actorUid: actor.uid,
      expectedVersion: sequence.version,
      operationId: randomUUID(),
      operationHash: "fixture-legacy",
      nowMs: Date.parse("2026-11-12T15:00:00.000Z"),
      action: "fixture_legacy_authorization",
      apply: (current) => {
        const {
          resourceBasis: _basis,
          payloadHash: _hash,
          ...rest
        } = current!.authorization!;
        void _basis;
        void _hash;
        return {
          ...current!,
          version: current!.version + 1,
          authorization: { ...rest, payloadHash: sequenceHash(rest) },
        };
      },
    });
  }

  it("an unsent legacy authorization that includes a resource holds; one that omits all three sends", async () => {
    const including = setup({ rbp_flyer: checked("rbp_flyer", 5) });
    const legacyIncluding = await asLegacy(
      including,
      await including.authorize(offer(true), null, "schedule"),
    );
    expect(legacyIncluding.authorization?.resourceBasis).toBeUndefined();
    const held = await including.dueTick(legacyIncluding);
    expect(held.status).toBe("paused");
    expect(held.sequence.pause?.cause).toBe("resource_changed");
    expect(including.send).not.toHaveBeenCalled();

    const omitting = setup({ rbp_flyer: checked("rbp_flyer", 5) });
    const legacyOmitting = await asLegacy(
      omitting,
      await omitting.authorize(offer(false), null, "schedule"),
    );
    omitting.writeSettings({ rbp_flyer: checked("rbp_flyer", 9) });
    const sent = await omitting.dueTick(legacyOmitting);
    expect(sent.status).toBe("sent");
    expect(omitting.send).toHaveBeenCalledTimes(1);
  });

  it("after a confirmed initial send, an authorized follow-up that omits the changed resource still sends", async () => {
    const f = setup({ rbp_flyer: checked("rbp_flyer", 5) });
    const scheduled = await f.authorize(offer(true), reminder, "schedule");
    expect(scheduled.authorization?.resourceBasis?.followUp).toEqual([]);
    const first = await f.dueTick(scheduled);
    expect(first.status).toBe("sent");
    expect(first.sequence.confirmedCount).toBe(1);
    f.writeSettings({ rbp_flyer: checked("rbp_flyer", 6) });
    const second = await f.dueTick(first.sequence);
    expect(second.status).toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(second.sequence.confirmedCount).toBe(2);
  });

  it("a follow-up that uses the changed resource is held while the confirmed initial send keeps its receipt", async () => {
    const f = setup({ rbp_flyer: checked("rbp_flyer", 5) });
    const scheduled = await f.authorize(
      offer(true),
      offer(true, "Lease Renewal reminder"),
      "schedule",
    );
    const first = await f.dueTick(scheduled);
    expect(first.status).toBe("sent");
    f.writeSettings({ rbp_flyer: checked("rbp_flyer", 6) });
    const second = await f.dueTick(first.sequence);
    expect(second.status).toBe("paused");
    expect(second.sequence.pause?.cause).toBe("resource_changed");
    expect(second.sequence.threads).toHaveLength(1);
    expect(second.sequence.confirmedCount).toBe(1);
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it("an uncertain attempt reconciles from its own evidence before any new action", async () => {
    const f = setup({ rbp_flyer: checked("rbp_flyer", 5) });
    const authorized = await f.authorize(offer(true), null, "send");
    f.failNextSend();
    const uncertain = await f.service.dispatch(authorized.id);
    expect(uncertain.status).toBe("needs_reconciliation");
    // The proof changes while the attempt is unresolved: nothing new is admitted.
    f.writeSettings({ rbp_flyer: checked("rbp_flyer", 6) });
    expect((await f.service.dispatch(authorized.id)).status).toBe("needs_reconciliation");
    await expect(
      f.authorize(offer(true), null, "resume", uncertain.sequence),
    ).rejects.toThrow("Reconcile the admitted send before authorizing more work.");
    // Reconciliation reads the provider for the original attempt; it rechecks no resource.
    const reconciled = await f.service.reconcile(actor, authorized.id);
    expect(reconciled.unresolvedOccurrenceId).toBeNull();
    expect(reconciled.threads).toHaveLength(1);
    expect(f.send).toHaveBeenCalledTimes(1);
  });
});
