// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnticipatoryDraftComposer } from "@/components/gmail-hub/AnticipatoryDraftComposer";
import { DRAFT_BANNER } from "@/lib/constants";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AnticipatoryDraftComposer", () => {
  it("posts to the anticipatory-draft route and renders a banner-bearing draft with no Send control", async () => {
    const user = userEvent.setup();
    const draft = `${DRAFT_BANNER}\n\nTailored: thanks, we will follow up shortly.`;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ ok: true, draft, usedModel: true, refusedBeforeModel: false, errors: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AnticipatoryDraftComposer />);
    await user.click(screen.getByRole("button", { name: "Compose draft" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/gmail-hub/anticipatory-draft");

    expect(await screen.findByText(/Tailored: thanks, we will follow up shortly\./)).toBeInTheDocument();
    // The governance ceiling is a review-before-send draft: there is no send control anywhere.
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy draft" })).toBeInTheDocument();
  });

  it("surfaces a spine refusal (refusedBeforeModel) instead of a draft", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        ok: false,
        usedModel: false,
        refusedBeforeModel: true,
        errors: ['Reply template "x" is Proposed; only Approved reply patterns can produce drafts.'],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AnticipatoryDraftComposer />);
    await user.click(screen.getByRole("button", { name: "Compose draft" }));

    expect(await screen.findByText(/Refused before the model/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy draft" })).toBeNull();
  });
});
