// Secret storage seam for connector credentials. Today there is NO secure vault wired: Secret Manager
// is not a dependency yet and no client credentials exist. `resolveConnectorSecretVault` returns the
// NotConfigured implementation, which stores nothing and honestly reports "not_configured", so the
// connect flow can never claim a connection it cannot actually hold. When a real Secret Manager backed
// vault is added, plug it in behind `resolveConnectorSecretVault` and the rest of the flow lights up
// unchanged. A returned `secretRef` is an OPAQUE handle, never the secret value.

export type StoreSecretResult =
  | { ok: true; secretRef: string }
  | { ok: false; reason: "not_configured" };

export type DestroySecretResult =
  | { ok: true; outcome: "destroyed" | "already_absent" }
  | { ok: false; reason: "not_configured" };

export type ConnectorVaultCapability = "configured" | "not_configured";

export interface ConnectorSecretVault {
  capability(): Promise<ConnectorVaultCapability>;
  storeSecret(input: { connectorId: string; secret: string }): Promise<StoreSecretResult>;
  destroySecret(input: {
    secretRef: string;
    operationId: string;
  }): Promise<DestroySecretResult>;
}

// Honest default: no secure storage is configured. The interface's secret argument is deliberately
// not even accepted here: with no vault wired there is nowhere safe to put it, so it is never read,
// logged, echoed, or persisted. It immediately reports that storage is not configured so no connection
// record is ever created.
export class NotConfiguredConnectorSecretVault implements ConnectorSecretVault {
  async capability(): Promise<ConnectorVaultCapability> {
    return "not_configured";
  }

  async storeSecret(): Promise<StoreSecretResult> {
    return { ok: false, reason: "not_configured" };
  }

  async destroySecret(): Promise<DestroySecretResult> {
    // Refuse rather than pretending an unconfigured boundary proved destruction.
    return { ok: false, reason: "not_configured" };
  }
}

export function resolveConnectorSecretVault(): ConnectorSecretVault {
  // Seam: a Secret Manager backed vault plugs in here once secure storage is provisioned. Secret
  // Manager is intentionally NOT a dependency of this module yet.
  return new NotConfiguredConnectorSecretVault();
}
