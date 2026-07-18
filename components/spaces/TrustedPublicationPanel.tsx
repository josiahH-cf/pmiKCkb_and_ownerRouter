"use client";

import { useState } from "react";
import { SOURCE_STATES } from "@/lib/constants";
import type { SourceState } from "@/lib/source-state";

interface TrustedPublicationPanelProps {
  canEdit: boolean;
  spaceId: string;
}

export function TrustedPublicationPanel({
  canEdit,
  spaceId,
}: Readonly<TrustedPublicationPanelProps>) {
  const [citationLabel, setCitationLabel] = useState("");
  const [policyId, setPolicyId] = useState("");
  const [sourceState, setSourceState] = useState<SourceState>("Verified Source");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Select a source or folder. Publication fails closed until an Admin trust policy and scanner cover this Space.",
  );

  async function publishSelection(files: FileList | null) {
    if (!files?.length || busy || !canEdit) return;
    if (!citationLabel.trim()) {
      setMessage("Add a citation label before publishing.");
      return;
    }

    setBusy(true);
    let published = 0;
    try {
      for (const file of Array.from(files)) {
        const path = file.webkitRelativePath || `sources/${file.name}`;
        const response = await fetch(`/api/spaces/${spaceId}/publications`, {
          body: file,
          headers: {
            "Content-Type": "application/octet-stream",
            "x-publication-byte-size": String(file.size),
            "x-publication-citation-label": citationLabel.trim(),
            "x-publication-file-name": file.name,
            "x-publication-mime-type": declaredMimeType(file),
            "x-publication-path": path,
            ...(policyId.trim() ? { "x-publication-policy-id": policyId.trim() } : {}),
            "x-publication-resource-type": "file",
            "x-publication-source-state": sourceState,
          },
          method: "POST",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || `Publication failed for ${file.name}.`);
        }
        published += 1;
      }
      setMessage(
        `${published} validated source${published === 1 ? "" : "s"} published and Active.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Publication failed safely.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Live trusted sources</h2>
          <p className="muted">{message}</p>
        </div>
        <span className="review-pill">Validated + versioned</span>
      </div>
      <div className="workflow-two-column-fields">
        <label>
          Citation label
          <input
            disabled={!canEdit || busy}
            onChange={(event) => setCitationLabel(event.target.value)}
            placeholder="What reviewers should recognize"
            value={citationLabel}
          />
        </label>
        <label>
          Source state
          <select
            disabled={!canEdit || busy}
            onChange={(event) => setSourceState(event.target.value as SourceState)}
            value={sourceState}
          >
            {SOURCE_STATES.map((state) => (
              <option key={state}>{state}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Policy ID (only when more than one policy covers this Space)
        <input
          disabled={!canEdit || busy}
          onChange={(event) => setPolicyId(event.target.value)}
          value={policyId}
        />
      </label>
      <div className="action-row">
        <label className="secondary-button">
          Add files
          <input
            className="visually-hidden"
            disabled={!canEdit || busy}
            multiple
            onChange={(event) => void publishSelection(event.target.files)}
            type="file"
          />
        </label>
        <label className="secondary-button">
          Add folder
          <input
            {...({ directory: "", webkitdirectory: "" } as Record<string, string>)}
            className="visually-hidden"
            disabled={!canEdit || busy}
            multiple
            onChange={(event) => void publishSelection(event.target.files)}
            type="file"
          />
        </label>
      </div>
      <p className="muted">
        Allowed launch defaults: Markdown/text 2 MB, PDF/DOCX 25 MB, CSV 10 MB, and common
        images 10 MB. Executables, archives, unknown types, failed scans, and out-of-scope
        paths never become Active.
      </p>
      <p className="muted">
        This upload lane is Live and accepts only an enabled Live policy plus its real
        scanner. The separate Admin Test fixture cannot be selected here.
      </p>
    </section>
  );
}

function declaredMimeType(file: File) {
  if (file.type) return file.type;
  const extension = file.name.toLowerCase().split(".").pop();
  return (
    {
      csv: "text/csv",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      jpeg: "image/jpeg",
      jpg: "image/jpeg",
      md: "text/markdown",
      pdf: "application/pdf",
      png: "image/png",
      txt: "text/plain",
      webp: "image/webp",
    }[extension ?? ""] ?? "application/octet-stream"
  );
}
