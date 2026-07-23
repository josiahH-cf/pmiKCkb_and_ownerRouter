// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OwnerDecisionForm } from "@/components/lease-renewal/RenewalProgressControls";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OwnerDecisionForm reference-only comp lookup (AC-S28-2)", () => {
  it("shows the looked-up range read-only with the caption and never binds offeredRent", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        rangeLow: 1450,
        rangeHigh: 1600,
        pointEstimate: 1525,
        source: "Manual entry",
        confidence: "Likely",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <OwnerDecisionForm address="104 NE Lindsay Ave" current={null} leaseId="L1" />,
    );

    const rentInput = screen.getByLabelText(/Offered rent/i) as HTMLInputElement;
    expect(rentInput.value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: /Look up market comps/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/Reference only\. Does not set the rent\./),
      ).toBeInTheDocument(),
    );
    // The range renders as read-only reference text with the provider attribution.
    expect(
      screen.getByText(
        (content) => content.includes("$1,450") && content.includes("Manual entry"),
      ),
    ).toBeInTheDocument();
    // The offered-rent input is NEVER set from the comp result.
    expect(rentInput.value).toBe("");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lease-renewal/market-comps",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("renders the comps-screenshot file control (not a free-text URL field)", () => {
    render(
      <OwnerDecisionForm address="104 NE Lindsay Ave" current={null} leaseId="L1" />,
    );
    const fileInput = screen.getByLabelText(/Comps screenshot/i) as HTMLInputElement;
    expect(fileInput.type).toBe("file");
  });
});
