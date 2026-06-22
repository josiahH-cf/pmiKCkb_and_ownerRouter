import { describe, expect, it } from "vitest";
import { mapReconciliationToQueueItem } from "@/lib/lease-renewal/approval-queue-mapping";
import { reconcileField, type ReconCandidate } from "@/lib/lease-renewal/reconciliation";

function candidate(
  source: string,
  source_system: string,
  value: ReconCandidate["value"],
): ReconCandidate {
  return { source, source_system, value };
}

const CTX = { runId: "run-123" };

describe("mapReconciliationToQueueItem", () => {
  it("maps a High legal conflict to a Dan/Admin SourceFactConflict item", () => {
    const recon = reconcileField("lawn_care", [
      candidate("spreadsheet", "Google Sheet Tab 18", "Tenant"),
      candidate("rentvine_building", "Rentvine building level", "HOA"),
    ]);
    const mapping = mapReconciliationToQueueItem(recon, CTX);

    expect(mapping).not.toBeNull();
    expect(mapping!.queueItem).toMatchObject({
      item_type: "SourceFactConflict",
      risk: "High",
      audience_group: "Dan/Admin decisions",
      status: "Ready for Approval",
      affected_system_action: "google_sheets.renewal_checklist.reconcile",
      source_trigger_key: "lease_renewal:reconcile:run-123:lawn_care",
    });
    expect(mapping!.queueItem.direct_link).toBe(
      "/lease-renewal/runs/run-123/reconciliation/lawn_care",
    );
    expect(mapping!.sourceLinks).toHaveLength(2);
  });

  it("maps a Blocked (no precedence rule) conflict to Failed/Blocked automation", () => {
    const recon = reconcileField("mystery_field", [
      candidate("sheet_tab3", "Google Sheet Tab 3", "A"),
      candidate("rentvine", "Rentvine", "B"),
    ]);
    const mapping = mapReconciliationToQueueItem(recon, CTX)!;

    expect(mapping.queueItem.risk).toBe("Blocked");
    expect(mapping.queueItem.status).toBe("Blocked");
    expect(mapping.queueItem.audience_group).toBe("Failed/Blocked automation");
    expect(mapping.queueItem.action_needed).toContain("no precedence rule");
  });

  it("maps a Medium cadence conflict to Team follow-up", () => {
    const recon = reconcileField("inspections_cadence", [
      candidate("sheet_tab17", "Tab 17", "1 per year"),
      candidate("sheet_tab18", "Tab 18", "2 per year"),
    ]);
    const mapping = mapReconciliationToQueueItem(recon, CTX)!;
    expect(mapping.queueItem.risk).toBe("Medium");
    expect(mapping.queueItem.audience_group).toBe("Team follow-up");
  });

  it("returns null for a benign (no-flag) reconciliation", () => {
    const recon = reconcileField("current_rent", [
      candidate("rentvine", "Rentvine", 1250),
      candidate("sheet_tab3", "Tab 3", 1250),
    ]);
    expect(mapReconciliationToQueueItem(recon, CTX)).toBeNull();
  });

  it("keeps PII (raw conflicting values) out of the queue artifact — only deep links carry it", () => {
    const recon = reconcileField("tenant_name", [
      candidate("sheet_tab3", "Google Sheet Tab 3", "RIVERS, CASEY"),
      candidate("google_form", "Google Form", "Casey Rivers"),
    ]);
    const mapping = mapReconciliationToQueueItem(recon, CTX)!;
    const serialized = JSON.stringify(mapping);

    expect(mapping.queueItem.risk).toBeDefined();
    expect(serialized).not.toContain("RIVERS");
    expect(serialized).not.toContain("Casey");
    // The deep link is present so the value is reachable inside the authenticated app.
    expect(mapping.queueItem.direct_link).toContain("/lease-renewal/runs/run-123/");
  });
});
