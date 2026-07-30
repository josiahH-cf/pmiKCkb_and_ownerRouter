import { getAuth, type Auth } from "firebase-admin/auth";

import { readServerConfig } from "@/lib/config/server";
import { getFirebaseAdminApp } from "@/lib/firebase/admin";
import { GmailRuntimeClient, GmailRuntimeError } from "@/lib/gmail-runtime/client";
import { normalizeGmailSubject } from "@/lib/gmail-runtime/subject";
import type {
  GmailOutgoingMessage,
  GmailSendResult,
  GmailThreadView,
} from "@/lib/gmail-runtime/types";
import {
  assertExactLiveVendorClaims,
  LiveVendorLifecycleConflictError,
  normalizeLiveVendorEmail,
  sha256,
  type LiveVendorAuthAdapter,
  type LiveVendorAuthPrincipal,
  type LiveVendorInviteDelivery,
  type LiveVendorInviteDeliveryAdapter,
} from "@/lib/vendor/live-lifecycle-contract";
import {
  VendorSetupDependencyError,
  VendorSetupPublicError,
} from "@/lib/vendor/live-setup";
import { createAndStoreLiveVendorSetupChallenge } from "@/lib/vendor/live-setup-runtime";

const DETERMINISTIC_UID = /^vendor_live_([a-f0-9]{32})$/;
const DETERMINISTIC_VENDOR_REF = /^vendor-live-([a-f0-9]{32})$/;
const DETERMINISTIC_MESSAGE_ID = /^<vendor-invite-([a-f0-9]{64})@pmikcmetro\.com>$/;
const FIREBASE_ALLOWED_CLAIMS = new Set(["vendor", "vendor_id", "data_mode"]);
const FIREBASE_ALLOWED_PROVIDER_IDS = new Set(["password"]);
const MANAGED_STAFF_DOMAIN = "pmikcmetro.com";
const INVITE_ARTIFACT = "vendor-invite:v1.0";
const INVITE_SUBJECT = "Complete your PMI KC Vendor setup";
const MAX_COMPANY_LENGTH = 160;
const MAX_REFERENCE_LENGTH = 240;
const MAX_INVITE_BODY_LENGTH = 1_600;

interface FirebaseUserLike {
  uid: string;
  email?: string;
  emailVerified: boolean;
  disabled: boolean;
  customClaims?: Record<string, unknown>;
  providerData?: readonly { providerId?: string }[];
  tokensValidAfterTime?: string;
}

export interface LiveVendorFirebaseAuthClient {
  getUser(uid: string): Promise<FirebaseUserLike>;
  getUserByEmail(email: string): Promise<FirebaseUserLike>;
  createUser(input: {
    uid: string;
    email: string;
    emailVerified: false;
    disabled: boolean;
  }): Promise<FirebaseUserLike>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  updateUser(uid: string, input: { disabled: true }): Promise<FirebaseUserLike>;
  revokeRefreshTokens(uid: string): Promise<void>;
}

function firebaseClient(auth: Auth): LiveVendorFirebaseAuthClient {
  return auth as LiveVendorFirebaseAuthClient;
}

function firebaseCode(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}

function isFirebaseNotFound(error: unknown) {
  return firebaseCode(error) === "auth/user-not-found";
}

function isFirebaseCreateCollision(error: unknown) {
  return (
    firebaseCode(error) === "auth/email-already-exists" ||
    firebaseCode(error) === "auth/uid-already-exists"
  );
}

function deterministicIdentity(input: { uid: string; vendorRef?: string }): {
  uid: string;
  vendorRef: string;
} {
  const uid = input.uid.trim();
  const uidMatch = DETERMINISTIC_UID.exec(uid);
  const vendorRef = input.vendorRef?.trim() ?? `vendor-live-${uidMatch?.[1] ?? ""}`;
  const vendorMatch = DETERMINISTIC_VENDOR_REF.exec(vendorRef);
  if (!uidMatch || !vendorMatch || uidMatch[1] !== vendorMatch[1]) {
    throw new LiveVendorLifecycleConflictError(
      "Live Vendor identity references are not deterministic.",
    );
  }
  return { uid, vendorRef };
}

function assertExternalVendorEmail(email: string) {
  const normalized = normalizeLiveVendorEmail(email);
  const domain = normalized.slice(normalized.lastIndexOf("@") + 1);
  if (normalized.endsWith(`@${MANAGED_STAFF_DOMAIN}`)) {
    throw new LiveVendorLifecycleConflictError(
      "A managed staff identity cannot become a Vendor identity.",
    );
  }
  if (
    domain === "localhost" ||
    domain === "example.com" ||
    domain === "example.net" ||
    domain === "example.org" ||
    domain.endsWith(".example.com") ||
    domain.endsWith(".example.net") ||
    domain.endsWith(".example.org") ||
    domain.endsWith(".invalid") ||
    domain.endsWith(".test") ||
    domain.endsWith(".example") ||
    domain.endsWith(".localhost")
  ) {
    throw new LiveVendorLifecycleConflictError(
      "A reserved Demo or Test address cannot become a Live Vendor identity.",
    );
  }
  return normalized;
}

function claimsCanBeSafelyCompleted(
  claims: Readonly<Record<string, unknown>>,
  vendorRef: string,
) {
  const keys = Object.keys(claims);
  if (keys.some((key) => !FIREBASE_ALLOWED_CLAIMS.has(key))) return false;
  if ("vendor" in claims && claims.vendor !== true) return false;
  if ("vendor_id" in claims && claims.vendor_id !== vendorRef) return false;
  if ("data_mode" in claims && claims.data_mode !== "live") return false;
  return true;
}

function claimsAreExact(claims: Readonly<Record<string, unknown>>, vendorRef: string) {
  return (
    Object.keys(claims).length === 3 &&
    claims.vendor === true &&
    claims.vendor_id === vendorRef &&
    claims.data_mode === "live"
  );
}

function assertAllowedSignInProviders(user: FirebaseUserLike) {
  const providers = user.providerData ?? [];
  if (
    providers.some(
      (provider) =>
        typeof provider.providerId !== "string" ||
        !FIREBASE_ALLOWED_PROVIDER_IDS.has(provider.providerId),
    )
  ) {
    throw new LiveVendorLifecycleConflictError(
      "An existing federated or privileged identity cannot become a Vendor identity.",
    );
  }
}

function toPrincipal(user: FirebaseUserLike): LiveVendorAuthPrincipal {
  if (!user.email) {
    throw new LiveVendorLifecycleConflictError(
      "Firebase returned a Vendor identity without an email.",
    );
  }
  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    disabled: user.disabled,
    customClaims: { ...(user.customClaims ?? {}) },
  };
}

async function readUserOrNull(
  operation: () => Promise<FirebaseUserLike>,
): Promise<FirebaseUserLike | null> {
  try {
    return await operation();
  } catch (error) {
    if (isFirebaseNotFound(error)) return null;
    throw error;
  }
}

function assertExistingIdentityMayBeAdopted(
  user: FirebaseUserLike,
  expected: { uid: string; email: string; vendorRef: string },
) {
  if (
    user.uid !== expected.uid ||
    !user.email ||
    normalizeLiveVendorEmail(user.email) !== expected.email ||
    user.disabled
  ) {
    throw new LiveVendorLifecycleConflictError(
      "The deterministic Vendor identity is owned by different authority.",
    );
  }
  assertExternalVendorEmail(user.email);
  assertAllowedSignInProviders(user);
  if (!claimsCanBeSafelyCompleted(user.customClaims ?? {}, expected.vendorRef)) {
    throw new LiveVendorLifecycleConflictError(
      "A staff or differently scoped identity cannot become a Vendor identity.",
    );
  }
}

function assertIdentityMayBeCutOff(
  user: FirebaseUserLike,
  expected: { uid: string; email: string; vendorRef: string },
) {
  if (
    user.uid !== expected.uid ||
    !user.email ||
    normalizeLiveVendorEmail(user.email) !== expected.email
  ) {
    throw new LiveVendorLifecycleConflictError(
      "The deterministic Vendor identity is owned by different authority.",
    );
  }
  assertExternalVendorEmail(user.email);
  assertAllowedSignInProviders(user);
  if (!claimsCanBeSafelyCompleted(user.customClaims ?? {}, expected.vendorRef)) {
    throw new LiveVendorLifecycleConflictError(
      "A staff or differently scoped identity cannot be disabled as a Vendor.",
    );
  }
}

function assertExactFirebaseReadback(
  user: FirebaseUserLike,
  expected: { uid: string; email: string; vendorRef: string },
) {
  assertAllowedSignInProviders(user);
  const principal = toPrincipal(user);
  assertExactLiveVendorClaims(principal, expected);
  return principal;
}

export class FirebaseLiveVendorAuthAdapter implements LiveVendorAuthAdapter {
  constructor(
    private readonly createClient: () => LiveVendorFirebaseAuthClient = () =>
      firebaseClient(getAuth(getFirebaseAdminApp())),
  ) {}

  async ensureVendorPrincipal(input: {
    uid: string;
    email: string;
    vendorRef: string;
    customClaims: {
      vendor: true;
      vendor_id: string;
      data_mode: "live";
    };
  }): Promise<LiveVendorAuthPrincipal> {
    const identity = deterministicIdentity(input);
    const email = assertExternalVendorEmail(input.email);
    if (
      input.customClaims.vendor !== true ||
      input.customClaims.vendor_id !== identity.vendorRef ||
      input.customClaims.data_mode !== "live" ||
      Object.keys(input.customClaims).length !== 3
    ) {
      throw new LiveVendorLifecycleConflictError(
        "The requested Firebase claims are not exact Live Vendor authority.",
      );
    }

    const auth = this.createClient();
    const emailOwner = await readUserOrNull(() => auth.getUserByEmail(email));
    if (emailOwner && emailOwner.uid !== identity.uid) {
      throw new LiveVendorLifecycleConflictError(
        "The Vendor email is already owned by another Firebase identity.",
      );
    }
    let user = emailOwner ?? (await readUserOrNull(() => auth.getUser(identity.uid)));
    if (user && (!user.email || normalizeLiveVendorEmail(user.email) !== email)) {
      throw new LiveVendorLifecycleConflictError(
        "The deterministic Vendor uid is already owned by another email.",
      );
    }

    let created = false;
    if (!user) {
      try {
        user = await auth.createUser({
          uid: identity.uid,
          email,
          emailVerified: false,
          disabled: false,
        });
        created = true;
      } catch (error) {
        if (!isFirebaseCreateCollision(error)) throw error;
        const racedEmailOwner = await readUserOrNull(() => auth.getUserByEmail(email));
        const racedUidOwner = await readUserOrNull(() => auth.getUser(identity.uid));
        if (
          !racedEmailOwner ||
          !racedUidOwner ||
          racedEmailOwner.uid !== identity.uid ||
          racedUidOwner.uid !== identity.uid
        ) {
          throw new LiveVendorLifecycleConflictError(
            "The Vendor identity was claimed concurrently by different authority.",
          );
        }
        user = racedUidOwner;
      }
    }

    assertExistingIdentityMayBeAdopted(user, {
      ...identity,
      email,
    });
    if (!claimsAreExact(user.customClaims ?? {}, identity.vendorRef)) {
      await auth.setCustomUserClaims(identity.uid, {
        vendor: true,
        vendor_id: identity.vendorRef,
        data_mode: "live",
      });
    }

    const readback = await auth.getUser(identity.uid);
    if (created && readback.emailVerified) {
      throw new LiveVendorLifecycleConflictError(
        "A newly created Vendor identity returned as pre-verified.",
      );
    }
    return assertExactFirebaseReadback(readback, {
      ...identity,
      email,
    });
  }

  async disableUser(uid: string, expectedEmail: string): Promise<void> {
    const identity = {
      ...deterministicIdentity({ uid }),
      email: assertExternalVendorEmail(expectedEmail),
    };
    const auth = this.createClient();
    const emailOwner = await readUserOrNull(() => auth.getUserByEmail(identity.email));
    if (emailOwner && emailOwner.uid !== identity.uid) {
      throw new LiveVendorLifecycleConflictError(
        "The Vendor email is already owned by another Firebase identity.",
      );
    }
    let current = emailOwner ?? (await readUserOrNull(() => auth.getUser(identity.uid)));
    if (!current) {
      try {
        current = await auth.createUser({
          uid: identity.uid,
          email: identity.email,
          emailVerified: false,
          disabled: true,
        });
      } catch (error) {
        if (!isFirebaseCreateCollision(error)) throw error;
        const racedEmailOwner = await readUserOrNull(() =>
          auth.getUserByEmail(identity.email),
        );
        const racedUidOwner = await readUserOrNull(() => auth.getUser(identity.uid));
        if (
          !racedEmailOwner ||
          !racedUidOwner ||
          racedEmailOwner.uid !== identity.uid ||
          racedUidOwner.uid !== identity.uid
        ) {
          throw new LiveVendorLifecycleConflictError(
            "The Vendor identity cutoff raced with different authority.",
          );
        }
        current = racedUidOwner;
      }
    }
    assertIdentityMayBeCutOff(current, identity);
    if (!claimsAreExact(current.customClaims ?? {}, identity.vendorRef)) {
      await auth.setCustomUserClaims(identity.uid, {
        vendor: true,
        vendor_id: identity.vendorRef,
        data_mode: "live",
      });
    }
    if (!current.disabled) {
      await auth.updateUser(identity.uid, { disabled: true });
    }
    const readback = await auth.getUser(identity.uid);
    this.assertExactCurrentVendor(readback, identity, true);
  }

  async revokeRefreshTokens(uid: string, expectedEmail: string): Promise<void> {
    const identity = {
      ...deterministicIdentity({ uid }),
      email: assertExternalVendorEmail(expectedEmail),
    };
    const auth = this.createClient();
    this.assertExactCurrentVendor(await auth.getUser(identity.uid), identity, true);
    await auth.revokeRefreshTokens(identity.uid);
    const readback = await auth.getUser(identity.uid);
    this.assertExactCurrentVendor(readback, identity, true);
    if (!validFirebaseTime(readback.tokensValidAfterTime)) {
      throw new Error("Firebase did not return the refresh-token revocation time.");
    }
  }

  async readDisableState(
    uid: string,
    expectedEmail: string,
    revokedAfter: string,
  ): Promise<{ disabled: boolean; refreshTokensRevoked: boolean }> {
    const identity = {
      ...deterministicIdentity({ uid }),
      email: assertExternalVendorEmail(expectedEmail),
    };
    const cutoff = Date.parse(revokedAfter);
    if (!Number.isFinite(cutoff)) {
      throw new LiveVendorLifecycleConflictError(
        "Vendor token-revocation cutoff is invalid.",
      );
    }
    const auth = this.createClient();
    const readback = await readUserOrNull(() => auth.getUser(identity.uid));
    if (!readback) {
      const emailOwner = await readUserOrNull(() => auth.getUserByEmail(identity.email));
      if (emailOwner) {
        throw new LiveVendorLifecycleConflictError(
          "The Vendor email is owned without its deterministic uid.",
        );
      }
      return { disabled: false, refreshTokensRevoked: false };
    }
    // Readback is used both before and after the cutoff. Preserve every identity/claim/provider
    // check, but do not require the pre-effect principal to be disabled.
    this.assertExactCurrentVendor(readback, identity);
    const revokedAt = validFirebaseTime(readback.tokensValidAfterTime);
    return {
      disabled: readback.disabled,
      refreshTokensRevoked:
        revokedAt !== null && Math.floor(revokedAt / 1_000) >= Math.ceil(cutoff / 1_000),
    };
  }

  private assertExactCurrentVendor(
    user: FirebaseUserLike,
    identity: { uid: string; email: string; vendorRef: string },
    mustBeDisabled = false,
  ) {
    if (!user.email) {
      throw new LiveVendorLifecycleConflictError(
        "Firebase Vendor identity readback had no email.",
      );
    }
    const currentEmail = assertExternalVendorEmail(user.email);
    assertAllowedSignInProviders(user);
    const claims = user.customClaims ?? {};
    if (
      user.uid !== identity.uid ||
      currentEmail !== identity.email ||
      !claimsAreExact(claims, identity.vendorRef) ||
      (mustBeDisabled && !user.disabled)
    ) {
      throw new LiveVendorLifecycleConflictError(
        "Firebase Vendor identity readback did not match exact authority.",
      );
    }
  }
}

function validFirebaseTime(value: string | undefined): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface LiveVendorGmailClient {
  readonly subject: string;
  sendMessage(input: GmailOutgoingMessage): Promise<GmailSendResult>;
  findMessageByRfcMessageId(rfcMessageId: string): Promise<GmailSendResult | null>;
  getThread(threadId: string): Promise<GmailThreadView>;
}

export class LiveVendorInviteAdapterError extends Error {
  constructor(readonly ambiguous: boolean) {
    super(
      ambiguous
        ? "Vendor invite delivery requires Gmail reconciliation."
        : "Vendor invite delivery was definitively refused.",
    );
    this.name = "LiveVendorInviteAdapterError";
  }
}

interface LiveVendorInviteAdapterConfig {
  kbApprovalSender?: string;
  appBaseUrl?: string;
}

interface LiveVendorInviteAdapterDependencies {
  readConfig?: () => LiveVendorInviteAdapterConfig;
  createClient?: (subject: string) => LiveVendorGmailClient;
  createSetupChallenge?: typeof createAndStoreLiveVendorSetupChallenge;
}

function deterministicInviteBindings(input: {
  vendorRef: string;
  vendorUid: string;
  inviteVersion: number;
  lifecycleExecutionId: string;
  challengeExpiresAt: string;
  rfcMessageId: string;
}) {
  const identity = deterministicIdentity({
    uid: input.vendorUid,
    vendorRef: input.vendorRef,
  });
  const message = DETERMINISTIC_MESSAGE_ID.exec(input.rfcMessageId.trim());
  const lifecycleExecutionId = input.lifecycleExecutionId.trim();
  const challengeExpiresAt = input.challengeExpiresAt.trim();
  const challengeExpiry = Date.parse(challengeExpiresAt);
  if (
    !Number.isSafeInteger(input.inviteVersion) ||
    input.inviteVersion < 1 ||
    !/^[a-f0-9]{64}$/.test(lifecycleExecutionId) ||
    !Number.isFinite(challengeExpiry) ||
    new Date(challengeExpiry).toISOString() !== challengeExpiresAt ||
    !message ||
    message[1] !== lifecycleExecutionId
  ) {
    throw new LiveVendorLifecycleConflictError(
      "Vendor invite Message-ID is not bound to the lifecycle execution.",
    );
  }
  return {
    ...identity,
    inviteVersion: input.inviteVersion,
    lifecycleExecutionId,
    challengeExpiresAt,
    rfcMessageId: input.rfcMessageId.trim(),
  };
}

function boundedText(value: string, label: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u001f]/.test(normalized)
  ) {
    throw new LiveVendorLifecycleConflictError(`${label} is invalid.`);
  }
  return normalized;
}

function expectedRecipientHash(email: string, claimedHash: string) {
  const normalized = assertExternalVendorEmail(email);
  const hash = sha256(normalized);
  if (claimedHash !== hash) {
    throw new LiveVendorLifecycleConflictError(
      "Vendor invite recipient hash does not match the exact email.",
    );
  }
  return { email: normalized, hash };
}

function setupUrlForBody(value: string, appBaseUrl: string | undefined) {
  let setupUrl: URL;
  let baseUrl: URL;
  try {
    setupUrl = new URL(value);
    baseUrl = new URL(appBaseUrl ?? "");
  } catch {
    throw new LiveVendorInviteAdapterError(false);
  }
  const fields = new URLSearchParams(setupUrl.hash.slice(1));
  const entries = [...fields.entries()];
  if (
    setupUrl.protocol !== "https:" ||
    setupUrl.username ||
    setupUrl.password ||
    setupUrl.origin !== baseUrl.origin ||
    setupUrl.pathname !== "/vendor/setup" ||
    setupUrl.search ||
    entries.length !== 1 ||
    entries[0]?.[0] !== "token" ||
    !/^[A-Za-z0-9_-]{43}$/.test(entries[0]?.[1] ?? "")
  ) {
    throw new LiveVendorInviteAdapterError(false);
  }
  return setupUrl.toString();
}

function inviteBody(company: string, setupUrl: string) {
  const body = [
    `Hello ${company} team,`,
    "",
    "PMI KC invited you to its secure Vendor workspace.",
    "Complete your one-time account setup using this link:",
    setupUrl,
    "",
    "If you were not expecting this invitation, do not open the link and contact PMI KC.",
  ].join("\n");
  if (body.length > MAX_INVITE_BODY_LENGTH) {
    throw new LiveVendorInviteAdapterError(false);
  }
  return body;
}

function mapSetupError(error: unknown): LiveVendorInviteAdapterError {
  if (error instanceof LiveVendorInviteAdapterError) return error;
  if (error instanceof VendorSetupDependencyError) {
    return new LiveVendorInviteAdapterError(!error.definitive);
  }
  if (error instanceof VendorSetupPublicError) {
    return new LiveVendorInviteAdapterError(error.status >= 500);
  }
  return new LiveVendorInviteAdapterError(true);
}

function mapGmailError(error: unknown, effectMayExist = false) {
  if (error instanceof LiveVendorInviteAdapterError) {
    return effectMayExist && !error.ambiguous
      ? new LiveVendorInviteAdapterError(true)
      : error;
  }
  if (error instanceof GmailRuntimeError) {
    return new LiveVendorInviteAdapterError(effectMayExist || error.ambiguous);
  }
  return new LiveVendorInviteAdapterError(true);
}

function headerMailbox(value: string) {
  const trimmed = value.trim();
  const angle = /^.*<([^<>\r\n]+)>$/.exec(trimmed);
  return normalizeLiveVendorEmail(angle?.[1] ?? trimmed);
}

interface ExactInviteReadback extends LiveVendorInviteDelivery {
  threadId: string;
}

async function readExactInvite(
  client: LiveVendorGmailClient,
  input: {
    rfcMessageId: string;
    sender: string;
    recipientEmail: string;
    recipientHash: string;
  },
): Promise<ExactInviteReadback | null> {
  const found = await client.findMessageByRfcMessageId(input.rfcMessageId);
  if (!found) return null;
  const thread = await client.getThread(found.threadId);
  const matches = thread.messages.filter(
    (message) =>
      message.id === found.messageId &&
      message.threadId === found.threadId &&
      message.messageId === input.rfcMessageId,
  );
  if (matches.length !== 1) {
    throw new LiveVendorInviteAdapterError(true);
  }
  const message = matches[0]!;
  let from: string;
  let to: string;
  try {
    from = headerMailbox(message.from);
    to = message.to.length === 1 ? headerMailbox(message.to[0]!) : "";
  } catch {
    throw new LiveVendorInviteAdapterError(true);
  }
  if (
    thread.id !== found.threadId ||
    from !== input.sender ||
    to !== input.recipientEmail ||
    sha256(to) !== input.recipientHash ||
    message.cc.length !== 0 ||
    message.bcc.length !== 0 ||
    message.subject !== INVITE_SUBJECT ||
    message.attachments.length !== 0 ||
    !message.labelIds.includes("SENT") ||
    message.inReplyTo !== undefined ||
    message.references.length !== 0
  ) {
    throw new LiveVendorInviteAdapterError(true);
  }
  return {
    providerMessageRef: found.messageId,
    threadId: found.threadId,
    rfcMessageId: input.rfcMessageId,
    recipientHash: input.recipientHash,
  };
}

export class GmailLiveVendorInviteDeliveryAdapter implements LiveVendorInviteDeliveryAdapter {
  private readonly readConfig: () => LiveVendorInviteAdapterConfig;
  private readonly createClient: (subject: string) => LiveVendorGmailClient;
  private readonly createSetupChallenge: typeof createAndStoreLiveVendorSetupChallenge;

  constructor(dependencies: LiveVendorInviteAdapterDependencies = {}) {
    this.readConfig =
      dependencies.readConfig ??
      (() => {
        const config = readServerConfig();
        return {
          kbApprovalSender: config.kbApprovalSender,
          appBaseUrl: config.appBaseUrl,
        };
      });
    this.createClient =
      dependencies.createClient ?? ((subject) => new GmailRuntimeClient({ subject }));
    this.createSetupChallenge =
      dependencies.createSetupChallenge ?? createAndStoreLiveVendorSetupChallenge;
  }

  async sendInvite(input: {
    recipientEmail: string;
    recipientHash: string;
    company: string;
    vendorRef: string;
    vendorUid: string;
    inviteVersion: number;
    lifecycleExecutionId: string;
    challengeExpiresAt: string;
    ticketRef: string;
    artifactRef: "vendor-invite:v1.0";
    rfcMessageId: string;
  }): Promise<LiveVendorInviteDelivery> {
    const bindings = deterministicInviteBindings(input);
    const recipient = expectedRecipientHash(input.recipientEmail, input.recipientHash);
    const company = boundedText(input.company, "Vendor company", MAX_COMPANY_LENGTH);
    boundedText(input.ticketRef, "Initial ticket", MAX_REFERENCE_LENGTH);
    if (input.artifactRef !== INVITE_ARTIFACT) {
      throw new LiveVendorLifecycleConflictError("Vendor invite artifact is invalid.");
    }
    const config = this.readConfig();
    let sender: string;
    try {
      sender = normalizeGmailSubject(config.kbApprovalSender ?? "");
    } catch {
      throw new LiveVendorLifecycleConflictError(
        "Vendor invite delivery requires KB_APPROVAL_SENDER.",
      );
    }

    let setupUrl: string;
    try {
      const challenge = await this.createSetupChallenge({
        vendorId: bindings.vendorRef,
        uid: bindings.uid,
        email: recipient.email,
        dataMode: "live",
        inviteVersion: bindings.inviteVersion,
        lifecycleExecutionId: bindings.lifecycleExecutionId,
        expiresAt: bindings.challengeExpiresAt,
      });
      if (challenge.expiresAt !== bindings.challengeExpiresAt) {
        throw new LiveVendorInviteAdapterError(false);
      }
      setupUrl = setupUrlForBody(challenge.setupUrl, config.appBaseUrl);
    } catch (error) {
      throw mapSetupError(error);
    }

    let client: LiveVendorGmailClient;
    try {
      client = this.createClient(sender);
    } catch (error) {
      throw mapGmailError(error);
    }
    if (client.subject !== sender) {
      throw new LiveVendorInviteAdapterError(false);
    }
    const outgoing: GmailOutgoingMessage = {
      from: sender,
      to: [recipient.email],
      cc: [],
      bcc: [],
      subject: INVITE_SUBJECT,
      body: inviteBody(company, setupUrl),
      messageId: bindings.rfcMessageId,
      references: [],
    };

    let sent: GmailSendResult;
    try {
      sent = await client.sendMessage(outgoing);
    } catch (error) {
      throw mapGmailError(error);
    } finally {
      // Remove the setup URL from the only mutable production object that held the message body.
      outgoing.body = "";
      setupUrl = "";
    }

    let observed: ExactInviteReadback | null;
    try {
      observed = await readExactInvite(client, {
        rfcMessageId: bindings.rfcMessageId,
        sender,
        recipientEmail: recipient.email,
        recipientHash: recipient.hash,
      });
    } catch (error) {
      throw mapGmailError(error, true);
    }
    if (
      !observed ||
      observed.providerMessageRef !== sent.messageId ||
      observed.threadId !== sent.threadId
    ) {
      throw new LiveVendorInviteAdapterError(true);
    }
    return {
      providerMessageRef: observed.providerMessageRef,
      rfcMessageId: observed.rfcMessageId,
      recipientHash: observed.recipientHash,
    };
  }

  async findInviteByRfcMessageId(input: {
    rfcMessageId: string;
    recipientEmail: string;
    recipientHash: string;
  }): Promise<LiveVendorInviteDelivery | null> {
    if (!DETERMINISTIC_MESSAGE_ID.test(input.rfcMessageId.trim())) {
      throw new LiveVendorLifecycleConflictError("Vendor invite Message-ID is invalid.");
    }
    const recipient = expectedRecipientHash(input.recipientEmail, input.recipientHash);
    const config = this.readConfig();
    let sender: string;
    try {
      sender = normalizeGmailSubject(config.kbApprovalSender ?? "");
    } catch {
      throw new LiveVendorLifecycleConflictError(
        "Vendor invite readback requires KB_APPROVAL_SENDER.",
      );
    }
    let client: LiveVendorGmailClient;
    try {
      client = this.createClient(sender);
    } catch (error) {
      throw mapGmailError(error);
    }
    if (client.subject !== sender) {
      throw new LiveVendorInviteAdapterError(true);
    }
    try {
      const observed = await readExactInvite(client, {
        rfcMessageId: input.rfcMessageId.trim(),
        sender,
        recipientEmail: recipient.email,
        recipientHash: recipient.hash,
      });
      if (!observed) return null;
      return {
        providerMessageRef: observed.providerMessageRef,
        rfcMessageId: observed.rfcMessageId,
        recipientHash: observed.recipientHash,
      };
    } catch (error) {
      throw mapGmailError(error);
    }
  }
}

/**
 * Wiring helper for the Live provider. Constructing these adapters constructs no Firebase, Gmail,
 * Firestore, or setup-challenge client; each adapter invokes its factory only inside an effect or
 * readback method after the lifecycle provider has won the relevant ledger claim.
 */
export function createLiveVendorLifecycleAdapters() {
  return {
    auth: new FirebaseLiveVendorAuthAdapter(),
    delivery: new GmailLiveVendorInviteDeliveryAdapter(),
  };
}
