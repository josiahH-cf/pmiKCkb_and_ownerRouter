// S264 (R-S264-2/6): the one composition of the tenant offer's charges, from a RentVine charge
// source the caller already read, the approved mappings, the charge review saved with the tenant
// message's revision and the current-cycle working record. The tenant message, the lease page and
// the source-update claims compose the current offer here, so they compare the same snapshot.
// Reads the app's records only; it never calls a provider. Server-only.

import type { Firestore } from "firebase-admin/firestore";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  getMessagePreparation,
  getOfferChargeSelection,
  type OfferChargeSelectionRead,
} from "@/lib/firestore/renewal-message-preparations";
import { readOfferAnswer } from "@/lib/firestore/renewal-offer-answers";
import { readOfferChargeMappings } from "@/lib/firestore/renewal-offer-charge-mappings";
import { readOfferSource } from "@/lib/firestore/renewal-offer-sources";
import { getRenewalWorkingRecord } from "@/lib/firestore/renewal-working-record";
import { getRenewalWorkspace } from "@/lib/firestore/renewal-workspace";
import { effectiveRenewalTerms } from "./effective-terms";
import type { OfferChargeMappingsRead } from "./offer-charge-mapping";
import { tenantAcceptanceCheck, type OfferAnswerRecord } from "./offer-answers";
import {
  projectOfferCharges,
  type OfferChargeReview,
  type OfferChargeSelection,
  type OfferChargeSource,
} from "./offer-charges";
import { buildOfferSnapshot, type FrozenOfferSnapshot } from "./offer-snapshot";
import { emptyMessagePreparationInputs } from "./renewal-message-preparation";
import type { TenantAcceptanceRead } from "./tenant-acceptance-hold";
import type { RenewalWorkingRecord } from "./working-record";
import {
  currentManualTenantOutcome,
  type RenewalWorkspaceState,
} from "./workspace-state";

/**
 * The tenant offer's charge review as one read resolves it. The editor projects the same review
 * from `source`, `mappings` and its own unsaved selection; the server's snapshot is the one the
 * exact claims bind.
 */
export interface CurrentOfferCharges {
  readonly source: OfferChargeSource;
  readonly mappings: OfferChargeMappingsRead;
  readonly saved: OfferChargeSelection | null;
  readonly review: OfferChargeReview;
  readonly snapshot: FrozenOfferSnapshot;
}

export async function composeTenantOfferCharges(input: {
  readonly actor: AuthenticatedUser;
  readonly leaseId: string;
  readonly workspace: RenewalWorkspaceState | null;
  readonly working: RenewalWorkingRecord | null;
  /** The tenant message's saved revision and inputs for this cycle; null when none is saved. */
  readonly saved: {
    readonly revision: number;
    readonly inputs: ReturnType<typeof emptyMessagePreparationInputs>;
  } | null;
  readonly source: OfferChargeSource;
  readonly db: Firestore;
}): Promise<CurrentOfferCharges> {
  const { actor, leaseId, workspace, saved, source, db } = input;
  const terms = effectiveRenewalTerms(input.working);
  const inputs = saved?.inputs ?? emptyMessagePreparationInputs();
  const [mappings, savedSelection] = await Promise.all([
    readOfferChargeMappings(db),
    saved && workspace
      ? getOfferChargeSelection(actor, leaseId, workspace.cycleId, saved.revision, db)
      : Promise.resolve<OfferChargeSelectionRead>({ state: "none" }),
  ]);
  const review = projectOfferCharges({
    leaseId,
    source,
    mappings,
    selection: savedSelection.state === "saved" ? savedSelection.selection : null,
    selectionUnreadable: savedSelection.state === "unreadable",
    terms: { rent: terms.rent, effectiveDate: terms.effectiveDate },
    legacyCharges: inputs.charges,
    legacyInsuranceTransition: inputs.insuranceTransition,
    legacyOtherChargesComparison: inputs.otherChargesComparison,
  });
  return {
    source,
    mappings,
    saved: savedSelection.state === "saved" ? savedSelection.selection : null,
    review,
    snapshot: buildOfferSnapshot({
      leaseId,
      cycleId: workspace?.cycleId ?? null,
      working: input.working,
      review,
      source,
    }),
  };
}

/**
 * The current tenant offer, composed from a charge source the caller already read: the tenant
 * message's saved revision is read for the work record's cycle. Null when no source was read.
 */
export async function readCurrentTenantOffer(input: {
  readonly actor: AuthenticatedUser;
  readonly leaseId: string;
  readonly workspace: RenewalWorkspaceState | null;
  readonly working: RenewalWorkingRecord | null;
  readonly source: OfferChargeSource;
  readonly db: Firestore;
}): Promise<FrozenOfferSnapshot | null> {
  if (input.source.state !== "read") return null;
  const saved = input.workspace
    ? await getMessagePreparation(
        input.actor,
        input.leaseId,
        input.workspace.cycleId,
        "tenant",
        input.db,
      )
    : null;
  return (await composeTenantOfferCharges({ ...input, saved })).snapshot;
}

/** When the offer an acceptance answered was frozen, as near as its record says (never later). */
function answeredOfferFrozenAtMs(record: OfferAnswerRecord): number {
  const recordedAt = Date.parse(record.recordedAt);
  return record.attribution.kind === "linked_communication" &&
    record.attribution.sentAtMs !== null
    ? Math.min(record.attribution.sentAtMs, recordedAt)
    : recordedAt;
}

/**
 * R-S264-6 at a consumer: how the work record's current tenant acceptance stands against the
 * current offer's charges, from the app's records alone. Null when no acceptance answers the
 * current terms; never throws (a failed read reads as unknown, the acceptance as recorded).
 *
 * `source` is a RentVine charge read the caller already made (the lease page). Without one (a
 * source-update claim), the lines the tenant message's last save or draft kept are the basis, but
 * only when they were read after the accepted offer was frozen: an older read cannot show what
 * the tenant saw, so the acceptance reads as recorded. No provider is called here.
 */
export async function readTenantAcceptanceCheck(input: {
  readonly actor: AuthenticatedUser;
  readonly leaseId: string;
  /** The app's database; the server's own when omitted. */
  readonly db?: Firestore;
  /** The work record, when the caller already read it. */
  readonly workspace?: RenewalWorkspaceState | null;
  /** The current-cycle working record, when the caller already read it. */
  readonly working?: RenewalWorkingRecord | null;
  readonly source?: OfferChargeSource;
}): Promise<TenantAcceptanceRead | null> {
  const { actor, leaseId } = input;
  let db: Firestore;
  let workspace: RenewalWorkspaceState | null = null;
  try {
    db = input.db ?? getAdminFirestore();
    workspace =
      input.workspace !== undefined
        ? input.workspace
        : await getRenewalWorkspace(actor, leaseId, db);
  } catch {
    return null;
  }
  const response = workspace?.tenantResponse;
  if (!workspace || !response || currentManualTenantOutcome(workspace) !== "accepted")
    return null;
  const unknown: TenantAcceptanceRead = {
    eventId: response.eventId,
    state: "unknown",
    line: null,
  };
  try {
    const record = await readOfferAnswer(db, response.eventId);
    const held = tenantAcceptanceCheck({ workspace, record, current: null });
    if (!record || held?.state !== "unknown") return held;
    let source = input.source;
    if (!source) {
      const kept = await readOfferSource(db, leaseId);
      const readAtMs = kept ? Date.parse(kept.readAt) : Number.NaN;
      const frozenAtMs = answeredOfferFrozenAtMs(record);
      if (
        !kept ||
        !Number.isFinite(readAtMs) ||
        !Number.isFinite(frozenAtMs) ||
        readAtMs < frozenAtMs
      )
        return unknown;
      source = kept.source;
    }
    const working =
      input.working !== undefined
        ? input.working
        : await getRenewalWorkingRecord(actor, leaseId, db);
    const current = await readCurrentTenantOffer({
      actor,
      leaseId,
      workspace,
      working,
      source,
      db,
    });
    return tenantAcceptanceCheck({ workspace, record, current });
  } catch {
    return unknown;
  }
}
