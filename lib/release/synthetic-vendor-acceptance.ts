import type { AuthenticatedUser } from "@/lib/auth/session";
import { validateVendorClaims } from "@/lib/vendor/auth";
import { VendorGmailService, type VendorSendConfirmation } from "@/lib/vendor/gmail";
import { inviteVendor, vendorInvitePreviewHash } from "@/lib/vendor/invite";
import { disableVendor } from "@/lib/vendor/lifecycle";
import {
  VENDOR_OAUTH_SCOPES,
  VendorBoundaryError,
  type VendorMailboxConnection,
  type VendorRecord,
} from "@/lib/vendor/model";
import {
  beginVendorOAuth,
  completeVendorOAuth,
  type VendorOAuthState,
} from "@/lib/vendor/oauth";

const NOW_MS = Date.parse("2026-07-14T12:00:00.000Z");
const ADMIN: AuthenticatedUser = {
  uid: "admin-synthetic",
  email: "admin-synthetic@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};

/**
 * Traverses the real S22 domain services with in-memory providers and non-routable aliases.
 * The returned evidence is deliberately bodyless: setup links, OAuth state/verifier/code/token,
 * message bodies, mailbox content, and secret references never leave this function.
 */
export async function runSyntheticVendorJourney() {
  const vendorEmail = "vendor-synthetic@example.invalid";
  const vendorId = "vendor-synthetic-001";
  const vendorUid = "vendor-uid-synthetic-001";
  const ticketId = "ticket-synthetic-001";
  const threadId = "thread-synthetic-001";
  const records = new Map<string, VendorRecord>();
  let deliveredSetup = false;
  let connection: VendorMailboxConnection | null = null;
  let oauthState: VendorOAuthState | null = null;
  let oauthStateUsed = false;
  let tokenStored = false;
  let sessionRevoked = false;
  let identityDisabled = false;
  let tokenRevocationQueued = false;
  let confirmation: VendorSendConfirmation | null = null;
  let sendCalls = 0;

  const inviteReason = "Synthetic Vendor onboarding acceptance.";
  const invite = await inviteVendor(
    {
      actor: ADMIN,
      email: vendorEmail,
      reason: inviteReason,
      confirmedPreviewHash: vendorInvitePreviewHash(vendorEmail, inviteReason),
    },
    {
      id: () => vendorId,
      now: () => new Date(NOW_MS),
      auth: {
        createUser: async () => ({ uid: vendorUid }),
        setCustomUserClaims: async () => undefined,
        generatePasswordResetLink: async () =>
          "https://example.invalid/vendor/setup/synthetic-one-time-link",
        deleteUser: async () => undefined,
      },
      delivery: {
        deliver: async ({ email, setupLink, artifactRef }) => {
          deliveredSetup =
            email === vendorEmail &&
            setupLink.startsWith("https://example.invalid/") &&
            artifactRef === "vendor-invite:v1.0";
        },
      },
      store: {
        findVendorByEmail: async (email) =>
          [...records.values()].find((record) => record.email === email) ?? null,
        saveVendor: async (record) => void records.set(record.id, record),
        removeVendor: async (id) => void records.delete(id),
        appendAudit: async () => undefined,
      },
    },
  );

  records.set(vendorId, {
    ...records.get(vendorId)!,
    status: "active",
    updatedAt: new Date(NOW_MS).toISOString(),
  });
  const nowSeconds = Math.floor(NOW_MS / 1_000);
  const principal = validateVendorClaims(
    {
      uid: vendorUid,
      email: vendorEmail,
      email_verified: true,
      vendor: true,
      vendor_id: vendorId,
      auth_time: nowSeconds,
      firebase: { sign_in_second_factor: "totp" },
    },
    nowSeconds,
  );

  const redirectUri = "https://example.invalid/api/vendor/oauth/callback";
  const oauthStore = {
    isVendorActive: async (id: string, uid: string, email: string) =>
      id === vendorId &&
      uid === vendorUid &&
      records.get(id)?.email === email &&
      records.get(id)?.status === "active",
    saveState: async (state: VendorOAuthState) => void (oauthState = state),
    claimState: async (stateHash: string, nowMs: number) => {
      if (
        !oauthState ||
        oauthStateUsed ||
        oauthState.stateHash !== stateHash ||
        oauthState.expiresAtMs <= nowMs
      ) {
        return null;
      }
      oauthStateUsed = true;
      return oauthState;
    },
    saveConnection: async (value: VendorMailboxConnection) => void (connection = value),
  };
  const begun = await beginVendorOAuth(
    {
      principal,
      clientId: "client-synthetic.apps.googleusercontent.com",
      redirectUri,
      expectedRedirectUri: redirectUri,
    },
    oauthStore,
    NOW_MS,
  );
  const state = new URL(begun.authorizationUrl).searchParams.get("state") ?? "";
  const connected = await completeVendorOAuth(
    {
      principal,
      state,
      code: "oauth-code-synthetic",
      redirectUri,
      expectedRedirectUri: redirectUri,
    },
    {
      now: () => NOW_MS,
      store: oauthStore,
      provider: {
        exchange: async () => ({
          mailboxEmail: vendorEmail,
          refreshToken: "refresh-token-synthetic-never-returned",
          scopes: VENDOR_OAUTH_SCOPES,
          provider: "google" as const,
        }),
      },
      vault: {
        storeRefreshToken: async ({ mailboxEmail, refreshToken }) => {
          tokenStored =
            mailboxEmail === vendorEmail && refreshToken.startsWith("refresh-token-");
          return "secret:vendor-synthetic-001";
        },
        destroySecret: async () => undefined,
      },
    },
  );

  const ticket = {
    id: ticketId,
    status: "Open",
    priority: "Normal",
    summary: "Synthetic assigned repair",
    unitLabel: "Synthetic Unit 101",
    updatedAt: new Date(NOW_MS).toISOString(),
  };
  const assignments = {
    isVendorActive: async (id: string, uid: string, email: string) =>
      id === vendorId &&
      uid === vendorUid &&
      email === vendorEmail &&
      records.get(id)?.email === email &&
      records.get(id)?.status === "active",
    listAssignedTickets: async (input: {
      vendorId: string;
      uid: string;
      email: string;
      dataMode: "live" | "test";
    }) => (input.vendorId === vendorId ? [ticket] : []),
    getAssignedTicket: async (input: {
      vendorId: string;
      uid: string;
      email: string;
      dataMode: "live" | "test";
      ticketId: string;
    }) => (input.vendorId === vendorId && input.ticketId === ticketId ? ticket : null),
    isThreadLinked: async (input: {
      vendorId: string;
      uid: string;
      email: string;
      dataMode: "live" | "test";
      ticketId: string;
      threadId: string;
    }) =>
      input.vendorId === vendorId &&
      input.ticketId === ticketId &&
      input.threadId === threadId,
    getGmailLaneContext: async (input: {
      vendorId: string;
      ticketId: string;
      threadId: string;
      actorUid: string;
      actorEmail: string;
      actorDataMode: "live" | "test";
      actorIsAdmin: boolean;
    }) =>
      input.vendorId === vendorId &&
      input.ticketId === ticketId &&
      input.threadId === threadId
        ? {
            vendor: "live" as const,
            assignment: "live" as const,
            ticket: "live" as const,
            thread: "live" as const,
          }
        : null,
  };
  const client = {
    getLinkedThread: async () => ({
      id: threadId,
      subject: "Synthetic assigned repair",
      snippet: "Synthetic bounded preview",
    }),
    createReplyDraft: async () => ({ draftId: "draft-synthetic-001" }),
    applyApprovedLabel: async () => undefined,
    sendReply: async ({ messageId }: { messageId: string }) => {
      sendCalls += 1;
      return { messageId, threadId };
    },
    reconcileByMessageId: async () => null,
  };
  const confirmations = {
    createConfirmation: async (record: VendorSendConfirmation) =>
      void (confirmation = record),
    claimConfirmation: async (input: {
      id: string;
      actorUid: string;
      payloadHash: string;
      nowMs: number;
    }) => {
      if (!confirmation) return "mismatch" as const;
      if (confirmation.state === "sent") return "duplicate" as const;
      if (confirmation.state === "ambiguous") return "ambiguous" as const;
      if (confirmation.expiresAtMs <= input.nowMs) return "expired" as const;
      if (
        confirmation.id !== input.id ||
        confirmation.actorUid !== input.actorUid ||
        confirmation.payloadHash !== input.payloadHash
      ) {
        return "mismatch" as const;
      }
      confirmation.state = "sending";
      return "claimed" as const;
    },
    markConfirmation: async (input: { state: "sent" | "ambiguous" | "failed" }) => {
      if (confirmation) confirmation.state = input.state;
    },
  };
  const gmail = new VendorGmailService(principal, vendorEmail, {
    assignments,
    provider: { getClient: async () => client },
    confirmations,
    now: () => NOW_MS,
  });
  await gmail.readLinkedThread(ticketId, threadId);
  await gmail.createReplyDraft(ticketId, threadId, "Synthetic assigned-ticket draft.");
  await gmail.applyApprovedLabel(ticketId, threadId, "PMI/Vendor/Waiting");
  const prepared = await gmail.prepareReply(
    ticketId,
    threadId,
    "Synthetic exact-confirmed assigned-ticket reply.",
  );
  const sendInput = {
    confirmationToken: prepared.confirmationToken,
    ticketId: prepared.ticketId,
    threadId: prepared.threadId,
    body: prepared.body,
    messageId: prepared.messageId,
  };
  const firstSend = await gmail.sendConfirmed(sendInput);
  const duplicateSend = await gmail.sendConfirmed(sendInput);

  let wrongTicketHidden = false;
  try {
    await gmail.readLinkedThread("ticket-unassigned-synthetic", threadId);
  } catch (error) {
    wrongTicketHidden = error instanceof VendorBoundaryError && error.status === 404;
  }
  let wrongMailboxBlocked = false;
  try {
    new VendorGmailService(principal, "other-vendor@example.invalid", {
      assignments,
      provider: { getClient: async () => client },
      confirmations,
      now: () => NOW_MS,
    });
  } catch (error) {
    wrongMailboxBlocked = error instanceof VendorBoundaryError && error.status === 403;
  }

  const lifecycleStore = {
    disableVendor: async ({
      vendorId: id,
      nowIso,
    }: {
      vendorId: string;
      nowIso: string;
    }) => {
      const record = records.get(id);
      if (!record || record.status === "disabled") return "already_disabled" as const;
      records.set(id, {
        ...record,
        status: "disabled",
        disabledAt: nowIso,
        updatedAt: nowIso,
      });
      return "disabled" as const;
    },
    getConnection: async () => connection,
    markConnectionRevocationPending: async () => {
      if (connection) connection = { ...connection, status: "revocation_pending" };
    },
    appendAudit: async () => undefined,
  };
  const disabled = await disableVendor(
    {
      actor: ADMIN,
      vendorId,
      vendorUid,
      reason: "Synthetic Vendor lifecycle closeout.",
    },
    {
      now: () => new Date(NOW_MS),
      store: lifecycleStore,
      auth: {
        updateUser: async () => void (identityDisabled = true),
        revokeRefreshTokens: async () => void (sessionRevoked = true),
      },
      revocations: {
        enqueue: async () => void (tokenRevocationQueued = true),
      },
    },
  );
  const connectedScopeCount = (connection as VendorMailboxConnection | null)?.scopes
    .length;

  return {
    invited: invite.status === "pending_setup" && deliveredSetup,
    verifiedEmailTotp: principal.emailVerified && principal.totpVerified,
    oauthExactScopes:
      connected.status === "connected" &&
      tokenStored &&
      connectedScopeCount === VENDOR_OAUTH_SCOPES.length,
    sameMailbox: connected.mailboxEmail === principal.email,
    assignedTicketOnly: wrongTicketHidden,
    wrongMailboxBlocked,
    exactReplyOneAttempt:
      firstSend.status === "sent" &&
      !firstSend.duplicate &&
      duplicateSend.duplicate &&
      sendCalls === 1,
    disabled:
      disabled.status === "disabled" &&
      identityDisabled &&
      records.get(vendorId)?.status === "disabled",
    sessionRevoked,
    tokenRevocationQueued,
    liveProviderCalls: 0,
  };
}
