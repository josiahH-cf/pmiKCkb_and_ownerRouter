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
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const CYCLE = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const initial = () =>
  emptyRenewalWorkspace("701", CYCLE, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
const META = { actorUid: "operator", recordedAt: "2026-09-10T12:00:00.000Z" };
describe("S113 mounted manual and comp controls", () => {
  it("preserves unsaved inputs and requires fresh readback to clear an observed Sheet pause", async () => {
    const state = planRenewalWorkspaceAction(
      initial(),
      {
        kind: "owner_response",
        outcome: "approved_terms",
        terms: { rent: 1250, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
        source: "Fixture owner call",
      },
      { ...META, eventId: "approval" },
    );
    let apiPaused = true;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body.operation).toBe("prepare_source");
        return Response.json({ state, writeback_paused: apiPaused });
      }
      expect(url).toContain("workspace?");
      return Response.json({ state, activity: [], writeback_paused: apiPaused });
    });
    vi.stubGlobal("fetch", fetch);
    const mount = (writebackPaused: boolean) => (
      <RenewalManualProvider
        leaseId="701"
        initialState={state}
        writebackPaused={writebackPaused}
      >
        <RenewalManualSection section="owner" />
        <RenewalManualSection section="documents" />
      </RenewalManualProvider>
    );
    const view = render(mount(false));
    const prepare = () =>
      screen.getByRole("button", {
        name: /Prepare the Sheet update for owner pricing confirmed/,
      });
    expect(prepare()).toBeEnabled();
    // Typing without leaving the control saves nothing; the entry is kept across a reload.
    fireEvent.change(screen.getByLabelText("Response source or channel (optional)"), {
      target: { value: "Unsaved review note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reload records and history" }));
    await screen.findByText(
      "Current staff records read back. Your unsaved entries are kept.",
    );
    await waitFor(() => expect(prepare()).toBeDisabled());
    // A page prop can never clear a pause the API reported.
    view.rerender(mount(true));
    view.rerender(mount(false));
    expect(prepare()).toBeDisabled();
    expect(screen.getByLabelText("Response source or channel (optional)")).toHaveValue(
      "Unsaved review note",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    apiPaused = false;
    fireEvent.click(screen.getByRole("button", { name: "Reload records and history" }));
    await waitFor(() => expect(prepare()).toBeEnabled());
    // The freshest server observation wins again: a prepare response that reports the pause
    // pauses source preparation until the next readback.
    apiPaused = true;
    fireEvent.click(prepare());
    await waitFor(() => expect(prepare()).toBeDisabled());
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toMatchObject({
      operation: "prepare_source",
      leaseId: "701",
      cycleId: CYCLE,
      field: "owner_pricing_confirmed",
    });
    expect(screen.getByLabelText("Response source or channel (optional)")).toHaveValue(
      "Unsaved review note",
    );
  });
  it("replaces the preceding cycle's controls when a refreshed page supplies the new cycle", () => {
    const approved = planRenewalWorkspaceAction(
      initial(),
      {
        kind: "owner_response",
        outcome: "approved_terms",
        terms: { rent: 1250, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
        source: "Fixture owner call",
      },
      { ...META, eventId: "approval" },
    );
    const mount = (state: typeof approved) => (
      <RenewalManualProvider leaseId="701" initialState={state}>
        <RenewalManualSection section="owner" />
      </RenewalManualProvider>
    );
    const mounted = render(mount(approved));
    expect(screen.getByLabelText("Owner response")).toHaveValue("approved_terms");
    expect(
      screen.getByText(/Owner-approved terms recorded earlier on this cycle/),
    ).toBeInTheDocument();
    // S154 (R-S154-7): a later first save on a completed record established a new work record.
    // The refreshed page carries it; the prior cycle's controls are replaced, not merged.
    mounted.rerender(
      mount({ ...initial(), cycleId: "a4a74c8e-460a-4fbb-bd3c-7bdc1c70dc44" }),
    );
    expect(screen.getByLabelText("Owner response")).toHaveValue("no_response");
    expect(
      screen.queryByText(/Owner-approved terms recorded earlier on this cycle/),
    ).toBeNull();
  });
  it("keeps an unread staff store distinct from an empty record and recovers by an explicit read", async () => {
    const fetch = vi.fn(async () => Response.json({ state: null, activity: [] }));
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
      screen.getByText("Reload current staff records above before recording work."),
    ).toBeInTheDocument();
    // S154: no cycle control exists to confuse an unread store with an empty record.
    expect(screen.queryByRole("button", { name: /reviewed cycle/i })).toBeNull();
    expect(screen.queryByLabelText("Owner response")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reload records and history" }));
    await screen.findByLabelText("Owner response");
    expect(screen.queryByText(/Current staff records could not be read/)).toBeNull();
    expect(
      screen.getByText(
        "Record any item below when it happens. Each entry saves on its own.",
      ),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("S155 BEH-S155-1 / S156 BEH-S156-4/7: an owner response saves when chosen, carries no terms and keeps Sheet confirmation separate", async () => {
    let state = initial();
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      state = planRenewalWorkspaceAction(state, body.action, {
        ...META,
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
    // Opening performs no save (S154 BEH-S154-4).
    expect(request).not.toHaveBeenCalled();
    // No Save button, no approval checkbox and no exact-terms prerequisite stand in the way.
    expect(screen.queryByRole("button", { name: "Record owner response" })).toBeNull();
    expect(screen.queryByLabelText("Exact owner-approved monthly base rent")).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Owner response"), {
      target: { value: "approved_terms" },
    });
    await screen.findByText(
      "Saved. Any listed Sheet update still needs its own confirmation.",
    );
    expect(request).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      operation: "record",
      leaseId: "701",
      cycleId: CYCLE,
      expectedRevision: 0,
      action: { kind: "owner_response", outcome: "approved_terms" },
    });
    expect(body.action).not.toHaveProperty("terms");
    expect(body.action).not.toHaveProperty("source");
    expect(body.operationId).toMatch(/^[0-9a-f-]{36}$/);
    // The response is a recorded fact; working terms live on the lease, separately saved.
    expect(state.ownerResponse?.outcome).toBe("approved_terms");
    expect(state.ownerResponse).not.toHaveProperty("terms");
    expect(state.ownerResponse?.source).toBe("Staff record");
    // The source channel saves on its own when the control is left.
    fireEvent.change(screen.getByLabelText("Response source or channel (optional)"), {
      target: { value: "Owner phone call" },
    });
    fireEvent.blur(screen.getByLabelText("Response source or channel (optional)"));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toMatchObject({
      expectedRevision: 1,
      action: {
        kind: "owner_response",
        outcome: "approved_terms",
        source: "Owner phone call",
      },
    });
    await waitFor(() => expect(state.ownerResponse?.source).toBe("Owner phone call"));
    // The Sheet changes only through its own confirmed update; the app record is not a write.
    expect(screen.getByText(/Owner pricing confirmed: true/)).toHaveTextContent(
      "Saved in the app. The Sheet changes only when you confirm its update",
    );
    // S156 (BEH-S156-7): completion is available whenever staff say the work is complete.
    expect(screen.getByRole("button", { name: "Record staff completion" })).toBeEnabled();
    expect(
      request.mock.calls.every(([url]) => String(url) === "/api/lease-renewal/workspace"),
    ).toBe(true);
  });
  it("S154 BEH-S154-3/5 (AC-S154-2): a first change on a lease with no work record saves without a cycle step and binds to the record the save established", async () => {
    let state: RenewalWorkspaceState | null = null;
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      // The store establishes the record from the first actual save (S154 R-S154-5).
      state = planRenewalWorkspaceAction(state ?? initial(), body.action, {
        ...META,
        eventId: body.operationId,
      });
      return Response.json({ state });
    });
    vi.stubGlobal("fetch", request);
    render(
      <RenewalManualProvider leaseId="701" initialState={null}>
        <RenewalManualSection section="owner" />
      </RenewalManualProvider>,
    );
    expect(request).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /cycle/i })).toBeNull();
    expect(screen.queryByText(/Select the reviewed renewal cycle/)).toBeNull();
    expect(
      screen.getByText(
        "Record any item below when it happens. Each entry saves on its own.",
      ),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Owner outreach outcome"), {
      target: { value: "done" },
    });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({
      operation: "record",
      leaseId: "701",
      cycleId: null,
      expectedRevision: 0,
      action: { kind: "activity", activity: "owner_outreach", outcome: "done" },
    });
    await waitFor(() =>
      expect(screen.getByText(/Work recorded against lease end/)).toBeInTheDocument(),
    );
    // The next save binds to the record the first save established.
    fireEvent.change(screen.getByLabelText("Owner response"), {
      target: { value: "revision_requested" },
    });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toMatchObject({
      cycleId: CYCLE,
      expectedRevision: 1,
      action: { kind: "owner_response", outcome: "revision_requested" },
    });
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
          ...META,
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
    expect(requests.filter((item) => item.body?.operation === "record")).toHaveLength(0);
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
    // S155 (8c39cd23): the finished lookup links its retained evidence by itself; there is no
    // Save button. The source note is optional context that saves when the control is left.
    expect(screen.queryByRole("button", { name: "Save comp preparation" })).toBeNull();
    await waitFor(() =>
      expect(requests.filter((item) => item.body?.operation === "record")).toHaveLength(
        1,
      ),
    );
    const source = screen.getByLabelText(
      "Source of the comparison and review notes (optional)",
    );
    fireEvent.change(source, { target: { value: "Reviewed provider range" } });
    fireEvent.blur(source);
    await waitFor(() =>
      expect(requests.filter((item) => item.body?.operation === "record")).toHaveLength(
        2,
      ),
    );
    await waitFor(() =>
      expect(document.querySelector("[data-autosave='saved']")).toHaveTextContent(
        "Saved",
      ),
    );
    const saved = requests.filter((item) => item.body?.operation === "record");
    // The lookup's own save is the one that links the retained comp and trend evidence to the
    // preparation (S118 AC-S118-3); a later note must not be needed to establish that link.
    expect(saved[0].body?.action).toMatchObject({
      kind: "preparation",
      observationId: "6f49ff4e-7693-419c-8b61-30b599a1917e",
      trendObservationId: "0876f520-f376-48f9-b42f-64c680da047b",
    });
    expect(saved[0].body?.action).not.toHaveProperty("source");
    expect(saved[1].body?.action).toMatchObject({
      kind: "preparation",
      observationId: "6f49ff4e-7693-419c-8b61-30b599a1917e",
      trendObservationId: "0876f520-f376-48f9-b42f-64c680da047b",
      source: "Reviewed provider range",
    });
    for (const item of saved) expect(item.body?.action).not.toHaveProperty("provider");
    expect(state.preparation?.source).toBe("Reviewed provider range");
  });
});
