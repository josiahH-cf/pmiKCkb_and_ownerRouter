import { describe, expect, it } from "vitest";

import {
  MAINTENANCE_WAITING_ON,
  MAINTENANCE_WAITING_ON_LABELS,
  describeProviderStatusConflict,
  projectMaintenanceWaitingOn,
  type MaintenanceWaitingOnInput,
} from "@/lib/maintenance/waiting-on";
import {
  formatPreapprovalAmount,
  parsePreapprovalAmountCents,
  type MaintenancePropertyPreapproval,
} from "@/lib/maintenance/property-preapproval";
import type { MaintenanceWorkOrderLink } from "@/lib/firestore/maintenance-work-order-links";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";

// S108: one waiting-on projection over the ticket, the RentVine link snapshot, and the property
// preapproval. It reads; it never sets isOwnerApproved and never reaches a provider.

function ticket(
  overrides: Partial<MaintenanceTicketRecord> = {},
): MaintenanceTicketRecord {
  return {
    id: "ticket-1",
    data_mode: "live",
    status: "Open",
    priority: "Normal",
    priority_provenance: "operator-set",
    summary: "Kitchen faucet leak",
    description: "Steady drip under the sink.",
    unit: { unitId: "unit:4821", label: "4821 Maple Ct" },
    photo_refs: [],
    reporter: { kind: "staff", uid: "uid-1" },
    labels: [],
    space_id: "maintenance",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function link(
  snapshot?: Partial<NonNullable<MaintenanceWorkOrderLink["provider_snapshot"]>>,
): MaintenanceWorkOrderLink {
  return {
    ticket_ref: "ticket-1",
    action_key: "rentvine.work_order.create",
    execution_id: "exec-1",
    state: "succeeded",
    provider_work_order_id: "9001",
    created_by_uid: "uid-1",
    attempt_seq: 1,
    ...(snapshot
      ? {
          provider_snapshot: {
            property_id: "7",
            work_order_status_id: "3",
            status_label: "In Progress",
            priority_id: "2",
            is_owner_approved: "0",
            assigned_vendor_trade_id: null,
            updated_at_iso: "2026-09-02T00:00:00.000Z",
            read_at_iso: "2026-09-03T00:00:00.000Z",
            ...snapshot,
          },
        }
      : {}),
  };
}

const PREAPPROVAL: MaintenancePropertyPreapproval = {
  property_key: "prop-1",
  amount_cents: 50_000,
  effective_from_iso: "2026-01-01T00:00:00.000Z",
  recorded_by_uid: "admin-1",
  version: 1,
};

function project(overrides: Partial<MaintenanceWaitingOnInput> = {}) {
  return projectMaintenanceWaitingOn({
    ticket: ticket(),
    link: link(),
    preapproval: PREAPPROVAL,
    ...overrides,
  });
}

describe("S108 preapproval amounts are exact money (AC-S108-3 / AC-S108-4)", () => {
  it("parses only an exact positive amount", () => {
    expect(parsePreapprovalAmountCents("500")).toBe(50_000);
    expect(parsePreapprovalAmountCents(" $1,250.75 ")).toBe(125_075);
    expect(parsePreapprovalAmountCents("0.01")).toBe(1);
    for (const bad of ["", "  ", "abc", "-5", "0", "1.005", "1e3", "500.", "$"]) {
      expect(() => parsePreapprovalAmountCents(bad), bad).toThrow();
    }
  });

  it("formats an amount without inventing precision", () => {
    expect(formatPreapprovalAmount(50_000)).toBe("$500.00");
    expect(formatPreapprovalAmount(125_075)).toBe("$1,250.75");
  });
});

describe("S108 waiting-on projection (ARCH-S108-2 / BEH-S108-2)", () => {
  it("exposes exactly the specified vocabulary", () => {
    expect([...MAINTENANCE_WAITING_ON]).toEqual([
      "owner_approval",
      "resident",
      "vendor",
      "scheduling",
      "estimate",
      "unit_verification",
      "none",
    ]);
    for (const value of MAINTENANCE_WAITING_ON) {
      expect(MAINTENANCE_WAITING_ON_LABELS[value]).toBeTruthy();
    }
  });

  it("skips owner approval for an estimate within the preapproval (BEH-S108-2)", () => {
    const result = project({
      ticket: ticket({ estimate_amount_cents: 40_000, status: "Waiting on Vendor" }),
    });
    expect(result).toMatchObject({
      waitingOn: "vendor",
      ownerDecisionRequired: false,
      withinPreapproval: true,
    });
    expect(result.ownerDecisionDetail).toContain("$500.00");
  });

  it("waits on the owner above the preapproval (BEH-S108-2)", () => {
    expect(project({ ticket: ticket({ estimate_amount_cents: 60_000 }) })).toMatchObject({
      waitingOn: "owner_approval",
      ownerDecisionRequired: true,
      withinPreapproval: false,
    });
  });

  it("never treats a missing estimate as within preapproval (AC-S108-3 / BEH-S108-2)", () => {
    expect(project()).toMatchObject({
      waitingOn: "owner_approval",
      ownerDecisionRequired: true,
      withinPreapproval: false,
    });
    // Absent preapproval record: any estimate still needs the owner.
    expect(
      project({
        preapproval: null,
        ticket: ticket({ estimate_amount_cents: 1_000 }),
      }),
    ).toMatchObject({ waitingOn: "owner_approval", ownerDecisionRequired: true });
  });

  it("treats a provider-approved work order as approved and asks for the amount", () => {
    expect(project({ link: link({ is_owner_approved: "1" }) })).toMatchObject({
      waitingOn: "estimate",
      ownerDecisionRequired: false,
    });
  });

  it("asks for unit verification before anything else", () => {
    expect(project({ ticket: ticket({ unit: null }) })).toMatchObject({
      waitingOn: "unit_verification",
    });
  });

  it("reads a closed ticket as waiting on nothing", () => {
    expect(
      project({
        ticket: ticket({ status: "Closed", closed_at: "2026-09-02T00:00:00.000Z" }),
      }),
    ).toMatchObject({ waitingOn: "none", ownerDecisionRequired: false });
  });

  it("derives the remaining blockers from the ticket status once the owner is settled", () => {
    const covered = { estimate_amount_cents: 40_000 } as const;
    expect(
      project({ ticket: ticket({ ...covered, status: "Waiting on Response" }) })
        .waitingOn,
    ).toBe("resident");
    expect(
      project({ ticket: ticket({ ...covered, status: "Waiting on Vendor" }) }).waitingOn,
    ).toBe("vendor");
    expect(
      project({ ticket: ticket({ ...covered, status: "Scheduled" }) }).waitingOn,
    ).toBe("scheduling");
    expect(project({ ticket: ticket({ ...covered, status: "Open" }) }).waitingOn).toBe(
      "vendor",
    );
    expect(
      project({ ticket: ticket({ ...covered, status: "Open", vendor_id: "v-1" }) })
        .waitingOn,
    ).toBe("scheduling");
  });

  it("renders an app-only ticket without a link as its own state", () => {
    expect(
      project({ link: null, ticket: ticket({ estimate_amount_cents: 40_000 }) }),
    ).toMatchObject({ waitingOn: "vendor", providerWorkOrderId: null });
  });

  it("carries the RentVine work-order id for the report link", () => {
    expect(project().providerWorkOrderId).toBe("9001");
  });
});

describe("S108 provider conflict is shown, never resolved (BEH-S108-3)", () => {
  it("names both statuses and the exact next action when they differ", () => {
    const conflict = describeProviderStatusConflict({
      appStatus: "Scheduled",
      snapshot: link({ status_label: "In Progress" }).provider_snapshot ?? null,
    });
    expect(conflict).toMatchObject({
      differs: true,
      appStatus: "Scheduled",
      providerStatus: "In Progress",
    });
    expect(conflict.nextAction).toMatch(/update/i);
    expect(conflict.nextAction).not.toMatch(/automatically|overwrite/i);
  });

  it("reports no conflict without a snapshot or when the labels agree", () => {
    expect(
      describeProviderStatusConflict({ appStatus: "Scheduled", snapshot: null }),
    ).toMatchObject({ differs: false, providerStatus: null });
    expect(
      describeProviderStatusConflict({
        appStatus: "Scheduled",
        snapshot: link({ status_label: "Scheduled" }).provider_snapshot ?? null,
      }),
    ).toMatchObject({ differs: false });
  });
});
