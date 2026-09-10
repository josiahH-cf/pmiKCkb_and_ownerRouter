// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RenewalFutureRent } from "@/components/lease-renewal/RenewalFutureRent";
import { RenewalManualProvider } from "@/components/lease-renewal/RenewalManualWorkspace";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
} from "@/lib/lease-renewal/workspace-state";
import { RenewalCorrections } from "@/components/lease-renewal/RenewalCorrections";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const props = {
  leaseId: "81",
  role: "Admin" as const,
  dataCheck: [
    {
      fieldKey: "renewal_date",
      fieldLabel: "Renewal date",
      agreement: "agree" as const,
      candidates: [
        {
          source: "RentVine",
          sourceSystem: "RentVine",
          value: "2026-12-31",
          confidence: "Verified",
        },
      ],
    },
  ],
  sheetValues: { renewal_date: "2026-12-31", market_value: "1000" },
  workspaceContext: "secure-context",
  inventory: {
    leaseId: "81",
    asOfDate: "2026-09-10",
    leaseDates: {
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      increaseEligibilityDate: null,
    },
    charges: [],
  },
  sheetPreviewHash: null,
  rentvinePreviewHash: null,
  reviewHref: null,
};
describe("S113 common correction destinations", () => {
  it("lets an Editor save current rent for review without resolving, approving or writing a source", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        requests.push({ url, body: JSON.parse(String(init.body)) });
        return Response.json({ review: { value: 1050 } });
      }),
    );
    render(
      <RenewalCorrections
        {...props}
        role="Editor"
        dataCheck={[
          {
            fieldKey: "current_rent",
            fieldLabel: "Current base rent",
            agreement: "agree",
            candidates: [],
            sourceTriggerKey: "current-key",
            candidateFingerprint: "c".repeat(64),
          },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Reviewed current base rent"), {
      target: { value: "1050" },
    });
    fireEvent.change(screen.getByLabelText("Value source / reason"), {
      target: { value: "Executed lease reviewed" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save current-rent proposal for review" }),
    );
    await waitFor(() =>
      expect(screen.getByText(/Saved for an Admin to review/)).toBeInTheDocument(),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toMatch(/correction-review$/);
    expect(requests[0].body).toMatchObject({
      value: 1050,
      source: "Executed lease reviewed",
      destination: "sheet",
    });
    expect(
      screen.queryByRole("button", { name: "Save current-rent decision for approval" }),
    ).not.toBeInTheDocument();
  });

  it("uses one typed date for two independent preparations and keeps a partial result visible without any execution", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        requests.push({ url, body: JSON.parse(String(init.body)) });
        return url.endsWith("operating-sheet")
          ? Response.json({ proposal: { preview_hash: "a".repeat(64) } })
          : Response.json(
              { error: "RentVine source changed; refresh its preview" },
              { status: 409 },
            );
      }),
    );
    render(<RenewalCorrections {...props} />);
    fireEvent.change(screen.getByLabelText("Fact to correct"), {
      target: { value: "renewal_date" },
    });
    fireEvent.change(screen.getByLabelText("Reviewed renewal date"), {
      target: { value: "2027-12-31" },
    });
    fireEvent.change(screen.getByLabelText("Value source / reason"), {
      target: { value: "Reviewed signed amendment" },
    });
    fireEvent.change(screen.getByLabelText("Destinations"), {
      target: { value: "both" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare selected destination previews" }),
    );
    await waitFor(() =>
      expect(screen.getByText(/RentVine source changed; refresh/)).toBeInTheDocument(),
    );
    expect(requests).toHaveLength(2);
    expect(requests[0].body).toMatchObject({
      operation: "propose",
      fieldIntent: {
        field: "renewal_date",
        value: "2027-12-31",
        source: "Reviewed signed amendment",
      },
    });
    expect(requests[1].body).toMatchObject({
      operation: "propose",
      effects: [{ kind: "renewal_dates_update", after: { endDate: "2027-12-31" } }],
    });
    expect(
      screen.getByText(/Saved: awaiting its separate exact confirmation/),
    ).toBeInTheDocument();
    expect(requests.every((entry) => !entry.body.confirm)).toBe(true);
  });
  it("keeps unsupported RentVine market edits unavailable", () => {
    render(<RenewalCorrections {...props} />);
    fireEvent.change(screen.getByLabelText("Fact to correct"), {
      target: { value: "market_value" },
    });
    expect(screen.getByRole("option", { name: "RentVine" })).toBeDisabled();
    expect(
      screen.getByRole("option", { name: "Both, confirmed separately" }),
    ).toBeDisabled();
  });
});

describe("S113 mounted future-rent preparation", () => {
  it("prepares the saved approved future amount without retyping it or touching current Sheet rent", async () => {
    const state = planRenewalWorkspaceAction(
      emptyRenewalWorkspace("81", "b4bc3b81-c402-4f62-a2e2-c605c67867fb", {
        kind: "lease_end",
        dateIso: "2026-12-31",
        source: "Reviewed lease",
      }),
      {
        kind: "owner_response",
        outcome: "approved_terms",
        terms: { rent: 1500, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
        source: "Owner call",
      },
      {
        actorUid: "operator",
        eventId: "approval",
        recordedAt: "2026-09-10T12:00:00.000Z",
      },
    );
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        requests.push({ url, body: JSON.parse(String(init.body)) });
        return Response.json({ proposal: { preview_hash: "b".repeat(64) } });
      }),
    );
    const inventory = {
      ...props.inventory,
      charges: [
        {
          id: "301",
          accountId: "9",
          accountLabel: "Observed rent",
          classification: "rent" as const,
          current: false,
          projection: {
            leaseRecurringChargeID: "301",
            leaseID: "81",
            accountID: "9",
            amount: "1400.00",
            description: "Rent",
            dayDue: "1",
            frequency: "1",
            startDate: "2027-01-01",
            endDate: "2027-12-31",
            nextChargeDate: "2027-01-01",
            isMoveInCharge: "0",
            isFromImport: "0",
            recurringStatusID: 2 as const,
            rentIncreaseID: null,
            importSourceKey: null,
          },
        },
      ],
    };
    render(
      <RenewalManualProvider leaseId="81" initialState={state}>
        <RenewalFutureRent initialInventory={inventory} initialPreviewHash={null} />
      </RenewalManualProvider>,
    );
    expect(requests).toEqual([]);
    fireEvent.click(screen.getByText("Prepare future approved rent in RentVine"));
    fireEvent.change(screen.getByLabelText("Reviewed rent billing schedule"), {
      target: { value: "301" },
    });
    fireEvent.change(screen.getByLabelText("Schedule review source"), {
      target: { value: "Reviewed current provider schedules" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I checked the approved amount/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare this future-rent preview" }),
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      url: "/api/lease-renewal/rentvine-writeback",
      body: {
        operation: "propose",
        businessIntent: "future_rent",
        renewalContext: { cycleId: state.cycleId, termsRevision: state.termsRevision },
        effects: [
          {
            kind: "recurring_charge_update",
            chargeId: "301",
            changes: { amount: "1500.00" },
          },
        ],
      },
    });
    expect(requests[0].body).not.toHaveProperty("confirm");
  });
});
