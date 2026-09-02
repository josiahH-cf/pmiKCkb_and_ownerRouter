import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { buildRenewalWritebackProposal } from "@/lib/lease-renewal/writeback/proposal-contract";
import {
  RENEWAL_WRITEBACK_PROPOSALS_COLLECTION,
  discardRenewalWritebackProposal,
  getRenewalWritebackProposal,
  saveRenewalWritebackProposal,
} from "@/lib/lease-renewal/writeback/proposal-store";

const NOW = Date.parse("2026-09-01T12:00:00.000Z");

function actor(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    uid: "editor-1",
    email: "editor@pmikcmetro.com",
    role: "Editor",
    spaces: ["renewals"],
    ...overrides,
  } as AuthenticatedUser;
}

function fakeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        async set(data: Record<string, unknown>) {
          docs.set(`${name}/${id}`, data);
        },
        async get() {
          const key = `${name}/${id}`;
          return { exists: docs.has(key), data: () => docs.get(key) };
        },
        async delete() {
          docs.delete(`${name}/${id}`);
        },
      }),
    }),
  } as unknown as Firestore;
  return { db, docs };
}

function proposal(actorUid = "editor-1") {
  return buildRenewalWritebackProposal({
    leaseId: "4821",
    account: "pmikcmetro",
    actorUid,
    actorEmail: "editor@pmikcmetro.com",
    actorRole: "Editor",
    leaseState: {
      startDate: "2025-09-01",
      endDate: "2026-08-31",
      increaseEligibilityDate: null,
    },
    sourceReadAtIso: "2026-09-01T11:59:00.000Z",
    evidenceRef: "workspace:4821",
    effects: [
      {
        kind: "renewal_dates_update",
        before: {
          startDate: "2025-09-01",
          endDate: "2026-08-31",
          increaseEligibilityDate: null,
        },
        after: { endDate: "2027-08-31" },
      },
    ],
    nowMs: NOW,
  });
}

describe("S97 renewal-writeback proposal store", () => {
  it("round-trips one active proposal per lease and supersedes the prior one", async () => {
    const { db } = fakeDb();
    const first = proposal();
    await saveRenewalWritebackProposal(actor(), first, db);
    expect(await getRenewalWritebackProposal(actor(), "4821", db)).toEqual(first);

    const second = buildRenewalWritebackProposal({
      leaseId: "4821",
      account: "pmikcmetro",
      actorUid: "editor-1",
      actorEmail: "editor@pmikcmetro.com",
      actorRole: "Editor",
      leaseState: {
        startDate: "2025-09-01",
        endDate: "2026-08-31",
        increaseEligibilityDate: null,
      },
      sourceReadAtIso: "2026-09-01T12:05:00.000Z",
      evidenceRef: "workspace:4821",
      effects: [
        {
          kind: "renewal_dates_update",
          before: {
            startDate: "2025-09-01",
            endDate: "2026-08-31",
            increaseEligibilityDate: null,
          },
          after: { endDate: "2027-09-30" },
        },
      ],
      nowMs: NOW + 300_000,
    });
    await saveRenewalWritebackProposal(actor(), second, db);
    const loaded = await getRenewalWritebackProposal(actor(), "4821", db);
    expect(loaded?.previewHash).toBe(second.previewHash);
    expect(loaded?.previewHash).not.toBe(first.previewHash);
  });

  it("refuses saving a proposal assembled by a different actor", async () => {
    const { db } = fakeDb();
    await expect(
      saveRenewalWritebackProposal(actor({ uid: "someone-else" }), proposal(), db),
    ).rejects.toThrow("saved only by the actor who assembled it");
  });

  it("refuses a stored document that no longer matches the versioned schema", async () => {
    const { db, docs } = fakeDb();
    await saveRenewalWritebackProposal(actor(), proposal(), db);
    const key = `${RENEWAL_WRITEBACK_PROPOSALS_COLLECTION}/4821`;
    const stored = docs.get(key)!;
    docs.set(key, { ...stored, effects: [{ tampered: true }] });
    await expect(getRenewalWritebackProposal(actor(), "4821", db)).rejects.toThrow();
  });

  it("returns null for absent or malformed lease ids without reading the store", async () => {
    const { db } = fakeDb();
    expect(await getRenewalWritebackProposal(actor(), "4821", db)).toBeNull();
    expect(await getRenewalWritebackProposal(actor(), "not-a-lease", db)).toBeNull();
    expect(await getRenewalWritebackProposal(actor(), "0", db)).toBeNull();
  });

  it("discards only the app-plane proposal document", async () => {
    const { db, docs } = fakeDb();
    await saveRenewalWritebackProposal(actor(), proposal(), db);
    docs.set("other/receipt-1", { keep: true });
    await discardRenewalWritebackProposal(actor(), "4821", db);
    expect(await getRenewalWritebackProposal(actor(), "4821", db)).toBeNull();
    expect(docs.get("other/receipt-1")).toEqual({ keep: true });
  });
});
