import { describe, expect, it } from "vitest";
import {
  isCurrentDecisionItem,
  isRetiredWorkItem,
} from "@/lib/approval/current-work-eligibility";

describe("S227 retired-work provenance versus decision lifecycle", () => {
  it("treats an ordinarily closed or superseded decision as history of current work, not retired work", () => {
    const closed = {
      process_run_ref: { id: "run-1", label: "Lease Renewal - 123 Main" },
      direct_link: "/runs/run-1",
      closed_at: "2026-06-06T00:00:00.000Z",
    };
    const superseded = {
      process_run_ref: { id: "run-1", label: "Lease Renewal - 123 Main" },
      direct_link: "/runs/run-1",
      superseded_by_item_id: "item-later",
    };
    for (const item of [closed, superseded]) {
      expect(isCurrentDecisionItem(item)).toBe(false);
      expect(isRetiredWorkItem(item)).toBe(false);
    }
  });

  it("marks retired maintenance provenance as retired work whatever its lifecycle fields say", () => {
    for (const item of [
      { process_run_ref: { id: "maintenance:01a0", label: "S99 proof create" } },
      { process_run_ref: { id: "rentvine-work-order:7", label: "Work order" } },
      { affected_system_action: "rentvine.work_order.create" },
      { direct_link: "/maintenance/requests/1" },
    ]) {
      expect(isRetiredWorkItem(item)).toBe(true);
      expect(isCurrentDecisionItem(item)).toBe(false);
    }
  });

  it("leaves an open ordinary decision current and not retired", () => {
    const open = {
      process_run_ref: { id: "run-1", label: "Lease Renewal - 123 Main" },
      direct_link: "/runs/run-1",
    };
    expect(isRetiredWorkItem(open)).toBe(false);
    expect(isCurrentDecisionItem(open)).toBe(true);
  });
});
