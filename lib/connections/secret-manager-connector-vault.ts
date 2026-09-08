import { randomUUID } from "node:crypto";
import { GoogleAuth } from "google-auth-library";

import type {
  ConnectorSecretVault,
  DestroySecretResult,
  StoreSecretResult,
} from "@/lib/connections/connector-secret-vault";
import {
  assertLiveProviderActionAllowed,
  requireEnvironmentDescriptor,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";

type VaultRequest = (input: {
  method: "GET" | "POST";
  url: string;
  data?: unknown;
}) => Promise<{ status: number; data: Record<string, unknown> }>;

/** Server-only, Dotloop-only vault. It cannot access caller-selected projects or unrelated secrets. */
export class SecretManagerConnectorSecretVault implements ConnectorSecretVault {
  private readonly request: VaultRequest;
  constructor(
    private readonly deps: {
      projectId: string;
      request?: VaultRequest;
      descriptor?: EnvironmentDescriptor;
    },
  ) {
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(deps.projectId))
      throw new Error("Credential project is invalid.");
    this.request =
      deps.request ??
      (async (input) => {
        try {
          const client = await new GoogleAuth({
            scopes: ["https://www.googleapis.com/auth/cloud-platform"],
          }).getClient();
          const response = await client.request<Record<string, unknown>>({
            ...input,
            timeout: 10_000,
            retry: false,
            validateStatus: () => true,
          });
          return { status: response.status, data: response.data };
        } catch {
          throw new Error("Secure credential storage is unavailable.");
        }
      });
  }

  async capability() {
    return "configured" as const;
  }

  private assertRef(secretRef: string) {
    const prefix = `projects/${this.deps.projectId}/secrets/pmi-kc-dotloop-`;
    if (
      !secretRef.startsWith(prefix) ||
      !/^[0-9a-f-]{36}\/versions\/[1-9][0-9]*$/.test(secretRef.slice(prefix.length))
    ) {
      throw new Error("Credential reference is invalid.");
    }
  }

  private assertMutation() {
    assertLiveProviderActionAllowed(
      this.deps.descriptor ?? requireEnvironmentDescriptor(),
    );
  }

  async readSecret({ secretRef }: { secretRef: string }) {
    this.assertRef(secretRef);
    const response = await this.request({
      method: "GET",
      url: `https://secretmanager.googleapis.com/v1/${secretRef}:access`,
    });
    const payload = response.data.payload as { data?: unknown } | undefined;
    if (response.status !== 200 || typeof payload?.data !== "string")
      throw new Error("Secure credential read is unavailable.");
    const secret = Buffer.from(payload.data, "base64").toString("utf8");
    if (!secret) throw new Error("Secure credential read is unavailable.");
    return { ok: true as const, secret };
  }

  async storeSecret({
    connectorId,
    secret,
  }: {
    connectorId: string;
    secret: string;
  }): Promise<StoreSecretResult> {
    if (connectorId !== "dotloop") return { ok: false, reason: "not_configured" };
    this.assertMutation();
    if (!secret || Buffer.byteLength(secret) > 64 * 1024)
      throw new Error("Credential content is invalid.");
    const secretId = `pmi-kc-dotloop-${randomUUID()}`;
    const name = `projects/${this.deps.projectId}/secrets/${secretId}`;
    const created = await this.request({
      method: "POST",
      url: `https://secretmanager.googleapis.com/v1/projects/${this.deps.projectId}/secrets?secretId=${secretId}`,
      data: {
        replication: { automatic: {} },
        labels: { application: "pmi-kc", connector: "dotloop" },
      },
    });
    if (
      created.status !== 200 ||
      typeof created.data.name !== "string" ||
      !new RegExp(`^projects/[a-z0-9-]+/secrets/${secretId}$`).test(created.data.name)
    )
      throw new Error("Secure credential creation is unavailable.");
    const added = await this.request({
      method: "POST",
      url: `https://secretmanager.googleapis.com/v1/${name}:addVersion`,
      data: { payload: { data: Buffer.from(secret).toString("base64") } },
    });
    if (added.status !== 200 || typeof added.data.name !== "string")
      throw new Error("Secure credential storage is unavailable.");
    // Google may return the numeric project name even when the request used its project id.
    // Retain the configured project alias and only the exact returned version of this new secret.
    const returnedName = created.data.name;
    if (!added.data.name.startsWith(`${returnedName}/versions/`))
      throw new Error("Credential reference is invalid.");
    const secretRef = `${name}/versions/${added.data.name.slice(`${returnedName}/versions/`.length)}`;
    this.assertRef(secretRef);
    try {
      if ((await this.readSecret({ secretRef })).secret !== secret)
        throw new Error("readback_mismatch");
    } catch {
      try {
        await this.destroySecret({ secretRef, operationId: randomUUID() });
      } catch {
        // No connection is declared ready. The provider-owned secret remains a named operator
        // recovery target; never claim cleanup when storage permissions/readback refused it.
        throw new Error(
          "Secure credential readback failed; credential removal needs recovery.",
        );
      }
      throw new Error(
        "Secure credential readback did not match; the new version was destroyed.",
      );
    }
    return { ok: true, secretRef };
  }

  async destroySecret({
    secretRef,
  }: {
    secretRef: string;
    operationId: string;
  }): Promise<DestroySecretResult> {
    this.assertRef(secretRef);
    this.assertMutation();
    const url = `https://secretmanager.googleapis.com/v1/${secretRef}`;
    const before = await this.request({ method: "GET", url });
    if (
      before.status === 404 ||
      (before.status === 200 && before.data.state === "DESTROYED")
    )
      return { ok: true, outcome: "already_absent" };
    if (before.status !== 200)
      throw new Error("Secure credential removal is unavailable.");
    const destroyed = await this.request({
      method: "POST",
      url: `${url}:destroy`,
      data: {},
    });
    if (destroyed.status !== 200)
      throw new Error("Secure credential removal needs recovery.");
    const after = await this.request({ method: "GET", url });
    if (after.status !== 200 || after.data.state !== "DESTROYED")
      throw new Error("Secure credential removal readback needs recovery.");
    return { ok: true, outcome: "destroyed" };
  }
}
