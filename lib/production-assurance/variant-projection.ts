import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { RenewalWorkspaceState } from "../lease-renewal/workspace-state";
import type { IndependentManualRenewal } from "./manual-renewal-projection";
import {
  NO_INDEPENDENT_OUTREACH_FILL,
  type IndependentOutreachFill,
} from "./outreach-evidence-projection";

// S250 / S251 independent oracle for the variant facts a desk row's staff lane depends on: an
// owner's standing agreement chosen as a lease's pricing basis, and the lease's Housing assistance
// fact. It reads the stored documents itself (independent collection literals and its own
// arithmetic) and never imports the application's coverage, summary or cohort.

/** The guidance contract marker of a desk row that renders the S250/S251 variant rules. */
export const INDEPENDENT_VARIANTS_CONTRACT_MARKER = "s251-variants";

const COLLECTIONS = {
  assignments: "renewal_pricing_assignments",
  policyVersions: "renewal_pricing_policy_versions",
  standingAgreements: "renewal_standing_agreements",
  exactAgreements: "renewal_standing_owner_agreements",
  workingRecords: "lease_renewal_working_records",
  olderRules: "owner_policy_rules",
} as const;

/** S251 R-S251-10: wording that names housing assistance; a suggestion only, never a skip. */
const HOUSING_ASSISTANCE_WORDS =
  /section\s?8|voucher|\bhap\b|housing assistance|housing choice/i;

/**
 * The S251 program skip signal: the first present program field reads "program" or "padsplit"
 * and does not name housing assistance. The owner-hold words keep their meaning.
 */
export function independentVariantSkipSignal(
  lease: Readonly<Record<string, unknown>>,
): boolean {
  // The first field that is present: only a missing value, null or a blank string is passed over
  // (an empty list or a number is present, as the cohort reads it).
  const first = (keys: readonly string[]): string | null => {
    for (const key of keys) {
      const value = lease[key];
      if (
        value !== undefined &&
        value !== null &&
        !(typeof value === "string" && value.trim() === "")
      )
        return String(value).toLowerCase();
    }
    return null;
  };
  const hold = first(["status", "leaseStatus", "note", "notes", "tags"]);
  if (
    hold !== null &&
    ["owner authorized", "owner hold", "owner approved", "let renew"].some((word) =>
      hold.includes(word),
    )
  )
    return true;
  const program = first([
    "program",
    "programName",
    "leaseType",
    "leaseTypeName",
    "tags",
    "status",
  ]);
  return (
    program !== null &&
    (program.includes("program") || program.includes("padsplit")) &&
    !HOUSING_ASSISTANCE_WORDS.test(program)
  );
}

type Raw = Readonly<Record<string, unknown>>;
const asRecord = (value: unknown): Raw | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null;
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

/** The stored documents the variant expectation reads, by their own keys. */
export interface IndependentVariantDocuments {
  /** Assignment documents by id (`lease_{id}` or `portfolio_{id}`). */
  readonly assignments: ReadonlyMap<string, Raw>;
  readonly standingAgreements: ReadonlyMap<string, Raw>;
  /** Every stored policy version. */
  readonly policyVersions: readonly Raw[];
  /** S194 exact agreements (current heads), for their own coverage and the conflict rule. */
  readonly exactAgreements: readonly Raw[];
  /** Working record heads by lease id. */
  readonly workingRecords: ReadonlyMap<string, Raw>;
  /**
   * The older (S62) portfolio rules by document id (the portfolio id): a portfolio with no policy
   * assignment proposes from its rule, which is the policy an S194 exact agreement is checked
   * against there. Absent reads as none recorded.
   */
  readonly olderRules?: ReadonlyMap<string, Raw>;
}

export async function readIndependentVariantDocuments(
  firestore: Firestore,
): Promise<IndependentVariantDocuments> {
  const [assignments, standing, policies, exact, working, older] = await Promise.all(
    [
      COLLECTIONS.assignments,
      COLLECTIONS.standingAgreements,
      COLLECTIONS.policyVersions,
      COLLECTIONS.exactAgreements,
      COLLECTIONS.workingRecords,
      COLLECTIONS.olderRules,
    ].map((name) => firestore.collection(name).get()),
  );
  const workingRecords = new Map<string, Raw>();
  for (const document of working!.docs) {
    const value = document.data();
    const leaseId = text(value.leaseId);
    if (!leaseId || workingRecords.has(leaseId))
      throw new Error("independent_working_record_read_invalid");
    workingRecords.set(leaseId, value);
  }
  return {
    assignments: new Map(assignments!.docs.map((d) => [d.id, d.data()])),
    standingAgreements: new Map(standing!.docs.map((d) => [d.id, d.data()])),
    policyVersions: policies!.docs.map((d) => d.data()),
    exactAgreements: exact!.docs.map((d) => d.data()),
    workingRecords,
    olderRules: new Map(older!.docs.map((d) => [d.id, d.data()])),
  };
}

/** The lease facts the variant expectation reads from RentVine, independently. */
export interface IndependentVariantLease {
  readonly leaseId: string;
  /** The lease's portfolio id when the RentVine read verifies exactly one; else null. */
  readonly portfolioId: string | null;
  readonly currentRent: number | null;
  /** The RentVine lease end date, the cycle an S194 exact agreement names. */
  readonly cycleDate: string | null;
}

/** S251: the Housing assistance Yes fact's program from the working record, or null. */
export function independentHousingAssistance(
  workingRecord: Raw | null | undefined,
): string | null {
  const field = asRecord(asRecord(workingRecord?.fields)?.housing_assistance);
  const value = asRecord(field?.value);
  return value?.status === "yes" ? text(value.program) : null;
}

function workingRent(workingRecord: Raw | null | undefined): number | null {
  const value = asRecord(asRecord(workingRecord?.fields)?.terms_rent)?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A policy's newest stored version whose start date has come (the app's selection rule). */
function newestStartedVersion(
  versions: readonly Raw[],
  policyId: string,
  today: string,
): Raw | undefined {
  return versions
    .filter(
      (entry) =>
        entry.id === policyId &&
        typeof entry.effectiveFrom === "string" &&
        entry.effectiveFrom <= today,
    )
    .sort((left, right) => Number(right.version) - Number(left.version))[0];
}

/** The rule's rent: the policy's newest version in effect today, rounded to whole dollars. */
function ruleRent(
  versions: readonly Raw[],
  policyId: string,
  currentRent: number | null,
  today: string,
): number | null {
  const policy = newestStartedVersion(versions, policyId, today);
  return policy ? policyRent(policy, currentRent, today) : null;
}

/** One policy version's rent for the current rent, or null when it gives none today. */
function policyRent(policy: Raw, currentRent: number | null, today: string): number | null {
  const through = policy.effectiveThrough;
  if (
    policy.enabled !== true ||
    (typeof through === "string" && through !== "" && through < today) ||
    !Number.isSafeInteger(policy.version) ||
    Number(policy.version) < 1 ||
    policy.kind === "manual_review" ||
    currentRent === null ||
    !(currentRent > 0)
  )
    return null;
  const value = Number(policy.value ?? 0);
  const amount = Math.round(
    policy.kind === "percentage"
      ? currentRent * (1 + value / 100)
      : policy.kind === "fixed_dollar"
        ? currentRent + value
        : policy.kind === "no_increase"
          ? currentRent
          : Number.NaN,
  );
  return Number.isFinite(amount) && amount > 0 && amount <= 1_000_000 ? amount : null;
}

/**
 * S250: whether a standing agreement chosen as the lease's pricing basis covers it today. The
 * lease's own choice wins over its portfolio's; the agreement must be in effect with the owner's
 * pre-approval, belong to the lease's verified portfolio, give a rent by its rule, conflict with no
 * current exact agreement for a different rent, and the working rent must be untouched or equal it.
 */
export function independentStandingCovered(
  lease: IndependentVariantLease,
  documents: IndependentVariantDocuments,
  today: string,
): boolean {
  const choiceOf = (id: string) =>
    asRecord(asRecord(documents.assignments.get(id))?.standing);
  const choice =
    choiceOf(`lease_${lease.leaseId}`) ??
    (lease.portfolioId ? choiceOf(`portfolio_${lease.portfolioId}`) : null);
  if (choice?.kind !== "agreement") return false;
  const agreementId = text(choice.agreementId);
  const agreement = agreementId
    ? documents.standingAgreements.get(agreementId)
    : undefined;
  if (!agreement || !lease.portfolioId) return false;
  const effectiveFrom = text(agreement.effectiveFrom);
  const endsOn = agreement.endsOn;
  if (
    !text(agreement.preApprovalStatement) ||
    agreement.revoked !== false ||
    !effectiveFrom ||
    effectiveFrom > today ||
    (typeof endsOn === "string" && endsOn < today) ||
    agreement.portfolioId !== lease.portfolioId ||
    !Number.isSafeInteger(agreement.version) ||
    Number(agreement.version) < 1
  )
    return false;
  const rent = ruleRent(
    documents.policyVersions,
    String(agreement.policyId ?? ""),
    lease.currentRent,
    today,
  );
  if (rent === null) return false;
  const conflict = documents.exactAgreements.some((entry) => {
    const terms = asRecord(entry.terms);
    return (
      Array.isArray(entry.leaseIds) &&
      entry.leaseIds.includes(lease.leaseId) &&
      entry.revoked === false &&
      typeof entry.effectiveFrom === "string" &&
      entry.effectiveFrom <= today &&
      typeof entry.expiresOn === "string" &&
      entry.expiresOn >= today &&
      entry.cycleDate === lease.cycleDate &&
      typeof terms?.rent === "number" &&
      Math.abs(terms.rent - rent) >= 0.005
    );
  });
  if (conflict) return false;
  const working = workingRent(documents.workingRecords.get(lease.leaseId));
  return working === null || Math.abs(working - rent) < 0.005;
}

/** The working record's three renewal terms, when all are saved and in order; else null. */
function completeWorkingTerms(
  workingRecord: Raw | null | undefined,
): { rent: number; effectiveDate: string; endDate: string } | null {
  const fields = asRecord(workingRecord?.fields);
  const rent = asRecord(fields?.terms_rent)?.value;
  const effectiveDate = asRecord(fields?.terms_effective_date)?.value;
  const endDate = asRecord(fields?.terms_end_date)?.value;
  return typeof rent === "number" &&
    typeof effectiveDate === "string" &&
    typeof endDate === "string" &&
    endDate > effectiveDate
    ? { rent, effectiveDate, endDate }
    : null;
}

/**
 * The policy a portfolio's older (S62) rule proposes from when no policy is assigned: a whole
 * percentage of the current rent from its effective date, under the stable id the pricing store
 * gives it (a hash of the portfolio id). An S194 exact agreement is checked against it there.
 */
function independentOlderRulePolicy(
  rule: Raw | undefined,
  portfolioId: string,
  today: string,
): Raw | null {
  if (!rule) return null;
  const percent = rule.percent;
  const effectiveFrom = text(rule.effective_from);
  if (
    text(rule.portfolio_id) === null ||
    rule.kind !== "flat_percent_increase" ||
    typeof percent !== "number" ||
    !Number.isFinite(percent) ||
    percent <= 0 ||
    percent > 100 ||
    !effectiveFrom ||
    effectiveFrom > today.slice(0, 10)
  )
    return null;
  const h = createHash("sha256")
    .update(JSON.stringify(["legacy-renewal-policy", portfolioId]))
    .digest("hex");
  return {
    id: `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`,
    version: 1,
    kind: "percentage",
    value: percent,
    effectiveFrom,
    effectiveThrough: null,
    enabled: true,
  };
}

/**
 * S194: whether the lease's one current exact per-lease, per-cycle agreement covers it. The
 * agreement must be the only current one naming this lease and cycle, belong to the lease's
 * verified portfolio, carry its evidence reference, name the policy version the lease's assignment
 * selects (the lease's own assignment over the portfolio's, else the portfolio's older rule), and
 * the complete working terms must equal both the agreement's terms and the rule's rent.
 */
export function independentExactCovered(
  lease: IndependentVariantLease,
  documents: IndependentVariantDocuments,
  today: string,
): boolean {
  if (!lease.portfolioId || !lease.cycleDate) return false;
  const current = documents.exactAgreements.filter(
    (entry) =>
      Array.isArray(entry.leaseIds) &&
      entry.leaseIds.includes(lease.leaseId) &&
      entry.revoked !== true &&
      typeof entry.effectiveFrom === "string" &&
      entry.effectiveFrom <= today &&
      typeof entry.expiresOn === "string" &&
      entry.expiresOn >= today &&
      entry.cycleDate === lease.cycleDate,
  );
  if (current.length !== 1) return false;
  const agreement = current[0]!;
  const policyOf = (id: string) => text(asRecord(documents.assignments.get(id))?.policyId);
  const selected =
    policyOf(`lease_${lease.leaseId}`) ?? policyOf(`portfolio_${lease.portfolioId}`);
  const policy = selected
    ? newestStartedVersion(documents.policyVersions, selected, today)
    : independentOlderRulePolicy(
        documents.olderRules?.get(lease.portfolioId),
        lease.portfolioId,
        today,
      );
  if (!policy) return false;
  if (
    agreement.portfolioId !== lease.portfolioId ||
    !text(agreement.evidenceRef)?.trim() ||
    agreement.policyId !== policy.id ||
    agreement.policyVersion !== policy.version ||
    !Number.isSafeInteger(agreement.version) ||
    Number(agreement.version) < 1 ||
    !text(agreement.recordedByUid) ||
    !text(agreement.recordedAt)
  )
    return false;
  const rent = policyRent(policy, lease.currentRent, today);
  const terms = completeWorkingTerms(documents.workingRecords.get(lease.leaseId));
  const agreed = asRecord(agreement.terms);
  return (
    rent !== null &&
    terms !== null &&
    rent === terms.rent &&
    agreed?.rent === terms.rent &&
    agreed.effectiveDate === terms.effectiveDate &&
    agreed.endDate === terms.endDate
  );
}

/**
 * The one owner-step coverage the desk reads: S194's exact kind, else S250's standing agreement
 * (the desk's `authority.covered`). Read from the stored records only.
 */
export function independentOwnerStepCovered(
  lease: IndependentVariantLease,
  documents: IndependentVariantDocuments,
  today: string,
): boolean {
  return (
    independentExactCovered(lease, documents, today) ||
    independentStandingCovered(lease, documents, today)
  );
}

/**
 * The cycle an exact agreement is matched against: the RentVine lease end, else the staff
 * record's dated basis (a lease-bound record has none).
 */
export function independentPricingCycleDate(
  rentvineEndDate: string | null | undefined,
  state: Pick<RenewalWorkspaceState, "basis"> | null | undefined,
): string | null {
  if (rentvineEndDate && /^\d{4}-\d{2}-\d{2}$/.test(rentvineEndDate))
    return rentvineEndDate;
  const basis = state?.basis as { kind?: string; dateIso?: unknown } | undefined;
  return basis && basis.kind !== "lease_bound" && typeof basis.dateIso === "string"
    ? basis.dateIso
    : null;
}

const LANE_ORDER = [
  "owner_outreach",
  "tenant_offer",
  "information_form",
  "form_returned",
  "documents",
  "document_delivery",
  "signatures",
  "insurance",
  "rhino",
  "pet",
  "charges",
  "inspection",
  "filter",
  "utilities",
  "assisted_housing",
] as const;
const CONDITIONAL: ReadonlySet<string> = new Set([
  "information_form",
  "form_returned",
  "insurance",
  "rhino",
  "pet",
  "charges",
  "inspection",
  "filter",
  "utilities",
  "assisted_housing",
  "program_contact",
]);
const TERMS_DEPENDENT: ReadonlySet<string> = new Set([
  "tenant_offer",
  "documents",
  "document_delivery",
  "signatures",
  "charges",
  "assisted_housing",
]);

export interface IndependentVariantFacts {
  readonly standingCovered: boolean;
  /** The Housing assistance Yes fact's program, or null. */
  readonly housingAssistance: string | null;
}

function actionStep(next: string): string {
  return ["program_contact", "owner_outreach", "owner_response"].includes(next)
    ? "owner-decision"
    : ["tenant_offer", "tenant_response", "information_form", "form_returned"].includes(
          next,
        )
      ? "tenant-decision"
      : "compliance-close";
}

/**
 * The staff lane under the S251 variant rules, read from the persisted staff record (or none),
 * the oracle's own evidence reading and the variant facts. With neither a record nor a variant a
 * lease has no staff lane here (the unrecorded lane applies as before).
 */
export function projectIndependentVariantManualRenewal(
  state: RenewalWorkspaceState | null,
  variants: IndependentVariantFacts,
  evidence: IndependentOutreachFill = NO_INDEPENDENT_OUTREACH_FILL,
): IndependentManualRenewal | null {
  const assisted = variants.housingAssistance !== null;
  const standing = variants.standingCovered;
  if (!state) {
    if (!assisted && !standing) return null;
    const nextActivity = assisted ? "program_contact" : "tenant_offer";
    return {
      cycleId: "",
      revision: 0,
      complete: false,
      awaitedParty: null,
      pendingSourceUpdates: 0,
      nextActivity,
      actionStepId: actionStep(nextActivity),
      sourceDigest: "",
    };
  }
  const recorded = (key: string) => {
    const entry = state.activities[key as keyof typeof state.activities];
    if (
      !entry ||
      (TERMS_DEPENDENT.has(key) && entry.termsRevision !== state.termsRevision)
    )
      return false;
    return (
      entry.outcome === "done" ||
      (entry.outcome === "not_applicable" && CONDITIONAL.has(key))
    );
  };
  const filled = (key: string) =>
    recorded(key) ||
    (key === "owner_outreach" && evidence.ownerOutreach) ||
    (key === "tenant_offer" && evidence.tenantOffer);
  const done = (key: string) =>
    (key === "owner_outreach" && standing && !assisted) ||
    (key === "assisted_housing" && !assisted) ||
    filled(key);
  const tenant =
    state.tenantResponse?.termsRevision === state.termsRevision
      ? state.tenantResponse
      : null;
  const answer = state.ownerResponse?.outcome as string | undefined;
  const renewing = answer === "renew_tenant" || answer === "approved_terms";
  const rentChoice = (state as { rentChoice?: { choice?: string } | null }).rentChoice
    ?.choice;
  const rentSettled =
    answer === "approved_terms" ||
    rentChoice === "keep_current" ||
    (rentChoice === "propose_change" && standing);
  const ownerAwaited = () =>
    answer === "approved_terms" ||
    answer === "revision_requested" ||
    evidence.ownerReplied
      ? null
      : "owner";
  let nextActivity: string;
  let awaitedParty: "owner" | "tenant" | null = null;
  if (answer === "declined_non_renewal" || tenant?.outcome === "declined_nonrenewing")
    nextActivity = done("non_renewal_handoff") ? "complete" : "non_renewal_handoff";
  else if (assisted && !recorded("program_contact")) nextActivity = "program_contact";
  else if (assisted && !renewing && !filled("owner_outreach"))
    nextActivity = "owner_outreach";
  else if (
    (assisted && !renewing) ||
    (assisted && !rentSettled && rentChoice === "propose_change") ||
    (!assisted && done("owner_outreach") && !standing && answer !== "approved_terms")
  ) {
    nextActivity = "owner_response";
    awaitedParty = ownerAwaited();
  } else if (assisted && !rentSettled) nextActivity = "owner_response";
  else if (!assisted && !done("owner_outreach")) nextActivity = "owner_outreach";
  else if (!done("tenant_offer")) nextActivity = "tenant_offer";
  else if (tenant?.outcome !== "accepted") {
    nextActivity =
      tenant?.outcome === "counter_change_requested"
        ? "owner_response"
        : "tenant_response";
    awaitedParty =
      nextActivity === "tenant_response" &&
      tenant?.outcome !== "needs_verification" &&
      !evidence.tenantReplied
        ? "tenant"
        : null;
  } else nextActivity = LANE_ORDER.find((key) => !done(key)) ?? "complete";
  if (state.completion) {
    nextActivity = "complete";
    awaitedParty = null;
  }
  return {
    cycleId: state.cycleId,
    revision: state.revision,
    complete: !!state.completion,
    awaitedParty,
    pendingSourceUpdates: Object.values(state.sourceUpdates).filter(
      (entry) => entry.state !== "verified",
    ).length,
    nextActivity,
    actionStepId: actionStep(nextActivity),
    sourceDigest: createHash("sha256").update(JSON.stringify(state)).digest("hex"),
  };
}
