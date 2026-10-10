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
  record_term_review: {
    label: "Record an app-owned lease term review",
    roleCapability: "edit",
    effect: "app_owned_write",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason: "Editor access is required to record a lease term review.",
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
    // S156/S167: the staff member doing the work records this optional decision alone.
    roleCapability: "edit",
    effect: "app_owned_approval",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason:
      "Editor access is required to record a pricing-suggestion decision.",
    safeNextAction: "Leave the suggestion as shown; no offer is changed.",
  },
  resolve_reconciliation: {
    label: "Resolve a renewal source reconciliation",
    // S156/S167: an Editor records the reconciliation decision; no Approver or Admin handoff.
    roleCapability: "edit",
    effect: "app_owned_approval",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason:
      "Editor access is required to record a source reconciliation decision.",
    safeNextAction: "Leave the item as shown; the sources stay unchanged.",
  },
  approve_source_write: {
    label: "Approve a separately governed source-write proposal",
    // S156/S167: an optional Editor record; it is no longer a prerequisite for a source update.
    roleCapability: "edit",
    effect: "app_owned_approval",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason:
      "Editor access is required to record a source-write proposal decision.",
    safeNextAction: "Leave the proposal queued as shown; no source is changed.",
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
    // S160: ordinary staff confirm a supported source update; the exact keys, the confirmation
    // binding, the one-attempt claim and the verification-account refusal are unchanged.
    roleCapability: "edit",
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
      "Editor access is required to confirm a source update. Ask an Admin to review your role.",
    safeNextAction:
      "Keep the exact preview; a closed action key cannot be overridden by any role.",
  },
  execute_retired_generic_writeback: {
    label: "Recover an effect of the retired generic Sheet writeback route",
    // The retired broad key stays closed in the committed seed, so no role can dispatch a new
    // effect here. Admin authority still reaches effect-free recovery of an earlier attempt.
    roleCapability: "manageAdmin",
    effect: "external_write",
    externalRequirement: "exact_action",
    actionKeys: ["google_sheets.renewal_checklist.writeback"],
    exactConfirmation: true,
    audit: "external_receipt",
    roleDeniedReason:
      "Admin authority is required to recover an effect of the retired generic route.",
    safeNextAction:
      "Use the exact RentVine or operating Sheet update beside the working value.",
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
  approve_message_template: {
    label: "Approve the supplied renewal message publication",
    roleCapability: "approve",
    effect: "app_owned_approval",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason:
      "Approver or Admin access is required to publish the reviewed renewal wording.",
    safeNextAction:
      "Retain preparation and ask an Approver or Admin to review the publication.",
  },
  prepare_filled_artifact: {
    label: "Prepare one exact filled document for review",
    roleCapability: "edit",
    effect: "app_owned_write",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason: "Editor access is required to prepare a filled document.",
    safeNextAction:
      "Read existing output or ask an Editor to prepare current source values.",
  },
  approve_filled_artifact: {
    label: "Approve the exact reviewed filled document",
    // S182: ordinary renewal staff approve the exact lease output they inspected.
    roleCapability: "edit",
    effect: "app_owned_approval",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: true,
    audit: "app_activity",
    roleDeniedReason: "Editor access is required to approve filled output.",
    safeNextAction: "Retain the prepared output for a staff member's exact review.",
  },
  execute_document_packet: {
    label: "Confirm one exact supported document-packet effect",
    // S182/S34: ordinary renewal staff confirm the exact preview themselves. The exact action key,
    // runtime suspension and one-attempt claim still apply; no role opens a closed key.
    roleCapability: "edit",
    effect: "external_write",
    externalRequirement: "exact_action",
    actionKeys: ["dotloop.loop.create_from_template", "dotloop.document.upload"],
    exactConfirmation: true,
    audit: "external_receipt",
    roleDeniedReason: "Editor access is required to confirm a document-packet effect.",
    safeNextAction:
      "Keep the current packet; its exact action key and confirmation still apply.",
  },
  link_dotloop_loop: {
    // S34: staff review an existing loop through the company connection and link it to the lease,
    // or correct the lease's current link. The app's own record changes; no provider write occurs.
    label: "Link a reviewed existing Dotloop loop to a lease or correct its link",
    roleCapability: "edit",
    effect: "app_owned_write",
    externalRequirement: "read_connection",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason:
      "Editor access is required to link or correct a lease's Dotloop loop.",
    safeNextAction: "Keep the current link; a staff member can review and correct it.",
  },
  record_packet_readback: {
    label: "Record exact packet provider readback",
    // S182/S34: staff refresh the linked loop's observation; it never infers signatures.
    roleCapability: "edit",
    effect: "app_owned_write",
    externalRequirement: "read_connection",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason: "Editor access is required to record packet provider readback.",
    safeNextAction:
      "Read the retained evidence or ask a staff member to refresh the provider record.",
  },
  save_work_status: {
    label: "Save the staff work status annotation or a Status log note for one lease",
    roleCapability: "edit",
    effect: "app_owned_write",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason:
      "Editor access is required to save the staff work status or a note.",
    safeNextAction: "Continue read-only or ask an Admin to review your role.",
  },
  save_packet_inputs: {
    // S66: staff enter or correct packet facts, people, animals and charge overrides once. The
    // write is the app's own record; it creates no snapshot, approval or provider action.
    label: "Save renewal packet facts, people, animals or charge overrides for one lease",
    roleCapability: "edit",
    effect: "app_owned_write",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason: "Editor access is required to save packet inputs.",
    safeNextAction: "Continue read-only or ask an Admin to review your role.",
  },
  save_working_record: {
    label: "Save lease-bound working information for one lease",
    roleCapability: "edit",
    effect: "app_owned_write",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason: "Editor access is required to save working information.",
    safeNextAction: "Continue read-only or ask an Admin to review your role.",
  },
  save_pricing_policy: {
    label: "Save reusable renewal pricing and standing owner agreement terms",
    roleCapability: "edit",
    effect: "app_owned_write",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason: "Editor access is required to save renewal pricing terms.",
    safeNextAction: "Continue read-only or ask an Admin to review your role.",
  },
  save_shared_collection: {
    label: "Save a reviewed shared lease collection",
    roleCapability: "edit",
    effect: "app_owned_write",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason: "Editor access is required to save a reviewed lease collection.",
    safeNextAction: "Read the saved collection and its current accessible members.",
  },
  save_desk_preference: {
    label: "Remember the signed-in account's own worklist view",
    roleCapability: "read",
    effect: "app_owned_write",
    externalRequirement: "none",
    actionKeys: [],
    exactConfirmation: false,
    audit: "app_activity",
    roleDeniedReason: "Renewal workspace read access is required to remember a view.",
    safeNextAction: "Use the worklist with its default view.",
  },
  send_renewal_message: {
    label: "Send a reviewed workflow-linked renewal message",
    roleCapability: "sendEmail",
    effect: "external_send",
    externalRequirement: "exact_action",
    actionKeys: ["gmail.renewal_notice.send"],
    exactConfirmation: true,
    audit: "external_receipt",
    roleDeniedReason: "Staff email authority is required to send a renewal message.",
    safeNextAction:
      "Review the exact linked message and managed sender, then Send or Schedule. Dispatch waits for the exact key and durable execution checks.",
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

/**
 * True when this role carries the capability's application authority. Server components use it to
 * choose between a control and its read-only explanation without importing the raw role table.
 */
export function hasRenewalRoleAuthority(key: RenewalCapabilityKey, role: Role): boolean {
  const row: RenewalGovernanceRow = RENEWAL_GOVERNANCE_MATRIX[key];
  return (
    row.externalRequirement !== "permanently_closed" && can(role, row.roleCapability)
  );
}

/** Route-level role refusal with the same reason and safe next action rendered by the UI. */
export function assertRenewalRoleAuthority(key: RenewalCapabilityKey, role: Role): void {
  const row: RenewalGovernanceRow = RENEWAL_GOVERNANCE_MATRIX[key];
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
  const row: RenewalGovernanceRow = RENEWAL_GOVERNANCE_MATRIX[capability];
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
    control: "Record the typed owner response",
    source: "components/lease-renewal/RenewalOwnerOutcomeControl.tsx",
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
    control: "Record or correct the lease term review",
    source: "components/lease-renewal/LeaseTermReviewControl.tsx",
    capability: "record_term_review",
    enforcementSources: ["app/api/lease-renewal/term-review/route.ts"],
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
    control: "Recover an already-attempted legacy draft with its original inputs",
    source: "components/lease-renewal/RenewalNoticeDraftComposer.tsx",
    capability: "draft_create",
    enforcementSources: ["app/api/lease-renewal/renewal-notice-draft/route.ts"],
  },
  {
    control: "Record reviewed notice evidence or reviewed withdrawal",
    source: "components/lease-renewal/RenewalNoticeReview.tsx",
    capability: "save_renewal_progress",
    enforcementSources: ["app/api/lease-renewal/notice-review/route.ts"],
  },
  {
    control: "Record actual staff work",
    source: "components/lease-renewal/RenewalManualWorkspace.tsx",
    capability: "save_renewal_progress",
    enforcementSources: ["app/api/lease-renewal/workspace/route.ts"],
  },
  {
    control: "Prepare filled output from reviewed source values",
    source: "components/lease-renewal/FilledArtifactPanel.tsx",
    capability: "prepare_filled_artifact",
    enforcementSources: ["app/api/lease-renewal/filled-artifact/route.ts"],
  },
  {
    control: "Approve exact filled output",
    source: "components/lease-renewal/FilledArtifactPanel.tsx",
    capability: "approve_filled_artifact",
    enforcementSources: ["app/api/lease-renewal/filled-artifact/route.ts"],
  },
  {
    control: "Save a correction proposal",
    source: "components/lease-renewal/RenewalCorrections.tsx",
    capability: "record_discrepancy_disposition",
    enforcementSources: ["app/api/lease-renewal/correction-review/route.ts"],
  },
  {
    control: "Edit the owner or tenant message and create its unsent Gmail draft",
    source: "components/lease-renewal/RenewalMessagePreparation.tsx",
    capability: "draft_create",
    enforcementSources: ["app/api/lease-renewal/message-preparation/route.ts"],
  },
  {
    control: "Save reviewed resource location",
    source: "components/lease-renewal/RenewalResourceLocations.tsx",
    capability: "manage_renewal_configuration",
    enforcementSources: ["app/api/lease-renewal/resource-locations/route.ts"],
  },
  {
    control: "Confirm exact document packet effect",
    source: "components/lease-renewal/RenewalDocumentHandoff.tsx",
    capability: "execute_document_packet",
    enforcementSources: ["app/api/lease-renewal/document-handoff/route.ts"],
  },
  {
    control: "Review and link an existing Dotloop loop, or correct the lease's loop link",
    source: "components/lease-renewal/RenewalDocumentHandoff.tsx",
    capability: "link_dotloop_loop",
    enforcementSources: ["app/api/lease-renewal/document-handoff/route.ts"],
  },
  {
    control: "Refresh the linked Dotloop loop",
    source: "components/lease-renewal/RenewalDocumentHandoff.tsx",
    capability: "record_packet_readback",
    enforcementSources: ["app/api/lease-renewal/document-handoff/route.ts"],
  },
  {
    control: "Save the staff work status",
    source: "components/lease-renewal/RenewalWorkStatusControl.tsx",
    capability: "save_work_status",
    enforcementSources: ["app/api/lease-renewal/work-status/route.ts"],
  },
  {
    control: "Save a status note",
    source: "components/lease-renewal/RenewalWorkStatusControl.tsx",
    capability: "save_work_status",
    enforcementSources: ["app/api/lease-renewal/work-status/route.ts"],
  },
  {
    control: "Save a working value or working renewal term",
    source: "components/lease-renewal/RenewalWorkingRecord.tsx",
    capability: "save_working_record",
    enforcementSources: ["app/api/lease-renewal/working-record/route.ts"],
  },
  {
    control: "Save packet facts, people and signer roles, animals or a charge override",
    source: "components/lease-renewal/PacketInputsEditor.tsx",
    capability: "save_packet_inputs",
    enforcementSources: ["app/api/lease-renewal/packet-inputs/route.ts"],
  },
  {
    control: "Remember the account's worklist view",
    source: "components/lease-renewal/RenewalDeskViewMemory.tsx",
    capability: "save_desk_preference",
    enforcementSources: ["app/api/lease-renewal/desk-preferences/route.ts"],
  },
  {
    // S158: the selected operating-Sheet row or cell is a working-record field; the read of that
    // location goes through the operating-sheet route's GET under read_workspace.
    control: "Select the operating Sheet row or cell the app reads for this lease",
    source: "components/lease-renewal/OperatingSheetLookup.tsx",
    capability: "save_working_record",
    enforcementSources: ["app/api/lease-renewal/working-record/route.ts"],
  },
] as const satisfies readonly RenewalControlInventoryEntry[];

/** Ordered, source-addressable inventory used to make page/API drift mechanically visible. */
export const RENEWAL_ROUTE_INVENTORY = [
  {
    kind: "page",
    source: "app/lease-renewal/collections/page.tsx",
    capability: "read_workspace",
  },
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
    kind: "api",
    source: "app/api/lease-renewal/rentvine-writeback/route.ts",
    method: "GET",
    capability: "read_workspace",
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
    source: "app/api/lease-renewal/operating-sheet/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/term-review/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/term-review/route.ts",
    method: "POST",
    capability: "record_term_review",
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
    capability: "execute_retired_generic_writeback",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/correction-review/route.ts",
    method: "POST",
    capability: "record_discrepancy_disposition",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/document-artifact/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/document-handoff/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/document-handoff/route.ts",
    method: "POST",
    capability: "execute_document_packet",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/message-attachment/route.ts",
    method: "GET",
    capability: "screenshot_store",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/message-preparation/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/message-preparation/route.ts",
    method: "POST",
    capability: "approve_message_template",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/resource-locations/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/resource-locations/route.ts",
    method: "POST",
    capability: "manage_renewal_configuration",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/workspace/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/workspace/route.ts",
    method: "POST",
    capability: "save_renewal_progress",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/notice-review/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/notice-review/route.ts",
    method: "POST",
    capability: "save_renewal_progress",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/filled-artifact/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/filled-artifact/route.ts",
    method: "POST",
    capability: "approve_filled_artifact",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/work-status/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/work-status/route.ts",
    method: "POST",
    capability: "save_work_status",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/working-record/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/working-record/route.ts",
    method: "POST",
    capability: "save_working_record",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/packet-inputs/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/packet-inputs/route.ts",
    method: "POST",
    capability: "save_packet_inputs",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/desk-preferences/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/desk-admission/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/lease-renewal/live/desk/lease/[leaseId]/rentvine/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/desk-preferences/route.ts",
    method: "POST",
    capability: "save_desk_preference",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/pricing-policy/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/pricing-policy/route.ts",
    method: "POST",
    capability: "save_pricing_policy",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/collections/route.ts",
    method: "GET",
    capability: "read_workspace",
  },
  {
    kind: "api",
    source: "app/api/lease-renewal/collections/route.ts",
    method: "POST",
    capability: "save_shared_collection",
  },
] as const satisfies readonly RenewalRouteInventoryEntry[];
