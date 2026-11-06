// @vitest-environment jsdom

// S249: a lease whose comparison was stored ahead (the batch preparation and its automatic start
// store one per lease and cycle) opens without writing anything. The comparison form shows the
// retained lookup when it arrives, and showing it saves nothing; a lookup run in the form still
// links its evidence by itself (S155, covered in s118-comp-preparation-defaults.test.tsx).
// Synthetic values only.
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OwnerDecisionForm } from "@/components/lease-renewal/RenewalProgressControls";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CYCLE = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const RETAINED = {
  source: "RentCast",
  confidence: "Likely" as const,
  rangeLow: 1300,
  rangeHigh: 1500,
  pointEstimate: 1400,
  compCount: 3,
  retrievedAt: "2026-11-04T15:00:00.000Z",
  observationId: "11111111-1111-4111-8111-111111111111",
};

function form(initialLookup: typeof RETAINED | null, onSave: () => Promise<void>) {
  return (
    <OwnerDecisionForm
      address="101 Sample Place, Kansas City, MO 64118"
      current={null}
      currentRent={1350}
      leaseId="9101"
      marketSubject={null}
      preparation={{
        cycleId: CYCLE,
        market: undefined,
        source: "",
        initialLookup: initialLookup as never,
        onSave: onSave as never,
      }}
    />
  );
}

describe("S249 opening a lease with a stored comparison writes nothing", () => {
  it("the retained lookup arriving after the first render is shown and not saved", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: "not_found" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const onSave = vi.fn(async () => undefined);
    const view = render(form(null, onSave));
    await act(async () => {
      view.rerender(form(RETAINED, onSave));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(onSave).not.toHaveBeenCalled();
    // Nothing but reads left the form.
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toEqual([]);
  });
});
