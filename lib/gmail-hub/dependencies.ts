import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  assertLiveProviderActionAllowed,
  requireEnvironmentDescriptor,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import type { RehearsalStandIn } from "@/lib/environment/rehearsal-stand-in";
import { resolveRehearsalMail } from "@/lib/gmail-hub/rehearsal-mail";
import {
  FirestoreGmailLabelEffectStore,
  type GmailLabelEffectStore,
} from "@/lib/firestore/gmail-label-effects";
import { GmailHubService } from "@/lib/gmail-hub/service";
import {
  FirestoreGmailStateStore,
  type GmailStateStore,
} from "@/lib/gmail-hub/state-store";
import { GmailRuntimeClient } from "@/lib/gmail-runtime/client";
import { createRehearsalStandInGmailClient } from "@/lib/gmail-runtime/rehearsal-stand-in-client";
import { isApprovedWorkflowReplyTemplate } from "@/lib/gmail-hub/governed-artifacts";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
import {
  ActionNotExecutableError,
  assertProductionRuntimeActionExecutable,
} from "@/lib/operations/runtime-suspension-gate";
import { GmailHubError, GmailHubGateError } from "@/lib/gmail-hub/service";

export interface GmailHubRuntimeDependencies {
  createClient(subject: string): GmailRuntimeClient;
  store: GmailStateStore;
  assertEffectEnvironment(): void;
  assertRuntimeActionExecutable(action: string): Promise<void>;
  now?(): number;
  observeSequence?(sequenceId: string): Promise<void>;
  /**
   * S275 R-S275-2: observe every watched or open renewal message of this staff mailbox directly,
   * independent of the mailbox history cursor; each message stands alone.
   */
  checkMailboxSequences?(
    actor: AuthenticatedUser,
    skip: ReadonlySet<string>,
  ): Promise<MailboxSequenceCheck>;
  createToken?(): string;
  workflowLinkTtlDays?: number;
  isApprovedWorkflowTemplate?(context: WorkflowCommunicationContext): boolean;
  labelEffects?: GmailLabelEffectStore;
  dataMode?: "live" | "test";
}

export interface GmailHubEffectEnvironment {
  descriptor: EnvironmentDescriptor;
  dataMode: "live";
}

export interface GmailHubRuntimeFactories {
  constructClient?(subject: string): GmailRuntimeClient;
  createStore?(dataMode: "live"): GmailStateStore;
}

let testDependencies: GmailHubRuntimeDependencies | null = null;

export function setGmailHubDependenciesForTest(
  dependencies: GmailHubRuntimeDependencies | null,
) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Gmail Hub test dependencies require NODE_ENV=test.");
  }
  testDependencies = dependencies;
}

export function getGmailHubDependencies(): GmailHubRuntimeDependencies {
  if (testDependencies) return testDependencies;

  return createGmailHubRuntimeDependencies();
}

export function createGmailHubRuntimeDependencies(
  env: Record<string, string | undefined> = process.env,
  factories: GmailHubRuntimeFactories = {},
): GmailHubRuntimeDependencies {
  // Resolve the server-owned descriptor once for this dependency graph. The same immutable value
  // controls the pre-claim effect fence, provider construction, and whether a terminal state may
  // produce a Live A2 event. Resolution happens before either injected factory can run.
  const environment = resolveGmailHubEffectEnvironment(env);
  // S254: null everywhere except the isolated rehearsal (lib/environment/rehearsal-stand-in.ts).
  const standIn = resolveRehearsalMail(env);
  const assertEffectEnvironment = () =>
    assertGmailEffectEnvironment(environment.descriptor, standIn);
  return {
    createClient: (subject) =>
      createGmailMailboxClient(
        subject,
        environment.descriptor,
        standIn,
        factories.constructClient,
      ),
    store: factories.createStore
      ? factories.createStore(environment.dataMode)
      : createDefaultGmailStateStore(environment.descriptor),
    assertEffectEnvironment,
    assertRuntimeActionExecutable: assertGmailHubRuntimeActionExecutable,
    isApprovedWorkflowTemplate: isApprovedWorkflowReplyTemplate,
    labelEffects: new FirestoreGmailLabelEffectStore(),
    dataMode: environment.dataMode,
    ...createSequenceReplyCheck(),
  };
}

/** S275 R-S275-2: what the direct pass over one mailbox's messages did; counts only. */
export interface MailboxSequenceCheck {
  readonly observed: number;
  readonly notChecked: number;
  readonly ended: number;
}

/**
 * S275 ARCH-S275-2: the one sequence reply check every refresh path receives: the push route, the
 * manual Gmail check and the worker's mailbox sync. `observeSequence` reads one linked message
 * that the mailbox history named (strict: an incomplete read holds the push cursor), and
 * `checkMailboxSequences` reads each watched or open message of the mailbox directly.
 */
export function createSequenceReplyCheck(): Pick<
  GmailHubRuntimeDependencies,
  "observeSequence" | "checkMailboxSequences"
> {
  const service = async () =>
    (await import("./sequence-dependencies")).createCommunicationSequenceService();
  return {
    observeSequence: async (id) => {
      await (await service()).observeAuthorized(id);
    },
    checkMailboxSequences: async (actor, skip) =>
      (await service()).observeMailbox(actor, { skip }),
  };
}

export function resolveGmailHubEffectEnvironment(
  env: Record<string, string | undefined> = process.env,
): GmailHubEffectEnvironment {
  let descriptor: EnvironmentDescriptor;
  try {
    descriptor = requireEnvironmentDescriptor(env);
  } catch (error) {
    throw new GmailHubEnvironmentConfigurationError(
      error instanceof Error ? error.message : "Environment descriptor is invalid.",
    );
  }
  return {
    descriptor,
    dataMode: gmailHubEffectDataMode(descriptor),
  };
}

export function gmailHubEffectDataMode(_descriptor: EnvironmentDescriptor): "live" {
  // S56 retired the persisted Test lane. Every runtime descriptor now selects Live state; the
  // provider-construction and request boundaries still refuse effects outside Production+Live.
  return "live";
}

export function createDefaultGmailStateStore(
  descriptor: EnvironmentDescriptor = requireEnvironmentDescriptor(),
) {
  return new FirestoreGmailStateStore({
    dataMode: gmailHubEffectDataMode(descriptor),
  });
}

/**
 * Refuse Demo and Live-read-only contexts before constructing a real Gmail provider client.
 * The injectable constructor is solely a test seam that proves the ordering.
 */
export function createDescriptorBoundGmailRuntimeClient(
  subject: string,
  descriptor: EnvironmentDescriptor,
  construct: (subject: string) => GmailRuntimeClient = (value) =>
    new GmailRuntimeClient({ subject: value }),
) {
  assertLiveProviderActionAllowed(descriptor);
  return construct(subject);
}

/** True only for the descriptor the isolated rehearsal runs under: Demo with Demo data. */
function ownsRehearsalStandIn(
  descriptor: EnvironmentDescriptor,
  standIn: RehearsalStandIn | null,
): standIn is RehearsalStandIn {
  return (
    standIn !== null &&
    descriptor.environmentKind === "demo" &&
    descriptor.dataContext === "demo"
  );
}

/**
 * The pre-claim effect fence for Gmail. Production with Live data passes. The isolated rehearsal
 * passes because its Demo-owned client can reach its loopback stand-in and nothing else. Every
 * other context is refused exactly as before; a stand-in beside any other descriptor is ignored.
 */
export function assertGmailEffectEnvironment(
  descriptor: EnvironmentDescriptor,
  standIn: RehearsalStandIn | null = null,
) {
  if (ownsRehearsalStandIn(descriptor, standIn)) return;
  assertLiveProviderActionAllowed(descriptor);
}

/**
 * The mailbox client for this process: the rehearsal's stand-in client under Demo with Demo data
 * when a stand-in was resolved, otherwise the descriptor-bound real client, which is refused
 * outside Production with Live data before it is constructed.
 */
export function createGmailMailboxClient(
  subject: string,
  descriptor: EnvironmentDescriptor,
  standIn: RehearsalStandIn | null = null,
  construct?: (subject: string) => GmailRuntimeClient,
) {
  if (ownsRehearsalStandIn(descriptor, standIn))
    return createRehearsalStandInGmailClient(subject, standIn);
  return createDescriptorBoundGmailRuntimeClient(subject, descriptor, construct);
}

export function createGmailHubService(actor: AuthenticatedUser) {
  const dependencies = getGmailHubDependencies();
  return new GmailHubService(actor, {
    createClient: dependencies.createClient,
    store: dependencies.store,
    assertEffectEnvironment: dependencies.assertEffectEnvironment,
    assertRuntimeActionExecutable: dependencies.assertRuntimeActionExecutable,
    // S275 ARCH-S275-2: the manual Gmail check and the worker's mailbox sync pass the sequence
    // reply check, isolated per message, and the manual check reads every watched or open message.
    observeSequence: dependencies.observeSequence,
    checkMailboxSequences: dependencies.checkMailboxSequences,
    now: dependencies.now,
    createToken: dependencies.createToken,
    workflowLinkTtlDays: dependencies.workflowLinkTtlDays,
    isApprovedWorkflowTemplate: dependencies.isApprovedWorkflowTemplate,
    labelEffects: dependencies.labelEffects,
    dataMode: dependencies.dataMode,
  });
}

async function assertGmailHubRuntimeActionExecutable(action: string) {
  try {
    await assertProductionRuntimeActionExecutable(action);
  } catch (error) {
    if (error instanceof ActionNotExecutableError) {
      throw new GmailHubGateError(action);
    }
    throw error;
  }
}

export class GmailHubEnvironmentConfigurationError extends GmailHubError {
  constructor(message: string) {
    super(message, 503);
    this.name = "GmailHubEnvironmentConfigurationError";
  }
}
