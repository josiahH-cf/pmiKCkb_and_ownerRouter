// Server-only credential storage. Only an explicitly configured Dotloop vault is enabled.
import { SecretManagerConnectorSecretVault } from "@/lib/connections/secret-manager-connector-vault";

export type StoreSecretResult =
  | { ok: true; secretRef: string }
  | { ok: false; reason: "not_configured" };

export type DestroySecretResult =
  | { ok: true; outcome: "destroyed" | "already_absent" }
  | { ok: false; reason: "not_configured" };

export type ConnectorVaultCapability = "configured" | "not_configured";

export interface ConnectorSecretVault {
  capability(): Promise<ConnectorVaultCapability>;
  readSecret?(input: {
    secretRef: string;
  }): Promise<{ ok: true; secret: string } | { ok: false; reason: "not_configured" }>;
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

export function resolveConnectorSecretVault(
  connectorId?: string,
  env: Record<string, string | undefined> = process.env,
): ConnectorSecretVault {
  const projectId = env.CONNECTOR_SECRET_VAULT_PROJECT_ID?.trim();
  if (
    connectorId === "dotloop" &&
    projectId &&
    /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)
  ) {
    return new SecretManagerConnectorSecretVault({ projectId });
  }
  return new NotConfiguredConnectorSecretVault();
}
