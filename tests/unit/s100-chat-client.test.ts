import { describe, expect, it } from "vitest";

import { RentVineAuthError, RentVineError } from "@/lib/integrations/rentvine/client";
import { RentVineWorkOrderChatReader } from "@/lib/integrations/rentvine/chat-client";
import { ChatContractError } from "@/lib/integrations/rentvine/chat-contract";

const CONFIG = {
  baseUrl: "https://pmikcmetro.rentvine.com/api/manager",
  apiKey: "unit-key",
  apiSecret: "unit-secret",
};

function transportOf(
  respond: () => {
    status: number;
    headers?: Record<string, string>;
    body: string;
  },
) {
  const sent: { method: string; url: string }[] = [];
  return {
    sent,
    transport: {
      async send(request: { method: string; url: string }) {
        sent.push(request);
        const { status, headers, body } = respond();
        return {
          status,
          headers: headers ?? {},
          text: async () => body,
          json: async () => JSON.parse(body) as unknown,
        };
      },
    },
  };
}

const OK_HEADERS = {
  "pagination-current-page": "1",
  "pagination-page-size": "20",
  "pagination-total-items": "0",
  "pagination-total-pages": "1",
};

describe("S100 chat reader", () => {
  it("sends exactly the documented fixed-type one-page query", async () => {
    const { sent, transport } = transportOf(() => ({
      status: 200,
      headers: OK_HEADERS,
      body: "[]",
    }));
    const reader = new RentVineWorkOrderChatReader(CONFIG, transport);
    const read = await reader.listWorkOrderChatPage(9005, 1);
    expect(read.rows).toEqual([]);
    expect(read.pagination.nextPage).toBeNull();
    expect(sent).toHaveLength(1);
    const url = new URL(sent[0].url);
    expect(url.pathname).toBe("/api/manager/chat/messages");
    expect(Object.fromEntries(url.searchParams.entries())).toEqual({
      chatObjectTypeID: "1",
      objectID: "9005",
      page: "1",
      pageSize: "20",
    });
    expect(sent[0].method).toBe("GET");
  });

  it("refuses invalid ids and pages before any transport call", async () => {
    const { sent, transport } = transportOf(() => ({
      status: 200,
      headers: OK_HEADERS,
      body: "[]",
    }));
    const reader = new RentVineWorkOrderChatReader(CONFIG, transport);
    await expect(reader.listWorkOrderChatPage(0, 1)).rejects.toBeInstanceOf(
      RentVineError,
    );
    await expect(reader.listWorkOrderChatPage(9005, 0)).rejects.toBeInstanceOf(
      RentVineError,
    );
    await expect(reader.listWorkOrderChatPage(9005, 1.5)).rejects.toBeInstanceOf(
      RentVineError,
    );
    expect(sent).toHaveLength(0);
  });

  it("maps auth failures and surfaces malformed envelopes/headers as contract errors", async () => {
    const auth = transportOf(() => ({ status: 401, body: "{}" }));
    await expect(
      new RentVineWorkOrderChatReader(CONFIG, auth.transport).listWorkOrderChatPage(
        9005,
        1,
      ),
    ).rejects.toBeInstanceOf(RentVineAuthError);

    const wrapped = transportOf(() => ({
      status: 200,
      headers: OK_HEADERS,
      body: '{"messages":[]}',
    }));
    await expect(
      new RentVineWorkOrderChatReader(CONFIG, wrapped.transport).listWorkOrderChatPage(
        9005,
        1,
      ),
    ).rejects.toBeInstanceOf(ChatContractError);

    const badHeaders = transportOf(() => ({
      status: 200,
      headers: { ...OK_HEADERS, "pagination-current-page": "2" },
      body: "[]",
    }));
    await expect(
      new RentVineWorkOrderChatReader(CONFIG, badHeaders.transport).listWorkOrderChatPage(
        9005,
        1,
      ),
    ).rejects.toBeInstanceOf(ChatContractError);
  });

  it("has no other provider method", () => {
    const { transport } = transportOf(() => ({ status: 200, body: "[]" }));
    const reader = new RentVineWorkOrderChatReader(CONFIG, transport);
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(reader)).filter(
      (name) => name !== "constructor",
    );
    expect(methods).toEqual(["listWorkOrderChatPage"]);
  });
});
