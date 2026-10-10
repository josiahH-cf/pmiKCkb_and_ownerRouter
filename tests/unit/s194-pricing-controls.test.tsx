// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  RenewalPricingPolicyProvider,
  RenewalPricingPolicyPanel,
} from "@/components/lease-renewal/RenewalPricingPolicy";
import {
  RenewalWorkingRecordProvider,
  WorkingMoneyField,
} from "@/components/lease-renewal/RenewalWorkingRecord";
import { fixtureWorkingRecord, jsonResponse } from "@/tests/helpers/rent-charge-fixtures";
const pid = "5d3f8275-0f4f-4c5c-909b-23103711c953",
  p2 = "1a5a1f4d-aabd-4f4a-9c1a-57ec40305e38";
const policy = {
  id: pid,
  name: "Synthetic percentage",
  kind: "percentage",
  value: 3.5,
  version: 1,
};
const payload = () => ({
  policies: [policy],
  cursor: null,
  policy,
  proposal: { amount: 1243, reason: "Synthetic current rent 1201, +3.5%, rounded 1243" },
  authority: { covered: false, reason: "Separate owner authority is not recorded." },
  assignment: null,
  leaseAssignment: null,
  portfolioAssignment: null,
  policyChanged: false,
  prefill: {
    value: 1243,
    policyId: pid,
    policyVersion: 1,
    reason: "Synthetic source and policy basis",
  },
  workingRevision: 0,
  manualRevision: 0,
});
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => jsonResponse(200, payload()));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function field(record: ReturnType<typeof fixtureWorkingRecord> | null = null) {
  return (
    <RenewalWorkingRecordProvider leaseId="4821" canEdit initialRecord={record}>
      <RenewalPricingPolicyProvider
        leaseId="4821"
        canEdit
        workingRevision={record?.revision ?? 0}
      >
        <WorkingMoneyField field="terms_rent" label="Offer rent" />
      </RenewalPricingPolicyProvider>
    </RenewalWorkingRecordProvider>
  );
}
it("prefills a never-touched amount with basis but opening a lease produces no mutation", async () => {
  render(field());
  await waitFor(() => expect(screen.getByLabelText("Offer rent")).toHaveValue("1243"));
  expect(screen.getByText(/Prefilled from policy v1/)).toBeVisible();
  expect(fetchMock.mock.calls.every((c) => !c[1]?.method)).toBe(true);
});
it("keeps a deliberate unsaved edit when a slower policy read finishes", async () => {
  let finish!: (v: ReturnType<typeof jsonResponse>) => void;
  fetchMock.mockImplementation(
    () =>
      new Promise<ReturnType<typeof jsonResponse>>((r) => {
        finish = r;
      }),
  );
  render(field());
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText("Offer rent"), { target: { value: "1337" } });
  finish(jsonResponse(200, payload()));
  await screen.findByText(/Prefilled from policy v1/);
  expect(screen.getByLabelText("Offer rent")).toHaveValue("1337");
  expect(fetchMock.mock.calls.every((c) => !c[1]?.method)).toBe(true);
});
it("never replaces a saved manual amount or deliberate clear after policy updates", async () => {
  const record = fixtureWorkingRecord({ terms_rent: { value: 1300, revision: 1 } });
  fetchMock.mockImplementation(async () =>
    jsonResponse(200, { ...payload(), workingRevision: record.revision }),
  );
  const mounted = render(field(record));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(screen.getByLabelText("Offer rent")).toHaveValue("1300");
  mounted.unmount();
  const cleared = fixtureWorkingRecord({ terms_rent: { value: null, revision: 2 } });
  fetchMock.mockImplementation(async () =>
    jsonResponse(200, { ...payload(), workingRevision: cleared.revision }),
  );
  render(field(cleared));
  await waitFor(() => expect(screen.getByLabelText("Offer rent")).toHaveValue(""));
  expect(screen.queryByText(/Prefilled from policy/)).not.toBeInTheDocument();
});
it("adopts the generated rent only on staff commit and keeps policy provenance", async () => {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      return jsonResponse(200, {
        record: fixtureWorkingRecord({ terms_rent: { value: body.value, revision: 1 } }),
      });
    }
    return jsonResponse(200, payload());
  });
  render(field());
  await waitFor(() => expect(screen.getByLabelText("Offer rent")).toHaveValue("1243"));
  fireEvent.keyDown(screen.getByLabelText("Offer rent"), { key: "Enter" });
  await waitFor(() =>
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === "POST")).toHaveLength(1),
  );
  const body = JSON.parse(
    String(fetchMock.mock.calls.find((c) => c[1]?.method === "POST")![1].body),
  );
  expect(body).toMatchObject({
    field: "terms_rent",
    value: 1243,
    origin: "adopted_source",
    sourceLabel: "Pricing policy v1",
  });
  expect(body.context).toContain(pid);
});
it("loads later catalog pages in the lease picker and retries a lost assignment with the same durable intent", async () => {
  let attempts = 0;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      if (++attempts === 1) throw new TypeError("Network response lost");
      return jsonResponse(200, { assignment: { version: 1 } });
    }
    return jsonResponse(
      200,
      String(url).includes("after=")
        ? { ...payload(), policies: [{ ...policy, id: p2, name: "Later policy" }] }
        : { ...payload(), cursor: p2 },
    );
  });
  render(
    <RenewalPricingPolicyProvider leaseId="4821" canEdit>
      <RenewalPricingPolicyPanel />
    </RenewalPricingPolicyProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Load more policies" }));
  await screen.findByRole("option", { name: "Later policy · v1" });
  fireEvent.change(screen.getByLabelText("Lease pricing policy"), {
    target: { value: p2 },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save lease policy" }));
  await screen.findByText(/The response was lost/);
  fireEvent.click(screen.getByRole("button", { name: "Save lease policy" }));
  await screen.findByText(/Policy assignment saved/);
  const posts = fetchMock.mock.calls.filter((c) => c[1]?.method === "POST");
  expect(posts).toHaveLength(2);
  expect(posts[0][1].body).toEqual(posts[1][1].body);
  expect(JSON.parse(String(posts[0][1].body)).policyId).toBe(p2);
});
