import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";

// S264 against the Firestore emulator with synthetic adapters (no real fee amounts, charge ids or
// customer data):
//
// - AC-S264-1: Offer charge mappings compare-and-save, its immutable readback, the stale-version
//   and wrong-role refusals and an idempotent replay.
// - AC-S264-2: the tenant message's charge review saves through the existing scoped preparation
//   save into its own sibling record, carries forward with later revisions and reads back; the
//   owner message cannot carry it.
// - AC-S264-4: a mapping revision at the same amount after review refuses the real S20 Gmail draft
//   claim, pauses a scheduled tenant send before any send, and the claim's own transaction admits
//   nothing when the revision lands after the dispatch check.
// - AC-S264-7: an unknown insurance transition holds the exact review, the Gmail draft export and
//   a queued send while the draft stays editable; a verified No releases it.

const state = vi.hoisted(() => ({
  db: null as Firestore | null,
  actor: {
    uid: "synthetic-s264-sender",
    email: "synthetic-s264-sender@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  } as AuthenticatedUser,
  charges: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => state.db }));
vi.mock("@/lib/auth/session", async (original) => {
  const actual = await original<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    requireCapabilityInSpace: async () => state.actor,
    requireCapability: async () => state.actor,
  };
});
vi.mock("@/lib/lease-renewal/live-config", async (original) => {
  const actual = await original<typeof import("@/lib/lease-renewal/live-config")>();
  const { withFakeLeaseDetail } = await import("@/tests/helpers/rentvine-detail-fake");
  const reader = withFakeLeaseDetail({
    listAllLeasesExport: async () => ({
      complete: true,
      pages: 1,
      rows: [
        {
          lease: {
            leaseID: 9764,
            leaseStatusID: "2",
            endDate: "2027-01-31",
            baseRentAmount: 900,
            noticeDate: null,
            expectedMoveOutDate: null,
            moveOutDate: null,
            tenants: [
              {
                contactID: "19764",
                name: "Synthetic Tenant",
                firstName: "Synthetic",
                email: "tenant@fixture.invalid",
              },
            ],
          },
          unit: { unitID: "29764" },
          property: { streetName: "9764 Synthetic Fixture Avenue" },
          portfolio: {
            owners: [{ name: "Synthetic Owner", email: "owner@fixture.invalid" }],
          },
        },
      ],
    }),
    listLeaseStatuses: async () => [
      {
        leaseStatusID: "2",
        name: "Synthetic Active",
        primaryLeaseStatusID: "2",
        isPendingMoveOutStatus: false,
        isCompletedMoveOutStatus: false,
        isPendingMoveInStatus: false,
        isSystemStatus: true,
      },
    ],
  });
  return {
    ...actual,
    buildLiveRentVineConfig: () => ({ ok: true, rentvineClient: reader }),
    buildLiveRenewalConfig: () => ({
      ok: true,
      rentvineClient: reader,
      rentvineHost: "fixture.invalid",
      sheetsReader: null,
      spreadsheetId: "synthetic-sheet",
    }),
  };
});
// The synthetic RentVine recurring charges this lease has now (a test changes them in place).
vi.mock("@/lib/lease-renewal/writeback/charge-inventory", async (original) => ({
  ...(await original<typeof import("@/lib/lease-renewal/writeback/charge-inventory")>()),
  loadRenewalChargeInventory: async (_client: unknown, leaseId: string) => ({
    leaseId,
    leaseDates: {
      startDate: "2026-02-01",
      endDate: "2027-01-31",
      increaseEligibilityDate: null,
    },
    asOfDate: "2026-11-10",
    charges: structuredClone(state.charges),
  }),
}));
vi.mock("@/lib/gmail-hub/dependencies", async (original) => ({
  ...(await original<typeof import("@/lib/gmail-hub/dependencies")>()),
  createDescriptorBoundGmailRuntimeClient: () => {
    throw new Error("No real Gmail effect in this test");
  },
}));

import { claimActionExecution } from "@/lib/firestore/action-executions";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  messageResourceFingerprint,
  workingTermsFingerprint,
  workspaceMessageBasisFingerprint,
} from "@/lib/lease-renewal/message-claim-basis";
import { suppliedRenewalPublication } from "@/lib/firestore/renewal-message-publication";
import {
  observeRenewalNotice,
  reserveRenewalNoticeLease,
} from "@/lib/firestore/renewal-notice-safety";
import { renewalWorkspaceDocId } from "@/lib/firestore/renewal-workspace";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import {
  applyLeaseDetailToView,
  leaseViewsFromExport,
} from "@/lib/integrations/rentvine/lease-mapper";
import { getRenewalResourceLocations } from "@/lib/firestore/renewal-resource-locations";
import { publishSuppliedRenewalTemplate } from "@/lib/firestore/renewal-message-publication";
import { saveSenderSignatureChoice } from "@/lib/firestore/renewal-sender-signature-choice";
import { saveRenewalWorkingField } from "@/lib/firestore/renewal-working-record";
import {
  getOfferChargeSelection,
  MESSAGE_PREPARATION_COLLECTIONS,
  saveMessagePreparation,
} from "@/lib/firestore/renewal-message-preparations";
import {
  OFFER_CHARGE_MAPPING_COLLECTIONS,
  readOfferChargeMappings,
  saveOfferChargeMappings,
} from "@/lib/firestore/renewal-offer-charge-mappings";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import {
  emptyOfferChargeSelection,
  projectOfferCharges,
  type OfferChargeSelection,
} from "@/lib/lease-renewal/offer-charges";
import type { OfferChargeMappingEntry } from "@/lib/lease-renewal/offer-charge-mapping";
import { buildOfferSnapshot } from "@/lib/lease-renewal/offer-snapshot";
import { currentRenewalMessage } from "@/lib/lease-renewal/current-renewal-message";
import { buildSuppliedRenewalDraftPreview } from "@/lib/lease-renewal/execution/supplied-renewal-draft-preview";
import {
  prepareWorkflowComposition,
  resolveCommunicationTarget,
} from "@/lib/gmail-hub/sequence-dependencies";
import { WorkflowCommunicationSequenceService } from "@/lib/gmail-hub/sequence-service";
import {
  FirestoreCommunicationSequenceStore,
  reviewedCommunicationTargetHash,
  sequenceHash,
} from "@/lib/gmail-hub/sequence-store";
import type { CommunicationSequence } from "@/lib/gmail-hub/sequence-model";
import { WorkflowCommunicationContextSchema } from "@/lib/gmail-hub/workflow-context";
import type { WorkflowMimeMessage } from "@/lib/gmail-runtime/workflow-mime";
import { clearLeaseStatusTableCache } from "@/lib/lease-renewal/lease-status-table";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";

const projectId = "demo-pmi-s264-offer-charges";
const admin: AuthenticatedUser = {
  uid: "synthetic-s264-admin",
  email: "synthetic-s264-admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const DAY_MS = 86_400_000;
const LEASE = "9764";
const RENEWAL = "2027-02-01";
const INSURANCE_HOLD =
  "Choose whether the insurance transition applies to this renewal, with its source, before releasing this offer. Its wording and flyer stay out until then.";
let app: App, db: Firestore, testEnv: RulesTestEnvironment;

function mapping(
  accountId: string,
  displayLabel: string,
  family: OfferChargeMappingEntry["family"],
) {
  return {
    entryId: `00000000-0000-4000-8000-00000000${accountId}`,
    accountId,
    accountName: `Synthetic account ${accountId}`,
    displayLabel,
    family,
    frequencyMonths: 1,
    applicability: "active_on_renewal_date",
    requirement: null,
    approval: { reference: "Synthetic approval note", approvedOn: "2026-11-01" },
  } as OfferChargeMappingEntry;
}
const PET = mapping("9001", "Pet rent", "pet");
const INSURANCE = mapping("9003", "Insurance program", "insurance");

/** An Admin saves the next mapping version against the current one. */
async function saveMappings(entries: OfferChargeMappingEntry[], note?: string) {
  const current = await readOfferChargeMappings(db);
  return saveOfferChargeMappings(
    admin,
    {
      entries,
      ...(note ? { note } : {}),
      expectedVersion: current.record?.version ?? 0,
      operationId: randomUUID(),
    },
    db,
  );
}

function charge(id: string, accountId: string, amount: string, rent = false) {
  return {
    id,
    accountId,
    accountLabel: `Synthetic account ${accountId}`,
    classification: rent ? "rent" : "non_rent",
    current: true,
    projection: {
      leaseRecurringChargeID: id,
      leaseID: LEASE,
      accountID: accountId,
      amount,
      description: rent ? "Synthetic rent" : "Synthetic line",
      dayDue: "1",
      frequency: "1",
      startDate: "2026-02-01",
      isMoveInCharge: "0",
      isFromImport: "0",
      endDate: null,
      nextChargeDate: "2026-12-01",
      rentIncreaseID: null,
      importSourceKey: null,
      recurringStatusID: 1,
    },
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s264-offer-${process.pid}`);
  db = getFirestore(app);
  state.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  vi.useRealTimers();
  await testEnv.clearFirestore();
  clearLiveLeaseCache();
  clearLeaseStatusTableCache();
  state.charges = [charge("500", "9000", "900.00", true), charge("501", "9001", "45.00")];
});
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
  vi.unstubAllEnvs();
});

describe("S264 AC-S264-1 Offer charge mappings store", () => {
  it("compare-and-save writes an immutable version and reads it back; stale, wrong-role and changed replays are refused", async () => {
    const operationId = randomUUID();
    const input = { entries: [PET], expectedVersion: 0, operationId };
    const first = await saveOfferChargeMappings(admin, input, db);
    expect(first).toMatchObject({
      duplicate: false,
      record: { version: 1, entries: [PET] },
    });
    expect(
      (
        await db.collection(OFFER_CHARGE_MAPPING_COLLECTIONS.versions).doc("v1").get()
      ).data(),
    ).toMatchObject({ version: 1, entries: [PET] });
    // The same operation replayed is the same save.
    expect(await saveOfferChargeMappings(admin, input, db)).toMatchObject({
      duplicate: true,
      record: { version: 1 },
    });
    await expect(
      saveOfferChargeMappings(admin, { ...input, entries: [PET, INSURANCE] }, db),
    ).rejects.toThrow("This save differs from the one first sent.");
    // Another Admin's review of version 0 is stale now.
    await expect(
      saveOfferChargeMappings(admin, { ...input, operationId: randomUUID() }, db),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "The offer charge mappings changed since you reviewed them. Reload, review the current version and save again.",
    });
    await expect(
      saveOfferChargeMappings(
        state.actor,
        { entries: [PET], expectedVersion: 1, operationId: randomUUID() },
        db,
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: "An Admin saves the offer charge mappings.",
    });
    expect((await readOfferChargeMappings(db)).record?.version).toBe(1);
    const activity = await db.collection(OFFER_CHARGE_MAPPING_COLLECTIONS.activity).get();
    expect(activity.docs.map((doc) => doc.get("version"))).toEqual([1]);
  });
});

const context = WorkflowCommunicationContextSchema.parse({
  lane: "renewals",
  entityType: "renewal_lease",
  entityId: LEASE,
  purpose: "renewal_tenant",
  actionKey: "gmail.renewal_notice.send",
  sourceRefs: [`rentvine:lease:${LEASE}`],
});

async function workingTerms() {
  await publishSuppliedRenewalTemplate(admin, "tenant", db);
  await saveSenderSignatureChoice(
    state.actor,
    { expectedRevision: 0, operationId: randomUUID(), signature: null },
    db,
  );
  for (const [field, value] of [
    ["terms_rent", 920],
    ["terms_effective_date", RENEWAL],
    ["terms_end_date", "2028-01-31"],
  ] as const)
    await saveRenewalWorkingField(
      state.actor,
      { leaseId: LEASE, field, value, expectedRevision: 0, operationId: randomUUID() },
      db,
    );
}

/** The tenant message saved through the existing scoped preparation save. */
async function saveTenant(
  expectedRevision: number,
  offerCharges?: OfferChargeSelection,
  channel: "tenant" | "owner" = "tenant",
) {
  const inputs = emptyMessagePreparationInputs();
  return saveMessagePreparation(
    state.actor,
    {
      leaseId: LEASE,
      channel,
      expectedRevision,
      operationId: randomUUID(),
      inputs: {
        ...inputs,
        leaseOrigin: { kind: "pmi", source: "Synthetic original lease" },
      },
      ...(offerCharges ? { offerCharges } : {}),
    },
    {
      resolveBasis: async () => ({
        kind: "lease_end",
        dateIso: "2027-01-31",
        source: "RentVine lease end",
      }),
    },
    db,
  );
}

describe("S264 AC-S264-2 the charge review saves with the tenant message", () => {
  it("saves in its own record, carries forward with a later revision, reads back and stays off the owner message", async () => {
    await workingTerms();
    const selection: OfferChargeSelection = {
      ...emptyOfferChargeSelection(),
      decisions: [
        {
          rowKey: "rentvine:501",
          choice: "exclude",
          reason: "Synthetic: the pet moved out",
          renewalAmountCents: null,
          effectiveDate: null,
          correctionSource: null,
          reviewed: {
            sourceVersion: "synthetic",
            renewalDate: RENEWAL,
            mappingVersion: 0,
          },
        },
      ],
    };
    const first = await saveTenant(0, selection);
    const revision = first.record!.revision;
    expect(
      await getOfferChargeSelection(state.actor, LEASE, first.cycleId, revision, db),
    ).toEqual({ state: "saved", selection });
    // A later save of other inputs keeps the reviewed charges with the new revision.
    const second = await saveTenant(revision);
    expect(second.record!.revision).toBe(revision + 1);
    expect(
      await getOfferChargeSelection(state.actor, LEASE, first.cycleId, revision + 1, db),
    ).toEqual({ state: "saved", selection });
    const stored = await db
      .collection(MESSAGE_PREPARATION_COLLECTIONS.offerSelections)
      .get();
    expect(stored.docs.map((doc) => [doc.get("revision"), doc.get("channel")])).toEqual([
      [revision + 1, "tenant"],
    ]);
    await expect(saveTenant(0, selection, "owner")).rejects.toMatchObject({
      status: 400,
      message: "Offer charges belong to the tenant offer.",
    });
  });
});

describe("S264 AC-S264-4 a mapping revision at the same amount refuses the S20 Gmail draft claim", () => {
  function noticeSource(leaseId: string, at: number) {
    const [lease] = leaseViewsFromExport([
      {
        lease: { leaseID: leaseId, leaseStatusID: "2", tenants: [{ contactID: "9101" }] },
        unit: { unitID: "9201" },
      },
    ]);
    applyLeaseDetailToView(lease, {
      leaseStatusID: "2",
      noticeDate: null,
      expectedMoveOutDate: null,
      moveOutDate: null,
      isMonthToMonth: "0",
    });
    return {
      lease,
      statusTable: {
        status: "available" as const,
        statuses: [
          {
            leaseStatusID: "2",
            name: "Synthetic active",
            primaryLeaseStatusID: "2",
            isPendingMoveOutStatus: false,
            isCompletedMoveOutStatus: false,
            isPendingMoveInStatus: false,
            isSystemStatus: true,
          },
        ],
        readAtMs: at,
        noticeAdmitted: true,
        admittedLeaseKeys: [renewalWorkspaceDocId(leaseId)],
      },
      freshness: "fresh" as const,
      leaseReadAtMs: at,
      observedAtMs: at,
      noticeAdmitted: true,
      admittedLeaseKeys: [renewalWorkspaceDocId(leaseId)],
    };
  }
  /** A prepared, unused draft attempt bound to its exact content and offer snapshot. */
  async function prepareAttempt(leaseId: string, withSourceLines: boolean) {
    const now = Date.now(),
      cycle = `10000000-0000-4000-8000-${leaseId.padStart(12, "0")}`,
      executionId = `exec_${leaseId.padStart(40, "a").slice(-40)}`;
    const workspace = emptyRenewalWorkspace(leaseId, cycle, {
      kind: "lease_end",
      dateIso: "2027-01-31",
      source: "synthetic",
    });
    await db
      .collection("lease_renewal_workspaces")
      .doc(renewalWorkspaceDocId(leaseId))
      .set(workspace);
    await reserveRenewalNoticeLease(state.actor, leaseId, db);
    const notice = await observeRenewalNotice(
      state.actor,
      noticeSource(leaseId, now),
      db,
    );
    expect(notice.basis).toBeTruthy();
    const mappings = await readOfferChargeMappings(db);
    const lines = withSourceLines
      ? [
          {
            chargeId: "501",
            accountId: "9001",
            accountName: "Synthetic account 9001",
            description: "Synthetic line",
            classification: "non_rent" as const,
            amount: "45.00",
            frequency: "1",
            startDate: "2026-02-01",
            endDate: null,
            endDateRaw: null,
            statusId: 1,
            version: "v-501",
          },
        ]
      : [];
    const source = { state: "read" as const, asOf: "2026-11-10", lines, version: "src" };
    const review = projectOfferCharges({
      leaseId,
      source,
      mappings,
      selection: null,
      terms: { rent: 920, effectiveDate: RENEWAL },
    });
    const offer = buildOfferSnapshot({
      leaseId,
      cycleId: cycle,
      working: null,
      review,
      source,
    });
    const settings = await getRenewalResourceLocations(admin, db);
    const basis = {
      workspaceFingerprint: workspaceMessageBasisFingerprint({ ...workspace }),
      sourceFingerprint: "synthetic-source",
      preparationRevision: 1,
      resourceFingerprint: messageResourceFingerprint(settings),
      noticeSafety: notice.basis!,
      workingTermsFingerprint: workingTermsFingerprint(null),
      includedResources: [],
      offerCharges: {
        snapshotId: offer.snapshotId,
        snapshotHash: offer.snapshotHash,
        mappingVersion: review.mappingVersion,
        snapshot: offer.snapshot,
      },
    };
    const body = "Rent: $920.00 per month.\n\nAll other charges stay the same.";
    const previewHash = hashExecutionPreview({ leaseId, body }),
      contextHash = hashExecutionPreview({ leaseId, context: true }),
      channel = "tenant";
    const preview = {
      status: "ready",
      channel,
      subject: `Lease Renewal for ${leaseId} Fixture Lane`,
      body,
      htmlBody: `<div><p>${body}</p></div>`,
      recipient: { to: "tenant@fixture.invalid", sourceRef: "rentvine:contact:9101" },
    };
    const identity = hashExecutionPreview({ leaseId, cycleId: cycle, channel });
    const publication = suppliedRenewalPublication(channel);
    await Promise.all([
      db
        .collection("action_executions")
        .doc(executionId)
        .set({
          id: executionId,
          action_key: "gmail.renewal_notice.draft_create",
          action_kind: "workflow_draft",
          actor_uid: state.actor.uid,
          actor_role: state.actor.role,
          attempt_count: 0,
          created_at: new Date(now).toISOString(),
          updated_at: new Date(now).toISOString(),
          idempotency_hash: hashExecutionPreview({ executionId }),
          preview_hash: previewHash,
          context_hash: contextHash,
          requires_action_registry: true,
          risk: "Medium",
          scope_ref: `external-workflow:live:renewal-live:${leaseId}:cycle:${cycle}`,
          state: "Ready",
        }),
      db
        .collection("renewal_message_draft_snapshots")
        .doc(executionId)
        .set({
          leaseId,
          cycleId: cycle,
          actorUid: state.actor.uid,
          channel,
          claimBasis: basis,
          previewHash,
          contextHash,
          preview,
          snapshotHash: hashExecutionPreview({ preview, claimBasis: basis }),
        }),
      db.collection("renewal_message_preparations").doc(identity).set({
        revision: 1,
        reviewedSourceFingerprint: basis.sourceFingerprint,
        signatureActorUid: state.actor.uid,
        signatureEmail: state.actor.email,
      }),
      db.collection("renewal_message_draft_heads").doc(identity).set({ executionId }),
      db
        .collection("templates")
        .doc("synthetic-tenant")
        .set({
          space_id: "lease-renewals",
          name: publication.name,
          body: publication.body,
          status: "Approved",
          approved_by_uid: state.actor.uid,
          last_reviewed_at: new Date(now).toISOString(),
        }),
    ]);
    return {
      claim: () =>
        claimActionExecution(state.actor, executionId, previewHash, db, contextHash),
      execution: async () =>
        (await db.collection("action_executions").doc(executionId).get()).data(),
    };
  }

  it("the reviewed rows' mapping changed with the same amount: the open attempt is refused before any Gmail call", async () => {
    await saveMappings([PET]);
    const priced = await prepareAttempt("9811", true);
    const noLines = await prepareAttempt("9812", false);
    // Another Admin re-saves the same mapping (same amount, new version).
    await saveMappings([PET], "Synthetic re-approval");
    await expect(priced.claim()).rejects.toThrow(
      "The offer charge mappings changed after this preview, so the charge lines need review again. No Gmail draft was created. Review offer charges and preview the message again.",
    );
    expect(await priced.execution()).toMatchObject({ attempt_count: 0, state: "Ready" });
    // An offer with no RentVine charge line has nothing the mapping decides.
    await noLines.claim();
    expect(await noLines.execution()).toMatchObject({
      attempt_count: 1,
      state: "Executing",
    });
  });
});

describe("S264 AC-S264-4 / AC-S264-7 the real tenant target through review, export and scheduled dispatch", () => {
  function service(options: { afterTarget?: () => Promise<void> } = {}) {
    const clock = { ms: Date.now() };
    const sent = new Map<
      string,
      { messageId: string; threadId: string; labelIds: string[]; sentAtMs: number }
    >();
    const send = vi.fn(async (message: WorkflowMimeMessage) => {
      const result = {
        messageId: `provider-${sent.size + 1}`,
        threadId: "provider-thread",
        labelIds: ["SENT"],
        sentAtMs: clock.ms,
      };
      sent.set(message.messageId, result);
      return result;
    });
    const hooks = { afterTarget: options.afterTarget ?? null };
    const instance = new WorkflowCommunicationSequenceService({
      store: new FirestoreCommunicationSequenceStore(db),
      resolveTarget: async (...args: Parameters<typeof resolveCommunicationTarget>) => {
        const target = await resolveCommunicationTarget(...args);
        if (hooks.afterTarget) await hooks.afterTarget();
        return target;
      },
      resolveAttachment: async () => {
        throw new Error("No fixture attachments");
      },
      readActor: async () => state.actor,
      assertRuntimeAction: async () => undefined,
      assertEffectEnvironment: () => undefined,
      now: () => clock.ms,
      createClient: (subject) => ({
        subject,
        getProfile: async () => ({
          emailAddress: subject,
          messagesTotal: 0,
          threadsTotal: 0,
          historyId: "100",
        }),
        getThread: async (id) => ({ id, messages: [], truncated: false }),
        sendWorkflowMessage: send,
        findWorkflowMessage: async (id) => sent.get(id) ?? null,
      }),
    });
    async function schedule(): Promise<CommunicationSequence> {
      const composition = await prepareWorkflowComposition(state.actor, context);
      expect(composition.target.blockers).toEqual([]);
      const saved = await instance.save(
        state.actor,
        { id: randomUUID(), context, initial: composition.initial, followUp: null },
        0,
        randomUUID(),
      );
      const tomorrow = new Date(clock.ms + DAY_MS).toLocaleDateString("en-CA", {
        timeZone: "America/Chicago",
      });
      return instance.authorize(state.actor, {
        id: saved.id,
        expectedVersion: saved.version,
        operationId: randomUUID(),
        action: "schedule",
        schedule: {
          firstDate: tomorrow,
          time: "09:00",
          timeZone: "America/Chicago",
          everyDays: null,
          endDate: null,
          sendLimit: 1,
        },
        reviewedDraftHash: sequenceHash({
          initial: saved.initial,
          followUp: saved.followUp,
        }),
        reviewedTargetHash: reviewedCommunicationTargetHash(composition.target),
      });
    }
    async function dueTick(sequence: CommunicationSequence) {
      clearLiveLeaseCache();
      clearLeaseStatusTableCache();
      clock.ms = Math.max(clock.ms, (sequence.nextDueAtMs ?? clock.ms) + 60_000);
      return instance.dispatch(sequence.id);
    }
    return { instance, send, schedule, dueTick, hooks };
  }

  it("the authorization freezes the reviewed offer snapshot; a same-amount mapping revision pauses the scheduled send", async () => {
    await saveMappings([PET]);
    await workingTerms();
    await saveTenant(0);
    const f = service();
    const authorized = await f.schedule();
    expect(authorized.authorization?.offerSnapshot?.snapshot).toMatchObject({
      leaseId: LEASE,
      mappingVersion: 1,
      sourceLines: 1,
      unchangedStatement: true,
      rows: [expect.objectContaining({ rowKey: "rentvine:501", amountCents: 4500 })],
    });
    await saveMappings([PET], "Synthetic re-approval");
    const held = await f.dueTick(authorized);
    expect(held.status).toBe("paused");
    expect(held.sequence.pause?.cause).toBe("changed_source");
    expect(f.send).not.toHaveBeenCalled();
  });

  it("a mapping revision after the dispatch check is refused by the claim's own transaction", async () => {
    await saveMappings([PET]);
    await workingTerms();
    await saveTenant(0);
    const f = service();
    const authorized = await f.schedule();
    f.hooks.afterTarget = async () => {
      f.hooks.afterTarget = null;
      await saveMappings([PET], "Synthetic re-approval");
    };
    const result = await f.dueTick(authorized);
    expect(result.status).toBe("not_due");
    expect(f.send).not.toHaveBeenCalled();
  });

  it("an unknown insurance transition holds review, draft export and a queued send while the draft stays editable", async () => {
    await saveMappings([PET, INSURANCE]);
    await workingTerms();
    const saved = await saveTenant(0);
    const f = service();
    // A send queued before the insurance line existed.
    const queued = await f.schedule();
    state.charges.push(charge("502", "9003", "12.50"));
    clearLiveLeaseCache();
    const composition = await prepareWorkflowComposition(state.actor, context);
    expect(composition.target.blockers).toContain(INSURANCE_HOLD);
    const current = await currentRenewalMessage(state.actor, LEASE, "tenant", db);
    const draft = buildSuppliedRenewalDraftPreview(state.actor, current);
    expect(draft.status).toBe("blocked");
    expect(draft.status === "blocked" ? draft.reasons : []).toContain(INSURANCE_HOLD);
    const held = await f.dueTick(queued);
    expect(held.status).toBe("paused");
    expect(f.send).not.toHaveBeenCalled();
    // Draft preparation stays available, and a verified No with its source releases the offer.
    const decided = await saveTenant(saved.record!.revision, {
      ...emptyOfferChargeSelection(),
      transitions: {
        insurance: {
          choice: "does_not_apply",
          source: "Synthetic tenant policy on file",
        },
        rbp: null,
      },
    });
    expect(decided.record!.revision).toBe(saved.record!.revision + 1);
    clearLiveLeaseCache();
    const released = await prepareWorkflowComposition(state.actor, context);
    expect(released.target.blockers).toEqual([]);
    expect(JSON.stringify(released.initial)).not.toContain(
      "We have changed our insurance process",
    );
  });
});
