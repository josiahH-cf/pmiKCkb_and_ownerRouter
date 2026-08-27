"use client";

import { useState } from "react";

import { Button, Field } from "@/components/ui";
import type { NoticeRuleSetRecord } from "@/lib/firestore/lease-renewal-notice-rules";

type StoredRule = NoticeRuleSetRecord["rules"][number];
type NumericRuleField =
  | "noticeDeadlineDayOfMonth"
  | "noticeDeadlineMonthOffset"
  | "operatorWarningLeadDays"
  | "followUpIntervalDays";

const EMPTY_OVERRIDE = {
  scope: "property" as "property" | "lease",
  key: "",
  noticeDeadlineDayOfMonth: "",
  noticeDeadlineMonthOffset: "",
  operatorWarningLeadDays: "",
  followUpIntervalDays: "",
  enabled: "" as "" | "true" | "false",
  verified: false,
};

/**
 * S75 Admin surface. It edits all three deterministic scopes, but never treats entered values as
 * client policy unless an Admin explicitly marks that exact rule client-confirmed. Unconfirmed
 * starter values remain visible yet non-actionable in the rule engine.
 */
export function NoticeRulesAdminPanel({
  initialRecord,
  note,
}: Readonly<{ initialRecord: NoticeRuleSetRecord; note?: string }>) {
  const initialGlobal = initialRecord.rules.find((rule) => rule.scope === "global");
  const [rules, setRules] = useState(initialRecord.rules);
  const [values, setValues] = useState({
    noticeDeadlineDayOfMonth: initialGlobal?.values.noticeDeadlineDayOfMonth ?? 15,
    noticeDeadlineMonthOffset: initialGlobal?.values.noticeDeadlineMonthOffset ?? -1,
    operatorWarningLeadDays: initialGlobal?.values.operatorWarningLeadDays ?? 3,
    followUpIntervalDays: initialGlobal?.values.followUpIntervalDays ?? 10,
    enabled: initialGlobal?.values.enabled ?? true,
  });
  const [verified, setVerified] = useState(initialGlobal?.verified ?? false);
  const [override, setOverride] = useState({ ...EMPTY_OVERRIDE });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const overrides = rules.filter((rule) => rule.scope !== "global");

  function setNumber(key: NumericRuleField, value: number) {
    setValues((current) => ({ ...current, [key]: value }));
    setOk(false);
  }

  function addOverride() {
    setError("");
    const key = override.key.trim();
    const numbers = {
      noticeDeadlineDayOfMonth: Number(override.noticeDeadlineDayOfMonth),
      noticeDeadlineMonthOffset: Number(override.noticeDeadlineMonthOffset),
      operatorWarningLeadDays: Number(override.operatorWarningLeadDays),
      followUpIntervalDays: Number(override.followUpIntervalDays),
    };
    if (
      !key ||
      override.enabled === "" ||
      Object.values(numbers).some((value) => !Number.isInteger(value))
    ) {
      setError(
        "Enter the exact property or lease key and every timing field. Blank values are never guessed.",
      );
      return;
    }
    if (overrides.some((rule) => rule.scope === override.scope && rule.key === key)) {
      setError(
        "That exact scope and key already has a rule. Remove it before replacing it.",
      );
      return;
    }
    const next: StoredRule = {
      scope: override.scope,
      key,
      values: {
        ...numbers,
        enabled: override.enabled === "true",
      },
      verified: override.verified,
    };
    setRules((current) => [...current, next]);
    setOverride({ ...EMPTY_OVERRIDE });
    setOk(false);
  }

  async function save() {
    setPending(true);
    setError("");
    setOk(false);
    const nextGlobal: StoredRule = { scope: "global", values, verified };
    const nextRules = [nextGlobal, ...overrides];

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
    <article className="panel ui-stack">
      <div>
        <h2>Renewal Notice Rules</h2>
        <p className="muted">
          Global, property, and lease timing resolve most-specific-first. A rule creates
          internal attention only after every effective value is explicitly
          client-confirmed. It never sends mail.
        </p>
        <p className="muted">Current saved version: {initialRecord.version}</p>
      </div>
      {note ? <p className="muted">{note}</p> : null}
      {!verified ? (
        <div className="notice notice-warning" role="status">
          <strong>Global client timing policy is not confirmed.</strong>
          <p>
            The displayed starter values are inactive: they cannot create due dates,
            reminders, work, drafts, or sends.
          </p>
        </div>
      ) : null}

      <form
        className="ui-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h3>Global fallback</h3>
        <div className="grid two">
          <Field label="Notice deadline day of month" htmlFor="notice-deadline-day">
            <input
              id="notice-deadline-day"
              max={31}
              min={1}
              onChange={(event) =>
                setNumber("noticeDeadlineDayOfMonth", Number(event.target.value))
              }
              required
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
              required
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
              required
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
              required
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
          Tracking enabled when policy is confirmed
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
          Client confirmed this exact global rule
        </label>

        <section className="ui-stack" aria-label="Property and lease overrides">
          <h3>Property and lease overrides</h3>
          <p className="muted">
            Add only an exact source key and supplied values. Every field starts blank so
            the app cannot invent an override.
          </p>
          <div className="grid two">
            <label className="select-field">
              Override scope
              <select
                onChange={(event) =>
                  setOverride((current) => ({
                    ...current,
                    scope: event.target.value as "property" | "lease",
                  }))
                }
                value={override.scope}
              >
                <option value="property">Property</option>
                <option value="lease">Lease</option>
              </select>
            </label>
            <Field label="Exact property or lease key" htmlFor="notice-override-key">
              <input
                id="notice-override-key"
                maxLength={200}
                onChange={(event) =>
                  setOverride((current) => ({
                    ...current,
                    key: event.target.value,
                  }))
                }
                value={override.key}
              />
            </Field>
            {(
              [
                ["noticeDeadlineDayOfMonth", "Deadline day", 1, 31],
                ["noticeDeadlineMonthOffset", "Deadline month offset", -12, 12],
                ["operatorWarningLeadDays", "Warning lead days", 0, 120],
                ["followUpIntervalDays", "Follow-up interval days", 0, 365],
              ] as const
            ).map(([field, label, min, max]) => (
              <Field key={field} label={label} htmlFor={`notice-override-${field}`}>
                <input
                  id={`notice-override-${field}`}
                  max={max}
                  min={min}
                  onChange={(event) =>
                    setOverride((current) => ({
                      ...current,
                      [field]: event.target.value,
                    }))
                  }
                  type="number"
                  value={override[field]}
                />
              </Field>
            ))}
            <label className="select-field">
              Tracking value
              <select
                onChange={(event) =>
                  setOverride((current) => ({
                    ...current,
                    enabled: event.target.value as "" | "true" | "false",
                  }))
                }
                value={override.enabled}
              >
                <option value="">Choose supplied value…</option>
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </label>
          </div>
          <label className="queue-toggle">
            <input
              checked={override.verified}
              onChange={(event) =>
                setOverride((current) => ({
                  ...current,
                  verified: event.target.checked,
                }))
              }
              type="checkbox"
            />
            Client confirmed this exact override
          </label>
          <Button onClick={addOverride} type="button" variant="secondary">
            Add override to review
          </Button>

          {overrides.length ? (
            <ul className="compact-list">
              {overrides.map((rule) => (
                <li key={`${rule.scope}:${rule.key}`}>
                  <strong>
                    {rule.scope} · {rule.key}
                  </strong>{" "}
                  ({rule.verified ? "client-confirmed" : "not confirmed (inactive)"})
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setRules((current) => current.filter((item) => item !== rule));
                      setOk(false);
                    }}
                    type="button"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No property or lease overrides are saved.</p>
          )}
        </section>

        <div className="ui-stack">
          <Button disabled={pending} size="large" type="submit">
            {pending ? "Saving…" : "Save reviewed rule set"}
          </Button>
          {error ? <span className="auth-message">{error}</span> : null}
          {ok ? (
            <span className="muted" role="status">
              Saved as a new immutable policy version. No message was sent.
            </span>
          ) : null}
        </div>
      </form>
    </article>
  );
}
