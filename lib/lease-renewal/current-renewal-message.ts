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
import { leaseEndDateIso, leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import { projectRenewalDeskIdentity } from "@/lib/lease-renewal/desk-identity";
import { loadLiveOwnerCurrentRentDecision } from "@/lib/lease-renewal/live-desk";
import {
  composeRenewalMessage,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import { usableRenewalResourceUrl } from "@/lib/lease-renewal/resource-locations";
import { ownerDraftMarketFromBasis } from "@/lib/lease-renewal/owner-draft";

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
  const [views, workspace, resources, publication] = await Promise.all([
    requireCurrentLeaseViews(config.rentvineClient, nowMs),
    getRenewalWorkspace(actor, leaseId, db),
    getRenewalResourceLocations(actor, db).catch(() => null),
    getSuppliedRenewalPublication(actor, channel, db).catch(() => ({
      ...suppliedRenewalPublication(channel),
      status: "unavailable" as const,
      reason:
        "Current supplied-template publication could not be read. Preparation remains available; Gmail export waits for that readback.",
    })),
  ]);
  const matching = views.filter((view) => leaseViewId(view) === leaseId);
  if (matching.length !== 1)
    throw new EditableLayerError("The live lease is missing or ambiguous.", 409);
  const lease = matching[0];
  const identity = projectRenewalDeskIdentity(lease);
  const saved = workspace
    ? await getMessagePreparation(actor, leaseId, workspace.cycleId, channel, db)
    : null;
  const inputs = saved?.inputs ?? emptyMessagePreparationInputs();
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
  const rangeSource = market?.provider
    ? ownerMarket.rangeSource
    : workspace?.preparation?.source;
  const link = (id: string) => {
    const entry = resources?.entries[id];
    const url = usableRenewalResourceUrl(entry);
    return url ? { url, source: `renewal-resource:${id}:${entry!.recordedAt}` } : null;
  };
  const provider = market?.provider;
  const signature =
    saved?.signatureEmail && inputs.signature
      ? { ...inputs.signature, email: saved.signatureEmail }
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
    range:
      ownerMarket.rangeLow !== undefined &&
      ownerMarket.rangeHigh !== undefined &&
      rangeSource
        ? { low: ownerMarket.rangeLow, high: ownerMarket.rangeHigh, source: rangeSource }
        : null,
    suggestedRent:
      market?.pmiNumber !== undefined && workspace?.preparation?.source
        ? { value: market.pmiNumber, source: workspace.preparation.source }
        : null,
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
