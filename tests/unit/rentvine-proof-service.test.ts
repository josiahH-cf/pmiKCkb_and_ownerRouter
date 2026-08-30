import { describe, expect, it, vi } from "vitest";

import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
import { RentVineError } from "@/lib/integrations/rentvine/client";
import { MemoryRentVineProofCloseoutStore } from "@/lib/lease-renewal/rentvine-proof-closeout";
import {
  parseRentVineProofConfirmation,
  type RentVineProofPhase,
} from "@/lib/lease-renewal/rentvine-proof-contract";
import { parseRentVineProofRuntimeConfig } from "@/lib/lease-renewal/rentvine-proof-runtime-config";
import { RentVineProofService } from "@/lib/lease-renewal/rentvine-proof-service";

const START_MS = Date.parse("2026-08-30T16:00:00.000Z");

function runtime() {
  return parseRentVineProofRuntimeConfig({
    schemaVersion: "s30-runtime-v1",
    scope: "renewals",
    proofRef: "s30-123e4567-e89b-42d3-a456-426614174000",
    account: "pmikcmetro",
    actor: {
      uid: "managed-admin-1",
      email: "renewals-admin@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Admin",
      scopes: ["renewals"],
    },
    authority: {
      clientDesignationRef: "client-direction-20260830-a1b2",
      protectedGateDirectionRef: "owner-gate-direction-20260830-c3d4",
      endpointEvidenceRef: "rentvine-contract-evidence-20260830-e5f6",
      mappingEvidenceRef: "rentvine-lease-map-20260830-g7h8",
      backupEvidenceRef: "rentvine-before-read-20260830-i9j0",
      authorizationExpiresAt: "2026-08-30T18:00:00.000Z",
    },
    target: {
      leaseId: "42",
      identityField: "leaseID",
      field: "endDate",
      expectedStartDate: "2025-09-01",
      expectedEndDate: "2026-08-31",
      proposedEndDate: "2026-09-01",
      rollbackEndDate: "2026-08-31",
    },
  });
}

type RuntimeGateRefusal = "action_suspended" | "global_suspended" | "unreadable";

function harness(
  options: {
    open?: boolean;
    mutateThenThrow?: boolean;
    runtimeGateRefusal?: RuntimeGateRefusal;
  } = {},
) {
  let nowMs = START_MS;
  let open = options.open ?? false;
  let committedClosed = !open;
  const state: { startDate: string; endDate: string | null } = {
    startDate: "2025-09-01",
    endDate: "2026-08-31",
  };
  const getLease = vi.fn(async () => ({
    leaseID: 42,
    startDate: state.startDate,
    endDate: state.endDate,
  }));
  const updateLease = vi.fn(
    async (_leaseId: string, payload: { startDate: string; endDate?: string | null }) => {
      state.startDate = payload.startDate;
      state.endDate = payload.endDate ?? null;
      if (options.mutateThenThrow) throw new Error("network response lost");
      return { accepted: true };
    },
  );
  const createWriter = vi.fn(() => ({ updateLease }));
  const store = new MemoryExternalExecutionStore();
  const closeouts = new MemoryRentVineProofCloseoutStore();
  const getUser = vi.fn(async (uid: string) => ({
    uid,
    email: "renewals-admin@pmikcmetro.com",
    emailVerified: true,
    disabled: false,
    customClaims: { role: "Admin", scopes: ["renewals"] },
    providerData: [{ providerId: "google.com", email: "renewals-admin@pmikcmetro.com" }],
  }));
  const service = new RentVineProofService({
    descriptor: {
      environmentKind: "production",
      dataContext: "live",
      source: "explicit",
    },
    actorReader: { getUser },
    store,
    closeouts,
    reader: { getLease },
    createWriter,
    gate: {
      isExecutable: vi.fn(async () => {
        if (options.runtimeGateRefusal === "unreadable") {
          throw new Error("runtime gate state unavailable");
        }
        if (options.runtimeGateRefusal) return false;
        return open;
      }),
      run: async <T>(effect: () => Promise<T> | T): Promise<T> => {
        if (options.runtimeGateRefusal || !open) {
          throw new Error("closed after claim");
        }
        return effect();
      },
      isCommittedSeedClosed: vi.fn(() => committedClosed),
    },
    now: () => nowMs,
  });
  return {
    service,
    store,
    closeouts,
    state,
    getUser,
    getLease,
    updateLease,
    createWriter,
    setOpen(value: boolean) {
      open = value;
    },
    setCommittedClosed(value: boolean) {
      committedClosed = value;
    },
    advance(ms: number) {
      nowMs += ms;
    },
  };
}

function confirmation(
  prepared: Awaited<ReturnType<RentVineProofService["preview"]>>,
  phase: RentVineProofPhase,
) {
  const config = runtime();
  return parseRentVineProofConfirmation({
    schemaVersion: "s30-confirmation-v1",
    proofRef: config.proofRef,
    phase,
    executionId: prepared.record.id,
    previewHash: prepared.record.previewHash,
    actor: { uid: config.actor.uid, email: config.actor.email },
    confirmedAt: new Date(Date.parse(prepared.record.createdAt) + 1_000).toISOString(),
  });
}

describe("S30 one-record proof service", () => {
  it("permits a dry exact preview while the key is closed but refuses execution before writer construction", async () => {
    const h = harness();
    const prepared = await h.service.preview(runtime(), "forward");
    expect(prepared.gateExecutable).toBe(false);

    await expect(
      h.service.execute(runtime(), confirmation(prepared, "forward")),
    ).rejects.toMatchObject({ code: "action_closed" });
    expect(h.createWriter).not.toHaveBeenCalled();
    expect(h.updateLease).not.toHaveBeenCalled();
    await expect(h.store.get(prepared.record.id)).resolves.toMatchObject({
      state: "ready",
      attemptCount: 0,
    });
  });

  // S51_DYNAMIC_REFUSAL:rentvine-proof-writer
  it.each(["action_suspended", "global_suspended", "unreadable"] as const)(
    "does not construct the RentVine writer when runtime state is %s",
    async (runtimeGateRefusal) => {
      const h = harness({ runtimeGateRefusal });
      const prepared = await h.service.preview(runtime(), "forward");
      await expect(
        h.service.execute(runtime(), confirmation(prepared, "forward")),
      ).rejects.toMatchObject({ code: "action_closed" });
      expect(h.createWriter).not.toHaveBeenCalled();
      expect(h.updateLease).not.toHaveBeenCalled();
    },
  );

  it("refuses an unverified runtime actor before provider read or writer construction", async () => {
    const h = harness();
    h.getUser.mockRejectedValueOnce(new Error("auth unavailable"));
    await expect(h.service.preview(runtime(), "forward")).rejects.toMatchObject({
      code: "actor_read_failed",
    });
    expect(h.getLease).not.toHaveBeenCalled();
    expect(h.createWriter).not.toHaveBeenCalled();
  });

  it("performs one exact write/readback and returns the same receipt to a duplicate confirmation", async () => {
    const h = harness({ open: true });
    const prepared = await h.service.preview(runtime(), "forward");
    h.advance(2 * 60_000);
    const exact = confirmation(prepared, "forward");

    const first = await h.service.execute(runtime(), exact);
    const duplicate = await h.service.execute(runtime(), exact);

    expect(first.duplicate).toBe(false);
    expect(duplicate).toEqual({ ...first, duplicate: true });
    expect(h.updateLease).toHaveBeenCalledTimes(1);
    expect(h.updateLease).toHaveBeenCalledWith("42", {
      startDate: "2025-09-01",
      endDate: "2026-09-01",
    });
    expect(h.state.endDate).toBe("2026-09-01");
  });

  it("invalidates stale provider state before claiming or constructing a writer", async () => {
    const h = harness({ open: true });
    const prepared = await h.service.preview(runtime(), "forward");
    h.state.endDate = "2026-09-15";
    h.advance(2 * 60_000);

    await expect(
      h.service.execute(runtime(), confirmation(prepared, "forward")),
    ).rejects.toMatchObject({ code: "provider_state_drift" });
    expect(h.createWriter).not.toHaveBeenCalled();
    await expect(h.store.get(prepared.record.id)).resolves.toMatchObject({
      state: "ready",
      attemptCount: 0,
    });
  });

  it("re-reads inside the exact gate and refuses claim-time drift before writer construction", async () => {
    const h = harness({ open: true });
    const prepared = await h.service.preview(runtime(), "forward");
    h.advance(2 * 60_000);
    h.getLease
      .mockImplementationOnce(async () => ({
        leaseID: 42,
        startDate: "2025-09-01",
        endDate: "2026-08-31",
      }))
      .mockImplementationOnce(async () => ({
        leaseID: 42,
        startDate: "2025-09-01",
        endDate: "2026-09-15",
      }));

    await expect(
      h.service.execute(runtime(), confirmation(prepared, "forward")),
    ).rejects.toMatchObject({ code: "provider_refused" });
    expect(h.createWriter).not.toHaveBeenCalled();
    expect(h.updateLease).not.toHaveBeenCalled();
    await expect(h.store.get(prepared.record.id)).resolves.toMatchObject({
      state: "failed",
      attemptCount: 1,
    });
  });

  it("revalidates confirmation freshness after the gate read and before writer construction", async () => {
    const h = harness({ open: true });
    const prepared = await h.service.preview(runtime(), "forward");
    h.getLease
      .mockImplementationOnce(async () => ({
        leaseID: 42,
        startDate: "2025-09-01",
        endDate: "2026-08-31",
      }))
      .mockImplementationOnce(async () => {
        h.advance(11 * 60_000);
        return {
          leaseID: 42,
          startDate: "2025-09-01",
          endDate: "2026-08-31",
        };
      });

    await expect(
      h.service.execute(runtime(), confirmation(prepared, "forward")),
    ).rejects.toMatchObject({ code: "provider_refused" });
    expect(h.createWriter).not.toHaveBeenCalled();
    expect(h.updateLease).not.toHaveBeenCalled();
    await expect(h.store.get(prepared.record.id)).resolves.toMatchObject({
      state: "failed",
      attemptCount: 1,
    });
  });

  it("consumes a claimed no-effect attempt when the exact gate closes before writer construction", async () => {
    const h = harness({ open: true });
    const prepared = await h.service.preview(runtime(), "forward");
    h.advance(2 * 60_000);
    h.getLease.mockImplementationOnce(async () => {
      h.setOpen(false);
      return { leaseID: 42, startDate: "2025-09-01", endDate: "2026-08-31" };
    });

    await expect(
      h.service.execute(runtime(), confirmation(prepared, "forward")),
    ).rejects.toMatchObject({ code: "action_closed" });
    expect(h.createWriter).not.toHaveBeenCalled();
    expect(h.updateLease).not.toHaveBeenCalled();
    await expect(h.store.get(prepared.record.id)).resolves.toMatchObject({
      state: "failed",
      attemptCount: 1,
    });
  });

  it("classifies a known 4xx refusal as failed and forbids a second provider attempt", async () => {
    const h = harness({ open: true });
    h.updateLease.mockRejectedValueOnce(new RentVineError("bodyless refusal", 400));
    const prepared = await h.service.preview(runtime(), "forward");
    h.advance(2 * 60_000);
    const exact = confirmation(prepared, "forward");

    await expect(h.service.execute(runtime(), exact)).rejects.toMatchObject({
      code: "provider_refused",
    });
    await expect(h.service.execute(runtime(), exact)).rejects.toMatchObject({
      code: "execution_state",
    });
    expect(h.updateLease).toHaveBeenCalledTimes(1);
    await expect(h.store.get(prepared.record.id)).resolves.toMatchObject({
      state: "failed",
      attemptCount: 1,
    });
  });

  it("rejects a changed confirmation actor before gate or provider work", async () => {
    const h = harness({ open: true });
    const prepared = await h.service.preview(runtime(), "forward");
    h.advance(2 * 60_000);
    const exact = confirmation(prepared, "forward");

    await expect(
      h.service.execute(runtime(), {
        ...exact,
        actor: { ...exact.actor, uid: "different-managed-admin" },
      }),
    ).rejects.toMatchObject({ code: "confirmation_mismatch" });
    expect(h.createWriter).not.toHaveBeenCalled();
  });

  it("marks a response-loss outcome ambiguous and reconciles by exact readback without retry", async () => {
    const h = harness({ open: true, mutateThenThrow: true });
    const prepared = await h.service.preview(runtime(), "forward");
    h.advance(2 * 60_000);
    await expect(
      h.service.execute(runtime(), confirmation(prepared, "forward")),
    ).rejects.toMatchObject({ code: "provider_ambiguous" });
    expect(h.updateLease).toHaveBeenCalledTimes(1);
    await expect(h.store.get(prepared.record.id)).resolves.toMatchObject({
      state: "ambiguous",
      attemptCount: 1,
    });

    await expect(h.service.reconcile(runtime(), "forward")).resolves.toMatchObject({
      reconciled: true,
    });
    expect(h.updateLease).toHaveBeenCalledTimes(1);
    await expect(h.store.get(prepared.record.id)).resolves.toMatchObject({
      state: "succeeded",
      receipt: { reconciled: true },
    });
  });

  it("keeps an ambiguous attempt unresolved when the before-state is still observed", async () => {
    const h = harness({ open: true });
    h.updateLease.mockRejectedValueOnce(new Error("request outcome unknown"));
    const prepared = await h.service.preview(runtime(), "forward");
    h.advance(2 * 60_000);
    await expect(
      h.service.execute(runtime(), confirmation(prepared, "forward")),
    ).rejects.toMatchObject({ code: "provider_ambiguous" });

    await expect(h.service.reconcile(runtime(), "forward")).rejects.toMatchObject({
      code: "reconcile_not_proven",
    });
    expect(h.updateLease).toHaveBeenCalledTimes(1);
    await expect(h.store.get(prepared.record.id)).resolves.toMatchObject({
      state: "ambiguous",
      attemptCount: 1,
    });
  });

  it("reconciles an abandoned running claim only after the bounded in-flight window and never retries it", async () => {
    const h = harness({ open: true });
    const prepared = await h.service.preview(runtime(), "forward");
    await expect(
      h.store.claim(prepared.record.id, prepared.record.previewHash),
    ).resolves.toBe("claimed");
    await expect(h.service.reconcile(runtime(), "forward")).rejects.toMatchObject({
      code: "execution_in_progress",
    });

    const running = await h.store.get(prepared.record.id);
    if (!running) throw new Error("Expected claimed execution.");
    h.store.records.set(prepared.record.id, {
      ...running,
      updatedAt: new Date(START_MS).toISOString(),
    });
    h.advance(3 * 60_000);
    await expect(h.service.reconcile(runtime(), "forward")).rejects.toMatchObject({
      code: "reconcile_not_proven",
    });
    expect(h.createWriter).not.toHaveBeenCalled();
    expect(h.updateLease).not.toHaveBeenCalled();
    await expect(h.store.get(prepared.record.id)).resolves.toMatchObject({
      state: "ambiguous",
      attemptCount: 1,
    });
  });

  it("requires a successful forward proof, restores the exact prior value, then closes out only after exact key closure", async () => {
    const h = harness({ open: true });
    const forward = await h.service.preview(runtime(), "forward");
    h.advance(2 * 60_000);
    await h.service.execute(runtime(), confirmation(forward, "forward"));

    const rollback = await h.service.preview(runtime(), "rollback");
    await h.service.execute(runtime(), confirmation(rollback, "rollback"));
    expect(h.state.endDate).toBe("2026-08-31");
    expect(h.updateLease).toHaveBeenCalledTimes(2);

    await expect(h.service.closeout(runtime())).rejects.toMatchObject({
      code: "closeout_gate_not_closed",
    });
    h.setOpen(false);
    h.setCommittedClosed(true);
    const closed = await h.service.closeout(runtime());
    expect(closed.record).toMatchObject({
      actionKey: "rentvine.lease.renewal_writeback",
      committedSeedAllowed: false,
      runtimeExecutable: false,
    });
    await expect(h.service.closeout(runtime())).resolves.toEqual({
      ...closed,
      reused: true,
    });
  });
});
