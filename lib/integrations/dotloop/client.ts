// S106: the typed Dotloop Public API v2 read client.
//
// It exposes only the exact documented reads the renewal lane needs — account, profiles, a profile's
// loop templates, and subscription readability. There is deliberately NO generic request function:
// a new Dotloop capability must be added here as its own named, typed method with its own review.
//
// Transport and token supply are injected, so this module performs no network call by itself and
// holds no credential. A token value is used only as the bearer header of one request; it is never
// logged, returned, embedded in a URL, or persisted here.
//
// Provider contract (official Dotloop Public API v2, read 2026-09-03):
//   base `https://api-gateway.dotloop.com/public/v2/`; `GET /account`; `GET /profile`;
//   `GET /profile/{profile_id}/loop-template`; `GET /subscription`; pagination `batch_size` (max
//   100) and `batch_number`; 100 requests per minute per user with `X-RateLimit-*` headers.

export const DOTLOOP_API_BASE = "https://api-gateway.dotloop.com/public/v2/";
export const DOTLOOP_MAX_BATCH_SIZE = 100;

/** The documented scopes this application requests. No scope is inferred or widened at runtime. */
export const DOTLOOP_SCOPES = [
  "account:read",
  "profile:read",
  "loop:read",
  "loop:write",
  "template:read",
] as const;

export type DotloopScope = (typeof DOTLOOP_SCOPES)[number];

export interface DotloopHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  json(): Promise<unknown>;
}

export interface DotloopHttpRequest {
  readonly url: string;
  readonly method: "GET" | "POST" | "PATCH";
  readonly headers: Record<string, string>;
  readonly body?: string;
}

export interface DotloopHttpTransport {
  fetch(request: DotloopHttpRequest): Promise<DotloopHttpResponse>;
}

/**
 * Supplies the current bearer token and performs one project-owned refresh. The client never sees a
 * refresh token: the provider owns that value inside its own vault-backed implementation.
 */
export interface DotloopAccessTokenProvider {
  accessToken(): Promise<string>;
  /** Returns the new access token, or null when refresh is impossible (revoked or unconfigured). */
  refresh(): Promise<string | null>;
}

export type DotloopClientErrorKind =
  | "refresh_needed"
  | "rate_limited"
  | "unavailable"
  | "not_found"
  | "malformed_response";

export class DotloopClientError extends Error {
  constructor(
    readonly kind: DotloopClientErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DotloopClientError";
  }
}

export interface DotloopAccount {
  readonly id: string;
  readonly name: string | null;
}

export interface DotloopProfile {
  readonly id: string;
  readonly name: string;
}

export interface DotloopLoopTemplate {
  readonly id: string;
  readonly name: string;
}

export interface DotloopBatchOptions {
  readonly batchSize?: number;
  readonly batchNumber?: number;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The documented envelope wraps results in `data`; a bare array is accepted for robustness. */
function readDataArray(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body))
    return body.filter((item): item is Record<string, unknown> =>
      Boolean(readRecord(item)),
    );
  const record = readRecord(body);
  const data = record?.data;
  if (!Array.isArray(data)) return [];
  return data.filter((item): item is Record<string, unknown> =>
    Boolean(readRecord(item)),
  );
}

function readIdentity(raw: Record<string, unknown>): { id: string; name: string } | null {
  const rawId = raw.id ?? raw.profileId ?? raw.templateId ?? raw.loopTemplateId;
  if (rawId === undefined || rawId === null) return null;
  const id = String(rawId).trim();
  if (id === "") return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  return { id, name };
}

function retryAfterMs(headers: Readonly<Record<string, string>>): number {
  const header = headers["retry-after"] ?? headers["Retry-After"];
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds, 60) * 1_000;
  return 1_000;
}

export interface DotloopClientDeps {
  readonly transport: DotloopHttpTransport;
  readonly tokens: DotloopAccessTokenProvider;
  readonly baseUrl?: string;
  /** Injected so a rate-limit backoff never blocks a test or a request thread by accident. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export class DotloopClient {
  readonly #transport: DotloopHttpTransport;
  readonly #tokens: DotloopAccessTokenProvider;
  readonly #baseUrl: string;
  readonly #sleep: (ms: number) => Promise<void>;

  constructor(deps: DotloopClientDeps) {
    this.#transport = deps.transport;
    this.#tokens = deps.tokens;
    this.#baseUrl = deps.baseUrl ?? DOTLOOP_API_BASE;
    this.#sleep = deps.sleep ?? (async () => undefined);
  }

  async getAccount(): Promise<DotloopAccount> {
    const body = await this.#get("account");
    const record = readRecord(readRecord(body)?.data ?? body);
    const rawId = record?.id;
    if (rawId === undefined || rawId === null) {
      throw new DotloopClientError(
        "malformed_response",
        "The account response had no id.",
      );
    }
    return {
      id: String(rawId),
      name: typeof record?.name === "string" ? record.name : null,
    };
  }

  async listProfiles(options: DotloopBatchOptions = {}): Promise<DotloopProfile[]> {
    const body = await this.#get("profile", options);
    return readDataArray(body).flatMap((raw) => {
      const identity = readIdentity(raw);
      return identity ? [identity] : [];
    });
  }

  async listLoopTemplates(
    profileId: string,
    options: DotloopBatchOptions = {},
  ): Promise<DotloopLoopTemplate[]> {
    const exact = profileId.trim();
    if (exact === "") {
      throw new DotloopClientError(
        "not_found",
        "A loop-template read needs the exact profile id.",
      );
    }
    const body = await this.#get(
      `profile/${encodeURIComponent(exact)}/loop-template`,
      options,
    );
    return readDataArray(body).flatMap((raw) => {
      const identity = readIdentity(raw);
      return identity ? [identity] : [];
    });
  }

  /**
   * Subscription readability only. The official documentation lists webhook subscriptions but no
   * e-signature send or signature-status operation, so this client offers neither.
   */
  async readSubscriptionsAvailable(): Promise<boolean> {
    try {
      await this.#get("subscription");
      return true;
    } catch (error) {
      if (error instanceof DotloopClientError && error.kind === "refresh_needed")
        throw error;
      return false;
    }
  }

  async #get(path: string, options: DotloopBatchOptions = {}): Promise<unknown> {
    const url = new URL(path, this.#baseUrl);
    if (options.batchSize !== undefined) {
      const bounded = Math.max(
        1,
        Math.min(Math.trunc(options.batchSize), DOTLOOP_MAX_BATCH_SIZE),
      );
      url.searchParams.set("batch_size", String(bounded));
    }
    if (options.batchNumber !== undefined) {
      url.searchParams.set(
        "batch_number",
        String(Math.max(1, Math.trunc(options.batchNumber))),
      );
    }

    let refreshed = false;
    let backedOff = false;
    let token = await this.#tokens.accessToken();

    for (;;) {
      const response = await this.#transport.fetch({
        url: url.toString(),
        method: "GET",
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      });

      if (response.status === 401) {
        if (refreshed) {
          throw new DotloopClientError(
            "refresh_needed",
            "Dotloop rejected the refreshed token; reconnect the account.",
            401,
          );
        }
        refreshed = true;
        const next = await this.#tokens.refresh();
        if (next === null) {
          throw new DotloopClientError(
            "refresh_needed",
            "The Dotloop token could not be refreshed; reconnect the account.",
            401,
          );
        }
        token = next;
        continue;
      }

      if (response.status === 429) {
        if (backedOff) {
          throw new DotloopClientError(
            "rate_limited",
            "Dotloop is rate limiting this account; retry later.",
            429,
          );
        }
        backedOff = true;
        await this.#sleep(retryAfterMs(response.headers));
        continue;
      }

      if (response.status === 404) {
        throw new DotloopClientError("not_found", "Dotloop has no such resource.", 404);
      }
      if (response.status < 200 || response.status >= 300) {
        throw new DotloopClientError(
          "unavailable",
          "Dotloop did not answer this read.",
          response.status,
        );
      }
      return response.json();
    }
  }
}
