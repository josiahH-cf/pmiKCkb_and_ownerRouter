import type { RenewalWorkspaceState } from "../lease-renewal/workspace-state";

/**
 * S248 independent oracle: what the app's own renewal message evidence fills on one lease's staff
 * record, read from the raw stored documents. A second copy of the rule, never the app's
 * projection: it reads the communication documents and the outreach record documents directly.
 *
 * - A message counts for a lease and an audience only when its context names this lease and that
 *   audience's renewal purpose and its notice scope names the work record's cycle.
 * - The message's first settled send is its outreach unless staff removed it ("This was not the
 *   renewal outreach") or a delivery failure is correlated to one of its sends.
 * - The earliest counted send fills the outreach (owner) or the offer (tenant, sent under the
 *   current terms) when staff recorded nothing for it, or recorded something other than done
 *   before that send. A different record saved after the send fills nothing (a check).
 * - A person's reply on a counted message after its first send hands the move to the team while
 *   staff have recorded no answer, or recorded no answer yet before the reply.
 */

export interface IndependentOutreachFill {
  readonly ownerOutreach: boolean;
  readonly tenantOffer: boolean;
  readonly ownerReplied: boolean;
  readonly tenantReplied: boolean;
}

export const NO_INDEPENDENT_OUTREACH_FILL: IndependentOutreachFill = Object.freeze({
  ownerOutreach: false,
  tenantOffer: false,
  ownerReplied: false,
  tenantReplied: false,
});

type Raw = Readonly<Record<string, unknown>>;
const RFC = /^<pmi-([0-9a-f]{64})@pmikcmetro\.com>$/;

function audienceOf(context: unknown, leaseId: string): "owner" | "tenant" | null {
  const value = context as Raw | null;
  if (
    !value ||
    value.lane !== "renewals" ||
    value.entityType !== "renewal_lease" ||
    value.entityId !== leaseId
  )
    return null;
  return value.purpose === "renewal_owner"
    ? "owner"
    : value.purpose === "renewal_tenant"
      ? "tenant"
      : null;
}

interface CountedSend {
  readonly sentAtMs: number;
  readonly replies: readonly number[];
}

function countedSends(
  leaseId: string,
  cycleId: string,
  audience: "owner" | "tenant",
  sequences: readonly Raw[],
  records: readonly Raw[],
): CountedSend[] {
  const removed = new Set(
    records
      .filter(
        (record) =>
          record.leaseId === leaseId &&
          record.cycleId === cycleId &&
          record.audience === audience &&
          record.correction !== null &&
          record.correction !== undefined,
      )
      .map((record) => String(record.occurrenceId)),
  );
  const out: CountedSend[] = [];
  for (const sequence of sequences) {
    if (sequence.purged) continue;
    if (audienceOf(sequence.context, leaseId) !== audience) continue;
    if (sequence.noticeCycleId !== cycleId) continue;
    const sends = (Array.isArray(sequence.threads) ? (sequence.threads as Raw[]) : [])
      .map((thread) => ({
        id: RFC.exec(String(thread.rfcMessageId ?? ""))?.[1] ?? null,
        atMs: Number(thread.sentAtMs),
      }))
      .filter(
        (send): send is { id: string; atMs: number } =>
          send.id !== null && Number.isFinite(send.atMs),
      )
      .sort((left, right) => left.atMs - right.atMs);
    const first = sends[0];
    if (!first || removed.has(first.id)) continue;
    const ids = new Set(sends.map((send) => send.id));
    const inbound = Array.isArray(sequence.inbound) ? (sequence.inbound as Raw[]) : [];
    if (
      inbound.some(
        (entry) =>
          entry.kind === "bounce" &&
          typeof entry.attemptOccurrenceId === "string" &&
          ids.has(entry.attemptOccurrenceId),
      )
    )
      continue;
    out.push({
      sentAtMs: first.atMs,
      replies: inbound
        .filter((entry) => entry.kind === "human")
        .map((entry) => Number(entry.receivedAtMs))
        .filter((atMs) => Number.isFinite(atMs) && atMs >= first.atMs),
    });
  }
  return out.sort((left, right) => left.sentAtMs - right.sentAtMs);
}

function fills(
  record: { outcome: string; recordedAt: string } | null | undefined,
  sentAtMs: number,
): boolean {
  if (!record) return true;
  if (record.outcome === "done") return false; // already satisfied by the staff record itself
  const savedMs = Date.parse(record.recordedAt);
  return !(Number.isFinite(savedMs) && savedMs > sentAtMs);
}

function replyCounts(
  answer: { outcome: string; recordedAt: string } | null,
  waitingOutcome: string,
  replyAtMs: number,
): boolean {
  if (!answer) return true;
  if (answer.outcome !== waitingOutcome) return false;
  const savedMs = Date.parse(answer.recordedAt);
  return !(Number.isFinite(savedMs) && savedMs >= replyAtMs);
}

export function projectIndependentOutreachFill(
  state: RenewalWorkspaceState,
  sequences: readonly Raw[],
  records: readonly Raw[],
): IndependentOutreachFill {
  const owner = countedSends(state.leaseId, state.cycleId, "owner", sequences, records);
  const tenantAll = countedSends(
    state.leaseId,
    state.cycleId,
    "tenant",
    sequences,
    records,
  );
  // The tenant offer answers the current terms: when the earliest counted send came before the
  // owner's latest answer, no send fills the offer.
  const termsMs = state.ownerResponse ? Date.parse(state.ownerResponse.recordedAt) : NaN;
  const tenant =
    tenantAll[0] && Number.isFinite(termsMs) && tenantAll[0].sentAtMs < termsMs
      ? []
      : tenantAll;
  const ownerRecord = state.activities.owner_outreach ?? null;
  const tenantRecordRaw = state.activities.tenant_offer ?? null;
  const tenantRecord =
    tenantRecordRaw && tenantRecordRaw.termsRevision === state.termsRevision
      ? tenantRecordRaw
      : null;
  const ownerReply = owner.length
    ? Math.max(-Infinity, ...owner.flatMap((send) => send.replies))
    : -Infinity;
  const tenantReply = tenantAll.length
    ? Math.max(-Infinity, ...tenantAll.flatMap((send) => send.replies))
    : -Infinity;
  const tenantAnswer =
    state.tenantResponse && state.tenantResponse.termsRevision === state.termsRevision
      ? state.tenantResponse
      : null;
  return {
    ownerOutreach: owner.length > 0 && fills(ownerRecord, owner[0]!.sentAtMs),
    tenantOffer: tenant.length > 0 && fills(tenantRecord, tenant[0]!.sentAtMs),
    ownerReplied:
      Number.isFinite(ownerReply) &&
      replyCounts(state.ownerResponse ?? null, "no_response", ownerReply),
    tenantReplied:
      Number.isFinite(tenantReply) &&
      replyCounts(tenantAnswer, "awaiting_response", tenantReply),
  };
}
