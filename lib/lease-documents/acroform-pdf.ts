import { createHash } from "node:crypto";
import {
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFRef,
  PDFSignature,
  PDFTextField,
  StandardFonts,
} from "pdf-lib";
import { EditableLayerError } from "@/lib/firestore/errors";

export const ACROFORM_ADAPTER = "pdf-lib@1.17.1:bounded-acroform/v1";
export const MAX_FILL_PDF_BYTES = 2 * 1024 * 1024;
export type PdfFieldValue = string | boolean;
export interface PdfFillValue {
  name: string;
  value: PdfFieldValue;
}
const forbidden = new Set([
  "AA",
  "A",
  "OpenAction",
  "JS",
  "JavaScript",
  "Launch",
  "XFA",
  "EmbeddedFiles",
  "EmbeddedFile",
  "RichMedia",
  "Encrypt",
  "Perms",
]);
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
function refuse(message: string): never {
  throw new EditableLayerError(`PDF filling unavailable: ${message}`, 409);
}

/** Approved bytes only. Never interprets PDF actions, infers fields, flattens, or touches signatures. */
export async function parseSafePdf(content: Uint8Array, allowStatic = false) {
  return parse(content, allowStatic);
}
async function parse(content: Uint8Array, allowStatic = false) {
  if (!content.byteLength || content.byteLength > MAX_FILL_PDF_BYTES)
    refuse("the supported size is at most 2 MiB.");
  if (
    !Buffer.from(content.subarray(0, 5)).equals(Buffer.from("%PDF-")) ||
    !Buffer.from(content.subarray(-2048)).includes(Buffer.from("%%EOF"))
  )
    refuse("a complete PDF is required.");
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(content, {
      updateMetadata: false,
      throwOnInvalidObject: true,
    });
  } catch {
    return refuse("the file is encrypted or cannot be parsed.");
  }
  if (pdf.isEncrypted || pdf.getPageCount() < 1 || pdf.getPageCount() > 40)
    refuse("encryption or page count is unsupported.");
  const objects = pdf.context.enumerateIndirectObjects();
  if (objects.length > 20_000)
    refuse("the document structure exceeds the supported bound.");
  // Inspect parsed dictionaries, including escaped names and objects inside compressed streams.
  const visited = new Set<unknown>();
  const resolve = (value: unknown) =>
    value instanceof PDFRef ? pdf.context.lookup(value) : value;
  const nameOf = (dict: PDFDict, key: string) => {
    const value = resolve(dict.get(PDFName.of(key)));
    return value instanceof PDFName ? value.decodeText() : undefined;
  };
  // S130: /A is an action only on an annotation or outline item; on a structure element it holds
  // attributes. A link annotation may navigate (URI or GoTo, no chained action) and is kept
  // untouched; every other action, and any action on another object, stays refused.
  const benignA = (dict: PDFDict, value: unknown) => {
    if (
      nameOf(dict, "Type") === "StructElem" ||
      (dict.has(PDFName.of("S")) &&
        dict.has(PDFName.of("P")) &&
        !dict.has(PDFName.of("Subtype")))
    )
      return true;
    if (nameOf(dict, "Subtype") !== "Link") return false;
    const action = resolve(value);
    return (
      action instanceof PDFDict &&
      ["URI", "GoTo"].includes(nameOf(action, "S") ?? "") &&
      !action.has(PDFName.of("Next"))
    );
  };
  const inspect = (object: unknown, depth = 0) => {
    if (depth > 100 || visited.size > 100_000)
      refuse("the object graph exceeds the supported bound.");
    if (!object || typeof object !== "object" || visited.has(object)) return;
    visited.add(object);
    if (object instanceof PDFDict) {
      for (const [key, value] of object.entries()) {
        const keyName = key.decodeText();
        if (forbidden.has(keyName) && !(keyName === "A" && benignA(object, value)))
          refuse(
            "active content, attachments, protected signatures, or XFA are unsupported.",
          );
        if (
          ["Type", "Subtype", "S"].includes(key.decodeText()) &&
          value instanceof PDFName &&
          ["JavaScript", "Launch", "EmbeddedFile", "RichMedia"].includes(
            value.decodeText(),
          )
        )
          refuse("active content or attachments are unsupported.");
        inspect(value, depth + 1);
      }
    } else if ("asArray" in object && typeof object.asArray === "function") {
      for (const item of object.asArray()) inspect(item, depth + 1);
    } else if ("dict" in object) inspect(object.dict, depth + 1);
  };
  for (const [, object] of objects) inspect(object);
  const fields = pdf.getForm().getFields();
  if (
    (!allowStatic && !fields.length) ||
    fields.length > 200 ||
    new Set(fields.map((field) => field.getName())).size !== fields.length
  )
    refuse("the form has no fields, too many fields, or ambiguous names.");
  for (const field of fields) {
    if (
      !field.getName() ||
      field.getName().length > 160 ||
      /[\u0000-\u001f\u007f]/.test(field.getName())
    )
      refuse("field names exceed the supported bound.");
    if (field instanceof PDFSignature && field.acroField.dict.has(PDFName.of("V")))
      refuse("an existing signature must not be modified.");
  }
  if (
    Buffer.byteLength(
      JSON.stringify(
        Object.fromEntries(fields.map((field) => [field.getName(), fieldValue(field)])),
      ),
      "utf8",
    ) >
    64 * 1024
  )
    refuse("field values exceed the supported comparison bound.");
  return { pdf, fields };
}

function fieldValue(
  field: ReturnType<PDFDocument["getForm"]>["getFields"] extends () => Array<infer F>
    ? F
    : never,
): PdfFieldValue | null {
  if (field instanceof PDFTextField) return field.getText() ?? "";
  if (field instanceof PDFCheckBox) return field.isChecked();
  if (field instanceof PDFRadioGroup) return field.getSelected() ?? "";
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    const selected = field.getSelected();
    if (selected.length > 1) refuse("multiple selections are unsupported.");
    return selected[0] ?? "";
  }
  if (field instanceof PDFSignature) return null;
  return refuse("a field type is unsupported.");
}

export async function readAcroformValues(
  content: Uint8Array,
): Promise<Record<string, PdfFieldValue | null>> {
  const { fields } = await parse(content);
  return Object.fromEntries(fields.map((field) => [field.getName(), fieldValue(field)]));
}

export async function inspectAcroformPdf(content: Uint8Array) {
  const { fields } = await parse(content, true);
  return fields.map((field) => ({
    name: field.getName(),
    type:
      field instanceof PDFSignature
        ? ("signature" as const)
        : field instanceof PDFTextField
          ? ("text" as const)
          : field instanceof PDFCheckBox
            ? ("checkbox" as const)
            : field instanceof PDFDropdown ||
                field instanceof PDFOptionList ||
                field instanceof PDFRadioGroup
              ? ("selection" as const)
              : ("unsupported" as const),
  }));
}

/** The result contains the actual serialized PDF and a comparison made after reopening it. */
export async function fillAcroformPdf(
  original: Uint8Array,
  values: readonly PdfFillValue[],
) {
  if (
    !values.length ||
    values.length > 200 ||
    new Set(values.map((item) => item.name)).size !== values.length
  )
    refuse("each reviewed field needs exactly one value.");
  const { pdf, fields } = await parse(original);
  const selected = values.map((entry) => {
    const field = fields.find((candidate) => candidate.getName() === entry.name);
    if (!field || field instanceof PDFSignature || field.isReadOnly())
      refuse("a mapped field is missing, protected, or a signature.");
    return { field, entry };
  });
  const mutable = new Set<unknown>();
  for (const { field } of selected) {
    mutable.add(field.acroField.dict);
    for (const widget of field.acroField.getWidgets()) mutable.add(widget.dict);
  }
  const unchanged = pdf.context
    .enumerateIndirectObjects()
    .filter(([, object]) => !mutable.has(object))
    .map(([reference, object]) => ({ reference, fingerprint: hash(object.toString()) }));
  const beforeValues = Object.fromEntries(
    fields.map((field) => [field.getName(), fieldValue(field)]),
  );
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const { field, entry } of selected) {
    if (field instanceof PDFTextField) {
      if (
        typeof entry.value !== "string" ||
        entry.value.length > 2000 ||
        /[\u0000-\u0008\u000b-\u001f\u007f]/.test(entry.value)
      )
        refuse("text length or characters are unsupported.");
      try {
        font.encodeText(entry.value.replaceAll("\n", ""));
      } catch {
        refuse("the field contains unsupported glyphs; use the manual handoff.");
      }
      const lines = entry.value.split("\n");
      if (lines.length > 1 && !field.isMultiline())
        refuse("a single-line field cannot contain line breaks.");
      const maxLength = field.getMaxLength();
      if (maxLength !== undefined && entry.value.length > maxLength)
        refuse("the text exceeds the field's approved capacity.");
      const widgets = field.acroField.getWidgets();
      if (!widgets.length) refuse("a mapped field has no visible location.");
      for (const widget of widgets) {
        const rect = widget.getRectangle();
        if (
          rect.height < lines.length * 12 + 4 ||
          lines.some((line) => font.widthOfTextAtSize(line, 10) + 8 > rect.width)
        )
          refuse("the text would overflow its reviewed field.");
      }
      field.setText(entry.value);
      field.setFontSize(10);
      field.updateAppearances(font);
    } else if (field instanceof PDFCheckBox) {
      if (typeof entry.value !== "boolean")
        refuse("a checkbox requires a verified boolean.");
      if (entry.value) field.check();
      else field.uncheck();
      field.updateAppearances();
    } else if (
      field instanceof PDFDropdown ||
      field instanceof PDFOptionList ||
      field instanceof PDFRadioGroup
    ) {
      if (typeof entry.value !== "string" || !field.getOptions().includes(entry.value))
        refuse("a selection must match an existing reviewed option.");
      field.select(entry.value);
      if (field instanceof PDFRadioGroup) field.updateAppearances();
      else field.updateAppearances(font);
    } else refuse("the mapped field type is unsupported.");
  }
  const content = await pdf.save({
    updateFieldAppearances: false,
    useObjectStreams: false,
  });
  const reopened = await parse(content);
  for (const item of unchanged) {
    const observed = reopened.pdf.context.lookup(item.reference);
    if (!observed || hash(observed.toString()) !== item.fingerprint)
      refuse("content outside the reviewed fields changed.");
  }
  const observed = await readAcroformValues(content);
  const expected = {
    ...beforeValues,
    ...Object.fromEntries(values.map((entry) => [entry.name, entry.value])),
  };
  if (JSON.stringify(observed) !== JSON.stringify(expected))
    refuse("saved field values do not match the complete expected form.");
  return {
    content,
    adapter: ACROFORM_ADAPTER,
    originalHash: hash(original),
    outputHash: hash(content),
    comparison: {
      allFields: observed,
      changedFieldNames: values.map((entry) => entry.name),
      unchangedObjects: unchanged.length,
      verified: true as const,
    },
  };
}
