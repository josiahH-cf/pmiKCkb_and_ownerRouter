// Narrow RentVine write transport for the documented renewal-related endpoints (S30/S97).
//
// This module is deliberately separate from the GET-only RentVineClient. It has no generic request
// method, no PUT/status route, and no environment factory. Production code cannot discover or
// execute a path supplied by a caller: the only public effects are the exact official operations
// below — the lease-date POST, the recurring-charge create/update POSTs, and the create key's
// paired receipt-bound reversal DELETE. Every S97 Action Registry key stays closed until its own
// bounded live proof and protected activation pass; the transport existing grants nothing.

import {
  assertRentVineAccount,
  type RentVineClientConfig,
  RentVineAuthError,
  RentVineError,
  RentVineRateLimitError,
} from "@/lib/integrations/rentvine/client";

export interface RentVineWriteHttpRequest {
  method: "POST" | "DELETE";
  url: string;
  headers: Record<string, string>;
  body?: string;
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

/**
 * S97 recurring-charge update: only changed official fields, all wire-typed as strings. The body
 * must be nonempty; omitted fields retain their fresh detail-GET values. Because the provider
 * documents no clear value, an `endDate` transition between dated and open-ended is rejected at the
 * proposal layer; this payload never carries `endDate: null`.
 */
export interface RentVineRecurringChargeUpdatePayload {
  accountID?: string;
  amount?: string;
  description?: string;
  dayDue?: string;
  frequency?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * S97 recurring-charge create: every required official field explicitly supplied as a string; no
 * provider default or another lease supplies a value. `endDate` is omitted for open-ended.
 */
export interface RentVineRecurringChargeCreatePayload {
  accountID: string;
  amount: string;
  description: string;
  dayDue: string;
  frequency: string;
  startDate: string;
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

const DAY_DUE_RE = /^(?:[1-9]|[12]\d|3[01])$/;
const FREQUENCY_RE = /^(?:[1-9]|1\d|2[0-4])$/;

function assertChargeFieldValue(
  field: keyof RentVineRecurringChargeCreatePayload,
  value: string,
): void {
  switch (field) {
    case "accountID":
      if (!POSITIVE_INTEGER_ID_RE.test(value)) {
        throw new Error("Recurring-charge accountID must be a positive integer id.");
      }
      return;
    case "amount":
      if (!POSITIVE_DECIMAL_RE.test(value)) {
        throw new Error(
          "Recurring-charge amount must be a non-negative decimal string with two digits.",
        );
      }
      return;
    case "description":
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error("Recurring-charge description must be a nonblank string.");
      }
      return;
    case "dayDue":
      if (!DAY_DUE_RE.test(value)) {
        throw new Error('Recurring-charge dayDue must be a canonical "1"-"31" string.');
      }
      return;
    case "frequency":
      if (!FREQUENCY_RE.test(value)) {
        throw new Error(
          'Recurring-charge frequency must be a canonical "1"-"24" string.',
        );
      }
      return;
    case "startDate":
      assertUsDate(value, "Recurring-charge startDate");
      return;
    case "endDate":
      assertUsDate(value, "Recurring-charge endDate");
      return;
  }
}

const CHARGE_FIELD_ORDER = [
  "accountID",
  "amount",
  "description",
  "dayDue",
  "frequency",
  "startDate",
  "endDate",
] as const;

function normalizeRecurringChargeUpdatePayload(
  payload: RentVineRecurringChargeUpdatePayload,
): RentVineRecurringChargeUpdatePayload {
  const normalized: RentVineRecurringChargeUpdatePayload = {};
  for (const field of CHARGE_FIELD_ORDER) {
    const value = payload[field];
    if (value === undefined) continue;
    if (value === null) {
      throw new Error(`Recurring-charge ${field} cannot be null on update.`);
    }
    assertChargeFieldValue(field, value);
    normalized[field] = value;
  }
  if (Object.keys(normalized).length === 0) {
    throw new Error("Recurring-charge update requires at least one allowed field.");
  }
  return normalized;
}

function normalizeRecurringChargeCreatePayload(
  payload: RentVineRecurringChargeCreatePayload,
): RentVineRecurringChargeCreatePayload {
  for (const field of [
    "accountID",
    "amount",
    "description",
    "dayDue",
    "frequency",
    "startDate",
  ] as const) {
    const value = payload[field];
    if (value === undefined || value === null) {
      throw new Error(`Recurring-charge create requires ${field}.`);
    }
    assertChargeFieldValue(field, value);
  }
  if (payload.endDate !== undefined) {
    if (payload.endDate === null) {
      throw new Error("Recurring-charge create endDate is omitted for open-ended.");
    }
    assertChargeFieldValue("endDate", payload.endDate);
  }
  return {
    accountID: payload.accountID,
    amount: payload.amount,
    description: payload.description,
    dayDue: payload.dayDue,
    frequency: payload.frequency,
    startDate: payload.startDate,
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
      normalizeRecurringChargeUpdatePayload(payload),
    );
  }

  /** S97: create one recurring charge with every required official field explicitly supplied. */
  async createRecurringCharge(
    leaseId: string,
    payload: RentVineRecurringChargeCreatePayload,
  ): Promise<unknown> {
    return this.post(
      `/leases/${assertIntegerId(leaseId, "Lease id")}/recurring-charges`,
      normalizeRecurringChargeCreatePayload(payload),
    );
  }

  /**
   * S97: the create key's paired receipt-bound reversal. This is the ONLY delete this transport
   * exposes; callers must have proven the charge unchanged against its create receipt and obtained
   * a fresh exact confirmation before invoking it. The HTTP 200 response is the deleted
   * recurring-charge object directly.
   */
  async deleteRecurringChargeForCreateReversal(
    leaseId: string,
    chargeId: string,
  ): Promise<unknown> {
    return this.send(
      "DELETE",
      `/leases/${assertIntegerId(leaseId, "Lease id")}/recurring-charges/${assertIntegerId(chargeId, "Recurring-charge id")}`,
    );
  }

  private post(path: string, payload: object): Promise<unknown> {
    return this.send("POST", path, payload);
  }

  private async send(
    method: "POST" | "DELETE",
    path: string,
    payload?: object,
  ): Promise<unknown> {
    const response = await this.transport.send({
      method,
      url: `${this.baseUrl}${path}`,
      headers: {
        Authorization: this.authorization,
        "Content-Type": "application/json",
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
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
