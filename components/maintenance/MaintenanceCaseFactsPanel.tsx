"use client";
import { UserActionError, actionFailureMessage } from "@/lib/ui/action-feedback";
import { maintenanceLocalTimeInput as localInput } from "@/lib/maintenance/local-time-input";
import { useEffect, useRef, useState } from "react";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import {
  FINANCIAL_KINDS,
  FINANCIAL_KIND_LABELS,
  financialEntryLabel,
  financialEvidenceSourceLabel,
  FinancialEntryInputSchema,
  CaseAssociationInputSchema,
  type FinancialEntry,
  type FinancialEntryInput,
  type CaseAssociationInput,
  type MaintenanceArtifactView,
  type MaintenanceCaseEvent,
  financialProjection,
} from "@/lib/maintenance/case-model";
import { formatBusinessTimestamp } from "@/lib/date-display";
import {
  businessDateIso,
  BUSINESS_TIME_ZONE,
} from "@/lib/lease-renewal/business-calendar";
import { resolveWallTime } from "@/lib/gmail-hub/schedule-calendar";
interface HistoryView {
  ticket: MaintenanceTicketRecord;
  coverage: { startedAt: string | null; origin: string; historicalBackfill: false };
  events: MaintenanceCaseEvent[];
  nextCursor: string | null;
  financial: FinancialEntry[];
  totals: ReturnType<typeof financialProjection>;
  artifacts: MaintenanceArtifactView[];
}
const money = (value: number | null) =>
  value === null
    ? "Not recorded"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
        value / 100,
      );
function cents(value: string) {
  if (!/^-?\d{1,8}(?:\.\d{1,2})?$/.test(value.trim()))
    throw new UserActionError("Enter an exact amount with at most two decimal places.");
  const negative = value.startsWith("-"),
    [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  return (Number(whole) * 100 + Number(fraction.padEnd(2, "0"))) * (negative ? -1 : 1);
}
const blankFinance = () => ({
  id: "",
  expectedEntryVersion: 0,
  kind: "vendor_invoice" as FinancialEntryInput["kind"],
  amount: "",
  serviceDate: "",
  invoiceDate: "",
  paymentDate: "",
  vendorId: "",
  sourceRef: "",
  externalIdentity: "",
  sourceTotal: "",
  lines: [{ description: "", amount: "" }],
  reviewState: "reported" as FinancialEntryInput["reviewState"],
  reason: "",
});
export function MaintenanceCaseFactsPanel({
  ticket,
  canEdit,
  blocked,
  onApply,
  pendingCommand,
  onReadCurrent,
}: {
  ticket: MaintenanceTicketRecord;
  canEdit: boolean;
  blocked: boolean;
  onApply: (command: Record<string, unknown>) => Promise<boolean>;
  pendingCommand?: Record<string, unknown>;
  onReadCurrent: () => Promise<void>;
}) {
  const [vendorChoices, setVendorChoices] = useState<
    Array<{ id: string; displayName: string | null; email: string; status: string }>
  >([]);
  const [open, setOpen] = useState(false),
    [view, setView] = useState<HistoryView | null>(null),
    [status, setStatus] = useState(""),
    [reading, setReading] = useState(false),
    [finance, setFinance] = useState(blankFinance),
    [association, setAssociation] = useState<CaseAssociationInput>(() => ({
      kind:
        ticket.maintenance_association?.kind ??
        (ticket.property_id && ticket.unit ? "unit" : "unresolved"),
      propertyId:
        ticket.maintenance_association?.propertyId ??
        (ticket.unit ? (ticket.property_id ?? null) : null),
      unitId:
        ticket.maintenance_association?.unitId ??
        ticket.unit?.unitId.replace(/^unit:/, "") ??
        null,
      leaseId: ticket.maintenance_association?.leaseId ?? null,
      ownerRef: ticket.maintenance_association?.ownerRef ?? null,
      eventDate:
        ticket.maintenance_association?.eventDate ?? businessDateIso(ticket.created_at),
      evidenceRef: "",
      reason: "",
    })),
    [summary, setSummary] = useState(""),
    [summaryEvidence, setSummaryEvidence] = useState(""),
    [occurrence, setOccurrence] = useState(""),
    [originalOccurrence, setOriginalOccurrence] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [filePurpose, setFilePurpose] = useState<
      "invoice" | "quote" | "work_photo" | "reviewed_report"
    >("invoice"),
    [fileAck, setFileAck] = useState(false),
    [fileBusy, setFileBusy] = useState(false),
    [fileIntent, setFileIntent] = useState<string | null>(null),
    [fileStatus, setFileStatus] = useState("");
  const generation = useRef(0),
    mounted = useRef(true),
    running = useRef(false);
  const base = `/api/maintenance/tickets/${encodeURIComponent(ticket.id)}`,
    prefix = `case-${ticket.id}`;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const g = ++generation.current,
      controller = new AbortController();
    void fetch(`${base}/history`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new UserActionError(
            result.error ?? "The complete case history is unavailable.",
          );
        if (mounted.current && g === generation.current) {
          setView(result);
          setStatus("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && mounted.current && g === generation.current)
          setStatus(
            actionFailureMessage(
              error,
              "Case history is unavailable. No empty history or totals were inferred.",
            ),
          );
      });
    return () => controller.abort();
  }, [open, base, ticket.record_version]);
  useEffect(() => {
    if (!pendingCommand) return;
    queueMicrotask(() => {
      if (pendingCommand.op === "association") {
        const parsed = CaseAssociationInputSchema.safeParse(pendingCommand.association);
        if (parsed.success) {
          setAssociation(parsed.data);
          setOpen(true);
        }
      } else if (pendingCommand.op === "financial") {
        const parsed = FinancialEntryInputSchema.safeParse(pendingCommand.entry);
        if (parsed.success) {
          loadFinancial(parsed.data, parsed.data.expectedEntryVersion, true);
          setOpen(true);
        }
      } else if (pendingCommand.op === "reviewed_summary") {
        setSummary(String(pendingCommand.summary ?? ""));
        setSummaryEvidence(((pendingCommand.evidenceRefs as string[]) ?? []).join("\n"));
        const at = String(pendingCommand.occurredAt ?? "");
        setOccurrence(localInput(at));
        setOriginalOccurrence(at);
        setReviewed(true);
        setOpen(true);
      }
    });
  }, [pendingCommand]);
  useEffect(() => {
    queueMicrotask(() => {
      const url = new URL(location.href);
      if (url.searchParams.get("ticket_id") === ticket.id) {
        const id = url.searchParams.get("maintenance_artifact");
        if (id && /^[0-9a-f-]{36}$/i.test(id)) {
          setFileIntent(id);
          setOpen(true);
          setFileStatus(
            "Check the original retained file before uploading another copy. No upload is being repeated.",
          );
        }
      }
    });
  }, [ticket.id]);
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    void fetch("/api/maintenance/vendors", { cache: "no-store", signal: c.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok)
          throw new UserActionError(
            body.error ?? "Actual vendor choices are unavailable.",
          );
        if (!c.signal.aborted) setVendorChoices(body.vendors);
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setStatus(
            actionFailureMessage(
              e,
              "Actual vendor choices are unavailable; keep recorded evidence and retry the current read.",
            ),
          );
      });
    return () => c.abort();
  }, [open]);
  function loadFinancial(
    entry: FinancialEntryInput | FinancialEntry,
    version: number,
    restore = false,
  ) {
    setFinance({
      id: entry.id,
      expectedEntryVersion: version,
      kind: entry.kind === "payment_observation" ? "payment_claim" : entry.kind,
      amount: String(entry.amountCents / 100),
      serviceDate: entry.serviceDate,
      invoiceDate: entry.invoiceDate ?? "",
      paymentDate: entry.paymentDate ?? "",
      vendorId: entry.vendorId ?? "",
      sourceRef: entry.sourceRef,
      externalIdentity: entry.externalIdentity ?? "",
      sourceTotal:
        entry.sourceTotalCents === null ? "" : String(entry.sourceTotalCents / 100),
      lines: entry.sourceLines.map((l) => ({
        description: l.description,
        amount: String(l.amountCents / 100),
      })),
      reviewState: entry.reviewState,
      reason: restore ? entry.correctionReason : "",
    });
  }
  async function more() {
    if (!view?.nextCursor || reading) return;
    setReading(true);
    const cursor = view.nextCursor,
      g = ++generation.current;
    try {
      const response = await fetch(
          `${base}/history?${new URLSearchParams({ after: cursor })}`,
          { cache: "no-store" },
        ),
        result = await response.json();
      if (!response.ok)
        throw new UserActionError(result.error ?? "Earlier history is unavailable.");
      if (g !== generation.current || !mounted.current) return;
      setView((old) =>
        old
          ? {
              ...result,
              events: [
                ...new Map(
                  [...old.events, ...result.events].map((e) => [e.id, e]),
                ).values(),
              ],
            }
          : result,
      );
    } catch (error) {
      setStatus(
        actionFailureMessage(
          error,
          "History remains incomplete; no events were replaced.",
        ),
      );
    } finally {
      setReading(false);
    }
  }
  async function saveFinancial() {
    try {
      const entry = FinancialEntryInputSchema.parse({
        id: finance.id || crypto.randomUUID(),
        expectedEntryVersion: finance.expectedEntryVersion,
        kind: finance.kind,
        amountCents: cents(finance.amount),
        currency: "USD",
        serviceDate: finance.serviceDate,
        invoiceDate: finance.invoiceDate || null,
        paymentDate: finance.paymentDate || null,
        vendorId: finance.vendorId.trim() || null,
        sourceRef: finance.sourceRef,
        externalIdentity: finance.externalIdentity.trim() || null,
        sourceTotalCents: finance.sourceTotal ? cents(finance.sourceTotal) : null,
        sourceLines: finance.lines
          .filter((l) => l.description || l.amount)
          .map((l) => ({ description: l.description, amountCents: cents(l.amount) })),
        reviewState: finance.reviewState,
        correctionReason: finance.reason,
      });
      setFinance((old) => ({ ...old, id: entry.id }));
      if (await onApply({ op: "financial", entry })) setFinance(blankFinance());
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Review the actual financial values.",
      );
    }
  }
  async function saveSummary() {
    try {
      let occurredAt = new Date().toISOString();
      if (originalOccurrence && occurrence === localInput(originalOccurrence))
        occurredAt = originalOccurrence;
      else if (occurrence) {
        const [date, time] = occurrence.split("T"),
          resolved = resolveWallTime(date, time, BUSINESS_TIME_ZONE);
        if (resolved.adjustment !== "none")
          throw new UserActionError(
            "This local occurrence time is repeated or skipped by daylight saving. Record an unambiguous time from the actual evidence.",
          );
        occurredAt = new Date(resolved.instantMs).toISOString();
      }
      if (
        await onApply({
          op: "reviewed_summary",
          summary,
          occurredAt,
          evidenceRefs: summaryEvidence
            .split("\n")
            .map((v) => v.trim())
            .filter(Boolean),
          reviewedFactualSummary: reviewed,
          rawSources: [],
        })
      ) {
        setSummary("");
        setSummaryEvidence("");
        setReviewed(false);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Review the factual summary.");
    }
  }
  async function upload(resume = false) {
    if (!file || !fileAck || (!resume && fileIntent) || running.current || blocked)
      return;
    running.current = true;
    setFileBusy(true);
    const id = resume ? fileIntent! : crypto.randomUUID();
    let dispatched = false;
    setFileIntent(id);
    const url = new URL(location.href);
    url.searchParams.set("ticket_id", ticket.id);
    url.searchParams.set("maintenance_artifact", id);
    history.replaceState(null, "", url);
    setFileStatus("Retaining exact file bytes and checking their saved hash…");
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new UserActionError("Select a file no larger than 5 MiB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let expectedVersion = ticket.record_version ?? 0,
        purpose = filePurpose;
      if (resume) {
        const metadata = await fetch(
            `${base}/artifacts?${new URLSearchParams({ artifact_id: id })}`,
            { cache: "no-store" },
          ),
          result = await metadata.json();
        if (!metadata.ok)
          throw new UserActionError(
            result.error ?? "The original file identity is unavailable.",
          );
        const digest = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        )
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("");
        if (
          result.artifact.sha256 !== digest ||
          result.artifact.filename !== file.name ||
          result.artifact.mimeType !== file.type
        )
          throw new UserActionError(
            "Reselect the exact original file; its saved hash, name and type must match.",
          );
        expectedVersion = result.artifact.reviewed_ticket_version;
        purpose = result.artifact.purpose;
      }
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      dispatched = true;
      const response = await fetch(`${base}/artifacts`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "upload",
            operationId: id,
            expectedVersion,
            filename: file.name,
            mimeType: file.type,
            purpose,
            approvedForIndefiniteRetention: true,
            containsRawCommunications: false,
            base64: btoa(binary),
          }),
        }),
        body = await response.json();
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && response.status !== 409) {
          clearFileIntent();
        }
        throw new UserActionError(
          body.error ?? "The retained-file outcome is unresolved.",
        );
      }
      if (body.artifact.state === "retained") {
        clearFileIntent();
        setFile(null);
        setFileAck(false);
        setFileStatus("Original bytes retained and read back.");
        await onReadCurrent().catch(() =>
          setFileStatus(
            "Original retained file verified. The current case could not refresh; read current work before another edit.",
          ),
        );
      } else
        setFileStatus(
          "Exact bytes are saved; the case changed during upload. Read current work and deliberately review attaching this original file.",
        );
      setOpen(false);
    } catch (error) {
      if (!dispatched && !resume) clearFileIntent();
      setFileStatus(
        actionFailureMessage(
          error,
          "Check this original file before uploading another copy.",
        ),
      );
    } finally {
      running.current = false;
      setFileBusy(false);
    }
  }
  function clearFileIntent() {
    setFileIntent(null);
    const url = new URL(location.href);
    url.searchParams.delete("maintenance_artifact");
    history.replaceState(null, "", url);
  }
  async function checkFile(attach = false) {
    if (!fileIntent || running.current) return;
    running.current = true;
    setFileBusy(true);
    try {
      const response = await fetch(`${base}/artifacts`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "reconcile",
            artifactId: fileIntent,
            expectedVersion: ticket.record_version ?? 0,
            reviewCurrentCase: attach,
          }),
        }),
        body = await response.json();
      if (!response.ok)
        throw new UserActionError(body.error ?? "Original file is unresolved.");
      if (body.artifact.state === "retained") {
        clearFileIntent();
        setFileStatus(
          "Original retained file verified; no duplicate upload was created.",
        );
        await onReadCurrent().catch(() =>
          setFileStatus(
            "Original retained file verified. The current case could not refresh; read current work before another edit.",
          ),
        );
        setOpen(false);
      } else {
        setFileStatus(
          "Original bytes verified; the case needs current review before attaching this exact file.",
        );
        setFileIntent(body.artifact.id);
      }
    } catch (error) {
      setFileStatus(
        actionFailureMessage(
          error,
          "The original file remains unresolved; no new copy was uploaded.",
        ),
      );
    } finally {
      running.current = false;
      setFileBusy(false);
    }
  }
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="maintenance-case-facts"
    >
      <summary>Case history, retained evidence and costs</summary>
      <p className="muted">
        Prospective core history is retained indefinitely. Previous transactions are not
        backfilled. Raw conversations have their separate retention period.
      </p>
      {status ? <p role="status">{status}</p> : null}
      {view ? (
        <>
          <p>
            Coverage:{" "}
            {view.coverage.startedAt
              ? formatBusinessTimestamp(view.coverage.startedAt)
              : "Starting state not yet recorded"}{" "}
            ·{" "}
            {view.coverage.origin === "legacy_starting_state"
              ? "Existing case: recorded starting state and subsequent work"
              : "Native case"}
            .
          </p>
          <p>
            Association:{" "}
            {view.ticket.maintenance_association?.kind ?? "Unresolved event-date lease"} ·
            Property{" "}
            {view.ticket.maintenance_association?.propertyId ??
              view.ticket.property_id ??
              "unverified"}{" "}
            · Unit{" "}
            {view.ticket.maintenance_association?.unitId ??
              view.ticket.unit?.unitId ??
              "none"}{" "}
            · Lease {view.ticket.maintenance_association?.leaseId ?? "not established"}.
            Owner{" "}
            {view.ticket.maintenance_association?.ownerLabel ??
              view.ticket.maintenance_association?.ownerRef ??
              "not established"}
            .{" "}
            {view.ticket.maintenance_association?.kind === "lease"
              ? "Event-date applicability recorded by staff from retained evidence; current occupancy is not historical proof."
              : ""}
          </p>
          <dl className="ui-rows" aria-label="Distinct maintenance financial totals">
            {(
              [
                ["Proposed estimate", view.totals.estimateCents],
                ["Quote", view.totals.quotedCents],
                ["Vendor invoices", view.totals.invoicedCents],
                ["Vendor credits", view.totals.creditsCents],
                ["Reviewed vendor cost", view.totals.reviewedVendorCostCents],
                ["PMI markup", view.totals.markupCents],
                ["PMI adjustment", view.totals.adjustmentCents],
                ["Reviewed owner charge", view.totals.ownerChargeCents],
                ["Staff payment claims", view.totals.claimedPaidCents],
                ["Provider-verified payment", view.totals.verifiedPaidCents],
                ["Balance against verified payment", view.totals.balanceCents],
              ] as const
            ).map(([label, value]) => (
              <div className="ui-spread" key={label}>
                <dt>{label}</dt>
                <dd>{money(value)}</dd>
              </div>
            ))}
          </dl>
          <p>
            Payment: {view.totals.paymentState}. Recording an invoice, approval or claim
            does not post accounting or pay anyone.
          </p>
          <ul className="ui-rows">
            {view.financial.map((entry) => (
              <li key={entry.id}>
                <strong>
                  {financialEntryLabel(entry)}: {money(entry.amountCents)}
                </strong>{" "}
                · {entry.reviewState} · version {entry.version}
                <p>
                  Service {entry.serviceDate}; invoice {entry.invoiceDate ?? "unknown"};
                  payment {entry.paymentDate ?? "unknown"}. Source: {entry.sourceRef}.{" "}
                  {entry.sourceTotalCents !== null
                    ? `Allocation of original ${money(entry.sourceTotalCents)}.`
                    : ""}
                </p>
                {entry.kind === "payment_observation" ? (
                  <p>{financialEvidenceSourceLabel(entry)}</p>
                ) : null}
                {canEdit && entry.kind !== "payment_observation" ? (
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => loadFinancial(entry, entry.version)}
                  >
                    Correct {FINANCIAL_KIND_LABELS[entry.kind]}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <h4>Retained files</h4>
          <ul className="ui-rows">
            {view.artifacts.map((a) => (
              <li key={a.id}>
                {a.filename} · {a.purpose} · {a.state} · {a.sizeBytes} bytes ·{" "}
                <code>{a.sha256}</code>
                {a.state === "retained" ? (
                  <a
                    href={`${base}/artifacts?${new URLSearchParams({ artifact_id: a.id, download: "1" })}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Download exact retained file
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          <h4>Durable timeline</h4>
          <ol>
            {view.events.map((event) => (
              <li key={event.id}>
                <strong>{event.kind}</strong> · {event.actor_kind}: {event.actor_id}
                <p>{event.summary}</p>
                <p>
                  Occurred{" "}
                  {event.occurrence_precision === "date"
                    ? event.occurred_at
                    : formatBusinessTimestamp(event.occurred_at)}
                  ; recorded {formatBusinessTimestamp(event.recorded_at)} · case version{" "}
                  {event.ticket_version}
                </p>
                <p>Evidence: {event.evidence_refs.join("; ")}</p>
                {event.raw_sources?.map((raw, i) => (
                  <p key={i}>
                    Raw {raw.kind}:{" "}
                    {"availability" in raw
                      ? String(raw.availability)
                      : "current access required"}
                    ; expires {formatBusinessTimestamp(raw.expiresAt)}.
                  </p>
                ))}
              </li>
            ))}
          </ol>
          {view.nextCursor ? (
            <button type="button" onClick={() => void more()} disabled={reading}>
              Load more durable history
            </button>
          ) : null}
        </>
      ) : (
        <p className="muted">
          Open this section to read saved case history. Missing source evidence stays
          unresolved.
        </p>
      )}
      {canEdit ? (
        <fieldset disabled={blocked || fileBusy}>
          <details>
            <summary>Correct property, unit or event-date lease</summary>
            <label className="field">
              Work association
              <select
                value={association.kind}
                onChange={(e) =>
                  setAssociation((a) => ({
                    ...a,
                    kind: e.target.value as CaseAssociationInput["kind"],
                    propertyId: e.target.value === "unresolved" ? null : a.propertyId,
                    ownerRef: e.target.value === "unresolved" ? null : a.ownerRef,
                    leaseId: e.target.value === "lease" ? a.leaseId : null,
                    unitId: ["property_level", "unresolved"].includes(e.target.value)
                      ? null
                      : a.unitId,
                  }))
                }
              >
                {["unresolved", "property_level", "unit", "vacant", "lease"].map((v) => (
                  <option key={v} value={v}>
                    {v.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            {(["propertyId", "unitId", "leaseId", "ownerRef"] as const).map((key) => (
              <label className="field" key={key}>
                {key === "propertyId"
                  ? "Actual property ID"
                  : key === "unitId"
                    ? "Actual unit ID"
                    : key === "leaseId"
                      ? "Actual event-date lease ID"
                      : "Actual event-date owner contact ID (optional)"}
                <input
                  value={association[key] ?? ""}
                  onChange={(e) =>
                    setAssociation((a) => ({
                      ...a,
                      [key]: e.target.value.trim() || null,
                    }))
                  }
                />
              </label>
            ))}
            <label className="field">
              Work event date
              <input
                type="date"
                value={association.eventDate}
                onChange={(e) =>
                  setAssociation((a) => ({ ...a, eventDate: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Retained identity and tenancy evidence reference (include event-date
              ownership when supplied)
              <input
                value={association.evidenceRef}
                onChange={(e) =>
                  setAssociation((a) => ({ ...a, evidenceRef: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Correction reason
              <textarea
                value={association.reason}
                onChange={(e) =>
                  setAssociation((a) => ({ ...a, reason: e.target.value }))
                }
              />
            </label>
            <button
              type="button"
              onClick={() => {
                const parsed = CaseAssociationInputSchema.safeParse(association);
                if (!parsed.success) {
                  setStatus(
                    "Complete the actual association, event date, evidence and reason.",
                  );
                  return;
                }
                void onApply({ op: "association", association: parsed.data });
              }}
            >
              Save association
            </button>
          </details>
          <details>
            <summary>Record or correct financial evidence</summary>
            <p>
              Enter actual USD amounts. Missing values stay unknown. Include tax as
              original invoice lines; markup and owner charges are separately reviewed
              records.
            </p>
            <label className="field">
              Financial meaning
              <select
                value={finance.kind}
                onChange={(e) =>
                  setFinance((f) => ({
                    ...f,
                    kind: e.target.value as FinancialEntryInput["kind"],
                    reviewState: [
                      "reviewed_vendor_cost",
                      "pmi_markup",
                      "pmi_adjustment",
                      "owner_charge",
                    ].includes(e.target.value)
                      ? "reviewed"
                      : f.reviewState,
                  }))
                }
              >
                {FINANCIAL_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {FINANCIAL_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ["amount", "Amount allocated to this case (USD)"],
                ["externalIdentity", "Original invoice, credit or quote ID"],
                ["sourceRef", "Retained source evidence reference"],
                ["sourceTotal", "Original complete source total (USD)"],
              ] as const
            ).map(([key, label]) => (
              <label className="field" key={key}>
                {label}
                <input
                  value={finance[key]}
                  onChange={(e) => setFinance((f) => ({ ...f, [key]: e.target.value }))}
                />
              </label>
            ))}
            {(
              [
                ["serviceDate", "Service date"],
                ["invoiceDate", "Invoice date (if known)"],
                ["paymentDate", "Claimed payment date (if applicable)"],
              ] as const
            ).map(([key, label]) => (
              <label className="field" key={key}>
                {label}
                <input
                  type="date"
                  value={finance[key]}
                  onChange={(e) => setFinance((f) => ({ ...f, [key]: e.target.value }))}
                />
              </label>
            ))}
            <label className="field">
              Actual vendor identity (when applicable)
              <select
                value={finance.vendorId}
                onChange={(e) => setFinance((f) => ({ ...f, vendorId: e.target.value }))}
              >
                <option value="">No vendor for this kind of entry</option>
                {vendorChoices.map((v) => (
                  <option value={v.id} key={v.id}>
                    {v.displayName ?? v.email} · {v.status}
                  </option>
                ))}
                {finance.vendorId &&
                !vendorChoices.some((v) => v.id === finance.vendorId) ? (
                  <option value={finance.vendorId}>
                    Original recorded vendor; current identity unavailable
                  </option>
                ) : null}
              </select>
            </label>
            <h5>Complete original source lines</h5>
            {finance.lines.map((line, index) => (
              <div className="ui-stack-tight" key={index}>
                <label className="field">
                  Line {index + 1} description
                  <input
                    value={line.description}
                    onChange={(e) =>
                      setFinance((f) => ({
                        ...f,
                        lines: f.lines.map((l, i) =>
                          i === index ? { ...l, description: e.target.value } : l,
                        ),
                      }))
                    }
                  />
                </label>
                <label className="field">
                  Line {index + 1} amount (USD)
                  <input
                    value={line.amount}
                    onChange={(e) =>
                      setFinance((f) => ({
                        ...f,
                        lines: f.lines.map((l, i) =>
                          i === index ? { ...l, amount: e.target.value } : l,
                        ),
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setFinance((f) => ({
                      ...f,
                      lines: f.lines.filter((_, i) => i !== index),
                    }))
                  }
                >
                  Remove line {index + 1}
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={finance.lines.length >= 100}
              onClick={() =>
                setFinance((f) => ({
                  ...f,
                  lines: [...f.lines, { description: "", amount: "" }],
                }))
              }
            >
              Add source line
            </button>
            <label className="field">
              Review state
              <select
                value={finance.reviewState}
                onChange={(e) =>
                  setFinance((f) => ({
                    ...f,
                    reviewState: e.target.value as FinancialEntryInput["reviewState"],
                  }))
                }
              >
                <option value="reported">Reported; not yet reviewed</option>
                <option value="reviewed">Reviewed against source and work</option>
                <option value="void">
                  Void this entry, retaining its original history
                </option>
              </select>
            </label>
            <label className="field">
              Review or correction reason
              <textarea
                value={finance.reason}
                onChange={(e) => setFinance((f) => ({ ...f, reason: e.target.value }))}
              />
            </label>
            <button type="button" onClick={() => void saveFinancial()}>
              Save financial evidence
            </button>
            {finance.id ? (
              <button type="button" onClick={() => setFinance(blankFinance())}>
                Start a separate financial entry
              </button>
            ) : null}
          </details>
          <details>
            <summary>Retain a reviewed factual summary</summary>
            <label className="field">
              Reviewed operational facts
              <textarea
                value={summary}
                maxLength={4000}
                onChange={(e) => setSummary(e.target.value)}
              />
            </label>
            <label className="field">
              Evidence references (one per line)
              <textarea
                value={summaryEvidence}
                onChange={(e) => setSummaryEvidence(e.target.value)}
              />
            </label>
            <label className="field">
              Occurrence time, {BUSINESS_TIME_ZONE} (optional; blank records this review
              time)
              <input
                type="datetime-local"
                value={occurrence}
                onChange={(e) => setOccurrence(e.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              I reviewed these factual notes; they do not copy a raw message, transcript
              or recording.
            </label>
            <button type="button" disabled={!reviewed} onClick={() => void saveSummary()}>
              Save reviewed facts
            </button>
          </details>
          <details>
            <summary>Retain an approved core file</summary>
            <label className="field">
              Core evidence purpose
              <select
                value={filePurpose}
                onChange={(e) => setFilePurpose(e.target.value as typeof filePurpose)}
              >
                <option value="invoice">Invoice</option>
                <option value="quote">Quote</option>
                <option value="work_photo">Work photo</option>
                <option value="reviewed_report">Reviewed report</option>
              </select>
            </label>
            <label className="field">
              Actual PDF or work image
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setFileAck(false);
                }}
              />
            </label>
            {file ? (
              <p>
                {file.name} · {file.type || "Type unavailable"} · {file.size} bytes ·
                target: this case&apos;s indefinite core evidence
              </p>
            ) : null}
            <label>
              <input
                type="checkbox"
                checked={fileAck}
                onChange={(e) => setFileAck(e.target.checked)}
              />
              I approve indefinite retention of this core evidence. It contains no raw
              conversation, recording or transcript.
            </label>
            <button
              type="button"
              disabled={!file || !fileAck || !!fileIntent}
              onClick={() => void upload()}
            >
              Retain exact file
            </button>
          </details>
        </fieldset>
      ) : null}
      {fileStatus ? <p role="status">{fileStatus}</p> : null}
      {fileIntent && canEdit ? (
        <div className="ui-stack-tight">
          <p>
            Original retained-file intent: <code>{fileIntent}</code>
          </p>
          <button
            type="button"
            disabled={!file || !fileAck || fileBusy || blocked}
            onClick={() => void upload(true)}
          >
            Resume exact original file
          </button>
          <button type="button" disabled={fileBusy} onClick={() => void checkFile()}>
            Check original retained file
          </button>
          <button
            type="button"
            disabled={fileBusy || blocked}
            onClick={() => void checkFile(true)}
          >
            Attach verified original file to reviewed current case
          </button>
          <a href={`?${new URLSearchParams({ ticket_id: ticket.id })}`}>
            Read current case before attachment
          </a>
        </div>
      ) : null}
      <span id={`${prefix}-end`} />
    </details>
  );
}
