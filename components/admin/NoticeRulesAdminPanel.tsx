"use client";

import { useState } from "react";

import { Button, Field } from "@/components/ui";
import type { NoticeRuleSetRecord } from "@/lib/firestore/lease-renewal-notice-rules";

// F-TMPL-5: Admin edit surface for renewal notice timing (mirrors TransactionalDestinationPanel). It
// edits the GLOBAL rule and marks it Confirmed, which clears the Needs Verification note on the
// renewal desk through the existing resolver. Property/lease overrides are a separable follow-on. It
// never sends or drafts anything; it records the app timing rules only.
export function NoticeRulesAdminPanel({
  initialRecord,
  note,
}: Readonly<{ initialRecord: NoticeRuleSetRecord; note?: string }>) {
  const initialGlobal = initialRecord.rules.find((rule) => rule.scope === "global");
  const [rules, setRules] = useState(initialRecord.rules);
  const [values, setValues] = useState({
    noticeDeadlineDayOfMonth: initialGlobal?.values.noticeDeadlineDayOfMonth ?? 1,
    noticeDeadlineMonthOffset: initialGlobal?.values.noticeDeadlineMonthOffset ?? 0,
    operatorWarningLeadDays: initialGlobal?.values.operatorWarningLeadDays ?? 0,
    followUpIntervalDays: initialGlobal?.values.followUpIntervalDays ?? 0,
    enabled: initialGlobal?.values.enabled ?? false,
  });
  const [verified, setVerified] = useState(initialGlobal?.verified ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  function setNumber(key: keyof typeof values, value: number) {
    setValues((current) => ({ ...current, [key]: value }));
    setOk(false);
  }

  async function save() {
    setPending(true);
    setError("");
    setOk(false);
    const nextGlobal = { scope: "global" as const, values, verified };
    const nextRules = rules.some((rule) => rule.scope === "global")
      ? rules.map((rule) => (rule.scope === "global" ? nextGlobal : rule))
      : [nextGlobal, ...rules];

    try {
      const response = await fetch("/api/admin/notice-rules", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rules: nextRules }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        noticeRules?: NoticeRuleSetRecord;
        error?: string;
      };
      if (response.ok && payload.noticeRules) {
        setRules(payload.noticeRules.rules);
        setOk(true);
      } else {
        setError(payload.error ?? "Could not save the notice rules.");
      }
    } catch {
      setError("Could not save the notice rules.");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="panel">
      <h2>Renewal Notice Rules</h2>
      <p className="muted">
        The renewal timing the app uses for reminders and follow-ups. Confirm the values
        to clear the Needs Verification note on the renewal desk. This records the app
        timing rules only and never sends anything.
      </p>
      {note ? <p className="muted">{note}</p> : null}
      <form
        className="ui-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="grid two">
          <Field label="Notice deadline day of month" htmlFor="notice-deadline-day">
            <input
              id="notice-deadline-day"
              max={31}
              min={1}
              onChange={(event) =>
                setNumber("noticeDeadlineDayOfMonth", Number(event.target.value))
              }
              type="number"
              value={values.noticeDeadlineDayOfMonth}
            />
          </Field>
          <Field label="Notice deadline month offset" htmlFor="notice-deadline-offset">
            <input
              id="notice-deadline-offset"
              max={12}
              min={-12}
              onChange={(event) =>
                setNumber("noticeDeadlineMonthOffset", Number(event.target.value))
              }
              type="number"
              value={values.noticeDeadlineMonthOffset}
            />
          </Field>
          <Field label="Operator warning lead days" htmlFor="operator-warning-days">
            <input
              id="operator-warning-days"
              max={120}
              min={0}
              onChange={(event) =>
                setNumber("operatorWarningLeadDays", Number(event.target.value))
              }
              type="number"
              value={values.operatorWarningLeadDays}
            />
          </Field>
          <Field label="Follow-up interval days" htmlFor="follow-up-days">
            <input
              id="follow-up-days"
              max={365}
              min={0}
              onChange={(event) =>
                setNumber("followUpIntervalDays", Number(event.target.value))
              }
              type="number"
              value={values.followUpIntervalDays}
            />
          </Field>
        </div>
        <label className="queue-toggle">
          <input
            checked={values.enabled}
            onChange={(event) => {
              setValues((current) => ({ ...current, enabled: event.target.checked }));
              setOk(false);
            }}
            type="checkbox"
          />
          Notice rules enabled
        </label>
        <label className="queue-toggle">
          <input
            checked={verified}
            onChange={(event) => {
              setVerified(event.target.checked);
              setOk(false);
            }}
            type="checkbox"
          />
          Confirmed (clears the Needs Verification note)
        </label>
        <div className="ui-stack">
          <Button disabled={pending} size="large" type="submit">
            {pending ? "Saving…" : "Save notice rules"}
          </Button>
          {error ? <span className="auth-message">{error}</span> : null}
          {ok ? (
            <span className="muted" role="status">
              Saved.
            </span>
          ) : null}
        </div>
      </form>
    </article>
  );
}
