// Live control-plane wiring for the S98 operating-Sheet service. The writer stays lazy so a
// closed key, disabled flag, refused environment, or stale confirmation never constructs it.

import {
  assertLiveProviderActionAllowed,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { FirestoreExternalExecutionStore } from "@/lib/firestore/external-action-executions";
import {
  claimAuthorizedS98FieldUpdate,
  claimLeaseScopedS98Append,
  settleLeaseScopedS98Append,
} from "@/lib/firestore/s98-sheet-writeback-claim";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { GoogleSheetsApiWriter } from "@/lib/google-sheets/write-client";
import {
  assertProductionRuntimeActionExecutable,
  isProductionRuntimeActionExecutable,
  runProductionRuntimeGatedAction,
} from "@/lib/operations/runtime-suspension-gate";
import { isSheetWritebackEnabled } from "@/lib/lease-renewal/sheet-writeback-policy";
import type { SheetWritebackDependencies } from "@/lib/lease-renewal/sheet-writeback/execution-service";

/** The operating tab title (matches the live desk read path). */
export const OPERATING_SHEET_TAB = "Lease Renewal";

export function liveOperatingSheetId(): string | null {
  return process.env.RENEWAL_SHEET_ID?.trim() || null;
}

/**
 * Refuse a mutating S98 operation before body-specific work: live environment first, then the
 * exact per-key committed-seed + runtime-suspension gate. Recovery reads skip only the key gate.
 */
export async function assertSheetWritebackV2ExecutionAllowed(
  descriptor: EnvironmentDescriptor,
  mode: "mutating" | "recovery",
  actionKey?: string,
): Promise<void> {
  assertLiveProviderActionAllowed(descriptor);
  if (mode === "mutating") {
    if (!actionKey) {
      throw new Error("A mutating S98 operation requires its exact action key.");
    }
    await assertProductionRuntimeActionExecutable(actionKey);
  }
}

/** Build live S98 dependencies, or report the sheet as not configured. */
export function buildLiveSheetWritebackDeps(
  descriptor: EnvironmentDescriptor,
): SheetWritebackDependencies | { status: "not_configured" } {
  const spreadsheetId = liveOperatingSheetId();
  if (!spreadsheetId) return { status: "not_configured" };
  const db = getAdminFirestore();
  return {
    descriptor,
    store: new FirestoreExternalExecutionStore(db),
    createWriter: () => new GoogleSheetsApiWriter(),
    gateFor: (actionKey) => ({
      isExecutable: () => isProductionRuntimeActionExecutable(actionKey),
      run: (effect) => runProductionRuntimeGatedAction(actionKey, effect),
    }),
    writeFlagEnabled: isSheetWritebackEnabled,
    claimAuthorizedFieldUpdate: (input) => claimAuthorizedS98FieldUpdate(db, input),
    claimLeaseScopedAppend: (input) => claimLeaseScopedS98Append(db, input),
    settleLeaseScopedAppend: (input) => settleLeaseScopedS98Append(db, input),
  };
}
