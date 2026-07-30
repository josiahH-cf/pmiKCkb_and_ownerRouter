import { createHash } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  externalActionContextHash,
  externalActionIdempotencyKey,
} from "@/lib/external-execution/identity";
import type {
  ExternalActionPreparationInput,
  TrustedExternalExecutionContext,
} from "@/lib/external-execution/s20-bridge";
import {
  createLiveVendorPreparedAttemptSnapshot,
  FirestoreLiveVendorLifecycleStore,
  LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS,
  LIVE_VENDOR_LIFECYCLE_COLLECTIONS,
  type LiveVendorDisableCompletionClaim,
} from "@/lib/firestore/vendor-lifecycle-executions";
import {
  LIVE_VENDOR_DISABLE_INITIAL_SOURCE,
  LIVE_VENDOR_DISABLE_COMPLETION_LEASE_MS,
  LIVE_VENDOR_INVITE_RECOVERY_DELAY_MS,
  LIVE_VENDOR_NO_ASSIGNMENT_REF,
  LiveVendorLifecycleAmbiguousError,
  LiveVendorLifecycleConflictError,
  canonicalLiveAssignmentRefs,
  hashLiveVendorDisablePayload,
  liveVendorAssignmentActionValues,
  liveVendorDisableActionValues,
  liveVendorInviteDerivedRefs,
  liveVendorInviteActionValues,
  liveVendorLifecycleExecutionId,
  liveVendorS20ExecutionId,
  normalizeLiveVendorEmail,
  sha256,
  type LiveVendorAuthAdapter,
  type LiveVendorAuthPrincipal,
  type LiveVendorAssignmentInput,
  type LiveVendorDisableInput,
  type LiveVendorInviteDelivery,
  type LiveVendorInviteDeliveryAdapter,
  type LiveVendorInviteInput,
  type LiveVendorLifecycleExecutionRecord,
} from "@/lib/vendor/live-lifecycle-contract";
import { LiveVendorLifecycleProvider } from "@/lib/vendor/live-lifecycle-provider";
import { FakeTransactionalFirestore } from "@/tests/helpers/fake-transactional-firestore";

const ORIGINAL_GENERATION = "2026-07-30T12:00:00.000Z";
const ACCESS_CUTOFF_TIME = "2026-07-30T12:40:00.000Z";
const EFFECT_TIME = "2026-07-30T13:00:00.000Z";
const INVITE_DISABLE_TIME = "2026-07-30T13:01:00.000Z";
const ACTOR_UID = "admin-live-1";
const TEST_ACTOR: AuthenticatedUser = {
  email: "admin-live-1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  uid: ACTOR_UID,
};
const COMPANY = "Summit Plumbing";
const EMAIL = "dispatch@summitplumbing.co";
const TICKET_REF = "ticket-live-1";
const VENDOR_REF = "vendor-live-existing";
const VENDOR_UID = "vendor_live_existing_uid";
const PREVIOUS_VENDOR_REF = "vendor-live-previous";

let fake: FakeTransactionalFirestore;
let store: FirestoreLiveVendorLifecycleStore;
let auth: FakeLiveVendorAuth;
let delivery: FakeLiveVendorDelivery;
let provider: LiveVendorLifecycleProvider;

beforeEach(() => {
  fake = new FakeTransactionalFirestore();
  store = new FirestoreLiveVendorLifecycleStore(fake as unknown as Firestore);
  auth = new FakeLiveVendorAuth();
  delivery = new FakeLiveVendorDelivery();
  provider = new LiveVendorLifecycleProvider({
    context: { environment: "production", dataMode: "live" },
    store,
    auth,
    delivery,
    now: () => new Date(EFFECT_TIME),
  });
});

describe("Live Vendor lifecycle identity and persistence", () => {
  it.each([
    { environment: "demo", dataMode: "live" },
    { environment: "production", dataMode: "test" },
  ])("refuses a non-Production+Live runtime context", (context) => {
    expect(
      () =>
        new LiveVendorLifecycleProvider({
          context: context as never,
          store,
          auth,
          delivery,
        }),
    ).toThrow(/Production Live Firestore boundary/i);
  });

  it("derives exact SHA-256 execution and S20 identities", () => {
    const key = "exact-idempotency-key";
    const expected = createHash("sha256")
      .update(`vendor.account.invite\0${key}`)
      .digest("hex");
    expect(liveVendorLifecycleExecutionId("vendor.account.invite", key)).toBe(expected);
    expect(liveVendorS20ExecutionId("vendor.account.invite", key)).toBe(
      `exec_${createHash("sha256")
        .update(`external-action:v1\0vendor.account.invite\0${key}`)
        .digest("hex")
        .slice(0, 40)}`,
    );
  });

  it("encodes exact assignment sets without delimiter or empty-set collisions", () => {
    expect(canonicalLiveAssignmentRefs([])).toBe("[]");
    expect(canonicalLiveAssignmentRefs(["a,b", "c"])).toBe('["a,b","c"]');
    expect(canonicalLiveAssignmentRefs(["a", "b,c"])).toBe('["a","b,c"]');
    expect(canonicalLiveAssignmentRefs(["a,b", "c"])).not.toBe(
      canonicalLiveAssignmentRefs(["a", "b,c"]),
    );
    expect(canonicalLiveAssignmentRefs(["none"])).not.toBe(
      canonicalLiveAssignmentRefs([]),
    );
  });

  it("commits assignment, ticket, activity, Vendor audit, receipt, and S20 index atomically", async () => {
    seedVendor(fake, { status: "pending_setup" });
    seedTicket(fake);
    const input = assignmentInput("assignment-exact-key");

    const first = await provider.changeAssignment(input);
    expect(first).toMatchObject({
      state: "assigned",
      vendorRef: VENDOR_REF,
      ticketRef: TICKET_REF,
      currentVendorRef: "vendor:none",
      targetVendorRef: VENDOR_REF,
    });
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets}/${TICKET_REF}`),
    ).toMatchObject({
      id: TICKET_REF,
      data_mode: "live",
      vendor_id: VENDOR_REF,
      updated_at: EFFECT_TIME,
    });
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments}/${TICKET_REF}`),
    ).toEqual({
      ticket_id: TICKET_REF,
      vendor_id: VENDOR_REF,
      active: true,
      data_mode: "live",
      updated_at: EFFECT_TIME,
    });

    const executionId = liveVendorLifecycleExecutionId(
      "vendor.assignment.change",
      input.idempotencyKey,
    );
    const execution = fake.read(
      `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions}/${executionId}`,
    );
    expect(execution).toMatchObject({
      state: "succeeded",
      phase: "succeeded",
      attemptCount: 1,
      s20ExecutionId: liveVendorS20ExecutionId(
        "vendor.assignment.change",
        input.idempotencyKey,
      ),
      bindings: {
        kind: "assignment",
        vendorUpdatedAt: ORIGINAL_GENERATION,
        ticketUpdatedAt: ORIGINAL_GENERATION,
        currentVendorRef: "vendor:none",
        targetVendorRef: VENDOR_REF,
      },
      receipt: { state: "assigned", reconciled: false },
    });
    await expect(
      store.getExecutionByS20ExecutionId(
        liveVendorS20ExecutionId("vendor.assignment.change", input.idempotencyKey),
      ),
    ).resolves.toMatchObject({ id: executionId });
    await expect(
      provider.reconcileByS20ExecutionId(
        liveVendorS20ExecutionId("vendor.assignment.change", input.idempotencyKey),
      ),
    ).resolves.toEqual(first);
    await expect(
      store.getExecutionByS20ExecutionId(`exec_${"f".repeat(40)}`),
    ).resolves.toBeNull();

    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.maintenanceActivity),
    ).toHaveLength(1);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendorAudit),
    ).toHaveLength(1);
    expect(fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.audit)).toHaveLength(
      1,
    );
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.s20Index),
    ).toHaveLength(1);

    await expect(provider.changeAssignment(input)).resolves.toEqual(first);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.maintenanceActivity),
    ).toHaveLength(1);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendorAudit),
    ).toHaveLength(1);

    await expect(
      provider.changeAssignment({
        ...input,
        reason: "A changed exact-confirmation reason",
      }),
    ).rejects.toMatchObject({
      status: 409,
      name: "LiveVendorLifecycleConflictError",
    });

    const bodyless = JSON.stringify({
      executions: fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions),
      executionAudit: fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.audit),
      vendorAudit: fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendorAudit),
      index: fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.s20Index),
    });
    expect(bodyless).not.toContain(EMAIL);
    expect(bodyless).not.toContain(input.reason);
    expect(bodyless).not.toMatch(
      /setup(?:Url|_url|Token|_token)|message(?:Body|_body)|password|totp/i,
    );
  });

  it("rejects stale assignment generations without any partial write", async () => {
    seedVendor(fake, { status: "active" });
    seedTicket(fake);
    const before = fake.read(
      `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets}/${TICKET_REF}`,
    );

    await expect(
      provider.changeAssignment({
        ...assignmentInput("assignment-stale-key"),
        ticketUpdatedAt: "2026-07-30T11:59:59.000Z",
      }),
    ).rejects.toBeInstanceOf(LiveVendorLifecycleConflictError);

    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets}/${TICKET_REF}`),
    ).toEqual(before);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions),
    ).toHaveLength(0);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.maintenanceActivity),
    ).toHaveLength(0);
  });

  it("serializes assignment commit behind the Vendor setup-effect fence", async () => {
    seedVendor(fake, { status: "pending_setup" });
    seedTicket(fake);
    const vendorPath = `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/${VENDOR_REF}`;
    const vendor = fake.read(vendorPath);
    if (!vendor) throw new Error("Expected the pending-setup Vendor fixture.");
    fake.seed(vendorPath, {
      ...vendor,
      setupEffectFence: {
        schemaVersion: 1,
        tokenHash: "a".repeat(64),
        claimIdHash: "b".repeat(64),
        inviteVersion: 1,
        lifecycleExecutionId: "c".repeat(64),
        startedAt: EFFECT_TIME,
        dataMode: "live",
      },
    });
    const ticketBefore = fake.read(
      `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets}/${TICKET_REF}`,
    );

    await expect(
      provider.changeAssignment(assignmentInput("assignment-fenced-setup-effect")),
    ).rejects.toBeInstanceOf(LiveVendorLifecycleConflictError);

    expect(fake.read(vendorPath)).toMatchObject({
      status: "pending_setup",
      setupEffectFence: { lifecycleExecutionId: "c".repeat(64) },
    });
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets}/${TICKET_REF}`),
    ).toEqual(ticketBefore);
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments}/${TICKET_REF}`),
    ).toBeUndefined();
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions),
    ).toHaveLength(0);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.maintenanceActivity),
    ).toHaveLength(0);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendorAudit),
    ).toHaveLength(0);
  });

  it("refuses a replacement while the currently assigned Vendor owns setup effects without any partial write", async () => {
    seedVendor(fake, { status: "active" });
    fake.seed(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/${PREVIOUS_VENDOR_REF}`, {
      id: PREVIOUS_VENDOR_REF,
      uid: "vendor_live_previous_uid",
      email: "dispatch@previous-vendor.example",
      displayName: "Previous Vendor LLC",
      status: "active",
      inviteVersion: 1,
      data_mode: "live",
      identityState: {
        emailVerified: true,
        totpRequired: true,
        totpVerified: true,
      },
      createdAt: ORIGINAL_GENERATION,
      updatedAt: ORIGINAL_GENERATION,
      setupEffectFence: {
        schemaVersion: 1,
        tokenHash: "a".repeat(64),
        claimIdHash: "b".repeat(64),
        inviteVersion: 1,
        lifecycleExecutionId: "c".repeat(64),
        startedAt: EFFECT_TIME,
        dataMode: "live",
      },
    });
    seedTicket(fake, { vendor_id: PREVIOUS_VENDOR_REF });
    fake.seed(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments}/${TICKET_REF}`, {
      ticket_id: TICKET_REF,
      vendor_id: PREVIOUS_VENDOR_REF,
      active: true,
      data_mode: "live",
      updated_at: ORIGINAL_GENERATION,
    });
    const input = {
      ...assignmentInput("assignment-replacement-fenced-current"),
      currentVendorRef: PREVIOUS_VENDOR_REF,
    };
    const stateBefore = structuredClone([...fake.store.entries()]);

    await expect(provider.changeAssignment(input)).rejects.toBeInstanceOf(
      LiveVendorLifecycleConflictError,
    );

    expect([...fake.store.entries()]).toEqual(stateBefore);
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets}/${TICKET_REF}`),
    ).toMatchObject({ vendor_id: PREVIOUS_VENDOR_REF, updated_at: ORIGINAL_GENERATION });
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments}/${TICKET_REF}`),
    ).toMatchObject({ vendor_id: PREVIOUS_VENDOR_REF, active: true });
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions),
    ).toHaveLength(0);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.maintenanceActivity),
    ).toHaveLength(0);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendorAudit),
    ).toHaveLength(0);
  });

  it("never treats the no-assignment sentinel as a real current or target Vendor", async () => {
    seedVendor(fake, { status: "active" });
    seedTicket(fake, { vendor_id: LIVE_VENDOR_NO_ASSIGNMENT_REF });
    fake.seed(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments}/${TICKET_REF}`, {
      ticket_id: TICKET_REF,
      vendor_id: LIVE_VENDOR_NO_ASSIGNMENT_REF,
      active: true,
      data_mode: "live",
      updated_at: ORIGINAL_GENERATION,
    });

    await expect(
      provider.changeAssignment(assignmentInput("assignment-sentinel-current")),
    ).rejects.toThrow(/sentinel/i);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions),
    ).toHaveLength(0);

    await expect(
      provider.changeAssignment({
        ...assignmentInput("assignment-sentinel-target"),
        vendorRef: LIVE_VENDOR_NO_ASSIGNMENT_REF,
        vendorUid: "vendor_live_forbidden_sentinel",
        targetVendorRef: LIVE_VENDOR_NO_ASSIGNMENT_REF,
      }),
    ).rejects.toThrow(/sentinel/i);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions),
    ).toHaveLength(0);
  });

  it("refuses inactive Test or malformed assignment joins without overwriting them", async () => {
    seedVendor(fake, { status: "active" });
    seedTicket(fake);
    const corruptions = [
      {
        ticket_id: TICKET_REF,
        vendor_id: "vendor-old",
        active: false,
        data_mode: "test",
      },
      {
        ticket_id: "ticket-wrong",
        vendor_id: "vendor-old",
        active: false,
        data_mode: "live",
      },
      {
        ticket_id: TICKET_REF,
        vendor_id: LIVE_VENDOR_NO_ASSIGNMENT_REF,
        active: false,
        data_mode: "live",
      },
    ] as const;

    for (const [index, assignment] of corruptions.entries()) {
      fake.seed(
        `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments}/${TICKET_REF}`,
        assignment,
      );
      await expect(
        provider.changeAssignment(
          assignmentInput(`assignment-malformed-inactive-${index}`),
        ),
      ).rejects.toThrow(/assignment records disagree/i);
      expect(
        fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments}/${TICKET_REF}`),
      ).toEqual(assignment);
    }
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions),
    ).toHaveLength(0);
  });
});

describe("Live Vendor invite idempotency and ambiguity", () => {
  it("reconciles an accepted ambiguous message by exact Message-ID and To without resending", async () => {
    seedTicket(fake);
    delivery.throwAfterAccept = true;
    const input = inviteInput("invite-ambiguous-key");
    const derived = liveVendorInviteDerivedRefs(input.idempotencyKey);

    await expect(provider.invite(input)).rejects.toBeInstanceOf(
      LiveVendorLifecycleAmbiguousError,
    );
    expect(delivery.sendCalls).toHaveLength(1);
    expect(delivery.sendCalls[0]).toMatchObject({
      challengeExpiresAt: new Date(
        Date.parse(EFFECT_TIME) + LIVE_VENDOR_INVITE_RECOVERY_DELAY_MS,
      ).toISOString(),
      inviteVersion: 1,
      lifecycleExecutionId: derived.executionId,
      recipientEmail: EMAIL,
      vendorRef: derived.vendorRef,
      vendorUid: derived.vendorUid,
      rfcMessageId: derived.rfcMessageId,
    });
    expect(auth.ensureCalls[0]?.customClaims).toEqual({
      vendor: true,
      vendor_id: derived.vendorRef,
      data_mode: "live",
    });

    const reconciled = await provider.invite(input);
    expect(reconciled).toEqual({
      providerRef: derived.vendorRef,
      state: "pending_setup",
      vendorCompany: COMPANY,
      vendorEmail: EMAIL,
      ticketRef: TICKET_REF,
    });
    expect(delivery.sendCalls).toHaveLength(1);
    expect(delivery.findCalls.at(-1)).toEqual({
      rfcMessageId: derived.rfcMessageId,
      recipientEmail: EMAIL,
      recipientHash: sha256(EMAIL),
    });

    await expect(provider.invite(input)).resolves.toEqual(reconciled);
    expect(delivery.sendCalls).toHaveLength(1);
    await expect(
      provider.invite({ ...input, company: "Changed Company" }),
    ).rejects.toMatchObject({ status: 409 });

    const record = await store.getExecution(
      "vendor.account.invite",
      input.idempotencyKey,
    );
    expect(record).toMatchObject({
      state: "succeeded",
      phase: "succeeded",
      bindings: {
        emailHash: sha256(EMAIL),
        companyHash: sha256(COMPANY),
        inviteMode: "initial",
        inviteVersion: 0,
        issuedInviteVersion: 1,
        rfcMessageId: derived.rfcMessageId,
        vendorUpdatedAt: "generation:new",
      },
      receipt: {
        state: "pending_setup",
        reconciled: true,
      },
    });
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain(EMAIL);
    expect(serialized).not.toContain(input.reason);
    expect(serialized).not.toMatch(/setupUrl|#token=|messageBody|totp/i);
  });

  it("allows only one delivery claim under concurrent duplicate execution", async () => {
    seedTicket(fake);
    const input = inviteInput("invite-concurrent-key");
    fake.armNextCommitBarrier(2);

    const outcomes = await Promise.allSettled([
      provider.invite(input),
      provider.invite(input),
    ]);
    expect(outcomes.some((outcome) => outcome.status === "fulfilled")).toBe(true);
    expect(auth.ensureCalls).toHaveLength(1);
    expect(delivery.sendCalls).toHaveLength(1);
    await expect(provider.invite(input)).resolves.toMatchObject({
      state: "pending_setup",
    });
    expect(delivery.sendCalls).toHaveLength(1);
  });

  it("terminalizes late Gmail evidence after disable and reconciles it without resending", async () => {
    seedTicket(fake);
    const accepted = deferred();
    const release = deferred();
    delivery.afterAccept = async () => {
      accepted.resolve();
      await release.promise;
    };
    const input = inviteInput("invite-late-after-disable");
    const attempt = provider.invite(input);
    await accepted.promise;

    await expect(
      store.getExecution("vendor.account.invite", input.idempotencyKey),
    ).resolves.toMatchObject({
      state: "running",
      phase: "delivery_effect_started",
    });
    await commitPendingSetupDisable(input.idempotencyKey, "disable-late-invite-delivery");
    release.resolve();

    await expect(attempt).rejects.toBeInstanceOf(LiveVendorLifecycleAmbiguousError);
    const terminal = await store.getExecution(
      "vendor.account.invite",
      input.idempotencyKey,
    );
    expect(terminal).toMatchObject({
      state: "succeeded",
      phase: "succeeded",
      lastErrorCode: "disabled_during_invite_delivery",
      receipt: {
        state: "delivery_invalidated",
        reconciled: false,
        deliveryRefHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    const reconciled = await provider.reconcileByS20ExecutionId(
      liveVendorS20ExecutionId("vendor.account.invite", input.idempotencyKey),
    );
    expect(reconciled).toMatchObject({
      state: "delivery_invalidated",
      reasonCode: "disabled_during_invite_delivery",
      executionId: terminal?.id,
      s20ExecutionId: terminal?.s20ExecutionId,
      vendorRef: terminal?.bindings.vendorRef,
      deliveryRefHash: terminal?.receipt?.deliveryRefHash,
    });
    await expect(
      provider.reconcile("vendor.account.invite", input.idempotencyKey),
    ).resolves.toEqual(reconciled);
    expect(delivery.sendCalls).toHaveLength(1);
  });

  it("closes historical invite delivery after the same setup generation activates", async () => {
    seedTicket(fake);
    const accepted = deferred();
    const release = deferred();
    delivery.afterAccept = async () => {
      accepted.resolve();
      await release.promise;
    };
    const input = inviteInput("invite-setup-activates-before-ledger");
    const attempt = provider.invite(input);
    await accepted.promise;

    const refs = liveVendorInviteDerivedRefs(input.idempotencyKey);
    const vendorPath = `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/${refs.vendorRef}`;
    const pending = fake.read(vendorPath);
    if (!pending) throw new Error("Expected the pending Vendor generation.");
    fake.seed(vendorPath, {
      ...pending,
      status: "active",
      updatedAt: INVITE_DISABLE_TIME,
      activatedAt: INVITE_DISABLE_TIME,
      identityState: {
        emailVerified: true,
        totpRequired: true,
        totpVerified: true,
      },
    });
    release.resolve();

    await expect(attempt).resolves.toMatchObject({
      state: "pending_setup",
      providerRef: refs.vendorRef,
    });
    expect(fake.read(vendorPath)).toMatchObject({
      status: "active",
      inviteVersion: 1,
      activatedAt: INVITE_DISABLE_TIME,
    });
    await expect(
      store.getExecution("vendor.account.invite", input.idempotencyKey),
    ).resolves.toMatchObject({
      state: "succeeded",
      receipt: { state: "pending_setup" },
    });
  });

  it("rejects malformed delivery evidence and transition time before any ledger write", async () => {
    seedTicket(fake);
    const accepted = deferred();
    const release = deferred();
    delivery.afterAccept = async () => {
      accepted.resolve();
      await release.promise;
    };
    const input = inviteInput("invite-malformed-completion-evidence");
    const attempt = provider.invite(input);
    await accepted.promise;
    const record = await store.getExecution(
      "vendor.account.invite",
      input.idempotencyKey,
    );
    if (!record) throw new Error("Expected the in-flight invite execution.");
    const before = JSON.stringify(record);
    const auditBefore = fake.collectionEntries(
      LIVE_VENDOR_LIFECYCLE_COLLECTIONS.audit,
    ).length;

    await expect(
      store.completeInvite({
        executionId: record.id,
        payloadHash: record.payloadHash,
        deliveryRefHash: "A".repeat(64),
        reconciled: true,
        nowIso: INVITE_DISABLE_TIME,
      }),
    ).rejects.toThrow(/delivery reference hash is invalid/i);
    await expect(
      store.completeInvite({
        executionId: record.id,
        payloadHash: record.payloadHash,
        deliveryRefHash: "a".repeat(64),
        reconciled: true,
        nowIso: "2026-07-30 13:01:00Z",
      }),
    ).rejects.toThrow(/transition timestamp is invalid/i);
    expect(
      JSON.stringify(
        await store.getExecution("vendor.account.invite", input.idempotencyKey),
      ),
    ).toBe(before);
    expect(fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.audit)).toHaveLength(
      auditBefore,
    );

    release.resolve();
    await expect(attempt).resolves.toMatchObject({ state: "pending_setup" });
  });

  it("fails closed when disable commits after Auth but before Firebase-ready progression", async () => {
    seedTicket(fake);
    const input = inviteInput("invite-disable-before-identity-ready");
    const derived = liveVendorInviteDerivedRefs(input.idempotencyKey);
    const transitionReached = deferred();
    const releaseTransition = deferred();
    const markPrincipalReady = store.markInvitePrincipalReady.bind(store);
    vi.spyOn(store, "markInvitePrincipalReady").mockImplementation(
      async (transitionInput) => {
        transitionReached.resolve();
        await releaseTransition.promise;
        return markPrincipalReady(transitionInput);
      },
    );

    const inviteAttempt = provider.invite(input);
    const inviteRejection = expect(inviteAttempt).rejects.toBeInstanceOf(
      LiveVendorLifecycleAmbiguousError,
    );
    await transitionReached.promise;
    expect(auth.ensureCalls).toHaveLength(1);
    await expect(provider.invite(input)).rejects.toBeInstanceOf(
      LiveVendorLifecycleAmbiguousError,
    );
    await expect(
      provider.reconcile("vendor.account.invite", input.idempotencyKey),
    ).resolves.toBeNull();
    expect(auth.ensureCalls).toHaveLength(1);

    await commitPendingSetupDisable(
      input.idempotencyKey,
      "disable-before-invite-identity-ready",
    );
    releaseTransition.resolve();
    await inviteRejection;

    expect(delivery.sendCalls).toHaveLength(0);
    expect(delivery.findCalls).toHaveLength(0);
    await expect(
      store.getExecution("vendor.account.invite", input.idempotencyKey),
    ).resolves.toMatchObject({
      state: "ambiguous",
      phase: "identity_effect_claimed",
    });
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/${derived.vendorRef}`),
    ).toMatchObject({
      uid: derived.vendorUid,
      status: "disabled",
      updatedAt: INVITE_DISABLE_TIME,
    });
  });

  it("fails closed when disable commits after Firebase-ready but before delivery claim", async () => {
    seedTicket(fake);
    const input = inviteInput("invite-disable-before-delivery-claim");
    const derived = liveVendorInviteDerivedRefs(input.idempotencyKey);
    const transitionReached = deferred();
    const releaseTransition = deferred();
    const claimDelivery = store.claimInviteDelivery.bind(store);
    vi.spyOn(store, "claimInviteDelivery").mockImplementation(async (transitionInput) => {
      transitionReached.resolve();
      await releaseTransition.promise;
      return claimDelivery(transitionInput);
    });

    const inviteAttempt = provider.invite(input);
    const inviteRejection = expect(inviteAttempt).rejects.toThrow(
      /no longer eligible for external effects/i,
    );
    await transitionReached.promise;
    await expect(
      store.getExecution("vendor.account.invite", input.idempotencyKey),
    ).resolves.toMatchObject({
      state: "running",
      phase: "identity_ready",
    });

    await commitPendingSetupDisable(
      input.idempotencyKey,
      "disable-before-invite-delivery-claim",
    );
    releaseTransition.resolve();
    await inviteRejection;

    expect(auth.ensureCalls).toHaveLength(1);
    expect(delivery.sendCalls).toHaveLength(0);
    expect(delivery.findCalls).toHaveLength(0);
    await expect(
      store.getExecution("vendor.account.invite", input.idempotencyKey),
    ).resolves.toMatchObject({
      state: "running",
      phase: "identity_ready",
    });
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/${derived.vendorRef}`),
    ).toMatchObject({
      uid: derived.vendorUid,
      status: "disabled",
      updatedAt: INVITE_DISABLE_TIME,
    });
  });

  it("reissues one setup link for the exact pending-setup generation and preserves the prior receipt", async () => {
    seedTicket(fake);
    let clockMs = Date.parse(EFFECT_TIME);
    const reissueProvider = new LiveVendorLifecycleProvider({
      context: { environment: "production", dataMode: "live" },
      store,
      auth,
      delivery,
      now: () => new Date(clockMs),
    });
    const original = inviteInput("invite-setup-reissue-original");
    const originalResult = await reissueProvider.invite(original);
    const originalRecord = await store.getExecution(
      "vendor.account.invite",
      original.idempotencyKey,
    );
    const originalReceipt = structuredClone(originalRecord?.receipt);
    const originalRefs = liveVendorInviteDerivedRefs(original.idempotencyKey);

    clockMs += 60 * 60 * 1000;
    const reissue = followupInviteInput({
      sourceIdempotencyKey: original.idempotencyKey,
      idempotencyKey: "invite-setup-reissue-next",
      inviteMode: "setup_link_reissue",
      inviteVersion: 1,
      vendorUpdatedAt: EFFECT_TIME,
      reason: "Reissue one setup link for the exact pending Vendor generation.",
    });
    const [first, concurrentDuplicate] = await Promise.allSettled([
      reissueProvider.invite(reissue),
      reissueProvider.invite(reissue),
    ]);

    expect(
      [first, concurrentDuplicate].some((outcome) => outcome.status === "fulfilled"),
    ).toBe(true);
    const reissued = await reissueProvider.invite(reissue);
    expect(reissued).toEqual(originalResult);
    expect(delivery.sendCalls).toHaveLength(2);
    const reissueRefs = liveVendorInviteDerivedRefs(reissue.idempotencyKey);
    expect(delivery.sendCalls[1]).toMatchObject({
      challengeExpiresAt: new Date(
        clockMs + LIVE_VENDOR_INVITE_RECOVERY_DELAY_MS,
      ).toISOString(),
      inviteVersion: 2,
      lifecycleExecutionId: reissueRefs.executionId,
      rfcMessageId: reissueRefs.rfcMessageId,
      vendorRef: originalRefs.vendorRef,
      vendorUid: originalRefs.vendorUid,
    });

    await expect(
      store.getExecution("vendor.account.invite", original.idempotencyKey),
    ).resolves.toMatchObject({
      state: "succeeded",
      receipt: originalReceipt,
    });
    const reissueRecord = await store.getExecution(
      "vendor.account.invite",
      reissue.idempotencyKey,
    );
    expect(reissueRecord).toMatchObject({
      state: "succeeded",
      bindings: {
        inviteMode: "setup_link_reissue",
        inviteVersion: 1,
        issuedInviteVersion: 2,
        supersededExecutionId: originalRecord?.id,
        supersededS20ExecutionId: originalRecord?.s20ExecutionId,
        vendorUpdatedAt: EFFECT_TIME,
      },
    });
    await expect(store.getInviteReservation(EMAIL)).resolves.toMatchObject({
      id: reissueRecord?.id,
    });
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/${originalRefs.vendorRef}`),
    ).toMatchObject({
      inviteVersion: 2,
      status: "pending_setup",
      updatedAt: new Date(clockMs).toISOString(),
    });
  });

  it("refuses a stale setup-link reissue generation before Auth or Gmail", async () => {
    seedTicket(fake);
    const original = inviteInput("invite-stale-reissue-original");
    await provider.invite(original);
    const stale = followupInviteInput({
      sourceIdempotencyKey: original.idempotencyKey,
      idempotencyKey: "invite-stale-reissue-next",
      inviteMode: "setup_link_reissue",
      inviteVersion: 2,
      vendorUpdatedAt: EFFECT_TIME,
      reason: "Attempt a stale setup-link reissue.",
    });
    auth.ensureCalls.length = 0;

    await expect(provider.invite(stale)).rejects.toThrow(
      /pending-setup Vendor generation changed/i,
    );
    expect(auth.ensureCalls).toHaveLength(0);
    expect(delivery.sendCalls).toHaveLength(1);
  });

  it("serializes setup-link reissue behind the Vendor setup-effect fence", async () => {
    seedTicket(fake);
    const original = inviteInput("invite-fenced-reissue-original");
    await provider.invite(original);
    const originalRefs = liveVendorInviteDerivedRefs(original.idempotencyKey);
    const vendorPath = `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/${originalRefs.vendorRef}`;
    const vendor = fake.read(vendorPath);
    if (!vendor) throw new Error("Expected the pending-setup Vendor fixture.");
    fake.seed(vendorPath, {
      ...vendor,
      setupEffectFence: {
        schemaVersion: 1,
        tokenHash: "a".repeat(64),
        claimIdHash: "b".repeat(64),
        inviteVersion: 1,
        lifecycleExecutionId: originalRefs.executionId,
        startedAt: EFFECT_TIME,
        dataMode: "live",
      },
    });
    const reissue = followupInviteInput({
      sourceIdempotencyKey: original.idempotencyKey,
      idempotencyKey: "invite-fenced-reissue-next",
      inviteMode: "setup_link_reissue",
      inviteVersion: 1,
      vendorUpdatedAt: EFFECT_TIME,
      reason: "Attempt reissue while setup owns the exact Vendor generation.",
    });
    auth.ensureCalls.length = 0;

    await expect(provider.invite(reissue)).rejects.toBeInstanceOf(
      LiveVendorLifecycleConflictError,
    );
    expect(auth.ensureCalls).toHaveLength(0);
    expect(delivery.sendCalls).toHaveLength(1);
    expect(fake.read(vendorPath)).toMatchObject({
      inviteVersion: 1,
      setupEffectFence: { lifecycleExecutionId: originalRefs.executionId },
    });
    await expect(
      store.getExecution("vendor.account.invite", reissue.idempotencyKey),
    ).resolves.toBeNull();
  });

  it("safely reissues a stranded invite after the old setup challenge expires", async () => {
    seedTicket(fake);
    let clockMs = Date.parse("2026-07-29T12:00:00.000Z");
    const recoveryProvider = new LiveVendorLifecycleProvider({
      context: { environment: "production", dataMode: "live" },
      store,
      auth,
      delivery,
      now: () => new Date(clockMs),
    });
    const original = inviteInput("invite-stranded-original");
    const replacement = followupInviteInput({
      sourceIdempotencyKey: original.idempotencyKey,
      idempotencyKey: "invite-stranded-replacement",
      inviteMode: "delivery_recovery",
      inviteVersion: 1,
      vendorUpdatedAt: new Date(clockMs).toISOString(),
      reason: "Reissue the expired, unobserved Vendor invitation.",
    });

    await strandInviteBeforeDeliveryEffect(recoveryProvider, original);
    const originalRefs = liveVendorInviteDerivedRefs(original.idempotencyKey);
    expect(delivery.sendCalls).toHaveLength(0);
    expect(delivery.found).toBeNull();

    clockMs += LIVE_VENDOR_INVITE_RECOVERY_DELAY_MS - 1;
    await expect(recoveryProvider.invite(replacement)).rejects.toThrow(
      /wait for the prior setup challenge to expire/i,
    );
    expect(delivery.sendCalls).toHaveLength(0);

    clockMs += 1;
    const result = await recoveryProvider.invite(replacement);
    expect(result).toMatchObject({
      providerRef: originalRefs.vendorRef,
      state: "pending_setup",
      vendorEmail: EMAIL,
    });
    expect(delivery.sendCalls).toHaveLength(1);
    expect(delivery.sendCalls[0]).toMatchObject({
      inviteVersion: 1,
      vendorRef: originalRefs.vendorRef,
      vendorUid: originalRefs.vendorUid,
    });
    expect(delivery.sendCalls[0]?.rfcMessageId).not.toBe(originalRefs.rfcMessageId);

    const originalRecord = await store.getExecution(
      "vendor.account.invite",
      original.idempotencyKey,
    );
    const replacementRecord = await store.getExecution(
      "vendor.account.invite",
      replacement.idempotencyKey,
    );
    expect(originalRecord).toMatchObject({
      state: "superseded",
      supersededByExecutionId: replacementRecord?.id,
    });
    expect(replacementRecord).toMatchObject({
      state: "succeeded",
      bindings: {
        inviteMode: "delivery_recovery",
        inviteVersion: 1,
        issuedInviteVersion: 1,
        vendorRef: originalRefs.vendorRef,
        vendorUid: originalRefs.vendorUid,
        supersededExecutionId: originalRecord?.id,
        supersededS20ExecutionId: originalRecord?.s20ExecutionId,
        supersessionHash: sha256(
          `${originalRecord?.id}\0${originalRecord?.s20ExecutionId}`,
        ),
      },
    });
    await expect(store.getInviteReservation(EMAIL)).resolves.toMatchObject({
      id: replacementRecord?.id,
    });
    await expect(recoveryProvider.invite(original)).rejects.toThrow(
      /superseded by a newer/i,
    );
  });

  it("preclaims corrective S20 recovery before ambiguous Gmail absence readback", async () => {
    seedTicket(fake);
    let clockMs = Date.parse("2026-07-29T12:00:00.000Z");
    const recoveryProvider = new LiveVendorLifecycleProvider({
      context: { environment: "production", dataMode: "live" },
      store,
      auth,
      delivery,
      now: () => new Date(clockMs),
    });
    const original = inviteInput("invite-readback-source");
    const correction = followupInviteInput({
      sourceIdempotencyKey: original.idempotencyKey,
      idempotencyKey: "invite-readback-correction",
      inviteMode: "delivery_recovery",
      inviteVersion: 1,
      vendorUpdatedAt: new Date(clockMs).toISOString(),
      reason: "Recover the expired Vendor invitation after exact readback.",
    });
    await strandInviteBeforeDeliveryEffect(recoveryProvider, original);

    clockMs += LIVE_VENDOR_INVITE_RECOVERY_DELAY_MS;
    delivery.throwOnFind = true;
    await expect(recoveryProvider.invite(correction)).rejects.toBeInstanceOf(
      LiveVendorLifecycleAmbiguousError,
    );

    const correctionS20 = liveVendorS20ExecutionId(
      "vendor.account.invite",
      correction.idempotencyKey,
    );
    const correctionRecord = await store.getExecutionByS20ExecutionId(correctionS20);
    expect(correctionRecord).toMatchObject({
      state: "ambiguous",
      phase: "recovery_readback",
      bindings: {
        supersededExecutionId: liveVendorLifecycleExecutionId(
          "vendor.account.invite",
          original.idempotencyKey,
        ),
        supersededS20ExecutionId: liveVendorS20ExecutionId(
          "vendor.account.invite",
          original.idempotencyKey,
        ),
      },
    });
    await expect(store.getInviteReservation(EMAIL)).resolves.toMatchObject({
      id: correctionRecord?.id,
    });
    expect(delivery.sendCalls).toHaveLength(0);

    delivery.throwOnFind = false;
    const absenceOutcome =
      await recoveryProvider.reconcileByS20ExecutionId(correctionS20);
    expect(absenceOutcome).toMatchObject({
      providerRef: `vendor-invite-not-applicable:${correctionRecord?.id}`,
      state: "not_applicable",
      outcome: "not_applicable",
      attemptFenced: true,
      reasonCode: "prior_invite_absent_recovery_activated",
      correctiveExecutionId: correctionRecord?.id,
      correctiveS20ExecutionId: correctionS20,
      supersededExecutionId: liveVendorLifecycleExecutionId(
        "vendor.account.invite",
        original.idempotencyKey,
      ),
    });
    expect(JSON.stringify(absenceOutcome)).not.toContain(EMAIL);
    expect(JSON.stringify(absenceOutcome)).not.toContain(correction.reason);
    await expect(
      store.getExecutionByS20ExecutionId(correctionS20),
    ).resolves.toMatchObject({
      state: "ambiguous",
      phase: "recovery_abandoned",
    });
    await expect(
      store.getExecution("vendor.account.invite", original.idempotencyKey),
    ).resolves.toMatchObject({
      state: "superseded",
      supersededByExecutionId: correctionRecord?.id,
    });
    expect(delivery.sendCalls).toHaveLength(0);
    await expect(
      recoveryProvider.reconcileByS20ExecutionId(correctionS20),
    ).resolves.toEqual(absenceOutcome);
    expect(delivery.sendCalls).toHaveLength(0);

    const resumed = await recoveryProvider.invite(
      followupInviteInput({
        sourceIdempotencyKey: correction.idempotencyKey,
        vendorIdentityIdempotencyKey: original.idempotencyKey,
        inviteMode: "delivery_recovery",
        inviteVersion: 1,
        vendorUpdatedAt: correction.vendorUpdatedAt,
        reason: "Send a newly exact-confirmed correction after reconciled absence.",
        idempotencyKey: "invite-readback-resumed",
      }),
    );
    expect(resumed).toMatchObject({
      state: "pending_setup",
      vendorEmail: EMAIL,
    });
    expect(delivery.sendCalls).toHaveLength(1);
    expect(delivery.sendCalls[0]).toMatchObject({
      vendorRef: liveVendorInviteDerivedRefs(original.idempotencyKey).vendorRef,
      vendorUid: liveVendorInviteDerivedRefs(original.idempotencyKey).vendorUid,
    });
  });

  it("resolves an observed prior delivery without returning it as the corrective effect", async () => {
    seedTicket(fake);
    let clockMs = Date.parse("2026-07-29T12:00:00.000Z");
    const recoveryProvider = new LiveVendorLifecycleProvider({
      context: { environment: "production", dataMode: "live" },
      store,
      auth,
      delivery,
      now: () => new Date(clockMs),
    });
    const original = inviteInput("invite-observed-source");
    const correction = followupInviteInput({
      sourceIdempotencyKey: original.idempotencyKey,
      idempotencyKey: "invite-observed-correction",
      inviteMode: "delivery_recovery",
      inviteVersion: 1,
      vendorUpdatedAt: new Date(clockMs).toISOString(),
      reason: "Check the expired Vendor invite before any corrective delivery.",
    });
    delivery.throwAfterAccept = true;
    await expect(recoveryProvider.invite(original)).rejects.toBeInstanceOf(
      LiveVendorLifecycleAmbiguousError,
    );
    rewriteAsLegacyPreEffectDeliveryClaim(original);

    clockMs += LIVE_VENDOR_INVITE_RECOVERY_DELAY_MS;
    delivery.throwAfterAccept = false;
    await expect(recoveryProvider.invite(correction)).rejects.toThrow(
      /prior Vendor invitation was already delivered/i,
    );
    expect(delivery.sendCalls).toHaveLength(1);

    const originalRecord = await store.getExecution(
      "vendor.account.invite",
      original.idempotencyKey,
    );
    const correctionRecord = await store.getExecution(
      "vendor.account.invite",
      correction.idempotencyKey,
    );
    expect(originalRecord).toMatchObject({
      state: "succeeded",
      receipt: { state: "pending_setup", reconciled: true },
    });
    expect(correctionRecord).toMatchObject({
      state: "superseded",
      phase: "recovery_readback",
      supersededByExecutionId: originalRecord?.id,
    });
    await expect(store.getInviteReservation(EMAIL)).resolves.toMatchObject({
      id: originalRecord?.id,
    });
    const deliveredOutcome = await recoveryProvider.reconcileByS20ExecutionId(
      liveVendorS20ExecutionId("vendor.account.invite", correction.idempotencyKey),
    );
    expect(deliveredOutcome).toMatchObject({
      providerRef: `vendor-invite-not-applicable:${correctionRecord?.id}`,
      state: "not_applicable",
      outcome: "not_applicable",
      attemptFenced: true,
      reasonCode: "prior_invite_already_delivered",
      correctiveExecutionId: correctionRecord?.id,
      correctiveS20ExecutionId: correctionRecord?.s20ExecutionId,
      supersededExecutionId: originalRecord?.id,
      supersededS20ExecutionId: originalRecord?.s20ExecutionId,
    });
    expect(JSON.stringify(deliveredOutcome)).not.toContain(EMAIL);
    expect(JSON.stringify(deliveredOutcome)).not.toContain(correction.reason);
    expect(delivery.sendCalls).toHaveLength(1);
  });

  it("gives exact-positive recovery readback one worker before a same-S20 duplicate", async () => {
    seedTicket(fake);
    let clockMs = Date.parse("2026-07-29T12:00:00.000Z");
    const recoveryProvider = new LiveVendorLifecycleProvider({
      context: { environment: "production", dataMode: "live" },
      store,
      auth,
      delivery,
      now: () => new Date(clockMs),
    });
    const original = inviteInput("invite-readback-worker-source");
    delivery.throwAfterAccept = true;
    await expect(recoveryProvider.invite(original)).rejects.toBeInstanceOf(
      LiveVendorLifecycleAmbiguousError,
    );
    rewriteAsLegacyPreEffectDeliveryClaim(original);
    delivery.throwAfterAccept = false;
    clockMs += LIVE_VENDOR_INVITE_RECOVERY_DELAY_MS;

    const correction = followupInviteInput({
      sourceIdempotencyKey: original.idempotencyKey,
      idempotencyKey: "invite-readback-worker-correction",
      inviteMode: "delivery_recovery",
      inviteVersion: 1,
      vendorUpdatedAt: "2026-07-29T12:00:00.000Z",
      reason: "Read exact prior Gmail evidence before any correction.",
    });
    const found = deferred();
    const release = deferred();
    delivery.findResults = [structuredClone(delivery.found), null];
    delivery.afterFind = async () => {
      found.resolve();
      await release.promise;
    };
    const workerClaims = vi.spyOn(store, "claimInviteRecoveryReadbackWorker");
    const positiveWorker = recoveryProvider.invite(correction);
    await found.promise;
    const duplicate = recoveryProvider.invite(correction);
    await expect(duplicate).rejects.toBeInstanceOf(LiveVendorLifecycleAmbiguousError);
    release.resolve();
    await expect(positiveWorker).rejects.toThrow(
      /prior Vendor invitation was already delivered/i,
    );

    expect(delivery.findCalls).toHaveLength(1);
    expect(delivery.findResults).toEqual([null]);
    expect(delivery.sendCalls).toHaveLength(1);
    await expect(
      store.getExecution("vendor.account.invite", original.idempotencyKey),
    ).resolves.toMatchObject({
      state: "succeeded",
      receipt: { state: "pending_setup", reconciled: true },
    });
    const recovery = await store.getExecution(
      "vendor.account.invite",
      correction.idempotencyKey,
    );
    expect(recovery).toMatchObject({
      state: "superseded",
      phase: "recovery_readback",
      recoveryReadbackWorkerTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const rawTokens = workerClaims.mock.calls.map(([call]) => call.workerToken);
    expect(rawTokens).toHaveLength(2);
    for (const token of rawTokens) {
      expect(JSON.stringify(recovery)).not.toContain(token);
    }
    await expect(
      recoveryProvider.reconcileByS20ExecutionId(recovery!.s20ExecutionId),
    ).resolves.toMatchObject({
      state: "not_applicable",
      reasonCode: "prior_invite_already_delivered",
    });
    expect(delivery.findCalls).toHaveLength(1);
  });

  it("invalidates recovered delivery evidence when disable wins during exact readback", async () => {
    seedTicket(fake);
    let clockMs = Date.parse(EFFECT_TIME);
    const recoveryProvider = new LiveVendorLifecycleProvider({
      context: { environment: "production", dataMode: "live" },
      store,
      auth,
      delivery,
      now: () => new Date(clockMs),
    });
    const original = inviteInput("invite-recovery-disable-source");
    delivery.throwAfterAccept = true;
    await expect(recoveryProvider.invite(original)).rejects.toBeInstanceOf(
      LiveVendorLifecycleAmbiguousError,
    );
    rewriteAsLegacyPreEffectDeliveryClaim(original);
    delivery.throwAfterAccept = false;
    clockMs += LIVE_VENDOR_INVITE_RECOVERY_DELAY_MS;
    const correction = followupInviteInput({
      sourceIdempotencyKey: original.idempotencyKey,
      idempotencyKey: "invite-recovery-disable-correction",
      inviteMode: "delivery_recovery",
      inviteVersion: 1,
      vendorUpdatedAt: EFFECT_TIME,
      reason: "Read exact prior Gmail evidence before a corrective delivery.",
    });
    const found = deferred();
    const release = deferred();
    delivery.afterFind = async () => {
      found.resolve();
      await release.promise;
    };
    const correctionAttempt = recoveryProvider.invite(correction);
    await found.promise;

    await commitPendingSetupDisable(
      original.idempotencyKey,
      "disable-during-recovery-readback",
    );
    release.resolve();
    await expect(correctionAttempt).rejects.toThrow(
      /prior Vendor invitation was already delivered/i,
    );

    const source = await store.getExecution(
      "vendor.account.invite",
      original.idempotencyKey,
    );
    expect(source).toMatchObject({
      state: "succeeded",
      receipt: {
        state: "delivery_invalidated",
        reconciled: true,
        deliveryRefHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    await expect(
      store.getExecution("vendor.account.invite", correction.idempotencyKey),
    ).resolves.toMatchObject({
      state: "superseded",
      supersededByExecutionId: source?.id,
    });
    await expect(
      recoveryProvider.reconcileByS20ExecutionId(source!.s20ExecutionId),
    ).resolves.toMatchObject({
      state: "delivery_invalidated",
      reasonCode: "disabled_during_invite_delivery",
    });
    expect(delivery.sendCalls).toHaveLength(1);
    expect(
      fake.read(
        `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/${source?.bindings.vendorRef}`,
      ),
    ).toMatchObject({ status: "disabled" });
  });

  it("refuses a Firebase principal carrying any extra staff authority", async () => {
    seedTicket(fake);
    auth.extraClaims = { role: "Admin" };

    await expect(
      provider.invite(inviteInput("invite-staff-claim-key")),
    ).rejects.toBeInstanceOf(LiveVendorLifecycleConflictError);
    expect(delivery.sendCalls).toHaveLength(0);
  });
});

describe("Live Vendor disable access-first recovery", () => {
  it("crosses the next Firebase second before revoking a fractional cutoff", async () => {
    seedVendor(fake, { status: "active" });
    const fractionalCutoff = "2026-07-30T13:00:00.250Z";
    const waitedFor: number[] = [];
    const fractionalProvider = new LiveVendorLifecycleProvider({
      context: { environment: "production", dataMode: "live" },
      store,
      auth,
      delivery,
      now: () => new Date(fractionalCutoff),
      waitUntil: async (notBeforeEpochMs) => {
        waitedFor.push(notBeforeEpochMs);
      },
    });
    const input = {
      ...disableInput("disable-fractional-cutoff"),
      activeAssignmentRefs: canonicalLiveAssignmentRefs([]),
    };
    reseedPreparedProviderAttempt("vendor.account.disable", input);

    await expect(fractionalProvider.disable(input)).resolves.toMatchObject({
      state: "disabled",
      vendorRef: VENDOR_REF,
    });
    expect(waitedFor).toEqual([Date.parse("2026-07-30T13:00:01.000Z")]);
    expect(auth.disableCalls).toEqual([VENDOR_UID]);
    expect(auth.revokeCalls).toEqual([VENDOR_UID]);
  });

  it("gives same-execution disable workers one raw-token owner and one Auth sequence", async () => {
    seedVendor(fake, { status: "active" });
    const input = {
      ...disableInput("disable-same-execution-workers"),
      activeAssignmentRefs: canonicalLiveAssignmentRefs([]),
    };
    await commitDisableAccessOnly(input);
    const workerClaims = vi.spyOn(store, "claimDisableCompletionWorker");
    fake.armNextCommitBarrier(2);

    const outcomes = await Promise.allSettled([
      provider.disable(input),
      provider.disable(input),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(
      outcomes.filter(
        (outcome): outcome is PromiseRejectedResult =>
          outcome.status === "rejected" &&
          outcome.reason instanceof LiveVendorLifecycleAmbiguousError,
      ),
    ).toHaveLength(1);
    expect(auth.disableCalls).toEqual([VENDOR_UID]);
    expect(auth.revokeCalls).toEqual([VENDOR_UID]);
    expect(workerClaims).toHaveBeenCalledTimes(2);
    const rawTokens = workerClaims.mock.calls.map(([call]) => call.workerToken);
    expect(new Set(rawTokens).size).toBe(2);
    const execution = await store.getExecution(
      "vendor.account.disable",
      input.idempotencyKey,
    );
    expect(execution).toMatchObject({
      state: "succeeded",
      completionWorkerTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const serialized = JSON.stringify(execution);
    for (const token of rawTokens) expect(serialized).not.toContain(token);
    expect(rawTokens.map(sha256)).toContain(execution?.completionWorkerTokenHash);
  });

  it("passes immutable email A and fences external A-to-B Auth drift before mutation", async () => {
    seedVendor(fake, { status: "active" });
    auth.currentEmail = "dispatch@differentvendor.co";
    const input = {
      ...disableInput("disable-email-drift"),
      activeAssignmentRefs: canonicalLiveAssignmentRefs([]),
    };
    reseedPreparedProviderAttempt("vendor.account.disable", input);

    await expect(provider.disable(input)).rejects.toBeInstanceOf(
      LiveVendorLifecycleAmbiguousError,
    );

    expect(auth.readAttempts).toEqual([
      {
        uid: VENDOR_UID,
        expectedEmail: EMAIL,
        revokedAfter: EFFECT_TIME,
      },
    ]);
    expect(auth.readCalls).toEqual([]);
    expect(auth.disableCalls).toEqual([]);
    expect(auth.revokeCalls).toEqual([]);
    await expect(
      store.getExecution("vendor.account.disable", input.idempotencyKey),
    ).resolves.toMatchObject({
      state: "ambiguous",
      phase: "access_disabled",
      lastErrorCode: "firebase_disable_ambiguous",
      bindings: {
        emailHash: sha256(EMAIL),
      },
    });
  });

  it("lets access disable cancel a stranded setup-effect fence", async () => {
    seedVendor(fake, { status: "pending_setup" });
    const vendorPath = `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/${VENDOR_REF}`;
    const vendor = fake.read(vendorPath);
    if (!vendor) throw new Error("Expected the active Vendor fixture.");
    fake.seed(vendorPath, {
      ...vendor,
      setupEffectFence: {
        schemaVersion: 1,
        tokenHash: "a".repeat(64),
        claimIdHash: "b".repeat(64),
        inviteVersion: 1,
        lifecycleExecutionId: "c".repeat(64),
        startedAt: EFFECT_TIME,
        dataMode: "live",
      },
    });
    const input = {
      ...disableInput("disable-fenced-setup-effect"),
      activeAssignmentRefs: canonicalLiveAssignmentRefs([]),
      currentStatus: "pending_setup",
    };
    reseedPreparedProviderAttempt("vendor.account.disable", input);

    await expect(provider.disable(input)).resolves.toMatchObject({
      state: "disabled",
      vendorRef: VENDOR_REF,
    });
    expect(auth.disableCalls).toEqual([VENDOR_UID]);
    expect(auth.revokeCalls).toEqual([VENDOR_UID]);
    expect(fake.read(vendorPath)).toMatchObject({
      status: "disabled",
      disabledAt: EFFECT_TIME,
    });
    expect(fake.read(vendorPath)).not.toHaveProperty("setupEffectFence");
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions),
    ).toHaveLength(1);
  });

  it("cuts off Firestore access before Auth and reconciles without repeating Auth effects", async () => {
    seedVendor(fake, { status: "active" });
    seedTicket(fake, { vendor_id: VENDOR_REF });
    fake.seed(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments}/${TICKET_REF}`, {
      ticket_id: TICKET_REF,
      vendor_id: VENDOR_REF,
      active: true,
      data_mode: "live",
      updated_at: ORIGINAL_GENERATION,
    });
    auth.throwOnDisable = true;
    const input = disableInput("disable-access-first-key");

    await expect(provider.disable(input)).rejects.toBeInstanceOf(
      LiveVendorLifecycleAmbiguousError,
    );
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/${VENDOR_REF}`),
    ).toMatchObject({ status: "disabled", disabledAt: EFFECT_TIME });
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments}/${TICKET_REF}`),
    ).toMatchObject({ active: false });
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets}/${TICKET_REF}`),
    ).not.toHaveProperty("vendor_id");
    expect(auth.disableCalls).toEqual([VENDOR_UID]);
    expect(auth.revokeCalls).toHaveLength(0);

    auth.throwOnDisable = false;
    await expect(
      provider.reconcile("vendor.account.disable", input.idempotencyKey),
    ).resolves.toBeNull();
    expect(auth.disableCalls).toEqual([VENDOR_UID]);
    expect(auth.revokeCalls).toHaveLength(0);

    auth.disabled = true;
    auth.revoked = true;
    await expect(
      provider.reconcile("vendor.account.disable", input.idempotencyKey),
    ).resolves.toMatchObject({
      state: "disabled",
      vendorRef: VENDOR_REF,
      vendorUid: VENDOR_UID,
      clearedAssignmentRefs: canonicalLiveAssignmentRefs([TICKET_REF]),
      mailboxState: "none",
    });
    expect(auth.disableCalls).toEqual([VENDOR_UID]);
    expect(auth.revokeCalls).toHaveLength(0);

    const record = await store.getExecutionByS20ExecutionId(
      liveVendorS20ExecutionId("vendor.account.disable", input.idempotencyKey),
    );
    expect(record).toMatchObject({
      state: "succeeded",
      accessDisabledAt: EFFECT_TIME,
      bindings: {
        currentStatus: "active",
        vendorUpdatedAt: ORIGINAL_GENERATION,
        activeAssignmentRefs: canonicalLiveAssignmentRefs([TICKET_REF]),
        mailboxState: "none",
      },
      receipt: { state: "disabled", reconciled: true },
    });
  });

  it("recovers an access-first process crash under a fresh same-key execution without repeating cutoff effects", async () => {
    seedVendor(fake, { status: "active" });
    seedActiveVendorAssignment(fake);
    const tokenSecretRef = seedConnectedMailbox(fake);
    const initial = {
      ...disableInput("disable-crash-root-key"),
      mailboxState: "connected",
      mailboxTokenRefHash: sha256(tokenSecretRef),
    };

    const root = await commitDisableAccessOnly(initial);

    expect(root).toMatchObject({
      actionKey: "vendor.account.disable",
      state: "running",
      phase: "access_disabled",
      accessDisabledAt: ACCESS_CUTOFF_TIME,
      bindings: {
        disableMode: "initial",
        completionGeneration: 0,
        completionOwnerExecutionId: root.id,
        rootExecutionId: root.id,
      },
    });
    expect(auth.disableCalls).toHaveLength(0);
    expect(auth.revokeCalls).toHaveLength(0);
    expect(auth.readCalls).toHaveLength(0);

    const cutoffProjection = {
      assignment: fake.read(
        `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments}/${TICKET_REF}`,
      ),
      mailbox: fake.read(
        `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.mailboxConnections}/${VENDOR_REF}`,
      ),
      maintenanceActivity: fake.collectionEntries(
        LIVE_VENDOR_LIFECYCLE_COLLECTIONS.maintenanceActivity,
      ),
      revocation: fake.read(
        `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tokenRevocations}/${VENDOR_REF}`,
      ),
      ticket: fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets}/${TICKET_REF}`),
      vendor: fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/${VENDOR_REF}`),
    };
    expect(cutoffProjection).toMatchObject({
      assignment: { active: false, updated_at: ACCESS_CUTOFF_TIME },
      mailbox: { status: "revocation_pending", updatedAt: ACCESS_CUTOFF_TIME },
      revocation: {
        status: "pending",
        tokenSecretRef,
        updatedAt: ACCESS_CUTOFF_TIME,
      },
      vendor: { status: "disabled", updatedAt: ACCESS_CUTOFF_TIME },
    });
    expect(cutoffProjection.ticket).not.toHaveProperty("vendor_id");
    expect(cutoffProjection.maintenanceActivity).toHaveLength(1);

    const sourceClaim = requireDisableCompletionClaim();
    expect(sourceClaim.ownerLeaseExpiresAt).toBe(
      new Date(
        Date.parse(ACCESS_CUTOFF_TIME) + LIVE_VENDOR_DISABLE_COMPLETION_LEASE_MS,
      ).toISOString(),
    );
    const recovery = disableRecoveryInput(
      root,
      sourceClaim,
      "disable-crash-recovery-key",
    );
    const recoveryExecutionId = liveVendorLifecycleExecutionId(
      "vendor.account.disable",
      recovery.idempotencyKey,
    );
    const recoveryS20ExecutionId = liveVendorS20ExecutionId(
      "vendor.account.disable",
      recovery.idempotencyKey,
    );

    await expect(provider.disable(recovery)).resolves.toMatchObject({
      state: "disabled",
      vendorRef: VENDOR_REF,
      vendorUid: VENDOR_UID,
      clearedAssignmentRefs: canonicalLiveAssignmentRefs([TICKET_REF]),
      mailboxState: "connected",
    });

    expect(recoveryExecutionId).not.toBe(root.id);
    expect(recoveryS20ExecutionId).not.toBe(root.s20ExecutionId);
    await expect(
      store.getExecution("vendor.account.disable", recovery.idempotencyKey),
    ).resolves.toMatchObject({
      id: recoveryExecutionId,
      s20ExecutionId: recoveryS20ExecutionId,
      actionKey: "vendor.account.disable",
      state: "succeeded",
      bindings: {
        disableMode: "firebase_completion_recovery",
        rootExecutionId: root.id,
        rootS20ExecutionId: root.s20ExecutionId,
        completionGeneration: 0,
        issuedCompletionGeneration: 1,
      },
      receipt: { state: "disabled", reconciled: true },
    });
    await expect(
      store.getExecution("vendor.account.disable", initial.idempotencyKey),
    ).resolves.toMatchObject({
      id: root.id,
      state: "succeeded",
      receipt: { state: "disabled", reconciled: true },
    });

    expect(auth.disableCalls).toEqual([VENDOR_UID]);
    expect(auth.revokeCalls).toEqual([VENDOR_UID]);
    expect(auth.readCalls).toEqual([
      { uid: VENDOR_UID, revokedAfter: ACCESS_CUTOFF_TIME },
      { uid: VENDOR_UID, revokedAfter: ACCESS_CUTOFF_TIME },
      { uid: VENDOR_UID, revokedAfter: ACCESS_CUTOFF_TIME },
    ]);
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/${VENDOR_REF}`),
    ).toEqual(cutoffProjection.vendor);
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments}/${TICKET_REF}`),
    ).toEqual(cutoffProjection.assignment);
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets}/${TICKET_REF}`),
    ).toEqual(cutoffProjection.ticket);
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.mailboxConnections}/${VENDOR_REF}`),
    ).toEqual(cutoffProjection.mailbox);
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tokenRevocations}/${VENDOR_REF}`),
    ).toEqual(cutoffProjection.revocation);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.maintenanceActivity),
    ).toEqual(cutoffProjection.maintenanceActivity);
    expect(
      fake
        .collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendorAudit)
        .filter((entry) => entry.data.action === "live_vendor_access_disabled"),
    ).toHaveLength(1);
    expect(requireDisableCompletionClaim()).toMatchObject({
      rootExecutionId: root.id,
      completionGeneration: 1,
      ownerExecutionId: recoveryExecutionId,
      ownerS20ExecutionId: recoveryS20ExecutionId,
      completedAt: EFFECT_TIME,
    });
  });

  it("uses exact Auth readback to avoid repeated Firebase mutations and completes only the missing step", async () => {
    seedVendor(fake, { status: "active" });
    const root = await commitDisableAccessOnly({
      ...disableInput("disable-readback-root-key"),
      activeAssignmentRefs: canonicalLiveAssignmentRefs([]),
    });
    const recovery = disableRecoveryInput(
      root,
      requireDisableCompletionClaim(),
      "disable-readback-recovery-key",
    );
    auth.disabled = true;
    auth.revoked = false;

    await expect(provider.disable(recovery)).resolves.toMatchObject({
      state: "disabled",
      clearedAssignmentRefs: "[]",
    });

    expect(auth.disableCalls).toHaveLength(0);
    expect(auth.revokeCalls).toEqual([VENDOR_UID]);
    expect(auth.readCalls).toEqual([
      { uid: VENDOR_UID, revokedAfter: ACCESS_CUTOFF_TIME },
      { uid: VENDOR_UID, revokedAfter: ACCESS_CUTOFF_TIME },
    ]);

    auth.readCalls.length = 0;
    auth.revokeCalls.length = 0;
    await expect(provider.disable(recovery)).resolves.toMatchObject({
      state: "disabled",
      vendorRef: VENDOR_REF,
    });
    expect(auth.disableCalls).toHaveLength(0);
    expect(auth.revokeCalls).toHaveLength(0);
    expect(auth.readCalls).toHaveLength(0);
  });

  it("finishes from an already-complete Firebase readback without issuing either mutation", async () => {
    seedVendor(fake, { status: "active" });
    const root = await commitDisableAccessOnly({
      ...disableInput("disable-complete-readback-root-key"),
      activeAssignmentRefs: canonicalLiveAssignmentRefs([]),
    });
    const recovery = disableRecoveryInput(
      root,
      requireDisableCompletionClaim(),
      "disable-complete-readback-recovery-key",
    );
    auth.disabled = true;
    auth.revoked = true;

    await expect(provider.disable(recovery)).resolves.toMatchObject({
      state: "disabled",
      vendorRef: VENDOR_REF,
    });

    expect(auth.disableCalls).toHaveLength(0);
    expect(auth.revokeCalls).toHaveLength(0);
    expect(auth.readCalls).toEqual([
      { uid: VENDOR_UID, revokedAfter: ACCESS_CUTOFF_TIME },
    ]);
    await expect(
      store.getExecution("vendor.account.disable", recovery.idempotencyKey),
    ).resolves.toMatchObject({
      state: "succeeded",
      receipt: { reconciled: true },
    });
  });

  it("gives concurrent completion recoveries one fresh owner and one Auth mutation sequence", async () => {
    seedVendor(fake, { status: "active" });
    const root = await commitDisableAccessOnly({
      ...disableInput("disable-concurrent-root-key"),
      activeAssignmentRefs: canonicalLiveAssignmentRefs([]),
    });
    const claim = requireDisableCompletionClaim();
    const first = disableRecoveryInput(
      root,
      claim,
      "disable-concurrent-recovery-a",
      "Complete the exact Firebase cutoff after crash A.",
    );
    const second = disableRecoveryInput(
      root,
      claim,
      "disable-concurrent-recovery-b",
      "Complete the exact Firebase cutoff after crash B.",
    );

    const outcomes = await Promise.allSettled([
      provider.disable(first),
      provider.disable(second),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(LiveVendorLifecycleConflictError);
    expect(auth.disableCalls).toEqual([VENDOR_UID]);
    expect(auth.revokeCalls).toEqual([VENDOR_UID]);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions),
    ).toHaveLength(2);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.s20Index),
    ).toHaveLength(2);
    const childIds = [first, second]
      .map((input) =>
        liveVendorLifecycleExecutionId("vendor.account.disable", input.idempotencyKey),
      )
      .filter(
        (id) =>
          fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions}/${id}`) !==
          undefined,
      );
    expect(childIds).toHaveLength(1);
    expect(requireDisableCompletionClaim()).toMatchObject({
      completionGeneration: 1,
      ownerExecutionId: childIds[0],
      completedAt: EFFECT_TIME,
    });
  });

  it("refuses a stale disabled-Vendor recovery source before any Auth read or mutation", async () => {
    seedVendor(fake, { status: "active" });
    const root = await commitDisableAccessOnly({
      ...disableInput("disable-stale-root-key"),
      activeAssignmentRefs: canonicalLiveAssignmentRefs([]),
    });
    const recovery = disableRecoveryInput(
      root,
      requireDisableCompletionClaim(),
      "disable-stale-recovery-key",
    );
    const vendorPath = `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/${VENDOR_REF}`;
    const currentVendor = fake.read(vendorPath);
    if (!currentVendor) throw new Error("Expected the disabled Vendor fixture.");
    fake.seed(vendorPath, {
      ...currentVendor,
      updatedAt: "2026-07-30T12:58:00.000Z",
    });

    await expect(provider.disable(recovery)).rejects.toBeInstanceOf(
      LiveVendorLifecycleConflictError,
    );

    expect(auth.readCalls).toHaveLength(0);
    expect(auth.disableCalls).toHaveLength(0);
    expect(auth.revokeCalls).toHaveLength(0);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions),
    ).toHaveLength(1);
    expect(requireDisableCompletionClaim()).toMatchObject({
      completionGeneration: 0,
      ownerExecutionId: root.id,
    });
  });

  it("keeps root and recovery reconciliation provider-read-only", async () => {
    seedVendor(fake, { status: "active" });
    const rootInput = {
      ...disableInput("disable-read-only-root-key"),
      activeAssignmentRefs: canonicalLiveAssignmentRefs([]),
    };
    const root = await commitDisableAccessOnly(rootInput);
    const recovery = disableRecoveryInput(
      root,
      requireDisableCompletionClaim(),
      "disable-read-only-recovery-key",
    );
    const recoveryRecord = await store.claimDisableCompletionRecovery({
      command: recovery,
      executionId: liveVendorLifecycleExecutionId(
        "vendor.account.disable",
        recovery.idempotencyKey,
      ),
      payloadHash: hashLiveVendorDisablePayload(recovery),
      nowIso: EFFECT_TIME,
    });

    await expect(
      provider.reconcile("vendor.account.disable", rootInput.idempotencyKey),
    ).resolves.toBeNull();
    await expect(
      provider.reconcileByS20ExecutionId(recoveryRecord.s20ExecutionId),
    ).resolves.toBeNull();
    expect(auth.readCalls).toEqual([
      { uid: VENDOR_UID, revokedAfter: ACCESS_CUTOFF_TIME },
      { uid: VENDOR_UID, revokedAfter: ACCESS_CUTOFF_TIME },
    ]);
    expect(auth.disableCalls).toHaveLength(0);
    expect(auth.revokeCalls).toHaveLength(0);

    auth.disabled = true;
    auth.revoked = true;
    await expect(
      provider.reconcileByS20ExecutionId(recoveryRecord.s20ExecutionId),
    ).resolves.toMatchObject({
      state: "disabled",
      vendorRef: VENDOR_REF,
    });
    expect(auth.disableCalls).toHaveLength(0);
    expect(auth.revokeCalls).toHaveLength(0);
    await expect(
      store.getExecution("vendor.account.disable", rootInput.idempotencyKey),
    ).resolves.toMatchObject({
      state: "succeeded",
      receipt: { reconciled: true },
    });
    await expect(
      store.getExecution("vendor.account.disable", recovery.idempotencyKey),
    ).resolves.toMatchObject({
      state: "succeeded",
      receipt: { reconciled: true },
    });
  });

  it("refuses an assignment set above the bounded transaction cap before any write", async () => {
    seedVendor(fake, { status: "active" });
    const ticketRefs = Array.from(
      { length: LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS + 1 },
      (_, index) => `ticket-live-bulk-${String(index).padStart(3, "0")}`,
    );
    for (const ticketRef of ticketRefs) {
      fake.seed(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets}/${ticketRef}`, {
        id: ticketRef,
        data_mode: "live",
        vendor_id: VENDOR_REF,
        updated_at: ORIGINAL_GENERATION,
      });
      fake.seed(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments}/${ticketRef}`, {
        ticket_id: ticketRef,
        vendor_id: VENDOR_REF,
        active: true,
        data_mode: "live",
        updated_at: ORIGINAL_GENERATION,
      });
    }
    const input = {
      ...disableInput("disable-too-many-assignments"),
      activeAssignmentRefs: canonicalLiveAssignmentRefs(ticketRefs),
    };
    reseedPreparedProviderAttempt("vendor.account.disable", input);

    await expect(provider.disable(input)).rejects.toThrow(
      new RegExp(
        `limited to ${LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS} active assignments`,
        "i",
      ),
    );
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/${VENDOR_REF}`),
    ).toMatchObject({ status: "active", updatedAt: ORIGINAL_GENERATION });
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments),
    ).toHaveLength(ticketRefs.length);
    expect(
      fake
        .collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments)
        .every((entry) => entry.data.active === true),
    ).toBe(true);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions),
    ).toHaveLength(0);
    expect(auth.disableCalls).toHaveLength(0);
    expect(auth.revokeCalls).toHaveLength(0);
  });

  it("filters inactive history before the bounded active-assignment disable read", async () => {
    seedVendor(fake, { status: "active" });
    seedTicket(fake, { vendor_id: VENDOR_REF });
    for (
      let index = 0;
      index < LIVE_VENDOR_DISABLE_MAX_ACTIVE_ASSIGNMENTS + 10;
      index += 1
    ) {
      const ticketRef = `ticket-inactive-history-${String(index).padStart(3, "0")}`;
      fake.seed(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments}/${ticketRef}`, {
        ticket_id: ticketRef,
        vendor_id: VENDOR_REF,
        active: false,
        data_mode: "live",
        updated_at: ORIGINAL_GENERATION,
      });
    }
    fake.seed(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments}/${TICKET_REF}`, {
      ticket_id: TICKET_REF,
      vendor_id: VENDOR_REF,
      active: true,
      data_mode: "live",
      updated_at: ORIGINAL_GENERATION,
    });

    await expect(
      provider.disable(disableInput("disable-after-inactive-history")),
    ).resolves.toMatchObject({
      state: "disabled",
      clearedAssignmentRefs: canonicalLiveAssignmentRefs([TICKET_REF]),
    });
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments}/${TICKET_REF}`),
    ).toMatchObject({ active: false });
  });

  it("refuses malformed active-assignment joins before disabling access", async () => {
    seedVendor(fake, { status: "active" });
    seedTicket(fake, { vendor_id: VENDOR_REF });
    fake.seed(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments}/${TICKET_REF}`, {
      ticket_id: "ticket-wrong",
      vendor_id: VENDOR_REF,
      active: true,
      data_mode: "live",
      updated_at: ORIGINAL_GENERATION,
    });

    await expect(
      provider.disable(disableInput("disable-malformed-assignment")),
    ).rejects.toThrow(/assignment record is malformed/i);
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/${VENDOR_REF}`),
    ).toMatchObject({ status: "active" });
    expect(auth.disableCalls).toHaveLength(0);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions),
    ).toHaveLength(0);
  });

  it("refuses an assigned ticket that is missing from the active assignment ledger", async () => {
    seedVendor(fake, { status: "active" });
    seedTicket(fake, { vendor_id: VENDOR_REF });
    const input = {
      ...disableInput("disable-orphan-ticket"),
      activeAssignmentRefs: canonicalLiveAssignmentRefs([]),
    };
    reseedPreparedProviderAttempt("vendor.account.disable", input);

    await expect(provider.disable(input)).rejects.toThrow(
      /assignment ledger and maintenance tickets disagree/i,
    );
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/${VENDOR_REF}`),
    ).toMatchObject({ status: "active" });
    expect(auth.disableCalls).toHaveLength(0);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions),
    ).toHaveLength(0);
  });

  it("atomically marks a connected Live mailbox pending and queues its token revocation", async () => {
    seedVendor(fake, { status: "active" });
    const tokenSecretRef =
      "projects/pmi-kc-kb-prod/secrets/vendor-mailbox-token/versions/latest";
    fake.seed(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.mailboxConnections}/${VENDOR_REF}`, {
      vendorId: VENDOR_REF,
      mailboxEmail: EMAIL,
      provider: "google",
      status: "connected",
      scopes: ["https://www.googleapis.com/auth/gmail.modify"],
      tokenSecretRef,
      dataMode: "live",
      connectedAt: ORIGINAL_GENERATION,
      updatedAt: ORIGINAL_GENERATION,
    });
    const input = {
      ...disableInput("disable-connected-mailbox"),
      activeAssignmentRefs: canonicalLiveAssignmentRefs([]),
      mailboxState: "connected",
      mailboxTokenRefHash: sha256(tokenSecretRef),
    };
    reseedPreparedProviderAttempt("vendor.account.disable", input);

    const result = await provider.disable(input);

    expect(result).toMatchObject({
      state: "disabled",
      mailboxState: "connected",
      clearedAssignmentRefs: "[]",
    });
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.mailboxConnections}/${VENDOR_REF}`),
    ).toMatchObject({
      status: "revocation_pending",
      tokenSecretRef,
      updatedAt: EFFECT_TIME,
    });
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tokenRevocations}/${VENDOR_REF}`),
    ).toEqual({
      vendorId: VENDOR_REF,
      tokenSecretRef,
      status: "pending",
      createdAt: EFFECT_TIME,
      updatedAt: EFFECT_TIME,
    });
    const execution = await store.getExecution(
      "vendor.account.disable",
      input.idempotencyKey,
    );
    expect(execution).toMatchObject({
      bindings: {
        mailboxState: "connected",
        mailboxTokenRefHash: sha256(tokenSecretRef),
      },
      receipt: { state: "disabled" },
    });
    expect(JSON.stringify(execution)).not.toContain(tokenSecretRef);
  });

  it("refuses a Test or malformed mailbox connection before disabling access", async () => {
    seedVendor(fake, { status: "active" });
    fake.seed(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.mailboxConnections}/${VENDOR_REF}`, {
      id: VENDOR_REF,
      vendor_id: VENDOR_REF,
      data_mode: "test",
      status: "connected",
    });
    const input = {
      ...disableInput("disable-test-mailbox"),
      activeAssignmentRefs: canonicalLiveAssignmentRefs([]),
      mailboxState: "connected",
    };
    reseedPreparedProviderAttempt("vendor.account.disable", input);

    await expect(provider.disable(input)).rejects.toThrow(
      /mailbox connection is not an exact Live record/i,
    );
    expect(
      fake.read(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/${VENDOR_REF}`),
    ).toMatchObject({ status: "active" });
    expect(auth.disableCalls).toHaveLength(0);
    expect(
      fake.collectionEntries(LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions),
    ).toHaveLength(0);
  });
});

function seedVendor(
  target: FakeTransactionalFirestore,
  input: { status: "pending_setup" | "active" | "disabled" },
) {
  target.seed(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.vendors}/${VENDOR_REF}`, {
    id: VENDOR_REF,
    uid: VENDOR_UID,
    email: EMAIL,
    displayName: COMPANY,
    status: input.status,
    inviteVersion: 1,
    data_mode: "live",
    identityState: {
      emailVerified: input.status === "active",
      totpRequired: true,
      totpVerified: input.status === "active",
    },
    createdAt: ORIGINAL_GENERATION,
    updatedAt: ORIGINAL_GENERATION,
  });
}

function seedTicket(
  target: FakeTransactionalFirestore,
  overrides: Record<string, unknown> = {},
) {
  target.seed(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.tickets}/${TICKET_REF}`, {
    id: TICKET_REF,
    data_mode: "live",
    status: "Open",
    priority: "Normal",
    priority_provenance: "operator-set",
    summary: "Live maintenance ticket",
    description: "Stored outside the bodyless lifecycle ledger.",
    unit: { unitId: "unit-live-1", label: "101" },
    photo_refs: [],
    reporter: { kind: "staff", uid: ACTOR_UID },
    labels: [],
    space_id: "maintenance",
    created_at: ORIGINAL_GENERATION,
    updated_at: ORIGINAL_GENERATION,
    ...overrides,
  });
}

function seedActiveVendorAssignment(target: FakeTransactionalFirestore) {
  seedTicket(target, { vendor_id: VENDOR_REF });
  target.seed(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.assignments}/${TICKET_REF}`, {
    ticket_id: TICKET_REF,
    vendor_id: VENDOR_REF,
    active: true,
    data_mode: "live",
    updated_at: ORIGINAL_GENERATION,
  });
}

function seedConnectedMailbox(target: FakeTransactionalFirestore) {
  const tokenSecretRef =
    "projects/pmi-kc-kb-prod/secrets/vendor-mailbox-token/versions/latest";
  target.seed(`${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.mailboxConnections}/${VENDOR_REF}`, {
    vendorId: VENDOR_REF,
    mailboxEmail: EMAIL,
    provider: "google",
    status: "connected",
    scopes: ["https://www.googleapis.com/auth/gmail.modify"],
    tokenSecretRef,
    dataMode: "live",
    connectedAt: ORIGINAL_GENERATION,
    updatedAt: ORIGINAL_GENERATION,
  });
  return tokenSecretRef;
}

function assignmentInput(identityLabel: string) {
  const idempotencyKey = testPreparedIdempotency(
    "vendor.assignment.change",
    identityLabel,
  );
  const input = {
    actorUid: ACTOR_UID,
    vendorRef: VENDOR_REF,
    vendorUid: VENDOR_UID,
    company: COMPANY,
    email: EMAIL,
    vendorUpdatedAt: ORIGINAL_GENERATION,
    ticketRef: TICKET_REF,
    ticketUpdatedAt: ORIGINAL_GENERATION,
    currentVendorRef: "vendor:none",
    targetVendorRef: VENDOR_REF,
    operation: "assign" as const,
    reason: "Assign the confirmed Vendor to this exact ticket.",
    idempotencyKey,
  };
  seedPreparedProviderAttempt("vendor.assignment.change", identityLabel, input);
  return input;
}

function inviteInput(identityLabel: string): LiveVendorInviteInput {
  const idempotencyKey = testPreparedIdempotency("vendor.account.invite", identityLabel);
  const input: LiveVendorInviteInput = {
    actorUid: ACTOR_UID,
    company: COMPANY,
    email: EMAIL,
    ticketRef: TICKET_REF,
    ticketUpdatedAt: ORIGINAL_GENERATION,
    artifactRef: "vendor-invite:v1.0",
    inviteMode: "initial",
    inviteVersion: 0,
    vendorRef: "vendor:new",
    vendorUid: "identity:new",
    vendorStatus: "none",
    vendorUpdatedAt: "generation:new",
    reason: "Invite the exact owner-approved Vendor contact.",
    idempotencyKey,
  };
  seedPreparedProviderAttempt("vendor.account.invite", identityLabel, input);
  return input;
}

function followupInviteInput(input: {
  idempotencyKey: string;
  inviteMode: "delivery_recovery" | "setup_link_reissue";
  inviteVersion: number;
  reason: string;
  sourceIdempotencyKey: string;
  vendorIdentityIdempotencyKey?: string;
  vendorUpdatedAt: string;
}): LiveVendorInviteInput {
  const identityLabel = input.idempotencyKey;
  const source = liveVendorInviteDerivedRefs(
    input.vendorIdentityIdempotencyKey ?? input.sourceIdempotencyKey,
  );
  const idempotencyKey = testPreparedIdempotency(
    "vendor.account.invite",
    identityLabel,
    input.sourceIdempotencyKey,
  );
  const followup: LiveVendorInviteInput = {
    actorUid: ACTOR_UID,
    company: COMPANY,
    email: EMAIL,
    ticketRef: TICKET_REF,
    ticketUpdatedAt: ORIGINAL_GENERATION,
    artifactRef: "vendor-invite:v1.0",
    inviteMode: input.inviteMode,
    inviteVersion: input.inviteVersion,
    vendorRef: source.vendorRef,
    vendorUid: source.vendorUid,
    vendorStatus: "pending_setup",
    vendorUpdatedAt: input.vendorUpdatedAt,
    reason: input.reason,
    idempotencyKey,
  };
  seedPreparedProviderAttempt(
    "vendor.account.invite",
    identityLabel,
    followup,
    input.sourceIdempotencyKey,
  );
  return followup;
}

function disableInput(identityLabel: string) {
  const idempotencyKey = testPreparedIdempotency("vendor.account.disable", identityLabel);
  const input = {
    actorUid: ACTOR_UID,
    disableMode: "initial" as const,
    vendorRef: VENDOR_REF,
    vendorUid: VENDOR_UID,
    company: COMPANY,
    email: EMAIL,
    currentStatus: "active",
    vendorUpdatedAt: ORIGINAL_GENERATION,
    activeAssignmentRefs: canonicalLiveAssignmentRefs([TICKET_REF]),
    mailboxState: "none",
    mailboxTokenRefHash: "none",
    rootExecutionId: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.rootExecutionId,
    rootS20ExecutionId: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.rootS20ExecutionId,
    accessDisabledAt: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.accessDisabledAt,
    completionGeneration: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionGeneration,
    completionOwnerExecutionId:
      LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionOwnerExecutionId,
    completionOwnerS20ExecutionId:
      LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionOwnerS20ExecutionId,
    completionLeaseExpiresAt: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionLeaseExpiresAt,
    reason: "Disable the exact Vendor and revoke its access.",
    idempotencyKey,
  };
  seedPreparedProviderAttempt("vendor.account.disable", identityLabel, input);
  return input;
}

function pendingSetupDisableInput(
  inviteIdempotencyKey: string,
  identityLabel: string,
): LiveVendorDisableInput {
  const idempotencyKey = testPreparedIdempotency("vendor.account.disable", identityLabel);
  const vendor = liveVendorInviteDerivedRefs(inviteIdempotencyKey);
  const input: LiveVendorDisableInput = {
    actorUid: ACTOR_UID,
    disableMode: "initial",
    vendorRef: vendor.vendorRef,
    vendorUid: vendor.vendorUid,
    company: COMPANY,
    email: EMAIL,
    currentStatus: "pending_setup",
    vendorUpdatedAt: EFFECT_TIME,
    activeAssignmentRefs: canonicalLiveAssignmentRefs([]),
    mailboxState: "none",
    mailboxTokenRefHash: "none",
    rootExecutionId: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.rootExecutionId,
    rootS20ExecutionId: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.rootS20ExecutionId,
    accessDisabledAt: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.accessDisabledAt,
    completionGeneration: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionGeneration,
    completionOwnerExecutionId:
      LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionOwnerExecutionId,
    completionOwnerS20ExecutionId:
      LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionOwnerS20ExecutionId,
    completionLeaseExpiresAt: LIVE_VENDOR_DISABLE_INITIAL_SOURCE.completionLeaseExpiresAt,
    reason: "Disable the pending-setup Vendor before invite delivery.",
    idempotencyKey,
  };
  seedPreparedProviderAttempt("vendor.account.disable", identityLabel, input);
  return input;
}

async function commitPendingSetupDisable(
  inviteIdempotencyKey: string,
  idempotencyKey: string,
) {
  const command = pendingSetupDisableInput(inviteIdempotencyKey, idempotencyKey);
  return store.disableAccess({
    command,
    executionId: liveVendorLifecycleExecutionId(
      "vendor.account.disable",
      command.idempotencyKey,
    ),
    payloadHash: hashLiveVendorDisablePayload(command),
    nowIso: INVITE_DISABLE_TIME,
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function strandInviteBeforeDeliveryEffect(
  lifecycleProvider: LiveVendorLifecycleProvider,
  input: LiveVendorInviteInput,
) {
  const effectClaim = vi
    .spyOn(store, "claimInviteDeliveryEffect")
    .mockRejectedValueOnce(new Error("simulated crash before Gmail-effect ownership"));
  await expect(lifecycleProvider.invite(input)).rejects.toThrow(
    /simulated crash before Gmail-effect ownership/i,
  );
  effectClaim.mockRestore();
  await expect(
    store.getExecution("vendor.account.invite", input.idempotencyKey),
  ).resolves.toMatchObject({
    state: "running",
    phase: "delivery_claimed",
  });
}

function rewriteAsLegacyPreEffectDeliveryClaim(input: LiveVendorInviteInput) {
  const executionId = liveVendorLifecycleExecutionId(
    "vendor.account.invite",
    input.idempotencyKey,
  );
  const path = `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.executions}/${executionId}`;
  const current = fake.read(path) as
    | (LiveVendorLifecycleExecutionRecord & {
        deliveryEffectStartedAt?: string;
      })
    | undefined;
  if (!current) throw new Error("Expected the ambiguous Vendor invite execution.");
  const { deliveryEffectStartedAt: _effectStartedAt, ...legacy } = current;
  void _effectStartedAt;
  fake.seed(path, {
    ...legacy,
    phase: "delivery_claimed",
  });
}

async function commitDisableAccessOnly(
  command: LiveVendorDisableInput,
): Promise<LiveVendorLifecycleExecutionRecord> {
  reseedPreparedProviderAttempt("vendor.account.disable", command);
  const executionId = liveVendorLifecycleExecutionId(
    "vendor.account.disable",
    command.idempotencyKey,
  );
  return store.disableAccess({
    command,
    executionId,
    payloadHash: hashLiveVendorDisablePayload(command),
    nowIso: ACCESS_CUTOFF_TIME,
  });
}

function requireDisableCompletionClaim(): LiveVendorDisableCompletionClaim {
  const claim = fake.read(
    `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.disableCompletionClaims}/${VENDOR_REF}`,
  );
  if (!claim) throw new Error("Expected a Vendor disable completion claim.");
  return claim as unknown as LiveVendorDisableCompletionClaim;
}

function disableRecoveryInput(
  root: LiveVendorLifecycleExecutionRecord,
  claim: LiveVendorDisableCompletionClaim,
  identityLabel: string,
  reason = "Complete the exact Firebase cutoff after the access-first crash.",
): LiveVendorDisableInput {
  if (
    root.actionKey !== "vendor.account.disable" ||
    root.bindings.kind !== "disable" ||
    root.bindings.disableMode !== "initial" ||
    !root.accessDisabledAt
  ) {
    throw new Error("Expected an access-disabled root execution.");
  }
  const idempotencyKey = testPreparedIdempotency("vendor.account.disable", identityLabel);
  const input: LiveVendorDisableInput = {
    actorUid: ACTOR_UID,
    disableMode: "firebase_completion_recovery",
    vendorRef: root.bindings.vendorRef,
    vendorUid: root.bindings.vendorUid,
    company: COMPANY,
    email: EMAIL,
    currentStatus: "disabled",
    vendorUpdatedAt: root.accessDisabledAt,
    activeAssignmentRefs: root.bindings.activeAssignmentRefs,
    mailboxState: root.bindings.mailboxState,
    mailboxTokenRefHash: root.bindings.mailboxTokenRefHash,
    rootExecutionId: claim.rootExecutionId,
    rootS20ExecutionId: claim.rootS20ExecutionId,
    accessDisabledAt: claim.accessDisabledAt,
    completionGeneration: claim.completionGeneration,
    completionOwnerExecutionId: claim.ownerExecutionId,
    completionOwnerS20ExecutionId: claim.ownerS20ExecutionId,
    completionLeaseExpiresAt: claim.ownerLeaseExpiresAt,
    reason,
    idempotencyKey,
  };
  seedPreparedProviderAttempt("vendor.account.disable", identityLabel, input);
  return input;
}

function seedPreparedProviderAttempt(
  actionKey:
    | "vendor.account.invite"
    | "vendor.account.disable"
    | "vendor.assignment.change",
  identityLabel: string,
  input: LiveVendorInviteInput | LiveVendorDisableInput | LiveVendorAssignmentInput,
  sourceIdempotencyKey?: string,
) {
  const action = testPreparedAction(
    actionKey,
    identityLabel,
    preparedValues(input),
    sourceIdempotencyKey,
  );
  const s20ExecutionId = liveVendorS20ExecutionId(actionKey, input.idempotencyKey);
  if (externalActionIdempotencyKey(action) !== input.idempotencyKey) {
    throw new Error("The provider fixture does not match its prepared action identity.");
  }
  const technical = {
    connectionReady: true,
    documentedEvidence: true,
    endpointDocumented: true,
    permissionGranted: true,
    productionAllowed: true,
    requiredValuesPresent: true,
    roleScopeAuthorized: true,
    sourceValidated: true,
  };
  const trustedContext: TrustedExternalExecutionContext = {
    ...technical,
    externalReferences: {
      connectionRef: action.connectionRef!,
      contractRef: action.contractRef!,
      mappingRef: action.mappingRef!,
      sourceRefs: action.sourceRefs,
    },
    technical,
  };
  const snapshot = createLiveVendorPreparedAttemptSnapshot(TEST_ACTOR, {
    contextHash: externalActionContextHash(action),
    createdAt: ORIGINAL_GENERATION,
    executionId: s20ExecutionId,
    previewHash: hashExecutionPreview({ ...action.values }),
    selection: {
      action,
      trustedContext,
      variant:
        "inviteMode" in input && input.inviteMode === "setup_link_reissue"
          ? "setup_link_reissue"
          : "inviteMode" in input && input.inviteMode === "delivery_recovery"
            ? "invite_correction"
            : "disableMode" in input &&
                input.disableMode === "firebase_completion_recovery"
              ? "disable_completion_recovery"
              : "standard",
    },
  });
  fake.seed(
    `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.preparedAttempts}/${s20ExecutionId}`,
    snapshot as unknown as Record<string, unknown>,
  );
  fake.seed(`action_executions/${s20ExecutionId}`, {
    id: s20ExecutionId,
    action_key: actionKey,
    action_kind:
      actionKey === "vendor.assignment.change" ? "vendor_assignment" : "identity_write",
    actor_role: "Admin",
    actor_uid: TEST_ACTOR.uid,
    attempt_count: 1,
    claim_actor_uid: input.actorUid,
    context_hash: snapshot.contextHash,
    created_at: ORIGINAL_GENERATION,
    idempotency_hash: sha256(`provider-test:${s20ExecutionId}`),
    preview_hash: snapshot.previewHash,
    requires_action_registry: true,
    risk: "High",
    state: "Executing",
    updated_at: ORIGINAL_GENERATION,
  });
}

function reseedPreparedProviderAttempt(
  actionKey:
    | "vendor.account.invite"
    | "vendor.account.disable"
    | "vendor.assignment.change",
  input: LiveVendorInviteInput | LiveVendorDisableInput | LiveVendorAssignmentInput,
) {
  const s20ExecutionId = liveVendorS20ExecutionId(actionKey, input.idempotencyKey);
  const existing = fake.read(
    `${LIVE_VENDOR_LIFECYCLE_COLLECTIONS.preparedAttempts}/${s20ExecutionId}`,
  ) as
    | {
        action?: { actionId?: unknown };
      }
    | undefined;
  const actionId = existing?.action?.actionId;
  if (
    typeof actionId !== "string" ||
    !actionId.startsWith("provider-test-") ||
    actionId.length <= "provider-test-".length
  ) {
    throw new Error("The provider fixture identity is unavailable for reseeding.");
  }
  seedPreparedProviderAttempt(actionKey, actionId.slice("provider-test-".length), input);
}

function testPreparedIdempotency(
  actionKey:
    | "vendor.account.invite"
    | "vendor.account.disable"
    | "vendor.assignment.change",
  identityLabel: string,
  sourceIdempotencyKey?: string,
) {
  return externalActionIdempotencyKey(
    testPreparedAction(
      actionKey,
      identityLabel,
      { reason: "identity-only" },
      sourceIdempotencyKey,
    ),
  );
}

function testPreparedAction(
  actionKey:
    | "vendor.account.invite"
    | "vendor.account.disable"
    | "vendor.assignment.change",
  identityLabel: string,
  values: Readonly<Record<string, string | number | boolean>>,
  sourceIdempotencyKey?: string,
): ExternalActionPreparationInput {
  const sourceRefs = [`provider-test-source:${identityLabel}`];
  if (sourceIdempotencyKey) {
    if (actionKey !== "vendor.account.invite") {
      throw new Error("Only a Vendor invite fixture may carry invite lineage.");
    }
    const source = liveVendorInviteDerivedRefs(sourceIdempotencyKey);
    const sourceS20ExecutionId = liveVendorS20ExecutionId(
      "vendor.account.invite",
      sourceIdempotencyKey,
    );
    sourceRefs.push(
      `superseded-vendor-execution:${source.executionId}`,
      `superseded-s20-execution:${sourceS20ExecutionId}`,
      `vendor-invite-supersession:${sha256(
        `${source.executionId}\0${sourceS20ExecutionId}`,
      )}`,
    );
  }
  return {
    actionId: `provider-test-${identityLabel}`,
    actionKey,
    connectionRef: `provider-test:${actionKey}:production`,
    contractRef: "vendor-lifecycle-contract:v1",
    dataMode: "live",
    mappingRef: "vendor-lifecycle-firestore-map:v1",
    sourceRefs,
    values,
    workflowId: `provider-test-workflow-${identityLabel}`,
  };
}

function preparedValues(
  input: LiveVendorInviteInput | LiveVendorDisableInput | LiveVendorAssignmentInput,
): Readonly<Record<string, string | number | boolean>> {
  if ("inviteMode" in input) {
    return liveVendorInviteActionValues(input);
  }
  if ("disableMode" in input) {
    return liveVendorDisableActionValues(input);
  }
  return liveVendorAssignmentActionValues(input);
}

class FakeLiveVendorAuth implements LiveVendorAuthAdapter {
  readonly ensureCalls: Array<
    Parameters<LiveVendorAuthAdapter["ensureVendorPrincipal"]>[0]
  > = [];
  readonly disableCalls: string[] = [];
  readonly revokeCalls: string[] = [];
  readonly readCalls: Array<{ uid: string; revokedAfter: string }> = [];
  readonly readAttempts: Array<{
    uid: string;
    expectedEmail: string;
    revokedAfter: string;
  }> = [];
  extraClaims: Record<string, unknown> = {};
  throwOnDisable = false;
  disabled = false;
  revoked = false;
  currentEmail = EMAIL;

  async ensureVendorPrincipal(
    input: Parameters<LiveVendorAuthAdapter["ensureVendorPrincipal"]>[0],
  ): Promise<LiveVendorAuthPrincipal> {
    this.ensureCalls.push(structuredClone(input));
    return {
      uid: input.uid,
      email: input.email,
      emailVerified: false,
      disabled: false,
      customClaims: { ...input.customClaims, ...this.extraClaims },
    };
  }

  async disableUser(uid: string, expectedEmail: string) {
    this.assertExpectedEmail(expectedEmail);
    this.disableCalls.push(uid);
    if (this.throwOnDisable) throw new Error("ambiguous Firebase disable");
    this.disabled = true;
  }

  async revokeRefreshTokens(uid: string, expectedEmail: string) {
    this.assertExpectedEmail(expectedEmail);
    this.revokeCalls.push(uid);
    this.revoked = true;
  }

  async readDisableState(uid: string, expectedEmail: string, revokedAfter: string) {
    this.readAttempts.push({ uid, expectedEmail, revokedAfter });
    this.assertExpectedEmail(expectedEmail);
    this.readCalls.push({ uid, revokedAfter });
    return {
      disabled: this.disabled,
      refreshTokensRevoked: this.revoked,
    };
  }

  private assertExpectedEmail(expectedEmail: string) {
    if (
      normalizeLiveVendorEmail(expectedEmail) !==
      normalizeLiveVendorEmail(this.currentEmail)
    ) {
      throw new LiveVendorLifecycleConflictError(
        "Firebase Vendor identity readback did not match exact authority.",
      );
    }
  }
}

class FakeLiveVendorDelivery implements LiveVendorInviteDeliveryAdapter {
  readonly sendCalls: Array<
    Parameters<LiveVendorInviteDeliveryAdapter["sendInvite"]>[0]
  > = [];
  readonly findCalls: Array<
    Parameters<LiveVendorInviteDeliveryAdapter["findInviteByRfcMessageId"]>[0]
  > = [];
  throwAfterAccept = false;
  throwWithoutAccept = false;
  throwOnFind = false;
  afterAccept?: () => Promise<void>;
  afterFind?: () => Promise<void>;
  findResults?: Array<LiveVendorInviteDelivery | null>;
  found: LiveVendorInviteDelivery | null = null;

  async sendInvite(input: Parameters<LiveVendorInviteDeliveryAdapter["sendInvite"]>[0]) {
    this.sendCalls.push(structuredClone(input));
    const delivery: LiveVendorInviteDelivery = {
      providerMessageRef: `gmail-message-${sha256(input.rfcMessageId).slice(0, 20)}`,
      rfcMessageId: input.rfcMessageId,
      recipientHash: input.recipientHash,
    };
    if (this.throwWithoutAccept) {
      throw new Error("ambiguous Gmail failure before acceptance readback");
    }
    this.found = delivery;
    await this.afterAccept?.();
    if (this.throwAfterAccept) throw new Error("ambiguous Gmail response");
    return delivery;
  }

  async findInviteByRfcMessageId(
    input: Parameters<LiveVendorInviteDeliveryAdapter["findInviteByRfcMessageId"]>[0],
  ) {
    this.findCalls.push(structuredClone(input));
    if (this.throwOnFind) {
      throw new Error("ambiguous Gmail exact-message readback");
    }
    await this.afterFind?.();
    return this.findResults?.shift() ?? this.found;
  }
}
