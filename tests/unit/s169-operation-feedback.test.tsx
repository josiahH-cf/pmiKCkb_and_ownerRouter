// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BusyIndicator, Progress } from "@/components/ui/BusyIndicator";
import { LiveGmailWorkspace } from "@/components/gmail-hub/LiveGmailWorkspace";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("S169/S170 actual operation feedback", () => {
  it("acknowledges a real wait immediately while delaying only the decorative spinner", () => {
    vi.useFakeTimers();
    render(<BusyIndicator label="Loading lease information" />);
    expect(
      screen.getByRole("status", { name: "Loading lease information" }),
    ).toHaveTextContent("Loading lease information");
    expect(screen.queryByTestId("busy-indicator")).toBeNull();
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByTestId("busy-indicator")).toHaveAttribute("aria-hidden", "true");
  });
  it("never calls a pending Gmail check missing access or a completed empty worklist", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<LiveGmailWorkspace authenticatedEmail="staff@example.test" />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking connection");
    expect(screen.queryByText(/Waiting on Gmail access/)).toBeNull();
    expect(screen.queryByText(/No linked renewal or maintenance/)).toBeNull();
    expect(screen.queryByText(/Action Required/)).toBeNull();
  });
  it.each([
    { completed: 1, total: 0 },
    { completed: 4, total: 3 },
    { completed: -1, total: 3 },
    { completed: 1.5, total: 3 },
  ])("preserves refusal of invented progress %j", (values) => {
    expect(() => render(<Progress {...values} label="Actual progress" />)).toThrow(
      RangeError,
    );
  });
});
