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
import { RenewalPricingPolicyInputSchema } from "@/lib/lease-renewal/renewal-pricing-policy";
import type {
  StandingAgreement,
  StandingAgreementInput,
} from "@/lib/lease-renewal/standing-agreement";
import { StandingAgreementInputSchema } from "@/lib/lease-renewal/standing-agreement";
import type { OwnerPolicyRule } from "@/lib/firestore/owner-policy-rules";
const usd = (amount: number) =>
  `$${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
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
const PORTFOLIO_ID = /^[1-9]\d{0,9}$/;
const POLICY_INPUT_IDS = {
  name: "pricing-name",
  value: "pricing-value",
  effectiveFrom: "pricing-from",
  effectiveThrough: "pricing-through",
  purpose: "pricing-purpose",
} as const;
type PolicyField = keyof typeof POLICY_INPUT_IDS;
const policyNeedsAmount = (kind: RenewalPricingPolicyInput["kind"]) =>
  kind === "percentage" || kind === "fixed_dollar";
class PricingAdminResponseError extends Error {}
function pricingAdminFailure(error: unknown, fallback: string) {
  return error instanceof PricingAdminResponseError
    ? error.message
    : waitFailureMessage(error, fallback);
}
export function RenewalPricingPolicyAdmin({
  olderRules = [],
}: Readonly<{
  /** S250 R-S250-9: the older (S62) portfolio rules, listed beside the standing agreements. */
  olderRules?: readonly OwnerPolicyRule[];
}> = {}) {
  const [policies, setPolicies] = useState<RenewalPricingPolicy[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [policy, setPolicy] = useState(blank),
    [valueEntry, setValueEntry] = useState(String(blank.value)),
    [policyErrors, setPolicyErrors] = useState<Partial<Record<PolicyField, string>>>({}),
    [version, setVersion] = useState(0),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const [portfolio, setPortfolio] = useState(""),
    [assigned, setAssigned] = useState(""),
    [assignmentVersion, setAssignmentVersion] = useState(0),
    [assignmentRead, setAssignmentRead] = useState(""),
    [assignmentLoading, setAssignmentLoading] = useState(false),
    [portfolioError, setPortfolioError] = useState("");
  const portfolioId = portfolio.trim();
  const assignmentReady =
    PORTFOLIO_ID.test(portfolioId) && assignmentRead === portfolioId;
  const amountRequired = policyNeedsAmount(policy.kind);
  const lock = useRef(false),
    intent = useRef<{ key: string; body: object } | null>(null),
    assignmentReadRun = useRef(0);
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
  function clearPolicyError(field: PolicyField) {
    if (policyErrors[field]) setPolicyErrors((old) => ({ ...old, [field]: undefined }));
  }
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
    if (lock.current) return;
    const next = {
      ...policy,
      id: policy.id || crypto.randomUUID(),
      value: amountRequired && valueEntry.trim() ? Number(valueEntry) : null,
    };
    const checked = RenewalPricingPolicyInputSchema.safeParse(next);
    if (!checked.success) {
      const messages: Partial<Record<PolicyField, string>> = {};
      const fieldMessages: Record<PolicyField, string> = {
        name: policy.name.trim()
          ? "Use a policy name of 100 characters or fewer."
          : "Enter a policy name.",
        value:
          policy.kind === "percentage"
            ? "Enter a percent greater than zero and at most 100."
            : "Enter an increase greater than zero and at most $1,000,000.",
        effectiveFrom: "Choose the date the policy takes effect.",
        effectiveThrough:
          "Choose an end date on or after the effective date, or leave it blank.",
        purpose: policy.purpose.trim()
          ? "Use 1,000 characters or fewer for the purpose and change context."
          : "Enter the purpose and change context.",
      };
      for (const issue of checked.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && Object.hasOwn(POLICY_INPUT_IDS, field))
          messages[field as PolicyField] = fieldMessages[field as PolicyField];
      }
      const first = (Object.keys(messages) as PolicyField[])[0];
      setPolicyErrors(messages);
      setMessage(first ? "" : "Review the pricing policy fields, then save again.");
      if (first) document.getElementById(POLICY_INPUT_IDS[first])?.focus();
      return;
    }
    setPolicyErrors({});
    if (!policy.id) setPolicy({ ...policy, id: checked.data.id });
    const result = await command({
      action: "policy",
      policy: checked.data,
      expectedVersion: version,
    });
    if (result?.policy) {
      setVersion(result.policy.version);
      await load();
    }
  }
  async function readAssignment() {
    if (!PORTFOLIO_ID.test(portfolioId)) {
      setPortfolioError(
        "Enter a RentVine portfolio ID of 1 to 10 digits, starting with 1 to 9.",
      );
      setAssignmentRead("");
      setMessage("");
      document.getElementById("pricing-portfolio")?.focus();
      return;
    }
    setPortfolioError("");
    setAssignmentRead("");
    setAssignmentLoading(true);
    setMessage("");
    const run = ++assignmentReadRun.current;
    try {
      const r = await fetch(`${endpoint}?portfolioId=${encodeURIComponent(portfolioId)}`);
      const p = await r.json();
      if (assignmentReadRun.current !== run) return;
      if (!r.ok)
        throw new PricingAdminResponseError(
          p.error ?? "Portfolio membership could not be verified.",
        );
      setAssignmentVersion(p.assignment?.version ?? 0);
      setAssigned(p.assignment?.policyId ?? "");
      setAssignmentRead(portfolioId);
      setMessage("Current portfolio assignment read.");
    } catch (e) {
      if (assignmentReadRun.current !== run) return;
      setAssignmentRead("");
      setMessage(pricingAdminFailure(e, "The portfolio assignment could not be read."));
    } finally {
      if (assignmentReadRun.current === run) setAssignmentLoading(false);
    }
  }
  function edit(id: string) {
    const p = policies.find((p) => p.id === id);
    setPolicyErrors({});
    setMessage("");
    if (!p) {
      setPolicy(blank);
      setValueEntry(String(blank.value));
      setVersion(0);
      return;
    }
    const { version, updatedAt, updatedByUid, ...input } = p;
    void updatedAt;
    void updatedByUid;
    setPolicy(input);
    setValueEntry(input.value === null ? "" : String(input.value));
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
      <Field
        htmlFor="pricing-name"
        label="Policy name"
        required
        error={policyErrors.name}
      >
        <input
          id="pricing-name"
          required
          value={policy.name}
          maxLength={100}
          onChange={(e) => {
            clearPolicyError("name");
            setPolicy({ ...policy, name: e.target.value });
          }}
        />
      </Field>
      <Field htmlFor="pricing-kind" label="Policy type">
        <select
          id="pricing-kind"
          value={policy.kind}
          onChange={(e) => {
            const kind = e.target.value as RenewalPricingPolicyInput["kind"];
            if (policyNeedsAmount(kind) !== amountRequired)
              setValueEntry(policyNeedsAmount(kind) ? String(blank.value) : "");
            clearPolicyError("value");
            setPolicy({ ...policy, kind });
          }}
        >
          <option value="percentage">Percentage increase</option>
          <option value="fixed_dollar">Fixed dollar increase</option>
          <option value="no_increase">No increase</option>
          <option value="manual_review">Manual review</option>
        </select>
      </Field>
      {amountRequired ? (
        <Field
          htmlFor="pricing-value"
          label={policy.kind === "percentage" ? "Increase percent" : "Increase dollars"}
          required
          error={policyErrors.value}
        >
          <input
            id="pricing-value"
            required
            type="number"
            step="0.01"
            value={valueEntry}
            onChange={(e) => {
              clearPolicyError("value");
              setValueEntry(e.target.value);
            }}
          />
        </Field>
      ) : null}
      <Field
        htmlFor="pricing-from"
        label="Effective from"
        required
        error={policyErrors.effectiveFrom}
        hint={
          policy.effectiveFrom ? formatCalendarDate(policy.effectiveFrom) : "MM/DD/YYYY"
        }
      >
        <input
          id="pricing-from"
          required
          type="date"
          value={policy.effectiveFrom}
          onChange={(e) => {
            clearPolicyError("effectiveFrom");
            clearPolicyError("effectiveThrough");
            setPolicy({ ...policy, effectiveFrom: e.target.value });
          }}
        />
      </Field>
      <Field
        htmlFor="pricing-through"
        label="Effective through (optional)"
        error={policyErrors.effectiveThrough}
      >
        <input
          id="pricing-through"
          type="date"
          value={policy.effectiveThrough ?? ""}
          onChange={(e) => {
            clearPolicyError("effectiveThrough");
            setPolicy({ ...policy, effectiveThrough: e.target.value || null });
          }}
        />
      </Field>
      <Field
        htmlFor="pricing-purpose"
        label="Purpose and change context"
        required
        error={policyErrors.purpose}
      >
        <textarea
          id="pricing-purpose"
          required
          maxLength={1000}
          value={policy.purpose}
          onChange={(e) => {
            clearPolicyError("purpose");
            setPolicy({ ...policy, purpose: e.target.value });
          }}
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
      <Field
        htmlFor="pricing-portfolio"
        label="RentVine portfolio ID"
        required
        error={portfolioError}
      >
        <input
          id="pricing-portfolio"
          required
          inputMode="numeric"
          value={portfolio}
          onChange={(e) => {
            setPortfolio(e.target.value);
            setPortfolioError("");
            if (e.target.value.trim() !== portfolioId) {
              assignmentReadRun.current += 1;
              setAssignmentRead("");
              setAssignmentLoading(false);
            }
          }}
        />
      </Field>
      <Button
        busy={assignmentLoading}
        onClick={() => void readAssignment()}
        disabled={pending || assignmentLoading}
      >
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
        disabled={pending || assignmentLoading || !assignmentReady}
        onClick={() =>
          void command({
            action: "assignment",
            scope: "portfolio",
            sourceId: portfolioId,
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
      <PortfolioStandingAgreementEditor
        policies={policies}
        command={command}
        pending={pending}
        olderRules={olderRules}
      />
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

interface PortfolioAgreementRow extends StandingAgreement {
  rule: string | null;
  ruleVersion: number | null;
  active: boolean;
}
const emptyPortfolioAgreement: StandingAgreementInput = {
  id: "",
  name: "",
  policyId: "",
  portfolioId: "",
  preApprovalStatement: "",
  effectiveFrom: "",
  endsOn: null,
  agreedBy: "",
  agreedHow: "",
  agreedWhen: "",
  revoked: false,
};
/**
 * S250 R-S250-1 (ARCH-S250-1): an owner's standing agreement, set once for the owner's verified
 * portfolio: its name, the pricing rule as an existing policy, the owner's pre-approval in words,
 * when it takes effect and ends, and who agreed, how and when. Only an Admin saves it; each save
 * keeps the earlier version. It lists beside the exact per-cycle agreements below (R-S250-9).
 */
function PortfolioStandingAgreementEditor({
  policies,
  command,
  pending,
  olderRules,
}: Readonly<{
  policies: RenewalPricingPolicy[];
  command: (
    input: object,
  ) => Promise<{ standingAgreement?: StandingAgreement } | undefined>;
  pending: boolean;
  olderRules: readonly OwnerPolicyRule[];
}>) {
  const [agreement, setAgreement] = useState(emptyPortfolioAgreement),
    [version, setVersion] = useState(0),
    [rows, setRows] = useState<PortfolioAgreementRow[]>([]),
    [exactRows, setExactRows] = useState<StandingOwnerAgreement[] | null>(null),
    [notice, setNotice] = useState(""),
    [errors, setErrors] = useState<Partial<Record<keyof StandingAgreementInput, string>>>(
      {},
    );
  function change<K extends keyof StandingAgreementInput>(
    key: K,
    value: StandingAgreementInput[K],
  ) {
    setAgreement((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }
  const read = useCallback(async () => {
    try {
      const r = await fetch(`${endpoint}?standing=all`);
      const p = await r.json();
      if (!r.ok)
        throw new PricingAdminResponseError(
          p.error ?? "Standing agreements could not be read.",
        );
      setRows(p.standingAgreements ?? []);
      setExactRows(p.exactAgreements ?? []);
    } catch (e) {
      setNotice(pricingAdminFailure(e, "Standing agreements could not be read."));
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void read(), 0);
    return () => clearTimeout(timer);
  }, [read]);
  function edit(id: string) {
    setErrors({});
    const row = rows.find((entry) => entry.id === id);
    if (!row) {
      setAgreement(emptyPortfolioAgreement);
      setVersion(0);
      return;
    }
    setAgreement({
      id: row.id,
      name: row.name,
      policyId: row.policyId,
      portfolioId: row.portfolioId,
      preApprovalStatement: row.preApprovalStatement ?? "",
      effectiveFrom: row.effectiveFrom,
      endsOn: row.endsOn,
      agreedBy: row.agreedBy,
      agreedHow: row.agreedHow,
      agreedWhen: row.agreedWhen,
      revoked: row.revoked,
    });
    setVersion(row.version);
  }
  async function save() {
    const next = {
      ...agreement,
      id: agreement.id || crypto.randomUUID(),
      preApprovalStatement: agreement.preApprovalStatement?.trim()
        ? agreement.preApprovalStatement.trim()
        : null,
      endsOn: agreement.endsOn || null,
    };
    const checked = StandingAgreementInputSchema.safeParse(next);
    if (!checked.success) {
      const messages: Partial<Record<keyof StandingAgreementInput, string>> = {};
      const fieldMessages: Partial<Record<keyof StandingAgreementInput, string>> = {
        name: agreement.name.trim()
          ? "Use an agreement name of 100 characters or fewer."
          : "Enter an agreement name.",
        policyId: "Choose a pricing rule.",
        portfolioId:
          "Enter a RentVine portfolio ID of 1 to 10 digits, starting with 1 to 9.",
        preApprovalStatement:
          "Use a pre-approval statement of 1,000 characters or fewer.",
        effectiveFrom: "Choose the date the agreement takes effect.",
        endsOn:
          "Choose an end date on or after the date the agreement takes effect, or leave it blank.",
        agreedBy: agreement.agreedBy.trim()
          ? "Use 200 characters or fewer for who agreed."
          : "Enter who agreed.",
        agreedHow: agreement.agreedHow.trim()
          ? "Use 300 characters or fewer for how they agreed."
          : "Enter how they agreed.",
        agreedWhen: agreement.agreedWhen.trim()
          ? "Use 200 characters or fewer for when they agreed."
          : "Enter when they agreed.",
      };
      for (const issue of checked.error.issues) {
        const key = (issue.path[0] ?? "endsOn") as keyof StandingAgreementInput;
        messages[key] = fieldMessages[key] ?? "Review this agreement field.";
      }
      setErrors(messages);
      const first = Object.keys(messages)[0];
      document
        .getElementById(
          first === "policyId"
            ? "standing-policy"
            : first === "preApprovalStatement"
              ? "standing-pre-approval"
              : `standing-${first}`,
        )
        ?.focus();
      return;
    }
    setErrors({});
    if (!agreement.id) setAgreement({ ...agreement, id: next.id });
    const result = await command({
      action: "standing_agreement",
      agreement: checked.data,
      expectedVersion: version,
    });
    if (result?.standingAgreement) {
      setVersion(result.standingAgreement.version);
      setNotice(
        `Saved version ${result.standingAgreement.version}. Earlier versions are kept. Nothing was sent and no RentVine rent changed.`,
      );
      await read();
    }
  }
  const text = (
    key: "name" | "portfolioId" | "agreedBy" | "agreedHow" | "agreedWhen",
    label: string,
    hint?: string,
  ) => (
    <Field
      htmlFor={`standing-${key}`}
      label={label}
      hint={hint}
      required
      error={errors[key]}
    >
      <input
        id={`standing-${key}`}
        required
        inputMode={key === "portfolioId" ? "numeric" : undefined}
        maxLength={
          key === "name"
            ? 100
            : key === "agreedHow"
              ? 300
              : key === "portfolioId"
                ? undefined
                : 200
        }
        value={agreement[key]}
        onChange={(e) => change(key, e.target.value)}
      />
    </Field>
  );
  return (
    <section aria-label="Standing agreements by owner portfolio" className="ui-stack">
      <h3>Standing agreements by owner portfolio</h3>
      <p className="muted">
        An owner agrees once to a pricing rule for every renewal in their portfolio. Staff
        then choose it on a lease as its Pricing basis for this lease only or for every
        lease in this owner&rsquo;s portfolio.
      </p>
      {rows.length ? (
        <ul aria-label="Recorded standing agreements">
          {rows.map((row) => (
            <li key={row.id}>
              {row.name}: {row.rule ?? "rule not in effect"}, portfolio {row.portfolioId},
              version {row.version}
              {row.revoked
                ? ", revoked"
                : row.active
                  ? ", in effect"
                  : ", not in effect"}{" "}
              <button className="text-link" onClick={() => edit(row.id)} type="button">
                Edit
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No standing agreement is recorded yet.</p>
      )}
      {/* R-S250-9: the records that keep working as they do today, beside the new ones. */}
      <h4>Exact per-cycle agreements</h4>
      <p>
        Each covers only its listed leases, one cycle and its exact rent and dates, as
        before. Inspect or revoke one under Standing owner authority below.
      </p>
      {exactRows === null ? null : exactRows.length ? (
        <ul aria-label="Exact per-cycle agreements">
          {exactRows.map((row) => (
            <li key={row.id}>
              Portfolio {row.portfolioId}, leases {row.leaseIds.join(", ")}, cycle{" "}
              {formatCalendarDate(row.cycleDate)}: {usd(row.terms.rent)} from{" "}
              {formatCalendarDate(row.terms.effectiveDate)} to{" "}
              {formatCalendarDate(row.terms.endDate)}, version {row.version}
              {row.revoked ? ", revoked" : `, until ${formatCalendarDate(row.expiresOn)}`}
            </li>
          ))}
        </ul>
      ) : (
        <p>No exact per-cycle agreement is recorded.</p>
      )}
      <h4>Older portfolio rules</h4>
      <p>
        Legacy rules retain their original values and history. A reusable assignment
        replaces their future proposal basis; it does not rewrite an old approval.
      </p>
      {olderRules.length ? (
        <ul aria-label="Older portfolio rules">
          {olderRules.map((rule) => (
            <li key={rule.portfolioId}>
              Portfolio {rule.portfolioId}: +{rule.percent}%, effective{" "}
              {formatCalendarDate(rule.effectiveFrom)}. {rule.note}
            </li>
          ))}
        </ul>
      ) : (
        <p>No older portfolio rule is recorded.</p>
      )}
      {text("name", "Agreement name")}
      <Field
        htmlFor="standing-policy"
        label="Pricing rule"
        required
        error={errors.policyId}
      >
        <select
          id="standing-policy"
          required
          value={agreement.policyId}
          onChange={(e) => change("policyId", e.target.value)}
        >
          <option value="">Choose a reusable policy</option>
          {policies.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      {text(
        "portfolioId",
        "RentVine portfolio ID",
        "The verified numeric portfolio id; the lease page shows the owner names for it.",
      )}
      <Field
        htmlFor="standing-pre-approval"
        label="The owner's pre-approval"
        error={errors.preApprovalStatement}
      >
        <textarea
          id="standing-pre-approval"
          rows={2}
          maxLength={1000}
          value={agreement.preApprovalStatement ?? ""}
          onChange={(e) => change("preApprovalStatement", e.target.value)}
        />
      </Field>
      <Field
        htmlFor="standing-effectiveFrom"
        label="Takes effect"
        required
        error={errors.effectiveFrom}
      >
        <input
          id="standing-effectiveFrom"
          type="date"
          required
          value={agreement.effectiveFrom}
          onChange={(e) => change("effectiveFrom", e.target.value)}
        />
      </Field>
      <Field htmlFor="standing-endsOn" label="Ends (optional)" error={errors.endsOn}>
        <input
          id="standing-endsOn"
          type="date"
          value={agreement.endsOn ?? ""}
          onChange={(e) => change("endsOn", e.target.value || null)}
        />
      </Field>
      {text("agreedBy", "Who agreed")}
      {text("agreedHow", "How they agreed")}
      {text("agreedWhen", "When they agreed")}
      <label>
        <input
          type="checkbox"
          checked={agreement.revoked}
          onChange={(e) => setAgreement({ ...agreement, revoked: e.target.checked })}
        />
        Agreement revoked
      </label>
      <p>
        <Button onClick={() => void save()} disabled={pending}>
          Save standing agreement
        </Button>{" "}
        <Button
          onClick={() => {
            setAgreement(emptyPortfolioAgreement);
            setVersion(0);
            setErrors({});
          }}
          size="compact"
          variant="tertiary"
        >
          New standing agreement
        </Button>
      </p>
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
