import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  assertLiveProviderActionAllowed,
  EnvironmentContextError,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import type { ActionExecutionRecord } from "@/lib/execution/types";
import {
  executeExternalActionWithS20,
  prepareExternalActionWithS20,
  reconcileExternalActionWithS20,
  type ExecuteExternalActionWithS20Input,
  type ExternalActionPreparationInput,
  type ExternalS20BridgeOptions,
  type PrepareExternalActionWithS20Input,
  type ReconcileExternalActionWithS20Input,
  type TrustedExternalExecutionContext,
} from "@/lib/external-execution/s20-bridge";
import type {
  ExternalActionDefinition,
  ExternalActionReceipt,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import { FINAL_V1_ACTION_PREVIEW_SCHEMAS } from "@/lib/integrations/final-v1-action-contracts";
import { validatePreviewPayload } from "@/lib/integrations/preview-payload";
import { MAINTENANCE_EXECUTION_DEFINITION_MAP } from "@/lib/maintenance/execution/matrix";
import { assertProductionRuntimeActionExecutable } from "@/lib/operations/runtime-suspension-gate";
import type { LiveVendorLifecycleActionKey } from "@/lib/vendor/live-lifecycle-contract";

export { LIVE_VENDOR_LIFECYCLE_ACTION_KEYS } from "@/lib/vendor/live-lifecycle-contract";
export type { LiveVendorLifecycleActionKey } from "@/lib/vendor/live-lifecycle-contract";

export const INTENTIONALLY_CLOSED_VENDOR_GMAIL_ACTION_KEYS = [
  "vendor.gmail.connect",
  "vendor.gmail.revoke",
  "vendor.gmail.health",
  "vendor.gmail.thread.read",
  "vendor.gmail.draft.create",
  "vendor.gmail.thread.reply",
  "vendor.gmail.label.apply",
] as const;

export type IntentionallyClosedVendorGmailActionKey =
  (typeof INTENTIONALLY_CLOSED_VENDOR_GMAIL_ACTION_KEYS)[number];

interface InviteIntent {
  readonly actionKey: "vendor.account.invite";
  readonly company: string;
  readonly email: string;
  readonly reason: string;
  readonly ticketId: string;
}

interface AssignmentIntent {
  readonly actionKey: "vendor.assignment.change";
  readonly assignmentOperation: "assign" | "remove";
  readonly reason: string;
  readonly ticketId: string;
  readonly vendorId: string;
}

interface DisableIntent {
  readonly actionKey: "vendor.account.disable";
  readonly reason: string;
  readonly vendorId: string;
}

export type LiveVendorLifecycleIntent = InviteIntent | AssignmentIntent | DisableIntent;

export type LiveVendorLifecycleOperation = "prepare" | "execute" | "reconcile";

export type LiveVendorLifecycleRequest =
  | (LiveVendorLifecycleIntent & { readonly operation: "prepare" })
  | (LiveVendorLifecycleIntent & {
      readonly confirmedPreviewHash: string;
      readonly executionId: string;
      readonly operation: "execute";
    })
  | (LiveVendorLifecycleIntent & {
      readonly executionId: string;
      readonly operation: "reconcile";
    });

export interface LiveVendorLifecycleSourceSelection {
  /**
   * Exact, server-rehydrated command. The resolver owns every source ref, generation,
   * provider mapping, workflow/action identity, and idempotency-bearing value.
   */
  readonly action: ExternalActionPreparationInput;
  /** Server-loaded S20 execution ids; the browser has no dependency-id field. */
  readonly dependencyExecutionIds?: Readonly<Record<string, string>>;
  /** Server-owned readiness and authoritative external-reference projection. */
  readonly trustedContext: TrustedExternalExecutionContext;
  /** Server-derived preview wording; the browser cannot request a recovery generation. */
  readonly variant?:
    | "standard"
    | "invite_correction"
    | "setup_link_reissue"
    | "disable_completion_recovery";
}

export interface LiveVendorLifecycleSourceRequest {
  readonly actor: AuthenticatedUser;
  readonly executionId?: string;
  readonly intent: LiveVendorLifecycleIntent;
  readonly operation: LiveVendorLifecycleOperation;
}

export interface LiveVendorLifecycleSourceResolver {
  /**
   * Prepare reloads current authoritative records. Execute rehydrates and rechecks the
   * server-owned prepared command. Reconcile must use the supplied S20 execution id only
   * as a lookup key for its unique immutable provider-ledger snapshot, then read the
   * current effect: assignment/disable may already have changed the current source docs.
   * It must never reconstruct the original command from browser generations or only from
   * those post-effect docs.
   */
  resolve(
    request: LiveVendorLifecycleSourceRequest,
  ): LiveVendorLifecycleSourceSelection | Promise<LiveVendorLifecycleSourceSelection>;
}

interface LiveVendorLifecycleS20 {
  readonly execute: typeof executeExternalActionWithS20;
  readonly prepare: typeof prepareExternalActionWithS20;
  readonly reconcile: typeof reconcileExternalActionWithS20;
}

interface LiveVendorLifecyclePreparedAttempts {
  readonly persist: (
    actor: AuthenticatedUser,
    input: {
      readonly execution: ActionExecutionRecord;
      readonly selection: LiveVendorLifecycleSourceSelection;
    },
  ) => Promise<void>;
  readonly requireUnstarted: (
    actor: AuthenticatedUser,
    input: {
      readonly executionId: string;
      readonly previewHash: string;
      readonly selection: LiveVendorLifecycleSourceSelection;
    },
  ) => Promise<void>;
  readonly fenceForReconciliation: (
    actor: AuthenticatedUser,
    input: {
      readonly executionId: string;
      readonly previewHash: string;
      readonly selection: LiveVendorLifecycleSourceSelection;
    },
  ) => Promise<
    | { readonly status: "provider_started" }
    | {
        readonly duplicate: boolean;
        readonly receipt: Readonly<ExternalActionReceipt>;
        readonly status: "fenced";
      }
  >;
}

export interface LiveVendorLifecycleServiceDeps {
  /**
   * Return a lazy wrapper only. Its `execute()` method may construct a mutating client
   * because S20 invokes it after the atomic claim; resolving this wrapper must construct
   * zero Firebase, Firestore, Gmail, or other Live clients.
   */
  readonly resolveLazyExecutor: (
    actionKey: LiveVendorLifecycleActionKey,
    selection: LiveVendorLifecycleSourceSelection,
  ) => ExternalExecutor | Promise<ExternalExecutor>;
  /**
   * Provider-free, synchronous action validation for prepare. This resolver and the
   * returned validator must perform zero I/O and construct zero provider clients.
   */
  readonly resolveValidator: (
    actionKey: LiveVendorLifecycleActionKey,
    selection: LiveVendorLifecycleSourceSelection,
  ) => NonNullable<ExternalExecutor["validate"]>;
  /** Durable pre-provider snapshot/fence seam; no Live provider client is constructed here. */
  readonly preparedAttempts: LiveVendorLifecyclePreparedAttempts;
  /** Optional server-only Registry seam, passed through to both gate and S20 bridge. */
  readonly registry?: CreateActionRegistryInput[];
  readonly resolveApprovalQueueHref?: (
    actor: AuthenticatedUser,
    executionId: string,
  ) => string | Promise<string>;
  readonly s20?: LiveVendorLifecycleS20;
  readonly source: LiveVendorLifecycleSourceResolver;
}

export interface LiveVendorLifecycleContext {
  readonly descriptor: EnvironmentDescriptor;
}

export interface LiveVendorLifecyclePreviewField {
  readonly label: string;
  readonly name: string;
  readonly value: string | number | boolean;
}

export interface LiveVendorLifecyclePrepared {
  readonly approvalQueueHref: string;
  readonly preview: {
    readonly actionKey: LiveVendorLifecycleActionKey;
    readonly exactEffect: string;
    readonly executionId: string;
    readonly fields: readonly LiveVendorLifecyclePreviewField[];
    readonly previewHash: string;
    readonly projection: Readonly<Record<string, string | number | boolean>>;
    readonly target: string;
  };
  readonly status: "awaiting_approval";
}

export interface LiveVendorLifecycleExecuted {
  readonly executionId: string;
  readonly resultRecorded: boolean;
  readonly status: "failed" | "needs_reconciliation" | "succeeded";
}

export interface LiveVendorLifecycleReconciled {
  readonly duplicate: boolean;
  readonly executionId: string;
  readonly outcome?: "not_applicable" | "succeeded";
  readonly status: "not_found" | "succeeded";
}

export class LiveVendorLifecycleError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 413 | 415 | 503,
    readonly code: string,
  ) {
    super(message);
    this.name = "LiveVendorLifecycleError";
  }
}

const DEFAULT_S20: LiveVendorLifecycleS20 = {
  execute: executeExternalActionWithS20,
  prepare: prepareExternalActionWithS20,
  reconcile: reconcileExternalActionWithS20,
};

const EXACT_EFFECTS: Readonly<Record<LiveVendorLifecycleActionKey, string>> = {
  "vendor.account.invite":
    "Create one scoped Vendor account invitation for the exact company, email, and initial ticket shown below.",
  "vendor.assignment.change":
    "Change exactly one Vendor assignment on exactly one maintenance ticket as shown below.",
  "vendor.account.disable":
    "Disable exactly one Vendor principal, revoke its sessions, and remove its active access as shown below.",
};

export function assertExplicitProductionLive(descriptor: EnvironmentDescriptor) {
  assertLiveProviderActionAllowed(descriptor);
  if (descriptor.source !== "explicit") {
    throw new EnvironmentContextError(
      "Live Vendor lifecycle actions require an explicit Production+Live environment descriptor; the legacy environment bridge cannot authorize them.",
      descriptor,
    );
  }
}

export async function prepareLiveVendorLifecycle(
  actor: AuthenticatedUser,
  request: Extract<LiveVendorLifecycleRequest, { operation: "prepare" }>,
  deps: LiveVendorLifecycleServiceDeps,
  context: LiveVendorLifecycleContext,
): Promise<LiveVendorLifecyclePrepared> {
  assertExplicitProductionLive(context.descriptor);
  await assertProductionRuntimeActionExecutable(request.actionKey, deps.registry);

  const intent = lifecycleIntent(request);
  const selection = await deps.source.resolve({
    actor,
    intent,
    operation: "prepare",
  });
  const resolved = validateSelection(intent, selection);
  const validate = deps.resolveValidator(request.actionKey, selection);
  if (typeof validate !== "function") {
    throw new LiveVendorLifecycleError(
      "The Live Vendor lifecycle runtime is missing its provider-free validation boundary.",
      503,
      "vendor_lifecycle_validator_unavailable",
    );
  }

  const bridge = deps.s20 ?? DEFAULT_S20;
  const record = await bridge.prepare(
    actor,
    {
      action: selection.action,
      approvalQueue: {
        directLink: "/admin/vendors",
        processRunRef: {
          id: selection.action.workflowId,
          label:
            selection.variant === "invite_correction"
              ? "Vendor re-invite correction"
              : selection.variant === "setup_link_reissue"
                ? "Vendor setup-link reissue"
                : selection.variant === "disable_completion_recovery"
                  ? "Finish Vendor Firebase cutoff"
                  : lifecycleProcessLabel(request.actionKey),
        },
        requiredAdminUid: actor.uid,
      },
      definition: resolved.definition,
      trustedContext: selection.trustedContext,
      validate,
    } satisfies PrepareExternalActionWithS20Input,
    bridgeOptions(deps),
  );

  if (record.preview_hash !== resolved.previewHash) {
    throw new LiveVendorLifecycleError(
      "The S20 preview record did not bind to the exact server projection.",
      409,
      "vendor_lifecycle_preview_mismatch",
    );
  }
  await deps.preparedAttempts.persist(actor, {
    execution: record,
    selection,
  });

  const approvalQueueHref = deps.resolveApprovalQueueHref
    ? await deps.resolveApprovalQueueHref(actor, record.id)
    : "/approval-queue";

  return {
    approvalQueueHref,
    preview: {
      actionKey: request.actionKey,
      exactEffect:
        selection.variant === "invite_correction"
          ? "Create one corrective re-invitation for the exact reserved Vendor identity and replacement ticket generation shown below. The prior unresolved invitation is the server-bound supersession source."
          : selection.variant === "setup_link_reissue"
            ? "Issue one replacement setup link for the exact pending-setup Vendor generation shown below. The prior successful invitation remains immutable history, and this action invalidates older setup tokens."
            : selection.variant === "disable_completion_recovery"
              ? "Finish only the incomplete Firebase disable and session-revocation steps for the exact access cutoff shown below. This recovery does not repeat Firestore unassignment or mailbox cleanup."
              : EXACT_EFFECTS[request.actionKey],
      executionId: record.id,
      fields: resolved.fields,
      previewHash: resolved.previewHash,
      projection: resolved.projection,
      target: lifecycleTarget(request.actionKey, resolved.projection),
    },
    status: "awaiting_approval",
  };
}

export async function executeLiveVendorLifecycle(
  actor: AuthenticatedUser,
  request: Extract<LiveVendorLifecycleRequest, { operation: "execute" }>,
  deps: LiveVendorLifecycleServiceDeps,
  context: LiveVendorLifecycleContext,
): Promise<LiveVendorLifecycleExecuted> {
  assertExplicitProductionLive(context.descriptor);
  await assertProductionRuntimeActionExecutable(request.actionKey, deps.registry);

  const intent = lifecycleIntent(request);
  const selection = await deps.source.resolve({
    actor,
    executionId: request.executionId,
    intent,
    operation: "execute",
  });
  const resolved = validateSelection(intent, selection);
  if (request.confirmedPreviewHash !== resolved.previewHash) {
    throw new LiveVendorLifecycleError(
      "The Live sources changed after preview. Prepare a new exact preview before executing.",
      409,
      "vendor_lifecycle_stale_preview",
    );
  }
  await deps.preparedAttempts.requireUnstarted(actor, {
    executionId: request.executionId,
    previewHash: resolved.previewHash,
    selection,
  });

  // This must remain a lazy wrapper. S20 performs the durable approval check and
  // atomic claim before invoking wrapper.execute(), where client construction belongs.
  const executor = await deps.resolveLazyExecutor(request.actionKey, selection);
  const bridge = deps.s20 ?? DEFAULT_S20;
  const outcome = await bridge.execute(
    actor,
    {
      action: selection.action,
      confirmedPreviewHash: request.confirmedPreviewHash,
      definition: resolved.definition,
      dependencyExecutionIds: selection.dependencyExecutionIds,
      executionId: request.executionId,
      executor,
      trustedContext: selection.trustedContext,
    } satisfies ExecuteExternalActionWithS20Input,
    bridgeOptions(deps),
  );

  return {
    executionId: request.executionId,
    resultRecorded: outcome.result !== undefined,
    status: executionStatus(outcome.execution),
  };
}

export async function reconcileLiveVendorLifecycle(
  actor: AuthenticatedUser,
  request: Extract<LiveVendorLifecycleRequest, { operation: "reconcile" }>,
  deps: LiveVendorLifecycleServiceDeps,
  context: LiveVendorLifecycleContext,
): Promise<LiveVendorLifecycleReconciled> {
  // Reconciliation is deliberately not coupled to the mutating action gate. Closing a
  // key must never strand an already-consumed, ambiguous Live effect.
  assertExplicitProductionLive(context.descriptor);

  const intent = lifecycleIntent(request);
  let selection = await deps.source.resolve({
    actor,
    executionId: request.executionId,
    intent,
    operation: "reconcile",
  });
  let resolved = validateSelection(intent, selection);
  const preProvider = await deps.preparedAttempts.fenceForReconciliation(actor, {
    executionId: request.executionId,
    previewHash: resolved.previewHash,
    selection,
  });
  if (preProvider.status === "fenced") {
    return {
      duplicate: preProvider.duplicate,
      executionId: request.executionId,
      outcome: "not_applicable",
      status: "succeeded",
    };
  }

  // Provider start won the prepared-snapshot/index race. Reload through the immutable provider
  // ledger before readback; the snapshot-only selection must not be treated as provider evidence.
  selection = await deps.source.resolve({
    actor,
    executionId: request.executionId,
    intent,
    operation: "reconcile",
  });
  resolved = validateSelection(intent, selection);
  // The wrapper's reconcile() path may construct a read-only provider client only when
  // S20 has first verified a one-attempt ambiguous execution.
  const executor = await deps.resolveLazyExecutor(request.actionKey, selection);
  const bridge = deps.s20 ?? DEFAULT_S20;
  const outcome = await bridge.reconcile(
    actor,
    {
      action: selection.action,
      confirmedPreviewHash: resolved.previewHash,
      definition: resolved.definition,
      executionId: request.executionId,
      executor,
      trustedContext: selection.trustedContext,
    } satisfies ReconcileExternalActionWithS20Input,
    bridgeOptions(deps),
  );
  const reconciledOutcome =
    outcome.status === "succeeded" && "receipt" in outcome && outcome.receipt
      ? (outcome.receipt.outcome ?? "succeeded")
      : "outcome" in outcome
        ? outcome.outcome
        : undefined;

  return {
    duplicate: outcome.duplicate,
    executionId: request.executionId,
    ...(reconciledOutcome ? { outcome: reconciledOutcome } : {}),
    status: outcome.status,
  };
}

/**
 * Fail-closed runtime used until the clean Live source/provider adapters are wired.
 * Keeping this constructor provider-free also lets the route reject auth, environment,
 * malformed bodies, closed keys, and intentional Gmail non-targets before any client exists.
 */
export function buildUnwiredLiveVendorLifecycleServiceDeps(): LiveVendorLifecycleServiceDeps {
  return {
    preparedAttempts: {
      fenceForReconciliation: async () => unavailableAdapter(),
      persist: async () => unavailableAdapter(),
      requireUnstarted: async () => unavailableAdapter(),
    },
    resolveLazyExecutor: async () => unavailableAdapter(),
    resolveValidator: () => unavailableAdapter(),
    source: {
      resolve: async () => unavailableAdapter(),
    },
  };
}

function unavailableAdapter(): never {
  throw new LiveVendorLifecycleError(
    "The Live Vendor lifecycle source/provider adapter is not wired for this deployment.",
    503,
    "vendor_lifecycle_adapter_unavailable",
  );
}

function lifecycleIntent(request: LiveVendorLifecycleRequest): LiveVendorLifecycleIntent {
  switch (request.actionKey) {
    case "vendor.account.invite":
      return {
        actionKey: request.actionKey,
        company: request.company,
        email: request.email,
        reason: request.reason,
        ticketId: request.ticketId,
      };
    case "vendor.assignment.change":
      return {
        actionKey: request.actionKey,
        assignmentOperation: request.assignmentOperation,
        reason: request.reason,
        ticketId: request.ticketId,
        vendorId: request.vendorId,
      };
    case "vendor.account.disable":
      return {
        actionKey: request.actionKey,
        reason: request.reason,
        vendorId: request.vendorId,
      };
  }
}

function validateSelection(
  intent: LiveVendorLifecycleIntent,
  selection: LiveVendorLifecycleSourceSelection,
) {
  const action = selection.action;
  if (Object.prototype.hasOwnProperty.call(action, "authority")) {
    throw new LiveVendorLifecycleError(
      "Live Vendor lifecycle authority must be constructed by S20 and cannot appear in a source command.",
      400,
      "vendor_lifecycle_authority_forbidden",
    );
  }
  if (action.dataMode !== "live") {
    throw new LiveVendorLifecycleError(
      "The Live Vendor lifecycle resolver must return an explicitly Live command.",
      409,
      "vendor_lifecycle_data_mode_mismatch",
    );
  }
  if (action.actionKey !== intent.actionKey) {
    throw new LiveVendorLifecycleError(
      "The server-resolved action key did not match the requested lifecycle action.",
      409,
      "vendor_lifecycle_action_mismatch",
    );
  }
  if (
    (selection.variant === "invite_correction" ||
      selection.variant === "setup_link_reissue") &&
    (intent.actionKey !== "vendor.account.invite" ||
      !action.sourceRefs.some((ref) => ref.startsWith("vendor-invite-supersession:")))
  ) {
    throw new LiveVendorLifecycleError(
      "The Vendor re-invite correction is missing its server-owned supersession binding.",
      409,
      "vendor_lifecycle_supersession_binding_invalid",
    );
  }
  if (
    selection.variant === "disable_completion_recovery" &&
    (intent.actionKey !== "vendor.account.disable" ||
      action.values.disable_mode !== "firebase_completion_recovery" ||
      !action.sourceRefs.some((ref) => ref.startsWith("vendor-disable-root:")))
  ) {
    throw new LiveVendorLifecycleError(
      "The Vendor disable recovery is missing its server-owned completion lineage.",
      409,
      "vendor_lifecycle_disable_completion_binding_invalid",
    );
  }

  const definition = resolveDefinition(intent.actionKey);
  const schema = FINAL_V1_ACTION_PREVIEW_SCHEMAS[intent.actionKey];
  if (!schema) {
    throw new LiveVendorLifecycleError(
      "The lifecycle action has no exact preview contract.",
      503,
      "vendor_lifecycle_preview_contract_missing",
    );
  }

  const projection = Object.freeze({ ...action.values });
  const validation = validatePreviewPayload(
    schema.map((field) => ({ ...field })),
    projection,
  );
  if (!validation.ok) {
    throw new LiveVendorLifecycleError(
      `The server-resolved lifecycle projection is invalid: ${validation.errors.join(" ")}`,
      409,
      "vendor_lifecycle_projection_invalid",
    );
  }
  assertProjectionMatchesIntent(intent, projection);

  return {
    definition,
    fields: Object.freeze(
      schema.map((field) =>
        Object.freeze({
          label: field.label,
          name: field.name,
          value: projection[field.name],
        }),
      ),
    ) as readonly LiveVendorLifecyclePreviewField[],
    previewHash: hashExecutionPreview(projection),
    projection,
  };
}

function resolveDefinition(
  actionKey: LiveVendorLifecycleActionKey,
): Readonly<ExternalActionDefinition> {
  const definition = MAINTENANCE_EXECUTION_DEFINITION_MAP.get(actionKey);
  if (!definition) {
    throw new LiveVendorLifecycleError(
      "The lifecycle action has no canonical S26 definition.",
      503,
      "vendor_lifecycle_definition_missing",
    );
  }
  return definition;
}

function assertProjectionMatchesIntent(
  intent: LiveVendorLifecycleIntent,
  projection: Readonly<Record<string, string | number | boolean>>,
) {
  const expected: Readonly<Record<string, string>> =
    intent.actionKey === "vendor.account.invite"
      ? {
          reason: intent.reason,
          ticket_ref: intent.ticketId,
          vendor_company: intent.company,
          vendor_email: intent.email,
        }
      : intent.actionKey === "vendor.assignment.change"
        ? {
            assignment_operation: intent.assignmentOperation,
            reason: intent.reason,
            ticket_ref: intent.ticketId,
            vendor_ref: intent.vendorId,
          }
        : {
            reason: intent.reason,
            vendor_ref: intent.vendorId,
          };

  const mismatch = Object.entries(expected).find(
    ([key, value]) => projection[key] !== value,
  );
  if (mismatch) {
    throw new LiveVendorLifecycleError(
      `The server-resolved lifecycle projection did not match the requested ${mismatch[0]}.`,
      409,
      "vendor_lifecycle_source_mismatch",
    );
  }
}

function lifecycleTarget(
  actionKey: LiveVendorLifecycleActionKey,
  projection: Readonly<Record<string, string | number | boolean>>,
) {
  switch (actionKey) {
    case "vendor.account.invite":
      return `${projection.vendor_company} · ${projection.vendor_email} · ticket ${projection.ticket_ref}`;
    case "vendor.assignment.change":
      return `${projection.assignment_operation} ${projection.vendor_company} on ticket ${projection.ticket_ref}`;
    case "vendor.account.disable":
      return `${projection.vendor_company} · ${projection.vendor_email}`;
  }
}

function lifecycleProcessLabel(actionKey: LiveVendorLifecycleActionKey) {
  switch (actionKey) {
    case "vendor.account.invite":
      return "Vendor account invitation";
    case "vendor.assignment.change":
      return "Vendor ticket assignment";
    case "vendor.account.disable":
      return "Vendor account disable";
  }
}

function executionStatus(
  execution: Pick<ActionExecutionRecord, "state">,
): LiveVendorLifecycleExecuted["status"] {
  if (execution.state === "Succeeded") return "succeeded";
  if (execution.state === "Needs reconciliation") return "needs_reconciliation";
  return "failed";
}

function bridgeOptions(deps: LiveVendorLifecycleServiceDeps): ExternalS20BridgeOptions {
  return deps.registry ? { registry: deps.registry } : {};
}
