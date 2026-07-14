import type {
  ExecutionActor,
  ExecutionApproval,
  ExecutionAuthorityDecision,
  ExecutionClassification,
} from "@/lib/execution/types";

export interface ExecutionAuthorityInput {
  actor: ExecutionActor;
  approval?: ExecutionApproval;
  classification: ExecutionClassification;
  previewHash: string;
  approverExplicitlyAllowed?: boolean;
}

/** One role/risk decision shared by routes, queue projections, and executors. */
export function decideExecutionAuthority(
  input: ExecutionAuthorityInput,
): ExecutionAuthorityDecision {
  const { actor, classification } = input;

  if (classification.risk === "Blocked") {
    return {
      canExecute: false,
      disposition: "denied",
      reason: `Execution is blocked: ${classification.blockers.join(", ")}.`,
      risk: "Blocked",
    };
  }

  if (actor.role === "Vendor") {
    return {
      canExecute: false,
      disposition: "denied",
      reason: "Vendor authority is defined by S22 and is not granted by S20.",
      risk: classification.risk,
    };
  }

  if (classification.risk === "Low" || classification.risk === "Medium") {
    return {
      canExecute: true,
      disposition: "direct_execution",
      reason: `${actor.role} may directly execute enabled ${classification.risk} work.`,
      risk: classification.risk,
    };
  }

  if (!input.approval) {
    return {
      canExecute: false,
      disposition: "admin_approval_required",
      reason: "A consequential High action requires exact-preview Admin approval.",
      risk: "High",
    };
  }

  const approval = input.approval;
  const approvalRoleAllowed =
    approval.approvedByRole === "Admin" ||
    (approval.approvedByRole === "Approver" && input.approverExplicitlyAllowed === true);

  if (!approvalRoleAllowed) {
    return {
      canExecute: false,
      disposition: "denied",
      reason: "This High action does not have approval from an authorized role.",
      risk: "High",
    };
  }

  if (!approval.reason.trim()) {
    return {
      canExecute: false,
      disposition: "denied",
      reason: "High-risk approval requires a plain-English reason.",
      risk: "High",
    };
  }

  if (approval.previewHash !== input.previewHash) {
    return {
      canExecute: false,
      disposition: "denied",
      reason:
        "The approved preview is stale; review the current preview before execution.",
      risk: "High",
    };
  }

  return {
    canExecute: true,
    disposition: "approved_execution",
    reason: "The exact current preview has authorized High-risk approval.",
    risk: "High",
  };
}
