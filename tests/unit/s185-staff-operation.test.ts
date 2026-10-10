import { it, expect, vi } from "vitest";
import {
  observeStaffOperation,
  operationStage,
  compositionRecordRead,
} from "@/lib/observability/staff-operation";
it("keeps concurrent request stages separate and reports only sanitized counts and times", async () => {
  const records: unknown[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slow = observeStaffOperation(
    "maintenance_edit",
    1,
    () =>
      operationStage("commit", async () => {
        await held;
        return "private customer words";
      }),
    (r) => records.push(r),
  );
  await observeStaffOperation(
    "communications_prepare",
    0,
    () => operationStage("source_read", async () => "private mailbox@example.test"),
    (r) => records.push(r),
  );
  release();
  await slow;
  expect(records).toEqual([
    expect.objectContaining({
      operation: "communications_prepare",
      userActions: 0,
      stages: {
        source_read: expect.objectContaining({ calls: 1, completed: 1, failed: 0 }),
      },
    }),
    expect.objectContaining({
      operation: "maintenance_edit",
      userActions: 1,
      stages: { commit: expect.objectContaining({ calls: 1, completed: 1, failed: 0 }) },
    }),
  ]);
  expect(JSON.stringify(records)).not.toMatch(/private|customer|mailbox|example/);
});
it("counts failed stages and preserves the exact original error without logging it", async () => {
  const emit = vi.fn();
  const failure = new Error("private provider credential response");
  await expect(
    observeStaffOperation(
      "maintenance_provider_update",
      1,
      () =>
        operationStage("provider_dispatch", async () => {
          throw failure;
        }),
      emit,
    ),
  ).rejects.toBe(failure);
  expect(emit).toHaveBeenCalledWith(
    expect.objectContaining({
      outcome: "failed",
      stages: { provider_dispatch: expect.objectContaining({ calls: 1, failed: 1 }) },
    }),
  );
  expect(JSON.stringify(emit.mock.calls)).not.toContain(failure.message);
});
it("never turns diagnostic sink failure into a retryable operation failure", async () => {
  await expect(
    observeStaffOperation(
      "maintenance_edit",
      1,
      async () => "committed",
      () => {
        throw Error("sink unavailable");
      },
    ),
  ).resolves.toBe("committed");
});
it("distinguishes HTTP refusal while retaining completed stage counts", async () => {
  const emit = vi.fn();
  await observeStaffOperation(
    "maintenance_read",
    0,
    () =>
      operationStage("permission", async () =>
        Response.json({ error: "Forbidden" }, { status: 403 }),
      ),
    emit,
  );
  expect(emit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "refused" }));
});

it("coalesces only compatible app history reads in a read-only composition request", async () => {
  const read = vi.fn(async () => ({ version: 1 })),
    base = {
      actorUid: "one",
      authorityFingerprint: "editor:renewals",
      recordKey: "sequence:one",
      configVersion: "v1",
    };
  const records: unknown[] = [];
  await observeStaffOperation(
    "communications_prepare",
    0,
    async () => {
      const [a, b] = await Promise.all([
        compositionRecordRead(base, read),
        compositionRecordRead({ ...base }, read),
      ]);
      expect(a).toEqual(b);
      expect(read).toHaveBeenCalledTimes(1);
      for (const changed of [
        { actorUid: "two" },
        { authorityFingerprint: "admin:renewals" },
        { recordKey: "sequence:two" },
        { configVersion: "v2" },
      ])
        await compositionRecordRead({ ...base, ...changed }, read);
    },
    (r) => records.push(r),
  );
  expect(read).toHaveBeenCalledTimes(5);
  expect(records[0]).toMatchObject({ coalescedReads: 1 });
  await observeStaffOperation(
    "communications_prepare",
    0,
    () => compositionRecordRead(base, read),
    () => {},
  );
  expect(read).toHaveBeenCalledTimes(6);
  await observeStaffOperation(
    "maintenance_provider_update",
    1,
    async () => {
      await compositionRecordRead(base, read);
      await compositionRecordRead(base, read);
    },
    () => {},
  );
  expect(read).toHaveBeenCalledTimes(8);
});
it("does not retain a failed compatible read as an authority or successful history snapshot", async () => {
  const read = vi
    .fn()
    .mockRejectedValueOnce(Error("Private source failure"))
    .mockResolvedValue({ version: 2 });
  const key = {
    actorUid: "one",
    authorityFingerprint: "editor",
    recordKey: "sequence:one",
    configVersion: "v1",
  };
  await observeStaffOperation(
    "communications_prepare",
    0,
    async () => {
      await expect(compositionRecordRead(key, read)).rejects.toThrow();
      await expect(compositionRecordRead(key, read)).resolves.toEqual({ version: 2 });
    },
    () => {},
  );
  expect(read).toHaveBeenCalledTimes(2);
});
