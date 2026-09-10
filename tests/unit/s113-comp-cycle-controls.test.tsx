// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RenewalCompPreparation } from "@/components/lease-renewal/RenewalCompPreparation";
const state = vi.hoisted(() => ({ cycleId: "first" }));
vi.mock("@/components/lease-renewal/RenewalManualWorkspace", () => ({
  useRenewalManualWorkspace: () => ({
    leaseId: "701",
    state: { cycleId: state.cycleId },
    record: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  state.cycleId = "first";
});
it("does not show the preceding cycle's comps while the next cycle's read is pending", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      state.cycleId === "first"
        ? Response.json({
            observations: [
              {
                id: "old",
                cycleId: "first",
                market: { provider: { source: "RentCast" } },
                result: {
                  source: "RentCast",
                  confidence: "Likely",
                  pointEstimate: 1300,
                  rangeLow: 1200,
                  rangeHigh: 1400,
                },
              },
            ],
          })
        : new Promise(() => {}),
    ),
  );
  const props = {
    address: "Fixture lease",
    currentRent: 1000,
    compScreenshotExecutable: false,
  };
  const mounted = render(<RenewalCompPreparation {...props} />);
  await screen.findByText(/\$1,200.*\$1,400/);
  state.cycleId = "second";
  mounted.rerender(<RenewalCompPreparation {...props} />);
  expect(screen.queryByText(/\$1,200.*\$1,400/)).toBeNull();
});
