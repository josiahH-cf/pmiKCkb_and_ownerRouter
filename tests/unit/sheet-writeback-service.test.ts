import { afterEach, describe, expect, it, vi } from "vitest";

const runtimeSuspension = vi.hoisted(() => ({
  current: { status: "clear" } as { status: string },
  read: vi.fn(),
}));
vi.mock("@/lib/firestore/runtime-action-suspensions", () => ({
  readRuntimeActionSuspension: runtimeSuspension.read.mockImplementation(
    async () => runtimeSuspension.current,
  ),
}));

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  EnvironmentContextError,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import type {
  LeaseRenewalResolutionRecord,
  LeaseRenewalWritebackApprovalRecord,
} from "@/lib/firestore/types";
import type {
  SheetsAnchoredCellReference,
  SheetsAnchoredMutationResult,
  SheetsAnchoredMutationStatus,
  SheetsValuesWriter,
} from "@/lib/google-sheets/write-client";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  ActionNotExecutableError,
  isActionExecutable,
} from "@/lib/integrations/action-gate";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import type { RenewalRunResult } from "@/lib/lease-renewal/pipeline";
import {
  MemorySheetWritebackExecutionStore,
  sheetWritebackProviderPayloadHash,
  type SheetWritebackPreviewRecord,
} from "@/lib/lease-renewal/sheet-writeback-contract";
import { inspectAnchoredWritebackTarget } from "@/lib/lease-renewal/sheet-writeback-execution";
import {
  hashSheetCellValue,
  SHEET_WRITEBACK_FLAG,
} from "@/lib/lease-renewal/sheet-writeback-policy";
import {
  RENEWAL_SHEET_WRITEBACK_ACTION_KEY,
  SHEET_WRITEBACK_RUNNING_RECONCILE_DELAY_MS,
  SheetWritebackContractError,
  prepareOrCommitWriteback,
  type WritebackExecuteDeps,
  type WritebackExecuteInput,
  type WritebackExecutionContext,
} from "@/lib/lease-renewal/sheet-writeback-service";
import { ActionRuntimeSuspendedError } from "@/lib/operations/runtime-suspension-gate";

const READ_TS = "2026-07-30T00:00:00.000Z";
const RUN_ID = "live-review";
const KEY = "lease_renewal:reconcile:live-review:current_rent";
const START_MS = Date.parse(READ_TS);

const admin = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
} as AuthenticatedUser;
const peerAdmin = {
  ...admin,
  uid: "admin-2",
  email: "peer-admin@pmikcmetro.com",
} as AuthenticatedUser;

function parseA1(range: string): { row: number; col: number } {
  const cell = range.split("!")[1] ?? range;
  const match = /^([A-Z]+)(\d+)$/.exec(cell);
  if (!match) throw new Error(`bad A1: ${range}`);
  let col = 0;
  for (const ch of match[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(match[2]) - 1, col: col - 1 };
}

class FakeWriter implements SheetsValuesWriter {
  readonly updates: { range: string; values: string[][] }[] = [];
  readonly clears: string[] = [];
  getCalls = 0;
  throwAfterUpdate = false;
  throwAfterClear = false;
  persistUpdate = true;
  persistClear = true;
  valueBeforeConditionalWrite: string | null = null;
  valueBeforeConditionalClear: string | null = null;
  beforeConditionalWrite: (() => void) | null = null;
  afterConditionalWrite: (() => void) | null = null;
  readonly providerStatuses = new Map<
    string,
    { payloadHash: string; status: SheetsAnchoredMutationStatus }
  >();
  readonly logicalEffectIds = new Map<string, string>();
  private externalEffectGeneration = 0;

  constructor(public grid: string[][]) {}

  async getValues(_id: string, range: string): Promise<string[][]> {
    this.getCalls += 1;
    if (range.includes("!")) {
      const { row, col } = parseA1(range);
      return [[this.grid[row]?.[col] ?? ""]];
    }
    return this.grid.map((row) => [...row]);
  }

  async updateValues(_id: string, range: string, values: string[][]): Promise<void> {
    this.updates.push({ range, values });
    if (this.persistUpdate) {
      const { row, col } = parseA1(range);
      this.grid[row][col] = values[0][0];
    }
    if (this.throwAfterUpdate) throw new Error("ambiguous transport");
  }

  async writeValuesIfEmpty(_id: string, range: string, value: string): Promise<boolean> {
    this.updates.push({ range, values: [[value]] });
    this.beforeConditionalWrite?.();
    const { row, col } = parseA1(range);
    if (this.valueBeforeConditionalWrite !== null) {
      this.grid[row][col] = this.valueBeforeConditionalWrite;
    }
    if ((this.grid[row]?.[col] ?? "") !== "") return false;
    if (this.persistUpdate) this.grid[row][col] = value;
    this.afterConditionalWrite?.();
    if (this.throwAfterUpdate) throw new Error("ambiguous transport");
    return true;
  }

  async clearValuesIfExactMatch(
    _id: string,
    range: string,
    expectedValue: string,
  ): Promise<boolean> {
    this.clears.push(range);
    const { row, col } = parseA1(range);
    if (this.valueBeforeConditionalClear !== null) {
      this.grid[row][col] = this.valueBeforeConditionalClear;
    }
    if (this.grid[row]?.[col] !== expectedValue) return false;
    if (this.persistClear) this.grid[row][col] = "";
    if (this.throwAfterClear) throw new Error("ambiguous clear transport");
    return true;
  }

  async mutateAnchoredCellIfMatch(input: {
    idempotencyKey: string;
    payloadHash: string;
    target: SheetsAnchoredCellReference;
    expectedValue: string;
    replacementValue: string;
    expectedEffectId?: string;
  }): Promise<SheetsAnchoredMutationResult> {
    const prior = this.providerStatuses.get(input.idempotencyKey);
    if (prior) {
      if (prior.payloadHash !== input.payloadHash) {
        return { status: "mismatch", reason: "idempotency payload changed" };
      }
      if (prior.status.status === "applied") return prior.status;
      return { status: "mismatch", reason: prior.status.reason };
    }
    const clearing = input.replacementValue === "";
    if (clearing) {
      this.clears.push(input.target.a1);
      const { row, col } = parseA1(input.target.a1);
      if (this.valueBeforeConditionalClear !== null) {
        this.grid[row][col] = this.valueBeforeConditionalClear;
      }
    } else {
      this.updates.push({
        range: input.target.a1,
        values: [[input.replacementValue]],
      });
      this.beforeConditionalWrite?.();
      const { row, col } = parseA1(input.target.a1);
      if (this.valueBeforeConditionalWrite !== null) {
        this.grid[row][col] = this.valueBeforeConditionalWrite;
      }
    }
    const anchored = await inspectAnchoredWritebackTarget(
      this,
      input.target.spreadsheetId,
      input.target,
    );
    if (anchored.status !== "resolved") {
      this.providerStatuses.set(input.idempotencyKey, {
        payloadHash: input.payloadHash,
        status: {
          status: "not_applied",
          reason: "the logical row or exact A1 moved",
        },
      });
      return { status: "mismatch", reason: "the logical row or exact A1 moved" };
    }
    if (anchored.currentValue !== input.expectedValue) {
      this.providerStatuses.set(input.idempotencyKey, {
        payloadHash: input.payloadHash,
        status: {
          status: "not_applied",
          reason: "the exact cell value changed",
        },
      });
      return { status: "mismatch", reason: "the exact cell value changed" };
    }
    const logicalTarget = this.logicalTargetKey(input.target);
    if (clearing && this.valueBeforeConditionalClear !== null) {
      this.logicalEffectIds.set(
        logicalTarget,
        `external:${++this.externalEffectGeneration}`,
      );
    }
    if (
      input.expectedEffectId !== undefined &&
      this.logicalEffectIds.get(logicalTarget) !== input.expectedEffectId
    ) {
      this.providerStatuses.set(input.idempotencyKey, {
        payloadHash: input.payloadHash,
        status: {
          status: "not_applied",
          reason: "the receipted provider effect changed",
        },
      });
      return { status: "mismatch", reason: "the receipted provider effect changed" };
    }
    const { row, col } = parseA1(input.target.a1);
    const persistEffect = clearing ? this.persistClear : this.persistUpdate;
    if (persistEffect) {
      this.grid[row][col] = input.replacementValue;
    }
    if (!persistEffect) {
      const status: SheetsAnchoredMutationStatus = {
        status: "not_applied",
        reason: "the provider terminally refused before applying",
      };
      this.providerStatuses.set(input.idempotencyKey, {
        payloadHash: input.payloadHash,
        status,
      });
      if ((clearing && this.throwAfterClear) || (!clearing && this.throwAfterUpdate)) {
        throw new Error("ambiguous transport before provider refusal arrived");
      }
      return { status: "mismatch", reason: status.reason };
    }
    const effect: Extract<SheetsAnchoredMutationResult, { status: "applied" }> = {
      status: "applied",
      a1: input.target.a1,
      effectId: `effect:${input.idempotencyKey}`,
      appliedAt: new Date(START_MS + 1_000).toISOString(),
      resultHash: hashExecutionPreview({
        idempotencyKey: input.idempotencyKey,
        payloadHash: input.payloadHash,
        a1: input.target.a1,
      }),
    };
    this.providerStatuses.set(input.idempotencyKey, {
      payloadHash: input.payloadHash,
      status: effect,
    });
    this.logicalEffectIds.set(logicalTarget, effect.effectId);
    if (!clearing) this.afterConditionalWrite?.();
    if (clearing && this.throwAfterClear) {
      throw new Error("ambiguous clear transport");
    }
    if (!clearing && this.throwAfterUpdate) {
      throw new Error("ambiguous transport");
    }
    return effect;
  }

  async getAnchoredMutationStatus(input: {
    idempotencyKey: string;
    payloadHash: string;
    target: SheetsAnchoredCellReference;
  }): Promise<SheetsAnchoredMutationStatus> {
    const entry = this.providerStatuses.get(input.idempotencyKey);
    if (!entry) {
      return { status: "unknown", reason: "the provider has no terminal record" };
    }
    if (entry.payloadHash !== input.payloadHash) {
      return { status: "unknown", reason: "the idempotency payload changed" };
    }
    return structuredClone(entry.status);
  }

  async tombstoneAnchoredMutationIfAbsent(input: {
    idempotencyKey: string;
    payloadHash: string;
    target: SheetsAnchoredCellReference;
  }): Promise<SheetsAnchoredMutationStatus> {
    const entry = this.providerStatuses.get(input.idempotencyKey);
    if (entry) {
      if (entry.payloadHash !== input.payloadHash) {
        return { status: "unknown", reason: "the idempotency payload changed" };
      }
      return structuredClone(entry.status);
    }
    const status: SheetsAnchoredMutationStatus = {
      status: "not_applied",
      reason: "the absent provider key was atomically tombstoned",
    };
    this.providerStatuses.set(input.idempotencyKey, {
      payloadHash: input.payloadHash,
      status,
    });
    return status;
  }

  private logicalTargetKey(target: SheetsAnchoredCellReference): string {
    return [
      target.spreadsheetId,
      target.tabName,
      target.proposedColumnHeader,
      target.rowAnchorHash,
    ].join("|");
  }
}

function grid(kb = ""): string[][] {
  return [
    ["Address", "Tenant", "KB Proposed — Current rent"],
    ["4821 Maple", "Delgado", kb],
    ["1207 Walnut", "Carter", ""],
  ];
}

function runWithFlag(
  overrides: { tab?: string; rowIndex?: number; fieldLabel?: string } = {},
): RenewalRunResult {
  return {
    flags: [
      {
        propertyKey: "4821 maple",
        fieldKey: "current_rent",
        fieldLabel: overrides.fieldLabel ?? "Current rent",
        recordRef: {
          tab: overrides.tab ?? "Lease Renewal",
          sourceRowIndex: overrides.rowIndex ?? 1,
          column: "current_rent",
        },
        queueMapping: { queueItem: { source_trigger_key: KEY } },
      },
    ],
  } as unknown as RenewalRunResult;
}

function approval(
  overrides: Partial<LeaseRenewalWritebackApprovalRecord> = {},
): LeaseRenewalWritebackApprovalRecord {
  return {
    id: "approval-1",
    source_trigger_key: KEY,
    run_id: RUN_ID,
    property_key: "4821 maple",
    field_key: "current_rent",
    field_label: "Current rent",
    severity: "Medium",
    state: "Approved",
    proposed_value: "1300",
    source_of_value: "RentVine",
    reason: "Approved current rent.",
    decided_by_uid: admin.uid,
    production_allowed: false,
    executed: false,
    created_at: "2026-07-29T23:00:00.000Z",
    updated_at: "2026-07-29T23:30:00.000Z",
    ...overrides,
  };
}

function resolution(
  overrides: Partial<LeaseRenewalResolutionRecord> = {},
): LeaseRenewalResolutionRecord {
  return {
    id: "resolution-1",
    source_trigger_key: KEY,
    run_id: RUN_ID,
    property_key: "4821 maple",
    field_key: "current_rent",
    field_label: "Current rent",
    severity: "Medium",
    status: "Resolved",
    proposed_writeback: {
      field_key: "current_rent",
      value: "1300",
      source_of_value: "RentVine",
      status: "Queued",
      production_allowed: false,
    },
    created_at: "2026-07-29T22:00:00.000Z",
    updated_at: "2026-07-29T22:30:00.000Z",
    ...overrides,
  };
}

function claimAuthorization(preview: SheetWritebackPreviewRecord) {
  return {
    sourceTriggerKey: preview.binding.sourceTriggerKey,
    runId: preview.binding.runId,
    propertyKey: preview.binding.propertyKey,
    fieldKey: preview.binding.fieldKey,
    approvalId: preview.binding.approvalId,
    approvalVersion: preview.binding.approvalVersion,
    sourceOfValue: preview.binding.sourceOfValue,
    proposedValueHash: preview.binding.proposedValueHash,
  };
}

function harness(overrides: Partial<WritebackExecuteDeps> = {}) {
  const writer = new FakeWriter(grid());
  const store = new MemorySheetWritebackExecutionStore();
  let nowMs = START_MS;
  let nonce = 0;
  const supportsStableRowAtomicMutation = vi.fn(
    () =>
      typeof writer.mutateAnchoredCellIfMatch === "function" &&
      typeof writer.getAnchoredMutationStatus === "function" &&
      typeof writer.tombstoneAnchoredMutationIfAbsent === "function",
  );
  const createWriter = vi.fn(() => writer);
  const rebuildRun = vi.fn(async () => runWithFlag());
  const loadApproval = vi.fn(async () => approval());
  const loadResolution = vi.fn(async () => resolution());
  const deps: WritebackExecuteDeps = {
    supportsStableRowAtomicMutation,
    rebuildRun,
    loadApproval,
    loadResolution,
    createWriter,
    store,
    spreadsheetId: "sheet-1",
    now: () => new Date(nowMs),
    nonce: () => `nonce-${++nonce}`,
    ...overrides,
  };
  return {
    deps,
    writer,
    store,
    supportsStableRowAtomicMutation,
    createWriter,
    rebuildRun,
    loadApproval,
    loadResolution,
    advance(ms: number) {
      nowMs += ms;
    },
  };
}

const productionDescriptor: EnvironmentDescriptor = {
  environmentKind: "production",
  dataContext: "live",
  source: "explicit",
};

function openRegistry(): CreateActionRegistryInput[] {
  const committed = ACTION_REGISTRY_SEED.find(
    (entry) => entry.key === RENEWAL_SHEET_WRITEBACK_ACTION_KEY,
  );
  if (!committed) throw new Error("Expected the committed Sheet write-back entry.");
  return [
    {
      ...committed,
      readiness: "Approved for Execution",
      evidence_status: "Documented",
      production_allowed: true,
    },
  ];
}

function context(
  descriptor: EnvironmentDescriptor = productionDescriptor,
): WritebackExecutionContext {
  const registry = openRegistry();
  if (!isActionExecutable(RENEWAL_SHEET_WRITEBACK_ACTION_KEY, registry)) {
    throw new Error("The test registry must open only the Sheet write-back key.");
  }
  return { descriptor, registry };
}

function writeInput(
  overrides: Partial<WritebackExecuteInput> = {},
): WritebackExecuteInput {
  return {
    runId: RUN_ID,
    sourceTriggerKey: KEY,
    operation: "write",
    confirm: false,
    ...overrides,
  };
}

function enable() {
  process.env[SHEET_WRITEBACK_FLAG] = "true";
}

afterEach(() => {
  delete process.env[SHEET_WRITEBACK_FLAG];
  runtimeSuspension.current = { status: "clear" };
});

async function prepare(h = harness(), actor = admin) {
  const outcome = await prepareOrCommitWriteback(
    actor,
    writeInput(),
    READ_TS,
    h.deps,
    context(),
  );
  expect(outcome.status).toBe("resolved");
  if (outcome.status !== "resolved") throw new Error("Expected a write preview.");
  return { h, outcome };
}

describe("Sheet write-back immutable action contract", () => {
  // S51_DYNAMIC_REFUSAL:sheet-preview-writeback-writer
  it.each(["action_suspended", "global_suspended", "unreadable"])(
    "does not construct Sheets for write preview when runtime state is %s",
    async (status) => {
      enable();
      const h = harness();
      runtimeSuspension.current = { status };
      try {
        await expect(
          prepareOrCommitWriteback(admin, writeInput(), READ_TS, h.deps, context()),
        ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);
        expect(h.createWriter).not.toHaveBeenCalled();
        expect(h.store.previews.size).toBe(0);
      } finally {
        runtimeSuspension.current = { status: "clear" };
      }
    },
  );

  // S51_DYNAMIC_REFUSAL:sheet-commit-writeback-writer
  it.each(["action_suspended", "global_suspended", "unreadable"])(
    "does not reconstruct Sheets for write commit when runtime state is %s",
    async (status) => {
      enable();
      const { h, outcome } = await prepare();
      h.createWriter.mockClear();
      runtimeSuspension.current = { status };
      try {
        await expect(
          prepareOrCommitWriteback(
            admin,
            writeInput({
              confirm: true,
              executionId: outcome.preview.executionId,
              previewHash: outcome.preview.hash,
            }),
            READ_TS,
            h.deps,
            context(),
          ),
        ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);
        expect(h.createWriter).not.toHaveBeenCalled();
        expect(h.writer.updates).toHaveLength(0);
      } finally {
        runtimeSuspension.current = { status: "clear" };
      }
    },
  );

  // S51_DYNAMIC_REFUSAL:sheet-preview-correction-writer
  it.each(["action_suspended", "global_suspended", "unreadable"])(
    "does not reconstruct Sheets for correction preview when runtime state is %s",
    async (status) => {
      enable();
      const { h, outcome } = await prepare();
      await prepareOrCommitWriteback(
        admin,
        writeInput({
          confirm: true,
          executionId: outcome.preview.executionId,
          previewHash: outcome.preview.hash,
        }),
        READ_TS,
        h.deps,
        context(),
      );
      h.createWriter.mockClear();
      runtimeSuspension.current = { status };
      try {
        await expect(
          prepareOrCommitWriteback(
            admin,
            writeInput({
              operation: "correction",
              executionId: outcome.preview.executionId,
            }),
            READ_TS,
            h.deps,
            context(),
          ),
        ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);
        expect(h.createWriter).not.toHaveBeenCalled();
        expect(h.writer.clears).toHaveLength(0);
      } finally {
        runtimeSuspension.current = { status: "clear" };
      }
    },
  );

  // S51_DYNAMIC_REFUSAL:sheet-commit-correction-writer
  it.each(["action_suspended", "global_suspended", "unreadable"])(
    "does not reconstruct Sheets for correction commit when runtime state is %s",
    async (status) => {
      enable();
      const { h, outcome } = await prepare();
      await prepareOrCommitWriteback(
        admin,
        writeInput({
          confirm: true,
          executionId: outcome.preview.executionId,
          previewHash: outcome.preview.hash,
        }),
        READ_TS,
        h.deps,
        context(),
      );
      const correction = await prepareOrCommitWriteback(
        admin,
        writeInput({
          operation: "correction",
          executionId: outcome.preview.executionId,
        }),
        READ_TS,
        h.deps,
        context(),
      );
      if (correction.status !== "correction_resolved") {
        throw new Error("Expected correction preview.");
      }
      h.createWriter.mockClear();
      runtimeSuspension.current = { status };
      try {
        await expect(
          prepareOrCommitWriteback(
            admin,
            writeInput({
              operation: "correction",
              confirm: true,
              executionId: correction.preview.executionId,
              previewHash: correction.preview.hash,
            }),
            READ_TS,
            h.deps,
            context(),
          ),
        ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);
        expect(h.createWriter).not.toHaveBeenCalled();
        expect(h.writer.clears).toHaveLength(0);
      } finally {
        runtimeSuspension.current = { status: "clear" };
      }
    },
  );

  it("issues an expiring server preview without writing or persisting a cell body", async () => {
    enable();
    const { h, outcome } = await prepare();

    expect(outcome.target).toEqual({
      a1: "Lease Renewal!C2",
      proposedColumnHeader: "KB Proposed — Current rent",
      proposedValue: "1300",
      rowValues: ["4821 Maple", "Delgado", ""],
    });
    expect(outcome.preview.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(outcome.preview.executionId).toMatch(/^sheet_write_[a-f0-9]{48}$/);
    expect(Date.parse(outcome.preview.expiresAt)).toBeGreaterThan(START_MS);
    expect(h.writer.updates).toHaveLength(0);
    expect(h.supportsStableRowAtomicMutation).toHaveBeenCalledTimes(1);
    expect(h.createWriter).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await h.store.getPreview(outcome.preview.hash))).not.toContain(
      "1300",
    );
  });

  it("commits only the exact preview, reads back, and persists a bodyless receipt", async () => {
    enable();
    const { h, outcome } = await prepare();
    const committed = await prepareOrCommitWriteback(
      admin,
      writeInput({
        confirm: true,
        executionId: outcome.preview.executionId,
        previewHash: outcome.preview.hash,
      }),
      READ_TS,
      h.deps,
      context(),
    );

    expect(committed.status).toBe("written");
    if (committed.status !== "written") return;
    expect(committed).toMatchObject({
      a1: "Lease Renewal!C2",
      duplicate: false,
      receipt: {
        operation: "write",
        outcome: "written",
        reconciled: false,
      },
    });
    expect(h.writer.updates).toEqual([{ range: "Lease Renewal!C2", values: [["1300"]] }]);
    expect(JSON.stringify(committed.receipt)).not.toContain("1300");
    expect(await h.store.getExecution(outcome.preview.executionId)).toMatchObject({
      attemptCount: 1,
      state: "succeeded",
      receipt: committed.receipt,
    });
  });

  it("preserves the exact nonempty approved raw value through preview, hash, and provider mutation", async () => {
    enable();
    const rawValue = " 1300 ";
    const h = harness({
      loadApproval: async () => approval({ proposed_value: rawValue }),
      loadResolution: async () =>
        resolution({
          proposed_writeback: {
            field_key: "current_rent",
            value: rawValue,
            source_of_value: "RentVine",
            status: "Queued",
            production_allowed: false,
          },
        }),
    });
    const { outcome } = await prepare(h);
    const persistedPreview = await h.store.getPreview(outcome.preview.hash);

    expect(outcome.target.proposedValue).toBe(rawValue);
    expect(persistedPreview?.binding.proposedValueHash).toBe(
      hashSheetCellValue(rawValue),
    );
    const committed = await prepareOrCommitWriteback(
      admin,
      writeInput({
        confirm: true,
        executionId: outcome.preview.executionId,
        previewHash: outcome.preview.hash,
      }),
      READ_TS,
      h.deps,
      context(),
    );

    expect(committed.status).toBe("written");
    expect(h.writer.updates).toEqual([
      { range: "Lease Renewal!C2", values: [[rawValue]] },
    ]);
    expect(h.writer.grid[1][2]).toBe(rawValue);
  });

  it("rejects an all-whitespace approved raw value before previewing", async () => {
    enable();
    const whitespace = " \t ";
    const h = harness({
      loadApproval: async () => approval({ proposed_value: whitespace }),
      loadResolution: async () =>
        resolution({
          proposed_writeback: {
            field_key: "current_rent",
            value: whitespace,
            source_of_value: "RentVine",
            status: "Queued",
            production_allowed: false,
          },
        }),
    });

    await expect(
      prepareOrCommitWriteback(admin, writeInput(), READ_TS, h.deps, context()),
    ).resolves.toEqual({
      status: "not_approved",
      reason: "The approved proposal has no value to write.",
    });
    expect(h.createWriter).not.toHaveBeenCalled();
    expect(h.store.previews.size).toBe(0);
  });

  it("rejects surrounding-whitespace drift between preview and confirmation", async () => {
    enable();
    const { h, outcome } = await prepare();
    const driftedValue = " 1300 ";
    h.deps.loadApproval = async () => approval({ proposed_value: driftedValue });
    h.deps.loadResolution = async () =>
      resolution({
        proposed_writeback: {
          field_key: "current_rent",
          value: driftedValue,
          source_of_value: "RentVine",
          status: "Queued",
          production_allowed: false,
        },
      });
    const writerCalls = h.createWriter.mock.calls.length;

    await expect(
      prepareOrCommitWriteback(
        admin,
        writeInput({
          confirm: true,
          executionId: outcome.preview.executionId,
          previewHash: outcome.preview.hash,
        }),
        READ_TS,
        h.deps,
        context(),
      ),
    ).rejects.toMatchObject({ code: "preview_stale", status: 409 });
    expect(h.createWriter).toHaveBeenCalledTimes(writerCalls);
    expect(h.writer.updates).toHaveLength(0);
  });

  it("returns the same receipt on an exact duplicate without constructing a writer", async () => {
    enable();
    const { h, outcome } = await prepare();
    const input = writeInput({
      confirm: true,
      executionId: outcome.preview.executionId,
      previewHash: outcome.preview.hash,
    });
    const first = await prepareOrCommitWriteback(
      admin,
      input,
      READ_TS,
      h.deps,
      context(),
    );
    const writerCalls = h.createWriter.mock.calls.length;
    const duplicate = await prepareOrCommitWriteback(
      admin,
      input,
      READ_TS,
      h.deps,
      context(),
    );

    expect(first.status).toBe("written");
    if (first.status !== "written") return;
    expect(duplicate).toEqual({
      ...first,
      duplicate: true,
    });
    expect(h.createWriter).toHaveBeenCalledTimes(writerCalls);
    expect(h.writer.updates).toHaveLength(1);
  });

  it("hydrates the durable receipt for a peer Admin with the flag and mutation key off", async () => {
    enable();
    const { h, outcome } = await prepare();
    const written = await prepareOrCommitWriteback(
      admin,
      writeInput({
        confirm: true,
        executionId: outcome.preview.executionId,
        previewHash: outcome.preview.hash,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    expect(written.status).toBe("written");
    delete process.env[SHEET_WRITEBACK_FLAG];
    const writerCalls = h.createWriter.mock.calls.length;

    const hydrated = await prepareOrCommitWriteback(
      peerAdmin,
      writeInput({ operation: "status" }),
      READ_TS,
      h.deps,
      { descriptor: productionDescriptor },
    );

    expect(hydrated).toMatchObject({
      status: "written",
      duplicate: true,
      receipt: written.status === "written" ? written.receipt : undefined,
    });
    expect(h.createWriter).toHaveBeenCalledTimes(writerCalls);
  });

  it("binds lost-response status to the exact attempted execution, never the lineage head", async () => {
    enable();
    const { h, outcome } = await prepare();
    const written = await prepareOrCommitWriteback(
      admin,
      writeInput({
        confirm: true,
        executionId: outcome.preview.executionId,
        previewHash: outcome.preview.hash,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    expect(written.status).toBe("written");

    const exactUnknown = await prepareOrCommitWriteback(
      peerAdmin,
      writeInput({
        operation: "status",
        executionId: `sheet_write_${"f".repeat(48)}`,
      }),
      READ_TS,
      h.deps,
      { descriptor: productionDescriptor },
    );

    expect(exactUnknown).toEqual({ status: "no_execution" });
  });

  it("rejects confirm:true alone before rebuilding, reading approval, or constructing a writer", async () => {
    enable();
    const h = harness();

    await expect(
      prepareOrCommitWriteback(
        admin,
        writeInput({ confirm: true }),
        READ_TS,
        h.deps,
        context(),
      ),
    ).rejects.toMatchObject({
      code: "confirmation_required",
      status: 409,
    });
    expect(h.rebuildRun).not.toHaveBeenCalled();
    expect(h.loadApproval).not.toHaveBeenCalled();
    expect(h.createWriter).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "wrong actor",
      mutate: async (h: ReturnType<typeof harness>, preview: string) => ({
        actor: { ...admin, uid: "admin-2" } as AuthenticatedUser,
        hash: preview,
        executionId: [...h.store.previews.values()][0].executionId,
      }),
      code: "preview_mismatch",
    },
    {
      label: "forged hash",
      mutate: async (h: ReturnType<typeof harness>) => ({
        actor: admin,
        hash: "f".repeat(64),
        executionId: [...h.store.previews.values()][0].executionId,
      }),
      code: "preview_not_found",
    },
  ])("rejects a $label before constructing a commit writer", async ({ mutate, code }) => {
    enable();
    const { h, outcome } = await prepare();
    const writerCalls = h.createWriter.mock.calls.length;
    const changed = await mutate(h, outcome.preview.hash);
    await expect(
      prepareOrCommitWriteback(
        changed.actor,
        writeInput({
          confirm: true,
          executionId: changed.executionId,
          previewHash: changed.hash,
        }),
        READ_TS,
        h.deps,
        context(),
      ),
    ).rejects.toMatchObject({ code });
    expect(h.createWriter).toHaveBeenCalledTimes(writerCalls);
    expect(h.writer.updates).toHaveLength(0);
  });

  it("rejects an expired preview before rebuilding or constructing a commit writer", async () => {
    enable();
    const { h, outcome } = await prepare();
    const writerCalls = h.createWriter.mock.calls.length;
    h.rebuildRun.mockClear();
    h.advance(10 * 60 * 1_000);

    await expect(
      prepareOrCommitWriteback(
        admin,
        writeInput({
          confirm: true,
          executionId: outcome.preview.executionId,
          previewHash: outcome.preview.hash,
        }),
        READ_TS,
        h.deps,
        context(),
      ),
    ).rejects.toMatchObject({ code: "preview_expired" });
    expect(h.rebuildRun).not.toHaveBeenCalled();
    expect(h.createWriter).toHaveBeenCalledTimes(writerCalls);
  });

  it.each([
    {
      label: "approval version",
      override: {
        loadApproval: async () => approval({ updated_at: "2026-07-30T01:00:00.000Z" }),
      },
    },
    {
      label: "approved value",
      override: {
        loadApproval: async () => approval({ proposed_value: "1400" }),
        loadResolution: async () =>
          resolution({
            proposed_writeback: {
              field_key: "current_rent",
              value: "1400",
              source_of_value: "RentVine",
              status: "Queued",
              production_allowed: false,
            },
          }),
      },
    },
    {
      label: "approved source with the same value",
      override: {
        loadApproval: async () => approval({ source_of_value: "corrected_value" }),
        loadResolution: async () =>
          resolution({
            proposed_writeback: {
              field_key: "current_rent",
              value: "1300",
              source_of_value: "corrected_value",
              status: "Queued",
              production_allowed: false,
            },
          }),
      },
    },
    {
      label: "target row",
      override: { rebuildRun: async () => runWithFlag({ rowIndex: 2 }) },
    },
  ])("rejects $label drift before constructing a commit writer", async ({ override }) => {
    enable();
    const { h, outcome } = await prepare();
    Object.assign(h.deps, override);
    const writerCalls = h.createWriter.mock.calls.length;

    await expect(
      prepareOrCommitWriteback(
        admin,
        writeInput({
          confirm: true,
          executionId: outcome.preview.executionId,
          previewHash: outcome.preview.hash,
        }),
        READ_TS,
        h.deps,
        context(),
      ),
    ).rejects.toMatchObject({ code: "preview_stale" });
    expect(h.createWriter).toHaveBeenCalledTimes(writerCalls);
    expect(h.writer.updates).toHaveLength(0);
  });

  it("rejects descriptor-source drift before constructing a commit writer", async () => {
    enable();
    const { h, outcome } = await prepare();
    const writerCalls = h.createWriter.mock.calls.length;
    const legacyDescriptor: EnvironmentDescriptor = {
      environmentKind: "production",
      dataContext: "live",
      source: "legacy-node-env",
    };

    await expect(
      prepareOrCommitWriteback(
        admin,
        writeInput({
          confirm: true,
          executionId: outcome.preview.executionId,
          previewHash: outcome.preview.hash,
        }),
        READ_TS,
        h.deps,
        context(legacyDescriptor),
      ),
    ).rejects.toMatchObject({ code: "preview_mismatch" });
    expect(h.createWriter).toHaveBeenCalledTimes(writerCalls);
  });

  it("refuses a stale approval/resolution pair before previewing", async () => {
    enable();
    const h = harness({
      loadResolution: async () =>
        resolution({
          proposed_writeback: {
            field_key: "current_rent",
            value: "1400",
            source_of_value: "RentVine",
            status: "Queued",
            production_allowed: false,
          },
        }),
    });
    const outcome = await prepareOrCommitWriteback(
      admin,
      writeInput(),
      READ_TS,
      h.deps,
      context(),
    );
    expect(outcome.status).toBe("not_approved");
    expect(h.createWriter).not.toHaveBeenCalled();
  });

  it("refuses a source-trigger collision across canonical properties", async () => {
    enable();
    const duplicate = runWithFlag();
    const first = duplicate.flags[0]!;
    const h = harness({
      rebuildRun: async () =>
        ({
          ...duplicate,
          flags: [
            first,
            {
              ...first,
              propertyKey: "1207 walnut",
              recordRef: { ...first.recordRef, sourceRowIndex: 2 },
            },
          ],
        }) as RenewalRunResult,
    });

    const outcome = await prepareOrCommitWriteback(
      admin,
      writeInput(),
      READ_TS,
      h.deps,
      context(),
    );

    expect(outcome).toEqual({
      status: "blocked",
      reason:
        "The source trigger does not resolve to exactly one canonical property row. No Sheet preview was created.",
    });
    expect(h.loadApproval).not.toHaveBeenCalled();
    expect(h.loadResolution).not.toHaveBeenCalled();
    expect(h.createWriter).not.toHaveBeenCalled();
    expect(h.store.previews.size).toBe(0);
  });

  it("atomically refuses a cell edit that lands after the commit pre-read", async () => {
    enable();
    const { h, outcome } = await prepare();
    h.writer.valueBeforeConditionalWrite = "intervening";

    await expect(
      prepareOrCommitWriteback(
        admin,
        writeInput({
          confirm: true,
          executionId: outcome.preview.executionId,
          previewHash: outcome.preview.hash,
        }),
        READ_TS,
        h.deps,
        context(),
      ),
    ).rejects.toMatchObject({ code: "preview_stale", status: 409 });
    expect(h.writer.grid[1][2]).toBe("intervening");
    expect(h.writer.updates).toHaveLength(1);
    expect(await h.store.getExecution(outcome.preview.executionId)).toMatchObject({
      state: "failed",
    });
  });

  it.each([
    {
      label: "row insertion",
      mutate(grid: string[][]) {
        grid.splice(1, 0, ["", "", ""]);
      },
    },
    {
      label: "column insertion",
      mutate(grid: string[][]) {
        for (const row of grid) row.splice(2, 0, "");
      },
    },
  ])(
    "atomically refuses a $label before mutating the confirmed logical row",
    async ({ mutate }) => {
      enable();
      const { h, outcome } = await prepare();
      h.writer.beforeConditionalWrite = () => mutate(h.writer.grid);

      await expect(
        prepareOrCommitWriteback(
          admin,
          writeInput({
            confirm: true,
            executionId: outcome.preview.executionId,
            previewHash: outcome.preview.hash,
          }),
          READ_TS,
          h.deps,
          context(),
        ),
      ).rejects.toMatchObject({ code: "preview_stale", status: 409 });

      expect(h.writer.updates).toHaveLength(1);
      expect(h.writer.clears).toHaveLength(0);
      expect(h.writer.grid.flat()).not.toContain("1300");
      expect((await h.store.getExecution(outcome.preview.executionId))?.receipt).toBe(
        undefined,
      );
      expect(await h.store.getExecution(outcome.preview.executionId)).toMatchObject({
        state: "failed",
      });
    },
  );

  it("never mutates or receipts an identical row inserted before the stable-row transaction", async () => {
    enable();
    const { h, outcome } = await prepare();
    h.writer.beforeConditionalWrite = () => {
      h.writer.grid.splice(1, 0, ["4821 Maple", "Delgado", ""]);
    };

    await expect(
      prepareOrCommitWriteback(
        admin,
        writeInput({
          confirm: true,
          executionId: outcome.preview.executionId,
          previewHash: outcome.preview.hash,
        }),
        READ_TS,
        h.deps,
        context(),
      ),
    ).rejects.toMatchObject({ code: "preview_stale", status: 409 });

    expect(h.writer.clears).toHaveLength(0);
    expect(h.writer.grid[1][2]).toBe("");
    expect(h.writer.grid[2][2]).toBe("");
    const execution = await h.store.getExecution(outcome.preview.executionId);
    expect(execution).toMatchObject({ state: "failed" });
    expect(execution?.receipt).toBeUndefined();
  });

  it.each([
    {
      label: "row insertion",
      expectedMovedA1: "Lease Renewal!C3",
      mutate(grid: string[][]) {
        grid.splice(1, 0, ["", "", ""]);
      },
    },
    {
      label: "column insertion",
      expectedMovedA1: "Lease Renewal!D2",
      mutate(grid: string[][]) {
        grid.forEach((row, index) =>
          row.splice(2, 0, index === 0 ? "New audit field" : `audit-${index}`),
        );
      },
    },
  ])(
    "keeps the provider effect coordinate immutable after a post-transaction $label",
    async ({ mutate, expectedMovedA1 }) => {
      enable();
      const { h, outcome } = await prepare();
      h.writer.afterConditionalWrite = () => mutate(h.writer.grid);

      const committed = await prepareOrCommitWriteback(
        admin,
        writeInput({
          confirm: true,
          executionId: outcome.preview.executionId,
          previewHash: outcome.preview.hash,
        }),
        READ_TS,
        h.deps,
        context(),
      );

      expect(h.writer.updates).toHaveLength(1);
      expect(h.writer.clears).toHaveLength(0);
      expect(committed).toMatchObject({
        status: "written",
        a1: "Lease Renewal!C2",
        receipt: {
          attemptedA1: "Lease Renewal!C2",
          verifiedA1: "Lease Renewal!C2",
        },
        readbackWarning: expect.stringContaining("logical row"),
      });
      expect(expectedMovedA1).not.toBe("Lease Renewal!C2");
      const execution = await h.store.getExecution(outcome.preview.executionId);
      expect(execution).toMatchObject({
        state: "succeeded",
        receipt: { verifiedA1: "Lease Renewal!C2" },
      });
    },
  );

  it("blocks preview before any Sheet read when stable-row atomicity is unavailable", async () => {
    enable();
    const h = harness();
    Object.defineProperty(h.writer, "mutateAnchoredCellIfMatch", {
      value: undefined,
    });

    const outcome = await prepareOrCommitWriteback(
      admin,
      writeInput(),
      READ_TS,
      h.deps,
      context(),
    );
    expect(outcome).toEqual({
      status: "blocked",
      reason:
        "The Sheets provider has no stable-row atomic mutation capability. The action key must stay closed.",
    });
    expect(h.supportsStableRowAtomicMutation).toHaveBeenCalledTimes(1);
    expect(h.createWriter).not.toHaveBeenCalled();
    expect(h.rebuildRun).not.toHaveBeenCalled();
    expect(h.loadApproval).not.toHaveBeenCalled();
    expect(h.loadResolution).not.toHaveBeenCalled();
    expect(h.writer.getCalls).toBe(0);
    expect(h.writer.updates).toHaveLength(0);
    expect(h.store.previews.size).toBe(0);
  });

  it("independently blocks commit before live reads or a durable claim when stable-row atomicity disappears", async () => {
    enable();
    const { h, outcome } = await prepare();
    Object.defineProperty(h.writer, "mutateAnchoredCellIfMatch", {
      value: undefined,
    });
    h.rebuildRun.mockClear();
    h.loadApproval.mockClear();
    h.loadResolution.mockClear();
    h.writer.getCalls = 0;

    const committed = await prepareOrCommitWriteback(
      admin,
      writeInput({
        confirm: true,
        executionId: outcome.preview.executionId,
        previewHash: outcome.preview.hash,
      }),
      READ_TS,
      h.deps,
      context(),
    );

    expect(committed).toEqual({
      status: "blocked",
      reason:
        "The Sheets provider has no stable-row atomic mutation capability. The action key must stay closed.",
    });
    expect(h.rebuildRun).not.toHaveBeenCalled();
    expect(h.loadApproval).not.toHaveBeenCalled();
    expect(h.loadResolution).not.toHaveBeenCalled();
    expect(h.writer.getCalls).toBe(0);
    expect(h.writer.updates).toHaveLength(0);
    expect(await h.store.getExecution(outcome.preview.executionId)).toBeNull();
  });

  it("blocks a new approval-version attempt behind an unresolved predecessor head", async () => {
    enable();
    const { h, outcome } = await prepare();
    const preview = await h.store.getPreview(outcome.preview.hash);
    if (!preview) throw new Error("Expected a durable preview.");
    await h.store.claim({
      previewHash: outcome.preview.hash,
      executionId: outcome.preview.executionId,
      actorUid: admin.uid,
      nowMs: START_MS + 1,
      authorization: claimAuthorization(preview),
    });
    await h.store.markOutcome(outcome.preview.executionId, "ambiguous", START_MS + 2);
    h.deps.loadApproval = async () =>
      approval({ updated_at: "2026-07-30T01:00:00.000Z" });
    const writerCalls = h.createWriter.mock.calls.length;

    await expect(
      prepareOrCommitWriteback(admin, writeInput(), READ_TS, h.deps, context()),
    ).rejects.toMatchObject({ code: "attempt_ambiguous", status: 409 });
    expect(h.createWriter).toHaveBeenCalledTimes(writerCalls);
    expect(
      await h.store.getLatestExecution({
        runId: RUN_ID,
        sourceTriggerKey: KEY,
      }),
    ).toMatchObject({ id: outcome.preview.executionId, state: "ambiguous" });

    await h.store.markOutcome(outcome.preview.executionId, "failed", START_MS + 3);
    const successor = await prepareOrCommitWriteback(
      admin,
      writeInput(),
      READ_TS,
      h.deps,
      context(),
    );
    expect(successor.status).toBe("resolved");
    if (successor.status !== "resolved") return;
    expect(successor.preview.executionId).not.toBe(outcome.preview.executionId);
    expect(
      (await h.store.getPreview(successor.preview.hash))?.binding.predecessorExecutionId,
    ).toBe(outcome.preview.executionId);
  });

  it("allows exactly one concurrent commit and never performs a second update", async () => {
    enable();
    const { h, outcome } = await prepare();
    const input = writeInput({
      confirm: true,
      executionId: outcome.preview.executionId,
      previewHash: outcome.preview.hash,
    });
    const results = await Promise.allSettled([
      prepareOrCommitWriteback(admin, input, READ_TS, h.deps, context()),
      prepareOrCommitWriteback(admin, input, READ_TS, h.deps, context()),
    ]);

    expect(h.writer.updates).toHaveLength(1);
    expect(
      results.filter(
        (result) => result.status === "fulfilled" && result.value.status === "written",
      ),
    ).toHaveLength(1);
    expect(
      results.filter(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof SheetWritebackContractError,
      ),
    ).toHaveLength(1);
  });

  it("refuses reconciliation while the provider attempt is still running", async () => {
    enable();
    const { h, outcome } = await prepare();
    const preview = await h.store.getPreview(outcome.preview.hash);
    if (!preview) throw new Error("Expected a durable preview.");
    await h.store.claim({
      previewHash: outcome.preview.hash,
      executionId: outcome.preview.executionId,
      actorUid: admin.uid,
      nowMs: START_MS + 1,
      authorization: claimAuthorization(preview),
    });
    const writerCalls = h.createWriter.mock.calls.length;

    await expect(
      prepareOrCommitWriteback(
        admin,
        writeInput({
          operation: "reconcile",
          executionId: outcome.preview.executionId,
        }),
        READ_TS,
        h.deps,
        context(),
      ),
    ).rejects.toMatchObject({ code: "attempt_in_progress", status: 409 });
    expect(h.createWriter).toHaveBeenCalledTimes(writerCalls);
    expect(h.writer.getCalls).toBe(1);
    expect(h.writer.updates).toHaveLength(0);
  });

  it("atomically tombstones a stale claim that crashed before the provider call", async () => {
    enable();
    const { h, outcome } = await prepare();
    const preview = await h.store.getPreview(outcome.preview.hash);
    if (!preview) throw new Error("Expected a durable preview.");
    await h.store.claim({
      previewHash: outcome.preview.hash,
      executionId: outcome.preview.executionId,
      actorUid: admin.uid,
      nowMs: START_MS + 1,
      authorization: claimAuthorization(preview),
    });
    h.advance(SHEET_WRITEBACK_RUNNING_RECONCILE_DELAY_MS + 2);
    delete process.env[SHEET_WRITEBACK_FLAG];

    await expect(
      prepareOrCommitWriteback(
        peerAdmin,
        writeInput({ operation: "status" }),
        READ_TS,
        h.deps,
        { descriptor: productionDescriptor },
      ),
    ).resolves.toMatchObject({
      status: "needs_reconciliation",
      executionId: outcome.preview.executionId,
    });
    const recovered = await prepareOrCommitWriteback(
      admin,
      writeInput({
        operation: "reconcile",
        executionId: outcome.preview.executionId,
      }),
      READ_TS,
      h.deps,
      context(),
    );

    expect(recovered).toMatchObject({
      status: "absent",
      operation: "write",
      approvalVersion: "2026-07-29T23:30:00.000Z",
    });
    expect(h.writer.updates).toHaveLength(0);
    const record = await h.store.getExecution(outcome.preview.executionId);
    expect(record).toMatchObject({
      state: "failed",
    });
    if (!record) throw new Error("Expected the claimed execution.");
    const providerEntry = h.writer.providerStatuses.get(record.id);
    expect(providerEntry?.status).toMatchObject({ status: "not_applied" });

    const delayedMutation = await h.writer.mutateAnchoredCellIfMatch({
      idempotencyKey: record.id,
      payloadHash: sheetWritebackProviderPayloadHash(record),
      target: record.target,
      expectedValue: "",
      replacementValue: "1300",
    });
    expect(delayedMutation).toMatchObject({
      status: "mismatch",
      reason: "the absent provider key was atomically tombstoned",
    });
    expect(h.writer.updates).toHaveLength(0);
  });

  it("refuses the provider-side absent-key tombstone while runtime suspension is active", async () => {
    enable();
    const { h, outcome } = await prepare();
    const preview = await h.store.getPreview(outcome.preview.hash);
    if (!preview) throw new Error("Expected a durable preview.");
    await h.store.claim({
      previewHash: outcome.preview.hash,
      executionId: outcome.preview.executionId,
      actorUid: admin.uid,
      nowMs: START_MS + 1,
      authorization: claimAuthorization(preview),
    });
    h.advance(SHEET_WRITEBACK_RUNNING_RECONCILE_DELAY_MS + 2);
    const tombstone = vi.spyOn(h.writer, "tombstoneAnchoredMutationIfAbsent");
    runtimeSuspension.current = { status: "global_suspended" };

    await expect(
      prepareOrCommitWriteback(
        admin,
        writeInput({
          operation: "reconcile",
          executionId: outcome.preview.executionId,
        }),
        READ_TS,
        h.deps,
        context(),
      ),
    ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);

    expect(tombstone).not.toHaveBeenCalled();
    expect(h.writer.providerStatuses.has(outcome.preview.executionId)).toBe(false);
    expect(h.writer.updates).toHaveLength(0);
  });

  it("never retries an ambiguous update and reconciles it by read only", async () => {
    enable();
    const h = harness();
    h.writer.throwAfterUpdate = true;
    const { outcome } = await prepare(h);
    const commit = await prepareOrCommitWriteback(
      admin,
      writeInput({
        confirm: true,
        executionId: outcome.preview.executionId,
        previewHash: outcome.preview.hash,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    expect(commit).toMatchObject({
      status: "needs_reconciliation",
      executionId: outcome.preview.executionId,
    });
    expect(h.writer.updates).toHaveLength(1);
    h.writer.throwAfterUpdate = false;
    delete process.env[SHEET_WRITEBACK_FLAG];

    runtimeSuspension.read.mockClear();
    runtimeSuspension.current = { status: "global_suspended" };
    const reconciled = await prepareOrCommitWriteback(
      admin,
      writeInput({
        operation: "reconcile",
        executionId: outcome.preview.executionId,
      }),
      READ_TS,
      h.deps,
      { descriptor: productionDescriptor },
    );
    expect(reconciled).toMatchObject({
      status: "written",
      duplicate: false,
      receipt: { reconciled: true },
    });
    expect(h.writer.updates).toHaveLength(1);
    expect(runtimeSuspension.read).not.toHaveBeenCalled();
  });

  it("concurrent reconcilers converge on one immutable provider-effect receipt", async () => {
    enable();
    const h = harness();
    h.writer.throwAfterUpdate = true;
    const { outcome } = await prepare(h);
    await prepareOrCommitWriteback(
      admin,
      writeInput({
        confirm: true,
        executionId: outcome.preview.executionId,
        previewHash: outcome.preview.hash,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    h.writer.throwAfterUpdate = false;

    const reconcileInput = writeInput({
      operation: "reconcile",
      executionId: outcome.preview.executionId,
    });
    const [first, second] = await Promise.all([
      prepareOrCommitWriteback(admin, reconcileInput, READ_TS, h.deps, context()),
      prepareOrCommitWriteback(peerAdmin, reconcileInput, READ_TS, h.deps, context()),
    ]);

    expect(first.status).toBe("written");
    expect(second.status).toBe("written");
    if (first.status !== "written" || second.status !== "written") return;
    expect(second.receipt).toEqual(first.receipt);
    expect(h.writer.updates).toHaveLength(1);
    expect(await h.store.getExecution(outcome.preview.executionId)).toMatchObject({
      state: "succeeded",
      receipt: first.receipt,
    });
  });

  it("keeps a provider-pending attempt ambiguous and blocks every successor", async () => {
    enable();
    const { h, outcome } = await prepare();
    const preview = await h.store.getPreview(outcome.preview.hash);
    if (!preview) throw new Error("Expected a durable preview.");
    const claim = await h.store.claim({
      previewHash: preview.id,
      executionId: preview.executionId,
      actorUid: admin.uid,
      nowMs: START_MS + 1,
      authorization: claimAuthorization(preview),
    });
    if (claim.status !== "claimed") throw new Error("Expected the claim to win.");
    h.writer.providerStatuses.set(claim.record.id, {
      payloadHash: sheetWritebackProviderPayloadHash(claim.record),
      status: { status: "pending", reason: "provider worker still owns the key" },
    });
    h.advance(SHEET_WRITEBACK_RUNNING_RECONCILE_DELAY_MS + 1);

    const first = await prepareOrCommitWriteback(
      admin,
      writeInput({
        operation: "reconcile",
        executionId: claim.record.id,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    expect(first).toMatchObject({
      status: "needs_reconciliation",
      executionId: claim.record.id,
    });

    h.advance(SHEET_WRITEBACK_RUNNING_RECONCILE_DELAY_MS * 4);
    const second = await prepareOrCommitWriteback(
      peerAdmin,
      writeInput({
        operation: "reconcile",
        executionId: claim.record.id,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    expect(second).toMatchObject({
      status: "needs_reconciliation",
      executionId: claim.record.id,
    });
    h.deps.loadApproval = async () =>
      approval({ updated_at: "2026-07-30T01:00:00.000Z" });
    await expect(
      prepareOrCommitWriteback(admin, writeInput(), READ_TS, h.deps, context()),
    ).rejects.toMatchObject({ code: "attempt_ambiguous" });
    expect(h.writer.updates).toHaveLength(0);
    expect(await h.store.getExecution(claim.record.id)).toMatchObject({
      state: "ambiguous",
    });
  });

  it("reconciliation records a definitively absent write without updating", async () => {
    enable();
    const h = harness();
    h.writer.throwAfterUpdate = true;
    h.writer.persistUpdate = false;
    const { outcome } = await prepare(h);
    await prepareOrCommitWriteback(
      admin,
      writeInput({
        confirm: true,
        executionId: outcome.preview.executionId,
        previewHash: outcome.preview.hash,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    h.writer.throwAfterUpdate = false;
    h.advance(SHEET_WRITEBACK_RUNNING_RECONCILE_DELAY_MS + 1);

    const reconciled = await prepareOrCommitWriteback(
      admin,
      writeInput({
        operation: "reconcile",
        executionId: outcome.preview.executionId,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    expect(reconciled).toMatchObject({
      status: "absent",
      operation: "write",
      approvalVersion: "2026-07-29T23:30:00.000Z",
    });
    expect(h.writer.updates).toHaveLength(1);
  });

  it("previews and confirms one exact correction, then deduplicates it", async () => {
    enable();
    const { h, outcome } = await prepare();
    const written = await prepareOrCommitWriteback(
      admin,
      writeInput({
        confirm: true,
        executionId: outcome.preview.executionId,
        previewHash: outcome.preview.hash,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    expect(written.status).toBe("written");

    const correctionPreview = await prepareOrCommitWriteback(
      peerAdmin,
      writeInput({
        operation: "correction",
        executionId: outcome.preview.executionId,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    expect(correctionPreview.status).toBe("correction_resolved");
    if (correctionPreview.status !== "correction_resolved") return;
    expect(correctionPreview.target.currentValue).toBe("1300");
    const correctionInput = writeInput({
      operation: "correction",
      confirm: true,
      executionId: correctionPreview.preview.executionId,
      previewHash: correctionPreview.preview.hash,
    });
    const corrected = await prepareOrCommitWriteback(
      peerAdmin,
      correctionInput,
      READ_TS,
      h.deps,
      context(),
    );
    expect(corrected).toMatchObject({
      status: "corrected",
      duplicate: false,
      receipt: { operation: "correction", outcome: "corrected" },
    });
    expect(h.writer.clears).toEqual(["Lease Renewal!C2"]);
    const writerCalls = h.createWriter.mock.calls.length;
    const duplicate = await prepareOrCommitWriteback(
      peerAdmin,
      correctionInput,
      READ_TS,
      h.deps,
      context(),
    );
    expect(duplicate).toMatchObject({ status: "corrected", duplicate: true });
    expect(h.createWriter).toHaveBeenCalledTimes(writerCalls);
    expect(h.writer.clears).toHaveLength(1);
  });

  it("blocks correction commit before a Sheet read or durable claim when stable-row atomicity disappears", async () => {
    enable();
    const { h, outcome } = await prepare();
    const written = await prepareOrCommitWriteback(
      admin,
      writeInput({
        confirm: true,
        executionId: outcome.preview.executionId,
        previewHash: outcome.preview.hash,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    expect(written.status).toBe("written");
    const correctionPreview = await prepareOrCommitWriteback(
      peerAdmin,
      writeInput({
        operation: "correction",
        executionId: outcome.preview.executionId,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    expect(correctionPreview.status).toBe("correction_resolved");
    if (correctionPreview.status !== "correction_resolved") return;

    Object.defineProperty(h.writer, "mutateAnchoredCellIfMatch", {
      value: undefined,
    });
    h.writer.getCalls = 0;
    const corrected = await prepareOrCommitWriteback(
      peerAdmin,
      writeInput({
        operation: "correction",
        confirm: true,
        executionId: correctionPreview.preview.executionId,
        previewHash: correctionPreview.preview.hash,
      }),
      READ_TS,
      h.deps,
      context(),
    );

    expect(corrected).toEqual({
      status: "blocked",
      reason:
        "The Sheets provider has no stable-row atomic mutation capability. Correction is unavailable.",
    });
    expect(h.writer.getCalls).toBe(0);
    expect(h.writer.clears).toHaveLength(0);
    expect(await h.store.getExecution(correctionPreview.preview.executionId)).toBeNull();
  });

  it.each([
    {
      label: "row",
      expectedA1: "Lease Renewal!C3",
      mutate(grid: string[][]) {
        grid.splice(1, 0, ["", "", ""]);
      },
    },
    {
      label: "column",
      expectedA1: "Lease Renewal!D2",
      mutate(grid: string[][]) {
        grid.forEach((row, index) =>
          row.splice(2, 0, index === 0 ? "New audit field" : `audit-${index}`),
        );
      },
    },
  ])(
    "reanchors a receipted value after a later $label move and corrects only its new exact cell",
    async ({ mutate, expectedA1 }) => {
      enable();
      const { h, outcome } = await prepare();
      await prepareOrCommitWriteback(
        admin,
        writeInput({
          confirm: true,
          executionId: outcome.preview.executionId,
          previewHash: outcome.preview.hash,
        }),
        READ_TS,
        h.deps,
        context(),
      );
      mutate(h.writer.grid);

      const correctionPreview = await prepareOrCommitWriteback(
        peerAdmin,
        writeInput({
          operation: "correction",
          executionId: outcome.preview.executionId,
        }),
        READ_TS,
        h.deps,
        context(),
      );
      expect(correctionPreview).toMatchObject({
        status: "correction_resolved",
        target: { a1: expectedA1, currentValue: "1300" },
      });
      if (correctionPreview.status !== "correction_resolved") return;

      const corrected = await prepareOrCommitWriteback(
        peerAdmin,
        writeInput({
          operation: "correction",
          confirm: true,
          executionId: correctionPreview.preview.executionId,
          previewHash: correctionPreview.preview.hash,
        }),
        READ_TS,
        h.deps,
        context(),
      );
      expect(corrected).toMatchObject({ status: "corrected", a1: expectedA1 });
      expect(h.writer.clears).toEqual([expectedA1]);
    },
  );

  it("issues a fresh predecessor-bound correction after an absent attempt", async () => {
    enable();
    const { h, outcome } = await prepare();
    await prepareOrCommitWriteback(
      admin,
      writeInput({
        confirm: true,
        executionId: outcome.preview.executionId,
        previewHash: outcome.preview.hash,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    const firstPreview = await prepareOrCommitWriteback(
      admin,
      writeInput({
        operation: "correction",
        executionId: outcome.preview.executionId,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    expect(firstPreview.status).toBe("correction_resolved");
    if (firstPreview.status !== "correction_resolved") return;
    h.writer.persistClear = false;
    h.writer.throwAfterClear = true;
    const firstAttempt = await prepareOrCommitWriteback(
      admin,
      writeInput({
        operation: "correction",
        confirm: true,
        executionId: firstPreview.preview.executionId,
        previewHash: firstPreview.preview.hash,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    expect(firstAttempt).toMatchObject({
      status: "needs_reconciliation",
      operation: "correction",
    });
    h.writer.throwAfterClear = false;
    h.advance(SHEET_WRITEBACK_RUNNING_RECONCILE_DELAY_MS + 1);
    const absent = await prepareOrCommitWriteback(
      peerAdmin,
      writeInput({
        operation: "reconcile",
        executionId: firstPreview.preview.executionId,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    expect(absent).toMatchObject({
      status: "absent",
      operation: "correction",
      approvalVersion: "2026-07-29T23:30:00.000Z",
      originalExecutionId: outcome.preview.executionId,
    });

    const retryOne = await prepareOrCommitWriteback(
      peerAdmin,
      writeInput({
        operation: "correction",
        executionId: outcome.preview.executionId,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    const retryTwo = await prepareOrCommitWriteback(
      peerAdmin,
      writeInput({
        operation: "correction",
        executionId: outcome.preview.executionId,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    expect(retryOne.status).toBe("correction_resolved");
    expect(retryTwo.status).toBe("correction_resolved");
    if (
      retryOne.status !== "correction_resolved" ||
      retryTwo.status !== "correction_resolved"
    ) {
      return;
    }
    expect(retryOne.preview.executionId).toBe(retryTwo.preview.executionId);
    expect(retryOne.preview.executionId).not.toBe(firstPreview.preview.executionId);
    expect(
      (await h.store.getPreview(retryOne.preview.hash))?.binding.predecessorExecutionId,
    ).toBe(firstPreview.preview.executionId);

    h.writer.persistClear = true;
    const results = await Promise.allSettled([
      prepareOrCommitWriteback(
        peerAdmin,
        writeInput({
          operation: "correction",
          confirm: true,
          executionId: retryOne.preview.executionId,
          previewHash: retryOne.preview.hash,
        }),
        READ_TS,
        h.deps,
        context(),
      ),
      prepareOrCommitWriteback(
        peerAdmin,
        writeInput({
          operation: "correction",
          confirm: true,
          executionId: retryTwo.preview.executionId,
          previewHash: retryTwo.preview.hash,
        }),
        READ_TS,
        h.deps,
        context(),
      ),
    ]);
    expect(
      results.filter(
        (result) => result.status === "fulfilled" && result.value.status === "corrected",
      ),
    ).toHaveLength(1);
    expect(h.writer.clears).toHaveLength(2);
  });

  it("refuses correction after an intervening cell change and never clears it", async () => {
    enable();
    const { h, outcome } = await prepare();
    await prepareOrCommitWriteback(
      admin,
      writeInput({
        confirm: true,
        executionId: outcome.preview.executionId,
        previewHash: outcome.preview.hash,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    const correctionPreview = await prepareOrCommitWriteback(
      admin,
      writeInput({
        operation: "correction",
        executionId: outcome.preview.executionId,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    if (correctionPreview.status !== "correction_resolved") return;
    h.writer.grid[1][2] = "intervening";

    await expect(
      prepareOrCommitWriteback(
        admin,
        writeInput({
          operation: "correction",
          confirm: true,
          executionId: correctionPreview.preview.executionId,
          previewHash: correctionPreview.preview.hash,
        }),
        READ_TS,
        h.deps,
        context(),
      ),
    ).rejects.toMatchObject({ code: "correction_unavailable" });
    expect(h.writer.clears).toHaveLength(0);
    expect(h.writer.grid[1][2]).toBe("intervening");
  });

  it("atomically refuses a collaborator edit between correction read and clear", async () => {
    enable();
    const { h, outcome } = await prepare();
    await prepareOrCommitWriteback(
      admin,
      writeInput({
        confirm: true,
        executionId: outcome.preview.executionId,
        previewHash: outcome.preview.hash,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    const correctionPreview = await prepareOrCommitWriteback(
      admin,
      writeInput({
        operation: "correction",
        executionId: outcome.preview.executionId,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    if (correctionPreview.status !== "correction_resolved") return;
    h.writer.valueBeforeConditionalClear = "intervening";

    await expect(
      prepareOrCommitWriteback(
        admin,
        writeInput({
          operation: "correction",
          confirm: true,
          executionId: correctionPreview.preview.executionId,
          previewHash: correctionPreview.preview.hash,
        }),
        READ_TS,
        h.deps,
        context(),
      ),
    ).rejects.toMatchObject({ code: "correction_unavailable" });
    expect(h.writer.clears).toEqual(["Lease Renewal!C2"]);
    expect(h.writer.grid[1][2]).toBe("intervening");
  });

  it("atomically refuses same-value ABA between correction read and clear", async () => {
    enable();
    const { h, outcome } = await prepare();
    await prepareOrCommitWriteback(
      admin,
      writeInput({
        confirm: true,
        executionId: outcome.preview.executionId,
        previewHash: outcome.preview.hash,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    const correctionPreview = await prepareOrCommitWriteback(
      admin,
      writeInput({
        operation: "correction",
        executionId: outcome.preview.executionId,
      }),
      READ_TS,
      h.deps,
      context(),
    );
    if (correctionPreview.status !== "correction_resolved") return;

    // A collaborator clears and retypes the identical value after the preview read. The visible
    // value/hash is unchanged, but the provider-owned cell generation is no longer the receipt's.
    h.writer.valueBeforeConditionalClear = "1300";

    await expect(
      prepareOrCommitWriteback(
        admin,
        writeInput({
          operation: "correction",
          confirm: true,
          executionId: correctionPreview.preview.executionId,
          previewHash: correctionPreview.preview.hash,
        }),
        READ_TS,
        h.deps,
        context(),
      ),
    ).rejects.toMatchObject({ code: "correction_unavailable" });
    expect(h.writer.clears).toEqual(["Lease Renewal!C2"]);
    expect(h.writer.grid[1][2]).toBe("1300");
  });

  it("is disabled before any live read or provider construction when the feature flag is off", async () => {
    const h = harness();
    const outcome = await prepareOrCommitWriteback(
      admin,
      writeInput(),
      READ_TS,
      h.deps,
      context(),
    );
    expect(outcome).toEqual({ status: "disabled" });
    expect(h.rebuildRun).not.toHaveBeenCalled();
    expect(h.loadApproval).not.toHaveBeenCalled();
    expect(h.loadResolution).not.toHaveBeenCalled();
    expect(h.createWriter).not.toHaveBeenCalled();
  });
});

describe("Sheet write-back gate and environment fences", () => {
  it("refuses the committed closed key before rebuilding, approval reads, or Sheets", async () => {
    enable();
    const h = harness();
    await expect(
      prepareOrCommitWriteback(admin, writeInput(), READ_TS, h.deps, {
        descriptor: productionDescriptor,
      }),
    ).rejects.toBeInstanceOf(ActionNotExecutableError);
    expect(h.rebuildRun).not.toHaveBeenCalled();
    expect(h.loadApproval).not.toHaveBeenCalled();
    expect(h.createWriter).not.toHaveBeenCalled();
  });

  it.each([
    {
      environmentKind: "demo",
      dataContext: "demo",
      source: "explicit",
    },
    {
      environmentKind: "demo",
      dataContext: "live_readonly",
      source: "explicit",
    },
  ] satisfies EnvironmentDescriptor[])(
    "refuses $environmentKind+$dataContext before any live dependency call",
    async (descriptor) => {
      enable();
      const h = harness();
      await expect(
        prepareOrCommitWriteback(
          admin,
          writeInput(),
          READ_TS,
          h.deps,
          context(descriptor),
        ),
      ).rejects.toBeInstanceOf(EnvironmentContextError);
      expect(h.rebuildRun).not.toHaveBeenCalled();
      expect(h.createWriter).not.toHaveBeenCalled();
    },
  );
});
