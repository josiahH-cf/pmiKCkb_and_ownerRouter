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

// S265 AC-S265-3 and AC-S265-4 against the Firestore emulator with guarded synthetic adapters.
//
// Draft export: two sessions. While session A's prepared Gmail draft attempt is open, session B (an
// Admin on another instance) records a new tenant audience check for the same flyer link. The real
// S20 claim (`claimActionExecution` with its renewal companion guard) refuses A's unused attempt
// before any Gmail call and leaves it unconsumed; another lease's attempt that omits the flyer
// claims normally.
//
// Sends: the real renewal target (`resolveCommunicationTarget`, the minute worker's own read of the
// lease, message and shared settings), the real sequence store and service, and an isolated mail
// client. The tenant offer for a changed resident benefits package includes its verified flyer; the
// authorization freezes that proof, and a later same-link proof change pauses the scheduled
// occurrence before any send, while a change to the omitted information form leaves it to send.

const state = vi.hoisted(() => ({
  db: null as Firestore | null,
  actor: {
    uid: "synthetic-s265-sender",
    email: "synthetic-s265-sender@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  } as AuthenticatedUser,
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
            leaseID: 9765,
            leaseStatusID: "2",
            endDate: "2027-01-31",
            baseRentAmount: 1234,
            noticeDate: null,
            expectedMoveOutDate: null,
            moveOutDate: null,
            tenants: [
              {
                contactID: "19765",
                name: "Synthetic Tenant",
                firstName: "Synthetic",
                email: "tenant@fixture.invalid",
              },
            ],
          },
          unit: { unitID: "29765" },
          property: { streetName: "9765 Synthetic Fixture Avenue" },
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
      ok: false,
      reason: "synthetic_optional_source_not_configured",
    }),
  };
});
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
import {
  getRenewalResourceLocations,
  saveRenewalResourceLocation,
} from "@/lib/firestore/renewal-resource-locations";
import {
  tenantResourceUses,
  type TenantResourceId,
} from "@/lib/lease-renewal/tenant-resource-evidence";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import { publishSuppliedRenewalTemplate } from "@/lib/firestore/renewal-message-publication";
import { saveSenderSignatureChoice } from "@/lib/firestore/renewal-sender-signature-choice";
import { saveRenewalWorkingField } from "@/lib/firestore/renewal-working-record";
import { saveMessagePreparation } from "@/lib/firestore/renewal-message-preparations";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
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

const projectId = "demo-pmi-s265-tenant-resource-release";
const admin: AuthenticatedUser = {
  uid: "synthetic-s265-admin",
  email: "synthetic-s265-admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const DAY_MS = 86_400_000;
const URLS: Record<TenantResourceId, string> = {
  insurance_flyer: "https://fixture-rental.net/insurance-flyer.pdf",
  rbp_flyer: "https://fixture-rental.net/rbp-flyer.pdf",
  renewal_information_form: "https://fixture-rental.net/renewal-form",
};
let app: App,
  otherApp: App,
  db: Firestore,
  otherDb: Firestore,
  testEnv: RulesTestEnvironment;

function check(documentVersion: string) {
  return {
    documentVersion,
    audience: { kind: "tenant_wide" },
    method: "signed_out_open",
    result: "current_document",
    checkedBy: "Fixture Resource Owner",
    checkedOn: businessDateIso(Date.now() - DAY_MS),
    validUntil: businessDateIso(Date.now() + 60 * DAY_MS),
  };
}
/** An Admin records (or replaces) a tenant audience check through the existing save. */
async function recordCheck(
  id: TenantResourceId,
  documentVersion: string,
  store: Firestore = db,
) {
  const current = await getRenewalResourceLocations(admin, store);
  await saveRenewalResourceLocation(
    admin,
    {
      expectedVersion: current.version,
      operationId: randomUUID(),
      resource: {
        id,
        url: URLS[id],
        verified: true,
        tenantAccess: check(documentVersion),
      },
    },
    store,
  );
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s265-release-${process.pid}`);
  otherApp = initializeApp({ projectId }, `s265-release-other-${process.pid}`);
  db = getFirestore(app);
  otherDb = getFirestore(otherApp);
  state.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  vi.useRealTimers();
  await testEnv.clearFirestore();
  clearLiveLeaseCache();
  clearLeaseStatusTableCache();
});
afterAll(async () => {
  await deleteApp(app);
  await deleteApp(otherApp);
  await testEnv.cleanup();
  vi.unstubAllEnvs();
});

describe("S265 AC-S265-3/4: two sessions at the real Gmail draft claim", () => {
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
  /** Session A's prepared, unused attempt for one lease, bound to its exact content. */
  async function prepareAttempt(
    leaseId: string,
    body: string,
    includes: TenantResourceId[],
  ) {
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
    const settings = await getRenewalResourceLocations(admin, db);
    const uses = tenantResourceUses(settings, businessDateIso(now));
    const includedResources = includes.map((id) => {
      const use = uses[id];
      if (use.state !== "usable") throw new Error(`${id} is not usable`);
      return use.evidence;
    });
    const basis = {
      workspaceFingerprint: workspaceMessageBasisFingerprint({ ...workspace }),
      sourceFingerprint: "synthetic-source",
      preparationRevision: 1,
      resourceFingerprint: messageResourceFingerprint(settings),
      noticeSafety: notice.basis!,
      workingTermsFingerprint: workingTermsFingerprint(null),
      includedResources,
    };
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
      claim: (store: Firestore) =>
        claimActionExecution(state.actor, executionId, previewHash, store, contextHash),
      execution: async () =>
        (await db.collection("action_executions").doc(executionId).get()).data(),
    };
  }

  it("a same-link proof change by another session refuses only the open attempt that includes it", async () => {
    await recordCheck("rbp_flyer", "RBP flyer 2026-11");
    const includes = await prepareAttempt(
      "9801",
      `Rent: $1,100.00 per month.\n\nResident Benefits Package information: ${URLS.rbp_flyer}`,
      ["rbp_flyer"],
    );
    const omits = await prepareAttempt("9802", "Rent: $1,050.00 per month.", []);
    // Session B, on another instance, replaces the check on the same link.
    await recordCheck("rbp_flyer", "RBP flyer 2026-12", otherDb);
    await expect(includes.claim(db)).rejects.toThrow(
      /Resident Benefits Package information link or its tenant audience check changed after this message was reviewed\. No Gmail draft was created\./,
    );
    expect(await includes.execution()).toMatchObject({
      attempt_count: 0,
      state: "Ready",
    });
    // The attempt for the lease whose offer omits the flyer is unaffected.
    await omits.claim(db);
    expect(await omits.execution()).toMatchObject({
      attempt_count: 1,
      state: "Executing",
    });
  });
});

describe("S265 AC-S265-4: the real tenant target through authorization and scheduled dispatch", () => {
  const LEASE = "9765";
  const context = WorkflowCommunicationContextSchema.parse({
    lane: "renewals",
    entityType: "renewal_lease",
    entityId: LEASE,
    purpose: "renewal_tenant",
    actionKey: "gmail.renewal_notice.send",
    sourceRefs: [`rentvine:lease:${LEASE}`],
  });

  async function tenantOffer() {
    await publishSuppliedRenewalTemplate(admin, "tenant", db);
    await saveSenderSignatureChoice(
      state.actor,
      { expectedRevision: 0, operationId: randomUUID(), signature: null },
      db,
    );
    for (const [field, value] of [
      ["terms_rent", 1150],
      ["terms_effective_date", "2027-02-01"],
      ["terms_end_date", "2028-01-31"],
    ] as const)
      await saveRenewalWorkingField(
        state.actor,
        { leaseId: LEASE, field, value, expectedRevision: 0, operationId: randomUUID() },
        db,
      );
    const inputs = emptyMessagePreparationInputs();
    await saveMessagePreparation(
      state.actor,
      {
        leaseId: LEASE,
        channel: "tenant",
        expectedRevision: 0,
        operationId: randomUUID(),
        inputs: {
          ...inputs,
          leaseOrigin: { kind: "pmi", source: "Synthetic original lease" },
        },
        // S264: the changed package is a reviewed charge row with its transition decided and
        // sourced in Review offer charges (this test reads no RentVine charge source).
        offerCharges: {
          decisions: [],
          caseEntries: [
            {
              id: "00000000-0000-4000-8000-000000009765",
              family: "rbp",
              amountCents: 3000,
              effectiveDate: "2027-02-01",
              trigger: null,
              source: "Synthetic reviewed package change",
            },
          ],
          transitions: {
            insurance: null,
            rbp: { choice: "changed", source: "Synthetic reviewed package change" },
          },
        },
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

  function service() {
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
    const instance = new WorkflowCommunicationSequenceService({
      store: new FirestoreCommunicationSequenceStore(db),
      resolveTarget: resolveCommunicationTarget,
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
    async function authorize(
      action: "send" | "schedule",
    ): Promise<CommunicationSequence> {
      const composition = await prepareWorkflowComposition(state.actor, context);
      expect(composition.target.blockers).toEqual([]);
      expect(JSON.stringify(composition.initial)).toContain(URLS.rbp_flyer);
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
        action,
        schedule:
          action === "schedule"
            ? {
                firstDate: tomorrow,
                time: "09:00",
                timeZone: "America/Chicago",
                everyDays: null,
                endDate: null,
                sendLimit: 1,
              }
            : null,
        reviewedDraftHash: sequenceHash({
          initial: saved.initial,
          followUp: saved.followUp,
        }),
        reviewedTargetHash: reviewedCommunicationTargetHash(composition.target),
      });
    }
    async function dueTick(sequence: CommunicationSequence) {
      clock.ms = Math.max(clock.ms, (sequence.nextDueAtMs ?? clock.ms) + 60_000);
      return instance.dispatch(sequence.id);
    }
    return { instance, send, authorize, dueTick };
  }

  it("the immediate send freezes the included proof read from the shared settings and sends with it", async () => {
    await recordCheck("rbp_flyer", "RBP flyer 2026-11");
    await tenantOffer();
    const f = service();
    const authorized = await f.authorize("send");
    const settings = await getRenewalResourceLocations(admin, db);
    const use = tenantResourceUses(settings, businessDateIso(Date.now())).rbp_flyer;
    expect(use.state).toBe("usable");
    expect(authorized.authorization?.resourceBasis?.initial).toEqual([
      use.state === "usable" ? use.evidence : null,
    ]);
    expect((await f.instance.dispatch(authorized.id)).status).toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it("a same-link proof change pauses the scheduled occurrence; a change to the omitted form does not", async () => {
    await recordCheck("rbp_flyer", "RBP flyer 2026-11");
    await tenantOffer();
    const changed = service();
    const first = await changed.authorize("schedule");
    await recordCheck("rbp_flyer", "RBP flyer 2026-12");
    clearLiveLeaseCache();
    clearLeaseStatusTableCache();
    const held = await changed.dueTick(first);
    expect(held.status).toBe("paused");
    expect(held.sequence.pause?.cause).toBe("resource_changed");
    expect(changed.send).not.toHaveBeenCalled();

    const unaffected = service();
    const second = await unaffected.authorize("schedule");
    await recordCheck("renewal_information_form", "Renewal form 2026-11");
    clearLiveLeaseCache();
    clearLeaseStatusTableCache();
    const result = await unaffected.dueTick(second);
    expect(result.status).toBe("sent");
    expect(unaffected.send).toHaveBeenCalledTimes(1);
    expect(unaffected.send.mock.calls[0][0].body).not.toMatch(/information form/i);
  });
});
