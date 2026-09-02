// S99 minimal official-contract snapshot and per-operation codecs for the consumed RentVine
// maintenance work-order operations. Source: the official OpenAPI published at
// https://docs.rentvine.com/ (extracted from the pre-rendered Redoc state, 2026-09-02). The
// snapshot below records only consumed operations; it infers no idempotency and no
// compare-and-set. Wire validation is operation-specific and runs before canonicalization:
// integer path/query ids, exact positive-decimal-string body and work-order/status ids, exact
// "0"/"1" persisted response flags, operation-specific request booleans, and the eight exact
// response roots. Loose equality, Number()/String() coercion, truthiness, alternate envelopes,
// and partial-object success are refused here, not downstream.

/**
 * SHA-256 of the canonical JSON (sorted keys, no whitespace) of the eight consumed operation
 * objects extracted verbatim from the official OpenAPI on 2026-09-02:
 * GET+POST /maintenance/work-orders, GET+POST /maintenance/work-orders/{workOrderID},
 * GET /maintenance/work-order/statuses, GET /maintenance/work-order/statuses/{workOrderStatusID},
 * GET /maintenance/vendor-trades, GET /maintenance/vendor-trades/{vendorTradeID}.
 */
export const WORK_ORDER_CONTRACT_SNAPSHOT_SHA256 =
  "647eef044ec0e0060ac42cb20c77a2af767fc6822e5f2defa58cd17d51734127";

/** The only provider paths S99 may touch; there is no DELETE, print, chat, file, or catalog write. */
export const WORK_ORDER_CONSUMED_OPERATIONS = [
  "GET maintenance/work-orders",
  "POST maintenance/work-orders",
  "GET maintenance/work-orders/{workOrderID}",
  "POST maintenance/work-orders/{workOrderID}",
  "GET maintenance/work-order/statuses",
  "GET maintenance/work-order/statuses/{workOrderStatusID}",
  "GET maintenance/vendor-trades",
  "GET maintenance/vendor-trades/{vendorTradeID}",
] as const;

/** Documented list defaults: explicit page plus the documented default pageSize. */
export const WORK_ORDER_LIST_PAGE_SIZE = 15;
/** One bounded activation reads at most this many pages and must report completeness. */
export const WORK_ORDER_LIST_MAX_PAGES = 20;

/** Official create-priority vocabulary; `4` is not part of the documented create contract. */
export const WORK_ORDER_PRIORITY_IDS = ["1", "2", "3"] as const;
export const WORK_ORDER_PRIORITY_LABELS: Readonly<Record<string, string>> = {
  "1": "Low",
  "2": "Medium",
  "3": "High",
};

/**
 * Documented primary grouping ids: 1 Pending, 2 Open, 3 Closed, 4 On Hold. The live account's
 * system Cancelled status carries primary 5 (observed on the 2026-09-02 S99 cancel proof), so it
 * is named here; unknown groups still decode and render without a label.
 */
export const WORK_ORDER_PRIMARY_GROUPS: Readonly<Record<string, string>> = {
  "1": "Pending",
  "2": "Open",
  "3": "Closed",
  "4": "On Hold",
  "5": "Cancelled",
};
/** Creation may target only a status whose live primary grouping is Pending or Open. */
export const WORK_ORDER_CREATE_SAFE_PRIMARY_GROUPS = new Set(["1", "2"]);

export class WorkOrderContractError extends Error {
  constructor(
    readonly code: "invalid_id" | "invalid_flag" | "invalid_field" | "invalid_envelope",
    message: string,
  ) {
    super(message);
    this.name = "WorkOrderContractError";
  }
}

function refuse(code: WorkOrderContractError["code"], message: string): never {
  throw new WorkOrderContractError(code, message);
}

const DECIMAL_ID_RE = /^[1-9][0-9]*$/;

/**
 * A path/query id starts as a safe positive integer and is serialized as canonical base-10
 * digits. Strings, zero, negatives, fractions, and unsafe magnitudes refuse.
 */
export function canonicalPathId(value: unknown, field: string): string {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    refuse("invalid_id", `${field} must be a safe positive integer.`);
  }
  return String(value);
}

/**
 * A body or response id is an exact canonical positive decimal string. Leading zeroes, signs,
 * whitespace, empty strings, numbers, and booleans refuse.
 */
export function decodeDecimalIdString(value: unknown, field: string): string {
  if (typeof value !== "string" || !DECIMAL_ID_RE.test(value)) {
    refuse("invalid_id", `${field} must be a canonical positive decimal string.`);
  }
  return value;
}

/** Optional variant: absent or null stays null; anything present must decode exactly. */
export function decodeOptionalDecimalIdString(
  value: unknown,
  field: string,
): string | null {
  if (value === undefined || value === null) return null;
  return decodeDecimalIdString(value, field);
}

/** Persisted provider boolean-like response flags are exact strings "0" or "1". */
export function decodeResponseFlag(value: unknown, field: string): "0" | "1" {
  if (value !== "0" && value !== "1") {
    refuse("invalid_flag", `${field} must be the exact string "0" or "1".`);
  }
  return value;
}

function decodeOptionalResponseFlag(value: unknown, field: string): "0" | "1" | null {
  if (value === undefined || value === null) return null;
  return decodeResponseFlag(value, field);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    refuse("invalid_field", `${field} must be a string.`);
  }
  return value;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    refuse("invalid_envelope", `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

/**
 * Canonical consumed projection of one provider work order. Only allowlisted fields are read;
 * everything else in the provider object is ignored, never trusted or persisted.
 */
export interface WorkOrderProjection {
  workOrderId: string;
  workOrderNumber: string;
  propertyId: string;
  unitId: string | null;
  workOrderStatusId: string;
  primaryWorkOrderStatusId: string;
  priorityId: string;
  description: string;
  isOwnerApproved: "0" | "1";
  isVacant: "0" | "1";
  isSharedWithTenant: "0" | "1";
  isSharedWithOwner: "0" | "1";
  isNew: "0" | "1" | null;
  /** S100 consumes the documented optional lease binding for resident mapping. */
  leaseId: string | null;
  vendorTradeId: string | null;
  vendorContactId: string | null;
  assignedToUserId: string | null;
}

export function decodeWorkOrderProjection(value: unknown): WorkOrderProjection {
  const raw = requireRecord(value, "workOrder");
  return {
    workOrderId: decodeDecimalIdString(raw["workOrderID"], "workOrderID"),
    workOrderNumber: requireString(raw["workOrderNumber"], "workOrderNumber"),
    propertyId: decodeDecimalIdString(raw["propertyID"], "propertyID"),
    unitId: decodeOptionalDecimalIdString(raw["unitID"], "unitID"),
    workOrderStatusId: decodeDecimalIdString(
      raw["workOrderStatusID"],
      "workOrderStatusID",
    ),
    primaryWorkOrderStatusId: decodeDecimalIdString(
      raw["primaryWorkOrderStatusID"],
      "primaryWorkOrderStatusID",
    ),
    priorityId: decodeDecimalIdString(raw["priorityID"], "priorityID"),
    description: requireString(raw["description"], "description"),
    isOwnerApproved: decodeResponseFlag(raw["isOwnerApproved"], "isOwnerApproved"),
    isVacant: decodeResponseFlag(raw["isVacant"], "isVacant"),
    isSharedWithTenant: decodeResponseFlag(
      raw["isSharedWithTenant"],
      "isSharedWithTenant",
    ),
    isSharedWithOwner: decodeResponseFlag(raw["isSharedWithOwner"], "isSharedWithOwner"),
    isNew: decodeOptionalResponseFlag(raw["isNew"], "isNew"),
    leaseId: decodeOptionalDecimalIdString(raw["leaseID"], "leaseID"),
    vendorTradeId: decodeOptionalDecimalIdString(raw["vendorTradeID"], "vendorTradeID"),
    vendorContactId: decodeOptionalDecimalIdString(
      raw["vendorContactID"],
      "vendorContactID",
    ),
    assignedToUserId: decodeOptionalDecimalIdString(
      raw["assignedToUserID"],
      "assignedToUserID",
    ),
  };
}

function decodeSchedulingStatusId(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    refuse("invalid_field", "schedulingStatusID must be an integer or null.");
  }
  return value;
}

/** List response: a bare array whose every row is the documented { workOrder, contact } wrapper. */
export function decodeWorkOrderListResponse(body: unknown): WorkOrderProjection[] {
  if (!Array.isArray(body)) {
    refuse("invalid_envelope", "The work-order list response must be a bare array.");
  }
  return body.map((row, index) => {
    const wrapper = requireRecord(row, `list row ${index}`);
    if (!("workOrder" in wrapper) || !("contact" in wrapper)) {
      refuse(
        "invalid_envelope",
        `List row ${index} must be the documented { workOrder, contact } wrapper.`,
      );
    }
    return decodeWorkOrderProjection(wrapper["workOrder"]);
  });
}

export interface WorkOrderDetail {
  workOrder: WorkOrderProjection;
  schedulingStatusId: number | null;
}

/** Detail and create responses share the exact { workOrder, schedulingStatusID } root. */
export function decodeWorkOrderDetailResponse(body: unknown): WorkOrderDetail {
  const root = requireRecord(body, "detail response");
  if (!("workOrder" in root) || !("schedulingStatusID" in root)) {
    refuse(
      "invalid_envelope",
      "The detail/create response root must be { workOrder, schedulingStatusID }.",
    );
  }
  return {
    workOrder: decodeWorkOrderProjection(root["workOrder"]),
    schedulingStatusId: decodeSchedulingStatusId(root["schedulingStatusID"]),
  };
}

/**
 * Status-update response: the documentation shows exactly { workOrder }, but the live provider
 * answers with the detail-style { workOrder, schedulingStatusID } envelope (observed on the
 * 2026-09-02 S99 cancel proof). Both decode; any other root is not update success.
 */
export function decodeWorkOrderUpdateResponse(body: unknown): WorkOrderProjection {
  const root = requireRecord(body, "update response");
  const keys = Object.keys(root).sort();
  const bare = keys.length === 1 && keys[0] === "workOrder";
  const detailShaped =
    keys.length === 2 && keys[0] === "schedulingStatusID" && keys[1] === "workOrder";
  if (!bare && !detailShaped) {
    refuse(
      "invalid_envelope",
      "The update response root must be { workOrder } or { workOrder, schedulingStatusID }.",
    );
  }
  return decodeWorkOrderProjection(root["workOrder"]);
}

export interface WorkOrderStatusProjection {
  workOrderStatusId: string;
  primaryWorkOrderStatusId: string;
  name: string;
  isSystemStatus: "0" | "1";
}

function decodeStatusProjection(value: unknown): WorkOrderStatusProjection {
  const raw = requireRecord(value, "workOrderStatus");
  return {
    workOrderStatusId: decodeDecimalIdString(
      raw["workOrderStatusID"],
      "workOrderStatusID",
    ),
    primaryWorkOrderStatusId: decodeDecimalIdString(
      raw["primaryWorkOrderStatusID"],
      "primaryWorkOrderStatusID",
    ),
    name: requireString(raw["name"], "name"),
    isSystemStatus: decodeResponseFlag(raw["isSystemStatus"], "isSystemStatus"),
  };
}

/** Status list: a bare array of { workOrderStatus } wrappers; bare status objects refuse. */
export function decodeStatusListResponse(body: unknown): WorkOrderStatusProjection[] {
  if (!Array.isArray(body)) {
    refuse("invalid_envelope", "The status list response must be a bare array.");
  }
  return body.map((row, index) => {
    const wrapper = requireRecord(row, `status row ${index}`);
    if (!("workOrderStatus" in wrapper)) {
      refuse(
        "invalid_envelope",
        `Status row ${index} must be the documented { workOrderStatus } wrapper.`,
      );
    }
    return decodeStatusProjection(wrapper["workOrderStatus"]);
  });
}

/** Status detail: the enveloped { workOrderStatus } root. */
export function decodeStatusDetailResponse(body: unknown): WorkOrderStatusProjection {
  const root = requireRecord(body, "status detail response");
  if (!("workOrderStatus" in root)) {
    refuse("invalid_envelope", "The status detail root must be { workOrderStatus }.");
  }
  return decodeStatusProjection(root["workOrderStatus"]);
}

export interface VendorTradeProjection {
  vendorTradeId: string;
  name: string;
}

/**
 * Trade list rows: the documentation shows bare Vendor-trade objects, but the live provider
 * returns { vendorTrade } wrappers (observed on the 2026-09-02 S99 bounded read proof). Both
 * shapes decode; a wrapper carrying a `vendors` include still refuses because the adapter never
 * requests one.
 */
export function decodeTradeListResponse(body: unknown): VendorTradeProjection[] {
  if (!Array.isArray(body)) {
    refuse("invalid_envelope", "The vendor-trade list response must be a bare array.");
  }
  return body.map((row, index) => {
    const outer = requireRecord(row, `trade row ${index}`);
    if ("vendors" in outer) {
      refuse(
        "invalid_envelope",
        `Trade row ${index} carries a vendors include the adapter never requests.`,
      );
    }
    const raw =
      "vendorTrade" in outer
        ? requireRecord(outer["vendorTrade"], `trade row ${index} wrapper`)
        : outer;
    // Documented bare rows carry integer ids; the live wrapped rows carry the same canonical
    // decimal strings as every other body id (observed together on the 2026-09-02 read proof).
    const rawId = raw["vendorTradeID"];
    return {
      vendorTradeId:
        typeof rawId === "string"
          ? decodeDecimalIdString(rawId, "vendorTradeID")
          : canonicalPathId(rawId, "vendorTradeID"),
      name: requireString(raw["name"], "name"),
    };
  });
}

/**
 * Trade detail: the enveloped { vendorTrade } root; its id is a canonical decimal string. The
 * `vendors` include is never requested and a response carrying one refuses.
 */
export function decodeTradeDetailResponse(body: unknown): VendorTradeProjection {
  const root = requireRecord(body, "trade detail response");
  if (!("vendorTrade" in root) || "vendors" in root) {
    refuse(
      "invalid_envelope",
      "The trade detail root must be { vendorTrade } without the vendors include.",
    );
  }
  const raw = requireRecord(root["vendorTrade"], "vendorTrade");
  return {
    vendorTradeId: decodeDecimalIdString(raw["vendorTradeID"], "vendorTradeID"),
    name: requireString(raw["name"], "name"),
  };
}

/** The exact typed list filters the official operation supports and S99 permits. */
export interface WorkOrderListFilters {
  propertyID?: number;
  unitID?: number;
  workOrderStatusID?: number;
  leaseID?: number;
  startDate?: string;
  endDate?: string;
  isNew?: 0 | 1;
}

const LIST_FILTER_KEYS = new Set([
  "propertyID",
  "unitID",
  "workOrderStatusID",
  "leaseID",
  "startDate",
  "endDate",
  "isNew",
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate and canonically serialize the typed list filters; unknown keys refuse. */
export function canonicalListFilterParams(
  filters: WorkOrderListFilters,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (!LIST_FILTER_KEYS.has(key)) {
      refuse("invalid_field", `Unsupported list filter "${key}".`);
    }
    if (value === undefined) continue;
    if (key === "startDate" || key === "endDate") {
      const text = requireString(value, key);
      if (!ISO_DATE_RE.test(text)) {
        refuse("invalid_field", `${key} must be an ISO date (YYYY-MM-DD).`);
      }
      out[key] = text;
    } else if (key === "isNew") {
      if (value !== 0 && value !== 1) {
        refuse("invalid_field", "isNew must be the integer 0 or 1.");
      }
      out[key] = String(value);
    } else {
      out[key] = canonicalPathId(value, key);
    }
  }
  return out;
}

/**
 * The exact create body S99 serializes. Every other official create field is out of scope and
 * cannot be expressed here; the serializer refuses unknown keys structurally.
 */
export interface WorkOrderCreateBody {
  propertyID: string;
  unitID: string;
  description: string;
  priorityID: string;
  workOrderStatusID: string;
  isVacant: boolean;
  vendorTradeID?: string;
}

export function serializeCreateBody(input: WorkOrderCreateBody): Record<string, unknown> {
  const keys = Object.keys(input);
  for (const key of keys) {
    if (
      ![
        "propertyID",
        "unitID",
        "description",
        "priorityID",
        "workOrderStatusID",
        "isVacant",
        "vendorTradeID",
      ].includes(key)
    ) {
      refuse("invalid_field", `Create body field "${key}" is out of scope.`);
    }
  }
  const description = requireString(input.description, "description").trim();
  if (!description) refuse("invalid_field", "description must be non-empty.");
  if (/<[a-z!/]/i.test(description)) {
    refuse("invalid_field", "description may not contain HTML or script content.");
  }
  const priorityID = decodeDecimalIdString(input.priorityID, "priorityID");
  if (!WORK_ORDER_PRIORITY_IDS.includes(priorityID as "1" | "2" | "3")) {
    refuse("invalid_field", "priorityID must be the documented 1, 2, or 3.");
  }
  if (typeof input.isVacant !== "boolean") {
    refuse("invalid_flag", "isVacant must be an exact JSON boolean.");
  }
  const body: Record<string, unknown> = {
    propertyID: decodeDecimalIdString(input.propertyID, "propertyID"),
    unitID: decodeDecimalIdString(input.unitID, "unitID"),
    description,
    priorityID,
    workOrderStatusID: decodeDecimalIdString(
      input.workOrderStatusID,
      "workOrderStatusID",
    ),
    isVacant: input.isVacant,
    // Fixed safety literals: the app claims no owner approval, hides the record from both
    // portals, and sends no vendor notification or email. sendVendorNotification defaults to
    // TRUE provider-side, so the explicit false is load-bearing.
    isOwnerApproved: false,
    isSharedWithTenant: "0",
    isSharedWithOwner: false,
    sendVendorNotification: false,
    sendEmail: false,
  };
  if (input.vendorTradeID !== undefined) {
    body["vendorTradeID"] = decodeDecimalIdString(input.vendorTradeID, "vendorTradeID");
  }
  return body;
}

/** The only status-update body: the fresh target id plus both notification flags off. */
export function serializeStatusUpdateBody(
  workOrderStatusID: string,
): Record<string, unknown> {
  return {
    workOrderStatusID: decodeDecimalIdString(workOrderStatusID, "workOrderStatusID"),
    sendVendorNotification: false,
    sendReview: false,
  };
}
