"use client";

import { useRef, useState } from "react";

import { Button, Field } from "@/components/ui";
import { useAudioRecorder } from "@/components/hooks/useAudioRecorder";
import { UnitTypeahead } from "@/components/maintenance/UnitTypeahead";
import {
  buildWorkOrderDraft,
  type MaintenanceUnitMatch,
  type WorkOrderDraft,
} from "@/lib/maintenance/work-order-draft";
import {
  buildOwnerNoticeDraft,
  type OwnerNoticeDraft,
} from "@/lib/maintenance/owner-notice-draft";
import {
  suggestVendorAssignment,
  type VendorAssignmentSuggestion,
} from "@/lib/maintenance/vendor-assignment";
import { MAINTENANCE_PRIORITIES } from "@/lib/maintenance/constants";
import type { MaintenancePhotoActionView } from "@/lib/maintenance/photo-action";

// Maintenance capture desk (S4): a field worker reports an issue — typed note + tap-to-record voice
// (transcribed via the STT seam) + the unit — and gets a structured work-order DRAFT preview. The draft
// persists as a Live in-app ticket after review. External provider writes remain separate, explicit,
// target-labeled, human-confirmed actions. Photo storage is independently action-gated.

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

const CLOSED_PHOTO_ACTION: MaintenancePhotoActionView = {
  actionKey: "google_drive.maintenance_photo.store",
  executable: false,
  message:
    "Photo storage is unavailable until the Drive action has owner-approved permission. Continue without a photo.",
  targetLabel: "PMI KC in-boundary maintenance photo folder",
};

export function MaintenanceCapture({
  reporterUid,
  photoAction = CLOSED_PHOTO_ACTION,
}: Readonly<{
  reporterUid: string;
  photoAction?: MaintenancePhotoActionView;
}>) {
  const [typedNote, setTypedNote] = useState("");
  const [transcript, setTranscript] = useState("");
  const [unitMatch, setUnitMatch] = useState<MaintenanceUnitMatch | null>(null);
  const [priority, setPriority] = useState("");
  const [draft, setDraft] = useState<WorkOrderDraft | null>(null);
  const [ownerNotice, setOwnerNotice] = useState<OwnerNoticeDraft | null>(null);
  const [vendorSuggestion, setVendorSuggestion] =
    useState<VendorAssignmentSuggestion | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [photoRefs, setPhotoRefs] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [status, setStatus] = useState("");
  const createInFlight = useRef(false);

  function invalidateDraft() {
    setDraft(null);
    setOwnerNotice(null);
    setVendorSuggestion(null);
  }

  async function transcribe(blob: Blob) {
    setIsTranscribing(true);
    setStatus("");
    try {
      const audioBase64 = await blobToBase64(blob);
      const response = await fetch("/api/maintenance/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audioBase64, mimeType: blob.type || "audio/webm" }),
      });
      if (response.ok) {
        const payload = (await response.json()) as { transcript: string };
        if (payload.transcript.trim()) {
          invalidateDraft();
          setTranscript((prev) =>
            [prev, payload.transcript].filter(Boolean).join(" ").trim(),
          );
        } else {
          setStatus("No speech detected. Try again a little closer to the mic.");
        }
      } else {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setStatus(payload?.error ?? "Could not transcribe the recording.");
      }
    } catch {
      setStatus("Could not reach the transcription service. Type the note instead.");
    } finally {
      setIsTranscribing(false);
    }
  }

  const {
    cancelPermissionRequest,
    isRecording,
    phase: recorderPhase,
    toggleRecording,
  } = useAudioRecorder({
    onRecording: transcribe,
    onError: setStatus,
    onStatus: setStatus,
  });

  async function handlePhoto(file: File) {
    setIsUploading(true);
    setStatus("");
    try {
      const base64 = await blobToBase64(file);
      const response = await fetch("/api/maintenance/photo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || "image/jpeg",
          base64,
        }),
      });
      if (response.ok) {
        const stored = (await response.json()) as { ref: string };
        invalidateDraft();
        setPhotoRefs((prev) => [...prev, stored.ref]);
        setPendingPhoto(null);
      } else {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setStatus(payload?.error ?? "Could not upload the photo.");
      }
    } finally {
      setIsUploading(false);
    }
  }

  function buildDraft() {
    const workOrder = buildWorkOrderDraft({
      reporterUid,
      typedNote: typedNote.trim() || undefined,
      voiceTranscript: transcript.trim() || undefined,
      // The unit is the matcher's result (real confidence), never the raw typed text.
      unit: unitMatch,
      photoRefs: photoRefs.length > 0 ? photoRefs : undefined,
      priority: priority ? (priority as WorkOrderDraft["priority"]) : undefined,
      capturedAt: new Date().toISOString(),
    });
    setDraft(workOrder);
    // Non-executable next stages (M-5): an owner-notice DRAFT + a vendor-assignment SUGGESTION.
    setOwnerNotice(buildOwnerNoticeDraft({ workOrder }));
    setVendorSuggestion(suggestVendorAssignment(workOrder.description));
  }

  // Persist the built draft as a tracked ticket (console overhaul Slice E). App-plane only; the
  // RentVine work-order create stays gated. The queue below shows the ticket after a reload.
  async function createTicket() {
    if (!draft || draft.blockers.length > 0 || createInFlight.current) return;
    createInFlight.current = true;
    setIsCreating(true);
    setStatus("");
    try {
      const response = await fetch("/api/maintenance/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          data_mode: "live",
          summary: draft.summary,
          description: draft.description,
          priority: draft.priority,
          priority_provenance: priority ? "operator-set" : "auto-inferred",
          unit: draft.unit,
          photo_refs: draft.photoRefs,
        }),
      });
      if (response.ok) {
        const { ticket } = (await response.json()) as { ticket: { status: string } };
        setStatus(
          `Ticket created (${ticket.status}). Reload to see it in the queue below.`,
        );
      } else {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setStatus(payload.error ?? "Could not create the ticket.");
      }
    } catch {
      setStatus("Could not reach the ticket service.");
    } finally {
      createInFlight.current = false;
      setIsCreating(false);
    }
  }

  return (
    <div className="ask-grid">
      <form
        className="ask-form panel"
        onSubmit={(event) => {
          event.preventDefault();
          buildDraft();
        }}
      >
        <Field
          hint="for example: kitchen faucet leaking under the sink"
          htmlFor="mx-note"
          label="Issue"
          required
        >
          <textarea
            id="mx-note"
            name="mx-note"
            onChange={(event) => {
              invalidateDraft();
              setTypedNote(event.target.value);
            }}
            placeholder="Describe the maintenance issue."
            rows={5}
            value={typedNote}
          />
        </Field>

        <div className="field-row">
          <button
            className="secondary-button"
            disabled={isTranscribing}
            onClick={() =>
              recorderPhase === "requesting-permission"
                ? cancelPermissionRequest()
                : void toggleRecording()
            }
            type="button"
          >
            {isRecording
              ? "Stop recording"
              : recorderPhase === "requesting-permission"
                ? "Cancel microphone request"
                : isTranscribing
                  ? "Transcribing…"
                  : "Record voice"}
          </button>
        </div>

        {transcript ? (
          <p className="muted">
            <strong>Transcript:</strong> {transcript}
          </p>
        ) : null}

        {photoAction.executable ? (
          <div className="ui-stack" aria-label="Maintenance photo upload">
            {/* The file input is rendered only after the committed registry gate opens. Selection
                creates a preview; a separate explicit confirmation performs the upload. */}
            <div className="field-row">
              <label className="secondary-button" htmlFor="mx-photo">
                {isUploading ? "Uploading photo…" : "Choose / take photo"}
              </label>
              <input
                accept="image/*"
                capture="environment"
                hidden
                id="mx-photo"
                name="mx-photo"
                onChange={(event) => setPendingPhoto(event.target.files?.[0] ?? null)}
                type="file"
              />
            </div>
            {pendingPhoto ? (
              <section className="ui-callout" aria-label="Photo upload preview">
                <p>
                  <strong>File:</strong> {pendingPhoto.name}
                </p>
                <p>
                  <strong>Type:</strong> {pendingPhoto.type || "image/jpeg"}
                </p>
                <p>
                  <strong>Target:</strong> {photoAction.targetLabel}
                </p>
                <div className="field-row">
                  <button
                    className="secondary-button"
                    disabled={isUploading}
                    onClick={() => void handlePhoto(pendingPhoto)}
                    type="button"
                  >
                    {isUploading ? "Uploading…" : "Confirm photo upload"}
                  </button>
                  <button
                    className="text-button"
                    disabled={isUploading}
                    onClick={() => setPendingPhoto(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </section>
            ) : (
              <p className="muted">{photoAction.message}</p>
            )}
          </div>
        ) : (
          <p className="muted" role="status" data-action-key={photoAction.actionKey}>
            {photoAction.message}
          </p>
        )}
        {photoRefs.length > 0 ? (
          <p className="muted">{photoRefs.length} photo(s) attached.</p>
        ) : null}

        <UnitTypeahead
          id="mx-unit"
          required
          onSelect={(unit) => {
            invalidateDraft();
            setUnitMatch(
              unit
                ? { unitId: unit.unitId, label: unit.label, confidence: "Verified" }
                : null,
            );
          }}
        />

        {unitMatch ? (
          <p className="muted">
            Matched: <strong>{unitMatch.label}</strong>{" "}
            <span className="queue-pill" data-value="Approved">
              {unitMatch.confidence}
            </span>
          </p>
        ) : null}

        <label className="select-field" htmlFor="mx-priority">
          Priority
          <select
            id="mx-priority"
            onChange={(event) => {
              invalidateDraft();
              setPriority(event.target.value);
            }}
            value={priority}
          >
            <option value="">Auto (infer from description)</option>
            {MAINTENANCE_PRIORITIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <Button size="large" type="submit">
          Build work-order draft
        </Button>
        {status ? <p className="muted">{status}</p> : null}
      </form>

      <aside className="panel result-panel" aria-live="polite">
        {draft ? (
          <>
            <h2>Work-order draft</h2>
            <p className="muted">
              Live in-app ticket preview. Creating it writes this app only; any provider
              write is a separate exact action with its own target and confirmation.
            </p>
            <h3>{draft.summary}</h3>
            <p>{draft.description || <em>No description captured.</em>}</p>
            <p>
              <strong>Priority:</strong> {draft.priority}
            </p>
            <p>
              <strong>Unit:</strong> {draft.unit ? draft.unit.label : <em>unmatched</em>}
            </p>
            <p>
              <strong>Photos:</strong> {draft.photoRefs.length}
            </p>
            {draft.blockers.length > 0 ? (
              <>
                <h3 id="maintenance-ticket-blockers">Before creating a ticket</h3>
                <ul aria-labelledby="maintenance-ticket-blockers">
                  {draft.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">No blockers — ready for human review.</p>
            )}

            <Button
              aria-describedby={
                draft.blockers.length > 0 ? "maintenance-ticket-blockers" : undefined
              }
              disabled={isCreating || draft.blockers.length > 0}
              onClick={createTicket}
              size="large"
              type="button"
            >
              {isCreating ? "Creating…" : "Create ticket"}
            </Button>

            {ownerNotice ? (
              <section aria-label="Owner notice draft">
                <h3>Owner notice — draft</h3>
                <p className="muted">Draft only — no send; a human reviews and sends.</p>
                <p>
                  <strong>{ownerNotice.subject}</strong>
                </p>
                <p style={{ whiteSpace: "pre-line" }}>{ownerNotice.body}</p>
                {ownerNotice.missingInputs.length > 0 ? (
                  <p className="muted">
                    Needs before sending: {ownerNotice.missingInputs.join(", ")}.
                  </p>
                ) : null}
              </section>
            ) : null}

            {vendorSuggestion ? (
              <section aria-label="Vendor assignment suggestion">
                <h3>Vendor assignment — suggestion</h3>
                <p className="muted">
                  Trade suggestion only. Assign a roster-backed Vendor from the ticket
                  after creation; any provider write remains a separate confirmed action.
                </p>
                <p>
                  <strong>Trade:</strong> {vendorSuggestion.trade}
                </p>
                <p>
                  <strong>Vendor:</strong> {vendorSuggestion.vendorRoster}
                </p>
                <p className="muted">{vendorSuggestion.rationale}</p>
              </section>
            ) : null}
          </>
        ) : (
          <p className="muted">The work-order draft appears here.</p>
        )}
      </aside>
    </div>
  );
}
