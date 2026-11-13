// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
import {
  KICKOFF_PREPARATION_ROUTE,
  RenewalKickoffPreparation,
} from "@/components/lease-renewal/RenewalKickoffPreparation";

const targets = [
  { leaseId: "9101", address: "101 Sample Pl", cycleDateIso: "2027-01-31" },
  { leaseId: "9104", address: "104 Example Ln", cycleDateIso: "2027-01-15" },
];
const request = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
  async () =>
    new Response(
      JSON.stringify({
        status: "reused",
        message: "The existing comparison was reused.",
      }),
    ),
);
beforeEach(() => {
  request.mockClear();
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

// S283 R-S283-2: the button now states its count ("Prepare 2 January 2027 leases"); the labels
// below are rewritten on purpose. One click, no automatic start, the month and cycle sent and the
// server's checks are unchanged.
describe("S249 November 9 click-only preparation", () => {
  it("mounting, a different month and remounting send no requests", async () => {
    const page = render(
      <StrictMode>
        <RenewalKickoffPreparation month="2027-01" targets={targets} canPrepare />
      </StrictMode>,
    );
    await screen.findByRole("button", { name: "Prepare 2 January 2027 leases" });
    page.rerender(<RenewalKickoffPreparation month="2027-02" targets={[]} canPrepare />);
    page.unmount();
    render(<RenewalKickoffPreparation month="2027-01" targets={targets} canPrepare />);
    expect(request).not.toHaveBeenCalled();
  });

  it("a deliberate alternate month click submits the exact selected month and cycle for each lease", async () => {
    render(<RenewalKickoffPreparation month="2027-01" targets={targets} canPrepare />);
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare 2 January 2027 leases" }),
    );
    await screen.findByText("Preparation finished for January 2027.");
    expect(
      request.mock.calls.map(([url, input]) => [url, JSON.parse(String(input.body))]),
    ).toEqual(
      targets.map(({ leaseId, cycleDateIso }) => [
        KICKOFF_PREPARATION_ROUTE,
        expect.objectContaining({
          leaseId,
          cycleDateIso,
          month: "2027-01",
          trigger: "staff",
        }),
      ]),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Continue January 2027 preparation" }),
      ).toBeEnabled(),
    );
  });

  it("holds a stale view and omits preparation for a reader", () => {
    const page = render(
      <RenewalKickoffPreparation
        month="2027-01"
        targets={targets}
        canPrepare
        sourceCurrent={false}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Prepare 2 January 2027 leases" }),
    ).toBeDisabled();
    page.rerender(
      <RenewalKickoffPreparation month="2027-01" targets={targets} canPrepare={false} />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});
