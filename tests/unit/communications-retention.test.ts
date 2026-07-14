import { describe, expect, it } from "vitest";

import {
  buildCommunicationsLegalHoldTransition,
  COMMUNICATIONS_RETENTION_CLASSES,
  COMMUNICATIONS_RETENTION_MS,
  COMMUNICATIONS_RETENTION_POLICY_VERSION,
  communicationsRetentionFields,
  GMAIL_CONFIRMATION_USABILITY_MS,
  isCommunicationsCleanupEligible,
  planCommunicationsCleanup,
  type CommunicationsRetentionCandidate,
} from "@/lib/gmail-hub/retention-policy";
import {
  applyCommunicationsLegalHold,
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

  it.each(COMMUNICATIONS_RETENTION_CLASSES)(
    "selects %s exactly at the expiry boundary",
    (retentionClass) => {
      const item = candidate(retentionClass);
      expect(isCommunicationsCleanupEligible(item, item.expires_at_ms - 1)).toBe(false);
      expect(isCommunicationsCleanupEligible(item, item.expires_at_ms)).toBe(true);
      expect(planCommunicationsCleanup([item], item.expires_at_ms).candidates).toEqual([
        item,
      ]);
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
      nowMs: item.expires_at_ms + 99,
    });
    expect(transition.update.legal_hold).toBe(false);
    expect(transition.update.expires_at_ms).toBe(item.expires_at_ms);
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
      async listCandidates() {
        return [expired, raced];
      },
      async deleteIfEligible(item) {
        return item.id === expired.id;
      },
      async writeCountsAudit(input) {
        audits.push(input);
      },
    };
    const result = await runCommunicationsCleanup({
      store,
      nowMs: Math.max(expired.expires_at_ms, raced.expires_at_ms),
    });
    expect(result).toMatchObject({
      plannedCount: 2,
      deletedCount: 1,
      deletedCounts: { confirmation: 1 },
    });
    expect(JSON.stringify(audits)).not.toContain(expired.id);
    expect(JSON.stringify(audits)).not.toContain(raced.id);
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
