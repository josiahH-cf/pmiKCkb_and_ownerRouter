// Shared credential detection for the connector's two containment layers (design §2.2). The token
// set mirrors the spec's authoritative regex so both layers agree:
//   - Stage-B content guard (`looksLikeCredentialHeaders`): table-level hard-exclusion when a
//     table's header-ish text looks credential-bearing, even if fingerprinting missed it.
//   - §2.2(5) emit scrubber (`carriesCredentialContent`): a per-field tripwire over every OUTGOING
//     value, so a credential cell that slipped past fingerprinting AND the Stage-B header scan
//     (e.g. pasted into a deep data row of a recognized non-credential tab) is redacted, never
//     emitted. This is the defense-in-depth backstop the spec requires.
// Pure and deterministic; no I/O, no external system.

// Authoritative credential indicators (spec §2.2: password|passcode|wifi|ssid|pin|login|username|
// credential|access code). No domain-specific extras — the canonical credential tabs are also
// caught by the fingerprint primary path.
const CREDENTIAL_TOKENS = [
  "password",
  "passcode",
  "wifi",
  "ssid",
  "pin",
  "login",
  "username",
  "credential",
] as const;

// Tokens strong enough to trip on a single occurrence (no legitimate renewal column uses them).
const STRONG_CREDENTIAL_TOKENS = ["password", "passcode", "ssid", "credential"] as const;

const ACCESS_CODE = /access\s*code/;

// High-signal secret formats (mirrors scripts/check-falsification-preflight.mjs SECRET_PATTERNS),
// so a leaked secret value with no keyword is still caught at emit.
const HIGH_SIGNAL_SECRET_PATTERNS: readonly RegExp[] = [
  /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bGOCSPX-[0-9A-Za-z_-]{20,}\b/,
  /\bgh[posru]_[0-9A-Za-z]{30,}\b/,
  /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/,
  /\bsk-[A-Za-z0-9]{32,}\b/,
];

export const REDACTED_CREDENTIAL = "[REDACTED-CREDENTIAL]";

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter(Boolean),
  );
}

interface IndicatorScan {
  hits: number;
  strong: boolean;
}

function scanIndicators(text: string): IndicatorScan {
  const tokens = tokenSet(text);
  const accessCode = ACCESS_CODE.test(text.toLowerCase());
  let hits = CREDENTIAL_TOKENS.filter((token) => tokens.has(token)).length;
  if (accessCode) hits += 1;
  const strong =
    accessCode || STRONG_CREDENTIAL_TOKENS.some((token) => tokens.has(token));
  return { hits, strong };
}

/**
 * Table-level credential suspicion from a block of header-ish text: a strong token (one hit) or two
 * or more distinct indicators. Legitimate renewal tabs contain none, so this never false-excludes.
 */
export function looksLikeCredentialHeaders(text: string): boolean {
  const { hits, strong } = scanIndicators(text);
  return strong || hits >= 2;
}

/**
 * Emit-time tripwire: does a single OUTGOING cell value carry credential content? Trips on a strong
 * token, two or more weak indicators, or a high-signal secret format.
 */
export function carriesCredentialContent(value: string): boolean {
  if (value.trim() === "") return false;
  const { hits, strong } = scanIndicators(value);
  if (strong || hits >= 2) return true;
  return HIGH_SIGNAL_SECRET_PATTERNS.some((pattern) => pattern.test(value));
}
