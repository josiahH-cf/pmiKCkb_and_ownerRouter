"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

import { Button, Field } from "@/components/ui";
import { useState, type FormEvent } from "react";

import type { ReturnedStateView } from "@/lib/lease-documents/returned-state-service";

type Doc = ReturnedStateView["documents"][number];

/**
 * S236: which version of each packet document went out, who has signed, who still must sign and
 * in what capacity, and what each entry rests on. Staff record what they observed; every record
 * reads "Recorded by staff, not provider-verified", and the "Dotloop shows" line sits beside the
 * records and never sets a signed state. Nothing here reads or writes Dotloop.
 */
export function ReturnedDocumentsPanel({
  canRecord,
  initialView,
}: Readonly<{ canRecord: boolean; initialView: ReturnedStateView | null }>) {
  const [view, setView] = useState(initialView);
  if (!view)
    return (
      <section className="ui-stack-tight" data-renewal-field="returned-documents">
        <h3>Returned documents and signatures</h3>
        <p className="muted" role="status">
          Returned documents could not be read; nothing was changed. Reload to try again.
        </p>
      </section>
    );
  return (
    <section
      aria-label="Returned documents and signatures"
      className="ui-stack-tight"
      data-renewal-field="returned-documents"
    >
      <h3>Returned documents and signatures</h3>
      {view.manualCompletion ? (
        <p data-renewal-field="manual-signatures">{view.manualCompletion}</p>
      ) : null}
      {view.unavailable ? (
        <p className="muted">{view.unavailable}</p>
      ) : (
        <>
          <p data-renewal-field="returned-overall">
            Overall: <strong>{view.overall}</strong>
            {view.signaturesComplete
              ? ". Fully executed by staff record, not provider-verified."
              : null}
          </p>
          <p className="muted" data-renewal-field="dotloop-shows">
            {view.dotloopShows ??
              "Dotloop has not been refreshed for this packet. A refresh never sets a signed state."}
          </p>
          {view.documents.map((document) => (
            <ReturnedDocument
              canRecord={canRecord}
              document={document}
              key={`${document.kind}:${document.contentHash}`}
              onView={setView}
              view={view}
            />
          ))}
        </>
      )}
    </section>
  );
}

function ReturnedDocument({
  canRecord,
  document,
  onView,
  view,
}: Readonly<{
  canRecord: boolean;
  document: Doc;
  onView: (view: ReturnedStateView) => void;
  view: ReturnedStateView;
}>) {
  const id = `returned-${document.kind}`;
  return (
    <article
      className="ui-stack-tight"
      data-document-kind={document.kind}
      data-renewal-field="returned-document"
    >
      <h4>{document.label}</h4>
      <p className="muted">
        Version: {document.versionLabel} · {document.contentHash.slice(0, 12)}
      </p>
      <p>
        State: <strong data-renewal-field="returned-state">{document.state}</strong>
        {document.attestation ? ` · ${document.attestation}` : null}
      </p>
      {document.notes.length ? (
        <ul data-renewal-field="returned-notes">
          {document.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      {document.stillMustSign.length ? (
        <>
          <p>Still must sign:</p>
          <ul data-renewal-field="still-must-sign">
            {document.stillMustSign.map((entry) => (
              <li key={`${entry.name}:${entry.capacity}`}>
                {entry.name}, {entry.capacity}. {entry.nextAction}.
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {canRecord ? (
        <RecordForms document={document} id={id} onView={onView} view={view} />
      ) : (
        <p className="muted">
          Recording a returned document needs Editor access. The states above stay visible
          read-only.
        </p>
      )}
    </article>
  );
}

function toIso(local: string): string | null {
  const time = Date.parse(local);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function RecordForms({
  document,
  id,
  onView,
  view,
}: Readonly<{
  document: Doc;
  id: string;
  onView: (view: ReturnedStateView) => void;
  view: ReturnedStateView;
}>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(
    null,
  );
  const [sentAt, setSentAt] = useState("");
  const [sentHow, setSentHow] = useState("");
  const [signer, setSigner] = useState("");
  const [status, setStatus] = useState<"signed" | "declined_voided">("signed");
  const [observedAt, setObservedAt] = useState("");
  const [evidenceKind, setEvidenceKind] = useState<"dotloop_observed" | "signed_copy">(
    "dotloop_observed",
  );
  const [documentName, setDocumentName] = useState("");
  const [viewedAt, setViewedAt] = useState("");
  const [storageRef, setStorageRef] = useState("");

  async function submit(change: Record<string, unknown>, done: () => void) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/lease-renewal/returned-state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leaseId: view.leaseId,
          cycleId: view.cycleId,
          snapshotId: view.snapshotId,
          kind: document.kind,
          documentContentHash: document.contentHash,
          expectedRevision: document.revision,
          operationId: crypto.randomUUID(),
          change,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        view?: ReturnedStateView;
      };
      if (!response.ok || !body.view)
        throw new Error(body.error ?? "The returned document could not be recorded.");
      onView(body.view);
      done();
      setMessage({ tone: "ok", text: "Recorded by staff, not provider-verified." });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "The returned document could not be recorded.",
      });
    } finally {
      setBusy(false);
    }
  }

  function recordSent(event: FormEvent) {
    event.preventDefault();
    const at = toIso(sentAt);
    if (!at || !sentHow.trim()) {
      setMessage({
        tone: "error",
        text: "Enter when and how it was sent for signature.",
      });
      return;
    }
    void submit({ kind: "sent_for_signature", at, how: sentHow.trim() }, () => {
      setSentAt("");
      setSentHow("");
    });
  }

  function recordSigner(event: FormEvent) {
    event.preventDefault();
    const choice = view.signers.find(
      (entry) => `${entry.personId}:${entry.signerRole}` === signer,
    );
    const observed = toIso(observedAt);
    const viewed = toIso(viewedAt);
    const evidence =
      evidenceKind === "dotloop_observed"
        ? documentName.trim() && viewed
          ? { kind: evidenceKind, documentName: documentName.trim(), viewedAt: viewed }
          : null
        : storageRef.trim()
          ? { kind: evidenceKind, storageRef: storageRef.trim() }
          : null;
    if (!choice || !observed || !evidence) {
      setMessage({
        tone: "error",
        text: "Choose the signer, when you observed the result and what it is based on.",
      });
      return;
    }
    void submit(
      {
        kind: "signer",
        signerRole: choice.signerRole,
        personId: choice.personId,
        status,
        observedAt: observed,
        evidence,
      },
      () => {
        setObservedAt("");
        setDocumentName("");
        setViewedAt("");
        setStorageRef("");
      },
    );
  }

  return (
    <div className="ui-stack-tight">
      <form className="ui-stack-tight" onSubmit={recordSent}>
        <Field htmlFor={`${id}-sent-at`} label="Sent for signature on">
          <input
            className="ui-input"
            onChange={(event) => setSentAt(event.target.value)}
            type="datetime-local"
            value={sentAt}
          />
        </Field>
        <Field htmlFor={`${id}-sent-how`} label="How it was sent">
          <input
            className="ui-input"
            maxLength={200}
            onChange={(event) => setSentHow(event.target.value)}
            placeholder="for example: Dotloop, by Sam in the office"
            value={sentHow}
          />
        </Field>
        <Button disabled={busy} type="submit" variant="secondary">
          Record sent for signature
        </Button>
      </form>
      <form className="ui-stack-tight" onSubmit={recordSigner}>
        <Field htmlFor={`${id}-signer`} label="Signer">
          <select
            className="ui-input"
            onChange={(event) => setSigner(event.target.value)}
            value={signer}
          >
            <option value="">Choose a signer</option>
            {view.signers.map((entry) => (
              <option
                key={`${entry.personId}:${entry.signerRole}`}
                value={`${entry.personId}:${entry.signerRole}`}
              >
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
        <Field htmlFor={`${id}-status`} label="Result">
          <select
            className="ui-input"
            onChange={(event) =>
              setStatus(event.target.value as "signed" | "declined_voided")
            }
            value={status}
          >
            <option value="signed">Signed</option>
            <option value="declined_voided">Declined or voided</option>
          </select>
        </Field>
        <Field htmlFor={`${id}-observed`} label="When you observed it">
          <input
            className="ui-input"
            onChange={(event) => setObservedAt(event.target.value)}
            type="datetime-local"
            value={observedAt}
          />
        </Field>
        <Field htmlFor={`${id}-evidence`} label="Based on">
          <select
            className="ui-input"
            onChange={(event) =>
              setEvidenceKind(event.target.value as "dotloop_observed" | "signed_copy")
            }
            value={evidenceKind}
          >
            <option value="dotloop_observed">Seen in Dotloop</option>
            <option value="signed_copy">Signed copy received</option>
          </select>
        </Field>
        {evidenceKind === "dotloop_observed" ? (
          <>
            <Field htmlFor={`${id}-document-name`} label="Document name in Dotloop">
              <input
                className="ui-input"
                maxLength={500}
                onChange={(event) => setDocumentName(event.target.value)}
                value={documentName}
              />
            </Field>
            <Field htmlFor={`${id}-viewed-at`} label="When you viewed it">
              <input
                className="ui-input"
                onChange={(event) => setViewedAt(event.target.value)}
                type="datetime-local"
                value={viewedAt}
              />
            </Field>
          </>
        ) : (
          <Field
            htmlFor={`${id}-storage-ref`}
            label="Where the signed copy is kept (private storage reference)"
          >
            <input
              className="ui-input"
              maxLength={500}
              onChange={(event) => setStorageRef(event.target.value)}
              value={storageRef}
            />
          </Field>
        )}
        <Button disabled={busy} type="submit" variant="secondary">
          Record signer result
        </Button>
      </form>
      {message ? (
        <p
          className={message.tone === "error" ? "error-text" : "muted"}
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
