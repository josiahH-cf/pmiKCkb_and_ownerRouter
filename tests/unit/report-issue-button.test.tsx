// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReportIssueButton } from "@/components/feedback/ReportIssueButton";

let fetchMock: ReturnType<typeof vi.fn>;

function bodyOf(mock: ReturnType<typeof vi.fn>): {
  description?: string;
  context: { route: string; element?: Record<string, string> };
} {
  return JSON.parse(String((mock.mock.calls[0][1] as RequestInit).body));
}

beforeEach(() => {
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      received: true,
      delivered: true,
      subject: "Report: Issue on /",
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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
});
