import { randomUUID } from "node:crypto";

import { readServerConfig } from "@/lib/config/server";
import { FirestoreCompScreenshotExecutionStore } from "@/lib/firestore/lease-renewal-comp-screenshot-executions";
import { GoogleDriveRenewalCompScreenshotProvider } from "@/lib/google-drive/renewal-comp-screenshot";
import {
  resolveCompScreenshotProviderIdentity,
  type CompScreenshotExecutionContext,
  type CompScreenshotServiceDeps,
} from "@/lib/lease-renewal/comp-screenshot-service";

/**
 * Build control-plane dependencies without constructing a Drive client. `createProvider` remains lazy
 * so preview and every refusal path can validate configuration without minting a token or touching Drive.
 */
export function buildLiveCompScreenshotRuntime(): {
  deps: CompScreenshotServiceDeps;
  context: CompScreenshotExecutionContext;
} {
  const config = readServerConfig();
  const providerIdentity = resolveCompScreenshotProviderIdentity();
  return {
    context: { descriptor: config.environment },
    deps: {
      store: new FirestoreCompScreenshotExecutionStore(),
      folderId: config.renewalCompImageFolderId,
      approvedSharedDriveId: config.renewalCompSharedDriveId,
      providerIdentityHash: providerIdentity?.hash ?? "",
      createProvider: () => new GoogleDriveRenewalCompScreenshotProvider(),
      now: () => new Date(),
      nonce: randomUUID,
    },
  };
}
