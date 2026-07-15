import { describe, expect, it } from "vitest";
import { resolvePublicationScanner } from "@/lib/publication/provider";
import {
  LocalDemoPublicationScanner,
  UnavailablePublicationScanner,
} from "@/lib/publication/scanners";
import type { PublicationMetadata } from "@/lib/publication/types";

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
