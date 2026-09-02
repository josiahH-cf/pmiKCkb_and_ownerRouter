// S99 concrete work-order transports. The reader implements only the six documented GET forms;
// the writer implements only the two documented POST forms. Neither has a generic request
// method, DELETE, print, chat, file, catalog-mutation, or Vendor-assignment path, and a caller
// cannot supply a host, path, raw body, account, or arbitrary filter. Both classes exist behind
// closed keys; construction grants nothing.

import {
  RentVineAuthError,
  RentVineError,
  RentVineRateLimitError,
  rentVineAccountCode,
  type RentVineClientConfig,
  type RentVineHttpResponse,
  type RentVineHttpTransport,
} from "@/lib/integrations/rentvine/client";
import type { RentVineWriteHttpTransport } from "@/lib/integrations/rentvine/write-client";
import {
  WORK_ORDER_LIST_MAX_PAGES,
  WORK_ORDER_LIST_PAGE_SIZE,
  canonicalListFilterParams,
  canonicalPathId,
  decodeStatusDetailResponse,
  decodeStatusListResponse,
  decodeTradeDetailResponse,
  decodeTradeListResponse,
  decodeWorkOrderDetailResponse,
  decodeWorkOrderListResponse,
  decodeWorkOrderUpdateResponse,
  serializeCreateBody,
  serializeStatusUpdateBody,
  type VendorTradeProjection,
  type WorkOrderCreateBody,
  type WorkOrderDetail,
  type WorkOrderListFilters,
  type WorkOrderProjection,
  type WorkOrderStatusProjection,
} from "@/lib/integrations/rentvine/work-order-contract";

function toBase64(input: string): string {
  return Buffer.from(input, "utf8").toString("base64");
}

function baseUrlOf(config: RentVineClientConfig): string {
  const url = new URL(config.baseUrl);
  if (url.protocol !== "https:") {
    throw new Error("Rentvine base URL must use https.");
  }
  return url.toString().replace(/\/$/, "");
}

function authHeaderOf(config: RentVineClientConfig): string {
  if (!config.apiKey || !config.apiSecret) {
    throw new Error("RentVine work-order credentials are not configured.");
  }
  return `Basic ${toBase64(`${config.apiKey}:${config.apiSecret}`)}`;
}

async function decodeOk<T>(
  response:
    | RentVineHttpResponse
    | Awaited<ReturnType<RentVineWriteHttpTransport["send"]>>,
  path: string,
  decode: (body: unknown) => T,
): Promise<T> {
  if (response.status === 401 || response.status === 403) {
    throw new RentVineAuthError(response.status);
  }
  if (response.status === 429) {
    const raw = response.headers["retry-after"];
    const seconds = raw === undefined ? Number.NaN : Number(raw);
    throw new RentVineRateLimitError(
      response.status,
      Number.isFinite(seconds) ? seconds : null,
    );
  }
  if (response.status < 200 || response.status >= 300) {
    throw new RentVineError(
      `Rentvine ${path} failed (HTTP ${response.status}); no body is included.`,
      response.status,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new RentVineError(`Rentvine ${path} returned invalid JSON.`, response.status);
  }
  return decode(body);
}

export interface BoundedWorkOrderList {
  rows: WorkOrderProjection[];
  pages: number;
  /** False when the page cap stopped the read; the rows are then explicitly incomplete. */
  complete: boolean;
}

/** Read-only client for exactly the six documented work-order GET forms. */
export class RentVineWorkOrderReader {
  private readonly baseUrl: string;
  private readonly authorization: string;

  constructor(
    config: RentVineClientConfig,
    private readonly transport: RentVineHttpTransport,
  ) {
    this.baseUrl = baseUrlOf(config);
    this.authorization = authHeaderOf(config);
  }

  /** Non-secret account identity for evidence binding. */
  accountCode(): string {
    return rentVineAccountCode(this.baseUrl);
  }

  private get(path: string, params?: Record<string, string>) {
    const url = new URL(`${this.baseUrl}/${path}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, value);
    }
    return this.transport.send({
      method: "GET",
      url: url.toString(),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: this.authorization,
      },
    });
  }

  /** One explicit page of the documented list read with typed filters only. */
  async listWorkOrdersPage(
    filters: WorkOrderListFilters,
    page: number,
  ): Promise<WorkOrderProjection[]> {
    const params = canonicalListFilterParams(filters);
    params["page"] = canonicalPathId(page, "page");
    params["pageSize"] = String(WORK_ORDER_LIST_PAGE_SIZE);
    const response = await this.get("maintenance/work-orders", params);
    return decodeOk(response, "work-order list", decodeWorkOrderListResponse);
  }

  /**
   * Bounded complete read: explicit pages at the documented default page size, deduplicated by
   * work-order id, stopping on a short page, capped at 20 pages with explicit completeness.
   */
  async listWorkOrdersBounded(
    filters: WorkOrderListFilters,
  ): Promise<BoundedWorkOrderList> {
    const seen = new Map<string, WorkOrderProjection>();
    let pages = 0;
    for (let page = 1; page <= WORK_ORDER_LIST_MAX_PAGES; page++) {
      const rows = await this.listWorkOrdersPage(filters, page);
      pages = page;
      for (const row of rows) {
        if (!seen.has(row.workOrderId)) seen.set(row.workOrderId, row);
      }
      if (rows.length < WORK_ORDER_LIST_PAGE_SIZE) {
        return { rows: [...seen.values()], pages, complete: true };
      }
    }
    return { rows: [...seen.values()], pages, complete: false };
  }

  /** Authoritative single work-order read: the { workOrder, schedulingStatusID } envelope. */
  async getWorkOrder(workOrderId: number): Promise<WorkOrderDetail> {
    const response = await this.get(
      `maintenance/work-orders/${canonicalPathId(workOrderId, "workOrderID")}`,
    );
    return decodeOk(response, "work-order detail", decodeWorkOrderDetailResponse);
  }

  /** Full account status catalog (identity only; no mutation exists on this client). */
  async listWorkOrderStatuses(): Promise<WorkOrderStatusProjection[]> {
    const response = await this.get("maintenance/work-order/statuses");
    return decodeOk(response, "status list", decodeStatusListResponse);
  }

  /** Revalidate one selected status id by its enveloped detail read. */
  async getWorkOrderStatus(
    workOrderStatusId: number,
  ): Promise<WorkOrderStatusProjection> {
    const response = await this.get(
      `maintenance/work-order/statuses/${canonicalPathId(workOrderStatusId, "workOrderStatusID")}`,
    );
    return decodeOk(response, "status detail", decodeStatusDetailResponse);
  }

  /** Trade catalog identity; the `vendors` include is never requested. */
  async listVendorTrades(): Promise<VendorTradeProjection[]> {
    const response = await this.get("maintenance/vendor-trades");
    return decodeOk(response, "vendor-trade list", decodeTradeListResponse);
  }

  /** Revalidate one selected trade id; path id must canonically equal the returned id. */
  async getVendorTrade(vendorTradeId: number): Promise<VendorTradeProjection> {
    const pathId = canonicalPathId(vendorTradeId, "vendorTradeID");
    const response = await this.get(`maintenance/vendor-trades/${pathId}`);
    const trade = await decodeOk(
      response,
      "vendor-trade detail",
      decodeTradeDetailResponse,
    );
    if (trade.vendorTradeId !== pathId) {
      throw new RentVineError(
        "Vendor-trade detail identity does not match the requested id.",
        response.status,
      );
    }
    return trade;
  }
}

/** Write client for exactly the two documented work-order POST forms. */
export class RentVineWorkOrderWriter {
  private readonly baseUrl: string;
  private readonly authorization: string;

  constructor(
    config: RentVineClientConfig,
    private readonly transport: RentVineWriteHttpTransport,
  ) {
    this.baseUrl = baseUrlOf(config);
    this.authorization = authHeaderOf(config);
  }

  private post(path: string, payload: Record<string, unknown>) {
    return this.transport.send({
      method: "POST",
      url: `${this.baseUrl}/${path}`,
      headers: {
        Authorization: this.authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  /**
   * Create one work order from the exact allowlisted field matrix; the serializer fixes owner
   * approval, both portal shares, and both notification flags off. Response must be the exact
   * { workOrder, schedulingStatusID } envelope.
   */
  async createWorkOrder(body: WorkOrderCreateBody): Promise<WorkOrderDetail> {
    const response = await this.post(
      "maintenance/work-orders",
      serializeCreateBody(body),
    );
    return decodeOk(response, "work-order create", decodeWorkOrderDetailResponse);
  }

  /**
   * Change only workOrderStatusID with both documented notification flags off. Response must be
   * the exact { workOrder } envelope; a detail/create envelope is not update success.
   */
  async updateWorkOrderStatus(
    workOrderId: number,
    workOrderStatusId: string,
  ): Promise<WorkOrderProjection> {
    const response = await this.post(
      `maintenance/work-orders/${canonicalPathId(workOrderId, "workOrderID")}`,
      serializeStatusUpdateBody(workOrderStatusId),
    );
    return decodeOk(response, "work-order status update", decodeWorkOrderUpdateResponse);
  }
}
