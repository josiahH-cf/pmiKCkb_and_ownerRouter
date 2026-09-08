import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import {
  FirestoreConnectorConnectionStore,
  CONNECTOR_CONNECTIONS_COLLECTION,
} from "@/lib/firestore/connector-connections";
import { FakeTransactionalFirestore } from "@/tests/helpers/fake-transactional-firestore";
import { revokeDotloopConnection } from "@/lib/connections/dotloop-revocation";
const generationId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const now = "2026-09-08T00:03:00.000Z";
function setup(refreshing = false) {
  const db = new FakeTransactionalFirestore();
  db.seed(`${CONNECTOR_CONNECTIONS_COLLECTION}/dotloop`, {
    connectorId: "dotloop",
    method: "oauth",
    status: "connected",
    generationId,
    revision: 2,
    secretRef: "isolated-access-ref",
    refreshTokenRef: "isolated-refresh-ref",
    connectedByUid: "isolated-admin",
    connectedAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    ...(refreshing ? { oauthState: "refreshing", refreshOperationId: operationId } : {}),
  });
  return new FirestoreConnectorConnectionStore(db as unknown as Firestore);
}
const request = {
  connectorId: "dotloop",
  mode: "start" as const,
  operationId,
  observedVersion: `g:${generationId}:2`,
  requestedByUid: "isolated-admin",
  requestedAt: now,
};
describe("S106 generation-bound disconnect recovery", () => {
  it("cannot mint a Dotloop disconnect receipt from vault deletion without provider revocation proof", async () => {
    const store = setup();
    const claim = await store.claimRevocation(request);
    if (claim.state !== "pending") throw new Error("expected pending");
    await expect(
      store.completeRevocation({
        connectorId: "dotloop",
        generationId,
        operationId,
        expectedRevision: claim.record.revision,
        completedAt: now,
        destroyOutcome: "destroyed",
      }),
    ).rejects.toThrow("provider revocation");
  });
  it("allows exact human-confirmed disconnect after an abandoned refresh and rejects its late completion", async () => {
    const store = setup(true);
    const claim = await store.claimRevocation(request);
    expect(claim.state).toBe("pending");
    if (claim.state !== "pending") throw new Error("expected pending");
    expect(claim.record.oauthState).toBe("refresh_needed");
    expect(
      await store.completeDotloopRefresh({
        generationId,
        operationId,
        nowIso: now,
        accessTokenRef: "late-ref",
        refreshTokenRef: "late-refresh",
        tokenExpiresAt: now,
      }),
    ).toBe(false);
  });
  it("keeps a still-active refresh protected from disconnect", async () => {
    await expect(
      setup(true).claimRevocation({
        ...request,
        requestedAt: "2026-09-08T00:00:10.000Z",
      }),
    ).rejects.toThrow("refresh");
  });
  it("retains failed cleanup targets when an abandoned refresh finishes after disconnect was claimed", async () => {
    const store = setup(true);
    const claim = await store.claimRevocation(request);
    expect(claim.state).toBe("pending");
    expect(
      await store.completeDotloopRefresh({
        generationId,
        operationId,
        nowIso: now,
        failed: true,
        providerAttempted: true,
        retainedSecretRefs: ["isolated-late-cleanup-ref"],
      }),
    ).toBe(false);
    const pending = await store.getConnection("dotloop");
    expect(pending).toMatchObject({
      status: "revocation_pending",
      refreshOutcomeUncertain: true,
      retainedSecretRefs: ["isolated-late-cleanup-ref"],
    });
  });
  it("requires provider acknowledgment and a refused access read before vault removal can complete", async () => {
    const store = setup();
    const claim = await store.claimRevocation(request);
    if (claim.state !== "pending") throw new Error("expected pending");
    const readSecret = vi.fn(async () => ({
      ok: true as const,
      secret: "isolated-token",
    }));
    const destroySecret = vi.fn();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 401 });
    const pending = await revokeDotloopConnection({
      record: claim.record,
      store,
      vault: {
        capability: async () => "configured",
        readSecret,
        storeSecret: vi.fn(),
        destroySecret,
      },
      transport: { fetch },
      descriptor: {
        environmentKind: "production",
        dataContext: "live",
        source: "explicit",
      },
      now: () => now,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0].method).toBe("POST");
    expect(fetch.mock.calls[1][0].method).toBe("GET");
    expect(destroySecret).not.toHaveBeenCalled();
    expect(pending.providerRevocationState).toBe("verified");
    const receipt = await store.completeRevocation({
      connectorId: "dotloop",
      generationId,
      operationId,
      expectedRevision: pending.revision,
      completedAt: now,
      destroyOutcome: "destroyed",
    });
    expect(receipt.providerRevokedAt).toBe(now);
    expect(JSON.stringify(receipt)).not.toContain("isolated-token");
  });
  it("retains an ambiguous provider attempt without repeating it or deleting credentials", async () => {
    const store = setup();
    const claim = await store.claimRevocation(request);
    if (claim.state !== "pending") throw new Error("expected pending");
    const fetch = vi.fn().mockRejectedValue(new Error("isolated response lost"));
    const destroySecret = vi.fn();
    const deps = {
      store,
      vault: {
        capability: async () => "configured" as const,
        readSecret: async () => ({ ok: true as const, secret: "isolated-token" }),
        storeSecret: vi.fn(),
        destroySecret,
      },
      transport: { fetch },
      descriptor: {
        environmentKind: "production" as const,
        dataContext: "live" as const,
        source: "explicit" as const,
      },
      now: () => now,
    };
    await expect(
      revokeDotloopConnection({ ...deps, record: claim.record }),
    ).rejects.toThrow("needs recovery");
    const pending = await store.getConnection("dotloop");
    if (pending?.status !== "revocation_pending" || !pending.generationId)
      throw new Error("expected pending");
    await expect(revokeDotloopConnection({ ...deps, record: pending })).rejects.toThrow(
      "unknown outcome",
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(destroySecret).not.toHaveBeenCalled();
  });
});
