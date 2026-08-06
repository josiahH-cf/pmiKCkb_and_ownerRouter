// @vitest-environment jsdom

// S58: the desk's client refresh control. The button forces a refresh through the rate-limited
// route; regaining window focus revalidates ONLY when the rendered snapshot is older than the soft
// TTL (AC-S58-7) — focus with fresh data makes no request at all.

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

import { RenewalDeskRefresh } from "@/components/lease-renewal/RenewalDeskRefresh";

const TTL = 60_000;

function fetchMock() {
  const calls: { url: string; mode: string }[] = [];
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      mode: (JSON.parse(String(init?.body)) as { mode: string }).mode,
    });
    return new Response(JSON.stringify({ refreshed: true, throttled: false }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", mock);
  return { calls, mock };
}

beforeEach(() => {
  routerRefresh.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RenewalDeskRefresh", () => {
  it("forces a refresh on click and re-renders the desk", async () => {
    const { calls } = fetchMock();
    const user = userEvent.setup();
    render(<RenewalDeskRefresh readAtMs={Date.now()} ttlMs={TTL} />);

    await user.click(screen.getByRole("button", { name: "Refresh data" }));

    await waitFor(() => expect(routerRefresh).toHaveBeenCalledTimes(1));
    expect(calls).toEqual([{ url: "/api/lease-renewal/refresh", mode: "force" }]);
  });

  // AC-S58-7: focus with a snapshot older than the soft TTL revalidates exactly once.
  it("revalidates exactly once on focus when the snapshot is older than the TTL", async () => {
    const { calls } = fetchMock();
    render(<RenewalDeskRefresh readAtMs={Date.now() - TTL - 1_000} ttlMs={TTL} />);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => expect(routerRefresh).toHaveBeenCalledTimes(1));
    expect(calls).toEqual([{ url: "/api/lease-renewal/refresh", mode: "revalidate" }]);
  });

  it("makes no request on focus while the snapshot is still fresh", async () => {
    const { mock } = fetchMock();
    render(<RenewalDeskRefresh readAtMs={Date.now()} ttlMs={TTL} />);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(mock).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
