// S182 (ARCH-S182-2): data obtained through the Dotloop API never reaches an AI input, AI
// persistence or AI reuse boundary.
//
// Lineage is decided by where data came from, never by comparing values: an equal value from
// RentVine, the approved Sheet or a staff entry keeps its own PMI origin, and a Dotloop readback is
// never relabeled by copying it into an app field. The application keeps Dotloop API data only in
// the stores listed below. Every AI context assembler that reads one of them removes the
// provider-derived branch here first, keeping the record's independently sourced fields, and the
// saved AI history drops any Dotloop-origin marker before it is persisted. Instructions inside a
// document or provider payload cannot waive this. Non-AI operational views keep the data under
// their own contracts.

import type { RenewalPacketSnapshot } from "@/lib/lease-documents/packet-types";

/**
 * Stores and fields that hold Dotloop API-derived data. AI context assembly never reads them
 * except through the filters in this module.
 */
export const DOTLOOP_API_ORIGIN_STORES = Object.freeze([
  // Labeled account/profile/template/subscription observation (S106).
  "dotloop_connection_observations",
  // Loop link, readback status/counts and document presence evidence on the packet projection.
  "lease_document_packet_execution_projections",
  // Provider receipts retained with each packet action companion.
  "lease_document_action_snapshots.effectReceipt",
  // The lease/cycle loop association and observed folder/document identities (S34).
  "lease_document_loop_associations",
  // The owner index that keeps a loop recorded for one lease, and the association activity (S34).
  "lease_document_loop_owners",
  "lease_document_loop_association_activity",
] as const);

/**
 * Field names that only ever carry Dotloop API-derived values in this application's records. A
 * saved AI answer that names one of them is a provider-derived branch.
 */
export const DOTLOOP_ORIGIN_FIELD_NAMES: ReadonlySet<string> = new Set([
  "loopLink",
  "loop_link",
  "loopUrl",
  "loop_url",
  "loopStatus",
  "loop_status",
  "loopId",
  "loop_id",
  "loopName",
  "loop_name",
  "participantCount",
  "participant_count",
  "documentCount",
  "document_count",
  "documentEvidence",
  "document_evidence",
  "providerRef",
  "provider_ref",
  "dotloopDocumentId",
  "dotloop_document_id",
  "dotloopFolderId",
  "dotloop_folder_id",
  "effectReceipt",
  "providerObservation",
  "provider_observation",
]);

const DOTLOOP_HOST = /(^|\.)dotloop\.com$/i;
const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>)]+/gi;
const DOTLOOP_REFERENCE = /\bdotloop(?:-receipt)?:[A-Za-z0-9:_-]+/i;

const DOTLOOP_OBJECT_PATH = /loop|document|folder|participant/i;

/**
 * True when a string carries an address of a Dotloop loop, folder, document or participant (the
 * shape the API returns), or the application's own reference to a Dotloop object. A staff-entered
 * general Dotloop link (for example a configured help or template page) is not an API object.
 */
export function carriesDotloopOriginMarker(value: string): boolean {
  if (DOTLOOP_REFERENCE.test(value)) return true;
  for (const match of value.matchAll(URL_PATTERN)) {
    try {
      const url = new URL(match[0]);
      if (
        DOTLOOP_HOST.test(url.hostname) &&
        DOTLOOP_OBJECT_PATH.test(url.pathname + url.search)
      )
        return true;
    } catch {
      // Not a parseable address; nothing to classify.
    }
  }
  return false;
}

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

/** Replaces a scalar text that carried a Dotloop-origin marker, so the record keeps its shape. */
export const DOTLOOP_ORIGIN_REMOVED_TEXT =
  "Dotloop-derived content is not kept in assistant context or history.";

export interface DotloopOriginFilterResult<T> {
  readonly value: T;
  /** How many provider-derived branches were removed; reported without their content. */
  readonly removed: number;
}

/**
 * Remove every Dotloop-origin branch from a JSON value before it is persisted as AI history or
 * reused as AI context: properties named in DOTLOOP_ORIGIN_FIELD_NAMES and text list entries that
 * carry a Dotloop marker are dropped, and a record field whose text carries one is replaced by
 * DOTLOOP_ORIGIN_REMOVED_TEXT, so the record keeps its independently sourced fields and shape. The
 * input is never mutated.
 */
export function withoutDotloopOriginMarkers<T>(input: T): DotloopOriginFilterResult<T> {
  let removed = 0;
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const kept: unknown[] = [];
      for (const entry of value) {
        // A provider-derived text entry is dropped; a record entry keeps its independent fields.
        if (typeof entry === "string" && carriesDotloopOriginMarker(entry)) {
          removed += 1;
          continue;
        }
        kept.push(visit(entry));
      }
      return kept;
    }
    if (value && typeof value === "object") {
      const next: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (DOTLOOP_ORIGIN_FIELD_NAMES.has(key)) {
          removed += 1;
          continue;
        }
        if (typeof child === "string" && carriesDotloopOriginMarker(child)) {
          // Keep the record's shape; its provider-derived text is not retained.
          removed += 1;
          next[key] = DOTLOOP_ORIGIN_REMOVED_TEXT;
          continue;
        }
        next[key] = visit(child);
      }
      return next;
    }
    return value;
  };
  const value = visit(input) as T;
  return { value, removed };
}
