import { describe, expect, it, vi } from "vitest";
import { mapAssuranceReads } from "../../lib/production-assurance/bounded-reads";

describe("bounded independent assurance reads", () => {
  it("overlaps at most three reads and preserves every result in input order", async () => {
    vi.useFakeTimers();
    try {
      let active = 0;
      let peak = 0;
      const seen: number[] = [];
      const pending = mapAssuranceReads(
        [0, 1, 2, 3, 4, 5, 6],
        3,
        new AbortController().signal,
        async (value) => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 70 - value * 9));
          seen.push(value);
          active -= 1;
          return value * 11;
        },
      );
      await vi.runAllTimersAsync();
      expect(await pending).toEqual([0, 11, 22, 33, 44, 55, 66]);
      expect(peak).toBe(3);
      expect(seen.sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(active).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops new reads on cancellation and waits for started reads to settle", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const started: number[] = [];
      const finished: number[] = [];
      const pending = mapAssuranceReads(
        [0, 1, 2, 3, 4, 5],
        3,
        controller.signal,
        async (value) => {
          started.push(value);
          await new Promise((resolve) => setTimeout(resolve, 20 + value * 10));
          finished.push(value);
          return value;
        },
      );
      const rejected = expect(pending).rejects.toThrow();
      controller.abort(new Error("shared_deadline"));
      await vi.runAllTimersAsync();
      await rejected;
      expect(started).toEqual([0, 1, 2]);
      expect(finished).toEqual([0, 1, 2]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retains a failed read and settles its peers without starting replacement reads", async () => {
    vi.useFakeTimers();
    try {
      const started: number[] = [];
      const finished: number[] = [];
      const pending = mapAssuranceReads(
        [0, 1, 2, 3, 4, 5],
        3,
        new AbortController().signal,
        async (value) => {
          started.push(value);
          await new Promise((resolve) => setTimeout(resolve, 10 + value * 10));
          if (value === 0) throw new Error("actual_read_failed");
          finished.push(value);
          return value;
        },
      );
      const rejected = expect(pending).rejects.toThrow("actual_read_failed");
      await vi.runAllTimersAsync();
      await rejected;
      expect(started).toEqual([0, 1, 2]);
      expect(finished).toEqual([1, 2]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the exact predecessor path serial and refuses invalid bounds", async () => {
    const read = vi.fn(async (value: number) => value);
    expect(
      await mapAssuranceReads([3, 2, 1], 1, new AbortController().signal, read),
    ).toEqual([3, 2, 1]);
    for (const bound of [0, -1, 9, 1.5])
      await expect(
        mapAssuranceReads([1], bound, new AbortController().signal, read),
      ).rejects.toThrow("assurance_read_concurrency_invalid");
    const controller = new AbortController();
    controller.abort(new Error("already_cancelled"));
    read.mockClear();
    await expect(mapAssuranceReads([1], 3, controller.signal, read)).rejects.toThrow(
      "already_cancelled",
    );
    expect(read).not.toHaveBeenCalled();
  });
});
