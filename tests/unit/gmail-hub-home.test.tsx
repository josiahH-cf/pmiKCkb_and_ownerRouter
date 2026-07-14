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
    expect(screen.getByText(/not a replacement inbox/i)).toBeInTheDocument();
    expect(screen.queryByText("Recent inbox threads")).not.toBeInTheDocument();
    expect(screen.queryByText("Compose message")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review exact message" })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Admin-only pasted/ })).toBeNull();
  });

  it("keeps pasted and synthetic tools behind the Admin capability", () => {
    render(<GmailHubHome canManageAdmin />);
    expect(
      screen.getByRole("heading", { name: "Admin-only pasted and synthetic fallback" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Simulated email chain" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compose draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Evaluate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Summarize thread" })).toBeInTheDocument();
  });
});
