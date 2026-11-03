import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { readBoundedPublicationBody } from "@/lib/publication/content";
import { resolvePublicationPolicyForSpace } from "@/lib/publication/policy";
import { resolvePublicationScanner } from "@/lib/publication/provider";
import {
  listActiveTrustedPublications,
  publishTrustedContent,
} from "@/lib/publication/service";
import type { PublicationResourceType } from "@/lib/publication/types";
import { assertSpaceIdAccess } from "@/lib/space-scope-resources";
import { SOURCE_STATES } from "@/lib/constants";
import { stablePublicationResourceId } from "@/lib/publication/resource-id";

interface RouteContext {
  params: Promise<{ spaceId: string }>;
}

/** Current exact original metadata only; recovery never uploads or republishes a file. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const actor = await requireCapability("read");
    const { spaceId } = await context.params;
    assertSpaceIdAccess(actor, spaceId);
    const versions = await listActiveTrustedPublications(actor, spaceId);
    return NextResponse.json(
      {
        originals: versions
          .filter((version) => version.renewalArtifactKind)
          .map((version) => ({
            id: version.id,
            fileName: version.fileName,
            contentHash: version.contentHash,
            byteSize: version.contentByteSize,
            artifactKind: version.renewalArtifactKind,
            policyId: version.policyId,
          })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const actor = await requireCapability("edit");
    const { spaceId } = await context.params;
    assertSpaceIdAccess(actor, spaceId);

    const fileName = requiredHeader(request, "x-publication-file-name");
    const path = requiredHeader(request, "x-publication-path");
    const declaredMimeType = requiredHeader(request, "x-publication-mime-type");
    const citationLabel = requiredHeader(request, "x-publication-citation-label");
    const sourceState = requiredHeader(request, "x-publication-source-state");
    if (!SOURCE_STATES.includes(sourceState as (typeof SOURCE_STATES)[number])) {
      throw new EditableLayerError("Publication source state is invalid.", 400);
    }
    const resourceType = readResourceType(
      request.headers.get("x-publication-resource-type"),
    );
    const byteSize = readByteSize(request);
    const policyId = request.headers.get("x-publication-policy-id")?.trim() || undefined;
    const policy = await resolvePublicationPolicyForSpace(
      actor,
      spaceId,
      policyId,
      undefined,
      {
        resourceType,
        path,
        fileName,
        spaceId,
      },
    );
    const resourceId = stablePublicationResourceId(
      policy.connectorId,
      policy.rootId,
      spaceId,
      path,
    );

    const version = await publishTrustedContent(
      actor,
      policy,
      {
        loadContent: (maxBytes) =>
          readBoundedPublicationBody(request.body, byteSize, maxBytes),
        metadata: {
          citationLabel,
          connectorId: policy.connectorId,
          declaredByteSize: byteSize,
          declaredMimeType,
          fileName,
          path,
          resourceId,
          resourceType,
          rootId: policy.rootId,
          sourceState: sourceState as (typeof SOURCE_STATES)[number],
          spaceId,
          ...(policy.resourceScope?.resourceType === "file"
            ? { renewalArtifactKind: policy.resourceScope.artifactKind }
            : {}),
        },
      },
      resolvePublicationScanner(policy.scannerKey, { policy }),
    );

    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function requiredHeader(request: Request, name: string) {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new EditableLayerError(`Missing required ${name} header.`, 400);
  if (value.length > 1000) throw new EditableLayerError(`Invalid ${name} header.`, 400);
  return value;
}

function readByteSize(request: Request) {
  const contentLength = request.headers.get("content-length");
  const publicationByteSize = request.headers.get("x-publication-byte-size");
  if (
    contentLength !== null &&
    publicationByteSize !== null &&
    contentLength.trim() !== publicationByteSize.trim()
  ) {
    throw new EditableLayerError("Publication byte-size headers do not match.", 400);
  }
  const raw = contentLength ?? publicationByteSize;
  const value = raw ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new EditableLayerError("A valid publication byte size is required.", 400);
  }
  return value;
}

function readResourceType(value: string | null): PublicationResourceType {
  if (!value || value === "file") return "file";
  if (value === "folder") return "folder";
  throw new EditableLayerError("Publication resource type is invalid.", 400);
}
