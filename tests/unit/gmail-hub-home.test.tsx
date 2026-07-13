// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GmailHubHome } from "@/components/gmail-hub/GmailHubHome";
import {
  GMAIL_EVENT_RULES_REQUIRED,
  WAITING_ON_GMAIL,
} from "@/lib/notifications/families";

afterEach(cleanup);

describe("GmailHubHome (AC-S15-5, AC-S19-7)", () => {
  it("separates the live workspace from browser-only and pasted-text fallbacks", () => {
    render(<GmailHubHome />);
    expect(screen.getByRole("heading", { name: "Live Gmail" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Offline and demo fallback" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Simulated email chain" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Browser only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compose draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Evaluate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Summarize thread" })).toBeInTheDocument();
  });

  it("keeps live controls disabled until a real connection succeeds", () => {
    render(<GmailHubHome />);

    expect(WAITING_ON_GMAIL).toBe("Waiting on Gmail access");
    expect(screen.getByRole("button", { name: "Create unsent draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review exact message" })).toBeDisabled();

    expect(screen.getByText("RentVine replies")).toBeInTheDocument();
    expect(screen.getByText("Owner replies")).toBeInTheDocument();
    expect(screen.getAllByText(WAITING_ON_GMAIL).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(GMAIL_EVENT_RULES_REQUIRED)).toHaveLength(2);
  });

  it("has no immediate Send control before exact-message review", () => {
    render(<GmailHubHome />);
    expect(screen.queryByRole("button", { name: "Send this exact message" })).toBeNull();
    expect(screen.getByRole("button", { name: "Review exact message" })).toBeDisabled();
  });
});
