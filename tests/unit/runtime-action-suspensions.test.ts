import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  RUNTIME_SUSPENSION_COLLECTIONS,
  changeRuntimeActionSuspension,
  isKnownRuntimeSuspensionActionKey,
  isRuntimeSuspensionEffectTarget,
  listRuntimeActionSuspensions,
  listRuntimeSuspensionActionOptions,
  readRuntimeActionSuspension,
} from "@/lib/firestore/runtime-action-suspensions";
import { RuntimeSuspensionChangeRecordSchema } from "@/lib/firestore/schemas";
import {
  RUNTIME_ACTION_SUSPENDED,
  RUNTIME_GLOBAL_SUSPENDED,
  RUNTIME_SUSPENSION_CLEAR,
  RUNTIME_SUSPENSION_UNREADABLE,
} from "@/lib/operations/runtime-suspension";
import {
  RUNTIME_SUSPENSION_GLOBAL_KEY,
  RUNTIME_SUSPENSION_UNREADABLE_EXPECTATION,
} from "@/lib/operations/runtime-suspension-policy";
import { FakeTransactionalFirestore } from "@/tests/helpers/fake-transactional-firestore";

const ACTION_KEY = "google_sheets.renewal_checklist.writeback";
const NOW = "2026-07-30T12:00:00.000Z";
const OPERATION_1 = "11111111-1111-4111-8111-111111111111";
const OPERATION_2 = "22222222-2222-4222-8222-222222222222";
const OPERATION_3 = "33333333-3333-4333-8333-333333333333";
const SUSPENSION_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SUSPENSION_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACCESS_KEY_SHAPED_TEST_VALUE = "AK" + "IAIOSFODNN7EXAMPLE";

function admin(uid = "admin-1"): AuthenticatedUser {
  return {
    uid,
    email: `${uid}@pmikcmetro.com`,
    hd: "pmikcmetro.com",
    role: "Admin",
  };
}

function db() {
  const fake = new FakeTransactionalFirestore();
  return { fake, firestore: fake as unknown as Firestore };
}

function activeRecord(
  actionKey = ACTION_KEY,
  suspensionId = SUSPENSION_1,
): Record<string, unknown> {
  return {
    action_key: actionKey,
    state: "suspended",
    suspension_id: suspensionId,
    reason_code: "provider_outage",
    suspended_by_uid: "admin-1",
    suspended_by_email: "admin-1@pmikcmetro.com",
    suspended_at: NOW,
  };
}

function auditRecord(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operation_id: OPERATION_1,
    actor_uid: "admin-1",
    actor_email: "admin-1@pmikcmetro.com",
    action_key: ACTION_KEY,
    previous_state: "clear",
    new_state: "suspended",
    reason_code: "provider_outage",
    new_suspension_id: SUSPENSION_1,
    created_at: NOW,
    ...over,
  };
}

function suspendInput(
  over: Partial<{
    action: "suspend" | "clear";
    actionKey: string;
    reasonCode:
      | "wrong_client_output"
      | "ambiguous_or_duplicate_effect"
      | "provider_outage"
      | "security_containment"
      | "planned_maintenance"
      | "incident_resolved";
    incidentRef: string;
    confirmation: string;
  }> = {},
) {
  return {
    action: "suspend" as const,
    actionKey: ACTION_KEY,
    reasonCode: "provider_outage" as const,
    confirmation: ACTION_KEY,
    ...over,
  };
}

function dependencies(suspensionId = SUSPENSION_1) {
  return {
    now: () => new Date(NOW),
    suspensionId: () => suspensionId,
  };
}

describe("runtime action suspension system reader", () => {
  it("derives exact known targets from the committed seed plus the reserved global key", () => {
    const options = listRuntimeSuspensionActionOptions();
    expect(options[0]).toEqual({
      key: "*",
      label: "All gated live effects",
      effectTarget: true,
    });
    expect(options.some((option) => option.key === ACTION_KEY)).toBe(true);
    expect(options.some((option) => option.key === "rentvine.lease.read")).toBe(false);
    expect(
      options.some((option) => option.key === "google_sheets.renewal_checklist.read"),
    ).toBe(false);
    expect(isKnownRuntimeSuspensionActionKey(ACTION_KEY)).toBe(true);
    expect(isKnownRuntimeSuspensionActionKey("rentvine.lease.read")).toBe(true);
    expect(
      isKnownRuntimeSuspensionActionKey("google_sheets.renewal_checklist.read"),
    ).toBe(true);
    expect(isRuntimeSuspensionEffectTarget(ACTION_KEY)).toBe(true);
    expect(isRuntimeSuspensionEffectTarget("rentvine.lease.read")).toBe(false);
    expect(isRuntimeSuspensionEffectTarget("google_sheets.renewal_checklist.read")).toBe(
      false,
    );
    expect(isKnownRuntimeSuspensionActionKey("*")).toBe(true);
    expect(isRuntimeSuspensionEffectTarget("*")).toBe(true);
    expect(isKnownRuntimeSuspensionActionKey("unknown.action")).toBe(false);
  });

  it("surfaces an out-of-scope existing record only as a repairable clear target", () => {
    expect(listRuntimeSuspensionActionOptions(["rentvine.lease.read"])).toContainEqual({
      key: "rentvine.lease.read",
      label: "Read Rentvine leases — clear existing record only",
      effectTarget: false,
    });
  });

  it("returns clear only when both exact and global documents are absent", async () => {
    const { firestore } = db();
    await expect(readRuntimeActionSuspension(ACTION_KEY, firestore)).resolves.toBe(
      RUNTIME_SUSPENSION_CLEAR,
    );
  });

  it("distinguishes exact and global suspension, with global precedence", async () => {
    const exactOnly = db();
    exactOnly.fake.seed(
      `${RUNTIME_SUSPENSION_COLLECTIONS.state}/${ACTION_KEY}`,
      activeRecord(),
    );
    await expect(
      readRuntimeActionSuspension(ACTION_KEY, exactOnly.firestore),
    ).resolves.toBe(RUNTIME_ACTION_SUSPENDED);

    const globalOnly = db();
    globalOnly.fake.seed(
      `${RUNTIME_SUSPENSION_COLLECTIONS.state}/${RUNTIME_SUSPENSION_GLOBAL_KEY}`,
      activeRecord(RUNTIME_SUSPENSION_GLOBAL_KEY),
    );
    await expect(
      readRuntimeActionSuspension(ACTION_KEY, globalOnly.firestore),
    ).resolves.toBe(RUNTIME_GLOBAL_SUSPENDED);

    globalOnly.fake.seed(
      `${RUNTIME_SUSPENSION_COLLECTIONS.state}/${ACTION_KEY}`,
      activeRecord(),
    );
    await expect(
      readRuntimeActionSuspension(ACTION_KEY, globalOnly.firestore),
    ).resolves.toBe(RUNTIME_GLOBAL_SUSPENDED);
  });

  it.each([
    ["mismatched key", { ...activeRecord(), action_key: "gmail.draft.create" }],
    ["forged open field", { ...activeRecord(), production_allowed: true }],
    ["suspended false", { ...activeRecord(), suspended: false }],
    ["clear status", { ...activeRecord(), state: "clear" }],
    ["unknown reason", { ...activeRecord(), reason_code: "because" }],
    ["noncanonical timestamp", { ...activeRecord(), suspended_at: "yesterday" }],
  ])("fails closed for a present malformed exact document: %s", async (_label, value) => {
    const { fake, firestore } = db();
    fake.seed(`${RUNTIME_SUSPENSION_COLLECTIONS.state}/${ACTION_KEY}`, value);
    await expect(readRuntimeActionSuspension(ACTION_KEY, firestore)).resolves.toBe(
      RUNTIME_SUSPENSION_UNREADABLE,
    );
  });

  it("fails closed when the global document is malformed", async () => {
    const { fake, firestore } = db();
    fake.seed(
      `${RUNTIME_SUSPENSION_COLLECTIONS.state}/${RUNTIME_SUSPENSION_GLOBAL_KEY}`,
      { ...activeRecord(RUNTIME_SUSPENSION_GLOBAL_KEY), extra: true },
    );
    await expect(readRuntimeActionSuspension(ACTION_KEY, firestore)).resolves.toBe(
      RUNTIME_SUSPENSION_UNREADABLE,
    );
  });

  it("returns unreadable for an unknown key without starting a transaction", async () => {
    const { fake, firestore } = db();
    const transaction = vi.spyOn(fake, "runTransaction");
    await expect(readRuntimeActionSuspension("unknown.action", firestore)).resolves.toBe(
      RUNTIME_SUSPENSION_UNREADABLE,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("turns a Firestore read failure into unreadable", async () => {
    const broken = {
      runTransaction: vi.fn(async () => {
        throw new Error("down");
      }),
    } as unknown as Firestore;
    await expect(readRuntimeActionSuspension(ACTION_KEY, broken)).resolves.toBe(
      RUNTIME_SUSPENSION_UNREADABLE,
    );
  });
});

describe("runtime suspension audit schema", () => {
  it("accepts coherent suspend, exact clear, and unreadable-repair records", () => {
    expect(RuntimeSuspensionChangeRecordSchema.safeParse(auditRecord()).success).toBe(
      true,
    );
    expect(
      RuntimeSuspensionChangeRecordSchema.safeParse(
        auditRecord({
          previous_state: "suspended",
          new_state: "clear",
          previous_suspension_id: SUSPENSION_1,
          expected_suspension_id: SUSPENSION_1,
          new_suspension_id: undefined,
        }),
      ).success,
    ).toBe(true);
    expect(
      RuntimeSuspensionChangeRecordSchema.safeParse(
        auditRecord({
          previous_state: "unreadable",
          new_state: "clear",
          expected_suspension_id: RUNTIME_SUSPENSION_UNREADABLE_EXPECTATION,
          new_suspension_id: undefined,
        }),
      ).success,
    ).toBe(true);
  });

  it.each([
    [
      "a suspended new state without its generation",
      auditRecord({ new_suspension_id: undefined }),
    ],
    [
      "a clear new state carrying a new generation",
      auditRecord({
        previous_state: "suspended",
        new_state: "clear",
        previous_suspension_id: SUSPENSION_1,
        expected_suspension_id: SUSPENSION_1,
      }),
    ],
    [
      "a suspended previous state without its generation",
      auditRecord({ previous_state: "suspended" }),
    ],
    [
      "a clear targeting a different generation",
      auditRecord({
        previous_state: "suspended",
        new_state: "clear",
        previous_suspension_id: SUSPENSION_1,
        expected_suspension_id: SUSPENSION_2,
        new_suspension_id: undefined,
      }),
    ],
    [
      "an unreadable repair without the unreadable sentinel",
      auditRecord({
        previous_state: "unreadable",
        new_state: "clear",
        expected_suspension_id: SUSPENSION_1,
        new_suspension_id: undefined,
      }),
    ],
    [
      "a suspend carrying a clear-state precondition",
      auditRecord({ expected_suspension_id: SUSPENSION_1 }),
    ],
  ])("rejects %s", (_label, value) => {
    expect(RuntimeSuspensionChangeRecordSchema.safeParse(value).success).toBe(false);
  });
});

describe("runtime suspension Admin store", () => {
  it("atomically suspends and appends one value-free audit record", async () => {
    const { fake, firestore } = db();
    const result = await changeRuntimeActionSuspension(
      admin(),
      suspendInput({ incidentRef: "INC-42" }),
      { operationId: OPERATION_1 },
      firestore,
      dependencies(),
    );

    expect(result).toEqual({
      actionKey: ACTION_KEY,
      status: "suspended",
      suspensionId: SUSPENSION_1,
      changed: true,
      replayed: false,
    });
    expect(fake.read(`${RUNTIME_SUSPENSION_COLLECTIONS.state}/${ACTION_KEY}`)).toEqual({
      ...activeRecord(),
      incident_ref: "INC-42",
    });
    const audits = fake.collectionEntries(RUNTIME_SUSPENSION_COLLECTIONS.changes);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      id: OPERATION_1,
      data: {
        operation_id: OPERATION_1,
        actor_uid: "admin-1",
        actor_email: "admin-1@pmikcmetro.com",
        action_key: ACTION_KEY,
        previous_state: "clear",
        new_state: "suspended",
        reason_code: "provider_outage",
        incident_ref: "INC-42",
        new_suspension_id: SUSPENSION_1,
        created_at: NOW,
      },
    });
    expect(JSON.stringify(audits[0])).not.toContain("confirmation");
  });

  it("requires an Admin with a managed internal identity before touching Firestore", async () => {
    const { fake, firestore } = db();
    const transaction = vi.spyOn(fake, "runTransaction");
    await expect(
      changeRuntimeActionSuspension(
        { ...admin(), role: "Editor" },
        suspendInput(),
        { operationId: OPERATION_1 },
        firestore,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      changeRuntimeActionSuspension(
        { ...admin(), email: "admin@gmail.com" },
        suspendInput(),
        { operationId: OPERATION_1 },
        firestore,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      changeRuntimeActionSuspension(
        { ...admin(), hd: "example.com" },
        suspendInput(),
        { operationId: OPERATION_1 },
        firestore,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects an unknown key before touching Firestore", async () => {
    const { fake, firestore } = db();
    const transaction = vi.spyOn(fake, "runTransaction");
    await expect(
      changeRuntimeActionSuspension(
        admin(),
        suspendInput({
          actionKey: "unknown.action",
          confirmation: "unknown.action",
        }),
        { operationId: OPERATION_1 },
        firestore,
      ),
    ).rejects.toMatchObject({
      code: "runtime_suspension_unknown_action",
      status: 400,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each(["rentvine.lease.read", "google_sheets.renewal_checklist.read"])(
    "rejects the deliberately out-of-scope product source read before touching Firestore: %s",
    async (actionKey) => {
      const { fake, firestore } = db();
      const transaction = vi.spyOn(fake, "runTransaction");
      await expect(
        changeRuntimeActionSuspension(
          admin(),
          suspendInput({ actionKey, confirmation: actionKey }),
          { operationId: OPERATION_1 },
          firestore,
        ),
      ).rejects.toMatchObject({
        code: "runtime_suspension_unknown_action",
        status: 400,
      });
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it("allows clearing a pre-existing out-of-scope product-source record", async () => {
    const actionKey = "rentvine.lease.read";
    const { fake, firestore } = db();
    fake.seed(
      `${RUNTIME_SUSPENSION_COLLECTIONS.state}/${actionKey}`,
      activeRecord(actionKey),
    );
    await expect(
      changeRuntimeActionSuspension(
        admin(),
        suspendInput({
          action: "clear",
          actionKey,
          reasonCode: "incident_resolved",
          confirmation: actionKey,
        }),
        {
          operationId: OPERATION_1,
          expectedSuspensionId: SUSPENSION_1,
        },
        firestore,
        dependencies(),
      ),
    ).resolves.toMatchObject({
      actionKey,
      status: "clear",
      changed: true,
    });
    expect(
      fake.read(`${RUNTIME_SUSPENSION_COLLECTIONS.state}/${actionKey}`),
    ).toBeUndefined();
  });

  it.each([
    "RESIDENT_JANE_DOE",
    "JANE_DOE",
    "UNIT_4B",
    "OAK_STREET_12",
    "TOKEN_ABC",
    "0123456789ABCDEF0123456789ABCDEF",
    ACCESS_KEY_SHAPED_TEST_VALUE,
    "UNIT4B",
    "RESIDENT123",
    "JOHNDOE42",
  ])(
    "rejects a customer- or token-shaped incident reference before touching Firestore: %s",
    async (incidentRef) => {
      const { fake, firestore } = db();
      const transaction = vi.spyOn(fake, "runTransaction");
      await expect(
        changeRuntimeActionSuspension(
          admin(),
          suspendInput({ incidentRef }),
          { operationId: OPERATION_1 },
          firestore,
        ),
      ).rejects.toMatchObject({
        code: "runtime_suspension_invalid_input",
        status: 400,
      });
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it("accepts the documented dotted Sev incident-reference format", async () => {
    const { fake, firestore } = db();
    await expect(
      changeRuntimeActionSuspension(
        admin(),
        suspendInput({ incidentRef: "SEV1.2026-001" }),
        { operationId: OPERATION_1 },
        firestore,
        dependencies(),
      ),
    ).resolves.toMatchObject({ status: "suspended", changed: true });
    expect(
      fake.read(`${RUNTIME_SUSPENSION_COLLECTIONS.state}/${ACTION_KEY}`),
    ).toMatchObject({ incident_ref: "SEV1.2026-001" });
  });

  it("rejects a clear without a generation precondition before touching Firestore", async () => {
    const { fake, firestore } = db();
    const transaction = vi.spyOn(fake, "runTransaction");
    await expect(
      changeRuntimeActionSuspension(
        admin(),
        suspendInput({ action: "clear", reasonCode: "incident_resolved" }),
        { operationId: OPERATION_1 },
        firestore,
        dependencies(),
      ),
    ).rejects.toMatchObject({
      code: "runtime_suspension_invalid_input",
      status: 400,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a suspend carrying a clear precondition before touching Firestore", async () => {
    const { fake, firestore } = db();
    const transaction = vi.spyOn(fake, "runTransaction");
    await expect(
      changeRuntimeActionSuspension(
        admin(),
        suspendInput(),
        {
          operationId: OPERATION_1,
          expectedSuspensionId: SUSPENSION_1,
        },
        firestore,
        dependencies(),
      ),
    ).rejects.toMatchObject({
      code: "runtime_suspension_invalid_input",
      status: 400,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("clears only the exact current suspension generation and audits the delete", async () => {
    const { fake, firestore } = db();
    fake.seed(`${RUNTIME_SUSPENSION_COLLECTIONS.state}/${ACTION_KEY}`, activeRecord());
    const result = await changeRuntimeActionSuspension(
      admin(),
      suspendInput({
        action: "clear",
        reasonCode: "incident_resolved",
      }),
      {
        operationId: OPERATION_1,
        expectedSuspensionId: SUSPENSION_1,
      },
      firestore,
      dependencies(),
    );
    expect(result).toEqual({
      actionKey: ACTION_KEY,
      status: "clear",
      changed: true,
      replayed: false,
    });
    expect(
      fake.read(`${RUNTIME_SUSPENSION_COLLECTIONS.state}/${ACTION_KEY}`),
    ).toBeUndefined();
    expect(
      fake.read(`${RUNTIME_SUSPENSION_COLLECTIONS.changes}/${OPERATION_1}`),
    ).toMatchObject({
      previous_state: "suspended",
      new_state: "clear",
      previous_suspension_id: SUSPENSION_1,
      expected_suspension_id: SUSPENSION_1,
    });
  });

  it("refuses a stale clear after a newer suspend and preserves the newer stop", async () => {
    const { fake, firestore } = db();
    const first = await changeRuntimeActionSuspension(
      admin(),
      suspendInput(),
      { operationId: OPERATION_1 },
      firestore,
      dependencies(SUSPENSION_1),
    );
    expect(first.suspensionId).toBe(SUSPENSION_1);
    const second = await changeRuntimeActionSuspension(
      admin(),
      suspendInput({ reasonCode: "security_containment" }),
      { operationId: OPERATION_2 },
      firestore,
      dependencies(SUSPENSION_2),
    );
    expect(second.suspensionId).toBe(SUSPENSION_2);

    await expect(
      changeRuntimeActionSuspension(
        admin(),
        suspendInput({
          action: "clear",
          reasonCode: "incident_resolved",
        }),
        {
          operationId: OPERATION_3,
          expectedSuspensionId: SUSPENSION_1,
        },
        firestore,
        dependencies(),
      ),
    ).rejects.toMatchObject({
      code: "runtime_suspension_conflict",
      status: 409,
    });
    expect(
      fake.read(`${RUNTIME_SUSPENSION_COLLECTIONS.state}/${ACTION_KEY}`),
    ).toMatchObject({ suspension_id: SUSPENSION_2 });
    expect(fake.collectionEntries(RUNTIME_SUSPENSION_COLLECTIONS.changes)).toHaveLength(
      2,
    );
  });

  it("preserves the newer stop when an old-generation clear races a suspend", async () => {
    const { fake, firestore } = db();
    fake.seed(`${RUNTIME_SUSPENSION_COLLECTIONS.state}/${ACTION_KEY}`, activeRecord());
    fake.armNextCommitBarrier(2);

    const [clearResult, suspendResult] = await Promise.allSettled([
      changeRuntimeActionSuspension(
        admin(),
        suspendInput({ action: "clear", reasonCode: "incident_resolved" }),
        {
          operationId: OPERATION_1,
          expectedSuspensionId: SUSPENSION_1,
        },
        firestore,
        dependencies(),
      ),
      changeRuntimeActionSuspension(
        admin(),
        suspendInput({ reasonCode: "security_containment" }),
        { operationId: OPERATION_2 },
        firestore,
        dependencies(SUSPENSION_2),
      ),
    ]);

    expect(suspendResult).toMatchObject({
      status: "fulfilled",
      value: { status: "suspended", suspensionId: SUSPENSION_2 },
    });
    if (clearResult.status === "rejected") {
      expect(clearResult.reason).toMatchObject({
        code: "runtime_suspension_conflict",
        status: 409,
      });
    } else {
      expect(clearResult.value).toMatchObject({ status: "clear", changed: true });
    }
    expect(
      fake.read(`${RUNTIME_SUSPENSION_COLLECTIONS.state}/${ACTION_KEY}`),
    ).toMatchObject({ suspension_id: SUSPENSION_2 });
    expect(
      fake.read(`${RUNTIME_SUSPENSION_COLLECTIONS.changes}/${OPERATION_2}`),
    ).toMatchObject({
      new_state: "suspended",
      new_suspension_id: SUSPENSION_2,
    });
  });

  it("replays one operation id without a second state change or audit", async () => {
    const { fake, firestore } = db();
    const request = changeRuntimeActionSuspension(
      admin(),
      suspendInput(),
      { operationId: OPERATION_1 },
      firestore,
      dependencies(),
    );
    const first = await request;
    const replay = await changeRuntimeActionSuspension(
      admin(),
      suspendInput(),
      { operationId: OPERATION_1 },
      firestore,
      dependencies(SUSPENSION_2),
    );
    expect(first.changed).toBe(true);
    expect(replay).toMatchObject({
      status: "suspended",
      suspensionId: SUSPENSION_1,
      changed: false,
      replayed: true,
    });
    expect(fake.collectionEntries(RUNTIME_SUSPENSION_COLLECTIONS.changes)).toHaveLength(
      1,
    );
  });

  it("does not reapply a replayed suspend after a later clear", async () => {
    const { fake, firestore } = db();
    await changeRuntimeActionSuspension(
      admin(),
      suspendInput(),
      { operationId: OPERATION_1 },
      firestore,
      dependencies(),
    );
    await changeRuntimeActionSuspension(
      admin(),
      suspendInput({ action: "clear", reasonCode: "incident_resolved" }),
      {
        operationId: OPERATION_2,
        expectedSuspensionId: SUSPENSION_1,
      },
      firestore,
      dependencies(),
    );
    const replay = await changeRuntimeActionSuspension(
      admin(),
      suspendInput(),
      { operationId: OPERATION_1 },
      firestore,
      dependencies(SUSPENSION_2),
    );
    expect(replay).toMatchObject({
      status: "clear",
      changed: false,
      replayed: true,
    });
    expect(
      fake.read(`${RUNTIME_SUSPENSION_COLLECTIONS.state}/${ACTION_KEY}`),
    ).toBeUndefined();
  });

  it("rejects reuse of an operation id with a different fingerprint", async () => {
    const { fake, firestore } = db();
    await changeRuntimeActionSuspension(
      admin(),
      suspendInput(),
      { operationId: OPERATION_1 },
      firestore,
      dependencies(),
    );
    await expect(
      changeRuntimeActionSuspension(
        admin(),
        suspendInput({ reasonCode: "planned_maintenance" }),
        { operationId: OPERATION_1 },
        firestore,
        dependencies(SUSPENSION_2),
      ),
    ).rejects.toMatchObject({
      code: "runtime_suspension_idempotency_conflict",
      status: 409,
    });
    expect(
      fake.read(`${RUNTIME_SUSPENSION_COLLECTIONS.state}/${ACTION_KEY}`),
    ).toMatchObject({ suspension_id: SUSPENSION_1 });
  });

  it("allows an exact-confirmed clear to repair an unreadable target", async () => {
    const { fake, firestore } = db();
    fake.seed(`${RUNTIME_SUSPENSION_COLLECTIONS.state}/${ACTION_KEY}`, {
      ...activeRecord(),
      production_allowed: true,
    });
    await expect(
      changeRuntimeActionSuspension(
        admin(),
        suspendInput({ action: "clear", reasonCode: "incident_resolved" }),
        {
          operationId: OPERATION_1,
          expectedSuspensionId: RUNTIME_SUSPENSION_UNREADABLE_EXPECTATION,
        },
        firestore,
        dependencies(),
      ),
    ).resolves.toMatchObject({ status: "clear", changed: true });
    expect(
      fake.read(`${RUNTIME_SUSPENSION_COLLECTIONS.state}/${ACTION_KEY}`),
    ).toBeUndefined();
    expect(
      fake.read(`${RUNTIME_SUSPENSION_COLLECTIONS.changes}/${OPERATION_1}`),
    ).toMatchObject({ previous_state: "unreadable", new_state: "clear" });
  });

  it("returns 409 for a new clear of an already-clear target", async () => {
    const { firestore } = db();
    await expect(
      changeRuntimeActionSuspension(
        admin(),
        suspendInput({ action: "clear", reasonCode: "incident_resolved" }),
        {
          operationId: OPERATION_1,
          expectedSuspensionId: RUNTIME_SUSPENSION_UNREADABLE_EXPECTATION,
        },
        firestore,
        dependencies(),
      ),
    ).rejects.toMatchObject({
      code: "runtime_suspension_conflict",
      status: 409,
    });
  });

  it("serializes concurrent retries of the same operation to one audit record", async () => {
    const { fake, firestore } = db();
    fake.armNextCommitBarrier(2);
    const results = await Promise.all([
      changeRuntimeActionSuspension(
        admin(),
        suspendInput(),
        { operationId: OPERATION_1 },
        firestore,
        dependencies(SUSPENSION_1),
      ),
      changeRuntimeActionSuspension(
        admin(),
        suspendInput(),
        { operationId: OPERATION_1 },
        firestore,
        dependencies(SUSPENSION_2),
      ),
    ]);
    expect(results.filter((result) => result.changed)).toHaveLength(1);
    expect(results.filter((result) => result.replayed)).toHaveLength(1);
    expect(fake.collectionEntries(RUNTIME_SUSPENSION_COLLECTIONS.changes)).toHaveLength(
      1,
    );
  });

  it("lists strict bound records for an Admin", async () => {
    const { fake, firestore } = db();
    fake.seed(`${RUNTIME_SUSPENSION_COLLECTIONS.state}/${ACTION_KEY}`, activeRecord());
    await expect(listRuntimeActionSuspensions(admin(), firestore)).resolves.toEqual({
      suspensions: [activeRecord()],
      unreadableActionKeys: [],
      hasUnknownRecords: false,
    });
  });

  it("reports a malformed known target as closed without hiding its repair key", async () => {
    const { fake, firestore } = db();
    fake.seed(`${RUNTIME_SUSPENSION_COLLECTIONS.state}/${ACTION_KEY}`, {
      ...activeRecord(),
      production_allowed: true,
    });
    await expect(listRuntimeActionSuspensions(admin(), firestore)).resolves.toEqual({
      suspensions: [],
      unreadableActionKeys: [ACTION_KEY],
      hasUnknownRecords: false,
    });
    await expect(readRuntimeActionSuspension(ACTION_KEY, firestore)).resolves.toBe(
      RUNTIME_SUSPENSION_UNREADABLE,
    );
  });

  it("signals unknown collection records without returning an untrusted document id", async () => {
    const { fake, firestore } = db();
    fake.seed(`${RUNTIME_SUSPENSION_COLLECTIONS.state}/unknown.action`, {
      ...activeRecord("unknown.action"),
    });
    const result = await listRuntimeActionSuspensions(admin(), firestore);
    expect(result).toEqual({
      suspensions: [],
      unreadableActionKeys: [],
      hasUnknownRecords: true,
    });
    expect(JSON.stringify(result)).not.toContain("unknown.action");
  });
});
