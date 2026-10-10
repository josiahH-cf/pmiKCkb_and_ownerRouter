"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithDeadline as fetch, waitFailureMessage } from "@/lib/ui/fetch-lifetime";
import { formatBusinessTimestamp } from "@/lib/date-display";
import { BUSINESS_TIME_ZONE } from "@/lib/lease-renewal/business-calendar";
import { resolveWallTime } from "@/lib/gmail-hub/schedule-calendar";
import { MaintenancePreapprovalImport } from "./MaintenancePreapprovalImport";
import { Card, Button } from "@/components/ui";
import {
  ApplyMaintenancePolicyInputSchema,
  MaintenancePropertyPreapprovalSchema,
  parsePreapprovalAmountCents,
  formatPreapprovalAmount,
  type ApplyMaintenancePolicyInput,
  type MaintenancePropertyPreapproval,
  type MaintenanceStandingPolicyTerms,
} from "@/lib/maintenance/property-preapproval";
const intentParam = "maintenance_policy_operation";
class PolicyHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export function MaintenancePreapprovalControl({
  canManage,
  ownerUid,
  initialPreapprovals = [],
}: Readonly<{
  canManage: boolean;
  ownerUid?: string;
  initialPreapprovals?: readonly MaintenancePropertyPreapproval[];
}>) {
  const [records, setRecords] = useState([...initialPreapprovals]),
    [property, setProperty] = useState(""),
    [amount, setAmount] = useState(""),
    [from, setFrom] = useState(""),
    [expires, setExpires] = useState(""),
    [note, setNote] = useState(""),
    [source, setSource] = useState(""),
    [scope, setScope] = useState<"property" | "owner">("property"),
    [owner, setOwner] = useState(""),
    [properties, setProperties] = useState(""),
    [comparison, setComparison] = useState<
      MaintenanceStandingPolicyTerms["comparison"] | ""
    >(""),
    [basis, setBasis] = useState<MaintenanceStandingPolicyTerms["cost_basis"] | "">("");
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState<{
      id: string;
      command: ApplyMaintenancePolicyInput | null;
    } | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const lock = useRef(false),
    live = useRef(true),
    generation = useRef(0);
  const current = records.find((record) => record.property_key === property.trim());
  const key = useCallback(
    (id: string) => `maintenance-policy:${ownerUid}:${id}`,
    [ownerUid],
  );
  function address(id: string | null) {
    const url = new URL(location.href);
    if (id) url.searchParams.set(intentParam, id);
    else url.searchParams.delete(intentParam);
    history.replaceState(history.state, "", url);
  }
  const accept = useCallback((value: unknown) => {
    const parsed = MaintenancePropertyPreapprovalSchema.safeParse(value);
    if (!parsed.success)
      throw new Error(
        "The policy response could not be verified. Keep the original operation identity.",
      );
    setRecords((rows) => [
      ...rows.filter((row) => row.property_key !== parsed.data.property_key),
      parsed.data,
    ]);
    return parsed.data;
  }, []);
  const recover = useCallback(
    async (id: string) => {
      if (lock.current) return;
      lock.current = true;
      setBusy(true);
      const read = ++generation.current;
      try {
        const response = await fetch(
          `/api/maintenance/property-preapprovals?operation_id=${encodeURIComponent(id)}`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok)
          throw new PolicyHttpError(
            data.error ?? "The original policy receipt could not be read.",
            response.status,
          );
        if (!live.current || read !== generation.current) return;
        if (data.state === "committed") {
          accept(data.preapproval);
          setPending(null);
          address(null);
          try {
            sessionStorage.removeItem(key(id));
          } catch {}
          setMessage(
            "The original policy save is recorded. Showing the current policy; no second version was created.",
          );
        } else if (data.state === "cancelled") {
          setPending(null);
          address(null);
          try {
            sessionStorage.removeItem(key(id));
          } catch {}
          setMessage(
            "The original save was stopped before admission. Your entries are kept; read current policy before a new Save.",
          );
          setConflict(true);
        } else
          setMessage(
            "No recorded result is available yet. Keep this operation identity; absence does not prove that the save failed.",
          );
      } catch (e) {
        if (live.current && read === generation.current)
          setError(
            waitFailureMessage(
              e,
              "The policy result is still unknown. Check this same receipt again.",
            ),
          );
      } finally {
        lock.current = false;
        if (live.current) setBusy(false);
      }
    },
    [accept, key],
  );
  useEffect(() => {
    live.current = true;
    const id = new URL(location.href).searchParams.get(intentParam);
    if (id && /^[a-f0-9-]{36}$/i.test(id) && ownerUid) {
      void Promise.resolve().then(() => {
        if (!live.current) return;
        let command: ApplyMaintenancePolicyInput | null = null;
        try {
          const parsed = ApplyMaintenancePolicyInputSchema.safeParse(
            JSON.parse(sessionStorage.getItem(key(id)) ?? "null"),
          );
          if (parsed.success && parsed.data.operation_id === id) command = parsed.data;
        } catch {}
        setPending({ id, command });
        void recover(id);
      });
    }
    return () => {
      live.current = false;
    };
  }, [key, ownerUid, recover]);
  async function apply(command: ApplyMaintenancePolicyInput) {
    if (lock.current || !canManage || !ownerUid) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setPending({ id: command.operation_id, command });
    generation.current++;
    address(command.operation_id);
    try {
      sessionStorage.setItem(key(command.operation_id), JSON.stringify(command));
    } catch {
      setMessage(
        "The receipt identity is in this URL. Local storage is unavailable, so keep this tab to retain the exact entered terms.",
      );
    }
    try {
      const response = await fetch("/api/maintenance/property-preapprovals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      const data = await response.json();
      if (!response.ok)
        throw new PolicyHttpError(
          data.error ?? "The policy was not accepted.",
          response.status,
        );
      if (!live.current) return;
      if (data.operation_id !== command.operation_id)
        throw new Error("The response names another policy operation.");
      accept(data.preapproval);
      setPending(null);
      address(null);
      try {
        sessionStorage.removeItem(key(command.operation_id));
      } catch {}
      setConflict(false);
      setMessage(
        "Policy change recorded. Its reviewed terms and prior history are kept; no provider action was performed.",
      );
    } catch (e) {
      if (!live.current) return;
      if (e instanceof PolicyHttpError && [400, 403, 404, 409].includes(e.status)) {
        setPending(null);
        address(null);
        setConflict(e.status === 409);
      }
      setError(
        waitFailureMessage(
          e,
          "The policy response was lost. Check its original receipt or retry this exact save; do not start another save.",
        ),
      );
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function stop() {
    if (lock.current || !pending) return;
    lock.current = true;
    setBusy(true);
    try {
      const r = await fetch("/api/maintenance/property-preapprovals", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "stop_before_admission",
          operation_id: pending.id,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "The original save remains unresolved.");
      if (!live.current) return;
      if (data.state === "committed") accept(data.preapproval);
      else if (data.state !== "cancelled")
        throw new Error("The original policy outcome remains unknown.");
      try {
        sessionStorage.removeItem(key(pending.id));
      } catch {}
      setPending(null);
      address(null);
      setConflict(true);
      setMessage(
        data.state === "committed"
          ? "The original save committed first. Showing current policy; no second save was created."
          : "The original save was stopped before admission. Read current policy before a new Save.",
      );
    } catch (e) {
      if (live.current)
        setError(
          waitFailureMessage(e, "Keep this original operation identity and check again."),
        );
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/maintenance/property-preapprovals", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.preapprovals))
        throw new Error("Current policies could not be read. Your entries are kept.");
      const fresh = data.preapprovals.map((row: unknown) =>
        MaintenancePropertyPreapprovalSchema.parse(row),
      );
      if (live.current) {
        setRecords(fresh);
        setConflict(false);
        setError("");
        setMessage(
          "Read current policies. Your entered terms are kept; review them before a new Save.",
        );
      }
    } catch (e) {
      if (live.current)
        setError(waitFailureMessage(e, "Current policies could not be read."));
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  function save() {
    try {
      const terms = {
        scope,
        property_keys:
          scope === "property"
            ? [property.trim()]
            : properties
                .split(/[,\n]/)
                .map((v) => v.trim())
                .filter(Boolean),
        owner_ref: scope === "owner" ? owner.trim() : null,
        comparison,
        cost_basis: basis,
        evidence_ref: source,
        expires_at: expires
          ? new Date(
              resolveWallTime(expires, "00:00", BUSINESS_TIME_ZONE).instantMs,
            ).toISOString()
          : null,
        revoked_at: null,
      };
      const command = ApplyMaintenancePolicyInputSchema.parse({
        operation: "set_policy",
        property_key: property.trim(),
        expected_version: current?.version ?? 0,
        operation_id: crypto.randomUUID(),
        amount_cents: parsePreapprovalAmountCents(amount),
        effective_from_iso: new Date(
          resolveWallTime(from, "00:00", BUSINESS_TIME_ZONE).instantMs,
        ).toISOString(),
        policy_terms: terms,
        note,
      });
      void apply(command);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Complete the actual approved policy terms.",
      );
    }
  }
  return (
    <Card ariaLabel="Property preapprovals" title="Standing maintenance policy">
      <p>
        Apply real owner-approved terms after assessment. An imported limit alone does not
        establish scope, tax, markup or spending authority. Policies begin unset.
      </p>
      {canManage && ownerUid ? (
        <fieldset disabled={busy || !!pending || conflict} className="ui-stack">
          <legend>Record actual approved terms</legend>
          <label className="field">
            Property ID
            <input
              value={property}
              maxLength={200}
              onChange={(e) => setProperty(e.target.value)}
            />
          </label>
          <p>
            Current saved version: {current?.version ?? "unset"}. Saving checks this
            version and the real source.
          </p>
          <label className="field">
            Policy scope
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
            >
              <option value="property">This property</option>
              <option value="owner">Verified owner and listed properties</option>
            </select>
          </label>
          {scope === "owner" ? (
            <>
              <label className="field">
                Actual owner contact ID
                <input
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  maxLength={200}
                />
              </label>
              <label className="field">
                Applicable property IDs (at most 20)
                <textarea
                  value={properties}
                  onChange={(e) => setProperties(e.target.value)}
                  maxLength={4000}
                />
              </label>
            </>
          ) : null}
          <label className="field">
            Authorized amount
            <input
              value={amount}
              inputMode="decimal"
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="field">
            Amount boundary
            <select
              value={comparison}
              onChange={(e) => setComparison(e.target.value as typeof comparison)}
            >
              <option value="">Choose actual terms</option>
              <option value="inclusive">At or below</option>
              <option value="exclusive">Strictly below</option>
            </select>
          </label>
          <label className="field">
            Authorized cost basis
            <select
              value={basis}
              onChange={(e) => setBasis(e.target.value as typeof basis)}
            >
              <option value="">Choose actual terms</option>
              <option value="total_including_tax_and_markup">
                Total including tax and PMI markup
              </option>
              <option value="vendor_cost_including_tax">
                Vendor cost including tax; PMI markup excluded
              </option>
              <option value="vendor_cost_excluding_tax">
                Vendor cost excluding tax and PMI markup
              </option>
            </select>
          </label>
          <label className="field">
            Effective from ({BUSINESS_TIME_ZONE})
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            Expires at start of date (optional)
            <input
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </label>
          <label className="field">
            Actual approval evidence reference
            <input
              value={source}
              maxLength={1000}
              onChange={(e) => setSource(e.target.value)}
            />
          </label>
          <label className="field">
            Policy context / correction reason
            <textarea
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <Button
            onClick={save}
            disabled={
              !property.trim() ||
              !amount ||
              !from ||
              !comparison ||
              !basis ||
              !source.trim() ||
              !note.trim()
            }
          >
            Save standing policy
          </Button>
        </fieldset>
      ) : (
        <p>
          Admin maintains policy terms. Business roles and source provider approval are
          separate.
        </p>
      )}
      {pending ? (
        <div>
          <p>A policy change needs its original recorded result checked.</p>
          <Button disabled={busy} onClick={() => void recover(pending.id)}>
            Check original policy receipt
          </Button>
          <Button disabled={busy} onClick={() => void stop()}>
            Stop if not admitted
          </Button>
          {pending.command ? (
            <Button disabled={busy} onClick={() => void apply(pending.command!)}>
              Retry the same policy save
            </Button>
          ) : (
            <p>
              The receipt identity survived reload. Keep the original tab for entered
              terms that local storage did not retain.
            </p>
          )}
        </div>
      ) : null}
      <Button disabled={busy || !!pending} onClick={() => void refresh()}>
        Read current policies
      </Button>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      <ul>
        {records.map((record) => (
          <li key={record.property_key}>
            <strong>Property {record.property_key}</strong> ·{" "}
            {formatPreapprovalAmount(record.amount_cents)} · version {record.version} ·
            effective {formatBusinessTimestamp(record.effective_from_iso)}
            <p>
              {record.policy_terms
                ? `${record.policy_terms.scope}; ${record.policy_terms.comparison}; ${record.policy_terms.cost_basis}; ${record.policy_terms.revoked_at ? "revoked" : "recorded policy"}`
                : "Imported or legacy amount: policy semantics unverified"}
            </p>
            {record.policy_terms ? (
              <p>Evidence: {record.policy_terms.evidence_ref}</p>
            ) : null}
            {canManage &&
            ownerUid &&
            record.policy_terms &&
            !record.policy_terms.revoked_at ? (
              <Button
                disabled={busy || !!pending || !note.trim()}
                onClick={() =>
                  void apply({
                    operation: "revoke_policy",
                    property_key: record.property_key,
                    expected_version: record.version,
                    operation_id: crypto.randomUUID(),
                    reason: note.trim(),
                  })
                }
              >
                Revoke policy for property {record.property_key}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {canManage ? (
        <MaintenancePreapprovalImport
          onRecorded={(imported) =>
            setRecords((previous) => [
              ...previous.filter(
                (row) =>
                  !imported.some((value) => value.property_key === row.property_key),
              ),
              ...imported,
            ])
          }
        />
      ) : null}
    </Card>
  );
}
