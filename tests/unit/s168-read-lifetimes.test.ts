import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { listCurrentRenewalPacketSnapshots } from "@/lib/firestore/lease-document-packet-snapshots";
import { readRenewalAuxiliary } from "@/lib/lease-renewal/auxiliary-read";

const actor = {
  uid: "fixture-admin",
  email: "fixture-admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};

describe("S168 owning read lifetimes", () => {
  it.each(["cold_fixture", "warm_fixture"] as const)(
    "S168 comparable %s packet-head/snapshot/projection workload",
    async (temperature) => {
      const delayMs = temperature === "cold_fixture" ? 40 : 10;
      let batches = 0;
      const db = {
        collection: (name: string) => ({ doc: (id: string) => ({ name, id }) }),
        getAll: async () => {
          const batch = ++batches;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return batch === 1
            ? [
                {
                  exists: true,
                  data: () => ({
                    lease_id: "7001",
                    transaction_id: "7001",
                    snapshot_id: "snapshot-1",
                  }),
                },
              ]
            : [];
        },
      } as unknown as Firestore;
      const start = performance.now();
      await listCurrentRenewalPacketSnapshots(actor, ["7001"], db);
      expect(batches).toBe(3);
      console.info(
        JSON.stringify({
          event: "batch005_fixture_benchmark",
          temperature,
          adapterDelayMs: delayMs,
          packetMs: Math.round(performance.now() - start),
          batches,
          environment:
            "native ready-process unit; deterministic adapters; not live service latency",
        }),
      );
    },
  );
  it("starts the independent immutable packet and execution batches together after validated heads", async () => {
    let finish!: (value: unknown[]) => void;
    const firstBatch = new Promise<unknown[]>((resolve) => {
      finish = resolve;
    });
    const calls: string[] = [];
    const db = {
      collection: (name: string) => ({ doc: (id: string) => ({ name, id }) }),
      getAll: vi.fn(async (...refs: { name: string; id: string }[]) => {
        calls.push(refs[0].name);
        if (calls.length === 1)
          return [
            {
              exists: true,
              data: () => ({
                lease_id: "7001",
                transaction_id: "7001",
                snapshot_id: "snapshot-1",
              }),
            },
          ];
        if (calls.length === 2) return firstBatch;
        return [];
      }),
    } as unknown as Firestore;
    const pending = listCurrentRenewalPacketSnapshots(actor, ["7001"], db);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    try {
      expect(calls).toHaveLength(3);
    } finally {
      finish([]);
      await pending;
    }
  });

  it("reports a stalled auxiliary source as failed within its owning deadline, never as empty", async () => {
    vi.useFakeTimers();
    let settled = false;
    try {
      const read = readRenewalAuxiliary("progress", () => new Promise<never>(() => {}), {
        waitMs: 100,
      });
      void read.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(101);
      expect(settled).toBe(true);
      expect(await read).toEqual({ key: "progress", status: "failed" });
    } finally {
      vi.useRealTimers();
    }
  });
});
