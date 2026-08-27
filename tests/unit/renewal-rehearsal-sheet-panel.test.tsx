// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RenewalRehearsalSheetPanel } from "@/components/admin/RenewalRehearsalSheetPanel";

const initialConfig = {
  operating: {
    configured: true as const,
    spreadsheetId: "operating",
    url: "https://docs.google.com/spreadsheets/d/operating/edit",
  },
  rehearsal: { status: "not_configured" as const, configured: false as const },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("RenewalRehearsalSheetPanel", () => {
  it("labels the operating Sheet view-only and explains that save is not proof", () => {
    render(<RenewalRehearsalSheetPanel initialConfig={initialConfig} />);
    expect(screen.getByRole("link", { name: /operating.*view only/i })).toBeVisible();
    expect(screen.getByText(/can never run a write test/i)).toBeVisible();
    expect(screen.getByText(/proof is a separate explicit operation/i)).toBeVisible();
  });

  it("saves a pasted URL and reports that no Sheet content changed", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            config: {
              ...initialConfig,
              rehearsal: {
                status: "ready",
                configured: true,
                spreadsheetId: "copy",
                url: "https://docs.google.com/spreadsheets/d/copy/edit",
                source: "saved",
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<RenewalRehearsalSheetPanel initialConfig={initialConfig} />);
    await user.type(
      screen.getByLabelText(/rehearsal copy link or id/i),
      "https://docs.google.com/spreadsheets/d/copy/edit",
    );
    await user.click(screen.getByRole("button", { name: /save rehearsal copy/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent(
      /No Sheet contents were read or changed/i,
    );
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("PATCH");
  });
});
