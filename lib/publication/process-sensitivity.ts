import { carriesCredentialContent } from "@/lib/lease-renewal/credential-guard";
import type { PublicationScanResult } from "./types";

function flagged(value: string) {
  return (
    carriesCredentialContent(value) ||
    /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/i.test(value) ||
    /\b\d{3}-\d{2}-\d{4}\b/.test(value)
  );
}
/**
 * A bounded tripwire for already-reviewed process guidance: credentials/Bearer and SSN-shaped
 * values. It is not general PII/DLP detection; absent patterns cannot supply the no-client-data review.
 */
export function inspectProcessSensitivity(content: Uint8Array): PublicationScanResult {
  try {
    if (content.byteLength < 1 || content.byteLength > 2 * 1024 * 1024)
      return { code: "scanner_unavailable" };
    const parsed: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(content),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return { code: "scanner_unavailable" };
    const pending: Array<{ value: unknown; depth: number }> = [
      { value: parsed, depth: 0 },
    ];
    while (pending.length) {
      const entry = pending.pop()!;
      if (entry.depth > 32) return { code: "scanner_unavailable" };
      if (typeof entry.value === "string" && flagged(entry.value))
        return { code: "sensitivity_violation", sensitivity: "High" };
      if (entry.value && typeof entry.value === "object")
        for (const [key, value] of Object.entries(entry.value)) {
          if (flagged(key)) return { code: "sensitivity_violation", sensitivity: "High" };
          pending.push({ value, depth: entry.depth + 1 });
        }
    }
    return { code: "clean", sensitivity: "Low" };
  } catch {
    return { code: "scanner_unavailable" };
  }
}
