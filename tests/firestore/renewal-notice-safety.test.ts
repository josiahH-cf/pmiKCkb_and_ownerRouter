import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  applyLeaseDetailToView,
  leaseViewsFromExport,
} from "@/lib/integrations/rentvine/lease-mapper";
import {
  observeRenewalNotice,
  observeRenewalNotices,
  reserveRenewalNoticeLease,
  withRenewalNoticeAdmission,
  noticeSafetyMarkerRef,
  saveRenewalNoticeReview,
  type NoticeSourceRead,
} from "@/lib/firestore/renewal-notice-safety";
import {
  getLiveLeaseSnapshot,
  clearLiveLeaseCache,
} from "@/lib/lease-renewal/live-lease-cache";
import { renewalWorkspaceDocId } from "@/lib/firestore/renewal-workspace";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import { claimActionExecution } from "@/lib/firestore/action-executions";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  workspaceMessageBasisFingerprint,
  messageResourceFingerprint,
} from "@/lib/lease-renewal/message-claim-basis";
import { suppliedRenewalPublication } from "@/lib/firestore/renewal-message-publication";
const actor: AuthenticatedUser = {
  uid: "notice-emulator-editor",
  email: "notice-emulator@pmikcmetro.com",
  role: "Editor",
  hd: "pmikcmetro.com",
};
const projectId = "pmi-kc-notice-safety-test";
let app: App,
  second: App,
  db: Firestore,
  otherDb: Firestore,
  environment: RulesTestEnvironment;
function source(positive: boolean, at: number): NoticeSourceRead {
  const lease = {
    leaseID: "9001",
    leaseStatusID: positive ? "3" : "2",
    unit: { unitID: "9201" },
    tenants: [{ contactID: "9101" }],
  };
  applyLeaseDetailToView(lease, {
    leaseStatusID: positive ? "3" : "2",
    noticeDate: positive ? "2026-09-28" : null,
    expectedMoveOutDate: null,
    moveOutDate: null,
    isMonthToMonth: "0",
  });
  return {
    lease,
    statusTable: {
      status: "available",
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
        {
          leaseStatusID: "3",
          name: "Synthetic notice",
          primaryLeaseStatusID: "2",
          isPendingMoveOutStatus: true,
          isCompletedMoveOutStatus: false,
          isPendingMoveInStatus: false,
          isSystemStatus: false,
        },
      ],
      readAtMs: at,
      noticeAdmitted: true,
      admittedLeaseKeys: [renewalWorkspaceDocId("9001")],
    },
    freshness: "fresh",
    leaseReadAtMs: at,
    observedAtMs: at,
    noticeAdmitted: true,
    admittedLeaseKeys: [renewalWorkspaceDocId("9001")],
  };
}
beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: FIRESTORE_EMULATOR_TARGET,
  });
  app = initializeApp({ projectId }, `notice-safety-${process.pid}`);
  second = initializeApp({ projectId }, `notice-safety-second-${process.pid}`);
  db = getFirestore(app);
  otherDb = getFirestore(second);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  await environment.clearFirestore();
  clearLiveLeaseCache();
  await reserveRenewalNoticeLease(actor, "9001", db);
});
afterAll(async () => {
  await deleteApp(app);
  await deleteApp(second);
  await environment.cleanup();
  vi.unstubAllEnvs();
});
describe("emulator durable notice generations", () => {
  it("atomically verifies mixed reserved and unreserved leases without reads after writes", async () => {
    const now = Date.now();
    const sources = Array.from({ length: 32 }, (_, i) => {
      const leaseId = String(9001 + i);
      const read = source(false, now);
      const [lease] = leaseViewsFromExport([
        {
          lease: {
            leaseID: leaseId,
            leaseStatusID: "2",
            tenants: [{ contactID: "9101" }],
          },
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
      return { ...read, lease };
    });
    const first = await observeRenewalNotices(actor, sources, db);
    expect(first[0].ready).toBe(true);
    expect(
      first
        .slice(1)
        .every((result) => !result.ready && result.disposition.state === "unknown"),
    ).toBe(true);
    expect((await db.collectionGroup("approval_safety").get()).size).toBe(32);
    expect((await db.collection("lease_renewal_workspaces").get()).size).toBe(0);
    expect((await db.collectionGroup("notice_reviews").get()).size).toBe(0);
    const reader = withRenewalNoticeAdmission(actor, {}, otherDb);
    const lease = await reader.beforeLeaseSourceRead(now + 1000);
    const status = await reader.beforeStatusSourceRead(now + 1000);
    const admitted = sources.map((read) => ({
      ...read,
      leaseReadAtMs: lease.readAtMs,
      observedAtMs: now + 1000,
      admittedLeaseKeys: lease.leaseKeys,
      statusTable: {
        ...read.statusTable,
        readAtMs: status.readAtMs,
        admittedLeaseKeys: status.leaseKeys,
      } as NoticeSourceRead["statusTable"],
    }));
    const secondRead = await observeRenewalNotices(actor, admitted, otherDb);
    expect(
      secondRead.every(
        (result) => result.ready && result.disposition.state === "not_initiated",
      ),
    ).toBe(true);
    const matchingOlder = await observeRenewalNotices(actor, sources, db);
    // Identical admitted evidence may use the current marker, never revive the old basis.
    expect(matchingOlder[0].ready).toBe(true);
    expect(matchingOlder[0].basis).toEqual(secondRead[0].basis);
    expect(matchingOlder[0].basis!.version).toBeGreaterThan(first[0].basis!.version);
    expect(matchingOlder.slice(1).every((result) => !result.ready)).toBe(true);
    const conflictingOlder = await observeRenewalNotices(
      actor,
      [source(true, now), ...sources.slice(1)],
      db,
    );
    expect(conflictingOlder.every((result) => !result.ready)).toBe(true);
    expect((await db.collection("lease_renewal_workspaces").get()).size).toBe(0);
  });

  it("reconciles overlapping portfolio transactions without reviving old source authority", async () => {
    const now = Date.now();
    const initial = (await observeRenewalNotices(actor, [source(false, now)], db))[0];
    await Promise.all([
      observeRenewalNotices(actor, [source(true, now + 1000)], db),
      observeRenewalNotices(actor, [source(false, now + 1000)], otherDb),
    ]);
    const stale = (await observeRenewalNotices(actor, [source(false, now)], otherDb))[0];
    expect(stale.ready).toBe(false);
    expect(stale.basis!.version).toBeGreaterThan(initial.basis!.version);
    const fresh = (
      await observeRenewalNotices(actor, [source(false, now + 2000)], db)
    )[0];
    expect(fresh.ready).toBe(true);
    expect(fresh.basis!.version).toBeGreaterThan(initial.basis!.version);
  });

  it("refuses an unused old S20 confirmation after an admitted positive read and clear on another instance", async () => {
    const now = Date.now(),
      cycle = "10000000-0000-4000-8000-000000000010",
      executionId = `exec_${"a".repeat(40)}`;
    const workspace = emptyRenewalWorkspace("9001", cycle, {
      kind: "lease_end",
      dateIso: "2026-10-31",
      source: "synthetic",
    });
    await db
      .collection("lease_renewal_workspaces")
      .doc(renewalWorkspaceDocId("9001"))
      .set(workspace);
    const initial = await observeRenewalNotice(actor, source(false, now), db);
    const basis = {
      workspaceFingerprint: workspaceMessageBasisFingerprint({ ...workspace }),
      sourceFingerprint: "synthetic-source",
      preparationRevision: 1,
      resourceFingerprint: messageResourceFingerprint({ version: 0, entries: {} }),
      noticeSafety: initial.basis!,
    };
    const previewHash = "b".repeat(64),
      contextHash = "c".repeat(64),
      preview = { synthetic: true },
      channel = "tenant";
    const identity = hashExecutionPreview({ leaseId: "9001", cycleId: cycle, channel });
    const publication = suppliedRenewalPublication(channel);
    await Promise.all([
      db
        .collection("action_executions")
        .doc(executionId)
        .set({
          id: executionId,
          action_key: "gmail.renewal_notice.draft_create",
          action_kind: "workflow_draft",
          actor_uid: actor.uid,
          actor_role: actor.role,
          attempt_count: 0,
          created_at: new Date(now).toISOString(),
          updated_at: new Date(now).toISOString(),
          idempotency_hash: "d".repeat(64),
          preview_hash: previewHash,
          context_hash: contextHash,
          requires_action_registry: true,
          risk: "Medium",
          scope_ref: `external-workflow:live:renewal-live:9001:cycle:${cycle}`,
          state: "Ready",
        }),
      db
        .collection("renewal_message_draft_snapshots")
        .doc(executionId)
        .set({
          leaseId: "9001",
          cycleId: cycle,
          actorUid: actor.uid,
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
        signatureActorUid: actor.uid,
        signatureEmail: actor.email,
      }),
      db.collection("renewal_message_draft_heads").doc(identity).set({ executionId }),
      db
        .collection("templates")
        .doc("synthetic")
        .set({
          space_id: "lease-renewals",
          name: publication.name,
          body: publication.body,
          status: "Approved",
          approved_by_uid: actor.uid,
          last_reviewed_at: new Date(now).toISOString(),
        }),
    ]);
    const shown = await observeRenewalNotice(actor, source(true, now + 1000), db);
    expect(shown.disposition.state).toBe("initiated");
    const cleared = await observeRenewalNotice(actor, source(false, now + 2000), otherDb);
    expect(cleared.disposition.state).toBe("not_initiated");
    await expect(
      claimActionExecution(actor, executionId, previewHash, otherDb, contextHash),
    ).rejects.toThrow("changed");
    expect(
      (await db.collection("action_executions").doc(executionId).get()).data(),
    ).toMatchObject({ attempt_count: 0, state: "Ready" });
  });
  it("admits before actual cache provider dispatch, preserves pending on failure, and rejects the old review after another instance clears", async () => {
    const now = Date.now();
    const before = await observeRenewalNotice(actor, source(false, now), db);
    let calls = 0;
    const reader = withRenewalNoticeAdmission(
      actor,
      {
        listAllLeasesExport: async () => {
          calls++;
          const pending = (await noticeSafetyMarkerRef(otherDb, "9001").get()).data()!;
          expect(pending.version).toBeGreaterThan(before.basis!.version);
          throw new Error("synthetic offline provider");
        },
      },
      db,
    );
    await expect(getLiveLeaseSnapshot(reader, now + 1000)).rejects.toThrow("synthetic");
    expect(calls).toBe(1);
    const cleared = await observeRenewalNotice(actor, source(false, now + 2000), otherDb);
    expect(cleared.basis).not.toEqual(before.basis);
    const marker = (await noticeSafetyMarkerRef(db, "9001").get()).data()!;
    expect(Object.keys(marker).sort()).toEqual([
      "observedAt",
      "scopeHash",
      "semanticHash",
      "sourceReadAt",
      "version",
    ]);
    expect((await db.collection("lease_renewal_workspaces").get()).empty).toBe(true);
  });
  it("serializes concurrent evidence and exact human review, retains both source observations, and never starts a cycle from GET", async () => {
    const now = Date.now();
    const positive = await observeRenewalNotice(actor, source(true, now), db);
    const command = {
      leaseId: "9001",
      expected: positive.basis!,
      operationId: "10000000-0000-4000-8000-000000000001",
      action: "record_notice",
      reason: "Synthetic reviewed notice",
    };
    const saved = await saveRenewalNoticeReview(actor, command, source(true, now), db);
    expect(saved.positive.evidence.pendingMoveOut).toBe(true);
    await Promise.all([
      observeRenewalNotice(actor, source(true, now + 1000), db),
      observeRenewalNotice(actor, source(false, now + 1000), otherDb),
    ]);
    const fresh = await observeRenewalNotice(actor, source(false, now + 2000), otherDb);
    expect(fresh.disposition.reason).toBe("withdrawal_review_required");
    const attempts = await Promise.allSettled([
      saveRenewalNoticeReview(
        actor,
        {
          ...command,
          operationId: "10000000-0000-4000-8000-000000000002",
          expected: fresh.basis,
          action: "review_withdrawal",
        },
        source(false, now + 2000),
        db,
      ),
      saveRenewalNoticeReview(
        actor,
        {
          ...command,
          operationId: "10000000-0000-4000-8000-000000000003",
          expected: fresh.basis,
          action: "review_withdrawal",
        },
        source(false, now + 2000),
        otherDb,
      ),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const reviewed = await observeRenewalNotice(actor, source(false, now + 3000), db);
    expect(reviewed.disposition.state).toBe("withdrawn");
    expect(reviewed.history!.positive.evidence.pendingMoveOut).toBe(true);
    expect(reviewed.history!.withdrawal!.evidence.pendingMoveOut).toBe(false);
    expect(
      (
        await db
          .collection("lease_renewal_workspaces")
          .doc(renewalWorkspaceDocId("9001"))
          .get()
      ).exists,
    ).toBe(false);
  }, 20_000);
});
