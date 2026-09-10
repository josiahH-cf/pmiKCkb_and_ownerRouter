import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import { z } from "zod";
import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getCurrentPacketSnapshot } from "@/lib/firestore/lease-document-packet-snapshots";
import { resolveLivePacketInput } from "@/lib/lease-documents/live-input";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { resolveApprovedDotloopArtifact } from "@/lib/lease-documents/approved-artifact-content";
const Query = z
  .object({
    leaseId: z.string().regex(/^[1-9]\d*$/),
    documentRef: z.string().trim().min(1).max(500),
  })
  .strict();
/** Download the exact current S21 artifact for human inspection; no Dotloop client or write is constructed. */
export async function GET(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    const input = Query.parse(Object.fromEntries(new URL(request.url).searchParams));
    const [resolved, snapshot] = await Promise.all([
      resolveLivePacketInput(
        actor,
        input.leaseId,
        input.leaseId,
        new Date().toISOString(),
      ),
      getCurrentPacketSnapshot(actor, input.leaseId, input.leaseId),
    ]);
    if (
      !snapshot ||
      evaluateRenewalPacket(resolved.input).payloadHash !== snapshot.payloadHash
    )
      throw new EditableLayerError(
        "Evaluate the current packet before opening its approved files.",
        409,
      );
    const matches = resolved.input.catalog.artifacts.filter(
      (a) =>
        a.providerBindings?.dotloopDocumentRef === input.documentRef &&
        snapshot.manifest?.includedArtifacts.some((i) => i.artifactId === a.artifactId),
    );
    if (matches.length !== 1)
      throw new EditableLayerError(
        "The requested file is outside this current approved packet.",
        409,
      );
    const artifact = await resolveApprovedDotloopArtifact(actor, {
      catalog: resolved.input.catalog,
      documentRef: input.documentRef,
      expectedContentHash: matches[0].contentHash,
    });
    return new Response(new Uint8Array(artifact.content), {
      headers: {
        "Content-Type": artifact.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
