// S63 append-only evidence record (AC-S63-4, AC-S63-5, AC-S63-12). One document PER ENTRY,
// create-only with a time-ordered uuidv7 id — append-only by construction, so recording the human
// number after the app number preserves both, and a re-recorded decision never erases its
// predecessor. This matters because the operational progress record writes a full non-merge set;
// on a shared field it would overwrite the human number with the app number or the reverse, which
// is exactly the comparison-destroying conflation the evidence record exists to prevent.
//
// Every entry timestamps `recordedAt`, so a reader can tell whether the human's figure was
// captured before the app's output (blind) or after it (informed) — a record that cannot
// distinguish the two fails the test's own standard (AC-S63-12).
//
// Evidence documents contain client data (rents, recipients) and live only in Firestore — never
// in git. The generated report is produced from these records and written outside git.

import { type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";

export const TEST_SET_EVIDENCE_COLLECTION = "renewal_test_set_evidence";

/** Every kind of thing the test set records, each an immutable appended entry. */
export const TEST_SET_EVIDENCE_KINDS = [
  // The app's derived position: proposed rent + basis, comps, rule applied, recipients, draft.
  "app_position",
  // The human's actual position: the rent the team landed on and how.
  "human_position",
  // A source disagreement the app raised (e.g. lease 297's RentVine-zero vs Sheet rent).
  "discrepancy_raised",
  // How a raised discrepancy was dispositioned by a person.
  "discrepancy_disposition",
  // A stage transition observed during the window.
  "stage_transition",
  // A human reviewed-and-sent draft under D33, if the owner resolves the window that way.
  "human_send",
  // A per-lease verdict evaluation against the four criteria.
  "verdict",
] as const;

export type TestSetEvidenceKind = (typeof TEST_SET_EVIDENCE_KINDS)[number];

export interface TestSetEvidenceEntry {
  id: string;
  leaseId: string;
  kind: TestSetEvidenceKind;
  /** Plain-English statement of what was observed or decided. */
  note: string;
  /** Structured detail for the report generator; shape varies by kind. */
  payload: Record<string, unknown>;
  recordedAt: string;
  recordedByUid: string;
}

export interface AppendTestSetEvidenceInput {
  leaseId: string;
  kind: TestSetEvidenceKind;
  note: string;
  payload?: Record<string, unknown>;
}

function assertEditor(actor: AuthenticatedUser): void {
  if (!can(actor.role, "edit")) {
    throw new EditableLayerError(
      "You do not have permission to record test-set evidence.",
      403,
    );
  }
}

function assertReader(actor: AuthenticatedUser): void {
  if (!can(actor.role, "read")) {
    throw new EditableLayerError(
      "You do not have permission to read test-set evidence.",
      403,
    );
  }
}

/** Append one evidence entry. CREATE-ONLY — there is no update or delete path in this module. */
export async function appendTestSetEvidence(
  actor: AuthenticatedUser,
  input: AppendTestSetEvidenceInput,
  db: Firestore = getAdminFirestore(),
): Promise<TestSetEvidenceEntry> {
  assertEditor(actor);
  const leaseId = String(input.leaseId ?? "").trim();
  if (leaseId === "") {
    throw new EditableLayerError("A lease id is required to record evidence.", 400);
  }
  if (!TEST_SET_EVIDENCE_KINDS.includes(input.kind)) {
    throw new EditableLayerError(`Unknown evidence kind: ${String(input.kind)}`, 400);
  }
  const note = String(input.note ?? "").trim();
  if (note === "") {
    throw new EditableLayerError("A plain-English evidence note is required.", 400);
  }

  const id = uuidv7();
  const recordedAt = new Date().toISOString();
  const ref = db.collection(TEST_SET_EVIDENCE_COLLECTION).doc(id);
  await db.runTransaction(async (transaction) => {
    transaction.create(ref, {
      id,
      lease_id: leaseId,
      kind: input.kind,
      note,
      payload: input.payload ?? {},
      recorded_at: recordedAt,
      recorded_by_uid: actor.uid,
    });
  });

  return {
    id,
    leaseId,
    kind: input.kind,
    note,
    payload: input.payload ?? {},
    recordedAt,
    recordedByUid: actor.uid,
  };
}

/** Every entry for a lease in recorded order (uuidv7 ids tie-break equal timestamps). */
export async function listTestSetEvidence(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<TestSetEvidenceEntry[]> {
  assertReader(actor);
  const trimmed = String(leaseId ?? "").trim();
  if (trimmed === "") return [];
  const snapshot = await db
    .collection(TEST_SET_EVIDENCE_COLLECTION)
    .where("lease_id", "==", trimmed)
    .get();
  const entries: TestSetEvidenceEntry[] = [];
  for (const doc of snapshot.docs) {
    const entry = entryFromRecord((doc.data() ?? {}) as Record<string, unknown>);
    if (entry) entries.push(entry);
  }
  return entries.sort(
    (left, right) =>
      left.recordedAt.localeCompare(right.recordedAt) || left.id.localeCompare(right.id),
  );
}

/**
 * AC-S63-12: was the human's position captured blind (before any app position existed for the
 * lease) or informed (after)? Returns null when either side has not been recorded yet.
 */
export function humanComparisonMode(
  entries: readonly TestSetEvidenceEntry[],
): "blind" | "informed" | null {
  const firstApp = entries.find((entry) => entry.kind === "app_position");
  const firstHuman = entries.find((entry) => entry.kind === "human_position");
  if (!firstApp || !firstHuman) return null;
  const order =
    firstHuman.recordedAt.localeCompare(firstApp.recordedAt) ||
    firstHuman.id.localeCompare(firstApp.id);
  return order < 0 ? "blind" : "informed";
}

function entryFromRecord(raw: Record<string, unknown>): TestSetEvidenceEntry | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  const leaseId = typeof raw.lease_id === "string" ? raw.lease_id : null;
  const kind =
    TEST_SET_EVIDENCE_KINDS.find((candidate) => candidate === raw.kind) ?? null;
  if (!id || !leaseId || !kind) return null;
  return {
    id,
    leaseId,
    kind,
    note: typeof raw.note === "string" ? raw.note : "",
    payload:
      raw.payload && typeof raw.payload === "object"
        ? (raw.payload as Record<string, unknown>)
        : {},
    recordedAt: typeof raw.recorded_at === "string" ? raw.recorded_at : "",
    recordedByUid: typeof raw.recorded_by_uid === "string" ? raw.recorded_by_uid : "",
  };
}
