import type { ExecutionActor, ExecutionApproval } from "@/lib/execution/types";
import type {
  ExecutionTechnicalGates,
  WorkflowCommunicationGates,
} from "@/lib/execution/risk-policy";
import type { DataMode } from "@/lib/data-mode";

export type ExternalExecutionRisk = "Low" | "Medium" | "High";
export type ExternalExecutionState =
  | "ready"
  | "blocked"
  | "running"
  | "succeeded"
  | "not_applicable"
  | "failed"
  | "ambiguous";

export interface ExternalActionDefinition {
  key: string;
  group: string;
  risk: ExternalExecutionRisk;
  dependsOn: readonly string[];
  correction: string;
  requiredContract: "documented" | "vendor_required" | "undocumented";
}

export interface ExternalActionInput {
  /** Missing legacy values resolve to Live; production Test callers must set this explicitly. */
  dataMode?: DataMode;
  workflowId: string;
  actionId: string;
  actionKey: string;
  values: Readonly<Record<string, string | number | boolean>>;
  sourceRefs: readonly string[];
  contractRef?: string;
  connectionRef?: string;
  mappingRef?: string;
  /** Server-constructed authorization context. No route accepts this object from browser JSON. */
  authority?: ExternalAuthorityContext;
}

export interface ExternalAuthorityContext {
  actor: ExecutionActor;
  /** Exact S20 approval; High actions bind this to the current external preview hash. */
  approval?: ExecutionApproval;
  /** Medium actions bind the confirming actor to the current external preview hash. */
  exactConfirmationHash?: string;
  roleScopeAuthorized: boolean;
  /** Server-derived Registry/provider readiness; browser JSON never supplies these gates. */
  technical: ExecutionTechnicalGates;
  /** Server-derived workflow/mailbox/automation facts; exact confirmation is hash-derived. */
  communication?: Omit<WorkflowCommunicationGates, "exactConfirmed">;
  /** S22 checks supplied only after verified-email TOTP and the server-owned assignment join. */
  vendor?: {
    /** Admin support was separately authorized for this exact Vendor/account/ticket context. */
    adminSupportAuthorized?: boolean;
    assignedTicket: boolean;
    sameMailbox: boolean;
    selfConsent: boolean;
    verifiedEmailTotp: boolean;
  };
}

export interface ExternalActionReceipt {
  actionKey: string;
  dataMode?: DataMode;
  /** Test receipts are useful workflow evidence, but can never prove a Live provider. */
  liveEvidenceEligible?: boolean;
  providerRef: string;
  resultHash: string;
  reconciled: boolean;
  outcome?: "succeeded" | "not_applicable";
  createdAt: string;
}

export interface ExternalExecutionRecord {
  id: string;
  dataMode: DataMode;
  workflowId: string;
  actionId: string;
  actionKey: string;
  contextHash: string;
  previewHash: string;
  idempotencyKey: string;
  state: ExternalExecutionState;
  attemptCount: 0 | 1;
  receipt?: ExternalActionReceipt;
  blocker?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalExecutor {
  /**
   * Pure, provider-free validation for action-specific fields. The orchestrator runs this
   * during prepare and again immediately before the atomic claim so malformed or drifted
   * input consumes zero external attempts.
   */
  validate?(input: ExternalActionInput): string | null;
  execute(input: ExternalActionInput): Promise<ExternalActionReceipt>;
  reconcile(input: ExternalActionInput): Promise<ExternalActionReceipt | null>;
  correct?(input: ExternalActionInput, receipt: ExternalActionReceipt): Promise<void>;
}

export interface ExternalExecutionStore {
  /** Production S22 execution requires the durable Firestore implementation. */
  readonly persistence?: "firestore" | "memory";
  get(id: string): Promise<ExternalExecutionRecord | null>;
  create(record: ExternalExecutionRecord): Promise<void>;
  claim(id: string, previewHash: string): Promise<"claimed" | "duplicate" | "blocked">;
  finish(id: string, receipt: ExternalActionReceipt): Promise<void>;
  fail(id: string, ambiguous: boolean): Promise<void>;
}

export class ExternalExecutionError extends Error {
  constructor(
    message: string,
    readonly code:
      | "blocked"
      | "stale_preview"
      | "duplicate"
      | "dependency"
      | "ambiguous"
      | "provider",
  ) {
    super(message);
    this.name = "ExternalExecutionError";
  }
}
