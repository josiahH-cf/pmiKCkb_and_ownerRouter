"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Field } from "@/components/ui";
import { useRenewalManualWorkspace } from "./RenewalManualWorkspace";
import type { RenewalPacketSnapshot } from "@/lib/lease-documents/packet-types";
import { DotloopPacketLinkPanel } from "./DotloopPacketLinkPanel";
interface Handoff {
  snapshot: RenewalPacketSnapshot | null;
  signers?: string[];
  documents?: Array<{ artifactId: string; label: string; documentRef: string }>;
  blockers: string[];
  readiness: { state: string };
  catalogVersion: string;
  attempts?: Array<{ executionId: string; state: string }>;
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
}: {
  canApprove?: boolean;
  canRecordReadback?: boolean;
}) {
  const ctx = useRenewalManualWorkspace();
  return ctx ? (
    <DocumentHandoffEditor
      key={`${ctx.leaseId}:${ctx.state?.cycleId ?? "pending"}:${ctx.state?.termsRevision ?? 0}`}
      leaseId={ctx.leaseId}
      canApprove={canApprove}
      canRecordReadback={canRecordReadback}
    />
  ) : null;
}
function DocumentHandoffEditor({
  leaseId,
  canApprove,
  canRecordReadback,
}: {
  leaseId: string;
  canApprove: boolean;
  canRecordReadback: boolean;
}) {
  const [current, setCurrent] = useState<Handoff | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState(false),
    [confirming, setConfirming] = useState(false),
    [reason, setReason] = useState("");
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
      else {
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
  const link = current?.snapshot?.execution?.loopLink ?? null;
  return (
    <Card
      title="Document preparation and signature handoff"
      ariaLabel="Document preparation and signature handoff"
    >
      <p>
        Prepare the current approved packet, review exact participants and forms, then
        confirm each supported provider action. Uploaded files are the exact approved
        publications; mapped fields shown here do not edit those file bytes. Review and
        complete applicable form fields in Dotloop before a person sends for signature.
        Returned signed artifacts and staff-recorded completion remain separate from
        provider document-presence receipts.
      </p>
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
          <Button
            disabled={pending || !!current.blockers.length || !!link}
            onClick={() => run({ kind: "preview", operation: "loop_create" })}
          >
            Preview exact Dotloop packet creation
          </Button>
          {link
            ? current.documents?.map((artifact) => (
                <p key={artifact.artifactId}>
                  <Button
                    variant="secondary"
                    disabled={pending || !!current.blockers.length}
                    onClick={() =>
                      run({
                        kind: "preview",
                        operation: "document_upload",
                        documentRef: artifact.documentRef,
                      })
                    }
                  >
                    Review upload: {artifact.label}
                  </Button>
                </p>
              ))
            : null}
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
          {link ? (
            <Button
              disabled={pending || !canRecordReadback}
              variant="secondary"
              onClick={() => run({ kind: "readback" })}
            >
              Refresh from Dotloop
            </Button>
          ) : null}
          <DotloopPacketLinkPanel link={link} requiredSigners={current.signers ?? []} />
        </>
      ) : null}
      {preview ? (
        <div role="group" aria-label="Exact document action preview">
          <p>
            {preview.operation === "loop_create"
              ? "Create one loop from the approved packet"
              : "Upload the selected approved document"}
            . Packet hash: {preview.packetHash}
          </p>
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
                  <a href={a.downloadUrl} target="_blank" rel="noreferrer">
                    Inspect approved file: {a.label}
                  </a>
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
              An Admin must review and confirm this saved action from this lease
              dashboard.
            </p>
          ) : null}
          <Field label="Admin approval reason" htmlFor="packet-approval-reason">
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
