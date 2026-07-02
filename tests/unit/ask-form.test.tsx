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

describe("AskForm next-right-action strip + command counts (C3)", () => {
  it("shows live counts on the command buttons and the one-line start-here link", () => {
    render(
      <AskForm
        canStartSimulation={false}
        commandCounts={{ approvals: 6, connections: 2, coverage: 0 }}
        nextAction={{
          count: 6,
          label: "Current rent",
          href: "/lease-renewal/runs/run-1",
        }}
        processes={[]}
      />,
    );

    expect(screen.getByRole("button", { name: "My approvals (6)" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connections to set up (2)" }),
    ).toBeInTheDocument();
    // Zero counts stay quiet — no "(0)" noise.
    expect(screen.getByRole("button", { name: "Space coverage" })).toBeInTheDocument();

    expect(screen.getByText(/6 things need your decision/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Current rent" })).toHaveAttribute(
      "href",
      "/lease-renewal/runs/run-1",
    );
  });

  it("renders no strip and plain buttons when nothing waits", () => {
    render(<AskForm canStartSimulation={false} processes={[]} />);

    expect(screen.queryByText(/need your decision/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "My approvals" })).toBeInTheDocument();
  });
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
    expect(screen.queryByText("Test run started")).toBeNull();
    expect(askBody(fetchMock).process_id).toBeUndefined();
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
      screen.getByRole("button", { name: "Get answer + start a test run" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Get answer + start a test run" }),
    );

    expect(await screen.findByText("Test run started")).toBeInTheDocument();
    expect(screen.getByText("Lease Renewal")).toBeInTheDocument();

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

  it("shows the visible Console command buttons and the Dictate control (S10)", () => {
    render(<AskForm />);

    expect(screen.getByRole("button", { name: "My approvals" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connections to set up" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Space coverage" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dictate" })).toBeInTheDocument();
  });

  it("loads app-state via a command button and shows an advisory, deep-linked panel", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/api/ask/app-state")) {
          return jsonResponse({
            query: "approvals",
            title: "Your approvals",
            summary: "1 item ready for your approval.",
            items: [
              {
                label: "Approve renewal package",
                detail: "Risk: Medium",
                href: "/approval-queue#a",
              },
            ],
          });
        }
        return jsonResponse({}, false);
      }),
    );

    render(<AskForm />);
    await user.click(screen.getByRole("button", { name: "My approvals" }));

    expect(
      await screen.findByRole("heading", { name: "Your approvals" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 item ready for your approval.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Approve renewal package" })).toHaveAttribute(
      "href",
      "/approval-queue#a",
    );
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
