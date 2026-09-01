// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { VerifyConnectionButton } from "@/components/connections/VerifyConnectionButton";

afterEach(() => {
  cleanup();
  refresh.mockReset();
  vi.unstubAllGlobals();
});

describe("S83 supported connection check feedback", () => {
  it("runs one read check, exposes pending semantics, then reserves green for verified readback", async () => {
    const user = userEvent.setup();
    let resolveResponse!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<VerifyConnectionButton connectorId="rentvine" connectorName="RentVine" />);

    await user.click(screen.getByRole("button", { name: "Check RentVine connection" }));
    expect(screen.getByRole("button", { name: "Checking RentVine…" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveResponse(
      new Response(JSON.stringify({ connector_id: "rentvine", verified: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(
      await screen.findByText("Verified: RentVine answered the live check."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Check RentVine connection" }),
    ).toHaveAttribute("data-state", "success");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("treats transport and malformed responses as retryable failure without leaking server text", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "sensitive provider detail" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    render(<VerifyConnectionButton connectorId="rentcast" connectorName="RentCast" />);

    await user.click(screen.getByRole("button", { name: "Check RentCast connection" }));
    expect(await screen.findByText("The check could not run")).toBeVisible();
    expect(document.body.textContent).not.toContain("sensitive provider detail");
    expect(
      screen.getByRole("button", { name: "Check RentCast connection" }),
    ).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("rejects a mismatched or extended success envelope instead of showing verified", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              connector_id: "google_sheets",
              verified: true,
              provider_detail: "must not be trusted or shown",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    render(<VerifyConnectionButton connectorId="rentvine" connectorName="RentVine" />);

    await user.click(screen.getByRole("button", { name: "Check RentVine connection" }));

    expect(await screen.findByText("The check could not run")).toBeVisible();
    expect(screen.queryByText(/Verified/)).toBeNull();
    expect(document.body.textContent).not.toContain("must not be trusted or shown");
    expect(refresh).not.toHaveBeenCalled();
  });
});
