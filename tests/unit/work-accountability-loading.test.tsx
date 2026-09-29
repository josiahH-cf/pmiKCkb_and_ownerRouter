// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkAccountabilityBoard } from "@/components/work/WorkAccountabilityBoard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("work board first read", () => {
  it.each(["mine", "team"] as const)(
    "marks server-rendered %s content busy before hydration without claiming a failed read",
    (mode) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const html = renderToString(
        <WorkAccountabilityBoard mode={mode} mutationAllowed spaces={[]} />,
      );
      const root = document.createElement("div");
      root.innerHTML = html;
      expect(root.querySelector(".work-board")).toHaveAttribute("aria-busy", "true");
      expect(root).toHaveTextContent("Loading current assignments and sessions…");
      expect(root.querySelector('[role="alert"]')).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("keeps the first pending read busy, exposes a real failure, and retries only a read", async () => {
    let rejectFirst!: (error: Error) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<Response>((_resolve, reject) => (rejectFirst = reject)),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Still unavailable." }), { status: 503 }),
      );
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    const { container } = render(
      <WorkAccountabilityBoard mode="mine" mutationAllowed spaces={[]} />,
    );
    expect(container.querySelector(".work-board")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(container.querySelector(".work-board")).toHaveAttribute("aria-busy", "true");
    await act(async () => rejectFirst(new Error("Read unavailable.")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Read unavailable.");
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Still unavailable.");
    expect(fetch.mock.calls).toEqual([
      ["/api/work?view=mine", { cache: "no-store" }],
      ["/api/work?view=mine", { cache: "no-store" }],
    ]);
  });
});
