"use client";

import { useRef, useState } from "react";

import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import { Button, Field } from "@/components/ui";
import { can, type Role } from "@/lib/auth/roles";
import type {
  SheetWritebackClientEffect,
  SheetWritebackClientProposal,
} from "@/lib/lease-renewal/sheet-writeback/client-projection";

export interface SheetWritebackEffectStatus extends SheetWritebackClientEffect {
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
  kind: "delete_appended_row" | "restore_field";
  currentRowNumber?: number;
}

const KIND_LABELS = {
  row_append: "Add one operating Sheet row",
  field_update: "Update one supported Sheet field",
} as const;

const REVERSAL_LABELS = {
  delete_appended_row:
    "Reversal available: delete the exact unchanged app-appended row with absence readback.",
  restore_field:
    "Correction available: restore the exact receipted prior value into the same cell.",
} as const;

async function postSheet(body: Record<string, unknown>) {
  const response = await fetch("/api/lease-renewal/operating-sheet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "The Sheet update request was declined.",
    );
  }
  return payload;
}

function describeLines(effect: SheetWritebackClientEffect): string[] {
  const lines: string[] = [];
  if (effect.kind === "row_append") {
    lines.push(`Tenant label: ${String(effect.effect.tenantName ?? "")}`);
    lines.push(
      `Lease ${String(effect.effect.leaseId ?? "")} on property ${String(effect.effect.propertyId ?? "")} (server-resolved).`,
    );
    const fields = (effect.effect.fields ?? {}) as Record<
      string,
      { value: string; source: string }
    >;
    for (const [field, entry] of Object.entries(fields)) {
      lines.push(`${field}: ${entry.value} (source: ${entry.source})`);
    }
    lines.push("Every other column stays blank; the system note carries the row key.");
  } else {
    lines.push(
      `Row ${String(effect.effect.rowNumber)} · field ${String(effect.effect.field)}`,
    );
    lines.push(
      `Current value: ${String(effect.effect.expectedValue ?? "") || "(blank)"} → proposed: ${String(effect.effect.afterValue ?? "")}`,
    );
    lines.push(`Source: ${String(effect.effect.source ?? "")}`);
  }
  return lines;
}

function stateLabel(state: string): string {
  if (state === "not_started") return "Ready to confirm";
  if (state === "running") return "Awaiting a durable outcome";
  if (state === "succeeded") return "Applied with receipt";
  if (state === "ambiguous") return "Needs reconciliation";
  if (state === "failed") return "Declined without change";
  return state;
}

export function OperatingSheetPanel({
  leaseId,
  role,
  hasSheetRow,
  sheetRowNumber = null,
  tenantNameSuggestion = "",
  initialProposal,
  initialEffects = null,
}: Readonly<{
  leaseId: string;
  role: Role;
  /** BEH-S98-1: append is offered only when no exact row exists; update only on an exact row. */
  hasSheetRow: boolean;
  sheetRowNumber?: number | null;
  tenantNameSuggestion?: string;
  initialProposal: SheetWritebackClientProposal | null;
  initialEffects?: SheetWritebackEffectStatus[] | null;
}>) {
  const [proposal, setProposal] = useState(initialProposal);
  const [effects, setEffects] = useState<SheetWritebackEffectStatus[] | null>(
    initialEffects,
  );
  const [armedEffect, setArmedEffect] = useState<string | null>(null);
  const [reversalPreviews, setReversalPreviews] = useState<
    Record<string, ReversalPreview>
  >({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const [tenantName, setTenantName] = useState(tenantNameSuggestion);
  const [updateField, setUpdateField] = useState("current_rent");
  const [updateRow, setUpdateRow] = useState(
    sheetRowNumber !== null ? String(sheetRowNumber) : "",
  );
  const [updateValue, setUpdateValue] = useState("");
  const [updateSource, setUpdateSource] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");

  const editor = can(role, "edit");
  const executor = can(role, "manageAdmin");
  const [mountedAtMs] = useState(() => Date.now());
  const expired = proposal
    ? mountedAtMs > Date.parse(proposal.confirmation_expires_at)
    : false;

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
          : "The Sheet update request was declined.",
      );
      queueMicrotask(() => errorRef.current?.focus());
    } finally {
      setPending(false);
    }
  }

  async function refreshStatus() {
    const payload = await postSheet({ operation: "status" });
    setProposal((payload.proposal as SheetWritebackClientProposal | null) ?? null);
    setEffects((payload.effects as SheetWritebackEffectStatus[] | undefined) ?? null);
  }

  async function proposeAppend() {
    if (!tenantName.trim()) {
      throw new Error("Enter the source-backed tenant label before saving.");
    }
    const payload = await postSheet({
      operation: "propose",
      evidenceRef: evidenceRef.trim() || `workspace:${leaseId}`,
      effects: [
        { kind: "row_append", leaseId, tenantName: tenantName.trim(), fields: {} },
      ],
    });
    setProposal(payload.proposal as SheetWritebackClientProposal);
    setEffects(null);
    setNotice("Proposal saved from the fresh Sheet header. Review the exact row below.");
  }

  async function proposeUpdate() {
    const rowNumber = Number(updateRow.trim());
    if (!Number.isInteger(rowNumber) || rowNumber < 2) {
      throw new Error("Enter the exact Sheet row number of the anchored row.");
    }
    if (!updateValue.trim() || !updateSource.trim()) {
      throw new Error("Enter the proposed value and its exact source.");
    }
    const payload = await postSheet({
      operation: "propose",
      evidenceRef: evidenceRef.trim() || `workspace:${leaseId}`,
      effects: [
        {
          kind: "field_update",
          field: updateField,
          rowNumber,
          afterValue: updateValue.trim(),
          source: updateSource.trim(),
        },
      ],
    });
    setProposal(payload.proposal as SheetWritebackClientProposal);
    setEffects(null);
    setNotice(
      "Proposal saved with the fresh current value captured for the compare-and-set.",
    );
  }

  async function discard() {
    await postSheet({ operation: "discard" });
    setProposal(null);
    setEffects(null);
    setArmedEffect(null);
    setNotice("Proposal discarded. Provider receipts, if any, remain on record.");
  }

  async function executeEffect(effect: SheetWritebackClientEffect) {
    if (!proposal) return;
    const payload = await postSheet({
      operation: "execute",
      previewHash: proposal.preview_hash,
      effectHash: effect.effect_hash,
      confirm: true,
    });
    setArmedEffect(null);
    setNotice(
      payload.duplicate
        ? "This exact effect already completed; showing its durable receipt."
        : "Applied to the operating Sheet with a receipt and exact readback.",
    );
    await refreshStatus();
  }

  async function reconcileEffect(effectHash: string) {
    await postSheet({ operation: "reconcile", effectHash });
    setNotice("Reconciliation recorded a durable outcome from fresh Sheet state.");
    await refreshStatus();
  }

  async function previewReversal(effectHash: string) {
    const payload = await postSheet({ operation: "reverse_preview", effectHash });
    setReversalPreviews((current) => ({
      ...current,
      [effectHash]: payload.reversal as ReversalPreview,
    }));
    setNotice("Reversal preview ready. Confirming it is a separate exact action.");
  }

  async function executeReversal(effectHash: string) {
    const reversal = reversalPreviews[effectHash];
    if (!reversal) return;
    await postSheet({
      operation: "reverse_execute",
      effectHash,
      reversal,
      confirm: true,
    });
    setReversalPreviews((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => key !== effectHash)),
    );
    setNotice("Reversal applied with its own receipt.");
    await refreshStatus();
  }

  const statusByHash = new Map(
    (effects ?? []).map((entry) => [entry.effect_hash, entry] as const),
  );

  return (
    <article aria-labelledby="operating-sheet-title" className="panel ui-stack">
      {proposal ? (
        <div className="ui-stack">
          <div>
            <h2 id="operating-sheet-title">Review Sheet updates</h2>
            <p className="muted">
              Exact target: the operating renewal tab, read {proposal.source_read_at}.
              Each effect is previewed, confirmed, and receipted independently; preview
              performs zero writes.
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
              const state = status?.state ?? "not_started";
              const reversalPreview = reversalPreviews[effect.effect_hash];
              return (
                <li className="ui-stack" key={effect.effect_hash}>
                  <div>
                    <h3>{KIND_LABELS[effect.kind]}</h3>
                    <p className="muted">
                      {effect.action_key} · {stateLabel(state)}
                    </p>
                  </div>
                  <ul>
                    {describeLines(effect).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p className="muted">{REVERSAL_LABELS[effect.reversal_kind]}</p>
                  {state === "ambiguous" ? (
                    <p className="muted" role="status">
                      The Sheet outcome is unproven. Reconciliation reads fresh state by
                      the row&apos;s system note or the exact cell and may report before,
                      after, or drift without claiming causality.
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
                            void run(() => reconcileEffect(effect.effect_hash))
                          }
                          variant="secondary"
                        >
                          Reconcile from Sheet state
                        </Button>
                      ) : null}
                      {state === "succeeded" ? (
                        reversalPreview ? (
                          <Button
                            disabled={pending}
                            onClick={() =>
                              void run(() => executeReversal(effect.effect_hash))
                            }
                          >
                            Confirm the reversal exactly once
                          </Button>
                        ) : (
                          <Button
                            disabled={pending}
                            onClick={() =>
                              void run(() => previewReversal(effect.effect_hash))
                            }
                            variant="secondary"
                          >
                            Review reversal…
                          </Button>
                        )
                      ) : null}
                    </div>
                  ) : (
                    <p className="muted">
                      Executing this Sheet write is an Admin action.{" "}
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
        </div>
      ) : (
        <div>
          <h2 id="operating-sheet-title">Operating Sheet updates</h2>
          <p className="muted">
            No Sheet update proposal is saved. An Editor can assemble one from the fresh
            Sheet header and exact approved values.
          </p>
        </div>
      )}

      {editor ? (
        <details>
          <summary>{hasSheetRow ? "Update in Sheet" : "Add Sheet row"}</summary>
          <form
            className="ui-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void run(hasSheetRow ? proposeUpdate : proposeAppend);
            }}
          >
            {hasSheetRow ? (
              <>
                <p className="muted">
                  Update one supported field on the exact anchored row. Saving captures
                  the fresh current value for the compare-and-set; the write applies only
                  while that exact value still matches.
                </p>
                <Field htmlFor="s98-field" label="Supported field">
                  <select
                    id="s98-field"
                    onChange={(event) => setUpdateField(event.target.value)}
                    value={updateField}
                  >
                    {[
                      "owner_pricing_confirmed",
                      "renewal_letter_sent",
                      "renewal_date",
                      "current_rent",
                      "market_value",
                      "renewal_completed",
                      "tenant_responded",
                      "info_form_sent",
                      "form_returned",
                      "lease_docs_sent",
                      "rhino_renewed",
                      "pet_registered",
                      "esign_complete",
                      "additional_insured_verified",
                      "recurring_charge_added",
                      "added_to_inspection_sheet",
                      "air_filter_setup",
                      "utility_proof",
                    ].map((field) => (
                      <option key={field} value={field}>
                        {field}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field htmlFor="s98-row" label="Exact Sheet row number">
                  <input
                    id="s98-row"
                    onChange={(event) => setUpdateRow(event.target.value)}
                    value={updateRow}
                  />
                </Field>
                <Field htmlFor="s98-value" label="Proposed value">
                  <input
                    id="s98-value"
                    onChange={(event) => setUpdateValue(event.target.value)}
                    value={updateValue}
                  />
                </Field>
                <Field htmlFor="s98-source" label="Exact source of the value">
                  <input
                    id="s98-source"
                    onChange={(event) => setUpdateSource(event.target.value)}
                    value={updateSource}
                  />
                </Field>
              </>
            ) : (
              <>
                <p className="muted">
                  This lease has no exact Sheet row. Saving appends one row after the
                  current table with the server-resolved lease/property identity in the
                  system note; unconfirmed columns stay blank.
                </p>
                <Field htmlFor="s98-tenant" label="Source-backed tenant label">
                  <input
                    id="s98-tenant"
                    onChange={(event) => setTenantName(event.target.value)}
                    value={tenantName}
                  />
                </Field>
              </>
            )}
            <Field htmlFor="s98-evidence" label="Evidence reference">
              <input
                id="s98-evidence"
                onChange={(event) => setEvidenceRef(event.target.value)}
                placeholder="Where these approved values come from"
                value={evidenceRef}
              />
            </Field>
            <div className="ui-actions">
              <Button disabled={pending} type="submit">
                Save proposal from fresh Sheet state
              </Button>
              {proposal ? (
                <Button
                  disabled={pending}
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
          <RequestAccessLink surface="renewal_workspace.sheet_propose" />
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
