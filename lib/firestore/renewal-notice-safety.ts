import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import type { RawLease } from "@/lib/integrations/rentvine/client";
import { leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import { getAdminFirestore } from "./admin";
import { EditableLayerError } from "./errors";
import {
  bindNoticeAdmissionContext,
  inheritNoticeReaderScope,
  noticeAdmissionContextFor,
  type NoticeSourceAdmission,
} from "@/lib/lease-renewal/notice-source-admission";
import { renewalWorkspaceDocId } from "./renewal-workspace";
import {
  projectMoveOutDisposition,
  type LeaseStatusTableRead,
  type MoveOutDisposition,
  type MoveOutFreshness,
} from "@/lib/lease-renewal/move-out-disposition";
import {
  advanceNoticeSafetyMarker,
  NoticeSafetyMarkerSchema,
  noticeSafetyBasis,
  noticeScopeHash,
  noticeSemanticHash,
  noticeTenancyHash,
  pendingNoticeHash,
  type NoticeSafetyBasis,
} from "@/lib/lease-renewal/notice-safety";

const evidenceSchema = z
  .object({
    origin: z.literal("rentvine_lease_status"),
    leaseId: z.string().nullable(),
    statusId: z.string().nullable(),
    statusName: z.string().nullable(),
    primaryStatusId: z.string().nullable(),
    pendingMoveOut: z.boolean().nullable(),
    completedMoveOut: z.boolean().nullable(),
    noticeDateIso: z.string().nullable(),
    expectedMoveOutIso: z.string().nullable(),
    moveOutIso: z.string().nullable(),
  })
  .strict();
const observedEvidenceSchema = z
  .object({
    evidence: evidenceSchema,
    sourceReadAt: z.object({ lease: z.number(), status: z.number() }).strict(),
    freshness: z.enum(["fresh", "stale", "expired", "unavailable"]),
  })
  .strict();
const historySchema = z
  .object({
    scopeHash: z.string(),
    revision: z.number().int().positive(),
    positive: observedEvidenceSchema
      .extend({
        observedAt: z.string().datetime(),
        evidenceHash: z.string(),
        recordedBy: z.string(),
      })
      .strict(),
    withdrawal: observedEvidenceSchema
      .extend({
        evidenceHash: z.string(),
        reviewedAt: z.string().datetime(),
        reviewedBy: z.string(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const NoticeReviewCommandSchema = z
  .object({
    leaseId: z.string().regex(/^[1-9]\d*$/),
    operationId: z.string().uuid(),
    expected: z
      .object({
        scopeHash: z.string().regex(/^[a-f0-9]{64}$/),
        version: z.number().int().positive(),
        semanticHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    action: z.enum(["record_notice", "review_withdrawal"]),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export interface NoticeSourceRead {
  lease: RawLease;
  statusTable: LeaseStatusTableRead;
  freshness: MoveOutFreshness;
  leaseReadAtMs: number;
  observedAtMs: number;
  noticeAdmitted?: boolean;
  admittedLeaseKeys?: readonly string[];
}
export interface RenewalNoticeSafety {
  disposition: MoveOutDisposition;
  basis: NoticeSafetyBasis | null;
  cycleId: string | null;
  tenancyVerified: boolean;
  history: z.infer<typeof historySchema> | null;
  ready: boolean;
  reason: string | null;
}
export function noticeSafetyMarkerRef(db: Firestore, leaseId: string) {
  return db
    .collection(
      `lease_renewal_workspaces/${renewalWorkspaceDocId(leaseId)}/approval_safety`,
    )
    .doc("notice");
}
function historyRef(db: Firestore, leaseId: string, scopeHash: string) {
  return db
    .collection(
      `lease_renewal_workspaces/${renewalWorkspaceDocId(leaseId)}/notice_reviews`,
    )
    .doc(scopeHash);
}
function requireReader(actor: AuthenticatedUser) {
  if (!can(actor.role, "read") || !actor.email.toLowerCase().endsWith("@pmikcmetro.com"))
    throw new EditableLayerError("Managed renewals read authority is required.", 403);
}
function noticeReservationKeys(notices: readonly { ref: { path: string } }[]): string[] {
  const keys = notices.map((doc) => {
    const match =
      /^lease_renewal_workspaces\/([a-f0-9]{64})\/approval_safety\/notice$/.exec(
        doc.ref.path,
      );
    if (!match)
      throw new EditableLayerError("The notice reservation metadata is invalid.", 409);
    return match[1];
  });
  if (new Set(keys).size !== keys.length)
    throw new EditableLayerError("The notice reservation metadata is ambiguous.", 409);
  return keys;
}
/** The caller supplies this reader to both caches. The callback runs only on a provider miss,
 * before dispatch, including background refreshes. Failure prevents an unjournaled observation.
 */
export function withRenewalNoticeAdmission<T extends object>(
  actor: AuthenticatedUser,
  reader: T,
  db: Firestore = getAdminFirestore(),
): T & {
  beforeLeaseSourceRead: (at: number) => Promise<NoticeSourceAdmission>;
  beforeStatusSourceRead: (at: number) => Promise<NoticeSourceAdmission>;
} {
  requireReader(actor);
  const context = noticeAdmissionContextFor(db, reader);
  const admit = async (kind: "lease" | "status", at: number) => {
    const admission = await db.runTransaction(async (tx) => {
      const all = await tx.get(db.collectionGroup("approval_safety"));
      const entries = all.docs
        .filter((doc) => doc.id === "notice")
        .map((doc) => ({ doc, previous: NoticeSafetyMarkerSchema.parse(doc.data()) }));
      const leaseKeys = noticeReservationKeys(entries.map(({ doc }) => doc));
      const admittedAt = Math.max(
        at,
        ...entries.map(({ previous }) => previous.sourceReadAt[kind] + 1),
      );
      for (const { doc, previous } of entries) {
        const sourceReadAt = { ...previous.sourceReadAt, [kind]: admittedAt };
        tx.set(doc.ref, {
          ...previous,
          sourceReadAt,
          version: previous.version + 1,
          semanticHash: pendingNoticeHash(previous.scopeHash, sourceReadAt),
          observedAt: new Date(at).toISOString(),
        });
      }
      return {
        readAtMs: admittedAt,
        leaseKeys,
      };
    });
    return bindNoticeAdmissionContext(admission, context);
  };
  const wrapped = new Proxy(reader, {
    get(target, key, receiver) {
      if (key === "beforeLeaseSourceRead") return (at: number) => admit("lease", at);
      if (key === "beforeStatusSourceRead") return (at: number) => admit("status", at);
      const value = Reflect.get(target, key, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as ReturnType<typeof withRenewalNoticeAdmission<T>>;
  inheritNoticeReaderScope(wrapped, reader);
  return wrapped;
}
/** Reserve only bodyless lease-bound metadata before the first lease-specific fetch. */
export async function reserveRenewalNoticeLease(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
) {
  requireReader(actor);
  const ref = noticeSafetyMarkerRef(db, leaseId);
  const expectedPath = `lease_renewal_workspaces/${renewalWorkspaceDocId(leaseId)}/approval_safety/notice`;
  if (ref.path !== expectedPath)
    throw new EditableLayerError("The notice reservation metadata is invalid.", 409);
  function validateExisting(existing: Awaited<ReturnType<typeof ref.get>>) {
    if (!existing.exists || existing.ref.path !== expectedPath)
      throw new EditableLayerError(
        "The notice reservation metadata is unavailable.",
        409,
      );
    noticeReservationKeys([existing]);
    NoticeSafetyMarkerSchema.parse(existing.data());
    return false;
  }
  const existing = await ref.get();
  if (existing.ref.path !== expectedPath)
    throw new EditableLayerError("The notice reservation metadata is invalid.", 409);
  if (existing.exists) return validateExisting(existing);
  const scopeHash = noticeScopeHash(leaseId, null, null);
  const sourceReadAt = { lease: 0, status: 0 };
  try {
    // Firestore create uses exists:false. Competing readers never hold a read/write
    // transaction on this marker and can neither overwrite nor reset a newer generation.
    await ref.create({
      scopeHash,
      sourceReadAt,
      semanticHash: pendingNoticeHash(scopeHash, sourceReadAt),
      version: 1,
      observedAt: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== 6
    )
      throw error;
    // Only an exact ALREADY_EXISTS result permits a fresh readback. A lost response or
    // any other error remains a failure; this operation never retries a create.
    return validateExisting(await ref.get());
  }
}
/** Current durable source floors for this exact managed-reader lease. These values are only cache
 * admission metadata: neither a readiness verdict nor an approval basis can be derived from them.
 */
export async function readRenewalNoticeSourceMinimum(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<{ lease: number; status: number }> {
  requireReader(actor);
  const current = await noticeSafetyMarkerRef(db, leaseId).get();
  if (!current.exists)
    throw new EditableLayerError("The notice source marker is unavailable.", 409);
  return NoticeSafetyMarkerSchema.parse(current.data()).sourceReadAt;
}
/** One managed-reader metadata query for existing reservations only. No missing lease is reserved
 * here, and no workflow/cycle/history record is created to make a portfolio look ready.
 */
export async function readRenewalNoticePortfolioMinimum(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<{ leaseKeys: readonly string[]; lease: number; status: number }> {
  requireReader(actor);
  const all = await db.collectionGroup("approval_safety").get();
  const notices = all.docs.filter((doc) => doc.id === "notice");
  const leaseKeys = noticeReservationKeys(notices);
  const markers = notices.map((doc) => NoticeSafetyMarkerSchema.parse(doc.data()));
  return {
    leaseKeys,
    lease: Math.max(0, ...markers.map((marker) => marker.sourceReadAt.lease)),
    status: Math.max(0, ...markers.map((marker) => marker.sourceReadAt.status)),
  };
}
function unavailableDisposition(leaseId: string, label: string): MoveOutDisposition {
  return {
    state: "unknown",
    reason: "approval_safety_unavailable",
    label,
    freshness: "unavailable",
    observedAtIso: null,
    evidence: {
      origin: "rentvine_lease_status",
      leaseId,
      statusId: null,
      statusName: null,
      primaryStatusId: null,
      pendingMoveOut: null,
      completedMoveOut: null,
      noticeDateIso: null,
      expectedMoveOutIso: null,
      moveOutIso: null,
    },
  };
}
function projection(
  source: NoticeSourceRead,
  history: z.infer<typeof historySchema> | null,
) {
  const base = projectMoveOutDisposition({
    lease: source.lease,
    statusTable: source.statusTable,
    freshness: source.freshness,
    observedAtIso: new Date(source.leaseReadAtMs).toISOString(),
  });
  const evidenceHash = hashExecutionPreview({ ...base.evidence });
  return history
    ? projectMoveOutDisposition({
        lease: source.lease,
        statusTable: source.statusTable,
        freshness: source.freshness,
        observedAtIso: base.observedAtIso,
        prior: {
          state: "initiated",
          observedAtIso: history.positive.observedAt,
          withdrawalReviewed: history.withdrawal?.evidenceHash === evidenceHash,
        },
      })
    : base;
}
/** Owner-approved exception: authenticated reads update only five hash/version/time fields.
 * No workspace head, staff history, workflow milestone or provider record is written here.
 */
export async function observeRenewalNotice(
  actor: AuthenticatedUser,
  source: NoticeSourceRead,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalNoticeSafety> {
  requireReader(actor);
  const leaseId = leaseViewId(source.lease);
  if (!leaseId) throw new EditableLayerError("The lease identity is unavailable.", 409);
  const tenancyHash = noticeTenancyHash(source.lease);
  try {
    return await db.runTransaction(async (tx) => {
      const headRef = db
        .collection("lease_renewal_workspaces")
        .doc(renewalWorkspaceDocId(leaseId));
      const markerRef = noticeSafetyMarkerRef(db, leaseId);
      const [head, existing] = await Promise.all([tx.get(headRef), tx.get(markerRef)]);
      const cycleId =
        head.exists && typeof head.get("cycleId") === "string"
          ? (head.get("cycleId") as string)
          : null;
      const scopeHash = noticeScopeHash(leaseId, tenancyHash, cycleId);
      const admitted =
        source.admittedLeaseKeys?.includes(renewalWorkspaceDocId(leaseId)) === true &&
        source.statusTable.status === "available" &&
        source.statusTable.admittedLeaseKeys?.includes(renewalWorkspaceDocId(leaseId)) ===
          true;
      if (!existing.exists || !admitted) {
        const sourceReadAt = { lease: 0, status: 0 };
        const marker = existing.exists
          ? NoticeSafetyMarkerSchema.parse(existing.data())
          : {
              scopeHash,
              sourceReadAt,
              semanticHash: pendingNoticeHash(scopeHash, sourceReadAt),
              version: 1,
              observedAt: new Date(source.observedAtMs).toISOString(),
            };
        if (!existing.exists) tx.create(markerRef, marker);
        const reason =
          "Notice evidence needs a fresh admitted source read. Use Refresh data, then review again; no notice evidence from this unadmitted generation is shown.";
        return {
          disposition: unavailableDisposition(leaseId, reason),
          basis: noticeSafetyBasis(marker),
          cycleId,
          tenancyVerified: false,
          history: null,
          ready: false,
          reason,
        };
      }
      const saved = await tx.get(historyRef(db, leaseId, scopeHash));
      const history = saved.exists ? historySchema.parse(saved.data()) : null;
      const disposition = projection(source, history);
      const result = advanceNoticeSafetyMarker(
        existing.exists ? NoticeSafetyMarkerSchema.parse(existing.data()) : null,
        {
          scopeHash,
          semanticHash: noticeSemanticHash(
            disposition,
            tenancyHash !== null,
            history?.revision ?? 0,
          ),
          sourceReadAt: {
            lease: source.leaseReadAtMs,
            status:
              source.statusTable.status === "available"
                ? (source.statusTable.readAtMs ?? 0)
                : source.observedAtMs,
          },
          observedAt: new Date(source.observedAtMs).toISOString(),
        },
      );
      if (
        !existing.exists ||
        hashExecutionPreview(existing.data() ?? {}) !==
          hashExecutionPreview(result.marker)
      )
        tx.set(markerRef, result.marker);
      const ready =
        result.ready &&
        source.noticeAdmitted === true &&
        tenancyHash !== null &&
        !["expired", "unavailable"].includes(source.freshness) &&
        source.statusTable.status === "available" &&
        source.statusTable.noticeAdmitted === true;
      const reason = !ready
        ? "Notice approval safety is unavailable or source generations conflict. Refresh the lease source and review again before drafting."
        : disposition.state === "initiated" ||
            disposition.reason === "withdrawal_review_required"
          ? disposition.label
          : null;
      const visibleDisposition: MoveOutDisposition = ready
        ? disposition
        : {
            ...disposition,
            state: "unknown",
            reason: "approval_safety_unavailable",
            label: reason!,
          };
      return {
        disposition: visibleDisposition,
        basis: noticeSafetyBasis(result.marker),
        cycleId,
        tenancyVerified: tenancyHash !== null,
        history,
        ready,
        reason,
      };
    });
  } catch {
    // Never treat an unreadable marker as an empty history or preserve draft authority on failure.
    return {
      disposition: unavailableDisposition(
        leaseId,
        "Notice review history or approval safety could not be read. Ordinary lease facts remain visible; notice evidence and drafting wait for verification.",
      ),
      basis: null,
      cycleId: null,
      tenancyVerified: tenancyHash !== null,
      history: null,
      ready: false,
      reason: "Notice approval safety could not be verified. Refresh before drafting.",
    };
  }
}

/** An explicit, audited staff action records evidence without starting a cycle or changing progress. */
export async function saveRenewalNoticeReview(
  actor: AuthenticatedUser,
  raw: unknown,
  source: NoticeSourceRead,
  db: Firestore = getAdminFirestore(),
) {
  requireReader(actor);
  if (!can(actor.role, "edit") || isVerificationAccount(actor))
    throw new EditableLayerError("Renewals staff authority is required.", 403);
  assertMutationAllowed(requireEnvironmentDescriptor());
  const input = NoticeReviewCommandSchema.parse(raw);
  if (leaseViewId(source.lease) !== input.leaseId || !noticeTenancyHash(source.lease))
    throw new EditableLayerError(
      "The same lease and verified tenancy are required.",
      409,
    );
  const observed = await observeRenewalNotice(actor, source, db);
  if (!observed.ready || !observed.basis)
    throw new EditableLayerError(observed.reason ?? "Refresh notice evidence.", 409);
  return db.runTransaction(async (tx) => {
    const markerRef = noticeSafetyMarkerRef(db, input.leaseId);
    const reviewRef = historyRef(db, input.leaseId, input.expected.scopeHash);
    const auditRef = db.collection(`${reviewRef.path}/activity`).doc(input.operationId);
    const [markerDoc, reviewDoc, audit, head] = await Promise.all([
      tx.get(markerRef),
      tx.get(reviewRef),
      tx.get(auditRef),
      tx.get(
        db
          .collection("lease_renewal_workspaces")
          .doc(renewalWorkspaceDocId(input.leaseId)),
      ),
    ]);
    const operationHash = hashExecutionPreview({ input, actorUid: actor.uid });
    if (audit.exists) {
      if (audit.get("operationHash") !== operationHash)
        throw new EditableLayerError("The notice operation identity was reused.", 409);
      return historySchema.parse(audit.get("result"));
    }
    const marker = NoticeSafetyMarkerSchema.parse(markerDoc.data());
    const cycleId = head.exists ? (head.get("cycleId") as string) : null;
    if (
      hashExecutionPreview(noticeSafetyBasis(marker)) !==
        hashExecutionPreview(input.expected) ||
      input.expected.scopeHash !==
        noticeScopeHash(input.leaseId, noticeTenancyHash(source.lease), cycleId)
    )
      throw new EditableLayerError(
        "Notice evidence or the tenancy/cycle changed. Review the current evidence again.",
        409,
      );
    const prior = reviewDoc.exists ? historySchema.parse(reviewDoc.data()) : null;
    const current = projection(source, prior);
    const evidenceHash = hashExecutionPreview({ ...current.evidence });
    const at = new Date(source.observedAtMs).toISOString();
    if (input.action === "record_notice" && current.state !== "initiated")
      throw new EditableLayerError(
        "Only current positive provider notice evidence can be recorded.",
        409,
      );
    if (
      input.action === "review_withdrawal" &&
      (!prior ||
        !["withdrawal_review_required", "withdrawn_after_prior_notice"].includes(
          current.reason,
        ))
    )
      throw new EditableLayerError(
        "A recorded notice for this exact tenancy/cycle and current clear source evidence are required.",
        409,
      );
    const result = historySchema.parse({
      scopeHash: input.expected.scopeHash,
      revision: (prior?.revision ?? 0) + 1,
      positive:
        input.action === "record_notice"
          ? {
              observedAt: current.observedAtIso!,
              evidenceHash,
              recordedBy: actor.uid,
              evidence: current.evidence,
              sourceReadAt: marker.sourceReadAt,
              freshness: source.freshness,
            }
          : prior!.positive,
      withdrawal:
        input.action === "review_withdrawal"
          ? {
              evidenceHash,
              reviewedAt: at,
              reviewedBy: actor.uid,
              evidence: current.evidence,
              sourceReadAt: marker.sourceReadAt,
              freshness: source.freshness,
            }
          : null,
    });
    tx.set(reviewRef, result);
    tx.create(auditRef, {
      operationHash,
      action: input.action,
      reason: input.reason,
      actorUid: actor.uid,
      recordedAt: at,
      result,
    });
    tx.set(markerRef, {
      ...marker,
      version: marker.version + 1,
      semanticHash: noticeSemanticHash(projection(source, result), true, result.revision),
      observedAt: at,
    });
    return result;
  });
}
