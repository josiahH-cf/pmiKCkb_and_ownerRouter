// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AskForm } from "@/components/ask/AskForm";

// The action console's ask surface: process-aware (the four Ask metadata selects are gone), an
// editor who picks a process launches a SAFE simulation alongside the grounded answer, and the
// Dictate control is a first-class affordance. The always-visible action deck + process strip live
// in their own server components (see console-action-deck.test.tsx), not here.

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

  it("shows the Dictate control and its helper (S10 / F-DICTATE-VERIFIED)", () => {
    render(<AskForm />);

    expect(screen.getByRole("button", { name: "Dictate" })).toBeInTheDocument();
    expect(screen.getByText(/use Dictate to speak it/)).toBeInTheDocument();
    // The action deck moved out of the ask form; its command buttons are no longer here.
    expect(screen.queryByRole("button", { name: /My approvals/ })).toBeNull();
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
    expect(screen.queryByText("Test run started")).toBeNull();
    expect(askBody(fetchMock).process_id).toBeUndefined();
  });

  it("launches a simulation when an editor selects a process and links to the run", async () => {
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
      screen.getByRole("button", { name: "Get answer + start a test run" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Get answer + start a test run" }),
    );

    expect(await screen.findByText("Test run started")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View the test run" })).toHaveAttribute(
      "href",
      "/workflow-runs/run-1",
    );

    await waitFor(() => {
      const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(
        calledUrls.some((url) =>
          url.includes("/api/process-definitions/lease-renewal/test-runs"),
        ),
      ).toBe(true);
    });

    // The answer is process-aware: the /api/ask body carries the selected process id.
    expect(askBody(fetchMock).process_id).toBe("lease-renewal");
  });

  it("suggests a process via deterministic intent-detection and applies it on click", async () => {
    const user = userEvent.setup();
    render(
      <AskForm
        canStartSimulation
        processes={[{ id: "lease-renewal", name: "Lease Renewal", status: "Draft" }]}
      />,
    );

    await user.type(
      screen.getByLabelText("Question"),
      "When is the lease up for renewal?",
    );
    await user.click(await screen.findByRole("button", { name: "Use Lease Renewal" }));

    expect(
      screen.getByRole("button", { name: "Get answer + start a test run" }),
    ).toBeInTheDocument();
  });
});

/** Parse the JSON body of the /api/ask call (not /api/ask/capture). */
function askBody(mock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = mock.mock.calls.find(
    (entry) =>
      String(entry[0]).includes("/api/ask") &&
      !String(entry[0]).includes("/api/ask/capture"),
  );
  return JSON.parse(String((call?.[1] as RequestInit)?.body ?? "{}"));
}
