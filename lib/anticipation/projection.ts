import {
  planCallTasks,
  planNoticeReminders,
  type NoticeReminderLeaseFacts,
} from "@/lib/lease-renewal/notice-reminders";
import {
  DEFAULT_NOTICE_RULE_SET,
  type NoticeRuleSet,
} from "@/lib/lease-renewal/notice-rules";
import type { RenewalDeskView } from "@/lib/lease-renewal/sample-desk";
import { launchSpaces, spaceHref, type LaunchSpace } from "@/lib/spaces";

/**
 * Anticipated-work projection — the on-screen twin of the `npm run notices:reminders` dry-run.
 *
 * PURE and deterministic: the reference date, the (already-classified) in-boundary lease batch, and the
 * notice rule set are all INPUTS. It never calls Date.now(), reads a mailbox/sheet, sends, or writes a
 * system of record — it only PROPOSES work a human starts with one click. It folds the same
 * classifyRenewalCohort output (via the desk view), planNoticeReminders, and planCallTasks the CLI uses,
 * so the lane's counts cannot fork from the planners (AC-S18-8). Every emitted field is VALUE-FREE: no
 * address, rent, tenant name, or lease-end date crosses onto the list (AC-S18-2) — the real detail lives
 * behind each group's startHref.
 */

/** The five urgency buckets the lane speaks; collapsed from the notice engine's status codes. */
export type AnticipatedUrgency =
  | "overdue"
  | "due-soon"
  | "upcoming"
  | "all-clear"
  | "no-source-yet";

/** One owner-named process family's anticipated work. VALUE-FREE — exactly these 8 keys, nothing more. */
export interface AnticipatedWorkGroup {
  processDefinitionId: string | null;
  spaceId: string;
  spaceName: string;
  category: string;
  count: number;
  urgency: AnticipatedUrgency;
  summary: string;
  startHref: string;
}

export interface AnticipatedWorkList {
  groups: AnticipatedWorkGroup[];
}

export interface AnticipatedWorkInput {
  referenceDateIso: string;
  /** The in-boundary lease batch, already classified by the renewal desk (single source of truth). */
  deskView: RenewalDeskView;
  /** Defaults to the app-plane DEFAULT_NOTICE_RULE_SET (values UNVERIFIED) so the projection stays pure. */
  ruleSet?: NoticeRuleSet;
}

const COMPLIANCE_FAMILY = {
  processDefinitionId: null,
  spaceId: "compliance-new-user",
  spaceName: "Compliance & New User",
  category: "Compliance",
  startHref: "/spaces",
} as const;

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Base value-free metadata for a launch-space-backed family, derived from lib/spaces.ts. */
function familyBase(space: LaunchSpace) {
  return {
    processDefinitionId: space.processDefinitionId ?? null,
    spaceId: space.id,
    spaceName: space.name,
    category: space.processCategory,
    startHref: spaceHref(space),
  };
}

function findSpace(id: string): LaunchSpace {
  const space = launchSpaces.find((candidate) => candidate.id === id);
  if (!space) {
    throw new Error(`Anticipation projection: unknown launch space "${id}".`);
  }
  return space;
}

/** Map the notice-reminder plan's per-kind counts to an urgency bucket for the tenant-notice family. */
function noticeUrgency(summary: {
  notice_overdue: number;
  follow_up_due: number;
  notice_due_soon: number;
}): AnticipatedUrgency {
  if (summary.notice_overdue + summary.follow_up_due > 0) return "overdue";
  if (summary.notice_due_soon > 0) return "due-soon";
  return "all-clear";
}

export function buildAnticipatedWork(input: AnticipatedWorkInput): AnticipatedWorkList {
  const { referenceDateIso, deskView } = input;
  const ruleSet = input.ruleSet ?? DEFAULT_NOTICE_RULE_SET;

  // Reuse the desk's classification and the CLI's exact batch selection: actionable + review +
  // out-of-window leases that carry a lease-end date. Skipped leases (month-to-month / program) never
  // enter the notice planners, so the lane's counts stay identical to `npm run notices:reminders`.
  const noticeBatch: NoticeReminderLeaseFacts[] = [
    ...deskView.actionable,
    ...deskView.review,
    ...deskView.outOfWindow,
  ]
    .filter((summary) => summary.endDateIso !== null)
    .map((summary) => ({
      leaseId: summary.id,
      label: summary.id, // in-boundary only; never surfaced on the value-free output
      leaseEndDateIso: summary.endDateIso,
      renewalLetterSentIso: null,
      tenantResponded: false,
    }));

  const plan = planNoticeReminders({ leases: noticeBatch, ruleSet, referenceDateIso });
  const callPlan = planCallTasks({
    reminders: plan.reminders,
    lastContactByLease: Object.fromEntries(
      noticeBatch.map((lease) => [lease.leaseId, lease.renewalLetterSentIso]),
    ),
    referenceDateIso,
  });

  const actionableCount = deskView.cohort.summary.actionable;
  const noticeCount = plan.reminders.length;
  const callCount = callPlan.tasks.length;

  const groups: AnticipatedWorkGroup[] = [
    {
      ...familyBase(findSpace("lease-renewals")),
      count: actionableCount,
      urgency: actionableCount > 0 ? "upcoming" : "all-clear",
      summary:
        actionableCount > 0
          ? `${pluralize(actionableCount, "lease", "leases")} in the renewal window`
          : "All clear",
    },
    {
      ...familyBase(findSpace("owner-renewal-outreach")),
      count: callCount,
      urgency: callCount > 0 ? "overdue" : "all-clear",
      summary:
        callCount > 0
          ? `${pluralize(callCount, "owner call", "owner calls")} to make`
          : "All clear",
    },
    {
      ...familyBase(findSpace("tenant-renewal-notice")),
      count: noticeCount,
      urgency: noticeUrgency(plan.summary),
      summary:
        noticeCount > 0
          ? `${pluralize(noticeCount, "tenant notice", "tenant notices")} to send`
          : "All clear",
    },
    {
      ...familyBase(findSpace("maintenance-work-order-intake")),
      count: 0,
      urgency: "no-source-yet",
      summary: "Waiting on a maintenance signal",
    },
    {
      ...COMPLIANCE_FAMILY,
      count: 0,
      urgency: "no-source-yet",
      summary: "Waiting on a compliance or new-user signal",
    },
  ];

  return { groups };
}
