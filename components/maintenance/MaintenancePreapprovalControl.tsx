"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card } from "@/components/ui";
import {
  formatPreapprovalAmount,
  parsePreapprovalAmountCents,
  type MaintenancePropertyPreapproval,
} from "@/lib/maintenance/property-preapproval";

/**
 * S108: the Admin-managed property maintenance preapproval.
 *
 * The amount is the exact figure an Admin reads from the owner's records. It decides only whether
 * this app asks the owner before work proceeds; it writes nothing to RentVine and never marks a work
 * order owner approved there. Every change is confirmed from a cancel-first prompt and versioned.
 */
export function MaintenancePreapprovalControl({
  canManage,
  initialPreapprovals = [],
}: Readonly<{
  canManage: boolean;
  initialPreapprovals?: readonly MaintenancePropertyPreapproval[];
}>) {
  const router = useRouter();
  const [preapprovals, setPreapprovals] =
    useState<readonly MaintenancePropertyPreapproval[]>(initialPreapprovals);
  const [propertyKey, setPropertyKey] = useState("");
  const [amount, setAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<
    { kind: "set"; amountCents: number } | { kind: "clear"; propertyKey: string } | null
  >(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  if (!canManage) {
    return (
      <Card ariaLabel="Property preapprovals" title="Property preapprovals">
        <p className="muted">
          Property preapproval amounts come from the owner&apos;s records and are managed
          by an Admin in Maintenance. The list below is read-only for your role.
        </p>
        <PreapprovalList preapprovals={preapprovals} />
      </Card>
    );
  }

  function prepare() {
    setError("");
    setStatus("");
    try {
      setConfirming({ kind: "set", amountCents: parsePreapprovalAmountCents(amount) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Enter an exact amount.");
    }
  }

  async function send(body: Record<string, unknown>, done: string) {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/maintenance/property-preapprovals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        preapproval?: MaintenancePropertyPreapproval | null;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "The preapproval could not be saved.");
      }
      const key = String(body.property_key ?? "");
      setPreapprovals((current) => {
        const rest = current.filter((entry) => entry.property_key !== key);
        return payload.preapproval ? [...rest, payload.preapproval] : rest;
      });
      setStatus(done);
      setConfirming(null);
      setAmount("");
      setNote("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The preapproval could not be saved.",
      );
    } finally {
      setPending(false);
    }
  }

  const ready = propertyKey.trim() !== "" && amount.trim() !== "" && effectiveFrom !== "";

  return (
    <Card ariaLabel="Property preapprovals" title="Property preapprovals">
      <p className="muted">
        Record the exact amount the owner has already authorized for a property. Work at
        or under this amount proceeds without asking the owner again; anything above it,
        and any ticket with no recorded estimate, still goes to the owner.
      </p>
      <div className="ui-rows">
        <label className="ui-field">
          <span>Property key</span>
          <input
            onChange={(event) => setPropertyKey(event.target.value)}
            placeholder="RentVine property id"
            value={propertyKey}
          />
        </label>
        <label className="ui-field">
          <span>Preapproved amount</span>
          <input
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            placeholder="500.00"
            value={amount}
          />
        </label>
        <label className="ui-field">
          <span>Effective from</span>
          <input
            onChange={(event) => setEffectiveFrom(event.target.value)}
            type="date"
            value={effectiveFrom}
          />
        </label>
        <label className="ui-field">
          <span>Where this amount came from</span>
          <input
            onChange={(event) => setNote(event.target.value)}
            placeholder="Owner agreement, dated approval, or call notes"
            value={note}
          />
        </label>
      </div>
      {confirming?.kind === "set" ? (
        <div role="status">
          <p>
            Record {formatPreapprovalAmount(confirming.amountCents)} for property{" "}
            {propertyKey.trim()}, effective {effectiveFrom}?
          </p>
          <button onClick={() => setConfirming(null)} type="button">
            Cancel
          </button>{" "}
          <button
            disabled={pending}
            onClick={() =>
              send(
                {
                  operation: "set",
                  property_key: propertyKey.trim(),
                  amount_cents: confirming.amountCents,
                  effective_from_iso: new Date(
                    `${effectiveFrom}T00:00:00Z`,
                  ).toISOString(),
                  ...(note.trim() ? { note: note.trim() } : {}),
                },
                "Preapproval recorded.",
              )
            }
            type="button"
          >
            Record this preapproval
          </button>
        </div>
      ) : (
        <button disabled={!ready || pending} onClick={prepare} type="button">
          Review this preapproval
        </button>
      )}
      {confirming?.kind === "clear" ? (
        <div role="status">
          <p>
            Remove the preapproval for property {confirming.propertyKey}? Every later
            ticket at this property goes to the owner again.
          </p>
          <button onClick={() => setConfirming(null)} type="button">
            Cancel
          </button>{" "}
          <button
            disabled={pending}
            onClick={() =>
              send(
                { operation: "clear", property_key: confirming.propertyKey },
                "Preapproval removed.",
              )
            }
            type="button"
          >
            Remove this preapproval
          </button>
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {status ? <p className="muted">{status}</p> : null}
      <PreapprovalList
        onClear={(key) => setConfirming({ kind: "clear", propertyKey: key })}
        preapprovals={preapprovals}
      />
    </Card>
  );
}

function PreapprovalList({
  preapprovals,
  onClear,
}: Readonly<{
  preapprovals: readonly MaintenancePropertyPreapproval[];
  onClear?: (propertyKey: string) => void;
}>) {
  if (preapprovals.length === 0) {
    return <p className="muted">No property has a recorded preapproval yet.</p>;
  }
  return (
    <ul className="ui-rows">
      {[...preapprovals]
        .sort((left, right) => left.property_key.localeCompare(right.property_key))
        .map((entry) => (
          <li className="ui-spread" key={entry.property_key}>
            <span>Property {entry.property_key}</span>
            <span>
              {formatPreapprovalAmount(entry.amount_cents)} since{" "}
              {entry.effective_from_iso.slice(0, 10)} (version {entry.version})
            </span>
            {onClear ? (
              <button onClick={() => onClear(entry.property_key)} type="button">
                Remove
              </button>
            ) : null}
          </li>
        ))}
    </ul>
  );
}
