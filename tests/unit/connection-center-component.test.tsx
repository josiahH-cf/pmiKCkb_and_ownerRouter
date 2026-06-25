// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ConnectionCenter } from "@/components/connections/ConnectionCenter";
import { buildConnectionView } from "@/lib/connections/connection-status";

afterEach(() => {
  cleanup();
});

describe("ConnectionCenter", () => {
  it("renders connector cards with status and never leaks an env var name or secret", () => {
    const view = buildConnectionView({
      RENTVINE_API_BASE_URL: true,
      RENTVINE_API_KEY: true,
      RENTVINE_API_SECRET: true,
    });
    render(<ConnectionCenter view={view} />);

    expect(
      screen.getByRole("heading", { name: "Connections", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("RentVine")).toBeInTheDocument();
    expect(screen.getByText("Dotloop")).toBeInTheDocument();

    // RentVine fully configured → ready to verify; the OAuth connectors read Not connected.
    expect(screen.getByText("Ready to verify")).toBeInTheDocument();
    expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0);

    // The guided wizard surfaces what PMI verifies and an app-managed connect CTA.
    expect(screen.getAllByText("Available in the next release.").length).toBeGreaterThan(
      0,
    );

    // No env var name (or secret value) ever appears in the UI.
    expect(document.body.textContent).not.toContain("RENTVINE_API_KEY");
    expect(document.body.textContent).not.toContain("RENTVINE_API_BASE_URL");
  });
});
