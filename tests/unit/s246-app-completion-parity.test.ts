import { afterEach, describe, expect, it, vi } from "vitest";

// S246 R-S246-1: the desk row and the lease page reach one verdict from one target definition,
// including for a completion saved in the app. That completion counts only when the current-source
// renewal process verifies it. Building a synthetic lease whose every live evidence key verifies
// is the subject of the S72/S111 suites; here the process projection reports the named leases
// complete, so this file tests only that both surfaces read that one verified fact the same way.
// Values are synthetic.

const verified = vi.hoisted(() => new Set<string>());
vi.mock("@/lib/lease-renewal/renewal-process", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/lease-renewal/renewal-process")>();
  return {
    ...original,
    projectRenewalProcess: (
      input: Parameters<typeof original.projectRenewalProcess>[0],
    ): ReturnType<typeof original.projectRenewalProcess> => {
      const projection = original.projectRenewalProcess(input);
      const ref = input.evidence?.["lease-tracked"]?.ref ?? "";
      const leaseId = /^rentvine:lease:(.+):tracked$/.exec(ref)?.[1];
      return leaseId && verified.has(leaseId)
        ? { ...projection, status: "complete" }
        : projection;
    },
  };
});

import {
  renewalBatchGroupFor,
  renewalBatchPlacement,
} from "@/lib/lease-renewal/renewal-batch";
import { renewalTargetLine } from "@/lib/lease-renewal/renewal-target";
import {
  S246_APP_COMPLETED,
  S246_LEASES,
  S246_WORKING_MONTH,
  loadS246Desk,
  loadS246Workspace,
  s246AppProgress,
  s246Row,
  s246RowsWithAppCompletion,
} from "@/tests/helpers/s246-portfolio";

afterEach(() => verified.clear());

describe("S246 an app-recorded completion reads the same on the desk and the lease page (R-S246-1)", () => {
  it("a verified app completion on a lease that ended before the window is Completed on both", async () => {
    verified.add(S246_APP_COMPLETED);
    const options = {
      rows: s246RowsWithAppCompletion(),
      progress: s246AppProgress(),
    };
    const page = await loadS246Workspace(S246_APP_COMPLETED, options);
    const row = s246Row(await loadS246Desk(options), S246_APP_COMPLETED);
    expect(page.summary.renewalTarget).toEqual({
      kind: "not_target",
      reason: "completed",
      label: "Renewal completed, recorded in the app",
      statusUnavailable: false,
      statusName: "Active",
    });
    // The desk row carries the verdict its lease page shows, so the batch never lists it as
    // carried over while the lease says it is complete.
    expect(row.renewalTarget).toEqual(page.summary.renewalTarget);
    expect(renewalBatchGroupFor(renewalBatchPlacement(row), S246_WORKING_MONTH)).toBe(
      "completed",
    );
    expect(renewalTargetLine(row.renewalTarget!)).toBe(
      renewalTargetLine(page.summary.renewalTarget!),
    );
  });

  it("a saved completion the current evidence does not verify stays a target on both", async () => {
    const options = { progress: s246AppProgress([S246_LEASES.endedWithoutOutcome]) };
    const page = await loadS246Workspace(S246_LEASES.endedWithoutOutcome, options);
    const row = s246Row(await loadS246Desk(options), S246_LEASES.endedWithoutOutcome);
    expect(page.summary.renewalTarget).toMatchObject({
      kind: "target",
      cycleMonth: "2026-10",
    });
    expect(row.renewalTarget).toEqual(page.summary.renewalTarget);
    expect(renewalBatchGroupFor(renewalBatchPlacement(row), S246_WORKING_MONTH)).toBe(
      "carried_over",
    );
  });

  it("a verified app completion inside the window is Completed on both, as before", async () => {
    verified.add(S246_LEASES.activeInMonth);
    const options = { progress: s246AppProgress([S246_LEASES.activeInMonth]) };
    const page = await loadS246Workspace(S246_LEASES.activeInMonth, options);
    const row = s246Row(await loadS246Desk(options), S246_LEASES.activeInMonth);
    expect(page.summary.renewalTarget).toMatchObject({ reason: "completed" });
    expect(row.renewalTarget).toEqual(page.summary.renewalTarget);
  });
});
