import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  RECURRING_CHARGE_CREATE_BASELINE_VERSION,
  buildRenewalWritebackProposal,
} from "@/lib/lease-renewal/writeback/proposal-contract";
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
  const snapshot = (path: string) => ({
    exists: docs.has(path),
    data: () => docs.get(path),
    get: (field: string) => docs.get(path)?.[field],
  });
  const document = (path: string) => ({
    path,
    async set(data: Record<string, unknown>) {
      docs.set(path, data);
    },
    async get() {
      return snapshot(path);
    },
    async delete() {
      docs.delete(path);
    },
    collection(name: string) {
      return collection(`${path}/${name}`);
    },
  });
  const collection = (path: string) => ({
    doc: (id: string) => document(`${path}/${id}`),
    orderBy: () => ({
      limit: () => ({
        async get() {
          return {
            docs: [...docs.entries()]
              .filter(([key]) => key.startsWith(`${path}/`))
              .map(([key, value]) => ({
                id: key.slice(path.length + 1),
                data: () => value,
              })),
          };
        },
      }),
    }),
  });
  const db = {
    collection,
    async runTransaction<T>(work: (transaction: unknown) => Promise<T>) {
      const transaction = {
        get: async (ref: { path: string }) => snapshot(ref.path),
        set: (ref: { path: string }, data: Record<string, unknown>) =>
          docs.set(ref.path, data),
        create: (ref: { path: string }, data: Record<string, unknown>) => {
          if (docs.has(ref.path)) throw new Error("Document already exists.");
          docs.set(ref.path, data);
        },
        delete: (ref: { path: string }) => docs.delete(ref.path),
      };
      return work(transaction);
    },
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
    await saveRenewalWritebackProposal(actor(), first, null, db);
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
    await saveRenewalWritebackProposal(actor(), second, first.previewHash, db);
    const loaded = await getRenewalWritebackProposal(actor(), "4821", db);
    expect(loaded?.previewHash).toBe(second.previewHash);
    expect(loaded?.previewHash).not.toBe(first.previewHash);
  });

  it("refuses saving a proposal assembled by a different actor", async () => {
    const { db } = fakeDb();
    await expect(
      saveRenewalWritebackProposal(actor({ uid: "someone-else" }), proposal(), null, db),
    ).rejects.toThrow("saved only by the actor who assembled it");
  });

  it("refuses a stored document that no longer matches the versioned schema", async () => {
    const { db, docs } = fakeDb();
    await saveRenewalWritebackProposal(actor(), proposal(), null, db);
    const key = `${RENEWAL_WRITEBACK_PROPOSALS_COLLECTION}/4821`;
    const stored = docs.get(key)!;
    docs.set(key, { ...stored, effects: [{ tampered: true }] });
    await expect(getRenewalWritebackProposal(actor(), "4821", db)).rejects.toThrow();
  });

  it("keeps a legacy create proposal readable when its pre-baseline field is absent", async () => {
    const { db, docs } = fakeDb();
    const leaseState = proposal().leaseState;
    const current = buildRenewalWritebackProposal({
      leaseId: "4821",
      account: "pmikcmetro",
      actorUid: "editor-1",
      actorEmail: "editor@pmikcmetro.com",
      actorRole: "Editor",
      leaseState,
      sourceReadAtIso: "2026-09-01T11:59:00.000Z",
      evidenceRef: "workspace:4821",
      effects: [
        {
          kind: "recurring_charge_create",
          create: {
            accountID: "9",
            amount: "45.00",
            description: "Renewal admin fee",
            dayDue: "1",
            frequency: "1",
            startDate: "09/01/2026",
          },
          baseline: {
            version: RECURRING_CHARGE_CREATE_BASELINE_VERSION,
            candidates: [],
          },
        },
      ],
      nowMs: NOW,
    });
    await saveRenewalWritebackProposal(actor(), current, null, db);
    const key = `${RENEWAL_WRITEBACK_PROPOSALS_COLLECTION}/4821`;
    const stored = structuredClone(docs.get(key)!);
    const effect = (stored.effects as { effect: Record<string, unknown> }[])[0].effect;
    delete effect.baseline;
    docs.set(key, stored);

    const loaded = await getRenewalWritebackProposal(actor(), "4821", db);
    expect(loaded?.effects[0].effect).not.toHaveProperty("baseline");
  });

  it("returns null for absent or malformed lease ids without reading the store", async () => {
    const { db } = fakeDb();
    expect(await getRenewalWritebackProposal(actor(), "4821", db)).toBeNull();
    expect(await getRenewalWritebackProposal(actor(), "not-a-lease", db)).toBeNull();
    expect(await getRenewalWritebackProposal(actor(), "0", db)).toBeNull();
  });

  it("discards only the app-plane proposal document", async () => {
    const { db, docs } = fakeDb();
    const current = proposal();
    await saveRenewalWritebackProposal(actor(), current, null, db);
    docs.set("other/receipt-1", { keep: true });
    await discardRenewalWritebackProposal(actor(), "4821", current.previewHash, db);
    expect(await getRenewalWritebackProposal(actor(), "4821", db)).toBeNull();
    expect(docs.get("other/receipt-1")).toEqual({ keep: true });
  });
});
