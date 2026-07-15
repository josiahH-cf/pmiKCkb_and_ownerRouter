import { describe, expect, it } from "vitest";

import { communicationsRetentionFields } from "@/lib/gmail-hub/retention-policy";
import { applyCommunicationsLegalHold } from "@/lib/gmail-hub/retention-store";

describe("communications legal-hold transaction", () => {
  it("refuses a non-Admin before touching persistence", async () => {
    const db = {
      collection: () => {
        throw new Error("must not touch db");
      },
    };
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
          caseReference: "CASE-123",
          collection: "gmail_send_confirmations",
          idempotencyKey: "hold-request-1",
          reason: "Preserve for written legal review.",
          recordId: "confirmation-1",
        },
        db as never,
        500,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("is idempotent by request key and writes one bodyless audit", async () => {
    const record = {
      state: "pending",
      ...communicationsRetentionFields("confirmation", 100),
    };
    const audits = new Map<string, Record<string, unknown>>();
    const updates: Record<string, unknown>[] = [];
    const db = fakeDb(record, audits, updates);
    const actor = {
      uid: "admin-1",
      email: "admin@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Admin" as const,
    };
    const input = {
      action: "hold" as const,
      caseReference: "CASE-123",
      collection: "gmail_send_confirmations" as const,
      idempotencyKey: "hold-request-1",
      reason: "Preserve for written legal review.",
      recordId: "confirmation-1",
    };

    await expect(
      applyCommunicationsLegalHold(actor, input, db as never, 500),
    ).resolves.toEqual({ status: "changed", legalHold: true });
    expect(record.expires_at).toBeNull();
    expect(record.expires_at_ms).toBeNull();
    await expect(
      applyCommunicationsLegalHold(actor, input, db as never, 600),
    ).resolves.toEqual({ status: "duplicate", legalHold: true });
    expect(updates).toHaveLength(1);
    expect(audits).toHaveLength(1);
    expect(JSON.stringify([...audits.values()])).not.toContain("CASE-123");
    expect(JSON.stringify([...audits.values()])).not.toContain(
      "Preserve for written legal review",
    );

    await expect(
      applyCommunicationsLegalHold(
        actor,
        { ...input, action: "release" },
        db as never,
        650,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(record.expires_at_ms).toBeNull();

    await expect(
      applyCommunicationsLegalHold(
        actor,
        {
          ...input,
          action: "release",
          idempotencyKey: "release-request-1",
        },
        db as never,
        700,
      ),
    ).resolves.toEqual({ status: "changed", legalHold: false });
    expect(record.expires_at).toBeInstanceOf(Date);
    expect(record.expires_at_ms).toBeGreaterThan(700);
  });
});

function fakeDb(
  record: Record<string, unknown>,
  audits: Map<string, Record<string, unknown>>,
  updates: Record<string, unknown>[],
) {
  return {
    collection(collection: string) {
      return {
        doc(id: string) {
          return { collection, id };
        },
      };
    },
    async runTransaction(
      callback: (transaction: {
        get(ref: { collection: string; id: string }): Promise<{
          exists: boolean;
          id: string;
          data(): Record<string, unknown> | undefined;
        }>;
        update(ref: unknown, value: Record<string, unknown>): void;
        create(
          ref: { collection: string; id: string },
          value: Record<string, unknown>,
        ): void;
      }) => Promise<unknown>,
    ) {
      return callback({
        async get(ref) {
          if (ref.collection === "gmail_retention_audit") {
            const value = audits.get(ref.id);
            return { exists: Boolean(value), id: ref.id, data: () => value };
          }
          return { exists: true, id: ref.id, data: () => record };
        },
        update(_ref, value) {
          Object.assign(record, value);
          updates.push(value);
        },
        create(ref, value) {
          audits.set(ref.id, value);
        },
      });
    },
  };
}
