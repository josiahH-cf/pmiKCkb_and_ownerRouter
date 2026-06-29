// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AskForm } from "@/components/ask/AskForm";

// The R4 action console: the Console is process-aware (the four Ask metadata selects are gone), and an
// editor who picks a process launches a SAFE simulation run alongside the grounded answer. Verifies the
// rescope (no audience/channel/space/urgency), the role gate on the picker, and the launch flow.

const ANSWER = {
  question: "How do renewals work?",
  source_state: "Verified Source",
  answer: "Here is the grounded answer.",
  handling_steps: [],
  citations: [],
  draft: "",
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/ask")) return jsonResponse(ANSWER);
    if (url.includes("/test-runs")) {
      return jsonResponse(
        {
          run: {
            id: "run-1",
            process_name: "Lease Renewal",
            status: "In Progress",
            next_action: "Gather facts",
          },
        },
        true,
      );
    }
    return jsonResponse({}, false);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AskForm (action console)", () => {
  it("drops the four Ask metadata selects and shows no process picker for read-only users", () => {
    render(<AskForm canStartSimulation={false} processes={[]} />);

    expect(screen.queryByLabelText("Audience")).toBeNull();
    expect(screen.queryByLabelText("Channel")).toBeNull();
    expect(screen.queryByLabelText("Urgency")).toBeNull();
    expect(screen.queryByLabelText("Process")).toBeNull();
    expect(screen.getByRole("button", { name: "Get answer" })).toBeInTheDocument();
  });

  it("asks without a process and never starts a simulation", async () => {
    const user = userEvent.setup();
    render(
      <AskForm
        canStartSimulation
        processes={[{ id: "lease-renewal", name: "Lease Renewal", status: "Draft" }]}
      />,
    );

    await user.type(screen.getByLabelText("Question"), "How do renewals work?");
    await user.click(screen.getByRole("button", { name: "Get answer" }));

    expect(await screen.findByText("Here is the grounded answer.")).toBeInTheDocument();
    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.includes("/api/ask"))).toBe(true);
    expect(calledUrls.some((url) => url.includes("/test-runs"))).toBe(false);
    expect(screen.queryByText("Process simulation started")).toBeNull();
  });

  it("launches a simulation when an editor selects a process", async () => {
    const user = userEvent.setup();
    render(
      <AskForm
        canStartSimulation
        processes={[{ id: "lease-renewal", name: "Lease Renewal", status: "Draft" }]}
      />,
    );

    await user.type(screen.getByLabelText("Question"), "Start a renewal");
    await user.selectOptions(screen.getByLabelText("Process"), "lease-renewal");
    expect(
      screen.getByRole("button", { name: "Get answer + start simulation" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Get answer + start simulation" }));

    expect(await screen.findByText("Process simulation started")).toBeInTheDocument();
    expect(screen.getByText("Lease Renewal")).toBeInTheDocument();

    await waitFor(() => {
      const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(
        calledUrls.some((url) => url.includes("/api/process-definitions/lease-renewal/test-runs")),
      ).toBe(true);
    });
  });
});
