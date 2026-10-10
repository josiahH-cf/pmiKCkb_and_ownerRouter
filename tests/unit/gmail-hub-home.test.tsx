// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GmailHubHome } from "@/components/gmail-hub/GmailHubHome";

beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url.includes("/sequences")
          ? { sequences: [], cursor: null }
          : { mailbox: null, linked: [], threads: [] },
      ),
    ),
  ),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

  it("retires pasted/synthetic triage from the shared hub for Admin as well as ordinary staff", async () => {
    render(<GmailHubHome canManageAdmin />);
    for (const name of ["Incoming", "Outgoing", "Drafts", "Scheduled"])
      expect(screen.getByRole("tab", { name })).toBeVisible();
    for (const name of [
      "Pasted text and reply patterns",
      "Anticipatory draft",
      "Template & triage workspace",
      "Paste sanitized facts",
      "Thread summary",
    ])
      expect(screen.queryByRole("heading", { name })).not.toBeInTheDocument();
    expect(screen.queryByText("Admin text tools")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Drafts" }));
    await screen.findByText("No matching drafts communications in this page.");
    expect(
      vi.mocked(fetch).mock.calls.every(([url]) => !String(url).includes("/templates")),
    ).toBe(true);
  });
});
