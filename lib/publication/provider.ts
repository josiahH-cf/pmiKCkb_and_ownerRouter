import type { PublicationScanner } from "@/lib/publication/types";
import { readServerConfig } from "@/lib/config/server";
import type { PublicationPolicyRecord } from "@/lib/publication/types";
import { ManagedProcessPublicationScanner } from "./managed-scanner";
import {
  MANAGED_PROCESS_SCANNER_KEY,
  MANAGED_RENEWAL_ORIGINAL_SCANNER_KEY,
  MANAGED_PUBLICATION_SCANNER_CONFIGURATION,
} from "./managed-scanner-config";
import { PublicationResourceScopeSchema } from "./resource-scope";
import { ManagedRenewalOriginalScanner } from "./renewal-original-scanner";
import {
  LOCAL_DEMO_PUBLICATION_SCANNER_KEYS,
  isLocalDemoPublicationScannerAllowed,
  LocalDemoPublicationScanner,
  UnavailablePublicationScanner,
} from "@/lib/publication/scanners";

/**
 * Named S241 execution supplies the narrow process-publication scope. A real managed engine and
 * its exact created-service readback are still technical prerequisites; no fake is a fallback.
 * Synthetic scanners additionally require local-demo auth and the Firestore emulator.
 */
export function resolvePublicationScanner(
  scannerKey: string,
  options: {
    firestoreEmulatorHost?: string;
    localDemoAuth?: boolean;
    nodeEnv?: string;
    policy?: PublicationPolicyRecord;
  } = {},
): PublicationScanner {
  if (
    scannerKey === MANAGED_PROCESS_SCANNER_KEY ||
    scannerKey === MANAGED_RENEWAL_ORIGINAL_SCANNER_KEY
  ) {
    const scope = PublicationResourceScopeSchema.safeParse(options.policy?.resourceScope);
    if (
      scope.success &&
      options.policy?.scannerKey === scannerKey &&
      MANAGED_PUBLICATION_SCANNER_CONFIGURATION.serviceUrl &&
      readServerConfig().gcpProjectId ===
        MANAGED_PUBLICATION_SCANNER_CONFIGURATION.projectId
    ) {
      if (
        scannerKey === MANAGED_PROCESS_SCANNER_KEY &&
        scope.data.resourceType === "process_definition"
      )
        return new ManagedProcessPublicationScanner(scope.data);
      if (
        scannerKey === MANAGED_RENEWAL_ORIGINAL_SCANNER_KEY &&
        scope.data.resourceType === "file"
      )
        return new ManagedRenewalOriginalScanner(scope.data);
    }
    return new UnavailablePublicationScanner(scannerKey);
  }
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const localDemoAuth = options.localDemoAuth ?? readServerConfig().localDemoAuth;
  const firestoreEmulatorHost =
    options.firestoreEmulatorHost ?? process.env.FIRESTORE_EMULATOR_HOST;
  const fence = { firestoreEmulatorHost, localDemoAuth, nodeEnv };
  if (isLocalDemoPublicationScannerAllowed(fence) && isLocalDemoScannerKey(scannerKey)) {
    return new LocalDemoPublicationScanner(scannerKey, fence);
  }
  return new UnavailablePublicationScanner(scannerKey);
}

function isLocalDemoScannerKey(
  scannerKey: string,
): scannerKey is (typeof LOCAL_DEMO_PUBLICATION_SCANNER_KEYS)[number] {
  return LOCAL_DEMO_PUBLICATION_SCANNER_KEYS.some((key) => key === scannerKey);
}
