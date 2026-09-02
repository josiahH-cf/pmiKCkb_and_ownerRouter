import { describe, expect, it } from "vitest";

import {
  WORK_ORDER_CONTRACT_SNAPSHOT_SHA256,
  WORK_ORDER_CREATE_SAFE_PRIMARY_GROUPS,
  WORK_ORDER_LIST_MAX_PAGES,
  WORK_ORDER_LIST_PAGE_SIZE,
  WORK_ORDER_PRIORITY_IDS,
  WorkOrderContractError,
  canonicalListFilterParams,
  canonicalPathId,
  decodeDecimalIdString,
  decodeResponseFlag,
  decodeStatusDetailResponse,
  decodeStatusListResponse,
  decodeTradeDetailResponse,
  decodeTradeListResponse,
  decodeWorkOrderDetailResponse,
  decodeWorkOrderListResponse,
  decodeWorkOrderProjection,
  decodeWorkOrderUpdateResponse,
  serializeCreateBody,
  serializeStatusUpdateBody,
} from "@/lib/integrations/rentvine/work-order-contract";

function rawWorkOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workOrderID: "5150",
    workOrderNumber: "WO-5150",
    propertyID: "84",
    unitID: "217",
    workOrderStatusID: "9",
    primaryWorkOrderStatusID: "2",
    priorityID: "2",
    description: "Kitchen sink drips at the trap.",
    isOwnerApproved: "0",
    isVacant: "0",
    isSharedWithTenant: "0",
    isSharedWithOwner: "0",
    isNew: "1",
    vendorTradeID: "4",
    ...overrides,
  };
}

function expectRefusal(fn: () => unknown, code: WorkOrderContractError["code"]) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(WorkOrderContractError);
    expect((error as WorkOrderContractError).code).toBe(code);
    return;
  }
  throw new Error("expected a WorkOrderContractError refusal");
}

describe("S99 official-contract snapshot constants", () => {
  it("pins the extracted snapshot hash, pagination bounds, and priority vocabulary", () => {
    expect(WORK_ORDER_CONTRACT_SNAPSHOT_SHA256).toBe(
      "647eef044ec0e0060ac42cb20c77a2af767fc6822e5f2defa58cd17d51734127",
    );
    expect(WORK_ORDER_LIST_PAGE_SIZE).toBe(15);
    expect(WORK_ORDER_LIST_MAX_PAGES).toBe(20);
    expect([...WORK_ORDER_PRIORITY_IDS]).toEqual(["1", "2", "3"]);
    expect([...WORK_ORDER_CREATE_SAFE_PRIMARY_GROUPS].sort()).toEqual(["1", "2"]);
  });
});

describe("S99 id and flag wire types", () => {
  it("canonical path ids are safe positive integers only", () => {
    expect(canonicalPathId(84, "propertyID")).toBe("84");
    for (const bad of ["84", 0, -3, 2.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2, true]) {
      expectRefusal(() => canonicalPathId(bad, "propertyID"), "invalid_id");
    }
  });

  it("decimal-string ids reject leading zeroes, signs, whitespace, and substitutions", () => {
    expect(decodeDecimalIdString("115", "leaseID")).toBe("115");
    for (const bad of ["007", "+7", " 7", "7 ", "", "7.0", "1e3", 7, true, null]) {
      expectRefusal(() => decodeDecimalIdString(bad, "leaseID"), "invalid_id");
    }
  });

  it('persisted response flags accept only the exact strings "0" and "1"', () => {
    expect(decodeResponseFlag("0", "isVacant")).toBe("0");
    expect(decodeResponseFlag("1", "isVacant")).toBe("1");
    for (const bad of [0, 1, true, false, "true", "", "01", null]) {
      expectRefusal(() => decodeResponseFlag(bad, "isVacant"), "invalid_flag");
    }
  });
});

describe("S99 work-order projection decode", () => {
  it("decodes an allowlisted projection and ignores unlisted provider fields", () => {
    const projection = decodeWorkOrderProjection(
      rawWorkOrder({ portfolioID: "12", technicianData: [{ technicianID: 4 }] }),
    );
    expect(projection.workOrderId).toBe("5150");
    expect(projection.propertyId).toBe("84");
    expect(projection.unitId).toBe("217");
    expect(projection.vendorTradeId).toBe("4");
    expect(projection.isSharedWithTenant).toBe("0");
    expect("portfolioID" in projection).toBe(false);
    expect("technicianData" in projection).toBe(false);
  });

  it("treats absent unit/trade/assignment as null and refuses coerced substitutes", () => {
    const projection = decodeWorkOrderProjection(
      rawWorkOrder({ unitID: null, vendorTradeID: undefined, isNew: undefined }),
    );
    expect(projection.unitId).toBeNull();
    expect(projection.vendorTradeId).toBeNull();
    expect(projection.isNew).toBeNull();
    expectRefusal(
      () => decodeWorkOrderProjection(rawWorkOrder({ workOrderID: 5150 })),
      "invalid_id",
    );
    expectRefusal(
      () => decodeWorkOrderProjection(rawWorkOrder({ isVacant: false })),
      "invalid_flag",
    );
  });
});

describe("S99 response envelopes", () => {
  it("list: bare array of { workOrder, contact } wrappers only", () => {
    const rows = decodeWorkOrderListResponse([
      { workOrder: rawWorkOrder(), contact: null },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].workOrderId).toBe("5150");
    expectRefusal(
      () => decodeWorkOrderListResponse({ workOrders: [] }),
      "invalid_envelope",
    );
    expectRefusal(
      () => decodeWorkOrderListResponse([rawWorkOrder()]),
      "invalid_envelope",
    );
    expectRefusal(
      () =>
        decodeWorkOrderListResponse([
          { workOrder: rawWorkOrder(), schedulingStatusID: 1 },
        ]),
      "invalid_envelope",
    );
  });

  it("detail/create: exactly { workOrder, schedulingStatusID } with integer-or-null", () => {
    const detail = decodeWorkOrderDetailResponse({
      workOrder: rawWorkOrder(),
      schedulingStatusID: null,
    });
    expect(detail.schedulingStatusId).toBeNull();
    expect(
      decodeWorkOrderDetailResponse({ workOrder: rawWorkOrder(), schedulingStatusID: 3 })
        .schedulingStatusId,
    ).toBe(3);
    expectRefusal(
      () => decodeWorkOrderDetailResponse({ workOrder: rawWorkOrder() }),
      "invalid_envelope",
    );
    expectRefusal(
      () =>
        decodeWorkOrderDetailResponse({
          workOrder: rawWorkOrder(),
          schedulingStatusID: "3",
        }),
      "invalid_field",
    );
    expectRefusal(
      () => decodeWorkOrderDetailResponse(rawWorkOrder()),
      "invalid_envelope",
    );
  });

  it("update: { workOrder } or the live detail-shaped envelope; other roots refuse", () => {
    expect(decodeWorkOrderUpdateResponse({ workOrder: rawWorkOrder() }).workOrderId).toBe(
      "5150",
    );
    // The live provider answers updates with the detail-style envelope (observed on the
    // 2026-09-02 S99 cancel proof).
    expect(
      decodeWorkOrderUpdateResponse({
        workOrder: rawWorkOrder(),
        schedulingStatusID: 3,
      }).workOrderId,
    ).toBe("5150");
    expectRefusal(
      () => decodeWorkOrderUpdateResponse(rawWorkOrder()),
      "invalid_envelope",
    );
    expectRefusal(
      () =>
        decodeWorkOrderUpdateResponse({
          workOrder: rawWorkOrder(),
          schedulingStatusID: 3,
          extra: 1,
        }),
      "invalid_envelope",
    );
  });

  it("status catalog: wrapped rows and enveloped detail; bare status objects refuse", () => {
    const status = {
      workOrderStatusID: "9",
      primaryWorkOrderStatusID: "2",
      name: "Open",
      isSystemStatus: "1",
    };
    expect(decodeStatusListResponse([{ workOrderStatus: status }])[0].name).toBe("Open");
    expectRefusal(() => decodeStatusListResponse([status]), "invalid_envelope");
    expect(
      decodeStatusDetailResponse({ workOrderStatus: status }).workOrderStatusId,
    ).toBe("9");
    expectRefusal(() => decodeStatusDetailResponse(status), "invalid_envelope");
  });

  it("trades: bare integer-id list rows and enveloped decimal-string detail, no vendors include", () => {
    expect(decodeTradeListResponse([{ vendorTradeID: 4, name: "Plumbing" }])).toEqual([
      { vendorTradeId: "4", name: "Plumbing" },
    ]);
    // The live provider wraps list rows as { vendorTrade } (observed 2026-09-02 S99 read proof)
    // even though the documentation shows bare objects; both shapes decode.
    expect(
      decodeTradeListResponse([
        { vendorTrade: { vendorTradeID: "4", name: "Plumbing" } },
      ]),
    ).toEqual([{ vendorTradeId: "4", name: "Plumbing" }]);
    expectRefusal(
      () =>
        decodeTradeListResponse([{ vendorTrade: { vendorTradeID: "04", name: "x" } }]),
      "invalid_id",
    );
    // Id typing is orthogonal to wrapping: canonical decimal strings decode in either shape.
    expect(decodeTradeListResponse([{ vendorTradeID: "4", name: "Plumbing" }])).toEqual([
      { vendorTradeId: "4", name: "Plumbing" },
    ]);
    expectRefusal(
      () =>
        decodeTradeListResponse([
          { vendorTrade: { vendorTradeID: 4, name: "Plumbing" }, vendors: [] },
        ]),
      "invalid_envelope",
    );
    expect(
      decodeTradeDetailResponse({ vendorTrade: { vendorTradeID: "4", name: "Plumbing" } })
        .vendorTradeId,
    ).toBe("4");
    expectRefusal(
      () =>
        decodeTradeDetailResponse({
          vendorTrade: { vendorTradeID: "4", name: "Plumbing" },
          vendors: [],
        }),
      "invalid_envelope",
    );
  });
});

describe("S99 list filters", () => {
  it("serializes only the supported typed filters", () => {
    expect(
      canonicalListFilterParams({ propertyID: 84, isNew: 1, startDate: "2026-09-01" }),
    ).toEqual({ propertyID: "84", isNew: "1", startDate: "2026-09-01" });
  });

  it("refuses unknown keys, search strings, coerced ids, and malformed dates", () => {
    expectRefusal(
      () => canonicalListFilterParams({ search: "sink" } as never),
      "invalid_field",
    );
    expectRefusal(
      () => canonicalListFilterParams({ vendorContactID: 5 } as never),
      "invalid_field",
    );
    expectRefusal(
      () => canonicalListFilterParams({ propertyID: "84" } as never),
      "invalid_id",
    );
    expectRefusal(
      () => canonicalListFilterParams({ isNew: 2 as never }),
      "invalid_field",
    );
    expectRefusal(
      () => canonicalListFilterParams({ startDate: "09/01/2026" }),
      "invalid_field",
    );
  });
});

describe("S99 create body serialization", () => {
  const base = {
    propertyID: "84",
    unitID: "217",
    description: "Kitchen sink drips at the trap.",
    priorityID: "2",
    workOrderStatusID: "9",
    isVacant: false,
  };

  it("serializes exactly the allowlisted fields plus the fixed safety literals", () => {
    expect(serializeCreateBody(base)).toEqual({
      propertyID: "84",
      unitID: "217",
      description: "Kitchen sink drips at the trap.",
      priorityID: "2",
      workOrderStatusID: "9",
      isVacant: false,
      isOwnerApproved: false,
      isSharedWithTenant: "0",
      isSharedWithOwner: false,
      sendVendorNotification: false,
      sendEmail: false,
    });
    expect(serializeCreateBody({ ...base, vendorTradeID: "4" })["vendorTradeID"]).toBe(
      "4",
    );
  });

  it("refuses out-of-scope fields, unsupported priority, HTML, and coerced flags", () => {
    expectRefusal(
      () => serializeCreateBody({ ...base, leaseID: "115" } as never),
      "invalid_field",
    );
    expectRefusal(
      () => serializeCreateBody({ ...base, sendEmail: true } as never),
      "invalid_field",
    );
    expectRefusal(
      () => serializeCreateBody({ ...base, priorityID: "4" }),
      "invalid_field",
    );
    expectRefusal(
      () => serializeCreateBody({ ...base, description: "  " }),
      "invalid_field",
    );
    expectRefusal(
      () => serializeCreateBody({ ...base, description: "<script>x</script>" }),
      "invalid_field",
    );
    expectRefusal(
      () => serializeCreateBody({ ...base, isVacant: "true" as never }),
      "invalid_flag",
    );
    expectRefusal(
      () => serializeCreateBody({ ...base, propertyID: "084" }),
      "invalid_id",
    );
  });
});

describe("S99 status-update body", () => {
  it("is exactly the three documented fields with both notification flags false", () => {
    expect(serializeStatusUpdateBody("12")).toEqual({
      workOrderStatusID: "12",
      sendVendorNotification: false,
      sendReview: false,
    });
    expectRefusal(() => serializeStatusUpdateBody("012"), "invalid_id");
  });
});
