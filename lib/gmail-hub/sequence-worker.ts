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

const LEASE_MS = 180_000;
export interface CommunicationWorkerCheckpoint {
  cursor: string | null;
  runId: string;
  expiresAtMs: number;
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
      const next = { cursor, runId, expiresAtMs: nowMs + LEASE_MS };
      tx.set(this.ref(), { ...next, startedAtMs: nowMs });
      return next;
    });
  }
  async finish(
    claim: CommunicationWorkerCheckpoint,
    cursor: string | null,
    nowMs: number,
    counts: Record<string, number>,
  ) {
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(this.ref());
      if (doc.data()?.runId !== claim.runId) return false;
      tx.set(this.ref(), {
        runId: claim.runId,
        cursor,
        expiresAtMs: 0,
        finishedAtMs: nowMs,
        counts,
      });
      return true;
    });
  }
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
  const page = await input.service.deps.store.list(claim.cursor, limit);
  const counts: Record<string, number> = {
    inspected: 0,
    observed: 0,
    sent: 0,
    held: 0,
    failures: 0,
  };
  let cursor = claim.cursor,
    completedPage = true;
  const syncedMailboxes = new Set<string>();
  for (const original of page.sequences) {
    if (now() - started >= Math.min(120_000, input.maxDurationMs ?? 55_000)) {
      completedPage = false;
      break;
    }
    cursor = original.id;
    counts.inspected += 1;
    if (!original.authorization || ["completed", "cancelled"].includes(original.state))
      continue;
    try {
      // Current staff authority and the stored real workflow scope precede any mailbox construction.
      const actor = await input.service.deps.readActor(original.responsibleUid);
      assertCommunicationStaff(actor, "read");
      if (!hasSpaceAccess(actor, original.context.lane))
        throw new Error("Workflow Space unavailable.");
      if (
        input.service.deps.syncMailbox &&
        !syncedMailboxes.has(actor.email.toLowerCase())
      ) {
        await input.service.deps.syncMailbox(actor);
        syncedMailboxes.add(actor.email.toLowerCase());
      }
      const observed = await input.service.observe(original);
      counts.observed += 1;
      if (observed.unresolvedOccurrenceId) {
        counts.held += 1;
        continue;
      }
      const result = await input.service.dispatch(original.id);
      if (result.status === "sent") counts.sent += 1;
      else if (!["not_due"].includes(result.status)) counts.held += 1;
    } catch {
      counts.failures += 1;
    } // Value-free operational evidence; no raw provider response.
  }
  if (completedPage) cursor = page.cursor;
  await store.finish(claim, cursor, now(), counts);
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
