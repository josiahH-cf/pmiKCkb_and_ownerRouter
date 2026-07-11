// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ANTICIPATION_ALL_CLEAR,
  ANTICIPATION_CAPTION,
  ConsoleAnticipatedWork,
} from "@/components/console/ConsoleAnticipatedWork";
import type { AnticipatedWorkGroup } from "@/lib/anticipation/projection";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function group(overrides: Partial<AnticipatedWorkGroup> = {}): AnticipatedWorkGroup {
  return {
    processDefinitionId: "lease-renewal",
    spaceId: "lease-renewals",
    spaceName: "Lease Renewals",
    category: "Renewals",
    count: 3,
    urgency: "upcoming",
    summary: "3 leases in the renewal window",
    startHref: "/lease-renewal",
    ...overrides,
  };
}

const noSourceMaintenance = group({
  processDefinitionId: "maintenance-work-order-intake",
  spaceId: "maintenance-work-order-intake",
  spaceName: "Maintenance Work Order Intake",
  category: "Maintenance",
  count: 0,
  urgency: "no-source-yet",
  summary: "Waiting on a maintenance signal",
  startHref: "/maintenance",
});

function okRun() {
  return new Response(
    JSON.stringify({
      run: {
        id: "run-1",
        process_name: "Lease Renewal",
        status: "Test run",
        next_action: "",
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("ConsoleAnticipatedWork", () => {
  it("AC-S18-3: renders each family, and an un-fed family shows its placeholder with no start control", () => {
    render(<ConsoleAnticipatedWork groups={[group(), noSourceMaintenance]} canStart />);
    expect(screen.getByText("Lease Renewals")).toBeInTheDocument();
    expect(screen.getByText("Maintenance Work Order Intake")).toBeInTheDocument();
    expect(screen.getByText("Waiting on a maintenance signal")).toBeInTheDocument();
    // The un-fed family (count 0) produces no startable item; only the fed family gets the button.
    expect(screen.getAllByRole("button", { name: "Start a test run" })).toHaveLength(1);
  });

  it("AC-S18-4: an all-clear projection renders the exact all-clear text and the caption", () => {
    render(
      <ConsoleAnticipatedWork
        groups={[
          group({ count: 0, urgency: "all-clear", summary: "All clear" }),
          noSourceMaintenance,
        ]}
        canStart
      />,
    );
    expect(screen.getByText(ANTICIPATION_ALL_CLEAR)).toBeInTheDocument();
    expect(
      screen.getByText("All clear — nothing is coming up right now."),
    ).toBeInTheDocument();
    expect(screen.getByText(ANTICIPATION_CAPTION)).toBeInTheDocument();
  });

  it("always renders the computed-on-request caption", () => {
    render(<ConsoleAnticipatedWork groups={[group()]} canStart />);
    expect(screen.getByText(ANTICIPATION_CAPTION)).toBeInTheDocument();
  });

  it("AC-S18-5: starting a run POSTs exactly the test-runs endpoint and issues no send/write", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      okRun(),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ConsoleAnticipatedWork groups={[group()]} canStart />);
    await user.click(screen.getByRole("button", { name: "Start a test run" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/process-definitions/lease-renewal/test-runs");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toHaveProperty("note");
    // The lane never sends or writes a system of record.
    expect(screen.queryByRole("button", { name: /send|execute|write/i })).toBeNull();
    // On success it surfaces a link to the test run, never an executed action.
    expect(await screen.findByText("View the test run")).toBeInTheDocument();
  });

  it("AC-S18-6: a viewer who cannot start runs sees ZERO start controls (deep link only)", () => {
    render(<ConsoleAnticipatedWork groups={[group()]} canStart={false} />);
    expect(screen.queryByRole("button", { name: "Start a test run" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open the space" })).toBeInTheDocument();
  });
});
