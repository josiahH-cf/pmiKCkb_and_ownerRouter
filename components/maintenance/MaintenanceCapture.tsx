"use client";
import {
  projectMaintenanceUrgency,
  type OperatingPolicyVersion,
} from "@/lib/maintenance/operating-policy";
import { fetchWithDeadline as fetch, waitFailureMessage } from "@/lib/ui/fetch-lifetime";

import { useRef, useState, useEffect, useCallback } from "react";

import {
  CreateLiveMaintenanceTicketInputSchema,
  CreatedTicketSchema,
  maintenanceTicketHref,
  type MaintenanceCreationCommand,
} from "@/lib/maintenance/creation-intent";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import { useMaintenanceTicketState } from "./MaintenanceTicketProvider";
import { Button, Field } from "@/components/ui";
import { useAudioRecorder } from "@/components/hooks/useAudioRecorder";
import { UnitTypeahead } from "@/components/maintenance/UnitTypeahead";
import {
  buildWorkOrderDraft,
  type MaintenanceUnitMatch,
  type WorkOrderDraft,
} from "@/lib/maintenance/work-order-draft";
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
  const [operatingPolicy, setOperatingPolicy] = useState<OperatingPolicyVersion | null>(
      null,
    ),
    [policyState, setPolicyState] = useState(
      "Existing safety guidance is available. Applicable replacement policy is being checked.",
    );
  const policyUnitId = unitMatch?.unitId;
  const urgencyDecision = projectMaintenanceUrgency(
    { summary: typedNote, description: transcript },
    operatingPolicy,
  );
  useEffect(() => {
    let current = true;
    void fetch(
      `/api/maintenance/operating-policies?${new URLSearchParams({ purpose: "emergency", view: "applicable", ...(policyUnitId ? { unit_id: policyUnitId } : {}) })}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw Error();
        if (current) {
          setOperatingPolicy(data.policy ?? null);
          setPolicyState(data.detail ?? "Existing safety guidance remains available.");
        }
      })
      .catch(() => {
        if (current) {
          setOperatingPolicy(null);
          setPolicyState(
            "Applicable policy could not be read. Existing safety guidance remains available; staff routing needs attention.",
          );
        }
      });
    return () => {
      current = false;
    };
  }, [policyUnitId]);
  const [draft, setDraft] = useState<WorkOrderDraft | null>(null);
  const [vendorSuggestion, setVendorSuggestion] =
    useState<VendorAssignmentSuggestion | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [photoRefs, setPhotoRefs] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [status, setStatus] = useState("");
  const createInFlight = useRef(false),
    shared = useMaintenanceTicketState(),
    sharedRef = useRef(shared);
  useEffect(() => {
    sharedRef.current = shared;
  }, [shared]);
  const [pendingIntent, setPendingIntent] = useState<{
      id: string;
      command: MaintenanceCreationCommand | null;
    } | null>(null),
    [createdTicket, setCreatedTicket] = useState<MaintenanceTicketRecord | null>(null),
    [ready, setReady] = useState(false);
  const storageKey = `pmi-kc:maintenance-creation:${reporterUid}`,
    mounted = useRef(true),
    actorRef = useRef(reporterUid),
    readGeneration = useRef(0);
  useEffect(() => {
    actorRef.current = reporterUid;
  }, [reporterUid]);
  const accepted = useCallback(
    (raw: unknown) => {
      if (!mounted.current || actorRef.current !== reporterUid) return;
      const parsed = CreatedTicketSchema.safeParse(raw);
      if (!parsed.success)
        throw Error("The creation response was incomplete. Check the original result.");
      readGeneration.current += 1;
      const ticket = parsed.data as MaintenanceTicketRecord;
      setCreatedTicket(ticket);
      setPendingIntent(null);
      setStatus(
        `Ticket created (${ticket.status}). Open the exact ticket below; no provider work order was created by this app save.`,
      );
      sharedRef.current?.recordCreated(ticket);
      try {
        sessionStorage.removeItem(`pmi-kc:maintenance-creation:${reporterUid}`);
      } catch {}
      const u = new URL(location.href);
      u.searchParams.delete("creation_id");
      u.searchParams.set("ticket_id", ticket.id);
      history.replaceState(null, "", u);
    },
    [reporterUid],
  );
  const readCreation = useCallback(
    async (id: string) => {
      const generation = ++readGeneration.current;
      const response = await fetch(
          `/api/maintenance/tickets?${new URLSearchParams({ creation_id: id })}`,
          { cache: "no-store" },
        ),
        body = await response.json();
      if (
        !mounted.current ||
        actorRef.current !== reporterUid ||
        generation !== readGeneration.current
      )
        return;
      if (!response.ok)
        throw Error(
          typeof body.error === "string"
            ? body.error
            : "The original result could not be read.",
        );
      if (body.creation_id !== id)
        throw Error(
          "The result identifies a different creation request. Keep the original intent for reconciliation.",
        );
      if (body.state === "created") accepted(body.ticket);
      else
        setStatus(
          typeof body.detail === "string"
            ? body.detail
            : "The original creation is still unresolved. Check this same result again; no new creation was sent.",
        );
    },
    [accepted, reporterUid],
  );
  useEffect(() => {
    let live = true;
    mounted.current = true;
    queueMicrotask(() => {
      if (!live) return;
      const u = new URL(location.href);
      let id = u.searchParams.get("creation_id"),
        stored: {
          uid?: unknown;
          command?: unknown;
          typedNote?: unknown;
          transcript?: unknown;
          priority?: unknown;
        } | null = null;
      try {
        const value = sessionStorage.getItem(
          `pmi-kc:maintenance-creation:${reporterUid}`,
        );
        if (value) stored = JSON.parse(value);
      } catch {}
      const parsed = CreateLiveMaintenanceTicketInputSchema.safeParse(stored?.command);
      if (!id && parsed.success && stored?.uid === reporterUid)
        id = parsed.data.creation_id;
      if (
        !id ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id,
        )
      ) {
        setReady(true);
        return;
      }
      const command =
        parsed.success && stored?.uid === reporterUid && parsed.data.creation_id === id
          ? parsed.data
          : null;
      if (command) {
        setTypedNote(
          typeof stored?.typedNote === "string" ? stored?.typedNote : command.description,
        );
        setTranscript(typeof stored?.transcript === "string" ? stored?.transcript : "");
        setPriority(typeof stored?.priority === "string" ? stored?.priority : "");
        setUnitMatch(command.unit);
        setPhotoRefs(command.photo_refs);
        setDraft({
          summary: command.summary,
          description: command.description,
          priority: command.priority as WorkOrderDraft["priority"],
          unit: command.unit,
          photoRefs: command.photo_refs,
          reporter: { uid: reporterUid },
          capturedAt: new Date().toISOString(),
          blockers: [],
          readyForExecution: false,
        });
      }
      setPendingIntent({ id, command });
      setStatus("Checking the original creation result. No new ticket is being created.");
      setReady(true);
      void readCreation(id).catch((error) => {
        if (live)
          setStatus(
            error instanceof Error
              ? error.message
              : "The original creation result is unavailable; keep this intent for reconciliation.",
          );
      });
    });
    return () => {
      live = false;
      mounted.current = false;
      readGeneration.current += 1;
    };
  }, [reporterUid, readCreation]);

  function invalidateDraft() {
    setDraft(null);
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
      operatingPolicy,
    });
    setDraft(workOrder);
    // Assessment determines whether purchased work, an owner decision or communication is needed.
    setVendorSuggestion(suggestVendorAssignment(workOrder.description));
  }

  // The durable ID is retained before dispatch; reload only reads this same result.
  async function createTicket() {
    if (
      !ready ||
      !draft ||
      draft.blockers.length ||
      pendingIntent ||
      createdTicket ||
      createInFlight.current
    )
      return;
    const parsed = CreateLiveMaintenanceTicketInputSchema.safeParse({
      creation_id: crypto.randomUUID(),
      data_mode: "live",
      summary: draft.summary,
      description: draft.description,
      priority: draft.priority,
      priority_provenance: priority ? "operator-set" : "auto-inferred",
      unit: draft.unit ? { ...draft.unit, confidence: "Verified" } : null,
      photo_refs: draft.photoRefs,
    });
    if (!parsed.success) {
      setStatus(
        "The captured ticket is incomplete or too large. Review the issue, location and attachments.",
      );
      return;
    }
    const command = parsed.data;
    createInFlight.current = true;
    setIsCreating(true);
    setPendingIntent({ id: command.creation_id, command });
    setStatus("Creating the app ticket and its initial activity…");
    const u = new URL(location.href);
    u.searchParams.set("creation_id", command.creation_id);
    history.replaceState(null, "", u);
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ uid: reporterUid, command, typedNote, transcript, priority }),
      );
    } catch {
      /* The URL still retains the exact readback identity. */
    }
    try {
      const response = await fetch("/api/maintenance/tickets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(command),
        }),
        body = await response.json();
      if (!mounted.current || actorRef.current !== reporterUid) return;
      if (response.ok) accepted(body.ticket);
      else if (body.request_commit_state === "not_started") {
        setPendingIntent(null);
        try {
          sessionStorage.removeItem(storageKey);
        } catch {}
        const url = new URL(location.href);
        url.searchParams.delete("creation_id");
        history.replaceState(null, "", url);
        setStatus(
          `${typeof body.error === "string" ? body.error : "The ticket could not be admitted."} This request did not start an app-ticket commit. Your work is kept.`,
        );
      } else
        setStatus(
          `${typeof body.error === "string" ? body.error : "The save is unresolved."} Check this original result before creating another ticket.`,
        );
    } catch (error) {
      setStatus(
        waitFailureMessage(
          error,
          "The save response did not arrive. The creation outcome is unknown; check the original result before creating another ticket.",
        ),
      );
    } finally {
      createInFlight.current = false;
      setIsCreating(false);
    }
  }
  async function checkCreation() {
    if (!pendingIntent || createInFlight.current) return;
    createInFlight.current = true;
    setIsCreating(true);
    setStatus("Checking the original app-ticket result…");
    try {
      await readCreation(pendingIntent.id);
    } catch (error) {
      setStatus(
        waitFailureMessage(
          error,
          "The result could not be read. The original creation remains unresolved; no new ticket was sent.",
        ),
      );
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
        <fieldset className="ui-stack" disabled={!!pendingIntent || isCreating}>
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
            initialSelection={unitMatch ?? undefined}
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

          {typedNote.trim() || transcript.trim() ? (
            <aside className="ui-callout" aria-label="Current urgency guidance">
              <strong>{urgencyDecision.priority}</strong>
              <p>{urgencyDecision.guidance}</p>
              <p>{policyState}</p>
              <p>{urgencyDecision.routing.detail}</p>
            </aside>
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
            Review reported issue
          </Button>
        </fieldset>
        {status ? (
          <p className="muted" role="status">
            {status}
          </p>
        ) : null}
      </form>

      <aside className="panel result-panel" aria-live="polite">
        {pendingIntent ? (
          <section aria-label="Creation recovery">
            <h2>Original ticket creation</h2>
            <p>
              The outcome stays unresolved until this exact result can be read. No new
              ticket or provider operation runs during recovery.
            </p>
            <button
              type="button"
              disabled={isCreating}
              onClick={() => void checkCreation()}
            >
              {isCreating ? "Checking…" : "Check creation result"}
            </button>
          </section>
        ) : null}
        {createdTicket ? (
          <section aria-label="Created ticket">
            <a
              href={maintenanceTicketHref(createdTicket.id)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open created ticket: {createdTicket.summary}
            </a>
            <button
              type="button"
              onClick={() => {
                setCreatedTicket(null);
                invalidateDraft();
                setStatus(
                  "The original ticket is kept. Enter and review a deliberately separate issue before creating another ticket.",
                );
              }}
            >
              Start another ticket
            </button>
          </section>
        ) : null}
        {draft ? (
          <>
            <h2>Reported issue review</h2>
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
              <p className="muted">No blockers. Ready for human review.</p>
            )}

            <Button
              aria-describedby={
                draft.blockers.length > 0 ? "maintenance-ticket-blockers" : undefined
              }
              disabled={
                !ready ||
                isCreating ||
                !!pendingIntent ||
                !!createdTicket ||
                draft.blockers.length > 0
              }
              onClick={createTicket}
              size="large"
              type="button"
            >
              {isCreating
                ? "Creating…"
                : createdTicket
                  ? "Ticket created"
                  : pendingIntent
                    ? "Needs reconciliation"
                    : "Create ticket"}
            </Button>

            {vendorSuggestion ? (
              <section aria-label="Vendor assignment suggestion">
                <h3>Vendor assignment: suggestion</h3>
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
