import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { can } from "@/lib/auth/roles";
import { requireCapability } from "@/lib/auth/session";
import {
  allowsAppManagedConnection,
  CONNECTORS,
} from "@/lib/connections/connector-catalog";
import { CANONICAL_UUID } from "@/lib/connections/connector-connection";
import { resolveConnectorSecretVault } from "@/lib/connections/connector-secret-vault";
import { getConnectorConnectionStore } from "@/lib/firestore/connector-connections";
import { EditableLayerError } from "@/lib/firestore/errors";

interface RouteContext {
  params: Promise<{ connectorId: string }>;
}

const DisconnectInputSchema = z.strictObject({
  mode: z.enum(["start", "adopt_legacy", "recover"]),
  operationId: z.string().regex(CANONICAL_UUID),
  connectorId: z.string().min(1).max(96),
  observedVersion: z.string().min(1).max(160),
  confirmationPhrase: z.string().max(200),
});

// S96 exact-target lifecycle: request validation and vault capability precede the durable claim;
// only a verified vault outcome can become a revoked tombstone and immutable redacted receipt.
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    if (!can(user.role, "manageAdmin")) {
      throw new EditableLayerError("Only an Admin can disconnect a system.", 403);
    }

    const { connectorId } = await context.params;
    const input = await parseJsonBody(request, DisconnectInputSchema);
    const def = CONNECTORS.find((connector) => connector.id === connectorId);
    if (!def) {
      throw new EditableLayerError("That connector is not available.", 404);
    }
    if (!allowsAppManagedConnection(def)) {
      throw new EditableLayerError(
        "This connector is read and verified here, but its server setup is not managed by this API.",
        400,
      );
    }
    if (input.connectorId !== connectorId) {
      throw new EditableLayerError("Connector identity does not match the route.", 400);
    }
    if (input.confirmationPhrase !== `Disconnect ${def.name}`) {
      throw new EditableLayerError(
        "The disconnect confirmation phrase is not exact.",
        400,
      );
    }

    const store = getConnectorConnectionStore();
    const completed = await store.getRevocationReceipt(connectorId, input.operationId);
    if (completed) {
      return NextResponse.json(publicReceipt(completed));
    }

    const vault = resolveConnectorSecretVault();
    if ((await vault.capability()) !== "configured") {
      throw new EditableLayerError(
        "Secure credential removal is not configured. Nothing was changed.",
        409,
      );
    }

    const claimed = await store.claimRevocation({
      connectorId,
      mode: input.mode,
      operationId: input.operationId,
      observedVersion: input.observedVersion,
      requestedByUid: user.uid,
      requestedAt: new Date().toISOString(),
    });
    if (claimed.state === "completed") {
      return NextResponse.json(publicReceipt(claimed.receipt));
    }

    const destroyed = await vault.destroySecret({
      secretRef: claimed.record.secretRef,
      operationId: claimed.record.operationId,
    });
    if (!destroyed.ok) {
      throw new EditableLayerError(
        "Secure credential removal is not configured. Disconnect needs recovery.",
        409,
      );
    }

    const receipt = await store.completeRevocation({
      connectorId,
      operationId: claimed.record.operationId,
      generationId: claimed.record.generationId,
      expectedRevision: claimed.record.revision,
      completedAt: new Date().toISOString(),
      destroyOutcome: destroyed.outcome,
    });
    const readback = await store.readRevocationResult(connectorId, input.operationId);
    if (
      !readback ||
      readback.receipt.operationId !== receipt.operationId ||
      readback.receipt.generationId !== receipt.generationId ||
      readback.receipt.revision !== receipt.revision ||
      readback.receipt.completedAt !== receipt.completedAt ||
      readback.receipt.destroyOutcome !== receipt.destroyOutcome
    ) {
      throw new EditableLayerError(
        "Credential removal completed, but its application receipt needs recovery.",
        409,
      );
    }
    return NextResponse.json(publicReceipt(readback.receipt));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function publicReceipt(receipt: {
  connectorId: string;
  operationId: string;
  completedAt: string;
}) {
  return {
    connectorId: receipt.connectorId,
    disconnected: true as const,
    operationId: receipt.operationId,
    completedAt: receipt.completedAt,
  };
}
