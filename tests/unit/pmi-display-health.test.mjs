import { describe, expect, it, vi } from "vitest";
import { assessWslgCrashLoop } from "../../scripts/auth/display-health.mjs";
import { resolveAttendedDisplay } from "../../scripts/auth/display.mjs";

const line = (clock) =>
  `[${clock}] WSLGd: pid 123 terminated with signal 11, /usr/bin/weston --backend=rdp-backend.so`;
describe("WSLg compositor crash detection", () => {
  it("recognizes the observed recent 110-second signal-11 loop without reading credentials", () => {
    const log = [line("12:01:29.307"), line("12:03:19.124"), line("12:05:11.420")].join(
      "\n",
    );
    expect(assessWslgCrashLoop(log, 1000000, 1001000)).toMatchObject({
      state: "crash_loop",
      recentCrashCount: 3,
    });
  });
  it("does not treat stale crashes, sparse crashes or unrelated process errors as a current loop", () => {
    const log = [line("12:01:29.307"), line("12:03:19.124"), line("12:05:11.420")].join(
      "\n",
    );
    expect(assessWslgCrashLoop(log, 1000000, 1200000).state).toBe("not_observed");
    expect(
      assessWslgCrashLoop(
        [line("12:01:29"), line("12:13:19"), line("12:25:11")].join("\n"),
        1000,
        1001,
      ).state,
    ).toBe("not_observed");
    expect(
      assessWslgCrashLoop(log.replaceAll("weston", "unrelated"), 1000, 1001).state,
    ).toBe("not_observed");
  });
  it("does not keep an old crash loop active after later healthy startup messages", () => {
    const log = [
      line("12:01:29"),
      line("12:03:19"),
      line("12:05:11"),
      "[12:15:00] WSLGd: new healthy startup",
    ].join("\n");
    expect(assessWslgCrashLoop(log, 1000, 1001).state).toBe("not_observed");
  });
  it("recognizes consecutive crashes across local midnight without assuming UTC", () => {
    expect(
      assessWslgCrashLoop(
        [line("23:58:00"), line("23:59:50"), line("00:01:40")].join("\n"),
        1000,
        1001,
      ).state,
    ).toBe("crash_loop");
  });
  it("blocks attended launch before profile ownership or socket probing when the compositor is crashing", async () => {
    const probe = vi.fn(async () => true);
    const result = await resolveAttendedDisplay(
      { WSL_DISTRO_NAME: "Ubuntu", DISPLAY: ":0" },
      probe,
      async () => ({ state: "crash_loop" }),
    );
    expect(result).toMatchObject({ ready: false, code: "display_compositor_crash_loop" });
    expect(probe).not.toHaveBeenCalled();
  });
});
