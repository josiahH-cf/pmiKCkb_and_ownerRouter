// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReportIssueButton } from "@/components/feedback/ReportIssueButton";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      received: true,
      delivered: false,
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

    const trigger = screen.getByRole("button", { name: "Report an issue" });
    expect(trigger).toHaveClass("report-issue-trigger");
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Report an issue" })).toBeInTheDocument();
    expect(screen.getByText(/Be as descriptive as possible/)).toBeInTheDocument();
  });

  it("submits the captured page context (route + last-element identity) and shows a receipt", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button data-testid="save-btn" type="button">
          Save
        </button>
        <ReportIssueButton />
      </div>,
    );

    // Interact with another control so it becomes the remembered "last element".
    await user.click(screen.getByTestId("save-btn"));
    await user.click(screen.getByRole("button", { name: "Report an issue" }));
    await user.type(screen.getByLabelText(/What went wrong/), "Save does nothing");
    await user.click(screen.getByRole("button", { name: "Send report" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("/api/report-issue");
    const body = JSON.parse(String(init.body));
    expect(body.description).toBe("Save does nothing");
    expect(typeof body.context.route).toBe("string");
    expect(body.context.element.name).toBe("Save");
    expect(body.context.element.testId).toBe("save-btn");

    expect(await screen.findByText(/your report was captured/i)).toBeInTheDocument();
  });

  it("captures element identity but NEVER an input's value", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <input aria-label="Secret" defaultValue="sensitive-value" />
        <ReportIssueButton />
      </div>,
    );

    await user.click(screen.getByLabelText("Secret"));
    await user.click(screen.getByRole("button", { name: "Report an issue" }));
    await user.click(screen.getByRole("button", { name: "Send report" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(JSON.stringify(body)).not.toContain("sensitive-value");
    expect(body.context.element.name).toBe("Secret"); // aria-label, not the value
  });

  it("closes on Cancel without sending", async () => {
    const user = userEvent.setup();
    render(<ReportIssueButton />);

    await user.click(screen.getByRole("button", { name: "Report an issue" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
