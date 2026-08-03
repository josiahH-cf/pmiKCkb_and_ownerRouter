import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  assertLiveProviderActionAllowed,
  requireEnvironmentDescriptor,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";
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
  const assertEffectEnvironment = () =>
    assertLiveProviderActionAllowed(environment.descriptor);
  return {
    createClient: (subject) =>
      createDescriptorBoundGmailRuntimeClient(
        subject,
        environment.descriptor,
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

export function createGmailHubService(actor: AuthenticatedUser) {
  const dependencies = getGmailHubDependencies();
  return new GmailHubService(actor, {
    createClient: dependencies.createClient,
    store: dependencies.store,
    assertEffectEnvironment: dependencies.assertEffectEnvironment,
    assertRuntimeActionExecutable: dependencies.assertRuntimeActionExecutable,
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
