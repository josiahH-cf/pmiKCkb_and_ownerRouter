"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  chargeDateIso,
  type RenewalChargeInventory,
} from "@/lib/lease-renewal/writeback/charge-inventory-model";

import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import { Button, Field } from "@/components/ui";
import { can, type Role } from "@/lib/auth/roles";
import type {
  RentvineWritebackClientEffect,
  RentvineWritebackClientProposal,
} from "@/lib/lease-renewal/writeback/client-projection";

export interface RentvineWritebackEffectStatus extends RentvineWritebackClientEffect {
  execution_id: string;
  state: string;
  attempt_count: number;
  receipt?: { provider_ref: string; result_hash: string; reconciled: boolean };
  reversal_state: string | null;
}

interface ReversalPreview {
  reversalExecutionId: string;
  forwardExecutionId: string;
  previewHash: string;
  expiresAtIso: string;
  kind: "restore_dates" | "restore_charge_fields" | "delete_created_charge";
}

interface ArchivedRenewalWritebackGeneration {
  generation_preview_hash: string;
  archived_at: string;
  archived_reason: "replacement" | "discard";
  proposal: RentvineWritebackClientProposal;
  effects: RentvineWritebackEffectStatus[];
}

const KIND_LABELS = {
  renewal_dates_update: "Update lease renewal dates",
  recurring_charge_update: "Update an existing recurring charge",
  recurring_charge_create: "Create a new recurring charge",
} as const;

const REVERSAL_LABELS = {
  restore_dates: "Reversal available: restore the receipted prior dates.",
  restore_charge_fields: "Reversal available: restore the receipted prior charge fields.",
  delete_created_charge:
    "Reversal available: delete the exact unchanged receipt-bound created charge.",
} as const;

async function postWriteback(body: Record<string, unknown>) {
  return requestWriteback({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readWritebackStatus(leaseId: string) {
  return requestWriteback(
    { method: "GET", cache: "no-store" },
    `?leaseId=${encodeURIComponent(leaseId)}`,
  );
}

async function requestWriteback(init: RequestInit, query = "") {
  const response = await fetch(`/api/lease-renewal/rentvine-writeback${query}`, init);
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "The RentVine update request was declined.",
    );
  }
  return payload;
}

function describeChangeLines(effect: RentvineWritebackClientEffect): string[] {
  const lines: string[] = [];
  if (effect.kind === "renewal_dates_update") {
    const before = effect.effect.before as Record<string, string | null>;
    const after = effect.effect.after as Record<string, string | null | undefined>;
    for (const key of ["endDate", "increaseEligibilityDate"] as const) {
      if (key in after) {
        lines.push(
          `${key}: ${before[key] ?? "open-ended"} → ${after[key] ?? "open-ended"}`,
        );
      }
    }
    lines.push(`startDate stays ${before.startDate} (copied unchanged).`);
  } else if (effect.kind === "recurring_charge_update") {
    const before = effect.effect.before as Record<string, string | null>;
    const changes = effect.effect.changes as Record<string, string | null>;
    lines.push(`Charge ${String(effect.effect.chargeId)}`);
    for (const [key, value] of Object.entries(changes)) {
      lines.push(`${key}: ${before[key] ?? "open-ended"} → ${value ?? "open-ended"}`);
    }
  } else {
    const create = effect.effect.create as Record<string, string | undefined>;
    for (const [key, value] of Object.entries(create)) {
      if (value !== undefined) lines.push(`${key}: ${value}`);
    }
    lines.push("endDate omitted means the charge is open-ended.");
  }
  return lines;
}

function stateLabel(state: string): string {
  if (state === "unknown") return "Checking durable status";
  if (state === "not_started") return "Ready to confirm";
  if (state === "running") return "Awaiting a durable outcome";
  if (state === "succeeded") return "Applied with receipt";
  if (state === "ambiguous") return "Needs reconciliation";
  if (state === "failed") return "Declined by the provider";
  return state;
}

function sourceRefreshCopy(payload: Record<string, unknown>): string {
  const refresh = payload.source_refresh as
    | { status?: unknown; read_at_iso?: unknown; complete?: unknown }
    | undefined;
  if (refresh?.status === "current" && refresh.complete === true) {
    return ` The complete lease projection was re-read after the write${typeof refresh.read_at_iso === "string" ? ` at ${refresh.read_at_iso}` : ""}.`;
  }
  if (refresh?.status === "current") {
    return " The post-write lease projection read was partial; the receipt is valid, but portfolio data still needs verification.";
  }
  return " The exact receipt is valid, but the broader lease projection could not be refreshed; reload before relying on other lease values.";
}

export function RentvineUpdatesPanel({
  leaseId,
  role,
  initialProposal,
  initialEffects = null,
  initialHistory = null,
  initialInventory = null,
}: Readonly<{
  leaseId: string;
  role: Role;
  initialProposal: RentvineWritebackClientProposal | null;
  initialEffects?: RentvineWritebackEffectStatus[] | null;
  initialHistory?: ArchivedRenewalWritebackGeneration[] | null;
  initialInventory?: RenewalChargeInventory | null;
}>) {
  const router = useRouter();
  const [inventory, setInventory] = useState(initialInventory);
  const [billingIntent, setBillingIntent] = useState("recurring");
  const [proposal, setProposal] = useState(initialProposal);
  const [effects, setEffects] = useState<RentvineWritebackEffectStatus[] | null>(
    initialEffects,
  );
  const [history, setHistory] = useState<ArchivedRenewalWritebackGeneration[]>(
    initialHistory ?? [],
  );
  const [historyLoaded, setHistoryLoaded] = useState(initialHistory !== null);
  const [serverLifecycleLocked, setServerLifecycleLocked] = useState(
    initialProposal !== null && initialEffects === null,
  );
  const [armedEffect, setArmedEffect] = useState<string | null>(null);
  const [reversalPreviews, setReversalPreviews] = useState<
    Record<string, ReversalPreview>
  >({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const statusLoadedPreviewRef = useRef<string | null>(null);

  // Propose-form state (Editor+). Empty fields mean "not part of this proposal".
  const [endDate, setEndDate] = useState(initialInventory?.leaseDates.endDate ?? "");
  const [increaseEligibilityDate, setIncreaseEligibilityDate] = useState(
    initialInventory?.leaseDates.increaseEligibilityDate ?? "",
  );
  const [updateChargeId, setUpdateChargeId] = useState("");
  const [updateFields, setUpdateFields] = useState<Record<string, string>>({});
  const [createFields, setCreateFields] = useState<Record<string, string>>({});
  const [evidenceRef, setEvidenceRef] = useState("");

  // One stable clock read per mount keeps render pure; the server re-checks expiry exactly on
  // every confirmation, so this flag is advisory copy only.
  const [mountedAtMs] = useState(() => Date.now());
  const editor = can(role, "edit");
  const executor = can(role, "manageAdmin");
  const expired = proposal
    ? mountedAtMs > Date.parse(proposal.confirmation_expires_at)
    : false;
  const proposalLifecycleLocked =
    proposal !== null &&
    (effects === null ||
      serverLifecycleLocked ||
      effects.some(
        (effect) =>
          ["running", "ambiguous"].includes(effect.state) ||
          (effect.reversal_state !== null &&
            ["running", "ambiguous"].includes(effect.reversal_state)),
      ));

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "The RentVine update request was declined.",
      );
      queueMicrotask(() => errorRef.current?.focus());
    } finally {
      setPending(false);
    }
  }

  async function refreshStatus() {
    const payload = await readWritebackStatus(leaseId);
    setProposal((payload.proposal as RentvineWritebackClientProposal | null) ?? null);
    setEffects((payload.effects as RentvineWritebackEffectStatus[] | undefined) ?? null);
    setHistory(
      (payload.history as ArchivedRenewalWritebackGeneration[] | undefined) ?? [],
    );
    setHistoryLoaded(true);
    setServerLifecycleLocked(payload.lifecycle_locked === true);
  }

  useEffect(() => {
    const statusKey = proposal?.preview_hash ?? "none";
    if (proposal ? effects !== null : historyLoaded) return;
    if (statusLoadedPreviewRef.current === statusKey) return;
    statusLoadedPreviewRef.current = statusKey;
    let active = true;
    setPending(true);
    void readWritebackStatus(leaseId)
      .then((payload) => {
        if (!active) return;
        setProposal((payload.proposal as RentvineWritebackClientProposal | null) ?? null);
        setEffects(
          (payload.effects as RentvineWritebackEffectStatus[] | undefined) ?? null,
        );
        setHistory(
          (payload.history as ArchivedRenewalWritebackGeneration[] | undefined) ?? [],
        );
        setHistoryLoaded(true);
        setServerLifecycleLocked(payload.lifecycle_locked === true);
      })
      .catch((statusError) => {
        if (!active) return;
        setServerLifecycleLocked(true);
        setError(
          statusError instanceof Error
            ? statusError.message
            : "The durable RentVine update status is unavailable.",
        );
        queueMicrotask(() => errorRef.current?.focus());
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, [effects, historyLoaded, leaseId, proposal]);

  function proposedEffects(): Record<string, unknown>[] {
    const list: Record<string, unknown>[] = [];
    const after: Record<string, string> = {};
    if (endDate.trim() && endDate !== inventory?.leaseDates.endDate)
      after.endDate = endDate.trim();
    if (
      increaseEligibilityDate.trim() &&
      increaseEligibilityDate !== inventory?.leaseDates.increaseEligibilityDate
    ) {
      after.increaseEligibilityDate = increaseEligibilityDate.trim();
    }
    if (Object.keys(after).length > 0) {
      list.push({ kind: "renewal_dates_update", after });
    }
    const changes = Object.fromEntries(
      Object.entries(updateFields).filter(
        ([key, value]) =>
          value.trim() !== "" &&
          value !==
            (
              inventory?.charges.find((charge) => charge.id === updateChargeId)
                ?.projection as unknown as Record<string, unknown> | undefined
            )?.[key],
      ),
    );
    if (updateChargeId.trim() && Object.keys(changes).length > 0) {
      list.push({
        kind: "recurring_charge_update",
        chargeId: updateChargeId.trim(),
        changes,
      });
    }
    if (billingIntent === "current_base")
      return list.filter((effect) => effect.kind === "recurring_charge_update");
    const create = Object.fromEntries(
      Object.entries(createFields).filter(([, value]) => value.trim() !== ""),
    );
    if (Object.keys(create).length > 0) {
      list.push({ kind: "recurring_charge_create", create });
    }
    return list;
  }

  async function loadInventory() {
    const payload = await postWriteback({ operation: "options", leaseId });
    if (!payload.inventory) throw new Error("The verified charge list is unavailable.");
    setInventory(payload.inventory as RenewalChargeInventory);
    setNotice(
      "Current RentVine charges loaded. Select the exact billing item to correct.",
    );
  }

  async function propose() {
    const list = proposedEffects();
    if (list.length === 0) {
      throw new Error("Enter at least one exact change before saving a proposal.");
    }
    const payload = await postWriteback({
      operation: "propose",
      leaseId,
      expectedPriorPreviewHash: proposal?.preview_hash ?? null,
      evidenceRef: evidenceRef.trim() || `workspace:${leaseId}`,
      ...(billingIntent === "current_base" ? { businessIntent: "current_base" } : {}),
      effects: list,
    });
    setProposal(payload.proposal as RentvineWritebackClientProposal);
    setEffects(null);
    setServerLifecycleLocked(true);
    setNotice("Proposal saved from fresh RentVine state. Review each effect below.");
  }

  async function discard() {
    if (!proposal) return;
    await postWriteback({
      operation: "discard",
      leaseId,
      previewHash: proposal.preview_hash,
    });
    setArmedEffect(null);
    await refreshStatus();
    setNotice(
      "Proposal cleared. Any completed generation remains in immutable recovery history.",
    );
  }

  async function executeEffect(effect: RentvineWritebackClientEffect) {
    if (!proposal) return;
    const payload = await postWriteback({
      operation: "execute",
      leaseId,
      previewHash: proposal.preview_hash,
      effectHash: effect.effect_hash,
      confirm: true,
    });
    setArmedEffect(null);
    setNotice(
      payload.duplicate
        ? "This exact effect already completed; showing its durable receipt."
        : `Applied to RentVine with receipt ${String(
            (payload.receipt as { provider_ref?: string })?.provider_ref ?? "",
          )}.${payload.projection === "pending_reconciliation" ? " Evidence projection needs reconciliation." : ""}${sourceRefreshCopy(payload)}`,
    );
    await refreshStatus();
    // The response installs a short-lived source-generation barrier. Refresh the server component
    // so visible lease facts consume that barrier instead of remaining on their pre-write snapshot.
    router.refresh();
  }

  async function reconcileEffect(
    generation: RentvineWritebackClientProposal,
    effectHash: string,
  ) {
    const payload = await postWriteback({
      operation: "reconcile",
      leaseId,
      previewHash: generation.preview_hash,
      effectHash,
    });
    const receipt = payload.receipt as { outcome?: string } | undefined;
    setNotice(
      receipt?.outcome === "not_applicable"
        ? "Reconciliation confirmed the provider shows no applied effect."
        : "Reconciliation recorded a durable outcome from fresh provider state.",
    );
    await refreshStatus();
    // Successful reconciliation can install the same post-write source barrier as execution.
    // Refresh the server component so the user sees facts from that provider generation.
    router.refresh();
  }

  function reversalKey(previewHash: string, effectHash: string) {
    return `${previewHash}:${effectHash}`;
  }

  async function previewReversal(
    generation: RentvineWritebackClientProposal,
    effectHash: string,
  ) {
    const payload = await postWriteback({
      operation: "reverse_preview",
      leaseId,
      previewHash: generation.preview_hash,
      effectHash,
    });
    setReversalPreviews((current) => ({
      ...current,
      [reversalKey(generation.preview_hash, effectHash)]:
        payload.reversal as ReversalPreview,
    }));
    setNotice("Reversal preview ready. Confirming it is a separate exact action.");
  }

  async function executeReversal(
    generation: RentvineWritebackClientProposal,
    effectHash: string,
  ) {
    const key = reversalKey(generation.preview_hash, effectHash);
    const reversal = reversalPreviews[key];
    if (!reversal) return;
    const payload = await postWriteback({
      operation: "reverse_execute",
      leaseId,
      previewHash: generation.preview_hash,
      effectHash,
      reversal,
      confirm: true,
    });
    setReversalPreviews((current) =>
      Object.fromEntries(Object.entries(current).filter(([entry]) => entry !== key)),
    );
    setNotice(`Reversal applied with its own receipt.${sourceRefreshCopy(payload)}`);
    await refreshStatus();
    router.refresh();
  }

  async function reconcileReversal(
    generation: RentvineWritebackClientProposal,
    effectHash: string,
  ) {
    await postWriteback({
      operation: "reverse_reconcile",
      leaseId,
      previewHash: generation.preview_hash,
      effectHash,
    });
    setNotice("Reversal reconciliation recorded the fresh provider outcome.");
    await refreshStatus();
    router.refresh();
  }

  const statusByHash = new Map(
    (effects ?? []).map((entry) => [entry.effect_hash, entry] as const),
  );

  return (
    <article aria-labelledby="rentvine-updates-title" className="panel ui-stack">
      {proposal ? (
        <div className="ui-stack">
          <div>
            <h2 id="rentvine-updates-title">Review RentVine updates</h2>
            <p className="muted">
              Exact source: RentVine account {proposal.account}, lease {proposal.lease_id}
              , read {proposal.source_read_at}. Each effect is previewed, confirmed, and
              receipted independently; preview performs zero writes.
            </p>
          </div>
          {expired ? (
            <p className="muted" role="status">
              This proposal&apos;s confirmation window has expired. Save a fresh proposal
              to continue; the exact terms below stay visible for review.
            </p>
          ) : null}
          <ol className="ui-stack">
            {proposal.effects.map((effect) => {
              const status = statusByHash.get(effect.effect_hash);
              const state =
                effects === null ? "unknown" : (status?.state ?? "not_started");
              const reversalPreview =
                reversalPreviews[reversalKey(proposal.preview_hash, effect.effect_hash)];
              return (
                <li className="ui-stack" key={effect.effect_hash}>
                  <div>
                    <h3>{KIND_LABELS[effect.kind]}</h3>
                    <p className="muted">
                      {effect.action_key} · {stateLabel(state)}
                    </p>
                  </div>
                  <ul>
                    {describeChangeLines(effect).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p className="muted">
                    {effect.reversal_kind === "none"
                      ? `Reversal review: ${effect.reversal_reason ?? "this effect has no supported exact inverse."}`
                      : REVERSAL_LABELS[effect.reversal_kind]}
                  </p>
                  {state === "ambiguous" ? (
                    <p className="muted" role="status">
                      The provider outcome is unproven. The exact before and intended
                      after values above are the last known observations; reconciliation
                      reads fresh provider state and may report before, after, or drift
                      without claiming causality.
                    </p>
                  ) : null}
                  {status?.receipt ? (
                    <p className="muted">
                      Receipt {status.receipt.provider_ref} · result hash{" "}
                      {status.receipt.result_hash.slice(0, 16)}…
                      {status.reversal_state
                        ? ` · reversal ${stateLabel(status.reversal_state)}`
                        : ""}
                    </p>
                  ) : null}
                  {executor ? (
                    <div className="ui-actions">
                      {state === "not_started" && !expired ? (
                        armedEffect === effect.effect_hash ? (
                          <>
                            <Button
                              disabled={pending}
                              onClick={() => void run(() => executeEffect(effect))}
                            >
                              Confirm this exact effect once
                            </Button>
                            <Button
                              disabled={pending}
                              onClick={() => setArmedEffect(null)}
                              variant="secondary"
                            >
                              Keep reviewing
                            </Button>
                          </>
                        ) : (
                          <Button
                            disabled={pending}
                            onClick={() => setArmedEffect(effect.effect_hash)}
                            variant="secondary"
                          >
                            Review and confirm…
                          </Button>
                        )
                      ) : null}
                      {state === "ambiguous" || state === "running" ? (
                        <Button
                          disabled={pending}
                          onClick={() =>
                            void run(() => reconcileEffect(proposal, effect.effect_hash))
                          }
                          variant="secondary"
                        >
                          Reconcile from provider state
                        </Button>
                      ) : null}
                      {state === "succeeded" &&
                      effect.reversal_kind !== "none" &&
                      !status?.reversal_state ? (
                        reversalPreview ? (
                          <Button
                            disabled={pending}
                            onClick={() =>
                              void run(() =>
                                executeReversal(proposal, effect.effect_hash),
                              )
                            }
                          >
                            Confirm the reversal exactly once
                          </Button>
                        ) : (
                          <Button
                            disabled={pending}
                            onClick={() =>
                              void run(() =>
                                previewReversal(proposal, effect.effect_hash),
                              )
                            }
                            variant="secondary"
                          >
                            Review reversal…
                          </Button>
                        )
                      ) : null}
                      {status?.reversal_state === "ambiguous" ||
                      status?.reversal_state === "running" ? (
                        <Button
                          disabled={pending}
                          onClick={() =>
                            void run(() =>
                              reconcileReversal(proposal, effect.effect_hash),
                            )
                          }
                          variant="secondary"
                        >
                          Reconcile reversal from provider state
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="muted">
                      Executing this source write is an Admin action.{" "}
                      <RequestAccessLink surface="renewal_workspace.execute_source_write" />
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          {executor && effects === null ? (
            <Button
              disabled={pending}
              onClick={() => void run(refreshStatus)}
              variant="secondary"
            >
              Check effect statuses
            </Button>
          ) : null}
          {proposalLifecycleLocked ? (
            <p className="muted" role="status">
              Replacement and discard stay unavailable while durable status is loading or
              an attempt needs reconciliation.
            </p>
          ) : null}
        </div>
      ) : (
        <div>
          <h2 id="rentvine-updates-title">RentVine updates</h2>
          <p className="muted">
            No update proposal is saved for this lease. An Editor can assemble one from
            fresh RentVine state and exact approved terms.
          </p>
        </div>
      )}

      {history.length > 0 ? (
        <section aria-labelledby="rentvine-history-title" className="ui-stack">
          <div>
            <h3 id="rentvine-history-title">Completed update recovery history</h3>
            <p className="muted">
              Completed generations remain immutable and available for receipt review or
              their separately confirmed reversal after the active proposal changes.
            </p>
          </div>
          {history.map((generation) => (
            <details key={generation.generation_preview_hash}>
              <summary>
                Generation archived {generation.archived_at} ·{" "}
                {generation.archived_reason}
              </summary>
              <ol className="ui-stack">
                {generation.effects.map((effect) => {
                  const key = reversalKey(
                    generation.proposal.preview_hash,
                    effect.effect_hash,
                  );
                  const reversalPreview = reversalPreviews[key];
                  return (
                    <li className="ui-stack" key={effect.effect_hash}>
                      <div>
                        <h4>{KIND_LABELS[effect.kind]}</h4>
                        <p className="muted">
                          {stateLabel(effect.state)}
                          {effect.receipt
                            ? ` · receipt ${effect.receipt.provider_ref} · ${effect.receipt.result_hash.slice(0, 16)}…`
                            : ""}
                          {effect.reversal_state
                            ? ` · reversal ${stateLabel(effect.reversal_state)}`
                            : ""}
                        </p>
                      </div>
                      {executor ? (
                        <div className="ui-actions">
                          {effect.state === "succeeded" &&
                          effect.reversal_kind !== "none" &&
                          !effect.reversal_state ? (
                            reversalPreview ? (
                              <Button
                                disabled={pending}
                                onClick={() =>
                                  void run(() =>
                                    executeReversal(
                                      generation.proposal,
                                      effect.effect_hash,
                                    ),
                                  )
                                }
                              >
                                Confirm the archived reversal exactly once
                              </Button>
                            ) : (
                              <Button
                                disabled={pending}
                                onClick={() =>
                                  void run(() =>
                                    previewReversal(
                                      generation.proposal,
                                      effect.effect_hash,
                                    ),
                                  )
                                }
                                variant="secondary"
                              >
                                Review archived reversal…
                              </Button>
                            )
                          ) : null}
                          {effect.reversal_state === "running" ||
                          effect.reversal_state === "ambiguous" ? (
                            <Button
                              disabled={pending}
                              onClick={() =>
                                void run(() =>
                                  reconcileReversal(
                                    generation.proposal,
                                    effect.effect_hash,
                                  ),
                                )
                              }
                              variant="secondary"
                            >
                              Reconcile archived reversal
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </details>
          ))}
        </section>
      ) : null}

      <section className="ui-stack" aria-label="Current recurring charges">
        <h3>Current recurring charges</h3>
        {inventory ? (
          <>
            <p className="muted">
              Source: RentVine, read for {inventory.asOfDate}. Individual charges do not
              redefine contractual base rent.
            </p>
            <ul className="ui-rows">
              {inventory.charges.map((charge) => (
                <li key={charge.id}>
                  <strong>{charge.accountLabel ?? charge.projection.description}</strong>:
                  ${charge.projection.amount}, every {charge.projection.frequency}{" "}
                  month(s), due day {charge.projection.dayDue}.{" "}
                  {charge.projection.startDate} to{" "}
                  {charge.projection.endDate ?? "no end date"}.
                  <span className="muted">
                    {" "}
                    {charge.classification === "rent"
                      ? "Rent account"
                      : charge.classification === "non_rent"
                        ? "Other recurring charge"
                        : "Account classification unavailable"}
                    ;{" "}
                    {charge.current === true
                      ? "within current schedule"
                      : charge.current === false
                        ? "outside current schedule"
                        : "schedule boundary needs review"}
                    .
                  </span>
                </li>
              ))}
            </ul>
            {inventory.charges.length === 0 ? (
              <p>No recurring charges returned for this lease.</p>
            ) : null}
          </>
        ) : (
          <p className="muted">The current charge list has not been loaded.</p>
        )}
        <Button
          type="button"
          disabled={pending}
          onClick={() => void run(loadInventory)}
          variant="secondary"
        >
          Refresh verified charges
        </Button>
        <p className="muted">
          One-time fees, deposit or ledger changes, party changes and insurance enrollment
          are outside these RentVine actions.
        </p>
      </section>
      {editor ? (
        <details>
          <summary>Prepare a RentVine update proposal</summary>
          <form
            className="ui-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void run(propose);
            }}
          >
            <p className="muted">
              Enter only the exact approved changes. Saving reads fresh RentVine state,
              validates every value against the supported field matrix, and replaces only
              the exact generation shown above when it has no unresolved attempt. Nothing
              is written to RentVine until an Admin confirms one effect at a time.
            </p>
            <fieldset className="ui-stack" disabled={billingIntent === "current_base"}>
              <legend>Lease renewal dates</legend>
              <Field htmlFor="s97-end-date" label="New end date (YYYY-MM-DD)">
                <input
                  type="date"
                  id="s97-end-date"
                  onChange={(event) => setEndDate(event.target.value)}
                  value={endDate}
                />
              </Field>
              <Field
                htmlFor="s97-increase-date"
                label="New increase eligibility date (YYYY-MM-DD)"
              >
                <input
                  type="date"
                  id="s97-increase-date"
                  onChange={(event) => setIncreaseEligibilityDate(event.target.value)}
                  value={increaseEligibilityDate}
                />
              </Field>
            </fieldset>
            <fieldset className="ui-stack">
              <legend>Update one existing recurring charge</legend>
              <Field htmlFor="s113-billing-intent" label="Billing correction">
                <select
                  id="s113-billing-intent"
                  value={billingIntent}
                  onChange={(event) => {
                    setBillingIntent(event.target.value);
                    setUpdateChargeId("");
                    setUpdateFields({});
                  }}
                >
                  <option value="recurring">Correct a recurring charge</option>
                  <option value="current_base">Correct current base-rent billing</option>
                </select>
              </Field>
              <Field htmlFor="s97-charge-id" label="Recurring charge to correct">
                <select
                  id="s97-charge-id"
                  disabled={!inventory}
                  value={updateChargeId}
                  onChange={(event) => {
                    setUpdateChargeId(event.target.value);
                    const selected = inventory?.charges.find(
                      (charge) => charge.id === event.target.value,
                    );
                    setUpdateFields(
                      selected
                        ? Object.fromEntries(
                            (billingIntent === "current_base"
                              ? ["amount"]
                              : [
                                  "amount",
                                  "description",
                                  "dayDue",
                                  "frequency",
                                  "startDate",
                                  "endDate",
                                ]
                            ).map((key) => [
                              key,
                              String(
                                (
                                  selected.projection as unknown as Record<
                                    string,
                                    unknown
                                  >
                                )[key] ?? "",
                              ),
                            ]),
                          )
                        : {},
                    );
                  }}
                >
                  <option value="">Select the observed billing item</option>
                  {(inventory?.charges ?? [])
                    .filter(
                      (charge) =>
                        billingIntent !== "current_base" ||
                        (charge.classification === "rent" && charge.current === true),
                    )
                    .map((charge) => (
                      <option key={charge.id} value={charge.id}>
                        {charge.accountLabel ?? charge.projection.description} · $
                        {charge.projection.amount} · {charge.projection.startDate}
                      </option>
                    ))}
                </select>
              </Field>
              {billingIntent === "current_base" ? (
                <p className="muted">
                  Select one verified current rent-account charge. The app never divides
                  an aggregate among charges. Charge readback and the displayed
                  contractual base rent are checked separately.
                </p>
              ) : null}
              {(
                [
                  ["amount", "Amount (e.g. 1450.00)"],
                  ["description", "Description"],
                  ["dayDue", "Day due (1-31)"],
                  ["frequency", "Frequency in months (1-24)"],
                  ["startDate", "Start date (MM/DD/YYYY)"],
                  ["endDate", "End date (MM/DD/YYYY)"],
                ] as const
              )
                .filter(([key]) => billingIntent !== "current_base" || key === "amount")
                .map(([key, label]) => (
                  <Field htmlFor={`s97-update-${key}`} key={key} label={label}>
                    <input
                      disabled={!updateChargeId}
                      type={
                        key.endsWith("Date")
                          ? "date"
                          : ["amount", "dayDue", "frequency"].includes(key)
                            ? "number"
                            : "text"
                      }
                      step={key === "amount" ? "0.01" : undefined}
                      id={`s97-update-${key}`}
                      onChange={(event) =>
                        setUpdateFields((current) => ({
                          ...current,
                          [key]: key.endsWith("Date")
                            ? dateForProvider(event.target.value)
                            : event.target.value,
                        }))
                      }
                      value={
                        key.endsWith("Date")
                          ? (chargeDateIso(updateFields[key] ?? null) ?? "")
                          : (updateFields[key] ?? "")
                      }
                    />
                  </Field>
                ))}
            </fieldset>
            <fieldset className="ui-stack" disabled={billingIntent === "current_base"}>
              <legend>Create one new recurring charge</legend>
              <Field htmlFor="s97-create-accountID" label="Verified billing account">
                <select
                  id="s97-create-accountID"
                  value={createFields.accountID ?? ""}
                  disabled={!inventory}
                  onChange={(event) =>
                    setCreateFields((current) => ({
                      ...current,
                      accountID: event.target.value,
                    }))
                  }
                >
                  <option value="">Select an existing account</option>
                  {[
                    ...new Map(
                      (inventory?.charges ?? [])
                        .filter((charge) => charge.accountLabel !== null)
                        .map((charge) => [charge.accountId, charge]),
                    ).values(),
                  ].map((charge) => (
                    <option key={charge.accountId} value={charge.accountId}>
                      {charge.accountLabel}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="muted">
                Only accounts verified on this lease are available here. Review the full
                schedule above for overlaps or gaps; matching end/start dates need a
                boundary review.
              </p>
              {(
                [
                  ["amount", "Amount (e.g. 1450.00)"],
                  ["description", "Description"],
                  ["dayDue", "Day due (1-31)"],
                  ["frequency", "Frequency in months (1-24)"],
                  ["startDate", "Start date (MM/DD/YYYY)"],
                  ["endDate", "End date (MM/DD/YYYY, optional)"],
                ] as const
              ).map(([key, label]) => (
                <Field htmlFor={`s97-create-${key}`} key={key} label={label}>
                  <input
                    type={
                      key.endsWith("Date")
                        ? "date"
                        : ["amount", "dayDue", "frequency"].includes(key)
                          ? "number"
                          : "text"
                    }
                    step={key === "amount" ? "0.01" : undefined}
                    id={`s97-create-${key}`}
                    onChange={(event) =>
                      setCreateFields((current) => ({
                        ...current,
                        [key]: key.endsWith("Date")
                          ? dateForProvider(event.target.value)
                          : event.target.value,
                      }))
                    }
                    value={
                      key.endsWith("Date")
                        ? (chargeDateIso(createFields[key] ?? null) ?? "")
                        : (createFields[key] ?? "")
                    }
                  />
                </Field>
              ))}
            </fieldset>
            <Field htmlFor="s97-evidence-ref" label="Source of the reviewed terms">
              <input
                id="s97-evidence-ref"
                onChange={(event) => setEvidenceRef(event.target.value)}
                placeholder="Where these approved terms come from"
                value={evidenceRef}
              />
            </Field>
            <div className="ui-actions">
              <Button disabled={pending || proposalLifecycleLocked} type="submit">
                Save proposal from fresh RentVine state
              </Button>
              {proposal ? (
                <Button
                  disabled={pending || proposalLifecycleLocked}
                  onClick={() => void run(discard)}
                  type="button"
                  variant="secondary"
                >
                  Discard the saved proposal
                </Button>
              ) : null}
            </div>
          </form>
        </details>
      ) : (
        <p className="muted">
          Assembling a proposal is an Editor action.{" "}
          <RequestAccessLink surface="renewal_workspace.propose_source_write" />
        </p>
      )}

      {notice ? (
        <p className="muted" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" ref={errorRef} role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
      {pending ? (
        <p aria-busy="true" className="muted" role="status">
          Working…
        </p>
      ) : null}
    </article>
  );
}

function dateForProvider(iso: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`
    : "";
}
