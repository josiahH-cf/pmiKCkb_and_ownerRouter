// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import {
  OperatingSheetPanel,
  type SheetWritebackEffectStatus,
} from "@/components/lease-renewal/OperatingSheetPanel";
import { FinishUpSourcePreviews } from "@/components/lease-renewal/RenewalFinishUpPreviews";
import { RenewalManualProvider } from "@/components/lease-renewal/RenewalManualWorkspace";
import {
  RentvineUpdatesPanel,
  type RentvineWritebackEffectStatus,
} from "@/components/lease-renewal/RentvineUpdatesPanel";
import type { FinishUpPreparation } from "@/lib/lease-renewal/finish-up-preparation";
import type { SheetWritebackClientProposal } from "@/lib/lease-renewal/sheet-writeback/client-projection";
import type { TenantAcceptanceRead } from "@/lib/lease-renewal/tenant-acceptance-hold";
import type { RentvineWritebackClientProposal } from "@/lib/lease-renewal/writeback/client-projection";
import { recordedState } from "@/tests/helpers/outreach-evidence-fixtures";

// S264 R-S264-6 (AC-S264-6) where staff apply the accepted renewal: while the tenant's recorded
// acceptance answers an earlier offer, each exact preview of an update carrying the accepted
// renewal names the exact difference and offers no Apply; the server refuses the same attempt
// before its claim. A current base rent correction and the other Sheet fields never wait, and a
// read of an earlier answer never holds an answer recorded since. Synthetic values only.

const LINE =
  "Current acceptance needs verification: it answers an earlier offer. Pet rent changed ($45.00 to $50.00).";
const WAITS = "This update waits until the tenant's answer covers the current offer.";
const read = (state: TenantAcceptanceRead["state"], eventId = "4821-event-1") => ({
  eventId,
  state,
  line: state === "earlier_offer" ? LINE : null,
});

function datesProposal(
  overrides: Partial<RentvineWritebackClientProposal> = {},
): RentvineWritebackClientProposal {
  return {
    lease_id: "4821",
    account: "pmikcmetro",
    actor_uid: "editor-1",
    actor_email: "editor@pmikcmetro.com",
    lease_state: {
      startDate: "2025-09-01",
      endDate: "2026-08-31",
      increaseEligibilityDate: null,
    },
    source_read_at: "2026-11-10T12:00:00.000Z",
    evidence_ref: "workspace:4821",
    preview_hash: "c".repeat(64),
    created_at: "2026-11-10T12:00:00.000Z",
    confirmation_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    effects: [
      {
        index: 0,
        action_key: "rentvine.lease.renewal_dates.update",
        kind: "renewal_dates_update",
        effect_hash: "d".repeat(64),
        effect: {
          kind: "renewal_dates_update",
          before: {
            startDate: "2025-09-01",
            endDate: "2026-08-31",
            increaseEligibilityDate: null,
          },
          after: { endDate: "2027-08-31" },
        },
        reversal_kind: "restore_dates",
      },
    ],
    ...overrides,
  };
}

function rentvineStatus(
  proposal: RentvineWritebackClientProposal,
): RentvineWritebackEffectStatus[] {
  return proposal.effects.map((effect) => ({
    ...effect,
    execution_id: `s97:${proposal.lease_id}:${effect.effect_hash}`,
    state: "not_started",
    attempt_count: 0,
    reversal_state: null,
  }));
}

function sheetProposal(field: string, afterValue: string): SheetWritebackClientProposal {
  return {
    spreadsheet_id: "sheet-synthetic-1",
    tab_title: "Lease Renewal",
    actor_email: "editor@pmikcmetro.com",
    source_read_at: "2026-11-10T12:00:00.000Z",
    evidence_ref: "workspace:4821:fresh-live-join",
    preview_hash: "e".repeat(64),
    created_at: "2026-11-10T12:00:00.000Z",
    confirmation_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    effects: [
      {
        index: 0,
        action_key: "google_sheets.renewal_checklist.field_update",
        kind: "field_update",
        effect_hash: "f".repeat(64),
        effect: {
          kind: "field_update",
          field,
          rowNumber: 4,
          rowKey: null,
          anchorTenantName: "Synthetic Tenant",
          expectedValue: "",
          afterValue,
          source: "Working renewal terms",
          staffIntent: { field, value: afterValue, source: "Working renewal terms" },
        },
        reversal_kind: "restore_field",
      },
    ],
  };
}

function sheetStatus(
  proposal: SheetWritebackClientProposal,
): SheetWritebackEffectStatus[] {
  return proposal.effects.map((effect) => ({
    ...effect,
    execution_id: `s98:sheet-synthetic-1:${effect.effect_hash}`,
    state: "not_started",
    attempt_count: 0,
    reversal_state: null,
    effect_executable: true,
    reversal_executable: false,
  }));
}

const acceptedState = () =>
  recordedState("4821", [
    {
      action: { kind: "tenant_response", outcome: "accepted" },
      atIso: "2026-11-10T15:00:00.000Z",
    },
  ]);

const holdRow = () => document.querySelector('[data-renewal-field="acceptance-hold"]');

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AC-S264-6 a RentVine update carrying the accepted renewal waits on an earlier offer's acceptance", () => {
  it("names the exact difference in the preview and offers no Apply until the answer covers the current offer", () => {
    const proposal = datesProposal();
    const { unmount } = render(
      <RentvineUpdatesPanel
        initialEffects={rentvineStatus(proposal)}
        initialProposal={proposal}
        leaseId="4821"
        role="Editor"
        tenantAcceptance={read("earlier_offer")}
      />,
    );
    expect(holdRow()).toHaveTextContent(`Tenant acceptance${LINE} ${WAITS}`);
    expect(
      screen.queryByRole("button", { name: "Apply RentVine update" }),
    ).not.toBeInTheDocument();
    unmount();

    render(
      <RentvineUpdatesPanel
        initialEffects={rentvineStatus(proposal)}
        initialProposal={proposal}
        leaseId="4821"
        role="Editor"
        tenantAcceptance={read("covers")}
      />,
    );
    expect(holdRow()).toBeNull();
    expect(screen.getByRole("button", { name: "Apply RentVine update" })).toBeEnabled();
  });

  it("a current base rent correction never waits on the tenant's answer", () => {
    const proposal = datesProposal({ business_intent: "current_base" });
    render(
      <RentvineUpdatesPanel
        initialEffects={rentvineStatus(proposal)}
        initialProposal={proposal}
        leaseId="4821"
        role="Editor"
        tenantAcceptance={read("earlier_offer")}
      />,
    );
    expect(holdRow()).toBeNull();
    expect(screen.getByRole("button", { name: "Apply RentVine update" })).toBeEnabled();
  });

  it("holds only the work record's current answer: a read of an earlier answer holds nothing", () => {
    const proposal = datesProposal();
    const state = acceptedState();
    const panel = (acceptance: TenantAcceptanceRead) => (
      <RenewalManualProvider initialState={state} leaseId="4821">
        <RentvineUpdatesPanel
          initialEffects={rentvineStatus(proposal)}
          initialProposal={proposal}
          leaseId="4821"
          role="Editor"
          tenantAcceptance={acceptance}
        />
      </RenewalManualProvider>
    );
    const view = render(panel(read("earlier_offer", state.tenantResponse!.eventId)));
    expect(holdRow()).toHaveTextContent(LINE);
    view.rerender(panel(read("earlier_offer", "an-earlier-answer")));
    expect(holdRow()).toBeNull();
    expect(screen.getByRole("button", { name: "Apply RentVine update" })).toBeEnabled();
  });
});

describe("AC-S264-6 the operating Sheet renewal date waits; other Sheet fields do not", () => {
  it.each([
    ["renewal_date", "2028-01-31", true],
    ["market_value", "1500", false],
  ] as const)("%s", (field, afterValue, waits) => {
    const proposal = sheetProposal(field, afterValue);
    render(
      <OperatingSheetPanel
        association={{ kind: "exact_link", rowNumber: 4 }}
        initialEffects={sheetStatus(proposal)}
        initialProposal={proposal}
        role="Editor"
        tenantAcceptance={read("earlier_offer")}
        workspaceContext="signed-workspace-context-token"
      />,
    );
    const apply = screen.queryByRole("button", { name: "Apply Sheet update" });
    if (waits) {
      expect(holdRow()).toHaveTextContent(`Tenant acceptance${LINE} ${WAITS}`);
      expect(apply).not.toBeInTheDocument();
    } else {
      expect(holdRow()).toBeNull();
      expect(apply).toBeEnabled();
    }
  });
});

describe("AC-S264-6 Finish up names the difference and the one next step before its source updates", () => {
  const preparation = (acceptance: TenantAcceptanceRead | null): FinishUpPreparation => ({
    terms: { rent: 920, effectiveDate: "2027-02-01", endDate: "2028-01-31" },
    termsMissing: [],
    rentvine: {
      state: "ready",
      previews: [
        {
          key: "rentvine-dates",
          title: "RentVine lease end date",
          facts: {
            lease: "Synthetic Pl, lease 4821",
            source: "RentVine",
            target: "Lease renewal dates",
            current: "ends 01/31/2027",
            proposed: "ends 01/31/2028",
            timing: "On confirmation",
            consequence: "Changes the lease end date",
          },
        },
      ],
      notes: [],
    },
    sheet: null,
    applyTarget: "renewal-rent-and-charges",
    acceptance,
  });

  it("holds the previews with the exact difference and points to the tenant response editor", () => {
    const { unmount } = render(
      <FinishUpSourcePreviews preparation={preparation(read("earlier_offer"))} />,
    );
    const notice = document.querySelector(
      '[data-renewal-field="finish-up-acceptance-hold"]',
    );
    expect(notice).toHaveTextContent(
      `${LINE} These updates wait until the tenant's answer covers the current offer.`,
    );
    expect(
      screen.getByRole("button", {
        name: "Record the tenant's answer for the current offer",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Review and apply in Rent and charges" }),
    ).not.toBeInTheDocument();
    unmount();

    render(<FinishUpSourcePreviews preparation={preparation(read("covers"))} />);
    expect(
      document.querySelector('[data-renewal-field="finish-up-acceptance-hold"]'),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Review and apply in Rent and charges" }),
    ).toBeInTheDocument();
  });
});
