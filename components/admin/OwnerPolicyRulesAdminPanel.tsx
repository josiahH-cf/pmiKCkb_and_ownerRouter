"use client";

import { useState } from "react";

import { Button, Field } from "@/components/ui";
import type { OwnerPolicyRule } from "@/lib/firestore/owner-policy-rules";

// S62: Admin management for owner-policy pricing rules (mirrors NoticeRulesAdminPanel). A rule
// SUGGESTS a renewal number through the same Admin approval that governs comp-derived numbers; it
// never sets the offered rent, never records an owner decision, and never suppresses an owner
// draft. The portfolio id must resolve against a live lease view; a free-text owner name is
// refused server-side.
export function OwnerPolicyRulesAdminPanel({
  initialRules,
}: Readonly<{ initialRules: OwnerPolicyRule[] }>) {
  const [rules, setRules] = useState(initialRules);
  const [portfolioId, setPortfolioId] = useState("");
  const [percent, setPercent] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  async function save() {
    setPending(true);
    setError("");
    setOk(false);
    try {
      const response = await fetch("/api/admin/owner-policy-rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          portfolioId: portfolioId.trim(),
          percent: Number(percent),
          effectiveFrom: effectiveFrom.trim(),
          note: note.trim(),
          reason: reason.trim(),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        rule?: OwnerPolicyRule;
        error?: string;
      };
      if (response.ok && payload.rule) {
        const saved = payload.rule;
        setRules((current) => [
          ...current.filter((rule) => rule.portfolioId !== saved.portfolioId),
          saved,
        ]);
        setOk(true);
        setReason("");
      } else {
        setError(payload.error ?? "Could not save the pricing rule.");
      }
    } catch {
      setError("Could not reach the rules service.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ui-stack">
      <p className="muted">
        A standing owner pricing agreement, keyed on the RentVine portfolio id. The desk
        proposes the number the rule implies and an Admin still approves it per lease
        before it can reach a draft. Owner emails go out through the normal reviewed
        process either way.
      </p>
      {rules.length > 0 ? (
        <ul className="ui-rows">
          {rules
            .slice()
            .sort((left, right) => left.portfolioId.localeCompare(right.portfolioId))
            .map((rule) => (
              <li className="ui-spread" key={rule.portfolioId}>
                <span>
                  Portfolio {rule.portfolioId}: +{rule.percent}% each renewal, effective{" "}
                  {rule.effectiveFrom}
                </span>
                <span className="muted">{rule.note}</span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="muted">No pricing rules recorded yet.</p>
      )}
      <Field htmlFor="opr-portfolio" label="RentVine portfolio id">
        <input
          id="opr-portfolio"
          onChange={(event) => setPortfolioId(event.target.value)}
          value={portfolioId}
        />
      </Field>
      <Field htmlFor="opr-percent" label="Increase percent per renewal">
        <input
          id="opr-percent"
          inputMode="decimal"
          onChange={(event) => setPercent(event.target.value)}
          value={percent}
        />
      </Field>
      <Field htmlFor="opr-effective" label="Effective from (YYYY-MM-DD)">
        <input
          id="opr-effective"
          onChange={(event) => setEffectiveFrom(event.target.value)}
          value={effectiveFrom}
        />
      </Field>
      <Field htmlFor="opr-note" label="Rule note (shown beside the suggested number)">
        <input
          id="opr-note"
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </Field>
      <Field htmlFor="opr-reason" label="Reason for this change (audited)">
        <input
          id="opr-reason"
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </Field>
      <div className="ui-row">
        <Button disabled={pending} onClick={() => void save()} type="button">
          {pending ? "Saving" : "Save pricing rule"}
        </Button>
      </div>
      {error ? <p className="muted">{error}</p> : null}
      {ok && !error ? <p className="muted">Rule saved and audited.</p> : null}
    </div>
  );
}
