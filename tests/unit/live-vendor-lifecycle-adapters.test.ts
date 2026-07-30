import { describe, expect, it, vi } from "vitest";

import { GmailRuntimeError } from "@/lib/gmail-runtime/client";
import type {
  GmailMessageView,
  GmailOutgoingMessage,
  GmailSendResult,
  GmailThreadView,
} from "@/lib/gmail-runtime/types";
import {
  FirebaseLiveVendorAuthAdapter,
  GmailLiveVendorInviteDeliveryAdapter,
  LiveVendorInviteAdapterError,
  type LiveVendorFirebaseAuthClient,
  type LiveVendorGmailClient,
} from "@/lib/vendor/live-lifecycle-adapters";
import {
  LiveVendorLifecycleConflictError,
  sha256,
} from "@/lib/vendor/live-lifecycle-contract";

const EXECUTION_HASH = "a".repeat(64);
const IDENTITY_HASH = EXECUTION_HASH.slice(0, 32);
const UID = `vendor_live_${IDENTITY_HASH}`;
const VENDOR_REF = `vendor-live-${IDENTITY_HASH}`;
const RFC_MESSAGE_ID = `<vendor-invite-${EXECUTION_HASH}@pmikcmetro.com>`;
const REISSUE_EXECUTION_HASH = "b".repeat(64);
const REISSUE_RFC_MESSAGE_ID = `<vendor-invite-${REISSUE_EXECUTION_HASH}@pmikcmetro.com>`;
const CHALLENGE_EXPIRES_AT = "2026-07-31T20:00:00.000Z";
const EMAIL = "dispatch@trustedvendor.co";
const SENDER = "approvals@pmikcmetro.com";
const TOKEN = "F".repeat(43);
const SETUP_URL = `https://app.pmikcmetro.com/vendor/setup#token=${TOKEN}`;

interface FakeFirebaseUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
  disabled: boolean;
  customClaims?: Record<string, unknown>;
  providerData?: { providerId?: string }[];
  tokensValidAfterTime?: string;
}

function firebaseUser(overrides: Partial<FakeFirebaseUser> = {}): FakeFirebaseUser {
  return {
    uid: UID,
    email: EMAIL,
    emailVerified: false,
    disabled: false,
    customClaims: {
      vendor: true,
      vendor_id: VENDOR_REF,
      data_mode: "live",
    },
    providerData: [],
    ...overrides,
  };
}

class FakeFirebaseAuth implements LiveVendorFirebaseAuthClient {
  readonly users = new Map<string, FakeFirebaseUser>();
  readonly created: Array<{
    uid: string;
    email: string;
    emailVerified: false;
    disabled: boolean;
  }> = [];
  readonly claimWrites: Array<{
    uid: string;
    claims: Record<string, unknown>;
  }> = [];
  readonly disabled: string[] = [];
  readonly revoked: string[] = [];
  beforeCreate?: (input: { disabled: boolean }) => Promise<void>;

  async getUser(uid: string) {
    const user = this.users.get(uid);
    if (!user) throw { code: "auth/user-not-found" };
    return structuredClone(user);
  }

  async getUserByEmail(email: string) {
    const user = [...this.users.values()].find(
      (candidate) => candidate.email?.toLowerCase() === email.toLowerCase(),
    );
    if (!user) throw { code: "auth/user-not-found" };
    return structuredClone(user);
  }

  async createUser(input: {
    uid: string;
    email: string;
    emailVerified: false;
    disabled: boolean;
  }) {
    await this.beforeCreate?.(input);
    if (this.users.has(input.uid)) throw { code: "auth/uid-already-exists" };
    if (
      [...this.users.values()].some(
        (candidate) => candidate.email?.toLowerCase() === input.email.toLowerCase(),
      )
    ) {
      throw { code: "auth/email-already-exists" };
    }
    this.created.push(structuredClone(input));
    const user = firebaseUser({
      ...input,
      customClaims: {},
      providerData: [],
    });
    this.users.set(input.uid, user);
    return structuredClone(user);
  }

  async setCustomUserClaims(uid: string, claims: Record<string, unknown>) {
    const user = this.users.get(uid);
    if (!user) throw { code: "auth/user-not-found" };
    this.claimWrites.push({ uid, claims: structuredClone(claims) });
    user.customClaims = structuredClone(claims);
  }

  async updateUser(uid: string, input: { disabled: true }) {
    const user = this.users.get(uid);
    if (!user) throw { code: "auth/user-not-found" };
    user.disabled = input.disabled;
    this.disabled.push(uid);
    return structuredClone(user);
  }

  async revokeRefreshTokens(uid: string) {
    const user = this.users.get(uid);
    if (!user) throw { code: "auth/user-not-found" };
    user.tokensValidAfterTime = "2026-07-30T20:00:00.000Z";
    this.revoked.push(uid);
  }
}

function ensureInput() {
  return {
    uid: UID,
    email: EMAIL,
    vendorRef: VENDOR_REF,
    customClaims: {
      vendor: true as const,
      vendor_id: VENDOR_REF,
      data_mode: "live" as const,
    },
  };
}

describe("Firebase Live Vendor auth adapter", () => {
  it("constructs no Auth client until a method call, then creates exact deterministic authority", async () => {
    const auth = new FakeFirebaseAuth();
    const createClient = vi.fn(() => auth);
    const adapter = new FirebaseLiveVendorAuthAdapter(createClient);
    expect(createClient).not.toHaveBeenCalled();

    const principal = await adapter.ensureVendorPrincipal(ensureInput());
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(auth.created).toEqual([
      {
        uid: UID,
        email: EMAIL,
        emailVerified: false,
        disabled: false,
      },
    ]);
    expect(auth.claimWrites).toEqual([
      {
        uid: UID,
        claims: {
          vendor: true,
          vendor_id: VENDOR_REF,
          data_mode: "live",
        },
      },
    ]);
    expect(principal).toEqual({
      uid: UID,
      email: EMAIL,
      emailVerified: false,
      disabled: false,
      customClaims: {
        vendor: true,
        vendor_id: VENDOR_REF,
        data_mode: "live",
      },
    });
  });

  it("idempotently repairs only missing allowed claims on the reserved uid", async () => {
    const auth = new FakeFirebaseAuth();
    auth.users.set(
      UID,
      firebaseUser({
        emailVerified: true,
        customClaims: { vendor: true },
        providerData: [{ providerId: "password" }],
      }),
    );
    const adapter = new FirebaseLiveVendorAuthAdapter(() => auth);
    await expect(adapter.ensureVendorPrincipal(ensureInput())).resolves.toMatchObject({
      uid: UID,
      emailVerified: true,
      customClaims: {
        vendor: true,
        vendor_id: VENDOR_REF,
        data_mode: "live",
      },
    });
    expect(auth.created).toHaveLength(0);
    expect(auth.claimWrites).toHaveLength(1);
  });

  it.each([
    [
      "another uid owns the email",
      firebaseUser({ uid: `vendor_live_${"b".repeat(32)}` }),
    ],
    [
      "extra staff claim",
      firebaseUser({
        customClaims: {
          vendor: true,
          vendor_id: VENDOR_REF,
          data_mode: "live",
          role: "Admin",
        },
      }),
    ],
    [
      "different Vendor claim",
      firebaseUser({
        customClaims: {
          vendor: true,
          vendor_id: `vendor-live-${"b".repeat(32)}`,
          data_mode: "live",
        },
      }),
    ],
    [
      "federated identity",
      firebaseUser({ providerData: [{ providerId: "google.com" }] }),
    ],
  ])("refuses when %s", async (_label, existing) => {
    const auth = new FakeFirebaseAuth();
    auth.users.set(existing.uid, existing);
    const adapter = new FirebaseLiveVendorAuthAdapter(() => auth);
    await expect(adapter.ensureVendorPrincipal(ensureInput())).rejects.toBeInstanceOf(
      LiveVendorLifecycleConflictError,
    );
    expect(auth.claimWrites).toHaveLength(0);
  });

  it("refuses managed staff email and non-correlated uid/ref before constructing Auth", async () => {
    const auth = new FakeFirebaseAuth();
    const createClient = vi.fn(() => auth);
    const adapter = new FirebaseLiveVendorAuthAdapter(createClient);
    await expect(
      adapter.ensureVendorPrincipal({
        ...ensureInput(),
        email: "staff@pmikcmetro.com",
      }),
    ).rejects.toBeInstanceOf(LiveVendorLifecycleConflictError);
    await expect(
      adapter.ensureVendorPrincipal({
        ...ensureInput(),
        vendorRef: `vendor-live-${"b".repeat(32)}`,
      }),
    ).rejects.toBeInstanceOf(LiveVendorLifecycleConflictError);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("disables, revokes, and verifies exact tokensValidAfter readback", async () => {
    const auth = new FakeFirebaseAuth();
    auth.users.set(UID, firebaseUser());
    const adapter = new FirebaseLiveVendorAuthAdapter(() => auth);

    await adapter.disableUser(UID, EMAIL);
    await adapter.revokeRefreshTokens(UID, EMAIL);
    await expect(
      adapter.readDisableState(UID, EMAIL, "2026-07-30T19:59:59.500Z"),
    ).resolves.toEqual({
      disabled: true,
      refreshTokensRevoked: true,
    });
    expect(auth.disabled).toEqual([UID]);
    expect(auth.revoked).toEqual([UID]);

    await expect(
      adapter.readDisableState(UID, EMAIL, "2026-07-30T20:00:01.000Z"),
    ).resolves.toEqual({
      disabled: true,
      refreshTokensRevoked: false,
    });

    await expect(
      adapter.readDisableState(UID, EMAIL, "2026-07-30T20:00:00.001Z"),
    ).resolves.toEqual({
      disabled: true,
      refreshTokensRevoked: false,
    });
    await expect(
      adapter.readDisableState(UID, EMAIL, "2026-07-30T20:00:00.000Z"),
    ).resolves.toEqual({
      disabled: true,
      refreshTokensRevoked: true,
    });
  });

  it("reports an exact active principal as not yet disabled before any mutation", async () => {
    const auth = new FakeFirebaseAuth();
    auth.users.set(UID, firebaseUser());
    const adapter = new FirebaseLiveVendorAuthAdapter(() => auth);

    await expect(
      adapter.readDisableState(UID, EMAIL, "2026-07-30T20:00:00.000Z"),
    ).resolves.toEqual({
      disabled: false,
      refreshTokensRevoked: false,
    });
    expect(auth.disabled).toEqual([]);
    expect(auth.revoked).toEqual([]);
  });

  it.each(["disable-first", "invite-first"] as const)(
    "converges the Auth create/cutoff collision with %s ownership",
    async (order) => {
      const auth = new FakeFirebaseAuth();
      const enabledGate = deferredGate();
      const disabledGate = deferredGate();
      const bothArrived = deferredGate();
      let arrivals = 0;
      auth.beforeCreate = async ({ disabled }) => {
        arrivals += 1;
        if (arrivals === 2) bothArrived.resolve();
        await (disabled ? disabledGate.promise : enabledGate.promise);
      };
      const adapter = new FirebaseLiveVendorAuthAdapter(() => auth);
      const cutoff = adapter.disableUser(UID, EMAIL);
      const invite = adapter.ensureVendorPrincipal(ensureInput());
      await bothArrived.promise;

      if (order === "disable-first") {
        disabledGate.resolve();
        await cutoff;
        enabledGate.resolve();
        await expect(invite).rejects.toBeInstanceOf(LiveVendorLifecycleConflictError);
      } else {
        enabledGate.resolve();
        await expect(invite).resolves.toMatchObject({ disabled: false });
        disabledGate.resolve();
        await cutoff;
      }
      await adapter.revokeRefreshTokens(UID, EMAIL);
      await expect(
        adapter.readDisableState(UID, EMAIL, "2026-07-30T20:00:00.000Z"),
      ).resolves.toEqual({
        disabled: true,
        refreshTokensRevoked: true,
      });
      expect(auth.users.get(UID)).toMatchObject({
        uid: UID,
        email: EMAIL,
        disabled: true,
        customClaims: {
          vendor: true,
          vendor_id: VENDOR_REF,
          data_mode: "live",
        },
      });
    },
  );

  it("refuses external email drift before disable, revoke, or state readback", async () => {
    const auth = new FakeFirebaseAuth();
    auth.users.set(
      UID,
      firebaseUser({
        email: "dispatch@differentvendor.co",
      }),
    );
    const adapter = new FirebaseLiveVendorAuthAdapter(() => auth);

    await expect(adapter.disableUser(UID, EMAIL)).rejects.toBeInstanceOf(
      LiveVendorLifecycleConflictError,
    );

    const drifted = auth.users.get(UID);
    if (!drifted) throw new Error("Expected the drifted Firebase fixture.");
    drifted.disabled = true;

    await expect(adapter.revokeRefreshTokens(UID, EMAIL)).rejects.toBeInstanceOf(
      LiveVendorLifecycleConflictError,
    );
    await expect(
      adapter.readDisableState(UID, EMAIL, "2026-07-30T20:00:00.000Z"),
    ).rejects.toBeInstanceOf(LiveVendorLifecycleConflictError);

    expect(auth.disabled).toEqual([]);
    expect(auth.revoked).toEqual([]);
  });
});

function deferredGate() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function exactMessage(overrides: Partial<GmailMessageView> = {}): GmailMessageView {
  return {
    id: "gmail-message-1",
    threadId: "gmail-thread-1",
    labelIds: ["SENT"],
    from: SENDER,
    to: [EMAIL],
    cc: [],
    bcc: [],
    subject: "Complete your PMI KC Vendor setup",
    date: "Wed, 30 Jul 2026 20:00:00 +0000",
    messageId: RFC_MESSAGE_ID,
    references: [],
    bodyText: "",
    bodyTruncated: false,
    attachments: [],
    ...overrides,
  };
}

class FakeGmailClient implements LiveVendorGmailClient {
  readonly sent: GmailOutgoingMessage[] = [];
  findResult: GmailSendResult | null = {
    messageId: "gmail-message-1",
    threadId: "gmail-thread-1",
    labelIds: ["SENT"],
  };
  thread: GmailThreadView = {
    id: "gmail-thread-1",
    messages: [exactMessage()],
    truncated: false,
  };
  sendError: unknown;
  findError: unknown;
  threadError: unknown;

  constructor(readonly subject: string) {}

  async sendMessage(input: GmailOutgoingMessage) {
    this.sent.push(structuredClone(input));
    if (this.sendError) throw this.sendError;
    return {
      messageId: "gmail-message-1",
      threadId: "gmail-thread-1",
      labelIds: ["SENT"],
    };
  }

  async findMessageByRfcMessageId() {
    if (this.findError) throw this.findError;
    return this.findResult;
  }

  async getThread() {
    if (this.threadError) throw this.threadError;
    return structuredClone(this.thread);
  }
}

function deliveryInput() {
  return {
    recipientEmail: EMAIL,
    recipientHash: sha256(EMAIL),
    company: "Trusted Plumbing",
    vendorRef: VENDOR_REF,
    vendorUid: UID,
    inviteVersion: 1,
    lifecycleExecutionId: EXECUTION_HASH,
    challengeExpiresAt: CHALLENGE_EXPIRES_AT,
    ticketRef: "maintenance-ticket-1",
    artifactRef: "vendor-invite:v1.0" as const,
    rfcMessageId: RFC_MESSAGE_ID,
  };
}

function deliveryHarness(client = new FakeGmailClient(SENDER)) {
  const createClient = vi.fn(() => client);
  const createSetupChallenge = vi.fn(async () => ({
    setupUrl: SETUP_URL,
    expiresAt: CHALLENGE_EXPIRES_AT,
  }));
  const readConfig = vi.fn(() => ({
    kbApprovalSender: SENDER,
    appBaseUrl: "https://app.pmikcmetro.com",
  }));
  const adapter = new GmailLiveVendorInviteDeliveryAdapter({
    createClient,
    createSetupChallenge,
    readConfig,
  });
  return { adapter, client, createClient, createSetupChallenge, readConfig };
}

describe("Gmail Live Vendor invite delivery adapter", () => {
  it("constructs nothing until send, sends one bounded fragment link, and returns bodyless readback", async () => {
    const harness = deliveryHarness();
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.createSetupChallenge).not.toHaveBeenCalled();
    expect(harness.readConfig).not.toHaveBeenCalled();

    const delivery = await harness.adapter.sendInvite(deliveryInput());
    expect(harness.createSetupChallenge).toHaveBeenCalledWith({
      vendorId: VENDOR_REF,
      uid: UID,
      email: EMAIL,
      dataMode: "live",
      inviteVersion: 1,
      lifecycleExecutionId: EXECUTION_HASH,
      expiresAt: CHALLENGE_EXPIRES_AT,
    });
    expect(harness.createClient).toHaveBeenCalledWith(SENDER);
    expect(harness.client.sent).toHaveLength(1);
    const sent = harness.client.sent[0]!;
    expect(sent).toMatchObject({
      from: SENDER,
      to: [EMAIL],
      cc: [],
      bcc: [],
      subject: "Complete your PMI KC Vendor setup",
      messageId: RFC_MESSAGE_ID,
      references: [],
    });
    expect(sent.body.split(SETUP_URL)).toHaveLength(2);
    expect(sent.body.length).toBeLessThanOrEqual(1_600);
    expect(delivery).toEqual({
      providerMessageRef: "gmail-message-1",
      rfcMessageId: RFC_MESSAGE_ID,
      recipientHash: sha256(EMAIL),
    });
    expect(JSON.stringify(delivery)).not.toContain(TOKEN);
    expect(JSON.stringify(delivery)).not.toContain("setup");
  });

  it("binds a setup reissue to its new execution while retaining the original Vendor identity", async () => {
    const client = new FakeGmailClient(SENDER);
    client.thread.messages = [exactMessage({ messageId: REISSUE_RFC_MESSAGE_ID })];
    const harness = deliveryHarness(client);

    await expect(
      harness.adapter.sendInvite({
        ...deliveryInput(),
        inviteVersion: 2,
        lifecycleExecutionId: REISSUE_EXECUTION_HASH,
        rfcMessageId: REISSUE_RFC_MESSAGE_ID,
      }),
    ).resolves.toMatchObject({
      rfcMessageId: REISSUE_RFC_MESSAGE_ID,
      recipientHash: sha256(EMAIL),
    });
    expect(harness.createSetupChallenge).toHaveBeenCalledWith({
      vendorId: VENDOR_REF,
      uid: UID,
      email: EMAIL,
      dataMode: "live",
      inviteVersion: 2,
      lifecycleExecutionId: REISSUE_EXECUTION_HASH,
      expiresAt: CHALLENGE_EXPIRES_AT,
    });
  });

  it.each([
    ["Message-ID", { messageId: `<wrong@pmikcmetro.com>` }],
    ["From", { from: "someone-else@pmikcmetro.com" }],
    ["To", { to: ["other@trustedvendor.co"] }],
    ["extra recipient", { to: [EMAIL, "other@trustedvendor.co"] }],
    ["Cc", { cc: ["other@trustedvendor.co"] }],
    ["Bcc", { bcc: ["other@trustedvendor.co"] }],
    ["Subject", { subject: "Different subject" }],
  ])("treats fetched %s header drift as ambiguous after send", async (_label, drift) => {
    const client = new FakeGmailClient(SENDER);
    client.thread.messages = [exactMessage(drift)];
    const harness = deliveryHarness(client);
    await expect(harness.adapter.sendInvite(deliveryInput())).rejects.toMatchObject({
      ambiguous: true,
    });
  });

  it("refuses recipient-hash or setup-origin drift without sending", async () => {
    const hashHarness = deliveryHarness();
    await expect(
      hashHarness.adapter.sendInvite({
        ...deliveryInput(),
        recipientHash: sha256("other@trustedvendor.co"),
      }),
    ).rejects.toBeInstanceOf(LiveVendorLifecycleConflictError);
    expect(hashHarness.createSetupChallenge).not.toHaveBeenCalled();
    expect(hashHarness.createClient).not.toHaveBeenCalled();

    const originHarness = deliveryHarness();
    originHarness.createSetupChallenge.mockResolvedValue({
      setupUrl: `https://evil.example/vendor/setup#token=${TOKEN}`,
      expiresAt: "2026-07-31T20:00:00.000Z",
    });
    await expect(originHarness.adapter.sendInvite(deliveryInput())).rejects.toMatchObject(
      { ambiguous: false },
    );
    expect(originHarness.createClient).not.toHaveBeenCalled();

    const expiryHarness = deliveryHarness();
    expiryHarness.createSetupChallenge.mockResolvedValue({
      setupUrl: SETUP_URL,
      expiresAt: "2026-07-31T19:59:59.999Z",
    });
    await expect(expiryHarness.adapter.sendInvite(deliveryInput())).rejects.toMatchObject(
      { ambiguous: false },
    );
    expect(expiryHarness.createClient).not.toHaveBeenCalled();
  });

  it("classifies definitive versus ambiguous Gmail failures without returning the setup URL", async () => {
    for (const [error, ambiguous] of [
      [new GmailRuntimeError("definitive", 400, false), false],
      [new GmailRuntimeError("unknown", undefined, true), true],
    ] as const) {
      const client = new FakeGmailClient(SENDER);
      client.sendError = error;
      const harness = deliveryHarness(client);
      let observed: unknown;
      try {
        await harness.adapter.sendInvite(deliveryInput());
      } catch (caught) {
        observed = caught;
      }
      expect(observed).toBeInstanceOf(LiveVendorInviteAdapterError);
      expect(observed).toMatchObject({ ambiguous });
      expect(JSON.stringify(observed)).not.toContain(TOKEN);
      expect(JSON.stringify(observed)).not.toContain(SETUP_URL);
    }

    const readbackClient = new FakeGmailClient(SENDER);
    readbackClient.threadError = new GmailRuntimeError("definitive read", 400, false);
    await expect(
      deliveryHarness(readbackClient).adapter.sendInvite(deliveryInput()),
    ).rejects.toMatchObject({ ambiguous: true });
  });

  it("reconciles only the exact RFC id, recipient, and fetched headers without creating a challenge", async () => {
    const harness = deliveryHarness();
    await expect(
      harness.adapter.findInviteByRfcMessageId({
        rfcMessageId: RFC_MESSAGE_ID,
        recipientEmail: EMAIL,
        recipientHash: sha256(EMAIL),
      }),
    ).resolves.toEqual({
      providerMessageRef: "gmail-message-1",
      rfcMessageId: RFC_MESSAGE_ID,
      recipientHash: sha256(EMAIL),
    });
    expect(harness.createSetupChallenge).not.toHaveBeenCalled();
    expect(harness.client.sent).toHaveLength(0);

    harness.client.thread.messages = [
      exactMessage({ to: ["different@trustedvendor.co"] }),
    ];
    await expect(
      harness.adapter.findInviteByRfcMessageId({
        rfcMessageId: RFC_MESSAGE_ID,
        recipientEmail: EMAIL,
        recipientHash: sha256(EMAIL),
      }),
    ).rejects.toMatchObject({ ambiguous: true });
  });

  it("refuses non-deterministic invite bindings before config, challenge, or Gmail construction", async () => {
    const harness = deliveryHarness();
    for (const input of [
      {
        ...deliveryInput(),
        rfcMessageId: `<vendor-invite-${"b".repeat(64)}@pmikcmetro.com>`,
      },
      {
        ...deliveryInput(),
        lifecycleExecutionId: "b".repeat(64),
      },
      {
        ...deliveryInput(),
        inviteVersion: 0,
      },
    ]) {
      await expect(harness.adapter.sendInvite(input)).rejects.toBeInstanceOf(
        LiveVendorLifecycleConflictError,
      );
    }
    expect(harness.readConfig).not.toHaveBeenCalled();
    expect(harness.createSetupChallenge).not.toHaveBeenCalled();
    expect(harness.createClient).not.toHaveBeenCalled();
  });
});
