// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// S233 R-S233-5: the hub reads the worker's health beside every full worklist refresh.
const NOW = Date.parse("2026-11-02T15:42:00.000Z");
vi.mock("@/components/hooks/useMinuteClock", () => ({ useMinuteClock: () => NOW }));

import { WorkflowCommunicationsHub } from "@/components/gmail-hub/WorkflowCommunicationsHub";

const HEALTH = {
  asOfMs: NOW - 2 * 60_000,
  lastRun: {
    startedAtMs: NOW - 4 * 60_000,
    finishedAtMs: NOW - 3 * 60_000,
    running: false,
    counts: { inspected: 3, observed: 3, sent: 1, held: 1, failures: 0, notChecked: 0 },
  },
  openRead: 3,
  complete: true,
  // The read's own lag is two minutes old; the hub states the lag at its current minute.
  oldestPastDue: { dueAtMs: NOW - 25 * 60_000, lagMs: 23 * 60_000 },
  oldestObservation: { checkedAtMs: NOW - 8 * 60_000, ageMs: 6 * 60_000 },
  neverChecked: 0,
};

let healthResponses: Array<() => Response>;
const requested: string[] = [];

beforeEach(() => {
  requested.length = 0;
  healthResponses = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url === "/api/gmail-hub/communications/health") {
        const next = healthResponses.shift();
        if (!next) throw new Error("No health response staged.");
        return next();
      }
      if (url === "/api/gmail-hub/sequences")
        return Response.json({ sequences: [], cursor: null });
      // The mailbox connection panel's own read; not part of this check.
      return Response.json({ error: "Unavailable" }, { status: 503 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const healthBlock = () =>
  document.querySelector('[data-communication-field="worker-health"]');

describe("S233 worker health on the communications hub (R-S233-5)", () => {
  it("shows the last run, the oldest past-due message with its lag and the oldest check", async () => {
    healthResponses.push(() => Response.json(HEALTH));
    render(<WorkflowCommunicationsHub authenticatedEmail="staff@pmikcmetro.com" />);
    await waitFor(() => expect(healthBlock()).not.toBeNull());
    expect(
      [...healthBlock()!.querySelectorAll("p")].map((line) => line.textContent),
    ).toEqual([
      "Worker: last run finished 3 min ago (3 checked, 1 sent, 1 held, 0 failures).",
      "Oldest past-due message: due 11/02/2026, 9:17 AM CST; not yet sent (25 min late).",
      "Oldest incoming check: 8 min ago.",
    ]);
    expect(requested.filter((url) => !url.endsWith("/connection"))).toEqual([
      "/api/gmail-hub/communications/health",
      "/api/gmail-hub/sequences",
    ]);
  });

  it("says when the health could not be read, and reads it again on Refresh worklist", async () => {
    healthResponses.push(() => Response.json({ error: "Unavailable" }, { status: 503 }));
    render(<WorkflowCommunicationsHub authenticatedEmail="staff@pmikcmetro.com" />);
    await waitFor(() =>
      expect(healthBlock()).toHaveTextContent(
        "Worker health could not be read; refresh the worklist to try again.",
      ),
    );
    // The worklist itself still loads.
    expect(screen.queryByRole("alert")).toBeNull();
    healthResponses.push(() => Response.json({ ...HEALTH, complete: false }));
    await userEvent.click(screen.getByRole("button", { name: "Refresh worklist" }));
    await waitFor(() =>
      expect(healthBlock()).toHaveTextContent(
        "Counts cover the first open communications read; more are open.",
      ),
    );
    expect(healthBlock()).not.toHaveTextContent("could not be read");
    expect(requested.filter((url) => url.endsWith("/health"))).toHaveLength(2);
  });
});
