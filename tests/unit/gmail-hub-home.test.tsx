// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GmailHubHome } from "@/components/gmail-hub/GmailHubHome";

afterEach(cleanup);

describe("Workflow Communications home (AC-GW-1)", () => {
  it("states the workflow-adapter boundary and exposes no general inbox tools", () => {
    render(<GmailHubHome />);
    expect(
      screen.getByRole("heading", { name: "Workflow Communications" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gmail connection" })).toBeInTheDocument();
    expect(screen.getByText(/mailbox management stay in Gmail/i)).toBeInTheDocument();
    expect(screen.queryByText("Recent inbox threads")).not.toBeInTheDocument();
    expect(screen.queryByText("Compose message")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review exact message" })).toBeNull();
    expect(
      screen.queryByRole("heading", {
        name: "Admin-only governed workflow recovery tools",
      }),
    ).toBeNull();
    expect(screen.queryByRole("heading", { name: "Simulated email chain" })).toBeNull();
  });

  it("keeps governed recovery and paste tools Admin-only after retiring simulation", () => {
    render(<GmailHubHome canManageAdmin />);
    expect(
      screen.getByRole("heading", {
        name: "Admin-only governed workflow recovery tools",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/draft and review workflow replies/i)).toBeVisible();
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
