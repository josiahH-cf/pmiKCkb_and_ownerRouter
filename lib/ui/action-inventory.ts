export type S86ActionTier = "A" | "B" | "C";
export type S86InventoryMode = "presentation" | "preservation-only";

export interface S86ActionInventoryEntry {
  id: string;
  tier: S86ActionTier;
  mode: S86InventoryMode;
  owner: string;
  components: readonly string[];
  confirmation: string;
  recovery: string;
}

// This is a closed presentation inventory, not an authority registry. It cannot grant a role,
// action key, route, provider operation, or retry. Owning services remain the only effect boundary.
export const S86_ACTION_INVENTORY = [
  {
    id: "connector.disconnect",
    tier: "C",
    mode: "preservation-only",
    owner: "S96",
    components: ["components/connections/ConnectorSetupActions.tsx"],
    confirmation: "Preserve S96's exact connector phrase and cancel-first dialog.",
    recovery: "Preserve versioned pending recovery and the verified redacted receipt.",
  },
  {
    id: "template.retire",
    tier: "B",
    mode: "presentation",
    owner: "S86",
    components: ["components/spaces/SpaceDetailClient.tsx"],
    confirmation: "Name the exact template and Space before the existing soft delete.",
    recovery: "Do not offer Undo because no exact restore boundary is evidenced.",
  },
  {
    id: "approval.high_risk.single",
    tier: "C",
    mode: "presentation",
    owner: "Approval Queue",
    components: ["components/approval/ApprovalQueue.tsx"],
    confirmation: "Show the exact item, High risk, action, and entered reason.",
    recovery: "Keep server confirmation and authoritative result readback unchanged.",
  },
  {
    id: "approval.high_risk.bulk",
    tier: "C",
    mode: "presentation",
    owner: "Approval Queue",
    components: ["components/approval/ApprovalQueue.tsx"],
    confirmation: "Show exact selected, High-risk, action, and reason counts.",
    recovery: "Keep every partial result visible and do not blindly replay failures.",
  },
  {
    id: "admin.user.role_change",
    tier: "C",
    mode: "presentation",
    owner: "S83",
    components: ["components/admin/UserManagementPanel.tsx"],
    confirmation: "Show exact user, current role, proposed role, and reason.",
    recovery: "Preserve the existing claim mutation and returned user readback.",
  },
  {
    id: "admin.user.space_scope_change",
    tier: "C",
    mode: "presentation",
    owner: "S83",
    components: ["components/admin/UserManagementPanel.tsx"],
    confirmation: "Show exact user, current Spaces, proposed Spaces, and reason.",
    recovery: "Preserve the existing exact scope mutation and returned user readback.",
  },
  {
    id: "publication.policy.disable",
    tier: "B",
    mode: "presentation",
    owner: "Publication policy",
    components: ["components/admin/PublicationPolicyAdminPanel.tsx"],
    confirmation: "Name the exact policy and require a reason.",
    recovery: "Preserve disabled-state audit and returned policy readback.",
  },
  {
    id: "maintenance.intake.dismiss",
    tier: "B",
    mode: "presentation",
    owner: "Maintenance",
    components: ["components/maintenance/UnverifiedIntakeReview.tsx"],
    confirmation: "Name the exact intake and require a reason.",
    recovery: "Keep a failed row visible and permit an explicit safe retry.",
  },
  {
    id: "maintenance.intake.promote",
    tier: "B",
    mode: "presentation",
    owner: "Maintenance",
    components: ["components/maintenance/UnverifiedIntakeReview.tsx"],
    confirmation: "Use one explicit activation with no second confirmation.",
    recovery:
      "Show pending and the returned Live app-ticket result without provider claims.",
  },
  {
    id: "maintenance.ticket.close_or_reopen",
    tier: "B",
    mode: "presentation",
    owner: "Maintenance",
    components: ["components/maintenance/MaintenanceQueue.tsx"],
    confirmation: "Name the exact ticket, current/next status, and require a reason.",
    recovery: "Keep the current PATCH boundary and returned-ticket readback.",
  },
  {
    id: "notification.mark_all_or_mute",
    tier: "B",
    mode: "presentation",
    owner: "S86",
    components: ["components/layout/NotificationMenu.tsx"],
    confirmation: "No confirmation; prevent duplicate mutation dispatch.",
    recovery: "Show failed response with explicit retry or refresh reconciliation.",
  },
  {
    id: "exact_preview.controls.preserve",
    tier: "C",
    mode: "preservation-only",
    owner: "Owning suites and services",
    components: [
      "components/connections/ConnectorSetupActions.tsx",
      "components/approval/ApprovalQueue.tsx",
    ],
    confirmation:
      "Do not replace existing exact preview, expiry, or confirmation contracts.",
    recovery: "Preserve owning receipt, readback, reconciliation, and rollback behavior.",
  },
] as const satisfies readonly S86ActionInventoryEntry[];
