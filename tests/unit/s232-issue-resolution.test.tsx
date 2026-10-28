// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import { renewalFocusStateText } from "@/components/lease-renewal/RenewalFocusViewPane";
import { RenewalIssueResolution } from "@/components/lease-renewal/RenewalIssueResolution";
import type { RenewalAction } from "@/lib/lease-renewal/renewal-actions";
import type { DeskLeaseSummaryBase } from "@/lib/lease-renewal/desk-model";
import {
  ADMIN_TIMING_BASIS_HREF,
  RENEWAL_ISSUE_KINDS,
  projectRenewalIssues,
  type RenewalIssue,
  type RenewalIssueInput,
} from "@/lib/lease-renewal/renewal-issues";
import {
  focusPane,
  renderWorkspace,
  stubRenewalRoutes,
} from "@/tests/helpers/focus-workspace";
import { actionFixture, manualFixture } from "@/tests/helpers/renewal-action-fixtures";

// S232 R-S232-5 (BEH-S232-4, AC-S232-3): every issue names the missing input by its visible label,
// who resolves it (the person the app records, otherwise the role) and a working in-app link, the
// page's own refresh, or an explicit "outside the app" statement; the issue list and Focus state
// the same. Synthetic records only; nothing here reaches a provider.

afterEach(cleanup);

const LEASE = "lease-318-cedar-7";
const awaitingOwner = manualFixture({ owner: "no_response", done: ["owner_outreach"] });

function input(
  patch: {
    manual?: NonNullable<Parameters<typeof actionFixture>[0]>["manual"];
    summary?: Partial<DeskLeaseSummaryBase>;
    guidance?: Partial<RenewalIssueInput["guidance"]>;
  } & Partial<Omit<RenewalIssueInput, "summary" | "guidance">> = {},
): RenewalIssueInput {
  const { workspace } = actionFixture({ manual: patch.manual ?? null });
  return {
    guidance: { ...workspace.guidance, ...patch.guidance },
    summary: { ...workspace.summary, ...patch.summary },
    readComplete: patch.readComplete ?? true,
    currencyState: patch.currencyState ?? "fresh",
    progressStateAvailable: patch.progressStateAvailable ?? true,
    sheetWritebackPaused: patch.sheetWritebackPaused ?? false,
  };
}

const timing = (state: string, reason: string) =>
  ({
    state,
    reason,
    label: state === "below" ? "Below 30 days" : "Cannot determine",
  }) as unknown as DeskLeaseSummaryBase["moveOutTiming"];
const moveOut = (reason: string) =>
  ({
    state: "unknown",
    reason,
    label: "Move-out status could not be confirmed.",
  }) as unknown as DeskLeaseSummaryBase["moveOut"];
const SOURCE = {
  kind: "gmail_thread" as const,
  linkId: "link-1",
  threadId: "thread-1",
  messageId: "message-1",
  purpose: "renewal_owner" as const,
};

/**
 * Every issue the projection produces for these inputs, by id; a tagged input's issues carry the
 * tag, since the timing variants share one id.
 */
function issuesOf(
  ...inputs: (RenewalIssueInput | readonly [string, RenewalIssueInput])[]
): Map<string, RenewalIssue> {
  return new Map(
    inputs.flatMap((entry) => {
      const [tag, value] = Array.isArray(entry)
        ? entry
        : [null, entry as RenewalIssueInput];
      return projectRenewalIssues(value).issues.map(
        (issue) => [tag ? `${issue.id}#${tag}` : issue.id, issue] as const,
      );
    }),
  );
}

const ALL = () => {
  const { workspace } = actionFixture({ manual: awaitingOwner });
  const tenantThread = {
    ...(workspace.summary.followUp ?? workspace.followUp!),
    waiting: { state: "verified" as const, party: "tenant" as const, source: SOURCE },
  };
  return issuesOf(
    input({
      manual: awaitingOwner,
      // The owner the source records; an unverified label is never named as a person.
      summary: { ownerNameLabels: ["Sample Owner LLC", "Needs Verification"] },
    }),
    input({ manual: awaitingOwner, summary: { followUp: tenantThread } }),
    input({ readComplete: false }),
    input({ currencyState: "expired" }),
    input({ progressStateAvailable: false }),
    input({
      guidance: {
        rentVerification: {
          state: "unavailable",
          verifiedByResolutionDiffers: false,
          destination: { kind: "workspace_phase", stepId: "verify-renewal" },
        },
      },
    }),
    input({ summary: { moveOut: moveOut("status_table_unavailable") } }),
    input({ summary: { moveOut: moveOut("withdrawal_review_required") } }),
    input({
      summary: {
        cycleSourceDate: {
          state: "changed",
          recordedIso: "2026-12-31",
          currentIso: "2027-01-31",
          label: "Source date changed",
        } as unknown as DeskLeaseSummaryBase["cycleSourceDate"],
      },
    }),
    [
      "basis",
      input({
        summary: { moveOutTiming: timing("cannot_determine", "basis_not_reviewed") },
      }),
    ],
    [
      "missing",
      input({
        summary: { moveOutTiming: timing("cannot_determine", "notice_date_missing") },
      }),
    ],
    [
      "stale",
      input({ summary: { moveOutTiming: timing("cannot_determine", "source_stale") } }),
    ],
    ["below", input({ summary: { moveOutTiming: timing("below", "below_threshold") } })],
    input({ sheetWritebackPaused: true }),
  );
};

describe("S232 actionable issues (R-S232-5)", () => {
  it("names the input, a person or role and a link or an outside-the-app statement for every issue", () => {
    const issues = ALL();
    // Every issue kind but a guidance blocker (no longer produced since S156) is reached.
    expect(new Set([...issues.values()].map((issue) => issue.kind))).toEqual(
      new Set(RENEWAL_ISSUE_KINDS.filter((kind) => kind !== "blocking")),
    );
    for (const issue of issues.values()) {
      expect(issue.needs, issue.id).toMatch(/\S/);
      expect(issue.responsible, issue.id).toMatch(/\S/);
      const at = issue.resolveAt;
      if (at.kind === "outside_app") expect(at.statement, issue.id).toMatch(/\S/);
      else expect(at.label, issue.id).toMatch(/\S/);
    }
    expect(issues.size).toBe(14);
  });

  it("names the owner the source records, the Admin timing panel and each refresh", () => {
    const issues = ALL();
    expect(issues.get("waiting:external")).toMatchObject({
      needs: "The owner's answer",
      responsible: "the owner (Sample Owner LLC)",
      resolveAt: {
        kind: "control",
        label: "Record the owner's answer when it arrives",
        destination: {
          kind: "workspace_phase",
          controlId: "renewal-manual-owner_response",
        },
      },
    });
    // The staff record and the linked thread disagree: a check with both facts, not a party.
    expect(issues.get("advisory:waiting_check")).toMatchObject({
      reason:
        "Needs a check. The staff record says waiting on the owner; the linked Gmail thread says waiting on the tenant.",
      needs: "Who has the move on this renewal",
      resolveAt: { kind: "control", label: "Review the staff record" },
    });
    expect(issues.get("advisory:notice_timing:cannot_determine#basis")).toMatchObject({
      needs: "The reviewed move-out timing basis",
      responsible: "an Admin (record the reviewed timing basis)",
      resolveAt: {
        kind: "page",
        label: "Record the timing basis in Admin",
        href: ADMIN_TIMING_BASIS_HREF,
      },
    });
    for (const id of [
      "source:read_incomplete",
      "source:expired",
      "source:progress_unreadable",
      "advisory:notice_timing:cannot_determine#stale",
      "move_out:status_table_unavailable",
    ])
      expect(issues.get(id)?.resolveAt.kind, id).toBe("refresh");
    // Dates and a move-out status that are wrong in RentVine are fixed there.
    for (const id of [
      "advisory:notice_timing:cannot_determine#missing",
      "move_out:withdrawal_review_required",
    ])
      expect(issues.get(id)?.resolveAt.kind, id).toBe("outside_app");
    expect(issues.get("advisory:notice_timing:below#below")?.resolveAt).toMatchObject({
      kind: "control",
      label: "Open the non-renewal handoff",
    });
    expect(issues.get("policy:sheet_writeback_paused")?.resolveAt).toEqual({
      kind: "outside_app",
      statement: "The owner changes this policy; nothing in the app lifts the pause.",
    });
    // The Admin link's target is the panel that records the basis.
    const admin = readFileSync(join(process.cwd(), "app/admin/page.tsx"), "utf8");
    expect(ADMIN_TIMING_BASIS_HREF).toBe("/admin#admin-move-out-timing-basis");
    expect(admin).toMatch(
      /id="admin-move-out-timing-basis"[^>]*>\s*<MoveOutTimingBasisAdminPanel/,
    );
  });

  it("renders each resolution as text and a working link, never a bare disabled control", async () => {
    const issues = ALL();
    const mount = (id: string) =>
      render(
        <RenewalIssueResolution
          deskView={null}
          issue={issues.get(id)!}
          leaseId={LEASE}
        />,
      );
    // A control on another page of the app.
    mount("advisory:notice_timing:cannot_determine#basis");
    expect(screen.getByText(/^Needs: /)).toHaveTextContent(
      "Needs: The reviewed move-out timing basis. Resolved by: an Admin (record the reviewed timing basis).",
    );
    expect(
      screen.getByRole("link", { name: "Record the timing basis in Admin" }),
    ).toHaveAttribute("href", "/admin#admin-move-out-timing-basis");
    cleanup();
    // A control on this lease's page.
    mount("waiting:external");
    expect(
      screen
        .getByRole("link", { name: "Record the owner's answer when it arrives" })
        .getAttribute("href"),
    ).toMatch(/#renewal-manual-owner_response$/);
    cleanup();
    // Resolved outside the app: said in words, with no control to press.
    mount("policy:sheet_writeback_paused");
    expect(
      screen.getByText(
        "Outside the app: The owner changes this policy; nothing in the app lifts the pause.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    // A refresh uses the page's own source refresh.
    const refreshed = vi.fn();
    render(
      <>
        <button id="renewal-refresh" onClick={refreshed} type="button">
          Refresh data
        </button>
        <RenewalIssueResolution
          deskView={null}
          issue={issues.get("source:expired")!}
          leaseId={LEASE}
        />
      </>,
    );
    await userEvent.setup().click(
      screen.getByRole("link", {
        name: "Refresh this lease to read the sources again",
      }),
    );
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it("names who records each prerequisite of an action that starts after earlier work", () => {
    const blocked = {
      id: "evidence.verify-base-rent",
      status: "dependency_blocked",
      blockedBy: ["evidence.verify-lease-identity", "evidence.verify-end-date"],
      unmetConditions: [],
    } as unknown as RenewalAction;
    const labels = (id: string) =>
      id === "evidence.verify-lease-identity"
        ? "Verify the lease identity"
        : "Verify the end date";
    expect(
      renewalFocusStateText(blocked, labels, [], (id) =>
        id === "evidence.verify-end-date" ? "an Approver or Admin" : "an Editor",
      ),
    ).toBe(
      "Starts after: Verify the lease identity (an Editor), Verify the end date (an Approver or Admin).",
    );
  });

  it("states the same resolution in the issue list and in Focus for the same lease", async () => {
    stubRenewalRoutes(awaitingOwner);
    const { workspace } = actionFixture({ manual: awaitingOwner });
    await renderWorkspace({
      workspace: {
        ...workspace,
        summary: {
          ...workspace.summary,
          moveOutTiming: timing("cannot_determine", "basis_not_reviewed"),
        },
      },
      manual: awaitingOwner,
    });
    const id = "advisory:notice_timing:cannot_determine";
    const inList = document.querySelector<HTMLElement>(
      `.renewal-issue-list [data-renewal-issue-id="${id}"] .renewal-issue-resolution`,
    );
    const inFocus = within(focusPane())
      .getByText(/Notice timing/)
      .closest("li")
      ?.querySelector<HTMLElement>(".renewal-issue-resolution");
    expect(inList).not.toBeNull();
    expect(inFocus?.textContent).toBe(inList?.textContent);
    expect(
      within(inFocus!).getByRole("link", { name: "Record the timing basis in Admin" }),
    ).toHaveAttribute("href", ADMIN_TIMING_BASIS_HREF);
  });
});
