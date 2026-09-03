// Live control-plane wiring for the S97 renewal-writeback service. Provider clients stay lazy so a
// closed key, refused environment, or stale confirmation never constructs a writer (BEH-S97-3).

import {
  assertLiveProviderActionAllowed,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { FirestoreExternalExecutionStore } from "@/lib/firestore/external-action-executions";
import { claimActiveS97RenewalEffect } from "@/lib/firestore/s97-renewal-writeback-claim";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  RentVineClient,
  createFetchTransport,
  type RentVineClientConfig,
} from "@/lib/integrations/rentvine/client";
import {
  RentVineWriteClient,
  createRentVineWriteFetchTransport,
} from "@/lib/integrations/rentvine/write-client";
import {
  assertProductionRuntimeActionExecutable,
  isProductionRuntimeActionExecutable,
  runProductionRuntimeGatedAction,
} from "@/lib/operations/runtime-suspension-gate";
import type { RenewalWritebackDependencies } from "@/lib/lease-renewal/writeback/execution-service";

const PROVIDER_TIMEOUT_MS = 30_000;

function liveRentVineConfig(): RentVineClientConfig | null {
  const baseUrl = process.env.RENTVINE_API_BASE_URL?.trim();
  const apiKey = process.env.RENTVINE_API_KEY?.trim();
  const apiSecret = process.env.RENTVINE_API_SECRET?.trim();
  if (!baseUrl || !apiKey || !apiSecret) return null;
  return { baseUrl, apiKey, apiSecret };
}

/**
 * Refuse a mutating S97 operation before body-specific work: live environment first, then the exact
 * per-key committed-seed + runtime-suspension gate. Recovery reads skip only the mutating key gate.
 */
export async function assertRenewalWritebackExecutionAllowed(
  descriptor: EnvironmentDescriptor,
  mode: "mutating" | "recovery",
  actionKey?: string,
): Promise<void> {
  assertLiveProviderActionAllowed(descriptor);
  if (mode === "mutating") {
    if (!actionKey) {
      throw new Error("A mutating S97 operation requires its exact action key.");
    }
    await assertProductionRuntimeActionExecutable(actionKey);
  }
}

/** Build live S97 dependencies, or report the provider as not configured. */
export function buildLiveRenewalWritebackDeps(
  descriptor: EnvironmentDescriptor,
): RenewalWritebackDependencies | { status: "not_configured" } {
  const config = liveRentVineConfig();
  if (!config) return { status: "not_configured" };
  const db = getAdminFirestore();
  let readClient: RentVineClient | null = null;
  const reader = () =>
    (readClient ??= new RentVineClient(
      config,
      createFetchTransport({ timeoutMs: PROVIDER_TIMEOUT_MS }),
    ));
  return {
    descriptor,
    store: new FirestoreExternalExecutionStore(db),
    reads: {
      getLease: (leaseId) => reader().getLease(leaseId),
      getRecurringCharge: (leaseId, chargeId) =>
        reader().getRecurringCharge(leaseId, chargeId),
      listRecurringCharges: (leaseId) => reader().listRecurringCharges(leaseId),
    },
    createWriter: () =>
      new RentVineWriteClient(
        config,
        createRentVineWriteFetchTransport({ timeoutMs: PROVIDER_TIMEOUT_MS }),
      ),
    gateFor: (actionKey) => ({
      isExecutable: () => isProductionRuntimeActionExecutable(actionKey),
      run: (effect) => runProductionRuntimeGatedAction(actionKey, effect),
    }),
    claimActiveEffect: (input) => claimActiveS97RenewalEffect(db, input),
  };
}
