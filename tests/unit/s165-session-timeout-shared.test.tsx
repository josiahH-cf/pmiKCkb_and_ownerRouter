// @vitest-environment jsdom

// S165: the session cookie is shared by every tab, so the idle clock is shared too. A tab that sat
// in the background (or was suspended by a phone) must not sign out a session the person is
// actively using in another tab. A person idle everywhere is still warned and signed out.

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SHARED_ACTIVITY_KEY, SessionTimeout } from "@/components/layout/SessionTimeout";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

/** Another tab of the same browser recording activity now. */
function activityInAnotherTab() {
  window.localStorage.setItem(SHARED_ACTIVITY_KEY, String(Date.now()));
}

describe("S165 shared idle clock (BEH-S165-1, BEH-S165-7)", () => {
  it("a background tab does not warn or sign out while another tab is active", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    render(<SessionTimeout onTimeout={onTimeout} />);

    // This tab sees no activity for 40 minutes, while the person keeps working in another tab.
    for (let minute = 0; minute < 40; minute += 1) {
      act(() => vi.advanceTimersByTime(60_000));
      activityInAnotherTab();
    }
    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("activity in another tab clears this tab's warning", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    render(<SessionTimeout onTimeout={onTimeout} />);

    act(() => vi.advanceTimersByTime(28 * 60_000));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    activityInAnotherTab();
    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    act(() => vi.advanceTimersByTime(2 * 60_000));
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("this tab's activity and its Stay signed in action are recorded for the other tabs", () => {
    vi.useFakeTimers();
    render(<SessionTimeout onTimeout={vi.fn()} />);
    const atMount = Number(window.localStorage.getItem(SHARED_ACTIVITY_KEY));
    expect(atMount).toBeGreaterThan(0);

    act(() => vi.advanceTimersByTime(60_000));
    act(() => window.dispatchEvent(new Event("touchstart")));
    const afterTouch = Number(window.localStorage.getItem(SHARED_ACTIVITY_KEY));
    expect(afterTouch).toBe(atMount + 60_000);

    act(() => vi.advanceTimersByTime(28 * 60_000));
    fireEvent.click(screen.getByRole("button", { name: "Stay signed in" }));
    expect(Number(window.localStorage.getItem(SHARED_ACTIVITY_KEY))).toBe(
      afterTouch + 28 * 60_000,
    );
  });

  it("a person idle in every tab is still warned and signed out", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    render(<SessionTimeout onTimeout={onTimeout} />);

    act(() => vi.advanceTimersByTime(28 * 60_000));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Signing out in 2:00");

    act(() => vi.advanceTimersByTime(2 * 60_000));
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("a shared time in the future is ignored rather than keeping the session open", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    render(<SessionTimeout onTimeout={onTimeout} />);
    window.localStorage.setItem(
      SHARED_ACTIVITY_KEY,
      String(Date.now() + 24 * 60 * 60_000),
    );

    act(() => vi.advanceTimersByTime(30 * 60_000));

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});
