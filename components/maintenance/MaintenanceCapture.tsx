"use client";

import { useRef, useState } from "react";

import { buildWorkOrderDraft, type WorkOrderDraft } from "@/lib/maintenance/work-order-draft";
import { MAINTENANCE_PRIORITIES } from "@/lib/maintenance/constants";

// Maintenance capture desk (S4): a field worker reports an issue — typed note + tap-to-record voice
// (transcribed via the STT seam) + the unit — and gets a structured work-order DRAFT preview. The draft
// is simulation-only: the RentVine create stays gated (readyForExecution is always false). Photo storage
// (Drive) is a follow-up sub-slice; the draft builder already treats photos as optional.

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function MaintenanceCapture({ reporterUid }: Readonly<{ reporterUid: string }>) {
  const [typedNote, setTypedNote] = useState("");
  const [transcript, setTranscript] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [priority, setPriority] = useState("");
  const [draft, setDraft] = useState<WorkOrderDraft | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [photoRefs, setPhotoRefs] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);

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
        setTranscript((prev) => [prev, payload.transcript].filter(Boolean).join(" ").trim());
      } else {
        setStatus("Could not transcribe the recording.");
      }
    } finally {
      setIsTranscribing(false);
    }
  }

  async function toggleRecording() {
    if (isRecording) {
      recorderRef.current?.stop();
      return;
    }
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("Voice recording isn't available in this browser — type the note instead.");
      return;
    }
    setStatus("");
    try {
      const stream = await media.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        await transcribe(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setStatus("Microphone unavailable or permission denied — type the note instead.");
    }
  }

  async function handlePhoto(file: File) {
    setIsUploading(true);
    setStatus("");
    try {
      const base64 = await blobToBase64(file);
      const response = await fetch("/api/maintenance/photo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type || "image/jpeg", base64 }),
      });
      if (response.ok) {
        const stored = (await response.json()) as { ref: string };
        setPhotoRefs((prev) => [...prev, stored.ref]);
      } else {
        setStatus("Could not upload the photo.");
      }
    } finally {
      setIsUploading(false);
    }
  }

  function buildDraft() {
    setDraft(
      buildWorkOrderDraft({
        reporterUid,
        typedNote: typedNote.trim() || undefined,
        voiceTranscript: transcript.trim() || undefined,
        unit: unitLabel.trim()
          ? { unitId: unitLabel.trim(), label: unitLabel.trim(), confidence: "Verified" }
          : null,
        photoRefs: photoRefs.length > 0 ? photoRefs : undefined,
        priority: priority ? (priority as WorkOrderDraft["priority"]) : undefined,
        capturedAt: new Date().toISOString(),
      }),
    );
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
        <label htmlFor="mx-note">Issue</label>
        <textarea
          id="mx-note"
          name="mx-note"
          onChange={(event) => setTypedNote(event.target.value)}
          placeholder="Describe the maintenance issue…"
          rows={5}
          value={typedNote}
        />

        <div className="field-row">
          <button
            className="secondary-button"
            disabled={isTranscribing}
            onClick={toggleRecording}
            type="button"
          >
            {isRecording ? "Stop recording" : isTranscribing ? "Transcribing…" : "Record voice"}
          </button>
        </div>

        {transcript ? (
          <p className="muted">
            <strong>Transcript:</strong> {transcript}
          </p>
        ) : null}

        <label htmlFor="mx-photo">Photo</label>
        <input
          accept="image/*"
          id="mx-photo"
          name="mx-photo"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handlePhoto(file);
          }}
          type="file"
        />
        {photoRefs.length > 0 ? (
          <p className="muted">{photoRefs.length} photo(s) attached.</p>
        ) : isUploading ? (
          <p className="muted">Uploading photo…</p>
        ) : null}

        <label htmlFor="mx-unit">Unit / location</label>
        <input
          id="mx-unit"
          name="mx-unit"
          onChange={(event) => setUnitLabel(event.target.value)}
          placeholder="e.g. 123 Main St #2"
          value={unitLabel}
        />

        <label className="select-field" htmlFor="mx-priority">
          Priority
          <select
            id="mx-priority"
            onChange={(event) => setPriority(event.target.value)}
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

        <button className="primary-button" type="submit">
          Build work-order draft
        </button>
        {status ? <p className="muted">{status}</p> : null}
      </form>

      <aside className="panel result-panel" aria-live="polite">
        {draft ? (
          <>
            <h2>Work-order draft</h2>
            <p className="muted">
              Simulation only — the RentVine work-order create is gated; a human reviews and approves.
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
                <h3>Before submitting</h3>
                <ul>
                  {draft.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">No blockers — ready for human review.</p>
            )}
          </>
        ) : (
          <p className="muted">The work-order draft appears here.</p>
        )}
      </aside>
    </div>
  );
}
