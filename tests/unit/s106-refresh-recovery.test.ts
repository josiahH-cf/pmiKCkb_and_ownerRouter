// S106 ARCH-S106-1 / AC-S106-4 / AC-S106-7 (fail-first): one generation-owned refresh serves every
// concurrent caller; a definitive provider refusal is not an uncertain outcome; and a quarantined
// connection (uncertain refresh or unknown revoke) completes disconnect with an honest receipt
// instead of needing a database edit. No live account is revoked or expired to prove it.

import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DotloopRuntimeTokenProvider,
  resetDotloopRefreshFlightsForTests,
} from "@/lib/connections/dotloop-runtime";
import { revokeDotloopConnection } from "@/lib/connections/dotloop-revocation";
import {
  CONNECTOR_CONNECTIONS_COLLECTION,
  FirestoreConnectorConnectionStore,
} from "@/lib/firestore/connector-connections";
import { FakeTransactionalFirestore } from "@/tests/helpers/fake-transactional-firestore";

const generationId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const now = "2026-10-07T12:00:00.000Z";
const LIVE = {
  environmentKind: "production",
  dataContext: "live",
  source: "explicit",
} as const;

function seedConnected(
  db: FakeTransactionalFirestore,
  extra: Record<string, unknown> = {},
) {
  db.seed(`${CONNECTOR_CONNECTIONS_COLLECTION}/dotloop`, {
    connectorId: "dotloop",
    method: "oauth",
    status: "connected",
    generationId,
    revision: 1,
    secretRef: "access-ref-1",
    refreshTokenRef: "refresh-ref-1",
    tokenExpiresAt: "2026-10-07T11:00:00.000Z",
    oauthState: "ready",
    connectedByUid: "admin-1",
    connectedAt: "2026-10-07T00:00:00.000Z",
    updatedAt: "2026-10-07T00:00:00.000Z",
    ...extra,
  });
}

function memoryVault() {
  const secrets = new Map<string, string>([
    ["access-ref-1", "access-1"],
    ["refresh-ref-1", "refresh-1"],
  ]);
  let next = 1;
  return {
    secrets,
    capability: async () => "configured" as const,
    readSecret: vi.fn(async ({ secretRef }: { secretRef: string }) =>
      secrets.has(secretRef)
        ? { ok: true as const, secret: secrets.get(secretRef)! }
        : { ok: false as const, reason: "not_configured" as const },
    ),
    storeSecret: vi.fn(async ({ secret }: { secret: string }) => {
      next += 1;
      const secretRef = `stored-ref-${next}`;
      secrets.set(secretRef, secret);
      return { ok: true as const, secretRef };
    }),
    destroySecret: vi.fn(async ({ secretRef }: { secretRef: string }) => ({
      ok: true as const,
      outcome: secrets.delete(secretRef)
        ? ("destroyed" as const)
        : ("already_absent" as const),
    })),
  };
}

function provider(
  store: FirestoreConnectorConnectionStore,
  vault: ReturnType<typeof memoryVault>,
  fetch: (input: { url: string }) => Promise<unknown>,
) {
  return new DotloopRuntimeTokenProvider({
    store,
    vault,
    transport: { fetch: fetch as never },
    config: {
      clientId: "client",
      clientSecret: "secret",
      redirectUri: "https://a.example/cb",
    },
    descriptor: LIVE,
    now: () => now,
    sleep: async () => undefined,
    peerWaitMs: 5_000,
  });
}

beforeEach(() => resetDotloopRefreshFlightsForTests());

describe("S106 generation-owned refresh (AC-S106-7)", () => {
  it("serves two simultaneous expiries with one provider refresh and the same new token", async () => {
    const db = new FakeTransactionalFirestore();
    seedConnected(db);
    const store = new FirestoreConnectorConnectionStore(db as unknown as Firestore);
    const vault = memoryVault();
    const fetch = vi.fn(async () => ({
      status: 200,
      headers: {},
      json: async () => ({
        access_token: "access-2",
        refresh_token: "refresh-2",
        expires_in: 3600,
      }),
    }));
    const [first, second] = await Promise.all([
      provider(store, vault, fetch).accessToken(),
      provider(store, vault, fetch).accessToken(),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(first).toBe("access-2");
    expect(second).toBe("access-2");
    expect(await store.getConnection("dotloop")).toMatchObject({
      oauthState: "ready",
      revision: 3,
    });
  });

  it("records a definitive provider refusal as a certain failure, not an uncertain one", async () => {
    const db = new FakeTransactionalFirestore();
    seedConnected(db);
    const store = new FirestoreConnectorConnectionStore(db as unknown as Firestore);
    const fetch = vi.fn(async () => ({
      status: 400,
      headers: {},
      json: async () => ({}),
    }));
    await expect(provider(store, memoryVault(), fetch).refresh()).resolves.toBeNull();
    expect(await store.getConnection("dotloop")).toMatchObject({
      oauthState: "refresh_needed",
      refreshOutcomeUncertain: false,
    });
  });

  it("marks a lost refresh response as uncertain", async () => {
    const db = new FakeTransactionalFirestore();
    seedConnected(db);
    const store = new FirestoreConnectorConnectionStore(db as unknown as Firestore);
    const fetch = vi.fn(async () => {
      throw new Error("socket closed");
    });
    await expect(provider(store, memoryVault(), fetch).refresh()).resolves.toBeNull();
    expect(await store.getConnection("dotloop")).toMatchObject({
      oauthState: "refresh_needed",
      refreshOutcomeUncertain: true,
    });
  });
});

describe("S106 quarantined disconnect recovery (AC-S106-4, AC-S106-7)", () => {
  async function pendingAfter(extra: Record<string, unknown>) {
    const db = new FakeTransactionalFirestore();
    seedConnected(db, extra);
    const store = new FirestoreConnectorConnectionStore(db as unknown as Firestore);
    const current = await store.getConnection("dotloop");
    const claim = await store.claimRevocation({
      connectorId: "dotloop",
      mode: "start",
      operationId,
      observedVersion: `g:${generationId}:${(current as { revision: number }).revision}`,
      requestedByUid: "admin-1",
      requestedAt: now,
    });
    if (claim.state !== "pending") throw new Error("expected pending");
    return { store, record: claim.record };
  }

  it("completes an uncertain-refresh disconnect with an unverified provider receipt", async () => {
    const { store, record } = await pendingAfter({
      oauthState: "refresh_needed",
      refreshOutcomeUncertain: true,
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 401 });
    const concluded = await revokeDotloopConnection({
      record,
      store,
      vault: memoryVault(),
      transport: { fetch },
      descriptor: LIVE,
      now: () => now,
    });
    expect(concluded.providerRevocationState).toBe("unverified");
    const receipt = await store.completeRevocation({
      connectorId: "dotloop",
      operationId,
      generationId,
      expectedRevision: concluded.revision,
      completedAt: now,
      destroyOutcome: "destroyed",
    });
    expect(receipt).toMatchObject({ providerRevocation: "unverified" });
    expect(receipt.providerRevokedAt).toBeUndefined();
    const readback = await store.readRevocationResult("dotloop", operationId);
    expect(readback?.receipt.providerRevocation).toBe("unverified");
  });

  it("concludes an unknown earlier revoke from a rejected readback without resending it", async () => {
    const { store, record } = await pendingAfter({});
    const attempting = await store.recordDotloopProviderRevocation!({
      generationId,
      operationId,
      expectedRevision: record.revision,
      state: "attempting",
      observedAt: now,
    });
    const fetch = vi.fn().mockResolvedValueOnce({ status: 401 });
    const concluded = await revokeDotloopConnection({
      record: attempting,
      store,
      vault: memoryVault(),
      transport: { fetch },
      descriptor: LIVE,
      now: () => now,
    });
    expect(fetch.mock.calls.map(([call]) => call.method)).toEqual(["GET"]);
    expect(concluded.providerRevocationState).toBe("unverified");
  });

  it("revokes again only after a readback proves the earlier revoke did not take effect", async () => {
    const { store, record } = await pendingAfter({});
    const attempting = await store.recordDotloopProviderRevocation!({
      generationId,
      operationId,
      expectedRevision: record.revision,
      state: "attempting",
      observedAt: now,
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 401 });
    const concluded = await revokeDotloopConnection({
      record: attempting,
      store,
      vault: memoryVault(),
      transport: { fetch },
      descriptor: LIVE,
      now: () => now,
    });
    expect(fetch.mock.calls.map(([call]) => call.method)).toEqual(["GET", "POST", "GET"]);
    expect(concluded.providerRevocationState).toBe("verified");
  });
});
