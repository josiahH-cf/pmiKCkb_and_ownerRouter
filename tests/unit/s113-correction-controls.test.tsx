// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RenewalFutureRent } from "@/components/lease-renewal/RenewalFutureRent";
import { RenewalManualProvider } from "@/components/lease-renewal/RenewalManualWorkspace";
import { RenewalWorkingRecordProvider } from "@/components/lease-renewal/RenewalWorkingRecord";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
} from "@/lib/lease-renewal/workspace-state";
import { RenewalCorrections } from "@/components/lease-renewal/RenewalCorrections";
import { fixtureWorkingRecord } from "@/tests/helpers/rent-charge-fixtures";
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
};

// S113 corrections as carried into S157: the current rent is a direct working edit with no
// request, review or approval; the other recognized facts keep the typed prepare-a-preview flow
// that an Editor completes alone.
describe("S113 common correction destinations", () => {
  it("S157: offers the current rent as a direct working edit, with no proposal, decision or approval step and no source request", () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        requests.push({ url, body: JSON.parse(String(init.body)) });
        return Response.json({ record: null });
      }),
    );
    render(
      <RenewalWorkingRecordProvider
        canEdit
        initialRecord={fixtureWorkingRecord({
          current_rent: { value: 1050, revision: 1 },
        })}
        leaseId="81"
      >
        <RenewalCorrections
          {...props}
          role="Editor"
          sheetValues={{ current_rent: "1000", renewal_date: "2026-12-31" }}
          dataCheck={[
            {
              fieldKey: "current_rent",
              fieldLabel: "Current base rent",
              agreement: "agree",
              candidates: [
                {
                  source: "RentVine",
                  sourceSystem: "RentVine",
                  value: "1050",
                  confidence: "Verified",
                },
              ],
              sourceTriggerKey: "current-key",
              candidateFingerprint: "c".repeat(64),
            },
          ]}
        />
      </RenewalWorkingRecordProvider>,
    );
    fireEvent.change(screen.getByLabelText("Fact to correct"), {
      target: { value: "current_rent" },
    });
    expect(
      screen.getByRole("link", { name: "Edit the working current rent" }),
    ).toHaveAttribute("href", "#renewal-working-current-rent");
    const sources = screen.getByRole("list", { name: "Observed current rent by source" });
    expect(sources.textContent).toContain("RentVine: 1050. Matches the working value.");
    expect(sources.textContent).toContain(
      "Operating Sheet: 1000. Differs from the working value 1050.00.",
    );
    expect(
      screen.queryByRole("button", { name: "Save current-rent proposal for review" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save current-rent decision for approval" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Value source / reason")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Reviewed current base rent")).not.toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it("uses one typed date for two independent preparations, needs no narrative, and keeps a partial result visible without any execution", async () => {
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
    expect(screen.getByLabelText("Fact to correct")).toHaveValue("renewal_date");
    fireEvent.change(screen.getByLabelText("Reviewed renewal date"), {
      target: { value: "2027-12-31" },
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
      fieldIntent: { field: "renewal_date", value: "2027-12-31" },
    });
    expect(requests[1].body).toMatchObject({
      operation: "propose",
      effects: [{ kind: "renewal_dates_update", after: { endDate: "2027-12-31" } }],
    });
    expect(requests[1].body).not.toHaveProperty("evidenceRef");
    expect(
      screen.getByText(/Saved: apply its reviewed change below/),
    ).toBeInTheDocument();
    expect(requests.every((entry) => !entry.body.confirm)).toBe(true);
  });

  it("carries a typed context note into both preparations when staff give one", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        requests.push({ url, body: JSON.parse(String(init.body)) });
        return Response.json({ proposal: { preview_hash: "b".repeat(64) } });
      }),
    );
    render(<RenewalCorrections {...props} />);
    fireEvent.change(screen.getByLabelText("Reviewed renewal date"), {
      target: { value: "2027-12-31" },
    });
    fireEvent.change(screen.getByLabelText("Source or context (optional)"), {
      target: { value: "Reviewed signed amendment" },
    });
    fireEvent.change(screen.getByLabelText("Destinations"), {
      target: { value: "both" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare selected destination previews" }),
    );
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0].body).toMatchObject({
      fieldIntent: { source: "Reviewed signed amendment" },
    });
    expect(requests[1].body).toMatchObject({ evidenceRef: "Reviewed signed amendment" });
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
  it("prepares the working future amount without retyping it or touching current Sheet rent", async () => {
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
    fireEvent.click(screen.getByText("Prepare future renewal rent in RentVine"));
    fireEvent.change(screen.getByLabelText("Rent billing schedule"), {
      target: { value: "301" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare this future-rent preview" }),
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      url: "/api/lease-renewal/rentvine-writeback",
      body: {
        operation: "propose",
        businessIntent: "future_rent",
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
    expect(requests[0].body).not.toHaveProperty("renewalContext");
  });
});
