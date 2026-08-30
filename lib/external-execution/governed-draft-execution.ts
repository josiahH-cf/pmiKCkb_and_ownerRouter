import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  assertLiveProviderActionAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import {
  executeExternalActionWithS20,
  prepareExternalActionWithS20,
  reconcileExternalActionWithS20,
  type ExternalActionPreparationInput,
  type TrustedExternalExecutionContext,
} from "@/lib/external-execution/s20-bridge";
import {
  ExternalExecutionError,
  type ExternalActionDefinition,
} from "@/lib/external-execution/types";
import {
  LiveRenewalGmailDraftProvider,
  type RenewalDraftGmailClient,
} from "@/lib/lease-renewal/execution/live-gmail-draft-provider";
import { LeaseGmailExecutor } from "@/lib/lease-renewal/execution/providers";
import {
  renewalDraftAttachmentFromAction,
  sameRenewalDraftAttachmentIdentity,
  validateResolvedRenewalDraftAttachment,
  type RenewalDraftAttachmentIdentity,
  type ResolvedRenewalDraftAttachment,
} from "@/lib/lease-renewal/execution/renewal-draft-attachment";
import { assertAuthoritativeRenewalRecipient } from "@/lib/lease-renewal/execution/renewal-draft-request";
import { assertProductionRuntimeActionExecutable } from "@/lib/operations/runtime-suspension-gate";

/**
 * The shared one-attempt seam for both governed unsent-draft actions.
 *
 * Before this, each draft ran `LeaseGmailExecutor.execute` directly behind a bare `confirm: boolean`.
 * That path had no execution ledger, so nothing made the attempt idempotent, nothing bound the
 * confirmation to the exact preview a human reviewed, and a crash after the provider call left no
 * record to reconcile — the only recovery was to draft again. Routing both actions through the S20
 * bridge supplies the atomic claim, the exact-preview confirmation, the durable terminal state, and
 * the post-commit A2 event, without either action gaining a send capability.
 */

/** Test-only seams. Production omits every one of these and uses the committed bridge. */
export interface GovernedDraftSeams {
  readonly prepare?: typeof prepareExternalActionWithS20;
  readonly execute?: typeof executeExternalActionWithS20;
  readonly reconcile?: typeof reconcileExternalActionWithS20;
  /** Server-owned descriptor fence; overridden only to prove the refusal ordering. */
  readonly assertEffectEnvironment?: () => void;
}

export interface GovernedDraftRequest {
  readonly action: ExternalActionPreparationInput;
  readonly definition: Readonly<ExternalActionDefinition>;
  readonly createClient: () => RenewalDraftGmailClient;
  /** Owner-renewal only. It must gate/reload/verify Drive before Gmail construction. */
  readonly resolveAttachment?: (
    expected: RenewalDraftAttachmentIdentity,
  ) => Promise<ResolvedRenewalDraftAttachment>;
}

/**
 * `LeaseGmailExecutor.validate` is pure — it inspects only the action values. Preparation needs that
 * validation but must not be able to reach a provider, so it gets an executor whose provider throws
 * on any call rather than a real Gmail client.
 */
const VALIDATION_ONLY_EXECUTOR = new LeaseGmailExecutor(
  new Proxy({} as never, {
    get() {
      throw new Error("Draft preparation must not contact a provider.");
    },
  }),
);

function assertEffectEnvironment(seams: GovernedDraftSeams) {
  if (seams.assertEffectEnvironment) {
    seams.assertEffectEnvironment();
    return;
  }
  assertLiveProviderActionAllowed(requireEnvironmentDescriptor());
}

function trustedContext(
  action: ExternalActionPreparationInput,
): TrustedExternalExecutionContext {
  // Every reference is the server-built one from the action itself; the bridge re-compares them and
  // refuses if they drift. A browser payload never reaches this object.
  const technical = {
    connectionReady: true,
    documentedEvidence: true,
    endpointDocumented: true,
    permissionGranted: true,
    productionAllowed: true,
    requiredValuesPresent: true,
    roleScopeAuthorized: true,
    sourceValidated: true,
  } as const;
  return {
    connectionReady: true,
    endpointDocumented: true,
    localPreviewValidated: true,
    permissionGranted: true,
    roleScopeAuthorized: true,
    sourceValidated: true,
    technical,
    externalReferences: {
      connectionRef: action.connectionRef!,
      contractRef: action.contractRef!,
      mappingRef: action.mappingRef!,
      sourceRefs: action.sourceRefs,
    },
    communication: {
      workflowLinked: true,
      mailboxScopeAuthorized: true,
      humanInitiated: true,
      recipientMatchesPreview: true,
      reversible: true,
    },
  };
}

/**
 * Prepare one governed draft. This creates the ledger record and returns the exact preview hash the
 * caller must echo back; it constructs no provider and creates nothing in a mailbox.
 */
export async function prepareGovernedDraft(
  actor: AuthenticatedUser,
  request: GovernedDraftRequest,
  seams: GovernedDraftSeams = {},
) {
  // The data-safety guard runs at preparation too, so sample or non-routable recipient data is
  // refused before it can occupy an execution id at all.
  assertAuthoritativeRenewalRecipient({
    ...request.action,
    authority: undefined,
  } as never);
  // Preparation writes the S20 execution ledger. Local Live-read-only must refuse before that write,
  // not merely before the later Gmail client construction.
  assertEffectEnvironment(seams);
  await assertProductionRuntimeActionExecutable(request.action.actionKey);
  const prepare = seams.prepare ?? prepareExternalActionWithS20;
  return prepare(actor, {
    action: request.action,
    definition: request.definition,
    trustedContext: trustedContext(request.action),
    validate: (input) => VALIDATION_ONLY_EXECUTOR.validate(input),
  });
}

/**
 * Execute one prepared governed draft. Ordering is load-bearing: the recipient guard, the runtime
 * gate, and the environment fence all run BEFORE the bridge claims the attempt, so a refusal can
 * never strand a claimed execution that did no provider work.
 */
export async function executeGovernedDraft(
  actor: AuthenticatedUser,
  request: GovernedDraftRequest & {
    readonly executionId: string;
    readonly previewHash: string;
  },
  seams: GovernedDraftSeams = {},
) {
  assertAuthoritativeRenewalRecipient({
    ...request.action,
    authority: undefined,
  } as never);
  await assertProductionRuntimeActionExecutable(request.action.actionKey);
  assertEffectEnvironment(seams);
  let resolvedAttachment: ResolvedRenewalDraftAttachment | undefined;
  const expectedAttachment = renewalDraftAttachmentFromAction(request.action);
  if (expectedAttachment) {
    if (!request.resolveAttachment) {
      throw new ExternalExecutionError(
        "The exact receipt-bound comp screenshot resolver is unavailable.",
        "blocked",
      );
    }
    const resolved = validateResolvedRenewalDraftAttachment(
      await request.resolveAttachment(expectedAttachment),
    );
    if (!sameRenewalDraftAttachmentIdentity(expectedAttachment, resolved)) {
      throw new ExternalExecutionError(
        "The resolved comp screenshot changed after the exact preview.",
        "blocked",
      );
    }
    resolvedAttachment = resolved;
  }
  const execute = seams.execute ?? executeExternalActionWithS20;
  return execute(actor, {
    action: request.action,
    confirmedPreviewHash: request.previewHash,
    definition: request.definition,
    executionId: request.executionId,
    executor: new LeaseGmailExecutor(
      new LiveRenewalGmailDraftProvider(request.createClient(), resolvedAttachment),
    ),
    trustedContext: trustedContext(request.action),
  });
}

/**
 * Read-only reconciliation of an already-consumed draft attempt, by its deterministic RFC
 * Message-ID. It never calls `execute`, so it cannot create a second draft.
 */
export async function reconcileGovernedDraft(
  actor: AuthenticatedUser,
  request: GovernedDraftRequest & { readonly executionId: string },
  seams: GovernedDraftSeams = {},
) {
  assertEffectEnvironment(seams);
  const reconcile = seams.reconcile ?? reconcileExternalActionWithS20;
  return reconcile(actor, {
    action: request.action,
    definition: request.definition,
    executionId: request.executionId,
    executor: new LeaseGmailExecutor(
      new LiveRenewalGmailDraftProvider(request.createClient()),
    ),
    trustedContext: trustedContext(request.action),
  });
}
