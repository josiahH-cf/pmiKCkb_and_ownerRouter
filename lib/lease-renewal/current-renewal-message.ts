import { formatBusinessTimestamp, formatCalendarMonth } from "@/lib/date-display";
import {
  buildManagedGmailDraftsDestination,
  buildRentvineRecordDestination,
  expectedRentvineHost,
} from "@/lib/lease-renewal/desk-destinations";
import {
  messageResourceFingerprint,
  workingTermsFingerprint,
} from "./message-claim-basis";
import { observeRenewalNotice } from "@/lib/firestore/renewal-notice-safety";
import {
  readAdmittedRenewalNoticeLease,
  readCoherentRenewalDisplaySource,
} from "./admitted-notice-source";
import { RenewalNoticeSourceError } from "./notice-source-error";
import { RentVineError } from "@/lib/integrations/rentvine/client";
import { manualNonRenewalReason } from "./notice-safety";
import {
  getCreatedMessageDrafts,
  getCurrentMessageDraft,
  getPreviousMessageDrafts,
} from "@/lib/firestore/renewal-message-drafts";
import { resolveCurrentCompScreenshotAttachment } from "@/lib/firestore/lease-renewal-progress";
import { compScreenshotDraftAttachmentIdentity } from "@/lib/lease-renewal/comp-screenshot-attachment";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { getRenewalWorkspace } from "@/lib/firestore/renewal-workspace";
import {
  getMessagePreparation,
  getMessageRuleBasis,
  workspaceMessageBasisFingerprint,
} from "@/lib/firestore/renewal-message-preparations";
import {
  STANDING_AGREEMENT_WORDS,
  adoptedStandingRule,
  standingRuleWords,
} from "@/lib/lease-renewal/standing-agreement";
import {
  getMessageBodyOverride,
  getMessageSubjectOverride,
  resolveMessageBodyOverride,
  resolveMessageSubjectOverride,
} from "@/lib/firestore/renewal-message-body-overrides";
import { getRenewalWorkingRecord } from "@/lib/firestore/renewal-working-record";
import { operationalCurrentRent } from "@/lib/lease-renewal/current-rent";
import { effectiveRenewalTerms } from "@/lib/lease-renewal/effective-terms";
import { RenewalPricingPolicyStore } from "@/lib/firestore/renewal-pricing-policies";
import { readRenewalPricingForViews } from "@/lib/lease-renewal/pricing-policy-read";
import {
  projectRenewalPricingPolicy,
  resolveRenewalPricing,
} from "@/lib/lease-renewal/renewal-pricing-policy";
import {
  workingRenewalTerms,
  type RenewalWorkingRecord,
} from "@/lib/lease-renewal/working-record";
import type { RawLease } from "@/lib/integrations/rentvine/client";
import type { RenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory-model";
import { getRenewalResourceLocations } from "@/lib/firestore/renewal-resource-locations";
import { readBusinessProfile } from "@/lib/firestore/presentation-settings";
import { profileSignature } from "@/lib/staff/business-profile";
import { getRetainedSenderSignature } from "@/lib/firestore/renewal-sender-signatures";
import { loadRenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory";
import { chargeDateIso } from "@/lib/lease-renewal/writeback/charge-inventory-model";
import {
  getSuppliedRenewalPublication,
  suppliedRenewalPublication,
} from "@/lib/firestore/renewal-message-publication";
import { EditableLayerError } from "@/lib/firestore/errors";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  buildLiveRenewalConfig,
  buildLiveRentVineConfig,
} from "@/lib/lease-renewal/live-config";
import { LeaseDataExpiredError } from "@/lib/lease-renewal/live-lease-cache";
import {
  leaseCurrentRent,
  leaseEndDateIso,
  leasePortfolioId,
  leaseViewId,
} from "@/lib/integrations/rentvine/lease-mapper";
import { projectMessageMarketEvidence } from "@/lib/lease-renewal/message-market-evidence";
import {
  greetingPartyNames,
  projectRenewalDeskIdentity,
} from "@/lib/lease-renewal/desk-identity";
import {
  composeRenewalMessage,
  ownerSuggestionSentence,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import {
  emptyMessagePreparationInputs,
  type MessageRuleBasis,
} from "@/lib/lease-renewal/renewal-message-preparation";
import { readPolicyMaterialSnapshot } from "@/lib/firestore/lease-renewal-policy-material";
import {
  policyMessageGates,
  projectPolicyApplicability,
} from "@/lib/lease-renewal/policy-content";
import { usableRenewalResourceUrl } from "@/lib/lease-renewal/resource-locations";
import { ownerDraftMarketFromBasis } from "@/lib/lease-renewal/owner-draft";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import { resolveSeparatedRenewalDraftRecipient } from "@/lib/lease-renewal/execution/renewal-draft-preview";
import { listMarketObservations } from "@/lib/firestore/renewal-market-observations";
import {
  storedComparisonFor,
  typedRecommendation,
  workingRecommendationBasis,
} from "@/lib/lease-renewal/kickoff-facts";
import {
  marketBasisFromCapturedResult,
  type RenewalMarketObservation,
} from "@/lib/lease-renewal/market-observation";
import { messageRevisionOf } from "@/lib/lease-renewal/message-revision";
import {
  renewalRentToRecommend,
  type RenewalStoredComparison,
} from "@/lib/lease-renewal/renewal-preparation";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";

/**
 * S116 (R116.4): the complete same-audience recipient set the message will carry, from the same
 * source-bound resolution the draft uses. A refusal names the party or collision so a person
 * corrects the source; no address is invented and no party is omitted.
 */
export type CurrentMessageRecipients =
  | { status: "ready"; to: string; cc: string[] }
  | { status: "blocked"; reasons: string[] };

export function projectCurrentMessageRecipients(
  lease: Parameters<typeof resolveSeparatedRenewalDraftRecipient>[0]["lease"],
  channel: "owner" | "tenant",
): CurrentMessageRecipients {
  const result = resolveSeparatedRenewalDraftRecipient({ lease, channel });
  return result.status === "ready"
    ? { status: "ready", to: result.resolution.to, cc: [...(result.resolution.cc ?? [])] }
    : { status: "blocked", reasons: result.reasons };
}

/**
 * S120 (R120.2): where the current signature came from. A retained value fills the inputs for the
 * same managed sender only; it is neither a review nor a sender binding until that actor saves.
 */
export type MessageSignatureOrigin =
  | { kind: "none" }
  | { kind: "saved" }
  | { kind: "retained_sender"; recordedAt: string }
  | { kind: "business_profile"; recordedAt: string; version: number };

/** S120 (R120.2): a current non-rent recurring charge a person may deliberately fill a charge from. */
export interface MessageChargeInventoryLine {
  id: string;
  label: string;
  amount: number;
  /** Months between charges; 1 is monthly. */
  frequency: number;
  startDate: string | null;
  current: boolean | null;
  sourceRef: string;
}

/**
 * S249 R-S249-2: a stored lookup with no saved preparation, read as the preparation the message
 * draws its range and comparables from. Read only: nothing is saved by reading it.
 */
export function observationPreparation(
  observations: readonly RenewalMarketObservation[],
  stored: RenewalStoredComparison,
): NonNullable<RenewalWorkspaceState["preparation"]> | null {
  const row = observations.find((entry) => entry.id === stored.observationId);
  if (!row) return null;
  const basis = marketBasisFromCapturedResult(row.result);
  if (!basis.provider) return null;
  return {
    market: {
      ...basis,
      rangeLow: basis.provider.rangeLow,
      rangeHigh: basis.provider.rangeHigh,
      rangeBasis: "provider",
    },
    source: `${basis.provider.source} comparison stored ${row.recordedAt.slice(0, 10)}`,
    observationId: row.id,
    recordedAt: row.recordedAt,
    recordedByUid: "stored-comparison",
    revision: 0,
  };
}

/**
 * S249 R-S249-5 (J): the prefilled rent to recommend a composed owner message carries: a proposal
 * (agreement or comparison) whose approved suggestion sentence is in the message text as composed.
 */
export function carriedRecommendationOf(
  channel: "owner" | "tenant",
  rent: { value: number | null; origin: string | null; basis: string },
  suggested: { value: number; kind?: string } | null,
  plainText: string,
): { value: number; origin: "agreement" | "comparison"; basis: string } | null {
  if (channel !== "owner" || suggested?.kind !== "proposal") return null;
  if (rent.origin !== "agreement" && rent.origin !== "comparison") return null;
  const sentence = ownerSuggestionSentence(suggested.value);
  if (!sentence || !plainText.includes(sentence)) return null;
  return { value: suggested.value, origin: rent.origin, basis: rent.basis };
}

/** The label a message's working terms carry as their source. */
export const WORKING_TERMS_MESSAGE_SOURCE = "Working renewal terms";

/** Only observed provider/network error identities are recoverable; programming errors propagate. */
function messageSourceFailure(error: unknown): never {
  const networkCodes = new Set([
    "ENETUNREACH",
    "EAI_AGAIN",
    "ENOTFOUND",
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_SOCKET",
  ]);
  const cause = error instanceof TypeError ? error.cause : null;
  if (
    error instanceof RentVineError ||
    (error instanceof DOMException &&
      ["AbortError", "TimeoutError"].includes(error.name)) ||
    (cause &&
      typeof cause === "object" &&
      "code" in cause &&
      typeof cause.code === "string" &&
      networkCodes.has(cause.code))
  )
    throw new RenewalNoticeSourceError("lease_unavailable");
  throw error;
}

/**
 * Read-only assembly. Missing Gmail or publication readiness never prevents body preparation.
 *
 * S161: the message is assembled from whatever is available. Renewal terms are the terms staff are
 * working with (S156), current rent is the one shared operational meaning (S153/S157), and no
 * renewal cycle, owner approval, tenant acceptance or review record is a prerequisite (S154/S156).
 * A lease with no work record yet still reads a complete, editable message; its first save
 * establishes the record. Authored subject and body are returned exactly as saved.
 */
/**
 * S250 R-S250-4 / R-S250-8: the covering standing agreement's rent with its basis in words, from
 * the one coverage function over the same verified lease read. A stale source, a failed read or
 * a lease the agreement does not cover gives none, and the message keeps its other proposals.
 */
interface StandingMessageRule {
  /** The rent the message builds on from the agreement, with its basis in words. */
  readonly rent: { value: number; basis: string } | null;
  /** The agreement rule that rent was built on, by its stored ids. */
  readonly ruleBasis: MessageRuleBasis | null;
  /**
   * R-S250-7: the message's saved revision was built on an earlier version of the agreement's
   * rule. It keeps that rule's rent and offers to rebuild with the current one.
   */
  readonly earlierRule: {
    readonly agreement: string;
    readonly earlier: string;
    readonly current: string;
    readonly currentRent: number;
    readonly currentBasis: MessageRuleBasis;
  } | null;
}
const NO_STANDING_RULE: StandingMessageRule = {
  rent: null,
  ruleBasis: null,
  earlierRule: null,
};
const usdWords = (amount: number, cents = true) =>
  `$${(cents ? amount.toFixed(2) : String(Math.round(amount))).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  )}`;

/**
 * S250 R-S250-4 / R-S250-8: the covering standing agreement's rent with its basis in words, from
 * the one coverage function over the same verified lease read. An incomplete source, a failed
 * read or a lease the agreement does not cover gives none, and the message keeps its other
 * proposals. R-S250-7: when the saved revision was built on an earlier version of the rule (its
 * stamp), the message keeps that rule's rent and says so; a never-saved message follows the
 * current rule (a later proposal).
 */
async function standingAgreementRule(
  actor: AuthenticatedUser,
  lease: RawLease,
  working: RenewalWorkingRecord | null,
  nowMs: number,
  usable: boolean,
  stamp: MessageRuleBasis | null,
  db: Firestore,
): Promise<StandingMessageRule> {
  if (!usable) return NO_STANDING_RULE;
  try {
    const store = new RenewalPricingPolicyStore(db);
    const pricing = await readRenewalPricingForViews(
      actor,
      [lease],
      new Date(nowMs),
      store,
    );
    const facts = pricing.facts[0];
    if (!facts) return NO_STANDING_RULE;
    const resolved = resolveRenewalPricing(
      pricing.snapshot,
      facts,
      effectiveRenewalTerms(working).complete,
      pricing.today,
      { workingRent: workingRenewalTerms(working).rent },
    );
    // An earlier adopted rent can differ from today's rule. Resolve the current rule without
    // that amount only to describe the difference; ordinary owner coverage is unchanged.
    const authority =
      !resolved.authority.covered &&
      stamp &&
      resolved.standingAgreement?.id === stamp.agreementId
        ? resolveRenewalPricing(
            pricing.snapshot,
            facts,
            effectiveRenewalTerms(working).complete,
            pricing.today,
            { workingRent: null },
          ).authority
        : resolved.authority;
    if (
      !authority.covered ||
      authority.kind !== "standing" ||
      typeof authority.amount !== "number" ||
      !authority.basis ||
      !authority.agreementId ||
      !authority.policyId ||
      !authority.policyVersion ||
      !authority.rule
    )
      return NO_STANDING_RULE;
    const currentBasis: MessageRuleBasis = {
      agreementId: authority.agreementId,
      policyId: authority.policyId,
      policyVersion: authority.policyVersion,
    };
    const current = {
      rent: { value: authority.amount, basis: authority.basis },
      ruleBasis: currentBasis,
      earlierRule: null,
    };
    if (
      !stamp ||
      stamp.agreementId !== currentBasis.agreementId ||
      (stamp.policyId === currentBasis.policyId &&
        stamp.policyVersion === currentBasis.policyVersion)
    )
      return current;
    const earlierPolicy =
      pricing.snapshot.policies.find(
        (entry) => entry.id === stamp.policyId && entry.version === stamp.policyVersion,
      ) ?? (await store.policyVersion(actor, stamp.policyId, stamp.policyVersion));
    const earlier = earlierPolicy
      ? projectRenewalPricingPolicy(
          // The earlier rule as it was recorded, applied to today's current rent.
          { ...earlierPolicy, effectiveThrough: null },
          facts.currentRent,
          pricing.today,
        )
      : null;
    const earlierWords = earlierPolicy ? standingRuleWords(earlierPolicy) : null;
    // A version that changed nothing the rule says (and gives the same rent) is the same rule.
    if (
      !earlier?.amount ||
      !earlierWords ||
      (earlierWords === authority.rule && earlier.amount === authority.amount)
    )
      return current;
    const name = authority.label ?? "the standing agreement";
    return {
      rent: {
        value: earlier.amount,
        basis: `${STANDING_AGREEMENT_WORDS.earlierRule}: ${name}, ${earlierWords.charAt(0).toLowerCase()}${earlierWords.slice(1)}, applied to the current rent of ${usdWords(facts.currentRent ?? 0)} and rounded to ${usdWords(earlier.amount, false)}.`,
      },
      ruleBasis: stamp,
      earlierRule: {
        agreement: name,
        earlier: earlierWords,
        current: authority.rule,
        currentRent: authority.amount,
        currentBasis,
      },
    };
  } catch {
    return NO_STANDING_RULE;
  }
}

export async function currentRenewalMessage(
  actor: AuthenticatedUser,
  leaseId: string,
  channel: "owner" | "tenant",
  db: Firestore = getAdminFirestore(),
  options: { requireFreshNotice?: boolean } = {},
) {
  const config = buildLiveRentVineConfig();
  if (!config.ok)
    throw new EditableLayerError(
      "Live RentVine is unavailable. Your saved wording is kept; refresh when the lease source is available.",
      409,
    );
  const nowMs = Date.now();
  const [
    leaseRead,
    workspace,
    working,
    resources,
    publication,
    retainedSignature,
    businessProfile,
    policyMaterial,
  ] = await Promise.all([
    // Editing/copy use the available lease view. An unavailable admitted notice pair is
    // projected as unknown below, and remains a server-side draft/approval hold.
    (options.requireFreshNotice
      ? readAdmittedRenewalNoticeLease(actor, leaseId, config.rentvineClient, nowMs, db)
      : readCoherentRenewalDisplaySource(
          actor,
          config.rentvineClient,
          nowMs,
          { leaseId },
          db,
        )
    ).catch(messageSourceFailure),
    getRenewalWorkspace(actor, leaseId, db),
    getRenewalWorkingRecord(actor, leaseId, db).catch(() => "unavailable" as const),
    getRenewalResourceLocations(actor, db).catch(() => null),
    getSuppliedRenewalPublication(actor, channel, db).catch(() => ({
      ...suppliedRenewalPublication(channel),
      status: "unavailable" as const,
      reason:
        "Current supplied-template publication could not be read. Editing and copy continue; the Gmail draft waits for that readback.",
    })),
    getRetainedSenderSignature(actor, db).catch(() => null),
    readBusinessProfile(actor, actor.uid, db).catch(() => null),
    // S129/S131: the policy material snapshot never throws.
    readPolicyMaterialSnapshot("rhino", db),
  ]);
  if (leaseRead.currency.state === "expired")
    throw new LeaseDataExpiredError(leaseRead.currency.ageMs);
  if (options.requireFreshNotice && leaseRead.currency.state !== "fresh")
    throw new RenewalNoticeSourceError("lease_not_current");
  const matching = leaseRead.snapshot.views.filter(
    (view) => leaseViewId(view) === leaseId,
  );
  if (matching.length !== 1)
    throw new EditableLayerError("The live lease is missing or ambiguous.", 409);
  const lease = matching[0];
  // S124: only source generations admitted for this lease can establish notice facts.
  // The admitted snapshot and status read retain their actual freshness. Missing membership,
  // expired reads or a failed status read cannot grant permission to create a draft.
  const noticeSafety = await observeRenewalNotice(
    actor,
    {
      lease,
      statusTable: leaseRead.statusTable,
      freshness: leaseRead.currency.state,
      leaseReadAtMs: leaseRead.snapshot.readAtMs,
      observedAtMs: Math.max(nowMs, Date.now()),
      noticeAdmitted: leaseRead.snapshot.noticeAdmitted,
      admittedLeaseKeys: leaseRead.snapshot.noticeAdmission?.leaseKeys,
    },
    db,
  );
  const moveOut = noticeSafety.disposition;
  // The notice marker is scoped to the dated work record. A work record saved without a date
  // (S154) lives beside the dated heads, so its notice scope carries no record id.
  const noticeScopeCycleId =
    workspace && workspace.basis.kind !== "lease_bound" ? workspace.cycleId : null;
  const noticeBlock =
    manualNonRenewalReason(workspace) ??
    noticeSafety.reason ??
    (noticeSafety.cycleId !== noticeScopeCycleId
      ? "The renewal cycle changed. Reload and review the message."
      : null);
  const identity = projectRenewalDeskIdentity(lease);
  const rentvineHost = expectedRentvineHost(process.env.RENTVINE_API_BASE_URL);
  const saved = workspace
    ? await getMessagePreparation(actor, leaseId, workspace.cycleId, channel, db)
    : null;
  const savedInputs = saved?.inputs ?? emptyMessagePreparationInputs();
  // S120 (R120.2): the same sender's retained signature fills an empty signature once; a saved
  // signature (this actor's or another's) is shown as saved and is never silently replaced.
  const signatureOrigin: MessageSignatureOrigin = savedInputs.signature
    ? { kind: "saved" }
    : businessProfile
      ? {
          kind: "business_profile",
          recordedAt: businessProfile.updatedAt,
          version: businessProfile.version,
        }
      : retainedSignature
        ? { kind: "retained_sender", recordedAt: retainedSignature.updatedAt }
        : { kind: "none" };
  const inputs =
    signatureOrigin.kind === "business_profile"
      ? { ...savedInputs, signature: profileSignature(businessProfile!.profile) }
      : signatureOrigin.kind === "retained_sender"
        ? { ...savedInputs, signature: retainedSignature!.signature }
        : savedInputs;
  // S129/S161: the same policy applicability the workspace shows. It is listed with the message
  // as information; it withholds neither the message nor its draft, and an unrelated lease has none.
  const policyGates = policyMessageGates(
    projectPolicyApplicability({
      productKey: "rhino",
      leaseId,
      manualState: workspace,
      material: policyMaterial,
      facts: [],
      sheetLegacyValue: null,
      todayIso: businessDateIso(nowMs),
    }),
    channel,
    policyMaterial,
  );
  const notices: string[] = [];
  if (noticeBlock) notices.push(noticeBlock);
  if (moveOut.state === "unknown") notices.push(moveOut.label);
  let draftJournalAvailable = true;
  const [draftAttempt, previousDraftAttempts] = workspace
    ? await Promise.all([
        getCurrentMessageDraft(actor, leaseId, workspace.cycleId, channel, db),
        getPreviousMessageDrafts(actor, leaseId, workspace.cycleId, channel, db),
      ]).catch(() => {
        draftJournalAvailable = false;
        notices.push(
          "The Gmail attempt history could not be read. Editing and copy continue; reload history before preparing a new Gmail attempt.",
        );
        return [null, []] as const;
      })
    : [null, []];
  // S249 R-S249-9: the drafts whose creation is recorded, so a cancelled preview never hides the
  // draft that is in Gmail. An unreadable list reads as none known (the attempt notice above says
  // the history is unreadable when it is).
  const createdDrafts = workspace
    ? await getCreatedMessageDrafts(actor, leaseId, workspace.cycleId, channel, db).catch(
        () => null,
      )
    : null;
  const availableCompScreenshot =
    channel === "owner"
      ? await db
          .runTransaction((tx) => resolveCurrentCompScreenshotAttachment(tx, db, leaseId))
          .catch(() => {
            notices.push(
              "The stored comp attachment could not be read. Editing and copy continue; the attachment waits for readback.",
            );
            return null;
          })
      : null;
  const attachment =
    availableCompScreenshot &&
    inputs.compScreenshotReceiptId === availableCompScreenshot.receiptId
      ? compScreenshotDraftAttachmentIdentity(availableCompScreenshot)
      : null;
  if (!resources)
    notices.push(
      "Shared resource settings could not be read. Saved links are not assumed empty; this message marks the links it could not read.",
    );
  if (working === "unavailable")
    notices.push(
      "The working information for this lease could not be read. The message shows source values until it reads back.",
    );
  const workingRecord = working === "unavailable" ? null : working;
  const renewalConfig = buildLiveRenewalConfig();
  // One read of the current recurring charges serves both audiences: the tenant charge fields may
  // be filled from a named non-rent charge (S120), and the owner message's current rent uses the
  // single current rent-account charge (S153). A failed read is a notice, never an empty inventory.
  let inventory: RenewalChargeInventory | null | undefined = undefined;
  let chargeInventory: MessageChargeInventoryLine[] | null = null;
  if (renewalConfig.ok) {
    try {
      inventory = await loadRenewalChargeInventory(renewalConfig.rentvineClient, leaseId);
    } catch {
      inventory = null;
      notices.push(
        "The current RentVine recurring charges could not be read. Charge fields stay manual until they are read back.",
      );
    }
  }
  if (channel === "tenant" && inventory)
    chargeInventory = inventory.charges
      .filter((charge) => charge.classification !== "rent")
      .map((charge) => ({
        id: charge.id,
        label: charge.accountLabel ?? charge.projection.description,
        amount: Number(charge.projection.amount),
        frequency: Number(charge.projection.frequency) || 1,
        startDate: chargeDateIso(charge.projection.startDate),
        current: charge.current,
        sourceRef: `rentvine:lease:${leaseId}:recurring-charge:${charge.id}`,
      }))
      .filter((line) => Number.isFinite(line.amount) && line.amount >= 0);
  // S153/S157 (BEH-S157-10): current rent in a newly prepared owner message has the one shared
  // meaning: the working value staff entered, then the single current rent-account charge, then the
  // contractual lease amount under its own label. Nothing is summed, split or chosen among several.
  let currentBaseRent: RenewalMessageFacts["currentBaseRent"] = null;
  if (channel === "owner") {
    const rent = operationalCurrentRent({
      working: workingRecord,
      inventory,
      contractualRent: leaseCurrentRent(lease) ?? null,
    });
    if (rent.amount !== null)
      currentBaseRent = { value: rent.amount, source: rent.label };
    if (rent.basis !== "working" && rent.attention)
      notices.push(
        rent.amount === null
          ? rent.attention
          : `${rent.attention} The current rent in this message is the ${rent.label}.`,
      );
  }
  // S156 (R-S161-2): the terms staff are working with, field by field. S234 R-S234-2: terms recorded
  // on an earlier owner response are never used in their place.
  const terms = effectiveRenewalTerms(workingRecord);
  const termsKnown =
    terms.rent !== null || terms.effectiveDate !== null || terms.endDate !== null;
  const termsSource = termsKnown ? WORKING_TERMS_MESSAGE_SOURCE : null;
  // S249 R-S249-2: a stored comparison for this cycle reaches the message with no second run. The
  // staff record's saved preparation comes first; else the newest stored lookup for the cycle.
  const observations =
    workspace && !workspace.preparation?.market.provider
      ? await listMarketObservations(actor, leaseId, workspace.cycleId, db).catch(
          () => [],
        )
      : [];
  const stored = storedComparisonFor({
    manual: workspace,
    observations: observations.map((row) => ({
      id: row.id,
      leaseId,
      cycleId: row.cycleId,
      recordedAt: row.recordedAt,
      result: row.result,
    })),
  });
  const preparation =
    workspace?.preparation?.market.provider || !stored
      ? (workspace?.preparation ?? null)
      : observationPreparation(observations, stored);
  const market = preparation?.market;
  const ownerMarket = market ? ownerDraftMarketFromBasis(market) : {};
  // S249 R-S249-5: the one "Rent to recommend": typed, else the covering agreement (S250), else
  // the comparison-based suggestion. The same function the Now card and the desk read.
  // S250: the agreement reads its portfolio from the same complete RentVine read the message
  // shows (an aging read keeps it, as the desk does). R-S250-7: the saved revision's rule stamp.
  const savedRuleBasis =
    saved && workspace
      ? await getMessageRuleBasis(
          actor,
          leaseId,
          workspace.cycleId,
          channel,
          saved.revision,
          db,
        ).catch(() => null)
      : null;
  const rentEntry = workingRecord?.fields.terms_rent;
  const workingRuleBasis = rentEntry ? adoptedStandingRule(rentEntry) : null;
  const standingRule = await standingAgreementRule(
    actor,
    lease,
    workingRecord,
    nowMs,
    leaseRead.snapshot.complete !== false,
    savedRuleBasis ?? workingRuleBasis,
    db,
  );
  const adoptedRuleRent =
    workingRuleBasis &&
    standingRule.ruleBasis &&
    workingRuleBasis.agreementId === standingRule.ruleBasis.agreementId &&
    workingRuleBasis.policyId === standingRule.ruleBasis.policyId &&
    workingRuleBasis.policyVersion === standingRule.ruleBasis.policyVersion &&
    rentEntry?.value === standingRule.rent?.value;
  const rentToRecommend = renewalRentToRecommend({
    typedRent: adoptedRuleRent ? null : typedRecommendation(workingRecord, workspace),
    workingRentBasis: workingRecommendationBasis(workingRecord),
    agreementRent: standingRule.rent,
    comparison: stored ? { state: "stored", comparison: stored } : { state: "none" },
    currentRent: leaseCurrentRent(lease) ?? null,
  });
  // The rule the shown rent was built on, only where that rent is the agreement's.
  const fromRule = rentToRecommend.origin === "agreement";
  const earlierRule = fromRule ? standingRule.earlierRule : null;
  if (earlierRule)
    notices.push(
      `${STANDING_AGREEMENT_WORDS.earlierRule}: this message keeps the rent from the earlier rule of ${earlierRule.agreement} (${earlierRule.earlier}). The current rule is ${earlierRule.current}. Choose ${STANDING_AGREEMENT_WORDS.rebuild} to use it.`,
    );
  const marketEvidence = projectMessageMarketEvidence({
    preparation,
    currentBaseRent: currentBaseRent?.value ?? null,
    selectedWorkingOffer:
      terms.rent !== null && termsSource
        ? { value: terms.rent, source: termsSource }
        : null,
  });
  if (
    rentToRecommend.value !== null &&
    rentToRecommend.origin !== "typed" &&
    (marketEvidence.suggestedRent === null ||
      marketEvidence.suggestedRent.kind === "provider_reference")
  )
    marketEvidence.suggestedRent = {
      value: rentToRecommend.value,
      source:
        rentToRecommend.origin === "agreement"
          ? rentToRecommend.basis
          : `Comparable-rent recommendation from ${stored?.source ?? "the stored comparison"}`,
      kind: "proposal",
    };
  notices.push(...marketEvidence.notices);
  const link = (id: string) => {
    const entry = resources?.entries[id];
    const url = usableRenewalResourceUrl(entry);
    return url ? { url, source: `renewal-resource:${id}:${entry!.recordedAt}` } : null;
  };
  const provider = market?.provider;
  const signature =
    saved?.signatureEmail && savedInputs.signature
      ? { ...savedInputs.signature, email: saved.signatureEmail }
      : (signatureOrigin.kind === "retained_sender" ||
            signatureOrigin.kind === "business_profile") &&
          inputs.signature
        ? { ...inputs.signature, email: actor.email }
        : null;
  // S163: greeting first names come from the provider's own first-name field for each person.
  const greeting = greetingPartyNames(
    channel === "owner" ? identity.owners : identity.tenants,
  );
  const facts: RenewalMessageFacts = {
    channel,
    names: greeting.names,
    firstNames: greeting.firstNames,
    address: identity.address?.label ?? null,
    currentBaseRent,
    leaseEndDate: leaseEndDateIso(lease) ?? null,
    ownerTerms: termsSource
      ? {
          rent: terms.rent,
          effectiveDate: terms.effectiveDate,
          endDate: terms.endDate,
          source: termsSource,
        }
      : null,
    range: marketEvidence.range,
    suggestedRent: marketEvidence.suggestedRent,
    recommendationReason: inputs.recommendationReason ?? null,
    // The provider's measured attributes are retained; no street address is invented when absent.
    comps: (provider?.comps ?? []).map((comp, index) => ({
      address: `Comparable ${index + 1}${comp.bedrooms !== undefined ? `, ${comp.bedrooms} bedrooms` : ""}`,
      rent: comp.rent,
      ...(comp.distanceMiles !== undefined ? { distanceMiles: comp.distanceMiles } : {}),
      source: `${provider!.source} retrieved ${formatBusinessTimestamp(provider!.retrievedAt)}`,
    })),
    trend: ownerMarket.trend
      ? `Average area rent for ${ownerMarket.trend.zipCode}: ${formatCalendarMonth(ownerMarket.trend.firstMonth)} ${ownerMarket.trend.firstAverage === undefined ? "(average unavailable)" : `$${ownerMarket.trend.firstAverage.toFixed(2)}`} to ${formatCalendarMonth(ownerMarket.trend.lastMonth)} ${ownerMarket.trend.lastAverage === undefined ? "(average unavailable)" : `$${ownerMarket.trend.lastAverage.toFixed(2)}`} (RentCast, retrieved ${formatBusinessTimestamp(ownerMarket.trend.retrievedAt)}).`
      : null,
    sparseCompsQualification:
      provider && provider.compCount < 3
        ? `This comparison is based on a limited set of ${provider.compCount} comparable ${provider.compCount === 1 ? "listing" : "listings"}.`
        : null,
    charges: inputs.charges,
    insuranceTransition: inputs.insuranceTransition,
    leaseOrigin: inputs.leaseOrigin,
    otherChargesComparison: inputs.otherChargesComparison,
    insuranceFlyer: link("insurance_flyer"),
    informationForm: link("renewal_information_form"),
    rbpFlyer: link("rbp_flyer"),
    signature,
    attachments: attachment
      ? [
          {
            filename: attachment.filename,
            source: `comp-screenshot-receipt:${attachment.receiptId}`,
          },
        ]
      : [],
  };
  const basis = {
    noticeSafety: noticeSafety.basis,
    resourceFingerprint: messageResourceFingerprint(resources),
    sourceFingerprint: hashExecutionPreview({
      leaseId,
      channel,
      noticeSafety: noticeSafety.basis,
      names: facts.names,
      firstNames: facts.firstNames,
      address: facts.address,
      currentBaseRent,
      leaseEndDate: facts.leaseEndDate,
      ownerTerms: facts.ownerTerms,
      preparation,
      resourceEntries: resources
        ? {
            insurance_flyer: resources.entries.insurance_flyer ?? null,
            renewal_information_form: resources.entries.renewal_information_form ?? null,
            rbp_flyer: resources.entries.rbp_flyer ?? null,
          }
        : null,
      cycleId: workspace?.cycleId ?? null,
      availableCompScreenshot: availableCompScreenshot
        ? compScreenshotDraftAttachmentIdentity(availableCompScreenshot)
        : null,
      workspaceBasis: workspace
        ? workspaceMessageBasisFingerprint({ ...workspace })
        : null,
    }),
    workspaceFingerprint: workspace
      ? workspaceMessageBasisFingerprint({ ...workspace })
      : null,
    workingTermsFingerprint: workingTermsFingerprint(workingRecord),
  };
  const composed = composeRenewalMessage(facts, inputs.edits);
  if (marketEvidence.rangeRequirement) {
    // R118.4: the starting range alone is not comparable evidence; the callout says so.
    const entry = composed.missing.find((item) => item.field === "range");
    if (entry) entry.message = marketEvidence.rangeRequirement;
  }
  if (inputs.compScreenshotReceiptId && !attachment)
    composed.missing.push({
      field: "attachment",
      message:
        "The selected screenshot is no longer the current one, so it is left off this message. Choose the current screenshot or clear the selection.",
    });
  // S139/S161: authored wording is the body for its own saved revision, exactly as written, also
  // after the composition it started from changed. An authored subject follows the same rule.
  const [savedOverride, savedSubject] =
    saved && workspace
      ? await Promise.all([
          getMessageBodyOverride(actor, leaseId, workspace.cycleId, channel, db).catch(
            () => "unreadable" as const,
          ),
          getMessageSubjectOverride(actor, leaseId, workspace.cycleId, channel, db).catch(
            () => null,
          ),
        ])
      : [null, null];
  const refined = resolveMessageBodyOverride(
    composed,
    saved?.revision ?? null,
    savedOverride,
  );
  const authoredSubject = resolveMessageSubjectOverride(
    refined.content,
    saved?.revision ?? null,
    savedSubject,
  );
  const content = authoredSubject.content;
  const signatureMatchesActor =
    saved?.signatureActorUid === actor.uid &&
    saved.signatureEmail?.toLowerCase() === actor.email.toLowerCase();
  return {
    /** S249 R-S249-5: the rent to recommend and its basis, as the Now card reads it. */
    rentToRecommend,
    /** S250 R-S250-7: the agreement rule the shown rent was built on; a save carries it. */
    ruleBasis: fromRule ? standingRule.ruleBasis : null,
    /** S250 R-S250-7: the message keeps an earlier rule's rent and offers to rebuild. */
    earlierRule,
    /**
     * S249 R-S249-5 (J): the prefilled figure this composed owner message actually carries, so a
     * send makes exactly that figure the staff reviewed recommendation. Null when the figure is
     * typed, absent, or edited out of the wording.
     */
    carriedRecommendation: carriedRecommendationOf(
      channel,
      rentToRecommend,
      marketEvidence.suggestedRent,
      content.plainText,
    ),
    /** S249 ARCH-S249-2: the revision of this message record (subject and body). */
    messageRevision: messageRevisionOf({
      subject: content.subject,
      body: content.plainText,
    }),
    noticeBlock,
    /** S233 R-S233-1: the renewal cycle the notice scope names, so each message can say it. */
    noticeCycleId: noticeSafety.cycleId,
    attachment,
    availableCompScreenshot: availableCompScreenshot
      ? compScreenshotDraftAttachmentIdentity(availableCompScreenshot)
      : null,
    draftAttempt,
    /** S249 R-S249-9: the last created Gmail draft and how many earlier ones it replaced. */
    createdDrafts,
    previousDraftAttempts,
    draftJournalAvailable,
    senderEmail: actor.email,
    signatureOrigin,
    retainedSignature: retainedSignature?.signature ?? null,
    chargeInventory,
    recipients: projectCurrentMessageRecipients(lease, channel),
    destinations: {
      gmailDrafts: buildManagedGmailDraftsDestination(actor.email),
      lease: buildRentvineRecordDestination({
        expectedHost: rentvineHost,
        recordId: leaseId,
        recordType: "lease",
      }),
      messages: buildRentvineRecordDestination({
        expectedHost: rentvineHost,
        recordId: leaseId,
        recordType: "lease",
        messages: true,
      }),
      owners:
        channel === "owner"
          ? identity.owners.flatMap((owner) => {
              const record = buildRentvineRecordDestination({
                expectedHost: rentvineHost,
                recordId: owner.contactId?.label,
                recordType: "owner",
              });
              const messages = buildRentvineRecordDestination({
                expectedHost: rentvineHost,
                recordId: owner.contactId?.label,
                recordType: "owner",
                messages: true,
              });
              return record && messages ? [{ name: owner.label, record, messages }] : [];
            })
          : [],
    },
    lease,
    moveOut,
    workspace,
    saved,
    inputs,
    facts,
    content,
    /** S139/S161: the composed body before authored wording, and the authored wording's state. */
    composedContent: composed,
    bodyBaseHash: refined.baseHash,
    bodyOverride: refined.state,
    /** S161: the authored subject for this saved revision, or null for the composed subject. */
    subjectOverride: authoredSubject.subject,
    basis,
    signatureMatchesActor,
    publication,
    notices,
    policyGates,
  };
}
