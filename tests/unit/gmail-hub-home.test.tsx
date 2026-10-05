// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GmailHubHome } from "@/components/gmail-hub/GmailHubHome";

afterEach(cleanup);

describe("Workflow Communications home (AC-GW-1)", () => {
  it("states the workflow-adapter boundary and exposes no general inbox tools", () => {
    render(<GmailHubHome />);
    expect(
      screen.getByRole("heading", { name: "Workflow Communications" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Linked conversations" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/mailbox management stays in Gmail/i)).toBeInTheDocument();
    expect(screen.queryByText("Recent inbox threads")).not.toBeInTheDocument();
    expect(screen.queryByText("Compose message")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review exact message" })).toBeNull();
    expect(
      screen.queryByRole("heading", {
        name: "Workflow draft recovery",
      }),
    ).toBeNull();
    expect(screen.queryByRole("heading", { name: "Simulated email chain" })).toBeNull();
  });

  it("keeps governed recovery and paste tools Admin-only after retiring simulation", () => {
    render(<GmailHubHome canManageAdmin />);
    const disclosure = screen.getByText("Admin recovery tools").closest("details")!;
    expect(disclosure).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Admin recovery tools"));
    expect(disclosure).toHaveAttribute("open");
    expect(
      screen.getByRole("heading", {
        name: "Workflow draft recovery",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Unsent drafts only\. A person sends from Gmail\./i),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Simulated email chain" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Anticipatory draft" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Template & triage workspace" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Paste sanitized facts" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thread summary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compose draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Evaluate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Summarize thread" })).toBeInTheDocument();
  });
});
