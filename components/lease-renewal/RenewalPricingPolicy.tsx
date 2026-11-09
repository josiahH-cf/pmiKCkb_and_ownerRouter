"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchWithDeadline as fetch, waitFailureMessage } from "@/lib/ui/fetch-lifetime";
import { Button, Field } from "@/components/ui";
import type {
  RenewalOwnerAuthority,
  RenewalPricingPolicy,
  RenewalPolicyProposal,
} from "@/lib/lease-renewal/renewal-pricing-policy";
import type { PricingAssignment } from "@/lib/firestore/renewal-pricing-policies";
import {
  STANDING_AGREEMENT_WORDS,
  adoptedStandingRule,
  coveredByLine,
  standingAgreementChoiceLabel,
  standingRuleContext,
  standingRuleSourceLabel,
  type PricingBasisChoice,
  type StandingAgreement,
} from "@/lib/lease-renewal/standing-agreement";
import { formatCalendarDate } from "@/lib/date-display";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";
import { useRenewalFocusView } from "./RenewalFocusViewContext";
class PricingResponseError extends Error {}
function pricingFailure(e: unknown, fallback: string) {
  return e instanceof PricingResponseError ? e.message : waitFailureMessage(e, fallback);
}
/** S250: one active standing agreement of this lease's owner, as the route lists it. */
export interface PricingStandingAgreementView extends StandingAgreement {
  rule: string | null;
  ruleVersion: number | null;
  active: boolean;
}
interface PricingView {
  policies: RenewalPricingPolicy[];
  cursor: string | null;
  policy: RenewalPricingPolicy | null;
  proposal: RenewalPolicyProposal | null;
  assignment: PricingAssignment | null;
  leaseAssignment: PricingAssignment | null;
  portfolioAssignment: PricingAssignment | null;
  policyChanged: boolean;
  authority: RenewalOwnerAuthority;
  prefill: {
    value: number;
    policyVersion: number;
    policyId: string;
    reason: string;
    /** S250 R-S250-7: the agreement rule the prefill comes from, when one covers the lease. */
    standing?: {
      agreementId: string;
      name: string;
      policyId: string;
      policyVersion: number;
      basis: string;
    };
  } | null;
  workingRevision: number;
  manualRevision: number;
  /** S250: the standing agreement applied at the winning scope, and the basis choice. */
  standingAgreement?: StandingAgreement | null;
  basisChoice?: PricingBasisChoice | null;
  basisScope?: "lease" | "portfolio" | null;
  standingAgreements?: PricingStandingAgreementView[];
  portfolioOwners?: string[];
  source?: { portfolioId: string; currentRent: number | null };
}
interface PricingContext {
  view: PricingView | null;
  error: string;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
  leaseId: string;
  canEdit: boolean;
}
const Context = createContext<PricingContext | null>(null);
export function useRenewalPricingPolicy() {
  return useContext(Context);
}

export function showsPricingBasisOnNow(
  step: { readonly stepId: string; readonly state: string } | null | undefined,
) {
  return Boolean(step && step.stepId === "ask-owner" && step.state !== "not_part");
}
/**
 * S194 binds the exact authority to the staff record revision it was read with. An S250 standing
 * agreement covers by its rule and the working rent, so a later staff record leaves it in place.
 */
export function standingAuthorityCurrent(
  view: Pick<PricingView, "authority" | "manualRevision"> | null | undefined,
  manualRevision: number,
): boolean {
  if (!view || view.authority.covered !== true) return false;
  return view.authority.kind === "standing" || view.manualRevision === manualRevision;
}
export function useStandingOwnerAuthority(manualRevision: number) {
  const c = useRenewalPricingPolicy();
  return standingAuthorityCurrent(c?.view, manualRevision);
}
export function RenewalPricingPolicyProvider({
  leaseId,
  canEdit,
  workingRevision = 0,
  children,
}: Readonly<{
  leaseId: string;
  canEdit: boolean;
  workingRevision?: number;
  children: ReactNode;
}>) {
  const [read, setRead] = useState<PricingView | null>(null);
  const [error, setError] = useState("");
  const readVersion = useRef(0);
  const reload = useCallback(async () => {
    const version = ++readVersion.current;
    try {
      const response = await fetch(
        `/api/lease-renewal/pricing-policy?leaseId=${encodeURIComponent(leaseId)}`,
      );
      const p = await response.json();
      if (!response.ok)
        throw new PricingResponseError(p.error ?? "Pricing policy could not be read.");
      if (readVersion.current !== version) return;
      setRead(p);
      setError("");
    } catch (e) {
      if (readVersion.current !== version) return;
      setRead(null);
      setError(pricingFailure(e, "Pricing policy could not be read."));
    }
  }, [leaseId]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (active) void reload();
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [reload, workingRevision]);
  const loadMore = useCallback(async () => {
    if (!read?.cursor) return;
    const version = readVersion.current;
    try {
      const response = await fetch(
        `/api/lease-renewal/pricing-policy?leaseId=${encodeURIComponent(leaseId)}&after=${encodeURIComponent(read.cursor)}`,
      );
      const p = await response.json();
      if (!response.ok)
        throw new PricingResponseError(p.error ?? "More policies could not be read.");
      if (readVersion.current !== version) return;
      setRead((old) =>
        old
          ? {
              ...p,
              policies: [
                ...new Map(
                  [...old.policies, ...p.policies].map((v) => [v.id, v]),
                ).values(),
              ],
            }
          : p,
      );
    } catch (e) {
      setError(pricingFailure(e, "More policies could not be read."));
    }
  }, [leaseId, read]);
  const view = read && read.workingRevision === workingRevision ? read : null;
  return (
    <Context.Provider value={{ view, error, reload, loadMore, leaseId, canEdit }}>
      {children}
    </Context.Provider>
  );
}
/** S250: the words a basis scope reads in. */
function scopeWords(scope: "lease" | "portfolio" | null | undefined): string {
  return scope === "portfolio"
    ? STANDING_AGREEMENT_WORDS.portfolio.toLowerCase()
    : STANDING_AGREEMENT_WORDS.leaseOnly.toLowerCase();
}

/** S250 R-S250-3 / R-S250-8: the pricing basis in force on this lease, in one line. */
export function currentPricingBasisLine(view: PricingView): string {
  const agreement = view.standingAgreement;
  if (agreement && view.basisChoice?.kind === "agreement")
    return `${standingAgreementChoiceLabel(
      agreement.name,
      view.authority.rule ??
        view.standingAgreements?.find((entry) => entry.id === agreement.id)?.rule ??
        null,
    )}, applied to ${scopeWords(view.basisScope)}`;
  if (view.basisChoice?.kind === "owner_decides")
    return `${STANDING_AGREEMENT_WORDS.ownerDecides}, chosen for ${scopeWords(view.basisScope)}`;
  return STANDING_AGREEMENT_WORDS.ownerDecides;
}

/**
 * S250 R-S250-3 (ARCH-S250-3): "Pricing basis". Staff choose "Owner decides each renewal" or one of
 * the owner's active agreements by name and rule, then "This lease only" or "Every lease in this
 * owner's portfolio", and save once with an optional reason. Nothing is preselected. It writes the
 * same assignment the policy panel reads; it sends nothing, changes no RentVine rent and records no
 * owner response.
 */
export function PricingBasisChooser({ context }: Readonly<{ context: "now" | "panel" }>) {
  const c = useRenewalPricingPolicy();
  const htmlId = useId();
  const [choice, setChoice] = useState<string | null>(null);
  const [scope, setScope] = useState<"lease" | "portfolio" | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const intent = useRef<{ key: string; body: object } | null>(null);
  if (!c) return null;
  const view = c.view;
  if (!view)
    return (
      <p className="muted" role="status">
        {c.error || "Reading the pricing basis."}
      </p>
    );
  const agreements = (view.standingAgreements ?? []).filter((entry) => entry.active);
  const portfolioId = view.source?.portfolioId ?? null;
  const owners = view.portfolioOwners ?? [];
  async function post(input: Record<string, unknown>, done: string) {
    if (!c || pending) return;
    setPending(true);
    setMessage("");
    const key = JSON.stringify(input);
    if (intent.current?.key !== key)
      intent.current = { key, body: { ...input, operationId: crypto.randomUUID() } };
    try {
      const r = await fetch("/api/lease-renewal/pricing-policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(intent.current.body),
      });
      const p = await r.json();
      if (!r.ok) {
        if (r.status === 409) await c.reload();
        throw new PricingResponseError(p.error ?? "The pricing basis was not saved.");
      }
      intent.current = null;
      await c.reload();
      setChoice(null);
      setScope(null);
      setReason("");
      setMessage(done);
    } catch (e) {
      setMessage(
        pricingFailure(
          e,
          "The response was lost. Save the same pricing basis again to recover its result.",
        ),
      );
    } finally {
      setPending(false);
    }
  }
  const save = () => {
    if (!view || !choice || !scope) return;
    const sourceId = scope === "lease" ? c.leaseId : portfolioId;
    if (!sourceId) return;
    const assignment =
      scope === "lease" ? view.leaseAssignment : view.portfolioAssignment;
    void post(
      {
        action: "pricing_basis",
        scope,
        sourceId,
        choice:
          choice === "owner_decides"
            ? { kind: "owner_decides" }
            : { kind: "agreement", agreementId: choice },
        expectedVersion: assignment?.version ?? 0,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      },
      "Pricing basis saved. Nothing was sent, no RentVine rent changed and no owner response was recorded.",
    );
  };
  const leaseChoice = view.leaseAssignment?.standing ?? null;
  return (
    <div
      className="ui-stack-tight renewal-pricing-basis"
      data-renewal-pricing-basis={context}
      id={context === "now" ? "renewal-now-pricing-basis" : "renewal-pricing-basis"}
    >
      <fieldset className="ui-stack-tight">
        <legend>{STANDING_AGREEMENT_WORDS.pricingBasis}</legend>
        <p className="muted" data-renewal-field="pricing-basis-current">
          Now: {currentPricingBasisLine(view)}.
          {portfolioId
            ? ` Owner portfolio ${portfolioId}${owners.length ? `: ${owners.join(", ")}` : ""}.`
            : ""}
        </p>
        {[
          { value: "owner_decides", label: STANDING_AGREEMENT_WORDS.ownerDecides },
          ...agreements.map((entry) => ({
            value: entry.id,
            label: standingAgreementChoiceLabel(entry.name, entry.rule),
          })),
        ].map((option) => (
          <label className="ui-row" key={option.value}>
            <input
              checked={choice === option.value}
              disabled={!c.canEdit || pending}
              name={`${htmlId}-basis`}
              onChange={() => {
                setChoice(option.value);
                setMessage("");
              }}
              type="radio"
              value={option.value}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      {choice ? (
        <fieldset className="ui-stack-tight">
          <legend>Apply it to</legend>
          {(
            [
              ["lease", STANDING_AGREEMENT_WORDS.leaseOnly],
              ["portfolio", STANDING_AGREEMENT_WORDS.portfolio],
            ] as const
          ).map(([value, label]) => (
            <label className="ui-row" key={value}>
              <input
                checked={scope === value}
                disabled={
                  !c.canEdit || pending || (value === "portfolio" && !portfolioId)
                }
                name={`${htmlId}-scope`}
                onChange={() => setScope(value)}
                type="radio"
                value={value}
              />
              {label}
            </label>
          ))}
        </fieldset>
      ) : null}
      {choice ? (
        <Field htmlFor={`${htmlId}-reason`} label="Reason (optional)">
          <input
            id={`${htmlId}-reason`}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            value={reason}
          />
        </Field>
      ) : null}
      {choice ? (
        <p>
          <Button
            busy={pending}
            disabled={!c.canEdit || pending || !scope}
            onClick={save}
            size="compact"
          >
            Save pricing basis
          </Button>
        </p>
      ) : null}
      {leaseChoice && c.canEdit ? (
        <p>
          <Button
            disabled={pending}
            onClick={() =>
              void post(
                {
                  action: "pricing_basis",
                  scope: "lease",
                  sourceId: c.leaseId,
                  choice: { kind: "clear" },
                  expectedVersion: view.leaseAssignment?.version ?? 0,
                },
                "This lease's own pricing basis was removed. The portfolio's pricing basis applies.",
              )
            }
            size="compact"
            variant="tertiary"
          >
            {STANDING_AGREEMENT_WORDS.usePortfolio}
          </Button>
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}

/**
 * S250 R-S250-8: the lease names the agreement, its rule and when it took effect, with the rent its
 * rule gives and that rent's basis in words; a lease that left the rule says why in words.
 */
export function StandingAgreementSummary() {
  const c = useRenewalPricingPolicy();
  const view = c?.view;
  const agreement = view?.standingAgreement;
  if (!view || !agreement || view.basisChoice?.kind !== "agreement") return null;
  const authority = view.authority;
  const rule =
    authority.rule ??
    view.standingAgreements?.find((entry) => entry.id === agreement.id)?.rule ??
    null;
  return (
    <div className="ui-stack-tight" data-renewal-standing-agreement={agreement.id}>
      {authority.covered && authority.kind === "standing" ? (
        <p data-renewal-field="standing-covered">{coveredByLine(agreement.name)}.</p>
      ) : (
        <p data-renewal-field="standing-left" role="status">
          {authority.reason}
        </p>
      )}
      <dl className="renewal-now-facts">
        <div>
          <dt>Standing agreement</dt>
          <dd>{agreement.name}</dd>
        </div>
        {rule ? (
          <div>
            <dt>Rule</dt>
            <dd>{rule}</dd>
          </div>
        ) : null}
        <div>
          <dt>In effect since</dt>
          <dd>
            {formatCalendarDate(agreement.effectiveFrom)}
            {agreement.endsOn ? `, ends ${formatCalendarDate(agreement.endsOn)}` : ""}
          </dd>
        </div>
        {authority.covered && authority.basis ? (
          <div>
            <dt>Rent from the rule</dt>
            <dd data-renewal-field="standing-rent">{authority.basis}</dd>
          </div>
        ) : null}
        <div>
          <dt>Agreed</dt>
          <dd>
            {agreement.agreedBy}, {agreement.agreedHow}, {agreement.agreedWhen}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * S250 R-S250-7: a rule change applies forward only. A rent adopted from the agreement's earlier
 * rule keeps its value; the message built on it reads "Built on the earlier rule" and offers to
 * rebuild with the current rule (a proposal staff confirm by choosing it).
 */
export function StandingRuleNotice() {
  const c = useRenewalPricingPolicy();
  const working = useRenewalWorkingRecord();
  const [message, setMessage] = useState("");
  const view = c?.view;
  const entry = working?.record?.fields.terms_rent ?? null;
  const adopted = entry ? adoptedStandingRule(entry) : null;
  const agreement = view?.standingAgreement ?? null;
  const rule = view?.policy ?? null;
  const amount = view?.proposal?.amount ?? null;
  if (!view || !agreement || !rule || !adopted || adopted.agreementId !== agreement.id)
    return null;
  if (adopted.policyId === rule.id && adopted.policyVersion === rule.version) return null;
  return (
    <div className="ui-stack-tight" data-renewal-field="standing-earlier-rule">
      <p className="renewal-notice" role="note">
        {STANDING_AGREEMENT_WORDS.earlierRule}. The working rent and the message built on
        it keep their value until you rebuild them.
      </p>
      {amount !== null && working?.canEdit ? (
        <p>
          <Button
            onClick={() =>
              void working
                .save("terms_rent", amount, {
                  origin: "adopted_source",
                  sourceLabel: standingRuleSourceLabel(agreement.name, rule.version),
                  context: standingRuleContext({
                    agreementId: agreement.id,
                    policyId: rule.id,
                    policyVersion: rule.version,
                    basis: view.proposal?.reason ?? agreement.name,
                  }),
                })
                .then((ok) =>
                  setMessage(
                    ok
                      ? "Rebuilt with the current rule."
                      : "The rent was not rebuilt yet. Choose it again to retry.",
                  ),
                )
            }
            size="compact"
            variant="secondary"
          >
            {STANDING_AGREEMENT_WORDS.rebuild}
          </Button>
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}

/** A normal Save assigns a policy; it neither sends a message nor records an owner decision. */
export function RenewalPricingPolicyPanel() {
  const c = useRenewalPricingPolicy();
  const display = useRenewalFocusView();
  const [chosen, setChosen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const intent = useRef<{ key: string; body: object } | null>(null);
  const lock = useRef(false);
  const htmlId = useId();
  if (!c) return null;
  const { view } = c;
  const legacy = !display?.outcomeLayout;
  const basisOnNow =
    legacy &&
    display?.view === "guided" &&
    display.nowPresentation?.state !== "not_part" &&
    (display.nowPresentation?.stepId === "compare-market" ||
      display.nowPresentation?.stepId === "ask-owner");
  const agreementOnNow =
    basisOnNow && view?.standingAgreement && view.basisChoice?.kind === "agreement";
  async function assign() {
    if (!c || !view || lock.current) return;
    lock.current = true;
    setPending(true);
    setMessage("");
    const input = {
      action: "assignment",
      scope: "lease",
      sourceId: c.leaseId,
      policyId: (chosen ?? view.leaseAssignment?.policyId ?? null) || null,
      expectedVersion: view.leaseAssignment?.version ?? 0,
      reason: reason.trim() || "Staff policy assignment",
    };
    const key = JSON.stringify(input);
    if (intent.current?.key !== key)
      intent.current = { key, body: { ...input, operationId: crypto.randomUUID() } };
    try {
      const r = await fetch("/api/lease-renewal/pricing-policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(intent.current.body),
      });
      const p = await r.json();
      if (!r.ok) {
        if (r.status === 409) await c.reload();
        throw new PricingResponseError(p.error ?? "The assignment was refused.");
      }
      intent.current = null;
      await c.reload();
      setMessage(
        "Policy assignment saved. Existing working terms and reviewed messages keep their recorded values.",
      );
    } catch (e) {
      setMessage(
        pricingFailure(
          e,
          "The response was lost. Retry the same assignment to recover its result.",
        ),
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <section
      className="panel"
      aria-label="Renewal pricing policy"
      data-renewal-focus-context={legacy ? true : undefined}
    >
      <h2>Renewal pricing policy</h2>
      <a href="/admin#admin-owner-pricing-rules">
        Manage reusable policies and agreements
      </a>
      {c.error ? (
        <p role="status">{c.error} Pricing and owner authority remain unverified.</p>
      ) : !view ? (
        <p role="status">Reading the current policy and agreement.</p>
      ) : (
        <>
          <p>
            <strong>{view.policy?.name ?? "No standing pricing policy"}</strong>
            {view.assignment
              ? ` · ${view.assignment.scope} assignment`
              : view.policy
                ? " · legacy portfolio rule"
                : " · manual review"}
          </p>
          {view.proposal ? <p>{view.proposal.reason}</p> : null}
          {view.policyChanged ? (
            <p role="status">
              The policy version changed since assignment. Previously saved terms and
              authorized communications retain their own basis.
            </p>
          ) : null}
          {legacy && !agreementOnNow ? (
            <p role="status">{view.authority.reason}</p>
          ) : null}
          {!basisOnNow ? <StandingAgreementSummary /> : null}
          {!legacy ? <StandingRuleNotice /> : null}
          {legacy ? (
            <div hidden={basisOnNow && c.canEdit}>
              <PricingBasisChooser context="panel" />
            </div>
          ) : (
            <PricingBasisChooser context="panel" />
          )}
          <details>
            <summary>Policy assignment</summary>
            <Field htmlFor={`${htmlId}-policy`} label="Lease pricing policy">
              <select
                id={`${htmlId}-policy`}
                disabled={!c.canEdit || pending}
                value={chosen ?? view.leaseAssignment?.policyId ?? ""}
                onChange={(e) => setChosen(e.target.value || "")}
              >
                <option value="">Use portfolio default or manual review</option>
                {view.policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · v{p.version}
                  </option>
                ))}
              </select>
            </Field>
            {view.cursor ? (
              <Button disabled={pending} onClick={() => void c.loadMore()}>
                Load more policies
              </Button>
            ) : null}
            <Field htmlFor={`${htmlId}-reason`} label="Assignment context">
              <input
                id={`${htmlId}-reason`}
                value={reason}
                maxLength={1000}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <Button disabled={!c.canEdit || pending} onClick={() => void assign()}>
              Save lease policy
            </Button>
          </details>
        </>
      )}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
