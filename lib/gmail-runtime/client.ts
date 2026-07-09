// Per-user Gmail runtime client. Impersonates the signed-in `pmikcmetro.com` user (the subject) via
// keyless DWD and creates an UNSENT draft in that user's own mailbox. There is NO send method and no
// "/messages/send" URL anywhere in this module — the ceiling is a draft a human presses Send on. The
// transport and token are injected so unit tests exercise the full payload against a fake and never touch
// Gmail; the live defaults (fetch transport + DWD mint) are used only in prod. Credentials (the bearer
// token) are built per request and never logged, returned, or included in a thrown error.

import { mintGmailDwdToken } from "@/lib/gmail-runtime/dwd-token";
import { encodeRawDraft } from "@/lib/gmail-runtime/raw-message";
import { GMAIL_COMPOSE_SCOPE } from "@/lib/gmail-runtime/scopes";
import {
  createGmailFetchTransport,
  type GmailHttpTransport,
} from "@/lib/gmail-runtime/transport";

const GMAIL_API_USERS = "https://gmail.googleapis.com/gmail/v1/users";

export class GmailRuntimeError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GmailRuntimeError";
    this.status = status;
  }
}

export interface CreatedDraft {
  draftId: string;
}

export class GmailRuntimeClient {
  private readonly subject: string;
  private readonly transport: GmailHttpTransport;
  private readonly getToken: (scope: string) => Promise<string>;

  constructor(options: {
    subject: string;
    transport?: GmailHttpTransport;
    getToken?: (scope: string) => Promise<string>;
  }) {
    this.subject = options.subject;
    this.transport = options.transport ?? createGmailFetchTransport();
    this.getToken =
      options.getToken ??
      ((scope) => mintGmailDwdToken({ subject: options.subject, scope }));
  }

  /** Create an UNSENT draft in the signed-in user's mailbox (gmail.compose). Never sends. */
  async createDraft(input: {
    to: string;
    subject: string;
    body: string;
  }): Promise<CreatedDraft> {
    const token = await this.getToken(GMAIL_COMPOSE_SCOPE);
    const raw = encodeRawDraft({ ...input, from: this.subject });
    const response = await this.transport.send({
      url: `${GMAIL_API_USERS}/${encodeURIComponent(this.subject)}/drafts`,
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: { raw } }),
    });
    if (response.status < 200 || response.status >= 300) {
      // Only the HTTP status — never the token or the (owner-PII) draft body.
      throw new GmailRuntimeError(
        `Gmail draft create failed (HTTP ${response.status}).`,
        response.status,
      );
    }
    const data = (await response.json()) as { id?: string };
    if (!data.id) {
      throw new GmailRuntimeError("Gmail draft create returned no draft id.");
    }
    return { draftId: data.id };
  }
}
