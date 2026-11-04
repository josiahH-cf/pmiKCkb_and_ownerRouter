import { createHash } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import { z } from "zod";
import { inspectProcessSensitivity } from "./process-sensitivity";
import {
  publicationPolicyAllowsResource,
  PublicationResourceScopeSchema,
} from "./resource-scope";
import {
  MANAGED_PROCESS_SCANNER_KEY,
  MANAGED_PUBLICATION_SCANNER_CONFIGURATION,
  type ManagedPublicationScannerConfiguration,
} from "./managed-scanner-config";
import type {
  PublicationMetadata,
  PublicationScanResult,
  PublicationScanner,
} from "./types";

export const MANAGED_PROCESS_SCAN_MAX_BYTES = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 4096;
export const MAX_SIGNATURE_AGE_MS = 24 * 60 * 60 * 1000;
export const evidenceSchema = z
  .object({
    protocol: z.literal("pmi-publication-scan/v1"),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    scannedBytes: z.number().int().positive().max(MANAGED_PROCESS_SCAN_MAX_BYTES),
    malware: z.enum(["clean", "malware_detected"]),
    engineVersion: z.string().min(1),
    dailyVersion: z.number().int().positive(),
    dailyTimestamp: z.string().datetime(),
  })
  .strict();

export interface ManagedScanRequest {
  method: "GET" | "POST";
  url: string;
  body?: Uint8Array;
  contentType?: "application/pdf";
}
export type ManagedScanTransport = (
  input: ManagedScanRequest,
) => Promise<{ status: number; body: unknown }>;

/** Existing runtime identity, an exact service audience and no redirect/retry or key file. */
export async function authenticatedRequest(input: ManagedScanRequest) {
  const audience = new URL(input.url).origin;
  const client = await new GoogleAuth().getIdTokenClient(audience);
  const authHeaders = await client.getRequestHeaders();
  const response = await fetch(input.url, {
    method: input.method,
    headers: {
      ...Object.fromEntries(authHeaders.entries()),
      "content-type": input.contentType ?? "application/json",
    },
    ...(input.body ? { body: new Uint8Array(input.body) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.body) throw new Error("Scanner response unavailable.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const read = await reader.read();
      if (read.done) break;
      size += read.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("Scanner response too large.");
      chunks.push(read.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return {
    status: response.status,
    body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
  };
}

/**
 * ClamAV supplies malware evidence; the existing credential guard supplies a bounded sensitivity
 * refusal. Credential-pattern absence is not general PII/DLP classification or legal approval.
 */
export class ManagedProcessPublicationScanner implements PublicationScanner {
  readonly key = MANAGED_PROCESS_SCANNER_KEY;
  private readonly configuration: Readonly<ManagedPublicationScannerConfiguration>;
  private readonly request: ManagedScanTransport;
  private readonly now: () => string;
  constructor(
    private readonly resourceScope: {
      resourceType: "process_definition";
      resourceId: string;
      contentHash: string;
      reviewedNoClientData: true;
    },
    deps: {
      request?: ManagedScanTransport;
      now?: () => string;
      configuration?: ManagedPublicationScannerConfiguration;
    } = {},
  ) {
    if (process.env.NODE_ENV !== "test" && Object.keys(deps).length)
      throw new Error("Publication scanner overrides are test-only.");
    this.configuration = deps.configuration ?? MANAGED_PUBLICATION_SCANNER_CONFIGURATION;
    this.request = deps.request ?? authenticatedRequest;
    this.now = deps.now ?? (() => new Date().toISOString());
  }
  private permitted(
    content: Uint8Array,
    metadata: Readonly<PublicationMetadata>,
  ): boolean {
    const config = this.configuration;
    const url = config.serviceUrl ? new URL(config.serviceUrl) : null;
    return (
      PublicationResourceScopeSchema.safeParse(this.resourceScope).success &&
      publicationPolicyAllowsResource({ resourceScope: this.resourceScope }, metadata) &&
      createHash("sha256").update(content).digest("hex") ===
        this.resourceScope.contentHash &&
      metadata.declaredMimeType === "application/json" &&
      content.byteLength > 0 &&
      content.byteLength <= MANAGED_PROCESS_SCAN_MAX_BYTES &&
      metadata.declaredByteSize === content.byteLength &&
      config.projectId === "pmi-kc-kb-prod" &&
      config.region === "us-central1" &&
      config.serviceName === "pmi-kc-publication-scanner" &&
      url !== null &&
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      /^pmi-kc-publication-scanner-(?:[a-z0-9]+-uc\.a|[0-9]+\.us-central1)\.run\.app$/.test(
        url.hostname,
      )
    );
  }
  async scanMalware(
    content: Uint8Array,
    metadata: Readonly<PublicationMetadata>,
  ): Promise<PublicationScanResult> {
    try {
      if (!this.permitted(content, metadata)) return { code: "scanner_unavailable" };
      const response = await this.request({
        method: "POST",
        url: `${this.configuration.serviceUrl}/v1/scan`,
        body: content,
      });
      if (response.status !== 200) return { code: "scanner_unavailable" };
      const evidence = evidenceSchema.parse(response.body);
      const signatureTime = Date.parse(evidence.dailyTimestamp),
        now = Date.parse(this.now());
      if (!Number.isFinite(now)) return { code: "scanner_unavailable" };
      // The engine answered; evidence that does not bind these exact bytes, the pinned engine and
      // a fresh daily database is a mismatch, distinct from an outage.
      if (
        evidence.contentHash !== createHash("sha256").update(content).digest("hex") ||
        evidence.scannedBytes !== content.byteLength ||
        evidence.engineVersion !== this.configuration.engineVersion ||
        signatureTime > now ||
        now - signatureTime > MAX_SIGNATURE_AGE_MS
      )
        return { code: "evidence_mismatch" };
      return { code: evidence.malware === "clean" ? "clean" : "malware_detected" };
    } catch {
      return { code: "scanner_unavailable" };
    }
  }
  async scanSensitivity(
    content: Uint8Array,
    metadata: Readonly<PublicationMetadata>,
  ): Promise<PublicationScanResult> {
    try {
      if (!this.permitted(content, metadata)) return { code: "scanner_unavailable" };
      return inspectProcessSensitivity(content);
    } catch {
      return { code: "scanner_unavailable" };
    }
  }
}
