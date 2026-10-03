import type { RenewalWorkStatus, RenewalWorkStatusActivity } from "./work-status";

// S164: staff notes in the lease's running Status log. A note is its own app-owned entry with its
// own identity and revision. It never changes the staff status, a cycle, an approval, completion or
// any provider evidence, and nothing here reads meaning out of the note text. Pure and client-safe.

export const RENEWAL_STATUS_NOTE_SCHEMA_VERSION = "renewal-status-note/v1";
export const RENEWAL_STATUS_NOTE_MAX_LENGTH = 4000;
export const RENEWAL_STATUS_NOTE_LABEL = "Add a note";
export const RENEWAL_STATUS_LOG_LABEL = "Status log";
export const RENEWAL_STATUS_NOTE_START_ANOTHER_LABEL = "Start another note";

export interface RenewalStatusNote {
  readonly schemaVersion: typeof RENEWAL_STATUS_NOTE_SCHEMA_VERSION;
  readonly leaseId: string;
  /** The logical entry identity. One composed note keeps it across every save and retry. */
  readonly noteId: string;
  readonly revision: number;
  readonly text: string;
  /** When the note was first saved. The original attribution never changes afterwards. */
  readonly recordedAt: string;
  readonly recordedByUid: string;
  readonly recordedByLabel: string;
  /** When the composition was last saved; equal to recordedAt for a note saved once. */
  readonly updatedAt: string;
  /** The operation that last saved it; a lost response is recognized by comparing it. */
  readonly eventId: string;
}

/**
 * The text a note save would store: line endings unified and the outer whitespace removed. Null
 * means there is nothing to save, so empty input never becomes a note.
 */
export function normalizeStatusNoteText(raw: string): string | null {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  return text.length > 0 ? text : null;
}

export type RenewalStatusLogEntry =
  | {
      readonly kind: "status";
      readonly id: string;
      readonly at: string;
      readonly byUid: string;
      readonly byLabel: string;
      readonly status: RenewalWorkStatus;
      readonly previousStatus: RenewalWorkStatus | null;
    }
  | {
      readonly kind: "note";
      readonly id: string;
      readonly at: string;
      readonly byUid: string;
      readonly byLabel: string;
      readonly text: string;
      /** Set only when the composition was saved again after its first save. */
      readonly lastSavedAt: string | null;
    };

/**
 * The one running log: every recorded status change and every note, oldest first, each with the
 * actor and time the server recorded. A note is placed by its first save, so continuing to write it
 * never moves or repeats it. Entries are only read here; nothing is rewritten or removed.
 */
export function buildRenewalStatusLog(
  history: readonly RenewalWorkStatusActivity[],
  notes: readonly RenewalStatusNote[],
): RenewalStatusLogEntry[] {
  const seenNotes = new Set<string>();
  const entries: RenewalStatusLogEntry[] = history.map((entry) => ({
    kind: "status" as const,
    id: entry.id,
    at: entry.recordedAt,
    byUid: entry.recordedByUid,
    byLabel: entry.recordedByLabel,
    status: entry.status,
    previousStatus: entry.previousStatus,
  }));
  for (const note of notes) {
    if (seenNotes.has(note.noteId)) continue;
    seenNotes.add(note.noteId);
    entries.push({
      kind: "note",
      id: note.noteId,
      at: note.recordedAt,
      byUid: note.recordedByUid,
      byLabel: note.recordedByLabel,
      text: note.text,
      lastSavedAt: note.updatedAt !== note.recordedAt ? note.updatedAt : null,
    });
  }
  return entries.sort(
    (a, b) =>
      a.at.localeCompare(b.at) ||
      a.kind.localeCompare(b.kind) ||
      a.id.localeCompare(b.id),
  );
}

/** Keep one entry per note id, preferring the newer revision, so an older answer never wins. */
export function mergeStatusNotes(
  current: readonly RenewalStatusNote[],
  incoming: readonly RenewalStatusNote[],
): RenewalStatusNote[] {
  const byId = new Map<string, RenewalStatusNote>();
  for (const note of [...current, ...incoming]) {
    const prior = byId.get(note.noteId);
    if (!prior || note.revision >= prior.revision) byId.set(note.noteId, note);
  }
  return [...byId.values()].sort(
    (a, b) =>
      a.recordedAt.localeCompare(b.recordedAt) || a.noteId.localeCompare(b.noteId),
  );
}
