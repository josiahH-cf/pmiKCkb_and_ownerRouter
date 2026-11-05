// S254 R-S254-4: the Demo-owned mail adapter of the isolated rehearsal. It is the ordinary
// mailbox client with two substitutions. Its transport answers Gmail mailbox requests from the
// rehearsal's loopback stand-in process and can reach no other host, and in place of an access
// token it sends a fixed label that grants nothing and is minted from nothing. The delegated
// token mint is never called, and this module reads no environment.
//
// The only way to obtain one is `createGmailMailboxClient` in lib/gmail-hub/dependencies.ts, and
// only with the stand-in that `resolveRehearsalStandIn` returns inside the rehearsal.
import {
  loopbackStandInOrigin,
  type RehearsalStandIn,
} from "@/lib/environment/rehearsal-stand-in";
import { GmailRuntimeClient } from "@/lib/gmail-runtime/client";
import { normalizeGmailSubject } from "@/lib/gmail-runtime/subject";
import type { GmailHttpTransport } from "@/lib/gmail-runtime/transport";

const GMAIL_API_ORIGIN = "https://gmail.googleapis.com";
const GMAIL_MAILBOX_API = `${GMAIL_API_ORIGIN}/gmail/v1/users/me/`;
const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 12 * 1024 * 1024;

/** Names the mailbox to the stand-in; a real mailbox is named by its token instead. */
export const REHEARSAL_STAND_IN_MAILBOX_HEADER = "x-rehearsal-mailbox";
/** Sent where an access token would be. It is a label: it grants nothing. */
export const REHEARSAL_STAND_IN_TOKEN = "rehearsal-stand-in";

/** A transport whose only destination is the rehearsal's loopback stand-in. */
export function createRehearsalStandInGmailTransport(
  standIn: RehearsalStandIn,
  mailbox: string,
): GmailHttpTransport {
  const origin = loopbackStandInOrigin(standIn.origin);
  if (!origin)
    throw new Error("The rehearsal mail stand-in must be a loopback HTTP origin.");
  return {
    async send(request) {
      if (!request.url.startsWith(GMAIL_MAILBOX_API))
        throw new Error(
          "The rehearsal mail stand-in answers Gmail mailbox requests only.",
        );
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(
          `${origin}${request.url.slice(GMAIL_API_ORIGIN.length)}`,
          {
            method: request.method,
            headers: {
              ...request.headers,
              [REHEARSAL_STAND_IN_MAILBOX_HEADER]: mailbox,
            },
            body: request.body,
            // A stand-in that answers with a redirect is refused; nothing follows it elsewhere.
            redirect: "error",
            signal: controller.signal,
          },
        );
        const text = await response.text();
        if (text.length > MAX_RESPONSE_BYTES)
          throw new Error("The rehearsal mail stand-in answer exceeded the size limit.");
        return {
          status: response.status,
          json: async () => (text ? JSON.parse(text) : {}),
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** The mailbox client of the isolated rehearsal. It can reach the stand-in and nothing else. */
export function createRehearsalStandInGmailClient(
  subject: string,
  standIn: RehearsalStandIn,
): GmailRuntimeClient {
  const mailbox = normalizeGmailSubject(subject);
  return new GmailRuntimeClient({
    subject: mailbox,
    transport: createRehearsalStandInGmailTransport(standIn, mailbox),
    getToken: async () => REHEARSAL_STAND_IN_TOKEN,
  });
}
