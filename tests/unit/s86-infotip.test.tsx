// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
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

  it("S244 R-S244-3: an InfoTip ending with Open the guide still opens on focus and closes with Escape", async () => {
    const user = userEvent.setup();
    render(
      <InfoTip
        content={
          <>
            <p>Approver or Admin role is required.</p>
            <p>
              <Link href="/help/approval-queue-and-notifications/approve-or-deny#approve">
                Open the guide
              </Link>
            </p>
          </>
        }
        interactive
        label="Approve availability"
      />,
    );

    const trigger = screen.getByRole("button", { name: "About Approve availability" });
    await user.tab();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("region", { name: "About Approve availability" });
    expect(panel).toHaveTextContent("Approver or Admin role is required.");
    expect(screen.getByRole("link", { name: "Open the guide" })).toHaveAttribute(
      "href",
      "/help/approval-queue-and-notifications/approve-or-deny#approve",
    );
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("region", { name: "About Approve availability" }),
    ).toBeNull();
    expect(trigger).toHaveFocus();
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

  it("S245 litmus: leaving the trigger before 600 ms cancels the pending open", () => {
    vi.useFakeTimers();
    render(
      <div>
        <InfoTip content="First help." interactive label="First" />
        <InfoTip content="Second help." interactive label="Second" />
      </div>,
    );
    const first = screen.getByRole("button", { name: "About First" });
    const second = screen.getByRole("button", { name: "About Second" });

    fireEvent.pointerEnter(second, { pointerType: "mouse", clientX: 80, clientY: 40 });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.pointerLeave(second, { pointerType: "mouse", clientX: 30, clientY: 40 });
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole("region", { name: "About Second" })).toBeNull();

    // What the litmus saw: the open still pending on a trigger the pointer had left replaced the
    // panel the user then opened by click.
    fireEvent.pointerEnter(second, { pointerType: "mouse", clientX: 80, clientY: 40 });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.pointerLeave(second, { pointerType: "mouse", clientX: 30, clientY: 40 });
    fireEvent.pointerEnter(first, { pointerType: "mouse", clientX: 30, clientY: 40 });
    fireEvent.click(first);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("region", { name: "About First" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "About Second" })).toBeNull();
  });

  it("S245 litmus: content scrolled under a resting pointer neither opens help nor replaces a panel opened by click", () => {
    vi.useFakeTimers();
    render(
      <div>
        <InfoTip content="First help." interactive label="First" />
        <InfoTip content="Second help." interactive label="Second" />
      </div>,
    );
    const first = screen.getByRole("button", { name: "About First" });
    const second = screen.getByRole("button", { name: "About Second" });

    fireEvent.click(first);
    expect(screen.getByRole("region", { name: "About First" })).toBeInTheDocument();

    // The pointer comes to rest, then a page scroll carries the second trigger under it.
    fireEvent.pointerMove(document.body, {
      pointerType: "mouse",
      clientX: 200,
      clientY: 400,
    });
    fireEvent.scroll(window);
    fireEvent.pointerEnter(second, { pointerType: "mouse", clientX: 200, clientY: 400 });
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("region", { name: "About First" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "About Second" })).toBeNull();

    // Moving the pointer itself over the second trigger is a hover again.
    fireEvent.pointerMove(second, { pointerType: "mouse", clientX: 206, clientY: 401 });
    act(() => vi.advanceTimersByTime(599));
    expect(screen.queryByRole("region", { name: "About Second" })).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("region", { name: "About Second" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "About First" })).toBeNull();
  });

  it("S245 litmus: Escape inside an About panel closes it and keeps it closed while focus returns to the trigger", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        <InfoTip
          content={
            <p>
              <Link href="/help/lease-renewals/update-sources#offered-source-updates">
                Open the guide
              </Link>
            </p>
          }
          interactive
          label="Source updates"
        />
      </>,
    );
    const trigger = screen.getByRole("button", { name: "About Source updates" });

    await user.click(trigger);
    await user.tab();
    expect(screen.getByRole("link", { name: "Open the guide" })).toHaveFocus();

    await user.keyboard("{Escape}");
    // Let the queued focus return run.
    await act(async () => {
      await Promise.resolve();
    });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "About Source updates" })).toBeNull();

    // Focus that the person moves back to the trigger still opens it.
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Before" })).toHaveFocus();
    await user.tab();
    expect(trigger).toHaveFocus();
    expect(
      screen.getByRole("region", { name: "About Source updates" }),
    ).toBeInTheDocument();
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

  it("S244 litmus L26: measures the panel at its own width so its last line stays on screen", async () => {
    vi.stubGlobal("innerWidth", 1360);
    vi.stubGlobal("innerHeight", 900);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 556,
      height: 44,
      left: 204,
      right: 248,
      top: 512,
      width: 44,
      x: 204,
      y: 512,
      toJSON: () => ({}),
    });
    // A panel wraps more at its 360-pixel width than unconstrained, so it is taller there.
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.style.width === "360px" ? 453 : 200;
    });
    const user = userEvent.setup();
    render(
      <InfoTip
        content={
          <p>
            <Link href="/help/lease-renewals/update-sources#offered-source-updates">
              Open the guide
            </Link>
          </p>
        }
        interactive
        label="Source updates"
      />,
    );

    await user.click(screen.getByRole("button", { name: "About Source updates" }));
    // 556 + 8 + 453 runs past 900 - 16, so the panel opens above the trigger: 512 - 453 - 8.
    expect(screen.getByRole("region", { name: "About Source updates" })).toHaveStyle({
      top: "51px",
      width: "360px",
    });
  });
});
