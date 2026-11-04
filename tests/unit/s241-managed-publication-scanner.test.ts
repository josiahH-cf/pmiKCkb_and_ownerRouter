import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ManagedProcessPublicationScanner } from "@/lib/publication/managed-scanner";
import type { PublicationMetadata } from "@/lib/publication/types";

const now = "2026-11-03T13:00:00.000Z";
const bytes = new TextEncoder().encode(
  JSON.stringify({
    id: "owner-renewal-outreach",
    description: "Review the current renewal terms.",
  }),
);
const scope = {
  resourceType: "process_definition",
  resourceId: "process-definition:owner-renewal-outreach",
  contentHash: createHash("sha256").update(bytes).digest("hex"),
  reviewedNoClientData: true,
} as const;
const metadata: PublicationMetadata = {
  resourceType: scope.resourceType,
  resourceId: scope.resourceId,
  connectorId: "app-process-definitions",
  rootId: "process-definitions",
  spaceId: "owner-renewal-outreach",
  fileName: "owner-renewal-outreach.json",
  path: "process-definitions/owner-renewal-outreach.json",
  sourceState: "Verified Source",
  citationLabel: "Isolated process guidance",
  declaredByteSize: bytes.length,
  declaredMimeType: "application/json",
};
function harness(overrides: Record<string, unknown> = {}, content = bytes) {
  const request = vi.fn(
    async (input: { method: "GET" | "POST"; url: string; body?: Uint8Array }) => {
      void input;
      return {
        status: 200,
        body: {
          protocol: "pmi-publication-scan/v1",
          contentHash: createHash("sha256").update(content).digest("hex"),
          scannedBytes: content.length,
          malware: "clean",
          engineVersion: "1.4.6",
          dailyVersion: 12345,
          dailyTimestamp: "2026-11-03T12:00:00.000Z",
          ...overrides,
        },
      };
    },
  );
  const scanner = new ManagedProcessPublicationScanner(
    { ...scope, contentHash: createHash("sha256").update(content).digest("hex") },
    {
      request,
      now: () => now,
      configuration: {
        projectId: "pmi-kc-kb-prod",
        region: "us-central1",
        serviceName: "pmi-kc-publication-scanner",
        serviceUrl: "https://pmi-kc-publication-scanner-isolated-uc.a.run.app",
        engineVersion: "1.4.6",
      },
    },
  );
  return { scanner, request };
}
describe("S241 managed real-engine protocol client", () => {
  it("accepts only exact-byte clean evidence from the pinned engine and fresh loaded signatures", async () => {
    const { scanner, request } = harness();
    expect(await scanner.scanMalware(bytes, metadata)).toEqual({ code: "clean" });
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      method: "POST",
      url: "https://pmi-kc-publication-scanner-isolated-uc.a.run.app/v1/scan",
      body: bytes,
    });
  });
  it("preserves malware detection and never treats provider unavailability as clean", async () => {
    expect(
      await harness({ malware: "malware_detected" }).scanner.scanMalware(bytes, metadata),
    ).toEqual({ code: "malware_detected" });
    const { scanner, request } = harness();
    request.mockRejectedValue(new Error("Isolated outage"));
    expect(await scanner.scanMalware(bytes, metadata)).toEqual({
      code: "scanner_unavailable",
    });
  });
  it.each([
    { contentHash: "0".repeat(64) },
    { scannedBytes: bytes.length + 1 },
    { dailyTimestamp: "2026-11-04T12:00:00.000Z" },
    { dailyTimestamp: "2026-11-01T12:00:00.000Z" },
    { engineVersion: "other" },
  ])(
    "reports well-formed evidence that does not bind the bytes, engine or a fresh database as a mismatch %j",
    async (overrides) => {
      expect(await harness(overrides).scanner.scanMalware(bytes, metadata)).toEqual({
        code: "evidence_mismatch",
      });
    },
  );
  it.each([{ dailyTimestamp: "invalid" }, { dailyVersion: 0 }, { malware: "unknown" }])(
    "refuses malformed evidence as unavailable %j",
    async (overrides) => {
      expect(await harness(overrides).scanner.scanMalware(bytes, metadata)).toEqual({
        code: "scanner_unavailable",
      });
    },
  );
  it.each(["file", "folder", "another-process"])(
    "never calls the provider for out-of-scope %s",
    async (kind) => {
      const { scanner, request } = harness();
      const changed =
        kind === "another-process"
          ? { ...metadata, resourceId: "process-definition:another" }
          : { ...metadata, resourceType: kind };
      expect(await scanner.scanMalware(bytes, changed as PublicationMetadata)).toEqual({
        code: "scanner_unavailable",
      });
      expect(request).not.toHaveBeenCalled();
    },
  );
  it("runs the existing credential detector over decoded JSON strings and discloses its bounded sensitivity meaning", async () => {
    const { scanner, request } = harness();
    expect(await scanner.scanSensitivity(bytes, metadata)).toEqual({
      code: "clean",
      sensitivity: "Low",
    });
    const sensitive = new TextEncoder().encode('{"note":"pass\\u0077ord supplied here"}');
    expect(
      await harness({}, sensitive).scanner.scanSensitivity(sensitive, {
        ...metadata,
        declaredByteSize: sensitive.length,
      }),
    ).toEqual({ code: "sensitivity_violation", sensitivity: "High" });
    expect(
      await scanner.scanSensitivity(new TextEncoder().encode("not-json"), metadata),
    ).toEqual({ code: "scanner_unavailable" });
    const sensitiveKey = new TextEncoder().encode('{"password":"opaque-value"}');
    expect(
      await harness({}, sensitiveKey).scanner.scanSensitivity(sensitiveKey, {
        ...metadata,
        declaredByteSize: sensitiveKey.length,
      }),
    ).toEqual({ code: "sensitivity_violation", sensitivity: "High" });
    expect(request).not.toHaveBeenCalled();
  });
  it("refuses changed bytes under the same reviewed process identity before any provider request", async () => {
    const { scanner, request } = harness();
    const changed = new TextEncoder().encode(
      '{"id":"owner-renewal-outreach","description":"Changed"}',
    );
    expect(
      await scanner.scanMalware(changed, {
        ...metadata,
        declaredByteSize: changed.length,
      }),
    ).toEqual({ code: "scanner_unavailable" });
    expect(
      await scanner.scanSensitivity(changed, {
        ...metadata,
        declaredByteSize: changed.length,
      }),
    ).toEqual({ code: "scanner_unavailable" });
    expect(request).not.toHaveBeenCalled();
  });
});
