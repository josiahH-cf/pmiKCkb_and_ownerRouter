"use client";

// S158: where the app looks in the operating Sheet for this lease, inside lease information.
// Staff see the current lookup, its observed values and the Sheet link; they can point the app
// at the actual tab and row, or at one cell for one existing field, inside the configured
// workbook. A selection is an app save (the lease-bound working record) followed by a provider
// READ of exactly that location; it is labelled as a selection, never as a match. A failed read
// names its problem, keeps the selection and leaves every other control alone. One layout serves
// phone and desktop widths.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { AUTOSAVE_IDLE, AutosaveStatus } from "./AutosaveStatus";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";
import { Button, Field } from "@/components/ui";
import { formatBusinessTimestamp } from "@/lib/date-display";
import {
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
  type ExternalDeskDestination,
} from "@/lib/lease-renewal/desk-destinations";
import {
  hasSheetLookupSelection,
  parseSheetCell,
  sheetLookupBinding,
} from "@/lib/lease-renewal/sheet-lookup";
import type { OperatingSheetLookupView } from "@/lib/lease-renewal/sheet-lookup-read";
import { SHEET_FIELD_LABELS } from "@/lib/lease-renewal/sheet-writeback/field-intent";
import type { OperatingSheetLookupCurrent } from "@/lib/lease-renewal/sheet-writeback/lookup-target";
import {
  SHEET_CELL_FIELDS,
  sheetCellWorkingField,
  workingFieldLabel,
} from "@/lib/lease-renewal/working-record";

export type { OperatingSheetLookupCurrent } from "@/lib/lease-renewal/sheet-writeback/lookup-target";

const HOW_LABELS = {
  automatic_link: "It found the row by the row's RentVine lease link.",
  automatic_note: "It found the row by the note the app wrote when it added the row.",
  operator_selected:
    "This is the location staff selected. The app reads it as selected and does not check it against RentVine.",
} as const;

async function fetchLookup(workspaceContext: string): Promise<OperatingSheetLookupView> {
  const response = await fetch("/api/lease-renewal/operating-sheet", {
    method: "GET",
    cache: "no-store",
    headers: {
      "x-renewal-workspace-context": workspaceContext,
      "x-renewal-sheet-read": "lookup",
    },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    status?: string;
    lookup?: OperatingSheetLookupView;
    error?: string;
  };
  if (!response.ok || !payload.lookup)
    throw new Error(
      payload.error ??
        (payload.status === "not_configured"
          ? "The operating Sheet is not connected, so the selected location was not read."
          : "The selected location could not be read just now."),
    );
  return payload.lookup;
}

export function OperatingSheetLookup({
  current,
  sheetDestination = null,
  workspaceContext,
}: Readonly<{
  /** The lookup the lease workspace currently uses; null when that read was unavailable. */
  current: OperatingSheetLookupCurrent | null;
  sheetDestination?: ExternalDeskDestination | null;
  workspaceContext: string | null;
}>) {
  const context = useRenewalWorkingRecord();
  const id = useId();
  const record = context?.record ?? null;
  const binding = useMemo(() => sheetLookupBinding(record), [record]);
  const selected = hasSheetLookupSelection(binding);
  const canEdit = Boolean(context?.canEdit);
  const [view, setView] = useState<OperatingSheetLookupView | null>(null);
  const [reading, setReading] = useState(false);
  const [readProblem, setReadProblem] = useState<string | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const turn = useRef(0);

  const read = useCallback(async () => {
    if (!workspaceContext) {
      setReadProblem(
        "This lease page needs a fresh secure load before the Sheet lookup can read.",
      );
      return;
    }
    const mine = (turn.current += 1);
    setReading(true);
    setReadProblem(null);
    try {
      const next = await fetchLookup(workspaceContext);
      if (mine === turn.current) setView(next);
    } catch (error) {
      if (mine === turn.current)
        setReadProblem(
          error instanceof Error
            ? error.message
            : "The selected location could not be read just now.",
        );
    } finally {
      if (mine === turn.current) setReading(false);
    }
  }, [workspaceContext]);

  // Reopening the lease reads the saved selection again; the automatic lookup needs no read.
  const bindingKey = JSON.stringify(binding);
  useEffect(() => {
    // The read is an external request; its state updates land in its own callbacks.
    if (selected) queueMicrotask(() => void read());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindingKey, read]);
  useEffect(() => {
    if (chooserOpen && !view && !reading) queueMicrotask(() => void read());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chooserOpen]);

  const tabs = view?.tabs.state === "available" ? view.tabs.titles : [];
  const tabsProblem = view?.tabs.state === "unavailable" ? view.tabs.problem : null;

  // --- row selection controls (save on a complete entry; unfinished input saves nothing) ---
  const [rowTab, setRowTab] = useState(binding.row?.value.tabTitle ?? "");
  const [rowText, setRowText] = useState(
    binding.row ? String(binding.row.value.rowNumber) : "",
  );
  const [rowError, setRowError] = useState<string | null>(null);
  const [cellField, setCellField] = useState<string>(SHEET_CELL_FIELDS[0] ?? "");
  const [cellTab, setCellTab] = useState("");
  const [cellText, setCellText] = useState("");
  const [cellError, setCellError] = useState<string | null>(null);

  async function saveRow(tabTitle = rowTab, text = rowText) {
    if (!context || !tabTitle) return;
    const trimmed = text.trim();
    if (trimmed === "") return;
    const rowNumber = Number(trimmed);
    if (!/^\d+$/.test(trimmed) || !Number.isInteger(rowNumber) || rowNumber < 2) {
      setRowError("Enter the row number as it appears in the Sheet, 2 or higher.");
      return;
    }
    setRowError(null);
    if (
      binding.row?.value.tabTitle === tabTitle &&
      binding.row.value.rowNumber === rowNumber
    )
      return;
    await context.save("sheet_row", { tabTitle, rowNumber });
  }
  async function saveCell(field = cellField, tabTitle = cellTab, text = cellText) {
    if (!context || !tabTitle || !field) return;
    const cell = text.trim().toUpperCase();
    if (cell === "") return;
    if (!parseSheetCell(cell) || !/^[A-Z]{1,3}[1-9][0-9]{0,5}$/.test(cell)) {
      setCellError("Enter one cell such as G42.");
      return;
    }
    setCellError(null);
    if (
      binding.cells[field]?.value.tabTitle === tabTitle &&
      binding.cells[field]?.value.cell === cell
    )
      return;
    await context.save(sheetCellWorkingField(field), { tabTitle, cell });
  }

  const rowState = context?.states.sheet_row ?? AUTOSAVE_IDLE;
  const cellState = context?.states[sheetCellWorkingField(cellField)] ?? AUTOSAVE_IDLE;
  const where = (tabTitle: string, rowNumber: number | null) =>
    rowNumber === null ? `tab "${tabTitle}"` : `row ${rowNumber} on tab "${tabTitle}"`;

  return (
    <section
      aria-label="Operating Sheet lookup"
      className="ui-stack-tight renewal-sheet-lookup"
    >
      <h3>Operating Sheet lookup</h3>
      {current === null ? (
        <p className="muted">
          The operating Sheet read did not complete on this page load, so the app&apos;s
          current lookup is not shown. Your saved selection below is unchanged.
        </p>
      ) : current.state === "row" && current.rowNumber !== null ? (
        <p>
          The app reads {where(current.tabTitle, current.rowNumber)} for this lease.
          {current.how ? ` ${HOW_LABELS[current.how]}` : ""}
          {current.explanation ? ` ${current.explanation}` : ""}
        </p>
      ) : current.state === "no_row" ? (
        <p>
          The app has not found a row for this lease on tab &quot;{current.tabTitle}
          &quot;. {current.explanation}
        </p>
      ) : (
        <p>
          The app has not found one row for this lease on tab &quot;{current.tabTitle}
          &quot;.
          {current.explanation ? ` ${current.explanation}` : ""}
        </p>
      )}
      {sheetDestination ? (
        <p>
          <a
            className="text-link renewal-workspace-link"
            href={sheetDestination.href}
            rel={EXTERNAL_LINK_REL}
            target={EXTERNAL_LINK_TARGET}
          >
            Open this row in the Sheet
          </a>{" "}
          <span className="muted">{sheetDestination.label}</span>
        </p>
      ) : null}
      {current && current.values.length > 0 ? (
        <dl className="renewal-info-list" data-testid="sheet-lookup-current-values">
          {current.values.map((entry) => (
            <div key={entry.field}>
              <dt>{entry.label}</dt>
              <dd>{entry.value || "Blank"}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {binding.row ? (
        <div className="ui-stack-tight" data-testid="sheet-lookup-selected-row">
          <p>
            Selected by {binding.row.selectedBy},{" "}
            {formatBusinessTimestamp(binding.row.selectedAtIso)}:{" "}
            {where(binding.row.value.tabTitle, binding.row.value.rowNumber)}.
            {view?.row?.state === "read" && view.row.readAtIso
              ? ` Read ${formatBusinessTimestamp(view.row.readAtIso)}.`
              : ""}
          </p>
          {view?.row?.state === "read" ? (
            view.row.cells && view.row.cells.length > 0 ? (
              <dl className="renewal-info-list">
                {view.row.cells.map((cell) => (
                  <div key={cell.cell}>
                    <dt>
                      {cell.label} ({cell.cell})
                    </dt>
                    <dd>{cell.value || "Blank"}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted">This row is blank.</p>
            )
          ) : null}
          {view?.row?.state === "problem" ? (
            <p role="status">
              {view.row.problem} Your selection is saved; choose another location below or
              use the automatic lookup. Nothing else on this lease waits on it.
            </p>
          ) : null}
          <AutosaveStatus
            onRetry={() => void saveRow()}
            state={rowState}
            subject={workingFieldLabel("sheet_row")}
          />
          {canEdit ? (
            <div className="ui-actions">
              <Button
                onClick={() =>
                  void context?.save("sheet_row", null).then((ok) => {
                    if (ok) {
                      setRowTab("");
                      setRowText("");
                    }
                  })
                }
                size="compact"
                variant="tertiary"
              >
                Use the automatic lookup
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {Object.keys(binding.cells).length > 0 ? (
        <ul className="ui-rows" data-testid="sheet-lookup-selected-cells">
          {Object.entries(binding.cells).map(([field, selection]) => {
            const readCell = view?.cells.find((entry) => entry.field === field);
            const label =
              (SHEET_FIELD_LABELS as Record<string, string | undefined>)[field] ?? field;
            return (
              <li className="ui-stack-tight" key={field}>
                <p>
                  {label}: cell {selection.value.cell} on tab &quot;
                  {selection.value.tabTitle}&quot;. Selected by {selection.selectedBy},{" "}
                  {formatBusinessTimestamp(selection.selectedAtIso)}.
                  {readCell?.state === "read"
                    ? ` Read ${formatBusinessTimestamp(readCell.readAtIso)}: ${readCell.value || "Blank"}.`
                    : ""}
                </p>
                {readCell?.state === "problem" ? (
                  <p role="status">
                    {readCell.problem} Your selection is saved; choose another cell or
                    clear it.
                  </p>
                ) : null}
                <AutosaveStatus
                  state={context?.states[sheetCellWorkingField(field)] ?? AUTOSAVE_IDLE}
                  subject={workingFieldLabel(sheetCellWorkingField(field))}
                />
                {canEdit ? (
                  <div className="ui-actions">
                    <Button
                      onClick={() =>
                        void context?.save(sheetCellWorkingField(field), null)
                      }
                      size="compact"
                      variant="tertiary"
                    >
                      Clear the {label.toLowerCase()} cell
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {reading ? (
        <p aria-busy="true" className="muted" role="status">
          Reading the selected location…
        </p>
      ) : null}
      {readProblem ? (
        <p role="status">
          {readProblem} Your selection is saved. Nothing else on this lease waits on it.
        </p>
      ) : null}

      {canEdit ? (
        <details open={chooserOpen}>
          <summary
            onClick={(event) => {
              event.preventDefault();
              setChooserOpen((open) => !open);
            }}
          >
            Choose where the app looks
          </summary>
          <div className="ui-stack-tight">
            <p className="muted">
              Choose the actual tab and row for this lease, or one cell for one field. The
              app saves the choice for this lease and reads that location; it changes
              nothing in the Sheet.
            </p>
            {tabsProblem ? (
              <p role="status">
                {tabsProblem}{" "}
                <Button onClick={() => void read()} size="compact" variant="tertiary">
                  Read the tab list again
                </Button>
              </p>
            ) : null}
            <Field
              error={rowError ?? undefined}
              htmlFor={`${id}-row-tab`}
              label="Tab for this lease's row"
            >
              <select
                disabled={tabs.length === 0}
                id={`${id}-row-tab`}
                onChange={(event) => {
                  setRowTab(event.target.value);
                  void saveRow(event.target.value, rowText);
                }}
                value={rowTab}
              >
                <option value="">Choose a tab</option>
                {tabs.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
            </Field>
            <Field htmlFor={`${id}-row-number`} label="Row number">
              <input
                disabled={tabs.length === 0}
                id={`${id}-row-number`}
                inputMode="numeric"
                onBlur={() => void saveRow()}
                onChange={(event) => {
                  setRowText(event.target.value);
                  setRowError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveRow();
                }}
                value={rowText}
              />
            </Field>
            <AutosaveStatus
              onRetry={() => void saveRow()}
              state={rowState}
              subject={workingFieldLabel("sheet_row")}
            />

            <Field htmlFor={`${id}-cell-field`} label="Field">
              <select
                id={`${id}-cell-field`}
                onChange={(event) => setCellField(event.target.value)}
                value={cellField}
              >
                {SHEET_CELL_FIELDS.map((field) => (
                  <option key={field} value={field}>
                    {(SHEET_FIELD_LABELS as Record<string, string | undefined>)[field] ??
                      field}
                  </option>
                ))}
              </select>
            </Field>
            <Field htmlFor={`${id}-cell-tab`} label="Tab for this field's cell">
              <select
                disabled={tabs.length === 0}
                id={`${id}-cell-tab`}
                onChange={(event) => {
                  setCellTab(event.target.value);
                  void saveCell(cellField, event.target.value, cellText);
                }}
                value={cellTab}
              >
                <option value="">Choose a tab</option>
                {tabs.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              error={cellError ?? undefined}
              hint="One cell such as G42"
              htmlFor={`${id}-cell`}
              label="Cell"
            >
              <input
                disabled={tabs.length === 0}
                id={`${id}-cell`}
                onBlur={() => void saveCell()}
                onChange={(event) => {
                  setCellText(event.target.value);
                  setCellError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveCell();
                }}
                value={cellText}
              />
            </Field>
            <AutosaveStatus
              onRetry={() => void saveCell()}
              state={cellState}
              subject={workingFieldLabel(sheetCellWorkingField(cellField))}
            />
          </div>
        </details>
      ) : null}
    </section>
  );
}
