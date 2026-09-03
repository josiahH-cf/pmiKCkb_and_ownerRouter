import {
  DIAGNOSTIC_KINDS,
  emptyDiagnosticCounts,
  type DiagnosticCounts,
  type DiagnosticKind,
  type StatusClass,
} from "./types";

const SAFE_BROWSER_METHODS = new Set(["GET", "HEAD"]);

export function isCanaryRequestAllowed(method: string): boolean {
  return SAFE_BROWSER_METHODS.has(method.trim().toUpperCase());
}

export function statusClassOf(status: number | null | undefined): StatusClass {
  if (status === null || status === undefined || !Number.isInteger(status)) return "none";
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 300 && status < 400) return "3xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500 && status < 600) return "5xx";
  return "none";
}

export type BrowserSignal =
  | { readonly kind: "console"; readonly level: string; readonly firstParty: boolean }
  | { readonly kind: "page_error" }
  | { readonly kind: "request_failed"; readonly firstParty: boolean }
  | {
      readonly kind: "response";
      readonly firstParty: boolean;
      readonly status: number;
      readonly expected: boolean;
    }
  | { readonly kind: "error_boundary"; readonly boundary: "route" | "global" }
  | { readonly kind: "mutation_attempt" }
  | { readonly kind: "auth_mismatch" }
  | { readonly kind: "landmark_missing" };

export function classifyBrowserSignal(signal: BrowserSignal): DiagnosticKind | null {
  switch (signal.kind) {
    case "console":
      return signal.firstParty && signal.level === "error" ? "console_error" : null;
    case "page_error":
      return "page_error";
    case "request_failed":
      return signal.firstParty ? "request_failed" : null;
    case "response":
      return signal.firstParty && signal.status >= 400 && !signal.expected
        ? "unexpected_response"
        : null;
    case "error_boundary":
      return signal.boundary === "global"
        ? "global_error_boundary"
        : "route_error_boundary";
    case "mutation_attempt":
      return "mutation_attempt";
    case "auth_mismatch":
      return "auth_mismatch";
    case "landmark_missing":
      return "landmark_missing";
  }
}

export function addDiagnostic(
  counts: DiagnosticCounts,
  diagnostic: DiagnosticKind | null,
): DiagnosticCounts {
  if (!diagnostic) return counts;
  return { ...counts, [diagnostic]: counts[diagnostic] + 1 };
}

export function hasBrowserDiagnostics(counts: DiagnosticCounts): boolean {
  return DIAGNOSTIC_KINDS.some((kind) => counts[kind] > 0);
}

export function normalizeDiagnosticCounts(
  counts: Partial<Record<DiagnosticKind, number>> = {},
): DiagnosticCounts {
  const normalized = emptyDiagnosticCounts();
  for (const kind of DIAGNOSTIC_KINDS) {
    const value = counts[kind] ?? 0;
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Invalid diagnostic count for ${kind}.`);
    }
    normalized[kind] = value;
  }
  return normalized;
}
