import { describe, expect, it } from "vitest";

import { buildAnticipatedWork } from "@/lib/anticipation/projection";
import {
  planCallTasks,
  planNoticeReminders,
  type NoticeReminderLeaseFacts,
} from "@/lib/lease-renewal/notice-reminders";
import { DEFAULT_NOTICE_RULE_SET } from "@/lib/lease-renewal/notice-rules";
import {
  getRenewalDeskView,
  SAMPLE_NOTICE_REFERENCE_DATE,
} from "@/lib/lease-renewal/sample-desk";

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

  it("AC-S18-8: renewal-family counts reconcile with the notice planners over the same batch", () => {
    const ref = SAMPLE_NOTICE_REFERENCE_DATE; // "2026-07-14"
    const batch = noticeBatchFromDesk();
    const plan = planNoticeReminders({
      leases: batch,
      ruleSet: DEFAULT_NOTICE_RULE_SET,
      referenceDateIso: ref,
    });
    const callPlan = planCallTasks({
      reminders: plan.reminders,
      lastContactByLease: Object.fromEntries(batch.map((l) => [l.leaseId, null])),
      referenceDateIso: ref,
    });

    const groups = buildAnticipatedWork({
      referenceDateIso: ref,
      deskView: getRenewalDeskView(),
    }).groups;
    const tenant = groups.find((g) => g.spaceId === "tenant-renewal-notice");
    const owner = groups.find((g) => g.spaceId === "owner-renewal-outreach");
    const renewals = groups.find((g) => g.spaceId === "lease-renewals");

    // Counts do not fork from the planners.
    expect(tenant?.count).toBe(plan.reminders.length);
    expect(owner?.count).toBe(callPlan.tasks.length);
    // Concrete reconciliation with `npm run notices:reminders -- --date=2026-07-14 --json`.
    expect(tenant?.count).toBe(2);
    expect(owner?.count).toBe(0);
    expect(renewals?.count).toBe(getRenewalDeskView().cohort.summary.actionable);
    expect(renewals?.count).toBe(3);
    // Urgency inherits the planner state: two notices due soon, none overdue.
    expect(tenant?.urgency).toBe("due-soon");
  });
});
