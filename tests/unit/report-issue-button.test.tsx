// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigationState } = vi.hoisted(() => ({
  navigationState: { pathname: "/" as string | null },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

import { ReportIssueButton } from "@/components/feedback/ReportIssueButton";

let fetchMock: ReturnType<typeof vi.fn>;

function bodyOf(mock: ReturnType<typeof vi.fn>): {
  description?: string;
  context: { route: string; element?: Record<string, string> };
} {
  return JSON.parse(String((mock.mock.calls[0][1] as RequestInit).body));
}

beforeEach(() => {
  navigationState.pathname = "/";
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      received: true,
      delivered: true,
      subject: "Report: Issue on /",
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function installRecorder() {
  const trackStop = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: trackStop }],
      })),
    },
  });

  class FakeMediaRecorder {
    static isTypeSupported(type: string) {
      return type === "audio/webm;codecs=opus";
    }
    mimeType = "audio/webm;codecs=opus";
    state: RecordingState = "inactive";
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onstop: (() => void | Promise<void>) | null = null;
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["short audio"]) } as BlobEvent);
      void this.onstop?.();
    }
  }

  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  return { trackStop };
}

describe("ReportIssueButton", () => {
  it("shows a persistent trigger and opens a labelled dialog with the guidance copy", async () => {
    const user = userEvent.setup();
    render(<ReportIssueButton />);

    const trigger = screen.getByRole("button", { name: "Feedback" });
    expect(trigger).toHaveClass("report-issue-trigger");
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Feedback" })).toBeInTheDocument();
    expect(screen.getByText(/Be as descriptive as possible/)).toBeInTheDocument();
  });

  it("submits the route + last-element IDENTITY (not its content) and shows a receipt", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button data-testid="save-btn" type="button">
          Save
        </button>
        <ReportIssueButton />
      </div>,
    );

    await user.click(screen.getByTestId("save-btn"));
    await user.click(screen.getByRole("button", { name: "Feedback" }));
    await user.type(screen.getByLabelText(/Your feedback/), "It does nothing");
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/report-issue");
    const body = bodyOf(fetchMock);
    expect(body.description).toBe("It does nothing");
    expect(typeof body.context.route).toBe("string");
    expect(body.context.element).toMatchObject({ tag: "button", testId: "save-btn" });
    expect(body.context.element).not.toHaveProperty("name"); // no textContent/aria capture

    expect(await screen.findByText(/filed to the support queue/i)).toBeInTheDocument();
  });

  it("shows a soft-failure notice (not success) when the report was received but not delivered (F-SUPP-3)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        received: true,
        delivered: false,
        subject: "Report: Issue on /",
      }),
    });
    const user = userEvent.setup();
    render(<ReportIssueButton />);

    await user.click(screen.getByRole("button", { name: "Feedback" }));
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    // The request succeeded (202) but the report was not filed: the UI must not claim success, and
    // the form stays open so the user can retry.
    expect(
      await screen.findByText(/could not file it to the support queue/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/filed to the support queue for review/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeInTheDocument();
  });

  it("never captures an input's value OR its data-derived aria-label", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <input
          aria-label="Reason for changing tenant@example.com"
          defaultValue="secret-value"
        />
        <ReportIssueButton />
      </div>,
    );

    await user.click(screen.getByLabelText("Reason for changing tenant@example.com"));
    await user.click(screen.getByRole("button", { name: "Feedback" }));
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const raw = String((fetchMock.mock.calls[0][1] as RequestInit).body);
    expect(raw).not.toContain("secret-value"); // input value
    expect(raw).not.toContain("tenant@example.com"); // PII in aria-label
    expect(bodyOf(fetchMock).context.element).not.toHaveProperty("name");
  });

  it("never captures a data cell's rendered text (tenant PII)", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <table>
          <tbody>
            <tr>
              <td data-testid="tenant-cell">John Doe, 123 Main St, $2000/mo</td>
            </tr>
          </tbody>
        </table>
        <ReportIssueButton />
      </div>,
    );

    await user.click(screen.getByTestId("tenant-cell"));
    await user.click(screen.getByRole("button", { name: "Feedback" }));
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const raw = String((fetchMock.mock.calls[0][1] as RequestInit).body);
    expect(raw).not.toContain("John Doe");
    expect(raw).not.toContain("123 Main");
    expect(bodyOf(fetchMock).context.element).toMatchObject({
      tag: "td",
      testId: "tenant-cell",
    });
  });

  it("Escape closes the dialog and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<ReportIssueButton />);

    const trigger = screen.getByRole("button", { name: "Feedback" });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes on Cancel without sending", async () => {
    const user = userEvent.setup();
    render(<ReportIssueButton />);

    await user.click(screen.getByRole("button", { name: "Feedback" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("appends multiple transcripts exactly, focuses the end, and never files until Send feedback", async () => {
    const { trackStop } = installRecorder();
    let clip = 0;
    fetchMock.mockImplementation(async (input) => {
      if (String(input) === "/api/report-issue/transcribe") {
        clip += 1;
        return {
          ok: true,
          json: async () => ({
            transcript: clip === 1 ? "second thought" : "third thought",
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ received: true, delivered: true }),
      };
    });
    const user = userEvent.setup();
    render(<ReportIssueButton />);

    await user.click(screen.getByRole("button", { name: "Feedback" }));
    const textarea = screen.getByLabelText(/Your feedback/) as HTMLTextAreaElement;
    await user.type(textarea, "first thought");

    await user.click(screen.getByRole("button", { name: "Record feedback" }));
    await user.click(screen.getByRole("button", { name: "Stop and transcribe" }));
    await screen.findByText(/Transcript added/);
    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(textarea).toHaveValue("first thought\n\nsecond thought");
    await waitFor(() => expect(textarea).toHaveFocus());
    expect(textarea.selectionStart).toBe(textarea.value.length);
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "/api/report-issue/transcribe",
    ]);

    await user.click(screen.getByRole("button", { name: "Record feedback" }));
    await user.click(screen.getByRole("button", { name: "Stop and transcribe" }));
    await waitFor(() =>
      expect(textarea).toHaveValue("first thought\n\nsecond thought\n\nthird thought"),
    );
    expect(trackStop).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toContain(
      "/api/report-issue",
    );

    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const reportCall = fetchMock.mock.calls.find(
      (call) => String(call[0]) === "/api/report-issue",
    )!;
    const raw = String((reportCall[1] as RequestInit).body);
    expect(JSON.parse(raw).description).toBe(
      "first thought\n\nsecond thought\n\nthird thought",
    );
    expect(raw).not.toMatch(/audio|voice|modality|mime/i);
  });

  it("keeps the complete over-limit value and enables send only after editing to 2,000", async () => {
    const user = userEvent.setup();
    render(<ReportIssueButton />);
    await user.click(screen.getByRole("button", { name: "Feedback" }));
    const textarea = screen.getByLabelText(/Your feedback/);

    fireEvent.change(textarea, { target: { value: "x".repeat(1_999) } });
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeEnabled();
    fireEvent.change(textarea, { target: { value: "x".repeat(2_001) } });
    expect(textarea).toHaveValue("x".repeat(2_001));
    expect(
      screen.getByText("2,001 characters. Remove 1 to send feedback."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeDisabled();

    fireEvent.change(textarea, { target: { value: "x".repeat(2_000) } });
    expect(screen.getByText("2,000 of 2,000 characters.")).toBeVisible();
    const send = screen.getByRole("button", { name: "Send feedback" });
    expect(send).toBeEnabled();
    await user.click(send);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchMock).description).toHaveLength(2_000);
  });

  it("keeps an over-limit transcript append whole and editable", async () => {
    installRecorder();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ transcript: "more" }),
    });
    const user = userEvent.setup();
    render(<ReportIssueButton />);
    await user.click(screen.getByRole("button", { name: "Feedback" }));
    const textarea = screen.getByLabelText(/Your feedback/);
    fireEvent.change(textarea, { target: { value: "x".repeat(1_999) } });

    await user.click(screen.getByRole("button", { name: "Record feedback" }));
    await user.click(screen.getByRole("button", { name: "Stop and transcribe" }));

    await waitFor(() => expect(textarea).toHaveValue(`${"x".repeat(1_999)}\n\nmore`));
    expect(
      screen.getByText("2,005 characters. Remove 5 to send feedback."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 403, 413, 429, 503])(
    "preserves typed text and files nothing when transcription returns %s",
    async (responseStatus) => {
      installRecorder();
      fetchMock.mockResolvedValue({
        ok: false,
        status: responseStatus,
        json: async () => ({ error: "Dictation is unavailable. Type instead." }),
      });
      const user = userEvent.setup();
      render(<ReportIssueButton />);

      await user.click(screen.getByRole("button", { name: "Feedback" }));
      const textarea = screen.getByLabelText(/Your feedback/);
      await user.type(textarea, "keep this");
      await user.click(screen.getByRole("button", { name: "Record feedback" }));
      await user.click(screen.getByRole("button", { name: "Stop and transcribe" }));

      expect(
        await screen.findByText("Dictation is unavailable. Type instead."),
      ).toBeVisible();
      expect(textarea).toHaveValue("keep this");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toBe("/api/report-issue/transcribe");
    },
  );

  it("discards an empty transcript without changing typed text", async () => {
    installRecorder();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ transcript: "   " }) });
    const user = userEvent.setup();
    render(<ReportIssueButton />);

    await user.click(screen.getByRole("button", { name: "Feedback" }));
    const textarea = screen.getByLabelText(/Your feedback/);
    await user.type(textarea, "typed words");
    await user.click(screen.getByRole("button", { name: "Record feedback" }));
    await user.click(screen.getByRole("button", { name: "Stop and transcribe" }));

    expect(
      await screen.findByText("No speech was detected. Type instead or record again."),
    ).toBeVisible();
    expect(textarea).toHaveValue("typed words");
  });

  it("cancels an in-flight transcription, ignores its late result, and preserves text", async () => {
    const { trackStop } = installRecorder();
    let resolveTranscription!: (value: {
      ok: boolean;
      json: () => Promise<{ transcript: string }>;
    }) => void;
    const requestState: { signal?: AbortSignal } = {};
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise((resolve) => {
          const signal = (init as RequestInit | undefined)?.signal;
          if (signal) requestState.signal = signal;
          resolveTranscription = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<ReportIssueButton />);

    await user.click(screen.getByRole("button", { name: "Feedback" }));
    const textarea = screen.getByLabelText(/Your feedback/);
    await user.type(textarea, "typed first");
    await user.click(screen.getByRole("button", { name: "Record feedback" }));
    await user.click(screen.getByRole("button", { name: "Stop and transcribe" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel dictation" }));
    expect(trackStop).toHaveBeenCalled();
    expect(requestState.signal?.aborted).toBe(true);

    resolveTranscription({ ok: true, json: async () => ({ transcript: "late words" }) });
    await waitFor(() =>
      expect(screen.getByText(/Dictation cancelled/)).toBeInTheDocument(),
    );
    expect(textarea).toHaveValue("typed first");
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeEnabled();
  });

  it("keeps typed text when the transcription network request fails", async () => {
    installRecorder();
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const user = userEvent.setup();
    render(<ReportIssueButton />);

    await user.click(screen.getByRole("button", { name: "Feedback" }));
    const textarea = screen.getByLabelText(/Your feedback/);
    await user.type(textarea, "still here");
    await user.click(screen.getByRole("button", { name: "Record feedback" }));
    await user.click(screen.getByRole("button", { name: "Stop and transcribe" }));

    expect(
      await screen.findByText(/Could not reach the transcription service/),
    ).toBeVisible();
    expect(textarea).toHaveValue("still here");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Escape during recording stops media, closes, returns focus, and sends nothing", async () => {
    const { trackStop } = installRecorder();
    const user = userEvent.setup();
    render(<ReportIssueButton />);

    const trigger = screen.getByRole("button", { name: "Feedback" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Record feedback" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trackStop).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("route change and unmount abort dictation and prevent a late append", async () => {
    const { trackStop } = installRecorder();
    const user = userEvent.setup();
    const view = render(<ReportIssueButton />);
    await user.click(screen.getByRole("button", { name: "Feedback" }));
    await user.click(screen.getByRole("button", { name: "Record feedback" }));

    navigationState.pathname = "/next";
    view.rerender(<ReportIssueButton />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trackStop).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    navigationState.pathname = "/next";
    view.rerender(<ReportIssueButton />);
    await user.click(screen.getByRole("button", { name: "Feedback" }));
    await user.click(screen.getByRole("button", { name: "Record feedback" }));
    view.unmount();
    expect(trackStop).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps every new recorder control inside the keyboard focus loop", async () => {
    installRecorder();
    const user = userEvent.setup();
    render(<ReportIssueButton />);
    await user.click(screen.getByRole("button", { name: "Feedback" }));

    const cancel = screen.getByRole("button", { name: "Cancel" });
    cancel.focus();
    await user.keyboard("{Tab}");
    expect(screen.getByLabelText(/Your feedback/)).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(cancel).toHaveFocus();
  });
});
