import type { Firestore } from "firebase-admin/firestore";
import { afterEach, it, expect, vi } from "vitest";
import { readApplicationDisplayName } from "@/lib/firestore/presentation-settings";
const db = (get: () => Promise<unknown>) =>
  ({ collection: () => ({ doc: () => ({ get }) }) }) as unknown as Firestore;
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("reads each current display version and blank default without retaining a previous request's value", async () => {
  const get = vi
    .fn()
    .mockResolvedValueOnce({
      exists: true,
      data: () => ({ version: 1, displayName: "First fixture workspace" }),
    })
    .mockResolvedValueOnce({
      exists: true,
      data: () => ({ version: 2, displayName: "Current fixture workspace" }),
    })
    .mockResolvedValueOnce({
      exists: true,
      data: () => ({ version: 3, displayName: "" }),
    });
  const store = db(get);
  expect(await readApplicationDisplayName(store)).toBe("First fixture workspace");
  expect(await readApplicationDisplayName(store)).toBe("Current fixture workspace");
  expect(await readApplicationDisplayName(store)).toBe("PMI KC KB");
  expect(get).toHaveBeenCalledTimes(3);
});
it("bounds an unavailable public presentation read at 1500ms and omits the source error from diagnostics", async () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, "info").mockImplementation(() => {}),
    get = vi.fn(() => new Promise(() => {}));
  const pending = readApplicationDisplayName(db(get));
  await vi.advanceTimersByTimeAsync(1499);
  let finished = false;
  void pending.then(() => {
    finished = true;
  });
  await Promise.resolve();
  expect(finished).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toBe("PMI KC KB");
  expect(log).toHaveBeenLastCalledWith(
    JSON.stringify({ event: "presentation_read", outcome: "deadline" }),
  );
  expect(get).toHaveBeenCalledTimes(1);
  const failed = readApplicationDisplayName(
    db(async () => {
      throw Error("private provider values must not appear");
    }),
  );
  expect(await failed).toBe("PMI KC KB");
  expect(log).toHaveBeenLastCalledWith(
    JSON.stringify({ event: "presentation_read", outcome: "unavailable" }),
  );
  expect(JSON.stringify(log.mock.calls)).not.toContain("private provider");
});
