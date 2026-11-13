// S273 R-S273-2: the lease's current values for an audience that holds unsent authorized work, read
// on the lease and desk read so a difference shows before any worker run. The read is the existing
// composition read the lease preview and the review make (the renewal target's content basis, the
// lease's own message wording and when its record was saved). It sends, schedules, saves, claims
// and looks up nothing beyond that read; a failed or late read leaves the evidence as it was, and
// the step then shows the stored state without a difference.

import type { AuthenticatedUser } from "@/lib/auth/session";
import { prepareWorkflowComposition } from "@/lib/gmail-hub/sequence-dependencies";
import { WorkflowCommunicationContextSchema } from "@/lib/gmail-hub/workflow-context";
import type { LeaseOutreachEvidenceInput } from "@/lib/lease-renewal/outreach-evidence";
import {
  communicationWordingRevision,
  type LeaseMessageBasis,
  type LeaseMessageBases,
} from "@/lib/lease-renewal/unsent-message";
import { withReadDeadline } from "@/lib/observability/read-lifetime";

type Audience = "owner" | "tenant";

/** The bound on one lease read of the current values; the page never waits longer for it. */
export const CURRENT_MESSAGE_READ_WAIT_MS = 15_000;
/** At most this many lease and audience reads per desk load; the rest show the stored state. */
export const DESK_CURRENT_MESSAGE_READ_LIMIT = 12;
/** The desk's bound on each read, and on all of them together. */
export const DESK_CURRENT_MESSAGE_READ_WAIT_MS = 8_000;
export const DESK_CURRENT_MESSAGE_TOTAL_WAIT_MS = 20_000;
const CONCURRENCY = 3;

/** One audience's current values, from the composition read the review makes. */
export async function readLeaseMessageBasis(
  actor: AuthenticatedUser,
  leaseId: string,
  audience: Audience,
): Promise<LeaseMessageBasis> {
  const context = WorkflowCommunicationContextSchema.parse({
    lane: "renewals",
    entityType: "renewal_lease",
    entityId: leaseId,
    purpose: audience === "owner" ? "renewal_owner" : "renewal_tenant",
    actionKey: "gmail.renewal_notice.send",
    sourceRefs: [`rentvine:lease:${leaseId}`],
  });
  const composition = await prepareWorkflowComposition(actor, context);
  const basis = composition.target.contentBasis ?? null;
  const savedAtMs =
    typeof composition.messageSavedAt === "string"
      ? Date.parse(composition.messageSavedAt)
      : Number.NaN;
  return {
    settled: composition.target.readSettlement?.state !== "not_settled",
    digest: basis?.digest ?? null,
    legacyDigest: basis?.legacyDigest ?? null,
    values: basis ? [...basis.values] : [],
    wordingRevision: communicationWordingRevision(composition.initial),
    wordingSavedAtMs: Number.isFinite(savedAtMs) ? savedAtMs : null,
  };
}

/** The audiences of one lease's evidence that hold scheduled or held unsent work. */
function audiencesWithUnsentWork(input: LeaseOutreachEvidenceInput): Audience[] {
  const audiences = new Set<Audience>();
  for (const message of input.messages)
    if (message.unsent && message.unsent.state !== "unconfirmed")
      audiences.add(message.audience);
  return [...audiences].sort();
}

async function inBatches<T>(
  items: readonly T[],
  run: (item: T) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < items.length; index += CONCURRENCY)
    await Promise.all(items.slice(index, index + CONCURRENCY).map(run));
}

/**
 * R-S273-2: add the current values to each lease's evidence for the audiences that hold unsent
 * work. Never throws: a read that fails or runs past its bound adds nothing for that audience.
 */
export async function withCurrentMessageBases(
  actor: AuthenticatedUser,
  evidence: ReadonlyMap<string, LeaseOutreachEvidenceInput>,
  options: { limit?: number; waitMs?: number } = {},
): Promise<Map<string, LeaseOutreachEvidenceInput>> {
  const pairs = [...evidence.entries()]
    .filter(([, input]) => input.readable)
    .flatMap(([leaseId, input]) =>
      audiencesWithUnsentWork(input).map((audience) => ({ leaseId, audience })),
    )
    .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER);
  const read = new Map<string, Partial<Record<Audience, LeaseMessageBasis>>>();
  await inBatches(pairs, async ({ leaseId, audience }) => {
    try {
      const basis = await withReadDeadline(
        () => readLeaseMessageBasis(actor, leaseId, audience),
        options.waitMs ?? CURRENT_MESSAGE_READ_WAIT_MS,
      );
      read.set(leaseId, { ...read.get(leaseId), [audience]: basis });
    } catch {
      // The step shows the stored state without a difference.
    }
  });
  return new Map(
    [...evidence.entries()].map(([leaseId, input]) => {
      const current = read.get(leaseId);
      return [
        leaseId,
        current
          ? {
              ...input,
              currentMessage: {
                ...input.currentMessage,
                ...current,
              } satisfies LeaseMessageBases,
            }
          : input,
      ];
    }),
  );
}

/** The lease page's one lease: its evidence with the current values for each unsent message. */
export async function withLeaseCurrentMessageBases(
  actor: AuthenticatedUser,
  leaseId: string,
  input: LeaseOutreachEvidenceInput,
): Promise<LeaseOutreachEvidenceInput> {
  try {
    return (
      (await withCurrentMessageBases(actor, new Map([[leaseId, input]]))).get(leaseId) ??
      input
    );
  } catch {
    return input;
  }
}
