/** Exact provider representation. A formatted string alone cannot prove checkbox/date preservation. */
export interface SheetCellEvidence {
  value: {
    numberValue?: number;
    boolValue?: boolean;
    stringValue?: string;
    formulaValue?: string;
  };
  formattedValue: string;
  numberFormat: string | null;
  checkbox: boolean;
}

export function sheetCellRepresentationPreserved(
  before: SheetCellEvidence,
  after: SheetCellEvidence,
  replacement: string,
): boolean {
  if (
    before.value.formulaValue !== undefined ||
    after.value.formulaValue !== undefined ||
    before.checkbox !== after.checkbox
  )
    return false;
  if (before.numberFormat !== after.numberFormat) return false;
  if (before.checkbox || typeof before.value.boolValue === "boolean") {
    return (
      /^(true|false)$/i.test(replacement) &&
      typeof after.value.boolValue === "boolean" &&
      after.value.boolValue === (replacement.toLowerCase() === "true")
    );
  }
  if (before.numberFormat === "DATE" || before.numberFormat === "DATE_TIME") {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(replacement) ||
      typeof after.value.numberValue !== "number"
    )
      return false;
    const serial =
      (Date.parse(`${replacement}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000;
    return after.value.numberValue === serial;
  }
  return true;
}

/** Read one exact server-selected cell with the caller's existing Google credential scope. */
export async function readSheetCellEvidence(input: {
  spreadsheetId: string;
  range: string;
  authorization: string;
  signal?: AbortSignal;
}): Promise<SheetCellEvidence> {
  if (!/^'(?:[^']|'')+'![A-Z]+[1-9]\d*$/.test(input.range))
    throw new Error("Expected one exact Sheet cell.");
  const query = new URLSearchParams({
    ranges: input.range,
    fields:
      "sheets.data.rowData.values(userEnteredValue,formattedValue,effectiveFormat.numberFormat,dataValidation.condition)",
  });
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}?${query}`,
    {
      headers: { Authorization: input.authorization },
      signal: input.signal ?? AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) throw new Error("Sheets cell representation read failed.");
  const body = (await response.json()) as {
    sheets?: {
      data?: {
        rowData?: {
          values?: {
            userEnteredValue?: SheetCellEvidence["value"];
            formattedValue?: string;
            effectiveFormat?: { numberFormat?: { type?: string } };
            dataValidation?: { condition?: { type?: string } };
          }[];
        }[];
      }[];
    }[];
  };
  if (body.sheets?.length !== 1)
    throw new Error("Sheets cell representation is ambiguous.");
  const cell = body.sheets[0].data?.[0]?.rowData?.[0]?.values?.[0];
  return {
    value: cell?.userEnteredValue ?? {},
    formattedValue: cell?.formattedValue ?? "",
    numberFormat: cell?.effectiveFormat?.numberFormat?.type ?? null,
    checkbox: cell?.dataValidation?.condition?.type === "BOOLEAN",
  };
}
