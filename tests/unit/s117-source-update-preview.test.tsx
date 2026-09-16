// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import {
  OperatingSheetPanel,
  type SheetWritebackEffectStatus,
} from "@/components/lease-renewal/OperatingSheetPanel";
import {
  RentvineUpdatesPanel,
  type RentvineWritebackEffectStatus,
} from "@/components/lease-renewal/RentvineUpdatesPanel";
import type {
  SheetWritebackClientEffect,
  SheetWritebackClientProposal,
} from "@/lib/lease-renewal/sheet-writeback/client-projection";
import {
  rentvinePreviewFacts,
  sheetPreviewFacts,
} from "@/lib/lease-renewal/source-update-preview";
import type { RenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory-model";
import type {
  RentvineWritebackClientEffect,
  RentvineWritebackClientProposal,
} from "@/lib/lease-renewal/writeback/client-projection";

const identity = { addressLabel: "318 Cedar Ave, Unit 7", leaseId: "4821" };
const inventory: RenewalChargeInventory = {
  leaseId: "4821",
  asOfDate: "2026-09-16",
  leaseDates: {
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    increaseEligibilityDate: null,
  },
  charges: [
    {
      id: "301",
      accountId: "9",
      accountLabel: "Rent account",
      classification: "rent",
      current: true,
      projection: {
        leaseRecurringChargeID: "301",
        leaseID: "4821",
        accountID: "9",
        amount: "1250.00",
        description: "Rent",
        dayDue: "1",
        frequency: "1",
        startDate: "2026-01-01",
        endDate: null,
        nextChargeDate: "2026-10-01",
        isMoveInCharge: "0",
        isFromImport: "0",
        rentIncreaseID: null,
        importSourceKey: null,
        recurringStatusID: 1,
      },
    },
  ],
};

const before = {
  leaseRecurringChargeID: "301",
  leaseID: "4821",
  accountID: "9",
  amount: "1250.00",
  description: "Rent",
  dayDue: "1",
  frequency: "1",
  startDate: "2026-01-01",
  endDate: null,
  nextChargeDate: "2026-10-01",
  isMoveInCharge: "0",
  isFromImport: "0",
  rentIncreaseID: null,
  importSourceKey: null,
  recurringStatusID: 1,
};

function chargeEffect(
  changes: Record<string, string | null>,
  chargeId = "301",
): RentvineWritebackClientEffect {
  return {
    index: 0,
    action_key: "rentvine.lease.recurring_charge.update",
    kind: "recurring_charge_update",
    effect_hash: "d".repeat(64),
    effect: { kind: "recurring_charge_update", chargeId, before, changes },
    reversal_kind: "restore_charge_fields",
  };
}

function rentvineProposal(
  business_intent: "current_base" | "future_rent" | undefined,
  effects: RentvineWritebackClientEffect[],
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
    source_read_at: "2026-09-16T18:00:00.000Z",
    evidence_ref: "workspace:4821",
    preview_hash: "c".repeat(64),
    created_at: "2026-09-16T18:00:00.000Z",
    confirmation_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    ...(business_intent ? { business_intent } : {}),
    effects,
  };
}

function statusFor(
  proposal: RentvineWritebackClientProposal,
  state: string,
): RentvineWritebackEffectStatus[] {
  return proposal.effects.map((effect) => ({
    ...effect,
    execution_id: `s97:${proposal.lease_id}:${effect.effect_hash}`,
    state,
    attempt_count: state === "not_started" ? 0 : 1,
    reversal_state: null,
    ...(state === "succeeded"
      ? {
          receipt: {
            provider_ref: "rv-receipt-1",
            result_hash: "e".repeat(64),
            reconciled: true,
          },
        }
      : {}),
  }));
}

const sheetEffect: SheetWritebackClientEffect = {
  index: 0,
  action_key: "google_sheets.renewal_checklist.field_update",
  kind: "field_update",
  effect_hash: "f".repeat(64),
  effect: {
    kind: "field_update",
    field: "renewal_date",
    rowNumber: 41,
    expectedValue: "2026-12-31",
    afterValue: "2027-01-31",
    source: "Reviewed RentVine",
  },
  reversal_kind: "restore_field",
};

const sheetProposal: SheetWritebackClientProposal = {
  spreadsheet_id: "sheet-live-1",
  tab_title: "Lease Renewal",
  actor_email: "editor@pmikcmetro.com",
  source_read_at: "2026-09-16T18:00:00.000Z",
  evidence_ref: "workspace:4821:fresh-live-join",
  preview_hash: "a".repeat(64),
  created_at: "2026-09-16T18:00:00.000Z",
  confirmation_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  effects: [sheetEffect],
};

const TECHNICAL = [
  /[a-f0-9]{64}/,
  /rentvine\.lease\./,
  /google_sheets\./,
  /\bCharge 301\b/,
];

describe("S117 dense exact preview at the decision point (R117.3)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("No request is expected while reading a preview.");
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("AC-S117-3: the preview facts name the lease, source, charge, old and new schedule, timing and consequence without ids or hashes", () => {
    const current = rentvinePreviewFacts(chargeEffect({ amount: "1300.00" }), {
      proposal: rentvineProposal("current_base", [chargeEffect({ amount: "1300.00" })]),
      inventory,
      identity,
    });
    expect(current).toMatchObject({
      lease: "318 Cedar Ave, Unit 7, lease 4821",
      source: "RentVine, account pmikcmetro, read 2026-09-16T18:00:00.000Z",
      target: "Rent account (recurring charge)",
      current: "1250.00 every 1 month(s) on day 1, 2026-01-01 to no end date",
      proposed: "1300.00 every 1 month(s) on day 1, 2026-01-01 to no end date",
    });
    expect(current.consequence).toMatch(/contractual base rent is read again separately/);
    const future = rentvinePreviewFacts(
      {
        index: 0,
        action_key: "rentvine.lease.recurring_charge.create",
        kind: "recurring_charge_create",
        effect_hash: "d".repeat(64),
        effect: {
          kind: "recurring_charge_create",
          create: {
            accountID: "9",
            amount: "1300.00",
            description: "Rent",
            dayDue: "1",
            frequency: "1",
            startDate: "01/01/2027",
            endDate: "12/31/2027",
          },
        },
        reversal_kind: "delete_created_charge",
      },
      { proposal: rentvineProposal("future_rent", []), inventory, identity },
    );
    expect(future.current).toBe("No charge yet");
    expect(future.proposed).toContain(
      "1300.00 every 1 month(s) on day 1, 01/01/2027 to 12/31/2027",
    );
    expect(future.consequence).toMatch(
      /today's billing and the Sheet current rent are unchanged/i,
    );
    const dates = rentvinePreviewFacts(
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
      { proposal: rentvineProposal(undefined, []), inventory, identity },
    );
    expect(dates).toMatchObject({
      target: "Lease renewal dates",
      current: "ends 2026-08-31",
      proposed: "ends 2027-08-31",
      timing: "Lease end date",
      consequence: "Lease start date stays 2025-09-01; no other lease field changes.",
    });
    const cell = sheetPreviewFacts(sheetEffect, { proposal: sheetProposal, identity });
    expect(cell).toMatchObject({
      lease: "318 Cedar Ave, Unit 7, lease 4821",
      target: "Renewal date",
      current: "2026-12-31",
      proposed: "2027-01-31",
      timing: "This one cell, now",
    });
    expect(cell.source).toContain("row 41");
    for (const facts of [current, future, dates, cell]) {
      for (const pattern of TECHNICAL) expect(JSON.stringify(facts)).not.toMatch(pattern);
    }
  });

  it("AC-S117-3: the RentVine panel shows the dense preview at the decision point and confirms only after an explicit review step", () => {
    const proposal = rentvineProposal("current_base", [
      chargeEffect({ amount: "1300.00" }),
    ]);
    render(
      <RentvineUpdatesPanel
        identity={identity}
        initialEffects={statusFor(proposal, "not_started")}
        initialInventory={inventory}
        initialProposal={proposal}
        leaseId="4821"
        role="Admin"
      />,
    );
    const preview = screen.getByLabelText("Exact update preview");
    expect(
      within(preview).getByText("318 Cedar Ave, Unit 7, lease 4821"),
    ).toBeInTheDocument();
    expect(
      within(preview).getByText("Rent account (recurring charge)"),
    ).toBeInTheDocument();
    expect(
      within(preview).getByText(
        "1300.00 every 1 month(s) on day 1, 2026-01-01 to no end date",
      ),
    ).toBeInTheDocument();
    for (const pattern of TECHNICAL)
      expect(preview.textContent ?? "").not.toMatch(pattern);
    expect(
      screen.queryByRole("button", { name: "Confirm this exact effect once" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review and confirm…" }));
    expect(
      screen.getByRole("button", { name: "Confirm this exact effect once" }),
    ).toBeVisible();
  });

  it("AC-S117-3: a future-rent effect waits for the recorded tenant acceptance before an Admin can confirm it", () => {
    const proposal = rentvineProposal("future_rent", [
      chargeEffect({ amount: "1300.00" }),
    ]);
    const { rerender } = render(
      <RentvineUpdatesPanel
        futureRentExecutionReady={false}
        identity={identity}
        initialEffects={statusFor(proposal, "not_started")}
        initialInventory={inventory}
        initialProposal={proposal}
        leaseId="4821"
        role="Admin"
      />,
    );
    expect(screen.queryByRole("button", { name: "Review and confirm…" })).toBeNull();
    expect(
      screen.getByText(/Waiting for the recorded tenant acceptance of these exact terms/),
    ).toBeInTheDocument();
    rerender(
      <RentvineUpdatesPanel
        futureRentExecutionReady
        identity={identity}
        initialEffects={statusFor(proposal, "not_started")}
        initialInventory={inventory}
        initialProposal={proposal}
        leaseId="4821"
        role="Admin"
      />,
    );
    expect(screen.getByRole("button", { name: "Review and confirm…" })).toBeVisible();
  });

  it("AC-S117-4: a succeeded charge update with a differing base rent shows a fresh mismatch instead of a synchronized claim", () => {
    const proposal = rentvineProposal("current_base", [
      chargeEffect({ amount: "1300.00" }),
    ]);
    const { container } = render(
      <RentvineUpdatesPanel
        currentBaseReadback={{
          state: "charge_applied_base_rent_differs",
          chargeAmount: "1300.00",
          baseRent: 1250,
        }}
        identity={identity}
        initialEffects={statusFor(proposal, "succeeded")}
        initialInventory={inventory}
        initialProposal={proposal}
        leaseId="4821"
        role="Admin"
      />,
    );
    const mismatch = screen
      .getAllByRole("status")
      .find((node) => /still reads 1250\.00/.test(node.textContent ?? ""));
    expect(mismatch?.textContent).toContain("1300.00");
    expect(container.textContent).not.toMatch(/synchroniz/i);
  });

  it("AC-S117-3: the Sheet panel shows the same dense preview for a field update", () => {
    const status: SheetWritebackEffectStatus = {
      execution_id: "s98:sheet-live-1:x",
      state: "not_started",
      attempt_count: 0,
      reversal_state: null,
      effect_executable: true,
      reversal_executable: false,
      index: 0,
      action_key: sheetEffect.action_key,
      kind: "field_update",
      effect_hash: sheetEffect.effect_hash,
    } as unknown as SheetWritebackEffectStatus;
    render(
      <OperatingSheetPanel
        association={{ kind: "exact_link", rowNumber: 41 }}
        identity={identity}
        initialEffects={[status]}
        initialProposal={sheetProposal}
        role="Admin"
        workspaceContext="secure-context"
      />,
    );
    const preview = screen.getByLabelText("Exact update preview");
    expect(within(preview).getByText("Renewal date")).toBeInTheDocument();
    expect(within(preview).getByText("2026-12-31")).toBeInTheDocument();
    expect(within(preview).getByText("2027-01-31")).toBeInTheDocument();
    expect(within(preview).getByText(/row 41/)).toBeInTheDocument();
    expect(within(preview).getByText("This one cell, now")).toBeInTheDocument();
    for (const pattern of TECHNICAL)
      expect(preview.textContent ?? "").not.toMatch(pattern);
  });
});
