import { describe, expect, it } from "vitest";

import type { RenewalAttemptRecord } from "@/lib/lease-renewal/execution/attempt-continuation";
import { projectRentChargeOutcomes } from "@/lib/lease-renewal/rent-charge-outcomes";
import {
  sheetWritebackExecutionId,
  type SheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import type { SheetWritebackEffectStatusView } from "@/lib/lease-renewal/sheet-writeback/status";
import {
  emptyRenewalWorkspace,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import { projectCurrentBaseReadback } from "@/lib/lease-renewal/writeback/current-base-readback";
import {
  renewalWritebackExecutionId,
  type RenewalWritebackProposal,
} from "@/lib/lease-renewal/writeback/proposal-contract";

const NOW = Date.parse("2026-09-16T19:00:00.000Z");
const FUTURE = new Date(NOW + 600_000).toISOString();
const PAST = new Date(NOW - 600_000).toISOString();

function rentvineProposal(
  businessIntent: "current_base" | "future_rent" | undefined,
  confirmationExpiresAtIso = FUTURE,
): RenewalWritebackProposal {
  return {
    leaseId: "81",
    account: "pmikcmetro",
    previewHash: "a".repeat(64),
    confirmationExpiresAtIso,
    ...(businessIntent ? { businessIntent } : {}),
    effects: [
      {
        index: 0,
        effectHash: "b".repeat(64),
        actionKey: "rentvine.lease.recurring_charge.update",
        effect: {
          kind: "recurring_charge_update",
          chargeId: "301",
          before: { amount: "1250.00", startDate: "2026-01-01", endDate: null },
          changes: { amount: "1300.00" },
        },
      },
    ],
  } as unknown as RenewalWritebackProposal;
}

function attempt(
  proposal: RenewalWritebackProposal,
  state: RenewalAttemptRecord["state"],
): RenewalAttemptRecord {
  return {
    executionId: renewalWritebackExecutionId(proposal, proposal.effects[0]),
    actionKey: proposal.effects[0].actionKey,
    state,
    attemptCount: 1,
    updatedAtIso: "2026-09-16T18:59:00.000Z",
  };
}

function sheetProposal(confirmationExpiresAtIso = FUTURE): SheetWritebackProposal {
  return {
    spreadsheetId: "sheet-live-1",
    generationId: "proposal-12345678",
    tabTitle: "Lease Renewal",
    previewHash: "c".repeat(64),
    confirmationExpiresAtIso,
    effects: [
      {
        index: 0,
        effectHash: "d".repeat(64),
        actionKey: "google_sheets.renewal_checklist.field_update",
        effect: {
          kind: "field_update",
          field: "renewal_date",
          rowNumber: 41,
          expectedValue: "2026-12-31",
          afterValue: "2027-01-31",
          source: "Reviewed RentVine",
        },
      },
    ],
  } as unknown as SheetWritebackProposal;
}

function sheetStatus(
  proposal: SheetWritebackProposal,
  state: string,
): SheetWritebackEffectStatusView {
  return {
    execution_id: sheetWritebackExecutionId(proposal, proposal.effects[0]),
    state,
    attempt_count: state === "not_started" ? 0 : 1,
    reversal_state: null,
    effect_executable: true,
    reversal_executable: false,
    index: 0,
    action_key: proposal.effects[0].actionKey,
    kind: "field_update",
  } as unknown as SheetWritebackEffectStatusView;
}

function manualState(): RenewalWorkspaceState {
  return {
    ...emptyRenewalWorkspace("81", "0f6a8a5e-2f2c-4c1e-9a52-7c1f0e2f5b11", {
      kind: "lease_end",
      dateIso: "2026-12-31",
      source: "RentVine lease end",
    }),
    cycleId: "0f6a8a5e-2f2c-4c1e-9a52-7c1f0e2f5b11",
    termsRevision: 1,
    ownerResponse: {
      outcome: "approved_terms",
      terms: { rent: 1300, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
      source: "Owner call",
      eventId: "e1",
      recordedAt: "2026-09-16T18:00:00.000Z",
      recordedByUid: "editor-1",
      termsRevision: 1,
    },
    sourceUpdates: {
      renewal_date: {
        eventId: "e2",
        intent: { field: "renewal_date", value: "2027-01-31", source: "Owner call" },
        state: "unavailable",
        reason:
          "The operating Sheet is not connected. The staff record is saved; this update remains pending.",
      },
    },
  } as unknown as RenewalWorkspaceState;
}

describe("S117 per-destination outcomes and current-base readback (ARCH-S117-3)", () => {
  it("AC-S117-4: a charge receipt never claims the base rent changed; the refreshed base rent is compared, not substituted", () => {
    expect(
      projectCurrentBaseReadback({ proposal: null, attempts: [], currentRent: 1300 }),
    ).toEqual({ state: "none" });
    expect(
      projectCurrentBaseReadback({
        proposal: rentvineProposal("future_rent"),
        attempts: [attempt(rentvineProposal("future_rent"), "succeeded")],
        currentRent: 1300,
      }),
    ).toEqual({ state: "none" });
    const proposal = rentvineProposal("current_base");
    expect(
      projectCurrentBaseReadback({ proposal, attempts: [], currentRent: 1250 }),
    ).toEqual({ state: "prepared", chargeAmount: "1300.00" });
    expect(
      projectCurrentBaseReadback({
        proposal,
        attempts: [attempt(proposal, "succeeded")],
        currentRent: 1300,
      }),
    ).toEqual({
      state: "charge_applied_base_rent_matches",
      chargeAmount: "1300.00",
      baseRent: 1300,
    });
    expect(
      projectCurrentBaseReadback({
        proposal,
        attempts: [attempt(proposal, "succeeded")],
        currentRent: 1250,
      }),
    ).toEqual({
      state: "charge_applied_base_rent_differs",
      chargeAmount: "1300.00",
      baseRent: 1250,
    });
    expect(
      projectCurrentBaseReadback({
        proposal,
        attempts: [attempt(proposal, "succeeded")],
        currentRent: null,
      }),
    ).toEqual({ state: "charge_applied_base_rent_unavailable", chargeAmount: "1300.00" });
  });

  it("AC-S117-4: outcomes keep the recorded value through an unavailable destination and never label a pending or drifted row as synchronized", () => {
    const proposal = rentvineProposal("current_base");
    const sheet = sheetProposal();
    const rows = projectRentChargeOutcomes({
      manualState: manualState(),
      rentvineProposal: proposal,
      attempts: [attempt(proposal, "succeeded")],
      sheetProposal: sheet,
      sheetEffects: [sheetStatus(sheet, "succeeded")],
      currentBaseReadback: {
        state: "charge_applied_base_rent_differs",
        chargeAmount: "1300.00",
        baseRent: 1250,
      },
      nowMs: NOW,
    });
    const app = rows.find((row) => row.destination === "app");
    expect(app).toMatchObject({ state: "recorded", stateLabel: "Saved in the app" });
    expect(app?.detail).toContain("1300.00");
    const staff = rows.find((row) => row.id === "sheet:staff:renewal_date");
    expect(staff).toMatchObject({ state: "unavailable", attention: true });
    expect(staff?.detail).toContain("2027-01-31");
    expect(staff?.detail).toContain("not connected");
    const rentvine = rows.find((row) => row.destination === "rentvine");
    expect(rentvine).toMatchObject({
      intent: "current",
      state: "mismatch",
      stateLabel: "Charge applied; lease base rent still differs",
      attention: true,
      anchor: "#rentvine-updates-title",
    });
    expect(rentvine?.detail).toContain("1300.00");
    expect(rentvine?.detail).toContain("1250.00");
    const cell = rows.find((row) => row.id === `sheet:${"d".repeat(64)}`);
    expect(cell).toMatchObject({ state: "verified", attention: false });
    expect(cell?.detail).toContain("2027-01-31");
    for (const row of rows) {
      expect(`${row.label} ${row.stateLabel} ${row.detail}`).not.toMatch(/synchroniz/i);
    }
    const prepared = projectRentChargeOutcomes({
      manualState: null,
      rentvineProposal: proposal,
      attempts: [],
      sheetProposal: null,
      sheetEffects: null,
      currentBaseReadback: { state: "prepared", chargeAmount: "1300.00" },
      nowMs: NOW,
    });
    expect(prepared[0]).toMatchObject({
      state: "prepared",
      stateLabel: "Prepared, awaiting Admin confirmation",
      attention: false,
    });
    const expired = projectRentChargeOutcomes({
      manualState: null,
      rentvineProposal: rentvineProposal("current_base", PAST),
      attempts: [],
      sheetProposal: sheetProposal(PAST),
      sheetEffects: [],
      currentBaseReadback: { state: "prepared", chargeAmount: "1300.00" },
      nowMs: NOW,
    });
    expect(expired.map((row) => row.state)).toEqual(["expired", "expired"]);
  });

  it("AC-S117-4: a failed second destination leaves the first destination's row and the app record intact", () => {
    const proposal = rentvineProposal("current_base");
    const sheet = sheetProposal();
    const rows = projectRentChargeOutcomes({
      manualState: manualState(),
      rentvineProposal: proposal,
      attempts: [attempt(proposal, "failed")],
      sheetProposal: sheet,
      sheetEffects: [sheetStatus(sheet, "succeeded")],
      currentBaseReadback: { state: "prepared", chargeAmount: "1300.00" },
      nowMs: NOW,
    });
    expect(rows.map((row) => [row.destination, row.state])).toEqual([
      ["app", "recorded"],
      ["sheet", "unavailable"],
      ["rentvine", "failed"],
      ["sheet", "verified"],
    ]);
    expect(rows.find((row) => row.state === "failed")?.stateLabel).toBe(
      "Declined without change",
    );
  });
});
