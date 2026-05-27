import { ROLES } from "@/lib/constants";

export type Role = (typeof ROLES)[number];

export type Capability =
  | "read"
  | "edit"
  | "approve"
  | "resolvePlaceholder"
  | "manageAdmin"
  | "softDelete";

const permissions: Record<Role, ReadonlySet<Capability>> = {
  Editor: new Set(["read", "edit"]),
  Approver: new Set(["read", "edit", "approve", "resolvePlaceholder"]),
  Admin: new Set([
    "read",
    "edit",
    "approve",
    "resolvePlaceholder",
    "manageAdmin",
    "softDelete",
  ]),
};

export function can(role: Role, capability: Capability) {
  return permissions[role].has(capability);
}
