// @vitest-environment jsdom
// S280 R-S280-2: one line points to the team's renewal list, on the Dashboard and in My Work's
// empty state, with the count from the same working-batch membership the Renewals desk lists.
// AC-S280-2 and BEH-S280-5 against the count, the server loader (with an injected desk read), the
// rendered line, the Dashboard panel and My Work. Synthetic rows only.
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RenewalTeamLineText } from "@/components/attention/RenewalTeamLine";
import { DashboardAttentionQueue } from "@/components/console/DashboardAttentionQueue";
import { WorkAccountabilityBoard } from "@/components/work/WorkAccountabilityBoard";
import type { AttentionQueue } from "@/lib/attention/attention-queue";
import {
  RENEWAL_TEAM_LINE_HREF,
  renewalTeamLineSentence,
  renewalTeamNextActionCount,
  type RenewalTeamLine,
} from "@/lib/attention/renewal-team-line";
import { loadRenewalTeamLine } from "@/lib/attention/renewal-team-line-read";
import {
  partitionRenewalBatch,
  renewalBatchPlacement,
  type RenewalBatchSourceRow,
} from "@/lib/lease-renewal/renewal-batch";
import type { RenewalTargetProjection } from "@/lib/lease-renewal/renewal-target";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const MONTH = "2026-12";

function target(cycleDateIso: string): RenewalBatchSourceRow {
  return {
    renewalTarget: {
      kind: "target",
      cycleDateIso,
      cycleMonth: cycleDateIso.slice(0, 7),
      statusUnavailable: false,
      keptWorking: false,
      statusName: "Active",
    } as RenewalTargetProjection,
    endDateIso: cycleDateIso,
    retention: { state: "actionable" },
  };
}

function notTarget(reason: string, label: string): RenewalBatchSourceRow {
  return {
    renewalTarget: {
      kind: "not_target",
      reason,
      label,
      statusUnavailable: false,
      statusName: null,
    } as unknown as RenewalTargetProjection,
    endDateIso: "2026-12-31",
    retention: { state: "outside" },
  };
}

/** The desk's working batch for December: 2 carried over, 3 this batch, the rest elsewhere. */
const DESK_ROWS: RenewalBatchSourceRow[] = [
  target("2026-11-30"),
  target("2026-10-31"),
  target("2026-12-31"),
  target("2026-12-15"),
  target("2026-12-01"),
  target("2027-01-31"),
  notTarget("rentvine_closed", "Closed in RentVine"),
  notTarget("completed", "Renewal completed"),
];

describe("S280 AC-S280-2: the count is the desk's working-batch membership", () => {
  it("AC-S280-2: equals the rows the working batch lists for the month (carried over and this batch)", () => {
    const partition = partitionRenewalBatch(
      DESK_ROWS.map((row, index) => ({
        key: `lease-${index}`,
        placement: renewalBatchPlacement(row),
        sortDateIso: row.endDateIso,
        sortLabel: `lease-${index}`,
      })),
      MONTH,
    );
    const listed = partition.counts.carried_over + partition.counts.this_batch;
    expect(renewalTeamNextActionCount(DESK_ROWS, MONTH)).toBe(listed);
    expect(listed).toBe(5);
  });

  it("AC-S280-2: the loader reads the desk once and counts the next working month", async () => {
    const loadDeskRows = vi.fn(async () => DESK_ROWS);
    const line = await loadRenewalTeamLine(
      { uid: "editor-1", role: "Editor", email: "editor@pmikcmetro.com" } as never,
      new Date("2026-11-12T18:20:00.000Z"),
      { loadDeskRows },
    );
    expect(loadDeskRows).toHaveBeenCalledTimes(1);
    expect(line).toEqual({ count: 5, month: MONTH, href: RENEWAL_TEAM_LINE_HREF });
  });

  it("R-S280-2: an unreadable desk shows the line without a count", async () => {
    const user = {
      uid: "editor-1",
      role: "Editor",
      email: "editor@pmikcmetro.com",
    } as never;
    const now = new Date("2026-11-12T18:20:00.000Z");
    expect(
      await loadRenewalTeamLine(user, now, { loadDeskRows: async () => null }),
    ).toMatchObject({ count: null });
    expect(
      await loadRenewalTeamLine(user, now, {
        loadDeskRows: async () => {
          throw new Error("synthetic desk failure");
        },
      }),
    ).toMatchObject({ count: null });
  });

  it("AC-S280-2: the task question keeps its task meaning (the work adapter reads no renewal line)", () => {
    const adapter = readFileSync("lib/assistant/work-adapter.ts", "utf8");
    expect(adapter).not.toContain("renewal-team-line");
    expect(adapter).not.toContain("renewal-follow-through");
  });
});

const LINE: RenewalTeamLine = { count: 12, month: MONTH, href: RENEWAL_TEAM_LINE_HREF };

describe("S280 BEH-S280-5: the rendered line", () => {
  it("R-S280-2: reads the count and links the working batch", () => {
    render(<RenewalTeamLineText line={LINE} />);
    const line = screen.getByTestId("renewal-team-line");
    expect(line).toHaveTextContent(
      "12 renewals have a next action for the team. Open the Renewal Desk.",
    );
    expect(
      within(line).getByRole("link", { name: "Open the Renewal Desk." }),
    ).toHaveAttribute("href", "/lease-renewal/live/desk");
    expect(renewalTeamLineSentence(1)).toBe("1 renewal has a next action for the team.");
    expect(renewalTeamLineSentence(null)).toBe(
      "The Renewal Desk lists the team's next actions.",
    );
  });

  it("BEH-S280-5: with no personal items the Dashboard panel shows the team line with the desk's count", async () => {
    const queue: AttentionQueue = {
      state: "ok",
      rows: [],
      unavailableFeeds: [],
      seeAllHref: "/approval-queue",
      checkedAtIso: "2026-11-12T18:20:00.000Z",
      followThrough: [],
      followThroughState: "ok",
    };
    await act(async () => {
      render(
        <DashboardAttentionQueue
          canApprove={false}
          initial={Promise.resolve(queue)}
          teamLine={Promise.resolve(LINE)}
        />,
      );
    });
    const region = screen.getByRole("region", { name: "Waiting on you" });
    expect(await within(region).findByTestId("renewal-team-line")).toHaveTextContent(
      "12 renewals have a next action for the team. Open the Renewal Desk.",
    );
    expect(
      within(region).getByText("Nothing is waiting on you right now."),
    ).toBeVisible();
  });

  it("BEH-S280-5: My Work's empty state carries the same line and keeps its task wording", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "request-id-1" });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              snapshot: {
                tasks: [],
                editable_task_ids: [],
                sessions: [],
                expectations: [],
                mappings: [],
                server_now: "2026-11-12T18:20:00.000Z",
                record_limit: 500,
                may_be_truncated: false,
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    render(
      <WorkAccountabilityBoard
        emptyAside={<RenewalTeamLineText line={LINE} />}
        mode="mine"
        mutationAllowed={false}
        spaces={[{ id: "lease-renewals", name: "Lease Renewals" }]}
      />,
    );
    expect(await screen.findByText("No tasks assigned")).toBeInTheDocument();
    expect(screen.getByTestId("renewal-team-line")).toHaveTextContent(
      "12 renewals have a next action for the team. Open the Renewal Desk.",
    );
  });
});
