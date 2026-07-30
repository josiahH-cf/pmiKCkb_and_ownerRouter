import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  getInternalTransactionalReceipt,
  recordInternalTransactionalReceipt,
} from "@/lib/firestore/internal-transactional-receipts";
import type { InternalTransactionalReceipt } from "@/lib/notifications/internal-transactional";

const projectId = "pmi-kc-kb-internal-transactional-receipts-test";
let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `internal-receipts-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

describe("internal transactional receipt A2 logging", () => {
  it("emits one opaque value-free event after a failed receipt commits", async () => {
    const failed = receipt({
      recipient: "resident@example.invalid",
      error: "Message body for Tenant Name at Unit 123",
    });
    const observedReceipts: Array<InternalTransactionalReceipt | null> = [];
    const emitAttention = vi.fn(async (event) => {
      observedReceipts.push(await getInternalTransactionalReceipt(failed.dedup_key, db));
      const serialized = JSON.stringify(event);
      for (const forbidden of [
        failed.dedup_key,
        failed.report_id,
        failed.recipient,
        failed.error!,
        "Tenant Name",
        "Unit 123",
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    });

    await expect(
      recordInternalTransactionalReceipt(failed, db, emitAttention),
    ).resolves.toBeUndefined();

    expect(observedReceipts).toEqual([failed]);
    expect(emitAttention).toHaveBeenCalledTimes(1);
    expect(emitAttention).toHaveBeenCalledWith({
      marker: "LIVE_EFFECT_REQUIRES_ATTENTION",
      action_key: "internal.transactional_notice.send",
      execution_id: expect.stringMatching(/^internal_[a-f0-9]{48}$/),
      state: "failed",
      data_mode: "live",
    });

    await expect(
      recordInternalTransactionalReceipt(failed, db, emitAttention),
    ).resolves.toBeUndefined();
    expect(emitAttention).toHaveBeenCalledTimes(1);
  });

  it("emits once for concurrent exact failed-receipt replays", async () => {
    const failed = receipt({});
    const emitAttention = vi.fn();

    await Promise.all([
      recordInternalTransactionalReceipt(failed, db, emitAttention),
      recordInternalTransactionalReceipt(failed, db, emitAttention),
    ]);

    expect(emitAttention).toHaveBeenCalledTimes(1);
    await expect(getInternalTransactionalReceipt(failed.dedup_key, db)).resolves.toEqual(
      failed,
    );
  });

  it("does not emit for a delivered receipt", async () => {
    const delivered = receipt({ delivered: true, error: undefined });
    const emitAttention = vi.fn();

    await recordInternalTransactionalReceipt(delivered, db, emitAttention);

    expect(emitAttention).not.toHaveBeenCalled();
    await expect(
      getInternalTransactionalReceipt(delivered.dedup_key, db),
    ).resolves.toEqual(delivered);
  });

  it("emits once for each distinct failed retry, not for an exact replay", async () => {
    const first = receipt({});
    const second = receipt({
      attempted_at: "2026-07-30T00:01:00.000Z",
      error: "second synthetic failure",
    });
    const emitAttention = vi.fn();

    await recordInternalTransactionalReceipt(first, db, emitAttention);
    await recordInternalTransactionalReceipt(second, db, emitAttention);
    await recordInternalTransactionalReceipt(second, db, emitAttention);

    expect(emitAttention).toHaveBeenCalledTimes(2);
    await expect(getInternalTransactionalReceipt(second.dedup_key, db)).resolves.toEqual(
      second,
    );
  });

  it("keeps the committed failed receipt when the alert sink rejects", async () => {
    const failed = receipt({});
    const emitAttention = vi.fn(async () => {
      throw new Error("fixture alert sink unavailable");
    });

    await expect(
      recordInternalTransactionalReceipt(failed, db, emitAttention),
    ).resolves.toBeUndefined();

    expect(emitAttention).toHaveBeenCalledTimes(1);
    await expect(getInternalTransactionalReceipt(failed.dedup_key, db)).resolves.toEqual(
      failed,
    );
  });
});

function receipt(
  overrides: Partial<InternalTransactionalReceipt>,
): InternalTransactionalReceipt {
  return {
    dedup_key: "support_report:0198f2c8-4f89-7a20-8f61-1e1d42af3ff1:filed",
    action_key: "internal.transactional_notice.send",
    report_id: "0198f2c8-4f89-7a20-8f61-1e1d42af3ff1",
    recipient: "ops@pmikcmetro.com",
    delivered: false,
    attempted_at: "2026-07-30T00:00:00.000Z",
    error: "synthetic failure",
    ...overrides,
  };
}
