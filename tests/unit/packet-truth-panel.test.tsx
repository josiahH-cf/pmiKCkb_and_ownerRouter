/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PacketTruthPanel } from "@/components/lease-renewal/PacketTruthPanel";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import type {
  PacketVisibleState,
  RenewalPacketSnapshot,
} from "@/lib/lease-documents/packet-types";
import { readyS66Input } from "@/tests/fixtures/s66-packet";

function snapshot(
  state: PacketVisibleState = "Ready for preview",
): RenewalPacketSnapshot {
  const evaluation = evaluateRenewalPacket(readyS66Input());
  return {
    ...evaluation,
    snapshotId: "packet-fixture",
    snapshotVersion: 1,
    actorUid: "fixture-editor",
    createdAt: "2026-08-10T12:00:00.000Z",
    previousSnapshotId: null,
    current: state !== "Superseded",
    visibleState: state,
    ...(state === "Partially executed" || state === "Failed" || state === "Executed"
      ? {
          execution: {
            idempotencyKey: "fixture-attempt",
            state,
          },
        }
      : {}),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("S43 packet truth presentation", () => {
  it("renders the not-evaluated empty state and exact unavailable artifact seams", () => {
    render(
      <PacketTruthPanel
        initialSnapshot={null}
        leaseId="fixture-lease"
        transactionId="fixture-transaction"
      />,
    );
    expect(screen.getByText("No packet has been evaluated.")).toBeTruthy();
    expect(
      screen.getByText(/Approved artifact unavailable: Approved renewal extension/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Evaluate packet" })).toBeTruthy();
  });

  it.each([
    ["Needs input", /Supply the named verified facts/],
    ["Conflict", /Admin must resolve each conflict/],
    ["Ready for preview", /Request an exact-hash preview/],
    ["Superseded", /Reload and evaluate/],
    ["Partially executed", /Reconcile the existing partial attempt/],
    ["Failed", /Preserve the receipt/],
    ["Executed", /Tenant execution evidence is complete/],
  ] as const)("renders %s with an exact next action", (state, nextAction) => {
    const value = snapshot(state);
    if (state === "Needs input") {
      value.state = "Needs input";
      value.blockers = [
        { code: "missing_fact", label: "Fixture fact is required.", scope: "packet" },
      ];
    }
    if (state === "Conflict") value.state = "Conflict";
    render(
      <PacketTruthPanel
        initialSnapshot={value}
        leaseId="fixture-lease"
        transactionId="fixture-transaction"
      />,
    );
    expect(screen.getByText(nextAction)).toBeTruthy();
  });

  it("keeps committed truth visible while loading, disables the action, and accepts retry", async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fetchPromise));
    render(
      <PacketTruthPanel
        initialSnapshot={snapshot()}
        leaseId="fixture-lease"
        transactionId="fixture-transaction"
      />,
    );
    const button = screen.getByRole("button", { name: "Evaluate current truth" });
    fireEvent.click(button);
    expect(screen.getByText(/committed snapshot remains visible/i)).toBeTruthy();
    expect(screen.getByText(/Payload hash:/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Evaluating…" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    resolveFetch(
      new Response(JSON.stringify({ snapshot: snapshot() }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Evaluate current truth" })).toBeTruthy(),
    );
  });

  it("preserves the snapshot on failure and exposes a keyboard-reachable retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Fixture evaluation failed." }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    render(
      <PacketTruthPanel
        initialSnapshot={snapshot()}
        leaseId="fixture-lease"
        transactionId="fixture-transaction"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Evaluate current truth" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Fixture evaluation failed.",
    );
    expect(screen.getByRole("button", { name: "Retry evaluation" }).tabIndex).toBe(0);
    expect(screen.getByText(/Payload hash:/)).toBeTruthy();
  });
});
