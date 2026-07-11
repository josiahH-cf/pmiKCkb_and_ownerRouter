// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GmailHubHome } from "@/components/gmail-hub/GmailHubHome";
import { WAITING_ON_GMAIL } from "@/lib/notifications/families";

afterEach(cleanup);

describe("GmailHubHome (AC-S15-5)", () => {
  it("presents the drafts, templates, and summary tools together", () => {
    render(<GmailHubHome />);
    expect(screen.getByRole("button", { name: "Compose draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Evaluate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Summarize thread" })).toBeInTheDocument();
  });

  it("renders every live-mailbox affordance disabled with the exact 'Waiting on Gmail access' literal", () => {
    render(<GmailHubHome />);

    // The "read my inbox" control is disabled and carries the exact gated string.
    const readInbox = screen.getByRole("button", { name: WAITING_ON_GMAIL });
    expect(readInbox).toBeDisabled();
    expect(WAITING_ON_GMAIL).toBe("Waiting on Gmail access");

    // Both Gmail-dependent families are present and gated with the same literal.
    expect(screen.getByText("RentVine replies")).toBeInTheDocument();
    expect(screen.getByText("Owner replies")).toBeInTheDocument();
    // read-my-inbox button + rentvine_replies pill + owner_process_replies pill = 3 occurrences.
    expect(screen.getAllByText(WAITING_ON_GMAIL).length).toBeGreaterThanOrEqual(3);
  });

  it("has no send control anywhere on the hub", () => {
    render(<GmailHubHome />);
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
  });
});
