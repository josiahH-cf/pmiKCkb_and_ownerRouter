// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  RenewalManualProvider,
  RenewalManualSection,
} from "@/components/lease-renewal/RenewalManualWorkspace";
import { RenewalCompPreparation } from "@/components/lease-renewal/RenewalCompPreparation";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
} from "@/lib/lease-renewal/workspace-state";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const initial = () =>
  emptyRenewalWorkspace("701", "b4bc3b81-c402-4f62-a2e2-c605c67867fb", {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
describe("S113 mounted manual and comp controls", () => {
  it("replaces the preceding cycle's controls when a refreshed page supplies the new cycle", () => {
    const approved = planRenewalWorkspaceAction(
      initial(),
      {
        kind: "owner_response",
        outcome: "approved_terms",
        terms: { rent: 1250, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
        source: "Fixture owner call",
      },
      {
        actorUid: "operator",
        recordedAt: "2026-09-10T12:00:00.000Z",
        eventId: "approval",
      },
    );
    const mount = (state: typeof approved) => (
      <RenewalManualProvider leaseId="701" initialState={state}>
        <RenewalManualSection section="owner" />
      </RenewalManualProvider>
    );
    const mounted = render(mount(approved));
    expect(screen.getByLabelText("Owner response")).toHaveValue("approved_terms");
    mounted.rerender(
      mount({ ...initial(), cycleId: "a4a74c8e-460a-4fbb-bd3c-7bdc1c70dc44" }),
    );
    expect(screen.getByLabelText("Owner response")).toHaveValue("no_response");
    expect(screen.queryByLabelText("Exact owner-approved monthly base rent")).toBeNull();
  });
  it("keeps an unread staff store distinct from an empty cycle and recovers by an explicit read", async () => {
    const fetch = vi.fn(async () => Response.json({ state: initial(), activity: [] }));
    vi.stubGlobal("fetch", fetch);
    render(
      <RenewalManualProvider leaseId="701" initialState={undefined} unavailable>
        <RenewalManualSection section="owner" />
      </RenewalManualProvider>,
    );
    expect(
      screen.getByText(/Current staff records could not be read/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use this reviewed cycle" }),
    ).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reload records and history" }));
    await screen.findByRole("button", { name: "Record owner response" });
    expect(screen.queryByText(/Current staff records could not be read/)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("records exact owner approval through the additive route while keeping source confirmation separate", async () => {
    let state = initial();
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      state = planRenewalWorkspaceAction(state, body.action, {
        actorUid: "operator",
        recordedAt: "2026-09-10T12:00:00.000Z",
        eventId: body.operationId,
      });
      return Response.json({ state });
    });
    vi.stubGlobal("fetch", request);
    render(
      <RenewalManualProvider leaseId="701" initialState={state}>
        <RenewalManualSection section="owner" />
        <RenewalManualSection section="documents" />
      </RenewalManualProvider>,
    );
    expect(request).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Owner response"), {
      target: { value: "approved_terms" },
    });
    fireEvent.change(screen.getByLabelText("Exact owner-approved monthly base rent"), {
      target: { value: "1250" },
    });
    fireEvent.change(screen.getByLabelText("Approved effective date"), {
      target: { value: "2027-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Approved term end date"), {
      target: { value: "2027-12-31" },
    });
    fireEvent.change(screen.getByLabelText("Response source or channel"), {
      target: { value: "Owner phone call" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record owner response" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("saved and read back"),
    );
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({
      operation: "record",
      leaseId: "701",
      cycleId: state.cycleId,
      action: {
        kind: "owner_response",
        outcome: "approved_terms",
        terms: { rent: 1250, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
      },
    });
    expect(screen.getByText(/Owner pricing confirmed: true/)).toHaveTextContent(
      "Pending separate Sheet confirmation",
    );
    expect(
      screen.getByRole("button", { name: "Record staff completion" }),
    ).toBeDisabled();
  });
  it("restores predecision RentCast lookup and its separately metered trend without a call on navigation", async () => {
    let state = initial();
    const requests: Array<{ url: string; body: Record<string, unknown> | null }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        requests.push({ url, body });
        if (url.includes("comp-screenshot")) return Response.json({ status: "absent" });
        if (!body) return Response.json({ state, activity: [], observations: [] });
        if (url.endsWith("market-comps"))
          return Response.json(
            body.operation === "trend"
              ? {
                  source: "RentCast",
                  confidence: "Likely",
                  zipCode: "64118",
                  retrievedAt: "2026-09-10T12:00:00.000Z",
                  history: { "2026-08": { averageRent: 1300 } },
                  observationId: "0876f520-f376-48f9-b42f-64c680da047b",
                }
              : {
                  source: "RentCast",
                  confidence: "Likely",
                  rangeLow: 1200,
                  rangeHigh: 1400,
                  pointEstimate: 1300,
                  compCount: 3,
                  retrievedAt: "2026-09-10T12:00:00.000Z",
                  observationId: "6f49ff4e-7693-419c-8b61-30b599a1917e",
                },
          );
        state = planRenewalWorkspaceAction(state, body.action, {
          actorUid: "operator",
          recordedAt: "2026-09-10T12:00:00.000Z",
          eventId: body.operationId,
        });
        return Response.json({ state });
      }),
    );
    render(
      <RenewalManualProvider leaseId="701" initialState={state}>
        <RenewalCompPreparation
          address="Emulator subject"
          currentRent={1200}
          compScreenshotExecutable={false}
        />
      </RenewalManualProvider>,
    );
    await waitFor(() =>
      expect(requests.some((item) => item.url.includes("workspace?"))).toBe(true),
    );
    expect(requests.filter((item) => item.url.endsWith("market-comps"))).toHaveLength(0);
    expect(screen.queryByLabelText("Offered rent (monthly)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /look up market comps/i }));
    await waitFor(() =>
      expect(requests.filter((item) => item.url.endsWith("market-comps"))).toHaveLength(
        2,
      ),
    );
    expect(
      requests
        .filter((item) => item.url.endsWith("market-comps"))
        .map((item) => item.body),
    ).toEqual([
      { leaseId: "701", capture: { cycleId: state.cycleId } },
      {
        operation: "trend",
        leaseId: "701",
        capture: {
          cycleId: state.cycleId,
          compObservationId: "6f49ff4e-7693-419c-8b61-30b599a1917e",
        },
      },
    ]);
    fireEvent.change(screen.getByLabelText("Typed evidence source / review note"), {
      target: { value: "Reviewed provider range" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save comp preparation" }));
    await waitFor(() =>
      expect(screen.getByText(/Preparation saved and read back/)).toBeInTheDocument(),
    );
    const saved = requests.find((item) => item.body?.operation === "record")!;
    expect(saved.body?.action).toMatchObject({
      kind: "preparation",
      observationId: "6f49ff4e-7693-419c-8b61-30b599a1917e",
      trendObservationId: "0876f520-f376-48f9-b42f-64c680da047b",
    });
    expect(saved.body?.action).not.toHaveProperty("provider");
  });
});
