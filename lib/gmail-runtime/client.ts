// Per-user Gmail API boundary. The constructor subject comes only from the server-verified app
// session and is reused as the DWD sub. Methods are deliberately small, scope-split, bounded, and
// transport-injected so normal tests never contact Gmail.

import { randomUUID } from "node:crypto";

import { mintGmailDwdToken } from "@/lib/gmail-runtime/dwd-token";
import { parseGmailThread } from "@/lib/gmail-runtime/mime";
import { encodeRawDraft, encodeRawMessage } from "@/lib/gmail-runtime/raw-message";
import {
  GMAIL_COMPOSE_SCOPE,
  GMAIL_LABELS_SCOPE,
  GMAIL_MODIFY_SCOPE,
  GMAIL_READONLY_SCOPE,
} from "@/lib/gmail-runtime/scopes";
import { normalizeGmailSubject } from "@/lib/gmail-runtime/subject";
import {
  createGmailFetchTransport,
  type GmailHttpTransport,
} from "@/lib/gmail-runtime/transport";
import {
  GMAIL_RUNTIME_LIMITS,
  type GmailHistoryMessageRef,
  type GmailHistoryResult,
  type GmailLabel,
  type GmailLabelMutationResult,
  type GmailOutgoingMessage,
  type GmailProfile,
  type GmailSendResult,
  type GmailThreadList,
  type GmailThreadView,
  type GmailWatchResult,
} from "@/lib/gmail-runtime/types";

const GMAIL_API_USER = "https://gmail.googleapis.com/gmail/v1/users/me";
const OPAQUE_GMAIL_ID = /^[A-Za-z0-9_-]{1,200}$/;

export class GmailRuntimeError extends Error {
  readonly status?: number;
  readonly ambiguous: boolean;

  constructor(message: string, status?: number, ambiguous?: boolean) {
    super(message);
    this.name = "GmailRuntimeError";
    this.status = status;
    this.ambiguous =
      ambiguous ??
      (status === undefined || status === 408 || status === 429 || status >= 500);
  }
}

export interface CreatedDraft {
  draftId: string;
  messageId?: string;
  threadId?: string;
}

export class GmailRuntimeClient {
  readonly subject: string;
  private readonly transport: GmailHttpTransport;
  private readonly getToken: (scope: string) => Promise<string>;

  constructor(options: {
    subject: string;
    allowedDomain?: string;
    transport?: GmailHttpTransport;
    getToken?: (scope: string) => Promise<string>;
  }) {
    this.subject = normalizeGmailSubject(options.subject, {
      allowedDomain: options.allowedDomain,
    });
    this.transport = options.transport ?? createGmailFetchTransport();
    this.getToken =
      options.getToken ??
      ((scope) => mintGmailDwdToken({ subject: this.subject, scope }));
  }

  async getProfile(): Promise<GmailProfile> {
    const data = await this.request(GMAIL_READONLY_SCOPE, "GET", "/profile");
    const profile = readProfile(data);
    if (profile.emailAddress.toLowerCase() !== this.subject) {
      throw new GmailRuntimeError("Gmail profile did not match the signed-in user.", 403);
    }
    return profile;
  }

  async listThreads(
    options: {
      maxResults?: number;
      pageToken?: string;
      q?: string;
      labelIds?: readonly string[];
    } = {},
  ): Promise<GmailThreadList> {
    const maxResults = boundedInteger(
      options.maxResults ?? GMAIL_RUNTIME_LIMITS.listPageSize,
      1,
      GMAIL_RUNTIME_LIMITS.maxListPageSize,
    );
    const q = options.q?.trim();
    if (q && q.length > GMAIL_RUNTIME_LIMITS.maxQueryLength) {
      throw new GmailRuntimeError(
        "Gmail query exceeded the configured limit.",
        400,
        false,
      );
    }
    const data = await this.request(GMAIL_READONLY_SCOPE, "GET", "/threads", {
      query: {
        maxResults: String(maxResults),
        ...(options.pageToken ? { pageToken: boundedToken(options.pageToken) } : {}),
        ...(q ? { q } : {}),
        ...((options.labelIds ?? []).length
          ? { labelIds: options.labelIds!.slice(0, 10).join(",") }
          : {}),
      },
    });
    if (!isRecord(data))
      throw new GmailRuntimeError("Gmail returned an invalid thread list.");
    const threads = Array.isArray(data.threads)
      ? data.threads.slice(0, maxResults).flatMap((value) => {
          if (!isRecord(value) || !optionalString(value.id)) return [];
          return [
            {
              id: optionalString(value.id)!,
              snippet: optionalString(value.snippet)?.slice(0, 500) ?? "",
              ...(optionalString(value.historyId)
                ? { historyId: optionalString(value.historyId) }
                : {}),
            },
          ];
        })
      : [];
    return {
      threads,
      ...(optionalString(data.nextPageToken)
        ? { nextPageToken: optionalString(data.nextPageToken) }
        : {}),
      resultSizeEstimate: finiteNumber(data.resultSizeEstimate),
    };
  }

  async getThread(threadId: string): Promise<GmailThreadView> {
    const id = opaqueId(threadId, "thread id");
    const data = await this.request(
      GMAIL_READONLY_SCOPE,
      "GET",
      `/threads/${encodeURIComponent(id)}`,
      { query: { format: "full" } },
    );
    return parseGmailThread(data);
  }

  /** Create an unsent draft. gmail.compose is send-capable; this method itself never sends. */
  async createDraft(
    input: GmailOutgoingMessage | { to: string; subject: string; body: string },
  ): Promise<CreatedDraft> {
    let outgoing: GmailOutgoingMessage | undefined;
    let raw: string;
    if (isFullOutgoing(input)) {
      outgoing = input;
      raw = encodeRawMessage(input);
    } else {
      raw = encodeRawDraft({ ...input, from: this.subject });
    }
    const data = await this.request(GMAIL_COMPOSE_SCOPE, "POST", "/drafts", {
      body: {
        message: {
          raw,
          ...(outgoing?.threadId ? { threadId: outgoing.threadId } : {}),
        },
      },
    });
    if (!isRecord(data) || !optionalString(data.id)) {
      throw new GmailRuntimeError("Gmail draft create returned no draft id.");
    }
    const message = isRecord(data.message) ? data.message : {};
    return {
      draftId: optionalString(data.id)!,
      ...(optionalString(message.id) ? { messageId: optionalString(message.id) } : {}),
      ...(optionalString(message.threadId)
        ? { threadId: optionalString(message.threadId) }
        : {}),
    };
  }

  /** One explicit Gmail send attempt. The caller must consume an exact-payload confirmation first. */
  async sendMessage(input: GmailOutgoingMessage): Promise<GmailSendResult> {
    if (input.from.toLowerCase() !== this.subject) {
      throw new GmailRuntimeError(
        "Gmail From must match the signed-in user.",
        403,
        false,
      );
    }
    const data = await this.request(GMAIL_COMPOSE_SCOPE, "POST", "/messages/send", {
      body: {
        raw: encodeRawMessage(input),
        ...(input.threadId ? { threadId: opaqueId(input.threadId, "thread id") } : {}),
      },
    });
    return readSendResult(data);
  }

  async findMessageByRfcMessageId(rfcMessageId: string): Promise<GmailSendResult | null> {
    const messageId = safeRfcMessageId(rfcMessageId);
    const data = await this.request(GMAIL_READONLY_SCOPE, "GET", "/messages", {
      query: { q: `rfc822msgid:${messageId}`, maxResults: "2" },
    });
    if (!isRecord(data) || !Array.isArray(data.messages) || data.messages.length === 0) {
      return null;
    }
    const first = data.messages[0];
    if (!isRecord(first)) return null;
    const id = optionalString(first.id);
    const threadId = optionalString(first.threadId);
    return id && threadId ? { messageId: id, threadId, labelIds: [] } : null;
  }

  async listLabels(): Promise<GmailLabel[]> {
    const data = await this.request(GMAIL_LABELS_SCOPE, "GET", "/labels");
    if (!isRecord(data) || !Array.isArray(data.labels)) {
      throw new GmailRuntimeError("Gmail returned an invalid label list.");
    }
    return data.labels.slice(0, 1_000).flatMap((value) => {
      if (!isRecord(value)) return [];
      const id = optionalString(value.id);
      const name = optionalString(value.name);
      const type = optionalString(value.type)?.toLowerCase();
      if (!id || !name || (type !== "system" && type !== "user")) return [];
      return [{ id, name, type }];
    });
  }

  async createLabel(labelName: string): Promise<GmailLabel> {
    const name = safeLabelName(labelName);
    const data = await this.request(GMAIL_LABELS_SCOPE, "POST", "/labels", {
      body: {
        name,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });
    if (!isRecord(data)) throw new GmailRuntimeError("Gmail returned an invalid label.");
    const id = requiredString(data.id, "label id");
    return { id, name: requiredString(data.name, "label name"), type: "user" };
  }

  async applyThreadLabel(
    threadId: string,
    labelName: string,
  ): Promise<GmailLabelMutationResult> {
    const id = opaqueId(threadId, "thread id");
    const name = safeLabelName(labelName);
    const labels = await this.listLabels();
    let label = labels.find(
      (candidate) => candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (!label) label = await this.createLabel(name);
    if (label.type !== "user") {
      throw new GmailRuntimeError(
        "Only a user label can be applied through the Gmail hub.",
        400,
        false,
      );
    }
    const data = await this.request(
      GMAIL_MODIFY_SCOPE,
      "POST",
      `/threads/${encodeURIComponent(id)}/modify`,
      { body: { addLabelIds: [label.id], removeLabelIds: [] } },
    );
    if (!isRecord(data)) {
      throw new GmailRuntimeError("Gmail returned an invalid label mutation.");
    }
    return {
      threadId: requiredString(data.id, "labeled thread id"),
      labelId: label.id,
      labelName: label.name,
      labelIds: Array.isArray(data.labelIds)
        ? data.labelIds
            .filter((value): value is string => typeof value === "string")
            .slice(0, 100)
        : [],
    };
  }

  async watchMailbox(topicName: string): Promise<GmailWatchResult> {
    const topic = topicName.trim();
    if (
      !/^projects\/[a-z][a-z0-9-]{4,61}[a-z0-9]\/topics\/[A-Za-z0-9._~-]{1,255}$/.test(
        topic,
      )
    ) {
      throw new GmailRuntimeError("Gmail watch topic is invalid.", 400, false);
    }
    const data = await this.request(GMAIL_READONLY_SCOPE, "POST", "/watch", {
      body: {
        topicName: topic,
        labelIds: ["INBOX"],
        labelFilterBehavior: "INCLUDE",
      },
    });
    if (!isRecord(data)) throw new GmailRuntimeError("Gmail returned an invalid watch.");
    return {
      historyId: digits(
        requiredString(data.historyId, "watch history id"),
        "watch history id",
      ),
      expiration: digits(
        requiredString(data.expiration, "watch expiration"),
        "watch expiration",
      ),
    };
  }

  async listHistory(options: {
    startHistoryId: string;
    pageToken?: string;
    maxResults?: number;
  }): Promise<GmailHistoryResult> {
    const startHistoryId = digits(options.startHistoryId, "history id");
    const maxResults = boundedInteger(
      options.maxResults ?? GMAIL_RUNTIME_LIMITS.maxHistoryPageSize,
      1,
      GMAIL_RUNTIME_LIMITS.maxHistoryPageSize,
    );
    const data = await this.request(GMAIL_READONLY_SCOPE, "GET", "/history", {
      query: {
        startHistoryId,
        maxResults: String(maxResults),
        historyTypes: "messageAdded",
        labelId: "INBOX",
        ...(options.pageToken ? { pageToken: boundedToken(options.pageToken) } : {}),
      },
    });
    if (!isRecord(data)) throw new GmailRuntimeError("Gmail returned invalid history.");
    const refs = new Map<string, GmailHistoryMessageRef>();
    if (Array.isArray(data.history)) {
      for (const rawHistory of data.history.slice(0, maxResults)) {
        if (!isRecord(rawHistory) || !Array.isArray(rawHistory.messagesAdded)) continue;
        for (const rawAdded of rawHistory.messagesAdded) {
          if (!isRecord(rawAdded) || !isRecord(rawAdded.message)) continue;
          const id = optionalString(rawAdded.message.id);
          const threadId = optionalString(rawAdded.message.threadId);
          if (id && threadId) refs.set(id, { id, threadId });
        }
      }
    }
    return {
      historyId: requiredString(data.historyId, "history cursor"),
      messagesAdded: [...refs.values()].slice(0, maxResults),
      ...(optionalString(data.nextPageToken)
        ? { nextPageToken: optionalString(data.nextPageToken) }
        : {}),
    };
  }

  private async request(
    scope: string,
    method: string,
    path: string,
    options: {
      query?: Record<string, string>;
      body?: unknown;
    } = {},
  ): Promise<unknown> {
    const token = await this.getToken(scope);
    const url = new URL(`${GMAIL_API_USER}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    let response;
    try {
      response = await this.transport.send({
        url: url.toString(),
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch {
      throw new GmailRuntimeError(
        "Gmail request failed before a definitive response.",
        undefined,
        true,
      );
    }

    if (response.status < 200 || response.status >= 300) {
      throw new GmailRuntimeError(
        `Gmail request failed (HTTP ${response.status}).`,
        response.status,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new GmailRuntimeError("Gmail returned an invalid response.");
    }
  }
}

export function createRfcMessageId(subject: string): string {
  const domain = normalizeGmailSubject(subject).split("@")[1];
  return `<${randomUUID()}@${domain}>`;
}

function readProfile(data: unknown): GmailProfile {
  if (!isRecord(data)) throw new GmailRuntimeError("Gmail returned an invalid profile.");
  return {
    emailAddress: requiredString(data.emailAddress, "profile email"),
    messagesTotal: finiteNumber(data.messagesTotal),
    threadsTotal: finiteNumber(data.threadsTotal),
    historyId: requiredString(data.historyId, "profile history id"),
  };
}

function readSendResult(data: unknown): GmailSendResult {
  if (!isRecord(data))
    throw new GmailRuntimeError("Gmail returned an invalid send result.");
  return {
    messageId: requiredString(data.id, "sent message id"),
    threadId: requiredString(data.threadId, "sent thread id"),
    labelIds: Array.isArray(data.labelIds)
      ? data.labelIds
          .filter((value): value is string => typeof value === "string")
          .slice(0, 100)
      : [],
  };
}

function isFullOutgoing(
  input: GmailOutgoingMessage | { to: string; subject: string; body: string },
): input is GmailOutgoingMessage {
  return "messageId" in input && Array.isArray(input.to);
}

function opaqueId(value: string, label: string): string {
  const normalized = value.trim();
  if (!OPAQUE_GMAIL_ID.test(normalized)) {
    throw new GmailRuntimeError(`Gmail ${label} is invalid.`, 400, false);
  }
  return normalized;
}

function safeLabelName(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 225 ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new GmailRuntimeError("Gmail label name is invalid.", 400, false);
  }
  return normalized;
}

function safeRfcMessageId(value: string): string {
  const normalized = value.trim();
  if (!/^<[^<>\s@]+@[^<>\s@]+>$/.test(normalized)) {
    throw new GmailRuntimeError("RFC Message-ID is invalid.", 400, false);
  }
  return normalized;
}

function digits(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^\d{1,30}$/.test(normalized)) {
    throw new GmailRuntimeError(`Gmail ${label} is invalid.`, 400, false);
  }
  return normalized;
}

function boundedToken(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._~-]{1,500}$/.test(normalized)) {
    throw new GmailRuntimeError("Gmail page token is invalid.", 400, false);
  }
  return normalized;
}

function boundedInteger(value: number, min: number, max: number): number {
  return Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : min;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function requiredString(value: unknown, label: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new GmailRuntimeError(`Gmail returned no ${label}.`);
  return parsed;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
