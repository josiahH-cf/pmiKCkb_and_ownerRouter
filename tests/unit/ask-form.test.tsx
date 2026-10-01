// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AskForm } from "@/components/ask/AskForm";

// The Dashboard's AI workspace (S146): the four Ask metadata selects are gone, there is no process
// picker, suggestion, detection or run start, and the Dictate control is a first-class affordance.
// The compact attention queue is its own component (see dashboard-attention-queue.test.tsx).

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
  it("drops the four Ask metadata selects and shows no process picker for any user", () => {
    render(<AskForm />);

    expect(screen.queryByLabelText("Audience")).toBeNull();
    expect(screen.queryByLabelText("Channel")).toBeNull();
    expect(screen.queryByLabelText("Urgency")).toBeNull();
    expect(screen.queryByLabelText("Process")).toBeNull();

    // FDS-2/FDS-3/FDS-5: the primary action is the prominent "large" Button, the required
    // Question carries a marked asterisk, and the field offers a guided example.
    const submit = screen.getByRole("button", { name: "Get answer" });
    expect(submit).toHaveClass("primary-button", "button--large");
    expect(screen.getByText("*")).toHaveClass("field-required");
    expect(screen.getByLabelText(/Question/)).toHaveAttribute(
      "aria-describedby",
      "question-hint",
    );
    expect(screen.getByText(/when does the lease at 1234 Oak St/)).toHaveAttribute(
      "id",
      "question-hint",
    );
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

    const question = screen.getByLabelText(/Question/);
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

    const question = screen.getByLabelText(/Question/);
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

  it("shows the answer transparency line (Answered by <model> · N sources)", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      String(input).includes("/api/ask")
        ? jsonResponse({
            ...ANSWER,
            answered_by: { model: "Gemini 2.5 Pro", source_count: 3 },
          })
        : jsonResponse({}, false),
    );
    render(<AskForm />);

    await user.type(screen.getByLabelText(/Question/), "How do renewals work?");
    await user.click(screen.getByRole("button", { name: "Get answer" }));

    expect(
      await screen.findByText(/Answered by Gemini 2\.5 Pro · 3 sources/),
    ).toBeInTheDocument();
  });

  it("shows a source's last-reviewed date when present and omits it when absent (Slice 5)", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      String(input).includes("/api/ask")
        ? jsonResponse({
            ...ANSWER,
            citations: [
              {
                source_id: "s1",
                title: "Reviewed SOP",
                url: "https://drive.example/s1",
                last_reviewed_at: "2026-05-01T00:00:00.000Z",
              },
              {
                source_id: "s2",
                title: "Unreviewed SOP",
                url: "https://drive.example/s2",
              },
            ],
          })
        : jsonResponse({}, false),
    );
    render(<AskForm />);

    await user.type(screen.getByLabelText(/Question/), "How do renewals work?");
    await user.click(screen.getByRole("button", { name: "Get answer" }));

    expect(await screen.findByText("Reviewed SOP")).toBeInTheDocument();
    expect(screen.getByText(/reviewed 05\/01\/2026/)).toBeInTheDocument();
    // The unreviewed source shows no review date (guard against matching "Unreviewed" itself).
    expect(screen.getByText("Unreviewed SOP").closest("li")?.textContent).not.toMatch(
      /reviewed \d{4}/,
    );
  });

  it("renders a freshness chip only for review-due/stale citations (S32 AC-S32-5)", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      String(input).includes("/api/ask")
        ? jsonResponse({
            ...ANSWER,
            citations: [
              {
                source_id: "s1",
                title: "Due SOP",
                url: "https://drive.example/s1",
                freshness: { status: "review-due", daysOverdue: 5 },
              },
              {
                source_id: "s2",
                title: "Old SOP",
                url: "https://drive.example/s2",
                freshness: { status: "stale", daysOverdue: 90 },
              },
              {
                source_id: "s3",
                title: "Fresh SOP",
                url: "https://drive.example/s3",
                freshness: { status: "fresh" },
              },
              { source_id: "s4", title: "Plain SOP", url: "https://drive.example/s4" },
            ],
          })
        : jsonResponse({}, false),
    );
    render(<AskForm />);

    await user.type(screen.getByLabelText(/Question/), "How do renewals work?");
    await user.click(screen.getByRole("button", { name: "Get answer" }));

    expect((await screen.findByText("Due SOP")).closest("li")?.textContent).toMatch(
      /Review due/,
    );
    expect(screen.getByText("Old SOP").closest("li")?.textContent).toMatch(/Stale/);
    // Fresh and unknown citations render no chip.
    expect(screen.getByText("Fresh SOP").closest("li")?.textContent).not.toMatch(
      /Review due|Stale/,
    );
    expect(screen.getByText("Plain SOP").closest("li")?.textContent).not.toMatch(
      /Review due|Stale/,
    );
  });

  it("files a correction (Proposed-only) and leaves the answer unchanged (S32 AC-S32-1)", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/ask/correct")) {
        return jsonResponse({ correction: { id: "c1", status: "Proposed" } }, true);
      }
      if (url.includes("/api/ask")) return jsonResponse(ANSWER);
      return jsonResponse({}, false);
    });
    render(<AskForm />);

    await user.type(screen.getByLabelText(/Question/), "How do renewals work?");
    await user.click(screen.getByRole("button", { name: "Get answer" }));
    await screen.findByText("Here is the grounded answer.");

    await user.click(screen.getByRole("button", { name: "Suggest a correction" }));
    await user.type(screen.getByLabelText("Correction"), "The grace period is 5 days.");
    await user.click(screen.getByRole("button", { name: "File correction" }));

    expect(
      await screen.findByText(/filed for review\. The answer is unchanged/i),
    ).toBeInTheDocument();
    // Nothing self-modified: the answer text is still on screen.
    expect(screen.getByText("Here is the grounded answer.")).toBeInTheDocument();
    const correctCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes("/api/ask/correct"));
    expect(correctCalls).toHaveLength(1);
  });

  it("asks without a process and never starts a run", async () => {
    const user = userEvent.setup();
    render(<AskForm />);

    await user.type(screen.getByLabelText(/Question/), "How do renewals work?");
    await user.click(screen.getByRole("button", { name: "Get answer" }));

    expect(await screen.findByText("Here is the grounded answer.")).toBeInTheDocument();
    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.includes("/api/ask"))).toBe(true);
    expect(
      calledUrls.some((url) => /\/process-definitions\/[^/]+\/runs$/.test(url)),
    ).toBe(false);
    expect(screen.queryByText("Run started")).toBeNull();
    expect(askBody(fetchMock).process_id).toBeUndefined();
  });

  it("S146: offers no process picker, suggestion, detection, run start or live-target read", async () => {
    const user = userEvent.setup();
    render(<AskForm />);

    await user.type(
      screen.getByLabelText(/Question/),
      "Start the renewal for the lease at 1234 Oak St",
    );
    expect(screen.queryByLabelText("Process")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Use / })).toBeNull();
    expect(screen.queryByRole("button", { name: /Detect process/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Get answer" }));
    expect(await screen.findByText("Here is the grounded answer.")).toBeInTheDocument();

    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.includes("/api/processes/classify"))).toBe(false);
    expect(calledUrls.some((url) => url.includes("/api/ask/live-target"))).toBe(false);
    expect(
      calledUrls.some((url) => /\/process-definitions\/[^/]+\/runs$/.test(url)),
    ).toBe(false);
    expect(screen.queryByText("Run started")).toBeNull();
    expect(askBody(fetchMock).process_id).toBeUndefined();
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

// S138: the Dashboard conversation. Operational answers come from the records the user can see and
// stop there; a policy question continues to the knowledge answer; the page keeps the conversation.
describe("AskForm Dashboard conversation (S138)", () => {
  const CONTEXT_1 = { version: 1, actorKey: "a".repeat(32), turns: [] as unknown[] };
  function operational(overrides: Record<string, unknown> = {}) {
    return {
      version: "assistant-conversation/v1",
      kind: "answer",
      summary: "2 leases end this week.",
      interpretation: ["Dates: this week, on the America/Chicago business calendar."],
      groups: [
        {
          source: "renewals",
          title: "Leases",
          summary: "2 leases end this week.",
          status: "ok",
          total: 2,
          items: [
            {
              ref: { source: "renewals", id: "L1" },
              title: "1 Main St",
              detail: "In the renewal window",
              blockers: [],
              href: "/lease-renewal/live/desk/lease/L1",
            },
            {
              ref: { source: "renewals", id: "L2" },
              title: "2 Oak Ave",
              detail: "In the renewal window",
              blockers: ["Owner has not responded"],
              href: "/lease-renewal/live/desk/lease/L2",
            },
          ],
          notes: [],
          link: {
            label: "Open these on the Renewals desk",
            href: "/lease-renewal/live/desk?v=2",
          },
        },
      ],
      clarification: null,
      knowledgeQuestion: null,
      interpretedBy: "deterministic",
      conversation: CONTEXT_1,
      contextReset: false,
      ...overrides,
    };
  }

  function assistantBodies(): Record<string, unknown>[] {
    return fetchMock.mock.calls
      .filter((entry) => String(entry[0]).includes("/api/assistant/query"))
      .map((entry) => JSON.parse(String((entry[1] as RequestInit).body)));
  }

  it("answers from records, skips the knowledge answer, and carries the context into a follow-up", async () => {
    const user = userEvent.setup();
    const replies = [operational(), operational({ summary: "1 lease ends this week." })];
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      String(input).includes("/api/assistant/query")
        ? jsonResponse(replies.shift())
        : jsonResponse(ANSWER),
    );
    render(<AskForm />);

    await user.type(screen.getByLabelText(/Question/), "What leases are due this week?");
    await user.click(screen.getByRole("button", { name: "Get answer" }));

    const region = await screen.findByRole("region", { name: "Assistant answer" });
    expect(region).toHaveTextContent("2 leases end this week.");
    expect(screen.getByRole("link", { name: "2 Oak Ave" })).toHaveAttribute(
      "href",
      "/lease-renewal/live/desk/lease/L2",
    );
    expect(region.querySelector("ol")).toHaveAttribute("start", "1");
    expect(screen.getByLabelText(/Question/)).toHaveValue("");
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => /\/api\/ask($|\?)/.test(url))).toBe(false);
    expect(urls.some((url) => /\/process-definitions\/[^/]+\/runs$/.test(url))).toBe(
      false,
    );

    await user.type(screen.getByLabelText(/Question/), "Only mine");
    await user.click(screen.getByRole("button", { name: "Get answer" }));
    expect(await screen.findByText("1 lease ends this week.")).toBeInTheDocument();
    expect(assistantBodies()).toEqual([
      { question: "What leases are due this week?", conversation: null },
      { question: "Only mine", conversation: CONTEXT_1 },
    ]);
    // S146: both turns stay visible below the question box, in the order they were asked.
    const regions = screen.getAllByRole("region", { name: "Assistant answer" });
    expect(regions).toHaveLength(2);
    expect(regions[0]).toHaveTextContent("2 leases end this week.");
    expect(regions[1]).toHaveTextContent("1 lease ends this week.");
  });

  it("continues a policy question to the knowledge answer", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      String(input).includes("/api/assistant/query")
        ? jsonResponse(
            operational({
              kind: "knowledge",
              summary: "",
              groups: [],
              knowledgeQuestion: "What is our pet policy?",
            }),
          )
        : jsonResponse(ANSWER),
    );
    render(<AskForm />);
    await user.type(screen.getByLabelText(/Question/), "What is our pet policy?");
    await user.click(screen.getByRole("button", { name: "Get answer" }));
    expect(await screen.findByText("Here is the grounded answer.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Assistant answer" })).toBeNull();
    expect(askBody(fetchMock).question).toBe("What is our pet policy?");
  });

  it("starts a new conversation on request", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      String(input).includes("/api/assistant/query")
        ? jsonResponse(operational())
        : jsonResponse(ANSWER),
    );
    render(<AskForm />);
    await user.type(screen.getByLabelText(/Question/), "What leases are due this week?");
    await user.click(screen.getByRole("button", { name: "Get answer" }));
    await screen.findByRole("region", { name: "Assistant answer" });
    await user.click(screen.getByRole("button", { name: "Start a new conversation" }));
    expect(screen.queryByRole("region", { name: "Assistant answer" })).toBeNull();
    await user.type(
      screen.getByLabelText(/Question/),
      "What applications are connected?",
    );
    await user.click(screen.getByRole("button", { name: "Get answer" }));
    await screen.findByRole("region", { name: "Assistant answer" });
    expect(assistantBodies().at(-1)).toEqual({
      question: "What applications are connected?",
      conversation: null,
    });
  });
});
