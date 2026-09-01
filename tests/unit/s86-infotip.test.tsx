// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InfoTip } from "@/components/ui";
import { resetTransientLayersForTests } from "@/lib/ui/transient-layer";

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  resetTransientLayersForTests();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("S86 InfoTip", () => {
  it("opens on focus, is described by the trigger, and closes with Escape", async () => {
    const user = userEvent.setup();
    render(<InfoTip content="Uses the verified source record." label="Source status" />);

    const trigger = screen.getByRole("button", { name: "About Source status" });
    await user.tab();
    expect(trigger).toHaveFocus();
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Uses the verified source record.");
    expect(trigger).toHaveAttribute("aria-describedby", tip.id);
    expect(trigger).not.toHaveAttribute("title");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("does not open at 599 ms and opens at exactly 600 ms for a fine pointer", () => {
    vi.useFakeTimers();
    render(<InfoTip content="Supplementary help." label="Lease owner" />);
    const trigger = screen.getByRole("button", { name: "About Lease owner" });

    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(599));
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Supplementary help.");
  });

  it("keeps only one peer tip open and clears it on a breakpoint change", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <InfoTip content="First help." label="First" />
        <InfoTip content="Second help." label="Second" />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "About First" }));
    expect(screen.getByText("First help.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "About Second" }));
    expect(screen.queryByText("First help.")).toBeNull();
    expect(screen.getByText("Second help.")).toBeInTheDocument();

    fireEvent(window, new Event("resize"));
    expect(screen.queryByText("Second help.")).toBeNull();
  });

  it("uses a controlled non-modal popover when help contains controls", async () => {
    const user = userEvent.setup();
    render(
      <InfoTip
        content={<a href="/connections">Review connections</a>}
        interactive
        label="Connection status"
      />,
    );

    const trigger = screen.getByRole("button", { name: "About Connection status" });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.getByRole("link", { name: "Review connections" })).toBeInTheDocument();
  });

  it("keeps help open across trigger-to-panel travel and closes at 150 ms", () => {
    vi.useFakeTimers();
    render(<InfoTip content="Supplementary help." label="Lease owner" />);
    const trigger = screen.getByRole("button", { name: "About Lease owner" });
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(600));
    const tip = screen.getByRole("tooltip");

    fireEvent.pointerLeave(trigger, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.pointerEnter(tip, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByRole("tooltip")).toBeVisible();

    fireEvent.pointerLeave(tip, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(149));
    expect(screen.getByRole("tooltip")).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("clamps the panel inside a 320-pixel viewport", async () => {
    vi.stubGlobal("innerWidth", 320);
    vi.stubGlobal("innerHeight", 640);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 44,
      height: 44,
      left: 310,
      right: 354,
      top: 0,
      width: 44,
      x: 310,
      y: 0,
      toJSON: () => ({}),
    });
    const user = userEvent.setup();
    render(<InfoTip content="Supplementary help." label="Lease owner" />);

    await user.click(screen.getByRole("button", { name: "About Lease owner" }));
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveStyle({ left: "16px", width: "288px" });
  });
});
