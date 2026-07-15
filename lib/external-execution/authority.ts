import { decideExecutionAuthority } from "@/lib/execution/authority";
import type { ExecutionClassification } from "@/lib/execution/types";
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
) {
  const authority = input.authority;
  if (!authority) return "Server-verified execution authority is required.";
  if (!authority.roleScopeAuthorized)
    return "Actor role or workflow scope is not authorized.";

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
      classification: classification(definition),
      previewHash,
    });
    if (!decision.canExecute) return decision.reason;
  }

  if (definition.risk === "Medium" && authority.exactConfirmationHash !== previewHash) {
    return "Exact human confirmation does not match the current preview.";
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
  if (!vendor?.verifiedEmailTotp)
    return "Verified-email TOTP Vendor context is required.";
  if (VENDOR_MAIL_ACTIONS.has(actionKey) && !vendor.sameMailbox) {
    return "The Vendor mailbox does not match the verified Vendor identity.";
  }
  if (VENDOR_ASSIGNED_TICKET_ACTIONS.has(actionKey) && !vendor.assignedTicket) {
    return "The Vendor is not assigned to this ticket.";
  }
  return null;
}

function classification(definition: ExternalActionDefinition): ExecutionClassification {
  return {
    actionKey: definition.key,
    blockers: [],
    defaultRisk: definition.risk,
    kind:
      definition.risk === "High"
        ? "system_of_record_write"
        : definition.risk === "Medium"
          ? "workflow_communication"
          : "read",
    requiresActionRegistry: true,
    risk: definition.risk,
  };
}
