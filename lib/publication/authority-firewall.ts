import { EXECUTION_ACTION_POLICIES } from "@/lib/execution/risk-policy";
import type { PublicationFailureCode } from "@/lib/publication/types";

const FORBIDDEN_AUTHORITY_FIELDS = new Set([
  "action_registry",
  "claims",
  "connector_policy",
  "custom_claims",
  "enable_action",
  "environment",
  "executor",
  "production_allowed",
  "role_scope",
  "system_prompt",
]);

export class PublicationAuthorityError extends Error {
  constructor(public readonly code: PublicationFailureCode) {
    super(safePublicationFailureMessage(code));
    this.name = "PublicationAuthorityError";
  }
}

/**
 * Treat prose as inert data, but reject structured attempts to smuggle runtime authority.
 * This function has no writer dependency and therefore cannot mutate authority records.
 */
export function assertAuthorityFieldsAreInert(value: unknown): void {
  walk(value);
}

export function assertRegisteredProcessActions(actionKeys: readonly string[]): void {
  const unknown = actionKeys.find((key) => !(key in EXECUTION_ACTION_POLICIES));
  if (unknown) {
    throw new PublicationAuthorityError("process_action_unknown");
  }
}

function walk(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(walk);
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_AUTHORITY_FIELDS.has(normalizeKey(key))) {
      throw new PublicationAuthorityError("authority_field_forbidden");
    }
    walk(child);
  }
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function safePublicationFailureMessage(code: PublicationFailureCode): string {
  const messages: Record<PublicationFailureCode, string> = {
    actor_not_authorized: "This user is not authorized to publish this resource.",
    authority_field_forbidden: "Structured runtime-authority fields cannot be published.",
    content_size_mismatch: "The received content size does not match its declared size.",
    data_mode_mismatch:
      "Publication policy, resource, and content data modes must match.",
    malware_detected: "Publication was rejected by the malware check.",
    mime_mismatch: "The detected file type does not match the allowed declared type.",
    oversize: "The publication exceeds the configured size limit.",
    path_outside_root: "The publication path is outside the configured root.",
    policy_disabled: "The publication policy is disabled.",
    policy_not_found: "No publication policy is configured for this resource.",
    process_action_unknown: "The process references an unregistered action key.",
    process_graph_invalid: "The process graph is incomplete or contains duplicate steps.",
    root_mismatch: "The publication does not match the configured connector root.",
    scanner_mismatch: "The configured publication scanner is not available.",
    scanner_unavailable: "A required publication scanner is unavailable.",
    sensitivity_violation: "Publication was rejected by the sensitivity policy.",
    source_metadata_invalid:
      "Publication requires valid source-state and citation metadata.",
    space_not_allowed: "The publication is outside the configured Space scope.",
    type_denied: "This file type is not allowed by the publication policy.",
  };
  return messages[code];
}
