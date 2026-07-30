import { randomUUID } from "node:crypto";

import {
  LiveVendorLifecycleAmbiguousError,
  LiveVendorLifecycleConflictError,
  LIVE_VENDOR_INVITE_RECOVERY_DELAY_MS,
  assertExactLiveVendorClaims,
  hashLiveVendorAssignmentPayload,
  hashLiveVendorContact,
  hashLiveVendorDisablePayload,
  hashLiveVendorInvitePayload,
  liveVendorAssignmentProviderRef,
  liveVendorInviteDerivedRefs,
  liveVendorLifecycleExecutionId,
  normalizeLiveVendorEmail,
  parseLiveVendorLifecycleReceipt,
  sha256,
  type LiveVendorAssignmentInput,
  type LiveVendorAssignmentResult,
  type LiveVendorAuthAdapter,
  type LiveVendorDisableInput,
  type LiveVendorDisableBindings,
  type LiveVendorDisableResult,
  type LiveVendorInviteDelivery,
  type LiveVendorInviteDeliveryAdapter,
  type LiveVendorInviteBindings,
  type LiveVendorInviteInput,
  type LiveVendorInviteInvalidatedResult,
  type LiveVendorInviteNotApplicableResult,
  type LiveVendorInviteResult,
  type LiveVendorLifecycleActionKey,
  type LiveVendorLifecycleExecutionRecord,
  type LiveVendorLifecycleResult,
  type LiveVendorLifecycleRuntimeContext,
  type LiveVendorLifecycleStore,
  type LiveVendorProjection,
} from "@/lib/vendor/live-lifecycle-contract";

export interface LiveVendorLifecycleProviderDependencies {
  context: LiveVendorLifecycleRuntimeContext;
  store: LiveVendorLifecycleStore;
  auth: LiveVendorAuthAdapter;
  delivery: LiveVendorInviteDeliveryAdapter;
  now?: () => Date;
  /** Test seam for the subsecond Firebase revocation boundary; Production waits at most 999 ms. */
  waitUntil?: (notBeforeEpochMs: number) => Promise<void>;
}

/**
 * Production-only provider for the three Admin Vendor lifecycle actions. It is structurally
 * compatible with VendorLifecycleProvider but intentionally does not import the shared executor:
 * the live path therefore has no route to release-rehearsal or Test modules.
 */
export class LiveVendorLifecycleProvider {
  private readonly now: () => Date;
  private readonly waitUntil: (notBeforeEpochMs: number) => Promise<void>;

  constructor(private readonly dependencies: LiveVendorLifecycleProviderDependencies) {
    if (
      dependencies.context.environment !== "production" ||
      dependencies.context.dataMode !== "live" ||
      dependencies.store.persistence !== "firestore"
    ) {
      throw new LiveVendorLifecycleConflictError(
        "Live Vendor lifecycle requires the Production Live Firestore boundary.",
      );
    }
    this.now = dependencies.now ?? (() => new Date());
    this.waitUntil =
      dependencies.waitUntil ??
      (async (notBeforeEpochMs) => {
        const delayMs = Math.max(0, notBeforeEpochMs - Date.now());
        if (delayMs > 1_000) {
          throw new LiveVendorLifecycleConflictError(
            "Firebase revocation boundary is outside the bounded worker window.",
          );
        }
        if (delayMs > 0) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, delayMs);
          });
        }
      });
  }

  async invite(input: LiveVendorInviteInput): Promise<LiveVendorInviteResult> {
    const payloadHash = hashLiveVendorInvitePayload(input);
    const email = normalizeLiveVendorEmail(input.email);
    const derived = liveVendorInviteDerivedRefs(input.idempotencyKey);
    const ownExecution = await this.dependencies.store.getExecution(
      "vendor.account.invite",
      input.idempotencyKey,
    );
    let record: LiveVendorLifecycleExecutionRecord;
    if (ownExecution) {
      assertInviteExecutionMatchesCommand(
        ownExecution,
        input,
        payloadHash,
        derived.executionId,
        derived.rfcMessageId,
      );
      if (ownExecution.state === "superseded") {
        if (
          ownExecution.bindings.inviteMode === "delivery_recovery" &&
          ownExecution.supersededByExecutionId ===
            ownExecution.bindings.supersededExecutionId
        ) {
          throw priorInviteDelivered();
        }
        throw new LiveVendorLifecycleConflictError(
          "This Vendor invite was superseded by a newer exact-confirmed correction.",
        );
      }
      record = ownExecution;
    } else {
      const reservation = await this.dependencies.store.getInviteReservation(email);
      if (!reservation) {
        if (input.inviteMode !== "initial") {
          throw new LiveVendorLifecycleConflictError(
            "The Vendor invite recovery source is no longer reserved.",
          );
        }
        record = await this.dependencies.store.claimInvite({
          command: { ...input, email },
          executionId: derived.executionId,
          payloadHash,
          vendorRef: derived.vendorRef,
          vendorUid: derived.vendorUid,
          rfcMessageId: derived.rfcMessageId,
          nowIso: this.nowIso(),
        });
      } else if (reservation.id === derived.executionId) {
        assertInviteExecutionMatchesCommand(
          reservation,
          input,
          payloadHash,
          derived.executionId,
          derived.rfcMessageId,
        );
        record = reservation;
      } else if (input.inviteMode === "setup_link_reissue") {
        if (
          reservation.actionKey !== "vendor.account.invite" ||
          reservation.bindings.kind !== "invite" ||
          reservation.state !== "succeeded" ||
          reservation.phase !== "succeeded" ||
          !reservation.receipt ||
          reservation.receipt.state !== "pending_setup"
        ) {
          throw new LiveVendorLifecycleConflictError(
            "A setup link may be reissued only from the exact successful pending-setup invitation.",
          );
        }
        record = await this.dependencies.store.reissueSetupLink({
          command: { ...input, email },
          executionId: derived.executionId,
          payloadHash,
          vendorRef: reservation.bindings.vendorRef,
          vendorUid: reservation.bindings.vendorUid,
          rfcMessageId: derived.rfcMessageId,
          predecessorExecutionId: reservation.id,
          nowIso: this.nowIso(),
        });
      } else if (input.inviteMode === "delivery_recovery") {
        if (
          reservation.actionKey !== "vendor.account.invite" ||
          reservation.bindings.kind !== "invite" ||
          reservation.state === "succeeded" ||
          reservation.state === "superseded" ||
          reservation.phase === "recovery_readback" ||
          reservation.phase === "identity_effect_claimed" ||
          reservation.phase === "delivery_effect_started"
        ) {
          throw new LiveVendorLifecycleConflictError(
            "That Vendor email already has a non-recoverable invitation.",
          );
        }
        if (reservation.phase === "delivery_claimed") {
          record = await this.dependencies.store.claimInviteRecovery({
            command: { ...input, email },
            executionId: derived.executionId,
            payloadHash,
            vendorRef: reservation.bindings.vendorRef,
            vendorUid: reservation.bindings.vendorUid,
            rfcMessageId: derived.rfcMessageId,
            supersededExecutionId: reservation.id,
            nowIso: this.nowIso(),
          });
        } else {
          record = await this.dependencies.store.supersedeInvite({
            command: { ...input, email },
            executionId: derived.executionId,
            payloadHash,
            vendorRef: reservation.bindings.vendorRef,
            vendorUid: reservation.bindings.vendorUid,
            rfcMessageId: derived.rfcMessageId,
            supersededExecutionId: reservation.id,
            nowIso: this.nowIso(),
          });
        }
      } else {
        throw new LiveVendorLifecycleConflictError(
          "That Vendor email is already reserved; prepare an exact recovery or setup-link reissue.",
        );
      }
    }

    assertInviteExecutionMatchesCommand(
      record,
      input,
      payloadHash,
      derived.executionId,
      derived.rfcMessageId,
    );
    if (record.phase === "recovery_readback") {
      const recovery = await this.readAndResolveInviteRecovery(record);
      if (recovery.notApplicable) throw priorInviteDelivered();
      record = recovery.activated;
    }
    if (record.phase === "recovery_abandoned") {
      throw new LiveVendorLifecycleConflictError(
        "That corrective Vendor invite was safely fenced; prepare a fresh exact recovery.",
      );
    }
    if (record.state === "succeeded") {
      return requireInviteResult(await this.hydrate(record));
    }

    if (
      record.phase === "delivery_effect_started" ||
      (record.phase === "delivery_claimed" && record.state === "ambiguous")
    ) {
      const reconciled = await this.findInviteDelivery(record);
      if (!reconciled) throw new LiveVendorLifecycleAmbiguousError();
      record = await this.dependencies.store.completeInvite({
        executionId: record.id,
        payloadHash,
        deliveryRefHash: sha256(reconciled.providerMessageRef),
        reconciled: true,
        nowIso: this.nowIso(),
      });
      if (record.state !== "succeeded") {
        throw new LiveVendorLifecycleAmbiguousError();
      }
      return requireInviteResult(await this.hydrate(record));
    }

    if (record.phase === "identity_effect_claimed") {
      throw new LiveVendorLifecycleAmbiguousError();
    }

    if (record.phase === "identity_reserved") {
      const identityClaim = await this.dependencies.store.claimInvitePrincipalEffect({
        executionId: record.id,
        payloadHash,
        nowIso: this.nowIso(),
      });
      record = identityClaim.record;
      if (!identityClaim.claimed) {
        if (record.phase === "recovery_abandoned") {
          throw new LiveVendorLifecycleConflictError(
            "That corrective Vendor invite was safely fenced; prepare a fresh exact recovery.",
          );
        }
        throw new LiveVendorLifecycleAmbiguousError();
      }
      let principal;
      try {
        principal = await this.dependencies.auth.ensureVendorPrincipal({
          uid: record.bindings.vendorUid,
          email: normalizeLiveVendorEmail(input.email),
          vendorRef: record.bindings.vendorRef,
          customClaims: {
            vendor: true,
            vendor_id: record.bindings.vendorRef,
            data_mode: "live",
          },
        });
        assertExactLiveVendorClaims(principal, {
          uid: record.bindings.vendorUid,
          email: input.email,
          vendorRef: record.bindings.vendorRef,
        });
        record = await this.dependencies.store.markInvitePrincipalReady({
          executionId: record.id,
          payloadHash,
          nowIso: this.nowIso(),
        });
      } catch (error) {
        if (
          await this.compensateInviteIdentityAfterCutoff(
            record,
            normalizeLiveVendorEmail(input.email),
          )
        ) {
          await this.markAmbiguous(
            record,
            payloadHash,
            "firebase_identity_disabled_after_cutoff",
          );
          throw new LiveVendorLifecycleAmbiguousError();
        }
        if (error instanceof LiveVendorLifecycleConflictError) throw error;
        await this.markAmbiguous(record, payloadHash, "firebase_identity_ambiguous");
        throw new LiveVendorLifecycleAmbiguousError();
      }
    }

    if (record.phase !== "delivery_claimed") {
      const claim = await this.dependencies.store.claimInviteDelivery({
        executionId: record.id,
        payloadHash,
        nowIso: this.nowIso(),
      });
      record = claim.record;
      if (!claim.claimed) {
        if (record.state === "succeeded") {
          return requireInviteResult(await this.hydrate(record));
        }
        const reconciled = await this.findInviteDelivery(record);
        if (!reconciled) throw new LiveVendorLifecycleAmbiguousError();
        record = await this.dependencies.store.completeInvite({
          executionId: record.id,
          payloadHash,
          deliveryRefHash: sha256(reconciled.providerMessageRef),
          reconciled: true,
          nowIso: this.nowIso(),
        });
        if (record.state !== "succeeded") {
          throw new LiveVendorLifecycleAmbiguousError();
        }
        return requireInviteResult(await this.hydrate(record));
      }
    }

    const effectClaim = await this.dependencies.store.claimInviteDeliveryEffect({
      executionId: record.id,
      payloadHash,
      nowIso: this.nowIso(),
    });
    record = effectClaim.record;
    if (!effectClaim.claimed) {
      if (record.state === "succeeded") {
        return requireInviteResult(await this.hydrate(record));
      }
      if (record.phase === "delivery_effect_started") {
        const reconciled = await this.findInviteDelivery(record);
        if (!reconciled) throw new LiveVendorLifecycleAmbiguousError();
        record = await this.dependencies.store.completeInvite({
          executionId: record.id,
          payloadHash,
          deliveryRefHash: sha256(reconciled.providerMessageRef),
          reconciled: true,
          nowIso: this.nowIso(),
        });
        if (record.state !== "succeeded") {
          throw new LiveVendorLifecycleAmbiguousError();
        }
        return requireInviteResult(await this.hydrate(record));
      }
      throw new LiveVendorLifecycleConflictError(
        "The Vendor invitation no longer owns the Gmail delivery effect.",
      );
    }

    let delivery: LiveVendorInviteDelivery;
    try {
      const bindings = requireInviteBindings(record);
      const challengeExpiresAt = inviteChallengeExpiresAt(record);
      delivery = await this.dependencies.delivery.sendInvite({
        recipientEmail: normalizeLiveVendorEmail(input.email),
        recipientHash: sha256(normalizeLiveVendorEmail(input.email)),
        company: input.company.trim(),
        vendorRef: bindings.vendorRef,
        vendorUid: bindings.vendorUid,
        inviteVersion: bindings.issuedInviteVersion,
        lifecycleExecutionId: record.id,
        challengeExpiresAt,
        ticketRef: input.ticketRef,
        artifactRef: input.artifactRef,
        rfcMessageId: bindings.rfcMessageId,
      });
      assertExactDelivery(record, delivery);
    } catch {
      await this.markAmbiguous(record, payloadHash, "invite_delivery_ambiguous");
      throw new LiveVendorLifecycleAmbiguousError();
    }
    record = await this.dependencies.store.completeInvite({
      executionId: record.id,
      payloadHash,
      deliveryRefHash: sha256(delivery.providerMessageRef),
      reconciled: false,
      nowIso: this.nowIso(),
    });
    if (record.state !== "succeeded") {
      throw new LiveVendorLifecycleAmbiguousError();
    }
    return requireInviteResult(await this.hydrate(record));
  }

  async changeAssignment(
    input: LiveVendorAssignmentInput,
  ): Promise<LiveVendorAssignmentResult> {
    const payloadHash = hashLiveVendorAssignmentPayload(input);
    const executionId = liveVendorLifecycleExecutionId(
      "vendor.assignment.change",
      input.idempotencyKey,
    );
    const record = await this.dependencies.store.commitAssignment({
      command: { ...input, email: normalizeLiveVendorEmail(input.email) },
      executionId,
      payloadHash,
      providerRef: liveVendorAssignmentProviderRef(input.idempotencyKey),
      nowIso: this.nowIso(),
    });
    const result = await this.hydrate(record);
    if (!("operation" in result)) {
      throw new LiveVendorLifecycleConflictError(
        "Vendor assignment receipt has the wrong action shape.",
      );
    }
    return result;
  }

  async disable(input: LiveVendorDisableInput): Promise<LiveVendorDisableResult> {
    const payloadHash = hashLiveVendorDisablePayload(input);
    const expectedEmail = normalizeLiveVendorEmail(input.email);
    const executionId = liveVendorLifecycleExecutionId(
      "vendor.account.disable",
      input.idempotencyKey,
    );
    const ownExecution = await this.dependencies.store.getExecution(
      "vendor.account.disable",
      input.idempotencyKey,
    );
    let record: LiveVendorLifecycleExecutionRecord;
    if (ownExecution) {
      assertDisableExecutionMatchesCommand(ownExecution, input, payloadHash, executionId);
      record = ownExecution;
    } else {
      record =
        input.disableMode === "firebase_completion_recovery"
          ? await this.dependencies.store.claimDisableCompletionRecovery({
              command: { ...input, email: expectedEmail },
              executionId,
              payloadHash,
              nowIso: this.nowIso(),
            })
          : await this.dependencies.store.disableAccess({
              command: { ...input, email: expectedEmail },
              executionId,
              payloadHash,
              nowIso: this.nowIso(),
            });
    }
    assertDisableExecutionMatchesCommand(record, input, payloadHash, executionId);
    if (record.state === "succeeded") {
      const result = await this.hydrate(record);
      if ("vendorUid" in result) return result;
      throw wrongReceipt();
    }

    const workerToken = randomUUID();
    const workerClaim = await this.dependencies.store.claimDisableCompletionWorker({
      executionId: record.id,
      payloadHash,
      workerToken,
      nowIso: this.nowIso(),
    });
    record = workerClaim.record;
    if (!workerClaim.claimed) {
      // A same-S20 duplicate may inspect exact provider state, but it never mutates Firebase,
      // renews the lease, or closes the ledger owned by the selected worker.
      await this.observeDisableState(record, expectedEmail);
      throw new LiveVendorLifecycleAmbiguousError();
    }

    try {
      let observed = await this.observeDisableState(record, expectedEmail);
      if (!observed.disabled) {
        await this.renewDisableCompletionLease(record, payloadHash, workerToken);
        await this.dependencies.auth.disableUser(
          record.bindings.vendorUid,
          expectedEmail,
        );
        await this.renewDisableCompletionLease(record, payloadHash, workerToken);
        observed = await this.observeDisableState(record, expectedEmail);
      }
      if (!observed.disabled) {
        throw new Error("Firebase disable readback did not confirm the cutoff.");
      }
      if (!observed.refreshTokensRevoked) {
        await this.renewDisableCompletionLease(record, payloadHash, workerToken);
        await this.crossFirebaseRevocationBoundary(record.accessDisabledAt!);
        await this.renewDisableCompletionLease(record, payloadHash, workerToken);
        await this.dependencies.auth.revokeRefreshTokens(
          record.bindings.vendorUid,
          expectedEmail,
        );
        await this.renewDisableCompletionLease(record, payloadHash, workerToken);
        observed = await this.observeDisableState(record, expectedEmail);
      }
      if (!observed.disabled || !observed.refreshTokensRevoked) {
        throw new Error("Firebase readback did not confirm the complete cutoff.");
      }
    } catch {
      await this.markAmbiguous(record, payloadHash, "firebase_disable_ambiguous");
      throw new LiveVendorLifecycleAmbiguousError();
    }
    record = await this.dependencies.store.completeDisable({
      executionId: record.id,
      payloadHash,
      workerToken,
      reconciled: false,
      nowIso: this.nowIso(),
    });
    const result = await this.hydrate(record);
    if ("vendorUid" in result) return result;
    throw wrongReceipt();
  }

  /**
   * Read-only with respect to Gmail/Firebase. It may close the internal ledger after provider
   * readback, but it never sends, disables, revokes, or otherwise repeats an external effect.
   */
  async reconcile(
    actionKey: LiveVendorLifecycleActionKey,
    idempotencyKey: string,
  ): Promise<LiveVendorLifecycleResult | null> {
    let record = await this.dependencies.store.getExecution(actionKey, idempotencyKey);
    if (!record) return null;
    if (record.state === "succeeded") return this.hydrate(record);

    if (
      record.actionKey === "vendor.account.invite" &&
      record.bindings.kind === "invite" &&
      record.phase === "recovery_readback"
    ) {
      const recovery = await this.readAndResolveInviteRecovery(record);
      if (recovery.notApplicable) return recovery.notApplicable;
      record = recovery.activated;
    }

    if (isAbandonedInviteRecovery(record)) {
      return inviteNotApplicableResult(record, "prior_invite_absent_recovery_activated");
    }

    if (isActivatedInviteRecovery(record)) {
      const fenced = await this.dependencies.store.abandonActivatedInviteRecovery({
        executionId: record.id,
        payloadHash: record.payloadHash,
        nowIso: this.nowIso(),
      });
      record = fenced.record;
      if (fenced.abandoned) {
        return inviteNotApplicableResult(
          record,
          "prior_invite_absent_recovery_activated",
        );
      }
      if (record.state === "succeeded") return this.hydrate(record);
      if (record.state === "superseded" && record.phase === "recovery_readback") {
        return inviteNotApplicableResult(record, "prior_invite_already_delivered");
      }
    }

    if (
      record.actionKey === "vendor.account.invite" &&
      record.bindings.kind === "invite" &&
      (record.phase === "delivery_claimed" || record.phase === "delivery_effect_started")
    ) {
      const delivery = await this.findInviteDelivery(record);
      if (!delivery) return null;
      record = await this.dependencies.store.completeInvite({
        executionId: record.id,
        payloadHash: record.payloadHash,
        deliveryRefHash: sha256(delivery.providerMessageRef),
        reconciled: true,
        nowIso: this.nowIso(),
      });
      if (record.state !== "succeeded") return null;
      return this.hydrate(record);
    }

    if (
      record.actionKey === "vendor.account.disable" &&
      record.bindings.kind === "disable" &&
      record.phase === "access_disabled"
    ) {
      if (!(await this.readDisabled(record))) return null;
      record = await this.dependencies.store.completeDisableFromReadback({
        executionId: record.id,
        payloadHash: record.payloadHash,
        nowIso: this.nowIso(),
      });
      return this.hydrate(record);
    }

    // Assignment commits atomically with its receipt, so a non-terminal assignment has no safe
    // provider readback to infer.
    return null;
  }

  async reconcileByS20ExecutionId(
    s20ExecutionId: string,
  ): Promise<LiveVendorLifecycleResult | null> {
    let record =
      await this.dependencies.store.getExecutionByS20ExecutionId(s20ExecutionId);
    if (!record) return null;
    if (record.state === "succeeded") return this.hydrate(record);

    if (
      record.actionKey === "vendor.account.invite" &&
      record.bindings.kind === "invite" &&
      record.phase === "recovery_readback"
    ) {
      const recovery = await this.readAndResolveInviteRecovery(record);
      if (recovery.notApplicable) return recovery.notApplicable;
      record = recovery.activated;
    }

    if (isAbandonedInviteRecovery(record)) {
      return inviteNotApplicableResult(record, "prior_invite_absent_recovery_activated");
    }

    if (isActivatedInviteRecovery(record)) {
      const fenced = await this.dependencies.store.abandonActivatedInviteRecovery({
        executionId: record.id,
        payloadHash: record.payloadHash,
        nowIso: this.nowIso(),
      });
      record = fenced.record;
      if (fenced.abandoned) {
        return inviteNotApplicableResult(
          record,
          "prior_invite_absent_recovery_activated",
        );
      }
      if (record.state === "succeeded") return this.hydrate(record);
      if (record.state === "superseded" && record.phase === "recovery_readback") {
        return inviteNotApplicableResult(record, "prior_invite_already_delivered");
      }
    }

    if (
      record.actionKey === "vendor.account.invite" &&
      record.bindings.kind === "invite" &&
      (record.phase === "delivery_claimed" || record.phase === "delivery_effect_started")
    ) {
      const delivery = await this.findInviteDelivery(record);
      if (!delivery) return null;
      const completed = await this.dependencies.store.completeInvite({
        executionId: record.id,
        payloadHash: record.payloadHash,
        deliveryRefHash: sha256(delivery.providerMessageRef),
        reconciled: true,
        nowIso: this.nowIso(),
      });
      if (completed.state !== "succeeded") return null;
      return this.hydrate(completed);
    }

    if (
      record.actionKey === "vendor.account.disable" &&
      record.bindings.kind === "disable" &&
      record.phase === "access_disabled"
    ) {
      if (!(await this.readDisabled(record))) return null;
      const completed = await this.dependencies.store.completeDisableFromReadback({
        executionId: record.id,
        payloadHash: record.payloadHash,
        nowIso: this.nowIso(),
      });
      return this.hydrate(completed);
    }
    return null;
  }

  private async readAndResolveInviteRecovery(
    recovery: LiveVendorLifecycleExecutionRecord,
  ): Promise<
    | {
        notApplicable: LiveVendorInviteNotApplicableResult;
        activated?: never;
      }
    | {
        notApplicable: null;
        activated: LiveVendorLifecycleExecutionRecord;
      }
  > {
    if (
      recovery.actionKey !== "vendor.account.invite" ||
      recovery.bindings.kind !== "invite" ||
      recovery.phase !== "recovery_readback"
    ) {
      throw wrongReceipt();
    }
    if (recovery.state === "superseded") {
      return {
        notApplicable: inviteNotApplicableResult(
          recovery,
          "prior_invite_already_delivered",
        ),
      };
    }
    const workerToken = randomUUID();
    const worker = await this.dependencies.store.claimInviteRecoveryReadbackWorker({
      executionId: recovery.id,
      payloadHash: recovery.payloadHash,
      workerToken,
      nowIso: this.nowIso(),
    });
    if (!worker.claimed) {
      throw new LiveVendorLifecycleAmbiguousError(
        "Another exact Vendor invite recovery readback is in progress.",
      );
    }
    recovery = worker.record;
    if (
      recovery.actionKey !== "vendor.account.invite" ||
      recovery.bindings.kind !== "invite" ||
      recovery.phase !== "recovery_readback"
    ) {
      throw wrongReceipt();
    }
    const sourceId = requireRecoverySourceId(recovery);
    const sourceS20ExecutionId = recovery.bindings.supersededS20ExecutionId!;
    const source =
      await this.dependencies.store.getExecutionByS20ExecutionId(sourceS20ExecutionId);
    if (!source || source.id !== sourceId) {
      throw new LiveVendorLifecycleConflictError(
        "The prior Vendor invite recovery source is unavailable.",
      );
    }

    let delivery: LiveVendorInviteDelivery | null;
    try {
      delivery = await this.findInviteDelivery(source);
    } catch (error) {
      if (error instanceof LiveVendorLifecycleAmbiguousError) {
        await this.markAmbiguous(
          recovery,
          recovery.payloadHash,
          "invite_recovery_readback_ambiguous",
        );
        try {
          await this.dependencies.store.releaseInviteRecoveryReadbackWorker({
            executionId: recovery.id,
            payloadHash: recovery.payloadHash,
            workerToken,
            nowIso: this.nowIso(),
          });
        } catch {
          // A process crash or concurrent terminal transition leaves the bounded lease in place.
        }
      }
      throw error;
    }
    if (delivery) {
      const resolved = await this.dependencies.store.resolveInviteRecoveryDelivered({
        executionId: recovery.id,
        payloadHash: recovery.payloadHash,
        deliveryRefHash: sha256(delivery.providerMessageRef),
        workerToken,
        nowIso: this.nowIso(),
      });
      return {
        notApplicable: inviteNotApplicableResult(
          resolved.recovery,
          "prior_invite_already_delivered",
        ),
      };
    }
    const activated = await this.dependencies.store.activateInviteRecovery({
      executionId: recovery.id,
      payloadHash: recovery.payloadHash,
      workerToken,
      nowIso: this.nowIso(),
    });
    return { notApplicable: null, activated };
  }

  private async findInviteDelivery(
    record: LiveVendorLifecycleExecutionRecord,
  ): Promise<LiveVendorInviteDelivery | null> {
    if (record.bindings.kind !== "invite") throw wrongReceipt();
    const vendor = await this.requireBoundVendor(record);
    let delivery: LiveVendorInviteDelivery | null;
    try {
      delivery = await this.dependencies.delivery.findInviteByRfcMessageId({
        rfcMessageId: record.bindings.rfcMessageId,
        recipientEmail: normalizeLiveVendorEmail(vendor.email),
        recipientHash: record.bindings.emailHash,
      });
    } catch {
      throw new LiveVendorLifecycleAmbiguousError();
    }
    if (!delivery) return null;
    assertExactDelivery(record, delivery);
    return delivery;
  }

  private async observeDisableState(
    record: LiveVendorLifecycleExecutionRecord,
    expectedEmail: string,
  ): Promise<{ disabled: boolean; refreshTokensRevoked: boolean }> {
    if (
      record.bindings.kind !== "disable" ||
      !record.accessDisabledAt ||
      record.phase !== "access_disabled"
    ) {
      throw wrongReceipt();
    }
    try {
      const observed = await this.dependencies.auth.readDisableState(
        record.bindings.vendorUid,
        expectedEmail,
        record.accessDisabledAt,
      );
      return observed;
    } catch {
      throw new LiveVendorLifecycleAmbiguousError();
    }
  }

  private async readDisabled(
    record: LiveVendorLifecycleExecutionRecord,
  ): Promise<boolean> {
    const vendor = await this.requireBoundVendor(record);
    const observed = await this.observeDisableState(
      record,
      normalizeLiveVendorEmail(vendor.email),
    );
    return observed.disabled && observed.refreshTokensRevoked;
  }

  private async compensateInviteIdentityAfterCutoff(
    record: LiveVendorLifecycleExecutionRecord,
    expectedEmail: string,
  ) {
    if (record.bindings.kind !== "invite") return false;
    const vendor = await this.dependencies.store.getVendor(record.bindings.vendorRef);
    if (
      !vendor ||
      vendor.id !== record.bindings.vendorRef ||
      vendor.uid !== record.bindings.vendorUid ||
      normalizeLiveVendorEmail(vendor.email) !== expectedEmail ||
      vendor.status !== "disabled"
    ) {
      return false;
    }
    try {
      await this.dependencies.auth.disableUser(record.bindings.vendorUid, expectedEmail);
      await this.crossFirebaseRevocationBoundary(vendor.updatedAt);
      await this.dependencies.auth.revokeRefreshTokens(
        record.bindings.vendorUid,
        expectedEmail,
      );
      const observed = await this.dependencies.auth.readDisableState(
        record.bindings.vendorUid,
        expectedEmail,
        vendor.updatedAt,
      );
      if (!observed.disabled || !observed.refreshTokensRevoked) {
        throw new Error("Firebase cutoff compensation did not read back exactly.");
      }
    } catch {
      // The disabled Live Vendor generation is a durable recovery signal. A fresh disable
      // completion action will retry this exact cutoff without allowing invite delivery.
    }
    return true;
  }

  private async crossFirebaseRevocationBoundary(cutoffIso: string) {
    const cutoffMs = Date.parse(cutoffIso);
    if (!Number.isFinite(cutoffMs)) {
      throw new LiveVendorLifecycleConflictError(
        "Vendor token-revocation cutoff is invalid.",
      );
    }
    await this.waitUntil(Math.ceil(cutoffMs / 1_000) * 1_000);
  }

  private async renewDisableCompletionLease(
    record: LiveVendorLifecycleExecutionRecord,
    payloadHash: string,
    workerToken: string,
  ) {
    await this.dependencies.store.renewDisableCompletionLease({
      executionId: record.id,
      payloadHash,
      workerToken,
      nowIso: this.nowIso(),
    });
  }

  private async hydrate(
    record: LiveVendorLifecycleExecutionRecord,
  ): Promise<LiveVendorLifecycleResult> {
    const receipt = parseLiveVendorLifecycleReceipt(record);
    const vendor = await this.requireBoundVendor(record);

    if (
      record.actionKey === "vendor.account.invite" &&
      record.bindings.kind === "invite" &&
      receipt.state === "delivery_invalidated" &&
      receipt.ticketRef === record.bindings.ticketRef &&
      receipt.deliveryRefHash &&
      /^[a-f0-9]{64}$/.test(receipt.deliveryRefHash) &&
      receipt.providerRef === `vendor-invite-delivery-invalidated:${record.id}`
    ) {
      return {
        providerRef: receipt.providerRef,
        state: "delivery_invalidated",
        reasonCode: "disabled_during_invite_delivery",
        executionId: record.id,
        s20ExecutionId: record.s20ExecutionId,
        idempotencyKeyHash: record.idempotencyKeyHash,
        deliveryRefHash: receipt.deliveryRefHash,
        vendorRef: record.bindings.vendorRef,
        ticketRef: record.bindings.ticketRef,
      } satisfies LiveVendorInviteInvalidatedResult;
    }
    if (
      record.actionKey === "vendor.account.invite" &&
      record.bindings.kind === "invite" &&
      receipt.state === "pending_setup" &&
      receipt.ticketRef === record.bindings.ticketRef
    ) {
      return {
        providerRef: receipt.providerRef,
        state: "pending_setup",
        vendorCompany: vendor.company,
        vendorEmail: vendor.email,
        ticketRef: record.bindings.ticketRef,
      };
    }
    if (
      record.actionKey === "vendor.assignment.change" &&
      record.bindings.kind === "assignment" &&
      (receipt.state === "assigned" || receipt.state === "removed")
    ) {
      return {
        providerRef: receipt.providerRef,
        state: receipt.state,
        vendorRef: record.bindings.vendorRef,
        vendorCompany: vendor.company,
        vendorEmail: vendor.email,
        ticketRef: record.bindings.ticketRef,
        currentVendorRef: record.bindings.currentVendorRef,
        targetVendorRef: record.bindings.targetVendorRef,
        operation: record.bindings.operation,
      };
    }
    if (
      record.actionKey === "vendor.account.disable" &&
      record.bindings.kind === "disable" &&
      receipt.state === "disabled"
    ) {
      return {
        providerRef: receipt.providerRef,
        state: "disabled",
        vendorRef: record.bindings.vendorRef,
        vendorUid: record.bindings.vendorUid,
        vendorCompany: vendor.company,
        vendorEmail: vendor.email,
        clearedAssignmentRefs: record.bindings.activeAssignmentRefs,
        mailboxState: record.bindings.mailboxState,
      };
    }
    throw wrongReceipt();
  }

  private async requireBoundVendor(
    record: LiveVendorLifecycleExecutionRecord,
  ): Promise<LiveVendorProjection> {
    const vendor = await this.dependencies.store.getVendor(record.bindings.vendorRef);
    if (
      !vendor ||
      vendor.dataMode !== "live" ||
      vendor.uid !== record.bindings.vendorUid ||
      sha256(normalizeLiveVendorEmail(vendor.email)) !== record.bindings.emailHash ||
      hashLiveVendorContact(vendor.company) !== record.bindings.companyHash
    ) {
      throw new LiveVendorLifecycleConflictError(
        "The Live Vendor no longer matches the immutable execution snapshot.",
      );
    }
    return vendor;
  }

  private async markAmbiguous(
    record: LiveVendorLifecycleExecutionRecord,
    payloadHash: string,
    errorCode: string,
  ) {
    try {
      await this.dependencies.store.markAmbiguous({
        executionId: record.id,
        payloadHash,
        errorCode,
        nowIso: this.nowIso(),
      });
    } catch {
      // Preserve the original ambiguous provider result. A failed ledger update never makes a
      // second external attempt safe; S20 remains consumed and reconciliation can inspect sources.
    }
  }

  private nowIso() {
    const value = this.now();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new LiveVendorLifecycleConflictError(
        "Vendor lifecycle clock is unavailable.",
      );
    }
    return value.toISOString();
  }
}

function assertExactDelivery(
  record: LiveVendorLifecycleExecutionRecord,
  delivery: LiveVendorInviteDelivery,
) {
  if (
    record.bindings.kind !== "invite" ||
    !delivery.providerMessageRef.trim() ||
    delivery.rfcMessageId !== record.bindings.rfcMessageId ||
    delivery.recipientHash !== record.bindings.emailHash
  ) {
    throw new LiveVendorLifecycleAmbiguousError(
      "Vendor invite delivery readback did not match the claimed message.",
    );
  }
}

function assertInviteExecutionMatchesCommand(
  record: LiveVendorLifecycleExecutionRecord,
  input: LiveVendorInviteInput,
  payloadHash: string,
  executionId: string,
  rfcMessageId: string,
): asserts record is LiveVendorLifecycleExecutionRecord & {
  actionKey: "vendor.account.invite";
  bindings: LiveVendorInviteBindings;
} {
  const bindings = record.bindings;
  const isInitial = bindings.kind === "invite" && bindings.inviteMode === "initial";
  const issuedVersionMatches =
    bindings.kind === "invite" &&
    Number.isSafeInteger(bindings.issuedInviteVersion) &&
    (bindings.inviteMode === "setup_link_reissue"
      ? bindings.issuedInviteVersion === bindings.inviteVersion + 1
      : bindings.issuedInviteVersion ===
        (bindings.inviteMode === "initial" ? 1 : bindings.inviteVersion));
  if (
    record.id !== executionId ||
    record.actionKey !== "vendor.account.invite" ||
    record.payloadHash !== payloadHash ||
    record.actorUid.trim() !== input.actorUid.trim() ||
    bindings.kind !== "invite" ||
    bindings.inviteMode !== input.inviteMode ||
    bindings.inviteVersion !== input.inviteVersion ||
    bindings.vendorUpdatedAt !== input.vendorUpdatedAt ||
    bindings.ticketRef !== input.ticketRef.trim() ||
    bindings.ticketUpdatedAt !== input.ticketUpdatedAt.trim() ||
    bindings.artifactRef !== input.artifactRef ||
    bindings.rfcMessageId !== rfcMessageId ||
    bindings.emailHash !== sha256(normalizeLiveVendorEmail(input.email)) ||
    bindings.companyHash !== hashLiveVendorContact(input.company) ||
    !issuedVersionMatches ||
    (isInitial
      ? bindings.inviteVersion !== 0 ||
        bindings.vendorUpdatedAt !== "generation:new" ||
        bindings.supersededExecutionId !== undefined ||
        bindings.supersededS20ExecutionId !== undefined ||
        bindings.supersessionHash !== undefined
      : bindings.vendorRef !== input.vendorRef || bindings.vendorUid !== input.vendorUid)
  ) {
    throw new LiveVendorLifecycleConflictError(
      "That Vendor invite identity does not match its immutable command.",
    );
  }
  if (!isInitial) requireRecoverySourceId(record);
}

function requireInviteBindings(
  record: LiveVendorLifecycleExecutionRecord,
): LiveVendorInviteBindings {
  if (record.actionKey !== "vendor.account.invite" || record.bindings.kind !== "invite") {
    throw wrongReceipt();
  }
  return record.bindings;
}

function assertDisableExecutionMatchesCommand(
  record: LiveVendorLifecycleExecutionRecord,
  input: LiveVendorDisableInput,
  payloadHash: string,
  executionId: string,
): asserts record is LiveVendorLifecycleExecutionRecord & {
  actionKey: "vendor.account.disable";
  bindings: LiveVendorDisableBindings;
} {
  const bindings = record.bindings;
  const commonMismatch =
    record.id !== executionId ||
    record.actionKey !== "vendor.account.disable" ||
    record.payloadHash !== payloadHash ||
    record.actorUid.trim() !== input.actorUid.trim() ||
    bindings.kind !== "disable" ||
    bindings.disableMode !== input.disableMode ||
    bindings.vendorRef !== input.vendorRef ||
    bindings.vendorUid !== input.vendorUid ||
    bindings.emailHash !== sha256(normalizeLiveVendorEmail(input.email)) ||
    bindings.companyHash !== hashLiveVendorContact(input.company) ||
    bindings.currentStatus !== input.currentStatus ||
    bindings.vendorUpdatedAt !== input.vendorUpdatedAt ||
    bindings.activeAssignmentRefs !== input.activeAssignmentRefs ||
    bindings.mailboxState !== input.mailboxState ||
    bindings.mailboxTokenRefHash !== input.mailboxTokenRefHash ||
    bindings.accessDisabledAt !== record.accessDisabledAt;
  const modeMismatch =
    bindings.kind !== "disable"
      ? true
      : input.disableMode === "initial"
        ? bindings.rootExecutionId !== record.id ||
          bindings.rootS20ExecutionId !== record.s20ExecutionId ||
          bindings.completionGeneration !== 0 ||
          bindings.completionOwnerExecutionId !== record.id ||
          bindings.completionOwnerS20ExecutionId !== record.s20ExecutionId ||
          bindings.issuedCompletionGeneration !== 0
        : bindings.rootExecutionId !== input.rootExecutionId ||
          bindings.rootS20ExecutionId !== input.rootS20ExecutionId ||
          bindings.accessDisabledAt !== input.accessDisabledAt ||
          bindings.completionGeneration !== input.completionGeneration ||
          bindings.completionOwnerExecutionId !== input.completionOwnerExecutionId ||
          bindings.completionOwnerS20ExecutionId !==
            input.completionOwnerS20ExecutionId ||
          bindings.completionLeaseExpiresAt !== input.completionLeaseExpiresAt ||
          bindings.issuedCompletionGeneration !== input.completionGeneration + 1;
  if (commonMismatch || modeMismatch) {
    throw new LiveVendorLifecycleConflictError(
      "That Vendor disable identity does not match its immutable command.",
    );
  }
}

function inviteChallengeExpiresAt(record: LiveVendorLifecycleExecutionRecord): string {
  const claimedAt = Date.parse(record.deliveryClaimedAt ?? "");
  if (
    !Number.isFinite(claimedAt) ||
    (record.phase !== "delivery_claimed" && record.phase !== "delivery_effect_started")
  ) {
    throw wrongReceipt();
  }
  return new Date(claimedAt + LIVE_VENDOR_INVITE_RECOVERY_DELAY_MS).toISOString();
}

function requireRecoverySourceId(record: LiveVendorLifecycleExecutionRecord): string {
  if (
    record.bindings.kind !== "invite" ||
    !record.bindings.supersededExecutionId ||
    !record.bindings.supersededS20ExecutionId ||
    record.bindings.supersessionHash !==
      sha256(
        `${record.bindings.supersededExecutionId}\0${record.bindings.supersededS20ExecutionId}`,
      )
  ) {
    throw new LiveVendorLifecycleConflictError(
      "The Vendor invite recovery source binding is malformed.",
    );
  }
  return record.bindings.supersededExecutionId;
}

function isActivatedInviteRecovery(record: LiveVendorLifecycleExecutionRecord): boolean {
  if (
    record.actionKey !== "vendor.account.invite" ||
    record.bindings.kind !== "invite" ||
    record.bindings.inviteMode !== "delivery_recovery" ||
    record.bindings.supersededExecutionId === undefined
  ) {
    return false;
  }
  requireRecoverySourceId(record);
  return (
    (record.phase === "identity_reserved" ||
      record.phase === "identity_effect_claimed" ||
      record.phase === "identity_ready") &&
    (record.state === "running" || record.state === "ambiguous")
  );
}

function isAbandonedInviteRecovery(record: LiveVendorLifecycleExecutionRecord): boolean {
  if (
    record.actionKey !== "vendor.account.invite" ||
    record.bindings.kind !== "invite" ||
    record.bindings.inviteMode !== "delivery_recovery" ||
    record.bindings.supersededExecutionId === undefined
  ) {
    return false;
  }
  requireRecoverySourceId(record);
  return record.phase === "recovery_abandoned" && record.state === "ambiguous";
}

function inviteNotApplicableResult(
  record: LiveVendorLifecycleExecutionRecord,
  reasonCode: "prior_invite_already_delivered" | "prior_invite_absent_recovery_activated",
): LiveVendorInviteNotApplicableResult {
  const supersededExecutionId = requireRecoverySourceId(record);
  if (
    record.actionKey !== "vendor.account.invite" ||
    record.bindings.kind !== "invite" ||
    !record.bindings.supersededS20ExecutionId ||
    !record.bindings.supersessionHash ||
    (reasonCode === "prior_invite_already_delivered" &&
      (record.phase !== "recovery_readback" ||
        record.state !== "superseded" ||
        record.supersededByExecutionId !== supersededExecutionId)) ||
    (reasonCode === "prior_invite_absent_recovery_activated" &&
      !isAbandonedInviteRecovery(record))
  ) {
    throw wrongReceipt();
  }
  return {
    providerRef: `vendor-invite-not-applicable:${record.id}`,
    state: "not_applicable",
    outcome: "not_applicable",
    attemptFenced: true,
    reasonCode,
    correctiveExecutionId: record.id,
    correctiveS20ExecutionId: record.s20ExecutionId,
    idempotencyKeyHash: record.idempotencyKeyHash,
    supersededExecutionId,
    supersededS20ExecutionId: record.bindings.supersededS20ExecutionId,
    supersessionHash: record.bindings.supersessionHash,
  };
}

function wrongReceipt() {
  return new LiveVendorLifecycleConflictError(
    "Vendor lifecycle receipt does not match its immutable source snapshot.",
  );
}

function priorInviteDelivered() {
  return new LiveVendorLifecycleConflictError(
    "The prior Vendor invitation was already delivered; the corrective action made no new delivery.",
  );
}

function requireInviteResult(result: LiveVendorLifecycleResult): LiveVendorInviteResult {
  if (result.state === "delivery_invalidated") {
    // Gmail accepted the exact effect, but the access cutoff won before ledger completion. Keep
    // S20 ambiguous so its read-only reconciliation path can close from the terminal historical
    // receipt; never misclassify the accepted delivery as a provider refusal.
    throw new LiveVendorLifecycleAmbiguousError();
  }
  if (result.state !== "pending_setup") throw wrongReceipt();
  return result;
}
