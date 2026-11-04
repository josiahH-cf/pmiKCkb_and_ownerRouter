import { describe, expect, it, vi } from "vitest";
import { readServerConfig } from "@/lib/config/server";
import { ManagedProcessPublicationScanner } from "@/lib/publication/managed-scanner";
import {
  MANAGED_PROCESS_SCANNER_KEY,
  MANAGED_RENEWAL_ORIGINAL_SCANNER_KEY,
} from "@/lib/publication/managed-scanner-config";
import { resolvePublicationScanner } from "@/lib/publication/provider";
import { ManagedRenewalOriginalScanner } from "@/lib/publication/renewal-original-scanner";
import {
  LocalDemoPublicationScanner,
  UnavailablePublicationScanner,
} from "@/lib/publication/scanners";
import type {
  PublicationMetadata,
  PublicationPolicyRecord,
} from "@/lib/publication/types";

// The managed branch reads the runtime project id; this stub stands in for the production
// configuration so the resolver's fence can be exercised in both directions.
vi.mock("@/lib/config/server", () => ({
  readServerConfig: vi.fn(() => ({
    gcpProjectId: "pmi-kc-kb-prod",
    localDemoAuth: false,
  })),
}));

const metadata = {} as PublicationMetadata;

describe("publication scanner provider", () => {
  it("enables deterministic clean and malicious providers only in local demo", async () => {
    const clean = resolvePublicationScanner("fake-clean-v1", {
      firestoreEmulatorHost: "127.0.0.1:8080",
      localDemoAuth: true,
      nodeEnv: "development",
    });
    const malicious = resolvePublicationScanner("fake-malicious-v1", {
      firestoreEmulatorHost: "127.0.0.1:8080",
      localDemoAuth: true,
      nodeEnv: "development",
    });

    expect(clean).toBeInstanceOf(LocalDemoPublicationScanner);
    await expect(clean.scanMalware(new Uint8Array(), metadata)).resolves.toEqual({
      code: "clean",
    });
    await expect(malicious.scanMalware(new Uint8Array(), metadata)).resolves.toEqual({
      code: "malware_detected",
    });
  });

  it.each([
    [false, "development", "127.0.0.1:8080"],
    [true, "production", "127.0.0.1:8080"],
    [true, "development", ""],
    [true, "development", "firestore.example.invalid:8080"],
  ])(
    "fails closed when localDemoAuth=%s, NODE_ENV=%s, emulator=%s",
    async (localDemoAuth, nodeEnv, firestoreEmulatorHost) => {
      const scanner = resolvePublicationScanner("fake-clean-v1", {
        firestoreEmulatorHost,
        localDemoAuth,
        nodeEnv,
      });
      expect(scanner).toBeInstanceOf(UnavailablePublicationScanner);
      await expect(scanner.scanMalware(new Uint8Array(), metadata)).resolves.toEqual({
        code: "scanner_unavailable",
      });
    },
  );

  it("never substitutes a local provider for an unknown or real scanner key", () => {
    expect(
      resolvePublicationScanner("provider-not-configured", {
        firestoreEmulatorHost: "127.0.0.1:8080",
        localDemoAuth: true,
        nodeEnv: "development",
      }),
    ).toBeInstanceOf(UnavailablePublicationScanner);
  });

  it("cannot bypass the emulator fence by constructing the local scanner directly", () => {
    expect(
      () =>
        new LocalDemoPublicationScanner("fake-clean-v1", {
          firestoreEmulatorHost: undefined,
          localDemoAuth: true,
          nodeEnv: "development",
        }),
    ).toThrow("disabled");
  });
});

describe("managed scanner resolution under the production configuration", () => {
  const processScope = {
    resourceType: "process_definition",
    resourceId: "process-definition:owner-renewal-outreach",
    contentHash: "a".repeat(64),
    reviewedNoClientData: true,
  } as const;
  const fileScope = {
    resourceType: "file",
    resourceId: `source:${"b".repeat(64)}`,
    artifactKind: "renewal_extension",
    path: "sources/blank.pdf",
    fileName: "blank.pdf",
    contentHash: "b".repeat(64),
    byteSize: 1024,
    reviewedBlankOriginal: true,
    reviewedNoClientData: true,
  } as const;
  const policy = (scannerKey: string, resourceScope: unknown) =>
    ({ scannerKey, resourceScope }) as unknown as PublicationPolicyRecord;

  it("resolves each managed scanner only for its own key and matching reviewed scope", () => {
    expect(
      resolvePublicationScanner(MANAGED_PROCESS_SCANNER_KEY, {
        policy: policy(MANAGED_PROCESS_SCANNER_KEY, processScope),
      }),
    ).toBeInstanceOf(ManagedProcessPublicationScanner);
    expect(
      resolvePublicationScanner(MANAGED_RENEWAL_ORIGINAL_SCANNER_KEY, {
        policy: policy(MANAGED_RENEWAL_ORIGINAL_SCANNER_KEY, fileScope),
      }),
    ).toBeInstanceOf(ManagedRenewalOriginalScanner);
    for (const [key, record] of [
      [MANAGED_PROCESS_SCANNER_KEY, policy(MANAGED_PROCESS_SCANNER_KEY, fileScope)],
      [
        MANAGED_RENEWAL_ORIGINAL_SCANNER_KEY,
        policy(MANAGED_RENEWAL_ORIGINAL_SCANNER_KEY, processScope),
      ],
      [
        MANAGED_PROCESS_SCANNER_KEY,
        policy(MANAGED_RENEWAL_ORIGINAL_SCANNER_KEY, processScope),
      ],
      [
        MANAGED_PROCESS_SCANNER_KEY,
        policy(MANAGED_PROCESS_SCANNER_KEY, { ...processScope, contentHash: "short" }),
      ],
      [MANAGED_PROCESS_SCANNER_KEY, undefined],
    ] as const)
      expect(resolvePublicationScanner(key, { policy: record })).toBeInstanceOf(
        UnavailablePublicationScanner,
      );
  });

  it("fails closed outside the production project even with a matching policy", () => {
    vi.mocked(readServerConfig).mockReturnValueOnce({
      gcpProjectId: "pmi-kc-kb-test",
      localDemoAuth: false,
    } as never);
    expect(
      resolvePublicationScanner(MANAGED_PROCESS_SCANNER_KEY, {
        policy: policy(MANAGED_PROCESS_SCANNER_KEY, processScope),
      }),
    ).toBeInstanceOf(UnavailablePublicationScanner);
  });
});
