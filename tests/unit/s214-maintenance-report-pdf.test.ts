import { it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { maintenanceReportPdf } from "@/lib/maintenance/report-pdf";
import {
  projectMaintenanceReport,
  type ReportEvent,
} from "@/lib/maintenance/report-model";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import type { CaseAssociation, FinancialEntry } from "@/lib/maintenance/case-model";
function fixture(count = 25) {
  const tickets: MaintenanceTicketRecord[] = [],
    events: ReportEvent[] = [],
    financial: FinancialEntry[] = [];
  for (let i = 1; i <= count; i++) {
    const id = `local-report-case-${String(i).padStart(3, "0")}`,
      association: CaseAssociation = {
        kind: "lease",
        propertyId: "91",
        unitId: "17",
        leaseId: "71",
        ownerRef: "11",
        unitLabel: `Local fixture ${i}: a particularly long street address and building name with narrow-entry access reviewed by PMI staff`,
        eventDate: "2026-10-09",
        evidenceRef: "private-fixture:reviewed-tenancy",
        reason: "Actual fixture reviewed",
        identityStatus: "verified",
        ownershipBasis: "staff_reviewed_event_date_evidence",
        tenancyBasis: "staff_reviewed_event_date_evidence",
        version: 1,
        verifiedAt: "2026-10-09T12:00:00Z",
        recordedBy: "fixture-staff",
        sourceHash: "a".repeat(64),
      };
    tickets.push({
      id,
      data_mode: "live",
      record_version: 4,
      status: "Scheduled",
      priority: "Normal",
      priority_provenance: "operator-set",
      summary: "PRIVATE INTERNAL SENTIMENT",
      description: "PRIVATE RAW TRANSCRIPT",
      unit: { unitId: "unit:17", label: association.unitLabel! },
      photo_refs: [],
      reporter: { kind: "staff" },
      labels: [],
      space_id: "maintenance",
      created_at: "2026-10-09T12:00:00Z",
      updated_at: "2026-10-09T15:00:00Z",
      lifecycle_origin: "native",
      lifecycle_started_at: "2026-10-09T12:00:00Z",
      maintenance_association: association,
    });
    events.push({
      id: `event-${i}`,
      ticket_id: id,
      ticket_version: 4,
      kind: "assessment",
      actor_kind: "staff",
      actor_id: "fixture-staff",
      occurred_at: "2026-10-09T14:00:00Z",
      recorded_at: "2026-10-09T14:00:00Z",
      summary: "PRIVATE INTERNAL EVENT",
      evidence_refs: [],
      association,
      state_snapshot: {
        stage: "in_progress",
        assessment: {
          scope:
            `Reviewed plumbing scope ${i}: inspect and replace the supplied fixture with a confirmed equivalent. Request a fresh decision for further work. ` +
            "Document actual conditions before any additional work. ".repeat(
              i === 1 ? 25 : 1,
            ),
        },
      },
    });
    for (const [n, kind] of (["vendor_invoice", "owner_charge"] as const).entries())
      financial.push({
        id: `entry-${i}-${n}`,
        ticket_id: id,
        version: 1,
        kind,
        amountCents: kind === "vendor_invoice" ? 11000 : 12500,
        currency: "USD",
        serviceDate: "2026-10-09",
        invoiceDate: "2026-10-09",
        paymentDate: null,
        vendorId: "vendor-one",
        sourceRef: "private-fixture:original-invoice",
        externalIdentity: `FIXTURE-INV-${i}`,
        sourceTotalCents: 11000,
        sourceLines: [
          { description: "Labor including actual fixture tax", amountCents: 11000 },
        ],
        reviewState: "reviewed",
        correctionReason: "Fixture reviewed evidence",
        recorded_by_uid: "fixture-staff",
        recorded_at: "2026-10-09T15:00:00Z",
      });
  }
  return projectMaintenanceReport({
    request: {
      scopeKind: "owner",
      scopeId: "11",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      financialDateBasis: "service",
    },
    generatedAt: "2026-10-09T16:00:00Z",
    tickets,
    events,
    financial,
    artifacts: [],
    vendors: [
      {
        id: "vendor-one",
        displayName:
          "Local fixture vendor, with an unusually long registered business name",
      },
    ],
    complete: true,
  });
}
it("generates a deterministic multi-page readable export from the same minimized report facts", async () => {
  const report = fixture(),
    bytes = await maintenanceReportPdf(report),
    again = await maintenanceReportPdf(report),
    pdf = await PDFDocument.load(bytes);
  expect(Buffer.from(bytes).equals(Buffer.from(again))).toBe(true);
  expect(pdf.getPageCount()).toBeGreaterThan(6);
  expect(pdf.getTitle()).toBe("Maintenance history | Owner 11");
  expect(report.totals).toMatchObject({
    invoicedCents: 275000,
    ownerChargeCents: 312500,
    verifiedPaidCents: null,
  });
  const output = process.env.MAINTENANCE_REPORT_QA_OUTPUT;
  if (output) {
    expect(
      output.startsWith("/home/josiah/.local/state/pmi-kc-operations-20261009/"),
    ).toBe(true);
    mkdirSync(output, { recursive: true, mode: 0o700 });
    writeFileSync(output + "/long-report.pdf", bytes, { mode: 0o600 });
    writeFileSync(output + "/long-report-model.json", JSON.stringify(report, null, 2), {
      mode: 0o600,
    });
  }
});
it("renders empty coverage honestly and refuses unsupported text rather than silently dropping facts", async () => {
  const empty = fixture(0);
  expect(
    (await PDFDocument.load(await maintenanceReportPdf(empty))).getPageCount(),
  ).toBeGreaterThan(0);
  const changed = fixture(1);
  changed.jobs[0].location = "Actual name 漢";
  await expect(maintenanceReportPdf(changed)).rejects.toThrow("No incomplete PDF");
});
