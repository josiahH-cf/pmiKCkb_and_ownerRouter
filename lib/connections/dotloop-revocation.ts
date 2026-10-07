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

type Readback = "rejected" | "accepted" | "unreachable";

/**
 * S96's exact confirmed disconnect owns this effect. Never used by a health probe or a canary.
 * The official Dotloop API revokes the access/refresh pair through `POST /oauth/token/revoke`.
 * The documented token query is confined to this server request; neither URL nor response body is
 * logged.
 *
 * Outcomes are concluded honestly and never need a database edit (AC-S106-4/7):
 * - `verified`: this attempt's revoke was acknowledged and the held token then read back rejected;
 * - `unverified`: the held token is dead or absent, but the application cannot prove that every
 *   provider token is. That is always the case after an uncertain refresh, which may have minted
 *   tokens the application never held. The caller still removes the application's own copies.
 * A revoke whose outcome is unknown is never sent again blindly: the next attempt first reads the
 * token back, and only a token the provider still accepts is revoked again. While neither outcome
 * is known, credentials are retained and no receipt is issued.
 */
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
  if (record.providerRevocationState === "unverified") return record;
  if (!vault.readSecret || !store.recordDotloopProviderRevocation) {
    throw new EditableLayerError(
      "Dotloop provider revocation storage is unavailable.",
      409,
    );
  }
  assertLiveProviderActionAllowed(input.descriptor ?? requireEnvironmentDescriptor());
  const now = input.now ?? (() => new Date().toISOString());
  const transport = input.transport ?? dotloopRuntimeTransport;
  const recordOutcome = store.recordDotloopProviderRevocation.bind(store);

  let token: string | null;
  try {
    const held = await vault.readSecret({ secretRef: record.secretRef });
    token = held.ok ? held.secret : null;
  } catch {
    throw new EditableLayerError(
      "Dotloop credential read is unavailable. Credentials are retained; retry the disconnect.",
      409,
    );
  }

  async function readBack(secret: string): Promise<Readback> {
    try {
      const response = await transport.fetch({
        method: "GET",
        url: `${DOTLOOP_API_BASE}account`,
        headers: { authorization: `Bearer ${secret}` },
      });
      if (response.status === 401) return "rejected";
      if (response.status >= 200 && response.status < 300) return "accepted";
      return "unreachable";
    } catch {
      return "unreachable";
    }
  }

  const conclude = (
    pending: ConnectorRevocationPendingRecord,
    state: "verified" | "unverified",
  ) =>
    recordOutcome({
      generationId: pending.generationId,
      operationId: pending.operationId,
      expectedRevision: pending.revision,
      state,
      observedAt: now(),
    });

  // Without a held token there is nothing to revoke or read back; the app still removes its copies.
  if (!token) {
    const pending =
      record.providerRevocationState === "attempting"
        ? record
        : await recordOutcome({
            generationId: record.generationId,
            operationId: record.operationId,
            expectedRevision: record.revision,
            state: "attempting",
            observedAt: now(),
          });
    return conclude(pending, "unverified");
  }

  if (record.providerRevocationState === "attempting") {
    // An earlier revoke's outcome is unknown: read back before anything is sent again.
    const prior = await readBack(token);
    if (prior === "unreachable")
      throw new EditableLayerError(
        "Dotloop provider revocation needs recovery. Credentials are retained and no disconnect receipt was issued.",
        409,
      );
    if (prior === "rejected") return conclude(record, "unverified");
    // `accepted`: the earlier revoke did not take effect, so revoking now is not a repeat.
  }

  const attempting =
    record.providerRevocationState === "attempting"
      ? record
      : await recordOutcome({
          generationId: record.generationId,
          operationId: record.operationId,
          expectedRevision: record.revision,
          state: "attempting",
          observedAt: now(),
        });
  let acknowledged = false;
  try {
    const revoked = await transport.fetch({
      method: "POST",
      url: `https://auth.dotloop.com/oauth/token/revoke?${new URLSearchParams({ token })}`,
      headers: {},
    });
    acknowledged = revoked.status >= 200 && revoked.status < 300;
  } catch {
    acknowledged = false;
  }
  const after = await readBack(token);
  if (after === "accepted")
    throw new EditableLayerError(
      "Dotloop still accepts this connection's token. Credentials are retained; retry the disconnect.",
      409,
    );
  if (after === "unreachable")
    throw new EditableLayerError(
      "Dotloop provider revocation needs recovery. Credentials are retained and no disconnect receipt was issued.",
      409,
    );
  return conclude(
    attempting,
    acknowledged && !attempting.refreshOutcomeUncertain ? "verified" : "unverified",
  );
}
