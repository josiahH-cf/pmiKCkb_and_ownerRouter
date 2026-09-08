import type {
  ConnectorConnectionStore,
  ConnectorRevocationPendingRecord,
} from "@/lib/connections/connector-connection";
import type { ConnectorSecretVault } from "@/lib/connections/connector-secret-vault";
import { dotloopRuntimeTransport } from "@/lib/connections/dotloop-runtime";
import {
  assertLiveProviderActionAllowed,
  requireEnvironmentDescriptor,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  DOTLOOP_API_BASE,
  type DotloopHttpTransport,
} from "@/lib/integrations/dotloop/client";

/** S96's exact confirmed disconnect owns this effect. Never used by a health probe or a canary.
 * Official Dotloop API 1.2.4 revokes the access/refresh pair via this exact endpoint. The documented
 * token query is confined to this server request; neither URL nor response body is logged. */
export async function revokeDotloopConnection(input: {
  record: ConnectorRevocationPendingRecord;
  store: ConnectorConnectionStore;
  vault: ConnectorSecretVault;
  transport?: DotloopHttpTransport;
  descriptor?: EnvironmentDescriptor;
  now?: () => string;
}): Promise<ConnectorRevocationPendingRecord> {
  const { record, store, vault } = input;
  if (record.connectorId !== "dotloop" || record.method !== "oauth") return record;
  if (record.providerRevocationState === "verified" && record.providerRevokedAt)
    return record;
  if (record.refreshOutcomeUncertain || record.providerRevocationState === "attempting") {
    throw new EditableLayerError(
      "Dotloop's prior token operation has an unknown outcome. Provider-side revocation evidence is required before reconnecting; no token operation was repeated.",
      409,
    );
  }
  if (!vault.readSecret || !store.recordDotloopProviderRevocation) {
    throw new EditableLayerError(
      "Dotloop provider revocation storage is unavailable.",
      409,
    );
  }
  assertLiveProviderActionAllowed(input.descriptor ?? requireEnvironmentDescriptor());
  const token = await vault.readSecret({ secretRef: record.secretRef });
  if (!token.ok)
    throw new EditableLayerError("Dotloop credential read is unavailable.", 409);
  const now = input.now ?? (() => new Date().toISOString());
  const pending = await store.recordDotloopProviderRevocation({
    generationId: record.generationId,
    operationId: record.operationId,
    expectedRevision: record.revision,
    state: "attempting",
    observedAt: now(),
  });
  const transport = input.transport ?? dotloopRuntimeTransport;
  try {
    const revoked = await transport.fetch({
      method: "POST",
      url: `https://auth.dotloop.com/oauth/token/revoke?${new URLSearchParams({ token: token.secret })}`,
      headers: {},
    });
    if (revoked.status < 200 || revoked.status >= 300)
      throw new Error("revocation_not_acknowledged");
    const readback = await transport.fetch({
      method: "GET",
      url: `${DOTLOOP_API_BASE}account`,
      headers: { authorization: `Bearer ${token.secret}` },
    });
    if (readback.status !== 401) throw new Error("revocation_readback_unverified");
    return await store.recordDotloopProviderRevocation({
      generationId: pending.generationId,
      operationId: pending.operationId,
      expectedRevision: pending.revision,
      state: "verified",
      observedAt: now(),
    });
  } catch {
    throw new EditableLayerError(
      "Dotloop provider revocation needs recovery. Credentials are retained and no disconnect receipt was issued.",
      409,
    );
  }
}
