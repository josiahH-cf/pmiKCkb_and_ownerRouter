// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RenewalDecider } from "@/components/lease-renewal/RenewalDecider";
import type { RenewalFlagView, RenewalRunView } from "@/lib/lease-renewal/run-view";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

beforeEach(() => {
  refresh.mockClear();
});

function flag(key: string, label: string): RenewalFlagView {
  return {
    sourceTriggerKey: key,
    fieldKey: key,
    fieldLabel: label,
    severity: "Medium",
    agreement: "conflict",
    actionNeeded: "Choose the source to keep.",
    directLink: `/lease-renewal/runs/run-1?flag=${key}`,
    suggestedWinner: { source: "rentvine", value: "$1,250" },
    candidates: [
      {
        source: "rentvine",
        sourceSystem: "RentVine",
        value: "$1,250",
        confidence: "Verified",
      },
      {
        source: "sheet",
        sourceSystem: "Sheet",
        value: "$1,225",
        confidence: "Needs Verification",
      },
    ],
    resolution: null,
    writeback: null,
    writebackApproval: null,
  };
}

function view(flags: RenewalFlagView[]): RenewalRunView {
  return {
    runId: "run-1",
    label: "Run 1",
    manifest: {
      tabsRecognized: 1,
      tabsUnrecognized: 2,
      credentialTabsExcluded: 3,
      credentialScrubHits: 4,
      dividerRowsDropped: 5,
      totalRecords: 6,
    },
    excludedTabs: [],
    groups: [{ severity: "Medium", flags }],
    totalFlags: flags.length,
    resolvedCount: 0,
  };
}

function progressResponse(progress: unknown[] = []) {
  return { ok: true, json: async () => ({ progress }) };
}

function renderDecider(runView: RenewalRunView, isAdmin = true) {
  return render(
    <RenewalDecider canDefer={true} canResolve={true} isAdmin={isAdmin} view={runView} />,
  );
}

describe("RenewalDecider", () => {
  it("renders exactly one card, pages through N-of-M, and demotes all manifest metrics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(progressResponse()));
    const rendered = renderDecider(
      view([flag("rent", "Current rent"), flag("date", "Lease end")]),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(document.querySelectorAll(".lr-decider-card")).toHaveLength(1);
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Current rent")).toBeInTheDocument();

    const disclosure = screen.getByText("Read details").closest("details");
    expect(disclosure).not.toHaveAttribute("open");
    expect(disclosure).toHaveTextContent("Tabs recognized");
    expect(disclosure).toHaveTextContent("Tabs unrecognized");
    expect(disclosure).toHaveTextContent("Records read");
    expect(disclosure).toHaveTextContent("Credential tabs excluded");
    expect(disclosure).toHaveTextContent("Credential scrub hits");
    expect(disclosure).toHaveTextContent("Divider rows dropped");

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(
      screen.getByRole("textbox", { name: "Reason (required for this choice)" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Accept suggested source" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    expect(screen.getByText("Lease end")).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Reason (required for this choice)" }),
    ).not.toBeInTheDocument();
    expect(document.querySelectorAll(".lr-decider-card")).toHaveLength(1);

    const nextRun = {
      ...view([flag("new-rent", "New current rent"), flag("new-date", "New lease end")]),
      runId: "run-2",
    };
    rendered.rerender(
      <RenewalDecider canDefer={true} canResolve={true} isAdmin={true} view={nextRun} />,
    );
    expect(
      screen.getByText("Loading your renewal review progress..."),
    ).toBeInTheDocument();
    expect(await screen.findByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByText("New current rent")).toBeInTheDocument();
  });

  it("accepts the suggested Low/Medium source with one resolve POST and no reason key", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!init?.method) return progressResponse();
      if (url === "/api/lease-renewal/resolve") {
        return {
          ok: true,
          json: async () => ({
            resolution: { reason_code: "accepted_suggestion" },
          }),
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderDecider(view([flag("rent", "Current rent")]));

    fireEvent.click(
      await screen.findByRole("button", { name: "Accept suggested source" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([url, init]) =>
            String(url) === "/api/lease-renewal/resolve" &&
            (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toHaveLength(1);
    });
    const resolveCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === "/api/lease-renewal/resolve" &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    expect(JSON.parse(String((resolveCall?.[1] as RequestInit).body))).toEqual({
      run_id: "run-1",
      source_trigger_key: "rent",
      kind: "pick_source",
      chosen_source: "rentvine",
      reason_code: "accepted_suggestion",
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("collapses the follow-on approval to one tap and reuses the reason code", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!init?.method) return progressResponse();
      if (url === "/api/lease-renewal/resolve") {
        return {
          ok: true,
          json: async () => ({
            resolution: {
              reason_code: "accepted_suggestion",
              proposed_writeback: { status: "Queued" },
            },
          }),
        };
      }
      if (url === "/api/lease-renewal/writeback-approvals") {
        return { ok: true, json: async () => ({ approval: { state: "Approved" } }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderDecider(view([flag("rent", "Current rent")]));

    fireEvent.click(
      await screen.findByRole("button", { name: "Accept suggested source" }),
    );
    const approve = await screen.findByRole("button", { name: "Approve write-back" });
    expect(document.querySelector(".lr-approve-form")).toBeNull();
    fireEvent.click(approve);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url]) => String(url) === "/api/lease-renewal/writeback-approvals",
        ),
      ).toBe(true),
    );
    const approvalCall = fetchMock.mock.calls.find(
      ([url]) => String(url) === "/api/lease-renewal/writeback-approvals",
    );
    expect(JSON.parse(String((approvalCall?.[1] as RequestInit).body))).toEqual({
      run_id: "run-1",
      source_trigger_key: "rent",
      decision: "approve",
      reason_code: "accepted_suggestion",
    });
  });

  it("persists Skip without resolving and suppresses it after a remount", async () => {
    const deferred: { source_trigger_key: string; status: "Deferred" }[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!init?.method) return progressResponse(deferred);
      if (url === "/api/lease-renewal/decider-progress") {
        const body = JSON.parse(String(init.body)) as {
          source_trigger_key: string;
          status: "Deferred";
        };
        deferred.push({
          source_trigger_key: body.source_trigger_key,
          status: body.status,
        });
        return { ok: true, json: async () => ({ progress: deferred.at(-1) }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const runView = view([flag("rent", "Current rent"), flag("date", "Lease end")]);
    const first = renderDecider(runView);

    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    await screen.findByText("Lease end");
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url) === "/api/lease-renewal/resolve"),
    ).toBe(false);

    first.unmount();
    const second = renderDecider(runView);
    await screen.findByText("Lease end");
    expect(screen.queryByText("Current rent")).not.toBeInTheDocument();

    second.unmount();
    window.sessionStorage.clear();
    renderDecider(runView);
    expect(await screen.findByText("Current rent")).toBeInTheDocument();
  });

  it("keeps an optimistic queued follow-on coherent across Next and Back", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!init?.method) return progressResponse();
      if (url === "/api/lease-renewal/resolve") {
        return {
          ok: true,
          json: async () => ({
            resolution: {
              reason_code: "accepted_suggestion",
              proposed_writeback: { status: "Queued" },
            },
          }),
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderDecider(view([flag("rent", "Current rent"), flag("date", "Lease end")]));

    fireEvent.click(
      await screen.findByRole("button", { name: "Accept suggested source" }),
    );
    expect(
      await screen.findByRole("button", { name: "Approve write-back" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Lease end")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Current rent")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve write-back" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Accept suggested source" }),
    ).not.toBeInTheDocument();
  });

  it("keeps queued write-back approval Admin-only", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(progressResponse()));
    const queued: RenewalFlagView = {
      ...flag("rent", "Current rent"),
      resolution: {
        status: "Resolved",
        kind: "pick_source",
        chosenSource: "rentvine",
        reason: "Accepted the suggested source",
        reasonCode: "accepted_suggestion",
      },
      writebackApproval: {
        queued: true,
        state: "Awaiting Approval",
        stale: false,
      },
    };
    renderDecider(view([queued]), false);

    expect(
      await screen.findByText("An Admin approves the queued write-back proposal."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve write-back" }),
    ).not.toBeInTheDocument();
  });

  it("uses the full approval form when an existing resolution has custom free text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(progressResponse()));
    const queued: RenewalFlagView = {
      ...flag("rent", "Current rent"),
      resolution: {
        status: "Resolved",
        kind: "pick_source",
        chosenSource: "rentvine",
        reason: "Confirmed against the signed lease.",
        reasonCode: "accepted_suggestion",
      },
      writebackApproval: {
        queued: true,
        state: "Awaiting Approval",
        stale: false,
      },
    };
    renderDecider(view([queued]));

    expect(
      await screen.findByRole("button", { name: "Approve proposal" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve write-back" }),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".lr-approve-form textarea")).not.toBeNull();
  });
});
