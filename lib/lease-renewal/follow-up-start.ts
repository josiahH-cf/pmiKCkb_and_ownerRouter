// S276 R-S276-7 / R-S276-8 (ARCH-S276-3): what the tenant offer review's follow-up form opens with,
// read with the offer's composition: the renewal notice rules' follow-up interval for the lease
// (read whether or not an Admin confirmed the rules; it is an editable starting value), whether the
// standard follow-up copy reads back approved, and, only then, the follow-up body composed from the
// same reviewed facts the offer states. Read-only: it writes nothing and authorizes nothing.
//
// Server-only.

import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { readNoticeRuleSnapshot } from "@/lib/firestore/lease-renewal-notice-rules";
import { getFollowUpCopyPublication } from "@/lib/firestore/renewal-follow-up-publication";
import { resolveNoticeRule } from "./notice-rules";
import {
  composeFollowUpBody,
  type FollowUpFacts,
  type FollowUpStartRead,
} from "./follow-up-copy";

export async function readTenantFollowUpStart(
  actor: AuthenticatedUser,
  leaseId: string,
  facts: FollowUpFacts | null,
  db: Firestore = getAdminFirestore(),
): Promise<FollowUpStartRead> {
  const [snapshot, publication] = await Promise.all([
    // A missing, invalid or unreadable rule set reads as the built-in defaults (10 days).
    readNoticeRuleSnapshot(db),
    getFollowUpCopyPublication(actor, db).catch(() => null),
  ]);
  const intervalDays = resolveNoticeRule(snapshot.ruleSet, { leaseId })
    .followUpIntervalDays.value;
  const published = publication?.status === "approved";
  return {
    intervalDays,
    published,
    body: published && facts ? composeFollowUpBody(facts) : null,
  };
}
