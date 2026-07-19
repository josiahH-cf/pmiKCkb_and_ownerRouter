// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransactionalDestinationPanel } from "@/components/admin/TransactionalDestinationPanel";

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

describe("TransactionalDestinationPanel", () => {
  it("shows the current destination and disables Save until the value changes", () => {
    render(<TransactionalDestinationPanel initialEmail="josiah@pmikcmetro.com" />);
    const input = screen.getByLabelText(/Destination email/) as HTMLInputElement;
    expect(input.value).toBe("josiah@pmikcmetro.com");
    expect(screen.getByRole("button", { name: /save destination/i })).toBeDisabled();
  });

  it("PATCHes the edited destination and confirms on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ destination: { destination_email: "owner@example.com" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<TransactionalDestinationPanel initialEmail="josiah@pmikcmetro.com" />);
    const input = screen.getByLabelText(/Destination email/);
    await user.clear(input);
    await user.type(input, "owner@example.com");

    const save = screen.getByRole("button", { name: /save destination/i });
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "/api/admin/transactional-destination",
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      destination_email: "owner@example.com",
    });

    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    expect(screen.getByRole("button", { name: /save destination/i })).toBeDisabled();
  });

  it("surfaces a recoverable error and does not confirm", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ error: "Enter a valid email address." }, 400),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<TransactionalDestinationPanel initialEmail="josiah@pmikcmetro.com" />);
    const input = screen.getByLabelText(/Destination email/);
    await user.clear(input);
    await user.type(input, "owner@example.com");
    await user.click(screen.getByRole("button", { name: /save destination/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a valid email address.",
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});
