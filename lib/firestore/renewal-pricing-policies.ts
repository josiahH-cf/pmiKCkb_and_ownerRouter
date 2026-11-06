// S194: one policy catalog/assignment/authority owner, with read-only legacy rule compatibility.
// Every mutation is an app-owned staff operation. It grants no provider or messaging authority.
import { createHash } from "node:crypto";
import { type Firestore, FieldPath } from "firebase-admin/firestore";
import { z } from "zod";
import { can } from "@/lib/auth/roles";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { getAdminFirestore } from "./admin";
import { EditableLayerError } from "./errors";
import { getActiveOwnerPolicyRule } from "./owner-policy-rules";
import {
  RenewalPricingPolicyInputSchema,
  StandingOwnerAgreementInputSchema,
  projectRenewalPricingPolicy,
  type RenewalPricingPolicy,
  type RenewalPricingPolicyInput,
  type StandingOwnerAgreement,
} from "@/lib/lease-renewal/renewal-pricing-policy";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import {
  resolveRenewalPricing,
  type RenewalPricingSnapshot,
  type PricingAssignment,
  type VerifiedPricingLease,
} from "@/lib/lease-renewal/renewal-pricing-policy";
export type {
  PricingAssignment,
  VerifiedPricingLease,
} from "@/lib/lease-renewal/renewal-pricing-policy";
import { canonicalJson } from "@/lib/execution/preview-hash";
import {
  PricingBasisChoiceSchema,
  StandingAgreementInputSchema,
  type StandingAgreement,
} from "@/lib/lease-renewal/standing-agreement";
export const RENEWAL_PRICING_COLLECTIONS = {
  policies: "renewal_pricing_policies",
  versions: "renewal_pricing_policy_versions",
  assignments: "renewal_pricing_assignments",
  agreements: "renewal_standing_owner_agreements",
  agreementVersions: "renewal_standing_owner_agreement_versions",
  // S250: standing agreements set once per owner portfolio, with every recorded version kept.
  standingAgreements: "renewal_standing_agreements",
  standingAgreementVersions: "renewal_standing_agreement_versions",
  operations: "renewal_pricing_operations",
  activity: "owner_policy_rule_activity",
} as const;
const id = z.string().regex(/^[1-9]\d{0,9}$/);
export const PricingAssignmentInputSchema = z
  .object({
    scope: z.enum(["portfolio", "lease"]),
    sourceId: id,
    policyId: z.string().uuid().nullable(),
    expectedVersion: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
/**
 * S250 R-S250-3: the pricing basis chosen on the lease or for the owner's whole portfolio, in one
 * save with an optional reason. "clear" removes the choice at that scope (a lease's removal
 * reveals the portfolio default, BEH-S250-2).
 */
export const PricingBasisInputSchema = z
  .object({
    scope: z.enum(["portfolio", "lease"]),
    sourceId: id,
    choice: z.union([
      PricingBasisChoiceSchema,
      z.object({ kind: z.literal("clear") }).strict(),
    ]),
    expectedVersion: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();
export const STANDING_BASIS_DEFAULT_REASON = "Pricing basis chosen on the lease";
export interface PricingSourceVerifier {
  lease(leaseId: string): Promise<VerifiedPricingLease>;
  portfolio(portfolioId: string): Promise<boolean>;
  /**
   * S250 R-S250-2: the owner names RentVine reports for the portfolio's current leases, so staff
   * recognize it; the numeric id stays the stored reference. Never used to infer a portfolio.
   */
  portfolioOwners?(portfolioId: string): Promise<readonly string[]>;
}
function hash(v: unknown) {
  return createHash("sha256").update(canonicalJson(v)).digest("hex");
}
function assertActor(
  a: AuthenticatedUser,
  capability: "read" | "edit" | "manageAdmin",
  write = false,
) {
  if (
    a.hd !== "pmikcmetro.com" ||
    !a.email.toLowerCase().endsWith("@pmikcmetro.com") ||
    !hasSpaceAccess(a, "renewals") ||
    !can(a.role, capability) ||
    (write && isVerificationAccount(a))
  )
    throw new EditableLayerError(
      "Current managed staff authority in Renewals is required.",
      403,
    );
  if (write) assertMutationAllowed(requireEnvironmentDescriptor());
}
/** S250: the pricing basis fields an assignment keeps when its policy changes. */
function standingFields(
  old: FirebaseFirestore.DocumentSnapshot,
): Pick<
  PricingAssignment,
  "standing" | "standingRecordedByUid" | "standingRecordedAt" | "standingReason"
> {
  if (!old.exists) return {};
  const value = old.data() as PricingAssignment;
  return {
    ...(value.standing !== undefined ? { standing: value.standing } : {}),
    ...(value.standingRecordedByUid
      ? { standingRecordedByUid: value.standingRecordedByUid }
      : {}),
    ...(value.standingRecordedAt ? { standingRecordedAt: value.standingRecordedAt } : {}),
    ...(value.standingReason ? { standingReason: value.standingReason } : {}),
  };
}
/** S250: one stored standing agreement version, validated. */
function parseStandingAgreement(raw: Record<string, unknown>): StandingAgreement {
  const { version, recordedByUid, recordedAt, ...input } = raw;
  const parsed = StandingAgreementInputSchema.parse(input);
  if (
    !Number.isSafeInteger(version) ||
    (version as number) < 1 ||
    typeof recordedByUid !== "string" ||
    typeof recordedAt !== "string"
  )
    throw new EditableLayerError("A standing agreement version needs review.", 409);
  return {
    ...parsed,
    version: version as number,
    recordedByUid,
    recordedAt,
  };
}
function conflict(): never {
  throw new EditableLayerError(
    "This policy or assignment changed. Your input is kept; reload its current version before saving.",
    409,
  );
}
export class RenewalPricingPolicyStore {
  constructor(
    readonly db: Firestore = getAdminFirestore(),
    readonly now: () => string = () => new Date().toISOString(),
  ) {}
  private async command<T>(
    a: AuthenticatedUser,
    key: string,
    operationId: string,
    request: unknown,
    apply: (tx: FirebaseFirestore.Transaction, at: string) => Promise<T>,
  ): Promise<T> {
    const op = this.db
      .collection(RENEWAL_PRICING_COLLECTIONS.operations)
      .doc(hash([a.uid, key, operationId]));
    const requestHash = hash(request);
    return this.db.runTransaction(async (tx) => {
      const prior = await tx.get(op);
      if (prior.exists) {
        if (prior.get("requestHash") !== requestHash) conflict();
        return prior.get("result") as T;
      }
      const at = this.now();
      const result = await apply(tx, at);
      tx.create(op, { actorUid: a.uid, key, requestHash, result, recordedAt: at });
      tx.create(
        this.db
          .collection(RENEWAL_PRICING_COLLECTIONS.activity)
          .doc(hash([a.uid, key, operationId, "audit"])),
        { action: key, actor_uid: a.uid, request_hash: requestHash, created_at: at },
      );
      return result;
    });
  }
  async savePolicy(
    a: AuthenticatedUser,
    input: RenewalPricingPolicyInput,
    expectedVersion: number,
    operationId: string,
  ) {
    assertActor(a, "manageAdmin", true);
    const parsed = RenewalPricingPolicyInputSchema.parse(input);
    z.number().int().nonnegative().parse(expectedVersion);
    z.string().uuid().parse(operationId);
    return this.command(
      a,
      `policy:${parsed.id}`,
      operationId,
      { parsed, expectedVersion },
      async (tx, at) => {
        const ref = this.db
          .collection(RENEWAL_PRICING_COLLECTIONS.policies)
          .doc(parsed.id);
        const old = await tx.get(ref);
        if ((old.exists ? old.get("version") : 0) !== expectedVersion) conflict();
        const next: RenewalPricingPolicy = {
          ...parsed,
          version: expectedVersion + 1,
          updatedByUid: a.uid,
          updatedAt: at,
        };
        tx.set(ref, next);
        tx.create(
          this.db
            .collection(RENEWAL_PRICING_COLLECTIONS.versions)
            .doc(`${parsed.id}_${next.version}`),
          { ...next, policyId: parsed.id },
        );
        return next;
      },
    );
  }
  async list(a: AuthenticatedUser, after: string | null = null) {
    assertActor(a, "read");
    const q = this.db
      .collection(RENEWAL_PRICING_COLLECTIONS.policies)
      .orderBy(FieldPath.documentId());
    const page = await (after ? q.startAfter(after) : q).limit(50).get();
    return {
      policies: page.docs.map((d) => d.data() as RenewalPricingPolicy),
      cursor: page.size === 50 ? page.docs.at(-1)!.id : null,
    };
  }
  async policy(a: AuthenticatedUser, policyId: string) {
    assertActor(a, "read");
    z.string().uuid().parse(policyId);
    const d = await this.db
      .collection(RENEWAL_PRICING_COLLECTIONS.policies)
      .doc(policyId)
      .get();
    return d.exists ? (d.data() as RenewalPricingPolicy) : null;
  }
  /** S250 R-S250-7: one recorded version of a policy (every version is kept), or null. */
  async policyVersion(a: AuthenticatedUser, policyId: string, version: number) {
    assertActor(a, "read");
    z.string().uuid().parse(policyId);
    z.number().int().positive().parse(version);
    const d = await this.db
      .collection(RENEWAL_PRICING_COLLECTIONS.versions)
      .doc(`${policyId}_${version}`)
      .get();
    if (!d.exists) return null;
    const { policyId: _, ...policy } = d.data()!;
    void _;
    return policy as RenewalPricingPolicy;
  }
  async assignment(a: AuthenticatedUser, scope: "portfolio" | "lease", sourceId: string) {
    assertActor(a, "read");
    id.parse(sourceId);
    const doc = await this.db
      .collection(RENEWAL_PRICING_COLLECTIONS.assignments)
      .doc(`${scope}_${sourceId}`)
      .get();
    return doc.exists ? (doc.data() as PricingAssignment) : null;
  }
  async assign(
    a: AuthenticatedUser,
    raw: z.input<typeof PricingAssignmentInputSchema>,
    verify: PricingSourceVerifier,
  ) {
    const input = PricingAssignmentInputSchema.parse(raw);
    assertActor(a, input.scope === "portfolio" ? "manageAdmin" : "edit", true);
    if (input.scope === "portfolio") {
      if (!(await verify.portfolio(input.sourceId)))
        throw new EditableLayerError(
          "The portfolio does not resolve against current source membership.",
          409,
        );
    } else await verify.lease(input.sourceId);
    return this.command(
      a,
      `assignment:${input.scope}:${input.sourceId}`,
      input.operationId,
      input,
      async (tx, at) => {
        const ref = this.db
          .collection(RENEWAL_PRICING_COLLECTIONS.assignments)
          .doc(`${input.scope}_${input.sourceId}`);
        const [old, policy] = await Promise.all([
          tx.get(ref),
          input.policyId
            ? tx.get(
                this.db
                  .collection(RENEWAL_PRICING_COLLECTIONS.policies)
                  .doc(input.policyId),
              )
            : Promise.resolve(null),
        ]);
        if ((old.exists ? old.get("version") : 0) !== input.expectedVersion) conflict();
        if (input.policyId && !policy?.exists)
          throw new EditableLayerError("The selected policy no longer exists.", 409);
        const next: PricingAssignment = {
          scope: input.scope,
          sourceId: input.sourceId,
          policyId: input.policyId,
          version: input.expectedVersion + 1,
          selectedPolicyVersion: policy?.get("version") ?? null,
          reason: input.reason,
          recordedByUid: a.uid,
          recordedAt: at,
          // S250: a policy assignment keeps the pricing basis chosen at the same scope.
          ...standingFields(old),
        };
        tx.set(ref, next);
        return next;
      },
    );
  }
  /**
   * S250 R-S250-3 / ARCH-S250-3: apply an existing standing agreement, or "Owner decides each
   * renewal", to this lease only or to every lease in the owner's portfolio, in one save with an
   * optional reason and one audit entry. It writes the same assignment the policy panel reads; it
   * sends nothing, changes no RentVine rent and records no owner response (AC-S250-3). Editors
   * apply and remove agreements; only an Admin creates or changes one.
   */
  async applyPricingBasis(
    a: AuthenticatedUser,
    raw: z.input<typeof PricingBasisInputSchema>,
    verify: PricingSourceVerifier,
  ) {
    const input = PricingBasisInputSchema.parse(raw);
    assertActor(a, "edit", true);
    let portfolioId: string;
    if (input.scope === "portfolio") {
      if (!(await verify.portfolio(input.sourceId)))
        throw new EditableLayerError(
          "The portfolio does not resolve against current source membership.",
          409,
        );
      portfolioId = input.sourceId;
    } else portfolioId = (await verify.lease(input.sourceId)).portfolioId;
    return this.command(
      a,
      `basis:${input.scope}:${input.sourceId}`,
      input.operationId,
      input,
      async (tx, at) => {
        const ref = this.db
          .collection(RENEWAL_PRICING_COLLECTIONS.assignments)
          .doc(`${input.scope}_${input.sourceId}`);
        const [old, agreement] = await Promise.all([
          tx.get(ref),
          input.choice.kind === "agreement"
            ? tx.get(
                this.db
                  .collection(RENEWAL_PRICING_COLLECTIONS.standingAgreements)
                  .doc(input.choice.agreementId),
              )
            : Promise.resolve(null),
        ]);
        if ((old.exists ? old.get("version") : 0) !== input.expectedVersion) conflict();
        if (agreement) {
          if (!agreement.exists)
            throw new EditableLayerError("The chosen agreement no longer exists.", 409);
          const recorded = agreement.data() as StandingAgreement;
          if (recorded.revoked)
            throw new EditableLayerError(
              "This agreement is revoked. Choose another pricing basis.",
              409,
            );
          // R-S250-2: an agreement applies only inside its own owner's verified portfolio.
          if (recorded.portfolioId !== portfolioId)
            throw new EditableLayerError(
              "This agreement belongs to another owner's portfolio.",
              409,
            );
        }
        const reason = input.reason?.trim() || STANDING_BASIS_DEFAULT_REASON;
        const prior = old.exists ? (old.data() as PricingAssignment) : null;
        const next: PricingAssignment = {
          scope: input.scope,
          sourceId: input.sourceId,
          policyId: prior?.policyId ?? null,
          version: input.expectedVersion + 1,
          selectedPolicyVersion: prior?.selectedPolicyVersion ?? null,
          reason: prior?.reason ?? reason,
          recordedByUid: prior?.recordedByUid ?? a.uid,
          recordedAt: prior?.recordedAt ?? at,
          standing: input.choice.kind === "clear" ? null : input.choice,
          standingRecordedByUid: a.uid,
          standingRecordedAt: at,
          standingReason: reason,
        };
        tx.set(ref, next);
        return next;
      },
    );
  }
  /**
   * S250 R-S250-1: record or change one standing agreement (Admin only). Every save keeps the
   * earlier versions; the portfolio is verified against the current RentVine read, never a name.
   */
  async saveStandingAgreement(
    a: AuthenticatedUser,
    raw: z.input<typeof StandingAgreementInputSchema>,
    expectedVersion: number,
    operationId: string,
    verify: PricingSourceVerifier,
  ) {
    assertActor(a, "manageAdmin", true);
    const input = StandingAgreementInputSchema.parse(raw);
    z.number().int().nonnegative().parse(expectedVersion);
    z.string().uuid().parse(operationId);
    if (!(await verify.portfolio(input.portfolioId)))
      throw new EditableLayerError(
        "The portfolio does not resolve against current source membership.",
        409,
      );
    return this.command(
      a,
      `standing:${input.id}`,
      operationId,
      { input, expectedVersion },
      async (tx, at) => {
        const ref = this.db
          .collection(RENEWAL_PRICING_COLLECTIONS.standingAgreements)
          .doc(input.id);
        const [old, policy] = await Promise.all([
          tx.get(ref),
          tx.get(
            this.db.collection(RENEWAL_PRICING_COLLECTIONS.policies).doc(input.policyId),
          ),
        ]);
        if ((old.exists ? old.get("version") : 0) !== expectedVersion) conflict();
        if (!policy.exists)
          throw new EditableLayerError(
            "The agreement's pricing rule does not exist.",
            409,
          );
        if (old.exists && old.get("portfolioId") !== input.portfolioId)
          throw new EditableLayerError(
            "An agreement keeps its portfolio. Record a new agreement for another portfolio.",
            409,
          );
        const next: StandingAgreement = {
          ...input,
          version: expectedVersion + 1,
          recordedByUid: a.uid,
          recordedAt: at,
        };
        tx.set(ref, next);
        tx.create(
          this.db
            .collection(RENEWAL_PRICING_COLLECTIONS.standingAgreementVersions)
            .doc(`${input.id}_${next.version}`),
          { ...next, agreementId: input.id },
        );
        return next;
      },
    );
  }
  /** S250: the recorded standing agreements, for one portfolio or all (bounded). */
  async standingAgreements(a: AuthenticatedUser, portfolioId: string | null = null) {
    assertActor(a, "read");
    if (portfolioId !== null) id.parse(portfolioId);
    const base = this.db.collection(RENEWAL_PRICING_COLLECTIONS.standingAgreements);
    const rows = await (portfolioId ? base.where("portfolioId", "==", portfolioId) : base)
      .limit(101)
      .get();
    if (rows.size > 100)
      throw new EditableLayerError("Standing agreements need a bounded review.", 409);
    return rows.docs.map((d) => parseStandingAgreement(d.data()));
  }
  /** S250: every recorded version of one standing agreement, newest first. */
  async standingAgreementHistory(a: AuthenticatedUser, agreementId: string) {
    assertActor(a, "read");
    z.string().uuid().parse(agreementId);
    const rows = await this.db
      .collection(RENEWAL_PRICING_COLLECTIONS.standingAgreementVersions)
      .where("agreementId", "==", agreementId)
      .limit(101)
      .get();
    return rows.docs
      .map((d) => {
        const { agreementId: _, ...value } = d.data();
        void _;
        return parseStandingAgreement(value);
      })
      .sort((left, right) => right.version - left.version);
  }
  async saveAgreement(
    a: AuthenticatedUser,
    raw: z.input<typeof StandingOwnerAgreementInputSchema>,
    expectedVersion: number,
    operationId: string,
    verify: PricingSourceVerifier,
  ) {
    assertActor(a, "manageAdmin", true);
    const input = StandingOwnerAgreementInputSchema.parse(raw);
    z.number().int().nonnegative().parse(expectedVersion);
    z.string().uuid().parse(operationId);
    const facts: VerifiedPricingLease[] = [];
    for (const leaseId of input.leaseIds) facts.push(await verify.lease(leaseId));
    if (
      facts.some(
        (f) => f.portfolioId !== input.portfolioId || f.cycleDate !== input.cycleDate,
      )
    )
      throw new EditableLayerError(
        "Agreement membership or cycle does not match current source evidence.",
        409,
      );
    return this.command(
      a,
      `agreement:${input.id}`,
      operationId,
      { input, expectedVersion },
      async (tx, at) => {
        const ref = this.db
          .collection(RENEWAL_PRICING_COLLECTIONS.agreements)
          .doc(input.id);
        const [old, p] = await Promise.all([
          tx.get(ref),
          tx.get(
            this.db.collection(RENEWAL_PRICING_COLLECTIONS.policies).doc(input.policyId),
          ),
        ]);
        if ((old.exists ? old.get("version") : 0) !== expectedVersion) conflict();
        if (!p.exists || p.get("version") !== input.policyVersion) conflict();
        const policy = p.data() as RenewalPricingPolicy;
        if (
          !input.revoked &&
          facts.some(
            (f) =>
              projectRenewalPricingPolicy(
                policy,
                f.currentRent,
                businessDateIso(new Date(at)),
              ).amount !== input.terms.rent,
          )
        )
          throw new EditableLayerError(
            "The agreement amount is outside this policy's current source-based proposal.",
            409,
          );
        const next: StandingOwnerAgreement = {
          ...input,
          version: expectedVersion + 1,
          recordedByUid: a.uid,
          recordedAt: at,
        };
        tx.set(ref, next);
        tx.create(
          this.db
            .collection(RENEWAL_PRICING_COLLECTIONS.agreementVersions)
            .doc(`${input.id}_${next.version}`),
          next,
        );
        return next;
      },
    );
  }
  /**
   * S250 R-S250-9: every recorded S194 exact per-cycle agreement (its current version), for the
   * Admin list beside the standing agreements. Bounded; a read past the bound asks for review.
   */
  async allExactAgreements(a: AuthenticatedUser) {
    assertActor(a, "read");
    const rows = await this.db
      .collection(RENEWAL_PRICING_COLLECTIONS.agreements)
      .limit(101)
      .get();
    if (rows.size > 100)
      throw new EditableLayerError("Agreement history needs a bounded review.", 409);
    return rows.docs.map((d) => d.data() as StandingOwnerAgreement);
  }
  async agreements(a: AuthenticatedUser, leaseId: string) {
    assertActor(a, "read");
    id.parse(leaseId);
    const rows = await this.db
      .collection(RENEWAL_PRICING_COLLECTIONS.agreements)
      .where("leaseIds", "array-contains", leaseId)
      .limit(101)
      .get();
    if (rows.size > 100)
      throw new EditableLayerError("Agreement history needs a bounded review.", 409);
    return rows.docs.map((d) => d.data() as StandingOwnerAgreement);
  }

  /** Resolve only actual visible source IDs; no portfolio scan or per-lease policy lookup. */
  async snapshot(
    a: AuthenticatedUser,
    facts: readonly VerifiedPricingLease[],
  ): Promise<RenewalPricingSnapshot> {
    assertActor(a, "read");
    if (facts.length > 2000)
      throw new EditableLayerError("Pricing scope exceeds this bounded read.", 409);
    for (const f of facts) {
      id.parse(f.leaseId);
      id.parse(f.portfolioId);
    }
    const leases = [...new Set(facts.map((f) => f.leaseId))],
      portfolios = [...new Set(facts.map((f) => f.portfolioId))];
    const refs = [
      ...leases.map((v) => `lease_${v}`),
      ...portfolios.map((v) => `portfolio_${v}`),
    ].map((v) => this.db.collection(RENEWAL_PRICING_COLLECTIONS.assignments).doc(v));
    const assignments: PricingAssignment[] = [];
    for (let at = 0; at < refs.length; at += 100) {
      const rows = await this.db.getAll(...refs.slice(at, at + 100));
      for (const d of rows)
        if (d.exists) {
          const v = d.data() as PricingAssignment;
          PricingAssignmentInputSchema.omit({
            operationId: true,
            expectedVersion: true,
          }).parse({
            scope: v.scope,
            sourceId: v.sourceId,
            policyId: v.policyId,
            reason: v.reason,
          });
          if (
            !Number.isSafeInteger(v.version) ||
            v.version < 1 ||
            typeof v.recordedByUid !== "string" ||
            typeof v.recordedAt !== "string" ||
            (v.selectedPolicyVersion !== null &&
              (!Number.isSafeInteger(v.selectedPolicyVersion) ||
                v.selectedPolicyVersion < 1)) ||
            // S250: a recorded pricing basis is a known choice, or none.
            !PricingBasisChoiceSchema.nullable().optional().safeParse(v.standing).success
          )
            throw new EditableLayerError("An assignment version needs review.", 409);
          assignments.push(v);
        }
    }
    // S250: the standing agreements a basis choice names, read by their stored ids only.
    const standingIds = [
      ...new Set(
        assignments.flatMap((v) =>
          v.standing?.kind === "agreement" ? [v.standing.agreementId] : [],
        ),
      ),
    ];
    const standingAgreements: StandingAgreement[] = [];
    for (let at = 0; at < standingIds.length; at += 100) {
      const rows = await this.db.getAll(
        ...standingIds
          .slice(at, at + 100)
          .map((value) =>
            this.db.collection(RENEWAL_PRICING_COLLECTIONS.standingAgreements).doc(value),
          ),
      );
      for (const d of rows)
        if (d.exists) standingAgreements.push(parseStandingAgreement(d.data()!));
    }
    const policyIds = [
      ...new Set([
        ...assignments.flatMap((a) => (a.policyId ? [a.policyId] : [])),
        ...standingAgreements.map((g) => g.policyId),
      ]),
    ];
    const policies: RenewalPricingPolicy[] = [],
      agreements = new Map<string, StandingOwnerAgreement>();
    for (let at = 0; at < policyIds.length; at += 30) {
      const rows = await this.db
        .collection(RENEWAL_PRICING_COLLECTIONS.versions)
        .where("policyId", "in", policyIds.slice(at, at + 30))
        .limit(3001)
        .get();
      if (rows.size > 3000)
        throw new EditableLayerError("Policy history exceeds the bounded reader.", 409);
      for (const d of rows.docs) {
        const { policyId: _, ...p } = d.data();
        void _;
        const { version, updatedByUid, updatedAt, ...input } = p;
        RenewalPricingPolicyInputSchema.parse(input);
        if (
          !Number.isSafeInteger(version) ||
          version < 1 ||
          typeof updatedByUid !== "string" ||
          typeof updatedAt !== "string"
        )
          throw new EditableLayerError("A policy version needs review.", 409);
        policies.push(p as RenewalPricingPolicy);
      }
    }
    for (const policyId of policyIds)
      if (policies.filter((p) => p.id === policyId).length > 100)
        throw new EditableLayerError("Policy history needs a bounded review.", 409);
    for (let at = 0; at < leases.length; at += 30) {
      const rows = await this.db
        .collection(RENEWAL_PRICING_COLLECTIONS.agreements)
        .where("leaseIds", "array-contains-any", leases.slice(at, at + 30))
        .limit(1001)
        .get();
      if (rows.size > 1000)
        throw new EditableLayerError(
          "Agreement history exceeds the bounded reader.",
          409,
        );
      for (const d of rows.docs) {
        const g = d.data();
        const { version, recordedByUid, recordedAt, ...input } = g;
        StandingOwnerAgreementInputSchema.parse(input);
        if (
          !Number.isSafeInteger(version) ||
          version < 1 ||
          typeof recordedByUid !== "string" ||
          typeof recordedAt !== "string"
        )
          throw new EditableLayerError("An agreement version needs review.", 409);
        agreements.set(d.id, g as StandingOwnerAgreement);
      }
    }
    for (const leaseId of leases)
      if (
        [...agreements.values()].filter((g) => g.leaseIds.includes(leaseId)).length > 100
      )
        throw new EditableLayerError("Agreement history needs a bounded review.", 409);
    const today = businessDateIso(new Date(this.now())),
      legacyPolicies: RenewalPricingSnapshot["legacyPolicies"] = {};
    for (const portfolioId of portfolios) {
      if (
        assignments.some(
          (a) => a.scope === "portfolio" && a.sourceId === portfolioId && a.policyId,
        )
      )
        continue;
      const legacy = await getActiveOwnerPolicyRule(a, portfolioId, today, this.db);
      if (!legacy) continue;
      const h = hash(["legacy-renewal-policy", portfolioId]);
      const legacyId = `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
      legacyPolicies[portfolioId] = {
        id: legacyId,
        version: 1,
        name: `Portfolio ${portfolioId} legacy rule`,
        kind: "percentage",
        value: legacy.percent,
        effectiveFrom: legacy.effectiveFrom,
        effectiveThrough: null,
        enabled: true,
        purpose: legacy.note || "Legacy pricing rule",
        updatedByUid: legacy.updatedByUid,
        updatedAt: legacy.updatedAt ?? "",
      };
    }
    return {
      assignments,
      policies,
      agreements: [...agreements.values()],
      legacyPolicies,
      standingAgreements,
    };
  }
  async resolve(
    a: AuthenticatedUser,
    f: VerifiedPricingLease,
    terms: StandingOwnerAgreement["terms"] | null,
    /** S250: the working renewal rent (null when untouched). */
    workingRent: number | null = terms?.rent ?? null,
  ) {
    return resolveRenewalPricing(
      await this.snapshot(a, [f]),
      f,
      terms,
      businessDateIso(new Date(this.now())),
      { workingRent },
    );
  }
}
