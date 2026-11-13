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

// S264 R-S264-6 (AC-S264-6) against the Firestore emulator with synthetic adapters: an owner
// approval of the exact offer and a tenant acceptance of its confirmed send are recorded with the
// answers, in the same transaction, and read back. Changing only one selected charge then leaves
// the working base and dates as answered while neither answer covers the changed offer; the
// original message, its frozen offer and both answers stay exactly as recorded. An amount-only
// answer never covers charges, an unattributed acceptance needs verification, a staff-verified
// external offer is recorded with its reference, and an unsent draft is refused. Packet parity
// compares the accepted offer, not the changed one.

const state = vi.hoisted(() => ({
  db: null as Firestore | null,
  actor: {
    uid: "synthetic-s264-answers",
    email: "synthetic-s264-answers@pmikcmetro.com",
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
            leaseID: 9763,
            leaseStatusID: "2",
            endDate: "2027-01-31",
            baseRentAmount: 900,
            noticeDate: null,
            expectedMoveOutDate: null,
            moveOutDate: null,
            tenants: [
              {
                contactID: "19763",
                name: "Synthetic Tenant",
                firstName: "Synthetic",
                email: "tenant@fixture.invalid",
              },
            ],
          },
          unit: { unitID: "29763" },
          property: { streetName: "9763 Synthetic Fixture Avenue" },
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

import type { CalculatedCharges } from "@/lib/lease-documents/charge-policy";
import type { ArtifactIntakeManifest } from "@/lib/lease-documents/artifact-intake-contract";
import { publishSuppliedRenewalTemplate } from "@/lib/firestore/renewal-message-publication";
import { saveSenderSignatureChoice } from "@/lib/firestore/renewal-sender-signature-choice";
import { saveRenewalWorkingField } from "@/lib/firestore/renewal-working-record";
import { saveMessagePreparation } from "@/lib/firestore/renewal-message-preparations";
import {
  readOfferChargeMappings,
  saveOfferChargeMappings,
} from "@/lib/firestore/renewal-offer-charge-mappings";
import {
  OFFER_ANSWER_COLLECTION,
  readAcceptedTenantOffer,
  readOfferAnswer,
  readOfferAnswersView,
} from "@/lib/firestore/renewal-offer-answers";
import { GET as readMessagePreparation } from "@/app/api/lease-renewal/message-preparation/route";
import {
  getRenewalWorkspace,
  ownerRosterFingerprint,
  saveRenewalWorkspace,
} from "@/lib/firestore/renewal-workspace";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import {
  emptyOfferChargeSelection,
  type OfferChargeSelection,
} from "@/lib/lease-renewal/offer-charges";
import type { OfferChargeMappingEntry } from "@/lib/lease-renewal/offer-charge-mapping";
import {
  describeOwnerOfferCoverage,
  describeTenantAnswerCoverage,
  offerAnswerCoverage,
  ownerOfferApproval,
} from "@/lib/lease-renewal/offer-answers";
import { offerPacketComparisons } from "@/lib/lease-renewal/offer-packet-parity";
import {
  approvalCoversOfferSnapshot,
  ownerApprovalScope,
} from "@/lib/lease-renewal/owner-approval-scope";
import type { OwnerApprovalInput } from "@/lib/lease-renewal/workspace-state";
import { currentRenewalMessage } from "@/lib/lease-renewal/current-renewal-message";
import {
  prepareWorkflowComposition,
  resolveCommunicationTarget,
} from "@/lib/gmail-hub/sequence-dependencies";
import { WorkflowCommunicationSequenceService } from "@/lib/gmail-hub/sequence-service";
import {
  COMMUNICATION_SEQUENCE_COLLECTIONS,
  FirestoreCommunicationSequenceStore,
  reviewedCommunicationTargetHash,
  sequenceHash,
} from "@/lib/gmail-hub/sequence-store";
import { WorkflowCommunicationContextSchema } from "@/lib/gmail-hub/workflow-context";
import type { WorkflowMimeMessage } from "@/lib/gmail-runtime/workflow-mime";
import { clearLeaseStatusTableCache } from "@/lib/lease-renewal/lease-status-table";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";

const projectId = "demo-pmi-s264-offer-answers";
const admin: AuthenticatedUser = {
  uid: "synthetic-s264-answers-admin",
  email: "synthetic-s264-answers-admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const LEASE = "9763";
const RENEWAL = "2027-02-01";
const ROSTER = [
  { label: "Synthetic Owner", sourceRef: "rentvine:export:portfolio.owners[0].name" },
];
const APPROVAL: OwnerApprovalInput = {
  party: {
    kind: "owner",
    sourceRef: ROSTER[0]!.sourceRef,
    label: ROSTER[0]!.label,
    rosterFingerprint: ownerRosterFingerprint(ROSTER),
  },
  channel: { kind: "written", medium: "Signed letter", reference: "synthetic:letter-1" },
  occurredAt: "2026-11-09T16:00:00.000Z",
};
const PET: OfferChargeMappingEntry = {
  entryId: "00000000-0000-4000-8000-000000009001",
  accountId: "9001",
  accountName: "Synthetic account 9001",
  displayLabel: "Pet rent",
  family: "pet",
  frequencyMonths: 1,
  applicability: "active_on_renewal_date",
  requirement: null,
  approval: { reference: "Synthetic approval note", approvedOn: "2026-11-01" },
};
let app: App, db: Firestore, testEnv: RulesTestEnvironment;

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
  app = initializeApp({ projectId }, `s264-answers-${process.pid}`);
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

const context = WorkflowCommunicationContextSchema.parse({
  lane: "renewals",
  entityType: "renewal_lease",
  entityId: LEASE,
  purpose: "renewal_tenant",
  actionKey: "gmail.renewal_notice.send",
  sourceRefs: [`rentvine:lease:${LEASE}`],
});

async function currentOffer() {
  clearLiveLeaseCache();
  return (await currentRenewalMessage(state.actor, LEASE, "tenant", db)).offerCharges!
    .snapshot;
}

/** The tenant message saved through the existing scoped preparation save. */
async function saveTenant(offerCharges?: OfferChargeSelection) {
  const inputs = emptyMessagePreparationInputs();
  const workspace = await getRenewalWorkspace(state.actor, LEASE, db);
  const saved = workspace
    ? (await currentRenewalMessage(state.actor, LEASE, "tenant", db)).saved
    : null;
  return saveMessagePreparation(
    state.actor,
    {
      leaseId: LEASE,
      channel: "tenant",
      expectedRevision: saved?.revision ?? 0,
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

async function setUp() {
  const mappings = await readOfferChargeMappings(db);
  await saveOfferChargeMappings(
    admin,
    {
      entries: [PET],
      expectedVersion: mappings.record?.version ?? 0,
      operationId: randomUUID(),
    },
    db,
  );
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
  await saveTenant();
}

/** One answer through the work record's one save, with the exact offer it names. */
async function record(action: Record<string, unknown>, offer?: Record<string, unknown>) {
  const workspace = (await getRenewalWorkspace(state.actor, LEASE, db))!;
  return saveRenewalWorkspace(
    state.actor,
    {
      leaseId: LEASE,
      cycleId: workspace.cycleId,
      expectedRevision: workspace.revision,
      operationId: randomUUID(),
      action,
      ...(offer ? { offer } : {}),
    },
    db,
    undefined,
    { ownerRoster: async () => ROSTER },
    {
      currentOfferSnapshot: async () =>
        (await currentRenewalMessage(state.actor, LEASE, "tenant", db)).offerCharges
          ?.snapshot ?? null,
    },
  );
}

const approvedExact = (scope: "amount_only" | "exact_terms" = "exact_terms") => ({
  kind: "owner_response",
  outcome: "approved_terms",
  approval: APPROVAL,
  approvedBase: {
    amount: 920,
    scope,
    expectedWorkingRevision: 1,
    expectedRecommendationRevision: 0,
  },
});

/** Send the tenant offer now through the real target, authorization and dispatch. */
async function sendTenantOffer() {
  const sent = new Map<
    string,
    { messageId: string; threadId: string; labelIds: string[]; sentAtMs: number }
  >();
  const service = new WorkflowCommunicationSequenceService({
    store: new FirestoreCommunicationSequenceStore(db),
    resolveTarget: resolveCommunicationTarget,
    resolveAttachment: async () => {
      throw new Error("No fixture attachments");
    },
    readActor: async () => state.actor,
    assertRuntimeAction: async () => undefined,
    assertEffectEnvironment: () => undefined,
    now: () => Date.now(),
    createClient: (subject) => ({
      subject,
      getProfile: async () => ({
        emailAddress: subject,
        messagesTotal: 0,
        threadsTotal: 0,
        historyId: "100",
      }),
      getThread: async (id) => ({ id, messages: [], truncated: false }),
      sendWorkflowMessage: async (message: WorkflowMimeMessage) => {
        const result = {
          messageId: `provider-${sent.size + 1}`,
          threadId: "provider-thread",
          labelIds: ["SENT"],
          sentAtMs: Date.now(),
        };
        sent.set(message.messageId, result);
        return result;
      },
      findWorkflowMessage: async (id) => sent.get(id) ?? null,
    }),
  });
  const composition = await prepareWorkflowComposition(state.actor, context);
  expect(composition.target.blockers).toEqual([]);
  const saved = await service.save(
    state.actor,
    { id: randomUUID(), context, initial: composition.initial, followUp: null },
    0,
    randomUUID(),
  );
  const authorized = await service.authorize(state.actor, {
    id: saved.id,
    expectedVersion: saved.version,
    operationId: randomUUID(),
    action: "send",
    schedule: null,
    reviewedDraftHash: sequenceHash({ initial: saved.initial, followUp: saved.followUp }),
    reviewedTargetHash: reviewedCommunicationTargetHash(composition.target),
  });
  expect((await service.dispatch(authorized.id)).status).toBe("sent");
  const occurrences = await db
    .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences)
    .where("sequenceId", "==", authorized.id)
    .get();
  const occurrence = occurrences.docs.find((doc) => doc.get("index") === 0)!;
  return { sequenceId: authorized.id, occurrenceId: occurrence.id, occurrence };
}

/** A synthetic form map reading the animal's monthly charge, and the packet's priced animals. */
function petPacket(monthlyCents: number[]) {
  const manifest = {
    state: "readable",
    entries: {
      animal_agreement: {
        fieldMap: { fields: [{ factKey: "animal.monthly_charge" }] },
      },
    },
  } as unknown as ArtifactIntakeManifest;
  const economics = {
    charges: monthlyCents.map((cents, index) => ({
      chargeId: `animal:a${index}:monthly`,
      kind: "animal",
      applicable: true,
      amountCents: cents,
      cadence: "monthly",
      confidence: "Verified",
    })),
  } as unknown as CalculatedCharges;
  return { manifest, economics };
}

describe("S264 AC-S264-6 the answers keep the exact offer they covered", () => {
  it("records an owner approval of the exact offer and a tenant acceptance of its confirmed send; a charge-only change is covered by neither", async () => {
    await setUp();
    // The owner approves the offer as reviewed, charges included, with the exact terms.
    const reviewed = await currentOffer();
    const owner = await record(approvedExact(), {
      kind: "owner_reviewed_offer",
      snapshotId: reviewed.snapshotId,
      snapshotHash: reviewed.snapshotHash,
    });
    expect(owner.offerAnswer).toMatchObject({
      party: "owner",
      outcome: "approved_terms",
      attribution: { kind: "owner_reviewed_offer" },
      offer: {
        snapshot: {
          base: { rent: 920, revision: 2 },
          rows: [expect.objectContaining({ rowKey: "rentvine:501", amountCents: 4500 })],
        },
      },
    });
    // The bound offer is the one current once the approved base took its own revision.
    const approvedOffer = await currentOffer();
    expect(approvedOffer.snapshotHash).toBe(owner.offerAnswer!.offer!.snapshotHash);
    const scope = ownerApprovalScope(owner.state, ownerOfferApproval(owner.offerAnswer!));
    expect(scope?.kind).toBe("offer_snapshot");
    expect(approvalCoversOfferSnapshot(scope, approvedOffer)).toBe(true);
    // Without its record, the same answer reads as exact terms only: never wider.
    expect(ownerApprovalScope(owner.state)?.kind).toBe("exact_terms");

    // The tenant offer is sent, and the tenant's acceptance names that confirmed send.
    await saveTenant();
    const send = await sendTenantOffer();
    const frozen = send.occurrence.get("offerSnapshot");
    expect(frozen.snapshotHash).toBe(approvedOffer.snapshotHash);
    const accepted = await record(
      { kind: "tenant_response", outcome: "accepted" },
      {
        kind: "linked_communication",
        sequenceId: send.sequenceId,
        occurrenceId: send.occurrenceId,
      },
    );
    expect(accepted.offerAnswer).toMatchObject({
      party: "tenant",
      attribution: { kind: "linked_communication", sequenceId: send.sequenceId },
      offer: { snapshotHash: frozen.snapshotHash },
    });
    const workspace = await getRenewalWorkspace(state.actor, LEASE, db);
    expect((await readAcceptedTenantOffer(db, workspace))?.snapshotHash).toBe(
      frozen.snapshotHash,
    );
    expect(offerAnswerCoverage(accepted.offerAnswer!, await currentOffer())).toEqual({
      state: "covers",
    });

    // Only one selected charge changes: the pet rent, with its source.
    const before = await currentOffer();
    await saveTenant({
      ...emptyOfferChargeSelection(),
      decisions: [
        {
          rowKey: "rentvine:501",
          choice: "include",
          reason: null,
          renewalAmountCents: 5000,
          effectiveDate: null,
          correctionSource: "Synthetic signed pet addendum",
          reviewed: {
            sourceVersion: before.snapshot.rows[0]!.sourceVersion,
            renewalDate: RENEWAL,
            mappingVersion: 1,
          },
        },
      ],
    });
    const changed = await currentOffer();
    expect(changed.snapshot.base).toEqual(before.snapshot.base);
    expect(changed.snapshot.dates).toEqual(before.snapshot.dates);
    const tenantCoverage = offerAnswerCoverage(accepted.offerAnswer!, changed);
    expect(tenantCoverage).toEqual({
      state: "earlier_offer",
      changes: ["Pet rent changed ($45.00 to $50.00)."],
      chargesOnly: true,
    });
    expect(describeTenantAnswerCoverage("accepted", tenantCoverage)).toBe(
      "Current acceptance needs verification: it answers an earlier offer. Pet rent changed ($45.00 to $50.00).",
    );
    expect(approvalCoversOfferSnapshot(scope, changed)).toBe(false);
    expect(
      describeOwnerOfferCoverage(scope, offerAnswerCoverage(owner.offerAnswer!, changed)),
    ).toBe(
      "The owner approved an earlier offer, so the current offer's charges are not covered. Pet rent changed ($45.00 to $50.00).",
    );
    // The original message's frozen offer and both answers stay exactly as recorded.
    const kept = await db
      .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences)
      .doc(send.occurrenceId)
      .get();
    expect(kept.get("offerSnapshot")).toEqual(frozen);
    expect(await readOfferAnswer(db, owner.offerAnswer!.eventId)).toEqual(
      owner.offerAnswer,
    );
    expect(await readOfferAnswer(db, accepted.offerAnswer!.eventId)).toEqual(
      accepted.offerAnswer,
    );

    // The response editors read both answers' coverage with the tenant message's own read.
    clearLiveLeaseCache();
    const read = await (
      await readMessagePreparation(
        new Request(
          `http://localhost/api/lease-renewal/message-preparation?leaseId=${LEASE}&channel=tenant`,
        ),
      )
    ).json();
    expect(read.offerAnswers).toEqual({
      // S276 R-S276-1 (pin rewritten on purpose): each offer also carries the terms the tenant
      // response review names: working base rent, renewal dates and the selected charges total.
      current: {
        snapshotId: changed.snapshotId,
        snapshotHash: changed.snapshotHash,
        summary: "Rent $920.00 per month; Pet rent $50.00 per month",
        charged: true,
        terms: expect.objectContaining({ rent: 920, chargesCents: 5000, chargeCount: 1 }),
      },
      candidates: [
        {
          kind: "linked_communication",
          sequenceId: send.sequenceId,
          occurrenceId: send.occurrenceId,
          at: expect.any(String),
          snapshotId: frozen.snapshotId,
          summary: "Rent $920.00 per month; Pet rent $45.00 per month",
          current: false,
          terms: expect.objectContaining({
            rent: 920,
            chargesCents: 4500,
            chargeCount: 1,
          }),
        },
      ],
      tenant: {
        outcome: "accepted",
        eventId: accepted.offerAnswer!.eventId,
        attribution: "linked_communication",
        answered: "Rent $920.00 per month; Pet rent $45.00 per month",
        coverage: "earlier_offer",
        line: "Current acceptance needs verification: it answers an earlier offer. Pet rent changed ($45.00 to $50.00).",
      },
      owner: {
        eventId: owner.offerAnswer!.eventId,
        scope: "offer_snapshot",
        coverage: "earlier_offer",
        line: "The owner approved an earlier offer, so the current offer's charges are not covered. Pet rent changed ($45.00 to $50.00).",
      },
      // R-S264-6 at the consumers: the current acceptance answers an earlier offer's charges.
      acceptance: {
        eventId: accepted.offerAnswer!.eventId,
        state: "earlier_offer",
        line: "Current acceptance needs verification: it answers an earlier offer. Pet rent changed ($45.00 to $50.00).",
      },
    });
    // The owner message's read carries none of it.
    const ownerRead = await (
      await readMessagePreparation(
        new Request(
          `http://localhost/api/lease-renewal/message-preparation?leaseId=${LEASE}&channel=owner`,
        ),
      )
    ).json();
    expect(ownerRead).not.toHaveProperty("offerAnswers");

    // Packet parity compares the accepted offer ($45.00), never the changed one ($50.00): a
    // pet agreement priced at $50.00 holds that form alone with the exact difference.
    const acceptedOffer = (await readAcceptedTenantOffer(db, workspace))!;
    expect(
      offerPacketComparisons({ ...petPacket([5000]), accepted: acceptedOffer.snapshot }),
    ).toEqual([
      {
        family: "animal_agreement",
        state: "discrepancy",
        charge: "Pet rent",
        offer: "$45.00 per month",
        packet: "$50.00 per month",
      },
    ]);
    expect(
      offerPacketComparisons({
        ...petPacket([4500]),
        accepted: acceptedOffer.snapshot,
      })[0]?.state,
    ).toBe("match");
  });

  it("an amount-only answer never covers charges; an unattributed acceptance needs verification; an external offer needs its reference and a created draft", async () => {
    await setUp();
    const reviewed = await currentOffer();
    await expect(
      record(approvedExact("amount_only"), {
        kind: "owner_reviewed_offer",
        snapshotId: reviewed.snapshotId,
        snapshotHash: reviewed.snapshotHash,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message:
        "Base rent only covers the amount alone. To record that the owner approved the offer's charges, record the exact terms.",
    });
    // A stale reviewed offer is refused; nothing is recorded.
    await expect(
      record(approvedExact(), {
        kind: "owner_reviewed_offer",
        snapshotId: reviewed.snapshotId,
        snapshotHash: "0".repeat(64),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await db.collection(OFFER_ANSWER_COLLECTION).get()).size).toBe(0);

    // A wait answers no offer.
    await expect(
      record(
        { kind: "tenant_response", outcome: "awaiting_response" },
        { kind: "unattributed" },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "Only a tenant decision answers an offer.",
    });
    // An acceptance not tied to one exact offer is recorded with that scope.
    const unattributed = await record(
      { kind: "tenant_response", outcome: "accepted" },
      { kind: "unattributed" },
    );
    expect(unattributed.offerAnswer).toMatchObject({
      attribution: { kind: "unattributed" },
      offer: null,
    });
    expect(
      describeTenantAnswerCoverage(
        "accepted",
        offerAnswerCoverage(unattributed.offerAnswer!, reviewed),
      ),
    ).toBe(
      "Current acceptance needs verification: the answer is not linked to one exact offer.",
    );
    expect(
      await readAcceptedTenantOffer(
        db,
        await getRenewalWorkspace(state.actor, LEASE, db),
      ),
    ).toBeNull();

    // An app-prepared offer counts only once its draft was created and staff say where they
    // verified it was sent; an unused draft attempt is refused.
    const workspace = (await getRenewalWorkspace(state.actor, LEASE, db))!;
    const draft = (executionId: string) =>
      db
        .collection("renewal_message_draft_snapshots")
        .doc(executionId)
        .set({
          leaseId: LEASE,
          cycleId: workspace.cycleId,
          channel: "tenant",
          claimBasis: {
            offerCharges: {
              snapshotId: reviewed.snapshotId,
              snapshotHash: reviewed.snapshotHash,
              mappingVersion: reviewed.snapshot.mappingVersion,
              snapshot: reviewed.snapshot,
            },
          },
        });
    await draft("exec_created");
    await db
      .collection("action_executions")
      .doc("exec_created")
      .set({ state: "Succeeded" });
    await draft("exec_unused");
    await db.collection("action_executions").doc("exec_unused").set({ state: "Ready" });
    await expect(
      record(
        { kind: "tenant_response", outcome: "accepted" },
        {
          kind: "external_offer",
          executionId: "exec_unused",
          reference: "Synthetic Gmail Sent entry",
        },
      ),
    ).rejects.toMatchObject({ status: 409 });
    const external = await record(
      { kind: "tenant_response", outcome: "accepted" },
      {
        kind: "external_offer",
        executionId: "exec_created",
        reference: "Synthetic Gmail Sent entry, 11/09/2026",
      },
    );
    expect(external.offerAnswer).toMatchObject({
      attribution: {
        kind: "external_offer",
        executionId: "exec_created",
        reference: "Synthetic Gmail Sent entry, 11/09/2026",
        reviewedByUid: state.actor.uid,
      },
      offer: { snapshotHash: reviewed.snapshotHash },
    });
    // Only the created draft is offered to name; the unused attempt never is.
    const view = await readOfferAnswersView(
      db,
      (await getRenewalWorkspace(state.actor, LEASE, db))!,
      reviewed,
    );
    expect(view.candidates).toEqual([
      expect.objectContaining({
        kind: "external_offer",
        executionId: "exec_created",
        current: true,
      }),
    ]);
    expect(view.tenant).toMatchObject({
      attribution: "external_offer",
      coverage: "covers",
      line: "This acceptance answers the current offer.",
    });
    expect(view.owner).toBeNull();
  });
});
