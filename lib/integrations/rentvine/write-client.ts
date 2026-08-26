// Narrow RentVine write transport for the documented renewal-related UPDATE endpoints.
//
// This module is deliberately separate from the GET-only RentVineClient. It has no generic request
// method, no DELETE/PUT/status/create route, and no environment factory. Production code cannot
// discover or execute a path supplied by a caller: the only public effects are the two official POST
// routes below. The action-registry key stays closed until a disposable live test proves permission,
// field semantics, readback, idempotency, and rollback.

import {
  assertRentVineAccount,
  type RentVineClientConfig,
  RentVineAuthError,
  RentVineError,
  RentVineRateLimitError,
} from "@/lib/integrations/rentvine/client";

export interface RentVineWriteHttpRequest {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface RentVineWriteHttpResponse {
  status: number;
  headers: Record<string, string>;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export interface RentVineWriteHttpTransport {
  send(request: RentVineWriteHttpRequest): Promise<RentVineWriteHttpResponse>;
}

/** Narrow subset of the documented lease-update body used by a renewal preview. */
export interface RentVineLeaseUpdatePayload {
  /** Required by the documented lease-update schema; copied from the fresh pre-read. */
  startDate: string;
  endDate?: string | null;
  increaseEligibilityDate?: string | null;
}

/** Narrow subset of the existing recurring-charge update. It never creates or deletes a charge. */
export interface RentVineRecurringChargeUpdatePayload {
  amount?: string;
  startDate?: string;
  endDate?: string;
}

export const RENTVINE_WRITE_ACCOUNT = "pmikcmetro";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const US_DATE_RE = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
const POSITIVE_DECIMAL_RE = /^(?:0|[1-9]\d*)\.\d{2}$/;
const POSITIVE_INTEGER_ID_RE = /^[1-9]\d*$/;

function toBase64(input: string): string {
  return Buffer.from(input, "utf8").toString("base64");
}

function normalizedBaseUrl(baseUrl: string): string {
  assertRentVineAccount(baseUrl, RENTVINE_WRITE_ACCOUNT);
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:") throw new Error("RentVine write URL must use https.");
  const path = parsed.pathname.replace(/\/+$/, "");
  if (path !== "/api/manager") {
    throw new Error("RentVine write URL must end at /api/manager.");
  }
  parsed.pathname = path;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function assertIntegerId(value: string, label: string): string {
  const normalized = String(value).trim();
  if (!POSITIVE_INTEGER_ID_RE.test(normalized)) {
    throw new Error(`${label} must be a positive integer RentVine id.`);
  }
  return normalized;
}

function assertIsoDate(value: string, label: string): void {
  if (!ISO_DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be a real YYYY-MM-DD date.`);
  }
}

function assertUsDate(value: string, label: string): void {
  if (!US_DATE_RE.test(value)) {
    throw new Error(`${label} must use MM/DD/YYYY.`);
  }
  const [month, day, year] = value.split("/").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${label} must be a real MM/DD/YYYY date.`);
  }
}

function normalizeLeasePayload(
  payload: RentVineLeaseUpdatePayload,
): RentVineLeaseUpdatePayload {
  assertIsoDate(payload.startDate, "Lease startDate");
  if (payload.endDate !== undefined && payload.endDate !== null) {
    assertIsoDate(payload.endDate, "Lease endDate");
  }
  if (
    payload.increaseEligibilityDate !== undefined &&
    payload.increaseEligibilityDate !== null
  ) {
    assertIsoDate(payload.increaseEligibilityDate, "Lease increaseEligibilityDate");
  }
  return {
    startDate: payload.startDate,
    ...(payload.endDate !== undefined ? { endDate: payload.endDate } : {}),
    ...(payload.increaseEligibilityDate !== undefined
      ? { increaseEligibilityDate: payload.increaseEligibilityDate }
      : {}),
  };
}

function normalizeRecurringChargePayload(
  payload: RentVineRecurringChargeUpdatePayload,
): RentVineRecurringChargeUpdatePayload {
  if (
    payload.amount === undefined &&
    payload.startDate === undefined &&
    payload.endDate === undefined
  ) {
    throw new Error("Recurring-charge update requires at least one allowed field.");
  }
  if (payload.amount !== undefined && !POSITIVE_DECIMAL_RE.test(payload.amount)) {
    throw new Error(
      "Recurring-charge amount must be a non-negative decimal string with two digits.",
    );
  }
  if (payload.startDate !== undefined) {
    assertUsDate(payload.startDate, "Recurring-charge startDate");
  }
  if (payload.endDate !== undefined) {
    assertUsDate(payload.endDate, "Recurring-charge endDate");
  }
  return {
    ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
    ...(payload.startDate !== undefined ? { startDate: payload.startDate } : {}),
    ...(payload.endDate !== undefined ? { endDate: payload.endDate } : {}),
  };
}

function retryAfter(headers: Record<string, string>): number | null {
  const raw = headers["retry-after"];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createRentVineWriteFetchTransport(
  options: { timeoutMs?: number } = {},
): RentVineWriteHttpTransport {
  const timeoutMs = options.timeoutMs ?? 30_000;
  return {
    async send(request) {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => (headers[key.toLowerCase()] = value));
      const body = await response.text();
      return {
        status: response.status,
        headers,
        text: async () => body,
        json: async () => JSON.parse(body) as unknown,
      };
    },
  };
}

export class RentVineWriteClient {
  private readonly baseUrl: string;
  private readonly authorization: string;

  constructor(
    config: RentVineClientConfig,
    private readonly transport: RentVineWriteHttpTransport,
  ) {
    this.baseUrl = normalizedBaseUrl(config.baseUrl);
    if (!config.apiKey || !config.apiSecret) {
      throw new Error("RentVine write credentials are not configured.");
    }
    this.authorization = `Basic ${toBase64(`${config.apiKey}:${config.apiSecret}`)}`;
  }

  async updateLease(
    leaseId: string,
    payload: RentVineLeaseUpdatePayload,
  ): Promise<unknown> {
    return this.post(
      `/leases/${assertIntegerId(leaseId, "Lease id")}`,
      normalizeLeasePayload(payload),
    );
  }

  async updateExistingRecurringCharge(
    leaseId: string,
    chargeId: string,
    payload: RentVineRecurringChargeUpdatePayload,
  ): Promise<unknown> {
    return this.post(
      `/leases/${assertIntegerId(leaseId, "Lease id")}/recurring-charges/${assertIntegerId(chargeId, "Recurring-charge id")}`,
      normalizeRecurringChargePayload(payload),
    );
  }

  private async post(path: string, payload: object): Promise<unknown> {
    const response = await this.transport.send({
      method: "POST",
      url: `${this.baseUrl}${path}`,
      headers: {
        Authorization: this.authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (response.status === 401 || response.status === 403) {
      throw new RentVineAuthError(response.status);
    }
    if (response.status === 429) {
      throw new RentVineRateLimitError(response.status, retryAfter(response.headers));
    }
    if (response.status < 200 || response.status >= 300) {
      throw new RentVineError(
        `RentVine update failed (HTTP ${response.status}); no response body or credential is included.`,
        response.status,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new RentVineError(
        "RentVine update returned an invalid JSON body.",
        response.status,
      );
    }
  }
}
