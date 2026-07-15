import { decideExecutionAuthority } from "@/lib/execution/authority";
import {
  classifyExecutionRisk,
  EXECUTION_ACTION_POLICIES,
  type ExecutionActionKey,
} from "@/lib/execution/risk-policy";
import type {
  ExternalActionDefinition,
  ExternalActionInput,
  ExternalAuthorityContext,
} from "@/lib/external-execution/types";

const VENDOR_MAIL_ACTIONS = new Set([
  "vendor.gmail.connect",
  "vendor.gmail.revoke",
  "vendor.gmail.health",
  "vendor.gmail.thread.read",
  "vendor.gmail.draft.create",
  "vendor.gmail.thread.reply",
  "vendor.gmail.label.apply",
]);
const VENDOR_ASSIGNED_TICKET_ACTIONS = new Set([
  "vendor.gmail.thread.read",
  "vendor.gmail.draft.create",
  "vendor.gmail.thread.reply",
  "vendor.gmail.label.apply",
  "google_drive.maintenance_photo.store",
]);
const VENDOR_SELF_CONSENT_ACTIONS = new Set([
  "vendor.gmail.connect",
  "vendor.gmail.revoke",
]);
const VENDOR_ALLOWED_ACTIONS = new Set([
  ...VENDOR_MAIL_ACTIONS,
  "google_drive.maintenance_photo.store",
]);

/**
 * Reuse S20 for internal actors and S22's verified Vendor scope for the narrow external exception.
 * The caller constructs this context after session/scope/assignment checks; browser JSON never does.
 */
export function validateExternalAuthority(
  definition: ExternalActionDefinition,
  input: ExternalActionInput,
  previewHash: string,
  options: { readOnlyReconciliation?: boolean } = {},
) {
  const authority = input.authority;
  if (!authority) return "Server-verified execution authority is required.";
  if (!authority.roleScopeAuthorized)
    return "Actor role or workflow scope is not authorized.";

  const policy = EXECUTION_ACTION_POLICIES[definition.key as ExecutionActionKey];
  if (!policy || policy.defaultRisk !== definition.risk) {
    return "Action risk does not match the immutable S20 policy.";
  }
  const executionClassification = classifyExecutionRisk({
    actionKey: definition.key,
    technical: {
      ...authority.technical,
      // A Registry kill switch prevents new writes but must not strand a consumed,
      // ambiguous attempt. Reconciliation is a separately governed provider read.
      ...(options.readOnlyReconciliation ? { productionAllowed: true } : {}),
      roleScopeAuthorized: authority.roleScopeAuthorized,
    },
    ...(authority.communication
      ? {
          communication: {
            ...authority.communication,
            exactConfirmed: authority.exactConfirmationHash === previewHash,
          },
        }
      : {}),
    ...(policy.kind === "assigned_ticket_photo"
      ? {
          ticketPhoto: {
            appendOnly: input.values.append_only === true,
            assignedTicketFolder:
              input.values.assigned_ticket === true && Boolean(input.mappingRef),
            malwareCheckPassed: input.values.malware_scan_passed === true,
            sensitivityCheckPassed: input.values.sensitivity_scan_passed === true,
            typeAndSizeAllowed:
              typeof input.values.mime_type === "string" &&
              typeof input.values.size_bytes === "number",
          },
        }
      : {}),
  });
  if (executionClassification.risk === "Blocked") {
    return `Execution is blocked: ${executionClassification.blockers.join(", ")}.`;
  }

  const vendorScopeBlocker = validateVendorScope(
    definition.key,
    authority.vendor,
    authority.actor.role,
  );
  if (vendorScopeBlocker) return vendorScopeBlocker;

  if (authority.actor.role === "Vendor") {
    if (!VENDOR_ALLOWED_ACTIONS.has(definition.key)) {
      return "Vendor authority does not include this action.";
    }
    if (definition.risk === "High" && !VENDOR_SELF_CONSENT_ACTIONS.has(definition.key)) {
      return "Vendor authority cannot execute a consequential High action.";
    }
    if (
      VENDOR_SELF_CONSENT_ACTIONS.has(definition.key) &&
      !authority.vendor?.selfConsent
    ) {
      return "Vendor mailbox connect or revoke requires current self-consent.";
    }
  } else {
    if (definition.key === "vendor.gmail.connect") {
      return "Only the verified Vendor may consent to connect their mailbox.";
    }
    const decision = decideExecutionAuthority({
      actor: authority.actor,
      approval: authority.approval,
      classification: executionClassification,
      previewHash,
    });
    if (!decision.canExecute) return decision.reason;
  }

  return null;
}

function validateVendorScope(
  actionKey: string,
  vendor: ExternalAuthorityContext["vendor"],
  actorRole: ExternalAuthorityContext["actor"]["role"],
) {
  const needsVendorScope =
    VENDOR_MAIL_ACTIONS.has(actionKey) ||
    (actorRole === "Vendor" && VENDOR_ASSIGNED_TICKET_ACTIONS.has(actionKey));
  if (!needsVendorScope) return null;
  if (actorRole === "Vendor") {
    if (!vendor?.verifiedEmailTotp)
      return "Verified-email TOTP Vendor context is required.";
    if (VENDOR_MAIL_ACTIONS.has(actionKey) && !vendor.sameMailbox) {
      return "The Vendor mailbox does not match the verified Vendor identity.";
    }
    if (VENDOR_ASSIGNED_TICKET_ACTIONS.has(actionKey) && !vendor.assignedTicket) {
      return "The Vendor is not assigned to this ticket.";
    }
  } else {
    if (!vendor?.adminSupportAuthorized) {
      return "Admin Vendor-mail support is not authorized for this exact context.";
    }
    if (VENDOR_MAIL_ACTIONS.has(actionKey) && !vendor.sameMailbox) {
      return "The stored Vendor mailbox does not match the authorized Vendor connection.";
    }
    if (VENDOR_ASSIGNED_TICKET_ACTIONS.has(actionKey) && !vendor.assignedTicket) {
      return "The Vendor is not assigned to this ticket.";
    }
  }
  return null;
}
