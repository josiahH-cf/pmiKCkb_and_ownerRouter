"use client";
import { UserActionError, actionFailureMessage } from "@/lib/ui/action-feedback";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import {
  VendorPacketInputSchema,
  type VendorRosterRecord,
  type VendorSelection,
  type VendorPacket,
  type VendorContribution,
  type VendorArtifact,
} from "@/lib/maintenance/vendor-work-model";
import { formatBusinessTimestamp } from "@/lib/date-display";
type View = {
  coreArtifacts: Array<{ id: string; filename: string; purpose: string }>;
  selection: VendorSelection | null;
  packet: VendorPacket | null;
  packetCurrent: boolean;
  contributions: VendorContribution[];
  artifacts: VendorArtifact[];
};
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
export function MaintenanceVendorWorkPanel({
  ticket,
  canEdit,
  blocked,
  onApply,
  pendingCommand,
}: {
  ticket: MaintenanceTicketRecord;
  canEdit: boolean;
  blocked: boolean;
  onApply: (command: Record<string, unknown>) => Promise<boolean>;
  pendingCommand?: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(false),
    [view, setView] = useState<View | null>(null),
    [roster, setRoster] = useState<VendorRosterRecord[]>([]),
    [vendorId, setVendorId] = useState(""),
    [category, setCategory] = useState(""),
    [reason, setReason] = useState(""),
    [status, setStatus] = useState(""),
    [packet, setPacket] = useState(() => ({
      issue: ticket.summary,
      location: ticket.unit?.label ?? "",
      access: "",
      scheduling: "",
      approvedScope: ticket.assessment?.scope ?? "",
      costLimit: "",
      authorizationRef: "",
      troubleshooting: [{ step: "", outcome: "" }],
      artifactIds: [] as string[],
      reviewedForVendor: false,
      reason: "",
    })),
    [reviewReasons, setReviewReasons] = useState<Record<string, string>>({}),
    [sendRef, setSendRef] = useState(""),
    [sendReason, setSendReason] = useState("");
  const generation = useRef(0),
    base = `/api/maintenance/tickets/${encodeURIComponent(ticket.id)}`;
  useEffect(() => {
    if (!open) return;
    const g = ++generation.current,
      c = new AbortController();
    void Promise.all([
      fetch(`${base}/vendor-work`, { cache: "no-store", signal: c.signal }),
      fetch("/api/maintenance/vendors", { cache: "no-store", signal: c.signal }),
    ])
      .then(async (responses) => {
        const bodies = await Promise.all(responses.map((r) => r.json()));
        if (responses.some((r) => !r.ok))
          throw new UserActionError(
            bodies.find((_, i) => !responses[i].ok)?.error ??
              "The complete vendor work and preferences are unavailable.",
          );
        if (g === generation.current) {
          setView(bodies[0]);
          setRoster(bodies[1].roster);
          setStatus("");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted && g === generation.current)
          setStatus(
            actionFailureMessage(
              e,
              "No vendor state was inferred from an incomplete read.",
            ),
          );
      });
    return () => {
      c.abort();
      generation.current++;
    };
  }, [open, base, ticket.record_version]);
  useEffect(() => {
    if (!pendingCommand) return;
    queueMicrotask(() => {
      if (pendingCommand.op === "vendor_selection") {
        setVendorId(String(pendingCommand.vendorId));
        setReason(String(pendingCommand.reason));
        setOpen(true);
      } else if (pendingCommand.op === "vendor_packet") {
        const p = VendorPacketInputSchema.safeParse(pendingCommand.packet);
        if (p.success) {
          setPacket({
            ...p.data,
            costLimit:
              p.data.costLimitCents === null ? "" : String(p.data.costLimitCents / 100),
            authorizationRef: p.data.authorizationRef ?? "",
            reviewedForVendor: true,
          });
          setOpen(true);
        }
      } else if (pendingCommand.op === "vendor_review") {
        setReviewReasons((v) => ({
          ...v,
          [String(pendingCommand.submissionId)]: String(pendingCommand.reason),
        }));
        setOpen(true);
      } else if (pendingCommand.op === "vendor_handoff_report") {
        setSendRef(String(pendingCommand.sourceRef));
        setSendReason(String(pendingCommand.reason));
        setOpen(true);
      }
    });
  }, [pendingCommand]);
  async function savePacket() {
    if (!view?.selection) return;
    try {
      const limit = packet.costLimit.trim();
      if (limit && !/^\d{1,8}(?:\.\d{1,2})?$/.test(limit))
        throw new UserActionError(
          "Enter an actual authorized USD amount with at most two decimal places.",
        );
      const { costLimit: editorLimit, ...terms } = packet;
      void editorLimit;
      const data = VendorPacketInputSchema.parse({
        ...terms,
        costLimitCents: limit ? Math.round(Number(limit) * 100) : null,
        authorizationRef: packet.authorizationRef.trim() || null,
        troubleshooting: packet.troubleshooting.filter((s) => s.step || s.outcome),
      });
      if (
        await onApply({
          op: "vendor_packet",
          selectionVersion: view.selection.version,
          rosterVersion: view.selection.rosterVersion,
          packet: data,
        })
      ) {
        setStatus(
          "Reviewed handoff saved. It has not granted access or dispatched a message.",
        );
        setPacket((p) => ({ ...p, reviewedForVendor: false, reason: "" }));
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Review the actual handoff facts.");
    }
  }
  function editPacket(p: VendorPacket) {
    setPacket({
      issue: p.issue,
      location: p.location,
      access: p.access,
      scheduling: p.scheduling,
      approvedScope: p.approvedScope,
      costLimit: p.costLimitCents === null ? "" : String(p.costLimitCents / 100),
      authorizationRef: p.authorizationRef ?? "",
      troubleshooting: p.troubleshooting.length
        ? p.troubleshooting
        : [{ step: "", outcome: "" }],
      artifactIds: p.artifactIds,
      reviewedForVendor: false,
      reason: "",
    });
  }
  async function copyPacket() {
    if (!view?.packetCurrent || !view.packet) return;
    const p = view.packet,
      words = [
        p.issue,
        p.location,
        `Scope: ${p.approvedScope}`,
        `Access: ${p.access || "Not yet established; PMI to coordinate"}`,
        `Scheduling: ${p.scheduling || "Not yet established"}`,
        `Cost limit: ${p.costLimitCents === null ? "No spending authority included" : `${money(p.costLimitCents)}; basis ${p.costBasis ?? "unknown"}; evidence ${p.authorizationRef}`}`,
        ...p.troubleshooting.map((s) => `${s.step}: ${s.outcome}`),
        `Approved attachment references: ${p.artifactIds.join(", ") || "None"}`,
      ].join("\n");
    try {
      await navigator.clipboard.writeText(words);
      setStatus(
        "Current reviewed handoff copied. Delivery remains a separate human action.",
      );
    } catch {
      setStatus("Clipboard unavailable. Select and copy the displayed reviewed packet.");
    }
  }
  return (
    <details open={open} className="maintenance-vendor-work">
      <summary
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        Vendor selection, reviewed handoff and contributions
      </summary>
      <p>
        <Link href="/maintenance/vendors">
          Manage verified primary and backup preferences
        </Link>
      </p>
      <p role="status">{status}</p>
      {view ? (
        <>
          <p>
            Selected:{" "}
            {view.selection
              ? `${roster.find((r) => r.vendorId === view.selection!.vendorId)?.contactEmail ?? view.selection.vendorId} · selection version ${view.selection.version}`
              : "No vendor deliberately selected"}
            .
          </p>
          <p>
            Portal assignment: {ticket.vendor_id ?? "None"}. Use the existing Admin
            lifecycle controls to grant or remove access. RentVine assignment and message
            delivery remain separate.
          </p>
          {view.packet ? (
            <article className="panel">
              <h4>Reviewed vendor packet · version {view.packet.version}</h4>
              <p>
                {view.packetCurrent
                  ? "Current reviewed work"
                  : "Changed work or preferences; fresh packet review required"}
              </p>
              <p>{view.packet.issue}</p>
              <p>{view.packet.location}</p>
              <p>Scope: {view.packet.approvedScope}</p>
              <p>Access: {view.packet.access || "Not established; PMI to coordinate"}</p>
              <p>Scheduling: {view.packet.scheduling || "Not established"}</p>
              <p>
                Cost limit:{" "}
                {view.packet.costLimitCents === null
                  ? "No spending authority included"
                  : `${money(view.packet.costLimitCents)} · ${view.packet.costBasis ?? "unknown basis"}`}
              </p>
              <ul>
                {view.packet.troubleshooting.map((s, i) => (
                  <li key={i}>
                    {s.step}: {s.outcome}
                  </li>
                ))}
              </ul>
              <p>
                Approved attachment references:{" "}
                {view.packet.artifactIds.join(", ") || "None"}
              </p>
              <button
                type="button"
                disabled={!view.packetCurrent}
                onClick={() => void copyPacket()}
              >
                Copy current reviewed handoff
              </button>
              {canEdit ? (
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => editPacket(view.packet!)}
                >
                  Edit this handoff for fresh review
                </button>
              ) : null}
            </article>
          ) : (
            <p>No reviewed work packet is saved.</p>
          )}
          <h4>Vendor-reported evidence for PMI review</h4>
          {view.contributions.length === 0 ? (
            <p>No vendor contributions recorded.</p>
          ) : (
            view.contributions.map((s) => (
              <article className="panel" key={s.submissionId}>
                <h5>
                  {s.kind} · vendor {s.vendorId} · version {s.version} · {s.review.state}
                </h5>
                <p>{s.description}</p>
                <p>
                  Occurred {formatBusinessTimestamp(s.occurredAt)}; recorded{" "}
                  {formatBusinessTimestamp(s.recordedAt)}.
                </p>
                {s.quoteBasis ? (
                  <p>
                    {s.quoteBasis} · total{" "}
                    {money(s.lines.reduce((a, l) => a + l.amountCents, 0))}
                  </p>
                ) : null}
                <ul>
                  {s.lines.map((l, i) => (
                    <li key={i}>
                      {l.description}: {money(l.amountCents)}
                    </li>
                  ))}
                </ul>
                {s.invoiceId ? (
                  <p>
                    Invoice {s.invoiceId}; issue {s.issueDate}; service {s.serviceDate}.
                    Reported invoice evidence; no payment or accounting post is
                    established.
                  </p>
                ) : null}
                {s.proposedStart ? (
                  <p>
                    Proposed visit {formatBusinessTimestamp(s.proposedStart)} to{" "}
                    {formatBusinessTimestamp(s.proposedEnd!)}. PMI acceptance remains
                    explicit.
                  </p>
                ) : null}
                {s.kind === "invoice" ? (
                  <p>
                    {s.invoiceMeaning === "credit"
                      ? "Vendor-reported credit"
                      : "Vendor-reported invoice"}{" "}
                    {s.invoiceId}; issued {s.issueDate}, service {s.serviceDate}. Review
                    does not establish payment or an accounting post.
                  </p>
                ) : null}
                <p>Unresolved issues: {s.unresolvedIssues || "None reported"}</p>
                <ul>
                  {s.artifactIds.map((id) => {
                    const a = view.artifacts.find((a) => a.id === id);
                    return (
                      <li key={id}>
                        {a?.filename ?? id}{" "}
                        {a?.state === "retained" ? (
                          <a
                            href={`${base}/vendor-work?${new URLSearchParams({ artifact_id: id, download: "1" })}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Read original vendor evidence
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                <p>
                  PMI review: {s.review.reason || "Pending"}. Review does not approve
                  spending, verify payment or close the case.
                </p>
                {canEdit ? (
                  <fieldset disabled={blocked}>
                    <label className="field">
                      Shared vendor review or return reason
                      <textarea
                        value={reviewReasons[s.submissionId] ?? ""}
                        onChange={(e) =>
                          setReviewReasons((v) => ({
                            ...v,
                            [s.submissionId]: e.target.value,
                          }))
                        }
                      />
                    </label>
                    {(["accepted", "returned"] as const).map((decision) => (
                      <button
                        type="button"
                        key={decision}
                        onClick={() =>
                          void onApply({
                            op: "vendor_review",
                            submissionId: s.submissionId,
                            expectedSubmissionVersion: s.version,
                            decision,
                            reason: reviewReasons[s.submissionId] ?? "",
                          })
                        }
                      >
                        {decision === "accepted"
                          ? "Accept this reported evidence"
                          : "Return to vendor with reason"}
                      </button>
                    ))}
                  </fieldset>
                ) : null}
              </article>
            ))
          )}
        </>
      ) : (
        <p>Open this section to read current verified preferences and contributions.</p>
      )}
      {canEdit ? (
        <fieldset disabled={blocked || !view}>
          <legend>Choose and review vendor work</legend>
          <label className="field">
            Service category filter
            <input value={category} onChange={(e) => setCategory(e.target.value)} />
          </label>
          <label className="field">
            Suitable verified vendor
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">Choose deliberately</option>
              {roster
                .filter(
                  (r) =>
                    r.active &&
                    r.availability !== "unavailable" &&
                    (!category ||
                      r.categories.some((c) =>
                        c.toLowerCase().includes(category.toLowerCase()),
                      )),
                )
                .sort(
                  (a, b) =>
                    ({ primary: 0, backup: 1, alternative: 2 })[a.preference] -
                    { primary: 0, backup: 1, alternative: 2 }[b.preference],
                )
                .map((r) => (
                  <option key={r.vendorId} value={r.vendorId}>
                    {r.preference} · {r.contactEmail} · {r.categories.join(", ")} ·{" "}
                    {r.availability}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            Suitability or alternative-selection reason
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button
            type="button"
            onClick={() =>
              void onApply({
                op: "vendor_selection",
                vendorId,
                rosterVersion: roster.find((r) => r.vendorId === vendorId)?.version ?? 0,
                reason,
              })
            }
          >
            Select reviewed vendor
          </button>
          <details>
            <summary>Prepare or correct reviewed work packet</summary>
            {(
              [
                ["issue", "Actual issue"],
                ["location", "Verified work location"],
                ["access", "Applicable access details (blank if not established)"],
                ["scheduling", "Scheduling details (blank if not established)"],
                ["approvedScope", "Actual scope and limits"],
                ["costLimit", "Current authorized cost limit (USD, optional)"],
                [
                  "authorizationRef",
                  "Exact current authorization evidence (if cost supplied)",
                ],
                ["reason", "Packet change reason"],
              ] as const
            ).map(([field, label]) => (
              <label className="field" key={field}>
                {label}
                <textarea
                  aria-label={label}
                  value={packet[field]}
                  onChange={(e) => setPacket((p) => ({ ...p, [field]: e.target.value }))}
                />
              </label>
            ))}
            <h5>Reviewed troubleshooting and outcomes</h5>
            {packet.troubleshooting.map((s, i) => (
              <div key={i}>
                <label className="field">
                  Step {i + 1}
                  <input
                    value={s.step}
                    onChange={(e) =>
                      setPacket((p) => ({
                        ...p,
                        troubleshooting: p.troubleshooting.map((x, j) =>
                          i === j ? { ...x, step: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                </label>
                <label className="field">
                  Outcome {i + 1}
                  <input
                    value={s.outcome}
                    onChange={(e) =>
                      setPacket((p) => ({
                        ...p,
                        troubleshooting: p.troubleshooting.map((x, j) =>
                          i === j ? { ...x, outcome: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              disabled={packet.troubleshooting.length >= 30}
              onClick={() =>
                setPacket((p) => ({
                  ...p,
                  troubleshooting: [...p.troubleshooting, { step: "", outcome: "" }],
                }))
              }
            >
              Add reviewed troubleshooting step
            </button>
            <h5>Relevant retained files approved for this vendor</h5>
            {view?.coreArtifacts?.length ? (
              view.coreArtifacts.map((a) => (
                <label key={a.id}>
                  <input
                    type="checkbox"
                    checked={packet.artifactIds.includes(a.id)}
                    onChange={(e) =>
                      setPacket((p) => ({
                        ...p,
                        artifactIds: e.target.checked
                          ? [...new Set([...p.artifactIds, a.id])]
                          : p.artifactIds.filter((id) => id !== a.id),
                      }))
                    }
                  />
                  {a.filename} · {a.purpose}
                </label>
              ))
            ) : (
              <p>
                No retained core files are available. Retain the actual relevant evidence
                in this case first.
              </p>
            )}
            <label>
              <input
                type="checkbox"
                checked={packet.reviewedForVendor}
                onChange={(e) =>
                  setPacket((p) => ({ ...p, reviewedForVendor: e.target.checked }))
                }
              />
              I reviewed these exact facts and files for this vendor; they omit private
              discussion, sentiment and unreviewed liability claims.
            </label>
            <button type="button" onClick={() => void savePacket()}>
              Save reviewed vendor packet
            </button>
          </details>
          <details>
            <summary>Record an outside human handoff</summary>
            <label className="field">
              Actual external handoff evidence reference
              <input value={sendRef} onChange={(e) => setSendRef(e.target.value)} />
            </label>
            <label className="field">
              What staff actually handed off
              <textarea
                value={sendReason}
                onChange={(e) => setSendReason(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={!view?.packetCurrent}
              onClick={() =>
                void onApply({
                  op: "vendor_handoff_report",
                  packetVersion: view?.packet?.version ?? 0,
                  sourceRef: sendRef,
                  reason: sendReason,
                  occurredAt: new Date().toISOString(),
                })
              }
            >
              Record staff-reported handoff now
            </button>
            <p>This records outside work; it creates no send or provider receipt.</p>
          </details>
        </fieldset>
      ) : null}
    </details>
  );
}
