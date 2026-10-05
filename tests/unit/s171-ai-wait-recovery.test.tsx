// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AskForm } from "@/components/ask/AskForm";
import { RefineWithAi } from "@/components/email/RefineWithAi";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("S171 the owning Dashboard question", () => {
  it.each(["Li", "王"])(
    "accepts a valid short identity %s through the actual labelled form",
    (identity) => {
      render(<AskForm ownerKey="fixture-owner" />);
      const input = screen.getByLabelText<HTMLTextAreaElement>(/Question/);
      fireEvent.change(input, { target: { value: identity } });
      expect(input.minLength).toBe(1);
      expect(input.checkValidity()).toBe(true);
      expect(document.body.textContent).not.toContain(
        "You can type it or use Dictate to speak it",
      );
    },
  );
  it("bounds the actual wording refinement without saving or drafting", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetch);
    try {
      render(
        <RefineWithAi
          request={{ surface: "renewal_owner", leaseId: "7001" }}
          currentBody="Current edited draft"
          onApply={vi.fn()}
        />,
      );
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "Shorten this" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Refine wording" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_001);
      });
      expect(screen.getByRole("button", { name: "Refine wording" })).toBeEnabled();
      expect(screen.getByText(/draft is unchanged/i)).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("retains the submitted question and permits stopping local waiting without claiming server cancellation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    render(<AskForm ownerKey="fixture-owner" />);
    const input = screen.getByLabelText(/Question/);
    fireEvent.change(input, { target: { value: "Jane Doe" } });
    fireEvent.click(screen.getByRole("button", { name: "Get answer" }));
    expect(input).toHaveValue("Jane Doe");
    const stop = screen.getByRole("button", { name: "Stop waiting" });
    await act(async () => {
      fireEvent.click(stop);
    });
    expect(input).toHaveValue("Jane Doe");
    expect(screen.getAllByText(/server may still finish/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
