// Support report store (F-SUPP-1). The "Report an issue" button and the error boundaries route
// reports here: a durable, Admin-reviewable Firestore collection. This is the monitored destination
// a report is delivered to, so a successful write IS delivery. (S39.3: the report-issue route
// additionally auto-sends a metadata-only INTERNAL-staff notice after this write — best-effort,
// D-AUTOMATION-LINE — but this store itself never sends, and every client-facing send stays
// human-confirmed.) A write failure is a soft failure the caller surfaces honestly (delivered:false),
// never unqualified success.
//
// PRIVACY (TIX-8): only allowlisted, non-sensitive context is stored — route pathname, viewport,
// user-agent, and the IDENTITY (not the value/label) of the last-interacted element — plus the
// reporter's own optional free-text description. No app data, input values, aria-label, or textContent.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import type {
  SupportReportElementHint,
  SupportReportRecord,
} from "@/lib/firestore/types";
import { stampProductRecordRetention } from "@/lib/operations/product-record-retention";

const COLLECTION = "support_reports";
const ACTIVITY_COLLECTION = "support_report_activity";
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

const SUPPORT_REPORT_STATUSES: readonly SupportReportRecord["status"][] = [
  "new",
  "acknowledged",
  "resolved",
];

export interface CreateSupportReportInput {
  route: string;
  description?: string;
  origin: SupportReportRecord["origin"];
  viewport?: string;
  userAgent?: string;
  element?: SupportReportElementHint;
  errorDigest?: string;
}

export interface ListSupportReportsOptions {
  limit?: number;
}

/**
 * Persist one support report. Any signed-in reporter may file (the route gates on "read"); this is
 * the delivery step, so the caller treats a thrown error as delivered:false. Returns the saved record.
 */
export async function createSupportReport(
  actor: Pick<AuthenticatedUser, "uid" | "role">,
  input: CreateSupportReportInput,
  db: Firestore = getAdminFirestore(),
): Promise<SupportReportRecord> {
  const id = uuidv7();
  const record = stampProductRecordRetention(
    COLLECTION,
    stripUndefined({
      id,
      route: input.route,
      description: input.description,
      reporter_uid: actor.uid,
      reporter_role: actor.role,
      origin: input.origin,
      status: "new" as const,
      viewport: input.viewport,
      user_agent: input.userAgent,
      element: input.element,
      error_digest: input.errorDigest,
    }),
  );

  await db
    .collection(COLLECTION)
    .doc(id)
    .set({ ...record, created_at: FieldValue.serverTimestamp() });

  const saved = await db.collection(COLLECTION).doc(id).get();
  return readRecord(saved.id, saved.data()!);
}

/** List recent support reports, newest first. Admin-only: this is operational triage data. */
export async function listSupportReports(
  actor: AuthenticatedUser,
  options: ListSupportReportsOptions = {},
  db: Firestore = getAdminFirestore(),
): Promise<SupportReportRecord[]> {
  assertAdmin(actor);
  const limit = Math.min(
    Math.max(options.limit ?? DEFAULT_LIST_LIMIT, 1),
    MAX_LIST_LIMIT,
  );
  const snapshot = await db.collection(COLLECTION).get();

  return snapshot.docs
    .map((doc) => readRecord(doc.id, doc.data()))
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, limit);
}

function assertAdmin(actor: AuthenticatedUser) {
  if (!can(actor.role, "manageAdmin")) {
    throw new EditableLayerError("Only Admins can view support reports.", 403);
  }
}

export interface TransitionSupportReportInput {
  reportId: string;
  status: SupportReportRecord["status"];
  /** Optional short note recorded on the audit entry (e.g. "won't fix: duplicate of #12"). */
  note?: string;
}

/**
 * S65 (AC-S65-1/2/3/6): move a report between the three statuses that already exist. Admin-only.
 * Every transition appends an audit record naming the actor and both statuses. A status change is
 * never a deletion: only the status fields move; the report body, its retention class, and its
 * legal-hold flag are untouched. No new status value exists beyond the three already typed.
 */
export async function transitionSupportReport(
  actor: AuthenticatedUser,
  input: TransitionSupportReportInput,
  db: Firestore = getAdminFirestore(),
): Promise<SupportReportRecord> {
  assertAdmin(actor);
  const reportId = String(input.reportId ?? "").trim();
  if (reportId === "") {
    throw new EditableLayerError("A report id is required.", 400);
  }
  if (!SUPPORT_REPORT_STATUSES.includes(input.status)) {
    throw new EditableLayerError(
      "The status must be one of new, acknowledged, or resolved.",
      400,
    );
  }
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : "";

  const ref = db.collection(COLLECTION).doc(reportId);
  const nowIso = new Date().toISOString();
  const activityId = uuidv7();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      throw new EditableLayerError("That report does not exist.", 404);
    }
    const previousStatus = (snapshot.data() as SupportReportRecord).status;
    if (previousStatus === input.status) {
      throw new EditableLayerError(`The report is already ${input.status}.`, 409);
    }
    // Field-level update: the report body, retention class, and legal-hold flag are untouched.
    transaction.update(ref, {
      status: input.status,
      status_updated_at: nowIso,
      status_updated_by_uid: actor.uid,
    });
    transaction.create(
      db.collection(ACTIVITY_COLLECTION).doc(activityId),
      stripUndefined({
        id: activityId,
        report_id: reportId,
        actor_uid: actor.uid,
        previous_status: previousStatus,
        new_status: input.status,
        ...(note !== "" ? { note } : {}),
        created_at: nowIso,
      }),
    );
  });

  const saved = await ref.get();
  return readRecord(saved.id, saved.data()!);
}

function readRecord(id: string, data: Record<string, unknown>): SupportReportRecord {
  return normalizeFirestoreValue({ id, ...data }) as SupportReportRecord;
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      return toDate.call(value).toISOString();
    }
  }
  if (Array.isArray(value)) {
    return value.map(normalizeFirestoreValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeFirestoreValue(child)]),
    );
  }
  return value;
}

function stripUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as T;
}
