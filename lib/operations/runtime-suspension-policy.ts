/**
 * Client-safe vocabulary for S51's close-only runtime suspension control plane.
 *
 * This module deliberately contains no Firestore, auth, provider, or Action Registry imports so the
 * Admin surface and server boundary share exact values without pulling a server dependency into the
 * browser bundle.
 */
export const RUNTIME_SUSPENSION_REASON_CODES = [
  "wrong_client_output",
  "ambiguous_or_duplicate_effect",
  "provider_outage",
  "security_containment",
  "planned_maintenance",
  "incident_resolved",
] as const;

export type RuntimeSuspensionReasonCode =
  (typeof RUNTIME_SUSPENSION_REASON_CODES)[number];

export const RUNTIME_SUSPENSION_REASON_LABELS = Object.freeze({
  wrong_client_output: "Wrong client-facing output",
  ambiguous_or_duplicate_effect: "Ambiguous or duplicate effect",
  provider_outage: "Provider outage",
  security_containment: "Security containment",
  planned_maintenance: "Planned maintenance",
  incident_resolved: "Incident resolved",
} as const satisfies Readonly<Record<RuntimeSuspensionReasonCode, string>>);

export const RUNTIME_SUSPENSION_GLOBAL_KEY = "*" as const;
export const RUNTIME_SUSPENSION_OPERATION_ID_HEADER = "idempotency-key" as const;
export const RUNTIME_SUSPENSION_EXPECTED_ID_HEADER = "x-expected-suspension-id" as const;
export const RUNTIME_SUSPENSION_UNREADABLE_EXPECTATION = "unreadable" as const;

export const RUNTIME_SUSPENSION_INCIDENT_REF_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
export const RUNTIME_SUSPENSION_OPAQUE_INCIDENT_REF_PATTERN =
  /^(?:INC|SEV[0-9]{1,2})(?:[._-][0-9]+)+$/;
export const RUNTIME_SUSPENSION_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Only an explicitly ticket-shaped identifier may cross this boundary. A small allowlist grammar is
 * intentional: trying to blacklist customer and secret vocabulary leaves evasions such as UNIT4B,
 * RESIDENT123, names, and access-key-shaped values.
 */
export function isOpaqueRuntimeSuspensionIncidentRef(value: string): boolean {
  return (
    RUNTIME_SUSPENSION_INCIDENT_REF_PATTERN.test(value) &&
    RUNTIME_SUSPENSION_OPAQUE_INCIDENT_REF_PATTERN.test(value)
  );
}
