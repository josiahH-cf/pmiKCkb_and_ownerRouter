import { describe, expect, it } from "vitest";

import { RentVineAuthError } from "@/lib/integrations/rentvine/client";
import {
  RentVineWorkOrderReader,
  RentVineWorkOrderWriter,
} from "@/lib/integrations/rentvine/work-order-client";
import { WorkOrderContractError } from "@/lib/integrations/rentvine/work-order-contract";

const CONFIG = {
  baseUrl: "https://pmikcmetro.rentvine.com/api/manager",
  apiKey: "unit-key",
  apiSecret: "unit-secret",
};

interface Sent {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

function transportOf(respond: (request: Sent) => { status: number; body: unknown }) {
  const sent: Sent[] = [];
  return {
    sent,
    transport: {
      async send(request: Sent) {
        sent.push(request);
        const { status, body } = respond(request);
        return {
          status,
          headers: {} as Record<string, string>,
          text: async () => JSON.stringify(body),
          json: async () => body,
        };
      },
    },
  };
}

function rawWorkOrder(id: string): Record<string, unknown> {
  return {
    workOrderID: id,
    workOrderNumber: `WO-${id}`,
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
  };
}

function listRow(id: string) {
  return { workOrder: rawWorkOrder(id), contact: null };
}

describe("S99 work-order reader", () => {
  it("sends exact typed list queries with explicit page and the documented pageSize", async () => {
    const { sent, transport } = transportOf(() => ({ status: 200, body: [] }));
    const reader = new RentVineWorkOrderReader(CONFIG, transport);
    await reader.listWorkOrdersPage({ propertyID: 84, isNew: 1 }, 2);
    const url = new URL(sent[0].url);
    expect(url.pathname).toBe("/api/manager/maintenance/work-orders");
    expect(Object.fromEntries(url.searchParams.entries())).toEqual({
      propertyID: "84",
      isNew: "1",
      page: "2",
      pageSize: "15",
    });
    expect(sent[0].method).toBe("GET");
    expect(sent[0].headers.Authorization.startsWith("Basic ")).toBe(true);
  });

  it("pages until a short page, deduplicates by id, and reports complete", async () => {
    const pages: unknown[][] = [
      Array.from({ length: 15 }, (_, index) => listRow(String(100 + index))),
      [listRow("100"), listRow("200")],
    ];
    const { sent, transport } = transportOf((request) => {
      const page = Number(new URL(request.url).searchParams.get("page"));
      return { status: 200, body: pages[page - 1] ?? [] };
    });
    const reader = new RentVineWorkOrderReader(CONFIG, transport);
    const result = await reader.listWorkOrdersBounded({ propertyID: 84 });
    expect(sent).toHaveLength(2);
    expect(result.complete).toBe(true);
    expect(result.pages).toBe(2);
    expect(result.rows).toHaveLength(16);
  });

  it("stops at the 20-page cap and reports the read as incomplete", async () => {
    let serial = 0;
    const { sent, transport } = transportOf(() => ({
      status: 200,
      body: Array.from({ length: 15 }, () => listRow(String(++serial))),
    }));
    const reader = new RentVineWorkOrderReader(CONFIG, transport);
    const result = await reader.listWorkOrdersBounded({ propertyID: 84 });
    expect(sent).toHaveLength(20);
    expect(result.complete).toBe(false);
    expect(result.rows).toHaveLength(300);
  });

  it("reads detail, status catalog, and trades through their exact envelopes", async () => {
    const { transport } = transportOf((request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith("/work-orders/5150")) {
        return {
          status: 200,
          body: { workOrder: rawWorkOrder("5150"), schedulingStatusID: null },
        };
      }
      if (path.endsWith("/work-order/statuses")) {
        return {
          status: 200,
          body: [
            {
              workOrderStatus: {
                workOrderStatusID: "9",
                primaryWorkOrderStatusID: "2",
                name: "Open",
                isSystemStatus: "1",
              },
            },
          ],
        };
      }
      if (path.endsWith("/vendor-trades")) {
        return { status: 200, body: [{ vendorTradeID: 4, name: "Plumbing" }] };
      }
      if (path.endsWith("/vendor-trades/4")) {
        return {
          status: 200,
          body: { vendorTrade: { vendorTradeID: "4", name: "Plumbing" } },
        };
      }
      throw new Error(`unexpected path ${path}`);
    });
    const reader = new RentVineWorkOrderReader(CONFIG, transport);
    expect((await reader.getWorkOrder(5150)).workOrder.workOrderId).toBe("5150");
    expect((await reader.listWorkOrderStatuses())[0].name).toBe("Open");
    expect((await reader.listVendorTrades())[0].vendorTradeId).toBe("4");
    expect((await reader.getVendorTrade(4)).name).toBe("Plumbing");
  });

  it("refuses a trade detail whose identity differs from the requested path id", async () => {
    const { transport } = transportOf(() => ({
      status: 200,
      body: { vendorTrade: { vendorTradeID: "5", name: "Electrical" } },
    }));
    const reader = new RentVineWorkOrderReader(CONFIG, transport);
    await expect(reader.getVendorTrade(4)).rejects.toThrow(/identity/);
  });

  it("maps 401/403 to the auth error and refuses invalid path ids before transport", async () => {
    const { sent, transport } = transportOf(() => ({ status: 401, body: {} }));
    const reader = new RentVineWorkOrderReader(CONFIG, transport);
    await expect(reader.getWorkOrder(5150)).rejects.toBeInstanceOf(RentVineAuthError);
    await expect(reader.getWorkOrder(0)).rejects.toBeInstanceOf(WorkOrderContractError);
    expect(sent).toHaveLength(1);
  });
});

describe("S99 work-order writer", () => {
  it("creates with the exact fixed-flag body and decodes the create envelope", async () => {
    const { sent, transport } = transportOf(() => ({
      status: 200,
      body: { workOrder: rawWorkOrder("5150"), schedulingStatusID: null },
    }));
    const writer = new RentVineWorkOrderWriter(CONFIG, transport);
    const detail = await writer.createWorkOrder({
      propertyID: "84",
      unitID: "217",
      description: "Kitchen sink drips at the trap.",
      priorityID: "2",
      workOrderStatusID: "9",
      isVacant: false,
    });
    expect(detail.workOrder.workOrderId).toBe("5150");
    expect(new URL(sent[0].url).pathname).toBe("/api/manager/maintenance/work-orders");
    expect(JSON.parse(sent[0].body ?? "")).toEqual({
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
  });

  it("updates status with only the three-field body against the exact id path", async () => {
    const { sent, transport } = transportOf(() => ({
      status: 200,
      body: { workOrder: { ...rawWorkOrder("5150"), workOrderStatusID: "12" } },
    }));
    const writer = new RentVineWorkOrderWriter(CONFIG, transport);
    const updated = await writer.updateWorkOrderStatus(5150, "12");
    expect(updated.workOrderStatusId).toBe("12");
    expect(new URL(sent[0].url).pathname).toBe(
      "/api/manager/maintenance/work-orders/5150",
    );
    expect(JSON.parse(sent[0].body ?? "")).toEqual({
      workOrderStatusID: "12",
      sendVendorNotification: false,
      sendReview: false,
    });
  });

  it("refuses a detail-shaped envelope as update success", async () => {
    const { transport } = transportOf(() => ({
      status: 200,
      body: { workOrder: rawWorkOrder("5150"), schedulingStatusID: 1 },
    }));
    const writer = new RentVineWorkOrderWriter(CONFIG, transport);
    await expect(writer.updateWorkOrderStatus(5150, "12")).rejects.toBeInstanceOf(
      WorkOrderContractError,
    );
  });

  it("never constructs with missing credentials or a non-https base", () => {
    expect(
      () =>
        new RentVineWorkOrderWriter(
          { ...CONFIG, apiSecret: "" },
          {
            send: async () => ({
              status: 200,
              headers: {},
              text: async () => "",
              json: async () => ({}),
            }),
          },
        ),
    ).toThrow(/credentials/);
    expect(
      () =>
        new RentVineWorkOrderReader(
          { ...CONFIG, baseUrl: "http://pmikcmetro.rentvine.com/api/manager" },
          {
            send: async () => ({
              status: 200,
              headers: {},
              text: async () => "",
              json: async () => ({}),
            }),
          },
        ),
    ).toThrow(/https/);
  });
});
