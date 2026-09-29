import { isSheetWritebackEnabled } from "@/lib/lease-renewal/sheet-writeback-policy";

export const SHEET_RUNTIME_BINDING_VERSION = "operating-sheet-runtime/v1";
export const SHEET_ENABLED_POLICY = "explicit-owner-enabled/v1";

export interface SheetWritebackRuntimeBinding {
  readonly version: typeof SHEET_RUNTIME_BINDING_VERSION;
  readonly revision: string;
  readonly policy: typeof SHEET_ENABLED_POLICY;
}

/** Cloud Run owns this immutable revision identity. Missing identity never enables a write. */
export function readSheetWritebackRuntimeBinding(): SheetWritebackRuntimeBinding | null {
  const revision = process.env.K_REVISION;
  if (!isSheetWritebackEnabled() || !validSheetRuntimeRevision(revision)) return null;
  return {
    version: SHEET_RUNTIME_BINDING_VERSION,
    revision,
    policy: SHEET_ENABLED_POLICY,
  };
}

export function validSheetRuntimeRevision(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(value);
}

export function sheetRuntimeBindingMatches(
  binding: unknown,
  current: SheetWritebackRuntimeBinding | null = readSheetWritebackRuntimeBinding(),
): binding is SheetWritebackRuntimeBinding {
  if (!binding || typeof binding !== "object" || !current) return false;
  const value = binding as Record<string, unknown>;
  return (
    Object.keys(value).length === 3 &&
    value.version === SHEET_RUNTIME_BINDING_VERSION &&
    value.policy === SHEET_ENABLED_POLICY &&
    validSheetRuntimeRevision(value.revision) &&
    value.revision === current.revision &&
    current.version === SHEET_RUNTIME_BINDING_VERSION &&
    current.policy === SHEET_ENABLED_POLICY
  );
}
