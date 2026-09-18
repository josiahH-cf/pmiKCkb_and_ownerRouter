// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { OperatingSheetPanel } from "@/components/lease-renewal/OperatingSheetPanel";
import type { SheetWritebackClientProposal } from "@/lib/lease-renewal/sheet-writeback/client-projection";
import type { SheetWritebackEffectStatus } from "@/components/lease-renewal/OperatingSheetPanel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const EFFECT_HASH = "d".repeat(64);

function proposal(): SheetWritebackClientProposal {
  return {
    spreadsheet_id: "sheet-1",
    tab_title: "Lease Renewal",
    actor_email: "admin@pmikcmetro.com",
    source_read_at: "2026-09-18T00:00:00.000Z",
    evidence_ref: "workspace:115:fresh",
    preview_hash: "e".repeat(64),
    created_at: "2026-09-18T00:00:00.000Z",
    confirmation_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    effects: [
      {
        index: 0,
        action_key: "google_sheets.renewal_checklist.row_append",
        kind: "row_append",
        effect_hash: EFFECT_HASH,
        effect: {
          tenantName: "Fresh Tenant",
          leaseId: "115",
          propertyId: "84",
          fields: {},
        },
        reversal_kind: "delete_appended_row",
      },
    ],
  };
}

function readyEffect(): SheetWritebackEffectStatus {
  return {
    execution_id: "exec-1",
    state: "not_started",
    attempt_count: 0,
    reversal_state: null,
    effect_executable: true,
    reversal_executable: false,
    index: 0,
    action_key: "google_sheets.renewal_checklist.row_append",
    kind: "row_append",
    effect_hash: EFFECT_HASH,
    effect: {},
    reversal_kind: "delete_appended_row",
  };
}

function renderPanel(writebackPaused: boolean) {
  return render(
    <OperatingSheetPanel
      role="Admin"
      association={{ kind: "exact_link", rowNumber: 2 }}
      workspaceContext={`context-115-${"z".repeat(48)}`}
      initialProposal={proposal()}
      initialEffects={[readyEffect()]}
      writebackPaused={writebackPaused}
    />,
  );
}

describe("S128 OperatingSheetPanel pause surfacing", () => {
  it("shows the pause and hides the execute control while paused", () => {
    renderPanel(true);
    expect(screen.getByText(/Operating-Sheet writes are paused by policy/i)).toBeTruthy();
    expect(screen.getByText(/recorded in the app only/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /review and confirm/i })).toBeNull();
    expect(screen.getByText(/Confirming this Sheet write is paused/i)).toBeTruthy();
  });

  it("offers the execute control when writes are enabled", () => {
    renderPanel(false);
    expect(screen.queryByText(/Operating-Sheet writes are paused by policy/i)).toBeNull();
    expect(screen.getByRole("button", { name: /review and confirm/i })).toBeTruthy();
  });
});
