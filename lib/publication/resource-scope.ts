import { z } from "zod";
import type { PublicationPolicyRecord, PublicationResourceType } from "./types";
import { LEASE_ARTIFACT_KINDS } from "@/lib/lease-documents/packet-types";

/** Optional narrowing of the existing trust policy; legacy policies retain their old scope. */
export const ProcessPublicationResourceScopeSchema = z
  .object({
    resourceType: z.literal("process_definition"),
    resourceId: z.string().regex(/^process-definition:[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    reviewedNoClientData: z.literal(true),
  })
  .strict();

export const RenewalOriginalPublicationScopeSchema = z
  .object({
    resourceType: z.literal("file"),
    resourceId: z.string().regex(/^source:[a-f0-9]{64}$/),
    artifactKind: z.enum(LEASE_ARTIFACT_KINDS),
    path: z
      .string()
      .max(1000)
      .regex(/^sources\/[^/\\\u0000-\u001f]+\.pdf$/i),
    fileName: z
      .string()
      .max(255)
      .regex(/^[^/\\\u0000-\u001f]+\.pdf$/i),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    byteSize: z
      .number()
      .int()
      .positive()
      .max(2 * 1024 * 1024),
    reviewedBlankOriginal: z.literal(true),
    reviewedNoClientData: z.literal(true),
  })
  .strict()
  .refine((value) => value.path === `sources/${value.fileName}`, {
    message: "Review the exact original filename at its canonical sources path.",
  });

export const PublicationResourceScopeSchema = z.union([
  ProcessPublicationResourceScopeSchema,
  RenewalOriginalPublicationScopeSchema,
]);

export interface PublicationResourceRequest {
  resourceType: PublicationResourceType;
  resourceId?: string;
  path?: string;
  fileName?: string;
  spaceId?: string;
}

export function publicationPolicyAllowsResource(
  policy: Pick<PublicationPolicyRecord, "resourceScope">,
  resource?: PublicationResourceRequest,
): boolean {
  if (policy.resourceScope === undefined) return true;
  const scope = PublicationResourceScopeSchema.safeParse(policy.resourceScope);
  if (!scope.success || !resource || scope.data.resourceType !== resource.resourceType)
    return false;
  if (scope.data.resourceType === "process_definition")
    return scope.data.resourceId === resource.resourceId;
  return (
    resource.spaceId === "lease-renewals" &&
    resource.path === scope.data.path &&
    resource.fileName === scope.data.fileName &&
    (resource.resourceId === undefined || resource.resourceId === scope.data.resourceId)
  );
}

/** A source review applies only to these exact bytes, never to a later edit. */
export function publicationPolicyAllowsContent(
  policy: Pick<PublicationPolicyRecord, "resourceScope">,
  contentHash: string,
): boolean {
  if (policy.resourceScope === undefined) return true;
  const scope = PublicationResourceScopeSchema.safeParse(policy.resourceScope);
  return scope.success && scope.data.contentHash === contentHash;
}
