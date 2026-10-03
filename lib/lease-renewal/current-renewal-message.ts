import { formatBusinessTimestamp, formatCalendarMonth } from "@/lib/date-display";
import {
  buildManagedGmailDraftsDestination,
  buildRentvineRecordDestination,
  expectedRentvineHost,
} from "@/lib/lease-renewal/desk-destinations";
import { messageResourceFingerprint } from "./message-claim-basis";
import { observeRenewalNotice } from "@/lib/firestore/renewal-notice-safety";
import { readAdmittedRenewalNoticeLease } from "./admitted-notice-source";
import { manualNonRenewalReason } from "./notice-safety";
import {
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
  workspaceMessageBasisFingerprint,
} from "@/lib/firestore/renewal-message-preparations";
import {
  getMessageBodyOverride,
  getMessageSubjectOverride,
  resolveMessageBodyOverride,
  resolveMessageSubjectOverride,
} from "@/lib/firestore/renewal-message-body-overrides";
import { getRenewalWorkingRecord } from "@/lib/firestore/renewal-working-record";
import { operationalCurrentRent } from "@/lib/lease-renewal/current-rent";
import { effectiveRenewalTerms } from "@/lib/lease-renewal/effective-terms";
import type { RenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory-model";
import { getRenewalResourceLocations } from "@/lib/firestore/renewal-resource-locations";
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
import { getApprovedRentSuggestion } from "@/lib/firestore/lease-renewal-rent-suggestion-approvals";
import { projectMessageMarketEvidence } from "@/lib/lease-renewal/message-market-evidence";
import {
  greetingPartyNames,
  projectRenewalDeskIdentity,
} from "@/lib/lease-renewal/desk-identity";
import {
  composeRenewalMessage,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import { readPolicyMaterialSnapshot } from "@/lib/firestore/lease-renewal-policy-material";
import {
  policyMessageGates,
  projectPolicyApplicability,
} from "@/lib/lease-renewal/policy-content";
import { usableRenewalResourceUrl } from "@/lib/lease-renewal/resource-locations";
import { ownerDraftMarketFromBasis } from "@/lib/lease-renewal/owner-draft";
import { resolveSeparatedRenewalDraftRecipient } from "@/lib/lease-renewal/execution/renewal-draft-preview";

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
  | { kind: "retained_sender"; recordedAt: string };

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

/** The label a message's working terms carry as their source. */
export const WORKING_TERMS_MESSAGE_SOURCE = "Working renewal terms";

/**
 * Read-only assembly. Missing Gmail or publication readiness never prevents body preparation.
 *
 * S161: the message is assembled from whatever is available. Renewal terms are the terms staff are
 * working with (S156), current rent is the one shared operational meaning (S153/S157), and no
 * renewal cycle, owner approval, tenant acceptance or review record is a prerequisite (S154/S156).
 * A lease with no work record yet still reads a complete, editable message; its first save
 * establishes the record. Authored subject and body are returned exactly as saved.
 */
export async function currentRenewalMessage(
  actor: AuthenticatedUser,
  leaseId: string,
  channel: "owner" | "tenant",
  db: Firestore = getAdminFirestore(),
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
    policyMaterial,
  ] = await Promise.all([
    readAdmittedRenewalNoticeLease(actor, leaseId, config.rentvineClient, nowMs, db),
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
    // S129/S131: the policy material snapshot never throws.
    readPolicyMaterialSnapshot("rhino", db),
  ]);
  if (leaseRead.currency.state === "expired")
    throw new LeaseDataExpiredError(leaseRead.currency.ageMs);
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
      observedAtMs: nowMs,
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
    : retainedSignature
      ? { kind: "retained_sender", recordedAt: retainedSignature.updatedAt }
      : { kind: "none" };
  const inputs =
    signatureOrigin.kind === "retained_sender"
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
      todayIso: new Date(nowMs).toISOString().slice(0, 10),
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
  // S156 (R-S161-2): the terms staff are working with, field by field, with terms already recorded
  // on an owner response as the fallback. An owner response is a recorded fact, not a prerequisite.
  const terms = effectiveRenewalTerms(workingRecord, workspace);
  const termsKnown =
    terms.rent !== null || terms.effectiveDate !== null || terms.endDate !== null;
  const termsSource = !termsKnown
    ? null
    : Object.values(terms.sources).every(
          (source) => source === null || source === "owner_response",
        ) && workspace?.ownerResponse
      ? workspace.ownerResponse.source
      : WORKING_TERMS_MESSAGE_SOURCE;
  const market = workspace?.preparation?.market;
  const ownerMarket = market ? ownerDraftMarketFromBasis(market) : {};
  // S118 (R118.3): a recommendation that is still the returned point estimate needs the existing
  // Admin approval of that exact number; the approval record is read only when one could apply.
  let approvedSuggestionValue: number | null = null;
  if (channel === "owner" && market?.recommendationBasis === "provider") {
    try {
      approvedSuggestionValue =
        (
          await getApprovedRentSuggestion(
            actor,
            leaseId,
            currentBaseRent?.value ?? null,
            leasePortfolioId(lease) ?? null,
            db,
          )
        )?.value ?? null;
    } catch {
      notices.push(
        "The Admin approval record for the comp-derived number could not be read. The provider-derived recommendation stays out of this message until it is read back.",
      );
    }
  }
  const marketEvidence = projectMessageMarketEvidence({
    preparation: workspace?.preparation ?? null,
    currentBaseRent: currentBaseRent?.value ?? null,
    approvedSuggestionValue,
  });
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
      : signatureOrigin.kind === "retained_sender" && inputs.signature
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
    // The provider's measured attributes are retained; no street address is invented when absent.
    comps: (provider?.comps ?? []).map((comp, index) => ({
      address: `Comparable ${index + 1}${comp.bedrooms !== undefined ? `, ${comp.bedrooms} bedrooms` : ""}${comp.distanceMiles !== undefined ? `, ${comp.distanceMiles} miles away` : ""}`,
      rent: comp.rent,
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
      preparation: workspace?.preparation ?? null,
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
    noticeBlock,
    attachment,
    availableCompScreenshot: availableCompScreenshot
      ? compScreenshotDraftAttachmentIdentity(availableCompScreenshot)
      : null,
    draftAttempt,
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
