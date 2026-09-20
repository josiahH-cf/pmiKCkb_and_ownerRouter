import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AssessmentEvidenceRowSchema,
  assessOwnership,
  buildDecisionPacket,
  CapabilityMatrixRowSchema,
  EXTERNAL_AGENT_TRANSCRIPT_LABEL,
  FailureScenarioRowSchema,
  IDENTITY_EVIDENCE_IDS,
  joinIdentity,
  minimizeHandoffRecord,
  PMI_EFFECTS_NEVER_DELEGATED,
  PRESERVATION_EVIDENCE,
  retryDisposition,
  STATEFUL_READS,
  validateCapabilityMatrix,
  WORKFLOW_BOUNDARIES,
  type AssessmentEvidenceRow,
  type HandoffOption,
  type OwnershipRow,
} from "@/lib/maintenance/external-agent-handoff-assessment";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";

function row(overrides: Partial<AssessmentEvidenceRow> = {}): AssessmentEvidenceRow {
  return AssessmentEvidenceRowSchema.parse({
    id: "E-PMI-INTAKE",
    claim: "PMI KC receives structured intake",
    sourceKind: "repository_code",
    sourceRef: "lib/maintenance/intake-triage.ts",
    conclusion: "supported",
    requestedInput: null,
    requestedFrom: null,
    ...overrides,
  });
}

const OPTIONS: readonly HandoffOption[] = [
  {
    id: "manual_link_only",
    label: "A. Manual, link-only",
    description: "Staff read the vendor console and act in PMI KC.",
    conditionalOn: ["E-ID-VENDOR", "E-ID-ACCOUNT", "E-ID-ACCESS", "E-VENDOR-LINK"],
  },
  {
    id: "governed_write_or_event",
    label: "C. Governed write or event",
    description: "An exact separately governed interface.",
    conditionalOn: ["E-ID-VENDOR", "E-ID-ACCOUNT", "E-ID-ACCESS", "E-VENDOR-API"],
  },
];

describe("S133 AC-S133-1: identity and access are established or named, never assumed", () => {
  it("keeps the transcript label and refuses a transcript or absent source as support", () => {
    expect(EXTERNAL_AGENT_TRANSCRIPT_LABEL).toBe("Rue");
    expect(() =>
      row({
        id: "E-ID-VENDOR",
        sourceKind: "transcript",
        sourceRef: "T13",
        conclusion: "supported",
      }),
    ).toThrow(/transcript source cannot support/);
    expect(() =>
      row({
        id: "E-VENDOR-API",
        sourceKind: "none",
        sourceRef: "none",
        conclusion: "supported",
      }),
    ).toThrow(/none source cannot support/);
  });

  it("a not-established row names the exact requested input and its owner", () => {
    expect(() =>
      row({
        id: "E-ID-ACCOUNT",
        sourceKind: "none",
        sourceRef: "none",
        conclusion: "not_established",
      }),
    ).toThrow(/names the exact requested input/);
    const named = row({
      id: "E-ID-ACCOUNT",
      sourceKind: "none",
      sourceRef: "none",
      conclusion: "not_established",
      requestedInput: "Account identifier and administrator",
      requestedFrom: "owner",
    });
    expect(named.requestedFrom).toBe("owner");
  });

  it("never records a guessed address as a source", () => {
    expect(() =>
      row({
        id: "E-VENDOR-API",
        sourceKind: "none",
        sourceRef: "https://example-vendor.test/api",
        conclusion: "inconclusive",
      }),
    ).toThrow(/never a guessed address/);
  });
});

describe("S133 AC-S133-2: capability matrix separates demonstrated from claimed", () => {
  const evidence = [
    row(),
    row({
      id: "E-AGENT-ROLE",
      sourceKind: "transcript",
      sourceRef: "T13",
      conclusion: "inconclusive",
    }),
    row({
      id: "E-VENDOR-API",
      sourceKind: "none",
      sourceRef: "none",
      conclusion: "not_established",
      requestedInput: "Primary interface documentation",
      requestedFrom: "vendor_account_administrator",
    }),
  ];

  it("accepts a demonstrated PMI capability on code evidence and an undemonstrated vendor claim with unknowns", () => {
    const rows = [
      CapabilityMatrixRowSchema.parse({
        interfaceKind: "human_handoff",
        system: "pmi_kc",
        capability: "Structured intake",
        direction: "manual",
        demonstrated: true,
        evidenceId: "E-PMI-INTAKE",
        effect: "App-owned ticket",
        unknowns: [],
      }),
      CapabilityMatrixRowSchema.parse({
        interfaceKind: "api",
        system: "external_agent",
        capability: "Write tickets",
        direction: "write",
        demonstrated: false,
        evidenceId: "E-VENDOR-API",
        effect: "Unknown",
        unknowns: ["Existence", "Retry semantics"],
      }),
    ];
    expect(validateCapabilityMatrix(rows, evidence)).toEqual([]);
  });

  it("refuses a demonstrated vendor write on a transcript claim, and an undemonstrated row with no unknowns", () => {
    const rows = [
      CapabilityMatrixRowSchema.parse({
        interfaceKind: "api",
        system: "external_agent",
        capability: "Manage tickets",
        direction: "write",
        demonstrated: true,
        evidenceId: "E-AGENT-ROLE",
        effect: "Unknown",
        unknowns: [],
      }),
      CapabilityMatrixRowSchema.parse({
        interfaceKind: "documented_webhook",
        system: "external_agent",
        capability: "Emit events",
        direction: "event",
        demonstrated: false,
        evidenceId: "E-MISSING",
        effect: "Unknown",
        unknowns: [],
      }),
      CapabilityMatrixRowSchema.parse({
        interfaceKind: "export_import",
        system: "external_agent",
        capability: "Export",
        direction: "read",
        demonstrated: false,
        evidenceId: "E-VENDOR-API",
        effect: "Unknown",
        unknowns: [],
      }),
    ];
    const problems = validateCapabilityMatrix(rows, evidence);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /Manage tickets: demonstrated without a supported evidence row/,
        ),
        expect.stringMatching(/Manage tickets: demonstrated on a transcript source/),
        expect.stringMatching(/Emit events: cites unknown evidence E-MISSING/),
        expect.stringMatching(
          /Export: an undemonstrated capability lists what is unknown/,
        ),
      ]),
    );
  });
});

describe("S133 AC-S133-3: ownership map with an owner at each boundary", () => {
  function ownership(
    boundary: OwnershipRow["boundary"],
    claim: string | null,
    evidence: OwnershipRow["externalAgentEvidence"],
  ): OwnershipRow {
    return {
      boundary,
      pmiKcOwner: "Editor",
      pmiKcEvidence: "lib/maintenance/ticket-model.ts",
      externalAgentClaim: claim,
      externalAgentEvidence: evidence,
      pmiEffectGated: true,
    };
  }

  it("turns unsourced claims into decision items and a missing boundary into a decision, never a default", () => {
    const rows = WORKFLOW_BOUNDARIES.filter(
      (boundary) => boundary !== "own_status_of_record",
    ).map((boundary) =>
      ownership(
        boundary,
        boundary === "authorize_spend_or_vendor" ? null : "Manages tickets",
        "inconclusive",
      ),
    );
    const assessment = assessOwnership(rows);
    expect(
      assessment.decisionItems.some((item) =>
        item.startsWith("Own the status of record: no owner is mapped"),
      ),
    ).toBe(true);
    expect(
      assessment.decisionItems.filter((item) => /inconclusive claim/.test(item)).length,
    ).toBe(7);
    expect(assessment.duplicateRisks).toEqual([]);
    expect(
      assessment.unownedFailures.some((item) => item.startsWith("Resolve or reopen:")),
    ).toBe(true);
  });

  it("a supported shared boundary is a duplicate risk, and PMI effects are never delegated", () => {
    const assessment = assessOwnership([
      ownership("create_work_order", "Creates tickets", "supported"),
    ]);
    expect(assessment.duplicateRisks[0]).toMatch(/^Create the work order: both PMI KC/);
    expect(PMI_EFFECTS_NEVER_DELEGATED).toEqual([
      "send to a resident or owner",
      "approve cost",
      "assign a vendor",
      "create a work order",
      "close or reopen a ticket",
    ]);
  });
});

describe("S133 AC-S133-4: minimal data and a real identity join", () => {
  it("keeps only the allowlist, drops unrelated records and refuses secrets and raw communications by name", () => {
    const minimized = minimizeHandoffRecord({
      property_id: "12",
      unit_id: "345",
      issue_summary: " Leak under sink ",
      resident_full_name: "not carried",
      other_tenant_lease: "not carried",
      api_key: "abc",
      message_body: "raw text",
      call_recording: "file",
    });
    expect(minimized.record).toEqual({
      property_id: "12",
      unit_id: "345",
      issue_summary: "Leak under sink",
    });
    expect(minimized.dropped).toEqual(["resident_full_name", "other_tenant_lease"]);
    expect(minimized.refused).toEqual(["api_key", "message_body", "call_recording"]);
  });

  it("joins only on stable ids or a confirmed human association; similar units and names stay ambiguous", () => {
    const base = {
      propertyId: null,
      unitId: null,
      workOrderId: null,
      nameMatches: 0,
      addressMatches: 0,
      humanAssociationConfirmed: false,
    };
    expect(joinIdentity({ ...base, propertyId: "12", unitId: "345" })).toEqual({
      state: "joined",
      basis: "stable_ids",
    });
    expect(joinIdentity({ ...base, humanAssociationConfirmed: true })).toEqual({
      state: "joined",
      basis: "human_association",
    });
    expect(joinIdentity({ ...base, addressMatches: 2 }).state).toBe("ambiguous");
    expect(joinIdentity({ ...base, nameMatches: 2 }).state).toBe("ambiguous");
    expect(joinIdentity({ ...base, addressMatches: 1, nameMatches: 1 }).state).toBe(
      "unjoined",
    );
    expect(joinIdentity({ ...base, propertyId: "12", unitId: "unit:345" }).state).toBe(
      "unjoined",
    );
  });

  it("labels the stateful read on its exact key", () => {
    expect(STATEFUL_READS.map((read) => read.key)).toEqual([
      "rentvine.work_order.chat.sync",
    ]);
    expect(STATEFUL_READS[0].effect).toMatch(/marks the retrieved messages read/);
  });
});

describe("S133 AC-S133-5: failure and double-action risks", () => {
  it("an ambiguous create reconciles first and is never a blind retry", () => {
    expect(retryDisposition({ dispatched: "unknown", effectKind: "create" })).toBe(
      "reconcile_first",
    );
    expect(retryDisposition({ dispatched: "yes", effectKind: "create" })).toBe(
      "stop_and_name_input",
    );
    expect(retryDisposition({ dispatched: "no", effectKind: "create" })).toBe(
      "safe_to_retry",
    );
    expect(retryDisposition({ dispatched: "unknown", effectKind: "read" })).toBe(
      "safe_to_retry",
    );
  });

  it("a scenario row carries either exact known recovery or an explicit unresolved limit", () => {
    expect(() =>
      FailureScenarioRowSchema.parse({
        scenario: "duplicate_delivery",
        pmiKcBehavior: "Idempotent exact keys",
        externalRecovery: {
          kind: "known",
          behavior: "Retries once",
          evidenceId: "E-VENDOR-WEBHOOK",
        },
        receiptProof: "One work-order id per ticket",
        reconciler: "Maintenance owner",
      }),
    ).not.toThrow();
    expect(() =>
      FailureScenarioRowSchema.parse({
        scenario: "duplicate_delivery",
        pmiKcBehavior: "Idempotent exact keys",
        externalRecovery: { kind: "guessed", behavior: "Probably dedupes" },
        receiptProof: "x",
        reconciler: "y",
      }),
    ).toThrow();
  });
});

describe("S133 AC-S133-6: a bounded decision, not an implementation", () => {
  const notEstablished = (id: string, from: AssessmentEvidenceRow["requestedFrom"]) =>
    row({
      id,
      sourceKind: "none",
      sourceRef: "none",
      conclusion: "not_established",
      requestedInput: `Input for ${id}`,
      requestedFrom: from,
    });

  it("keeps every option conditional and feasibility not established without identity", () => {
    const packet = buildDecisionPacket(
      [
        ...IDENTITY_EVIDENCE_IDS.map((id) => notEstablished(id, "owner")),
        notEstablished("E-VENDOR-LINK", "vendor_account_administrator"),
        notEstablished("E-VENDOR-API", "vendor_account_administrator"),
        row(),
      ],
      OPTIONS,
    );
    expect(packet.identityEstablished).toBe(false);
    expect(packet.feasibility).toBe("not_established");
    expect(packet.options.every((option) => option.status === "conditional")).toBe(true);
    expect(packet.options[0].waitingOn).toEqual([
      "E-ID-VENDOR",
      "E-ID-ACCOUNT",
      "E-ID-ACCESS",
      "E-VENDOR-LINK",
    ]);
    expect(packet.requestedInputs).toHaveLength(5);
    expect(packet.ownerDecision).toMatch(
      /manual and link-only, read-only, or an exact separately governed/,
    );
  });

  it("turns viable only when every cited row is supported, and rules out on an unsupported row", () => {
    const supported = (id: string) =>
      row({
        id,
        sourceKind: "vendor_primary_documentation",
        sourceRef: "Vendor interface guide, owner-supplied",
        conclusion: "supported",
      });
    const viable = buildDecisionPacket(
      [
        ...IDENTITY_EVIDENCE_IDS.map(supported),
        supported("E-VENDOR-LINK"),
        supported("E-VENDOR-API"),
      ],
      OPTIONS,
    );
    expect(viable.feasibility).toBe("established");
    expect(viable.options.map((option) => option.status)).toEqual(["viable", "viable"]);

    const ruledOut = buildDecisionPacket(
      [
        ...IDENTITY_EVIDENCE_IDS.map(supported),
        supported("E-VENDOR-LINK"),
        row({
          id: "E-VENDOR-API",
          sourceKind: "vendor_primary_documentation",
          sourceRef: "Vendor guide",
          conclusion: "unsupported",
        }),
      ],
      OPTIONS,
    );
    expect(ruledOut.options.map((option) => option.status)).toEqual([
      "viable",
      "ruled_out",
    ]);
    expect(ruledOut.feasibility).toBe("established");
  });

  it("names existing preservation evidence and adds no vendor key to the registry", () => {
    for (const path of PRESERVATION_EVIDENCE)
      expect(existsSync(resolve(process.cwd(), path)), path).toBe(true);
    const keys = ACTION_REGISTRY_SEED.map((entry) => entry.key);
    expect(keys.filter((key) => /rue|external_agent|handoff/i.test(key))).toEqual([]);
    expect(keys.length).toBe(48);
  });
});
