// S182 (ARCH-S182-2): data obtained through the Dotloop API never reaches an AI input, AI
// persistence or AI reuse boundary.
//
// The boundary is decided by source, never by comparing values. The application keeps Dotloop API
// data only in the stores listed in DOTLOOP_API_ORIGIN_STORES, and the assistant's context reads
// none of them except through the source-side views in this module: the renewal read takes each
// packet without its provider execution projection (`packetSnapshotForAiContext`), and the
// connection read takes each app-held connection record as the app's own lifecycle status only
// (`connectionViewForAiContext`), with no provider-derived verdict or outcome. That source-side
// removal is what keeps loop names, participants, statuses and document names away from the
// assistant. A value independently obtained from RentVine, the approved Sheet or a staff entry keeps
// its own PMI origin even when Dotloop holds an equal value, so it stays usable.
//
// Saved AI history adds one narrow, structural defense for text that reached an answer some other
// way (`assistantAnswerForHistory`, `knowledgeAnswerForHistory`): the address of a Dotloop
// application resource (a page of the signed-in application under /m/ or /my/, or a Dotloop API
// path) and the application's own Dotloop references are cut from the answer text, only those
// characters, and a citation that links to such an address is dropped. Dotloop's public pages, such
// as support and help articles, are not provider records and stay. The person's own question text
// is never rewritten. This defense recognizes those address and reference forms only; it cannot
// recognize a loop name or a participant by its value, which is why the source-side views above
// are the boundary. Instructions inside a document or provider payload cannot waive any of this.
// Non-AI operational views keep the data under their own contracts.

import type {
  StoredAssistantAnswer,
  StoredKnowledgeAnswer,
} from "@/lib/assistant-history/stored-answer";
import type { ConnectorConnectionView } from "@/lib/connections/connection-status";
import type { ConnectorConnectionRecord } from "@/lib/connections/connector-connection";
import type { RenewalPacketSnapshot } from "@/lib/lease-documents/packet-types";

/**
 * Every store that holds Dotloop API-derived data. The assistant's context assembly names none of
 * them and reads two of them only through the source-side views in this module: packet execution
 * projections through `packetSnapshotForAiContext` and connection records through
 * `connectionViewForAiContext`. A test pins this list to the stores' own collection names and
 * checks the AI-facing modules against it.
 */
export const DOTLOOP_API_ORIGIN_STORES = Object.freeze([
  // The labeled account, profile, template and subscription observation (S106).
  "dotloop_connection_observations",
  // The selected profile and template ids with their Dotloop labels, and the selection history.
  "dotloop_renewal_settings",
  "dotloop_renewal_settings_activity",
  // The Dotloop connection record (provider-reported scopes, the token refresh outcome and the
  // revocation evidence) and the revocation receipts that carry that evidence.
  "connector_connections",
  "connector_revocation_receipts",
  // Each packet action's companion: the loop target id, the selected profile and template ids and
  // the provider receipt.
  "lease_document_action_snapshots",
  // The packet's execution projection (loop link, readback status and counts, document presence)
  // and the packet activity that records each provider-derived execution state.
  "lease_document_packet_execution_projections",
  "lease_document_packet_activity",
  // The lease's loop association (loop name and address, folder, uploaded documents, readback),
  // its owner index and its activity (S34).
  "lease_document_loop_associations",
  "lease_document_loop_owners",
  "lease_document_loop_association_activity",
] as const);

/**
 * The AI-context view of one packet snapshot. The S66 evaluation (facts, blockers, manifest) is
 * PMI-sourced and stays; the provider execution projection (loop link, readback status and counts,
 * document presence, receipts) is removed, and the visible state falls back to the packet's own
 * evaluation state instead of a provider-derived execution state.
 */
export function packetSnapshotForAiContext(
  snapshot: RenewalPacketSnapshot | null,
): RenewalPacketSnapshot | null {
  if (!snapshot) return snapshot;
  const { execution: _execution, ...rest } = snapshot;
  void _execution;
  return { ...rest, visibleState: snapshot.state };
}

/** The AI-context view of a batch of packet snapshots, keyed by lease. */
export function packetSnapshotsForAiContext(
  snapshots: ReadonlyMap<string, RenewalPacketSnapshot | null>,
): Map<string, RenewalPacketSnapshot | null> {
  return new Map(
    [...snapshots].map(([leaseId, snapshot]) => [
      leaseId,
      packetSnapshotForAiContext(snapshot),
    ]),
  );
}

/** Connectors whose app-held record also carries outcomes derived from provider responses. */
const PROVIDER_OUTCOME_CONNECTORS: ReadonlySet<string> = new Set(["dotloop"]);

/**
 * The AI-context view of one app-held connection record: the app's own lifecycle status only
 * (connected, disconnecting or disconnected). Dotloop's token refresh outcome and its revocation
 * evidence come from Dotloop responses, so they are withheld, the same way the provider-derived
 * live verdict is. The view never depends on the reader's role, so a saved answer holds only what
 * every reader may see.
 */
export function connectionViewForAiContext(
  record: Pick<ConnectorConnectionRecord, "connectorId" | "status">,
): ConnectorConnectionView {
  return PROVIDER_OUTCOME_CONNECTORS.has(record.connectorId)
    ? { status: record.status, providerOutcomes: "withheld" }
    : { status: record.status };
}

/**
 * What a cut Dotloop address or reference reads as in saved answer text. It is no longer than the
 * shortest form it replaces, so a cut never lengthens a stored field past its contract.
 */
export const DOTLOOP_REFERENCE_REMOVED_TEXT = "[Dotloop removed]";

// A dotloop.com address in running text. The repetition is bounded so a long answer stays cheap.
const DOTLOOP_ADDRESS =
  /(?:\bhttps?:\/\/)?\b(?:[a-z0-9-]{1,63}\.){0,4}dotloop\.com(?::\d{1,5})?(?:[/?#][^\s"'<>()[\]{}]*)?/gi;
// The application's own references to a Dotloop object: the selected profile and a packet receipt.
const DOTLOOP_APP_REFERENCE =
  /\bdotloop(?::profile|-receipt):[A-Za-z0-9][A-Za-z0-9._:-]*/gi;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;
const DOTLOOP_APP_HOSTS: ReadonlySet<string> = new Set([
  "www.dotloop.com",
  "dotloop.com",
]);
const DOTLOOP_API_HOST = "api-gateway.dotloop.com";
// The signed-in application's record pages, such as /m/loop?viewId=… and /my/….
const DOTLOOP_APP_RESOURCE_PATH = /^\/(?:m|my)\/[^/]/i;

/**
 * True for the address of a Dotloop application resource: a page of the signed-in application
 * under /m/ or /my/ (written with its scheme or www.), or any path on the Dotloop API host. Public
 * pages (support and help articles, the license agreement, the home page) are not resources.
 */
export function isDotloopResourceAddress(address: string): boolean {
  const raw = address.trim();
  const hasScheme = /^https?:\/\//i.test(raw);
  let url: URL;
  try {
    url = new URL(hasScheme ? raw : `https://${raw}`);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (host === DOTLOOP_API_HOST) return url.pathname.length > 1;
  return (
    DOTLOOP_APP_HOSTS.has(host) &&
    (hasScheme || /^www\./i.test(raw)) &&
    DOTLOOP_APP_RESOURCE_PATH.test(url.pathname)
  );
}

/** Cut each Dotloop resource address and app Dotloop reference out of one text. */
function cutDotloopReferences(text: string): { text: string; removed: number } {
  let removed = 0;
  const cut = (match: string, isReference: (candidate: string) => boolean) => {
    const candidate = match.replace(TRAILING_PUNCTUATION, "");
    if (!candidate || !isReference(candidate)) return match;
    removed += 1;
    return DOTLOOP_REFERENCE_REMOVED_TEXT + match.slice(candidate.length);
  };
  const next = text
    .replace(DOTLOOP_ADDRESS, (match) => cut(match, isDotloopResourceAddress))
    .replace(DOTLOOP_APP_REFERENCE, (match) => cut(match, () => true));
  return { text: next, removed };
}

/** True when a text carries a Dotloop resource address or one of the app's Dotloop references. */
export function carriesDotloopOriginMarker(value: string): boolean {
  return cutDotloopReferences(value).removed > 0;
}

export interface DotloopHistoryFilterResult<T> {
  readonly value: T;
  /** How many addresses or references were cut and citations dropped; never their content. */
  readonly removed: number;
}

function textCutter() {
  let removed = 0;
  return {
    text(value: string): string {
      const cut = cutDotloopReferences(value);
      removed += cut.removed;
      return cut.text;
    },
    count(extra = 0): number {
      removed += extra;
      return removed;
    },
  };
}

/**
 * The operational answer as it may be kept in saved AI history. Dotloop resource addresses and the
 * application's Dotloop references are cut from the answer's own text: its summary, interpretation,
 * clarification, group titles, summaries, notes and link labels, and each item's title, detail,
 * blockers and facts. The person's questions in the conversation, the question handed to the
 * knowledge base, the executed plan and every record reference and in-app link stay exactly as
 * they were. The input is never mutated.
 */
export function assistantAnswerForHistory(
  answer: StoredAssistantAnswer | null,
): DotloopHistoryFilterResult<StoredAssistantAnswer | null> {
  if (!answer) return { value: answer, removed: 0 };
  const cutter = textCutter();
  const value: StoredAssistantAnswer = {
    ...answer,
    summary: cutter.text(answer.summary),
    interpretation: answer.interpretation.map(cutter.text),
    clarification:
      answer.clarification === null ? null : cutter.text(answer.clarification),
    groups: answer.groups.map((group) => ({
      ...group,
      title: cutter.text(group.title),
      summary: cutter.text(group.summary),
      notes: group.notes.map(cutter.text),
      link: group.link ? { ...group.link, label: cutter.text(group.link.label) } : null,
      items: group.items.map((item) => ({
        ...item,
        title: cutter.text(item.title),
        detail: cutter.text(item.detail),
        blockers: item.blockers.map(cutter.text),
        ...(item.facts ? { facts: item.facts.map(cutter.text) } : {}),
      })),
    })),
  };
  return { value, removed: cutter.count() };
}

/**
 * The knowledge answer as it may be kept in saved AI history. The same cut applies to its answer,
 * handling steps, draft, escalation owner and each citation's title and excerpt. A citation whose
 * link is a Dotloop resource address is dropped and leaves the shown-source count, so every kept
 * citation is still a working https link. The person's question stays as written. The input is
 * never mutated.
 */
export function knowledgeAnswerForHistory(
  answer: StoredKnowledgeAnswer | null,
): DotloopHistoryFilterResult<StoredKnowledgeAnswer | null> {
  if (!answer) return { value: answer, removed: 0 };
  const cutter = textCutter();
  const citations = answer.citations.filter(
    (citation) => !isDotloopResourceAddress(citation.url),
  );
  const dropped = answer.citations.length - citations.length;
  const value: StoredKnowledgeAnswer = {
    ...answer,
    answer: cutter.text(answer.answer),
    handling_steps: answer.handling_steps.map(cutter.text),
    draft: cutter.text(answer.draft),
    ...(answer.escalation_owner === undefined
      ? {}
      : { escalation_owner: cutter.text(answer.escalation_owner) }),
    citations: citations.map((citation) => ({
      ...citation,
      title: cutter.text(citation.title),
      ...(citation.excerpt === undefined
        ? {}
        : { excerpt: cutter.text(citation.excerpt) }),
    })),
    ...(answer.answered_by
      ? {
          answered_by: {
            ...answer.answered_by,
            source_count: Math.max(0, answer.answered_by.source_count - dropped),
          },
        }
      : {}),
  };
  return { value, removed: cutter.count(dropped) };
}
