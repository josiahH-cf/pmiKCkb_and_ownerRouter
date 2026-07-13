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
    if (url.includes("/api/ask/transcribe")) {
      return jsonResponse({ transcript: "spoken follow-up" });
    }
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

  it("announces the recorder lifecycle, appends visibly, preserves typed text, and returns focus", async () => {
    const user = userEvent.setup();
    installRecorder(async () => fakeStream());
    render(<AskForm />);

    const question = screen.getByLabelText("Question");
    await user.type(question, "Keep this typed text.");
    await user.click(screen.getByRole("button", { name: "Dictate" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Recording. Press Stop recording when you are finished.",
    );

    await user.click(screen.getByRole("button", { name: "Stop recording" }));
    expect(
      await screen.findByText(/Transcript appended to your question/),
    ).toBeInTheDocument();
    expect(question).toHaveValue("Keep this typed text. spoken follow-up");
    expect(screen.getByRole("button", { name: "Dictate" })).toHaveFocus();
  });

  it("announces no speech without changing typed text and supports retry", async () => {
    const user = userEvent.setup();
    installRecorder(async () => fakeStream());
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      String(input).includes("/api/ask/transcribe")
        ? jsonResponse({ transcript: "" })
        : jsonResponse(ANSWER),
    );
    render(<AskForm />);

    const question = screen.getByLabelText("Question");
    await user.type(question, "Original question");
    await user.click(screen.getByRole("button", { name: "Dictate" }));
    await user.click(screen.getByRole("button", { name: "Stop recording" }));
    expect(await screen.findByText(/No speech was detected/)).toBeInTheDocument();
    expect(question).toHaveValue("Original question");
    expect(screen.getByRole("button", { name: "Dictate" })).toBeEnabled();
  });

  it("announces denied permission and restores focus to Dictate", async () => {
    const user = userEvent.setup();
    installRecorder(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    render(<AskForm />);

    const button = screen.getByRole("button", { name: "Dictate" });
    await user.click(button);
    expect(
      await screen.findByText(/Microphone unavailable or permission denied/),
    ).toBeInTheDocument();
    await waitFor(() => expect(button).toHaveFocus());
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

function fakeStream() {
  return { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
}

function installRecorder(getUserMedia: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(getUserMedia) },
  });
  class FakeMediaRecorder {
    static isTypeSupported(type: string) {
      return type === "audio/webm;codecs=opus";
    }
    mimeType = "audio/webm;codecs=opus";
    state: RecordingState = "inactive";
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onstop: (() => void) | null = null;
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["audio"]) } as BlobEvent);
      this.onstop?.();
    }
  }
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
}

/** Parse the JSON body of the /api/ask call (not /api/ask/capture). */
function askBody(mock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = mock.mock.calls.find(
    (entry) =>
      String(entry[0]).includes("/api/ask") &&
      !String(entry[0]).includes("/api/ask/capture"),
  );
  return JSON.parse(String((call?.[1] as RequestInit)?.body ?? "{}"));
}
