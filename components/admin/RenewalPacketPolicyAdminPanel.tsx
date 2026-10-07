"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

// S66 (AC-S66-6, AC-S66-7): Admin configuration for renewal packets. Each form family is recorded
// as required, used when it applies, or not used; the renewal charge policy is published as a new
// immutable version. Nothing here approves a legal file, adopts a printed fee schedule from a form,
// or changes a lease's saved inputs, a frozen attempt, a RentVine charge or a Sheet value.

import { useState } from "react";

import { Button, Field } from "@/components/ui";
import { familyLabel } from "@/lib/lease-documents/artifact-catalog";
import type {
  ChargePolicyContent,
  ChargePolicyRecord,
  ChargePolicyTier,
} from "@/lib/lease-documents/charge-policy";
import { FAMILY_USE_LABELS, type FamilyUse } from "@/lib/lease-documents/family-use";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import type { FormFamilyUse } from "@/lib/lease-documents/packet-types";

export interface RenewalPacketPolicyInitial {
  familyUse: { readable: boolean; version: number; families: FormFamilyUse[] };
  chargePolicy: { readable: boolean; record: ChargePolicyRecord | null };
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function cents(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string;
  };
  return { ok: response.ok, value };
}

export function RenewalPacketPolicyAdminPanel({
  initial,
}: Readonly<{ initial: RenewalPacketPolicyInitial }>) {
  return (
    <article className="panel ui-stack" aria-labelledby="renewal-packet-policy-heading">
      <h2 id="renewal-packet-policy-heading">Renewal packet configuration</h2>
      <p className="muted">
        Record which form families each renewal packet uses and publish the charge policy
        that packets calculate from. Renewal staff review every packet before it is
        finalized.
      </p>
      <FamilyUseEditor initial={initial.familyUse} />
      <ChargePolicyEditor initial={initial.chargePolicy} />
    </article>
  );
}

function FamilyUseEditor({
  initial,
}: Readonly<{ initial: RenewalPacketPolicyInitial["familyUse"] }>) {
  const [state, setState] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const change = async (family: FormFamilyUse, use: FamilyUse) => {
    setBusy(family.kind);
    setMessage(null);
    const result = await post("/api/admin/lease-artifact-family-use", {
      kind: family.kind,
      use,
      expectedVersion: state.version,
      operationId: crypto.randomUUID(),
    });
    setBusy(null);
    const next = result.value.familyUse as
      | RenewalPacketPolicyInitial["familyUse"]
      | undefined;
    if (!result.ok || !next) {
      setMessage(String(result.value.error ?? "The change was refused."));
      return;
    }
    setState(next);
    setMessage(
      `${familyLabel(family.kind)} is now ${FAMILY_USE_LABELS[use].toLowerCase()}.`,
    );
  };
  if (!state.readable)
    return (
      <p role="alert">
        The form-family uses are unreadable. Reload before changing them.
      </p>
    );
  return (
    <div className="ui-stack-tight" data-family-use>
      <h3>Form families</h3>
      <ul className="ui-rows">
        {state.families.map((family) => (
          <li key={family.kind} data-family-use-kind={family.kind}>
            <Field
              label={familyLabel(family.kind)}
              htmlFor={`family-use-${family.kind}`}
              hint={
                family.source.system === "engineering_default"
                  ? "Engineering default until an Admin records a use."
                  : `Recorded in configuration version ${family.source.version}.`
              }
            >
              <select
                id={`family-use-${family.kind}`}
                disabled={busy !== null}
                value={family.use}
                onChange={(event) => void change(family, event.target.value as FamilyUse)}
              >
                {(Object.keys(FAMILY_USE_LABELS) as FamilyUse[]).map((use) => (
                  <option key={use} value={use}>
                    {FAMILY_USE_LABELS[use]}
                  </option>
                ))}
              </select>
            </Field>
          </li>
        ))}
      </ul>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}

interface TierDraft {
  tierId: string;
  label: string;
  min: string;
  maxExclusive: string;
  monthly: string;
  oneTime: string;
  deposit: string;
}

function tierDraft(tier: ChargePolicyTier): TierDraft {
  return {
    tierId: tier.tierId,
    label: tier.label,
    min: String(tier.min),
    maxExclusive: tier.maxExclusive === null ? "" : String(tier.maxExclusive),
    monthly: dollars(tier.monthlyCents),
    oneTime: dollars(tier.oneTimeCents),
    deposit: dollars(tier.refundableDepositCents),
  };
}

function ChargePolicyEditor({
  initial,
}: Readonly<{ initial: RenewalPacketPolicyInitial["chargePolicy"] }>) {
  const [record, setRecord] = useState(initial.record);
  const content = record?.content ?? null;
  const [rbp, setRbp] = useState(
    content?.residentBenefitPackage
      ? dollars(content.residentBenefitPackage.monthlyCents)
      : "",
  );
  const [insurance, setInsurance] = useState(
    content?.insuranceProgram ? dollars(content.insuranceProgram.monthlyCents) : "",
  );
  const [animalsOn, setAnimalsOn] = useState(Boolean(content?.animals));
  const [basis, setBasis] = useState<"weight_lb" | "fido_score">(
    content?.animals?.basis ?? "weight_lb",
  );
  const [tiers, setTiers] = useState<TierDraft[]>(
    content?.animals?.tiers.map(tierDraft) ?? [
      {
        tierId: "tier-1",
        label: "",
        min: "0",
        maxExclusive: "",
        monthly: "",
        oneTime: "",
        deposit: "",
      },
    ],
  );
  const [petRule, setPetRule] = useState(content?.animals?.treatments.pet ?? "tiered");
  const [assistanceRule, setAssistanceRule] = useState(
    content?.animals?.treatments.assistance_animal ?? "no_charge",
  );
  const [petAgreement, setPetAgreement] = useState(
    content?.animals?.agreementFor.pet ?? true,
  );
  const [assistanceAgreement, setAssistanceAgreement] = useState(
    content?.animals?.agreementFor.assistance_animal ?? false,
  );
  const [juvenile, setJuvenile] = useState<"" | "current" | "expected_adult">(
    content?.animals?.juvenileWeightBasis ?? "",
  );
  const [effectiveFrom, setEffectiveFrom] = useState(record?.effectiveFrom ?? "");
  const [today] = useState(() => businessDateIso(Date.now()));
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const build = (): ChargePolicyContent | string => {
    const money = (value: string, label: string) => {
      const parsed = cents(value);
      if (parsed === null) throw new Error(`${label}: enter an amount.`);
      return parsed;
    };
    try {
      return {
        residentBenefitPackage:
          rbp.trim() === ""
            ? null
            : { monthlyCents: money(rbp, "Resident Benefit Package") },
        insuranceProgram:
          insurance.trim() === ""
            ? null
            : { monthlyCents: money(insurance, "Insurance program") },
        animals: animalsOn
          ? {
              basis,
              tiers: tiers.map((tier, index) => ({
                tierId: tier.tierId || `tier-${index + 1}`,
                label: tier.label.trim() || `Tier ${index + 1}`,
                min: Number(tier.min),
                maxExclusive:
                  tier.maxExclusive.trim() === "" ? null : Number(tier.maxExclusive),
                monthlyCents: money(
                  tier.monthly,
                  `${tier.label || `Tier ${index + 1}`} monthly`,
                ),
                oneTimeCents: money(
                  tier.oneTime,
                  `${tier.label || `Tier ${index + 1}`} one-time`,
                ),
                refundableDepositCents: money(
                  tier.deposit,
                  `${tier.label || `Tier ${index + 1}`} deposit`,
                ),
              })),
              treatments: { pet: petRule, assistance_animal: assistanceRule },
              agreementFor: { pet: petAgreement, assistance_animal: assistanceAgreement },
              juvenileWeightBasis:
                basis === "weight_lb" && juvenile !== "" ? juvenile : null,
            }
          : null,
      };
    } catch (caught) {
      return caught instanceof Error ? caught.message : "Check the amounts.";
    }
  };

  const publish = async () => {
    setError(null);
    setMessage(null);
    const built = build();
    if (typeof built === "string") {
      setError(built);
      return;
    }
    setBusy(true);
    const result = await post("/api/admin/lease-charge-policy", {
      content: built,
      effectiveFrom,
      ...(note.trim() ? { note: note.trim() } : {}),
      expectedVersion: record?.version ?? 0,
      operationId: crypto.randomUUID(),
    });
    setBusy(false);
    const published = (
      result.value.chargePolicy as { record?: ChargePolicyRecord } | undefined
    )?.record;
    if (!result.ok || !published) {
      setError(String(result.value.error ?? "The policy was not published."));
      return;
    }
    setRecord(published);
    setNote("");
    setMessage(`Published charge policy version ${published.version}.`);
  };

  if (!initial.readable)
    return <p role="alert">The charge policy is unreadable. Reload before publishing.</p>;
  const updateTier = (index: number, change: Partial<TierDraft>) =>
    setTiers((current) =>
      current.map((tier, at) => (at === index ? { ...tier, ...change } : tier)),
    );
  return (
    <div className="ui-stack-tight" data-charge-policy>
      <h3>Renewal charge policy</h3>
      <p className="muted">
        {record
          ? `Current version ${record.version}, effective ${record.effectiveFrom}.`
          : "No charge policy is published. Packets name the charges they are waiting on."}{" "}
        Amounts here are company policy you enter; they are never read from a form.
      </p>
      <Field
        label="Resident Benefit Package, monthly"
        htmlFor="policy-rbp"
        hint="Leave empty when the package is not offered."
      >
        <input
          id="policy-rbp"
          inputMode="decimal"
          value={rbp}
          onChange={(event) => setRbp(event.target.value)}
        />
      </Field>
      <Field
        label="Insurance program, monthly"
        htmlFor="policy-insurance"
        hint="Leave empty when the program amount is not set."
      >
        <input
          id="policy-insurance"
          inputMode="decimal"
          value={insurance}
          onChange={(event) => setInsurance(event.target.value)}
        />
      </Field>
      <label>
        <input
          type="checkbox"
          checked={animalsOn}
          onChange={(event) => setAnimalsOn(event.target.checked)}
        />{" "}
        Animal charges use published tiers
      </label>
      {animalsOn ? (
        <fieldset className="ui-stack-tight">
          <legend>Animal rules</legend>
          <Field label="Tiers are by" htmlFor="policy-basis">
            <select
              id="policy-basis"
              value={basis}
              onChange={(event) =>
                setBasis(event.target.value as "weight_lb" | "fido_score")
              }
            >
              <option value="weight_lb">Weight in pounds</option>
              <option value="fido_score">FIDO score</option>
            </select>
          </Field>
          <ul className="ui-rows">
            {tiers.map((tier, index) => (
              <li key={index} data-policy-tier>
                {(
                  [
                    ["label", "Tier name"],
                    ["min", "From (inclusive)"],
                    ["maxExclusive", "Up to (exclusive, empty for no limit)"],
                    ["monthly", "Monthly amount"],
                    ["oneTime", "One-time fee"],
                    ["deposit", "Refundable deposit"],
                  ] as const
                ).map(([field, label]) => (
                  <Field
                    key={field}
                    label={label}
                    htmlFor={`policy-tier-${index}-${field}`}
                  >
                    <input
                      id={`policy-tier-${index}-${field}`}
                      value={tier[field]}
                      onChange={(event) =>
                        updateTier(index, { [field]: event.target.value })
                      }
                    />
                  </Field>
                ))}
                {tiers.length > 1 ? (
                  <Button
                    variant="tertiary"
                    size="compact"
                    onClick={() =>
                      setTiers((current) => current.filter((_, at) => at !== index))
                    }
                  >
                    Remove this tier
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <Button
            variant="tertiary"
            size="compact"
            onClick={() =>
              setTiers((current) => [
                ...current,
                {
                  tierId: `tier-${current.length + 1}`,
                  label: "",
                  min: current[current.length - 1]?.maxExclusive ?? "",
                  maxExclusive: "",
                  monthly: "",
                  oneTime: "",
                  deposit: "",
                },
              ])
            }
          >
            Add a tier
          </Button>
          <Field label="Pets are" htmlFor="policy-pet">
            <select
              id="policy-pet"
              value={petRule}
              onChange={(event) =>
                setPetRule(event.target.value as "tiered" | "no_charge")
              }
            >
              <option value="tiered">Charged by tier</option>
              <option value="no_charge">Not charged</option>
            </select>
          </Field>
          <Field label="Assistance animals are" htmlFor="policy-assistance">
            <select
              id="policy-assistance"
              value={assistanceRule}
              onChange={(event) =>
                setAssistanceRule(event.target.value as "tiered" | "no_charge")
              }
            >
              <option value="no_charge">Not charged</option>
              <option value="tiered">Charged by tier</option>
            </select>
          </Field>
          <label>
            <input
              type="checkbox"
              checked={petAgreement}
              onChange={(event) => setPetAgreement(event.target.checked)}
            />{" "}
            A pet needs the animal agreement
          </label>
          <label>
            <input
              type="checkbox"
              checked={assistanceAgreement}
              onChange={(event) => setAssistanceAgreement(event.target.checked)}
            />{" "}
            An assistance animal needs the animal agreement
          </label>
          {basis === "weight_lb" ? (
            <Field label="A juvenile animal's tier uses" htmlFor="policy-juvenile">
              <select
                id="policy-juvenile"
                value={juvenile}
                onChange={(event) =>
                  setJuvenile(event.target.value as "" | "current" | "expected_adult")
                }
              >
                <option value="">Any recorded weight</option>
                <option value="current">The current weight</option>
                <option value="expected_adult">The expected adult weight</option>
              </select>
            </Field>
          ) : null}
        </fieldset>
      ) : null}
      <Field
        label="Effective from"
        htmlFor="policy-effective"
        hint="Today or earlier. A charge policy is used from the day it is published."
      >
        <input
          id="policy-effective"
          type="date"
          max={today}
          value={effectiveFrom}
          onChange={(event) => setEffectiveFrom(event.target.value)}
        />
      </Field>
      <Field label="Note for this version (optional)" htmlFor="policy-note">
        <input
          id="policy-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <Button
        busy={busy}
        busyLabel="Publishing…"
        disabled={effectiveFrom === ""}
        onClick={() => void publish()}
      >
        Publish a new policy version
      </Button>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
