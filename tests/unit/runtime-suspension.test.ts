import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import { ActionNotExecutableError } from "@/lib/integrations/action-gate";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import {
  ActionRuntimeSuspendedError,
  assertRuntimeActionExecutable,
  isRuntimeActionExecutable,
  runRuntimeGatedAction,
} from "@/lib/operations/runtime-suspension-gate";
import {
  RUNTIME_ACTION_SUSPENDED,
  RUNTIME_GLOBAL_SUSPENDED,
  RUNTIME_SUSPENSION_CLEAR,
  RUNTIME_SUSPENSION_UNREADABLE,
  isSuspended,
  resolveRuntimeExecutable,
} from "@/lib/operations/runtime-suspension";

const ACTION_KEY = "google_sheets.renewal_checklist.writeback";

function seedEntry(): CreateActionRegistryInput {
  const entry = ACTION_REGISTRY_SEED.find((candidate) => candidate.key === ACTION_KEY);
  if (!entry) throw new Error(`Seed entry ${ACTION_KEY} is missing.`);
  return entry;
}

function closedRegistry(): CreateActionRegistryInput[] {
  return [seedEntry()];
}

function openRegistry(): CreateActionRegistryInput[] {
  return [
    {
      ...seedEntry(),
      readiness: "Approved for Execution",
      evidence_status: "Documented",
      documented_evidence:
        "Fixture-only evidence for the runtime suspension truth table.",
      production_allowed: true,
    },
  ];
}

describe("runtime suspension pure close-only term", () => {
  it.each([
    {
      label: "closed seed and clear state",
      seedAllowed: false,
      state: RUNTIME_SUSPENSION_CLEAR,
      expected: false,
    },
    {
      label: "closed seed and active suspension",
      seedAllowed: false,
      state: RUNTIME_ACTION_SUSPENDED,
      expected: false,
    },
    {
      label: "closed seed and global suspension",
      seedAllowed: false,
      state: RUNTIME_GLOBAL_SUSPENDED,
      expected: false,
    },
    {
      label: "closed seed and unreadable state",
      seedAllowed: false,
      state: RUNTIME_SUSPENSION_UNREADABLE,
      expected: false,
    },
    {
      label: "open seed and clear state",
      seedAllowed: true,
      state: RUNTIME_SUSPENSION_CLEAR,
      expected: true,
    },
    {
      label: "open seed and active suspension",
      seedAllowed: true,
      state: RUNTIME_ACTION_SUSPENDED,
      expected: false,
    },
    {
      label: "open seed and global suspension",
      seedAllowed: true,
      state: RUNTIME_GLOBAL_SUSPENDED,
      expected: false,
    },
    {
      label: "open seed and unreadable state",
      seedAllowed: true,
      state: RUNTIME_SUSPENSION_UNREADABLE,
      expected: false,
    },
  ])("enumerates $label", ({ seedAllowed, state, expected }) => {
    expect(resolveRuntimeExecutable(seedAllowed, state)).toBe(expected);
  });

  it.each([
    ["exact-action suspension", RUNTIME_ACTION_SUSPENDED],
    ["global suspension", RUNTIME_GLOBAL_SUSPENDED],
    ["unreadable state", RUNTIME_SUSPENSION_UNREADABLE],
    ["undefined state", undefined],
    ["null state", null],
    ["missing status", {}],
    ["unknown status", { status: "unknown" }],
    ["clear with an extra field", { status: "clear", extra: true }],
    ["clear with a forged open field", { status: "clear", production_allowed: true }],
    ["raw suspended false", { suspended: false }],
    ["array state", [{ status: "clear" }]],
    [
      "custom-prototype state",
      Object.assign(Object.create({ production_allowed: true }), { status: "clear" }),
    ],
  ])("fails closed for %s", (_label, state) => {
    expect(isSuspended(state)).toBe(true);
    expect(resolveRuntimeExecutable(true, state)).toBe(false);
  });

  it("accepts only the exact normalized clear state as non-suspended", () => {
    expect(isSuspended(RUNTIME_SUSPENSION_CLEAR)).toBe(false);
    expect(resolveRuntimeExecutable(true, RUNTIME_SUSPENSION_CLEAR)).toBe(true);
  });
});

describe("runtime suspension seed-first wrapper", () => {
  it.each([
    {
      label: "closed seed and clear state",
      registry: closedRegistry(),
      state: RUNTIME_SUSPENSION_CLEAR,
      expected: false,
      expectedReads: 0,
    },
    {
      label: "closed seed and active state",
      registry: closedRegistry(),
      state: RUNTIME_ACTION_SUSPENDED,
      expected: false,
      expectedReads: 0,
    },
    {
      label: "closed seed and global state",
      registry: closedRegistry(),
      state: RUNTIME_GLOBAL_SUSPENDED,
      expected: false,
      expectedReads: 0,
    },
    {
      label: "closed seed and unreadable state",
      registry: closedRegistry(),
      state: RUNTIME_SUSPENSION_UNREADABLE,
      expected: false,
      expectedReads: 0,
    },
    {
      label: "open seed and clear state",
      registry: openRegistry(),
      state: RUNTIME_SUSPENSION_CLEAR,
      expected: true,
      expectedReads: 1,
    },
    {
      label: "open seed and active state",
      registry: openRegistry(),
      state: RUNTIME_ACTION_SUSPENDED,
      expected: false,
      expectedReads: 1,
    },
    {
      label: "open seed and global state",
      registry: openRegistry(),
      state: RUNTIME_GLOBAL_SUSPENDED,
      expected: false,
      expectedReads: 1,
    },
    {
      label: "open seed and unreadable state",
      registry: openRegistry(),
      state: RUNTIME_SUSPENSION_UNREADABLE,
      expected: false,
      expectedReads: 1,
    },
  ])("enumerates $label", async ({ registry, state, expected, expectedReads }) => {
    const readSuspension = vi.fn(async () => state);
    await expect(
      isRuntimeActionExecutable(ACTION_KEY, readSuspension, registry),
    ).resolves.toBe(expected);
    expect(readSuspension).toHaveBeenCalledTimes(expectedReads);
  });

  it.each([
    ["cleared exact and global documents", RUNTIME_SUSPENSION_CLEAR],
    ["absent exact and global documents normalized to clear", { status: "clear" }],
  ])("allows an open seed for %s", async (_label, state) => {
    const readSuspension = vi.fn(async () => state);
    await expect(
      isRuntimeActionExecutable(ACTION_KEY, readSuspension, openRegistry()),
    ).resolves.toBe(true);
    await expect(
      assertRuntimeActionExecutable(ACTION_KEY, readSuspension, openRegistry()),
    ).resolves.toBeUndefined();
    expect(readSuspension).toHaveBeenNthCalledWith(1, ACTION_KEY);
    expect(readSuspension).toHaveBeenNthCalledWith(2, ACTION_KEY);
  });

  it.each([
    ["forged production_allowed", { status: "clear", production_allowed: true }],
    ["raw suspended false", { suspended: false }],
    ["unknown extra fields", { status: "clear", unknown: "value" }],
  ])("never reads or opens a closed seed for %s", async (_label, state) => {
    const readSuspension = vi.fn(async () => state);
    await expect(
      isRuntimeActionExecutable(ACTION_KEY, readSuspension, closedRegistry()),
    ).resolves.toBe(false);
    expect(resolveRuntimeExecutable(false, state)).toBe(false);
    expect(readSuspension).not.toHaveBeenCalled();
  });

  it("does not read for an unknown key and preserves ActionNotExecutableError", async () => {
    const readSuspension = vi.fn(async () => RUNTIME_SUSPENSION_CLEAR);
    await expect(
      isRuntimeActionExecutable("unknown.action", readSuspension),
    ).resolves.toBe(false);
    await expect(
      assertRuntimeActionExecutable("unknown.action", readSuspension),
    ).rejects.toMatchObject({
      name: "ActionNotExecutableError",
      code: "action_not_production_allowed",
      status: 409,
    });
    expect(readSuspension).not.toHaveBeenCalled();
  });

  it("does not read when registry schema validation fails", async () => {
    const invalidRegistry: CreateActionRegistryInput[] = [
      { ...seedEntry(), production_allowed: true },
    ];
    const readSuspension = vi.fn(async () => RUNTIME_SUSPENSION_CLEAR);
    await expect(
      isRuntimeActionExecutable(ACTION_KEY, readSuspension, invalidRegistry),
    ).rejects.toThrow();
    await expect(
      assertRuntimeActionExecutable(ACTION_KEY, readSuspension, invalidRegistry),
    ).rejects.toThrow();
    expect(readSuspension).not.toHaveBeenCalled();
  });

  it("turns a thrown reader into an unreadable, closed state", async () => {
    const readForBoolean = vi.fn(async () => {
      throw new Error("fixture read failed");
    });
    await expect(
      isRuntimeActionExecutable(ACTION_KEY, readForBoolean, openRegistry()),
    ).resolves.toBe(false);
    expect(readForBoolean).toHaveBeenCalledTimes(1);

    const readForAssert = vi.fn(async () => {
      throw new Error("fixture read failed");
    });
    await expect(
      assertRuntimeActionExecutable(ACTION_KEY, readForAssert, openRegistry()),
    ).rejects.toMatchObject({
      name: "ActionRuntimeSuspendedError",
      code: "action_runtime_suspended",
      status: 409,
    });
    expect(readForAssert).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["exact action suspension", RUNTIME_ACTION_SUSPENDED],
    ["global suspension", RUNTIME_GLOBAL_SUSPENDED],
    ["unreadable state", RUNTIME_SUSPENSION_UNREADABLE],
    ["malformed state", { status: "clear", extra: true }],
  ])("uses the distinct runtime error for %s", async (_label, state) => {
    const readSuspension = vi.fn(async () => state);
    const error = await assertRuntimeActionExecutable(
      ACTION_KEY,
      readSuspension,
      openRegistry(),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ActionRuntimeSuspendedError);
    expect(error).toMatchObject({
      name: "ActionRuntimeSuspendedError",
      code: "action_runtime_suspended",
      status: 409,
    });
    expect(String(error)).toContain(ACTION_KEY);
    expect(readSuspension).toHaveBeenCalledTimes(1);
  });

  it("preserves the original seed-closed assertion error and skips the reader", async () => {
    const readSuspension = vi.fn(async () => RUNTIME_SUSPENSION_CLEAR);
    const error = await assertRuntimeActionExecutable(
      ACTION_KEY,
      readSuspension,
      closedRegistry(),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ActionNotExecutableError);
    expect(error).toMatchObject({
      code: "action_not_production_allowed",
      status: 409,
    });
    expect(error).not.toBeInstanceOf(ActionRuntimeSuspendedError);
    expect(readSuspension).not.toHaveBeenCalled();
  });

  it("performs a fresh suspension read for every open-seed check", async () => {
    const readSuspension = vi.fn(async () => RUNTIME_SUSPENSION_CLEAR);
    await isRuntimeActionExecutable(ACTION_KEY, readSuspension, openRegistry());
    await isRuntimeActionExecutable(ACTION_KEY, readSuspension, openRegistry());
    expect(readSuspension).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["exact action suspension", RUNTIME_ACTION_SUSPENDED],
    ["global suspension", RUNTIME_GLOBAL_SUSPENDED],
    ["unreadable state", RUNTIME_SUSPENSION_UNREADABLE],
  ])("never invokes a provider factory for %s", async (_label, state) => {
    const readSuspension = vi.fn(async () => state);
    const providerFactory = vi.fn(async () => "unexpected");

    await expect(
      runRuntimeGatedAction(ACTION_KEY, readSuspension, providerFactory, openRegistry()),
    ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);
    expect(providerFactory).not.toHaveBeenCalled();
  });

  it("invokes the provider factory only after an awaited clear read", async () => {
    const order: string[] = [];
    const result = await runRuntimeGatedAction(
      ACTION_KEY,
      async () => {
        order.push("runtime-read");
        return RUNTIME_SUSPENSION_CLEAR;
      },
      async () => {
        order.push("provider-factory");
        return "ok";
      },
      openRegistry(),
    );

    expect(result).toBe("ok");
    expect(order).toEqual(["runtime-read", "provider-factory"]);
  });
});

describe("runtime suspension source boundary", () => {
  it("keeps the pure close-only module dependency-free", () => {
    const source = readFileSync(
      new URL("../../lib/operations/runtime-suspension.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/^\s*import\b/m);
    expect(source).not.toMatch(
      /(?:firebase|firestore|@google-cloud|child_process|lib\/auth|action-gate|provider)/i,
    );
  });
});
