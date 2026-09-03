"use client";

import { useEffect, useRef, useState } from "react";

import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import { Button } from "@/components/ui";
import { can, type Role } from "@/lib/auth/roles";
import type {
  SheetWritebackClientEffect,
  SheetWritebackClientProposal,
} from "@/lib/lease-renewal/sheet-writeback/client-projection";
import type { SheetWritebackEffectStatusView } from "@/lib/lease-renewal/sheet-writeback/status";

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
  if (!workspaceContext) {
    throw new Error(
      "This lease workspace needs a fresh secure page load before Sheet work.",
    );
  }
  const response = await fetch("/api/lease-renewal/operating-sheet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, workspaceContext }),
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
  if (state === "unknown") return "Checking durable status";
  return state;
}

export function OperatingSheetPanel({
  role,
  hasSheetRow,
  workspaceContext,
  initialProposal,
  initialEffects = null,
}: Readonly<{
  role: Role;
  /** BEH-S98-1: append is offered only when no exact row exists; update only on an exact row. */
  hasSheetRow: boolean;
  workspaceContext: string | null;
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
  const [statusPending, setStatusPending] = useState(
    initialProposal !== null && initialEffects === null,
  );
  const statusLoadedPreviewRef = useRef<string | null>(
    initialEffects !== null ? (initialProposal?.preview_hash ?? null) : null,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);

  const editor = can(role, "edit");
  const executor = can(role, "manageAdmin");
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
    void postSheet(workspaceContext, { operation: "status" })
      .then((payload) => {
        if (cancelled) return;
        setProposal((payload.proposal as SheetWritebackClientProposal | null) ?? null);
        setEffects((payload.effects as SheetWritebackEffectStatus[] | undefined) ?? null);
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
    const payload = await postSheet(workspaceContext, { operation: "status" });
    setProposal((payload.proposal as SheetWritebackClientProposal | null) ?? null);
    setEffects((payload.effects as SheetWritebackEffectStatus[] | undefined) ?? null);
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

  async function discard() {
    if (!proposal) return;
    await postSheet(workspaceContext, {
      operation: "discard",
      previewHash: proposal.preview_hash,
    });
    setProposal(null);
    setEffects(null);
    setArmedEffect(null);
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
    setArmedEffect(null);
    setNotice(
      payload.duplicate
        ? "This exact effect already completed; showing its durable receipt."
        : "Applied to the operating Sheet with a receipt and exact readback.",
    );
    await refreshStatus();
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
  const proposalLifecycleLocked =
    proposal !== null &&
    (effects === null ||
      effects.some((entry) => ["running", "ambiguous"].includes(entry.state)));

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
              const state = status?.state ?? "unknown";
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
                      status?.effect_executable !== false ? (
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
                      {state === "not_started" && status?.effect_executable === false ? (
                        <p className="muted" role="status">
                          This provider operation is unavailable until an atomic
                          stable-row mutation protocol is connected.
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
                      {state === "succeeded" && status?.reversal_executable ? (
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
          <h2 id="operating-sheet-title">Operating Sheet updates</h2>
          <p className="muted">
            No Sheet update proposal is saved. An Editor can assemble one from the fresh
            Sheet header and exact approved values.
          </p>
        </div>
      )}

      {editor ? (
        <details>
          <summary>
            {hasSheetRow ? "Sheet row update unavailable" : "Add Sheet row"}
          </summary>
          <form
            className="ui-stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (!hasSheetRow) void run(proposeAppend);
            }}
          >
            {hasSheetRow ? (
              <p className="muted">
                Current-rent updates are unavailable until the provider can atomically
                bind the stable lease row, expected generation, idempotency key, and
                durable operation status. A read followed by a fixed-cell write is not
                used.
              </p>
            ) : (
              <p className="muted">
                The server will append one row only if a fresh RentVine-to-Sheet link
                check confirms this lease has no exact row. Lease, property, and tenant
                identity come from RentVine; every unconfirmed column stays blank.
              </p>
            )}
            <div className="ui-actions">
              {!hasSheetRow ? (
                <Button disabled={pending || !workspaceContext} type="submit">
                  Prepare exact missing-row append
                </Button>
              ) : null}
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
