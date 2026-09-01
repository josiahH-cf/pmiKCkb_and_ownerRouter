import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import {
  CONNECTOR_CONNECTIONS_COLLECTION,
  CONNECTOR_REVOCATION_RECEIPTS_COLLECTION,
  FirestoreConnectorConnectionStore,
} from "@/lib/firestore/connector-connections";
import { FakeTransactionalFirestore } from "@/tests/helpers/fake-transactional-firestore";

const CONNECTOR_ID = "rentvine";
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_OPERATION_ID = "33333333-3333-4333-8333-333333333333";
const NEW_GENERATION_ID = "44444444-4444-4444-8444-444444444444";
const LEGACY_TIME = "2026-08-31T10:00:00.000Z";
const REQUESTED_AT = "2026-08-31T11:00:00.000Z";
const COMPLETED_AT = "2026-08-31T12:00:00.000Z";

let fake: FakeTransactionalFirestore;
let store: FirestoreConnectorConnectionStore;

beforeEach(() => {
  fake = new FakeTransactionalFirestore();
  store = new FirestoreConnectorConnectionStore(fake as unknown as Firestore);
});

function seedLegacy(status: "connected" | "revocation_pending" = "connected") {
  fake.seed(`${CONNECTOR_CONNECTIONS_COLLECTION}/${CONNECTOR_ID}`, {
    connectorId: CONNECTOR_ID,
    method: "api_key",
    status,
    secretRef: "test-only-vault-handle",
    connectedByUid: "admin-0",
    connectedAt: "2026-08-30T10:00:00.000Z",
    updatedAt: LEGACY_TIME,
  });
}

function start(operationId = OPERATION_ID) {
  return store.claimRevocation({
    connectorId: CONNECTOR_ID,
    mode: "start",
    operationId,
    observedVersion: `legacy:${LEGACY_TIME}`,
    requestedByUid: "admin-1",
    requestedAt: REQUESTED_AT,
  });
}

describe("FirestoreConnectorConnectionStore S96 lifecycle", () => {
  it("materializes legacy state, increments once per transition, and reads back a redacted receipt", async () => {
    seedLegacy();
    const claim = await start();
    expect(claim.state).toBe("pending");
    if (claim.state !== "pending") throw new Error("expected pending claim");
    expect(claim.record.revision).toBe(1);
    expect(claim.record.generationId).toMatch(/^[0-9a-f-]{36}$/);

    const receipt = await store.completeRevocation({
      connectorId: CONNECTOR_ID,
      operationId: OPERATION_ID,
      generationId: claim.record.generationId,
      expectedRevision: 1,
      completedAt: COMPLETED_AT,
      destroyOutcome: "destroyed",
    });
    expect(receipt.revision).toBe(2);
    const readback = await store.readRevocationResult(CONNECTOR_ID, OPERATION_ID);
    expect(readback).toEqual({
      record: expect.objectContaining({
        status: "revoked",
        revision: 2,
        operationId: OPERATION_ID,
      }),
      receipt,
    });
    expect(JSON.stringify(readback)).not.toContain("test-only-vault-handle");
    expect(
      fake.read(
        `${CONNECTOR_REVOCATION_RECEIPTS_COLLECTION}/${CONNECTOR_ID}--${OPERATION_ID}`,
      ),
    ).not.toHaveProperty("secretRef");
  });

  it("allows a new generation only after the old receipt and makes old replay inert", async () => {
    seedLegacy();
    const claim = await start();
    if (claim.state !== "pending") throw new Error("expected pending claim");
    await store.completeRevocation({
      connectorId: CONNECTOR_ID,
      operationId: OPERATION_ID,
      generationId: claim.record.generationId,
      expectedRevision: claim.record.revision,
      completedAt: COMPLETED_AT,
      destroyOutcome: "already_absent",
    });
    const next = await store.createConnectedConnection({
      connectorId: CONNECTOR_ID,
      method: "api_key",
      secretRef: "new-test-only-vault-handle",
      connectedByUid: "admin-2",
      connectedAt: "2026-08-31T13:00:00.000Z",
      generationId: NEW_GENERATION_ID,
    });
    expect(next.generationId).toBe(NEW_GENERATION_ID);
    expect(next.revision).toBe(1);

    const replay = await store.claimRevocation({
      connectorId: CONNECTOR_ID,
      mode: "recover",
      operationId: OPERATION_ID,
      observedVersion: `g:${claim.record.generationId}:1`,
      requestedByUid: "admin-1",
      requestedAt: REQUESTED_AT,
    });
    expect(replay.state).toBe("completed");
    expect((await store.getConnection(CONNECTOR_ID))?.status).toBe("connected");
    expect((await store.getConnection(CONNECTOR_ID))?.generationId).toBe(
      NEW_GENERATION_ID,
    );
  });

  it("adopts only the exact safely classifiable legacy pending record", async () => {
    seedLegacy("revocation_pending");
    await expect(start()).rejects.toThrow(/state changed/i);
    const adopted = await store.claimRevocation({
      connectorId: CONNECTOR_ID,
      mode: "adopt_legacy",
      operationId: OPERATION_ID,
      observedVersion: `legacy:${LEGACY_TIME}`,
      requestedByUid: "admin-1",
      requestedAt: REQUESTED_AT,
    });
    expect(adopted.state).toBe("pending");
    if (adopted.state === "pending") expect(adopted.record.revision).toBe(1);

    fake = new FakeTransactionalFirestore();
    store = new FirestoreConnectorConnectionStore(fake as unknown as Firestore);
    seedLegacy("revocation_pending");
    const malformed = fake.read(`${CONNECTOR_CONNECTIONS_COLLECTION}/${CONNECTOR_ID}`)!;
    delete malformed.secretRef;
    fake.seed(`${CONNECTOR_CONNECTIONS_COLLECTION}/${CONNECTOR_ID}`, malformed);
    await expect(
      store.claimRevocation({
        connectorId: CONNECTOR_ID,
        mode: "adopt_legacy",
        operationId: OPERATION_ID,
        observedVersion: `legacy:${LEGACY_TIME}`,
        requestedByUid: "admin-1",
        requestedAt: REQUESTED_AT,
      }),
    ).rejects.toThrow(/recoverable legacy/i);
  });

  it("lets only one concurrent operation own a generation", async () => {
    seedLegacy();
    fake.armNextCommitBarrier(2);
    const results = await Promise.allSettled([start(), start(SECOND_OPERATION_ID)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const active = await store.getConnection(CONNECTOR_ID);
    expect(active?.status).toBe("revocation_pending");
    expect([OPERATION_ID, SECOND_OPERATION_ID]).toContain(
      active?.status === "revocation_pending" && "operationId" in active
        ? active.operationId
        : undefined,
    );
  });

  it("refuses stale recovery and preserves an immutable completed receipt", async () => {
    seedLegacy();
    const claim = await start();
    if (claim.state !== "pending") throw new Error("expected pending claim");
    await expect(
      store.claimRevocation({
        connectorId: CONNECTOR_ID,
        mode: "recover",
        operationId: OPERATION_ID,
        observedVersion: `g:${claim.record.generationId}:99`,
        requestedByUid: "admin-1",
        requestedAt: REQUESTED_AT,
      }),
    ).rejects.toThrow(/state changed/i);
    const first = await store.completeRevocation({
      connectorId: CONNECTOR_ID,
      operationId: OPERATION_ID,
      generationId: claim.record.generationId,
      expectedRevision: claim.record.revision,
      completedAt: COMPLETED_AT,
      destroyOutcome: "destroyed",
    });
    const replay = await store.completeRevocation({
      connectorId: CONNECTOR_ID,
      operationId: OPERATION_ID,
      generationId: claim.record.generationId,
      expectedRevision: claim.record.revision,
      completedAt: "2026-08-31T13:00:00.000Z",
      destroyOutcome: "already_absent",
    });
    expect(replay).toEqual(first);
  });

  it("refuses malformed versioned pending state before any completion", async () => {
    fake.seed(`${CONNECTOR_CONNECTIONS_COLLECTION}/${CONNECTOR_ID}`, {
      connectorId: CONNECTOR_ID,
      method: "api_key",
      status: "revocation_pending",
      secretRef: "test-only-vault-handle",
      connectedByUid: "admin-0",
      connectedAt: "2026-08-30T10:00:00.000Z",
      generationId: NEW_GENERATION_ID,
      revision: 2,
      requestedByUid: "admin-1",
      requestedAt: REQUESTED_AT,
      updatedAt: REQUESTED_AT,
    });
    await expect(
      store.claimRevocation({
        connectorId: CONNECTOR_ID,
        mode: "recover",
        operationId: OPERATION_ID,
        observedVersion: `g:${NEW_GENERATION_ID}:2`,
        requestedByUid: "admin-1",
        requestedAt: REQUESTED_AT,
      }),
    ).rejects.toThrow(/does not own/i);
  });
});
