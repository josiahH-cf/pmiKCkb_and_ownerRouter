// S130 (R-F10-02, R-F10-04, AC-S130-11, AC-S130-12): bounded filling of a static PDF.
//
// A static PDF has no form fields, so values are placed in reviewed regions of its pages. The route
// reads the page content with a bounded tokenizer and a text-position interpreter, then:
//   * refuses a page whose size, crop or rotation differs from the reviewed geometry;
//   * refuses a "blank" region that holds existing text, and a "replace" region crossed by text,
//     an image or nested content it cannot remove exactly;
//   * removes each approved existing text run inside a "replace" region by replacing its show
//     operator with a glyph-free advance of the same width, so the remaining text keeps its exact
//     position and the old value is no longer extractable from the page;
//   * draws each value in Helvetica inside its region, wrapped and tagged, never shrinking text,
//     never drawing into a protected signature, initial or signing-date area;
//   * reopens the saved bytes and proves the fixed content is byte-identical, the removed runs are
//     gone and every drawn value reads back exactly.
// The original bytes are never modified; page content and resources outside these rules are kept.

import { createHash } from "node:crypto";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  StandardFonts,
  decodePDFRawStream,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import { parseSafePdf } from "@/lib/lease-documents/acroform-pdf";
import type {
  RegionRect,
  StaticPdfGeometry,
  StaticValueFormat,
} from "@/lib/lease-documents/artifact-intake-contract";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";

export const STATIC_ADAPTER = "pdf-lib@1.17.1:bounded-static/v1";
const MAX_PAGE_CONTENT_BYTES = 8 * 1024 * 1024;
const MAX_PAGE_OPERATORS = 250_000;
const TOLERANCE = 0.75;

function refuse(message: string): never {
  throw new EditableLayerError(`Static PDF filling unavailable: ${message}`, 409);
}
const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");

// ---- content tokenizer --------------------------------------------------------------------------

export interface Operand {
  kind: "number" | "name" | "string" | "array" | "dict" | "bool" | "null";
  number?: number;
  name?: string;
  bytes?: Uint8Array;
  items?: Operand[];
  entries?: Map<string, Operand>;
}

export interface ContentOp {
  operator: string;
  operands: Operand[];
  /** Byte range of the operands and operator in the decoded stream. */
  start: number;
  end: number;
}

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

/** A bounded tokenizer for one decoded content stream; malformed input is refused, never guessed. */
export function tokenizeContent(bytes: Uint8Array): ContentOp[] {
  if (bytes.byteLength > MAX_PAGE_CONTENT_BYTES)
    refuse("a page's content exceeds the bound.");
  const ops: ContentOp[] = [];
  const n = bytes.length;
  let i = 0;
  const skip = () => {
    while (i < n) {
      const c = bytes[i];
      if (WHITESPACE.has(c)) i++;
      else if (c === 0x25) {
        while (i < n && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i++;
      } else break;
    }
  };
  const regular = (c: number) => !WHITESPACE.has(c) && !DELIMITERS.has(c);
  const readLiteral = (): Uint8Array => {
    i++; // (
    const out: number[] = [];
    let depth = 1;
    while (i < n) {
      const c = bytes[i++];
      if (c === 0x5c) {
        const e = bytes[i++];
        if (e === undefined) break;
        const map: Record<number, number> = {
          0x6e: 10,
          0x72: 13,
          0x74: 9,
          0x62: 8,
          0x66: 12,
        };
        if (map[e] !== undefined) out.push(map[e]);
        else if (e >= 0x30 && e <= 0x37) {
          let value = e - 0x30;
          for (let k = 0; k < 2 && bytes[i] >= 0x30 && bytes[i] <= 0x37; k++)
            value = value * 8 + (bytes[i++] - 0x30);
          out.push(value & 0xff);
        } else if (e === 0x0d) {
          if (bytes[i] === 0x0a) i++;
        } else if (e !== 0x0a) out.push(e);
      } else if (c === 0x28) {
        depth++;
        out.push(c);
      } else if (c === 0x29) {
        depth--;
        if (depth === 0) return Uint8Array.from(out);
        out.push(c);
      } else out.push(c);
    }
    return refuse("an unterminated string in page content.");
  };
  const readHex = (): Uint8Array => {
    i++; // <
    const digits: number[] = [];
    while (i < n && bytes[i] !== 0x3e) {
      const c = bytes[i++];
      if (WHITESPACE.has(c)) continue;
      const v = Number.parseInt(String.fromCharCode(c), 16);
      if (Number.isNaN(v)) refuse("a malformed hex string in page content.");
      digits.push(v);
    }
    if (i >= n) refuse("an unterminated hex string in page content.");
    i++; // >
    if (digits.length % 2) digits.push(0);
    const out = new Uint8Array(digits.length / 2);
    for (let k = 0; k < out.length; k++) out[k] = digits[2 * k] * 16 + digits[2 * k + 1];
    return out;
  };
  const readToken = (): string => {
    const start = i;
    while (i < n && regular(bytes[i])) i++;
    return Buffer.from(bytes.subarray(start, i)).toString("latin1");
  };
  const readValue = (depth: number): Operand | { keyword: string } => {
    if (depth > 32) refuse("page content nests too deeply.");
    skip();
    const c = bytes[i];
    if (c === 0x2f) {
      i++;
      return { kind: "name", name: readToken() };
    }
    if (c === 0x28) return { kind: "string", bytes: readLiteral() };
    if (c === 0x3c && bytes[i + 1] === 0x3c) {
      i += 2;
      const entries = new Map<string, Operand>();
      for (;;) {
        skip();
        if (bytes[i] === 0x3e && bytes[i + 1] === 0x3e) {
          i += 2;
          return { kind: "dict", entries };
        }
        if (i >= n) refuse("an unterminated dictionary in page content.");
        const key = readValue(depth + 1);
        if (!("kind" in key) || key.kind !== "name") refuse("a malformed dictionary.");
        const value = readValue(depth + 1);
        if (!("kind" in value)) refuse("a malformed dictionary value.");
        entries.set((key as Operand).name!, value as Operand);
      }
    }
    if (c === 0x3c) return { kind: "string", bytes: readHex() };
    if (c === 0x5b) {
      i++;
      const items: Operand[] = [];
      for (;;) {
        skip();
        if (bytes[i] === 0x5d) {
          i++;
          return { kind: "array", items };
        }
        if (i >= n) refuse("an unterminated array in page content.");
        const item = readValue(depth + 1);
        if (!("kind" in item)) refuse("an operator inside an array.");
        items.push(item as Operand);
      }
    }
    if (c === 0x5d || c === 0x3e || c === 0x29 || c === 0x7b || c === 0x7d) {
      i++;
      return refuse("a stray delimiter in page content.");
    }
    const token = readToken();
    if (token === "") {
      i++;
      return refuse("an unreadable byte in page content.");
    }
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(token))
      return { kind: "number", number: Number(token) };
    if (token === "true" || token === "false") return { kind: "bool" };
    if (token === "null") return { kind: "null" };
    return { keyword: token };
  };
  let operands: Operand[] = [];
  let start = -1;
  while (true) {
    skip();
    if (i >= n) break;
    const at = i;
    const value = readValue(0);
    if (start < 0) start = at;
    if ("kind" in value) {
      operands.push(value as Operand);
      continue;
    }
    if (value.keyword === "BI") {
      // An inline image: its dictionary, then binary data up to a delimited EI.
      const id = Buffer.from(bytes).indexOf("ID", i, "latin1");
      if (id < 0) refuse("an unterminated inline image.");
      let k = id + 3;
      let found = -1;
      while (k < n - 1) {
        if (
          bytes[k] === 0x45 &&
          bytes[k + 1] === 0x49 &&
          WHITESPACE.has(bytes[k - 1]) &&
          (k + 2 >= n || WHITESPACE.has(bytes[k + 2]) || DELIMITERS.has(bytes[k + 2]))
        ) {
          found = k;
          break;
        }
        k++;
      }
      if (found < 0) refuse("an unterminated inline image.");
      i = found + 2;
      ops.push({ operator: "BI", operands: [], start, end: i });
    } else ops.push({ operator: value.keyword, operands, start, end: i });
    if (ops.length > MAX_PAGE_OPERATORS)
      refuse("a page's content exceeds the operator bound.");
    operands = [];
    start = -1;
  }
  return ops;
}

// ---- fonts ----------------------------------------------------------------------------------------

interface FontMetrics {
  twoByte: boolean;
  /** Advance width for a glyph code in text space units for a font size of 1. */
  width: (code: number) => number;
  decode: (codes: readonly number[]) => string;
}

function lookup(pdf: PDFDocument, value: unknown): unknown {
  return value instanceof PDFRef ? pdf.context.lookup(value) : value;
}

function numberAt(pdf: PDFDocument, value: unknown): number | null {
  const resolved = lookup(pdf, value);
  return resolved instanceof PDFNumber ? resolved.asNumber() : null;
}

function streamBytes(stream: unknown): Uint8Array {
  if (stream instanceof PDFRawStream) return decodePDFRawStream(stream).decode();
  if (stream instanceof PDFStream) return stream.getContents();
  return refuse("a content stream is unreadable.");
}

function parseToUnicode(bytes: Uint8Array): Map<number, string> {
  const map = new Map<number, string>();
  const text = Buffer.from(bytes).toString("latin1");
  const utf16 = (hex: string) => {
    const clean = hex.replace(/\s+/g, "");
    let out = "";
    for (let k = 0; k + 3 < clean.length; k += 4)
      out += String.fromCharCode(Number.parseInt(clean.slice(k, k + 4), 16));
    return out;
  };
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const entry of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g))
      map.set(Number.parseInt(entry[1], 16), utf16(entry[2]));
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const entry of block[1].matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])/g,
    )) {
      const low = Number.parseInt(entry[1], 16);
      const high = Math.min(Number.parseInt(entry[2], 16), low + 65_535);
      if (entry[3].startsWith("[")) {
        const items = [...entry[3].matchAll(/<([0-9A-Fa-f]*)>/g)];
        for (let code = low; code <= high && code - low < items.length; code++)
          map.set(code, utf16(items[code - low][1]));
      } else {
        const base = entry[3].slice(1, -1);
        const first = Number.parseInt(base.slice(-4) || "0", 16);
        for (let code = low; code <= high; code++)
          map.set(
            code,
            utf16(base.slice(0, -4)) + String.fromCharCode(first + code - low),
          );
      }
    }
  return map;
}

const STANDARD_FONTS: Readonly<Record<string, StandardFonts>> = {
  Helvetica: StandardFonts.Helvetica,
  "Helvetica-Bold": StandardFonts.HelveticaBold,
  "Helvetica-Oblique": StandardFonts.HelveticaOblique,
  "Helvetica-BoldOblique": StandardFonts.HelveticaBoldOblique,
  "Times-Roman": StandardFonts.TimesRoman,
  "Times-Bold": StandardFonts.TimesRomanBold,
  "Times-Italic": StandardFonts.TimesRomanItalic,
  "Times-BoldItalic": StandardFonts.TimesRomanBoldItalic,
  Courier: StandardFonts.Courier,
  "Courier-Bold": StandardFonts.CourierBold,
  "Courier-Oblique": StandardFonts.CourierOblique,
  "Courier-BoldOblique": StandardFonts.CourierBoldOblique,
  Symbol: StandardFonts.Symbol,
  ZapfDingbats: StandardFonts.ZapfDingbats,
};

async function fontMetrics(
  pdf: PDFDocument,
  font: PDFDict,
  scratch: { doc: PDFDocument | null },
): Promise<FontMetrics> {
  const subtype = (
    lookup(pdf, font.get(PDFName.of("Subtype"))) as PDFName | undefined
  )?.decodeText();
  const toUnicodeStream = lookup(pdf, font.get(PDFName.of("ToUnicode")));
  const toUnicode = toUnicodeStream ? parseToUnicode(streamBytes(toUnicodeStream)) : null;
  const decodeSimple = (codes: readonly number[]) =>
    codes
      .map(
        (code) =>
          toUnicode?.get(code) ??
          (code >= 32 && code < 127 ? String.fromCharCode(code) : "?"),
      )
      .join("");
  if (subtype === "Type0") {
    const encoding = lookup(pdf, font.get(PDFName.of("Encoding")));
    if (
      !(encoding instanceof PDFName) ||
      !["Identity-H", "Identity-V"].includes(encoding.decodeText())
    )
      refuse("a composite font uses an encoding this route does not read.");
    const descendants = lookup(pdf, font.get(PDFName.of("DescendantFonts")));
    const cid = descendants instanceof PDFArray ? lookup(pdf, descendants.get(0)) : null;
    if (!(cid instanceof PDFDict)) refuse("a composite font has no glyph metrics.");
    const defaultWidth = numberAt(pdf, cid.get(PDFName.of("DW"))) ?? 1000;
    const widths = new Map<number, number>();
    const w = lookup(pdf, cid.get(PDFName.of("W")));
    if (w instanceof PDFArray) {
      const items = w.asArray().map((item) => lookup(pdf, item));
      for (let k = 0; k < items.length; ) {
        const first =
          items[k] instanceof PDFNumber ? (items[k] as PDFNumber).asNumber() : null;
        const next = items[k + 1];
        if (first === null) refuse("a composite font's widths are malformed.");
        if (next instanceof PDFArray) {
          next.asArray().forEach((value, index) => {
            const width = numberAt(pdf, value);
            if (width !== null) widths.set(first + index, width);
          });
          k += 2;
        } else {
          const last = next instanceof PDFNumber ? next.asNumber() : null;
          const width = numberAt(pdf, items[k + 2]);
          if (last === null || width === null || last - first > 65_535)
            refuse("a composite font's widths are malformed.");
          for (let code = first; code <= last; code++) widths.set(code, width);
          k += 3;
        }
      }
    }
    return {
      twoByte: true,
      width: (code) => (widths.get(code) ?? defaultWidth) / 1000,
      decode: (codes) => codes.map((code) => toUnicode?.get(code) ?? "?").join(""),
    };
  }
  const firstChar = numberAt(pdf, font.get(PDFName.of("FirstChar"))) ?? 0;
  const widthsArray = lookup(pdf, font.get(PDFName.of("Widths")));
  const descriptor = lookup(pdf, font.get(PDFName.of("FontDescriptor")));
  const missing =
    descriptor instanceof PDFDict
      ? (numberAt(pdf, descriptor.get(PDFName.of("MissingWidth"))) ?? 0)
      : 0;
  if (widthsArray instanceof PDFArray) {
    const scale =
      subtype === "Type3"
        ? (() => {
            const matrix = lookup(pdf, font.get(PDFName.of("FontMatrix")));
            const a = matrix instanceof PDFArray ? numberAt(pdf, matrix.get(0)) : null;
            if (a === null) refuse("a Type 3 font has no font matrix.");
            return a;
          })()
        : 1 / 1000;
    const values = widthsArray.asArray().map((item) => numberAt(pdf, item));
    return {
      twoByte: false,
      width: (code) => {
        const value = values[code - firstChar];
        return (value ?? missing) * scale;
      },
      decode: decodeSimple,
    };
  }
  const baseFont = (lookup(pdf, font.get(PDFName.of("BaseFont"))) as PDFName | undefined)
    ?.decodeText()
    .replace(/^[A-Z]{6}\+/, "");
  const standard = baseFont ? STANDARD_FONTS[baseFont] : undefined;
  if (!standard) refuse("a font has no glyph widths.");
  scratch.doc ??= await PDFDocument.create();
  const metrics: PDFFont = await scratch.doc.embedFont(standard);
  const cache = new Map<number, number>();
  return {
    twoByte: false,
    width: (code) => {
      if (!cache.has(code)) {
        let value = 0.5;
        if (code >= 32 && code < 127)
          try {
            value = metrics.widthOfTextAtSize(String.fromCharCode(code), 1);
          } catch {
            value = 0.5;
          }
        cache.set(code, value);
      }
      return cache.get(code)!;
    },
    decode: decodeSimple,
  };
}

// ---- text-position interpreter -----------------------------------------------------------------

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}
function point(m: Matrix, x: number, y: number): [number, number] {
  return [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
function boxOf(m: Matrix, corners: ReadonlyArray<[number, number]>): Box {
  const points = corners.map(([x, y]) => point(m, x, y));
  return {
    x0: Math.min(...points.map((p) => p[0])),
    y0: Math.min(...points.map((p) => p[1])),
    x1: Math.max(...points.map((p) => p[0])),
    y1: Math.max(...points.map((p) => p[1])),
  };
}

export interface TextRun {
  streamIndex: number;
  op: ContentOp;
  box: Box;
  text: string;
  glyphs: number;
  /** Text-space advance of the run, for a glyph-free replacement of the same width. */
  advance: number;
  fontSize: number;
  horizontalScale: number;
  /** The `"` operator's word and character spacing, re-applied by its replacement. */
  spacing?: { word: number; character: number };
}

export interface PlacedObject {
  streamIndex: number;
  op: ContentOp;
  box: Box;
  kind: "image" | "form";
}

interface PageReading {
  streams: Array<{ ref: PDFRef | null; bytes: Uint8Array; ops: ContentOp[] }>;
  runs: TextRun[];
  objects: PlacedObject[];
}

function inheritedResources(pdf: PDFDocument, page: PDFPage): PDFDict | null {
  let node: unknown = page.node;
  for (let depth = 0; depth < 32 && node instanceof PDFDict; depth++) {
    const resources = lookup(pdf, node.get(PDFName.of("Resources")));
    if (resources instanceof PDFDict) return resources;
    node = lookup(pdf, node.get(PDFName.of("Parent")));
  }
  return null;
}

function contentRefs(
  pdf: PDFDocument,
  page: PDFPage,
): Array<{ ref: PDFRef | null; stream: unknown }> {
  const raw = page.node.get(PDFName.of("Contents"));
  const value = lookup(pdf, raw);
  if (value === undefined) return [];
  if (value instanceof PDFArray)
    return value.asArray().map((item) => ({
      ref: item instanceof PDFRef ? item : null,
      stream: lookup(pdf, item),
    }));
  return [{ ref: raw instanceof PDFRef ? raw : null, stream: value }];
}

async function readPage(
  pdf: PDFDocument,
  page: PDFPage,
  scratch: { doc: PDFDocument | null },
): Promise<PageReading> {
  const resources = inheritedResources(pdf, page);
  const fontDict = resources ? lookup(pdf, resources.get(PDFName.of("Font"))) : null;
  const xobjects = resources ? lookup(pdf, resources.get(PDFName.of("XObject"))) : null;
  const fonts = new Map<string, FontMetrics>();
  const fontFor = async (key: string) => {
    if (!fonts.has(key)) {
      const font =
        fontDict instanceof PDFDict ? lookup(pdf, fontDict.get(PDFName.of(key))) : null;
      if (!(font instanceof PDFDict)) refuse(`page text uses an undefined font ${key}.`);
      fonts.set(key, await fontMetrics(pdf, font, scratch));
    }
    return fonts.get(key)!;
  };
  const streams = contentRefs(pdf, page).map(({ ref, stream }) => {
    const bytes = streamBytes(stream);
    return { ref, bytes, ops: tokenizeContent(bytes) };
  });
  const runs: TextRun[] = [];
  const objects: PlacedObject[] = [];
  interface State {
    ctm: Matrix;
    fontKey: string | null;
    fontSize: number;
    charSpacing: number;
    wordSpacing: number;
    scale: number;
    leading: number;
    rise: number;
  }
  let state: State = {
    ctm: [...IDENTITY],
    fontKey: null,
    fontSize: 0,
    charSpacing: 0,
    wordSpacing: 0,
    scale: 1,
    leading: 0,
    rise: 0,
  };
  const stack: State[] = [];
  let tm: Matrix = [...IDENTITY];
  let tlm: Matrix = [...IDENTITY];
  const nums = (op: ContentOp, count: number) => {
    const values = op.operands
      .filter((operand) => operand.kind === "number")
      .map((operand) => operand.number!);
    if (values.length < count)
      refuse(`a malformed ${op.operator} operator in page content.`);
    return values.slice(-count);
  };
  const moveLine = (x: number, y: number) => {
    tlm = multiply([1, 0, 0, 1, x, y], tlm);
    tm = [...tlm];
  };
  const show = async (op: ContentOp, streamIndex: number, items: Operand[]) => {
    if (!state.fontKey) refuse("page text has no selected font.");
    const font = await fontFor(state.fontKey);
    const startMatrix = multiply(tm, state.ctm);
    let advance = 0;
    let glyphs = 0;
    const codes: number[] = [];
    for (const item of items) {
      if (item.kind === "number") {
        advance -= (item.number! / 1000) * state.fontSize * state.scale;
        continue;
      }
      if (item.kind !== "string") refuse("a malformed text operator.");
      const bytes = item.bytes!;
      const step = font.twoByte ? 2 : 1;
      for (let k = 0; k + step - 1 < bytes.length; k += step) {
        const code = font.twoByte ? bytes[k] * 256 + bytes[k + 1] : bytes[k];
        codes.push(code);
        glyphs++;
        const word = !font.twoByte && code === 32 ? state.wordSpacing : 0;
        advance +=
          (font.width(code) * state.fontSize + state.charSpacing + word) * state.scale;
      }
    }
    const low = state.rise - 0.25 * Math.abs(state.fontSize);
    const high = state.rise + 0.9 * Math.abs(state.fontSize);
    if (glyphs > 0)
      runs.push({
        streamIndex,
        op,
        box: boxOf(startMatrix, [
          [0, low],
          [advance, low],
          [0, high],
          [advance, high],
        ]),
        text: font.decode(codes),
        glyphs,
        advance,
        fontSize: state.fontSize,
        horizontalScale: state.scale,
        ...(op.operator === '"'
          ? { spacing: { word: state.wordSpacing, character: state.charSpacing } }
          : {}),
      });
    tm = multiply([1, 0, 0, 1, advance, 0], tm);
  };
  for (const [streamIndex, stream] of streams.entries()) {
    for (const op of stream.ops) {
      switch (op.operator) {
        case "q":
          stack.push({ ...state, ctm: [...state.ctm] });
          if (stack.length > 64) refuse("graphics state nests too deeply.");
          break;
        case "Q":
          state = stack.pop() ?? state;
          break;
        case "cm":
          state.ctm = multiply(nums(op, 6) as Matrix, state.ctm);
          break;
        case "BT":
          tm = [...IDENTITY];
          tlm = [...IDENTITY];
          break;
        case "Tf": {
          const name = op.operands.find((operand) => operand.kind === "name")?.name;
          if (!name) refuse("a malformed font selection.");
          state.fontKey = name;
          state.fontSize = nums(op, 1)[0];
          break;
        }
        case "Tc":
          state.charSpacing = nums(op, 1)[0];
          break;
        case "Tw":
          state.wordSpacing = nums(op, 1)[0];
          break;
        case "Tz":
          state.scale = nums(op, 1)[0] / 100;
          break;
        case "TL":
          state.leading = nums(op, 1)[0];
          break;
        case "Ts":
          state.rise = nums(op, 1)[0];
          break;
        case "Td": {
          const [x, y] = nums(op, 2);
          moveLine(x, y);
          break;
        }
        case "TD": {
          const [x, y] = nums(op, 2);
          state.leading = -y;
          moveLine(x, y);
          break;
        }
        case "Tm":
          tlm = nums(op, 6) as Matrix;
          tm = [...tlm];
          break;
        case "T*":
          moveLine(0, -state.leading);
          break;
        case "Tj":
          await show(
            op,
            streamIndex,
            op.operands.filter((operand) => operand.kind === "string"),
          );
          break;
        case "TJ": {
          const array = op.operands.find((operand) => operand.kind === "array");
          if (!array) refuse("a malformed TJ operator.");
          await show(op, streamIndex, array.items!);
          break;
        }
        case "'":
          moveLine(0, -state.leading);
          await show(
            op,
            streamIndex,
            op.operands.filter((operand) => operand.kind === "string"),
          );
          break;
        case '"': {
          const [word, character] = nums(op, 2);
          state.wordSpacing = word;
          state.charSpacing = character;
          moveLine(0, -state.leading);
          await show(
            op,
            streamIndex,
            op.operands.filter((operand) => operand.kind === "string"),
          );
          break;
        }
        case "Do": {
          const name = op.operands.find((operand) => operand.kind === "name")?.name;
          const object =
            name && xobjects instanceof PDFDict
              ? lookup(pdf, xobjects.get(PDFName.of(name)))
              : null;
          const dict =
            object instanceof PDFRawStream || object instanceof PDFStream
              ? object.dict
              : null;
          const subtype = (
            dict?.get(PDFName.of("Subtype")) as PDFName | undefined
          )?.decodeText();
          if (subtype === "Form") {
            const bbox = lookup(pdf, dict!.get(PDFName.of("BBox")));
            const matrix = lookup(pdf, dict!.get(PDFName.of("Matrix")));
            const values = (array: unknown, fallback: number[]) =>
              array instanceof PDFArray
                ? array.asArray().map((item) => numberAt(pdf, item) ?? 0)
                : fallback;
            const [bx0, by0, bx1, by1] = values(bbox, [0, 0, 0, 0]);
            const form = multiply(values(matrix, [...IDENTITY]) as Matrix, state.ctm);
            objects.push({
              streamIndex,
              op,
              kind: "form",
              box: boxOf(form, [
                [bx0, by0],
                [bx1, by0],
                [bx0, by1],
                [bx1, by1],
              ]),
            });
          } else
            objects.push({
              streamIndex,
              op,
              kind: "image",
              box: boxOf(state.ctm, [
                [0, 0],
                [1, 0],
                [0, 1],
                [1, 1],
              ]),
            });
          break;
        }
        case "BI":
          objects.push({
            streamIndex,
            op,
            kind: "image",
            box: boxOf(state.ctm, [
              [0, 0],
              [1, 0],
              [0, 1],
              [1, 1],
            ]),
          });
          break;
        default:
          break;
      }
    }
  }
  return { streams, runs, objects };
}

// ---- geometry ----------------------------------------------------------------------------------

function inside(box: Box, rect: RegionRect): boolean {
  return (
    box.x0 >= rect.x - TOLERANCE &&
    box.y0 >= rect.y - TOLERANCE &&
    box.x1 <= rect.x + rect.width + TOLERANCE &&
    box.y1 <= rect.y + rect.height + TOLERANCE
  );
}
function touches(box: Box, rect: RegionRect): boolean {
  return (
    box.x0 < rect.x + rect.width - TOLERANCE &&
    rect.x + TOLERANCE < box.x1 &&
    box.y0 < rect.y + rect.height - TOLERANCE &&
    rect.y + TOLERANCE < box.y1
  );
}

function pageGeometry(page: PDFPage) {
  const media = page.getMediaBox();
  const crop = page.node.get(PDFName.of("CropBox"));
  const cropBox = crop ? page.getCropBox() : null;
  return {
    width: media.width,
    height: media.height,
    rotation: ((page.getRotation().angle % 360) + 360) % 360,
    cropBox: cropBox
      ? ([
          cropBox.x,
          cropBox.y,
          cropBox.x + cropBox.width,
          cropBox.y + cropBox.height,
        ] as const)
      : null,
  };
}

function annotationBoxes(pdf: PDFDocument, page: PDFPage): Box[] {
  const annots = lookup(pdf, page.node.get(PDFName.of("Annots")));
  if (!(annots instanceof PDFArray)) return [];
  return annots.asArray().flatMap((item) => {
    const annot = lookup(pdf, item);
    const rect =
      annot instanceof PDFDict ? lookup(pdf, annot.get(PDFName.of("Rect"))) : null;
    if (!(rect instanceof PDFArray)) return [];
    const [a, b, c, d] = rect.asArray().map((value) => numberAt(pdf, value) ?? 0);
    return [
      { x0: Math.min(a, c), y0: Math.min(b, d), x1: Math.max(a, c), y1: Math.max(b, d) },
    ];
  });
}

export interface StaticInspection {
  pages: Array<{
    pageIndex: number;
    width: number;
    height: number;
    rotation: number;
    cropBox: readonly [number, number, number, number] | null;
  }>;
  runs: Array<{
    pageIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
  }>;
  images: Array<{
    pageIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  truncated: boolean;
}

/** Page geometry and text positions of an approved static original, for reviewing a map. */
export async function inspectStaticPdf(original: Uint8Array): Promise<StaticInspection> {
  const { pdf, fields } = await parseSafePdf(original, true);
  if (fields.length) refuse("this file has form fields; review it as an AcroForm.");
  const scratch = { doc: null as PDFDocument | null };
  const result: StaticInspection = { pages: [], runs: [], images: [], truncated: false };
  for (const [pageIndex, page] of pdf.getPages().entries()) {
    result.pages.push({ pageIndex, ...pageGeometry(page) });
    const reading = await readPage(pdf, page, scratch);
    for (const run of reading.runs) {
      if (result.runs.length >= 5_000) {
        result.truncated = true;
        break;
      }
      result.runs.push({
        pageIndex,
        x: run.box.x0,
        y: run.box.y0,
        width: run.box.x1 - run.box.x0,
        height: run.box.y1 - run.box.y0,
        text: run.text,
      });
    }
    for (const object of reading.objects)
      result.images.push({
        pageIndex,
        x: object.box.x0,
        y: object.box.y0,
        width: object.box.x1 - object.box.x0,
        height: object.box.y1 - object.box.y0,
      });
  }
  return result;
}

interface PagePlan {
  page: PDFPage;
  pageIndex: number;
  reading: PageReading;
  removed: TextRun[];
}

/** Every rule the original's content must meet for this geometry; an empty list is a usable map. */
async function planPages(
  pdf: PDFDocument,
  geometry: StaticPdfGeometry,
): Promise<{ plans: PagePlan[]; issues: string[] }> {
  const issues: string[] = [];
  const pages = pdf.getPages();
  const scratch = { doc: null as PDFDocument | null };
  for (const described of geometry.pages) {
    const page = pages[described.pageIndex];
    if (!page) {
      issues.push(`Page ${described.pageIndex + 1} does not exist in the original.`);
      continue;
    }
    const actual = pageGeometry(page);
    const crop = described.cropBox;
    if (
      Math.abs(actual.width - described.width) > 0.01 ||
      Math.abs(actual.height - described.height) > 0.01 ||
      actual.rotation !== described.rotation ||
      (crop === null) !== (actual.cropBox === null) ||
      (crop !== null &&
        actual.cropBox !== null &&
        crop.some((value, index) => Math.abs(value - actual.cropBox![index]) > 0.01))
    )
      issues.push(
        `Page ${described.pageIndex + 1}'s size, crop or rotation differs from the reviewed geometry.`,
      );
  }
  const plans: PagePlan[] = [];
  const pageIndexes = [...new Set(geometry.regions.map((region) => region.pageIndex))];
  for (const pageIndex of pageIndexes) {
    const page = pages[pageIndex];
    if (!page) continue;
    const reading = await readPage(pdf, page, scratch);
    const removed = new Set<TextRun>();
    const annotations = annotationBoxes(pdf, page);
    for (const region of geometry.regions.filter(
      (entry) => entry.pageIndex === pageIndex,
    )) {
      for (const run of reading.runs) {
        if (!touches(run.box, region.rect)) continue;
        if (region.existing === "blank")
          issues.push(`${region.regionId} is not blank: existing text is inside it.`);
        else if (!inside(run.box, region.rect))
          issues.push(`${region.regionId}: existing text crosses the region's edge.`);
        else removed.add(run);
      }
      for (const object of reading.objects)
        if (
          touches(object.box, region.rect) &&
          (region.existing === "replace" || object.kind === "form")
        )
          issues.push(
            `${region.regionId}: ${object.kind === "form" ? "nested page content" : "an image"} overlaps the region and cannot be replaced exactly. Use an approved clean master.`,
          );
      for (const box of annotations)
        if (touches(box, region.rect) && region.existing === "replace")
          issues.push(`${region.regionId}: an annotation covers the region.`);
    }
    plans.push({ page, pageIndex, reading, removed: [...removed] });
  }
  return { plans, issues: [...new Set(issues)] };
}

/** Check a reviewed static map against its exact original before it can be recorded. */
export async function validateStaticGeometry(
  original: Uint8Array,
  geometry: StaticPdfGeometry,
): Promise<string[]> {
  const { pdf, fields } = await parseSafePdf(original, true);
  if (fields.length) return ["This file has form fields; review it as an AcroForm."];
  return (await planPages(pdf, geometry)).issues;
}

// ---- composition --------------------------------------------------------------------------------

export interface StaticRegionValue {
  regionId: string;
  /** The formatted text to show; an empty string leaves the region blank. */
  text: string;
}

function neutralReplacement(run: TextRun): string {
  const unit = run.fontSize * run.horizontalScale;
  const adjust = unit === 0 ? 0 : (-run.advance * 1000) / unit;
  const advance = `[${adjust.toFixed(4)}] TJ`;
  if (run.op.operator === "'") return ` T* ${advance} `;
  if (run.op.operator === '"')
    return ` ${run.spacing!.word} Tw ${run.spacing!.character} Tc T* ${advance} `;
  return ` ${advance} `;
}

function edited(bytes: Uint8Array, runs: readonly TextRun[]): Uint8Array {
  const sorted = [...runs].sort((a, b) => a.op.start - b.op.start);
  const parts: Buffer[] = [];
  let at = 0;
  for (const run of sorted) {
    parts.push(Buffer.from(bytes.subarray(at, run.op.start)));
    parts.push(Buffer.from(neutralReplacement(run), "latin1"));
    at = run.op.end;
  }
  parts.push(Buffer.from(bytes.subarray(at)));
  return new Uint8Array(Buffer.concat(parts));
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex").toUpperCase();
}

const FILL_TAG = "PMIFill";

/** The drawn values of a static output, read back from its tagged fill content. */
export function readStaticFillValues(content: ContentOp[]): Map<number, string> {
  const values = new Map<number, string>();
  let region: number | null = null;
  for (const op of content) {
    if (op.operator === "BDC" && op.operands[0]?.name === FILL_TAG) {
      const r = op.operands[1]?.entries?.get("R")?.number;
      region = typeof r === "number" ? r : null;
    } else if (op.operator === "EMC") region = null;
    else if (op.operator === "Tj" && region !== null) {
      const bytes = op.operands.find((operand) => operand.kind === "string")?.bytes;
      if (bytes)
        values.set(
          region,
          (values.get(region) ?? "") + Buffer.from(bytes).toString("latin1"),
        );
    }
  }
  return values;
}

export interface StaticFillResult {
  content: Uint8Array;
  adapter: typeof STATIC_ADAPTER;
  originalHash: string;
  outputHash: string;
  comparison: {
    allFields: Record<string, string>;
    changedFieldNames: string[];
    removedRuns: number;
    unchangedObjects: number;
    pages: number;
    fixedContentVerified: true;
    verified: true;
  };
}

/**
 * Fill reviewed regions of an approved static original. The result is the actual saved PDF with a
 * comparison made after reopening it; any rule it cannot prove refuses the whole output.
 */
export async function fillStaticPdf(
  original: Uint8Array,
  geometry: StaticPdfGeometry,
  values: readonly StaticRegionValue[],
): Promise<StaticFillResult> {
  const byRegion = new Map(values.map((value) => [value.regionId, value.text]));
  if (byRegion.size !== values.length) refuse("each region needs exactly one value.");
  for (const regionId of byRegion.keys())
    if (!geometry.regions.some((region) => region.regionId === regionId))
      refuse(`${regionId} is not a reviewed region.`);
  const { pdf, fields } = await parseSafePdf(original, true);
  if (fields.length) refuse("this file has form fields; it is filled as an AcroForm.");
  const { plans, issues } = await planPages(pdf, geometry);
  if (issues.length) refuse(issues.join(" "));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  // Every value is checked before anything is drawn: glyphs, width and height in its region.
  const drawn: Array<{
    index: number;
    region: StaticPdfGeometry["regions"][number];
    text: string;
    encoded: Uint8Array;
  }> = [];
  geometry.regions.forEach((region, index) => {
    const text = byRegion.get(region.regionId) ?? "";
    if (text === "") return;
    if (/[\u0000-\u001f\u007f]/.test(text))
      refuse(`${region.regionId}: line breaks and control characters are unsupported.`);
    let encoded: Uint8Array;
    try {
      encoded = font.encodeText(text).asBytes();
    } catch {
      return refuse(
        `${region.regionId}: the value has characters the approved font cannot show.`,
      );
    }
    if (font.widthOfTextAtSize(text, region.fontSize) > region.rect.width + 0.01)
      refuse(
        `${region.regionId}: the value would overflow its region. An approved form with room for it is required.`,
      );
    if (region.fontSize > region.rect.height)
      refuse(`${region.regionId}: the text is taller than its region.`);
    drawn.push({ index, region, text, encoded });
  });
  const touched = new Set<number>([
    ...plans.filter((plan) => plan.removed.length > 0).map((plan) => plan.pageIndex),
    ...drawn.map((entry) => entry.region.pageIndex),
  ]);
  const modifiedObjects = new Set<unknown>();
  const expectedMiddle = new Map<number, Uint8Array[]>();
  const pages = pdf.getPages();
  for (const pageIndex of touched) {
    const page = pages[pageIndex];
    const plan = plans.find((entry) => entry.pageIndex === pageIndex)!;
    modifiedObjects.add(page.node);
    const resources = inheritedResources(pdf, page);
    if (resources) {
      modifiedObjects.add(resources);
      modifiedObjects.add(lookup(pdf, resources.get(PDFName.of("Font"))));
    }
    const middle: PDFRef[] = [];
    const middleBytes: Uint8Array[] = [];
    for (const [streamIndex, stream] of plan.reading.streams.entries()) {
      const removed = plan.removed.filter((run) => run.streamIndex === streamIndex);
      if (removed.length === 0 && stream.ref) {
        middle.push(stream.ref);
        middleBytes.push(stream.bytes);
        continue;
      }
      const bytes = removed.length ? edited(stream.bytes, removed) : stream.bytes;
      middle.push(pdf.context.register(pdf.context.flateStream(bytes)));
      middleBytes.push(bytes);
    }
    // Resources are copied onto the page itself before a font is added, so a shared inherited
    // dictionary used by other pages is never changed.
    const pageResources = resources
      ? (resources.clone(pdf.context) as PDFDict)
      : pdf.context.obj({});
    const fonts = lookup(pdf, pageResources.get(PDFName.of("Font")));
    const pageFonts =
      fonts instanceof PDFDict
        ? (fonts.clone(pdf.context) as PDFDict)
        : pdf.context.obj({});
    let fontKey = FILL_TAG;
    for (let k = 1; pageFonts.has(PDFName.of(fontKey)); k++) fontKey = `${FILL_TAG}${k}`;
    pageFonts.set(PDFName.of(fontKey), font.ref);
    pageResources.set(PDFName.of("Font"), pageFonts);
    page.node.set(PDFName.of("Resources"), pageResources);
    const lines: string[] = ["q"];
    for (const entry of drawn.filter((item) => item.region.pageIndex === pageIndex)) {
      const { region, text } = entry;
      const width = font.widthOfTextAtSize(text, region.fontSize);
      const x =
        region.align === "left"
          ? region.rect.x
          : region.align === "center"
            ? region.rect.x + (region.rect.width - width) / 2
            : region.rect.x + region.rect.width - width;
      const y = region.rect.y + (region.rect.height - region.fontSize * 0.72) / 2;
      lines.push(
        `/${FILL_TAG} <</R ${entry.index}>> BDC BT /${fontKey} ${region.fontSize} Tf 0 g 1 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)} Tm <${hex(entry.encoded)}> Tj ET EMC`,
      );
    }
    lines.push("Q");
    const open = pdf.context.register(pdf.context.flateStream("q\n"));
    const close = pdf.context.register(pdf.context.flateStream("Q\n"));
    const fill = pdf.context.register(pdf.context.flateStream(`${lines.join("\n")}\n`));
    page.node.set(
      PDFName.of("Contents"),
      pdf.context.obj([open, ...middle, close, fill]),
    );
    expectedMiddle.set(pageIndex, middleBytes);
  }
  const unchanged = pdf.context
    .enumerateIndirectObjects()
    .filter(([, object]) => !modifiedObjects.has(object))
    .map(([reference, object]) => ({ reference, fingerprint: sha(object.toString()) }));
  const content = await pdf.save({ useObjectStreams: false });

  // Reopen the saved bytes and prove every rule on what was actually written.
  const reopened = await parseSafePdf(content, true);
  const output = reopened.pdf;
  if (output.getPageCount() !== pdf.getPageCount())
    refuse("the saved page count changed.");
  for (const item of unchanged) {
    const observed = output.context.lookup(item.reference);
    if (!observed || sha(observed.toString()) !== item.fingerprint)
      refuse("content outside the reviewed regions changed.");
  }
  const originalDoc = await PDFDocument.load(original, { updateMetadata: false });
  const allFields: Record<string, string> = {};
  for (const [pageIndex, page] of output.getPages().entries()) {
    const before = pageGeometry(originalDoc.getPage(pageIndex));
    const after = pageGeometry(page);
    if (JSON.stringify(before) !== JSON.stringify(after))
      refuse("a page's size, crop or rotation changed.");
    if (!touched.has(pageIndex)) continue;
    const refs = contentRefs(output, page);
    const middle = expectedMiddle.get(pageIndex)!;
    if (refs.length !== middle.length + 3)
      refuse("the saved page content is not the expected wrapping.");
    const bytes = refs.map(({ stream }) => streamBytes(stream));
    if (
      Buffer.from(bytes[0]).toString("latin1").trim() !== "q" ||
      Buffer.from(bytes[refs.length - 2])
        .toString("latin1")
        .trim() !== "Q"
    )
      refuse("the saved page content is not isolated from the fill.");
    middle.forEach((expected, index) => {
      if (sha(bytes[index + 1]) !== sha(expected)) refuse("fixed page content changed.");
    });
    const reading = await readPage(output, page, { doc: null });
    for (const region of geometry.regions.filter(
      (entry) => entry.pageIndex === pageIndex,
    )) {
      const leftover = reading.runs.filter(
        (run) => run.streamIndex < refs.length - 1 && touches(run.box, region.rect),
      );
      if (leftover.length) refuse(`${region.regionId}: earlier text is still present.`);
    }
    const values = readStaticFillValues(tokenizeContent(bytes[refs.length - 1]));
    for (const entry of drawn.filter((item) => item.region.pageIndex === pageIndex)) {
      if (values.get(entry.index) !== Buffer.from(entry.encoded).toString("latin1"))
        refuse(`${entry.region.regionId}: the saved value does not read back exactly.`);
    }
  }
  for (const region of geometry.regions)
    allFields[region.regionId] = byRegion.get(region.regionId) ?? "";
  return {
    content,
    adapter: STATIC_ADAPTER,
    originalHash: sha(original),
    outputHash: sha(content),
    comparison: {
      allFields,
      changedFieldNames: drawn.map((entry) => entry.region.regionId),
      removedRuns: plans.reduce((total, plan) => total + plan.removed.length, 0),
      unchangedObjects: unchanged.length,
      pages: output.getPageCount(),
      fixedContentVerified: true,
      verified: true,
    },
  };
}

/** Read the drawn region values of a saved static output, keyed by region id. */
export async function readStaticPdfValues(
  content: Uint8Array,
  geometry: StaticPdfGeometry,
): Promise<Record<string, string>> {
  const { pdf } = await parseSafePdf(content, true);
  const values: Record<string, string> = {};
  for (const region of geometry.regions) values[region.regionId] = "";
  for (const page of pdf.getPages()) {
    const refs = contentRefs(pdf, page);
    if (refs.length === 0) continue;
    const last = tokenizeContent(streamBytes(refs[refs.length - 1].stream));
    for (const [index, raw] of readStaticFillValues(last)) {
      const region = geometry.regions[index];
      if (region) values[region.regionId] = decodeWinAnsi(raw);
    }
  }
  return values;
}

/** Read the drawn values of a saved static output by the region order its record carries. */
export async function readStaticPdfValuesByOrder(
  content: Uint8Array,
  regionOrder: readonly string[],
): Promise<Record<string, string>> {
  const { pdf } = await parseSafePdf(content, true);
  const values: Record<string, string> = Object.fromEntries(
    regionOrder.map((regionId) => [regionId, ""]),
  );
  for (const page of pdf.getPages()) {
    const refs = contentRefs(pdf, page);
    if (refs.length === 0) continue;
    const last = tokenizeContent(streamBytes(refs[refs.length - 1].stream));
    for (const [index, raw] of readStaticFillValues(last)) {
      const regionId = regionOrder[index];
      if (regionId !== undefined) values[regionId] = decodeWinAnsi(raw);
    }
  }
  return values;
}

const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Show a verified value in a region's reviewed format; a value of the wrong kind is refused. */
export function formatStaticValue(
  format: StaticValueFormat,
  value: string | number | boolean,
  displayValue: string | null,
): string {
  if (format === "checkmark") {
    if (typeof value !== "boolean") refuse("a checkmark needs a recorded yes or no.");
    return value ? "X" : "";
  }
  if (format === "money" || format === "money_cents") {
    const raw = typeof value === "boolean" ? "" : String(value).replace(/[$,\s]/g, "");
    const amount = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN;
    if (
      !Number.isFinite(amount) ||
      (format === "money_cents" && !Number.isInteger(amount))
    )
      refuse("a money region needs a recorded amount in its reviewed unit.");
    const dollars = format === "money_cents" ? amount / 100 : amount;
    return `${dollars < 0 ? "-" : ""}$${Math.abs(dollars).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (format === "date_long" || format === "date_numeric") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    if (!match) refuse("a date region needs a recorded calendar date.");
    const [, year, month, day] = match;
    return format === "date_long"
      ? `${LONG_MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`
      : `${month}/${day}/${year}`;
  }
  return displayValue ?? String(value);
}

const WIN_ANSI_HIGH: Readonly<Record<number, string>> = {
  0x80: "€",
  0x82: "‚",
  0x83: "ƒ",
  0x84: "„",
  0x85: "…",
  0x86: "†",
  0x87: "‡",
  0x88: "ˆ",
  0x89: "‰",
  0x8a: "Š",
  0x8b: "‹",
  0x8c: "Œ",
  0x8e: "Ž",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
  0x98: "˜",
  0x99: "™",
  0x9a: "š",
  0x9b: "›",
  0x9c: "œ",
  0x9e: "ž",
  0x9f: "Ÿ",
};

function decodeWinAnsi(raw: string): string {
  return [...raw]
    .map((character) => {
      const code = character.charCodeAt(0);
      return WIN_ANSI_HIGH[code] ?? character;
    })
    .join("");
}
