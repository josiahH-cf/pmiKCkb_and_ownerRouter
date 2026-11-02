import { open } from "node:fs/promises";

/** Clock intervals do not depend on the host log's timezone; freshness uses file metadata. */
export function assessWslgCrashLoop(log, modifiedAtMs, nowMs = Date.now()) {
  if (
    !Number.isFinite(modifiedAtMs) ||
    nowMs - modifiedAtMs > 180_000 ||
    modifiedAtMs - nowMs > 30_000
  )
    return { state: "not_observed" };
  const clocks = String(log)
    .split("\n")
    .filter((line) => line.includes("weston") && line.includes("signal 11"))
    .flatMap((line) => {
      const match = /^\[(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)\]/.exec(line);
      return match
        ? [Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])]
        : [];
    })
    .slice(-3);
  if (clocks.length !== 3) return { state: "not_observed" };
  const allClocks = String(log)
    .split("\n")
    .flatMap((line) => {
      const match = /^\[(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)\]/.exec(line);
      return match
        ? [Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])]
        : [];
    });
  const newestClock = allClocks.at(-1);
  if (newestClock !== undefined && (newestClock - clocks.at(-1) + 86400) % 86400 > 180)
    return { state: "not_observed" };
  const gaps = clocks
    .slice(1)
    .map((clock, index) => (clock - clocks[index] + 86400) % 86400);
  return gaps.every((gap) => gap > 0 && gap <= 180)
    ? { state: "crash_loop", recentCrashCount: 3 }
    : { state: "not_observed" };
}

/** Read a bounded tail of WSLg's own log. No provider/session/profile data is inspected. */
export async function readWslgDisplayHealth() {
  let file;
  try {
    file = await open("/mnt/wslg/stderr.log", "r");
    const info = await file.stat();
    const length = Math.min(info.size, 128 * 1024);
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, info.size - length);
    return assessWslgCrashLoop(buffer.toString("utf8"), info.mtimeMs);
  } catch {
    return { state: "not_observed" };
  } finally {
    await file?.close();
  }
}
