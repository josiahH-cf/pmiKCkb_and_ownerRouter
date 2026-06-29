// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OperationsConsoleHome } from "@/components/home/OperationsConsoleHome";

afterEach(() => {
  cleanup();
});

describe("OperationsConsoleHome", () => {
  it("renders the launcher with the Console entry", () => {
    render(<OperationsConsoleHome />);

    expect(
      screen.getByRole("heading", { name: "Operations Console", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the Console" })).toHaveAttribute(
      "href",
      "/ask",
    );
  });

  it("opens Lease Renewals at the desk and other spaces at their space detail", () => {
    // Query the DOM directly: the spaces live inside a collapsed <details>, which jsdom may treat
    // as hidden from the accessibility tree.
    const { container } = render(<OperationsConsoleHome />);

    const links = [...container.querySelectorAll("a")].map((anchor) => ({
      name: anchor.textContent?.trim(),
      href: anchor.getAttribute("href"),
    }));

    expect(links).toContainEqual({
      name: "Lease Renewals",
      href: "/lease-renewal",
    });
    expect(links).toContainEqual({
      name: "Maintenance Work Order Intake",
      href: "/spaces/maintenance-work-order-intake",
    });
  });
});
