import { describe, expect, it } from "vitest";

import { buildAnticipatedWork } from "@/lib/anticipation/projection";
import {
  planNoticeReminders,
  type NoticeReminderLeaseFacts,
} from "@/lib/lease-renewal/notice-reminders";
import type { RenewalFollowUpProjection } from "@/lib/lease-renewal/follow-up-projection";
import { DEFAULT_NOTICE_RULE_SET } from "@/lib/lease-renewal/notice-rules";
import {
  getRenewalDeskView,
  SAMPLE_NOTICE_REFERENCE_DATE,
} from "@/tests/helpers/sample-desk";

const GROUP_KEYS = [
  "category",
  "count",
  "processDefinitionId",
  "spaceId",
  "spaceName",
  "startHref",
  "summary",
  "urgency",
];

function build(referenceDateIso = SAMPLE_NOTICE_REFERENCE_DATE) {
  return buildAnticipatedWork({ referenceDateIso, deskView: getRenewalDeskView() });
}

// Re-derive the notice batch exactly as the projection + the reminders CLI do, so the reconciliation
// test compares against the SAME planners (not a re-implementation).
function noticeBatchFromDesk(): NoticeReminderLeaseFacts[] {
  const desk = getRenewalDeskView();
  return [...desk.actionable, ...desk.review, ...desk.outOfWindow]
    .filter((summary) => summary.endDateIso !== null)
    .map((summary) => ({
      leaseId: summary.id,
      label: summary.id,
      leaseEndDateIso: summary.endDateIso,
      renewalLetterSentIso: null,
      tenantResponded: false,
    }));
}

describe("buildAnticipatedWork", () => {
  it("AC-S18-1: is deterministic — two calls with the same inputs are deep-equal", () => {
    expect(build()).toEqual(build());
  });

  it("AC-S18-2: emits only value-free groups (no address, rent, tenant name, or lease-end date)", () => {
    const serialized = JSON.stringify(build());
    // Sentinels drawn from the sample batch that must NEVER surface on the value-free list.
    expect(serialized).not.toContain("Maple");
    expect(serialized).not.toContain("4821");
    expect(serialized).not.toContain("Delgado");
    expect(serialized).not.toContain("$1,250");
    expect(serialized).not.toContain("2026-08-31"); // a sample lease-end date
    expect(serialized).not.toContain("leaseId");
    expect(serialized).not.toContain("label");
  });

  it("AC-S18-2: every group's key set is EXACTLY the value-free whitelist", () => {
    for (const group of build().groups) {
      expect(Object.keys(group).sort()).toEqual(GROUP_KEYS);
    }
  });

  it("AC-S18-3: covers all four owner-named families plus the compliance/new-user family", () => {
    const ids = build().groups.map((g) => g.spaceId);
    expect(ids).toEqual([
      "lease-renewals",
      "owner-renewal-outreach",
      "tenant-renewal-notice",
      "maintenance-work-order-intake",
      "compliance-new-user",
    ]);
  });

  it("AC-S18-3: an un-fed family renders no-source-yet with zero count and no startable definition", () => {
    const groups = build().groups;
    const maintenance = groups.find((g) => g.spaceId === "maintenance-work-order-intake");
    const compliance = groups.find((g) => g.spaceId === "compliance-new-user");
    expect(maintenance?.urgency).toBe("no-source-yet");
    expect(maintenance?.count).toBe(0);
    expect(compliance?.urgency).toBe("no-source-yet");
    expect(compliance?.count).toBe(0);
    expect(compliance?.processDefinitionId).toBeNull();
  });

  it("AC-S18-8: renewal-family counts reconcile with their canonical sources", () => {
    const ref = SAMPLE_NOTICE_REFERENCE_DATE; // "2026-07-14"
    const batch = noticeBatchFromDesk();
    const plan = planNoticeReminders({
      leases: batch,
      ruleSet: DEFAULT_NOTICE_RULE_SET,
      referenceDateIso: ref,
    });
    const groups = buildAnticipatedWork({
      referenceDateIso: ref,
      deskView: getRenewalDeskView(),
    }).groups;
    const tenant = groups.find((g) => g.spaceId === "tenant-renewal-notice");
    const owner = groups.find((g) => g.spaceId === "owner-renewal-outreach");
    const renewals = groups.find((g) => g.spaceId === "lease-renewals");

    // Counts do not fork from their canonical notice/cohort/follow-up projections.
    expect(tenant?.count).toBe(plan.reminders.length);
    expect(owner?.count).toBe(0);
    expect(renewals?.count).toBe(getRenewalDeskView().cohort.summary.actionable);
    // Urgency is derived from the same planner result instead of freezing a retired sample count.
    expect(tenant?.urgency).toBe(
      plan.summary.notice_overdue + plan.summary.follow_up_due > 0
        ? "overdue"
        : plan.summary.notice_due_soon > 0
          ? "due-soon"
          : "all-clear",
    );
  });

  it("counts only exact owner-bound due evidence as owner follow-up work", () => {
    const view = getRenewalDeskView();
    const dueProjection = (
      party: "owner" | "tenant",
      leaseId: string,
    ): RenewalFollowUpProjection =>
      ({
        leaseId,
        waiting: { party },
        attention: { dedupeKey: `due:${leaseId}` },
      }) as RenewalFollowUpProjection;
    const deskView = {
      ...view,
      actionable: view.actionable.map((lease, index) => ({
        ...lease,
        ...(index === 0
          ? { followUp: dueProjection("owner", lease.id) }
          : index === 1
            ? { followUp: dueProjection("tenant", lease.id) }
            : {}),
      })),
    };

    const owner = buildAnticipatedWork({
      referenceDateIso: SAMPLE_NOTICE_REFERENCE_DATE,
      deskView,
    }).groups.find((group) => group.spaceId === "owner-renewal-outreach");
    expect(owner).toMatchObject({
      count: 1,
      summary: "1 owner follow-up to review",
    });
  });
});
