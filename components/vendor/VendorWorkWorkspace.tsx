"use client";
import { UserActionError, actionFailureMessage } from "@/lib/ui/action-feedback";
import { maintenanceLocalTimeInput as localInput } from "@/lib/maintenance/local-time-input";
import { useEffect, useRef, useState, useCallback } from "react";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import type { VendorTicketProjection } from "@/lib/vendor/model";
import {
  VendorContributionInputSchema,
  type VendorContributionInput,
  type VendorContribution,
  type VendorArtifact,
  type VendorArtifactInput,
} from "@/lib/maintenance/vendor-work-model";
import { formatBusinessTimestamp } from "@/lib/date-display";
import { resolveWallTime } from "@/lib/gmail-hub/schedule-calendar";
import { BUSINESS_TIME_ZONE } from "@/lib/lease-renewal/business-calendar";
type View = {
  ticket: VendorTicketProjection;
  contributions: VendorContribution[];
  artifacts: VendorArtifact[];
  operation: {
    operationId: string;
    state: string;
    committedVersion: number | null;
    detail: string;
  } | null;
};
type FileIntent = {
  id: string;
  filename: string;
  mimeType: string;
  sha256: string;
  assignmentGeneration: string;
  purpose: VendorArtifactInput["purpose"];
};
const empty = () => ({
  submissionId: "",
  version: 0,
  kind: "progress" as VendorContributionInput["kind"],
  description: "",
  occurredAt: "",
  originalOccurredAt: "",
  originalStart: "",
  originalEnd: "",
  quoteBasis: "estimate" as "estimate" | "fixed",
  lines: [{ description: "", amount: "" }],
  invoiceId: "",
  invoiceMeaning: "invoice" as "invoice" | "credit",
  issueDate: "",
  serviceDate: "",
  start: "",
  end: "",
  progressKind: "note" as NonNullable<VendorContributionInput["progressKind"]>,
  unresolvedIssues: "",
  artifactIds: [] as string[],
  revisionReason: "",
});
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
function cents(v: string) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(v.trim()))
    throw new UserActionError(
      "Enter an actual nonnegative USD amount with at most two decimal places.",
    );
  const [whole, fraction = ""] = v.trim().split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
function instant(v: string) {
  if (!v) return new Date().toISOString();
  const [date, time] = v.split("T"),
    value = resolveWallTime(date, time, BUSINESS_TIME_ZONE);
  if (value.adjustment !== "none")
    throw new UserActionError(
      "Choose an unambiguous actual local time; this time is repeated or skipped by daylight saving.",
    );
  return new Date(value.instantMs).toISOString();
}
export function VendorWorkWorkspace({
  initialTicket,
  actorUid,
}: {
  initialTicket: VendorTicketProjection;
  actorUid: string;
}) {
  const [view, setView] = useState<View | null>(null),
    [draft, setDraft] = useState(empty),
    [pending, setPending] = useState<VendorContributionInput | null>(null),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [needsCurrent, setNeedsCurrent] = useState(false),
    [ready, setReady] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [filePurpose, setFilePurpose] =
      useState<VendorArtifactInput["purpose"]>("work_photo"),
    [fileAck, setFileAck] = useState(false),
    [fileIntent, setFileIntent] = useState<FileIntent | null>(null),
    [fileStatus, setFileStatus] = useState("");
  const live = useRef(true),
    generation = useRef(0),
    running = useRef(false),
    base = `/api/vendor/tickets/${encodeURIComponent(initialTicket.id)}`,
    key = `pmi-kc:vendor-work:${actorUid}:${initialTicket.id}`,
    fileKey = `${key}:file`;
  function persistFile(value: FileIntent | null) {
    setFileIntent(value);
    try {
      if (value) sessionStorage.setItem(fileKey, JSON.stringify(value));
      else sessionStorage.removeItem(fileKey);
    } catch {}
  }
  const clear = useCallback(() => {
    setPending(null);
    try {
      sessionStorage.removeItem(key);
    } catch {}
  }, [key]);
  function restore(c: VendorContributionInput, version = c.expectedSubmissionVersion) {
    setDraft({
      submissionId: c.submissionId,
      version,
      kind: c.kind,
      description: c.description,
      occurredAt: localInput(c.occurredAt),
      originalOccurredAt: c.occurredAt,
      originalStart: c.proposedStart ?? "",
      originalEnd: c.proposedEnd ?? "",
      quoteBasis: c.quoteBasis ?? "estimate",
      lines: c.lines.map((l) => ({
        description: l.description,
        amount: String(l.amountCents / 100),
      })),
      invoiceId: c.invoiceId ?? "",
      invoiceMeaning: c.invoiceMeaning ?? "invoice",
      issueDate: c.issueDate ?? "",
      serviceDate: c.serviceDate ?? "",
      start: localInput(c.proposedStart),
      end: localInput(c.proposedEnd),
      progressKind: c.progressKind ?? "note",
      unresolvedIssues: c.unresolvedIssues,
      artifactIds: c.artifactIds,
      revisionReason: c.revisionReason,
    });
  }
  const load = useCallback(
    async (original?: string) => {
      const g = ++generation.current,
        response = await fetch(
          `${base}/work${original ? `?${new URLSearchParams({ operation_id: original })}` : ""}`,
          { cache: "no-store" },
        ),
        body = await response.json();
      if (!response.ok) {
        if (response.status === 403 || response.status === 404) setView(null);
        throw new UserActionError(body.error ?? "Current assigned work is unavailable.");
      }
      if (!live.current || g !== generation.current) return;
      if (body.ticket.id !== initialTicket.id)
        throw new UserActionError("The result identifies different work.");
      setView(body);
      setNeedsCurrent(false);
      if (original) {
        if (body.operation?.operationId !== original)
          throw new UserActionError(
            "The result identifies a different original operation.",
          );
        if (body.operation.state === "committed") {
          clear();
          setStatus(
            `Original report recorded at version ${body.operation.committedVersion}; current work and later revisions are displayed.`,
          );
        } else setStatus(body.operation.detail);
      }
    },
    [base, initialTicket.id, clear],
  );
  useEffect(() => {
    live.current = true;
    queueMicrotask(() => {
      let original: VendorContributionInput | null = null;
      try {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const parsed = VendorContributionInputSchema.safeParse(JSON.parse(raw));
          if (parsed.success) {
            original = parsed.data;
            setPending(original);
            restore(original);
          }
        }
        const stored = sessionStorage.getItem(fileKey);
        if (stored) {
          const f = JSON.parse(stored);
          if (
            typeof f.id === "string" &&
            /^[a-f0-9-]{36}$/i.test(f.id) &&
            typeof f.sha256 === "string" &&
            /^[a-f0-9]{64}$/.test(f.sha256)
          ) {
            setFileIntent(f);
            setFileStatus("Check the exact original upload before adding another file.");
          }
        }
      } catch {}
      setReady(true);
      void load(original?.operationId).catch((e) => {
        if (live.current)
          setStatus(
            actionFailureMessage(
              e,
              "Assigned work is unavailable; no empty work list was inferred.",
            ),
          );
      });
    });
    return () => {
      live.current = false;
      generation.current++;
    };
  }, [key, fileKey, base, load]);
  async function submit(original?: VendorContributionInput) {
    if (
      running.current ||
      !view ||
      !ready ||
      fileIntent ||
      (!original && (pending || needsCurrent))
    )
      return;
    running.current = true;
    setBusy(true);
    let sent = false;
    try {
      const command =
        original ??
        VendorContributionInputSchema.parse({
          operationId: crypto.randomUUID(),
          submissionId: draft.submissionId || crypto.randomUUID(),
          expectedSubmissionVersion: draft.version,
          assignmentGeneration: view.ticket.assignmentGeneration,
          kind: draft.kind,
          description: draft.description,
          occurredAt:
            draft.originalOccurredAt &&
            draft.occurredAt === localInput(draft.originalOccurredAt)
              ? draft.originalOccurredAt
              : instant(draft.occurredAt),
          quoteBasis: draft.kind === "quote" ? draft.quoteBasis : null,
          lines: ["quote", "invoice"].includes(draft.kind)
            ? draft.lines.map((l) => ({
                description: l.description,
                amountCents: cents(l.amount),
              }))
            : [],
          invoiceId: draft.kind === "invoice" ? draft.invoiceId : null,
          ...(draft.kind === "invoice" ? { invoiceMeaning: draft.invoiceMeaning } : {}),
          issueDate: draft.kind === "invoice" ? draft.issueDate : null,
          serviceDate: draft.kind === "invoice" ? draft.serviceDate : null,
          proposedStart:
            draft.kind === "schedule"
              ? draft.originalStart && draft.start === localInput(draft.originalStart)
                ? draft.originalStart
                : instant(draft.start)
              : null,
          proposedEnd:
            draft.kind === "schedule"
              ? draft.originalEnd && draft.end === localInput(draft.originalEnd)
                ? draft.originalEnd
                : instant(draft.end)
              : null,
          progressKind: draft.kind === "progress" ? draft.progressKind : null,
          unresolvedIssues: draft.unresolvedIssues,
          artifactIds: draft.artifactIds,
          revisionReason: draft.revisionReason,
        });
      if (command.kind === "schedule" && (!draft.start || !draft.end) && !original)
        throw new UserActionError("Enter the actual proposed visit start and end.");
      setPending(command);
      try {
        sessionStorage.setItem(key, JSON.stringify(command));
      } catch {}
      sent = true;
      setStatus("Recording your exact report and original-operation receipt…");
      const response = await fetch(`${base}/work`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(command),
        }),
        body = await response.json();
      if (!response.ok) {
        if (!original && response.status >= 400 && response.status < 500) {
          clear();
          if (response.status === 409) setNeedsCurrent(true);
          if (response.status === 403 || response.status === 404) setView(null);
        }
        throw new UserActionError(
          body.error ?? "The original report remains unresolved.",
        );
      }
      if (body.operationId !== command.operationId)
        throw new UserActionError("The response identifies another original report.");
      clear();
      setDraft(empty());
      setStatus(
        "Vendor report recorded for PMI review. Work approval, financial posting, payment and final closure remain with their authorized owners.",
      );
      await load().catch(() =>
        setStatus(
          "Original report saved. Current work could not refresh; read current assigned work before another edit.",
        ),
      );
    } catch (e) {
      if (!sent && !original) clear();
      setStatus(
        actionFailureMessage(
          e,
          "Keep this exact original report and check its receipt before another submission.",
        ),
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function check() {
    if (!pending || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await load(pending.operationId);
    } catch (e) {
      setStatus(
        actionFailureMessage(
          e,
          "Keep the original report; absence does not prove it failed.",
        ),
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function upload() {
    if (!file || !fileAck || running.current || !view || pending || needsCurrent) return;
    running.current = true;
    setBusy(true);
    let sent = false;
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new UserActionError("Select a passive PDF or supported image up to 5 MiB.");
      const bytes = new Uint8Array(await file.arrayBuffer()),
        hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
      const intent = fileIntent ?? {
        id: crypto.randomUUID(),
        filename: file.name,
        mimeType: file.type,
        sha256: hash,
        assignmentGeneration: view.ticket.assignmentGeneration!,
        purpose: filePurpose,
      };
      if (
        intent.filename !== file.name ||
        intent.mimeType !== file.type ||
        intent.sha256 !== hash
      )
        throw new UserActionError(
          "Reselect the exact original file; name, type and saved hash must match.",
        );
      persistFile(intent);
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      sent = true;
      setFileStatus("Retaining exact file bytes and verifying their saved hash…");
      const response = await fetch(`${base}/artifacts`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            operationId: intent.id,
            assignmentGeneration: intent.assignmentGeneration,
            filename: intent.filename,
            mimeType: intent.mimeType,
            purpose: intent.purpose,
            base64: btoa(binary),
            approvedCoreEvidence: true,
          }),
        }),
        body = await response.json();
      if (!response.ok) {
        if (
          !fileIntent &&
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 409
        )
          persistFile(null);
        throw new UserActionError(body.error ?? "Original upload remains unresolved.");
      }
      if (
        body.artifact.id !== intent.id ||
        body.artifact.sha256 !== intent.sha256 ||
        body.artifact.state !== "retained"
      )
        throw new UserActionError("The exact retained file could not be verified.");
      persistFile(null);
      setFile(null);
      setFileAck(false);
      setDraft((d) => ({
        ...d,
        artifactIds: [...new Set([...d.artifactIds, intent.id])],
      }));
      setFileStatus(
        "Original file retained and hash verified. It is available for your report; PMI review remains separate.",
      );
      await load().catch(() =>
        setFileStatus(
          "Original file retained. Read current work to refresh the artifact list.",
        ),
      );
    } catch (e) {
      setFileStatus(
        actionFailureMessage(
          e,
          sent
            ? "Check and resume only this original upload."
            : "The selected file has not been uploaded.",
        ),
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function checkFile() {
    if (!fileIntent || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const response = await fetch(
          `${base}/artifacts?${new URLSearchParams({ artifact_id: fileIntent.id })}`,
          { cache: "no-store" },
        ),
        body = await response.json();
      if (!response.ok)
        throw new UserActionError(
          body.error ??
            "Original upload is unavailable; absence does not establish failure.",
        );
      if (
        body.artifact.id !== fileIntent.id ||
        body.artifact.sha256 !== fileIntent.sha256
      )
        throw new UserActionError(
          "The original upload identity/hash differs; PMI must reconcile it.",
        );
      if (body.artifact.state === "retained") {
        const id = fileIntent.id;
        persistFile(null);
        setDraft((d) => ({ ...d, artifactIds: [...new Set([...d.artifactIds, id])] }));
        setFileStatus("Original retained file verified; no upload was repeated.");
        await load();
      } else
        setFileStatus(
          "Original upload is incomplete. Reselect and resume these exact original bytes.",
        );
    } catch (e) {
      setFileStatus(
        actionFailureMessage(
          e,
          "Keep the exact original file identity for reconciliation.",
        ),
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const current = view?.ticket ?? initialTicket,
    p = current.reviewedPacket;
  return (
    <section className="ui-stack vendor-workspace">
      <p role="status">{status}</p>
      {view ? (
        <>
          <article className="panel">
            <h2>Reviewed work details</h2>
            {p ? (
              <>
                <p>{p.issue}</p>
                <p>{p.location}</p>
                <p>Scope: {p.approvedScope}</p>
                <p>
                  Access:{" "}
                  {p.access || "Not established; ask PMI to coordinate before access"}
                </p>
                <p>Scheduling: {p.scheduling || "No visit confirmed"}</p>
                <p>
                  Cost limit:{" "}
                  {p.costLimitCents === null
                    ? "No spending authority included"
                    : `${money(p.costLimitCents)} · ${p.costBasis ?? "basis unavailable"}`}
                </p>
                <ul>
                  {p.troubleshooting.map((s, i) => (
                    <li key={i}>
                      {s.step}: {s.outcome}
                    </li>
                  ))}
                </ul>
                <ul>
                  {p.artifactIds.map((id) => (
                    <li key={id}>
                      <a
                        href={`${base}/artifacts?${new URLSearchParams({ artifact_id: id, source: "packet", download: "1" })}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Read approved job attachment {id.slice(0, 8)}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>
                No current reviewed job packet is available. Ask PMI to review the current
                scope, access and authorization before doing work.
              </p>
            )}
          </article>
          <article className="panel">
            <h2>Your recorded reports</h2>
            {view.contributions.length ? (
              view.contributions.map((s) => (
                <article key={s.submissionId} className="panel">
                  <h3>
                    {s.kind} · version {s.version} · PMI review {s.review.state}
                  </h3>
                  <p>{s.description}</p>
                  <p>
                    Occurred {formatBusinessTimestamp(s.occurredAt)}; recorded{" "}
                    {formatBusinessTimestamp(s.recordedAt)}.
                  </p>
                  {s.kind === "invoice" ? (
                    <p>
                      {s.invoiceMeaning === "credit"
                        ? "Vendor-reported credit"
                        : "Vendor-reported invoice"}{" "}
                      {s.invoiceId}; issued {s.issueDate}, service {s.serviceDate}. PMI
                      review is separate from payment or accounting.
                    </p>
                  ) : null}
                  {s.quoteBasis ? <p>{s.quoteBasis}</p> : null}
                  <ul>
                    {s.lines.map((l, i) => (
                      <li key={i}>
                        {l.description}: {money(l.amountCents)}
                      </li>
                    ))}
                  </ul>
                  {s.proposedStart ? (
                    <p>
                      Proposed {formatBusinessTimestamp(s.proposedStart)} to{" "}
                      {formatBusinessTimestamp(s.proposedEnd!)}.
                    </p>
                  ) : null}
                  <p>Unresolved issues: {s.unresolvedIssues || "None reported"}</p>
                  <p>PMI: {s.review.reason || "Pending review"}</p>
                  <button
                    type="button"
                    disabled={busy || !!pending || !!fileIntent || needsCurrent}
                    onClick={() =>
                      restore(
                        {
                          ...s,
                          operationId: crypto.randomUUID(),
                          expectedSubmissionVersion: s.version,
                        },
                        s.version,
                      )
                    }
                  >
                    Revise this original report
                  </button>
                </article>
              ))
            ) : (
              <p>No reports recorded yet.</p>
            )}
          </article>
        </>
      ) : (
        <p>
          Current assigned work must be read before contributing. A lost or revoked
          assignment does not expose prior work.
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void load()
            .then(() =>
              setStatus(
                "Current assignment read. Review changed facts and retained words before submitting.",
              ),
            )
            .catch((e) =>
              setStatus(actionFailureMessage(e, "Current assigned work is unavailable.")),
            )
        }
      >
        Read current assigned work
      </button>
      {pending ? (
        <div className="panel">
          <p>Original report: {pending.operationId}</p>
          <button type="button" disabled={busy} onClick={() => void check()}>
            Check original report
          </button>
          <button type="button" disabled={busy} onClick={() => void submit(pending)}>
            Retry exact original report
          </button>
        </div>
      ) : null}
      <fieldset
        disabled={busy || !ready || !view || !!pending || !!fileIntent || needsCurrent}
      >
        <legend>Submit a vendor report for PMI review</legend>
        <label className="field">
          Report type
          <select
            value={draft.kind}
            disabled={!!draft.submissionId}
            onChange={(e) =>
              setDraft((d) => ({ ...d, kind: e.target.value as typeof d.kind }))
            }
          >
            {["progress", "quote", "schedule", "invoice", "completion"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Actual description
          <textarea
            aria-label="Actual description"
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />
        </label>
        <label className="field">
          Occurred at (America/Chicago; blank records now)
          <input
            type="datetime-local"
            value={draft.occurredAt}
            onChange={(e) => setDraft((d) => ({ ...d, occurredAt: e.target.value }))}
          />
        </label>
        {draft.kind === "progress" ? (
          <label className="field">
            Work log meaning
            <select
              value={draft.progressKind}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  progressKind: e.target.value as typeof d.progressKind,
                }))
              }
            >
              {["note", "arrived", "departed", "schedule_update"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
        ) : null}
        {draft.kind === "quote" ? (
          <label className="field">
            Quote basis
            <select
              value={draft.quoteBasis}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  quoteBasis: e.target.value as typeof d.quoteBasis,
                }))
              }
            >
              <option value="estimate">Estimate</option>
              <option value="fixed">Fixed quote</option>
            </select>
          </label>
        ) : null}
        {["quote", "invoice"].includes(draft.kind) ? (
          <>
            <h3>Itemized USD amounts</h3>
            {draft.lines.map((l, i) => (
              <div key={i}>
                <label className="field">
                  Line {i + 1} description
                  <input
                    value={l.description}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        lines: d.lines.map((x, j) =>
                          i === j ? { ...x, description: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                </label>
                <label className="field">
                  Line {i + 1} amount (USD)
                  <input
                    inputMode="decimal"
                    value={l.amount}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        lines: d.lines.map((x, j) =>
                          i === j ? { ...x, amount: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({ ...d, lines: d.lines.filter((_, j) => j !== i) }))
                  }
                >
                  Remove line {i + 1}
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={draft.lines.length >= 100}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  lines: [...d.lines, { description: "", amount: "" }],
                }))
              }
            >
              Add itemized line
            </button>
          </>
        ) : null}
        {draft.kind === "invoice" ? (
          <>
            <label className="field">
              Original document meaning
              <select
                value={draft.invoiceMeaning}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    invoiceMeaning: e.target.value as "invoice" | "credit",
                  }))
                }
              >
                <option value="invoice">Invoice</option>
                <option value="credit">Credit document</option>
              </select>
            </label>
            {(
              [
                ["invoiceId", "Original invoice ID"],
                ["issueDate", "Invoice issue date"],
                ["serviceDate", "Actual service date"],
              ] as const
            ).map(([field, label]) => (
              <label className="field" key={field}>
                {label}
                <input
                  type={field === "invoiceId" ? "text" : "date"}
                  value={draft[field]}
                  onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
                />
              </label>
            ))}
            <p>
              Retain and select the original invoice document below. Invoice evidence does
              not prove payment or an accounting post.
            </p>
          </>
        ) : null}
        {draft.kind === "schedule" ? (
          <>
            {(
              [
                ["start", "Proposed visit start"],
                ["end", "Proposed visit end"],
              ] as const
            ).map(([field, label]) => (
              <label className="field" key={field}>
                {label} (America/Chicago)
                <input
                  type="datetime-local"
                  value={draft[field]}
                  onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
                />
              </label>
            ))}
          </>
        ) : null}
        <label className="field">
          Unresolved issues or remaining work
          <textarea
            aria-label="Unresolved issues or remaining work"
            value={draft.unresolvedIssues}
            onChange={(e) =>
              setDraft((d) => ({ ...d, unresolvedIssues: e.target.value }))
            }
          />
        </label>
        <label className="field">
          Initial report or revision reason
          <textarea
            aria-label="Initial report or revision reason"
            value={draft.revisionReason}
            onChange={(e) => setDraft((d) => ({ ...d, revisionReason: e.target.value }))}
          />
        </label>
        <h3>Your retained evidence for this report</h3>
        {view?.artifacts
          .filter((a) => a.state === "retained")
          .map((a) => (
            <label key={a.id}>
              <input
                type="checkbox"
                checked={draft.artifactIds.includes(a.id)}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    artifactIds: e.target.checked
                      ? [...new Set([...d.artifactIds, a.id])]
                      : d.artifactIds.filter((id) => id !== a.id),
                  }))
                }
              />
              {a.filename} · {a.purpose}
            </label>
          ))}
        <button type="button" onClick={() => void submit()}>
          Submit exact report for PMI review
        </button>
        {draft.submissionId ? (
          <button type="button" onClick={() => setDraft(empty())}>
            Start a separate report
          </button>
        ) : null}
      </fieldset>
      <fieldset disabled={busy || !ready || !view || !!pending || needsCurrent}>
        <legend>Retain a relevant work photo or document</legend>
        <p>
          Passive PDF, JPEG, PNG and WebP; up to 5 MiB. Core evidence is retained
          indefinitely. Include only work photos, quotes, invoices or completion evidence;
          exclude raw conversations and recordings.
        </p>
        <label className="field">
          Evidence purpose
          <select
            disabled={!!fileIntent}
            value={filePurpose}
            onChange={(e) => setFilePurpose(e.target.value as typeof filePurpose)}
          >
            {["work_photo", "quote", "invoice", "completion"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Select or capture actual evidence
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setFileAck(false);
            }}
          />
        </label>
        {file ? (
          <p>
            {file.name} · {file.size} bytes · {file.type || "Type unavailable"} · target:
            this assigned case
          </p>
        ) : null}
        <label>
          <input
            type="checkbox"
            checked={fileAck}
            onChange={(e) => setFileAck(e.target.checked)}
          />
          This is actual relevant core work evidence; I approve its indefinite retention.
        </label>
        <button type="button" disabled={!file || !fileAck} onClick={() => void upload()}>
          {fileIntent ? "Resume exact original file" : "Retain exact selected file"}
        </button>
        {fileIntent ? (
          <button type="button" onClick={() => void checkFile()}>
            Check original retained file
          </button>
        ) : null}
      </fieldset>
      <p role="status">{fileStatus}</p>
      <ul>
        {view?.artifacts.map((a) => (
          <li key={a.id}>
            {a.filename} · {a.state} · {a.sizeBytes} bytes · <code>{a.sha256}</code>
            {a.state === "retained" ? (
              <a
                href={`${base}/artifacts?${new URLSearchParams({ artifact_id: a.id, download: "1" })}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Read original retained file
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      <p>
        Mailbox connection is optional and does not grant ticket access. Vendors report
        work; PMI makes the final closeout decision.
      </p>
    </section>
  );
}
