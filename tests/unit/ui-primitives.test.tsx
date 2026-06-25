// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Button,
  Card,
  Disclosure,
  EmptyState,
  ModeChip,
  PageHeader,
  SourceTag,
  StatusDot,
  StatusPill,
  Stepper,
  Tabs,
} from "@/components/ui";

afterEach(() => {
  cleanup();
});

describe("Button", () => {
  it("defaults to a primary, type=button button and fires onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("primary-button");
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a compact secondary variant with merged classNames", () => {
    render(
      <Button className="extra" size="compact" variant="secondary">
        Cancel
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button).toHaveClass("secondary-button", "compact-button", "extra");
    expect(button).not.toHaveClass("primary-button");
  });
});

describe("Card", () => {
  it("renders a string title as a subtitle plus actions and children", () => {
    render(
      <Card actions={<button type="button">Act</button>} title="Owner decision">
        <p>Body</p>
      </Card>,
    );
    expect(
      screen.getByRole("heading", { name: "Owner decision", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });
});

describe("StatusPill", () => {
  it("carries the value through data-value for severity styling", () => {
    render(<StatusPill value="High" />);
    const pill = screen.getByText("High");
    expect(pill).toHaveClass("queue-pill");
    expect(pill).toHaveAttribute("data-value", "High");
  });
});

describe("StatusDot", () => {
  it("renders a labelled dot with the connection status", () => {
    render(<StatusDot label="Connected" status="connected" />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
    const dot = document.querySelector(".ui-status-dot");
    expect(dot).toHaveAttribute("data-status", "connected");
  });
});

describe("SourceTag", () => {
  it("renders source and confidence and exposes confidence for styling", () => {
    render(<SourceTag confidence="Needs Verification" source="Sheet" />);
    const tag = screen.getByText("Sheet · Needs Verification");
    expect(tag).toHaveAttribute("data-confidence", "Needs Verification");
  });
});

describe("Stepper", () => {
  it("marks steps done / current / upcoming from the current index", () => {
    render(
      <Stepper
        currentIndex={1}
        steps={[
          { id: "data", label: "Data check" },
          { id: "owner", label: "Owner decision" },
          { id: "tenant", label: "Tenant offer" },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveAttribute("data-state", "done");
    expect(items[1]).toHaveAttribute("data-state", "current");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[2]).toHaveAttribute("data-state", "upcoming");
  });
});

describe("Tabs", () => {
  it("shows the first tab by default and switches on click", async () => {
    const user = userEvent.setup();
    render(
      <Tabs
        tabs={[
          { id: "email", label: "Email", content: <p>Email body</p> },
          { id: "text", label: "Text", content: <p>Text body</p> },
        ]}
      />,
    );
    expect(screen.getByText("Email body")).toBeInTheDocument();
    expect(screen.queryByText("Text body")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Text" }));
    expect(screen.getByText("Text body")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Text" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("names the tablist and supports roving tabindex + arrow-key navigation", async () => {
    const user = userEvent.setup();
    render(
      <Tabs
        ariaLabel="Channel"
        tabs={[
          { id: "email", label: "Email", content: <p>Email body</p> },
          { id: "portal", label: "Portal", content: <p>Portal body</p> },
          { id: "text", label: "Text", content: <p>Text body</p> },
        ]}
      />,
    );
    expect(screen.getByRole("tablist", { name: "Channel" })).toBeInTheDocument();
    const email = screen.getByRole("tab", { name: "Email" });
    const text = screen.getByRole("tab", { name: "Text" });
    expect(email).toHaveAttribute("tabindex", "0");
    expect(text).toHaveAttribute("tabindex", "-1");

    email.focus();
    await user.keyboard("{ArrowLeft}"); // wraps from the first tab to the last
    expect(screen.getByText("Text body")).toBeInTheDocument();
    expect(text).toHaveAttribute("tabindex", "0");
    expect(text).toHaveFocus();
  });
});

describe("EmptyState, Disclosure, PageHeader, ModeChip", () => {
  it("renders an empty state with title and description", () => {
    render(<EmptyState description="Nothing in your window." title="All clear" />);
    expect(screen.getByText("All clear")).toBeInTheDocument();
    expect(screen.getByText("Nothing in your window.")).toBeInTheDocument();
  });

  it("renders a closed disclosure by default and an open one when asked", () => {
    const { rerender } = render(
      <Disclosure summary="Data diagnostics">
        <p>counts</p>
      </Disclosure>,
    );
    expect(screen.getByText("Data diagnostics")).toBeInTheDocument();
    expect(document.querySelector("details")).not.toHaveAttribute("open");

    rerender(
      <Disclosure defaultOpen summary="Data diagnostics">
        <p>counts</p>
      </Disclosure>,
    );
    expect(document.querySelector("details")).toHaveAttribute("open");
  });

  it("renders a page header with subtitle + actions and a mode chip", () => {
    render(
      <PageHeader
        actions={<ModeChip>Sample data</ModeChip>}
        subtitle="12 in your window"
        title="Renewals"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Renewals", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("12 in your window")).toBeInTheDocument();
    expect(screen.getByText("Sample data")).toBeInTheDocument();
  });
});
