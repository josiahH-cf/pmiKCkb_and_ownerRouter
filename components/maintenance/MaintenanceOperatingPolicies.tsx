"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { UserActionError, actionFailureMessage } from "@/lib/ui/action-feedback";
import {
  ApplyOperatingPolicySchema,
  type ApplyOperatingPolicy,
  type OperatingPolicyHead,
  type OperatingPolicyInput,
  type OperatingPolicyVersion,
  type OperatingPolicySelection,
  operatingPolicyId,
} from "@/lib/maintenance/operating-policy";
import {
  businessDateIso,
  BUSINESS_TIME_ZONE,
} from "@/lib/lease-renewal/business-calendar";
import { resolveWallTime } from "@/lib/gmail-hub/schedule-calendar";
import { formatBusinessTimestamp } from "@/lib/date-display";
type Emergency = Extract<OperatingPolicyInput, { purpose: "emergency" }>;
type ScopeView = {
  head: OperatingPolicyHead | null;
  history: OperatingPolicyVersion[];
  nextBeforeVersion: number | null;
  applicable: OperatingPolicySelection;
};
class PolicyHttpError extends UserActionError {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
const endpoint = "/api/maintenance/operating-policies",
  param = "operating_policy_operation";
const lines = (value: string) =>
  value
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
export function MaintenanceOperatingPolicies({
  actorUid,
  canManage,
}: {
  actorUid: string;
  canManage: boolean;
}) {
  const [purpose, setPurpose] = useState<"emergency" | "chargeback">("emergency"),
    [property, setProperty] = useState(""),
    [title, setTitle] = useState(""),
    [state, setState] = useState<"draft" | "approved">("draft"),
    [from, setFrom] = useState(""),
    [expires, setExpires] = useState(""),
    [sources, setSources] = useState(""),
    [reason, setReason] = useState(""),
    [guidance, setGuidance] = useState<Emergency["guidance"]>({
      emergency_fire: null,
      urgent_flooding: null,
      urgent_property: null,
      normal: null,
    }),
    [rules, setRules] = useState<Emergency["rules"]>([]),
    [contacts, setContacts] = useState<Emergency["contacts"]>([]),
    [wording, setWording] = useState(""),
    [timing, setTiming] = useState<"after_assessment" | "after_responsibility_review">(
      "after_responsibility_review",
    ),
    [leaseRequired, setLeaseRequired] = useState(true);
  const [view, setView] = useState<ScopeView | null>(null),
    [loaded, setLoaded] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState<{
      id: string;
      command: ApplyOperatingPolicy | null;
    } | null>(null);
  const live = useRef(true),
    lock = useRef(false),
    generation = useRef(0),
    scope = property.trim()
      ? { kind: "property" as const, propertyId: property.trim() }
      : { kind: "organization" as const },
    selectedId = operatingPolicyId(purpose, scope),
    key = useCallback(
      (id: string) => `pmi-kc:operating-policy:${actorUid}:${id}`,
      [actorUid],
    );
  function address(id: string | null) {
    const u = new URL(location.href);
    if (id) u.searchParams.set(param, id);
    else u.searchParams.delete(param);
    history.replaceState(history.state, "", u);
  }
  function done(id: string) {
    setPending(null);
    address(null);
    try {
      sessionStorage.removeItem(key(id));
    } catch {}
    setLoaded("");
  }
  const recover = useCallback(
    async (id: string) => {
      if (lock.current) return;
      lock.current = true;
      setBusy(true);
      const read = ++generation.current;
      try {
        const response = await fetch(
            `${endpoint}?operation_id=${encodeURIComponent(id)}`,
            { cache: "no-store" },
          ),
          data = await response.json();
        if (!response.ok)
          throw new PolicyHttpError(
            data.error ?? "The original policy result is unavailable.",
            response.status,
          );
        if (!live.current || read !== generation.current) return;
        if (data.operationId !== id)
          throw Error("The response names another policy save.");
        if (data.state === "committed" || data.state === "cancelled") {
          setPending(null);
          const u = new URL(location.href);
          u.searchParams.delete(param);
          history.replaceState(history.state, "", u);
          try {
            sessionStorage.removeItem(key(id));
          } catch {}
          setLoaded("");
          setStatus(
            data.state === "committed"
              ? `Original policy version ${data.version.version} is recorded. Read current policy before another change.`
              : data.detail,
          );
        } else
          setStatus(
            "The original save has no settled result yet. Check it again, resume the same exact save, or stop it before admission.",
          );
      } catch (e) {
        if (live.current && read === generation.current)
          setError(
            actionFailureMessage(e, "The original policy result remains unknown."),
          );
      } finally {
        lock.current = false;
        if (live.current) setBusy(false);
      }
    },
    [key],
  );
  const invalidateReads = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    live.current = true;
    const id = new URL(location.href).searchParams.get(param);
    if (id && /^[a-f0-9-]{36}$/i.test(id)) {
      void Promise.resolve().then(() => {
        if (!live.current) return;
        let command: ApplyOperatingPolicy | null = null;
        try {
          const p = ApplyOperatingPolicySchema.safeParse(
            JSON.parse(sessionStorage.getItem(key(id)) ?? "null"),
          );
          if (p.success && p.data.operationId === id) command = p.data;
        } catch {}
        setPending({ id, command });
        void recover(id);
      });
    }
    return () => {
      live.current = false;
      invalidateReads();
    };
  }, [key, recover, invalidateReads]);
  async function read(before?: number) {
    if (lock.current || pending) return;
    lock.current = true;
    setBusy(true);
    const gen = ++generation.current,
      requested = selectedId;
    try {
      const q = new URLSearchParams({
          purpose,
          ...(property.trim() ? { property_id: property.trim() } : {}),
          ...(before ? { before_version: String(before) } : {}),
        }),
        response = await fetch(`${endpoint}?${q}`, { cache: "no-store" }),
        data = await response.json();
      if (!response.ok)
        throw new PolicyHttpError(
          data.error ?? "Current policy is unavailable.",
          response.status,
        );
      if (!live.current || gen !== generation.current) return;
      if (!Array.isArray(data.history) || !data.applicable)
        throw Error("The policy response is incomplete.");
      setView((prior) =>
        before && loaded === requested && prior
          ? { ...data, history: [...prior.history, ...data.history] }
          : data,
      );
      setLoaded(requested);
      setError("");
      setStatus(
        "Current policy and its retained history are available. Your entered words are kept.",
      );
    } catch (e) {
      if (live.current && gen === generation.current) {
        setLoaded("");
        setError(
          actionFailureMessage(
            e,
            "Current policy could not be read. Your words are kept.",
          ),
        );
      }
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function dispatch(command: ApplyOperatingPolicy) {
    if (lock.current || !canManage) return;
    lock.current = true;
    setBusy(true);
    setError("");
    generation.current++;
    setPending({ id: command.operationId, command });
    address(command.operationId);
    try {
      sessionStorage.setItem(key(command.operationId), JSON.stringify(command));
    } catch {
      setStatus(
        "Local storage is unavailable. Keep this tab for exact terms; the original result identity is in the URL.",
      );
    }
    try {
      const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(command),
        }),
        data = await response.json();
      if (!response.ok)
        throw new PolicyHttpError(
          data.error ?? "The policy save was refused.",
          response.status,
        );
      if (!live.current) return;
      if (data.operationId !== command.operationId || data.state !== "committed")
        throw Error("The policy result could not be matched to this save.");
      done(command.operationId);
      setStatus(
        `Policy version ${data.version.version} recorded. Existing historical decisions retain their original version.`,
      );
    } catch (e) {
      if (!live.current) return;
      if (e instanceof PolicyHttpError && [400, 403, 404, 409].includes(e.status ?? 0))
        done(command.operationId);
      setError(
        actionFailureMessage(
          e,
          "The response was lost. Check or resume this original save before starting another.",
        ),
      );
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  function save() {
    try {
      if (loaded !== selectedId)
        throw new UserActionError("Read this selected current policy before saving.");
      const base = {
        purpose,
        scope,
        state,
        title,
        effectiveFrom: new Date(
          resolveWallTime(from, "00:00", BUSINESS_TIME_ZONE).instantMs,
        ).toISOString(),
        expiresAt: expires
          ? new Date(
              resolveWallTime(expires, "00:00", BUSINESS_TIME_ZONE).instantMs,
            ).toISOString()
          : null,
        sourceRefs: lines(sources),
      };
      const policy =
        purpose === "emergency"
          ? { ...base, purpose: "emergency", guidance, rules, contacts }
          : {
              ...base,
              purpose: "chargeback",
              wording: wording.trim() || null,
              timing,
              reviewConditions: [
                "assessment",
                "staff_review",
                ...(leaseRequired ? ["lease_evidence"] : []),
              ],
            };
      void dispatch(
        ApplyOperatingPolicySchema.parse({
          op: "save_version",
          operationId: crypto.randomUUID(),
          expectedVersion: view?.head?.version ?? 0,
          policy,
          reason,
          reviewedExactPolicy: true,
        }),
      );
    } catch (e) {
      setError(
        actionFailureMessage(
          e,
          "Complete the actual policy terms and review them before saving.",
        ),
      );
    }
  }
  async function stop() {
    if (lock.current || !pending) return;
    lock.current = true;
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ op: "stop_before_admission", operationId: pending.id }),
        }),
        data = await response.json();
      if (!response.ok)
        throw new PolicyHttpError(
          data.error ?? "The original save could not be stopped.",
          response.status,
        );
      if (data.state === "cancelled" || data.state === "committed") {
        done(pending.id);
        setStatus(
          data.state === "cancelled"
            ? data.detail
            : "The original save was already recorded. No second version was created.",
        );
      }
    } catch (e) {
      setError(
        actionFailureMessage(
          e,
          "The original result remains unknown. Keep checking this identity.",
        ),
      );
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  function loadVersionDraft(v: OperatingPolicyVersion) {
    if (v.state === "revoked") return;
    setTitle(v.title);
    setState("draft");
    setFrom(businessDateIso(v.effectiveFrom));
    setExpires(v.expiresAt ? businessDateIso(v.expiresAt) : "");
    setSources(v.sourceRefs.join("\n"));
    setReason("");
    if (v.purpose === "emergency") {
      setGuidance(v.guidance);
      setRules(v.rules);
      setContacts(v.contacts);
    } else {
      setWording(v.wording ?? "");
      setTiming(v.timing);
      setLeaseRequired(v.reviewConditions.includes("lease_evidence"));
    }
  }
  return (
    <section className="ui-stack maintenance-operating-policies">
      <Link href="/maintenance">Back to maintenance</Link>
      <h1>Maintenance operating policies</h1>
      <p>
        Approved emergency guidance and responsibility guidance have separate purposes.
        Existing fire and flooding guidance remains available until applicable replacement
        wording is approved. Standing owner spending authority is maintained separately.
      </p>
      <fieldset disabled={busy || !!pending}>
        <legend>Select current policy</legend>
        <label className="field">
          Purpose
          <select
            value={purpose}
            onChange={(e) => {
              setPurpose(e.target.value as typeof purpose);
              generation.current++;
            }}
          >
            <option value="emergency">Emergency guidance and staff routing</option>
            <option value="chargeback">Responsibility and chargeback guidance</option>
          </select>
        </label>
        <label className="field">
          Actual property ID (blank for organization)
          <input
            value={property}
            maxLength={10}
            onChange={(e) => {
              setProperty(e.target.value);
              generation.current++;
            }}
          />
        </label>
        <button type="button" onClick={() => void read()}>
          Read selected current policy
        </button>
      </fieldset>
      {view && loaded === selectedId ? (
        <div>
          <h2>Currently applicable</h2>
          <p>{view.applicable.detail}</p>
          {view.applicable.policy ? (
            <p>
              {view.applicable.policy.title} · approved version{" "}
              {view.applicable.policy.version} · effective{" "}
              {formatBusinessTimestamp(view.applicable.policy.effectiveFrom)}
            </p>
          ) : (
            <p>
              Replacement policy is unset. No new liability rule, emergency contact or
              response promise is inferred.
            </p>
          )}
          <p>Saved scope version: {view.head?.version ?? 0}.</p>
        </div>
      ) : null}
      {canManage ? (
        <fieldset disabled={busy || !!pending || loaded !== selectedId}>
          <legend>Maintain actual reviewed policy</legend>
          <label className="field">
            Policy title
            <input
              value={title}
              maxLength={400}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
            />
          </label>
          <label className="field">
            Saved state
            <select
              value={state}
              onChange={(e) => {
                setState(e.target.value as typeof state);
              }}
            >
              <option value="draft">Draft; does not govern work</option>
              <option value="approved">Approved actual policy</option>
            </select>
          </label>
          <label className="field">
            Effective date ({BUSINESS_TIME_ZONE})
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
              }}
            />
          </label>
          <label className="field">
            Expires at start of date (optional)
            <input
              type="date"
              value={expires}
              onChange={(e) => {
                setExpires(e.target.value);
              }}
            />
          </label>
          <label className="field">
            Actual policy source evidence (one per line)
            <textarea
              value={sources}
              maxLength={40000}
              onChange={(e) => {
                setSources(e.target.value);
              }}
            />
          </label>
          {purpose === "emergency" ? (
            <>
              <p>
                Leave a guidance box blank to keep the existing approved acknowledgement
                for that urgency.
              </p>
              {Object.entries({
                emergency_fire: "Life-safety guidance",
                urgent_flooding: "Active flooding guidance",
                urgent_property: "Urgent property-condition guidance",
                normal: "Ordinary report acknowledgement",
              }).map(([k, label]) => (
                <label className="field" key={k}>
                  {label}
                  <textarea
                    value={guidance[k as keyof typeof guidance] ?? ""}
                    maxLength={8000}
                    onChange={(e) => {
                      setGuidance((g) => ({ ...g, [k]: e.target.value || null }));
                    }}
                  />
                </label>
              ))}
              <h3>Additional actual approved urgency rules</h3>
              {rules.map((rule, i) => (
                <div key={i} className="ui-stack">
                  <label className="field">
                    Whole word or phrase {i + 1}
                    <input
                      value={rule.term}
                      maxLength={100}
                      onChange={(e) => {
                        setRules((rows) =>
                          rows.map((r, n) =>
                            n === i ? { ...r, term: e.target.value } : r,
                          ),
                        );
                      }}
                    />
                  </label>
                  <label className="field">
                    Urgency {i + 1}
                    <select
                      value={rule.urgency}
                      onChange={(e) => {
                        setRules((rows) =>
                          rows.map((r, n) =>
                            n === i
                              ? { ...r, urgency: e.target.value as typeof r.urgency }
                              : r,
                          ),
                        );
                      }}
                    >
                      <option value="emergency_fire">Life safety</option>
                      <option value="urgent_flooding">Active flooding</option>
                      <option value="urgent_property">Urgent property condition</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setRules((rows) => rows.filter((_, n) => n !== i));
                    }}
                  >
                    Remove rule {i + 1}
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={rules.length >= 100}
                onClick={() => {
                  setRules((rows) => [...rows, { term: "", urgency: "urgent_property" }]);
                }}
              >
                Add approved rule
              </button>
              <h3>Verified staff escalation configuration</h3>
              <p>
                Saving records a staff-verified routing reference. It does not place a
                call, send a message, dispatch a vendor or establish provider takeover.
              </p>
              {contacts.map((contact, i) => (
                <fieldset key={contact.id}>
                  <legend>Escalation reference {i + 1}</legend>
                  {(
                    [
                      "responsibility",
                      "destination",
                      "coverage",
                      "takeoverExpectation",
                      "verificationEvidence",
                    ] as const
                  ).map((k) => (
                    <label className="field" key={k}>
                      {
                        {
                          responsibility: "Actual responsibility",
                          destination: "Verified destination",
                          coverage: "Actual availability and coverage",
                          takeoverExpectation: "Actual human takeover expectation",
                          verificationEvidence:
                            "Contact and coverage verification evidence",
                        }[k]
                      }
                      <textarea
                        value={contact[k]}
                        maxLength={k === "verificationEvidence" ? 2000 : 1000}
                        onChange={(e) => {
                          setContacts((rows) =>
                            rows.map((c, n) =>
                              n === i ? { ...c, [k]: e.target.value } : c,
                            ),
                          );
                        }}
                      />
                    </label>
                  ))}
                  <label className="field">
                    Supported channel
                    <select
                      value={contact.channel}
                      onChange={(e) => {
                        setContacts((rows) =>
                          rows.map((c, n) =>
                            n === i
                              ? { ...c, channel: e.target.value as typeof c.channel }
                              : c,
                          ),
                        );
                      }}
                    >
                      <option value="phone">Phone reference</option>
                      <option value="email">Email reference</option>
                      <option value="internal">Existing internal route</option>
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={contact.enabled}
                      onChange={(e) => {
                        setContacts((rows) =>
                          rows.map((c, n) =>
                            n === i
                              ? {
                                  ...c,
                                  enabled: e.target.checked,
                                  verifiedAt: new Date().toISOString(),
                                }
                              : c,
                          ),
                        );
                      }}
                    />
                    I have verified this actual destination, coverage and takeover
                    expectation; enable the reference
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setContacts((rows) => rows.filter((_, n) => n !== i));
                    }}
                  >
                    Remove reference {i + 1}
                  </button>
                </fieldset>
              ))}
              <button
                type="button"
                disabled={contacts.length >= 20}
                onClick={() => {
                  setContacts((rows) => [
                    ...rows,
                    {
                      id: crypto.randomUUID(),
                      responsibility: "",
                      channel: "phone",
                      destination: "",
                      coverage: "",
                      takeoverExpectation: "",
                      verificationEvidence: "",
                      verifiedAt: new Date().toISOString(),
                      enabled: false,
                    },
                  ]);
                }}
              >
                Add actual escalation reference
              </button>
            </>
          ) : (
            <>
              <label className="field">
                Actual approved responsibility wording
                <textarea
                  value={wording}
                  maxLength={8000}
                  onChange={(e) => {
                    setWording(e.target.value);
                  }}
                />
              </label>
              <label className="field">
                Approved timing
                <select
                  value={timing}
                  onChange={(e) => {
                    setTiming(e.target.value as typeof timing);
                  }}
                >
                  <option value="after_assessment">
                    After completed staff assessment
                  </option>
                  <option value="after_responsibility_review">
                    After evidence-backed responsibility review
                  </option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={leaseRequired}
                  onChange={(e) => {
                    setLeaseRequired(e.target.checked);
                  }}
                />
                Actual reviewed lease evidence is required
              </label>
              <p>
                Staff assessment and staff review remain required. No automatic liability
                warning is added to intake.
              </p>
            </>
          )}
          <label className="field">
            Change, correction or revocation reason
            <textarea
              value={reason}
              maxLength={4000}
              onChange={(e) => {
                setReason(e.target.value);
              }}
            />
          </label>
          <button
            type="button"
            disabled={!reason.trim() || !title.trim() || !from}
            onClick={save}
          >
            Save reviewed policy version
          </button>
        </fieldset>
      ) : (
        <p>
          A current Admin maintains actual policy. Staff can inspect applicable guidance
          and history.
        </p>
      )}
      {pending ? (
        <div>
          <p>A policy save needs its original result checked.</p>
          <button type="button" disabled={busy} onClick={() => void recover(pending.id)}>
            Check original policy save
          </button>
          {pending.command ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void dispatch(pending.command!)}
            >
              Resume the same exact policy save
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={() => void stop()}>
            Stop original save before admission
          </button>
        </div>
      ) : null}
      {view && loaded === selectedId ? (
        <section>
          <h2>Retained policy history</h2>
          {view.history.map((v) => (
            <article key={v.version}>
              <h3>
                {v.title} · version {v.version} · {v.state}
              </h3>
              <p>
                {formatBusinessTimestamp(v.recordedAt)} · {v.recordedBy} · {v.reason}
              </p>
              <p>
                Effective {formatBusinessTimestamp(v.effectiveFrom)}
                {v.expiresAt
                  ? ` until ${formatBusinessTimestamp(v.expiresAt)}`
                  : "; no expiry recorded"}
              </p>
              <ul>
                {v.sourceRefs.map((ref) => (
                  <li key={ref}>{ref}</li>
                ))}
              </ul>
              {v.purpose === "emergency" ? (
                <>
                  <p>{v.guidance.emergency_fire}</p>
                  <p>{v.guidance.urgent_flooding}</p>
                  <p>{v.guidance.urgent_property}</p>
                  <p>{v.guidance.normal}</p>
                </>
              ) : (
                <p>{v.wording}</p>
              )}
              {canManage && v.state !== "revoked" ? (
                <>
                  <button
                    type="button"
                    disabled={busy || !!pending}
                    onClick={() => loadVersionDraft(v)}
                  >
                    Use version {v.version} as an editable draft
                  </button>
                  {[
                    view.head?.activeVersion,
                    view.head?.scheduledVersion,
                    view.head?.draftVersion,
                  ].includes(v.version) ? (
                    <button
                      type="button"
                      disabled={busy || !!pending || !reason.trim()}
                      onClick={() =>
                        void dispatch({
                          op: "revoke_version",
                          operationId: crypto.randomUUID(),
                          expectedVersion: view.head!.version,
                          purpose,
                          scope,
                          targetVersion: v.version,
                          reason,
                        })
                      }
                    >
                      Revoke selected version {v.version}
                    </button>
                  ) : null}
                </>
              ) : null}
            </article>
          ))}
          {view.nextBeforeVersion ? (
            <button
              type="button"
              disabled={busy || !!pending}
              onClick={() => void read(view.nextBeforeVersion!)}
            >
              Read older policy versions
            </button>
          ) : null}
        </section>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
