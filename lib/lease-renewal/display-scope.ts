import { createHash } from "node:crypto";
import type { AuthenticatedUser } from "@/lib/auth/session";
/** Identifies the session's read scope; it grants no authority and contains no customer values. */
export function renewalDisplayScopeKey(actor: AuthenticatedUser): string {
  return createHash("sha256")
    .update(JSON.stringify([actor.uid, actor.hd, actor.role, "renewals"]))
    .digest("hex");
}
