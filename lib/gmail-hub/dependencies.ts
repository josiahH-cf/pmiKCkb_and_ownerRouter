import type { AuthenticatedUser } from "@/lib/auth/session";
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
import { GmailHubGateError } from "@/lib/gmail-hub/service";

export interface GmailHubRuntimeDependencies {
  createClient(subject: string): GmailRuntimeClient;
  store: GmailStateStore;
  assertRuntimeActionExecutable(action: string): Promise<void>;
  now?(): number;
  createToken?(): string;
  workflowLinkTtlDays?: number;
  isApprovedWorkflowTemplate?(context: WorkflowCommunicationContext): boolean;
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
  return (
    testDependencies ?? {
      createClient: (subject) => new GmailRuntimeClient({ subject }),
      store: new FirestoreGmailStateStore(),
      assertRuntimeActionExecutable: assertGmailHubRuntimeActionExecutable,
      isApprovedWorkflowTemplate: isApprovedWorkflowReplyTemplate,
    }
  );
}

export function createGmailHubService(actor: AuthenticatedUser) {
  const dependencies = getGmailHubDependencies();
  return new GmailHubService(actor, {
    createClient: dependencies.createClient,
    store: dependencies.store,
    assertRuntimeActionExecutable: dependencies.assertRuntimeActionExecutable,
    now: dependencies.now,
    createToken: dependencies.createToken,
    workflowLinkTtlDays: dependencies.workflowLinkTtlDays,
    isApprovedWorkflowTemplate: dependencies.isApprovedWorkflowTemplate,
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
