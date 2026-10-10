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
  RenewalPricingPolicy,
  RenewalPolicyProposal,
} from "@/lib/lease-renewal/renewal-pricing-policy";
import type { PricingAssignment } from "@/lib/firestore/renewal-pricing-policies";
class PricingResponseError extends Error {}
function pricingFailure(e: unknown, fallback: string) {
  return e instanceof PricingResponseError ? e.message : waitFailureMessage(e, fallback);
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
  authority: { covered: boolean; reason: string };
  prefill: {
    value: number;
    policyVersion: number;
    policyId: string;
    reason: string;
  } | null;
  workingRevision: number;
  manualRevision: number;
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
export function useStandingOwnerAuthority(manualRevision: number) {
  const c = useRenewalPricingPolicy();
  return c?.view?.manualRevision === manualRevision && c.view.authority.covered === true;
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
/** A normal Save assigns a policy; it neither sends a message nor records an owner decision. */
export function RenewalPricingPolicyPanel() {
  const c = useRenewalPricingPolicy();
  const [chosen, setChosen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const intent = useRef<{ key: string; body: object } | null>(null);
  const lock = useRef(false);
  const htmlId = useId();
  if (!c) return null;
  const { view } = c;
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
      data-renewal-focus-context
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
          <p role="status">{view.authority.reason}</p>
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
