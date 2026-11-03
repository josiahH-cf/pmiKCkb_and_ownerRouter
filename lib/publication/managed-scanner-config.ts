export const MANAGED_PROCESS_SCANNER_KEY = "managed-clamav-process-v1";
export const MANAGED_RENEWAL_ORIGINAL_SCANNER_KEY = "managed-clamav-renewal-original-v1";
export interface ManagedPublicationScannerConfiguration {
  projectId: string;
  region: string;
  serviceName: string;
  /** Filled only from the actual service status.url readback before app delivery. */
  serviceUrl: string | null;
  engineVersion: string;
}

/** No endpoint is guessed and none is read from a user policy or customer document. */
export const MANAGED_PUBLICATION_SCANNER_CONFIGURATION: Readonly<ManagedPublicationScannerConfiguration> =
  Object.freeze({
    projectId: "pmi-kc-kb-prod",
    region: "us-central1",
    serviceName: "pmi-kc-publication-scanner",
    serviceUrl: "https://pmi-kc-publication-scanner-kq6wuvpiva-uc.a.run.app",
    engineVersion: "1.4.6",
  });
