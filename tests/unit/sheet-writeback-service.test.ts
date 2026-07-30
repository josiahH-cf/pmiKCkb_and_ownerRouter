import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  EnvironmentContextError,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import type { LeaseRenewalWritebackApprovalRecord } from "@/lib/firestore/types";
import type { SheetsValuesWriter } from "@/lib/google-sheets/write-client";
import {
  ActionNotExecutableError,
  isActionExecutable,
} from "@/lib/integrations/action-gate";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import type { RenewalRunResult } from "@/lib/lease-renewal/pipeline";
import { SHEET_WRITEBACK_FLAG } from "@/lib/lease-renewal/sheet-writeback-execution";
import {
  RENEWAL_SHEET_WRITEBACK_ACTION_KEY,
  prepareOrCommitWriteback,
  type WritebackExecuteDeps,
  type WritebackExecutionContext,
} from "@/lib/lease-renewal/sheet-writeback-service";

const READ_TS = "2026-07-22T00:00:00.000Z";
const RUN_ID = "live-review";
const KEY = "lease_renewal:reconcile:live-review:current_rent";

const admin = {
  uid: "a1",
  email: "a1@example.com",
  hd: "example.com",
  role: "Admin",
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
  getCalls = 0;
  constructor(public grid: string[][]) {}
  async getValues(_id: string, range: string): Promise<string[][]> {
    this.getCalls += 1;
    if (range.includes("!")) {
      const { row, col } = parseA1(range);
      return [[this.grid[row]?.[col] ?? ""]];
    }
    return this.grid.map((r) => [...r]);
  }
  async updateValues(_id: string, range: string, values: string[][]): Promise<void> {
    this.updates.push({ range, values });
    const { row, col } = parseA1(range);
    while (this.grid.length <= row) this.grid.push([]);
    while (this.grid[row].length <= col) this.grid[row].push("");
    this.grid[row][col] = values[0][0];
  }
}

function grid(kb = ""): string[][] {
  return [
    ["Address", "Tenant", "KB Proposed — Current rent"],
    ["4821 Maple", "Delgado", kb],
    ["1207 Walnut", "Carter", ""],
  ];
}

function runWithFlag(): RenewalRunResult {
  return {
    flags: [
      {
        fieldKey: "current_rent",
        fieldLabel: "Current rent",
        recordRef: { tab: "Lease Renewal", sourceRowIndex: 1, column: "current_rent" },
        queueMapping: { queueItem: { source_trigger_key: KEY } },
      },
    ],
  } as unknown as RenewalRunResult;
}

function approval(
  overrides: Partial<LeaseRenewalWritebackApprovalRecord> = {},
): LeaseRenewalWritebackApprovalRecord {
  return {
    state: "Approved",
    run_id: RUN_ID,
    proposed_value: "1300",
    ...overrides,
  } as LeaseRenewalWritebackApprovalRecord;
}

function deps(overrides: Partial<WritebackExecuteDeps> = {}): WritebackExecuteDeps {
  return {
    rebuildRun: async () => runWithFlag(),
    loadApproval: async () => approval(),
    writer: new FakeWriter(grid()),
    spreadsheetId: "sheet",
    ...overrides,
  };
}

function enable() {
  process.env[SHEET_WRITEBACK_FLAG] = "true";
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

function openProductionContext(): WritebackExecutionContext {
  const registry = openRegistry();
  if (!isActionExecutable(RENEWAL_SHEET_WRITEBACK_ACTION_KEY, registry)) {
    throw new Error("The test registry must open only the Sheet write-back key.");
  }
  return { descriptor: productionDescriptor, registry };
}

afterEach(() => {
  delete process.env[SHEET_WRITEBACK_FLAG];
});

describe("prepareOrCommitWriteback", () => {
  it("resolves the target row for confirmation without writing (confirm:false, flag on)", async () => {
    enable();
    const d = deps();
    const outcome = await prepareOrCommitWriteback(
      admin,
      { runId: RUN_ID, sourceTriggerKey: KEY, confirm: false },
      READ_TS,
      d,
      openProductionContext(),
    );
    expect(outcome.status).toBe("resolved");
    if (outcome.status === "resolved") {
      expect(outcome.target.a1).toBe("Lease Renewal!C2");
      expect(outcome.target.proposedValue).toBe("1300");
      expect(outcome.target.rowValues).toEqual(["4821 Maple", "Delgado", ""]);
    }
    expect((d.writer as FakeWriter).updates).toHaveLength(0);
  });

  it("commits the guarded append (confirm:true, flag on)", async () => {
    enable();
    const writer = new FakeWriter(grid());
    const outcome = await prepareOrCommitWriteback(
      admin,
      { runId: RUN_ID, sourceTriggerKey: KEY, confirm: true },
      READ_TS,
      deps({ writer }),
      openProductionContext(),
    );
    expect(outcome).toEqual({ status: "written", a1: "Lease Renewal!C2" });
    expect(writer.grid[1][2]).toBe("1300");
  });

  it("is disabled (no write) when the feature flag is off", async () => {
    const writer = new FakeWriter(grid());
    const outcome = await prepareOrCommitWriteback(
      admin,
      { runId: RUN_ID, sourceTriggerKey: KEY, confirm: true },
      READ_TS,
      deps({ writer }),
      openProductionContext(),
    );
    expect(outcome).toEqual({ status: "disabled" });
    expect(writer.updates).toHaveLength(0);
  });

  it("refuses when there is no Approved approval, or the run mismatches", async () => {
    enable();
    expect(
      (
        await prepareOrCommitWriteback(
          admin,
          { runId: RUN_ID, sourceTriggerKey: KEY, confirm: true },
          READ_TS,
          deps({ loadApproval: async () => null }),
          openProductionContext(),
        )
      ).status,
    ).toBe("not_approved");
    expect(
      (
        await prepareOrCommitWriteback(
          admin,
          { runId: RUN_ID, sourceTriggerKey: KEY, confirm: true },
          READ_TS,
          deps({
            loadApproval: async () => approval({ state: "Returned for Revision" }),
          }),
          openProductionContext(),
        )
      ).status,
    ).toBe("not_approved");
    expect(
      (
        await prepareOrCommitWriteback(
          admin,
          { runId: "other-run", sourceTriggerKey: KEY, confirm: true },
          READ_TS,
          deps(),
          openProductionContext(),
        )
      ).status,
    ).toBe("not_approved");
  });

  it("returns flag_not_found and read_error for a missing flag / failed rebuild", async () => {
    enable();
    expect(
      (
        await prepareOrCommitWriteback(
          admin,
          { runId: RUN_ID, sourceTriggerKey: "nope", confirm: false },
          READ_TS,
          deps(),
          openProductionContext(),
        )
      ).status,
    ).toBe("flag_not_found");
    expect(
      (
        await prepareOrCommitWriteback(
          admin,
          { runId: RUN_ID, sourceTriggerKey: KEY, confirm: false },
          READ_TS,
          deps({ rebuildRun: async () => null }),
          openProductionContext(),
        )
      ).status,
    ).toBe("read_error");
  });

  it("refuses the committed closed key before rebuilding, loading approval, or touching Sheets", async () => {
    enable();
    const rebuildRun = vi.fn(async () => runWithFlag());
    const loadApproval = vi.fn(async () => approval());
    const writer = new FakeWriter(grid());

    await expect(
      prepareOrCommitWriteback(
        admin,
        { runId: RUN_ID, sourceTriggerKey: KEY, confirm: true },
        READ_TS,
        deps({ rebuildRun, loadApproval, writer }),
        { descriptor: productionDescriptor },
      ),
    ).rejects.toBeInstanceOf(ActionNotExecutableError);

    expect(rebuildRun).not.toHaveBeenCalled();
    expect(loadApproval).not.toHaveBeenCalled();
    expect(writer.getCalls).toBe(0);
    expect(writer.updates).toHaveLength(0);
  });

  it.each([
    {
      label: "Demo data",
      descriptor: {
        environmentKind: "demo",
        dataContext: "demo",
        source: "explicit",
      } satisfies EnvironmentDescriptor,
    },
    {
      label: "Live read-only",
      descriptor: {
        environmentKind: "demo",
        dataContext: "live_readonly",
        source: "explicit",
      } satisfies EnvironmentDescriptor,
    },
  ])(
    "refuses $label before rebuilding, loading approval, or touching Sheets even with a fake-open key",
    async ({ descriptor }) => {
      enable();
      const rebuildRun = vi.fn(async () => runWithFlag());
      const loadApproval = vi.fn(async () => approval());
      const writer = new FakeWriter(grid());

      await expect(
        prepareOrCommitWriteback(
          admin,
          { runId: RUN_ID, sourceTriggerKey: KEY, confirm: true },
          READ_TS,
          deps({ rebuildRun, loadApproval, writer }),
          { descriptor, registry: openRegistry() },
        ),
      ).rejects.toBeInstanceOf(EnvironmentContextError);

      expect(rebuildRun).not.toHaveBeenCalled();
      expect(loadApproval).not.toHaveBeenCalled();
      expect(writer.getCalls).toBe(0);
      expect(writer.updates).toHaveLength(0);
    },
  );
});
