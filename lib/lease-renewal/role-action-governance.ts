import { can, type Capability, type Role } from "@/lib/auth/roles";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";

export type RenewalEffectKind =
  | "source_read"
  | "app_owned_write"
  | "app_owned_approval"
  | "provider_read"
  | "model_assistance"
  | "external_draft"
  | "external_write"
  | "external_rollback"
  | "administration"
  | "external_send";

export type RenewalExternalRequirement =
  | "none"
  | "read_connection"
  | "exact_action"
  | "permanently_closed";

export interface RenewalGovernanceRow {
  label: string;
  roleCapability: Capability;
  effect: RenewalEffectKind;
  externalRequirement: RenewalExternalRequirement;
  actionKeys: readonly string[];
  exactConfirmation: boolean;
  audit: "read_only" | "app_activity" | "external_receipt";
  roleDeniedReason: string;
  safeNextAction: string;
}

/**
 * S80's single role/effect contract. A role capability answers only the application-authority
 * question. Exact Action Registry state, runtime suspension, quota, and confirmation are evaluated
 * independently and can never be inferred from a role.
 */
export const RENEWAL_GOVERNANCE_MATRIX = {
  read_workspace: {
    label: "Read the canonical renewal desk and source-backed facts",
    roleCapability: "read",
    effect: "source_read",
    externalRequirement: "read_connection",
    actionKeys: [],
    exactConfirmation: false,
    audit: "read_only",
    roleDeniedReason: "Renewal workspace read access is required.",
    safeNextAction: "Ask an Admin to review Renewals Space access.",
  },
  save_navigation_progress: {
    label: "Save value-free renewal navigation progress",
    roleCapability: "edit",
    effect: "app_owned_write",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason: "Editor access is required to save renewal progress.",
    safeNextAction: "Continue read-only or ask an Admin to review your role.",
  },
  record_discrepancy_disposition: {
    label: "Record an app-owned discrepancy disposition",
    roleCapability: "edit",
    effect: "app_owned_write",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason: "Editor access is required to record a discrepancy disposition.",
    safeNextAction: "Continue read-only or ask an Admin to review your role.",
  },
  manage_follow_up_attention: {
    label: "Dismiss or reopen one exact renewal follow-up attention item",
    roleCapability: "edit",
    effect: "app_owned_write",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason: "Editor access is required to change renewal follow-up attention.",
    safeNextAction: "Continue read-only or ask an Admin to review your role.",
  },
  save_packet_truth: {
    label: "Save app-owned packet-truth progress",
    roleCapability: "edit",
    effect: "app_owned_write",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason: "Editor access is required to save packet-truth progress.",
    safeNextAction: "Continue read-only or ask an Admin to review your role.",
  },
  refresh_source_facts: {
    label: "Refresh connected renewal source facts",
    roleCapability: "edit",
    effect: "source_read",
    externalRequirement: "read_connection",
    actionKeys: [],
    exactConfirmation: false,
    audit: "read_only",
    roleDeniedReason: "Editor access is required to refresh renewal source facts.",
    safeNextAction:
      "Continue with the last labeled snapshot or ask an Admin to review access.",
  },
  save_renewal_progress: {
    label: "Record owner direction and app-owned renewal progress",
    roleCapability: "edit",
    effect: "app_owned_write",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason: "Editor access is required to record owner direction.",
    safeNextAction: "Continue read-only or ask an Admin to review your role.",
  },
  request_reference_comps: {
    label: "Request reference RentCast comps",
    roleCapability: "edit",
    effect: "provider_read",
    externalRequirement: "exact_action",
    actionKeys: ["rentcast.rental_listings.search"],
    exactConfirmation: false,
    audit: "external_receipt",
    roleDeniedReason: "Editor access is required to request reference comps.",
    safeNextAction:
      "Enter a clearly labeled manual basis or ask an Admin to review readiness.",
  },
  approve_pricing_suggestion: {
    label: "Approve a comp-derived pricing suggestion",
    roleCapability: "manageAdmin",
    effect: "app_owned_approval",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason:
      "Admin authority is required to approve a comp-derived pricing suggestion.",
    safeNextAction: "Leave the suggestion pending for Admin review; no offer is changed.",
  },
  resolve_reconciliation: {
    label: "Resolve a renewal source reconciliation",
    roleCapability: "approve",
    effect: "app_owned_approval",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason: "Approver or Admin authority is required to resolve source facts.",
    safeNextAction: "Defer the item and leave it for an Approver or Admin.",
  },
  approve_source_write: {
    label: "Approve a separately governed source-write proposal",
    roleCapability: "manageAdmin",
    effect: "app_owned_approval",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason: "Admin authority is required to approve a source-write proposal.",
    safeNextAction: "Leave the proposal queued for Admin review; no source is changed.",
  },
  propose_source_write: {
    label: "Assemble and save one typed RentVine update proposal",
    roleCapability: "edit",
    effect: "app_owned_write",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason: "Editor access is required to save a RentVine update proposal.",
    safeNextAction:
      "Review the current lease facts read-only, or request Renewals access via the request workflow.",
  },
  execute_source_write: {
    label: "Execute an exact-confirmed renewal source write",
    roleCapability: "manageAdmin",
    effect: "external_write",
    externalRequirement: "exact_action",
    // S97: the exact successor keys replace the retired broad writeback identifier.
    // S98: the exact Sheet successor keys replace the retired broad writeback identifier.
    actionKeys: [
      "rentvine.lease.renewal_dates.update",
      "rentvine.lease.recurring_charge.update",
      "rentvine.lease.recurring_charge.create",
      "google_sheets.renewal_checklist.row_append",
      "google_sheets.renewal_checklist.field_update",
    ],
    exactConfirmation: true,
    audit: "external_receipt",
    roleDeniedReason:
      "Admin authority is required before a source write can be reviewed.",
    safeNextAction:
      "Keep the exact dry preview; a closed action key cannot be overridden by any role.",
  },
  draft_create: {
    label: "Preview and exact-confirm one unsent renewal Gmail draft",
    roleCapability: "edit",
    effect: "external_draft",
    externalRequirement: "exact_action",
    actionKeys: ["gmail.renewal_notice.draft_create"],
    exactConfirmation: true,
    audit: "external_receipt",
    roleDeniedReason: "Editor access is required to create an unsent renewal draft.",
    safeNextAction:
      "Keep the preview unchanged or ask an Admin to review exact action readiness.",
  },
  tailor_copy: {
    label: "Tailor approved renewal copy without changing locked facts",
    roleCapability: "edit",
    effect: "model_assistance",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "read_only",
    roleDeniedReason: "Editor access is required to tailor renewal copy.",
    safeNextAction:
      "Keep the deterministic approved wording or ask an Admin to review your role.",
  },
  screenshot_store: {
    label: "Store one exact-confirmed comp screenshot",
    roleCapability: "edit",
    effect: "external_write",
    externalRequirement: "exact_action",
    actionKeys: ["google_drive.renewal_comp_screenshot.store"],
    exactConfirmation: true,
    audit: "external_receipt",
    roleDeniedReason: "Editor access is required before a screenshot can be reviewed.",
    safeNextAction:
      "Keep the screenshot local; a closed action key cannot be overridden by any role.",
  },
  screenshot_rollback: {
    label: "Rollback one receipted comp screenshot",
    roleCapability: "manageAdmin",
    effect: "external_rollback",
    externalRequirement: "exact_action",
    actionKeys: ["google_drive.renewal_comp_screenshot.store"],
    exactConfirmation: true,
    audit: "external_receipt",
    roleDeniedReason: "Admin authority is required to review a screenshot rollback.",
    safeNextAction: "Preserve the receipt and ask an Admin to review the exact rollback.",
  },
  manage_renewal_configuration: {
    label: "Manage renewal policy, users, connections, suspensions, and gates",
    roleCapability: "manageAdmin",
    effect: "administration",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason: "Admin authority is required to manage renewal configuration.",
    safeNextAction:
      "Continue ordinary renewal work and ask an Admin to review configuration.",
  },
  send_renewal_message: {
    label: "Send a renewal message from the application",
    roleCapability: "read",
    effect: "external_send",
    externalRequirement: "permanently_closed",
    actionKeys: ["gmail.renewal_notice.send", "gmail.message.send"],
    exactConfirmation: true,
    audit: "external_receipt",
    roleDeniedReason: "The application never sends renewal messages for any role.",
    safeNextAction: "Create an unsent draft, review it in Gmail, and send from Gmail.",
  },
} as const satisfies Record<string, RenewalGovernanceRow>;

export type RenewalCapabilityKey = keyof typeof RENEWAL_GOVERNANCE_MATRIX;

export type RenewalExternalState =
  | "unchecked"
  | "ready"
  | "closed"
  | "suspended"
  | "quota_exhausted";

export type RenewalAuthorityDecisionCode =
  | "allowed"
  | "unmanaged_identity"
  | "missing_space"
  | "insufficient_role"
  | "external_check_required"
  | "action_closed"
  | "action_suspended"
  | "quota_exhausted"
  | "confirmation_required"
  | "permanently_forbidden";

export interface RenewalAuthorityContext {
  role: Role;
  managedIdentity: boolean;
  hasRenewalsSpace: boolean;
  externalState?: RenewalExternalState;
  exactConfirmation?: boolean;
}

export interface RenewalAuthorityDecision {
  capability: RenewalCapabilityKey;
  code: RenewalAuthorityDecisionCode;
  roleEligible: boolean;
  mayBegin: boolean;
  effectConstructable: boolean;
  reason: string;
  safeNextAction: string;
}

export function renewalRoleCapability(key: RenewalCapabilityKey): Capability {
  return RENEWAL_GOVERNANCE_MATRIX[key].roleCapability;
}

/** Route-level role refusal with the same reason and safe next action rendered by the UI. */
export function assertRenewalRoleAuthority(key: RenewalCapabilityKey, role: Role): void {
  const row = RENEWAL_GOVERNANCE_MATRIX[key];
  if (row.externalRequirement === "permanently_closed") {
    throw new EditableLayerError(`${row.roleDeniedReason} ${row.safeNextAction}`, 403);
  }
  if (!can(role, row.roleCapability)) {
    throw new EditableLayerError(`${row.roleDeniedReason} ${row.safeNextAction}`, 403);
  }
}

/** Pure, fail-closed projection used by controls and adversarial privilege tests. */
export function evaluateRenewalAuthority(
  capability: RenewalCapabilityKey,
  context: RenewalAuthorityContext,
): RenewalAuthorityDecision {
  const row = RENEWAL_GOVERNANCE_MATRIX[capability];
  const deny = (
    code: Exclude<RenewalAuthorityDecisionCode, "allowed">,
    reason: string,
    roleEligible = false,
  ): RenewalAuthorityDecision => ({
    capability,
    code,
    roleEligible,
    mayBegin: false,
    effectConstructable: false,
    reason,
    safeNextAction: row.safeNextAction,
  });

  if (!context.managedIdentity) {
    return deny(
      "unmanaged_identity",
      "A managed pmikcmetro.com or project-service identity is required.",
    );
  }
  if (!context.hasRenewalsSpace) {
    return deny("missing_space", "Renewals Space access is required.");
  }
  if (row.externalRequirement === "permanently_closed") {
    return deny("permanently_forbidden", row.roleDeniedReason);
  }
  if (!can(context.role, row.roleCapability)) {
    return deny("insufficient_role", row.roleDeniedReason);
  }

  if (row.externalRequirement === "exact_action") {
    const externalState = context.externalState ?? "unchecked";
    if (externalState === "unchecked") {
      return deny(
        "external_check_required",
        "Role and Space checks passed; the exact action key, runtime suspension, and provider readiness must still pass.",
        true,
      );
    }
    if (externalState === "closed") {
      return deny(
        "action_closed",
        "The exact action key is closed; no role can override it.",
        true,
      );
    }
    if (externalState === "suspended") {
      return deny(
        "action_suspended",
        "The exact action is runtime-suspended; no effect may be constructed.",
        true,
      );
    }
    if (externalState === "quota_exhausted") {
      return deny(
        "quota_exhausted",
        "The measured provider allowance is exhausted; no provider request may be constructed.",
        true,
      );
    }
    if (row.exactConfirmation && context.exactConfirmation !== true) {
      return deny(
        "confirmation_required",
        "The exact preview must be confirmed before the effect is constructed.",
        true,
      );
    }
  }

  return {
    capability,
    code: "allowed",
    roleEligible: true,
    mayBegin: true,
    effectConstructable: true,
    reason: "Role, Space, and supplied external checks allow this exact operation.",
    safeNextAction: row.safeNextAction,
  };
}

export interface RenewalRouteInventoryEntry {
  kind: "page" | "api";
  source: string;
  method?: "GET" | "POST";
  capability: RenewalCapabilityKey;
}

export interface RenewalControlInventoryEntry {
  control: string;
  source: string;
  capability: RenewalCapabilityKey;
  enforcementSources: readonly string[];
}

/** Controls are listed separately because several client components share one guarded API method. */
export const RENEWAL_CONTROL_INVENTORY = [
  {
    control: "Refresh source facts",
    source: "components/lease-renewal/RenewalDeskRefresh.tsx",
    capability: "refresh_source_facts",
    enforcementSources: ["app/api/lease-renewal/refresh/route.ts"],
  },
  {
    control: "Record owner direction",
    source: "components/lease-renewal/RenewalProgressControls.tsx",
    capability: "save_renewal_progress",
    enforcementSources: ["app/api/lease-renewal/renewal-progress/route.ts"],
  },
  {
    control: "Dismiss or reopen exact follow-up attention",
    source: "components/lease-renewal/RenewalFollowUpAttentionControl.tsx",
    capability: "manage_follow_up_attention",
    enforcementSources: ["app/api/lease-renewal/follow-up-attention/route.ts"],
  },
  {
    control: "Request reference comps",
    source: "components/lease-renewal/RenewalProgressControls.tsx",
    capability: "request_reference_comps",
    enforcementSources: ["app/api/lease-renewal/market-comps/route.ts"],
  },
  {
    control: "Store comp screenshot",
    source: "components/lease-renewal/RenewalProgressControls.tsx",
    capability: "screenshot_store",
    enforcementSources: ["app/api/lease-renewal/comp-screenshot/route.ts"],
  },
  {
    control: "Approve pricing suggestion",
    source: "components/lease-renewal/RentSuggestionApproval.tsx",
    capability: "approve_pricing_suggestion",
    enforcementSources: ["app/api/lease-renewal/rent-suggestion/route.ts"],
  },
  {
    control: "Resolve source reconciliation",
    source: "components/lease-renewal/RenewalDeciderCard.tsx",
    capability: "resolve_reconciliation",
    enforcementSources: [
      "app/lease-renewal/live/page.tsx",
      "app/api/lease-renewal/resolve/route.ts",
    ],
  },
  {
    control: "Approve source-write proposal",
    source: "components/lease-renewal/flag-actions.tsx",
    capability: "approve_source_write",
    enforcementSources: [
      "app/lease-renewal/live/page.tsx",
      "app/api/lease-renewal/writeback-approvals/route.ts",
    ],
  },
  {
    control: "Request constrained renewal-copy assistance",
    source: "components/lease-renewal/RenewalNoticeDraftComposer.tsx",
    capability: "tailor_copy",
    enforcementSources: ["app/api/lease-renewal/renewal-copy-assist/route.ts"],
  },
  {
    control: "Preview and create unsent Gmail draft",
    source: "components/lease-renewal/RenewalNoticeDraftComposer.tsx",
    capability: "draft_create",
    enforcementSources: ["app/api/lease-renewal/renewal-notice-draft/route.ts"],
  },
] as const satisfies readonly RenewalControlInventoryEntry[];

/** Ordered, source-addressable inventory used to make page/API drift mechanically visible. */
export const RENEWAL_ROUTE_INVENTORY = [
  { kind: "page", source: "app/lease-renewal/page.tsx", capability: "read_workspace" },
  {
    kind: "page",
    source: "app/lease-renewal/lease/[leaseId]/page.tsx",
    capability: "read_workspace",
  },
  {
    kind: "page",
    source: "app/lease-renewal/live/page.tsx",
    capability: "read_workspace",
  },
  {
    kind: "page",
    source: "app/lease-renewal/live/desk/page.tsx",
    capability: "read_workspace",
  },
  {
    kind: "page",
    source: "app/lease-renewal/live/desk/lease/[leaseId]/page.tsx",
    capability: "read_workspace",
  },
  {
    kind: "page",
    source: "app/lease-renewal/live/notices/page.tsx",
    capability: "read_workspace",
  },
  {
    kind: "page",
    source: "app/lease-renewal/property/[propertyKey]/page.tsx",
    capability: "read_workspace",
  },
  {
    kind: "page",
    source: "app/lease-renewal/runs/page.tsx",
    capability: "read_workspace",
  },
  {
    kind: "page",
    source: "app/lease-renewal/runs/[runId]/page.tsx",
    capability: "read_workspace",
  },
  {
    kind: "page",
    source: "app/lease-renewal/runs/[runId]/reconciliation/[fieldKey]/page.tsx",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/comp-screenshot/route.ts",
    method: "GET",
    capability: "screenshot_store",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/comp-screenshot/route.ts",
    method: "POST",
    capability: "screenshot_store",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/comp-screenshot/rollback/route.ts",
    method: "POST",
    capability: "screenshot_rollback",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/decider-progress/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/decider-progress/route.ts",
    method: "POST",
    capability: "save_navigation_progress",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/discrepancy-dispositions/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/discrepancy-dispositions/route.ts",
    method: "POST",
    capability: "record_discrepancy_disposition",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/follow-up-attention/route.ts",
    method: "POST",
    capability: "manage_follow_up_attention",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/market-comps/route.ts",
    method: "POST",
    capability: "request_reference_comps",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/packet-truth/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/packet-truth/route.ts",
    method: "POST",
    capability: "save_packet_truth",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/refresh/route.ts",
    method: "POST",
    capability: "refresh_source_facts",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/renewal-copy-assist/route.ts",
    method: "POST",
    capability: "tailor_copy",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/renewal-notice-draft/route.ts",
    method: "POST",
    capability: "draft_create",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/renewal-progress/route.ts",
    method: "POST",
    capability: "save_renewal_progress",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/rent-suggestion/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/rent-suggestion/route.ts",
    method: "POST",
    capability: "approve_pricing_suggestion",
  },
  {
    // S97: Editors propose/discard under propose_source_write inside the handler; the declared
    // row carries the route's maximum authority — executing one exact-confirmed source write.
    kind: "api",
    source: "app/api/lease-renewal/rentvine-writeback/route.ts",
    method: "POST",
    capability: "execute_source_write",
  },
  {
    // S98: Editors propose/discard under propose_source_write inside the handler; the declared
    // row carries the route's maximum authority.
    kind: "api",
    source: "app/api/lease-renewal/operating-sheet/route.ts",
    method: "POST",
    capability: "execute_source_write",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/resolve/route.ts",
    method: "POST",
    capability: "resolve_reconciliation",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/writeback-approvals/bulk/route.ts",
    method: "POST",
    capability: "approve_source_write",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/writeback-approvals/route.ts",
    method: "POST",
    capability: "approve_source_write",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/writeback-execute/route.ts",
    method: "POST",
    capability: "execute_source_write",
  },
] as const satisfies readonly RenewalRouteInventoryEntry[];
