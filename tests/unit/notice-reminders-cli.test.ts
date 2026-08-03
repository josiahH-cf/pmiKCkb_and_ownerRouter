import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  loadLiveReminderLeases,
  parseNoticeRemindersArgs,
  reminderLeasesFromDesk,
} from "@/scripts/run-notice-reminders";
import { getRenewalDeskView } from "@/tests/helpers/sample-desk";

describe("notice-reminders Live-only input", () => {
  it("maps a caller-supplied desk view without constructing records", () => {
    const leases = reminderLeasesFromDesk(getRenewalDeskView());
    expect(leases).toHaveLength(5);
    expect(leases.every((lease) => lease.leaseEndDateIso !== null)).toBe(true);
  });

  it("reads Live facts over a bounded window derived from the requested date", async () => {
    const loader = vi.fn(async () => ({
      status: "ok" as const,
      view: getRenewalDeskView(),
    }));
    await expect(loadLiveReminderLeases("2026-07-14", loader)).resolves.toHaveLength(5);
    expect(loader).toHaveBeenCalledWith(
      [{ startIso: "2026-07-14", endIso: "2026-11-11" }],
      "2026-07-14T00:00:00.000Z",
    );
  });

  it("fails closed when Live sources are unavailable", async () => {
    const loader = vi.fn(async () => ({ status: "read_error" as const }));
    await expect(loadLiveReminderLeases("2026-07-14", loader)).rejects.toThrow(
      "Live renewal reminder data is unavailable (read_error).",
    );
    expect(loader).toHaveBeenCalledOnce();
  });

  it("retires the fixture-mode flag and deleted sample import", () => {
    expect(() => parseNoticeRemindersArgs(["--live"], "2026-07-14")).toThrow(
      "Unknown argument: --live",
    );
    const source = readFileSync(
      join(process.cwd(), "scripts/run-notice-reminders.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /sample-desk|sampleReminderLeases|DEFAULT_NOTICE_RULE_SET/,
    );
  });
});
