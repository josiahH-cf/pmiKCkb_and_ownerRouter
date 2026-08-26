// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RenewalNoticeDraftComposer } from "@/components/lease-renewal/RenewalNoticeDraftComposer";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RenewalNoticeDraftComposer currency boundary", () => {
  it("normalizes a human-formatted offer into the preview payload", async () => {
    const fetchMock = vi
      .fn<
        (
          url: string,
          init?: RequestInit,
        ) => Promise<{ ok: boolean; json: () => Promise<Record<string, unknown>> }>
      >()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "preview",
          recipient: { to: "tenant@example.test" },
          subject: "Preview",
          body: "Preview body",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<RenewalNoticeDraftComposer leaseId="lease-1" />);

    fireEvent.change(screen.getByLabelText(/Offered rent/i), {
      target: { value: "$1,500.25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview draft" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      leaseId: "lease-1",
      confirm: false,
      offer: {
        channel: "tenant",
        ownerDecision: "increase",
        offeredRent: 1500.25,
      },
    });
  });

  it("keeps preview disabled for malformed grouping", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<RenewalNoticeDraftComposer leaseId="lease-1" />);
    fireEvent.change(screen.getByLabelText(/Offered rent/i), {
      target: { value: "1,50" },
    });
    expect(screen.getByRole("button", { name: "Preview draft" })).toBeDisabled();
  });
});
