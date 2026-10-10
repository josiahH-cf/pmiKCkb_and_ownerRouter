"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithDeadline as fetch, waitFailureMessage } from "@/lib/ui/fetch-lifetime";
import { Button, Field } from "@/components/ui";
import { formatCalendarDate } from "@/lib/date-display";
import type {
  RenewalPricingPolicy,
  RenewalPricingPolicyInput,
  StandingOwnerAgreement,
} from "@/lib/lease-renewal/renewal-pricing-policy";
const blank: RenewalPricingPolicyInput = {
  id: "",
  name: "",
  kind: "percentage",
  value: 3.5,
  effectiveFrom: "",
  effectiveThrough: null,
  enabled: true,
  purpose: "",
};
const endpoint = "/api/lease-renewal/pricing-policy";
class PricingAdminResponseError extends Error {}
function pricingAdminFailure(error: unknown, fallback: string) {
  return error instanceof PricingAdminResponseError
    ? error.message
    : waitFailureMessage(error, fallback);
}
export function RenewalPricingPolicyAdmin() {
  const [policies, setPolicies] = useState<RenewalPricingPolicy[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [policy, setPolicy] = useState(blank),
    [version, setVersion] = useState(0),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const [portfolio, setPortfolio] = useState(""),
    [assigned, setAssigned] = useState(""),
    [assignmentVersion, setAssignmentVersion] = useState(0),
    [assignmentRead, setAssignmentRead] = useState("");
  const lock = useRef(false),
    intent = useRef<{ key: string; body: object } | null>(null);
  const load = useCallback(async (after: string | null = null) => {
    try {
      const r = await fetch(
        `${endpoint}${after ? `?after=${encodeURIComponent(after)}` : ""}`,
      );
      const p = await r.json();
      if (!r.ok)
        throw new PricingAdminResponseError(p.error ?? "Policies could not be read.");
      setPolicies((old) =>
        after
          ? [...new Map([...old, ...p.policies].map((x) => [x.id, x])).values()]
          : p.policies,
      );
      setCursor(p.cursor);
    } catch (e) {
      setMessage(pricingAdminFailure(e, "Policies could not be read."));
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function command(input: object) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setMessage("");
    const key = JSON.stringify(input);
    if (intent.current?.key !== key)
      intent.current = { key, body: { ...input, operationId: crypto.randomUUID() } };
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(intent.current.body),
      });
      const p = await r.json();
      if (!r.ok)
        throw new PricingAdminResponseError(
          p.error ?? "The save was refused. Your input is kept.",
        );
      intent.current = null;
      setMessage("Saved and read back. No provider record or message was changed.");
      return p;
    } catch (e) {
      setMessage(
        pricingAdminFailure(
          e,
          "The response was not received. Keep this input and retry the same save to recover its result.",
        ),
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  async function savePolicy() {
    const next = { ...policy, id: policy.id || crypto.randomUUID() };
    if (!policy.id) setPolicy(next);
    const result = await command({
      action: "policy",
      policy: next,
      expectedVersion: version,
    });
    if (result?.policy) {
      setVersion(result.policy.version);
      await load();
    }
  }
  async function readAssignment() {
    try {
      const r = await fetch(`${endpoint}?portfolioId=${encodeURIComponent(portfolio)}`);
      const p = await r.json();
      if (!r.ok)
        throw new PricingAdminResponseError(
          p.error ?? "Portfolio membership could not be verified.",
        );
      setAssignmentVersion(p.assignment?.version ?? 0);
      setAssigned(p.assignment?.policyId ?? "");
      setAssignmentRead(portfolio);
      setMessage("Current portfolio assignment read.");
    } catch (e) {
      setAssignmentRead("");
      setMessage(pricingAdminFailure(e, "The portfolio assignment could not be read."));
    }
  }
  function edit(id: string) {
    const p = policies.find((p) => p.id === id);
    if (!p) {
      setPolicy(blank);
      setVersion(0);
      return;
    }
    const { version, updatedAt, updatedByUid, ...input } = p;
    void updatedAt;
    void updatedByUid;
    setPolicy(input);
    setVersion(version);
  }
  return (
    <div className="ui-stack">
      <h3>Reusable renewal policies</h3>
      <p>
        Choose percentage, fixed-dollar, no-increase or manual review. The intended MKD
        percentage is 3.5%; assigning it requires verified portfolio membership. A price
        rule alone is not owner consent.
      </p>
      <Field htmlFor="pricing-select" label="Edit policy">
        <select
          id="pricing-select"
          value={policy.id}
          onChange={(e) => edit(e.target.value)}
        >
          <option value="">New policy</option>
          {policies.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · v{p.version}
            </option>
          ))}
        </select>
      </Field>
      {cursor ? (
        <Button onClick={() => void load(cursor)} disabled={pending}>
          Load more policies
        </Button>
      ) : null}
      <Field htmlFor="pricing-name" label="Policy name">
        <input
          id="pricing-name"
          value={policy.name}
          maxLength={100}
          onChange={(e) => setPolicy({ ...policy, name: e.target.value })}
        />
      </Field>
      <Field htmlFor="pricing-kind" label="Policy type">
        <select
          id="pricing-kind"
          value={policy.kind}
          onChange={(e) => {
            const kind = e.target.value as RenewalPricingPolicyInput["kind"];
            setPolicy({
              ...policy,
              kind,
              value: ["no_increase", "manual_review"].includes(kind)
                ? null
                : (policy.value ?? 3.5),
            });
          }}
        >
          <option value="percentage">Percentage increase</option>
          <option value="fixed_dollar">Fixed dollar increase</option>
          <option value="no_increase">No increase</option>
          <option value="manual_review">Manual review</option>
        </select>
      </Field>
      {policy.value !== null ? (
        <Field
          htmlFor="pricing-value"
          label={policy.kind === "percentage" ? "Increase percent" : "Increase dollars"}
        >
          <input
            id="pricing-value"
            type="number"
            step="0.01"
            value={policy.value}
            onChange={(e) => setPolicy({ ...policy, value: Number(e.target.value) })}
          />
        </Field>
      ) : null}
      <Field
        htmlFor="pricing-from"
        label="Effective from"
        hint={
          policy.effectiveFrom ? formatCalendarDate(policy.effectiveFrom) : "MM/DD/YYYY"
        }
      >
        <input
          id="pricing-from"
          type="date"
          value={policy.effectiveFrom}
          onChange={(e) => setPolicy({ ...policy, effectiveFrom: e.target.value })}
        />
      </Field>
      <Field htmlFor="pricing-through" label="Effective through (optional)">
        <input
          id="pricing-through"
          type="date"
          value={policy.effectiveThrough ?? ""}
          onChange={(e) =>
            setPolicy({ ...policy, effectiveThrough: e.target.value || null })
          }
        />
      </Field>
      <Field htmlFor="pricing-purpose" label="Purpose and change context">
        <textarea
          id="pricing-purpose"
          maxLength={1000}
          value={policy.purpose}
          onChange={(e) => setPolicy({ ...policy, purpose: e.target.value })}
        />
      </Field>
      <label>
        <input
          type="checkbox"
          checked={policy.enabled}
          onChange={(e) => setPolicy({ ...policy, enabled: e.target.checked })}
        />
        Policy enabled
      </label>
      <Button onClick={() => void savePolicy()} disabled={pending}>
        Save pricing policy
      </Button>
      <h3>Portfolio default</h3>
      <Field htmlFor="pricing-portfolio" label="RentVine portfolio ID">
        <input
          id="pricing-portfolio"
          value={portfolio}
          onChange={(e) => setPortfolio(e.target.value)}
        />
      </Field>
      <Button onClick={() => void readAssignment()} disabled={pending}>
        Read portfolio assignment
      </Button>
      <Field htmlFor="pricing-default" label="Default pricing policy">
        <select
          id="pricing-default"
          value={assigned}
          onChange={(e) => setAssigned(e.target.value)}
        >
          <option value="">No reusable default (legacy rule remains if present)</option>
          {policies.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Button
        disabled={pending || assignmentRead !== portfolio}
        onClick={() =>
          void command({
            action: "assignment",
            scope: "portfolio",
            sourceId: portfolio,
            policyId: assigned || null,
            expectedVersion: assignmentVersion,
            reason: "Admin portfolio policy assignment",
          }).then((p) => {
            if (p?.assignment) setAssignmentVersion(p.assignment.version);
          })
        }
      >
        Save portfolio default
      </Button>
      <StandingAgreementEditor policies={policies} command={command} pending={pending} />
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
type AgreementInput = Omit<
  StandingOwnerAgreement,
  "version" | "recordedAt" | "recordedByUid"
>;
const emptyAgreement: AgreementInput = {
  id: "",
  policyId: "",
  policyVersion: 1,
  portfolioId: "",
  leaseIds: [],
  cycleDate: "",
  terms: { rent: 0, effectiveDate: "", endDate: "" },
  evidenceRef: "",
  effectiveFrom: "",
  expiresOn: "",
  revoked: false,
};
function StandingAgreementEditor({
  policies,
  command,
  pending,
}: Readonly<{
  policies: RenewalPricingPolicy[];
  command: (input: object) => Promise<{ agreement?: StandingOwnerAgreement } | undefined>;
  pending: boolean;
}>) {
  const [agreement, setAgreement] = useState(emptyAgreement),
    [version, setVersion] = useState(0),
    [leaseText, setLeaseText] = useState(""),
    [lookup, setLookup] = useState(""),
    [history, setHistory] = useState<StandingOwnerAgreement[]>([]),
    [notice, setNotice] = useState("");
  async function read() {
    try {
      const r = await fetch(`${endpoint}?leaseId=${encodeURIComponent(lookup)}`);
      const p = await r.json();
      if (!r.ok)
        throw new PricingAdminResponseError(
          p.error ?? "The actual lease could not be read.",
        );
      setHistory(p.agreements);
      setNotice(
        "Recorded agreements for this lease read. Select one to inspect or revoke its current version.",
      );
    } catch (e) {
      setNotice(pricingAdminFailure(e, "The agreements could not be read."));
    }
  }
  function edit(id: string) {
    const a = history.find((a) => a.id === id);
    if (!a) {
      setAgreement(emptyAgreement);
      setVersion(0);
      setLeaseText("");
      return;
    }
    const { version, recordedAt, recordedByUid, ...input } = a;
    void recordedAt;
    void recordedByUid;
    setAgreement(input);
    setVersion(version);
    setLeaseText(input.leaseIds.join(", "));
  }
  async function save() {
    const a = {
      ...agreement,
      id: agreement.id || crypto.randomUUID(),
      leaseIds: leaseText
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    };
    setAgreement(a);
    const p = await command({
      action: "agreement",
      agreement: a,
      expectedVersion: version,
    });
    if (p?.agreement) {
      setVersion(p.agreement.version);
      setNotice(
        "Agreement version recorded as staff evidence. Membership, cycle, expiry, conflicts and exact terms are checked whenever authority is used.",
      );
    }
  }
  return (
    <details>
      <summary>Standing owner authority</summary>
      <p>
        Record the actual reviewed agreement separately from the price rule. This record
        covers only the listed real leases, current cycle, exact rent and dates. It does
        not imply approval of other changed terms.
      </p>
      <Field htmlFor="agreement-lookup" label="Lease ID to inspect agreements">
        <input
          id="agreement-lookup"
          value={lookup}
          onChange={(e) => setLookup(e.target.value)}
        />
      </Field>
      <Button disabled={pending} onClick={() => void read()}>
        Read lease agreements
      </Button>
      <Field htmlFor="agreement-edit" label="Edit recorded agreement">
        <select
          id="agreement-edit"
          value={agreement.id}
          onChange={(e) => edit(e.target.value)}
        >
          <option value="">New agreement</option>
          {history.map((a) => (
            <option key={a.id} value={a.id}>
              {a.cycleDate} · v{a.version}
              {a.revoked ? " · revoked" : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field htmlFor="agreement-policy" label="Agreement pricing policy">
        <select
          id="agreement-policy"
          value={agreement.policyId}
          onChange={(e) => {
            const p = policies.find((p) => p.id === e.target.value);
            setAgreement({
              ...agreement,
              policyId: p?.id ?? "",
              policyVersion: p?.version ?? 1,
            });
          }}
        >
          <option value="">Choose the reviewed policy version</option>
          {policies.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · v{p.version}
            </option>
          ))}
        </select>
      </Field>
      <Field htmlFor="agreement-portfolio" label="Agreement portfolio ID">
        <input
          id="agreement-portfolio"
          value={agreement.portfolioId}
          onChange={(e) => setAgreement({ ...agreement, portfolioId: e.target.value })}
        />
      </Field>
      <Field htmlFor="agreement-leases" label="Covered lease IDs (comma-separated)">
        <input
          id="agreement-leases"
          value={leaseText}
          onChange={(e) => setLeaseText(e.target.value)}
        />
      </Field>
      <Field htmlFor="agreement-cycle" label="Source cycle date">
        <input
          id="agreement-cycle"
          type="date"
          value={agreement.cycleDate}
          onChange={(e) => setAgreement({ ...agreement, cycleDate: e.target.value })}
        />
      </Field>
      <Field htmlFor="agreement-rent" label="Covered renewal rent">
        <input
          id="agreement-rent"
          type="number"
          step="1"
          value={agreement.terms.rent || ""}
          onChange={(e) =>
            setAgreement({
              ...agreement,
              terms: { ...agreement.terms, rent: Number(e.target.value) },
            })
          }
        />
      </Field>
      <Field htmlFor="agreement-terms-start" label="Covered renewal effective date">
        <input
          id="agreement-terms-start"
          type="date"
          value={agreement.terms.effectiveDate}
          onChange={(e) =>
            setAgreement({
              ...agreement,
              terms: { ...agreement.terms, effectiveDate: e.target.value },
            })
          }
        />
      </Field>
      <Field htmlFor="agreement-terms-end" label="Covered renewal end date">
        <input
          id="agreement-terms-end"
          type="date"
          value={agreement.terms.endDate}
          onChange={(e) =>
            setAgreement({
              ...agreement,
              terms: { ...agreement.terms, endDate: e.target.value },
            })
          }
        />
      </Field>
      <Field htmlFor="agreement-ref" label="Reviewed owner agreement reference">
        <input
          id="agreement-ref"
          maxLength={1000}
          value={agreement.evidenceRef}
          onChange={(e) => setAgreement({ ...agreement, evidenceRef: e.target.value })}
        />
      </Field>
      <Field htmlFor="agreement-from" label="Authority effective from">
        <input
          id="agreement-from"
          type="date"
          value={agreement.effectiveFrom}
          onChange={(e) => setAgreement({ ...agreement, effectiveFrom: e.target.value })}
        />
      </Field>
      <Field htmlFor="agreement-until" label="Authority expires on">
        <input
          id="agreement-until"
          type="date"
          value={agreement.expiresOn}
          onChange={(e) => setAgreement({ ...agreement, expiresOn: e.target.value })}
        />
      </Field>
      <label>
        <input
          type="checkbox"
          checked={agreement.revoked}
          onChange={(e) => setAgreement({ ...agreement, revoked: e.target.checked })}
        />
        Authority revoked
      </label>
      <Button disabled={pending} onClick={() => void save()}>
        Save standing authority
      </Button>
      {notice ? <p role="status">{notice}</p> : null}
    </details>
  );
}
