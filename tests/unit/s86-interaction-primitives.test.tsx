// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ActionLink,
  BusyIndicator,
  Button,
  Icon,
  IconButton,
  Notice,
  PageState,
  Progress,
} from "@/components/ui";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("S86 interaction primitives", () => {
  it("renders the complete non-color action hierarchy", () => {
    render(
      <div>
        <Button>Continue</Button>
        <Button variant="secondary">Review</Button>
        <Button variant="tertiary">Details</Button>
        <Button variant="destructive">Retire</Button>
      </div>,
    );

    expect(screen.getByRole("button", { name: "Continue" })).toHaveClass(
      "primary-button",
    );
    expect(screen.getByRole("button", { name: "Review" })).toHaveClass(
      "secondary-button",
    );
    expect(screen.getByRole("button", { name: "Details" })).toHaveClass(
      "tertiary-button",
    );
    expect(screen.getByRole("button", { name: "Retire" })).toHaveClass(
      "destructive-button",
    );
  });

  it("changes the verb immediately and delays only the indeterminate indicator", () => {
    vi.useFakeTimers();
    render(
      <Button busy busyLabel="Saving">
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Saving" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByTestId("busy-indicator")).toBeNull();

    act(() => vi.advanceTimersByTime(399));
    expect(screen.queryByTestId("busy-indicator")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("busy-indicator")).toBeInTheDocument();
    expect(screen.getByTestId("busy-indicator")).not.toHaveAttribute("aria-valuenow");
  });

  it("discloses external/new-tab navigation without changing link semantics", () => {
    render(
      <ActionLink external href="https://example.com/record/1">
        Review source record
      </ActionLink>,
    );

    const link = screen.getByRole("link", { name: /Review source record/ });
    expect(link).toHaveAttribute("href", "https://example.com/record/1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Opens in a new tab")).toHaveClass("sr-only");
  });

  it("keeps decorative icons silent and labels icon-only controls visibly on focus", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Icon name="check" />
        <IconButton icon="refresh" label="Refresh records" />
      </div>,
    );

    expect(document.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Refresh records" });
    await user.tab();
    expect(button).toHaveFocus();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Refresh records");
    expect(button).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
  });

  it("uses determinate progress only with an exact completed/total pair", () => {
    const { rerender } = render(
      <Progress completed={2} label="Import progress" total={5} />,
    );
    const progress = screen.getByRole("progressbar", { name: "Import progress" });
    expect(progress).toHaveAttribute("value", "2");
    expect(progress).toHaveAttribute("max", "5");
    expect(screen.getByText("2 of 5")).toBeInTheDocument();

    rerender(<BusyIndicator delayMs={0} label="Checking connection" />);
    expect(
      screen.getByRole("status", { name: "Checking connection" }),
    ).not.toHaveAttribute("aria-valuenow");
  });

  it("announces ordinary outcomes politely and reserves alert for urgent errors", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const { rerender } = render(<Notice tone="success">Saved after readback.</Notice>);
    expect(screen.getByRole("status")).toHaveTextContent("Saved after readback.");
    expect(screen.queryByRole("alert")).toBeNull();

    rerender(
      <Notice actionLabel="Retry" onAction={retry} tone="error" urgent>
        The response was lost. Reconcile before retrying.
      </Notice>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("The response was lost");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("renders route states only from owner-supplied truth and recovery", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(
      <PageState
        actionLabel="Try loading again"
        description="The source response was unavailable."
        kind="error"
        onAction={retry}
        title="Could not load this view"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Could not load this view" }),
    ).toBeInTheDocument();
    expect(screen.getByText("The source response was unavailable.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try loading again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
