import type { Role } from "@/lib/auth/roles";

/**
 * S182/S34: ordinary renewal staff confirm these exact document-packet operations themselves. The
 * person's exact confirmation is the High-risk approval: it binds the exact preview and context
 * hashes and a reason, and the exact Action Registry key, runtime suspension and one-attempt claim
 * still apply. No Admin, settings recorder or approval-queue route is substituted, and no other
 * action key is staff-confirmed.
 */
export const STAFF_CONFIRMED_ACTION_KEYS: readonly string[] = Object.freeze([
  "dotloop.loop.create_from_template",
  "dotloop.document.upload",
]);

const STAFF_CONFIRMING_ROLES: readonly Role[] = ["Editor", "Approver", "Admin"];

export function isStaffConfirmedActionKey(actionKey: string): boolean {
  return STAFF_CONFIRMED_ACTION_KEYS.includes(actionKey);
}

/** True when this role may view, confirm and claim this staff-confirmed action instance. */
export function canConfirmAsStaff(role: Role | "Vendor", actionKey: string): boolean {
  return (
    isStaffConfirmedActionKey(actionKey) &&
    (STAFF_CONFIRMING_ROLES as readonly string[]).includes(role)
  );
}
