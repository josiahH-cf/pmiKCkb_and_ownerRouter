// S39.2 — the internal transactional notice executor (INTERNAL STAFF ONLY, D-AUTOMATION-LINE). When a
// feedback report is filed, this sends ONE metadata-only internal notice to the owner-configured internal
// destination. It is the authorized internal-only auto-send: it addresses ONLY the internal staff
// destination, never a client/tenant/owner-of-record/vendor, and never a caller-supplied recipient.
//
// SAFETY, code-enforced (not convention):
//   • GATE: refuses unless `internal.transactional_notice.send` is production_allowed in the committed
//     Action Registry (assertActionExecutable). Seeded production_allowed:false in S39.2, so a real send
//     is impossible until the S39.3 flip; tests inject an open registry to prove the machinery.
//   • RECIPIENT LOCK: the recipient is resolved ONLY from `deps.resolveDestination` (a non-actor-gated
//     SYSTEM read of the owner destination). The input carries NO recipient field, so a caller literally
//     cannot supply one. A blank resolution REFUSES (defence in depth — the store's SYSTEM read actually
//     resolves an unset doc to the seeded INTERNAL default, so a real read is never blank); either way the
//     internal-domain re-assert below is the operative internal-only guarantee.
//   • INTERNAL DOMAIN: the resolved destination is re-asserted against the internal-domain allowlist here
//     (in addition to the config-set schema), so a non-internal address refuses to send externally.
//   • METADATA ONLY: the payload carries route, origin, reporter ROLE, ISO time, and a /admin deep link
//     only — never the free-text description or element hint (F-SUPP-1 / TIX-8).
//   • IDEMPOTENT, ONE-ATTEMPT, HONEST: one send per dedup key `support_report:{id}:filed`; a delivered
//     receipt short-circuits (no second send); a failure records delivered:false (retryable), never
//     silent success.

import { assertActionExecutable } from "@/lib/integrations/action-gate";
import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import { isInternalTransactionalDestination } from "@/lib/notifications/internal-destination";

export const INTERNAL_TRANSACTIONAL_ACTION_KEY = "internal.transactional_notice.send";

/** Refusals the caller (report-issue route) catches so a send refusal never blocks the durable queue write. */
export class InternalTransactionalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InternalTransactionalError";
  }
}

/** Metadata-only inputs. NOTE: there is deliberately NO recipient field — the recipient is SYSTEM-resolved. */
export interface InternalTransactionalInput {
  reportId: string;
  /** The sanitized route pathname (no query/PII). */
  route: string;
  origin: string;
  /** The reporter's ROLE, never their uid. */
  reporterRole: string;
  filedAtIso: string;
}

export interface InternalTransactionalReceipt {
  dedup_key: string;
  action_key: typeof INTERNAL_TRANSACTIONAL_ACTION_KEY;
  report_id: string;
  /** The resolved INTERNAL destination (internal staff address; never a client recipient). */
  recipient: string;
  delivered: boolean;
  attempted_at: string;
  error?: string;
}

/** The narrow send transport this executor needs. The live Gmail internal sender satisfies it (S39.3). */
export interface InternalTransactionalSender {
  send(input: { to: string; subject: string; body: string }): Promise<void>;
}

export interface InternalTransactionalDeps {
  /** SYSTEM read of the owner destination (non-actor-gated). Returns the email or null/blank when unset. */
  resolveDestination(): Promise<string | null | undefined>;
  sender: InternalTransactionalSender;
  getReceipt(dedupKey: string): Promise<InternalTransactionalReceipt | null>;
  recordReceipt(receipt: InternalTransactionalReceipt): Promise<void>;
  /** Action Registry to gate against; defaults to the committed seed (closed) in production. */
  registry?: CreateActionRegistryInput[];
  appBaseUrl?: string;
  nowIso?: () => string;
}

/** The idempotency key: one send per report-filed event. */
export function internalTransactionalDedupKey(reportId: string): string {
  return `support_report:${reportId}:filed`;
}

/**
 * Compose the METADATA-ONLY internal notice. Never the free-text description or element hint — only the
 * route, origin, reporter role, filed time, and the /admin deep link, preserving F-SUPP-1 / TIX-8.
 */
export function buildInternalTransactionalNotice(
  input: InternalTransactionalInput,
  appBaseUrl?: string,
): { subject: string; body: string } {
  const adminLink = `${(appBaseUrl ?? "").replace(/\/$/, "")}/admin`;
  const subject = `New feedback filed on ${input.route}`;
  const body = [
    "A teammate filed feedback in the app.",
    "",
    `Route: ${input.route}`,
    `Origin: ${input.origin}`,
    `Reporter role: ${input.reporterRole}`,
    `Filed at: ${input.filedAtIso}`,
    "",
    `Review it in the admin feedback panel: ${adminLink}`,
    "",
    "This is an internal notice. The full feedback note stays in the admin feedback queue.",
  ].join("\n");
  return { subject, body };
}

/**
 * Send (or short-circuit) the internal transactional notice for one filed report. Enforces, in order: the
 * production gate, idempotency (a delivered receipt returns without a second send), the SYSTEM-resolved +
 * internal-domain-locked recipient, a metadata-only payload, and a single honest delivery attempt with a
 * recorded receipt. Throws InternalTransactionalError only for a refusal (gate closed, no destination, or
 * a non-internal destination); a transport failure is recorded as delivered:false and returned, not thrown.
 */
export async function sendInternalTransactionalNotice(
  deps: InternalTransactionalDeps,
  input: InternalTransactionalInput,
): Promise<InternalTransactionalReceipt> {
  // 1. Production gate. Default registry is the committed seed (closed), so this refuses in production
  //    until the S39.3 flip; tests inject an open registry to exercise the send path.
  assertActionExecutable(INTERNAL_TRANSACTIONAL_ACTION_KEY, deps.registry);

  const dedupKey = internalTransactionalDedupKey(input.reportId);

  // 2. Idempotency: a prior DELIVERED receipt means the notice already went out — never send twice. This
  //    is a check-then-set on a deterministic dedup key, which is sufficient for the report-issue flow that
  //    emits ONCE per freshly-created report id (so the same id is never emitted concurrently); it is
  //    retry-safe (a sequential retry short-circuits), not a distributed lock for concurrent same-id emits.
  const existing = await deps.getReceipt(dedupKey);
  if (existing?.delivered) return existing;

  // 3. Recipient lock: the recipient comes ONLY from the SYSTEM read; the input has no recipient field.
  const resolved = (await deps.resolveDestination())?.trim().toLowerCase() ?? "";
  if (resolved === "") {
    throw new InternalTransactionalError(
      "No internal transactional destination is configured; refusing to guess a recipient.",
    );
  }

  // 4. Re-assert the internal-domain allowlist at send time (defence in depth over the config-set schema).
  if (!isInternalTransactionalDestination(resolved)) {
    throw new InternalTransactionalError(
      "The configured transactional destination is not an internal address; refusing to send externally.",
    );
  }

  // 5. Metadata-only payload. 6. One honest attempt.
  const { subject, body } = buildInternalTransactionalNotice(input, deps.appBaseUrl);
  const attemptedAt = (deps.nowIso ?? (() => new Date().toISOString()))();
  let delivered = false;
  let error: string | undefined;
  try {
    await deps.sender.send({ to: resolved, subject, body });
    delivered = true;
  } catch (sendError) {
    error =
      sendError instanceof Error ? sendError.message : "internal notice send failed";
  }

  const receipt: InternalTransactionalReceipt = {
    dedup_key: dedupKey,
    action_key: INTERNAL_TRANSACTIONAL_ACTION_KEY,
    report_id: input.reportId,
    recipient: resolved,
    delivered,
    attempted_at: attemptedAt,
    ...(error ? { error } : {}),
  };
  await deps.recordReceipt(receipt);
  return receipt;
}
