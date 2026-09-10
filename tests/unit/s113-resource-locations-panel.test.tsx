// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenewalResourceLocations } from "@/components/lease-renewal/RenewalResourceLocations";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("S113 resource input controls", () => {
  it("renders persistent labeled blank inputs without a customer URL", async () => {
    const fetch = vi.fn(async (_url: string, _init: { body: string }) => ({
      ok: true,
      json: async () => ({
        settings: {
          version: 1,
          entries: {
            insurance_flyer: {
              id: "insurance_flyer",
              url: "https://example.org/flyer.pdf",
              verified: false,
              recordedAt: "2026-09-10T12:00:00.000Z",
              recordedByUid: "admin",
            },
          },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetch);
    render(
      <RenewalResourceLocations
        role="Admin"
        initialSettings={{ version: 0, entries: {} }}
      />,
    );
    for (const label of [
      "Insurance flyer",
      "Renewal information form",
      "Approved standard lease location",
      "Approved renewal extension location",
    ])
      expect(screen.getByLabelText(label)).toHaveValue("");
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.change(screen.getByLabelText("Insurance flyer"), {
      target: { value: "https://example.org/flyer.pdf" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save insurance flyer" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Link saved and read back"),
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      resource: {
        id: "insurance_flyer",
        url: "https://example.org/flyer.pdf",
        verified: false,
      },
      expectedVersion: 0,
    });
    expect(screen.getByLabelText("Insurance flyer")).toHaveValue(
      "https://example.org/flyer.pdf",
    );
  });
  it("distinguishes a failed settings read from an empty settings record", () => {
    render(<RenewalResourceLocations role="Admin" initialSettings={null} />);
    expect(screen.getByRole("alert")).toHaveTextContent("could not be read");
    expect(screen.getByLabelText("Insurance flyer")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save insurance flyer" })).toBeNull();
  });
});
