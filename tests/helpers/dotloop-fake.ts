// S106 test helper: a deterministic Dotloop provider fake plus an in-memory secret vault.
//
// It answers only the documented Public API v2 reads the app uses (`/account`, `/profile`,
// `/profile/{id}/loop-template`, `/subscription`) and the documented token endpoints. Every value is
// synthetic. The fake is the only way the connection lifecycle is exercised until the owner
// registers the OAuth application and connects an account.

import type {
  DotloopHttpResponse,
  DotloopHttpTransport,
} from "@/lib/integrations/dotloop/client";
import type {
  ConnectorSecretVault,
  DestroySecretResult,
  StoreSecretResult,
} from "@/lib/connections/connector-secret-vault";

export interface DotloopFakeOptions {
  /** Access tokens the provider currently accepts. */
  validAccessTokens?: string[];
  /** Refresh tokens the provider currently accepts; absent means refresh fails. */
  validRefreshTokens?: string[];
  profiles?: { id: string; name: string }[];
  templates?: Record<string, { id: string; name: string }[]>;
  subscriptionStatus?: number;
  /** Statuses returned before the normal answer, one per call, to model 401/429 sequences. */
  transientStatuses?: number[];
  grantedScopes?: string[];
}

export interface DotloopFake extends DotloopHttpTransport {
  readonly calls: { url: string; method: string }[];
  expireAccessTokens(): void;
  revokeRefreshTokens(): void;
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return {
    status,
    headers,
    json: async () => body,
  } satisfies DotloopHttpResponse;
}

/** A provider fake over the documented endpoints. It never returns a token to any caller but the exchanger. */
export function createDotloopFake(options: DotloopFakeOptions = {}): DotloopFake {
  const validAccess = new Set(options.validAccessTokens ?? ["access-1"]);
  const validRefresh = new Set(options.validRefreshTokens ?? ["refresh-1"]);
  const profiles = options.profiles ?? [{ id: "profile-1", name: "PMI KC Metro" }];
  const templates = options.templates ?? {
    "profile-1": [{ id: "template-1", name: "Renewal packet" }],
  };
  const transient = [...(options.transientStatuses ?? [])];
  const calls: { url: string; method: string }[] = [];
  let issued = 1;

  return {
    calls,
    expireAccessTokens() {
      validAccess.clear();
    },
    revokeRefreshTokens() {
      validRefresh.clear();
    },
    async fetch(input) {
      calls.push({ url: input.url, method: input.method });

      if (input.url.startsWith("https://auth.dotloop.com/oauth/token")) {
        const body = new URLSearchParams(input.body ?? "");
        const grant = body.get("grant_type");
        if (grant === "authorization_code") {
          if (body.get("code") !== "good-code") {
            return jsonResponse(400, { error: "invalid_grant" });
          }
          issued += 1;
          const access = `access-${issued}`;
          const refresh = `refresh-${issued}`;
          validAccess.add(access);
          validRefresh.add(refresh);
          return jsonResponse(200, {
            access_token: access,
            refresh_token: refresh,
            expires_in: 43_200,
            scope: (options.grantedScopes ?? DEFAULT_SCOPES).join(" "),
          });
        }
        if (grant === "refresh_token") {
          const supplied = body.get("refresh_token") ?? "";
          if (!validRefresh.has(supplied)) {
            return jsonResponse(400, { error: "invalid_grant" });
          }
          issued += 1;
          const access = `access-${issued}`;
          validAccess.add(access);
          return jsonResponse(200, { access_token: access, expires_in: 43_200 });
        }
        return jsonResponse(400, { error: "unsupported_grant_type" });
      }

      const transientStatus = transient.shift();
      if (transientStatus === 429) {
        return jsonResponse(429, { error: "rate_limited" }, { "retry-after": "0" });
      }
      if (transientStatus === 401) return jsonResponse(401, { error: "unauthorized" });

      const bearer = (input.headers.authorization ?? "").replace(/^Bearer /, "");
      if (!validAccess.has(bearer)) return jsonResponse(401, { error: "unauthorized" });

      if (input.url.endsWith("/account")) {
        return jsonResponse(200, { data: { id: 55, name: "PMI KC Metro" } });
      }
      if (input.url.includes("/loop-template")) {
        const profileId = /profile\/([^/]+)\/loop-template/.exec(input.url)?.[1] ?? "";
        return jsonResponse(200, { data: templates[profileId] ?? [] });
      }
      if (input.url.includes("/profile")) {
        return jsonResponse(200, { data: profiles });
      }
      if (input.url.includes("/subscription")) {
        const status = options.subscriptionStatus ?? 200;
        return jsonResponse(
          status,
          status === 200 ? { data: [] } : { error: "forbidden" },
        );
      }
      return jsonResponse(404, { error: "not_found" });
    },
  };
}

const DEFAULT_SCOPES = [
  "account:read",
  "profile:read",
  "loop:read",
  "loop:write",
  "template:read",
];

/** An in-memory vault so the lifecycle can be proved without Secret Manager. */
export function createMemoryVault(): ConnectorSecretVault & {
  readonly secrets: Map<string, string>;
} {
  const secrets = new Map<string, string>();
  let next = 0;
  return {
    secrets,
    async capability() {
      return "configured" as const;
    },
    async storeSecret(input: {
      connectorId: string;
      secret: string;
    }): Promise<StoreSecretResult> {
      next += 1;
      const secretRef = `vault://${input.connectorId}/${next}`;
      secrets.set(secretRef, input.secret);
      return { ok: true, secretRef };
    },
    async destroySecret(input: { secretRef: string }): Promise<DestroySecretResult> {
      const existed = secrets.delete(input.secretRef);
      return { ok: true, outcome: existed ? "destroyed" : "already_absent" };
    },
  };
}
