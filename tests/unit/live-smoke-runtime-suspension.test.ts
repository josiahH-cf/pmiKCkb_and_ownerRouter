import { describe, expect, it, vi } from "vitest";

import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import {
  LiveRenewalGmailDraftProvider,
  type RenewalDraftGmailClient,
} from "@/lib/lease-renewal/execution/live-gmail-draft-provider";
import { RENEWAL_NOTICE_DRAFT_ACTION_KEY } from "@/lib/lease-renewal/execution/renewal-draft-request";
import { RENEWAL_SHEET_WRITEBACK_ACTION_KEY } from "@/lib/lease-renewal/sheet-writeback-contract";
import {
  ActionRuntimeSuspendedError,
  assertRuntimeActionExecutable,
} from "@/lib/operations/runtime-suspension-gate";
import {
  RUNTIME_ACTION_SUSPENDED,
  RUNTIME_GLOBAL_SUSPENDED,
  RUNTIME_SUSPENSION_CLEAR,
  type RuntimeSuspensionState,
} from "@/lib/operations/runtime-suspension";
import {
  GMAIL_DIAGNOSTIC_DRAFT_ACTION_KEY,
  runGmailDraftSmoke,
  type GmailDraftSmokeDependencies,
} from "@/scripts/smoke-gmail-draft-live";
import {
  runRenewalDraftSmoke,
  type RenewalDraftSmokeDependencies,
} from "@/scripts/smoke-renewal-draft-live";
import {
  runSheetWriteSmoke,
  type SheetWriteSmokeDependencies,
} from "@/scripts/smoke-sheet-write";

type ReaderBehavior =
  | { kind: "state"; resolve(actionKey: string): RuntimeSuspensionState }
  | { kind: "throw" };

function openRegistry(actionKey: string): CreateActionRegistryInput[] {
  const entry = ACTION_REGISTRY_SEED.find((candidate) => candidate.key === actionKey);
  if (!entry) throw new Error(`Missing Action Registry test fixture for ${actionKey}.`);
  return [
    {
      ...entry,
      readiness: "Approved for Execution",
      evidence_status: "Documented",
      documented_evidence:
        "Fixture-only open seed used to falsify live-smoke runtime suspension bypasses.",
      production_allowed: true,
    },
  ];
}

function runtimeAssertion(behavior: ReaderBehavior) {
  return vi.fn(async (actionKey: string) => {
    await assertRuntimeActionExecutable(
      actionKey,
      async () => {
        if (behavior.kind === "throw") {
          throw new Error("fixture suspension store unreadable");
        }
        return behavior.resolve(actionKey);
      },
      openRegistry(actionKey),
    );
  });
}

function mutableRuntimeAssertion(readBehavior: () => ReaderBehavior) {
  return vi.fn(async (actionKey: string) => {
    const behavior = readBehavior();
    await assertRuntimeActionExecutable(
      actionKey,
      async () => {
        if (behavior.kind === "throw") {
          throw new Error("fixture suspension store unreadable");
        }
        return behavior.resolve(actionKey);
      },
      openRegistry(actionKey),
    );
  });
}

function silentLogger() {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function renewalDependencies(input: {
  assertRuntimeExecutable?: RenewalDraftSmokeDependencies["assertRuntimeExecutable"];
  diagnosticState?: RuntimeSuspensionState;
}) {
  const effects = {
    loadEnvLocal: vi.fn(() => ({
      RENTVINE_API_BASE_URL: "https://pmikcmetro.rentvine.com/api/manager",
      RENTVINE_API_KEY: "fixture-key",
      RENTVINE_API_SECRET: "fixture-secret",
      GMAIL_DWD_SA: "fixture@project.iam.gserviceaccount.com",
    })),
    createRentVineClient: vi.fn<RenewalDraftSmokeDependencies["createRentVineClient"]>(
      () => {
        throw new Error("RentVine provider must remain unreachable in this test.");
      },
    ),
    mintGmailToken: vi.fn<RenewalDraftSmokeDependencies["mintGmailToken"]>(async () => {
      throw new Error("Gmail token mint must remain unreachable in this test.");
    }),
    createGmailClient: vi.fn<RenewalDraftSmokeDependencies["createGmailClient"]>(() => {
      throw new Error("Gmail provider must remain unreachable in this test.");
    }),
    createDiagnosticGmailClient: vi.fn(
      ({
        subject,
        recordDraft,
      }: {
        subject: string;
        recordDraft(draft: { to: string; subject: string; body: string }): void;
      }): RenewalDraftGmailClient => ({
        subject,
        createDraft: async (draft) => {
          recordDraft(draft);
          return { draftId: "diagnostic-draft" };
        },
      }),
    ),
    createDiagnosticProvider: vi.fn(
      (client: RenewalDraftGmailClient) => new LiveRenewalGmailDraftProvider(client),
    ),
    executeRenewalDraft: vi.fn(async () => {
      throw new Error("Live renewal executor must remain unreachable in this test.");
    }),
    fetch: vi.fn(async () => {
      throw new Error("Network must remain unreachable in this test.");
    }),
  };
  const dependencies: RenewalDraftSmokeDependencies = {
    assertRuntimeExecutable:
      input.assertRuntimeExecutable ??
      vi.fn(async () => {
        throw new Error("Production runtime assertion must not run in dry mode.");
      }),
    diagnosticRuntimeSuspensionReader: vi.fn(
      async () => input.diagnosticState ?? RUNTIME_SUSPENSION_CLEAR,
    ),
    ...effects,
    fetch: effects.fetch as unknown as typeof fetch,
    logger: silentLogger(),
  };
  return { dependencies, effects };
}

function gmailDependencies(
  assertRuntimeExecutable: GmailDraftSmokeDependencies["assertRuntimeExecutable"],
) {
  const effects = {
    loadEnvLocal: vi.fn(() => ({
      GMAIL_DWD_SA: "fixture@project.iam.gserviceaccount.com",
    })),
    mintGmailToken: vi.fn(async () => {
      throw new Error("Gmail token mint must remain unreachable in this test.");
    }),
    createGmailClient: vi.fn(() => {
      throw new Error("Gmail provider must remain unreachable in this test.");
    }),
    fetch: vi.fn(async () => {
      throw new Error("Network must remain unreachable in this test.");
    }),
  };
  const dependencies: GmailDraftSmokeDependencies = {
    assertRuntimeExecutable,
    ...effects,
    fetch: effects.fetch as unknown as typeof fetch,
    logger: silentLogger(),
  };
  return { dependencies, effects };
}

function sheetDependencies(
  assertRuntimeExecutable: SheetWriteSmokeDependencies["assertRuntimeExecutable"],
) {
  const effects = {
    loadEnvLocal: vi.fn(() => ({
      SHEETS_IMPERSONATE_SA: "fixture@project.iam.gserviceaccount.com",
      SHEETS_DWD_SUBJECT: "operator@pmikcmetro.com",
    })),
    createWriter: vi.fn(() => {
      throw new Error("Sheets writer must remain unreachable in this test.");
    }),
    setWritebackFlag: vi.fn(),
  };
  const dependencies: SheetWriteSmokeDependencies = {
    assertRuntimeExecutable,
    ...effects,
    now: () => new Date("2026-07-30T00:00:00.000Z"),
    logger: silentLogger(),
  };
  return { dependencies, effects };
}

describe("effect-capable live smoke runtime suspension", () => {
  // S51_DYNAMIC_REFUSAL:script-gmail-draft-client
  it.each([
    ["action_suspended", { kind: "state", resolve: () => RUNTIME_ACTION_SUSPENDED }],
    ["global_suspended", { kind: "state", resolve: () => RUNTIME_GLOBAL_SUSPENDED }],
    ["unreadable", { kind: "throw" }],
  ] satisfies [string, ReaderBehavior][])(
    "keeps Gmail diagnostic token/client/network at zero for %s",
    async (_state, behavior) => {
      const assertion = runtimeAssertion(behavior);
      const { dependencies, effects } = gmailDependencies(assertion);

      await expect(
        runGmailDraftSmoke(["--live"], { NODE_ENV: "test" }, dependencies),
      ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);

      expect(assertion).toHaveBeenCalledWith(GMAIL_DIAGNOSTIC_DRAFT_ACTION_KEY);
      expect(effects.loadEnvLocal).not.toHaveBeenCalled();
      expect(effects.mintGmailToken).not.toHaveBeenCalled();
      expect(effects.createGmailClient).not.toHaveBeenCalled();
      expect(effects.fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["action_suspended", { kind: "state", resolve: () => RUNTIME_ACTION_SUSPENDED }],
    ["global_suspended", { kind: "state", resolve: () => RUNTIME_GLOBAL_SUSPENDED }],
    ["unreadable", { kind: "throw" }],
  ] satisfies [string, ReaderBehavior][])(
    "keeps Gmail client construction at zero when %s wins while the renewal token is minting",
    async (_state, stoppedBehavior) => {
      let behavior: ReaderBehavior = {
        kind: "state",
        resolve: () => RUNTIME_SUSPENSION_CLEAR,
      };
      const assertion = mutableRuntimeAssertion(() => behavior);
      const { dependencies, effects } = renewalDependencies({
        assertRuntimeExecutable: assertion,
      });
      const listLeasesExport = vi.fn(async () => []);
      effects.createRentVineClient.mockImplementation(() => ({
        listLeasesExport,
      }));
      effects.mintGmailToken.mockImplementation(async () => {
        behavior = stoppedBehavior;
        return "fixture-token";
      });
      const finalExecutor = vi.fn(
        async (
          createClient: () => RenewalDraftGmailClient,
          action: { actionKey: string },
        ) => {
          await assertion(action.actionKey);
          createClient();
          throw new Error("The race fixture unexpectedly reached the Gmail provider.");
        },
      );
      dependencies.executeRenewalDraft = finalExecutor;

      await expect(
        runRenewalDraftSmoke(["--live"], { NODE_ENV: "test" }, dependencies),
      ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);

      expect(effects.createRentVineClient).toHaveBeenCalledTimes(1);
      expect(listLeasesExport).toHaveBeenCalledTimes(1);
      expect(effects.mintGmailToken).toHaveBeenCalledTimes(1);
      expect(finalExecutor).toHaveBeenCalledTimes(1);
      expect(assertion).toHaveBeenCalledTimes(4);
      expect(effects.createGmailClient).not.toHaveBeenCalled();
      expect(effects.fetch).not.toHaveBeenCalled();
    },
  );

  // S51_DYNAMIC_REFUSAL:script-renewal-gmail-client
  // S51_DYNAMIC_REFUSAL:script-renewal-rentvine-client
  it.each([
    {
      label: "action_suspended",
      behavior: {
        kind: "state" as const,
        resolve: () => RUNTIME_ACTION_SUSPENDED,
      },
    },
    {
      label: "global_suspended",
      behavior: { kind: "state" as const, resolve: () => RUNTIME_GLOBAL_SUSPENDED },
    },
    { label: "unreadable", behavior: { kind: "throw" as const } },
  ])(
    "preflights the complete renewal effect set and keeps every live effect at zero for $label",
    async ({ behavior }) => {
      const assertion = runtimeAssertion(behavior);
      const { dependencies, effects } = renewalDependencies({
        assertRuntimeExecutable: assertion,
      });

      await expect(
        runRenewalDraftSmoke(["--live"], { NODE_ENV: "test" }, dependencies),
      ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);

      expect(assertion).toHaveBeenCalledWith(RENEWAL_NOTICE_DRAFT_ACTION_KEY);
      expect(effects.loadEnvLocal).not.toHaveBeenCalled();
      expect(effects.createRentVineClient).not.toHaveBeenCalled();
      expect(effects.mintGmailToken).not.toHaveBeenCalled();
      expect(effects.createGmailClient).not.toHaveBeenCalled();
      expect(effects.executeRenewalDraft).not.toHaveBeenCalled();
      expect(effects.fetch).not.toHaveBeenCalled();
    },
  );

  // S51_DYNAMIC_REFUSAL:script-renewal-diagnostic-client
  // S51_DYNAMIC_REFUSAL:script-renewal-diagnostic-provider
  it.each([
    ["action_suspended", RUNTIME_ACTION_SUSPENDED],
    ["global_suspended", RUNTIME_GLOBAL_SUSPENDED],
    ["unreadable", null],
  ] as const)(
    "keeps diagnostic fake client/provider construction at zero for %s",
    async (_label, diagnosticState) => {
      const { dependencies, effects } = renewalDependencies({
        ...(diagnosticState ? { diagnosticState } : {}),
      });
      if (diagnosticState === null) {
        dependencies.diagnosticRuntimeSuspensionReader = vi.fn(async () => {
          throw new Error("fixture diagnostic reader unreadable");
        });
      }

      await expect(
        runRenewalDraftSmoke([], { NODE_ENV: "test" }, dependencies),
      ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);

      expect(effects.createDiagnosticGmailClient).not.toHaveBeenCalled();
      expect(effects.createDiagnosticProvider).not.toHaveBeenCalled();
      expect(effects.createRentVineClient).not.toHaveBeenCalled();
      expect(effects.mintGmailToken).not.toHaveBeenCalled();
      expect(effects.fetch).not.toHaveBeenCalled();
    },
  );

  // S51_DYNAMIC_REFUSAL:script-sheet-write-writer
  it.each([
    ["action_suspended", { kind: "state", resolve: () => RUNTIME_ACTION_SUSPENDED }],
    ["global_suspended", { kind: "state", resolve: () => RUNTIME_GLOBAL_SUSPENDED }],
    ["unreadable", { kind: "throw" }],
  ] satisfies [string, ReaderBehavior][])(
    "keeps Sheet config/writer/flag/network at zero for %s",
    async (_state, behavior) => {
      const assertion = runtimeAssertion(behavior);
      const { dependencies, effects } = sheetDependencies(assertion);

      await expect(
        runSheetWriteSmoke(["--live"], { NODE_ENV: "test" }, dependencies),
      ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);

      expect(assertion).toHaveBeenCalledWith(RENEWAL_SHEET_WRITEBACK_ACTION_KEY);
      expect(effects.loadEnvLocal).not.toHaveBeenCalled();
      expect(effects.createWriter).not.toHaveBeenCalled();
      expect(effects.setWritebackFlag).not.toHaveBeenCalled();
    },
  );

  it.each([
    1, // spreadsheet creation
    2, // synthetic seed update
    3, // first conditional append
    4, // collaborator-drift update
    5, // drifted conditional append
    6, // wrong-value conditional clear
  ])(
    "stops every Sheet mutation after a runtime suspension raised following provider mutation %i",
    async (suspendAfterMutation) => {
      let behavior: ReaderBehavior = {
        kind: "state",
        resolve: () => RUNTIME_SUSPENSION_CLEAR,
      };
      const assertion = mutableRuntimeAssertion(() => behavior);
      const mutationCalls: string[] = [];
      let d2 = "";
      let d3 = "";
      const recordMutation = (label: string): void => {
        mutationCalls.push(label);
        if (mutationCalls.length === suspendAfterMutation) {
          behavior = {
            kind: "state",
            resolve: () => RUNTIME_ACTION_SUSPENDED,
          };
        }
      };
      const createSpreadsheet = vi.fn(async () => {
        recordMutation("createSpreadsheet");
        return "fixture-sheet";
      });
      const updateValues = vi.fn(
        async (_spreadsheetId: string, range: string, values: string[][]) => {
          recordMutation(`updateValues:${range}`);
          if (range === "Renewals!A1") {
            d2 = values[1]?.[3] ?? "";
            d3 = values[2]?.[3] ?? "";
          } else if (range === "Renewals!D3") {
            d3 = values[0]?.[0] ?? "";
          }
        },
      );
      const writeValuesIfEmpty = vi.fn(
        async (_spreadsheetId: string, range: string, value: string) => {
          recordMutation(`writeValuesIfEmpty:${range}`);
          if (range === "Renewals!D2" && d2 === "") {
            d2 = value;
            return true;
          }
          if (range === "Renewals!D3" && d3 === "") {
            d3 = value;
            return true;
          }
          return false;
        },
      );
      const clearValuesIfExactMatch = vi.fn(
        async (_spreadsheetId: string, range: string, expectedValue: string) => {
          recordMutation(`clearValuesIfExactMatch:${range}`);
          if (range === "Renewals!D2" && d2 === expectedValue) {
            d2 = "";
            return true;
          }
          return false;
        },
      );
      const getValues = vi.fn(
        async (_spreadsheetId: string, range: string): Promise<string[][]> => {
          if (range === "Renewals!D2") return [[d2]];
          if (range === "Renewals!D3") return [[d3]];
          return [
            ["Lease", "Tenant", "Current Rent", "KB Proposed — Comp basis"],
            ["lease:SMOKE-1", "Test Tenant A", "1500", d2],
            ["lease:SMOKE-2", "Test Tenant B", "1600", d3],
          ];
        },
      );
      const dependencies: SheetWriteSmokeDependencies = {
        assertRuntimeExecutable: assertion,
        loadEnvLocal: vi.fn(() => ({
          SHEETS_IMPERSONATE_SA: "fixture@project.iam.gserviceaccount.com",
          SHEETS_DWD_SUBJECT: "operator@pmikcmetro.com",
        })),
        createWriter: vi.fn(() => ({
          createSpreadsheet,
          updateValues,
          writeValuesIfEmpty,
          getValues,
          clearValuesIfExactMatch,
        })),
        setWritebackFlag: vi.fn(),
        now: () => new Date("2026-07-30T00:00:00.000Z"),
        logger: silentLogger(),
      };

      await expect(
        runSheetWriteSmoke(["--live"], { NODE_ENV: "test" }, dependencies),
      ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);

      const expectedMutationOrder = [
        "createSpreadsheet",
        "updateValues:Renewals!A1",
        "writeValuesIfEmpty:Renewals!D2",
        "updateValues:Renewals!D3",
        "writeValuesIfEmpty:Renewals!D3",
        "clearValuesIfExactMatch:Renewals!D2",
      ];
      expect(mutationCalls).toEqual(expectedMutationOrder.slice(0, suspendAfterMutation));
      expect(assertion).toHaveBeenLastCalledWith(RENEWAL_SHEET_WRITEBACK_ACTION_KEY);
    },
  );

  it.each([
    ["global_suspended", { kind: "state", resolve: () => RUNTIME_GLOBAL_SUSPENDED }],
    ["unreadable", { kind: "throw" }],
  ] satisfies [string, ReaderBehavior][])(
    "prevents the first subsequent Sheet mutation when the runtime becomes %s mid-run",
    async (_state, stoppedBehavior) => {
      let behavior: ReaderBehavior = {
        kind: "state",
        resolve: () => RUNTIME_SUSPENSION_CLEAR,
      };
      const assertion = mutableRuntimeAssertion(() => behavior);
      const createSpreadsheet = vi.fn(async () => {
        behavior = stoppedBehavior;
        return "fixture-sheet";
      });
      const updateValues = vi.fn(async () => undefined);
      const dependencies: SheetWriteSmokeDependencies = {
        assertRuntimeExecutable: assertion,
        loadEnvLocal: vi.fn(() => ({
          SHEETS_IMPERSONATE_SA: "fixture@project.iam.gserviceaccount.com",
          SHEETS_DWD_SUBJECT: "operator@pmikcmetro.com",
        })),
        createWriter: vi.fn(() => ({
          createSpreadsheet,
          updateValues,
          writeValuesIfEmpty: vi.fn(async () => true),
          getValues: vi.fn(async () => []),
          clearValuesIfExactMatch: vi.fn(async () => true),
        })),
        setWritebackFlag: vi.fn(),
        now: () => new Date("2026-07-30T00:00:00.000Z"),
        logger: silentLogger(),
      };

      await expect(
        runSheetWriteSmoke(["--live"], { NODE_ENV: "test" }, dependencies),
      ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);

      expect(createSpreadsheet).toHaveBeenCalledTimes(1);
      expect(updateValues).not.toHaveBeenCalled();
    },
  );
});

describe("effect-capable smoke dry modes", () => {
  it("runs the renewal diagnostic through only its explicit reader and fake provider", async () => {
    const { dependencies, effects } = renewalDependencies({});

    await expect(
      runRenewalDraftSmoke([], { NODE_ENV: "test" }, dependencies),
    ).resolves.toBeUndefined();

    expect(dependencies.diagnosticRuntimeSuspensionReader).toHaveBeenCalledWith(
      "gmail.renewal_notice.draft_create",
    );
    expect(dependencies.assertRuntimeExecutable).not.toHaveBeenCalled();
    expect(effects.createDiagnosticGmailClient).toHaveBeenCalledTimes(1);
    expect(effects.createDiagnosticProvider).toHaveBeenCalledTimes(1);
    expect(effects.loadEnvLocal).not.toHaveBeenCalled();
    expect(effects.createRentVineClient).not.toHaveBeenCalled();
    expect(effects.mintGmailToken).not.toHaveBeenCalled();
    expect(effects.createGmailClient).not.toHaveBeenCalled();
    expect(effects.executeRenewalDraft).not.toHaveBeenCalled();
    expect(effects.fetch).not.toHaveBeenCalled();
  });

  it("keeps the Gmail print-only dry mode configuration/credential/provider/network-free", async () => {
    const assertion = vi.fn(async () => {
      throw new Error("runtime assertion must not run in dry mode");
    });
    const { dependencies, effects } = gmailDependencies(assertion);

    await expect(
      runGmailDraftSmoke([], { NODE_ENV: "test" }, dependencies),
    ).resolves.toBeUndefined();

    expect(assertion).not.toHaveBeenCalled();
    expect(effects.loadEnvLocal).not.toHaveBeenCalled();
    expect(effects.mintGmailToken).not.toHaveBeenCalled();
    expect(effects.createGmailClient).not.toHaveBeenCalled();
    expect(effects.fetch).not.toHaveBeenCalled();
  });

  it("keeps the Sheet print-only dry mode configuration/credential/writer/flag-free", async () => {
    const assertion = vi.fn(async () => {
      throw new Error("runtime assertion must not run in dry mode");
    });
    const { dependencies, effects } = sheetDependencies(assertion);

    await expect(
      runSheetWriteSmoke([], { NODE_ENV: "test" }, dependencies),
    ).resolves.toBeUndefined();

    expect(assertion).not.toHaveBeenCalled();
    expect(effects.loadEnvLocal).not.toHaveBeenCalled();
    expect(effects.createWriter).not.toHaveBeenCalled();
    expect(effects.setWritebackFlag).not.toHaveBeenCalled();
  });
});
