import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTICE_RULE_SET,
  DEFAULT_NOTICE_RULE_VALUES,
  addDaysIso,
  buildEffectiveRuleView,
  buildNoticeRuleSummary,
  computeNoticeSchedule,
  detectNoticeStatus,
  lastDayOfMonth,
  provenanceLabel,
  resolveNoticeRule,
  type NoticeRuleSet,
} from "@/lib/lease-renewal/notice-rules";

describe("resolveNoticeRule — most-specific-wins precedence", () => {
  it("returns the unverified global default when there are no overrides", () => {
    const resolved = resolveNoticeRule(DEFAULT_NOTICE_RULE_SET, { leaseId: "L1" });
    expect(resolved.noticeDeadlineDayOfMonth.value).toBe(15);
    expect(resolved.noticeDeadlineDayOfMonth.scope).toBe("global");
    expect(resolved.noticeDeadlineDayOfMonth.verified).toBe(false);
    expect(resolved.fullyVerified).toBe(false);
  });

  it("lease beats property beats global, field by field", () => {
    const ruleSet: NoticeRuleSet = {
      rules: [
        { scope: "global", values: { ...DEFAULT_NOTICE_RULE_VALUES }, verified: false },
        {
          scope: "property",
          key: "PROP-A",
          values: { noticeDeadlineDayOfMonth: 10, operatorWarningLeadDays: 5 },
          verified: true,
        },
        {
          scope: "lease",
          key: "L1",
          values: { noticeDeadlineDayOfMonth: 1 },
          verified: true,
        },
      ],
    };

    const resolved = resolveNoticeRule(ruleSet, { leaseId: "L1", propertyKey: "PROP-A" });
    // lease override wins the day-of-month
    expect(resolved.noticeDeadlineDayOfMonth.value).toBe(1);
    expect(resolved.noticeDeadlineDayOfMonth.scope).toBe("lease");
    // property override wins the warning lead days (lease did not set it)
    expect(resolved.operatorWarningLeadDays.value).toBe(5);
    expect(resolved.operatorWarningLeadDays.scope).toBe("property");
    // nothing overrode the follow-up interval, so it stays the global default
    expect(resolved.followUpIntervalDays.value).toBe(10);
    expect(resolved.followUpIntervalDays.scope).toBe("global");
  });

  it("only matches an override whose key equals the context key", () => {
    const ruleSet: NoticeRuleSet = {
      rules: [
        { scope: "global", values: { ...DEFAULT_NOTICE_RULE_VALUES }, verified: false },
        {
          scope: "property",
          key: "PROP-A",
          values: { noticeDeadlineDayOfMonth: 10 },
          verified: true,
        },
      ],
    };
    // Different property: the override must NOT apply.
    const resolved = resolveNoticeRule(ruleSet, { propertyKey: "PROP-B" });
    expect(resolved.noticeDeadlineDayOfMonth.value).toBe(15);
    expect(resolved.noticeDeadlineDayOfMonth.scope).toBe("global");
  });

  it("is fullyVerified only when every field came from a confirmed override", () => {
    const ruleSet: NoticeRuleSet = {
      rules: [
        {
          scope: "lease",
          key: "L9",
          values: { ...DEFAULT_NOTICE_RULE_VALUES },
          verified: true,
        },
      ],
    };
    const resolved = resolveNoticeRule(ruleSet, { leaseId: "L9" });
    expect(resolved.fullyVerified).toBe(true);
  });
});

describe("date math — boundary days", () => {
  it("finds the last day of a month including leap February", () => {
    expect(lastDayOfMonth(2026, 2)).toBe(28);
    expect(lastDayOfMonth(2028, 2)).toBe(29);
    expect(lastDayOfMonth(2026, 4)).toBe(30);
  });

  it("clamps a day-of-month past the target month length", () => {
    const ruleSet: NoticeRuleSet = {
      rules: [
        {
          scope: "global",
          values: { ...DEFAULT_NOTICE_RULE_VALUES, noticeDeadlineDayOfMonth: 31 },
          verified: false,
        },
      ],
    };
    const resolved = resolveNoticeRule(ruleSet, {});
    // Lease ends 2026-03-31 -> deadline month is Feb 2026 (offset -1) -> day 31 clamps to 28.
    const schedule = computeNoticeSchedule("2026-03-31", resolved);
    expect(schedule?.noticeDueByIso).toBe("2026-02-28");
  });

  it("crosses the year boundary when the offset month is in the prior year", () => {
    const resolved = resolveNoticeRule(DEFAULT_NOTICE_RULE_SET, {});
    // Lease ends 2026-01-31 -> deadline the month before -> 2025-12-15.
    const schedule = computeNoticeSchedule("2026-01-31", resolved);
    expect(schedule?.noticeDueByIso).toBe("2025-12-15");
  });

  it("computes the operator warning date across a month boundary", () => {
    // Deadline 2026-03-01, warn 3 days prior -> 2026-02-26.
    expect(addDaysIso("2026-03-01", -3)).toBe("2026-02-26");
  });

  it("puts the mid-month default deadline the month before lease end", () => {
    const resolved = resolveNoticeRule(DEFAULT_NOTICE_RULE_SET, {});
    const schedule = computeNoticeSchedule("2026-08-31", resolved);
    expect(schedule?.noticeDueByIso).toBe("2026-07-15");
    expect(schedule?.operatorWarnOnIso).toBe("2026-07-12");
  });
});

describe("detectNoticeStatus", () => {
  const resolved = resolveNoticeRule(DEFAULT_NOTICE_RULE_SET, {});
  const leaseEnd = "2026-08-31"; // deadline 2026-07-15, warn 2026-07-12

  it("is scheduled well before the warning window", () => {
    const status = detectNoticeStatus(
      resolved,
      { leaseEndDateIso: leaseEnd, renewalLetterSentIso: null, tenantResponded: false },
      "2026-06-01",
    );
    expect(status.code).toBe("notice_scheduled");
  });

  it("is due soon inside the warning window and overdue past the deadline", () => {
    expect(
      detectNoticeStatus(
        resolved,
        { leaseEndDateIso: leaseEnd, renewalLetterSentIso: null, tenantResponded: false },
        "2026-07-13",
      ).code,
    ).toBe("notice_due_soon");
    expect(
      detectNoticeStatus(
        resolved,
        { leaseEndDateIso: leaseEnd, renewalLetterSentIso: null, tenantResponded: false },
        "2026-07-16",
      ).code,
    ).toBe("notice_overdue");
  });

  it("tracks the 10-day follow-up once the letter is sent with no response", () => {
    const sent = "2026-07-10";
    expect(
      detectNoticeStatus(
        resolved,
        { leaseEndDateIso: leaseEnd, renewalLetterSentIso: sent, tenantResponded: false },
        "2026-07-15",
      ).code,
    ).toBe("awaiting_response");
    const due = detectNoticeStatus(
      resolved,
      { leaseEndDateIso: leaseEnd, renewalLetterSentIso: sent, tenantResponded: false },
      "2026-07-20",
    );
    expect(due.code).toBe("follow_up_due");
    expect(due.followUpDueByIso).toBe("2026-07-20");
  });

  it("short-circuits when the tenant responded or the rule is disabled or there is no lease end", () => {
    expect(
      detectNoticeStatus(
        resolved,
        {
          leaseEndDateIso: leaseEnd,
          renewalLetterSentIso: "2026-07-10",
          tenantResponded: true,
        },
        "2026-07-30",
      ).code,
    ).toBe("responded");
    expect(
      detectNoticeStatus(
        resolved,
        { leaseEndDateIso: null, renewalLetterSentIso: null, tenantResponded: false },
        "2026-07-30",
      ).code,
    ).toBe("no_lease_end");

    const disabled: NoticeRuleSet = {
      rules: [
        {
          scope: "global",
          values: { ...DEFAULT_NOTICE_RULE_VALUES, enabled: false },
          verified: false,
        },
      ],
    };
    expect(
      detectNoticeStatus(
        resolveNoticeRule(disabled, {}),
        { leaseEndDateIso: leaseEnd, renewalLetterSentIso: null, tenantResponded: false },
        "2026-07-30",
      ).code,
    ).toBe("disabled");
  });
});

describe("buildEffectiveRuleView — provenance + Needs Verification", () => {
  it("labels an unconfirmed default 'default' and flags it Needs Verification", () => {
    const resolved = resolveNoticeRule(DEFAULT_NOTICE_RULE_SET, {});
    const status = detectNoticeStatus(
      resolved,
      {
        leaseEndDateIso: "2026-08-31",
        renewalLetterSentIso: null,
        tenantResponded: false,
      },
      "2026-06-01",
    );
    const view = buildEffectiveRuleView(resolved, status);
    const dueLine = view.lines.find((line) => line.label === "Notice due by");
    expect(dueLine?.value).toBe("Jul 15, 2026");
    expect(dueLine?.provenance).toBe("default");
    expect(dueLine?.needsVerification).toBe(true);
    expect(view.hasUnverified).toBe(true);
  });

  it("flags the warn date Needs Verification when the DEADLINE it derives from is an unconfirmed default", () => {
    // Dan confirms ONLY the warning lead days on a lease override; the deadline stays the unverified
    // global default. The warn DATE is deadline - leadDays, so it must NOT read as confirmed.
    const ruleSet: NoticeRuleSet = {
      rules: [
        { scope: "global", values: { ...DEFAULT_NOTICE_RULE_VALUES }, verified: false },
        {
          scope: "lease",
          key: "L1",
          values: { operatorWarningLeadDays: 3 },
          verified: true,
        },
      ],
    };
    const resolved = resolveNoticeRule(ruleSet, { leaseId: "L1" });
    const status = detectNoticeStatus(
      resolved,
      {
        leaseEndDateIso: "2026-08-31",
        renewalLetterSentIso: null,
        tenantResponded: false,
      },
      "2026-06-01",
    );
    const view = buildEffectiveRuleView(resolved, status);
    const warn = view.lines.find((line) => line.label === "Warn operator on");
    expect(warn?.needsVerification).toBe(true);
    expect(warn?.provenance).toBe("default");
  });

  it("labels a confirmed property override 'property rule' with no Needs Verification", () => {
    const ruleSet: NoticeRuleSet = {
      rules: [
        { scope: "global", values: { ...DEFAULT_NOTICE_RULE_VALUES }, verified: false },
        {
          scope: "property",
          key: "PROP-A",
          values: {
            noticeDeadlineDayOfMonth: 20,
            noticeDeadlineMonthOffset: -1,
            operatorWarningLeadDays: 4,
          },
          verified: true,
        },
      ],
    };
    const resolved = resolveNoticeRule(ruleSet, { propertyKey: "PROP-A" });
    const status = detectNoticeStatus(
      resolved,
      {
        leaseEndDateIso: "2026-08-31",
        renewalLetterSentIso: null,
        tenantResponded: false,
      },
      "2026-06-01",
    );
    const view = buildEffectiveRuleView(resolved, status);
    const dueLine = view.lines.find((line) => line.label === "Notice due by");
    expect(dueLine?.value).toBe("Jul 20, 2026");
    expect(dueLine?.provenance).toBe("property rule");
    expect(dueLine?.needsVerification).toBe(false);
  });

  it("provenanceLabel distinguishes a confirmed global from an unconfirmed default", () => {
    expect(provenanceLabel("global", false)).toBe("default");
    expect(provenanceLabel("global", true)).toBe("global rule");
    expect(provenanceLabel("lease", true)).toBe("lease rule");
  });
});

describe("buildNoticeRuleSummary — rule-level desk view", () => {
  it("describes the default rule in plain English, flagged Needs Verification", () => {
    const resolved = resolveNoticeRule(DEFAULT_NOTICE_RULE_SET, {});
    const summary = buildNoticeRuleSummary(resolved);
    expect(summary.statusLabel).toBe("Notice tracking on");
    const deadline = summary.lines.find((line) => line.label === "Notice deadline");
    expect(deadline?.value).toBe("By the 15th of the month before lease end");
    expect(deadline?.provenance).toBe("default");
    expect(deadline?.needsVerification).toBe(true);
    expect(summary.hasUnverified).toBe(true);
  });
});
