"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { formatCalendarDate } from "@/lib/date-display";

import { renewalCardTitle } from "@/components/lease-renewal/RenewalSectionHeading";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Field } from "@/components/ui";
import { DownloadLink } from "@/components/ui/DownloadLink";
import { useRenewalManualWorkspace } from "./RenewalManualWorkspace";
import type { RenewalPacketSnapshot } from "@/lib/lease-documents/packet-types";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";
import type {
  LoopAssociationDocument,
  LoopAssociationView,
  LoopPropertyAddress,
} from "@/lib/lease-documents/dotloop-loop-association";
import {
  DotloopPacketLinkPanel,
  type StaffExecutionReport,
} from "./DotloopPacketLinkPanel";

/** S120 (R120.7): the current source-backed facts the owning page already resolved. */
export interface DocumentHandoffFacts {
  address: string | null;
  owners: string[];
  tenants: string[];
  leaseEndDate: string | null;
}
interface Handoff {
  snapshot: RenewalPacketSnapshot | null;
  signers?: string[];
  documents?: Array<{
    artifactId: string;
    label: string;
    documentRef: string;
    status?:
      | "uploaded_current"
      | "successor_needed"
      | "not_uploaded"
      | "filled_output_needed";
    statusLabel?: string;
    history?: LoopAssociationDocument[];
    unchangedAttachment?: boolean;
  }>;
  blockers: string[];
  readiness: { state: string };
  catalogVersion: string;
  attempts?: Array<{ executionId: string; state: string }>;
  /** S34: each operation's own exact key and its blockers. */
  operations?: {
    create: { actionKey: string; blockers: string[] };
    upload: { actionKey: string; blockers: string[] };
  };
  association?: LoopAssociationView | null;
  propertyAddress?: LoopPropertyAddress | null;
  staffReport?: StaffExecutionReport | null;
}
interface LoopReview {
  observation: {
    loopId: string;
    name: string;
    status: string | null;
    loopUrl: string | null;
    participants: Array<{ fullName: string; email: string; role: string }>;
  };
  observationHash: string;
  archived: boolean;
  recordedForOtherLease: boolean;
  servedEarlierCycle: boolean;
  expectedLinkRevision: number;
}
/** A pasted Dotloop loop address or number becomes the loop number; anything else is kept as typed. */
function loopNumberOf(value: string): string {
  const trimmed = value.trim();
  const fromAddress = /\/loop\/(\d+)/.exec(trimmed);
  return fromAddress ? fromAddress[1] : trimmed;
}
interface Preview {
  executionId: string;
  previewHash: string;
  state: string;
  packetHash: string;
  operation: string;
  participants: Array<{ name: string; email: string; role: string }>;
  artifacts: Array<{ label: string; version?: string; downloadUrl?: string }>;
  fields?: Array<{ label: string; value: string; source: string }>;
  actionKey?: string;
  loopTarget?: {
    loopId: string;
    origin: "app_created" | "linked_existing";
    folderRecorded: boolean;
  } | null;
  supersedes?: { contentHash: string; uploadedAt: string } | null;
  propertyAddress?: LoopPropertyAddress | null;
  selection?: {
    profileId: string;
    templateId: string;
    transactionType: string;
    initialStatus: string;
  };
}
export function RenewalDocumentHandoff({
  canApprove = false,
  canRecordReadback = false,
  canLinkLoop = false,
  facts = null,
}: {
  canApprove?: boolean;
  canRecordReadback?: boolean;
  canLinkLoop?: boolean;
  facts?: DocumentHandoffFacts | null;
}) {
  const ctx = useRenewalManualWorkspace();
  return ctx ? (
    <DocumentHandoffEditor
      key={`${ctx.leaseId}:${ctx.state?.cycleId ?? "pending"}:${ctx.state?.termsRevision ?? 0}`}
      leaseId={ctx.leaseId}
      canApprove={canApprove}
      canRecordReadback={canRecordReadback}
      canLinkLoop={canLinkLoop}
      facts={facts}
      state={ctx.state}
    />
  ) : null;
}
const money = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });
/**
 * S120 (R120.7): the facts the packet work already has, each with its origin and the control that
 * records it. Display only: nothing here fills a file, a provider field or a signature.
 */
function PacketFacts({
  facts,
  state,
}: {
  facts: DocumentHandoffFacts | null;
  state: RenewalWorkspaceState | null;
}) {
  const terms =
    state?.ownerResponse?.outcome === "approved_terms"
      ? (state.ownerResponse.terms ?? null)
      : null;
  const pendingUpdates = Object.values(state?.sourceUpdates ?? {}).filter(
    (update) => update.state !== "verified",
  ).length;
  const leaseDetails = (
    <a className="text-link" href="#renewal-section-lease-details">
      Lease details
    </a>
  );
  const sourceFact = (label: string, value: string | null) => (
    <li>
      <strong>{label}</strong>: {value ?? "Needs verification"} · {leaseDetails}
    </li>
  );
  return (
    <section aria-label="Current facts for this packet" className="ui-stack-tight">
      <h3>Current facts for this packet</h3>
      <ul className="ui-rows">
        {sourceFact("Property", facts?.address ?? null)}
        {sourceFact("Owners", facts?.owners.length ? facts.owners.join(", ") : null)}
        {sourceFact("Tenants", facts?.tenants.length ? facts.tenants.join(", ") : null)}
        {sourceFact(
          "Current lease end",
          facts?.leaseEndDate ? formatCalendarDate(facts.leaseEndDate) : null,
        )}
        <li>
          <strong>Approved terms</strong>:{" "}
          {terms ? (
            <>
              {money(terms.rent)} per month, effective{" "}
              {formatCalendarDate(terms.effectiveDate)} through{" "}
              {formatCalendarDate(terms.endDate)} (recorded owner response) ·{" "}
              <a className="text-link" href="#renewal-manual-owner_response">
                Open the owner response
              </a>
            </>
          ) : (
            <>
              Not available for the packet yet. The packet reads terms recorded with the
              owner response and does not read the working renewal terms ·{" "}
              <a className="text-link" href="#renewal-manual-owner_response">
                Record the owner response
              </a>
            </>
          )}
        </li>
        <li>
          <strong>Source updates</strong>:{" "}
          {pendingUpdates
            ? `${pendingUpdates} pending source update${pendingUpdates === 1 ? "" : "s"}`
            : "No pending source update"}{" "}
          ·{" "}
          <a className="text-link" href="#renewal-step-verify-renewal">
            Review Sheet updates
          </a>
        </li>
      </ul>
      <p className="muted">
        Recorded source facts; provider receipts and signatures are separate. Other forms
        retain their manual Dotloop handoff.
      </p>
    </section>
  );
}
function DocumentHandoffEditor({
  leaseId,
  canApprove,
  canRecordReadback,
  canLinkLoop,
  facts,
  state,
}: {
  leaseId: string;
  canApprove: boolean;
  canRecordReadback: boolean;
  canLinkLoop: boolean;
  facts: DocumentHandoffFacts | null;
  state: RenewalWorkspaceState | null;
}) {
  const [current, setCurrent] = useState<Handoff | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState(false),
    [confirming, setConfirming] = useState(false),
    [reason, setReason] = useState(""),
    [loopInput, setLoopInput] = useState(""),
    [review, setReview] = useState<LoopReview | null>(null),
    [linkReason, setLinkReason] = useState(""),
    [reuseConfirmed, setReuseConfirmed] = useState(false),
    [correctionReason, setCorrectionReason] = useState("");
  const sequence = useRef(0);
  const load = useCallback(() => {
    const runId = ++sequence.current;
    return fetch(
      `/api/lease-renewal/document-handoff?leaseId=${encodeURIComponent(leaseId)}`,
      { cache: "no-store" },
    ).then(async (response) => {
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Document readiness could not be read.");
      if (runId === sequence.current) setCurrent(data);
    });
  }, [leaseId]);
  useEffect(() => {
    let active = true;
    void load().catch((error) => {
      if (active) setNotice(error.message);
    });
    return () => {
      active = false;
      sequence.current++;
    };
  }, [load]);
  async function run(body: Record<string, unknown>) {
    setPending(true);
    setNotice("");
    setConfirming(false);
    try {
      const response = await fetch("/api/lease-renewal/document-handoff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, leaseId }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error ?? "Document action unavailable; retain the existing attempt.",
        );
      if (body.kind === "preview") setPreview(data);
      else if (body.kind === "loop_review") {
        setReview(data);
        setLinkReason("");
        setReuseConfirmed(false);
      } else if (body.kind === "loop_link" || body.kind === "loop_unlink") {
        setNotice(
          body.kind === "loop_link"
            ? "Loop linked to this lease. Nothing changed in Dotloop."
            : "The lease's loop link was corrected. Nothing changed in Dotloop; a person retires files or archives a loop there.",
        );
        setReview(null);
        setCorrectionReason("");
        setPreview(null);
      } else {
        setNotice(
          `Packet action: ${data.execution?.state ?? data.status ?? "read back"}. Document presence does not prove signatures.`,
        );
        setPreview(null);
      }
      await load();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The result is uncertain. Recover the existing attempt before creating another.",
      );
    } finally {
      setPending(false);
    }
  }
  const association = current?.association ?? null;
  const linked =
    association?.state === "current" && association.currentCycle ? association : null;
  const createBlockers = current?.operations?.create.blockers ?? [];
  const uploadBlockers = current?.operations?.upload.blockers ?? [];
  const loopNumber = loopNumberOf(loopInput);
  return (
    <Card
      title={renewalCardTitle(
        "document-handoff",
        "Document preparation and signature handoff",
      )}
      ariaLabel="Document preparation and signature handoff"
    >
      <p>A person sends for signature from Dotloop.</p>
      <PacketFacts facts={facts} state={state} />
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => void load().catch((error) => setNotice(error.message))}
      >
        Reload document readiness and attempts
      </Button>
      {notice ? <p role="status">{notice}</p> : null}
      {current ? (
        <>
          <p>
            Dotloop: {current.readiness.state}. Catalog: {current.catalogVersion}.
          </p>
          {current.blockers.length ? (
            <ul>
              {current.blockers.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
          <p>
            <a href="/connections">Open Connections for Dotloop setup</a> ·{" "}
            <a href="#renewal-resource-locations">
              Review approved legal-form location inputs
            </a>
          </p>
          <h3>Dotloop loop for this lease</h3>
          <p className="muted">
            Create one loop from the company template, or link an existing loop you
            reviewed. A changed packet never creates another loop; reviewed new versions
            upload into the same loop.
          </p>
          <Button
            disabled={
              pending ||
              !!current.blockers.length ||
              !!createBlockers.length ||
              association?.state === "current" ||
              association?.state === "creating"
            }
            onClick={() => run({ kind: "preview", operation: "loop_create" })}
          >
            Preview exact Dotloop packet creation
          </Button>
          {createBlockers.length ? (
            <ul aria-label="Loop creation needs">
              {createBlockers.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
          {!linked ? (
            <div className="ui-stack-tight" data-dotloop-link-existing>
              <Field
                label="Existing Dotloop loop number or address"
                htmlFor="dotloop-existing-loop"
                hint="Reviewing reads the loop through the company connection and changes nothing."
              >
                <input
                  id="dotloop-existing-loop"
                  value={loopInput}
                  onChange={(event) => setLoopInput(event.target.value)}
                />
              </Field>
              <Button
                variant="secondary"
                disabled={pending || !canLinkLoop || !/^[1-9]\d{0,18}$/.test(loopNumber)}
                onClick={() => run({ kind: "loop_review", loopId: loopNumber })}
              >
                Review existing loop
              </Button>
            </div>
          ) : null}
          {review ? (
            <div
              role="group"
              aria-label="Existing loop review"
              className="ui-stack-tight"
            >
              <p>
                Loop {review.observation.loopId}: {review.observation.name} · status{" "}
                {review.observation.status ?? "Needs Verification"}
              </p>
              <ul>
                {review.observation.participants.map((participant) => (
                  <li key={`${participant.role}:${participant.email}`}>
                    {participant.fullName || "Unnamed participant"} · {participant.email}{" "}
                    · {participant.role}
                  </li>
                ))}
              </ul>
              <p className="muted">
                A matching name or address is a hint only. Confirm this is the loop for
                this lease.
              </p>
              {review.archived ? (
                <p role="alert">
                  This loop is archived and cannot receive renewal documents.
                </p>
              ) : null}
              {review.recordedForOtherLease ? (
                <p role="alert">This loop is recorded for a different lease.</p>
              ) : null}
              {review.servedEarlierCycle ? (
                <label>
                  <input
                    type="checkbox"
                    checked={reuseConfirmed}
                    onChange={(event) => setReuseConfirmed(event.target.checked)}
                  />{" "}
                  This loop served an earlier renewal of this lease; reuse it for this
                  cycle
                </label>
              ) : null}
              <Field
                label="Why this loop belongs to this lease"
                htmlFor="dotloop-link-reason"
              >
                <input
                  id="dotloop-link-reason"
                  value={linkReason}
                  onChange={(event) => setLinkReason(event.target.value)}
                />
              </Field>
              <Button
                disabled={
                  pending ||
                  !canLinkLoop ||
                  review.archived ||
                  review.recordedForOtherLease ||
                  (review.servedEarlierCycle && !reuseConfirmed) ||
                  linkReason.trim().length < 3
                }
                onClick={() =>
                  run({
                    kind: "loop_link",
                    loopId: review.observation.loopId,
                    observationHash: review.observationHash,
                    reason: linkReason,
                    expectedLinkRevision: review.expectedLinkRevision,
                    reuseAcrossCycles: review.servedEarlierCycle && reuseConfirmed,
                  })
                }
              >
                Link this loop to the lease
              </Button>
            </div>
          ) : null}
          {association && association.state !== "unlinked" ? (
            <details>
              <summary>
                {association.state === "creating"
                  ? "Clear the unresolved loop creation"
                  : "Correct the lease's loop link"}
              </summary>
              <p className="muted">
                {association.state === "creating"
                  ? "Check Dotloop first: if the loop was created, link it instead of clearing."
                  : "This changes only the app's link. Dotloop keeps the loop and its files; a person retires files or archives a loop there."}
              </p>
              <Field label="Correction reason" htmlFor="dotloop-correction-reason">
                <input
                  id="dotloop-correction-reason"
                  value={correctionReason}
                  onChange={(event) => setCorrectionReason(event.target.value)}
                />
              </Field>
              <Button
                variant="secondary"
                disabled={pending || !canLinkLoop || correctionReason.trim().length < 3}
                onClick={() =>
                  run({
                    kind: "loop_unlink",
                    expectedLinkRevision: association.linkRevision,
                    reason: correctionReason,
                  })
                }
              >
                {association.state === "creating"
                  ? "Clear the unresolved creation"
                  : "Correct the loop link"}
              </Button>
            </details>
          ) : null}
          {linked ? (
            <>
              <h3>Approved documents for the loop</h3>
              {uploadBlockers.length ? (
                <ul aria-label="Upload needs">
                  {uploadBlockers.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              ) : null}
              <ul className="ui-rows">
                {current.documents?.map((artifact) => (
                  <li key={artifact.artifactId} data-document-status={artifact.status}>
                    <strong>{artifact.label}</strong>
                    {artifact.unchangedAttachment
                      ? " (unchanged approved attachment)"
                      : ""}
                    {artifact.statusLabel ? `: ${artifact.statusLabel}` : ""}
                    {artifact.history?.length ? (
                      <ul className="muted">
                        {artifact.history.map((version) => (
                          <li key={version.receiptId}>
                            Uploaded {formatCalendarDate(version.uploadedAt.slice(0, 10))}{" "}
                            as {version.documentName || "a file"} (SHA-256{" "}
                            {version.contentHash.slice(0, 12)})
                            {version.supersedesContentHash
                              ? ", superseding an earlier version"
                              : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {artifact.status === "not_uploaded" ||
                    artifact.status === "successor_needed" ? (
                      <Button
                        variant="secondary"
                        disabled={
                          pending || !!current.blockers.length || !!uploadBlockers.length
                        }
                        onClick={() =>
                          run({
                            kind: "preview",
                            operation: "document_upload",
                            documentRef: artifact.documentRef,
                          })
                        }
                      >
                        {artifact.status === "successor_needed"
                          ? `Review successor upload: ${artifact.label}`
                          : `Review upload: ${artifact.label}`}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {current.attempts
            ?.filter((attempt) =>
              ["Executing", "Needs reconciliation", "Succeeded"].includes(attempt.state),
            )
            .map((attempt) => (
              <p key={attempt.executionId}>
                Existing packet attempt: {attempt.state}.{" "}
                <Button
                  disabled={pending}
                  onClick={() =>
                    run({ kind: "reconcile", executionId: attempt.executionId })
                  }
                >
                  Recover exact packet attempt
                </Button>
              </p>
            ))}
          {linked ? (
            <Button
              disabled={pending || !canRecordReadback}
              variant="secondary"
              onClick={() => run({ kind: "readback" })}
            >
              Refresh from Dotloop
            </Button>
          ) : null}
          <DotloopPacketLinkPanel
            association={association}
            requiredSigners={current.signers ?? []}
            refreshAvailable={
              canRecordReadback && current.readiness.state === "connected"
            }
            refreshUnavailableReason={
              canRecordReadback
                ? undefined
                : "Editor access is required to refresh the loop from Dotloop."
            }
            staffReport={current.staffReport ?? null}
          />
        </>
      ) : null}
      {preview ? (
        <div role="group" aria-label="Exact document action preview">
          <p>
            {preview.operation === "loop_create"
              ? "Create one loop from the approved packet"
              : preview.supersedes
                ? "Upload the reviewed successor of an earlier uploaded version"
                : "Upload the selected approved document"}
            . Packet hash: {preview.packetHash}
          </p>
          {preview.actionKey ? <p>Exact action: {preview.actionKey}.</p> : null}
          {preview.loopTarget ? (
            <p>
              Into loop {preview.loopTarget.loopId} (
              {preview.loopTarget.origin === "app_created"
                ? "created by the app"
                : "an existing loop staff linked"}
              ).{" "}
              {preview.loopTarget.folderRecorded
                ? "The lease's recorded packet folder is reused."
                : "A Renewal packet folder is created once and reused for every later document."}
            </p>
          ) : null}
          {preview.supersedes ? (
            <p>
              The earlier version uploaded{" "}
              {formatCalendarDate(preview.supersedes.uploadedAt.slice(0, 10))} stays in
              Dotloop; a person retires it there before sending for signature.
            </p>
          ) : null}
          {preview.operation === "loop_create" ? (
            <p>
              Property address for the new loop:{" "}
              {preview.propertyAddress
                ? `${preview.propertyAddress.streetName}, ${preview.propertyAddress.city}, ${preview.propertyAddress.state} ${preview.propertyAddress.zip}`
                : "not included. Enter the street, city, state and ZIP in Packet inputs to include it."}
            </p>
          ) : null}
          <ul>
            {preview.participants.map((p) => (
              <li key={`${p.role}:${p.email}`}>
                {p.name} · {p.email} · {p.role}
              </li>
            ))}
          </ul>
          <ul>
            {preview.artifacts.map((a) => (
              <li key={a.label}>
                {a.downloadUrl ? (
                  <DownloadLink fileName={a.label} href={a.downloadUrl}>
                    Inspect approved file: {a.label}
                  </DownloadLink>
                ) : (
                  a.label
                )}{" "}
                · {a.version}
              </li>
            ))}
          </ul>
          {preview.selection ? (
            <p>
              Dotloop profile {preview.selection.profileId} · template{" "}
              {preview.selection.templateId} · {preview.selection.transactionType} ·
              initial status {preview.selection.initialStatus}.
            </p>
          ) : null}
          {preview.fields?.length ? (
            <>
              <p>Reviewed source fields for document preparation:</p>
              <ul>
                {preview.fields.map((field) => (
                  <li key={`${field.label}:${field.source}`}>
                    {field.label}: {field.value} ({field.source})
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {!canApprove ? (
            <p>
              A renewal staff member with edit access confirms this saved action from this
              lease dashboard.
            </p>
          ) : null}
          <Field label="Confirmation reason" htmlFor="packet-approval-reason" required>
            <input
              id="packet-approval-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          {!confirming ? (
            <Button disabled={pending || !canApprove} onClick={() => setConfirming(true)}>
              Review packet confirmation
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => setConfirming(false)}
              >
                Cancel packet action
              </Button>
              <Button
                disabled={pending || !canApprove || reason.trim().length < 3}
                onClick={() =>
                  run({
                    kind: "confirm",
                    executionId: preview.executionId,
                    previewHash: preview.previewHash,
                    reason,
                  })
                }
              >
                Confirm this exact packet action
              </Button>
            </>
          )}
        </div>
      ) : null}
      <p>
        <a href="#renewal-manual-documents">Record documents prepared outside the app</a>{" "}
        ·{" "}
        <a href="#renewal-manual-signatures">
          Record returned signed-artifact evidence and staff completion
        </a>
      </p>
    </Card>
  );
}
