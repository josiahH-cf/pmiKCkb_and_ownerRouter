import type { PublicationScanResult, PublicationScanner } from "@/lib/publication/types";

/** Production deliberately has no fallback scanner. An unavailable provider fails closed. */
export class UnavailablePublicationScanner implements PublicationScanner {
  constructor(public readonly key: string) {}

  async scanMalware(): Promise<PublicationScanResult> {
    return { code: "scanner_unavailable" };
  }

  async scanSensitivity(): Promise<PublicationScanResult> {
    return { code: "scanner_unavailable" };
  }
}

export const LOCAL_DEMO_PUBLICATION_SCANNER_KEYS = [
  "fake-clean-v1",
  "fake-malicious-v1",
] as const;

type LocalDemoScannerKey = (typeof LOCAL_DEMO_PUBLICATION_SCANNER_KEYS)[number];

export interface LocalDemoPublicationScannerFence {
  firestoreEmulatorHost: string | undefined;
  localDemoAuth: boolean;
  nodeEnv: string | undefined;
}

export function isLocalDemoPublicationScannerAllowed(
  fence: LocalDemoPublicationScannerFence,
) {
  return (
    fence.localDemoAuth &&
    fence.nodeEnv !== "production" &&
    process.env.NODE_ENV !== "production" &&
    /^(?:127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/.test(
      fence.firestoreEmulatorHost?.trim() ?? "",
    )
  );
}

/**
 * Deterministic synthetic scanner for the explicit local-demo lane. The
 * constructor has its own production fence so a caller cannot activate it by
 * merely selecting a fake-looking policy key.
 */
export class LocalDemoPublicationScanner implements PublicationScanner {
  constructor(
    public readonly key: LocalDemoScannerKey,
    fence: LocalDemoPublicationScannerFence,
  ) {
    if (!isLocalDemoPublicationScannerAllowed(fence)) {
      throw new Error("Local-demo publication scanners are disabled.");
    }
  }

  async scanMalware(): Promise<PublicationScanResult> {
    return {
      code: this.key === "fake-malicious-v1" ? "malware_detected" : "clean",
    };
  }

  async scanSensitivity(): Promise<PublicationScanResult> {
    return { code: "clean", sensitivity: "Low" };
  }
}

/** Safe deterministic test provider; construction outside test is forbidden. */
export class FakePublicationScanner implements PublicationScanner {
  constructor(
    public readonly key = "fake-clean-v1",
    private readonly options: {
      malware?: PublicationScanResult;
      sensitivity?: PublicationScanResult;
    } = {},
  ) {
    if (process.env.NODE_ENV !== "test") {
      throw new Error("Fake publication scanners are test-only.");
    }
  }

  async scanMalware(): Promise<PublicationScanResult> {
    return this.options.malware ?? { code: "clean" };
  }

  async scanSensitivity(): Promise<PublicationScanResult> {
    return this.options.sensitivity ?? { code: "clean", sensitivity: "Low" };
  }
}
