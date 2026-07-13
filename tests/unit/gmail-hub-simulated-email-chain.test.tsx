// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SimulatedEmailChain } from "@/components/gmail-hub/SimulatedEmailChain";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SimulatedEmailChain", () => {
  it("adds a reply to one browser-only thread without making a network call", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<SimulatedEmailChain />);

    expect(screen.getByTestId("simulated-message-count")).toHaveTextContent(
      "1 message in one simulated thread",
    );
    await user.click(screen.getByRole("button", { name: "Add simulated reply" }));

    expect(screen.getByTestId("simulated-message-count")).toHaveTextContent(
      "2 messages in one simulated thread",
    );
    const thread = screen.getByRole("list", { name: "Simulated thread messages" });
    expect(within(thread).getAllByRole("listitem")).toHaveLength(2);
    expect(within(thread).getByText("Dan (simulated)")).toBeInTheDocument();
    expect(
      screen.getByText("Simulated reply 2 added to this browser-only thread."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
  });

  it("resets the fixture and disables an empty reply", async () => {
    const user = userEvent.setup();
    render(<SimulatedEmailChain />);

    const reply = screen.getByRole("textbox", { name: "Simulated reply" });
    await user.clear(reply);
    expect(screen.getByRole("button", { name: "Add simulated reply" })).toBeDisabled();

    await user.type(reply, "A second synthetic message.");
    await user.click(screen.getByRole("button", { name: "Add simulated reply" }));
    await user.click(screen.getByRole("button", { name: "Reset demo thread" }));

    expect(screen.getByTestId("simulated-message-count")).toHaveTextContent(
      "1 message in one simulated thread",
    );
    expect(screen.getByText(/Demo thread reset/)).toBeInTheDocument();
  });

  it("has no Gmail runtime, request, or persistence path", () => {
    const source = readFileSync(
      join(process.cwd(), "components", "gmail-hub", "SimulatedEmailChain.tsx"),
      "utf8",
    );

    expect(source).not.toMatch(/@\/lib\/gmail-runtime/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/firebase|firestore|localStorage|sessionStorage/i);
  });
});
