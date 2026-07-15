import { describe, expect, it } from "vitest";

import {
  buildCommunicationsLegalHoldTransition,
  COMMUNICATIONS_RETENTION_CLASSES,
  COMMUNICATIONS_RETENTION_MS,
  COMMUNICATIONS_RETENTION_POLICY_VERSION,
  communicationsRetentionFields,
  communicationsRetentionTtlMigration,
  GMAIL_CONFIRMATION_USABILITY_MS,
  isCommunicationsCleanupEligible,
  isCommunicationsRecordActive,
  parseRetentionCandidate,
  planCommunicationsCleanup,
  refreshCommunicationsRetention,
  type CommunicationsRetentionCandidate,
} from "@/lib/gmail-hub/retention-policy";
import {
  applyCommunicationsLegalHold,
  FirestoreCommunicationsCleanupStore,
  runCommunicationsCleanup,
  type CommunicationsCleanupStore,
} from "@/lib/gmail-hub/retention-store";

const anchor = Date.UTC(2026, 0, 1);

function candidate(
  retentionClass: (typeof COMMUNICATIONS_RETENTION_CLASSES)[number],
  legalHold = false,
): CommunicationsRetentionCandidate {
  const collection = {
    confirmation: "gmail_send_confirmations",
    push_dedupe: "gmail_push_dedupe",
    sync_audit: "gmail_sync_audit",
    workflow_link: "gmail_workflow_communications",
    bodyless_audit: "gmail_send_audit",
  }[retentionClass] as CommunicationsRetentionCandidate["collection"];
  return {
    collection,
    id: `${retentionClass}-1`,
    ...communicationsRetentionFields(retentionClass, anchor),
    legal_hold: legalHold,
  };
}

describe("communications retention v1.0", () => {
  it("uses every exact launch period and separates confirmation usability", () => {
    expect(GMAIL_CONFIRMATION_USABILITY_MS).toBe(10 * 60 * 1_000);
    expect(COMMUNICATIONS_RETENTION_MS).toEqual({
      confirmation: 30 * 24 * 60 * 60 * 1_000,
      push_dedupe: 7 * 24 * 60 * 60 * 1_000,
      sync_audit: 90 * 24 * 60 * 60 * 1_000,
      workflow_link: 365 * 24 * 60 * 60 * 1_000,
      bodyless_audit: 7 * 365 * 24 * 60 * 60 * 1_000,
    });
    expect(GMAIL_CONFIRMATION_USABILITY_MS).toBeLessThan(
      COMMUNICATIONS_RETENTION_MS.confirmation,
    );
  });

  it("writes a real Date TTL and produces an exact bodyless migration for legacy millis", () => {
    const fields = communicationsRetentionFields("confirmation", anchor);
    expect(fields.expires_at).toBeInstanceOf(Date);
    expect(fields.expires_at?.getTime()).toBe(fields.expires_at_ms);
    const legacy = { ...fields, expires_at: undefined };
    expect(
      parseRetentionCandidate("gmail_send_confirmations", "legacy-1", legacy),
    ).toBeNull();
    expect(
      communicationsRetentionTtlMigration("gmail_send_confirmations", legacy),
    ).toEqual({
      expires_at: new Date(fields.expires_at_ms!),
      expires_at_ms: fields.expires_at_ms,
    });
  });

  it.each(COMMUNICATIONS_RETENTION_CLASSES)(
    "selects %s exactly at the expiry boundary",
    (retentionClass) => {
      const item = candidate(retentionClass);
      expect(isCommunicationsCleanupEligible(item, expiry(item) - 1)).toBe(false);
      expect(isCommunicationsCleanupEligible(item, expiry(item))).toBe(true);
      expect(planCommunicationsCleanup([item], expiry(item)).candidates).toEqual([item]);
    },
  );

  it("fails closed on held, drifted, or unknown-policy records", () => {
    const held = candidate("workflow_link", true);
    const drifted = { ...candidate("sync_audit"), expires_at_ms: anchor };
    const unknown = {
      ...candidate("push_dedupe"),
      retention_policy_version: "future-policy",
    } as unknown as CommunicationsRetentionCandidate;
    const now = anchor + COMMUNICATIONS_RETENTION_MS.bodyless_audit + 1;
    expect(planCommunicationsCleanup([held, drifted, unknown], now).candidates).toEqual(
      [],
    );
  });

  it("preserves a held record's null TTL when workflow activity refreshes retention", () => {
    const held = {
      ...communicationsRetentionFields("workflow_link", anchor),
      legal_hold: true,
      expires_at: null,
      expires_at_ms: null,
    };
    expect(
      refreshCommunicationsRetention(held, "workflow_link", anchor + 123),
    ).toMatchObject({ legal_hold: true, expires_at_ms: null });
    expect(
      parseRetentionCandidate("gmail_workflow_communications", "held-1", held),
    ).toMatchObject({ legal_hold: true, expires_at_ms: null });
    expect(
      isCommunicationsCleanupEligible(
        { collection: "gmail_workflow_communications", id: "held-1", ...held },
        Number.MAX_SAFE_INTEGER,
      ),
    ).toBe(false);
    expect(
      isCommunicationsRecordActive(
        "gmail_workflow_communications",
        "held-1",
        held,
        anchor + 1,
      ),
    ).toBe(true);
    expect(
      isCommunicationsRecordActive(
        "gmail_workflow_communications",
        "held-1",
        held,
        anchor + COMMUNICATIONS_RETENTION_MS.workflow_link,
      ),
    ).toBe(false);
  });

  it("releases a hold to the original policy expiry without storing narratives", () => {
    const item = candidate("workflow_link", true);
    const transition = buildCommunicationsLegalHoldTransition({
      actorUid: "admin-1",
      candidate: item,
      decision: {
        action: "release",
        caseReference: "CASE-42",
        collection: item.collection,
        idempotencyKey: "release-0001",
        reason: "Written hold release received.",
        recordId: item.id,
      },
      nowMs: expiry(item) + 99,
    });
    expect(transition.update.legal_hold).toBe(false);
    expect(transition.update.expires_at_ms).toBe(expiry(item));
    expect(JSON.stringify(transition)).not.toContain("CASE-42");
    expect(JSON.stringify(transition)).not.toContain("Written hold release");
    expect(transition.audit.retention_policy_version).toBe(
      COMMUNICATIONS_RETENTION_POLICY_VERSION,
    );
  });

  it("rechecks each candidate and emits counts only under a hold race", async () => {
    const expired = candidate("confirmation");
    const raced = candidate("push_dedupe");
    const audits: unknown[] = [];
    const store: CommunicationsCleanupStore = {
      async listCandidates(nowMs, limit) {
        expect(nowMs).toBe(Math.max(expiry(expired), expiry(raced)));
        expect(limit).toBe(500);
        return [expired, raced];
      },
      async deleteIfEligible(item) {
        return item.id === expired.id;
      },
      async writeCountsAudit(input) {
        audits.push(input);
        return "created";
      },
    };
    const result = await runCommunicationsCleanup({
      store,
      nowMs: Math.max(expiry(expired), expiry(raced)),
    });
    expect(result).toMatchObject({
      plannedCount: 2,
      deletedCount: 1,
      failedCount: 0,
      deletedCounts: { confirmation: 1 },
      auditStatus: "created",
    });
    expect(JSON.stringify(audits)).not.toContain(expired.id);
    expect(JSON.stringify(audits)).not.toContain(raced.id);
  });

  it("bounds planning before deletion and counts failures without exposing record ids", async () => {
    const items = [
      candidate("confirmation"),
      { ...candidate("push_dedupe"), id: "fails-secret-id" },
      candidate("sync_audit"),
    ];
    const audit: unknown[] = [];
    const deleted: string[] = [];
    const result = await runCommunicationsCleanup({
      store: {
        async listCandidates(_nowMs, limit) {
          expect(limit).toBe(2);
          return items;
        },
        async deleteIfEligible(item) {
          if (item.id === "fails-secret-id") throw new Error("provider detail");
          deleted.push(item.id);
          return true;
        },
        async writeCountsAudit(input) {
          audit.push(input);
          return "created";
        },
      },
      nowMs: anchor + COMMUNICATIONS_RETENTION_MS.bodyless_audit + 1,
      limit: 2,
      runId: "bounded-run-1",
    });
    expect(result).toMatchObject({
      plannedCount: 2,
      deletedCount: 1,
      failedCount: 1,
    });
    expect(deleted).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain("fails-secret-id");
    expect(JSON.stringify(audit)).not.toContain("provider detail");
  });

  it("retries deletion idempotently and preserves the first audit for the same run id", async () => {
    const item = candidate("confirmation");
    let present = true;
    const auditRuns = new Set<string>();
    const store: CommunicationsCleanupStore = {
      async listCandidates() {
        return [item];
      },
      async deleteIfEligible() {
        if (!present) return false;
        present = false;
        return true;
      },
      async writeCountsAudit(input) {
        if (auditRuns.has(input.runId)) return "duplicate";
        auditRuns.add(input.runId);
        return "created";
      },
    };
    const input = {
      store,
      nowMs: expiry(item),
      runId: "retry-run-1",
    };
    await expect(runCommunicationsCleanup(input)).resolves.toMatchObject({
      deletedCount: 1,
      auditStatus: "created",
    });
    await expect(runCommunicationsCleanup(input)).resolves.toMatchObject({
      deletedCount: 0,
      auditStatus: "duplicate",
    });
    expect(auditRuns).toEqual(new Set(["retry-run-1"]));
  });

  it("retains the committed deletion count when audit finalization crashes and the run resumes", async () => {
    const item = candidate("confirmation");
    let present = true;
    let auditAttempts = 0;
    const progress = {
      deletedCounts: {} as Record<string, number>,
      failedCount: 0,
      plannedCount: 0,
      processedCount: 0,
    };
    const store: CommunicationsCleanupStore = {
      async listCandidates() {
        return present ? [item] : [];
      },
      async initializeRun(input) {
        if (progress.plannedCount === 0) progress.plannedCount = input.plannedCount;
      },
      async deleteIfEligible() {
        if (!present) return false;
        present = false;
        progress.deletedCounts.confirmation = 1;
        progress.processedCount = 1;
        return true;
      },
      async readRunProgress() {
        return progress;
      },
      async writeCountsAudit() {
        auditAttempts += 1;
        if (auditAttempts === 1) throw new Error("synthetic audit outage");
        return "created";
      },
    };
    const input = { store, nowMs: expiry(item), runId: "crash-safe-run-1" };
    await expect(runCommunicationsCleanup(input)).rejects.toThrow("audit outage");
    await expect(runCommunicationsCleanup(input)).resolves.toMatchObject({
      plannedCount: 1,
      deletedCount: 1,
      deletedCounts: { confirmation: 1 },
      auditStatus: "created",
    });
  });

  it("keeps an audit-outage retry bound to the original candidate hashes and limit", async () => {
    const original = { ...candidate("confirmation"), id: "original-secret-id" };
    const newlyEligible = { ...candidate("confirmation"), id: "new-secret-id" };
    const present = new Map([[original.id, original]]);
    const deleted: string[] = [];
    let frozen:
      | {
          candidateHashes: readonly string[];
          cleanupLimit: number;
          completed: boolean;
          plannedCount: number;
        }
      | undefined;
    let auditAttempts = 0;
    const progress = {
      deletedCounts: {} as Record<string, number>,
      failedCount: 0,
      plannedCount: 0,
      processedCount: 0,
    };
    const store: CommunicationsCleanupStore = {
      async listCandidates() {
        return [...present.values()];
      },
      async initializeRun(input) {
        frozen ??= {
          candidateHashes: [...input.candidateHashes],
          cleanupLimit: input.cleanupLimit,
          completed: false,
          plannedCount: input.plannedCount,
        };
        return { ...frozen, candidateHashes: [...frozen.candidateHashes] };
      },
      async deleteIfEligible(item) {
        if (!present.delete(item.id)) return false;
        deleted.push(item.id);
        progress.deletedCounts[item.retention_class] =
          (progress.deletedCounts[item.retention_class] ?? 0) + 1;
        progress.plannedCount = frozen?.plannedCount ?? 0;
        progress.processedCount += 1;
        return true;
      },
      async readRunProgress() {
        return progress;
      },
      async writeCountsAudit() {
        auditAttempts += 1;
        if (auditAttempts === 1) throw new Error("synthetic audit outage");
        if (frozen) frozen.completed = true;
        return auditAttempts === 2 ? "created" : "duplicate";
      },
    };
    const input = {
      limit: 1,
      nowMs: expiry(original),
      runId: "frozen-audit-retry-run-1",
      store,
    };

    await expect(runCommunicationsCleanup(input)).rejects.toThrow("audit outage");
    present.set(newlyEligible.id, newlyEligible);
    await expect(runCommunicationsCleanup(input)).resolves.toMatchObject({
      auditStatus: "created",
      deletedCount: 1,
      failedCount: 0,
      plannedCount: 1,
    });
    await expect(runCommunicationsCleanup(input)).resolves.toMatchObject({
      auditStatus: "duplicate",
      deletedCount: 1,
      plannedCount: 1,
    });

    expect(deleted).toEqual([original.id]);
    expect(present.has(newlyEligible.id)).toBe(true);
  });

  it("accounts for a frozen candidate that a bounded resume query can no longer return", async () => {
    const original = { ...candidate("confirmation"), id: "frozen-original-id" };
    const earlierFields = communicationsRetentionFields(
      "confirmation",
      original.retention_anchor_at_ms - 1,
    );
    const crowding = {
      ...candidate("confirmation"),
      ...earlierFields,
      id: "new-earlier-id",
    };
    let listAttempt = 0;
    let frozenHashes: readonly string[] = [];
    let failedHashes: readonly string[] = [];
    let auditInput: unknown;
    const store: CommunicationsCleanupStore = {
      async listCandidates() {
        listAttempt += 1;
        return listAttempt === 1 ? [original] : [crowding];
      },
      async initializeRun(input) {
        frozenHashes = frozenHashes.length > 0 ? frozenHashes : input.candidateHashes;
        return {
          candidateHashes: frozenHashes,
          cleanupLimit: input.cleanupLimit,
          completed: false,
          plannedCount: 1,
        };
      },
      async deleteIfEligible() {
        throw new Error("synthetic crash before the frozen candidate was processed");
      },
      async recordFailure() {
        throw new Error("synthetic worker crash");
      },
      async recordUnresolvedHashes(hashes) {
        failedHashes = [...hashes];
      },
      async readRunProgress() {
        return {
          deletedCounts: {},
          failedCount: failedHashes.length,
          plannedCount: 1,
          processedCount: 0,
        };
      },
      async writeCountsAudit(input) {
        auditInput = input;
        return "created";
      },
    };
    const input = {
      limit: 1,
      nowMs: expiry(original),
      runId: "crowded-frozen-run-1",
      store,
    };

    await expect(runCommunicationsCleanup(input)).rejects.toThrow(
      "synthetic worker crash",
    );
    await expect(runCommunicationsCleanup(input)).resolves.toMatchObject({
      auditStatus: "created",
      deletedCount: 0,
      failedCount: 1,
      plannedCount: 1,
    });
    expect(auditInput).toMatchObject({ failedCount: 1, plannedCount: 1 });
    expect(JSON.stringify(auditInput)).not.toContain(original.id);
    expect(JSON.stringify(auditInput)).not.toContain(crowding.id);
  });

  it("rejects an invalid limit before querying persistence", async () => {
    let queried = false;
    await expect(
      runCommunicationsCleanup({
        store: {
          async listCandidates() {
            queried = true;
            return [];
          },
          async deleteIfEligible() {
            return false;
          },
          async writeCountsAudit() {
            return "created";
          },
        },
        nowMs: anchor,
        limit: 5_001,
      }),
    ).rejects.toThrow("between 1 and 5000");
    expect(queried).toBe(false);
  });

  it("uses expiry/hold filters and a per-collection query limit instead of collection scans", async () => {
    const operations: Array<[string, ...unknown[]]> = [];
    const db = {
      collection(collection: string) {
        operations.push(["collection", collection]);
        const query = {
          where(...args: unknown[]) {
            operations.push(["where", ...args]);
            return query;
          },
          orderBy(...args: unknown[]) {
            operations.push(["orderBy", ...args]);
            return query;
          },
          limit(...args: unknown[]) {
            operations.push(["limit", ...args]);
            return query;
          },
          async get() {
            operations.push(["get"]);
            return { docs: [] };
          },
        };
        return query;
      },
    };
    await new FirestoreCommunicationsCleanupStore(db as never).listCandidates(anchor, 17);
    expect(operations.filter(([operation]) => operation === "collection")).toHaveLength(
      8,
    );
    expect(operations.filter(([operation]) => operation === "limit")).toEqual(
      Array.from({ length: 8 }, () => ["limit", 17]),
    );
    expect(operations.filter(([operation]) => operation === "where")).toEqual(
      Array.from({ length: 8 }, () => [
        ["where", "legal_hold", "==", false],
        ["where", "expires_at_ms", "<=", anchor],
      ]).flat(),
    );
    expect(operations.filter(([operation]) => operation === "get")).toHaveLength(8);
  });

  it("creates a counts audit once and does not overwrite it on a retry", async () => {
    const documents = new Map<string, Record<string, unknown>>();
    const db = {
      collection(collection: string) {
        return {
          doc(id: string) {
            return { collection, id };
          },
        };
      },
      async runTransaction(
        callback: (transaction: {
          get(ref: { collection: string; id: string }): Promise<{ exists: boolean }>;
          create(
            ref: { collection: string; id: string },
            value: Record<string, unknown>,
          ): void;
        }) => Promise<unknown>,
      ) {
        return callback({
          async get(ref) {
            return { exists: documents.has(`${ref.collection}/${ref.id}`) };
          },
          create(ref, value) {
            documents.set(`${ref.collection}/${ref.id}`, value);
          },
        });
      },
    };
    const store = new FirestoreCommunicationsCleanupStore(db as never);
    const first = {
      runId: "idempotent-run-1",
      nowMs: anchor,
      plannedCount: 2,
      failedCount: 0,
      deletedCounts: { confirmation: 2 },
    };
    await expect(store.writeCountsAudit(first)).resolves.toBe("created");
    await expect(
      store.writeCountsAudit({
        ...first,
        plannedCount: 0,
        deletedCounts: {},
      }),
    ).resolves.toBe("duplicate");
    expect(documents.size).toBe(1);
    expect([...documents.values()][0]).toMatchObject({
      planned_count: 2,
      deleted_count: 2,
      failed_count: 0,
    });
  });

  it("refuses non-Admin legal-hold changes before touching Firestore", async () => {
    await expect(
      applyCommunicationsLegalHold(
        {
          uid: "editor-1",
          email: "editor@pmikcmetro.com",
          hd: "pmikcmetro.com",
          role: "Editor",
        },
        {
          action: "hold",
          caseReference: "CASE-1",
          collection: "gmail_send_confirmations",
          idempotencyKey: "hold-0001",
          reason: "Preserve for the active legal matter.",
          recordId: "record-1",
        },
        {
          runTransaction: () => {
            throw new Error("Firestore should not be touched.");
          },
        } as never,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});

function expiry(item: CommunicationsRetentionCandidate) {
  if (typeof item.expires_at_ms !== "number") throw new Error("Expected an expiry.");
  return item.expires_at_ms;
}
