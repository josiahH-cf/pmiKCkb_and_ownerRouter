import { createHash } from "node:crypto";
import { parseSafePdf } from "@/lib/lease-documents/acroform-pdf";
import { PdfRefusalError } from "@/lib/lease-documents/pdf-refusal";
import { readPublicationPdfText } from "@/lib/lease-documents/static-pdf";
import {
  authenticatedRequest,
  evidenceSchema,
  MAX_SIGNATURE_AGE_MS,
  type ManagedScanTransport,
} from "./managed-scanner";
import {
  MANAGED_PUBLICATION_SCANNER_CONFIGURATION,
  MANAGED_RENEWAL_ORIGINAL_SCANNER_KEY,
  type ManagedPublicationScannerConfiguration,
} from "./managed-scanner-config";
import { inspectProcessSensitivity } from "./process-sensitivity";
import {
  publicationPolicyAllowsResource,
  RenewalOriginalPublicationScopeSchema,
} from "./resource-scope";
import type {
  PublicationMetadata,
  PublicationScanner,
  PublicationScanResult,
  RenewalOriginalPublicationScope,
} from "./types";

/** Exact reviewed blank originals only; text tripwires are not general DLP or legal approval. */
export class ManagedRenewalOriginalScanner implements PublicationScanner {
  readonly key = MANAGED_RENEWAL_ORIGINAL_SCANNER_KEY;
  private readonly configuration: Readonly<ManagedPublicationScannerConfiguration>;
  private readonly request: ManagedScanTransport;
  private readonly now: () => string;
  constructor(
    private readonly scope: RenewalOriginalPublicationScope,
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
  private permitted(content: Uint8Array, metadata: Readonly<PublicationMetadata>) {
    const config = this.configuration;
    const url = config.serviceUrl ? new URL(config.serviceUrl) : null;
    return (
      RenewalOriginalPublicationScopeSchema.safeParse(this.scope).success &&
      publicationPolicyAllowsResource({ resourceScope: this.scope }, metadata) &&
      metadata.renewalArtifactKind === this.scope.artifactKind &&
      metadata.declaredMimeType === "application/pdf" &&
      metadata.declaredByteSize === this.scope.byteSize &&
      content.byteLength === this.scope.byteSize &&
      createHash("sha256").update(content).digest("hex") === this.scope.contentHash &&
      config.projectId === "pmi-kc-kb-prod" &&
      config.region === "us-central1" &&
      config.serviceName === "pmi-kc-publication-scanner" &&
      url !== null &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
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
      try {
        await parseSafePdf(content, true);
      } catch (error) {
        return { code: contentRefusalCode(error) ?? "scanner_unavailable" };
      }
      const response = await this.request({
        method: "POST",
        url: `${this.configuration.serviceUrl}/v1/scan-renewal-original`,
        body: content,
        contentType: "application/pdf",
      });
      if (response.status !== 200) return { code: "scanner_unavailable" };
      const evidence = evidenceSchema.parse(response.body);
      const time = Date.parse(evidence.dailyTimestamp),
        now = Date.parse(this.now());
      if (!Number.isFinite(now)) return { code: "scanner_unavailable" };
      // The engine answered; evidence that does not bind these exact bytes, the pinned engine and
      // a fresh daily database is a mismatch, distinct from an outage.
      if (
        evidence.contentHash !== this.scope.contentHash ||
        evidence.scannedBytes !== content.byteLength ||
        evidence.engineVersion !== this.configuration.engineVersion ||
        time > now ||
        now - time > MAX_SIGNATURE_AGE_MS
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
      let text: string;
      try {
        text = await readPublicationPdfText(content);
      } catch (error) {
        return { code: contentRefusalCode(error) ?? "scanner_unavailable" };
      }
      return inspectProcessSensitivity(Buffer.from(JSON.stringify({ text }), "utf8"));
    } catch {
      return { code: "scanner_unavailable" };
    }
  }
}

/** A reader refusal is a property of the content, reported distinctly from a scanner outage. */
function contentRefusalCode(error: unknown): PublicationScanResult["code"] | null {
  if (!(error instanceof PdfRefusalError)) return null;
  return error.kind === "unsupported" ? "content_unsupported" : "content_undecodable";
}
