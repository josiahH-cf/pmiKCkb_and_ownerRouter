// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavigationFeedback } from "@/components/layout/NavigationFeedback";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("S170 page navigation feedback follows only a real page navigation", () => {
  it("leaves a form that answers on the current screen to its own status", () => {
    render(
      <NavigationFeedback>
        <form aria-label="Ask a question" onSubmit={(event) => event.preventDefault()}>
          <input name="question" defaultValue="Private typed words" />
          <button type="submit">Get answer</button>
        </form>
      </NavigationFeedback>,
    );
    fireEvent.submit(screen.getByRole("form", { name: "Ask a question" }));
    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(screen.queryByRole("status", { name: "Page navigation" })).toBeNull();
    expect(screen.queryByText(/has not finished opening/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Retry navigation" })).toBeNull();
  });

  it("still acknowledges a form the browser itself navigates", () => {
    render(
      <NavigationFeedback>
        <form aria-label="Find a process" action="/processes">
          <input name="q" defaultValue="renewal" />
          <button type="submit">Search</button>
        </form>
      </NavigationFeedback>,
    );
    fireEvent.submit(screen.getByRole("form", { name: "Find a process" }));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("status", { name: "Page navigation" })).toHaveTextContent(
      "Opening Find a process",
    );
  });
});
