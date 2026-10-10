"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { formatBusinessTimestamp } from "@/lib/date-display";

import { RenewalSectionHeading } from "@/components/lease-renewal/RenewalSectionHeading";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import { SourceUpdatePreview } from "@/components/lease-renewal/SourceUpdatePreview";
import {
  WorkingMoneyField,
  useRenewalWorkingRecord,
} from "@/components/lease-renewal/RenewalWorkingRecord";
import {
  sheetPreviewFacts,
  type SourceUpdateIdentity,
} from "@/lib/lease-renewal/source-update-preview";
import {
  SHEET_AUDIENCE_EMAIL_FIELDS,
  SHEET_FIELD_LABELS,
  sheetFieldShape,
  type SheetEditableField,
} from "@/lib/lease-renewal/sheet-writeback/field-intent";
import type { AudienceEmailRosterView } from "@/lib/lease-renewal/sheet-writeback/audience-emails";
import { Button, Field } from "@/components/ui";
import { can, type Role } from "@/lib/auth/roles";
import type {
  SheetWritebackClientEffect,
  SheetWritebackClientProposal,
} from "@/lib/lease-renewal/sheet-writeback/client-projection";
import {
  describeOperatingSheetAmbiguity,
  type OperatingSheetRowAssociation,
} from "@/lib/lease-renewal/sheet-writeback/row-association";
import { describeOperatorSelectionLimit } from "@/lib/lease-renewal/sheet-writeback/lookup-target";
import type { SheetWritebackEffectStatusView } from "@/lib/lease-renewal/sheet-writeback/status";
import { hasRenewalRoleAuthority } from "@/lib/lease-renewal/role-action-governance";
import { parseSheetCell } from "@/lib/lease-renewal/sheet-lookup";
import { workingCurrentRent } from "@/lib/lease-renewal/working-record";

export type SheetWritebackEffectStatus = SheetWritebackEffectStatusView;

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

async function postSheet(workspaceContext: string | null, body: Record<string, unknown>) {
  return requestSheet(workspaceContext, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, workspaceContext }),
  });
}

async function readSheetStatus(workspaceContext: string | null) {
  return requestSheet(workspaceContext, {
    method: "GET",
    cache: "no-store",
    headers: { "x-renewal-workspace-context": workspaceContext ?? "" },
  });
}

async function requestSheet(workspaceContext: string | null, init: RequestInit) {
  if (!workspaceContext) {
    throw new Error(
      "This lease workspace needs a fresh secure page load before Sheet work.",
    );
  }
  const response = await fetch("/api/lease-renewal/operating-sheet", init);
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
    const fieldKey = String(effect.effect.field);
    const fieldLabel =
      (SHEET_AUDIENCE_EMAIL_FIELDS as Record<string, { label: string } | undefined>)[
        fieldKey
      ]?.label ??
      (SHEET_FIELD_LABELS as Record<string, string | undefined>)[fieldKey] ??
      fieldKey;
    lines.push(`Row ${String(effect.effect.rowNumber)} · ${fieldLabel}`);
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
  if (state === "unknown") return "Checking durable status";
  return state;
}

export function OperatingSheetPanel({
  role,
  association,
  audienceEmails = null,
  identity = null,
  workspaceContext,
  initialProposal,
  initialEffects = null,
  initialFieldValues = {},
  fieldCells = {},
  writebackPaused = false,
}: Readonly<{
  role: Role;
  /**
   * BEH-S98-1 / BEH-S116-2 / S158: update is offered on an exact row or an eligible selected
   * row, append only after a confirmed absence; an ambiguous association or a read-only
   * selection explains itself and offers neither.
   */
  association: OperatingSheetRowAssociation;
  /** S158/S160: the A1 cell each field's update targets on the operating tab, when known. */
  fieldCells?: Record<string, string>;
  /** S116 (Q3A): per-audience email field views computed server-side from the fresh roster. */
  audienceEmails?: Readonly<Record<"owner" | "tenant", AudienceEmailRosterView>> | null;
  /** S117: the lease named in every preview; null keeps the lease id only. */
  identity?: SourceUpdateIdentity | null;
  workspaceContext: string | null;
  initialProposal: SheetWritebackClientProposal | null;
  initialEffects?: SheetWritebackEffectStatus[] | null;
  initialFieldValues?: Record<string, string>;
  /**
   * S128/S159: the server-owned Sheet update switch is off. App-owned records still save, reads
   * and read-only reconciliation continue; only the Sheet update itself is unavailable.
   */
  writebackPaused?: boolean;
}>) {
  const router = useRouter();
  const workingRecord = useRenewalWorkingRecord();
  const workingRent = workingCurrentRent(workingRecord?.record);
  const selection = association.kind === "operator_selected" ? association : null;
  const selectionLimited = selection !== null && selection.limit !== null;
  const hasSheetRow =
    association.kind === "exact_link" ||
    association.kind === "app_note" ||
    (selection !== null && selection.limit === null);
  const ambiguous = association.kind === "ambiguous" ? association : null;
  const [proposal, setProposal] = useState(initialProposal);
  // S128 (F08): server-owned pause state; the initial prop drives first paint, status reads refresh it.
  const [paused, setPaused] = useState(writebackPaused);
  const [field, setField] = useState<SheetEditableField>(
    (Object.keys(initialFieldValues).find((key) => key in SHEET_FIELD_LABELS) as
      | SheetEditableField
      | undefined) ?? "current_rent",
  );
  const [value, setValue] = useState(
    sheetEditorValue(field, initialFieldValues[field] ?? ""),
  );
  const [source, setSource] = useState("");
  const shape = sheetFieldShape(field);
  const [effects, setEffects] = useState<SheetWritebackEffectStatus[] | null>(
    initialEffects,
  );
  const [reversalPreviews, setReversalPreviews] = useState<
    Record<string, ReversalPreview>
  >({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [statusPending, setStatusPending] = useState(
    initialProposal !== null && initialEffects === null,
  );
  const statusLoadedPreviewRef = useRef<string | null>(
    initialEffects !== null ? (initialProposal?.preview_hash ?? null) : null,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);

  const editor = can(role, "edit");
  // S160: ordinary staff confirm a supported Sheet update; no Admin or approval hand-off.
  const executor = hasRenewalRoleAuthority("execute_source_write", role);
  const [mountedAtMs] = useState(() => Date.now());
  const expired = proposal
    ? mountedAtMs > Date.parse(proposal.confirmation_expires_at)
    : false;
  const proposalPreviewHash = proposal?.preview_hash;

  useEffect(() => {
    if (
      !workspaceContext ||
      !proposalPreviewHash ||
      statusLoadedPreviewRef.current === proposalPreviewHash
    ) {
      setStatusPending(false);
      return;
    }
    let cancelled = false;
    setStatusPending(true);
    void readSheetStatus(workspaceContext)
      .then((payload) => {
        if (cancelled) return;
        setProposal((payload.proposal as SheetWritebackClientProposal | null) ?? null);
        setEffects((payload.effects as SheetWritebackEffectStatus[] | undefined) ?? null);
        if (typeof payload.writeback_paused === "boolean")
          setPaused(payload.writeback_paused);
        statusLoadedPreviewRef.current = proposalPreviewHash;
      })
      .catch((statusError) => {
        if (cancelled) return;
        setError(
          statusError instanceof Error
            ? statusError.message
            : "The durable Sheet status could not be loaded.",
        );
      })
      .finally(() => {
        if (!cancelled) setStatusPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [proposalPreviewHash, workspaceContext]);

  const pendingRef = useRef(false);

  async function run(action: () => Promise<void>) {
    if (pendingRef.current) return;
    pendingRef.current = true;
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
      pendingRef.current = false;
      setPending(false);
    }
  }

  async function refreshStatus() {
    const payload = await readSheetStatus(workspaceContext);
    setProposal((payload.proposal as SheetWritebackClientProposal | null) ?? null);
    setEffects((payload.effects as SheetWritebackEffectStatus[] | undefined) ?? null);
    if (typeof payload.writeback_paused === "boolean")
      setPaused(payload.writeback_paused);
  }

  async function proposeAppend() {
    const payload = await postSheet(workspaceContext, {
      operation: "propose",
      intent: "append_missing_row",
      expectedPriorPreviewHash: proposal?.preview_hash ?? null,
    });
    setProposal(payload.proposal as SheetWritebackClientProposal);
    setEffects(null);
    setNotice("Proposal saved from the fresh Sheet header. Review the exact row below.");
  }

  async function proposeAudience(audience: "owner" | "tenant") {
    // S116 (Q3A): the value comes from the current RentVine roster on the server; nothing typed.
    const payload = await postSheet(workspaceContext, {
      operation: "propose",
      intent: "update_audience_emails",
      audience,
      expectedPriorPreviewHash: proposal?.preview_hash ?? null,
    });
    setProposal(payload.proposal as SheetWritebackClientProposal);
    setEffects(null);
    setNotice(
      "Audience email proposal saved from the current RentVine roster. Review the exact replacement below, then confirm it.",
    );
  }

  async function proposeField() {
    // S160: the current-rent update is prepared from the saved working current rent on the
    // server; nothing is retyped here. Any other field sends its typed value; the note is optional.
    const payload = await postSheet(
      workspaceContext,
      field === "current_rent"
        ? {
            operation: "propose",
            intent: "update_working_current_rent",
            expectedPriorPreviewHash: proposal?.preview_hash ?? null,
          }
        : {
            operation: "propose",
            intent: "update_field",
            expectedPriorPreviewHash: proposal?.preview_hash ?? null,
            fieldIntent: {
              field,
              value:
                shape === "currency"
                  ? Number(value)
                  : shape === "yes_no" || shape === "boolean"
                    ? value === "true"
                    : value,
              ...(source.trim() ? { source: source.trim() } : {}),
            },
          },
    );
    setProposal(payload.proposal as SheetWritebackClientProposal);
    setEffects(null);
    setNotice(
      "Field proposal saved. Review the current value and exact replacement below, then confirm it.",
    );
  }

  async function discard() {
    if (!proposal) return;
    await postSheet(workspaceContext, {
      operation: "discard",
      previewHash: proposal.preview_hash,
    });
    setProposal(null);
    setEffects(null);

    setNotice("Proposal discarded. Provider receipts, if any, remain on record.");
  }

  async function executeEffect(effect: SheetWritebackClientEffect) {
    if (!proposal) return;
    const payload = await postSheet(workspaceContext, {
      operation: "execute",
      previewHash: proposal.preview_hash,
      effectHash: effect.effect_hash,
      confirm: true,
    });

    setNotice(
      payload.duplicate
        ? "This exact effect already completed; showing its durable receipt."
        : "Applied to the operating Sheet with a receipt and exact readback.",
    );
    await refreshStatus();
    router.refresh();
  }

  async function reconcileEffect(effectHash: string) {
    await postSheet(workspaceContext, { operation: "reconcile", effectHash });
    setNotice("Reconciliation recorded a durable outcome from fresh Sheet state.");
    await refreshStatus();
  }

  async function previewReversal(effectHash: string) {
    const payload = await postSheet(workspaceContext, {
      operation: "reverse_preview",
      effectHash,
    });
    setReversalPreviews((current) => ({
      ...current,
      [effectHash]: payload.reversal as ReversalPreview,
    }));
    setNotice("Reversal preview ready. Confirming it is a separate exact action.");
  }

  async function executeReversal(effectHash: string) {
    const reversal = reversalPreviews[effectHash];
    if (!reversal) return;
    await postSheet(workspaceContext, {
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
  // S158/S160 (BEH-S160-3): name the exact cell and whether it is the row staff selected, when
  // the page's read targets the same row as the saved preview.
  function previewLocation(effect: SheetWritebackClientEffect) {
    const rowNumber = Number(effect.effect.rowNumber);
    const cell = fieldCells[String(effect.effect.field)];
    return {
      cell: cell && parseSheetCell(cell)?.rowNumber === rowNumber ? cell : null,
      selected: selection !== null && selection.rowNumber === rowNumber,
    };
  }
  const proposalLifecycleLocked =
    proposal !== null &&
    (effects === null ||
      effects.some((entry) => ["running", "ambiguous"].includes(entry.state)));

  return (
    <article aria-labelledby="operating-sheet-title" className="panel ui-stack">
      {paused ? (
        // S128/S159: the server-owned switch is off. Working values and staff progress save in
        // the app; reads and read-only reconciliation continue; only this Sheet update waits.
        <p className="muted" role="status">
          Sheet updates are off by policy right now. Your working values and recorded
          progress save in the app, and Sheet reads continue; preparing or confirming a
          Sheet update waits until the switch is on. After that, prepare a fresh preview.
        </p>
      ) : null}
      {proposal ? (
        <div className="ui-stack">
          <div>
            <RenewalSectionHeading id="sheet-updates" headingId="operating-sheet-title">
              Review Sheet updates
            </RenewalSectionHeading>
            <p className="muted">
              Target: the operating renewal tab, read{" "}
              {formatBusinessTimestamp(proposal.source_read_at)}.
            </p>
          </div>
          {expired ? (
            <p className="muted" role="status">
              This proposal&apos;s confirmation window has expired. Save a fresh proposal
              to continue; the exact terms below stay visible for review.
            </p>
          ) : null}
          {proposal.requires_fresh_review && !paused ? (
            <p role="status">
              This proposal belongs to an earlier release or pause. Review the current
              target and prepare a new proposal before confirming.
            </p>
          ) : null}
          <ol className="ui-stack">
            {proposal.effects.map((effect) => {
              const status = statusByHash.get(effect.effect_hash);
              const state = status?.state ?? "unknown";
              const reversalPreview = reversalPreviews[effect.effect_hash];
              return (
                <li className="ui-stack" key={effect.effect_hash}>
                  <div>
                    <h3>{KIND_LABELS[effect.kind]}</h3>
                    <p className="muted">{stateLabel(state)}</p>
                  </div>
                  {effect.kind === "field_update" ? (
                    <SourceUpdatePreview
                      facts={sheetPreviewFacts(effect, {
                        proposal,
                        identity,
                        location: previewLocation(effect),
                      })}
                    />
                  ) : (
                    <ul>
                      {describeLines(effect).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                  <p className="muted">
                    {status?.reversal_executable
                      ? REVERSAL_LABELS[effect.reversal_kind]
                      : "Historical reversal terms remain recorded for recovery review. In-app reversal is unavailable until Google Sheets provides an atomic stable-row delete or restore protocol."}
                  </p>
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
                      {state === "not_started" &&
                      !expired &&
                      !proposal.requires_fresh_review &&
                      !paused &&
                      status?.effect_executable !== false ? (
                        <Button
                          disabled={pending}
                          onClick={() => void run(() => executeEffect(effect))}
                        >
                          Apply Sheet update
                        </Button>
                      ) : null}
                      {state === "not_started" && status?.effect_executable === false ? (
                        <p className="muted" role="status">
                          This provider operation is unavailable until an atomic
                          stable-row mutation protocol is connected.
                        </p>
                      ) : null}
                      {state === "not_started" &&
                      paused &&
                      status?.effect_executable !== false ? (
                        <p className="muted" role="status">
                          Sheet updates are off by policy, so this one waits. The reviewed
                          value stays visible. Once the switch is on, prepare a fresh
                          preview and confirm it.
                        </p>
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
                      {state === "succeeded" && status?.reversal_executable && !paused ? (
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
                      Confirming a Sheet update needs Editor access.{" "}
                      <RequestAccessLink surface="renewal_workspace.execute_source_write" />
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          {effects === null ? (
            <Button
              disabled={pending || statusPending}
              onClick={() => void run(refreshStatus)}
              variant="secondary"
            >
              Check effect statuses
            </Button>
          ) : null}
        </div>
      ) : (
        <div>
          <RenewalSectionHeading id="sheet-updates" headingId="operating-sheet-title">
            Operating Sheet updates
          </RenewalSectionHeading>
          <p className="muted">
            {ambiguous
              ? "No Sheet update is prepared for this lease yet: the app has not found its one Sheet row."
              : selectionLimited
                ? "No Sheet update is prepared for this lease yet: the selected location is read-only for updates."
                : editor && hasSheetRow
                  ? "No Sheet update is prepared."
                  : editor
                    ? "No Sheet row is linked."
                    : "No Sheet update is waiting. Staff with Editor access prepare and confirm one here."}
          </p>
        </div>
      )}

      {ambiguous ? (
        // BEH-S116-2 / S158: an ambiguous association is explained in plain English with the
        // correction a person makes in the Sheet or in the app; the app offers neither an append
        // nor an update until then.
        <p role="status">
          {describeOperatingSheetAmbiguity(ambiguous)} Or choose this lease&apos;s row
          under Operating Sheet lookup in Lease information.
        </p>
      ) : null}
      {selection && selectionLimited ? (
        // S158 (BEH-S158-10): the selected location stays readable; the limit is stated here and
        // nothing else on the lease waits on it.
        <p role="status">
          {describeOperatorSelectionLimit({ ...selection, kind: "selected" })} Choose
          another location under Operating Sheet lookup in Lease information, or use the
          automatic lookup.
        </p>
      ) : null}

      {editor && hasSheetRow && audienceEmails ? (
        // S116 (Q3A): each audience email field shows the Sheet's current value beside the complete
        // current roster and offers one exact preview; a missing column names the setup and a
        // blocked roster names the party or collision. Reads never synchronize the Sheet.
        <section aria-label="Audience email fields" className="ui-stack-tight">
          {(["owner", "tenant"] as const).map((audience) => {
            const view = audienceEmails[audience];
            return (
              <div className="ui-stack-tight" key={audience}>
                <strong>{view.label}</strong>
                {view.state === "column_missing" ? (
                  <p className="muted">
                    {view.label} column: not found on tab &quot;Lease Renewal&quot;.{" "}
                    {view.setup}
                  </p>
                ) : view.state === "roster_blocked" ? (
                  <ul role="status">
                    {view.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : (
                  <>
                    <p>Current Sheet value: {view.current || "Blank"}</p>
                    <p>Complete current roster: {view.proposed}</p>
                    {view.state === "current" ? (
                      <p className="muted">
                        The Sheet already holds the complete current roster for this
                        audience.
                      </p>
                    ) : (
                      <Button
                        disabled={
                          paused ||
                          pending ||
                          !workspaceContext ||
                          proposalLifecycleLocked
                        }
                        onClick={() => void run(() => proposeAudience(audience))}
                        type="button"
                      >
                        Preview {view.label} update
                      </Button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </section>
      ) : null}

      {editor && !ambiguous && !selectionLimited ? (
        <details>
          <summary>
            {hasSheetRow ? "Correct an operating Sheet field" : "Add Sheet row"}
          </summary>
          <form
            className="ui-stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (paused) return;
              void run(hasSheetRow ? proposeField : proposeAppend);
            }}
          >
            {hasSheetRow ? (
              <>
                <Field label="Field to update" htmlFor="sheet-field">
                  <select
                    id="sheet-field"
                    value={field}
                    onChange={(event) => {
                      const next = event.target.value as SheetEditableField;
                      setField(next);
                      setValue(sheetEditorValue(next, initialFieldValues[next] ?? ""));
                    }}
                  >
                    {(
                      Object.entries(SHEET_FIELD_LABELS) as [SheetEditableField, string][]
                    )
                      .filter(
                        ([key]) => key === "current_rent" || key in initialFieldValues,
                      )
                      .map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                  </select>
                </Field>
                <p>Observed Sheet value: {initialFieldValues[field] || "Blank"}</p>
                {field === "current_rent" ? (
                  // S160 (BEH-S160-2): the update is offered beside the working current rent and
                  // prepared from it on the server; nothing is retyped or approved elsewhere.
                  <div className="ui-stack-tight">
                    {workingRecord ? (
                      <WorkingMoneyField field="current_rent" />
                    ) : (
                      <p className="muted">
                        Enter the working current rent in Rent and charges first. This
                        Sheet update uses that value.
                      </p>
                    )}
                    {workingRent === null ? (
                      <p className="muted">
                        Enter the working current rent above to prepare this update. The
                        Sheet update uses that value; nothing else on this lease waits on
                        it.
                      </p>
                    ) : (
                      <p className="muted">
                        Preview replaces the Sheet&apos;s current base rent with the
                        working current rent shown above. You confirm the exact change
                        afterwards.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <Field label="New value" htmlFor="sheet-field-value" required>
                      {shape === "yes_no" || shape === "boolean" ? (
                        <select
                          id="sheet-field-value"
                          value={value}
                          onChange={(event) => setValue(event.target.value)}
                          required
                        >
                          <option value="">Select an answer</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      ) : (
                        <input
                          id="sheet-field-value"
                          type={
                            shape === "date"
                              ? "date"
                              : shape === "currency"
                                ? "number"
                                : "text"
                          }
                          step={shape === "currency" ? "0.01" : undefined}
                          min={shape === "currency" ? 0 : undefined}
                          value={value}
                          onChange={(event) => setValue(event.target.value)}
                          required
                        />
                      )}
                    </Field>
                    <Field
                      hint="Optional. Where this value came from, if you want it on record."
                      label="Note about this value"
                      htmlFor="sheet-field-source"
                    >
                      <input
                        id="sheet-field-source"
                        value={source}
                        onChange={(event) => setSource(event.target.value)}
                        maxLength={240}
                      />
                    </Field>
                  </>
                )}
              </>
            ) : (
              <p className="muted">
                The server will append one row only if a fresh RentVine-to-Sheet link
                check confirms this lease has no exact row. Lease, property, and tenant
                identity come from RentVine; every unconfirmed column stays blank.
              </p>
            )}
            <div className="ui-actions">
              <Button
                disabled={
                  paused ||
                  pending ||
                  !workspaceContext ||
                  proposalLifecycleLocked ||
                  (hasSheetRow && field === "current_rent" && workingRent === null)
                }
                type="submit"
              >
                {hasSheetRow
                  ? field === "current_rent"
                    ? "Preview the Sheet update from the working current rent"
                    : "Preview Sheet field update"
                  : "Prepare exact missing-row append"}
              </Button>
              {proposal ? (
                <Button
                  disabled={pending || proposalLifecycleLocked}
                  onClick={() => void run(discard)}
                  type="button"
                  variant="secondary"
                >
                  {effects?.some((entry) => entry.state === "succeeded")
                    ? "Archive completed proposal"
                    : "Discard the saved proposal"}
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
      {pending || statusPending ? (
        <p aria-busy="true" className="muted" role="status">
          {statusPending ? "Checking durable Sheet status…" : "Working…"}
        </p>
      ) : null}
    </article>
  );
}

function sheetEditorValue(field: SheetEditableField, observed: string): string {
  const shape = sheetFieldShape(field);
  if (shape === "yes_no" || shape === "boolean") {
    if (/^(yes|true)$/i.test(observed.trim())) return "true";
    if (/^(no|false)$/i.test(observed.trim())) return "false";
    return "";
  }
  if (shape === "currency") return observed.replace(/[$,]/g, "").trim();
  if (shape === "date") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(observed)) return observed;
    const usDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(observed);
    if (usDate)
      return `${usDate[3]}-${usDate[1].padStart(2, "0")}-${usDate[2].padStart(2, "0")}`;
    return "";
  }
  return observed;
}
