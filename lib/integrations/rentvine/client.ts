// Minimal READ-ONLY Rentvine API client (lease reads only). Phase-1 live read.
//
// Rentvine is the read-authoritative system of record. This client performs ONLY read-only GETs
// (lease list / single lease) — it has no write path of any kind. Auth is HTTP Basic over the
// account's own tenant host (https://{account}.rentvine.com/api/manager); the base64 token is built
// lazily and is NEVER logged, returned from a method, or included in any thrown error message.
//
// Testability: all network access goes through an injected `RentVineHttpTransport`. Unit tests inject
// a fake; `createFetchTransport()` is the live default and is never imported by unit tests. The
// module makes no network call on import.

/** Value-bearing config. Loaded from env (RENTVINE_API_BASE_URL / KEY / SECRET); never committed. */
export interface RentVineClientConfig {
  /** e.g. https://pmikcmetro.rentvine.com/api/manager */
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
}

export interface RentVineHttpRequest {
  method: "GET";
  url: string;
  headers: Record<string, string>;
}

export interface RentVineHttpResponse {
  status: number;
  /** Lowercased header names → values. */
  headers: Record<string, string>;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export interface RentVineHttpTransport {
  send(request: RentVineHttpRequest): Promise<RentVineHttpResponse>;
}

/** A raw lease record as returned by Rentvine. Field names confirm on the first live call. */
export type RawLease = Record<string, unknown>;

export class RentVineError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RentVineError";
    this.status = status;
  }
}

/** 401/403 — the credentials or the HTTP Basic auth hypothesis is wrong. Carries no secret. */
export class RentVineAuthError extends RentVineError {
  constructor(status: number) {
    super(
      `Rentvine rejected the request (HTTP ${status}). The credentials or the HTTP Basic auth scheme may be wrong. No secret is included in this message.`,
      status,
    );
    this.name = "RentVineAuthError";
  }
}

/** 429 — rate limited. Exposes the parsed Retry-After (seconds) when present. */
export class RentVineRateLimitError extends RentVineError {
  readonly retryAfterSeconds: number | null;
  constructor(status: number, retryAfterSeconds: number | null) {
    super(`Rentvine rate limit hit (HTTP ${status}).`, status);
    this.name = "RentVineRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const RENTVINE_HOST_RE = /^[a-z0-9-]+\.rentvine\.com$/i;

function toBase64(input: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "utf8").toString("base64");
  }
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function parseBaseUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("RENTVINE_API_BASE_URL is not a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Rentvine base URL must use https.");
  }
  if (!RENTVINE_HOST_RE.test(url.host)) {
    throw new Error(`Refusing a non-Rentvine base URL host: ${url.host}.`);
  }
  return url;
}

/** The tenant account code embedded in the base-URL host (e.g. "pmikcmetro"). */
export function rentVineAccountCode(baseUrl: string): string {
  return parseBaseUrl(baseUrl).host.split(".")[0].toLowerCase();
}

/** Identity guard: refuse a base URL whose account is not the expected tenant. */
export function assertRentVineAccount(baseUrl: string, expectedAccount: string): void {
  const account = rentVineAccountCode(baseUrl);
  if (account !== expectedAccount.toLowerCase()) {
    throw new Error(
      `Rentvine identity guard: base URL account "${account}" is not the expected "${expectedAccount}".`,
    );
  }
}

function parseRetryAfter(headers: Record<string, string>): number | null {
  const raw = headers["retry-after"];
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds : null;
}

function unwrapLease(item: unknown): RawLease {
  if (item && typeof item === "object") {
    const obj = item as Record<string, unknown>;
    if (obj.lease && typeof obj.lease === "object") return obj.lease as RawLease;
    return obj as RawLease;
  }
  throw new RentVineError("Unexpected Rentvine lease response shape.", 0);
}

/** Normalize the list response to RawLease[] across the shapes Rentvine may return. */
export function unwrapLeases(body: unknown): RawLease[] {
  if (Array.isArray(body)) return body.map(unwrapLease);
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (Array.isArray(obj.leases)) return (obj.leases as unknown[]).map(unwrapLease);
    if (obj.lease && typeof obj.lease === "object") return [obj.lease as RawLease];
  }
  throw new RentVineError("Unexpected Rentvine lease-list response shape.", 0);
}

/** Buffer one read so json() and text() can both be called without double-consuming the body. */
export function createFetchTransport(
  options: { timeoutMs?: number } = {},
): RentVineHttpTransport {
  const timeoutMs = options.timeoutMs ?? 30_000;
  return {
    async send(request) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          signal: controller.signal,
        });
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });
        const bodyText = await response.text();
        return {
          status: response.status,
          headers,
          text: async () => bodyText,
          json: async () => JSON.parse(bodyText) as unknown,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export interface RentVineProbeResult {
  status: number;
  headers: Record<string, string>;
  count: number | null;
  error?: string;
}

export class RentVineClient {
  private readonly base: URL;
  private readonly authHeader: string;
  private readonly transport: RentVineHttpTransport;

  constructor(config: RentVineClientConfig, transport: RentVineHttpTransport) {
    if (!config.apiKey || !config.apiSecret) {
      throw new Error("Rentvine client requires a non-empty apiKey and apiSecret.");
    }
    this.base = parseBaseUrl(config.baseUrl);
    this.authHeader = `Basic ${toBase64(`${config.apiKey}:${config.apiSecret}`)}`;
    this.transport = transport;
  }

  /** Non-secret identity summary (host + account); never exposes the token. */
  identitySummary(): { host: string; account: string } {
    return { host: this.base.host, account: this.base.host.split(".")[0] };
  }

  private buildUrl(path: string, params?: Record<string, string | number>): string {
    const base = this.base.toString().replace(/\/$/, "");
    const url = new URL(`${base}/${path.replace(/^\//, "")}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async rawGet(
    path: string,
    params?: Record<string, string | number>,
  ): Promise<RentVineHttpResponse> {
    return this.transport.send({
      method: "GET",
      url: this.buildUrl(path, params),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: this.authHeader,
      },
    });
  }

  private ensureOk(response: RentVineHttpResponse, path: string): void {
    if (response.status >= 200 && response.status < 300) return;
    if (response.status === 401 || response.status === 403) {
      throw new RentVineAuthError(response.status);
    }
    if (response.status === 429) {
      throw new RentVineRateLimitError(
        response.status,
        parseRetryAfter(response.headers),
      );
    }
    throw new RentVineError(
      `Rentvine GET /${path} failed (HTTP ${response.status}).`,
      response.status,
    );
  }

  /** List leases (read-only). Throws RentVineAuthError/RentVineRateLimitError on 401/429. */
  async listLeases(params?: Record<string, string | number>): Promise<RawLease[]> {
    const response = await this.rawGet("leases", params);
    this.ensureOk(response, "leases");
    return unwrapLeases(await response.json());
  }

  /** Read a single lease by id (read-only). */
  async getLease(leaseId: string | number): Promise<RawLease> {
    const path = `leases/${encodeURIComponent(String(leaseId))}`;
    const response = await this.rawGet(path);
    this.ensureOk(response, path);
    return unwrapLease(await response.json());
  }

  /**
   * Read the lease EXPORT (read-only). Each row joins the lease with its appends
   * ({ lease (incl. tenants[]), property, unit, balances, portfolio }). Returned raw — NOT unwrapped
   * to the lease — because the rent (unit.rent) and tenant names (lease.tenants[].name) live on the
   * appends, not on the bare lease record.
   */
  async listLeasesExport(
    params?: Record<string, string | number>,
  ): Promise<Record<string, unknown>[]> {
    const response = await this.rawGet("leases/export", params);
    this.ensureOk(response, "leases/export");
    const body = await response.json();
    if (Array.isArray(body)) return body as Record<string, unknown>[];
    if (
      body &&
      typeof body === "object" &&
      Array.isArray((body as Record<string, unknown>).leases)
    ) {
      return (body as Record<string, unknown>).leases as Record<string, unknown>[];
    }
    throw new RentVineError("Unexpected Rentvine lease-export response shape.", 0);
  }

  /**
   * Non-throwing probe for the health check: returns status + headers + parsed count without
   * raising on 401/429/network error, so a health run can record the failure as a step result.
   */
  async probeLeases(
    params?: Record<string, string | number>,
  ): Promise<RentVineProbeResult> {
    let response: RentVineHttpResponse;
    try {
      response = await this.rawGet("leases", params);
    } catch (error) {
      return {
        status: 0,
        headers: {},
        count: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    let count: number | null = null;
    if (response.status >= 200 && response.status < 300) {
      try {
        count = unwrapLeases(await response.json()).length;
      } catch {
        count = null;
      }
    }
    return { status: response.status, headers: response.headers, count };
  }
}
