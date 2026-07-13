export const GMAIL_RUNTIME_LIMITS = {
  listPageSize: 20,
  maxListPageSize: 50,
  maxQueryLength: 256,
  maxThreadMessages: 50,
  maxMimeParts: 64,
  maxBodyCharacters: 20_000,
  maxThreadBodyCharacters: 100_000,
  maxAttachments: 20,
  maxResponseBytes: 2_000_000,
  maxHistoryPageSize: 100,
} as const;

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

export interface GmailThreadListItem {
  id: string;
  snippet: string;
  historyId?: string;
}

export interface GmailThreadList {
  threads: GmailThreadListItem[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export interface GmailAttachmentMetadata {
  filename: string;
  mimeType: string;
  size: number;
}

export interface GmailMessageView {
  id: string;
  threadId: string;
  labelIds: string[];
  internalDate?: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  date: string;
  messageId: string;
  inReplyTo?: string;
  references: string[];
  bodyText: string;
  bodyTruncated: boolean;
  attachments: GmailAttachmentMetadata[];
}

export interface GmailThreadView {
  id: string;
  historyId?: string;
  messages: GmailMessageView[];
  truncated: boolean;
}

export interface GmailOutgoingMessage {
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  messageId: string;
  threadId?: string;
  inReplyTo?: string;
  references: string[];
}

export interface GmailSendResult {
  messageId: string;
  threadId: string;
  labelIds: string[];
}

export interface GmailWatchResult {
  historyId: string;
  expiration: string;
}

export interface GmailHistoryMessageRef {
  id: string;
  threadId: string;
}

export interface GmailHistoryResult {
  historyId: string;
  messagesAdded: GmailHistoryMessageRef[];
  nextPageToken?: string;
}

export interface GmailApiHeader {
  name?: unknown;
  value?: unknown;
}

export interface GmailApiMessagePart {
  mimeType?: unknown;
  filename?: unknown;
  headers?: unknown;
  body?: unknown;
  parts?: unknown;
}

export interface GmailApiMessage {
  id?: unknown;
  threadId?: unknown;
  labelIds?: unknown;
  internalDate?: unknown;
  payload?: unknown;
}
