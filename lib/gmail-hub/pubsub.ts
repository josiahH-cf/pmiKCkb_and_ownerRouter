import { OAuth2Client } from "google-auth-library";
import { z } from "zod";

import { normalizeGmailSubject } from "@/lib/gmail-runtime/subject";

const PubSubEnvelopeSchema = z
  .object({
    message: z
      .object({
        data: z.string().min(1).max(10_000),
        messageId: z.string().min(1).max(500),
        publishTime: z.string().optional(),
      })
      .strict(),
    subscription: z.string().min(1).max(1_000),
  })
  .strict();

const GmailNotificationSchema = z
  .object({
    emailAddress: z.string().trim().email(),
    historyId: z.string().regex(/^\d{1,30}$/),
  })
  .strict();

export interface GmailPushConfig {
  topicName: string;
  expectedAudience: string;
  pushServiceAccount: string;
  pilotUsers: readonly string[];
  allowedDomain: string;
}

export interface VerifiedGmailPush {
  messageId: string;
  mailboxEmail: string;
  historyId: string;
  subscription: string;
}

type VerifyOidc = (
  token: string,
  audience: string,
) => Promise<{
  email?: string;
  email_verified?: boolean;
}>;

let testVerifier: VerifyOidc | null = null;

export function setGmailPushOidcVerifierForTest(verifier: VerifyOidc | null) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Gmail push test verifier requires NODE_ENV=test.");
  }
  testVerifier = verifier;
}

export function readGmailPushConfig(
  env: NodeJS.ProcessEnv = process.env,
): GmailPushConfig {
  const topicName = env.GMAIL_PUBSUB_TOPIC?.trim();
  const expectedAudience = env.GMAIL_PUBSUB_AUDIENCE?.trim();
  const pushServiceAccount = env.GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT?.trim().toLowerCase();
  const allowedDomain = (env.ALLOWED_HD ?? "pmikcmetro.com").trim().toLowerCase();
  const pilotUsers = (env.GMAIL_PILOT_USERS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!topicName || !expectedAudience || !pushServiceAccount || pilotUsers.length === 0) {
    throw new GmailPushAuthError(
      "Gmail push is not configured with a topic, audience, service account, and pilot allowlist.",
      503,
    );
  }
  if (!topicName.startsWith("projects/pmi-kc-kb-prod/topics/")) {
    throw new GmailPushAuthError("Gmail push topic must belong to pmi-kc-kb-prod.", 503);
  }
  if (!pushServiceAccount.endsWith("@pmi-kc-kb-prod.iam.gserviceaccount.com")) {
    throw new GmailPushAuthError(
      "Gmail push requires a pmi-kc-kb-prod service identity.",
      503,
    );
  }
  try {
    if (new URL(expectedAudience).protocol !== "https:") throw new Error("not https");
  } catch {
    throw new GmailPushAuthError("Gmail push audience must be an HTTPS URL.", 503);
  }
  return { topicName, expectedAudience, pushServiceAccount, pilotUsers, allowedDomain };
}

/** Authenticate the Pub/Sub service identity before reading/decoding the push body. */
export async function verifyPubSubPushRequest(
  request: Request,
  config: GmailPushConfig = readGmailPushConfig(),
): Promise<VerifiedGmailPush> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match)
    throw new GmailPushAuthError("Authenticated Pub/Sub push is required.", 401);

  const claims = await (testVerifier ?? verifyOidc)(
    match[1],
    config.expectedAudience,
  ).catch(() => {
    throw new GmailPushAuthError("Pub/Sub OIDC token is invalid.", 401);
  });
  if (
    claims.email_verified !== true ||
    claims.email?.trim().toLowerCase() !== config.pushServiceAccount
  ) {
    throw new GmailPushAuthError("Pub/Sub push identity is not allowed.", 403);
  }

  const envelope = PubSubEnvelopeSchema.safeParse(await request.json().catch(() => null));
  if (!envelope.success)
    throw new GmailPushAuthError("Pub/Sub push body is invalid.", 400);
  if (!envelope.data.subscription.startsWith("projects/pmi-kc-kb-prod/subscriptions/")) {
    throw new GmailPushAuthError("Pub/Sub subscription is not allowed.", 403);
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(
      Buffer.from(envelope.data.message.data, "base64url").toString("utf8"),
    );
  } catch {
    throw new GmailPushAuthError("Gmail push data is invalid.", 400);
  }
  const notification = GmailNotificationSchema.safeParse(decoded);
  if (!notification.success)
    throw new GmailPushAuthError("Gmail push data is invalid.", 400);
  const mailboxEmail = normalizeGmailSubject(notification.data.emailAddress, {
    allowedDomain: config.allowedDomain,
    pilotUsers: config.pilotUsers,
  });
  return {
    messageId: envelope.data.message.messageId,
    mailboxEmail,
    historyId: notification.data.historyId,
    subscription: envelope.data.subscription,
  };
}

export class GmailPushAuthError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 503,
  ) {
    super(message);
    this.name = "GmailPushAuthError";
  }
}

async function verifyOidc(token: string, audience: string) {
  const ticket = await new OAuth2Client().verifyIdToken({ idToken: token, audience });
  const payload = ticket.getPayload();
  return { email: payload?.email, email_verified: payload?.email_verified };
}
