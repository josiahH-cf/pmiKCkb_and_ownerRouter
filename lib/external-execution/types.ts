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
  workflowId: string;
  actionId: string;
  actionKey: string;
  values: Readonly<Record<string, string | number | boolean>>;
  sourceRefs: readonly string[];
  contractRef?: string;
  connectionRef?: string;
  mappingRef?: string;
  exactConfirmationHash?: string;
  approvedByUid?: string;
}

export interface ExternalActionReceipt {
  actionKey: string;
  providerRef: string;
  resultHash: string;
  reconciled: boolean;
  outcome?: "succeeded" | "not_applicable";
  createdAt: string;
}

export interface ExternalExecutionRecord {
  id: string;
  workflowId: string;
  actionId: string;
  actionKey: string;
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
  execute(input: ExternalActionInput): Promise<ExternalActionReceipt>;
  reconcile(input: ExternalActionInput): Promise<ExternalActionReceipt | null>;
  correct?(input: ExternalActionInput, receipt: ExternalActionReceipt): Promise<void>;
}

export interface ExternalExecutionStore {
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
