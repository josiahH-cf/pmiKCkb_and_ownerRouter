import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FakeTransactionalFirestore } from "../helpers/fake-transactional-firestore";
import {
  applyLeaseDetailToView,
  leaseViewsFromExport,
} from "@/lib/integrations/rentvine/lease-mapper";
import {
  observeRenewalNotice,
  saveRenewalNoticeReview,
  noticeSafetyMarkerRef,
  withRenewalNoticeAdmission,
  type NoticeSourceRead,
} from "@/lib/firestore/renewal-notice-safety";
import {
  noticeScopeHash,
  pendingNoticeHash,
  noticeTenancyHash,
  NoticeSafetyMarkerSchema,
} from "@/lib/lease-renewal/notice-safety";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import { renewalWorkspaceDocId } from "@/lib/firestore/renewal-workspace";
import { assertCurrentRenewalMessageClaim } from "@/lib/firestore/renewal-message-claim";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  workspaceMessageBasisFingerprint,
  messageResourceFingerprint,
} from "@/lib/lease-renewal/message-claim-basis";
import { suppliedRenewalPublication } from "@/lib/firestore/renewal-message-publication";
import type { ActionExecutionRecord } from "@/lib/execution/types";
import { claimActionExecution } from "@/lib/firestore/action-executions";
import { buildSuppliedRenewalDraftPreview } from "@/lib/lease-renewal/execution/supplied-renewal-draft-preview";

const actor = {
  uid: "notice-editor",
  email: "notice-editor@pmikcmetro.com",
  role: "Editor",
  hd: "pmikcmetro.com",
} as AuthenticatedUser;
const cycle = "10000000-0000-4000-8000-000000000001";
const at = Date.parse("2026-09-28T12:00:00.000Z");
const statuses = [
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
];
function source(positive = false, time = at, contact = "9101"): NoticeSourceRead {
  const [lease] = leaseViewsFromExport([
    {
      lease: {
        leaseID: "9001",
        leaseStatusID: positive ? "3" : "2",
        tenants: [{ contactID: contact }],
      },
      unit: { unitID: "9201" },
    },
  ]);
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
      statuses,
      readAtMs: time,
      noticeAdmitted: true,
      admittedLeaseKeys: [renewalWorkspaceDocId("9001")],
    },
    freshness: "fresh",
    leaseReadAtMs: time,
    observedAtMs: time,
    noticeAdmitted: true,
    admittedLeaseKeys: [renewalWorkspaceDocId("9001")],
  };
}
function setup(withCycle = true) {
  const fake = new FakeTransactionalFirestore();
  const scopeHash = noticeScopeHash("9001", null, null),
    sourceReadAt = { lease: 0, status: 0 };
  fake.seed(noticeSafetyMarkerRef(fake as unknown as Firestore, "9001").path, {
    scopeHash,
    sourceReadAt,
    semanticHash: pendingNoticeHash(scopeHash, sourceReadAt),
    version: 1,
    observedAt: new Date(at).toISOString(),
  });
  if (withCycle)
    fake.seed(`lease_renewal_workspaces/${renewalWorkspaceDocId("9001")}`, {
      ...emptyRenewalWorkspace("9001", cycle, {
        kind: "lease_end",
        dateIso: "2026-10-31",
        source: "synthetic",
      }),
    });
  return { fake, db: fake as unknown as Firestore };
}
function seedClaim(
  fake: FakeTransactionalFirestore,
  db: Firestore,
  basisNotice: NonNullable<Awaited<ReturnType<typeof observeRenewalNotice>>["basis"]>,
  channel: "owner" | "tenant" = "tenant",
) {
  const headPath = `lease_renewal_workspaces/${renewalWorkspaceDocId("9001")}`;
  const identity = hashExecutionPreview({ leaseId: "9001", cycleId: cycle, channel });
  const basis = {
    workspaceFingerprint: workspaceMessageBasisFingerprint(fake.read(headPath)!),
    sourceFingerprint: "synthetic-source",
    preparationRevision: 1,
    resourceFingerprint: messageResourceFingerprint({ version: 0, entries: {} }),
    noticeSafety: basisNotice,
  };
  const execution = {
    id: "synthetic-attempt",
    action_key: "gmail.renewal_notice.draft_create",
    scope_ref: `external-workflow:live:renewal-live:9001:cycle:${cycle}`,
    preview_hash: "synthetic-preview",
    context_hash: "synthetic-context",
  } as ActionExecutionRecord;
  const preview = { synthetic: true };
  fake.seed(`renewal_message_draft_snapshots/${execution.id}`, {
    leaseId: "9001",
    cycleId: cycle,
    actorUid: actor.uid,
    channel,
    claimBasis: basis,
    previewHash: execution.preview_hash,
    contextHash: execution.context_hash,
    preview,
    snapshotHash: hashExecutionPreview({ preview, claimBasis: basis }),
  });
  fake.seed(`renewal_message_preparations/${identity}`, {
    revision: 1,
    reviewedSourceFingerprint: basis.sourceFingerprint,
    signatureActorUid: actor.uid,
    signatureEmail: actor.email,
  });
  fake.seed(`renewal_message_draft_heads/${identity}`, { executionId: execution.id });
  const publication = suppliedRenewalPublication(channel);
  fake.seed("templates/synthetic", {
    space_id: "lease-renewals",
    name: publication.name,
    body: publication.body,
    status: "Approved",
    approved_by_uid: actor.uid,
    last_reviewed_at: "synthetic",
  });
  const claim = () =>
    db.runTransaction((tx) =>
      assertCurrentRenewalMessageClaim(tx as Transaction, db, actor, execution),
    );
  return { claim, execution, headPath, basis };
}
beforeEach(() => {
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at + 5000);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe("durable notice approval invalidation", () => {
  it("never exposes a late provider result for a lease absent from that fetch's admission membership", async () => {
    const fake = new FakeTransactionalFirestore(),
      db = fake as unknown as Firestore;
    const earlyReader = withRenewalNoticeAdmission(actor, {}, db);
    const earlyAdmission = await earlyReader.beforeLeaseSourceRead(at);
    expect(earlyAdmission.leaseKeys).toEqual([]);
    // A different instance discovers/reserves the lease after the earlier fetch has started.
    const unadmitted = await observeRenewalNotice(
      actor,
      { ...source(), admittedLeaseKeys: [] },
      db,
    );
    expect(unadmitted.ready).toBe(false);
    const lateReader = withRenewalNoticeAdmission(actor, {}, db);
    const admitted = await lateReader.beforeLeaseSourceRead(at + 1000);
    const table = await lateReader.beforeStatusSourceRead(at + 1000);
    const reviewed = await observeRenewalNotice(
      actor,
      {
        ...source(false, admitted.readAtMs),
        statusTable: {
          status: "available",
          statuses,
          readAtMs: table.readAtMs,
          noticeAdmitted: true,
          admittedLeaseKeys: table.leaseKeys,
        },
        admittedLeaseKeys: admitted.leaseKeys,
      },
      db,
    );
    expect(reviewed.ready).toBe(true);
    const latePositive = await observeRenewalNotice(
      actor,
      { ...source(true, at), admittedLeaseKeys: earlyAdmission.leaseKeys },
      db,
    );
    expect(latePositive.ready).toBe(false);
    expect(latePositive.disposition.state).toBe("unknown");
    expect(latePositive.disposition.evidence.pendingMoveOut).toBeNull();
    expect(latePositive.disposition.evidence.noticeDateIso).toBeNull();
    expect(latePositive.basis).toEqual(reviewed.basis);
    // Bind an actual unused final S20 companion claim to the independently admitted P0
    // cycle. P1 never supplied observable notice facts, so it cannot invalidate that review.
    fake.seed(`lease_renewal_workspaces/${renewalWorkspaceDocId("9001")}`, {
      ...emptyRenewalWorkspace("9001", cycle, {
        kind: "lease_end",
        dateIso: "2026-10-31",
        source: "synthetic",
      }),
    });
    const cycleReview = await observeRenewalNotice(
      actor,
      { ...source(false, at + 2000), admittedLeaseKeys: admitted.leaseKeys },
      db,
    );
    const { claim } = seedClaim(fake, db, cycleReview.basis!);
    await expect(claim()).resolves.toBeUndefined();
    const concealed = await observeRenewalNotice(
      actor,
      { ...source(true, at), admittedLeaseKeys: earlyAdmission.leaseKeys },
      db,
    );
    expect(
      Object.entries(concealed.disposition.evidence)
        .filter(([key]) => !["origin", "leaseId"].includes(key))
        .every(([, value]) => value === null),
    ).toBe(true);
    await expect(claim()).resolves.toBeUndefined();
    // Once the lease marker exists, every new generation invalidates before dispatch;
    // even a missing response or failed evidence persistence cannot revive P0's claim.
    await earlyReader.beforeLeaseSourceRead(at + 3000);
    await expect(claim()).rejects.toThrow("changed");
  });
  it("never resurrects a saved approval across positive read, clear read and process restart", async () => {
    const { fake, db } = setup();
    const first = await observeRenewalNotice(actor, source(), db);
    const positive = await observeRenewalNotice(actor, source(true, at + 1000), db);
    // A new reader/store facade models another instance; no module-local invalidation is used.
    const cleared = await observeRenewalNotice(
      actor,
      source(false, at + 2000),
      fake as unknown as Firestore,
    );
    expect(first.ready && positive.ready && cleared.ready).toBe(true);
    expect(cleared.basis!.version).toBeGreaterThan(positive.basis!.version);
    expect(cleared.basis).not.toEqual(first.basis);
    const repeated = await observeRenewalNotice(
      actor,
      { ...source(false, at + 2000), observedAtMs: at + 3000 },
      db,
    );
    expect(repeated.basis).toEqual(cleared.basis);
    expect([...fake.store.keys()].filter((key) => !key.endsWith("/notice"))).toHaveLength(
      1,
    );
    expect(Object.keys(fake.read(noticeSafetyMarkerRef(db, "9001").path)!)).toEqual([
      "scopeHash",
      "semanticHash",
      "sourceReadAt",
      "observedAt",
      "version",
    ]);
  });
  it("invalidates before provider dispatch and does not restore an unused approval after failed fetch", async () => {
    const { fake, db } = setup();
    const initial = await observeRenewalNotice(actor, source(), db);
    const provider = vi.fn().mockRejectedValue(new Error("synthetic source outage"));
    const reader = withRenewalNoticeAdmission(
      actor,
      { listAllLeasesExport: provider },
      db,
    );
    await reader.beforeLeaseSourceRead(at + 1000);
    const pending = NoticeSafetyMarkerSchema.parse(
      fake.read(noticeSafetyMarkerRef(db, "9001").path),
    );
    expect(pending.version).toBeGreaterThan(initial.basis!.version);
    await expect(reader.listAllLeasesExport()).rejects.toThrow("synthetic");
    const afterRestart = await observeRenewalNotice(actor, source(false, at + 2000), db);
    expect(afterRestart.basis).not.toEqual(initial.basis);
    const failingDb = {
      runTransaction: async () => {
        throw new Error("synthetic store outage");
      },
    } as unknown as Firestore;
    const denied = withRenewalNoticeAdmission(
      actor,
      { listAllLeasesExport: provider },
      failingDb,
    );
    await expect(denied.beforeLeaseSourceRead(at + 3000)).rejects.toThrow();
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("conflicting parallel or older cached generations invalidate and stay idempotent until fresh", async () => {
    const { fake, db } = setup();
    await observeRenewalNotice(actor, source(), db);
    fake.armNextCommitBarrier();
    await Promise.all([
      observeRenewalNotice(actor, source(true, at + 1000), db),
      observeRenewalNotice(actor, source(false, at + 1000), db),
    ]);
    const stale = await observeRenewalNotice(actor, source(), db);
    const repeated = await observeRenewalNotice(actor, source(), db);
    expect(stale.ready).toBe(false);
    expect(repeated.basis).toEqual(stale.basis);
    const fresh = await observeRenewalNotice(actor, source(false, at + 2000), db);
    expect(fresh.ready).toBe(true);
    expect(fresh.basis!.version).toBeGreaterThan(stale.basis!.version);
  });
  it("requires verified tenancy and a durable admitted generation; unavailable history never reads as empty", async () => {
    const { db } = setup();
    expect((await observeRenewalNotice(actor, source(false, at, ""), db)).ready).toBe(
      false,
    );
    expect(noticeTenancyHash(source(false, at, "").lease)).toBeNull();
    const denied = await observeRenewalNotice(actor, source(), {
      runTransaction: async () => {
        throw new Error("synthetic");
      },
    } as unknown as Firestore);
    expect(denied.basis).toBeNull();
    expect(denied.disposition.state).toBe("unknown");
    expect(
      (
        await observeRenewalNotice(
          actor,
          { ...source(false, at + 1000), noticeAdmitted: false },
          db,
        )
      ).ready,
    ).toBe(false);
  });
});
describe("explicit lease/tenancy/cycle notice history", () => {
  it("supports pre-cycle positive recording and reviewed withdrawal without creating a workspace or inheriting into a new cycle/tenancy", async () => {
    const { fake, db } = setup(false);
    const positive = await observeRenewalNotice(actor, source(true), db);
    const command = {
      leaseId: "9001",
      expected: positive.basis!,
      operationId: "10000000-0000-4000-8000-000000000002",
      action: "record_notice",
      reason: "Synthetic source review",
    };
    await saveRenewalNoticeReview(actor, command, source(true), db);
    expect(
      fake.read(`lease_renewal_workspaces/${renewalWorkspaceDocId("9001")}`),
    ).toBeUndefined();
    const clear = await observeRenewalNotice(actor, source(false, at + 1000), db);
    expect(clear.disposition.reason).toBe("withdrawal_review_required");
    expect(clear.disposition.state).toBe("unknown");
    await saveRenewalNoticeReview(
      actor,
      {
        ...command,
        operationId: "10000000-0000-4000-8000-000000000003",
        expected: clear.basis,
        action: "review_withdrawal",
      },
      source(false, at + 1000),
      db,
    );
    const reviewed = await observeRenewalNotice(actor, source(false, at + 1000), db);
    expect(reviewed.disposition.state).toBe("withdrawn");
    expect(reviewed.disposition.label).toContain("does not prove provider cancellation");
    expect(reviewed.basis).not.toEqual(clear.basis);
    const newTenant = await observeRenewalNotice(
      actor,
      source(false, at + 2000, "9102"),
      db,
    );
    expect(newTenant.history).toBeNull();
    expect(newTenant.disposition.state).toBe("not_initiated");
    fake.seed(`lease_renewal_workspaces/${renewalWorkspaceDocId("9001")}`, {
      ...emptyRenewalWorkspace("9001", cycle, {
        kind: "lease_end",
        dateIso: "2026-10-31",
        source: "synthetic",
      }),
    });
    const newCycle = await observeRenewalNotice(actor, source(false, at + 3000), db);
    expect(newCycle.history).toBeNull();
    expect(newCycle.basis!.scopeHash).not.toBe(reviewed.basis!.scopeHash);
    await expect(
      saveRenewalNoticeReview(
        actor,
        {
          ...command,
          operationId: "10000000-0000-4000-8000-000000000004",
          expected: newCycle.basis,
          action: "review_withdrawal",
        },
        source(false, at + 3000),
        db,
      ),
    ).rejects.toThrow("recorded notice");
  });
  it("refuses verification actors and mismatched source/generation, with idempotent exact retry", async () => {
    const { db } = setup();
    const positive = await observeRenewalNotice(actor, source(true), db);
    const command = {
      leaseId: "9001",
      expected: positive.basis!,
      operationId: "10000000-0000-4000-8000-000000000002",
      action: "record_notice",
      reason: "Synthetic review",
    };
    await expect(
      saveRenewalNoticeReview(
        { ...actor, email: "canary-editor@pmikcmetro.com" },
        command,
        source(true),
        db,
      ),
    ).rejects.toThrow("authority");
    const first = await saveRenewalNoticeReview(actor, command, source(true), db);
    const retry = await saveRenewalNoticeReview(actor, command, source(true), db);
    expect(retry).toEqual(first);
    await expect(
      saveRenewalNoticeReview(actor, { ...command, reason: "changed" }, source(true), db),
    ).rejects.toThrow("reused");
    await expect(
      saveRenewalNoticeReview(
        actor,
        { ...command, operationId: "10000000-0000-4000-8000-000000000003" },
        source(true, at + 1000, "9102"),
        db,
      ),
    ).rejects.toThrow("changed");
  });
});
describe("final claim uses the durable generation", () => {
  it.each(["owner", "tenant"] as const)(
    "keeps old %s S20 confirmation unused while an older read leaves a newer admission pending",
    async (channel) => {
      const { fake, db } = setup();
      const initial = await observeRenewalNotice(actor, source(), db);
      const seeded = seedClaim(fake, db, initial.basis!, channel);
      const executionId = `exec_${"e".repeat(40)}`;
      const previewHash = "f".repeat(64),
        contextHash = "d".repeat(64);
      const snapshot = fake.read(
        `renewal_message_draft_snapshots/${seeded.execution.id}`,
      )!;
      fake.seed(`renewal_message_draft_snapshots/${executionId}`, {
        ...snapshot,
        previewHash,
        contextHash,
      });
      const identity = hashExecutionPreview({ leaseId: "9001", cycleId: cycle, channel });
      fake.seed(`renewal_message_draft_heads/${identity}`, { executionId });
      const executionPath = `action_executions/${executionId}`;
      fake.seed(executionPath, {
        ...seeded.execution,
        id: executionId,
        action_kind: "workflow_draft",
        actor_uid: actor.uid,
        actor_role: actor.role,
        attempt_count: 0,
        created_at: new Date(at).toISOString(),
        updated_at: new Date(at).toISOString(),
        idempotency_hash: "c".repeat(64),
        preview_hash: previewHash,
        context_hash: contextHash,
        requires_action_registry: true,
        risk: "Medium",
        state: "Ready",
      });
      // Establish that the old immutable snapshot is eligible before admission without consuming it.
      await expect(
        db.runTransaction((tx) =>
          assertCurrentRenewalMessageClaim(
            tx,
            db,
            actor,
            fake.read(executionPath) as unknown as ActionExecutionRecord,
          ),
        ),
      ).resolves.toBeUndefined();
      expect(fake.read(executionPath)).toMatchObject({
        attempt_count: 0,
        state: "Ready",
      });
      let providerCreates = 0;
      const dispatch = async () => {
        await claimActionExecution(actor, executionId, previewHash, db, contextHash);
        providerCreates++;
      };
      const admitted = await withRenewalNoticeAdmission(
        actor,
        {},
        db,
      ).beforeLeaseSourceRead(at + 1000);
      const markerPath = noticeSafetyMarkerRef(db, "9001").path;
      const pending = NoticeSafetyMarkerSchema.parse(fake.read(markerPath));
      expect(pending.version).toBeGreaterThan(initial.basis!.version);
      await expect(dispatch()).rejects.toThrow("changed");

      const older = await observeRenewalNotice(actor, source(true), db);
      expect(older.ready).toBe(false);
      expect(older.disposition.state).toBe("unknown");
      expect(fake.read(markerPath)).toEqual(pending);
      await expect(dispatch()).rejects.toThrow("changed");

      // A pending basis may be displayed for review; it never authorizes a new ready preview.
      const current = {
        content: { channel, missing: [], sourceRefs: [] },
        saved: { revision: 1 },
        workspace: fake.read(seeded.headPath),
        publication: { status: "approved" },
        draftJournalAvailable: true,
        needsReview: false,
        signatureMatchesActor: true,
        basis: { noticeSafety: older.basis },
        noticeBlock: older.reason,
        moveOut: older.disposition,
        policyGates: [],
        lease: {
          tenants: [{ name: "Synthetic Tenant", email: "tenant@fixture-rental.net" }],
          portfolio: {
            owners: [{ name: "Synthetic Owner", email: "owner@fixture-rental.net" }],
          },
        },
      } as unknown as Parameters<typeof buildSuppliedRenewalDraftPreview>[1];
      expect(buildSuppliedRenewalDraftPreview(actor, current)).toEqual({
        status: "blocked",
        channel,
        reasons: [older.reason],
      });

      const latest = source(false, admitted.readAtMs);
      if (latest.statusTable.status !== "available")
        throw new Error("Synthetic status missing");
      latest.statusTable = {
        ...latest.statusTable,
        readAtMs: pending.sourceReadAt.status,
      };
      const completed = await observeRenewalNotice(actor, latest, db);
      expect(completed.ready).toBe(true);
      expect(completed.basis!.version).toBe(pending.version);
      expect(completed.basis).not.toEqual(initial.basis);
      await expect(dispatch()).rejects.toThrow("changed");
      expect(fake.read(executionPath)).toMatchObject({
        attempt_count: 0,
        state: "Ready",
      });
      expect(providerCreates).toBe(0);
    },
  );
  it.each(["owner", "tenant"] as const)(
    "refuses old unused %s confirmation after observed notice/clear and manual non-renewal at the final atomic claim",
    async (channel) => {
      const { fake, db } = setup();
      const safe = await observeRenewalNotice(actor, source(), db);
      const { claim, execution, headPath } = seedClaim(fake, db, safe.basis!, channel);
      await expect(claim()).resolves.toBeUndefined();
      await observeRenewalNotice(actor, source(true, at + 1000), db);
      await observeRenewalNotice(actor, source(false, at + 2000), db);
      await expect(claim()).rejects.toThrow("changed");
      const current = await observeRenewalNotice(actor, source(false, at + 2000), db);
      const freshClaim = seedClaim(fake, db, current.basis!, channel);
      await expect(freshClaim.claim()).resolves.toBeUndefined();
      for (const decision of [
        { tenantResponse: { outcome: "declined_nonrenewing" } },
        { ownerResponse: { outcome: "declined_non_renewal" } },
      ]) {
        fake.seed(headPath, {
          ...emptyRenewalWorkspace("9001", cycle, {
            kind: "lease_end",
            dateIso: "2026-10-31",
            source: "synthetic",
          }),
          ...decision,
        });
        // Even a forged refreshed workspace hash cannot make a manual non-renewal executable.
        const forged = seedClaim(fake, db, current.basis!, channel);
        await expect(forged.claim()).rejects.toThrow("changed");
      }
      await expect(
        db.runTransaction((tx) =>
          assertCurrentRenewalMessageClaim(tx, db, actor, {
            ...execution,
            scope_ref: "external-workflow:live:renewal-live:9001",
          }),
        ),
      ).rejects.toThrow("current cycle");
    },
  );
});
