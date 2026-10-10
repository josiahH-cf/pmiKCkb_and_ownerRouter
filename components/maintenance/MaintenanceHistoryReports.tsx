"use client";
import { useEffect, useRef, useState } from "react";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { UserActionError, actionFailureMessage } from "@/lib/ui/action-feedback";
import {
  MaintenanceReportRequestSchema,
  SaveMaintenanceReportSchema,
  reportMoney,
  type MaintenanceReport,
  type MaintenanceReportRequest,
  type SaveMaintenanceReportInput,
  type SavedMaintenanceReportView,
} from "@/lib/maintenance/report-model";
const base = "/api/maintenance/reports";
export function MaintenanceHistoryReports({
  actorUid,
  canEdit,
  initialMonth,
  initialReportId,
}: {
  actorUid: string;
  canEdit: boolean;
  initialMonth: string;
  initialReportId?: string;
}) {
  const [scopeKind, setScopeKind] =
      useState<MaintenanceReportRequest["scopeKind"]>("property"),
    [scopeId, setScopeId] = useState(""),
    [month, setMonth] = useState(initialMonth),
    [periodKind, setPeriodKind] = useState("month"),
    [start, setStart] = useState(initialMonth + "-01"),
    [end, setEnd] = useState(""),
    [basis, setBasis] =
      useState<MaintenanceReportRequest["financialDateBasis"]>("service"),
    [prepared, setPrepared] = useState<{
      report: MaintenanceReport;
      snapshotHash: string;
    } | null>(null),
    [saved, setSaved] = useState<SavedMaintenanceReportView | null>(null),
    [pending, setPending] = useState<SaveMaintenanceReportInput | null>(null),
    [busy, setBusy] = useState(true),
    [status, setStatus] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [retain, setRetain] = useState(false);
  const generation = useRef(0),
    storageKey = `maintenance-report-save:${actorUid}`;
  function remember(command: SaveMaintenanceReportInput | null) {
    setPending(command);
    try {
      if (command) sessionStorage.setItem(storageKey, JSON.stringify(command));
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* The original identity remains in the URL for result lookup. */
    }
    if (command) {
      const url = new URL(location.href);
      url.searchParams.set("report_id", command.operationId);
      history.replaceState(null, "", url);
    }
  }
  function restoreSelection(q: MaintenanceReportRequest) {
    setScopeKind(q.scopeKind);
    setScopeId(q.scopeId);
    setPeriodKind("custom");
    setStart(q.startDate);
    setEnd(q.endDate);
    setBasis(q.financialDateBasis);
  }
  function accept(result: SavedMaintenanceReportView) {
    setSaved(result);
    if (result.report) {
      setPrepared({ report: result.report, snapshotHash: result.snapshotHash! });
      restoreSelection(result.report.request);
    }
    if (result.state === "saved") {
      remember(null);
      setStatus(
        "Original report and both exact exports verified. The retained snapshot will not change when source facts are corrected.",
      );
    } else if (result.state === "cancelled") {
      remember(null);
      setStatus(
        "Original report save was stopped before admission. Your selection is kept; prepare current facts before a new save.",
      );
    } else {
      if (result.report && result.snapshotHash)
        remember({
          operationId: result.id,
          request: result.report.request,
          expectedSnapshotHash: result.snapshotHash,
          reviewedGeneratedAt: result.report.generatedAt,
          reviewedOwnerReadyContent: true,
          retainFactsAndExportsIndefinitely: true,
        });
      setStatus(
        "The original report is retained in preparation. Resume that exact save to finish its immutable exports.",
      );
    }
  }
  useEffect(() => {
    const g = ++generation.current;
    queueMicrotask(() => {
      if (g !== generation.current) return;
      let command: SaveMaintenanceReportInput | null = null;
      try {
        const value = sessionStorage.getItem(storageKey);
        if (value) {
          const parsed = SaveMaintenanceReportSchema.safeParse(JSON.parse(value));
          if (parsed.success) command = parsed.data;
        }
      } catch {}
      if (command) {
        setPending(command);
        restoreSelection(command.request);
      }
      const id = initialReportId ?? command?.operationId;
      if (!id) {
        setBusy(false);
        return;
      }
      void fetch(`${base}?report_id=${encodeURIComponent(id)}`, { cache: "no-store" })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok)
            throw new UserActionError(
              body.error ?? "The original report outcome is not available.",
            );
          if (g === generation.current) accept(body);
        })
        .catch((e) => {
          if (g === generation.current)
            setStatus(
              actionFailureMessage(
                e,
                "The original report outcome is unresolved. Keep its identity; no replacement save ran.",
              ),
            );
        })
        .finally(() => {
          if (g === generation.current) setBusy(false);
        });
    });
    return () => {
      generation.current++;
    };
  }, [actorUid, initialReportId]);
  function selection() {
    let startDate = start,
      endDate = end;
    if (periodKind === "month") {
      if (!/^\d{4}-\d{2}$/.test(month))
        throw new UserActionError("Select an actual calendar month.");
      const [year, m] = month.split("-").map(Number);
      startDate = month + "-01";
      endDate = new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
    }
    const parsed = MaintenanceReportRequestSchema.safeParse({
      scopeKind,
      scopeId: scopeId.trim(),
      startDate,
      endDate,
      financialDateBasis: basis,
    });
    if (!parsed.success)
      throw new UserActionError(
        "Select an actual owner/property/unit/lease identity and an ordered period no longer than 367 days.",
      );
    return parsed.data;
  }
  async function prepare() {
    const g = ++generation.current;
    setBusy(true);
    setStatus("Reading the complete retained scope and financial evidence…");
    setReviewed(false);
    setRetain(false);
    try {
      const q = selection(),
        response = await fetch(`${base}?${new URLSearchParams(q)}`, {
          cache: "no-store",
        }),
        body = await response.json();
      if (!response.ok)
        throw new UserActionError(
          body.error ?? "The complete report could not be prepared.",
        );
      if (g === generation.current) {
        setPrepared(body);
        setSaved(null);
        setStatus(
          "Report prepared from the complete retained read. Review its scope, coverage and financial meanings before saving.",
        );
      }
    } catch (e) {
      if (g === generation.current)
        setStatus(
          actionFailureMessage(
            e,
            "The report read failed. No partial totals or export were presented as complete.",
          ),
        );
    } finally {
      if (g === generation.current) setBusy(false);
    }
  }
  async function submit(command: SaveMaintenanceReportInput) {
    const g = ++generation.current;
    setBusy(true);
    setStatus("Saving the reviewed snapshot and verifying both original export files…");
    try {
      const response = await fetch(base, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(command),
        }),
        body = await response.json();
      if (!response.ok)
        throw new UserActionError(
          body.error ?? "The original save did not return a verified result.",
        );
      if (g === generation.current) accept(body);
    } catch (e) {
      if (g === generation.current)
        setStatus(
          actionFailureMessage(
            e,
            "The original report save outcome is unresolved. Check its original result before another save.",
          ),
        );
    } finally {
      if (g === generation.current) setBusy(false);
    }
  }
  async function recover(stop = false) {
    const id = pending?.operationId ?? initialReportId ?? saved?.id;
    if (!id) return;
    const g = ++generation.current;
    setBusy(true);
    try {
      const response = await fetch(
          stop ? base : `${base}?report_id=${encodeURIComponent(id)}`,
          stop
            ? {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ op: "stop_before_admission", operationId: id }),
              }
            : { cache: "no-store" },
        ),
        body = await response.json();
      if (!response.ok)
        throw new UserActionError(body.error ?? "The original report is unresolved.");
      if (g === generation.current) accept(body);
    } catch (e) {
      if (g === generation.current)
        setStatus(
          actionFailureMessage(
            e,
            "Original outcome unresolved. Keep the original save identity.",
          ),
        );
    } finally {
      if (g === generation.current) setBusy(false);
    }
  }
  let currentSelection = true;
  try {
    currentSelection =
      !!prepared &&
      JSON.stringify(selection()) === JSON.stringify(prepared.report.request);
  } catch {
    currentSelection = false;
  }
  const report = prepared?.report,
    maximum = Math.max(
      1,
      ...(report?.trends.flatMap((t) => [t.opened, t.completed]) ?? []),
    );
  return (
    <section className="maintenance-history-reports ui-stack">
      <h1>Maintenance history and reports</h1>
      <p>
        Choose actual event-date identities. Current ownership and occupancy do not
        establish historical attribution. Reports use prospective retained evidence and
        are prepared for human review.
      </p>
      <fieldset disabled={busy || !!pending}>
        <legend>Report selection</legend>
        <label className="field">
          Scope
          <select
            value={scopeKind}
            onChange={(e) => setScopeKind(e.target.value as typeof scopeKind)}
          >
            {["property", "unit", "lease", "owner"].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Actual {scopeKind} ID
          <input value={scopeId} onChange={(e) => setScopeId(e.target.value)} />
        </label>
        <label className="field">
          Period
          <select value={periodKind} onChange={(e) => setPeriodKind(e.target.value)}>
            <option value="month">Calendar month</option>
            <option value="custom">Custom date range</option>
          </select>
        </label>
        {periodKind === "month" ? (
          <label className="field">
            Calendar month
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
        ) : (
          <>
            <label className="field">
              Period starts
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className="field">
              Period ends
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </>
        )}
        <label className="field">
          Financial date basis
          <select
            value={basis}
            onChange={(e) => setBasis(e.target.value as typeof basis)}
          >
            <option value="service">Service date</option>
            <option value="invoice">Invoice date</option>
            <option value="payment">Payment date</option>
          </select>
        </label>
        <button type="button" onClick={() => void prepare()}>
          Prepare complete report
        </button>
      </fieldset>
      <p role="status" aria-live="polite">
        {status}
      </p>
      {pending || saved?.state === "preparing" ? (
        <section aria-label="Original report save recovery">
          <p>
            Original save: {pending?.operationId ?? saved?.id}. A check reads its actual
            outcome; resuming uses that exact reviewed snapshot.
          </p>
          <button disabled={busy} onClick={() => void recover()}>
            Check original report save
          </button>
          {pending ? (
            <button disabled={busy} onClick={() => void submit(pending)}>
              Resume exact original report save
            </button>
          ) : null}
          <button disabled={busy} onClick={() => void recover(true)}>
            Stop original save if not admitted
          </button>
        </section>
      ) : null}
      {report ? (
        <>
          <header>
            <h2>
              {report.scopeLabel} · {report.request.startDate} to {report.request.endDate}
            </h2>
            <p>
              {report.timeZone} · Generated {report.generatedAt}
            </p>
          </header>
          <div className="maintenance-report-counts">
            {[
              ["Opened in period", report.counts.opened],
              ["PMI completed in period", report.counts.completed],
              ["Open as of period end", report.counts.openAsOfEnd],
            ].map(([label, n]) => (
              <article className="panel" key={label}>
                <h3>{label}</h3>
                <strong>{n}</strong>
              </article>
            ))}
          </div>
          <section aria-label="History coverage">
            <h3>Coverage and definitions</h3>
            <p>
              Retained history starts: {report.coverage.startDate ?? "Unknown"}.{" "}
              {report.coverage.incomplete
                ? "Incomplete coverage for this selection."
                : "This period falls within retained prospective coverage."}
            </p>
            {report.coverage.notes.map((n) => (
              <p className="muted" key={n}>
                {n}
              </p>
            ))}
            <details>
              <summary>Count and date definitions</summary>
              {Object.entries(report.definitions).map(([key, value]) => (
                <p key={key}>{value}</p>
              ))}
            </details>
          </section>
          <section>
            <h3>
              Separated financial totals · {report.request.financialDateBasis} date basis
            </h3>
            <dl className="maintenance-report-totals">
              {Object.entries(report.totals)
                .filter(([key]) => key.endsWith("Cents"))
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>
                      {key.replace(/Cents$/, " ").replace(/([a-z])([A-Z])/g, "$1 $2")}
                    </dt>
                    <dd>{reportMoney(value as number | null)}</dd>
                  </div>
                ))}
            </dl>
            <p>
              Payment evidence: {report.totals.paymentState.replaceAll("_", " ")}.{" "}
              {report.totals.unreviewedInvoices} invoice or credit entries await review.
            </p>
            {report.totals.excludedCurrencies.length ? (
              <p>
                Excluded currencies, without conversion:{" "}
                {report.totals.excludedCurrencies.join(", ")}
              </p>
            ) : null}
          </section>
          <section>
            <h3>Monthly work trend</h3>
            <p>Dark bars: opened. Light bars: PMI completed. Axis: 0–{maximum} cases.</p>
            {report.trends.map((t) => (
              <div className="maintenance-report-trend" key={t.month}>
                <p>
                  {t.month}: opened {t.opened}; completed {t.completed}. Invoice{" "}
                  {reportMoney(t.invoicedCents)}; owner charge{" "}
                  {reportMoney(t.ownerChargeCents)}; verified paid{" "}
                  {reportMoney(t.verifiedPaidCents)}.
                </p>
                <div aria-hidden="true">
                  <span style={{ width: `${(t.opened / maximum) * 100}%` }} />
                  <span style={{ width: `${(t.completed / maximum) * 100}%` }} />
                </div>
              </div>
            ))}
          </section>
          <section>
            <h3>Chronological jobs and retained evidence</h3>
            {!report.jobs.length ? (
              <p>
                No scoped work is recorded for this selection. Review the coverage notes
                before interpreting this as a complete no-work period.
              </p>
            ) : (
              report.jobs.map((j) => (
                <article className="panel ui-stack" key={j.ticketId}>
                  <h4>
                    <a href={`/maintenance?ticket_id=${encodeURIComponent(j.ticketId)}`}>
                      {j.location} · case {j.ticketId}
                    </a>
                  </h4>
                  <p>{j.reviewedScope ?? "Assessment pending"}</p>
                  <p>
                    Opened {j.openedDate}; assessment {j.assessmentDate ?? "not recorded"}
                    ; work {j.workDates.join(", ") || "not recorded"}; PMI completion{" "}
                    {j.completedDates.join(", ") || "none in period"}. Stage at end:{" "}
                    {j.stageAsOfEnd.replaceAll("_", " ")}.
                  </p>
                  <p>
                    Trade {j.trade ?? "not recorded"}; vendor{" "}
                    {j.vendor ?? "not recorded for this financial evidence"}. Event-date
                    owner contact {j.association.ownerRef ?? "not established"}; lease{" "}
                    {j.association.leaseId ?? "not established"}.
                  </p>
                  {j.responsibility ? (
                    <div>
                      <p>
                        Recorded responsibility version {j.responsibility.version}:{" "}
                        {j.responsibility.state} · review at export:{" "}
                        {j.responsibility.reviewAtExport.replaceAll("_", " ")}.
                      </p>
                      <p>
                        Policy {j.responsibility.policyId ?? "unset"} v
                        {j.responsibility.policyVersion ?? "unset"}. Proposed amount{" "}
                        {reportMoney(j.responsibility.proposedAmountCents)}.{" "}
                        {j.responsibility.meaning}.
                      </p>
                      <p>
                        {j.responsibility.amountBasis ||
                          "Proposed amount basis not established."}
                      </p>
                    </div>
                  ) : null}
                  {j.financial.map((f) => (
                    <p key={f.id}>
                      {f.label}: {reportMoney(f.amountCents, f.currency)} ·{" "}
                      {f.sourceLabel} · source {f.invoiceIdentity ?? f.id}, v{f.version} ·
                      service {f.serviceDate}, invoice {f.invoiceDate ?? "unknown"},
                      payment {f.paymentDate ?? "unknown"}.
                    </p>
                  ))}
                  {!j.financial.length ? (
                    <p>
                      Financial evidence is unknown for the selected date basis and
                      period.
                    </p>
                  ) : null}
                  {j.documents.map((d) => (
                    <p key={d.id}>
                      <a
                        href={`/api/maintenance/tickets/${encodeURIComponent(j.ticketId)}/artifacts?artifact_id=${encodeURIComponent(d.id)}&download=1`}
                      >
                        {d.filename}
                      </a>{" "}
                      · {d.sourceLabel} · SHA-256 <code>{d.sha256}</code>
                    </p>
                  ))}
                  <details>
                    <summary>Retained chronology and source versions</summary>
                    {j.chronology.map((e) => (
                      <p key={e.id}>
                        {e.date} · {e.label} · {e.sourceLabel} · {e.id}
                      </p>
                    ))}
                    {j.sourceVersions.map((v) => (
                      <p key={v.collection + v.id}>
                        {v.collection}: {v.id} · version {v.version}
                      </p>
                    ))}
                  </details>
                </article>
              ))
            )}
          </section>
          <p>
            <a
              href={`${base}?${new URLSearchParams({ ...report.request, format: "csv", expected_snapshot_hash: prepared!.snapshotHash, generated_at: report.generatedAt })}`}
            >
              Download matching prepared CSV
            </a>
          </p>
          {saved?.state === "saved" ? (
            <section aria-label="Verified retained exports">
              <h3>Retained original exports</h3>
              <p>
                Report {saved.id} · facts and both files retained indefinitely.
                Corrections require a new report snapshot.
              </p>
              <a href={`${base}?report_id=${saved.id}&format=pdf`}>
                Download original PDF
              </a>
              {" · "}
              <a href={`${base}?report_id=${saved.id}&format=csv`}>
                Download original CSV
              </a>
              <p>
                PDF SHA-256 <code>{saved.pdfHash}</code>
              </p>
              <p>
                CSV SHA-256 <code>{saved.csvHash}</code>
              </p>
            </section>
          ) : canEdit ? (
            <fieldset disabled={busy || !!pending || !currentSelection}>
              <legend>Review and deliberately retain</legend>
              {!currentSelection ? (
                <p>The selection changed. Prepare the current selection before saving.</p>
              ) : null}
              <label>
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I reviewed these selected facts and the owner-ready content.
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={retain}
                  onChange={(e) => setRetain(e.target.checked)}
                />
                Retain this snapshot and the exact PDF/CSV indefinitely as core
                maintenance evidence.
              </label>
              <button
                disabled={!reviewed || !retain}
                onClick={() => {
                  if (!prepared) return;
                  const command: SaveMaintenanceReportInput = {
                    operationId: crypto.randomUUID(),
                    request: prepared.report.request,
                    expectedSnapshotHash: prepared.snapshotHash,
                    reviewedGeneratedAt: prepared.report.generatedAt,
                    reviewedOwnerReadyContent: true,
                    retainFactsAndExportsIndefinitely: true,
                  };
                  remember(command);
                  void submit(command);
                }}
              >
                Save reviewed report and exports
              </button>
            </fieldset>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
