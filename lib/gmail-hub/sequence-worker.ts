import { hasCurrentRenewalAuthorization } from "./delivery-policy";
import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { OAuth2Client } from "google-auth-library";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { GmailPushAuthError } from "./pubsub";
import { COMMUNICATION_SEQUENCE_COLLECTIONS } from "./sequence-store";
import {
  assertCommunicationStaff,
  type WorkflowCommunicationSequenceService,
} from "./sequence-service";
import { hasSpaceAccess } from "@/lib/auth/session";
import { needsReplyWatchCatchUp, replyWatchApplies } from "./reply-watch";
import type { CommunicationSequence } from "./sequence-model";

const LEASE_MS = 180_000;
/** S275 R-S275-7: the one-time catch-up of messages sent before the watched marker existed. */
export const REPLY_WATCH_CATCH_UP_VERSION = "s275-reply-watch-catch-up-v1";
export interface CommunicationWorkerCheckpoint {
  cursor: string | null;
  runId: string;
  expiresAtMs: number;
  /** S275 R-S275-1: where the watched page resumes; null starts at the first watched message. */
  watchCursor?: string | null;
  /** S275 R-S275-7: the catch-up's resume point, and whether its one pass reached the end. */
  catchUp?: { cursor: string | null; done: boolean };
}
export class CommunicationWorkerStore {
  constructor(readonly db: Firestore = getAdminFirestore()) {}
  private ref() {
    return this.db
      .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.worker)
      .doc("linked-observation-and-dispatch-v1");
  }
  async claim(nowMs: number): Promise<CommunicationWorkerCheckpoint | null> {
    const runId = randomUUID();
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(this.ref());
      const state = doc.data();
      if (typeof state?.expiresAtMs === "number" && state.expiresAtMs > nowMs)
        return null;
      const cursor = typeof state?.cursor === "string" ? state.cursor : null;
      const watchCursor =
        typeof state?.watchCursor === "string" ? state.watchCursor : null;
      const stored = state?.catchUp as
        | { version?: unknown; cursor?: unknown; done?: unknown }
        | undefined;
      const catchUp =
        stored?.version === REPLY_WATCH_CATCH_UP_VERSION
          ? {
              cursor: typeof stored.cursor === "string" ? stored.cursor : null,
              done: stored.done === true,
            }
          : { cursor: null, done: false };
      const next = { cursor, runId, expiresAtMs: nowMs + LEASE_MS };
      tx.set(this.ref(), {
        ...next,
        watchCursor,
        catchUp: { version: REPLY_WATCH_CATCH_UP_VERSION, ...catchUp },
        startedAtMs: nowMs,
      });
      return { ...next, watchCursor, catchUp };
    });
  }
  async finish(
    claim: CommunicationWorkerCheckpoint,
    cursor: string | null,
    nowMs: number,
    counts: Record<string, number>,
    watch: Pick<CommunicationWorkerCheckpoint, "watchCursor" | "catchUp"> = {},
  ) {
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(this.ref());
      if (doc.data()?.runId !== claim.runId) return false;
      const startedAtMs = doc.data()?.startedAtMs;
      const watchCursor = watch.watchCursor ?? claim.watchCursor ?? null;
      const catchUp = watch.catchUp ?? claim.catchUp ?? null;
      tx.set(this.ref(), {
        runId: claim.runId,
        cursor,
        expiresAtMs: 0,
        // S233 R-S233-5: the finished run keeps when it started, for the health summary.
        ...(typeof startedAtMs === "number" ? { startedAtMs } : {}),
        finishedAtMs: nowMs,
        counts,
        // S275: the watched page and the catch-up keep their own places between runs.
        watchCursor,
        ...(catchUp
          ? { catchUp: { version: REPLY_WATCH_CATCH_UP_VERSION, ...catchUp } }
          : {}),
      });
      return true;
    });
  }
  /** S233 R-S233-5: the latest run's times and counts, or null before the first run. */
  async readLastRun(nowMs: number): Promise<CommunicationWorkerLastRun | null> {
    const state = (await this.ref().get()).data();
    if (!state) return null;
    const number = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value) ? value : null;
    const counts: Record<string, number> = {};
    if (state.counts && typeof state.counts === "object")
      for (const [key, value] of Object.entries(state.counts as Record<string, unknown>))
        if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
          counts[key] = value;
    const expiresAtMs = number(state.expiresAtMs);
    return {
      startedAtMs: number(state.startedAtMs),
      finishedAtMs: number(state.finishedAtMs),
      running: expiresAtMs !== null && expiresAtMs > nowMs,
      counts,
    };
  }
}

/** S233 R-S233-5: what the latest worker run reports; counts only, never a record or address. */
export interface CommunicationWorkerLastRun {
  readonly startedAtMs: number | null;
  readonly finishedAtMs: number | null;
  readonly running: boolean;
  readonly counts: Readonly<Record<string, number>>;
}
/** One bounded rotating page; the durable occurrence claim owns every send even across expired worker leases. */
export async function runCommunicationWorker(input: {
  service: WorkflowCommunicationSequenceService;
  store?: CommunicationWorkerStore;
  now?: () => number;
  maxSequences?: number;
  maxDurationMs?: number;
}) {
  const now = input.now ?? Date.now,
    started = now(),
    store = input.store ?? new CommunicationWorkerStore();
  const claim = await store.claim(started);
  if (!claim) return { status: "already_running" as const };
  const limit = Math.min(50, Math.max(1, input.maxSequences ?? 20));
  const deps = input.service.deps;
  const outOfTime = () =>
    now() - started >= Math.min(120_000, input.maxDurationMs ?? 55_000);
  const page = await deps.store.list(claim.cursor, limit, {
    openOnly: true,
  });
  const counts: Record<string, number> = {
    inspected: 0,
    observed: 0,
    sent: 0,
    held: 0,
    failures: 0,
    notChecked: 0,
    // S274 R-S274-7: due messages that waited on a lease read still settling (not held).
    waitedOnLeaseRead: 0,
  };
  let cursor = claim.cursor,
    completedPage = true;
  const syncedMailboxes = new Set<string>();
  // S233 R-S233-4: a mailbox whose sync failed is not retried this run; its sequences are marked.
  const failedMailboxes = new Set<string>();
  /**
   * Current staff authority, the stored real workflow scope and this run's mailbox sync, before
   * any mailbox construction. Null when the message was not checked this run (it says so).
   */
  const prepareActor = async (original: CommunicationSequence) => {
    const actor = await deps.readActor(original.responsibleUid);
    assertCommunicationStaff(actor, "read");
    if (!hasSpaceAccess(actor, original.context.lane))
      throw new Error("Workflow Space unavailable.");
    const mailbox = actor.email.toLowerCase();
    if (deps.syncMailbox && !syncedMailboxes.has(mailbox)) {
      let synced = !failedMailboxes.has(mailbox);
      if (synced)
        try {
          await deps.syncMailbox(actor);
          syncedMailboxes.add(mailbox);
        } catch {
          failedMailboxes.add(mailbox);
          counts.failures += 1;
          synced = false;
        }
      if (!synced) {
        // Not checked this run: the record says so, and nothing is sent from it.
        await input.service.markNotChecked(original);
        counts.notChecked += 1;
        return null;
      }
    }
    return actor;
  };
  for (const original of page.sequences) {
    if (outOfTime()) {
      completedPage = false;
      break;
    }
    cursor = original.id;
    counts.inspected += 1;
    if (!original.authorization || ["completed", "cancelled"].includes(original.state))
      continue;
    if (!hasCurrentRenewalAuthorization(original)) {
      counts.held += 1;
      continue;
    }
    try {
      if (!(await prepareActor(original))) {
        counts.held += 1;
        continue;
      }
      const observed = await input.service.observe(original);
      counts.observed += 1;
      if (observed.unresolvedOccurrenceId) {
        counts.held += 1;
        continue;
      }
      const result = await input.service.dispatch(original.id);
      if (result.status === "sent") counts.sent += 1;
      // S274 R-S274-7: a wait on a settling lease read is counted on its own; nothing was held.
      else if (result.waitedOnLeaseRead) counts.waitedOnLeaseRead += 1;
      else if (!["not_due"].includes(result.status)) counts.held += 1;
      // S273 R-S273-6: the worker's own hold tells the responsible sender, once per sequence and
      // pause. It runs after the hold and never changes it; a failure is swallowed.
      if (
        result.status === "paused" &&
        result.sequence.pause?.byUid === "communication-worker" &&
        deps.recordHold
      )
        await deps.recordHold(result.sequence).catch(() => undefined);
    } catch {
      counts.failures += 1;
    } // Value-free operational evidence; no raw provider response.
  }
  if (completedPage) cursor = page.cursor;

  // S275 R-S275-1: the watched page. A completed renewal message whose answer is not yet known is
  // observed only (never dispatched); the lease record's end conditions are read first, and an
  // ended watch is recorded so the message never enters this page again. Visits are bounded by
  // the same page limit and run time, and never grow with terminal history.
  let watchCursor = claim.watchCursor ?? null;
  let catchUp = claim.catchUp ?? { cursor: null, done: false };
  const watching = Boolean(
    deps.replyWatchEndReason && deps.store.listWatched && deps.store.endReplyWatch,
  );
  const visitWatched = async (original: CommunicationSequence, key: string) => {
    counts[key] = (counts[key] ?? 0) + 1;
    if (!replyWatchApplies(original)) return;
    try {
      const settled = await input.service.settleReplyWatch(original);
      if (settled.ended) {
        counts.watchEnded = (counts.watchEnded ?? 0) + 1;
        return;
      }
      if (!(await prepareActor(original))) return;
      await input.service.observe(original);
      counts.watchObserved = (counts.watchObserved ?? 0) + 1;
    } catch {
      counts.failures += 1;
    }
  };
  if (watching && !outOfTime()) {
    const watched = await deps.store.listWatched!(watchCursor, limit);
    let completedWatch = true;
    for (const original of watched.sequences) {
      if (outOfTime()) {
        completedWatch = false;
        break;
      }
      watchCursor = original.id;
      await visitWatched(original, "watched");
    }
    if (completedWatch) watchCursor = watched.cursor;
  }
  // S275 R-S275-7: one pass over completed records sent before the marker existed. Each such
  // message is observed once (its earlier reply is recorded with its actual received time) or has
  // its watch ended, through the same normal writes; the pass then never runs again.
  if (watching && !catchUp.done && deps.store.listCatchUp && !outOfTime()) {
    const legacy = await deps.store.listCatchUp(catchUp.cursor, limit);
    let completedCatchUp = true;
    let next = catchUp.cursor;
    for (const original of legacy.sequences) {
      if (outOfTime()) {
        completedCatchUp = false;
        break;
      }
      next = original.id;
      if (!needsReplyWatchCatchUp(original)) continue;
      await visitWatched(original, "caughtUp");
    }
    catchUp = completedCatchUp
      ? { cursor: legacy.cursor, done: legacy.cursor === null }
      : { cursor: next, done: false };
  }
  await store.finish(claim, cursor, now(), counts, { watchCursor, catchUp });
  return { status: "processed" as const, ...counts, more: cursor !== null };
}
let testVerifier:
  | ((
      token: string,
      audience: string,
    ) => Promise<{ email?: string; email_verified?: boolean }>)
  | null = null;
export function setCommunicationWorkerVerifierForTest(verifier: typeof testVerifier) {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Worker verifier overrides require tests.");
  testVerifier = verifier;
}
export async function verifyCommunicationWorkerRequest(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
) {
  const audience = env.WORKFLOW_COMMUNICATION_WORKER_AUDIENCE?.trim();
  const account = env.WORKFLOW_COMMUNICATION_WORKER_SERVICE_ACCOUNT?.trim().toLowerCase();
  if (
    !audience ||
    !account ||
    !account.endsWith("@pmi-kc-kb-prod.iam.gserviceaccount.com")
  )
    throw new GmailPushAuthError(
      "The managed communication worker is not configured.",
      503,
    );
  try {
    if (new URL(audience).protocol !== "https:") throw new Error();
  } catch {
    throw new GmailPushAuthError("The worker audience is invalid.", 503);
  }
  const token = /^Bearer ([^\s]+)$/i.exec(
    request.headers.get("authorization") ?? "",
  )?.[1];
  if (!token)
    throw new GmailPushAuthError("Authenticated managed worker access is required.", 401);
  const claims = await (
    testVerifier ??
    (async (token, audience) => {
      const t = await new OAuth2Client().verifyIdToken({ idToken: token, audience });
      return {
        email: t.getPayload()?.email,
        email_verified: t.getPayload()?.email_verified,
      };
    })
  )(token, audience).catch(() => {
    throw new GmailPushAuthError("The worker identity could not be verified.", 401);
  });
  if (claims.email_verified !== true || claims.email?.toLowerCase() !== account)
    throw new GmailPushAuthError("The worker identity is not allowed.", 403);
}
