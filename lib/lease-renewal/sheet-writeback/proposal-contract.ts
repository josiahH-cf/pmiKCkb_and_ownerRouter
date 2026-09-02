// S98 typed operating-Sheet writeback proposals (ARCH-S98-1). Two exact capabilities only: one
// atomic row append with the mode-correct system note, and one exact-cell expected-value update.
// Caller-supplied methods, ranges, row indexes, header positions, spreadsheet ids, arbitrary
// fields, and proof mode are structurally unreachable; only the secure proof packet path may set
// proof mode.

import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { RENEWAL_TAB_SCHEMAS, type ColumnSchemaField } from "@/lib/lease-renewal/headers";

export const SHEET_WRITEBACK_PROPOSAL_VERSION = "operating-sheet-writeback/v1";

export const SHEET_ROW_APPEND_KEY = "google_sheets.renewal_checklist.row_append";
export const SHEET_FIELD_UPDATE_KEY = "google_sheets.renewal_checklist.field_update";
export const SHEET_WRITEBACK_KEYS = [
  SHEET_ROW_APPEND_KEY,
  SHEET_FIELD_UPDATE_KEY,
] as const;
export type SheetWritebackActionKey = (typeof SHEET_WRITEBACK_KEYS)[number];

/** Retired non-executable compatibility identifier (the pre-S98 broad Sheet writeback). */
export const RETIRED_BROAD_SHEET_WRITEBACK_KEY =
  "google_sheets.renewal_checklist.writeback";

export const SHEET_WRITEBACK_CONFIRMATION_TTL_MS = 10 * 60 * 1_000;

/** The recognized supported-field allowlist is exactly the current Renewals semantic schema. */
export const SHEET_SUPPORTED_FIELDS: readonly string[] = (
  RENEWAL_TAB_SCHEMAS.Renewals as readonly ColumnSchemaField[]
).map((field) => field.key);

const OPAQUE_ID_RE = /^[a-z0-9][a-z0-9-]{7,63}$/;
const POSITIVE_INTEGER_ID_RE = /^[1-9]\d*$/;

export class SheetWritebackContractError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SheetWritebackContractError";
  }
}

function fail(code: string, message: string): never {
  throw new SheetWritebackContractError(code, message);
}

/** Exact system-note formats. The note is the durable machine identity of an app-appended row. */
export function normalRowNote(input: {
  operationId: string;
  leaseId: string;
  propertyId: string;
}): string {
  return `PMI KC writeback — operation ${input.operationId} — lease ${input.leaseId} — property ${input.propertyId}`;
}

export const PROOF_NOTE_PREFIX = "TEST — PMI KC writeback proof — ";

export function proofRowNote(input: {
  operationId: string;
  leaseId: string;
  propertyId: string;
}): string {
  return `${PROOF_NOTE_PREFIX}operation ${input.operationId} — lease ${input.leaseId} — property ${input.propertyId}`;
}

/** Parse an app-written note back into its identity; null for any other note. */
export function parseRowNote(note: string): {
  proof: boolean;
  operationId: string;
  leaseId: string;
  propertyId: string;
} | null {
  const match =
    /^(TEST — PMI KC writeback proof — |PMI KC writeback — )operation ([a-z0-9-]+) — lease (\d+) — property (\d+)$/.exec(
      note,
    );
  if (!match) return null;
  return {
    proof: match[1].startsWith("TEST"),
    operationId: match[2],
    leaseId: match[3],
    propertyId: match[4],
  };
}

export interface SheetRowAppendEffectInput {
  readonly kind: "row_append";
  /** Server-owned: only the secure proof packet path may produce "proof". */
  readonly mode: "normal" | "proof";
  /** Server-generated opaque operation id; the stable Sheet row key inside the note. */
  readonly operationId: string;
  /** Server-resolved provider ids; never caller-supplied free text. */
  readonly leaseId: string;
  readonly propertyId: string;
  /** Nonblank, source-backed tenant label. */
  readonly tenantName: string;
  /** Optional supported-field values beyond tenant_name; each names its exact source. */
  readonly fields: Readonly<Record<string, { value: string; source: string }>>;
  /** renewal_date is populated only with an explicit human-confirmed value/source mapping. */
  readonly renewalDateHumanConfirmed?: boolean;
}

export interface SheetFieldUpdateEffectInput {
  readonly kind: "field_update";
  readonly field: string;
  /** 1-based sheet row number of the anchored row at snapshot time. */
  readonly rowNumber: number;
  /** The row's stable note key when it is an app-appended row; null for an ordinary row. */
  readonly rowKey: string | null;
  /** Anchor evidence: the tenant_name cell text observed at snapshot time. */
  readonly anchorTenantName: string;
  /** Exact current cell value (empty string for blank) the CAS requires. */
  readonly expectedValue: string;
  readonly afterValue: string;
  readonly source: string;
}

export type SheetWritebackEffectInput =
  | SheetRowAppendEffectInput
  | SheetFieldUpdateEffectInput;

export interface ValidatedSheetWritebackEffect {
  readonly index: number;
  readonly actionKey: SheetWritebackActionKey;
  readonly effect: SheetWritebackEffectInput;
  readonly reversal:
    | { readonly kind: "delete_appended_row"; readonly operationId: string }
    | {
        readonly kind: "restore_field";
        readonly field: string;
        readonly rowNumber: number;
        readonly rowKey: string | null;
        readonly restoreValue: string;
      };
  readonly effectHash: string;
}

export interface SheetWritebackProposalInput {
  readonly spreadsheetId: string;
  readonly tabTitle: string;
  /** Hash of the freshly resolved header (positions + semantic keys) the effects bind to. */
  readonly headerHash: string;
  readonly headerWidth: number;
  readonly tenantColumnIndex: number;
  readonly actorUid: string;
  readonly actorEmail: string;
  readonly actorRole: string;
  readonly sourceReadAtIso: string;
  readonly evidenceRef: string;
  readonly effects: readonly SheetWritebackEffectInput[];
  readonly nowMs: number;
}

export interface SheetWritebackProposal {
  readonly version: typeof SHEET_WRITEBACK_PROPOSAL_VERSION;
  readonly spreadsheetId: string;
  readonly tabTitle: string;
  readonly headerHash: string;
  readonly headerWidth: number;
  readonly tenantColumnIndex: number;
  readonly actorUid: string;
  readonly actorEmail: string;
  readonly actorRole: string;
  readonly sourceReadAtIso: string;
  readonly evidenceRef: string;
  readonly effects: readonly ValidatedSheetWritebackEffect[];
  readonly previewHash: string;
  readonly createdAtIso: string;
  readonly confirmationExpiresAtIso: string;
}

function validateRowAppend(input: SheetRowAppendEffectInput): void {
  if (input.mode !== "normal" && input.mode !== "proof") {
    fail("mode_invalid", "The append mode is server-owned.");
  }
  if (!OPAQUE_ID_RE.test(input.operationId)) {
    fail("operation_id_invalid", "The append requires a server-generated operation id.");
  }
  if (
    !POSITIVE_INTEGER_ID_RE.test(input.leaseId) ||
    !POSITIVE_INTEGER_ID_RE.test(input.propertyId)
  ) {
    fail("identity_invalid", "The append requires server-resolved provider ids.");
  }
  if (!input.tenantName.trim()) {
    fail(
      "tenant_name_required",
      "The append requires a nonblank source-backed tenant name.",
    );
  }
  for (const [field, entry] of Object.entries(input.fields)) {
    if (!SHEET_SUPPORTED_FIELDS.includes(field)) {
      fail("field_unsupported", `Field ${field} is outside the supported allowlist.`);
    }
    if (field === "tenant_name") {
      fail("field_unsupported", "tenant_name is carried by the append itself.");
    }
    if (!entry.value.trim() || !entry.source.trim()) {
      fail(
        "field_source_required",
        `Field ${field} requires a value and its exact source.`,
      );
    }
    if (field === "renewal_date" && input.renewalDateHumanConfirmed !== true) {
      fail(
        "renewal_date_unconfirmed",
        "renewal_date is never inferred; it requires an explicit human-confirmed value/source mapping.",
      );
    }
  }
  if (input.mode === "proof") {
    // The sealed proof appends only the fresh real tenant label; every other field stays blank.
    if (Object.keys(input.fields).length > 0) {
      fail("proof_fields_blank", "The proof row leaves every unconfirmed field blank.");
    }
  }
}

function validateFieldUpdate(input: SheetFieldUpdateEffectInput): void {
  if (!SHEET_SUPPORTED_FIELDS.includes(input.field)) {
    fail("field_unsupported", `Field ${input.field} is outside the supported allowlist.`);
  }
  if (!Number.isInteger(input.rowNumber) || input.rowNumber < 2) {
    fail(
      "row_anchor_invalid",
      "The update requires an anchored data row below the header.",
    );
  }
  if (input.rowKey !== null && !OPAQUE_ID_RE.test(input.rowKey)) {
    fail(
      "row_key_invalid",
      "A stable row key must be the app-written opaque operation id.",
    );
  }
  if (!input.anchorTenantName.trim() && input.rowKey === null) {
    fail(
      "row_anchor_invalid",
      "An ordinary row anchor requires the observed tenant_name cell text.",
    );
  }
  if (input.expectedValue === input.afterValue) {
    fail("no_change", "The update requires a changed value.");
  }
  if (!input.afterValue.trim() && input.expectedValue.trim() === "") {
    fail("no_change", "Blank-to-blank is not an update.");
  }
  if (!input.source.trim()) {
    fail("field_source_required", "The update names the exact source of the new value.");
  }
}

export function buildSheetWritebackProposal(
  input: SheetWritebackProposalInput,
): SheetWritebackProposal {
  if (!input.spreadsheetId.trim() || !input.tabTitle.trim()) {
    fail("target_invalid", "The proposal binds one exact spreadsheet and tab.");
  }
  if (!/^[a-f0-9]{64}$/.test(input.headerHash)) {
    fail("header_hash_invalid", "The proposal binds the freshly resolved header hash.");
  }
  if (!Number.isInteger(input.headerWidth) || input.headerWidth < 1) {
    fail("header_hash_invalid", "The proposal binds the resolved header width.");
  }
  if (
    !Number.isInteger(input.tenantColumnIndex) ||
    input.tenantColumnIndex < 0 ||
    input.tenantColumnIndex >= input.headerWidth
  ) {
    fail("header_hash_invalid", "The proposal binds the resolved tenant_name column.");
  }
  if (!input.actorUid || !input.actorEmail.endsWith("@pmikcmetro.com")) {
    fail("actor_invalid", "The proposal actor must be a managed pmikcmetro.com user.");
  }
  if (input.effects.length === 0) {
    fail("no_change", "A proposal requires at least one effect.");
  }
  for (const effect of input.effects) {
    if (effect.kind === "row_append") validateRowAppend(effect);
    else if (effect.kind === "field_update") validateFieldUpdate(effect);
    else fail("unsupported_effect", "Unknown Sheet writeback effect kind.");
  }

  const createdAtIso = new Date(input.nowMs).toISOString();
  const effects: ValidatedSheetWritebackEffect[] = input.effects.map((effect, index) => ({
    index,
    actionKey:
      effect.kind === "row_append" ? SHEET_ROW_APPEND_KEY : SHEET_FIELD_UPDATE_KEY,
    effect,
    reversal:
      effect.kind === "row_append"
        ? { kind: "delete_appended_row", operationId: effect.operationId }
        : {
            kind: "restore_field",
            field: effect.field,
            rowNumber: effect.rowNumber,
            rowKey: effect.rowKey,
            restoreValue: effect.expectedValue,
          },
    effectHash: hashExecutionPreview({
      version: SHEET_WRITEBACK_PROPOSAL_VERSION,
      spreadsheetId: input.spreadsheetId,
      tabTitle: input.tabTitle,
      headerHash: input.headerHash,
      actionKey:
        effect.kind === "row_append" ? SHEET_ROW_APPEND_KEY : SHEET_FIELD_UPDATE_KEY,
      effect,
    }),
  }));

  const previewHash = hashExecutionPreview({
    version: SHEET_WRITEBACK_PROPOSAL_VERSION,
    spreadsheetId: input.spreadsheetId,
    tabTitle: input.tabTitle,
    headerHash: input.headerHash,
    actorUid: input.actorUid,
    sourceReadAtIso: input.sourceReadAtIso,
    evidenceRef: input.evidenceRef,
    effects: effects.map((entry) => ({
      actionKey: entry.actionKey,
      effect: entry.effect,
      effectHash: entry.effectHash,
    })),
  });

  return {
    version: SHEET_WRITEBACK_PROPOSAL_VERSION,
    spreadsheetId: input.spreadsheetId,
    tabTitle: input.tabTitle,
    headerHash: input.headerHash,
    headerWidth: input.headerWidth,
    tenantColumnIndex: input.tenantColumnIndex,
    actorUid: input.actorUid,
    actorEmail: input.actorEmail,
    actorRole: input.actorRole,
    sourceReadAtIso: input.sourceReadAtIso,
    evidenceRef: input.evidenceRef,
    effects,
    previewHash,
    createdAtIso,
    confirmationExpiresAtIso: new Date(
      input.nowMs + SHEET_WRITEBACK_CONFIRMATION_TTL_MS,
    ).toISOString(),
  };
}

export interface SheetWritebackConfirmation {
  readonly previewHash: string;
  readonly effectHash: string;
  readonly confirmedAtIso: string;
}

export function assertSheetWritebackConfirmation(input: {
  readonly proposal: SheetWritebackProposal;
  readonly effect: ValidatedSheetWritebackEffect;
  readonly confirmation: SheetWritebackConfirmation;
  readonly nowMs: number;
}): void {
  const { proposal, effect, confirmation, nowMs } = input;
  if (confirmation.previewHash !== proposal.previewHash) {
    fail("confirmation_mismatch", "The confirmation does not match this exact proposal.");
  }
  if (confirmation.effectHash !== effect.effectHash) {
    fail("confirmation_mismatch", "The confirmation does not match this exact effect.");
  }
  const confirmedAtMs = Date.parse(confirmation.confirmedAtIso);
  if (!Number.isFinite(confirmedAtMs) || confirmedAtMs > nowMs) {
    fail("confirmation_invalid", "The confirmation timestamp is invalid.");
  }
  if (nowMs > Date.parse(proposal.confirmationExpiresAtIso)) {
    fail("confirmation_expired", "The proposal confirmation window has expired.");
  }
}

/** One opaque durable attempt identity per exact effect. */
export function sheetWritebackExecutionId(
  proposal: SheetWritebackProposal,
  effect: ValidatedSheetWritebackEffect,
): string {
  return `s98:${proposal.spreadsheetId.slice(0, 12)}:${effect.effectHash}`;
}

/** The reversal attempt identity is separate from its forward identity. */
export function sheetWritebackReversalExecutionId(
  forwardExecutionId: string,
  forwardReceiptHash: string,
): string {
  return `${forwardExecutionId}:reversal:${forwardReceiptHash.slice(0, 16)}`;
}
