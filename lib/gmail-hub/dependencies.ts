import type { AuthenticatedUser } from "@/lib/auth/session";
import { GmailHubService } from "@/lib/gmail-hub/service";
import {
  FirestoreGmailStateStore,
  type GmailStateStore,
} from "@/lib/gmail-hub/state-store";
import { GmailRuntimeClient } from "@/lib/gmail-runtime/client";
import { isApprovedWorkflowReplyTemplate } from "@/lib/gmail-hub/governed-artifacts";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
import { isActionExecutable } from "@/lib/integrations/action-gate";

export interface GmailHubRuntimeDependencies {
  createClient(subject: string): GmailRuntimeClient;
  store: GmailStateStore;
  isActionExecutable(action: string): boolean;
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
      isActionExecutable,
      workflowLinkTtlDays: parseWorkflowLinkTtlDays(
        process.env.GMAIL_WORKFLOW_LINK_TTL_DAYS,
      ),
      isApprovedWorkflowTemplate: isApprovedWorkflowReplyTemplate,
    }
  );
}

export function createGmailHubService(actor: AuthenticatedUser) {
  const dependencies = getGmailHubDependencies();
  return new GmailHubService(actor, {
    client: dependencies.createClient(actor.email),
    store: dependencies.store,
    isActionExecutable: dependencies.isActionExecutable,
    now: dependencies.now,
    createToken: dependencies.createToken,
    workflowLinkTtlDays: dependencies.workflowLinkTtlDays,
    isApprovedWorkflowTemplate: dependencies.isApprovedWorkflowTemplate,
  });
}

function parseWorkflowLinkTtlDays(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 3_650 ? parsed : undefined;
}
