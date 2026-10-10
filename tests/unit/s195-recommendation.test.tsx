// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { RenewalRecommendation } from "@/components/lease-renewal/RenewalRecommendation";
import { RenewalManualProvider } from "@/components/lease-renewal/RenewalManualWorkspace";
import { RenewalWorkingRecordProvider } from "@/components/lease-renewal/RenewalWorkingRecord";
import { manualFixture } from "@/tests/helpers/renewal-action-fixtures";
import { fixtureWorkingRecord, jsonResponse } from "@/tests/helpers/rent-charge-fixtures";
import { renewalCompRecommendation } from "@/lib/lease-renewal/renewal-recommendation";
const preparation = {
  market: {
    provider: {
      source: "RentCast",
      pointEstimate: 1800,
      rangeLow: 1000,
      rangeHigh: 2000,
      compCount: 7,
      retrievedAt: "2026-10-09T12:00:00Z",
      comps: [1900, 1000, 1200, 1500, 1400, 1600, 1700].map((rent) => ({ rent })),
    },
  },
  source: "Synthetic retained observation",
  recordedAt: "2026-10-09T12:00:00Z",
  recordedByUid: "operator",
  revision: 1,
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("calculates over the full retained set with the existing clamp, independently of five-card display", () => {
  const c = renewalCompRecommendation(preparation, 1200);
  expect(c.suggestedRent).toBe(1380);
  expect(c.comps).toHaveLength(7);
  expect(c.rationale).toContain("15%");
  expect(c.source).toContain("retrieved");
  expect(
    renewalCompRecommendation(
      {
        ...preparation,
        market: { rangeLow: 800, rangeHigh: 1200, rangeBasis: "starting_rule" },
      },
      1000,
    ).suggestedRent,
  ).toBeNull();
});
it("keeps a manual offer on read and selects a source-bound proposal through one normal working save", async () => {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const b = JSON.parse(String(init?.body));
    return jsonResponse(200, {
      record: fixtureWorkingRecord({ terms_rent: { value: b.value, revision: 2 } }, 2),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  const state = manualFixture({}, "4821");
  state.preparation = preparation;
  const record = fixtureWorkingRecord({ terms_rent: { value: 1337, revision: 1 } });
  render(
    <RenewalWorkingRecordProvider leaseId="4821" canEdit initialRecord={record}>
      <RenewalManualProvider leaseId="4821" initialState={state}>
        <RenewalRecommendation currentRent={1200} />
      </RenewalManualProvider>
    </RenewalWorkingRecordProvider>,
  );
  expect(screen.getByText(/Selected working offer:/)).toHaveTextContent("$1,337");
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Use comparison proposal $1,380" }));
  await screen.findByText("Working offer saved with its proposal basis.");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
  expect(body).toMatchObject({
    field: "terms_rent",
    value: 1380,
    origin: "adopted_source",
    sourceLabel: "Comparable-rent recommendation",
  });
  expect(body.context).toContain("RentCast retrieved");
  expect(body).not.toHaveProperty("decision");
  await waitFor(() =>
    expect(screen.getByText(/Selected working offer:/)).toHaveTextContent("$1,380"),
  );
  expect(state.ownerResponse).toBeNull();
});
