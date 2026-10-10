import { describe, it, expect } from "vitest";
import {
  projectMaintenanceReport as project,
  maintenanceReportCsv,
  MaintenanceReportRequestSchema,
  type ReportEvent,
} from "@/lib/maintenance/report-model";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import type { CaseAssociation, FinancialEntry } from "@/lib/maintenance/case-model";
const old: CaseAssociation = {
  kind: "lease",
  propertyId: "91",
  unitId: "17",
  leaseId: "71",
  ownerRef: "11",
  ownerLabel: "Original owner",
  unitLabel: "Original unit at event time",
  eventDate: "2026-09-01",
  evidenceRef: "fixture:dated-agreement",
  reason: "Reviewed original dated ownership and tenancy",
  version: 1,
  identityStatus: "verified",
  ownershipBasis: "staff_reviewed_event_date_evidence",
  tenancyBasis: "staff_reviewed_event_date_evidence",
  verifiedAt: "2026-09-01T12:00:00Z",
  recordedBy: "staff",
  sourceHash: "a".repeat(64),
};
const newer: CaseAssociation = {
  ...old,
  leaseId: "72",
  ownerRef: "12",
  unitLabel: "Later unit label",
  eventDate: "2026-10-01",
  version: 2,
  sourceHash: "b".repeat(64),
};
const ticket: MaintenanceTicketRecord = {
  id: "case-one",
  data_mode: "live",
  record_version: 8,
  status: "Open",
  priority: "Normal",
  priority_provenance: "operator-set",
  summary: "PRIVATE STAFF DISCUSSION",
  description: "PRIVATE RAW TRANSCRIPT",
  unit: { unitId: "unit:17", label: "CURRENT OCCUPANCY LABEL" },
  photo_refs: [],
  reporter: { kind: "staff", uid: "private-staff" },
  labels: ["PRIVATE SENTIMENT"],
  space_id: "maintenance",
  created_at: "2026-09-02T04:30:00Z",
  updated_at: "2026-10-09T12:00:00Z",
  lifecycle_origin: "native",
  lifecycle_started_at: "2026-09-02T04:30:00Z",
  maintenance_association: newer,
};
const event = (
  id: string,
  date: string,
  stage?: string,
  kind = "lifecycle",
): ReportEvent => ({
  id,
  ticket_id: ticket.id,
  ticket_version: 2,
  kind,
  actor_kind: "staff",
  actor_id: "private-staff",
  occurred_at: date,
  recorded_at: date,
  summary: "PRIVATE EVENT NOTES",
  evidence_refs: ["private:source"],
  association: old,
  ...(stage ? { state_snapshot: { stage } } : {}),
});
const financial = (
  id: string,
  kind: FinancialEntry["kind"],
  amountCents: number,
): FinancialEntry => ({
  id,
  kind,
  amountCents,
  currency: "USD",
  version: 1,
  ticket_id: ticket.id,
  serviceDate: "2026-09-05",
  invoiceDate: "2026-10-02",
  paymentDate: kind === "payment_claim" ? "2026-09-06" : null,
  vendorId: "v1",
  sourceRef: "PRIVATE RAW SOURCE LINK",
  externalIdentity: "Original invoice 42",
  sourceTotalCents: 10000,
  sourceLines: [{ description: "PRIVATE INTERNAL LINE TEXT", amountCents: 10000 }],
  reviewState: kind === "owner_charge" ? "reviewed" : "reported",
  correctionReason: "PRIVATE RECONCILIATION",
  recorded_by_uid: "private-staff",
  recorded_at: "2026-10-03T12:00:00Z",
});
function input() {
  return {
    request: {
      scopeKind: "owner" as const,
      scopeId: "11",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      financialDateBasis: "service" as const,
    },
    generatedAt: "2026-10-09T15:00:00Z",
    tickets: [structuredClone(ticket)],
    events: [
      {
        ...event("association-old", "2026-09-01T12:00:00Z", undefined, "association"),
        association: old,
      },
      {
        ...event("association-new", "2026-10-01T12:00:00Z", undefined, "association"),
        association: newer,
      },
      event("create", "2026-09-02T04:30:00Z", "assessment", "create"),
      {
        ...event("assessment", "2026-09-05T15:00:00Z", "owner_decision", "assessment"),
        state_snapshot: {
          stage: "owner_decision",
          assessment: { scope: "PMI reviewed repair scope" },
        },
      },
      event("close", "2026-09-10T14:00:00Z", "closed", "close"),
      event("reopen", "2026-09-15T14:00:00Z", "assessment", "reopen"),
    ],
    financial: [] as FinancialEntry[],
    artifacts: [],
    vendors: [{ id: "v1", displayName: "Vendor, with a long name" }],
    complete: true,
  };
}
describe("S214 same-snapshot reporting", () => {
  it("uses reviewed event-date owner/lease and Chicago dates instead of today's assignment", () => {
    const x = input(),
      report = project(x);
    expect(report.counts).toEqual({ opened: 1, completed: 1, openAsOfEnd: 1 });
    expect(report.jobs[0]).toMatchObject({
      openedDate: "2026-09-01",
      location: old.unitLabel,
      association: { ownerRef: "11", leaseId: "71" },
      stageAsOfEnd: "assessment",
    });
    expect(report.trends[0]).toMatchObject({ opened: 1, completed: 1 });
    expect(project({ ...x, request: { ...x.request, scopeId: "12" } }).jobs).toHaveLength(
      0,
    );
  });
  it("keeps cancellation/vendor completion requests out of final closure counts", () => {
    const x = input();
    x.events = x.events.filter((e) => e.id !== "close" && e.id !== "reopen");
    x.events.push(
      event("vendor-request", "2026-09-20T12:00:00Z", undefined, "vendor_contribution"),
      event("cancel", "2026-09-21T12:00:00Z", "cancelled"),
    );
    expect(project(x).counts).toEqual({ opened: 1, completed: 0, openAsOfEnd: 0 });
  });
  it("discloses unknown legacy end states and incomplete history without inventing prior stages", () => {
    const x = input();
    x.events = x.events.filter((e) => !e.state_snapshot);
    x.tickets[0].lifecycle_origin = "legacy_starting_state";
    x.tickets[0].lifecycle_started_at = "2026-09-09T12:00:00Z";
    const report = project(x);
    expect(report.coverage).toMatchObject({
      incomplete: true,
      startDate: "2026-09-09",
      unknownEndStateCases: 1,
    });
    expect(report.jobs[0].openAsOfEnd).toBeNull();
    expect(report.counts.openAsOfEnd).toBe(0);
  });
  it("separates invoice allocation, credits, owner charge and an unverified payment claim", () => {
    const x = input();
    x.financial = [
      financial("invoice", "vendor_invoice", 6000),
      financial("credit", "vendor_credit", 500),
      financial("charge", "owner_charge", 7000),
      financial("claim", "payment_claim", 7000),
    ];
    const report = project(x);
    expect(report.totals).toMatchObject({
      invoicedCents: 6000,
      creditsCents: 500,
      ownerChargeCents: 7000,
      claimedPaidCents: 7000,
      verifiedPaidCents: null,
      balanceCents: null,
      paymentState: "unknown",
    });
    expect(report.trends[0]).toMatchObject({
      invoicedCents: 6000,
      ownerChargeCents: 7000,
      verifiedPaidCents: null,
      financialCount: 4,
    });
    expect(
      project({ ...x, request: { ...x.request, financialDateBasis: "invoice" } }).totals
        .invoicedCents,
    ).toBeNull();
  });
  it("uses the same complete payment evidence rule for report totals, labels and CSV source references", () => {
    const x = input();
    const observed: FinancialEntry = {
      ...financial("observed", "payment_observation", 2000),
      paymentDate: "2026-09-08",
      verification: {
        kind: "provider_readback",
        provider: "Fixture authoritative source",
        reference: "original-payment-reference",
        resultHash: "a".repeat(64),
        observedAt: "2026-10-03T12:00:00Z",
      },
    };
    x.financial = [financial("charge", "owner_charge", 7000), observed];
    const report = project(x);
    expect(report.totals).toMatchObject({
      verifiedPaidCents: 2000,
      balanceCents: 5000,
      paymentState: "partial",
    });
    expect(report.jobs[0].financial[1].sourceLabel).toContain(
      "original-payment-reference",
    );
    expect(maintenanceReportCsv(report)).toContain(
      "Fixture authoritative source; reference original-payment-reference; observed 2026-10-03T12:00:00Z",
    );
    const originalSnapshot = JSON.stringify(report);
    x.financial[1] = { ...observed, paymentDate: null };
    const incomplete = project(x);
    expect(incomplete.totals).toMatchObject({
      verifiedPaidCents: null,
      balanceCents: null,
      paymentState: "unknown",
    });
    expect(incomplete.jobs[0].financial[1]).toMatchObject({
      label: "Payment observation, incomplete and unverified",
      sourceLabel: "Incomplete payment observation, unverified",
    });
    expect(JSON.stringify(report)).toBe(originalSnapshot);
  });
  it("ignores unmatched ownership and records which cases are unattributed", () => {
    const x = input();
    x.events = [];
    delete x.tickets[0].maintenance_association;
    const report = project(x);
    expect(report.jobs).toHaveLength(0);
    expect(report.coverage.excludedUnattributedCases).toBe(1);
  });
  it("exports only reviewed/minimized facts and core evidence, including late-retained source copies", () => {
    const x = input();
    x.financial = [financial("invoice", "vendor_invoice", 6000)];
    const report = project({
      ...x,
      artifacts: [
        {
          id: "file",
          ticket_id: ticket.id,
          filename: "invoice.pdf",
          mimeType: "application/pdf",
          sha256: "c".repeat(64),
          recorded_at: "2026-10-04T12:00:00Z",
          state: "retained",
          purpose: "invoice",
        },
      ],
    });
    const text = JSON.stringify(report) + maintenanceReportCsv(report);
    expect(text).not.toContain("PRIVATE");
    expect(text).not.toContain("CURRENT OCCUPANCY");
    expect(report.jobs[0].documents[0].sha256).toBe("c".repeat(64));
    expect(report.jobs[0].reviewedScope).toBe("PMI reviewed repair scope");
  });
  it("preserves an earlier generated snapshot while a later correction has different versions", () => {
    const x = input();
    x.financial = [financial("invoice", "vendor_invoice", 6000)];
    const first = project(x),
      frozen = JSON.stringify(first);
    x.financial[0].amountCents = 5000;
    x.financial[0].version = 2;
    x.tickets[0].record_version = 9;
    const corrected = project(x);
    expect(JSON.stringify(first)).toBe(frozen);
    expect(corrected.totals.invoicedCents).toBe(5000);
    expect(corrected.jobs[0].sourceVersions).toContainEqual({
      collection: "maintenance_financial_entries",
      id: "invoice",
      version: 2,
    });
  });
  it("neutralizes formula-like text while retaining commas, quotes, newlines and exact cents", () => {
    const x = input();
    x.financial = [financial("invoice", "vendor_invoice", 6000)];
    x.vendors[0].displayName = '  =SUM(1,2)\n"Vendor"';
    const csv = maintenanceReportCsv(project(x));
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"\'  =SUM(1,2)\n""Vendor"""');
    expect(csv).toContain('"6000"');
    expect(csv).toContain('"Unknown"');
  });
  it("refuses incomplete sources and excessive periods instead of returning partial totals", () => {
    expect(() => project({ ...input(), complete: false })).toThrow("incomplete");
    expect(
      MaintenanceReportRequestSchema.safeParse({
        ...input().request,
        endDate: "2028-01-01",
      }).success,
    ).toBe(false);
  });
});
