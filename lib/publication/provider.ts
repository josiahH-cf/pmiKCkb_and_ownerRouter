import type { PublicationScanner } from "@/lib/publication/types";
import { readServerConfig } from "@/lib/config/server";
import {
  LOCAL_DEMO_PUBLICATION_SCANNER_KEYS,
  isLocalDemoPublicationScannerAllowed,
  LocalDemoPublicationScanner,
  UnavailablePublicationScanner,
} from "@/lib/publication/scanners";

/**
 * Production provider activation is an explicit S21 owner/vendor gate. Until a real
 * provider is configured, every route fails closed instead of substituting a fake.
 * Synthetic scanners additionally require local-demo auth and the Firestore emulator.
 */
export function resolvePublicationScanner(
  scannerKey: string,
  options: {
    firestoreEmulatorHost?: string;
    localDemoAuth?: boolean;
    nodeEnv?: string;
  } = {},
): PublicationScanner {
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
