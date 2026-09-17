import {
  buildManagedGmailDraftsDestination,
  buildRentvineRecordDestination,
  expectedRentvineHost,
} from "@/lib/lease-renewal/desk-destinations";
import { messageResourceFingerprint } from "./message-claim-basis";
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
import { getRenewalResourceLocations } from "@/lib/firestore/renewal-resource-locations";
import { getRetainedSenderSignature } from "@/lib/firestore/renewal-sender-signatures";
import { loadRenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory";
import { chargeDateIso } from "@/lib/lease-renewal/writeback/charge-inventory-model";
import {
  getSuppliedRenewalPublication,
  suppliedRenewalPublication,
} from "@/lib/firestore/renewal-message-publication";
import { listResolutionsForRun } from "@/lib/firestore/lease-renewal-resolutions";
import { EditableLayerError } from "@/lib/firestore/errors";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  buildLiveRenewalConfig,
  buildLiveRentVineConfig,
} from "@/lib/lease-renewal/live-config";
import { requireCurrentLeaseViews } from "@/lib/lease-renewal/live-lease-cache";
import {
  leaseEndDateIso,
  leasePortfolioId,
  leaseViewId,
} from "@/lib/integrations/rentvine/lease-mapper";
import { getApprovedRentSuggestion } from "@/lib/firestore/lease-renewal-rent-suggestion-approvals";
import { projectMessageMarketEvidence } from "@/lib/lease-renewal/message-market-evidence";
import { projectRenewalDeskIdentity } from "@/lib/lease-renewal/desk-identity";
import { loadLiveOwnerCurrentRentDecision } from "@/lib/lease-renewal/live-desk";
import {
  composeRenewalMessage,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
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

/** Read-only assembly. Missing Gmail or publication readiness never prevents body preparation. */
export async function currentRenewalMessage(
  actor: AuthenticatedUser,
  leaseId: string,
  channel: "owner" | "tenant",
  db: Firestore = getAdminFirestore(),
) {
  const config = buildLiveRentVineConfig();
  if (!config.ok)
    throw new EditableLayerError(
      "Live RentVine is unavailable. Saved preparation is retained; refresh when the lease source is available.",
      409,
    );
  const nowMs = Date.now();
  const [views, workspace, resources, publication, retainedSignature] = await Promise.all(
    [
      requireCurrentLeaseViews(config.rentvineClient, nowMs),
      getRenewalWorkspace(actor, leaseId, db),
      getRenewalResourceLocations(actor, db).catch(() => null),
      getSuppliedRenewalPublication(actor, channel, db).catch(() => ({
        ...suppliedRenewalPublication(channel),
        status: "unavailable" as const,
        reason:
          "Current supplied-template publication could not be read. Preparation remains available; Gmail export waits for that readback.",
      })),
      getRetainedSenderSignature(actor, db).catch(() => null),
    ],
  );
  const matching = views.filter((view) => leaseViewId(view) === leaseId);
  if (matching.length !== 1)
    throw new EditableLayerError("The live lease is missing or ambiguous.", 409);
  const lease = matching[0];
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
  const notices: string[] = [];
  let draftJournalAvailable = true;
  const [draftAttempt, previousDraftAttempts] = workspace
    ? await Promise.all([
        getCurrentMessageDraft(actor, leaseId, workspace.cycleId, channel, db),
        getPreviousMessageDrafts(actor, leaseId, workspace.cycleId, channel, db),
      ]).catch(() => {
        draftJournalAvailable = false;
        notices.push(
          "The Gmail attempt history could not be read. Copy remains available; reload history before preparing a new Gmail attempt.",
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
              "The stored comp attachment could not be read. Message copy remains available; the attachment waits for readback.",
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
      "Shared resource settings could not be read. Saved links are not assumed empty; this preparation omits unresolved links.",
    );
  let currentBaseRent: RenewalMessageFacts["currentBaseRent"] = null;
  const renewalConfig = buildLiveRenewalConfig();
  // S120 (R120.2): the current non-rent recurring charges, offered as a deliberate fill source for
  // the tenant charge fields. A failed read is a notice, never an empty inventory.
  let chargeInventory: MessageChargeInventoryLine[] | null = null;
  if (channel === "tenant" && renewalConfig.ok) {
    try {
      const inventory = await loadRenewalChargeInventory(
        renewalConfig.rentvineClient,
        leaseId,
      );
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
    } catch {
      notices.push(
        "The current RentVine recurring charges could not be read. Charge fields stay manual until they are read back.",
      );
    }
  }
  if (channel === "owner" && renewalConfig.ok) {
    try {
      const resolutions = await listResolutionsForRun(actor, "live-review", db);
      const result = await loadLiveOwnerCurrentRentDecision(
        leaseId,
        new Date(nowMs).toISOString(),
        renewalConfig,
        resolutions,
      );
      if (
        result.status === "ok" &&
        result.decision.currentRent !== null &&
        result.decision.currentRentEvidence.currencyState === "fresh" &&
        ["agree", "resolved"].includes(result.decision.currentRentEvidence.agreement)
      ) {
        currentBaseRent = {
          value: result.decision.currentRent,
          source:
            result.decision.currentRentEvidence.resolvedSource ??
            "Fresh RentVine and operating Sheet reconciliation",
        };
      }
    } catch {
      notices.push(
        "Current base-rent reconciliation is unavailable. Other preparation is retained.",
      );
    }
  }
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
  const facts: RenewalMessageFacts = {
    channel,
    names: (channel === "owner" ? identity.owners : identity.tenants).map(
      (value) => value.label,
    ),
    address: identity.address?.label ?? null,
    currentBaseRent,
    leaseEndDate: leaseEndDateIso(lease) ?? null,
    ownerTerms:
      workspace?.ownerResponse?.outcome === "approved_terms" &&
      workspace.ownerResponse.terms
        ? { ...workspace.ownerResponse.terms, source: workspace.ownerResponse.source }
        : null,
    range: marketEvidence.range,
    suggestedRent: marketEvidence.suggestedRent,
    // The provider's measured attributes are retained; no street address is invented when absent.
    comps: (provider?.comps ?? []).map((comp, index) => ({
      address: `Comparable ${index + 1}${comp.bedrooms !== undefined ? `, ${comp.bedrooms} bedrooms` : ""}${comp.distanceMiles !== undefined ? `, ${comp.distanceMiles} miles away` : ""}`,
      rent: comp.rent,
      source: `${provider!.source} retrieved ${provider!.retrievedAt}`,
    })),
    trend: ownerMarket.trend
      ? `Average area rent for ${ownerMarket.trend.zipCode}: ${ownerMarket.trend.firstMonth} ${ownerMarket.trend.firstAverage === undefined ? "(average unavailable)" : `$${ownerMarket.trend.firstAverage.toFixed(2)}`} to ${ownerMarket.trend.lastMonth} ${ownerMarket.trend.lastAverage === undefined ? "(average unavailable)" : `$${ownerMarket.trend.lastAverage.toFixed(2)}`} (RentCast, retrieved ${ownerMarket.trend.retrievedAt.slice(0, 10)}).`
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
    resourceFingerprint: messageResourceFingerprint(resources),
    sourceFingerprint: hashExecutionPreview({
      leaseId,
      channel,
      names: facts.names,
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
  const content = composeRenewalMessage(facts, inputs.edits);
  if (marketEvidence.rangeRequirement) {
    // R118.4: the starting range alone satisfies neither evidence requirement; say which one.
    const entry = content.missing.find((item) => item.field === "range");
    if (entry) entry.message = marketEvidence.rangeRequirement;
    else
      content.missing.push({ field: "range", message: marketEvidence.rangeRequirement });
  }
  if (inputs.compScreenshotReceiptId && !attachment)
    content.missing.push({
      field: "attachment",
      message:
        "The selected screenshot receipt is no longer current. Review its replacement or remove the attachment selection.",
    });
  const needsReview =
    !saved || saved.reviewedSourceFingerprint !== basis.sourceFingerprint;
  const signatureMatchesActor =
    saved?.signatureActorUid === actor.uid &&
    saved.signatureEmail?.toLowerCase() === actor.email.toLowerCase();
  return {
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
    workspace,
    saved,
    inputs,
    facts,
    content,
    basis,
    needsReview,
    signatureMatchesActor,
    publication,
    notices,
  };
}
