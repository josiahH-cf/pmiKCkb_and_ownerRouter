import { describe, expect, it } from "vitest";

import {
  MemorySheetWritebackExecutionStore,
  buildSheetWritebackCorrectionPreview,
  buildSheetWritebackPreview,
  buildSheetWritebackReceipt,
  type SheetWritebackClaimAuthorization,
  type SheetWritebackExecutionRecord,
  type SheetWritebackPreviewRecord,
  type SheetWritebackProviderEffect,
} from "@/lib/lease-renewal/sheet-writeback-contract";

const NOW = Date.parse("2026-07-30T00:00:00.000Z");

function preview(overrides: Record<string, unknown> = {}) {
  return buildSheetWritebackPreview({
    actorUid: "admin-1",
    runId: "live-review",
    sourceTriggerKey: "trigger-1",
    propertyKey: "4821-maple-st",
    fieldKey: "current_rent",
    approvalId: "approval-1",
    approvalVersion: "2026-07-30T00:00:00.000Z",
    sourceOfValue: "RentVine",
    descriptor: {
      environmentKind: "production",
      dataContext: "live",
      source: "explicit",
    },
    target: {
      spreadsheetId: "sheet-1",
      tabName: "Renewals",
      a1: "Renewals!C2",
      rowIndex: 1,
      proposedColumnHeader: "KB Proposed — Rent",
      anchorHeaders: ["Address", "Tenant"],
      rowAnchorHash: "a".repeat(64),
      anchorColumnCount: 3,
    },
    proposedValue: "1300",
    nowMs: NOW,
    nonce: "nonce-1",
    ...overrides,
  });
}

function authorizationFor(
  prepared: SheetWritebackPreviewRecord,
): SheetWritebackClaimAuthorization {
  return {
    sourceTriggerKey: prepared.binding.sourceTriggerKey,
    runId: prepared.binding.runId,
    propertyKey: prepared.binding.propertyKey,
    fieldKey: prepared.binding.fieldKey,
    approvalId: prepared.binding.approvalId,
    approvalVersion: prepared.binding.approvalVersion,
    sourceOfValue: prepared.binding.sourceOfValue,
    proposedValueHash: prepared.binding.proposedValueHash,
  };
}

function providerEffect(
  overrides: Partial<SheetWritebackProviderEffect> = {},
): SheetWritebackProviderEffect {
  return {
    a1: "Renewals!C2",
    effectId: "sheets-effect-1",
    appliedAt: new Date(NOW + 2).toISOString(),
    resultHash: "b".repeat(64),
    ...overrides,
  };
}

describe("Sheet write-back immutable contract", () => {
  it("binds actor, property, field, approval, source, value, target, and environment while keeping idempotency actor-independent", () => {
    const base = preview();
    const actorDrift = preview({ actorUid: "admin-2" });
    const propertyDrift = preview({ propertyKey: "4900-oak-st" });
    const fieldDrift = preview({ fieldKey: "renewal_rent" });
    const sourceDrift = preview({ sourceOfValue: "Google Sheet" });
    const valueDrift = preview({ proposedValue: "1400" });
    const environmentDrift = preview({
      descriptor: {
        environmentKind: "demo",
        dataContext: "demo",
        source: "explicit",
      },
    });

    expect(base.id).toHaveLength(64);
    expect(actorDrift.id).not.toBe(base.id);
    expect(actorDrift.bindingHash).not.toBe(base.bindingHash);
    expect(propertyDrift.executionId).not.toBe(base.executionId);
    expect(fieldDrift.executionId).not.toBe(base.executionId);
    expect(sourceDrift.executionId).not.toBe(base.executionId);
    expect(valueDrift.executionId).not.toBe(base.executionId);
    expect(environmentDrift.executionId).not.toBe(base.executionId);
    expect(actorDrift.executionId).toBe(base.executionId);
  });

  it("persists no proposed value or row body and records exact bodyless provider-effect evidence", async () => {
    const store = new MemorySheetWritebackExecutionStore();
    const prepared = preview();
    await store.createPreview(prepared);
    const claimed = await store.claim({
      previewHash: prepared.id,
      executionId: prepared.executionId,
      actorUid: "admin-1",
      nowMs: NOW + 1,
      authorization: authorizationFor(prepared),
    });
    expect(claimed.status).toBe("claimed");
    if (claimed.status !== "claimed") return;

    const effect = providerEffect();
    const receipt = buildSheetWritebackReceipt(claimed.record, effect);
    await store.finish(claimed.record.id, receipt);

    expect(receipt).toMatchObject({
      attemptedA1: prepared.binding.target.a1,
      verifiedA1: effect.a1,
      providerEffectId: effect.effectId,
      providerAppliedAt: effect.appliedAt,
      providerResultHash: effect.resultHash,
      createdAt: effect.appliedAt,
      reconciled: false,
    });
    const serialized = JSON.stringify({
      preview: await store.getPreview(prepared.id),
      execution: await store.getExecution(prepared.executionId),
    });
    expect(serialized).not.toContain("1300");
    expect(serialized).not.toContain("rowValues");
    expect(serialized).toContain(claimed.record.proposedValueHash);
  });

  it.each([
    ["effect id", { effectId: "contains whitespace" }],
    ["result hash", { resultHash: "not-a-sha256" }],
    ["applied time", { appliedAt: "2026-07-30 00:00:00" }],
    ["verified A1", { a1: "C2" }],
  ] as const)("rejects invalid provider %s evidence", (_label, drift) => {
    const prepared = preview();
    const record = {
      ...prepared.binding,
      id: prepared.executionId,
      actionKey: "google_sheets.renewal_checklist.writeback" as const,
      bindingHash: prepared.bindingHash,
      previewHash: prepared.id,
      state: "running" as const,
      attemptCount: 1 as const,
      createdAt: new Date(NOW).toISOString(),
      updatedAt: new Date(NOW).toISOString(),
    };
    expect(() => buildSheetWritebackReceipt(record, providerEffect(drift))).toThrow(
      "provider effect evidence is invalid",
    );
  });

  it("rejects provider effect evidence from a different Sheet tab", () => {
    const prepared = preview();
    const record = {
      ...prepared.binding,
      id: prepared.executionId,
      actionKey: "google_sheets.renewal_checklist.writeback" as const,
      bindingHash: prepared.bindingHash,
      previewHash: prepared.id,
      state: "running" as const,
      attemptCount: 1 as const,
      createdAt: new Date(NOW).toISOString(),
      updatedAt: new Date(NOW).toISOString(),
    };
    expect(() =>
      buildSheetWritebackReceipt(record, providerEffect({ a1: "Archive!C2" })),
    ).toThrow("different Sheet tab");
  });

  it("rejects a provider effect at a different same-tab cell", () => {
    const prepared = preview();
    const record = {
      ...prepared.binding,
      id: prepared.executionId,
      actionKey: "google_sheets.renewal_checklist.writeback" as const,
      bindingHash: prepared.bindingHash,
      previewHash: prepared.id,
      state: "running" as const,
      attemptCount: 1 as const,
      createdAt: new Date(NOW).toISOString(),
      updatedAt: new Date(NOW).toISOString(),
    };
    expect(() =>
      buildSheetWritebackReceipt(record, providerEffect({ a1: "Renewals!C3" })),
    ).toThrow("exact human-confirmed Sheet cell");
  });

  it("claims once, returns the exact successful receipt on duplicate, and never reopens ambiguity", async () => {
    const store = new MemorySheetWritebackExecutionStore();
    const prepared = preview();
    const authorization = authorizationFor(prepared);
    await store.createPreview(prepared);
    const first = await store.claim({
      previewHash: prepared.id,
      executionId: prepared.executionId,
      actorUid: "admin-1",
      nowMs: NOW + 1,
      authorization,
    });
    expect(first.status).toBe("claimed");
    const inProgress = await store.claim({
      previewHash: prepared.id,
      executionId: prepared.executionId,
      actorUid: "admin-1",
      nowMs: NOW + 2,
      authorization,
    });
    expect(inProgress.status).toBe("in_progress");
    if (first.status !== "claimed") return;

    const receipt = buildSheetWritebackReceipt(
      first.record,
      providerEffect({ appliedAt: new Date(NOW + 3).toISOString() }),
    );
    await store.finish(first.record.id, receipt);
    const duplicate = await store.claim({
      previewHash: prepared.id,
      executionId: prepared.executionId,
      actorUid: "admin-1",
      nowMs: NOW + 4,
      authorization,
    });
    expect(duplicate).toMatchObject({ status: "duplicate", receipt });

    const conflictingReceipt = buildSheetWritebackReceipt(
      first.record,
      providerEffect({
        effectId: "sheets-effect-conflict",
        appliedAt: new Date(NOW + 4).toISOString(),
        resultHash: "c".repeat(64),
      }),
    );
    await expect(store.finish(first.record.id, conflictingReceipt)).rejects.toThrow(
      "conflicting receipt",
    );

    const second = preview({
      proposedValue: "1400",
      predecessorExecutionId: first.record.id,
      nonce: "nonce-2",
    });
    await store.createPreview(second);
    const secondClaim = await store.claim({
      previewHash: second.id,
      executionId: second.executionId,
      actorUid: "admin-1",
      nowMs: NOW + 5,
      authorization: authorizationFor(second),
    });
    expect(secondClaim.status).toBe("claimed");
    await store.markOutcome(second.executionId, "ambiguous", NOW + 6);
    expect(
      (
        await store.claim({
          previewHash: second.id,
          executionId: second.executionId,
          actorUid: "admin-1",
          nowMs: NOW + 7,
          authorization: authorizationFor(second),
        })
      ).status,
    ).toBe("ambiguous");
  });

  it("requires an exact predecessor before advancing the run/source head", async () => {
    const store = new MemorySheetWritebackExecutionStore();
    const first = preview();
    await store.createPreview(first);
    await expect(
      store.claim({
        previewHash: first.id,
        executionId: first.executionId,
        actorUid: "admin-1",
        nowMs: NOW + 1,
        authorization: authorizationFor(first),
      }),
    ).resolves.toMatchObject({ status: "claimed" });

    const missingPredecessor = preview({
      proposedValue: "1400",
      nonce: "missing-predecessor",
    });
    await store.createPreview(missingPredecessor);
    await expect(
      store.claim({
        previewHash: missingPredecessor.id,
        executionId: missingPredecessor.executionId,
        actorUid: "admin-1",
        nowMs: NOW + 2,
        authorization: authorizationFor(missingPredecessor),
      }),
    ).resolves.toMatchObject({ status: "mismatch" });

    const expectedSuccessor = preview({
      proposedValue: "1500",
      predecessorExecutionId: first.executionId,
      nonce: "expected-predecessor",
    });
    await store.createPreview(expectedSuccessor);
    await expect(
      store.claim({
        previewHash: expectedSuccessor.id,
        executionId: expectedSuccessor.executionId,
        actorUid: "admin-1",
        nowMs: NOW + 3,
        authorization: authorizationFor(expectedSuccessor),
      }),
    ).resolves.toMatchObject({
      status: "claimed",
      record: {
        predecessorExecutionId: first.executionId,
      },
    });

    const staleFork = preview({
      proposedValue: "1600",
      predecessorExecutionId: first.executionId,
      nonce: "stale-predecessor",
    });
    await store.createPreview(staleFork);
    await expect(
      store.claim({
        previewHash: staleFork.id,
        executionId: staleFork.executionId,
        actorUid: "admin-1",
        nowMs: NOW + 4,
        authorization: authorizationFor(staleFork),
      }),
    ).resolves.toMatchObject({ status: "mismatch" });
    await expect(
      store.getLatestExecution({
        runId: first.binding.runId,
        sourceTriggerKey: first.binding.sourceTriggerKey,
      }),
    ).resolves.toMatchObject({ id: expectedSuccessor.executionId });
  });

  it("keeps global one-attempt identity while refusing a different actor's preview", async () => {
    const store = new MemorySheetWritebackExecutionStore();
    const firstActor = preview();
    const secondActor = preview({ actorUid: "admin-2", nonce: "nonce-2" });
    expect(secondActor.executionId).toBe(firstActor.executionId);
    await store.createPreview(firstActor);
    await store.createPreview(secondActor);

    const claimed = await store.claim({
      previewHash: firstActor.id,
      executionId: firstActor.executionId,
      actorUid: "admin-1",
      nowMs: NOW + 1,
      authorization: authorizationFor(firstActor),
    });
    expect(claimed.status).toBe("claimed");
    await expect(
      store.claim({
        previewHash: secondActor.id,
        executionId: secondActor.executionId,
        actorUid: "admin-2",
        nowMs: NOW + 2,
        authorization: authorizationFor(secondActor),
      }),
    ).resolves.toMatchObject({ status: "mismatch" });
  });

  it("requires an exact, still-current claim authorization", async () => {
    let authorizationCurrent = true;
    const store = new MemorySheetWritebackExecutionStore(() => authorizationCurrent);
    const prepared = preview();
    const authorization = authorizationFor(prepared);
    await store.createPreview(prepared);

    await expect(
      store.claim({
        previewHash: prepared.id,
        executionId: prepared.executionId,
        actorUid: prepared.binding.actorUid,
        nowMs: NOW + 1,
      }),
    ).resolves.toMatchObject({ status: "mismatch" });

    for (const drift of [
      { propertyKey: "wrong-property" },
      { fieldKey: "wrong-field" },
      { approvalVersion: "2026-07-29T23:59:59.000Z" },
      { sourceOfValue: "Google Sheet" },
      { proposedValueHash: "f".repeat(64) },
    ]) {
      await expect(
        store.claim({
          previewHash: prepared.id,
          executionId: prepared.executionId,
          actorUid: prepared.binding.actorUid,
          nowMs: NOW + 1,
          authorization: { ...authorization, ...drift },
        }),
      ).resolves.toMatchObject({ status: "mismatch" });
    }

    authorizationCurrent = false;
    await expect(
      store.claim({
        previewHash: prepared.id,
        executionId: prepared.executionId,
        actorUid: prepared.binding.actorUid,
        nowMs: NOW + 1,
        authorization,
      }),
    ).resolves.toMatchObject({ status: "mismatch" });
    expect(await store.getExecution(prepared.executionId)).toBeNull();
  });

  it("refuses expired, wrong-actor, and mismatched execution claims", async () => {
    const store = new MemorySheetWritebackExecutionStore();
    const prepared = preview();
    const authorization = authorizationFor(prepared);
    await store.createPreview(prepared);
    await expect(
      store.claim({
        previewHash: prepared.id,
        executionId: prepared.executionId,
        actorUid: "other-admin",
        nowMs: NOW + 1,
        authorization,
      }),
    ).resolves.toMatchObject({ status: "mismatch" });
    await expect(
      store.claim({
        previewHash: prepared.id,
        executionId: "sheet_write_forged",
        actorUid: "admin-1",
        nowMs: NOW + 1,
        authorization,
      }),
    ).resolves.toMatchObject({ status: "mismatch" });
    await expect(
      store.claim({
        previewHash: prepared.id,
        executionId: prepared.executionId,
        actorUid: "admin-1",
        nowMs: prepared.expiresAtMs,
        authorization,
      }),
    ).resolves.toMatchObject({ status: "expired" });
  });

  it("makes correction a separate immutable one-attempt action tied to a successful receipt", () => {
    const prepared = preview();
    const original: SheetWritebackExecutionRecord = {
      id: prepared.executionId,
      actionKey: "google_sheets.renewal_checklist.writeback",
      operation: "write",
      bindingHash: prepared.bindingHash,
      actorUid: prepared.binding.actorUid,
      runId: prepared.binding.runId,
      sourceTriggerKey: prepared.binding.sourceTriggerKey,
      propertyKey: prepared.binding.propertyKey,
      fieldKey: prepared.binding.fieldKey,
      approvalId: prepared.binding.approvalId,
      approvalVersion: prepared.binding.approvalVersion,
      sourceOfValue: prepared.binding.sourceOfValue,
      descriptor: prepared.binding.descriptor,
      target: prepared.binding.target,
      proposedValueHash: prepared.binding.proposedValueHash,
      previewHash: prepared.id,
      state: "succeeded",
      attemptCount: 1,
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
    };
    original.receipt = buildSheetWritebackReceipt(original, providerEffect());

    const correction = buildSheetWritebackCorrectionPreview({
      actorUid: "admin-2",
      descriptor: original.descriptor,
      original,
      target: {
        ...original.target,
        a1: "Renewals!D3",
        rowIndex: 2,
        anchorColumnCount: 4,
      },
      predecessorExecutionId: "sheet_write_newer_head",
      nowMs: NOW + 10,
      nonce: "correction-nonce",
    });

    expect(correction.binding).toMatchObject({
      operation: "correction",
      propertyKey: original.propertyKey,
      fieldKey: original.fieldKey,
      sourceOfValue: original.sourceOfValue,
      predecessorExecutionId: "sheet_write_newer_head",
      originalExecutionId: original.id,
      proposedValueHash: original.proposedValueHash,
      target: { a1: "Renewals!D3", rowIndex: 2 },
    });
    expect(correction.executionId).not.toBe(original.id);
    expect(() =>
      buildSheetWritebackCorrectionPreview({
        actorUid: "admin-2",
        descriptor: original.descriptor,
        original,
        target: {
          ...original.target,
          rowAnchorHash: "b".repeat(64),
        },
        nowMs: NOW + 20,
      }),
    ).toThrow("preserve the original row identity");
  });
});
