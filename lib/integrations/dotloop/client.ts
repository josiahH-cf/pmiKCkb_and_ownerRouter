// S106/S34: the typed Dotloop Public API v2 client.
//
// It exposes only exact documented operations as named, typed methods. S106 reads: account,
// profiles, a profile's loop templates, and subscription readability. S34 adds the loop lane: a
// profile's loops (one batch at a time, for reconciliation by exact name), one loop, its
// participants, loop-it creation, the detail patch, participant add, folder create, and the
// multipart document upload plus folder document list. There is deliberately NO generic request
// function: a new Dotloop capability must be added here as its own method with its own review.
//
// Transport and token supply are injected, so this module performs no network call by itself and
// holds no credential. A token value is used only as the bearer header of one request; it is never
// logged, returned, embedded in a URL, or persisted here. Every request, the multipart upload
// included, shares one contract: one refresh on 401, one bounded real-time back-off on 429, and
// one process-wide request scheduler for the company connection's documented 100-per-minute limit.
// A mutating request whose outcome is unknown (lost response, timeout, 5xx) is reported as
// `uncertain` and is never sent again by this client.
//
// Provider contract (official Dotloop Public API v2, read 2026-09-03 and re-read 2026-09-06):
//   base `https://api-gateway.dotloop.com/public/v2/`; `GET /account`; `GET /profile`;
//   `GET /profile/{profile_id}/loop-template`; `GET /subscription`; pagination `batch_size` (max
//   100) and `batch_number`; 100 requests per minute per user with `X-RateLimit-*` headers.
//   `POST /profile/{profile_id}/loop` accepts only name/status/transactionType; a loop created FROM
//   A TEMPLATE with participants and a property address is `POST /loop-it?profile_id=`.

import { randomUUID } from "node:crypto";
import type { DotloopParticipantRole } from "@/lib/integrations/dotloop/participant-roles";

import {
  DotloopRateWaitExceeded,
  DotloopRequestScheduler,
  sharedDotloopRequestScheduler,
} from "@/lib/integrations/dotloop/request-scheduler";

export const DOTLOOP_API_BASE = "https://api-gateway.dotloop.com/public/v2/";

/** Multipart line separator, kept as a named constant so it survives formatting. */
const CRLF = String.fromCharCode(13, 10);
const TEXT = new TextEncoder();
export const DOTLOOP_MAX_BATCH_SIZE = 100;

/** The documented scopes this application requests. No scope is inferred or widened at runtime. */
export const DOTLOOP_SCOPES = [
  "account:read",
  "profile:read",
  "loop:read",
  "loop:write",
  "template:read",
] as const;

export type DotloopScope = (typeof DOTLOOP_SCOPES)[number];

export interface DotloopHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  json(): Promise<unknown>;
}

export interface DotloopHttpRequest {
  readonly url: string;
  readonly method: "GET" | "POST" | "PATCH";
  readonly headers: Record<string, string>;
  /** JSON or form text, or the exact multipart bytes of an upload. Never re-encoded. */
  readonly body?: string | Uint8Array<ArrayBuffer>;
}

export interface DotloopHttpTransport {
  fetch(request: DotloopHttpRequest): Promise<DotloopHttpResponse>;
}

/**
 * Supplies the current bearer token and performs one project-owned refresh. The client never sees a
 * refresh token: the provider owns that value inside its own vault-backed implementation.
 */
export interface DotloopAccessTokenProvider {
  accessToken(): Promise<string>;
  /** Returns the new access token, or null when refresh is impossible (revoked or unconfigured). */
  refresh(): Promise<string | null>;
}

export type DotloopClientErrorKind =
  | "refresh_needed"
  | "rate_limited"
  | "unavailable"
  | "not_found"
  | "malformed_response"
  /** A mutating request whose provider outcome is unknown. It is never redispatched here. */
  | "uncertain";

export class DotloopClientError extends Error {
  constructor(
    readonly kind: DotloopClientErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DotloopClientError";
  }
}

export interface DotloopAccount {
  readonly id: string;
  readonly name: string | null;
  /** The documented account email; it identifies which Dotloop account was connected. */
  readonly email: string | null;
  readonly defaultProfileId: string | null;
}

/** Documented profile types. Loop-It renewal work uses an individual profile. */
export const DOTLOOP_PROFILE_TYPES = [
  "INDIVIDUAL",
  "TEAM",
  "OFFICE",
  "COMPANY",
  "ASSOCIATION",
  "NATIONAL_PARTNER",
] as const;

export interface DotloopProfile {
  readonly id: string;
  readonly name: string;
  /** The documented profile type, or null when the provider did not report one. */
  readonly type: string | null;
  readonly isDefault: boolean | null;
  readonly requiresTemplate: boolean | null;
}

export interface DotloopLoopTemplate {
  readonly id: string;
  readonly name: string;
  /** The documented template transaction type, or null when it was not reported. */
  readonly transactionType: string | null;
  readonly shared: boolean | null;
  readonly global: boolean | null;
}

/** Documented lease transaction types. The owner selects one; the app never guesses. */
export const DOTLOOP_TRANSACTION_TYPES = ["LISTING_FOR_LEASE", "LEASE_OFFER"] as const;
export type DotloopTransactionType = (typeof DOTLOOP_TRANSACTION_TYPES)[number];

/** Documented participant roles. */
export {
  DOTLOOP_PARTICIPANT_ROLES,
  type DotloopParticipantRole,
} from "@/lib/integrations/dotloop/participant-roles";

/** The documented loop name limit. */
export const DOTLOOP_LOOP_NAME_MAX_LENGTH = 200;

export interface DotloopDocument {
  readonly id: string;
  readonly name: string;
}

export interface DotloopLoop {
  readonly id: string;
  readonly name: string;
  readonly status: string | null;
  readonly loopUrl: string | null;
  readonly participantCount: number | null;
}

export interface DotloopBatchOptions {
  readonly batchSize?: number;
  readonly batchNumber?: number;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The documented envelope wraps results in `data`; a bare array is accepted for robustness. */
function readDataArray(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body))
    return body.filter((item): item is Record<string, unknown> =>
      Boolean(readRecord(item)),
    );
  const record = readRecord(body);
  const data = record?.data;
  if (!Array.isArray(data)) return [];
  return data.filter((item): item is Record<string, unknown> =>
    Boolean(readRecord(item)),
  );
}

function readIdentity(raw: Record<string, unknown>): { id: string; name: string } | null {
  const rawId = raw.id ?? raw.profileId ?? raw.templateId ?? raw.loopTemplateId;
  if (rawId === undefined || rawId === null) return null;
  const id = String(rawId).trim();
  if (id === "") return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  return { id, name };
}

function readLoop(raw: Record<string, unknown> | null): DotloopLoop | null {
  if (!raw) return null;
  const rawId = raw.id ?? raw.loopId;
  if (rawId === undefined || rawId === null) return null;
  const id = String(rawId).trim();
  if (id === "") return null;
  const participants = raw.participants;
  return {
    id,
    name: typeof raw.name === "string" ? raw.name : "",
    status: typeof raw.status === "string" ? raw.status : null,
    loopUrl: typeof raw.loopUrl === "string" ? raw.loopUrl : null,
    participantCount: Array.isArray(participants)
      ? participants.length
      : typeof raw.participantCount === "number"
        ? raw.participantCount
        : null,
  };
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readFlag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readOptionalId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const id = String(value).trim();
  return id === "" ? null : id;
}

/** The default wait: real time. Tests inject a controlled clock; production never uses a no-op. */
function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

export interface DotloopClientDeps {
  readonly transport: DotloopHttpTransport;
  readonly tokens: DotloopAccessTokenProvider;
  readonly baseUrl?: string;
  /**
   * The shared accounting for the company connection. Defaults to the process-wide scheduler so
   * every caller observes the same documented limit and back-off.
   */
  readonly scheduler?: DotloopRequestScheduler;
  /** Real time by default; injected only so tests control the clock. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export class DotloopClient {
  readonly #transport: DotloopHttpTransport;
  readonly #tokens: DotloopAccessTokenProvider;
  readonly #baseUrl: string;
  readonly #scheduler: DotloopRequestScheduler;
  readonly #sleep: (ms: number) => Promise<void>;

  constructor(deps: DotloopClientDeps) {
    this.#transport = deps.transport;
    this.#tokens = deps.tokens;
    this.#baseUrl = deps.baseUrl ?? DOTLOOP_API_BASE;
    // A test that controls time with `sleep` gets its own scheduler on that same clock; production
    // constructs no `sleep` and always shares the one process-wide scheduler.
    this.#scheduler =
      deps.scheduler ??
      (deps.sleep
        ? new DotloopRequestScheduler({
            clock: { now: () => Date.now(), sleep: deps.sleep },
          })
        : sharedDotloopRequestScheduler());
    this.#sleep = deps.sleep ?? realSleep;
  }

  async getAccount(): Promise<DotloopAccount> {
    const body = await this.#get("account");
    const record = readRecord(readRecord(body)?.data ?? body);
    const rawId = record?.id;
    if (rawId === undefined || rawId === null) {
      throw new DotloopClientError(
        "malformed_response",
        "The account response had no id.",
      );
    }
    const first = readText(record?.firstName);
    const last = readText(record?.lastName);
    const joined = [first, last].filter(Boolean).join(" ");
    return {
      id: String(rawId),
      name: readText(record?.name) ?? (joined === "" ? null : joined),
      email: readText(record?.email),
      defaultProfileId: readOptionalId(record?.defaultProfileId),
    };
  }

  async listProfiles(options: DotloopBatchOptions = {}): Promise<DotloopProfile[]> {
    const body = await this.#get("profile", options);
    return readDataArray(body).flatMap((raw) => {
      const identity = readIdentity(raw);
      return identity
        ? [
            {
              ...identity,
              type: readText(raw.type),
              isDefault: readFlag(raw.default),
              requiresTemplate: readFlag(raw.requiresTemplate),
            },
          ]
        : [];
    });
  }

  async listLoopTemplates(
    profileId: string,
    options: DotloopBatchOptions = {},
  ): Promise<DotloopLoopTemplate[]> {
    const exact = profileId.trim();
    if (exact === "") {
      throw new DotloopClientError(
        "not_found",
        "A loop-template read needs the exact profile id.",
      );
    }
    const body = await this.#get(
      `profile/${encodeURIComponent(exact)}/loop-template`,
      options,
    );
    return readDataArray(body).flatMap((raw) => {
      const identity = readIdentity(raw);
      return identity
        ? [
            {
              ...identity,
              transactionType: readText(raw.transactionType),
              shared: readFlag(raw.shared),
              global: readFlag(raw.global),
            },
          ]
        : [];
    });
  }

  /** One loop by id, or null when the profile has no such loop. */
  async getLoop(profileId: string, loopId: string): Promise<DotloopLoop | null> {
    try {
      const body = await this.#get(
        `profile/${encodeURIComponent(profileId.trim())}/loop/${encodeURIComponent(loopId.trim())}`,
      );
      return readLoop(readRecord(readRecord(body)?.data ?? body));
    } catch (error) {
      if (error instanceof DotloopClientError && error.kind === "not_found") return null;
      throw error;
    }
  }

  /** One documented batch of a profile's loops, for reconciliation by exact loop name. */
  async listLoops(
    profileId: string,
    options: DotloopBatchOptions = {},
  ): Promise<DotloopLoop[]> {
    const body = await this.#get(
      `profile/${encodeURIComponent(profileId.trim())}/loop`,
      options,
    );
    return readDataArray(body).flatMap((raw) => {
      const loop = readLoop(raw);
      return loop ? [loop] : [];
    });
  }

  /**
   * Create one loop from the selected template through the documented `POST /loop-it` operation,
   * the only create that accepts `templateId`, participants, and the property address in one call
   * (`POST /profile/{id}/loop` documents name/status/transactionType only). The name is the app's
   * reconciliation identity.
   */
  async createLoop(input: {
    profileId: string;
    name: string;
    templateId: string;
    transactionType: DotloopTransactionType;
    status: string;
    participants?: readonly {
      fullName: string;
      email: string;
      role: DotloopParticipantRole;
    }[];
    address?: {
      streetName: string;
      streetNumber?: string;
      unit?: string;
      city: string;
      state: string;
      zipCode: string;
    } | null;
  }): Promise<DotloopLoop> {
    if (input.name.length > DOTLOOP_LOOP_NAME_MAX_LENGTH) {
      throw new DotloopClientError(
        "malformed_response",
        "A Dotloop loop name is limited to 200 characters.",
      );
    }
    const body = await this.#send(
      "POST",
      `loop-it?profile_id=${encodeURIComponent(input.profileId.trim())}`,
      {
        name: input.name,
        status: input.status,
        transactionType: input.transactionType,
        templateId: input.templateId,
        ...(input.address
          ? {
              streetName: input.address.streetName,
              ...(input.address.streetNumber
                ? { streetNumber: input.address.streetNumber }
                : {}),
              ...(input.address.unit ? { unit: input.address.unit } : {}),
              city: input.address.city,
              state: input.address.state,
              zipCode: input.address.zipCode,
            }
          : {}),
        ...(input.participants && input.participants.length > 0
          ? {
              participants: input.participants.map((participant) => ({
                fullName: participant.fullName,
                email: participant.email,
                role: participant.role,
              })),
            }
          : {}),
      },
    );
    const loop = readLoop(readRecord(readRecord(body)?.data ?? body));
    if (!loop) {
      throw new DotloopClientError(
        "malformed_response",
        "The loop create response carried no loop id.",
      );
    }
    return loop;
  }

  /** The documented participant list of one loop: the observable people on the provider's side. */
  async listParticipants(
    profileId: string,
    loopId: string,
  ): Promise<{ id: string; fullName: string; email: string; role: string }[]> {
    const body = await this.#get(
      `profile/${encodeURIComponent(profileId.trim())}/loop/${encodeURIComponent(loopId.trim())}/participant`,
    );
    return readDataArray(body).flatMap((raw) => {
      const record = readRecord(raw);
      const rawId = record?.id;
      if (rawId === undefined || rawId === null) return [];
      return [
        {
          id: String(rawId),
          fullName: typeof record?.fullName === "string" ? record.fullName : "",
          email: typeof record?.email === "string" ? record.email : "",
          role: typeof record?.role === "string" ? record.role : "",
        },
      ];
    });
  }

  /** Create one folder inside a loop and return its id. */
  async createFolder(input: {
    profileId: string;
    loopId: string;
    name: string;
  }): Promise<string> {
    const body = await this.#send(
      "POST",
      `profile/${encodeURIComponent(input.profileId.trim())}/loop/${encodeURIComponent(input.loopId.trim())}/folder`,
      { name: input.name },
    );
    const record = readRecord(readRecord(body)?.data ?? body);
    const id = record?.id;
    if (id === undefined || id === null) {
      throw new DotloopClientError(
        "malformed_response",
        "The folder create response carried no folder id.",
      );
    }
    return String(id);
  }

  /** The documents in one loop folder, for readback after an upload. */
  async listFolderDocuments(input: {
    profileId: string;
    loopId: string;
    folderId: string;
  }): Promise<DotloopDocument[]> {
    const body = await this.#get(
      `profile/${encodeURIComponent(input.profileId.trim())}/loop/${encodeURIComponent(input.loopId.trim())}/folder/${encodeURIComponent(input.folderId.trim())}/document`,
    );
    return readDataArray(body).flatMap((raw) => {
      const rawId = raw.id ?? raw.documentId;
      if (rawId === undefined || rawId === null) return [];
      return [
        {
          id: String(rawId),
          name: typeof raw.name === "string" ? raw.name : "",
        },
      ];
    });
  }

  /**
   * Upload one approved artifact into a loop folder as the documented multipart POST. The caller
   * supplies the exact approved bytes; this client adds no content of its own.
   */
  async uploadDocument(input: {
    profileId: string;
    loopId: string;
    folderId: string;
    fileName: string;
    contentType: string;
    content: Uint8Array;
  }): Promise<DotloopDocument> {
    const { body, boundary } = buildMultipartFileBody({
      fileName: input.fileName,
      contentType: input.contentType,
      content: input.content,
    });
    // Same one-refresh/one-back-off contract as every other request; only the body differs.
    const responseBody = await this.#call(
      "POST",
      new URL(
        `profile/${encodeURIComponent(input.profileId.trim())}/loop/${encodeURIComponent(input.loopId.trim())}/folder/${encodeURIComponent(input.folderId.trim())}/document`,
        this.#baseUrl,
      ),
      body,
      `multipart/form-data; boundary=${boundary}`,
    );
    const record = readRecord(readRecord(responseBody)?.data ?? {});
    const rawId = record?.id;
    if (rawId === undefined || rawId === null) {
      throw new DotloopClientError(
        "malformed_response",
        "The document upload response carried no document id.",
      );
    }
    return {
      id: String(rawId),
      name: typeof record?.name === "string" ? record.name : input.fileName,
    };
  }

  /**
   * Subscription readability only. The official documentation lists webhook subscriptions but no
   * e-signature send or signature-status operation, so this client offers neither.
   */
  async readSubscriptionsAvailable(): Promise<boolean> {
    try {
      await this.#get("subscription");
      return true;
    } catch (error) {
      if (error instanceof DotloopClientError && error.kind === "refresh_needed")
        throw error;
      return false;
    }
  }

  /** One documented write with the same one-refresh and one-backoff contract as a read. */
  async #send(method: "POST" | "PATCH", path: string, body: unknown): Promise<unknown> {
    return this.#call(method, new URL(path, this.#baseUrl), JSON.stringify(body));
  }

  async #get(path: string, options: DotloopBatchOptions = {}): Promise<unknown> {
    const url = new URL(path, this.#baseUrl);
    if (options.batchSize !== undefined) {
      const bounded = Math.max(
        1,
        Math.min(Math.trunc(options.batchSize), DOTLOOP_MAX_BATCH_SIZE),
      );
      url.searchParams.set("batch_size", String(bounded));
    }
    if (options.batchNumber !== undefined) {
      url.searchParams.set(
        "batch_number",
        String(Math.max(1, Math.trunc(options.batchNumber))),
      );
    }

    return this.#call("GET", url);
  }

  async #call(
    method: "GET" | "POST" | "PATCH",
    url: URL,
    body?: string | Uint8Array<ArrayBuffer>,
    contentType = "application/json",
  ): Promise<unknown> {
    let refreshed = false;
    let backedOff = false;
    let token = await this.#tokens.accessToken();
    const mutating = method !== "GET";

    for (;;) {
      try {
        await this.#scheduler.acquire();
      } catch (error) {
        if (error instanceof DotloopRateWaitExceeded)
          throw new DotloopClientError("rate_limited", error.message, 429);
        throw error;
      }
      let response: DotloopHttpResponse;
      try {
        response = await this.#transport.fetch({
          url: url.toString(),
          method,
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/json",
            ...(body === undefined ? {} : { "content-type": contentType }),
          },
          ...(body === undefined ? {} : { body }),
        });
      } catch {
        // A lost response cannot show whether a mutating request was applied.
        throw mutating
          ? new DotloopClientError(
              "uncertain",
              "Dotloop did not confirm this change. It may or may not have been applied.",
            )
          : new DotloopClientError("unavailable", "Dotloop did not answer this read.");
      }
      this.#scheduler.observe(response);

      if (response.status === 401) {
        if (refreshed) {
          throw new DotloopClientError(
            "refresh_needed",
            "Dotloop rejected the refreshed token; reconnect the account.",
            401,
          );
        }
        refreshed = true;
        const next = await this.#tokens.refresh();
        if (next === null) {
          throw new DotloopClientError(
            "refresh_needed",
            "The Dotloop token could not be refreshed; reconnect the account.",
            401,
          );
        }
        token = next;
        continue;
      }

      if (response.status === 429) {
        // A 429 is a documented rejection: the request was not applied, so one bounded retry
        // after the provider's stated wait is safe for reads and writes alike.
        const waitMs = this.#scheduler.retryDelayMs(response);
        if (backedOff || waitMs > this.#scheduler.maxWaitMs) {
          throw new DotloopClientError(
            "rate_limited",
            "Dotloop is rate limiting this account; retry later.",
            429,
          );
        }
        backedOff = true;
        await this.#sleep(waitMs);
        continue;
      }

      if (response.status === 404) {
        throw new DotloopClientError("not_found", "Dotloop has no such resource.", 404);
      }
      if (mutating && (response.status === 408 || response.status >= 500)) {
        throw new DotloopClientError(
          "uncertain",
          "Dotloop did not confirm this change. It may or may not have been applied.",
          response.status,
        );
      }
      if (response.status < 200 || response.status >= 300) {
        throw new DotloopClientError(
          "unavailable",
          mutating ? "Dotloop refused this change." : "Dotloop did not answer this read.",
          response.status,
        );
      }
      return response.json();
    }
  }
}

function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * The documented multipart upload body (`file` field). The approved PDF bytes are copied verbatim
 * between the part header and the closing boundary: no text decoding, no UTF-8 re-encoding and no
 * refill. The boundary is random and checked to be absent from the content.
 */
export function buildMultipartFileBody(input: {
  fileName: string;
  contentType: string;
  content: Uint8Array;
}): { body: Uint8Array<ArrayBuffer>; boundary: string } {
  if (input.fileName.trim() === "" || /["\\\r\n]/.test(input.fileName)) {
    throw new DotloopClientError(
      "malformed_response",
      "A Dotloop document name must be plain text without quotes or line breaks.",
    );
  }
  if (/[\r\n]/.test(input.contentType)) {
    throw new DotloopClientError(
      "malformed_response",
      "A Dotloop document content type must be one line.",
    );
  }
  let boundary = `pmi-kc-${randomUUID()}`;
  while (containsBytes(input.content, TEXT.encode(boundary))) {
    boundary = `pmi-kc-${randomUUID()}`;
  }
  const head = TEXT.encode(
    [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${input.fileName}"`,
      `Content-Type: ${input.contentType}`,
      "",
      "",
    ].join(CRLF),
  );
  const tail = TEXT.encode(`${CRLF}--${boundary}--${CRLF}`);
  const body = new Uint8Array(head.length + input.content.length + tail.length);
  body.set(head, 0);
  body.set(input.content, head.length);
  body.set(tail, head.length + input.content.length);
  return { body, boundary };
}
