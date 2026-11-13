"use client";

// S278 R-S278-3 (BEH-S278-4): Finish up Work shows "Source updates (5 pending)", one row per update
// the renewal still needs: the field, the source's value now, the new value and its basis. Each
// row's "Prepare and review" leads to the existing exact preview and confirmation. After a
// confirmed read-back the row shows done with its receipt time, and focus moves to the next row
// still waiting. A conflict or refusal stays on its row with its recorded recovery. While one
// update is open, the other rows read "Finish or discard the open update first". When two or more
// recorded Sheet cells wait, "Review all 5 Sheet updates" prepares one review of the lease row's
// listed cells (R-S278-4). Showing the list reads and writes nothing.

import { useEffect, useMemo, useRef } from "react";

import { Button } from "@/components/ui";
import { formatBusinessTimestamp } from "@/lib/date-display";
import { marketValueSource } from "@/lib/lease-renewal/market-value-source";
import {
  SOURCE_UPDATES_WORDS,
  nextPendingRowKey,
  preparedWords,
  projectSourceUpdates,
  type SourceUpdateRow,
} from "@/lib/lease-renewal/source-updates-list";
import { SHEET_SET_WORDS } from "@/lib/lease-renewal/sheet-writeback/set-words";
import type { SheetEditableField } from "@/lib/lease-renewal/sheet-writeback/field-intent";
import type { DerivedOutreachRecord } from "@/lib/lease-renewal/outreach-evidence";
import { RenewalSectionHeading } from "./RenewalSectionHeading";
import { openFinishUpPreview } from "./RenewalFinishUpPreviews";
import type { useRenewalManualWorkspace } from "./RenewalManualWorkspace";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";

function rowStatus(row: SourceUpdateRow, paused: boolean, openWords: string): string {
  if (row.state === "done")
    return row.receiptAt
      ? SOURCE_UPDATES_WORDS.done(formatBusinessTimestamp(row.receiptAt))
      : SOURCE_UPDATES_WORDS.doneUntimed;
  if (row.state === "prepared") return openWords;
  if (paused && row.source === "sheet") return SOURCE_UPDATES_WORDS.paused;
  return "";
}

export function RenewalSourceUpdatesList({
  context,
  derived,
}: Readonly<{
  /** The lease's staff records and their deliberate source-update actions. */
  context: ReturnType<typeof useRenewalManualWorkspace>;
  /** S248 R-S248-11: the app's confirmed tenant offer with no Sheet value recorded yet. */
  derived?: {
    readonly record: DerivedOutreachRecord;
    readonly intent: {
      readonly field: SheetEditableField;
      readonly value: string | number | boolean;
      readonly source: string;
    };
  } | null;
}>) {
  const working = useRenewalWorkingRecord();
  const state = context?.state ?? null;
  const page = context?.sourceUpdatesPage ?? null;
  const outreach = context?.outreachEvidence?.input ?? null;
  const list = useMemo(
    () =>
      projectSourceUpdates({
        state,
        marketValue: marketValueSource({
          record: working?.record ?? null,
          outreach,
          cycleId: state?.cycleId ?? null,
        }),
        derived: derived?.intent ?? null,
        page,
      }),
    [state, working?.record, outreach, derived?.intent, page],
  );
  // R-S278-3: after a confirmed read-back, focus moves to the next row still waiting.
  const actions = useRef(new Map<string, HTMLButtonElement | null>());
  const seenDone = useRef<Set<string> | null>(null);
  useEffect(() => {
    const done = new Set(
      list.rows.filter((row) => row.state === "done").map((row) => row.key),
    );
    const before = seenDone.current;
    seenDone.current = done;
    if (!before) return;
    const newlyDone = list.rows.find((row) => done.has(row.key) && !before.has(row.key));
    if (!newlyDone) return;
    const next = nextPendingRowKey(list.rows, newlyDone.key);
    if (next) actions.current.get(next)?.focus();
  }, [list.rows]);
  if (!context) return null;
  const paused = context.writebackPaused;
  const busy = context.pending;
  const terms = page?.finishUp?.terms ?? null;
  const applyTarget = page?.finishUp?.applyTarget ?? "renewal-rent-and-charges";

  function act(row: SourceUpdateRow) {
    const action = row.action;
    if (!context || !action) return;
    if (action.kind === "prepare_source")
      void context.prepareSource(action.field, action.eventId);
    else if (action.kind === "prepare_market_value") void context.prepareMarketValue?.();
    else if (action.kind === "prepare_derived" && derived)
      void context.prepareDerivedSource(derived.record);
    else if (action.kind === "open_form")
      openFinishUpPreview(applyTarget, action.previewKey, terms);
  }

  return (
    <div
      className="ui-stack"
      data-renewal-source-updates={list.pendingCount}
      id="renewal-manual-source-updates"
    >
      <RenewalSectionHeading id="source-updates" as="h3">
        {list.heading}
      </RenewalSectionHeading>
      {list.combined ? (
        <p
          className="ui-actions"
          data-renewal-source-updates-combined={list.combined.count}
        >
          <Button
            disabled={busy || paused}
            onClick={() =>
              void context.prepareSourceSet?.(
                list.combined!.entries,
                list.combined!.marketValue,
              )
            }
          >
            {list.combined.label}
          </Button>
          {list.combined.remaining > 0 ? (
            <span className="muted">
              {SHEET_SET_WORDS.remaining(list.combined.remaining)}
            </span>
          ) : null}
        </p>
      ) : null}
      {list.rows.length ? (
        <ul className="ui-stack-tight">
          {list.rows.map((row) => {
            const status = rowStatus(
              row,
              paused,
              preparedWords(row, page?.openSheetProposal),
            );
            const sheetAction =
              row.source === "sheet" && row.action?.kind !== "open_form";
            return (
              <li
                data-renewal-source-update={row.key}
                data-renewal-source-update-state={row.state}
                key={row.key}
              >
                <strong>{row.label}</strong>: {row.next}.{" "}
                {row.source === "sheet"
                  ? SOURCE_UPDATES_WORDS.sheetNow
                  : SOURCE_UPDATES_WORDS.rentvineNow}
                : {row.current ?? SOURCE_UPDATES_WORDS.notRead}.{" "}
                {SOURCE_UPDATES_WORDS.basis}: {row.basis}.{status ? ` ${status}` : ""}
                {row.reason && row.state !== "done" ? ` ${row.reason}` : ""}{" "}
                {row.state === "prepared" ? (
                  <a href="#renewal-step-verify-renewal">Review Sheet updates</a>
                ) : null}
                {row.state !== "done" && row.state !== "prepared" && row.action ? (
                  row.waitsForOpen ? (
                    <span className="muted" data-renewal-source-update-waits>
                      {SOURCE_UPDATES_WORDS.openFirst}.
                    </span>
                  ) : (
                    <Button
                      aria-label={`${SOURCE_UPDATES_WORDS.prepare}: ${row.label}`}
                      disabled={busy || (paused && sheetAction)}
                      onClick={() => act(row)}
                      ref={(element: HTMLButtonElement | null) => {
                        actions.current.set(row.key, element);
                      }}
                      size="compact"
                      variant="secondary"
                    >
                      {SOURCE_UPDATES_WORDS.prepare}
                    </Button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p>{SOURCE_UPDATES_WORDS.none}</p>
      )}
    </div>
  );
}
