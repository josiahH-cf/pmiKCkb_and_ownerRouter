import { maintenanceResponsibilityContext } from "./responsibility-context";
import {
  operatingHeadSelection,
  selectOperatingPolicy,
  type OperatingPolicyHead,
  type OperatingPolicyVersion,
} from "./operating-policy";
// One minimized, point-in-time model for the screen and both export formats.
import { z } from "zod";
import {
  businessDateIso,
  BUSINESS_TIME_ZONE,
} from "@/lib/lease-renewal/business-calendar";
import {
  maintenanceDate,
  canonicalMaintenanceId,
  financialProjection,
  financialEntryLabel,
  financialEvidenceSourceLabel,
  type CaseAssociation,
  type FinancialEntry,
  type MaintenanceCaseEvent,
} from "./case-model";
import type { MaintenanceTicketRecord } from "./ticket-model";
export const MaintenanceReportRequestSchema = z
  .object({
    scopeKind: z.enum(["owner", "property", "unit", "lease"]),
    scopeId: canonicalMaintenanceId,
    startDate: maintenanceDate,
    endDate: maintenanceDate,
    financialDateBasis: z.enum(["service", "invoice", "payment"]),
  })
  .strict()
  .superRefine((v, c) => {
    const days = (Date.parse(v.endDate) - Date.parse(v.startDate)) / 86400000;
    if (days < 0 || days > 366)
      c.addIssue({
        code: "custom",
        message: "Choose an ordered period no longer than 367 calendar days.",
      });
  });
export type MaintenanceReportRequest = z.infer<typeof MaintenanceReportRequestSchema>;
export const SaveMaintenanceReportSchema = z
  .object({
    operationId: z.string().uuid(),
    request: MaintenanceReportRequestSchema,
    expectedSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    reviewedGeneratedAt: z.string().datetime(),
    reviewedOwnerReadyContent: z.literal(true),
    retainFactsAndExportsIndefinitely: z.literal(true),
  })
  .strict();
export type SaveMaintenanceReportInput = z.infer<typeof SaveMaintenanceReportSchema>;

export interface ReportEvent extends MaintenanceCaseEvent {
  state_snapshot?: { stage?: string; assessment?: { scope: string } };
}
export interface ReportArtifact {
  id: string;
  ticket_id: string;
  filename: string;
  mimeType: string;
  sha256: string;
  recorded_at: string;
  state: string;
  purpose: string;
  association_snapshot?: CaseAssociation | null;
}
export interface ReportVendor {
  id: string;
  displayName?: string;
  name?: string;
}
export interface ReportFinancial {
  id: string;
  version: number;
  kind: FinancialEntry["kind"];
  label: string;
  amountCents: number;
  currency: string;
  serviceDate: string;
  invoiceDate: string | null;
  paymentDate: string | null;
  reviewState: string;
  invoiceIdentity: string | null;
  vendorLabel: string | null;
  sourceLabel: string;
}
export interface ReportJob {
  ticketId: string;
  ticketVersion: number;
  title: string;
  location: string;
  trade: string | null;
  vendor: string | null;
  association: Pick<
    CaseAssociation,
    | "kind"
    | "propertyId"
    | "unitId"
    | "leaseId"
    | "ownerRef"
    | "eventDate"
    | "version"
    | "ownershipBasis"
    | "sourceHash"
  >;
  openedDate: string;
  openedInPeriod: boolean;
  completedDates: string[];
  completedInPeriod: boolean;
  openAsOfEnd: boolean | null;
  stageAsOfEnd: string;
  assessmentDate: string | null;
  workDates: string[];
  reviewedScope: string | null;
  responsibility?: {
    version: number;
    state: string;
    reviewAtExport: "current" | "needs_review" | "policy_unverified";
    policyId: string | null;
    policyVersion: number | null;
    proposedAmountCents: number | null;
    amountBasis: string;
    allocations: Array<{ party: string; basisPoints: number }>;
    recordedAt: string;
    meaning: "Staff-recorded responsibility/proposal; no ledger charge or verified payment";
  } | null;
  financial: ReportFinancial[];
  totals: ReturnType<typeof financialProjection>;
  documents: Array<{
    id: string;
    filename: string;
    mimeType: string;
    sha256: string;
    sourceLabel: string;
  }>;
  chronology: Array<{ id: string; date: string; label: string; sourceLabel: string }>;
  sourceVersions: Array<{ collection: string; id: string; version: number | string }>;
}
export interface MaintenanceReport {
  schemaVersion: 1;
  request: MaintenanceReportRequest;
  generatedAt: string;
  timeZone: typeof BUSINESS_TIME_ZONE;
  scopeLabel: string;
  coverage: {
    startDate: string | null;
    incomplete: boolean;
    excludedUnattributedCases: number;
    unknownEndStateCases: number;
    notes: string[];
  };
  definitions: {
    opened: string;
    completed: string;
    openAtEnd: string;
    financial: string;
    history: string;
  };
  counts: { opened: number; completed: number; openAsOfEnd: number };
  totals: ReturnType<typeof financialProjection>;
  jobs: ReportJob[];
  trends: Array<{
    month: string;
    opened: number;
    completed: number;
    financialCount: number;
    invoicedCents: number | null;
    ownerChargeCents: number | null;
    verifiedPaidCents: number | null;
  }>;
}
const dateOf = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : businessDateIso(value);
const period = (date: string, q: MaintenanceReportRequest) =>
  date >= q.startDate && date <= q.endDate;
function matches(a: CaseAssociation | null | undefined, q: MaintenanceReportRequest) {
  if (!a || a.identityStatus !== "verified") return false;
  return q.scopeKind === "owner"
    ? a.ownerRef === q.scopeId &&
        a.ownershipBasis === "staff_reviewed_event_date_evidence"
    : q.scopeKind === "property"
      ? a.propertyId === q.scopeId
      : q.scopeKind === "unit"
        ? a.unitId === q.scopeId
        : a.kind === "lease" && a.leaseId === q.scopeId;
}
const clean = (v: string, max = 4000) =>
  v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max);
const sourceLabels: Record<string, string> = {
  create: "PMI case opened",
  assessment: "PMI reviewed assessment",
  lifecycle: "PMI recorded progress",
  close: "PMI final closure",
  reopen: "PMI reopened work",
  association: "PMI reviewed event-date association",
  financial: "PMI recorded financial evidence",
  retained_artifact: "PMI retained core document",
  vendor_review: "PMI reviewed vendor contribution",
  vendor_assignment: "PMI recorded vendor assignment",
  urgency_review: "PMI reviewed urgency facts",
  responsibility_review: "PMI reviewed responsibility/proposal",
};
export function projectMaintenanceReport(input: {
  request: MaintenanceReportRequest;
  generatedAt: string;
  tickets: MaintenanceTicketRecord[];
  events: ReportEvent[];
  financial: FinancialEntry[];
  artifacts: ReportArtifact[];
  vendors?: ReportVendor[];
  operatingPolicies?: {
    heads: OperatingPolicyHead[];
    versions: OperatingPolicyVersion[];
  };
  complete: boolean;
}): MaintenanceReport {
  const q = MaintenanceReportRequestSchema.parse(input.request);
  if (!input.complete)
    throw Error("Report sources are incomplete. No truncated report was generated.");
  if (!Number.isFinite(Date.parse(input.generatedAt)))
    throw Error("A verified generation time is required.");
  const vendorLabels = new Map(
    (input.vendors ?? []).map((v) => [v.id, clean(v.displayName ?? v.name ?? v.id, 500)]),
  );
  const live = input.tickets.filter((t) => t.data_mode === "live"),
    events = input.events.filter(
      (e) => Date.parse(e.recorded_at) <= Date.parse(input.generatedAt),
    );
  const jobs: ReportJob[] = [],
    allSelectedFinancial: FinancialEntry[] = [];
  let excluded = 0,
    unknown = 0;
  const starts = live
    .map((t) => t.lifecycle_started_at)
    .filter((v): v is string => !!v && Number.isFinite(Date.parse(v)))
    .map(dateOf)
    .sort();
  for (const ticket of live) {
    const history = events
      .filter((e) => e.ticket_id === ticket.id)
      .sort(
        (a, b) =>
          a.occurred_at.localeCompare(b.occurred_at) ||
          a.recorded_at.localeCompare(b.recorded_at) ||
          a.id.localeCompare(b.id),
      );
    // Association corrections explicitly apply from the reviewed work event date. Later
    // recording time does not turn today's occupancy/ownership into historical evidence.
    const associationAt = (date: string) => {
      const candidates = history
        .filter(
          (e) =>
            e.kind === "association" && e.association && e.association.eventDate <= date,
        )
        .map((e) => e.association!);
      const fallback = ticket.maintenance_association;
      if (fallback && fallback.eventDate <= date) candidates.push(fallback);
      return (
        candidates.sort(
          (a, b) => b.eventDate.localeCompare(a.eventDate) || b.version - a.version,
        )[0] ?? null
      );
    };
    const opened = dateOf(ticket.created_at),
      openedAssociation = associationAt(opened),
      endAssociation = associationAt(q.endDate);
    const scopedHistory = history.filter((e) => dateOf(e.occurred_at) <= q.endDate);
    const states = scopedHistory.filter((e) => !!e.state_snapshot?.stage);
    const lastState = states.at(-1),
      stage = lastState?.state_snapshot?.stage ?? "unknown";
    const completions = history.filter(
      (e) =>
        e.state_snapshot?.stage === "closed" &&
        (e.kind === "close" || e.kind === "lifecycle") &&
        period(dateOf(e.occurred_at), q) &&
        matches(associationAt(dateOf(e.occurred_at)) ?? e.association, q),
    );
    const financial = input.financial
      .filter(
        (f) =>
          f.ticket_id === ticket.id &&
          Date.parse(f.recorded_at) <= Date.parse(input.generatedAt) &&
          f.reviewState !== "void",
      )
      .filter((f) => {
        const date =
          q.financialDateBasis === "service"
            ? f.serviceDate
            : q.financialDateBasis === "invoice"
              ? f.invoiceDate
              : f.paymentDate;
        return (
          date !== null && period(date, q) && matches(associationAt(f.serviceDate), q)
        );
      });
    const openedInPeriod = period(opened, q) && matches(openedAssociation, q),
      completedInPeriod = completions.length > 0;
    const scopedAtEnd = matches(endAssociation, q) && opened <= q.endDate,
      openAtEnd = scopedAtEnd
        ? stage === "unknown"
          ? null
          : !["closed", "cancelled"].includes(stage)
        : false;
    if (!openedInPeriod && !completedInPeriod && !scopedAtEnd && !financial.length) {
      if (!endAssociation && opened <= q.endDate) excluded++;
      continue;
    }
    if (openAtEnd === null) unknown++;
    const association = endAssociation ?? openedAssociation;
    if (!association) throw Error("Scoped report identity is unresolved.");
    const assessments = scopedHistory.filter(
        (e) => e.kind === "assessment" && e.state_snapshot?.assessment,
      ),
      assessment = assessments.at(-1);
    const scope = assessment?.state_snapshot?.assessment?.scope ?? null;
    const documents = input.artifacts
      .filter(
        (a) =>
          a.ticket_id === ticket.id &&
          a.state === "retained" &&
          Date.parse(a.recorded_at) <= Date.parse(input.generatedAt),
      )
      .map((a) => ({
        id: a.id,
        filename: clean(a.filename, 128),
        mimeType: a.mimeType,
        sha256: a.sha256,
        sourceLabel: "PMI retained core document",
      }));
    const financialViews = financial.map((f) => ({
      id: f.id,
      version: f.version,
      kind: f.kind,
      label: financialEntryLabel(f),
      amountCents: f.amountCents,
      currency: f.currency,
      serviceDate: f.serviceDate,
      invoiceDate: f.invoiceDate,
      paymentDate: f.paymentDate,
      reviewState: f.reviewState,
      invoiceIdentity: f.externalIdentity ? clean(f.externalIdentity, 200) : null,
      vendorLabel: f.vendorId ? (vendorLabels.get(f.vendorId) ?? f.vendorId) : null,
      sourceLabel: financialEvidenceSourceLabel(f),
    }));
    allSelectedFinancial.push(...financial);
    const responsibilityDecision =
      ticket.responsibility_decision &&
      Date.parse(ticket.responsibility_decision.recordedAt) <=
        Date.parse(input.generatedAt)
        ? ticket.responsibility_decision
        : null;
    const currentPolicies =
        input.operatingPolicies?.heads
          .map((h) =>
            operatingHeadSelection(
              h,
              input.operatingPolicies!.versions,
              input.generatedAt,
            ),
          )
          .filter((p): p is OperatingPolicyVersion => p !== null) ?? [],
      responsibilityPolicy = selectOperatingPolicy(
        currentPolicies,
        "chargeback",
        ticket.maintenance_association?.propertyId ?? ticket.property_id ?? null,
        input.generatedAt,
      );
    const responsibility = responsibilityDecision
      ? {
          version: responsibilityDecision.version,
          state: responsibilityDecision.state,
          reviewAtExport: (!input.operatingPolicies ||
          !responsibilityDecision.contextSnapshot
            ? "policy_unverified"
            : JSON.stringify(responsibilityDecision.contextSnapshot) ===
                JSON.stringify(
                  maintenanceResponsibilityContext(ticket, responsibilityPolicy.policy),
                )
              ? "current"
              : "needs_review") as "current" | "needs_review" | "policy_unverified",
          policyId: responsibilityDecision.expectedPolicy.id,
          policyVersion: responsibilityDecision.expectedPolicy.version,
          proposedAmountCents: responsibilityDecision.proposedAmountCents,
          amountBasis: clean(responsibilityDecision.amountBasis),
          allocations: responsibilityDecision.allocations.map((a) => ({
            party: a.party,
            basisPoints: a.basisPoints,
          })),
          recordedAt: responsibilityDecision.recordedAt,
          meaning:
            "Staff-recorded responsibility/proposal; no ledger charge or verified payment" as const,
        }
      : null;
    jobs.push({
      ticketId: ticket.id,
      ticketVersion: ticket.record_version ?? 0,
      title: scope ? clean(scope, 240) : "Maintenance case — assessment pending",
      location: clean(
        association.unitLabel ??
          (ticket.maintenance_association?.version === association.version
            ? ticket.unit?.label
            : null) ??
          (association.unitId
            ? `Unit ${association.unitId} / Property ${association.propertyId}`
            : `Property ${association.propertyId ?? "unresolved"}`),
        500,
      ),
      trade: ticket.intake_issue_type ? clean(ticket.intake_issue_type, 160) : null,
      vendor:
        [
          ...new Set(
            financialViews.map((f) => f.vendorLabel).filter((v): v is string => !!v),
          ),
        ].join("; ") || null,
      association: {
        kind: association.kind,
        propertyId: association.propertyId,
        unitId: association.unitId,
        leaseId: association.leaseId,
        ownerRef: association.ownerRef ?? null,
        eventDate: association.eventDate,
        version: association.version,
        ownershipBasis: association.ownershipBasis ?? "not_established",
        sourceHash: association.sourceHash,
      },
      openedDate: opened,
      openedInPeriod,
      completedDates: [...new Set(completions.map((e) => dateOf(e.occurred_at)))],
      completedInPeriod,
      openAsOfEnd: openAtEnd,
      stageAsOfEnd: stage,
      assessmentDate: assessment ? dateOf(assessment.occurred_at) : null,
      workDates: [
        ...new Set(
          scopedHistory
            .filter((e) => e.state_snapshot?.stage === "in_progress")
            .map((e) => dateOf(e.occurred_at)),
        ),
      ],
      reviewedScope: scope ? clean(scope) : null,
      responsibility,
      financial: financialViews,
      totals: financialProjection(financial),
      documents,
      chronology: scopedHistory
        .filter((e) => sourceLabels[e.kind] && period(dateOf(e.occurred_at), q))
        .map((e) => ({
          id: e.id,
          date: dateOf(e.occurred_at),
          label: sourceLabels[e.kind],
          sourceLabel:
            e.actor_kind === "provider_observation"
              ? "Provider observation"
              : e.actor_kind === "vendor"
                ? "Assigned vendor contribution"
                : "PMI staff record",
        })),
      sourceVersions: [
        {
          collection: "maintenance_tickets",
          id: ticket.id,
          version: ticket.record_version ?? 0,
        },
        ...scopedHistory.map((e) => ({
          collection: "maintenance_case_events",
          id: e.id,
          version: e.ticket_version,
        })),
        ...financial.map((f) => ({
          collection: "maintenance_financial_entries",
          id: f.id,
          version: f.version,
        })),
        ...documents.map((d) => ({
          collection: "maintenance_retained_artifacts",
          id: d.id,
          version: d.sha256,
        })),
      ],
    });
  }
  if (jobs.length > 500)
    throw Error(
      "This report exceeds 500 cases. Choose a narrower scope or period; no rows were omitted.",
    );
  jobs.sort(
    (a, b) =>
      a.openedDate.localeCompare(b.openedDate) || a.ticketId.localeCompare(b.ticketId),
  );
  const months: string[] = [];
  let month = q.startDate.slice(0, 7);
  while (month <= q.endDate.slice(0, 7)) {
    months.push(month);
    const [y, m] = month.split("-").map(Number);
    month = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  }
  const trends = months.map((month) => {
    const entries = allSelectedFinancial.filter((f) =>
      (q.financialDateBasis === "service"
        ? f.serviceDate
        : q.financialDateBasis === "invoice"
          ? f.invoiceDate
          : f.paymentDate
      )?.startsWith(month),
    );
    const totals = financialProjection(entries);
    return {
      month,
      opened: jobs.filter((j) => j.openedInPeriod && j.openedDate.startsWith(month))
        .length,
      completed: jobs.filter((j) => j.completedDates.some((d) => d.startsWith(month)))
        .length,
      financialCount: entries.length,
      invoicedCents: totals.invoicedCents,
      ownerChargeCents: totals.ownerChargeCents,
      verifiedPaidCents: totals.verifiedPaidCents,
    };
  });
  const startDate = starts[0] ?? null;
  return {
    schemaVersion: 1,
    request: q,
    generatedAt: input.generatedAt,
    timeZone: BUSINESS_TIME_ZONE,
    scopeLabel: `${q.scopeKind[0].toUpperCase() + q.scopeKind.slice(1)} ${q.scopeId}`,
    coverage: {
      startDate,
      incomplete:
        !startDate ||
        q.startDate < startDate ||
        live.some((t) => t.lifecycle_origin !== "native"),
      excludedUnattributedCases: excluded,
      unknownEndStateCases: unknown,
      notes: [
        "Prospective retained application history only. No historical backfill was performed.",
        "Event-date tenancy and ownership are staff-reviewed associations, not inferred from current occupancy.",
        "Unrecorded or unavailable payments remain unknown. Invoice evidence does not establish payment.",
        ...(excluded
          ? [
              `${excluded} cases have no reviewed event-date association and are excluded from scoped totals.`,
            ]
          : []),
        ...(unknown
          ? [`${unknown} scoped cases have no observed stage as of the period end.`]
          : []),
      ],
    },
    definitions: {
      opened:
        "Distinct scoped cases created during the period, using their reviewed association for the opening date.",
      completed:
        "Distinct scoped cases with a retained PMI final-closure event during the period. Cancellation and vendor completion requests are excluded.",
      openAtEnd:
        "Scoped cases created by period end whose latest retained stage as of that business date is neither closed nor cancelled. Unknown stages are separately disclosed.",
      financial: `Current recorded financial entries selected by their ${q.financialDateBasis} date; service-date association establishes scope. Credits and each cost/payment category remain separate.`,
      history:
        "Facts retained and known at generation time, with event-date applicability. A correction creates a new report snapshot.",
    },
    counts: {
      opened: jobs.filter((j) => j.openedInPeriod).length,
      completed: jobs.filter((j) => j.completedInPeriod).length,
      openAsOfEnd: jobs.filter((j) => j.openAsOfEnd === true).length,
    },
    totals: financialProjection(allSelectedFinancial),
    jobs,
    trends,
  };
}
export const reportMoney = (cents: number | null, currency = "USD") =>
  cents === null
    ? "Unknown"
    : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
export function maintenanceReportCsv(report: MaintenanceReport) {
  const cell = (value: unknown) => {
    let s = value === null || value === undefined ? "" : String(value);
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const rows: unknown[][] = [
    ["Maintenance history", report.scopeLabel],
    ["Period", report.request.startDate, report.request.endDate],
    ["Timezone", report.timeZone],
    ["Generated", report.generatedAt],
    ["History coverage starts", report.coverage.startDate ?? "Unknown"],
    ["Coverage incomplete", report.coverage.incomplete],
    ["Financial date basis", report.request.financialDateBasis],
    ["Opened definition", report.definitions.opened],
    ["Completed definition", report.definitions.completed],
    ["Open-as-of-end definition", report.definitions.openAtEnd],
    ["Financial definition", report.definitions.financial],
    ...report.coverage.notes.map((n) => ["Coverage note", n]),
    [
      "Counts",
      "Opened",
      report.counts.opened,
      "Completed",
      report.counts.completed,
      "Open as of end",
      report.counts.openAsOfEnd,
    ],
    [],
    [
      "Case ID",
      "Case version",
      "Location",
      "Reviewed scope",
      "Property ID",
      "Unit ID",
      "Lease ID",
      "Owner contact ID",
      "Association date",
      "Opened date",
      "Opened in period",
      "Completed in period",
      "Open as of end",
      "Stage as of end",
      "Entry ID",
      "Entry version",
      "Category",
      "Amount cents",
      "Currency",
      "Service date",
      "Invoice date",
      "Payment date",
      "Review state",
      "Invoice identity",
      "Vendor",
      "Source label",
      "Retained documents",
      "Responsibility version",
      "Responsibility state",
      "Responsibility review at export",
      "Proposed responsibility amount cents",
      "Responsibility policy/version",
    ],
  ];
  for (const j of report.jobs)
    for (const f of j.financial.length ? j.financial : [null])
      rows.push([
        j.ticketId,
        j.ticketVersion,
        j.location,
        j.reviewedScope ?? "Assessment pending",
        j.association.propertyId,
        j.association.unitId,
        j.association.leaseId,
        j.association.ownerRef,
        j.association.eventDate,
        j.openedDate,
        j.openedInPeriod,
        j.completedInPeriod,
        j.openAsOfEnd ?? "Unknown",
        j.stageAsOfEnd,
        f?.id,
        f?.version,
        f?.kind,
        f?.amountCents,
        f?.currency,
        f?.serviceDate,
        f?.invoiceDate,
        f?.paymentDate,
        f?.reviewState,
        f?.invoiceIdentity,
        f?.vendorLabel,
        f?.sourceLabel,
        j.documents.map((d) => `${d.id}: ${d.filename} [${d.sha256}]`).join("; "),
        j.responsibility?.version,
        j.responsibility?.state,
        j.responsibility?.reviewAtExport,
        j.responsibility?.proposedAmountCents,
        j.responsibility
          ? `${j.responsibility.policyId ?? "unset"} v${j.responsibility.policyVersion ?? "unset"}`
          : "",
      ]);
  rows.push(
    [],
    [
      "Category totals (USD cents)",
      ...Object.keys(report.totals).filter((k) => k.endsWith("Cents")),
    ],
    [
      "Total",
      ...Object.entries(report.totals)
        .filter(([k]) => k.endsWith("Cents"))
        .map(([, v]) => v ?? "Unknown"),
    ],
  );
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export interface SavedMaintenanceReportView {
  id: string;
  state: "preparing" | "saved" | "cancelled";
  report: MaintenanceReport | null;
  snapshotHash: string | null;
  pdfHash: string | null;
  csvHash: string | null;
  createdAt: string;
  retentionClass: "indefinite";
  legalHold: boolean;
}
