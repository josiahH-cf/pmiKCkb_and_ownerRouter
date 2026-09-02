// S100 narrow chat transport: exactly the one documented Basic-Auth GET /chat/messages request
// with fixed Work Order object type, the server-bound object id, one confirmed positive page,
// and page size twenty. There is no all-chat read, no other object type, no message detail, no
// attachment or link-preview fetch, and no POST; none of those is expressible on this class. The
// documented read marks retrieved messages read for managers, so callers treat any dispatched
// request as consequential.

import {
  RentVineAuthError,
  RentVineError,
  RentVineRateLimitError,
  type RentVineClientConfig,
  type RentVineHttpTransport,
} from "@/lib/integrations/rentvine/client";
import {
  CHAT_OBJECT_TYPE_WORK_ORDER,
  CHAT_PAGE_SIZE,
  decodeChatEnvelope,
  decodeChatPaginationHeaders,
  type ChatPagination,
} from "@/lib/integrations/rentvine/chat-contract";

export interface ChatPageRead {
  /** Raw undecoded rows; the caller runs the per-row disposition codec. */
  rows: unknown[];
  pagination: ChatPagination;
}

export class RentVineWorkOrderChatReader {
  private readonly baseUrl: string;
  private readonly authorization: string;

  constructor(
    config: RentVineClientConfig,
    private readonly transport: RentVineHttpTransport,
  ) {
    const url = new URL(config.baseUrl);
    if (url.protocol !== "https:") {
      throw new Error("Rentvine base URL must use https.");
    }
    if (!config.apiKey || !config.apiSecret) {
      throw new Error("RentVine chat credentials are not configured.");
    }
    this.baseUrl = url.toString().replace(/\/$/, "");
    this.authorization = `Basic ${Buffer.from(
      `${config.apiKey}:${config.apiSecret}`,
      "utf8",
    ).toString("base64")}`;
  }

  /**
   * One confirmed page of one Work Order chat. This is the class's only method; every
   * invocation is one consequential provider read.
   */
  async listWorkOrderChatPage(workOrderId: number, page: number): Promise<ChatPageRead> {
    if (!Number.isSafeInteger(workOrderId) || workOrderId <= 0) {
      throw new RentVineError("The chat object id must be a positive integer.", 0);
    }
    if (!Number.isSafeInteger(page) || page <= 0) {
      throw new RentVineError("The confirmed chat page must be a positive integer.", 0);
    }
    const url = new URL(`${this.baseUrl}/chat/messages`);
    url.searchParams.set("chatObjectTypeID", String(CHAT_OBJECT_TYPE_WORK_ORDER));
    url.searchParams.set("objectID", String(workOrderId));
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(CHAT_PAGE_SIZE));
    const response = await this.transport.send({
      method: "GET",
      url: url.toString(),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: this.authorization,
      },
    });
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
        `Rentvine chat list failed (HTTP ${response.status}); no body is included.`,
        response.status,
      );
    }
    const bodyText = await response.text();
    const envelope = decodeChatEnvelope(bodyText);
    const pagination = decodeChatPaginationHeaders(response.headers, page);
    return { rows: envelope.rows, pagination };
  }
}
