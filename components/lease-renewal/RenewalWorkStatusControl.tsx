"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  AUTOSAVE_EDITED,
  AUTOSAVE_IDLE,
  AutosaveStatus,
  type AutosaveState,
} from "./AutosaveStatus";
import { Button, Field } from "@/components/ui";
import {
  NOT_RECORDED_WORK_STATUS_LABEL,
  RENEWAL_WORK_STATUSES,
  RENEWAL_WORK_STATUS_CONTROL_LABEL,
  RENEWAL_WORK_STATUS_LABELS,
  WORK_STATUS_CYCLE_NOTES,
  formatWorkStatusRecordedAt,
  projectRenewalWorkStatus,
  workStatusQueryKey,
  type RenewalWorkStatus,
  type RenewalWorkStatusActivity,
  type RenewalWorkStatusPanelInput,
  type RenewalWorkStatusRecord,
} from "@/lib/lease-renewal/work-status";
import {
  RENEWAL_STATUS_LOG_LABEL,
  RENEWAL_STATUS_NOTE_LABEL,
  RENEWAL_STATUS_NOTE_MAX_LENGTH,
  RENEWAL_STATUS_NOTE_START_ANOTHER_LABEL,
  buildRenewalStatusLog,
  mergeStatusNotes,
  normalizeStatusNoteText,
  type RenewalStatusNote,
} from "@/lib/lease-renewal/work-status-notes";

const SAVED: AutosaveState = Object.freeze({ phase: "saved" });
const SAVING: AutosaveState = Object.freeze({ phase: "saving" });

interface StatusLogRead {
  readonly record: RenewalWorkStatusRecord | null;
  readonly history: RenewalWorkStatusActivity[];
  readonly notes: RenewalStatusNote[];
}

/** One note being written: a stable identity from its first save until another note is started. */
interface NoteComposition {
  noteId: string | null;
  revision: number;
  savedText: string;
  /** The unanswered request, kept so a retry of the same text reuses its operation id. */
  pending: { key: string; operationId: string } | null;
  /** Every operation this composition sent, to recognize its own save after a lost response. */
  readonly sent: Set<string>;
}

/** The saved status, its history and the notes, or null when they could not be read. */
async function readStatusLog(leaseId: string): Promise<StatusLogRead | null> {
  try {
    const response = await fetch(
      `/api/lease-renewal/work-status?leaseId=${encodeURIComponent(leaseId)}`,
      { method: "GET" },
    );
    const body = (await response.json().catch(() => ({}))) as Partial<StatusLogRead>;
    if (!response.ok) return null;
    return {
      record: body.record ?? null,
      history: body.history ?? [],
      notes: body.notes ?? [],
    };
  } catch {
    return null;
  }
}

function newComposition(): NoteComposition {
  return { noteId: null, revision: 0, savedText: "", pending: null, sent: new Set() };
}

/**
 * S119/S164: the staff work status and the lease's running Status log. A status choice saves by
 * itself when it is made, and a note saves by itself when the note area is left or typing pauses;
 * neither needs the other and neither asks for a second step. "Saved" is shown only after the app
 * returned the stored value. A failed save keeps the choice or the text with the same save offered
 * again, a real conflict shows the current saved value, and a lost response is settled by reading
 * the saved record, never by writing twice. One composed note stays one log entry however many
 * times it saves; starting another note makes a new entry. Nothing here records approval, delivery,
 * a signature, completion or a source update, and note text is never read for meaning.
 */
export function RenewalWorkStatusControl({
  leaseId,
  canEdit,
  read,
  noteIdleMs = 1500,
}: Readonly<{
  leaseId: string;
  canEdit: boolean;
  read: RenewalWorkStatusPanelInput;
  /** How long typing pauses before the note saves by itself. */
  noteIdleMs?: number;
}>) {
  const router = useRouter();
  const noteFieldId = useId();
  const [available, setAvailable] = useState(read.available);
  const [saved, setSaved] = useState<RenewalWorkStatusRecord | null>(read.record);
  const [history, setHistory] = useState<readonly RenewalWorkStatusActivity[]>(
    read.history,
  );
  const [selected, setSelected] = useState<RenewalWorkStatus | "">(
    read.record?.status ?? "",
  );
  const [statusState, setStatusState] = useState<AutosaveState>(AUTOSAVE_IDLE);
  const savedRef = useRef(read.record);
  const selectedRef = useRef<RenewalWorkStatus | "">(read.record?.status ?? "");
  const statusPending = useRef<{ key: string; id: string } | null>(null);
  /** Every status operation this control sent, to recognize its own save on a readback. */
  const statusSent = useRef(new Set<string>());
  const statusFlight = useRef(false);
  const statusQueued = useRef<RenewalWorkStatus | null>(null);

  const pageSuppliedNotes = read.notes !== undefined;
  const [localNotes, setLocalNotes] = useState<readonly RenewalStatusNote[]>([]);
  const [notesRead, setNotesRead] = useState<"ready" | "reading" | "unavailable">(
    pageSuppliedNotes ? "ready" : "reading",
  );
  const [noteText, setNoteText] = useState("");
  const [noteState, setNoteState] = useState<AutosaveState>(AUTOSAVE_IDLE);
  const [noteError, setNoteError] = useState<string | null>(null);
  /** True once the note in the note area has been saved, so another can be started. */
  const [noteSaved, setNoteSaved] = useState(false);
  const noteTextRef = useRef("");
  const composition = useRef<NoteComposition>(newComposition());
  const noteFlight = useRef<Promise<boolean> | null>(null);
  const noteQueued = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const controlId = `renewal-work-status-${leaseId}`;

  const projection = projectRenewalWorkStatus(
    available ? { available: true, record: saved } : { available: false },
    read.currentCycleId,
  );
  // The page can deliver newer notes on refresh and a save here can be newer than the page.
  const notes = useMemo(
    () => mergeStatusNotes(read.notes ?? [], localNotes),
    [read.notes, localNotes],
  );
  const log = useMemo(
    () => buildRenewalStatusLog(history, notes).reverse(),
    [history, notes],
  );

  const applyNotes = useCallback((incoming: readonly RenewalStatusNote[]) => {
    // An older answer never replaces a newer saved note.
    setLocalNotes((current) => mergeStatusNotes(current, incoming));
    setNotesRead("ready");
  }, []);

  // The page did not carry the notes: read them once through the same route.
  useEffect(() => {
    if (pageSuppliedNotes) return;
    let cancelled = false;
    void readStatusLog(leaseId).then((current) => {
      if (cancelled) return;
      if (current) applyNotes(current.notes);
      else setNotesRead("unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, [pageSuppliedNotes, leaseId, applyNotes]);

  async function readNotesAgain() {
    const current = await readStatusLog(leaseId);
    if (current) applyNotes(current.notes);
    else setNotesRead("unavailable");
  }

  useEffect(
    () => () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    },
    [],
  );

  function applyStatus(current: StatusLogRead | Omit<StatusLogRead, "notes">) {
    savedRef.current = current.record;
    setSaved(current.record);
    setHistory(current.history);
    setAvailable(true);
    if ("notes" in current) applyNotes(current.notes);
  }

  async function sendStatus(status: RenewalWorkStatus) {
    const expectedRevision = savedRef.current?.revision ?? 0;
    const key = `${status}:${expectedRevision}`;
    if (statusPending.current?.key !== key)
      statusPending.current = { key, id: crypto.randomUUID() };
    const operationId = statusPending.current.id;
    statusSent.current.add(operationId);
    setStatusState(SAVING);
    let response: { ok: boolean; status: number; json: () => Promise<unknown> };
    try {
      response = await fetch("/api/lease-renewal/work-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leaseId, status, expectedRevision, operationId }),
      });
    } catch {
      // The response was lost. Read the saved state; the operation id proves whether it landed.
      const current = await readStatusLog(leaseId);
      if (current?.record?.eventId === operationId) {
        statusPending.current = null;
        applyStatus(current);
        setStatusState(SAVED);
        // The page's compact context and desk row read the server projection; refresh them.
        router.refresh();
        return;
      }
      if (current) applyStatus(current);
      setStatusState({
        phase: "failed",
        message: current
          ? "The save did not finish."
          : "The save did not finish and the saved status could not be read back.",
      });
      return;
    }
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      record?: RenewalWorkStatusRecord;
      history?: RenewalWorkStatusActivity[];
    };
    if (!response.ok || !body.record) {
      const message = body.error ?? "The status could not be saved.";
      if (response.status === 409) {
        statusPending.current = null;
        const current = await readStatusLog(leaseId);
        if (current) {
          applyStatus(current);
          router.refresh();
        }
        // An earlier attempt of this same choice landed without its response: it is saved.
        const own =
          current?.record?.status === status &&
          statusSent.current.has(current.record.eventId);
        setStatusState(own ? SAVED : { phase: "failed", message, conflict: true });
        return;
      }
      // A refused request was never stored, so the same choice can go out as a new request. A
      // server failure may have stored it, so its retry keeps the same operation id.
      if (response.status < 500) statusPending.current = null;
      setStatusState({ phase: "failed", message });
      return;
    }
    statusPending.current = null;
    applyStatus({ record: body.record, history: body.history ?? [] });
    setStatusState(SAVED);
    router.refresh();
  }

  /** One status save at a time; a choice made meanwhile is saved next, in order. */
  async function saveStatus(status: RenewalWorkStatus) {
    if (!canEdit || !available) return;
    if (statusFlight.current) {
      statusQueued.current = status;
      return;
    }
    statusFlight.current = true;
    try {
      await sendStatus(status);
    } finally {
      statusFlight.current = false;
    }
    const next = statusQueued.current;
    statusQueued.current = null;
    if (!next) return;
    if (next !== savedRef.current?.status) {
      await saveStatus(next);
      return;
    }
    // The later choice is the saved value: nothing is left to save or to retry.
    statusPending.current = null;
    setStatusState((state) => (state.phase === "failed" ? AUTOSAVE_IDLE : state));
  }

  function chooseStatus(value: RenewalWorkStatus | "") {
    selectedRef.current = value;
    setSelected(value);
    if (value === "") return;
    if (!statusFlight.current && value === savedRef.current?.status) {
      // Back on the saved value: there is nothing to save and nothing left to retry.
      statusPending.current = null;
      setStatusState(AUTOSAVE_IDLE);
      return;
    }
    void saveStatus(value);
  }

  async function sendNote(
    current: NoteComposition,
    text: string,
    recovered = false,
  ): Promise<boolean> {
    const shown = () => composition.current === current;
    current.noteId ??= crypto.randomUUID();
    const request = {
      kind: "note",
      leaseId,
      noteId: current.noteId,
      text,
      expectedRevision: current.revision,
    };
    const key = JSON.stringify(request);
    if (current.pending?.key !== key)
      current.pending = { key, operationId: crypto.randomUUID() };
    const operationId = current.pending.operationId;
    current.sent.add(operationId);
    if (shown()) setNoteState(SAVING);
    let response: { ok: boolean; status: number; json: () => Promise<unknown> };
    try {
      response = await fetch("/api/lease-renewal/work-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...request, operationId }),
      });
    } catch {
      // The response was lost: the same request is kept so a retry cannot add a second note.
      if (shown()) setNoteState({ phase: "failed", message: "The save did not finish." });
      return false;
    }
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      note?: RenewalStatusNote;
      notes?: RenewalStatusNote[];
    };
    if (!response.ok || !body.note) {
      const message = body.error ?? "The note could not be saved.";
      if (response.status === 409) {
        current.pending = null;
        const readback = await readStatusLog(leaseId);
        if (readback) applyNotes(readback.notes);
        const stored =
          readback?.notes.find((entry) => entry.noteId === current.noteId) ?? null;
        if (stored) {
          current.revision = stored.revision;
          current.savedText = stored.text;
          if (shown()) setNoteSaved(true);
          if (!recovered && current.sent.has(stored.eventId)) {
            // An earlier save of this same note landed without its response. Continue it.
            if (stored.text === text) {
              if (shown()) setNoteState(SAVED);
              return true;
            }
            return sendNote(current, text, true);
          }
        }
        if (shown()) setNoteState({ phase: "failed", message, conflict: true });
        return false;
      }
      if (response.status < 500) current.pending = null;
      if (shown()) setNoteState({ phase: "failed", message });
      return false;
    }
    current.pending = null;
    current.revision = body.note.revision;
    current.savedText = body.note.text;
    applyNotes(body.notes ?? [body.note]);
    if (shown()) {
      setNoteSaved(true);
      // "Saved" is claimed only for what is in the note area now; newer typing saves next.
      setNoteState(
        normalizeStatusNoteText(noteTextRef.current) === current.savedText
          ? SAVED
          : AUTOSAVE_IDLE,
      );
    }
    return true;
  }

  function beginNote() {
    composition.current = newComposition();
    setNoteSaved(false);
    setNoteState(AUTOSAVE_IDLE);
    setNoteError(null);
  }

  /** True when nothing in the note area is left unsaved. */
  async function commitNoteOnce(): Promise<boolean> {
    const current = composition.current;
    const text = normalizeStatusNoteText(noteTextRef.current);
    if (text === null) {
      // Empty input is never saved. Emptying a note that was already sent ends it: whatever was
      // saved stays in the log as it is and the next text starts another note.
      if (current.noteId !== null) beginNote();
      setNoteError(null);
      setNoteState(AUTOSAVE_IDLE);
      return true;
    }
    if (text.length > RENEWAL_STATUS_NOTE_MAX_LENGTH) {
      setNoteError(
        "A note can hold up to 4,000 characters. Shorten it and it saves by itself, or continue in another note.",
      );
      return false;
    }
    setNoteError(null);
    if (text === current.savedText) {
      setNoteState((state) => (state.phase === "failed" ? SAVED : state));
      return true;
    }
    return sendNote(current, text);
  }

  /** One note save at a time; text that changed meanwhile is saved next under the same note. */
  function commitNote(): Promise<boolean> {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    if (!canEdit) return Promise.resolve(false);
    if (noteFlight.current) {
      noteQueued.current = true;
      return noteFlight.current;
    }
    const run = (async () => {
      try {
        let ok = await commitNoteOnce();
        while (noteQueued.current) {
          noteQueued.current = false;
          ok = await commitNoteOnce();
        }
        return ok;
      } finally {
        noteFlight.current = null;
      }
    })();
    noteFlight.current = run;
    return run;
  }

  function typeNote(value: string) {
    noteTextRef.current = value;
    setNoteText(value);
    setNoteError(null);
    // Typed words that are not in the saved note say so until their save starts.
    const typed = normalizeStatusNoteText(value);
    const unsaved = typed !== null && typed !== composition.current.savedText;
    setNoteState((state) =>
      state.phase === "saving"
        ? state
        : unsaved
          ? AUTOSAVE_EDITED
          : state.phase === "saved" || state.phase === "edited"
            ? AUTOSAVE_IDLE
            : state,
    );
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => void commitNote(), noteIdleMs);
  }

  async function startAnotherNote() {
    // Anything still unsaved in the note area is saved first; if that fails the text stays.
    if (!(await commitNote())) return;
    const text = normalizeStatusNoteText(noteTextRef.current);
    if (text !== null && text !== composition.current.savedText) return;
    beginNote();
    noteTextRef.current = "";
    setNoteText("");
    noteInput.current?.focus();
  }

  const logItems = log.map((entry) =>
    entry.kind === "note" ? (
      <li
        data-status-log-id={entry.id}
        data-status-log-kind="note"
        key={`note:${entry.id}`}
      >
        <p className="renewal-status-log-text">{entry.text}</p>
        <p className="muted renewal-status-log-meta">
          Note by {entry.byLabel} at{" "}
          <time dateTime={entry.at}>{formatWorkStatusRecordedAt(entry.at)}</time>
          {entry.lastSavedAt ? (
            <>
              , last saved at{" "}
              <time dateTime={entry.lastSavedAt}>
                {formatWorkStatusRecordedAt(entry.lastSavedAt)}
              </time>
            </>
          ) : null}
        </p>
      </li>
    ) : (
      <li
        data-status-log-id={entry.id}
        data-status-log-kind="status"
        key={`status:${entry.id}`}
      >
        {RENEWAL_WORK_STATUS_LABELS[entry.status]} (was{" "}
        {entry.previousStatus
          ? RENEWAL_WORK_STATUS_LABELS[entry.previousStatus]
          : NOT_RECORDED_WORK_STATUS_LABEL}
        ), recorded by {entry.byLabel} at{" "}
        <time dateTime={entry.at}>{formatWorkStatusRecordedAt(entry.at)}</time>
      </li>
    ),
  );

  return (
    <div className="ui-stack-tight renewal-work-status">
      <p
        className="renewal-work-status-saved"
        data-testid="renewal-work-status-saved"
        data-work-status={workStatusQueryKey(projection)}
      >
        {projection.state === "recorded" ? (
          <>
            Saved status: <strong>{projection.label}</strong>, recorded by{" "}
            {projection.recordedByLabel} at{" "}
            <time dateTime={projection.recordedAt}>
              {formatWorkStatusRecordedAt(projection.recordedAt)}
            </time>
            . {WORK_STATUS_CYCLE_NOTES[projection.cycleRelation]}
          </>
        ) : projection.state === "not_recorded" ? (
          `Saved status: ${NOT_RECORDED_WORK_STATUS_LABEL}.`
        ) : (
          "Work status could not be read. Reload to read it again; the last saved status is unknown."
        )}
      </p>
      <Field
        hint="A choice saves by itself."
        htmlFor={controlId}
        label={RENEWAL_WORK_STATUS_CONTROL_LABEL}
      >
        <select
          disabled={!canEdit || !available}
          id={controlId}
          onChange={(event) => chooseStatus(event.target.value as RenewalWorkStatus | "")}
          value={selected}
        >
          {saved ? null : (
            <option disabled value="">
              {available ? NOT_RECORDED_WORK_STATUS_LABEL : "Not read"}
            </option>
          )}
          {RENEWAL_WORK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {RENEWAL_WORK_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </Field>
      <div data-testid="renewal-work-status-autosave">
        <AutosaveStatus
          onRetry={() => {
            if (selectedRef.current !== "") void saveStatus(selectedRef.current);
          }}
          state={statusState}
          subject="Work status"
        />
      </div>
      {canEdit ? null : (
        <p className="muted">
          Saving the status or a note needs Editor access. The saved status and the log
          stay visible.
        </p>
      )}
      <Field
        error={noteError ?? undefined}
        hint="A note saves by itself and leaves the status as it is."
        htmlFor={noteFieldId}
        label={RENEWAL_STATUS_NOTE_LABEL}
      >
        <textarea
          className="renewal-status-note-input"
          disabled={!canEdit}
          id={noteFieldId}
          onBlur={() => void commitNote()}
          onChange={(event) => typeNote(event.target.value)}
          ref={noteInput}
          rows={3}
          value={noteText}
        />
      </Field>
      <div
        className="renewal-status-note-actions"
        data-testid="renewal-status-note-autosave"
      >
        <AutosaveStatus
          onRetry={() => void commitNote()}
          state={noteState}
          subject="Note"
        />
        {canEdit && noteSaved ? (
          <Button
            onClick={() => void startAnotherNote()}
            size="compact"
            variant="tertiary"
          >
            {RENEWAL_STATUS_NOTE_START_ANOTHER_LABEL}
          </Button>
        ) : null}
      </div>
      <details
        className="renewal-work-status-history"
        data-testid="renewal-status-log"
        open
      >
        <summary>{RENEWAL_STATUS_LOG_LABEL}</summary>
        {notesRead === "unavailable" ? (
          <p className="renewal-status-log-unread">
            Saved notes could not be read, so only status changes are listed.{" "}
            <Button
              onClick={() => void readNotesAgain()}
              size="compact"
              variant="tertiary"
            >
              Read the notes again
            </Button>
          </p>
        ) : null}
        {notesRead === "reading" ? <p className="muted">Reading saved notes.</p> : null}
        {log.length === 0 ? (
          notesRead === "ready" ? (
            <p className="muted">No status changes or notes recorded yet.</p>
          ) : null
        ) : (
          <>
            <p className="muted">Newest first.</p>
            <ol className="ui-rows renewal-status-log">{logItems.slice(0, 5)}</ol>
            {logItems.length > 5 ? (
              <details>
                <summary>Older entries ({logItems.length - 5})</summary>
                <ol className="ui-rows renewal-status-log">{logItems.slice(5)}</ol>
              </details>
            ) : null}
          </>
        )}
      </details>
    </div>
  );
}
