"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

import { useState } from "react";

import { Button, Field } from "@/components/ui";
import { formatBusinessTimestamp } from "@/lib/date-display";
import {
  ARTIFACT_FAMILY_LABELS,
  ARTIFACT_FORMAT_LABELS,
  ARTIFACT_INTAKE_STATE_LABELS,
  type ArtifactIntakeEntry,
  type ArtifactIntakeManifest,
} from "@/lib/lease-documents/artifact-intake-contract";
import {
  LEASE_ARTIFACT_KINDS,
  type LeaseArtifactKind,
} from "@/lib/lease-documents/packet-types";

export interface IntakeCheckpointView {
  readonly id: string;
  readonly label: string;
  readonly state: "done" | "in_progress" | "pending" | "blocked";
  readonly detail: string;
}

const CHECKPOINT_STATE_LABELS: Record<IntakeCheckpointView["state"], string> = {
  done: "Done",
  in_progress: "In progress",
  pending: "Pending",
  blocked: "Blocked",
};

const EXAMPLE_MAP = JSON.stringify(
  {
    schemaVersion: "artifact-field-map/v1",
    artifactKind: "renewal_extension",
    mapVersion: "2026-09-v1",
    templateVersion: "publication:<published version id>",
    formFamily: "<form family as reviewed>",
    formFamilyExtensionCompatible: true,
    audience: "tenant",
    allowedPacketContexts: ["renewal_extension"],
    fields: [
      {
        fieldId: "<field id on the form>",
        factKey: "renewal.approved_rent",
        meaning: "What the field means",
        required: true,
        multiplicity: "single",
        allowedSourceSystems: ["staff_recorded_owner_approval"],
      },
    ],
    signers: [
      {
        signerRole: "tenant",
        participantKind: "tenant",
        required: true,
        location: "Signature 1",
      },
    ],
    reviewNote: "Where the mapping was reviewed",
  },
  null,
  2,
);

type StaticInspectionView = {
  kind: LeaseArtifactKind;
  pages: Array<{
    pageIndex: number;
    width: number;
    height: number;
    rotation: number;
    cropBox: readonly [number, number, number, number] | null;
  }>;
  runs: Array<{
    pageIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
  }>;
  images: Array<{
    pageIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  truncated: boolean;
};

const point = (value: number) => value.toFixed(1);

type Payload = {
  artifactIntake?: {
    manifest?: ArtifactIntakeManifest;
    checkpoints?: IntakeCheckpointView[];
    entry?: ArtifactIntakeEntry;
    duplicate?: boolean;
  };
  error?: string;
};

/**
 * S130 (F10) Admin surface: the seven-family intake manifest. Each family reads Pending materials
 * until a file arrives through the trusted publication path; receiving classifies the bytes as data,
 * recording a mapping keeps it Preview only, and approval puts that exact version into the S66
 * catalog. Nothing here uploads to a provider, connects an account, opens an action key or fills a
 * form; reviewed supported AcroForms are filled and inspected through the lease packet controls.
 */
export function LeaseArtifactIntakePanel({
  initial,
  note,
}: Readonly<{
  initial: { manifest: ArtifactIntakeManifest; checkpoints: IntakeCheckpointView[] };
  note?: string;
}>) {
  const [manifest, setManifest] = useState(initial.manifest);
  const [checkpoints, setCheckpoints] = useState(initial.checkpoints);
  const [kind, setKind] = useState<LeaseArtifactKind>("renewal_extension");
  const [reference, setReference] = useState("");
  const [contentHash, setContentHash] = useState("");
  const [documentRef, setDocumentRef] = useState("");
  const [templateRef, setTemplateRef] = useState("");
  const [mapJson, setMapJson] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [inspection, setInspection] = useState<StaticInspectionView | null>(null);

  async function inspect(entry: ArtifactIntakeEntry) {
    setPending(true);
    setError("");
    setOk("");
    try {
      const response = await fetch(
        `/api/admin/lease-artifact-intake/inspect?${new URLSearchParams({ kind: entry.kind })}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        staticInspection?: StaticInspectionView;
        error?: string;
      };
      if (!response.ok || !payload.staticInspection) {
        setError(
          payload.error ?? "The page positions could not be read. Reload and retry.",
        );
        return;
      }
      setInspection(payload.staticInspection);
    } catch {
      setError("The page positions could not be read. Reload and retry.");
    } finally {
      setPending(false);
    }
  }

  /** Put the inspected pages into the mapping so only reviewed regions remain to be added. */
  function addInspectedPages(view: StaticInspectionView) {
    let base: Record<string, unknown>;
    try {
      base = mapJson.trim() ? (JSON.parse(mapJson) as Record<string, unknown>) : {};
    } catch {
      setError("Enter the mapping as valid JSON before adding the pages.");
      return;
    }
    const current = (base.static ?? {}) as Record<string, unknown>;
    setMapJson(
      JSON.stringify(
        {
          ...base,
          static: {
            pages: view.pages,
            regions: Array.isArray(current.regions) ? current.regions : [],
            protectedRegions: Array.isArray(current.protectedRegions)
              ? current.protectedRegions
              : [],
          },
        },
        null,
        2,
      ),
    );
  }

  async function refresh() {
    const response = await fetch("/api/admin/lease-artifact-intake", {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as Payload;
    if (response.ok && payload.artifactIntake?.manifest) {
      setManifest(payload.artifactIntake.manifest);
      if (payload.artifactIntake.checkpoints)
        setCheckpoints(payload.artifactIntake.checkpoints);
    }
  }

  async function call(
    method: "POST" | "PUT" | "PATCH",
    body: Record<string, unknown>,
    success: string,
  ) {
    setPending(true);
    setError("");
    setOk("");
    try {
      const response = await fetch("/api/admin/lease-artifact-intake", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as Payload;
      if (!response.ok || !payload.artifactIntake?.entry) {
        setError(
          payload.error ??
            "The request was refused. Reload and review the current manifest.",
        );
        return;
      }
      await refresh().catch(() => undefined);
      setOk(
        payload.artifactIntake.duplicate
          ? "This request was already recorded; the current state was read back."
          : success,
      );
      setReason("");
    } catch {
      setError(
        "The request could not be completed. Reload and review the current manifest before retrying.",
      );
    } finally {
      setPending(false);
    }
  }

  function receive() {
    void call(
      "POST",
      {
        kind,
        publicationSource: {
          system: "s21_publication",
          reference: reference.trim(),
          contentHash: contentHash.trim(),
        },
        ...(documentRef.trim()
          ? {
              providerBindings: {
                dotloopDocumentRef: documentRef.trim(),
                ...(templateRef.trim() ? { dotloopTemplateRef: templateRef.trim() } : {}),
              },
            }
          : {}),
        operationId: crypto.randomUUID(),
      },
      `${ARTIFACT_FAMILY_LABELS[kind]}: file received and classified. It is not in the catalog until its mapping is recorded and approved.`,
    );
  }

  function recordMap(entry: ArtifactIntakeEntry) {
    let fieldMap: unknown;
    try {
      fieldMap = JSON.parse(mapJson);
    } catch {
      setError("Enter the mapping as valid JSON.");
      return;
    }
    void call(
      "PUT",
      { kind: entry.kind, fieldMap, expectedRevision: entry.revision },
      `${ARTIFACT_FAMILY_LABELS[entry.kind]}: mapping recorded (Preview only until approved).`,
    );
  }

  function decide(entry: ArtifactIntakeEntry, decision: "approve" | "reject") {
    void call(
      "PATCH",
      {
        kind: entry.kind,
        decision,
        reason: reason.trim(),
        expectedRevision: entry.revision,
        operationId: crypto.randomUUID(),
      },
      decision === "approve"
        ? `${ARTIFACT_FAMILY_LABELS[entry.kind]}: approved and projected into the catalog. Nothing was uploaded or connected.`
        : `${ARTIFACT_FAMILY_LABELS[entry.kind]}: rejected; the catalog is unchanged.`,
    );
  }

  const approved = LEASE_ARTIFACT_KINDS.filter(
    (family) => manifest.entries[family]?.state === "approved",
  ).length;
  return (
    <article className="panel" data-artifact-intake-panel>
      <h2 className="section-subtitle">Lease artifact intake (S130)</h2>
      <p className="muted">
        Each family has one entry. A file is received only through the trusted publication
        path and classified from its bytes as data; a recorded mapping is Preview only;
        approval puts that exact version into the packet catalog and supersedes the
        earlier one. Supported AcroForms and static PDFs with reviewed regions use the
        lease packet&apos;s filled PDF controls: prepare from verified facts, download,
        inspect and approve the exact output. A static file without reviewed regions and a
        provider template keep their manual handoff; a file with no variable values is an
        unchanged approved attachment. Nothing here uploads, connects an account or opens
        an action key.
      </p>
      {note ? <p className="renewal-notice">{note}</p> : null}
      {manifest.state === "unreadable" ? (
        <p className="renewal-notice" role="status">
          The intake manifest could not be read fully. Reload before receiving or
          deciding.
        </p>
      ) : null}
      <p data-artifact-intake-approved>
        {approved === 0
          ? "No family has approved material: every packet reads Pending materials."
          : `${approved} of ${LEASE_ARTIFACT_KINDS.length} families approved.`}
      </p>
      <ul data-artifact-intake-families>
        {LEASE_ARTIFACT_KINDS.map((family) => {
          const entry = manifest.entries[family];
          const state = entry?.state ?? "pending_materials";
          return (
            <li
              key={family}
              data-artifact-intake-family={family}
              data-artifact-intake-state={state}
            >
              <strong>{ARTIFACT_FAMILY_LABELS[family]}</strong>:{" "}
              {ARTIFACT_INTAKE_STATE_LABELS[state]}
              {entry?.classification
                ? `. Format: ${ARTIFACT_FORMAT_LABELS[entry.classification.format]}${entry.classification.approximatePages ? ` (about ${entry.classification.approximatePages} pages)` : ""}.`
                : "."}
              {entry?.publication ? ` Publication ${entry.publication.reference}.` : ""}
              {entry?.fieldMap
                ? entry.fieldMap.unchangedAttachment
                  ? ` Mapping ${entry.fieldMap.mapVersion}: unchanged approved attachment.`
                  : ` Mapping ${entry.fieldMap.mapVersion} (${entry.fieldMap.fields.length} fields${entry.fieldMap.static ? `, ${entry.fieldMap.static.regions.length} regions` : ""}, ${entry.fieldMap.signers.length} signers).`
                : ""}
              {entry?.received_at
                ? ` Received ${formatBusinessTimestamp(entry.received_at)}.`
                : ""}
              {entry?.supersedes ? ` Replaces ${entry.supersedes}.` : ""}
              {entry?.classification?.reasons.length ? (
                <ul className="muted">
                  {entry.classification.reasons.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
              {entry?.classification?.pdfFields?.length ? (
                <details>
                  <summary>Parsed form field inventory</summary>
                  <ul>
                    {entry.classification.pdfFields.map((field) => (
                      <li key={field.name}>
                        {field.name}: {field.type}
                        {field.type === "signature"
                          ? " (human handoff; never filled)"
                          : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {entry &&
              entry.state !== "rejected" &&
              entry.classification?.format !== "unsupported" ? (
                <div className="ui-actions">
                  <Button
                    disabled={pending || !mapJson.trim()}
                    onClick={() => recordMap(entry)}
                  >
                    Record mapping for {ARTIFACT_FAMILY_LABELS[family]}
                  </Button>
                  {entry.classification?.format === "static_pdf" ? (
                    <Button disabled={pending} onClick={() => void inspect(entry)}>
                      Read page positions for {ARTIFACT_FAMILY_LABELS[family]}
                    </Button>
                  ) : null}
                  {entry.state === "reviewed" ? (
                    <Button
                      disabled={pending || !reason.trim()}
                      onClick={() => decide(entry, "approve")}
                    >
                      Approve {ARTIFACT_FAMILY_LABELS[family]}
                    </Button>
                  ) : null}
                  {entry.state === "received" || entry.state === "reviewed" ? (
                    <Button
                      disabled={pending || !reason.trim()}
                      onClick={() => decide(entry, "reject")}
                    >
                      Reject {ARTIFACT_FAMILY_LABELS[family]}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {inspection ? (
        <section data-artifact-intake-inspection={inspection.kind}>
          <h3 className="renewal-message-group-title">
            Page positions: {ARTIFACT_FAMILY_LABELS[inspection.kind]}
          </h3>
          <p className="muted">
            PDF points from each page&apos;s lower-left corner. Draw each region over a
            blank line, or over the exact variable text it replaces; mark signature,
            initial and signing-date areas as protected regions.
          </p>
          <ul>
            {inspection.pages.map((page) => (
              <li key={page.pageIndex}>
                Page {page.pageIndex + 1}: {point(page.width)} × {point(page.height)}
                {page.rotation ? `, rotated ${page.rotation}°` : ""}
                {page.cropBox ? ", cropped" : ""}
              </li>
            ))}
          </ul>
          <Button disabled={pending} onClick={() => addInspectedPages(inspection)}>
            Add these pages to the mapping
          </Button>
          <details>
            <summary>
              Text positions ({inspection.runs.length}
              {inspection.truncated ? ", first 5,000 only" : ""})
            </summary>
            <pre className="draft-box" style={{ maxHeight: "24rem", overflow: "auto" }}>
              {inspection.runs
                .map(
                  (run) =>
                    `p${run.pageIndex + 1}  x ${point(run.x)}  y ${point(run.y)}  w ${point(run.width)}  h ${point(run.height)}  ${run.text}`,
                )
                .join("\n")}
            </pre>
          </details>
          {inspection.images.length ? (
            <p className="muted">
              {inspection.images.length} images or drawings are present; a region may not
              cover them.
            </p>
          ) : null}
        </section>
      ) : null}
      <h3 className="renewal-message-group-title">Receive a file</h3>
      <Field htmlFor="artifact-intake-kind" label="Family">
        <select
          id="artifact-intake-kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as LeaseArtifactKind)}
        >
          {LEASE_ARTIFACT_KINDS.map((family) => (
            <option key={family} value={family}>
              {ARTIFACT_FAMILY_LABELS[family]}
            </option>
          ))}
        </select>
      </Field>
      <Field
        htmlFor="artifact-intake-reference"
        label="Publication reference"
        hint="publication:<id> of the trusted publication that holds the approved file."
      >
        <input
          id="artifact-intake-reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
      </Field>
      <Field
        htmlFor="artifact-intake-hash"
        label="Content hash"
        hint="The published content hash; the bytes are read back and must match."
      >
        <input
          id="artifact-intake-hash"
          value={contentHash}
          onChange={(event) => setContentHash(event.target.value)}
        />
      </Field>
      <Field
        htmlFor="artifact-intake-document"
        label="Dotloop document reference (optional)"
      >
        <input
          id="artifact-intake-document"
          value={documentRef}
          onChange={(event) => setDocumentRef(event.target.value)}
        />
      </Field>
      <Field
        htmlFor="artifact-intake-template"
        label="Dotloop template reference (optional)"
        hint="Recorded by staff only. Parsed AcroForms remain fillable; a provider reference alone never proves field filling."
      >
        <input
          id="artifact-intake-template"
          value={templateRef}
          onChange={(event) => setTemplateRef(event.target.value)}
        />
      </Field>
      <Button
        disabled={pending || !reference.trim() || !contentHash.trim()}
        onClick={receive}
      >
        Receive into review
      </Button>
      <Field
        htmlFor="artifact-intake-map"
        label="Reviewed mapping (JSON)"
        hint="Exact field ids, meanings, requiredness, repeats, sources and signer roles as reviewed on the actual form. For repeated values, set pdfFieldNames to the exact slots in authoritative party or animal order. For a static PDF, add static pages from the page positions, then one region per field and repeat slot. A file with no variable values is recorded with unchangedAttachment set to true and no fields."
      >
        <textarea
          id="artifact-intake-map"
          rows={10}
          value={mapJson}
          placeholder={EXAMPLE_MAP}
          onChange={(event) => setMapJson(event.target.value)}
        />
      </Field>
      <Field
        htmlFor="artifact-intake-reason"
        label="Decision reason"
        hint="Required for approve or reject; recorded with the decision."
      >
        <input
          id="artifact-intake-reason"
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      <h3 className="renewal-message-group-title">When materials arrive</h3>
      <ol data-artifact-intake-checkpoints>
        {checkpoints.map((checkpoint) => (
          <li
            key={checkpoint.id}
            data-artifact-intake-checkpoint={checkpoint.id}
            data-artifact-intake-checkpoint-state={checkpoint.state}
          >
            <strong>{CHECKPOINT_STATE_LABELS[checkpoint.state]}</strong>:{" "}
            {checkpoint.label}. {checkpoint.detail}
          </li>
        ))}
      </ol>
      {error ? (
        <p className="renewal-notice" role="alert">
          {error}
        </p>
      ) : null}
      {ok ? <p role="status">{ok}</p> : null}
    </article>
  );
}
