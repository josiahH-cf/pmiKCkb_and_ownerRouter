import type { AuthenticatedUser } from "@/lib/auth/session";
import { GmailHubService } from "@/lib/gmail-hub/service";
import {
  FirestoreGmailStateStore,
  type GmailStateStore,
} from "@/lib/gmail-hub/state-store";
import { GmailRuntimeClient } from "@/lib/gmail-runtime/client";
import { readRequiredGmailPilotUsers } from "@/lib/gmail-runtime/subject";
import { isActionExecutable } from "@/lib/integrations/action-gate";

export interface GmailHubRuntimeDependencies {
  createClient(subject: string): GmailRuntimeClient;
  store: GmailStateStore;
  isActionExecutable(action: string): boolean;
  now?(): number;
  createToken?(): string;
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
      createClient: (subject) =>
        new GmailRuntimeClient({
          subject,
          pilotUsers: readRequiredGmailPilotUsers(),
        }),
      store: new FirestoreGmailStateStore(),
      isActionExecutable,
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
  });
}
