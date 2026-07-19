// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionTimeout } from "@/components/layout/SessionTimeout";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SessionTimeout (NOTIF-6)", () => {
  it("warns at 28 min idle with a 2-minute countdown, then signs out at 30", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    render(<SessionTimeout onTimeout={onTimeout} />);

    act(() => vi.advanceTimersByTime(28 * 60_000));
    const dialog = screen.getByRole("alertdialog", { name: "Are you still active?" });
    expect(dialog).toHaveTextContent("Signing out in 2:00");
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(2 * 60_000));
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("'Stay signed in' resets the idle timer and dismisses the warning", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    render(<SessionTimeout onTimeout={onTimeout} />);

    act(() => vi.advanceTimersByTime(28 * 60_000));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stay signed in" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();

    // Two more minutes of idle since the reset — still far below the 28-min warning.
    act(() => vi.advanceTimersByTime(2 * 60_000));
    expect(onTimeout).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("shows nothing while the user is within the idle window", () => {
    vi.useFakeTimers();
    render(<SessionTimeout onTimeout={vi.fn()} />);

    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
