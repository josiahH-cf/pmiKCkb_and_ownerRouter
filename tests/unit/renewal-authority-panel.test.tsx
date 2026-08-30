// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RenewalAuthorityPanel } from "@/components/lease-renewal/RenewalAuthorityPanel";

afterEach(cleanup);

describe("RenewalAuthorityPanel", () => {
  it("tells an Editor what is ordinary work and why stronger or external effects stay unavailable", () => {
    render(<RenewalAuthorityPanel role="Editor" />);

    expect(screen.getByRole("heading", { name: "Renewal authority" })).toBeVisible();
    expect(screen.getByText(/Exact action keys, runtime suspensions/)).toBeVisible();
    expect(row("Routine renewal work")).toHaveTextContent("Role available");
    expect(row("Reference comps")).toHaveTextContent(
      "exact RentCast key, runtime state, connection, and allowance",
    );
    expect(row("Source reconciliation")).toHaveTextContent(
      "Approver or Admin authority is required",
    );
    expect(row("Pricing suggestion approval")).toHaveTextContent(
      "Admin authority is required",
    );
    expect(row("RentVine and operating-Sheet writes")).toHaveTextContent(
      "exact action key is closed; no role can override it",
    );
    expect(row("Send from the app")).toHaveTextContent("never sends renewal messages");
    expect(screen.getByText(/exact draft key and runtime checks/)).toBeVisible();
    expect(screen.getByText(/send from Gmail\. The app never sends it/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Check renewal data connections" }),
    ).toHaveAttribute("href", "/connections#connection-task-renewal-data");
    expect(
      screen.getByRole("link", { name: "Check messaging connections" }),
    ).toHaveAttribute("href", "/connections#connection-task-communications");
  });

  it("shows Approver reconciliation authority without implying pricing or source-write authority", () => {
    render(<RenewalAuthorityPanel role="Approver" />);

    expect(row("Source reconciliation")).toHaveTextContent("Role available");
    expect(row("Pricing suggestion approval")).toHaveTextContent("Unavailable");
    expect(row("RentVine and operating-Sheet writes")).toHaveTextContent("Unavailable");
  });

  it("still tells an Admin that closed source writes and in-app sending cannot be overridden", () => {
    render(<RenewalAuthorityPanel role="Admin" />);

    expect(row("Pricing suggestion approval")).toHaveTextContent("Role available");
    expect(row("RentVine and operating-Sheet writes")).toHaveTextContent(
      "no role can override it",
    );
    expect(row("Send from the app")).toHaveTextContent("Unavailable");
  });
});

function row(label: string): HTMLElement {
  const heading = screen.getByText(label);
  const item = heading.closest("li");
  expect(item).not.toBeNull();
  return within(item as HTMLElement)
    .getByText(label)
    .closest("li") as HTMLElement;
}
