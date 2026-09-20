import { describe, expect, it } from "vitest";

import { projectMessageReadiness } from "@/lib/lease-renewal/message-readiness";
import {
  MISSING_POLICY_MATERIAL,
  POLICY_CHECKS_NOT_RUN,
  POLICY_LOGIC_BRANCHES,
  PolicyMaterialConfigSchema,
  evaluatePolicyCondition,
  findConditionReferenceProblem,
  policyMessageGates,
  policyPreparationCurrent,
  preparePolicyOutput,
  projectPolicyApplicability,
  type PolicyFact,
  type PolicyMaterialConfig,
  type PolicyMaterialSnapshot,
} from "@/lib/lease-renewal/policy-content";
import {
  emptyRenewalWorkspace,
  manualRenewalSummary,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

// S131 (F11): every conditional decision is exercised here on unmistakably SYNTHETIC, non-legal
// local fixtures. Nothing here is approved policy, nothing reads a provider, and no fixture value
// is a customer value. Policy-specific wording and real applicability rules stay NOT RUN.

const covered = new Set<string>();
const cover = (branch: (typeof POLICY_LOGIC_BRANCHES)[number]) => covered.add(branch);

const HASH = "a".repeat(64);
const TODAY = "2026-09-20";
const snapshot = (
  state: "none" | "pending_only" | "ambiguous" | "unreadable",
  pendingVersions: string[] = [],
): PolicyMaterialSnapshot => ({
  state,
  active: null,
  activeRevision: null,
  pendingVersions,
});

const SYNTHETIC_CONFIG: PolicyMaterialConfig = {
  schemaVersion: "policy-material/v1",
  productKey: "rhino",
  version: "synthetic-2026-09-v1",
  reference: "SYNTHETIC local fixture material (engineering test only)",
  publicationSource: {
    system: "s21_publication",
    reference: "publication:synthetic-0000001",
    contentHash: HASH,
  },
  review: {
    reviewer: "synthetic-reviewer",
    reviewedAt: "2026-09-20T12:00:00Z",
    note: "SYNTHETIC local review note",
  },
  effectiveFrom: "2026-01-01",
  applicability: {
    ruleVersion: "synthetic-rule-v1",
    condition: { kind: "ref", conditionId: "deposit_policy" },
  },
  requiredInputs: [
    {
      factKey: "deposit.type",
      label: "Deposit type",
      allowedSourceSystems: ["rentvine"],
    },
    {
      factKey: "deposit.amount",
      label: "Deposit amount",
      allowedSourceSystems: ["rentvine"],
    },
  ],
  outputSlots: [
    {
      slotId: "tenant_paragraph",
      channel: "tenant_message",
      text: "SYNTHETIC: deposit type {{deposit.type}}, amount {{deposit.amount}}.",
    },
    {
      slotId: "owner_note",
      channel: "owner_message",
      text: "SYNTHETIC owner note {{deposit.type}}.",
    },
  ],
  conditions: {
    deposit_policy: {
      kind: "all_of",
      conditions: [
        {
          kind: "fact_equals",
          factKey: "deposit.type",
          expectedValue: "replacement_policy",
        },
        {
          kind: "not",
          condition: {
            kind: "fact_equals",
            factKey: "deposit.type",
            expectedValue: "cash",
          },
        },
      ],
    },
  },
};

const approved = (
  config: PolicyMaterialConfig = SYNTHETIC_CONFIG,
): PolicyMaterialSnapshot => ({
  state: "approved",
  active: config,
  activeRevision: 2,
  pendingVersions: [],
});

const fact = (
  factKey: string,
  value: string | number,
  displayValue = String(value),
  overrides: Partial<PolicyFact> = {},
): PolicyFact => ({
  factKey,
  value,
  displayValue,
  source: { system: "rentvine", reference: `rentvine:lease:L1:${factKey}` },
  confidence: "Verified",
  ...overrides,
});
const TYPE = fact("deposit.type", "replacement_policy", "Replacement policy");
const AMOUNT = fact("deposit.amount", 500, "$500.00");

function manual(
  outcome: "not_started" | "waiting" | "done" | "not_applicable" | null,
): RenewalWorkspaceState | null {
  if (!outcome) return null;
  const state = emptyRenewalWorkspace("L1", "cycle-1", {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
  return planRenewalWorkspaceAction(
    state,
    {
      kind: "activity",
      activity: "rhino",
      outcome,
      source: "SYNTHETIC staff note",
      ...(outcome === "not_applicable"
        ? {
            reason: "SYNTHETIC reason",
            applicabilityPolicy: "SYNTHETIC policy reference",
          }
        : {}),
    },
    { actorUid: "editor-1", recordedAt: "2026-09-20T12:00:00.000Z", eventId: "e1" },
  );
}

function project(
  material: PolicyMaterialSnapshot,
  options: {
    manual?: "not_started" | "waiting" | "done" | "not_applicable" | null;
    facts?: PolicyFact[];
    sheet?: string | null;
    today?: string;
  } = {},
) {
  return projectPolicyApplicability({
    productKey: "rhino",
    leaseId: "L1",
    manualState: manual(options.manual ?? null),
    material,
    facts: options.facts ?? [],
    sheetLegacyValue: options.sheet ?? null,
    todayIso: options.today ?? TODAY,
  });
}

describe("S131 bounded configuration schema (AC-S131-2)", () => {
  it("accepts the synthetic fixture and rejects unknown fields, unapproved sources, executable content, circular conditions and missing binding", () => {
    expect(PolicyMaterialConfigSchema.safeParse(SYNTHETIC_CONFIG).success).toBe(true);
    const reject = (patch: Record<string, unknown>, pattern?: RegExp) => {
      const result = PolicyMaterialConfigSchema.safeParse({
        ...SYNTHETIC_CONFIG,
        ...patch,
      });
      expect(result.success).toBe(false);
      if (pattern && !result.success)
        expect(result.error.issues.map((issue) => issue.message).join(" ")).toMatch(
          pattern,
        );
    };
    reject({ premium: 12 });
    reject({
      publicationSource: { ...SYNTHETIC_CONFIG.publicationSource, system: "drive" },
    });
    reject({
      publicationSource: {
        ...SYNTHETIC_CONFIG.publicationSource,
        reference: "https://example.invalid/x",
      },
    });
    reject({
      publicationSource: {
        system: "s21_publication",
        reference: "publication:synthetic-0000001",
      },
    });
    const noVersion = Object.fromEntries(
      Object.entries(SYNTHETIC_CONFIG).filter(([key]) => key !== "version"),
    );
    expect(PolicyMaterialConfigSchema.safeParse(noVersion).success).toBe(false);
    reject(
      {
        outputSlots: [
          {
            slotId: "s",
            channel: "tenant_message",
            text: "<script>alert(1)</script> {{deposit.type}}",
          },
        ],
      },
      /Executable/,
    );
    reject(
      {
        outputSlots: [
          { slotId: "s", channel: "tenant_message", text: "${process.env.X}" },
        ],
      },
      /Executable/,
    );
    reject(
      {
        outputSlots: [
          { slotId: "s", channel: "tenant_message", text: "Fee {{fee.amount}}" },
        ],
      },
      /undeclared placeholder/,
    );
    reject(
      {
        outputSlots: [
          { slotId: "s", channel: "tenant_message", text: "Broken {{deposit.type" },
        ],
      },
      /placeholder/,
    );
    reject(
      {
        applicability: { ruleVersion: "r", condition: { kind: "ref", conditionId: "a" } },
        conditions: {
          a: { kind: "ref", conditionId: "b" },
          b: { kind: "ref", conditionId: "a" },
        },
      },
      /circular/,
    );
    reject(
      {
        applicability: {
          ruleVersion: "r",
          condition: { kind: "ref", conditionId: "missing" },
        },
      },
      /not declared/,
    );
    reject({ effectiveUntil: "2025-12-31" }, /cannot end before/);
    reject({
      applicability: { ruleVersion: "r", condition: { kind: "script", code: "x" } },
    });
    expect(
      findConditionReferenceProblem(
        { kind: "ref", conditionId: "a" },
        { a: { kind: "ref", conditionId: "a" } },
      ),
    ).toEqual({ kind: "circular", conditionId: "a" });
  });
});

describe("S131 condition evaluation over verified facts (AC-S131-1, AC-S131-7)", () => {
  it("never treats an absent or unverified fact as evidence", () => {
    expect(evaluatePolicyCondition({ kind: "always" }, []).result).toBe("include");
    cover("condition.always");
    expect(
      evaluatePolicyCondition(
        {
          kind: "fact_equals",
          factKey: "deposit.type",
          expectedValue: "replacement_policy",
        },
        [TYPE],
      ).result,
    ).toBe("include");
    cover("condition.fact_equals");
    expect(
      evaluatePolicyCondition(
        { kind: "fact_equals", factKey: "deposit.type", expectedValue: "cash" },
        [TYPE],
      ).result,
    ).toBe("exclude");
    cover("condition.fact_differs");
    const missing = evaluatePolicyCondition(
      { kind: "fact_equals", factKey: "deposit.type", expectedValue: "cash" },
      [],
    );
    expect(missing).toMatchObject({
      result: "unknown",
      missingFactKeys: ["deposit.type"],
      reason: "fact_missing",
    });
    cover("condition.fact_missing");
    const unverified = evaluatePolicyCondition(
      {
        kind: "fact_equals",
        factKey: "deposit.type",
        expectedValue: "replacement_policy",
      },
      [{ ...TYPE, confidence: "Likely" }],
    );
    expect(unverified).toMatchObject({ result: "unknown", reason: "fact_unverified" });
    cover("condition.fact_unverified");
    expect(
      evaluatePolicyCondition({ kind: "fact_present", factKey: "deposit.type" }, [TYPE])
        .result,
    ).toBe("include");
    cover("condition.fact_present");
    expect(
      evaluatePolicyCondition(
        { kind: "not", condition: { kind: "fact_present", factKey: "deposit.type" } },
        [TYPE],
      ).result,
    ).toBe("exclude");
    cover("condition.not");
    expect(
      evaluatePolicyCondition(
        {
          kind: "all_of",
          conditions: [
            { kind: "always" },
            { kind: "fact_present", factKey: "deposit.amount" },
          ],
        },
        [TYPE],
      ),
    ).toMatchObject({ result: "unknown", missingFactKeys: ["deposit.amount"] });
    cover("condition.all_of");
    expect(
      evaluatePolicyCondition(
        {
          kind: "any_of",
          conditions: [
            { kind: "fact_present", factKey: "deposit.amount" },
            { kind: "always" },
          ],
        },
        [],
      ).result,
    ).toBe("include");
    cover("condition.any_of");
    expect(
      evaluatePolicyCondition(
        { kind: "ref", conditionId: "deposit_policy" },
        [TYPE],
        SYNTHETIC_CONFIG.conditions,
      ).result,
    ).toBe("include");
    cover("condition.ref");
    expect(
      evaluatePolicyCondition({ kind: "ref", conditionId: "nope" }, [TYPE], {}),
    ).toMatchObject({
      result: "unknown",
      reason: "unknown_reference",
    });
    cover("condition.ref_unknown");
  });
});

describe("S131 applicability never assumes coverage (AC-S131-1, AC-S131-4)", () => {
  it("keeps name-only, legacy-column and follow-up evidence as evidence, and reads absent material as pending", () => {
    const nameOnly = project(MISSING_POLICY_MATERIAL, { sheet: "Yes" });
    expect(nameOnly).toMatchObject({
      state: "unknown",
      reason: "pending_approved_material",
      identified: false,
    });
    expect(nameOnly.label).toMatch(/pending approved policy material/i);
    expect(nameOnly.evidenceNotes.join(" ")).toMatch(
      /evidence to review, not a confirmed policy/,
    );
    expect(nameOnly.missingItems.map((item) => item.id)).toEqual([
      "approved_material",
      "applicability_rule",
    ]);
    cover("applicability.pending_approved_material");
    const legacyAndDone = project(snapshot("pending_only", ["v-pending"]), {
      sheet: "Yes",
      manual: "done",
    });
    expect(legacyAndDone).toMatchObject({ state: "unknown", identified: true });
    expect(legacyAndDone.explanation).toMatch(/v-pending is uploaded but not approved/);
    expect(legacyAndDone.evidenceNotes.join(" ")).toMatch(/does not verify coverage/);
    expect(legacyAndDone.missingItems.map((item) => item.id)).toContain(
      "lease_applicability_review",
    );
    cover("applicability.pending_identified");
    expect(JSON.stringify(nameOnly) + JSON.stringify(legacyAndDone)).not.toMatch(
      /coverage verified|renewed policy confirmed/i,
    );
  });

  it("clears only this conditional dependency on a reviewed not-applicable record", () => {
    const staff = project(MISSING_POLICY_MATERIAL, { manual: "not_applicable" });
    expect(staff).toMatchObject({
      state: "not_applicable",
      reason: "staff_not_applicable",
      source: { origin: "staff_review", reference: "SYNTHETIC staff note" },
      reviewer: "editor-1",
      cycleId: "cycle-1",
    });
    cover("applicability.staff_not_applicable_without_material");
    expect(manualRenewalSummary(manual("not_applicable")).nextActivity).toBe(
      "owner_outreach",
    );
    const withRule = project(approved(), {
      manual: "not_applicable",
      facts: [fact("deposit.type", "cash", "Cash")],
    });
    expect(withRule).toMatchObject({
      state: "not_applicable",
      reason: "staff_not_applicable",
    });
    cover("applicability.staff_not_applicable_with_material");
  });

  it("keeps conflicting, expired, not-yet-effective, unreadable and ambiguous material as explicit review states", () => {
    expect(
      project(approved(), { manual: "not_applicable", facts: [TYPE] }),
    ).toMatchObject({
      state: "needs_review",
      reason: "conflicting_evidence",
    });
    cover("applicability.conflicting_evidence");
    expect(
      project(approved({ ...SYNTHETIC_CONFIG, effectiveUntil: "2026-01-31" }), {
        facts: [TYPE],
      }),
    ).toMatchObject({
      state: "needs_review",
      reason: "material_expired",
      materialVersion: "synthetic-2026-09-v1",
    });
    cover("applicability.material_expired");
    expect(
      project(approved({ ...SYNTHETIC_CONFIG, effectiveFrom: "2027-01-01" }), {
        facts: [TYPE],
      }),
    ).toMatchObject({
      state: "needs_review",
      reason: "material_not_yet_effective",
    });
    cover("applicability.material_not_yet_effective");
    expect(project(snapshot("unreadable"))).toMatchObject({
      state: "needs_review",
      reason: "material_unreadable",
      missingItems: [],
    });
    cover("applicability.material_unreadable");
    expect(project(snapshot("ambiguous"))).toMatchObject({
      state: "needs_review",
      reason: "material_ambiguous",
    });
    cover("applicability.material_ambiguous");
  });

  it("applies the approved rule only on verified facts and names each missing input", () => {
    const needsFacts = project(approved());
    expect(needsFacts).toMatchObject({
      state: "unknown",
      reason: "rule_needs_facts",
      ruleVersion: "synthetic-rule-v1",
    });
    expect(needsFacts.missingItems).toEqual([
      expect.objectContaining({
        id: "fact:deposit.type",
        destination: "verified_fact",
        factKey: "deposit.type",
      }),
    ]);
    cover("applicability.rule_needs_facts");
    const applicable = project(approved(), { facts: [TYPE, AMOUNT] });
    expect(applicable).toMatchObject({
      state: "applicable",
      reason: "rule_include",
      missingItems: [],
      materialVersion: "synthetic-2026-09-v1",
    });
    cover("applicability.rule_include");
    const partial = project(approved(), { facts: [TYPE] });
    expect(partial).toMatchObject({ state: "applicable", reason: "rule_include" });
    expect(partial.missingItems.map((item) => item.factKey)).toEqual(["deposit.amount"]);
    cover("applicability.rule_include_missing_inputs");
    expect(
      project(approved(), { facts: [fact("deposit.type", "cash", "Cash")] }),
    ).toMatchObject({
      state: "not_applicable",
      reason: "rule_exclude",
    });
    cover("applicability.rule_exclude");
  });
});

describe("S131 exact approved content, no invented semantics (AC-S131-3, AC-S131-5)", () => {
  it("renders only the approved slot with verified facts from allowed sources and fails specifically otherwise", () => {
    const applicable = project(approved(), { facts: [TYPE, AMOUNT] });
    const ready = preparePolicyOutput({
      material: SYNTHETIC_CONFIG,
      applicability: applicable,
      facts: [TYPE, AMOUNT],
      slotId: "tenant_paragraph",
    });
    expect(ready).toMatchObject({
      state: "ready",
      text: "SYNTHETIC: deposit type Replacement policy, amount $500.00.",
      evidence: {
        version: "synthetic-2026-09-v1",
        contentHash: HASH,
        ruleVersion: "synthetic-rule-v1",
        slotId: "tenant_paragraph",
        factSources: [
          {
            factKey: "deposit.type",
            system: "rentvine",
            reference: "rentvine:lease:L1:deposit.type",
          },
          {
            factKey: "deposit.amount",
            system: "rentvine",
            reference: "rentvine:lease:L1:deposit.amount",
          },
        ],
      },
    });
    if (ready.state === "ready")
      expect(ready.text).not.toMatch(/insurance|premium|claim|enroll|benefit/i);
    cover("output.ready");
    const partial = project(approved(), { facts: [TYPE] });
    const missingAmount = preparePolicyOutput({
      material: SYNTHETIC_CONFIG,
      applicability: partial,
      facts: [TYPE],
      channel: "tenant_message",
    });
    expect(missingAmount).toMatchObject({
      state: "blocked",
      reason: "missing_inputs",
      slotId: "tenant_paragraph",
    });
    if (missingAmount.state === "blocked")
      expect(missingAmount.missing.map((item) => item.factKey)).toEqual([
        "deposit.amount",
      ]);
    cover("output.blocked_missing_inputs");
    const wrongSource = preparePolicyOutput({
      material: SYNTHETIC_CONFIG,
      applicability: applicable,
      facts: [
        TYPE,
        { ...AMOUNT, source: { system: "operating_sheet", reference: "sheet:row:9" } },
      ],
      slotId: "tenant_paragraph",
    });
    expect(wrongSource).toMatchObject({ state: "blocked", reason: "missing_inputs" });
    expect(
      preparePolicyOutput({
        material: SYNTHETIC_CONFIG,
        applicability: applicable,
        facts: [TYPE, AMOUNT],
        slotId: "nope",
      }),
    ).toMatchObject({ state: "blocked", reason: "slot_unknown" });
    cover("output.blocked_slot_unknown");
    expect(
      preparePolicyOutput({
        material: SYNTHETIC_CONFIG,
        applicability: applicable,
        facts: [TYPE, AMOUNT],
        channel: "document_packet",
      }),
    ).toEqual({ state: "omitted", slotId: null, reason: "no_slot_for_channel" });
    cover("output.omitted_no_slot");
    expect(
      preparePolicyOutput({
        material: SYNTHETIC_CONFIG,
        applicability: project(approved(), { facts: [fact("deposit.type", "cash")] }),
        facts: [],
        channel: "tenant_message",
      }),
    ).toMatchObject({ state: "omitted", reason: "not_applicable" });
    cover("output.omitted_not_applicable");
    expect(
      preparePolicyOutput({
        material: SYNTHETIC_CONFIG,
        applicability: project(approved(), { manual: "not_applicable", facts: [TYPE] }),
        facts: [TYPE],
        channel: "tenant_message",
      }),
    ).toMatchObject({ state: "blocked", reason: "needs_review" });
    cover("output.blocked_needs_review");
    // Uploaded but unapproved material is unusable for final output; no paragraph is invented.
    const pendingOnly: PolicyMaterialSnapshot = snapshot("pending_only", ["v-pending"]);
    const noMaterial = preparePolicyOutput({
      material: null,
      applicability: project(pendingOnly, { manual: "done" }),
      facts: [],
      channel: "tenant_message",
    });
    expect(noMaterial).toMatchObject({ state: "blocked", reason: "no_material" });
    expect(JSON.stringify(noMaterial)).not.toMatch(/SYNTHETIC:/);
    cover("output.blocked_no_material");
    expect(
      preparePolicyOutput({
        material: SYNTHETIC_CONFIG,
        applicability: project(approved()),
        facts: [],
        channel: "tenant_message",
      }),
    ).toMatchObject({ state: "blocked", reason: "unknown_applicability" });
    cover("output.blocked_unknown");
  });

  it("binds a preparation to the exact version and invalidates it when a later version supersedes it", () => {
    const binding = {
      productKey: "rhino" as const,
      version: "synthetic-2026-09-v1",
      contentHash: HASH,
    };
    expect(policyPreparationCurrent(binding, approved())).toEqual({
      current: true,
      reason: "current",
    });
    cover("preparation.current");
    expect(policyPreparationCurrent(binding, MISSING_POLICY_MATERIAL)).toEqual({
      current: false,
      reason: "no_active_version",
    });
    cover("preparation.no_active_version");
    expect(
      policyPreparationCurrent(
        binding,
        approved({ ...SYNTHETIC_CONFIG, version: "synthetic-2026-10-v2" }),
      ),
    ).toEqual({
      current: false,
      reason: "superseded",
    });
    cover("preparation.superseded");
    expect(
      policyPreparationCurrent(
        binding,
        approved({
          ...SYNTHETIC_CONFIG,
          publicationSource: {
            ...SYNTHETIC_CONFIG.publicationSource,
            contentHash: "b".repeat(64),
          },
        }),
      ),
    ).toEqual({ current: false, reason: "content_changed" });
    cover("preparation.content_changed");
  });
});

describe("S131 absent support is honest and local (AC-S131-4, AC-S131-6)", () => {
  it("gates only the dependent output of an identified or applicable lease and never an unrelated renewal", () => {
    expect(
      policyMessageGates(
        project(approved(), { facts: [fact("deposit.type", "cash")] }),
        "tenant",
        approved(),
      ),
    ).toEqual([]);
    cover("gate.not_applicable");
    expect(
      policyMessageGates(
        project(MISSING_POLICY_MATERIAL),
        "tenant",
        MISSING_POLICY_MATERIAL,
      ),
    ).toEqual([]);
    cover("gate.unknown_unrelated");
    const identified = policyMessageGates(
      project(MISSING_POLICY_MATERIAL, { manual: "waiting" }),
      "tenant",
      MISSING_POLICY_MATERIAL,
    );
    expect(identified).toEqual([
      {
        field: "policy.rhino",
        message: expect.stringMatching(/Review whether the Rhino policy applies/),
      },
    ]);
    cover("gate.unknown_identified");
    expect(
      policyMessageGates(
        project(snapshot("ambiguous")),
        "owner",
        MISSING_POLICY_MATERIAL,
      ),
    ).toEqual([
      {
        field: "policy.rhino",
        message: expect.stringMatching(/Review the Rhino policy applicability/),
      },
    ]);
    cover("gate.needs_review");
    const blocked = policyMessageGates(
      project(approved(), { facts: [TYPE] }),
      "tenant",
      approved(),
      [TYPE],
    );
    expect(blocked[0]?.message).toMatch(
      /not ready: 1 verified input for slot tenant_paragraph is missing/,
    );
    cover("gate.applicable_blocked");
    expect(
      policyMessageGates(
        project(approved(), { facts: [TYPE, AMOUNT] }),
        "tenant",
        approved(),
        [TYPE, AMOUNT],
      ),
    ).toEqual([]);
    cover("gate.applicable_ready");
    const readiness = projectMessageReadiness({
      channel: "tenant",
      missing: [],
      saved: true,
      dirty: false,
      needsReview: false,
      signatureMatchesActor: true,
      signatureSaved: true,
      policyGates: identified,
    });
    expect(readiness.bodyReady).toBe(false);
    expect(readiness.items).toEqual([
      expect.objectContaining({
        field: "policy.rhino",
        target: {
          kind: "control",
          id: "renewal-policy-content-rhino",
          label: "Rhino policy content and applicability",
        },
      }),
    ]);
    expect(
      projectMessageReadiness({
        channel: "tenant",
        missing: [],
        saved: true,
        dirty: false,
        needsReview: false,
        signatureMatchesActor: true,
        signatureSaved: true,
      }).bodyReady,
    ).toBe(true);
  });

  it("records the follow-up as staff evidence only; a done task is never coverage", () => {
    const done = project(approved(), { manual: "done", facts: [TYPE, AMOUNT] });
    expect(done.followUp).toMatchObject({
      outcome: "done",
      source: "SYNTHETIC staff note",
      recordedAt: "2026-09-20T12:00:00.000Z",
    });
    expect(done.state).toBe("applicable");
    expect(done.evidenceNotes.join(" ")).toMatch(
      /records a task; it does not verify coverage/,
    );
    const reopened = project(approved(), {
      manual: "not_started",
      facts: [TYPE, AMOUNT],
    });
    expect(reopened.followUp.outcome).toBe("not_started");
    expect(reopened.state).toBe("applicable");
  });
});

describe("S131 branch matrix and separately listed unrun checks (AC-S131-7)", () => {
  it("maps every conditional decision to a passing technical test and lists real-material checks as not run", () => {
    expect([...covered].sort()).toEqual([...POLICY_LOGIC_BRANCHES].sort());
    expect(POLICY_CHECKS_NOT_RUN.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(SYNTHETIC_CONFIG)).toMatch(/SYNTHETIC/);
    expect(JSON.stringify(SYNTHETIC_CONFIG)).not.toMatch(/approved Rhino|pmikcmetro|@/i);
  });
});
