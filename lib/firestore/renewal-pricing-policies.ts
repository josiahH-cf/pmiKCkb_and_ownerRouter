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
export const RENEWAL_PRICING_COLLECTIONS = {
  policies: "renewal_pricing_policies",
  versions: "renewal_pricing_policy_versions",
  assignments: "renewal_pricing_assignments",
  agreements: "renewal_standing_owner_agreements",
  agreementVersions: "renewal_standing_owner_agreement_versions",
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
export interface PricingSourceVerifier {
  lease(leaseId: string): Promise<VerifiedPricingLease>;
  portfolio(portfolioId: string): Promise<boolean>;
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
        };
        tx.set(ref, next);
        return next;
      },
    );
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
                v.selectedPolicyVersion < 1))
          )
            throw new EditableLayerError("An assignment version needs review.", 409);
          assignments.push(v);
        }
    }
    const policyIds = [
      ...new Set(assignments.flatMap((a) => (a.policyId ? [a.policyId] : []))),
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
    };
  }
  async resolve(
    a: AuthenticatedUser,
    f: VerifiedPricingLease,
    terms: StandingOwnerAgreement["terms"] | null,
  ) {
    return resolveRenewalPricing(
      await this.snapshot(a, [f]),
      f,
      terms,
      businessDateIso(new Date(this.now())),
    );
  }
}
