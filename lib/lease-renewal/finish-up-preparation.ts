// S249 R-S249-14 second half / BEH-S249-6 / L42: once the working renewal terms are final, Finish
// up shows the RentVine and operating Sheet updates those terms call for, as the exact previews
// the existing confirmation shows (S117 `rentvinePreviewFacts` and `sheetPreviewFacts`), built
// from the reads the lease page already made (the RentVine charge inventory and the fresh Sheet
// row). Assembly and reads only: nothing here saves a proposal, claims an attempt or writes a
// source. Applying each update stays its own step through the existing controls in Rent and
// charges (S97/S98/S113/S156): its exact preview, its one confirmation, its one-attempt claim and
// its receipt read back.
//
// The RentVine updates mirror what those controls prepare from the same terms: the lease end date
// (the S97 dates effect) and the future rent schedule (`planRentChargeRequests`, the S156 future
// intent). The Sheet update is the renewal date (the S98 field effect, `effectForSheetFieldIntent`).
// The Sheet current rent changes when the new rent starts, so it is named and not assembled here.

import { formatCalendarDate } from "@/lib/date-display";
import type { EffectiveRenewalTerms } from "@/lib/lease-renewal/effective-terms";
import { planRentChargeRequests } from "@/lib/lease-renewal/rent-charge-intent";
import { KICKOFF_FIX_TARGETS } from "@/lib/lease-renewal/renewal-preparation";
import { SheetWorkspaceResolutionError } from "@/lib/lease-renewal/sheet-writeback/resolution-error";
import {
  effectForSheetFieldIntent,
  type FreshOperatingSheetLeaseContext,
} from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";
import { OPERATING_SHEET_TAB } from "@/lib/lease-renewal/sheet-writeback/live";
import {
  rentvinePreviewFacts,
  sheetPreviewFacts,
  type SourceUpdateIdentity,
  type SourceUpdatePreviewFacts,
} from "@/lib/lease-renewal/source-update-preview";
import type { SheetWritebackClientProposal } from "@/lib/lease-renewal/sheet-writeback/client-projection";
import {
  chargeDateIso,
  type RenewalChargeInventory,
} from "@/lib/lease-renewal/writeback/charge-inventory-model";
import type {
  RentvineWritebackClientEffect,
  RentvineWritebackClientProposal,
} from "@/lib/lease-renewal/writeback/client-projection";
import { RENEWAL_WRITEBACK_ACCOUNT } from "@/lib/lease-renewal/writeback/proposal-contract";
import type { CompleteRenewalTerms } from "@/lib/lease-renewal/working-record";
import type { TenantAcceptanceRead } from "@/lib/lease-renewal/tenant-acceptance-hold";

/** The source the assembled previews name: the working renewal terms. */
export const FINISH_UP_TERMS_SOURCE = "Working renewal terms";

export interface FinishUpUpdatePreview {
  /** Stable key: "rentvine-dates", "rentvine-rent" or "sheet-renewal_date". */
  readonly key: string;
  readonly title: string;
  readonly facts: SourceUpdatePreviewFacts;
}

export type FinishUpSourceSection =
  | {
      readonly state: "ready";
      readonly previews: readonly FinishUpUpdatePreview[];
      /** What else stays as it is, in words; empty when nothing. */
      readonly notes: readonly string[];
    }
  /** The read this needs is not available on this render; nothing is assumed. */
  | { readonly state: "unavailable"; readonly line: string }
  /** The source already holds what the terms say: no update is called for. */
  | {
      readonly state: "current";
      readonly line: string;
      readonly notes: readonly string[];
    };

export interface FinishUpPreparation {
  /** The complete working terms the previews were assembled from; null until they are final. */
  readonly terms: CompleteRenewalTerms | null;
  /** What the terms still need, in words, while they are not final. */
  readonly termsMissing: readonly string[];
  readonly rentvine: FinishUpSourceSection | null;
  readonly sheet: FinishUpSourceSection | null;
  /** The existing control that prepares, confirms and reads back each update. */
  readonly applyTarget: string;
  /**
   * S264 R-S264-6: the page's read of the tenant acceptance against the current offer. Every
   * update here carries the accepted renewal, so each waits while that acceptance answers an
   * earlier offer. Shown only; the claims check the same hold.
   */
  readonly acceptance?: TenantAcceptanceRead | null;
}

export interface FinishUpPreparationInput {
  readonly leaseId: string;
  readonly terms: EffectiveRenewalTerms;
  /** The page's RentVine charge inventory; null when that read failed. */
  readonly inventory: RenewalChargeInventory | null;
  /** The page's fresh operating Sheet read; null when that read failed. */
  readonly sheet: FreshOperatingSheetLeaseContext | null;
  readonly identity: SourceUpdateIdentity | null;
  /** When the page read RentVine. */
  readonly readAtIso: string;
  /** S264 R-S264-6: the page's read of the tenant acceptance against the current offer. */
  readonly acceptance?: TenantAcceptanceRead | null;
}

/** A client proposal shell: the preview builders read only its identity and read time. */
function rentvineShell(
  leaseId: string,
  readAtIso: string,
  businessIntent?: "future_rent",
): RentvineWritebackClientProposal {
  return {
    ...(businessIntent ? { business_intent: businessIntent } : {}),
    lease_id: leaseId,
    account: RENEWAL_WRITEBACK_ACCOUNT,
    actor_uid: "",
    actor_email: "",
    lease_state: {},
    source_read_at: readAtIso,
    evidence_ref: FINISH_UP_TERMS_SOURCE,
    preview_hash: "",
    created_at: readAtIso,
    confirmation_expires_at: readAtIso,
    effects: [],
  };
}

function clientEffect(
  index: number,
  kind: RentvineWritebackClientEffect["kind"],
  effect: Record<string, unknown>,
): RentvineWritebackClientEffect {
  return {
    index,
    action_key: "",
    kind,
    effect_hash: "",
    effect,
    reversal_kind: "none",
  };
}

function rentvineSection(
  input: FinishUpPreparationInput,
  terms: CompleteRenewalTerms,
): FinishUpSourceSection {
  const inventory = input.inventory;
  if (!inventory)
    return {
      state: "unavailable",
      line: "RentVine's lease dates and charges were not read just now, so its update previews are assembled on the next read",
    };
  const previews: FinishUpUpdatePreview[] = [];
  const notes: string[] = [];
  // The lease end date (the S97 dates effect), when RentVine does not hold the new end yet.
  if (inventory.leaseDates.endDate !== terms.endDate) {
    const effect = clientEffect(0, "renewal_dates_update", {
      kind: "renewal_dates_update",
      before: inventory.leaseDates,
      after: { endDate: terms.endDate },
    });
    previews.push({
      key: "rentvine-dates",
      title: "RentVine lease end date",
      facts: rentvinePreviewFacts(effect, {
        proposal: rentvineShell(input.leaseId, input.readAtIso),
        inventory,
        identity: input.identity,
      }),
    });
  }
  // The future rent schedule (the S156 future intent), from the one current rent charge.
  const current = inventory.charges.filter(
    (charge) => charge.classification === "rent" && charge.current === true,
  );
  if (current.length !== 1)
    notes.push(
      current.length === 0
        ? "RentVine lists no current rent charge, so the renewal rent is prepared by choosing its charge in Rent and charges"
        : `RentVine lists ${current.length} current rent charges, so the renewal rent is prepared by choosing its charge in Rent and charges`,
    );
  else {
    const base = current[0]!;
    const future = inventory.charges.find(
      (charge) =>
        charge.classification === "rent" &&
        charge.projection.recurringStatusID === 2 &&
        chargeDateIso(charge.projection.startDate) === terms.effectiveDate,
    );
    const futureAmount = future ? Number(future.projection.amount) : null;
    const baseAmount = Number(base.projection.amount);
    const alreadyBilled = future
      ? futureAmount !== null && Math.abs(futureAmount - terms.rent) < 0.005
      : Math.abs(baseAmount - terms.rent) < 0.005 &&
        chargeDateIso(base.projection.endDate) === null;
    if (alreadyBilled)
      notes.push(
        `RentVine already bills ${terms.rent.toLocaleString("en-US", { style: "currency", currency: "USD" })} from ${formatCalendarDate(terms.effectiveDate)}, so the rent needs no update`,
      );
    else {
      const [plan] = planRentChargeRequests(
        {
          scope: "future",
          operation: future ? "update_future" : "create_future",
          chargeId: (future ?? base).id,
          terms,
        },
        {
          leaseId: input.leaseId,
          workspaceContext: null,
          sheetRowAvailable: false,
          priorHashes: { sheet: null, rentvine: null },
          inventory,
        },
      );
      const planned =
        plan && "body" in plan
          ? ((plan.body.effects as Record<string, unknown>[] | undefined)?.[0] ?? null)
          : null;
      if (!planned)
        notes.push(
          plan && "refusal" in plan
            ? plan.refusal
            : "The renewal rent is prepared by choosing its charge in Rent and charges",
        );
      else {
        const effect =
          planned.kind === "recurring_charge_update"
            ? clientEffect(previews.length, "recurring_charge_update", {
                ...planned,
                before: (future ?? base).projection,
              })
            : clientEffect(previews.length, "recurring_charge_create", planned);
        previews.push({
          key: "rentvine-rent",
          title: "RentVine renewal rent",
          facts: rentvinePreviewFacts(effect, {
            proposal: rentvineShell(input.leaseId, input.readAtIso, "future_rent"),
            inventory,
            identity: input.identity,
          }),
        });
      }
    }
  }
  if (previews.length === 0)
    return {
      state: "current",
      line: "RentVine already holds the renewal terms",
      notes,
    };
  return { state: "ready", previews, notes };
}

function sheetSection(
  input: FinishUpPreparationInput,
  terms: CompleteRenewalTerms,
): FinishUpSourceSection {
  const sheet = input.sheet;
  if (!sheet)
    return {
      state: "unavailable",
      line: "The operating Sheet was not read just now, so its update preview is assembled on the next read",
    };
  const notes = [
    `The Sheet current rent changes when the renewal rent starts on ${formatCalendarDate(terms.effectiveDate)}; its update is prepared then`,
  ];
  try {
    // The S98 field effect the existing Sheet update control prepares from this intent.
    const effect = effectForSheetFieldIntent(sheet, {
      field: "renewal_date",
      value: terms.endDate,
      source: FINISH_UP_TERMS_SOURCE,
    });
    const proposal: SheetWritebackClientProposal = {
      spreadsheet_id: "",
      tab_title: OPERATING_SHEET_TAB,
      actor_email: "",
      source_read_at: sheet.sourceReadAtIso,
      evidence_ref: FINISH_UP_TERMS_SOURCE,
      preview_hash: "",
      created_at: sheet.sourceReadAtIso,
      confirmation_expires_at: sheet.sourceReadAtIso,
      effects: [],
    };
    return {
      state: "ready",
      previews: [
        {
          key: "sheet-renewal_date",
          title: "Operating Sheet renewal date",
          facts: sheetPreviewFacts(
            {
              index: 0,
              action_key: "",
              kind: "field_update",
              effect_hash: "",
              effect: effect as unknown as Record<string, unknown>,
              reversal_kind: "restore_field",
            },
            {
              proposal,
              identity: input.identity,
              leaseId: input.leaseId,
              location: { cell: sheet.fieldCells?.renewal_date ?? null },
            },
          ),
        },
      ],
      notes,
    };
  } catch (error) {
    if (error instanceof SheetWorkspaceResolutionError) {
      if (error.code === "no_change")
        return {
          state: "current",
          line: "The operating Sheet already holds the renewal date",
          notes,
        };
      return { state: "unavailable", line: error.plainMessage.replace(/[.\s]+$/, "") };
    }
    return {
      state: "unavailable",
      line: "The operating Sheet update could not be assembled from this read",
    };
  }
}

/**
 * Assemble Finish up's source update previews from the final working terms and the page's own
 * reads. Pure over its input: no read, no write, no claim.
 */
export function assembleFinishUpPreparation(
  input: FinishUpPreparationInput,
): FinishUpPreparation {
  const terms = input.terms.complete;
  const acceptance = input.acceptance ?? null;
  if (!terms)
    return {
      terms: null,
      termsMissing: input.terms.missing,
      rentvine: null,
      sheet: null,
      applyTarget: KICKOFF_FIX_TARGETS.rentAndCharges,
      acceptance,
    };
  return {
    terms,
    termsMissing: [],
    rentvine: rentvineSection(input, terms),
    sheet: sheetSection(input, terms),
    applyTarget: KICKOFF_FIX_TARGETS.rentAndCharges,
    acceptance,
  };
}
