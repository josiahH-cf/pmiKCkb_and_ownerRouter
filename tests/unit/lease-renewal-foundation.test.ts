import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { CreateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import {
  createProcessDefinition,
  getProcessDefinition,
  startWorkflowTestRun,
  submitProcessDefinitionForApproval,
  updateWorkflowRunOutcome,
} from "@/lib/firestore/workflows";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import {
  LEASE_RENEWAL_PLANNED_OUTPUTS,
  LEASE_RENEWAL_PLANNED_READS,
  LEASE_RENEWAL_STAGES,
  RENEWAL_FACT_CONFIDENCE,
} from "@/lib/lease-renewal/constants";
import { LEASE_EXECUTION_ACTIONS } from "@/lib/lease-renewal/execution/matrix";
import { evaluateRenewalFactGates, type RenewalFact } from "@/lib/lease-renewal/facts";
import {
  LEASE_RENEWAL_ACTION_KEYS,
  buildLeaseRenewalProcessTemplate,
} from "@/lib/lease-renewal/process-template";
import { FakeFirestore } from "../helpers/fake-firestore";

function userWith(role: Role, uid: string): AuthenticatedUser {
  return { uid, email: `${uid}@example.com`, hd: "example.com", role };
}

const editor = userWith("Editor", "editor-1");

let db: Firestore;

beforeEach(() => {
  db = new FakeFirestore() as unknown as Firestore;
});

function template() {
  return buildLeaseRenewalProcessTemplate({
    ownerUid: "editor-1",
    approverUid: "admin-dan",
    sourceLinks: [
      { label: "Lease Renewal product lane", url: "https://example.com/lease-renewal" },
    ],
  });
}

function verifiedFact(name: string, overrides: Partial<RenewalFact> = {}): RenewalFact {
  return {
    name,
    value: "fixture-value",
    source: "Rentvine (fixture)",
    recorded_at: "2026-06-12T00:00:00Z",
    confidence: "Verified",
    approved: true,
    ...overrides,
  };
}

function allVerifiedFacts(): RenewalFact[] {
  return LEASE_RENEWAL_PLANNED_READS.map((name) => verifiedFact(name));
}

describe("lease renewal vocabulary", () => {
  it("locks the doc-confirmed confidence, stage, read, and output vocabularies", () => {
    expect(RENEWAL_FACT_CONFIDENCE).toEqual([
      "Verified",
      "Likely",
      "Needs Review",
      "Conflict",
    ]);
    expect(LEASE_RENEWAL_STAGES).toEqual([
      "Candidate detection",
      "Owner decision",
      "Tenant intake",
      "Document package",
      "Signature/confirmation",
      "System-of-record update",
      "Service/charge verification",
      "Closeout",
    ]);
    expect(LEASE_RENEWAL_PLANNED_READS).toHaveLength(5);
    expect(LEASE_RENEWAL_PLANNED_OUTPUTS).toEqual([
      "Workflow summary",
      "Owner communication draft",
      "Internal update preview",
      "Approval package",
    ]);
  });
});

describe("lease renewal process-definition template", () => {
  it("parses against the process-definition schema with one step per stage", () => {
    const parsed = CreateProcessDefinitionInputSchema.parse(template());

    expect(parsed.name).toBe("Lease Renewal");
    expect(parsed.steps.map((step) => step.title)).toEqual([...LEASE_RENEWAL_STAGES]);
    expect(parsed.required_starting_inputs.length).toBeGreaterThan(0);
  });

  it("derives every action reference from the Action Registry seed without drift", () => {
    const parsed = CreateProcessDefinitionInputSchema.parse(template());

    const expectedKeys = ["rentvine.lease.read", ...LEASE_EXECUTION_ACTIONS];
    expect(LEASE_RENEWAL_ACTION_KEYS).toEqual(expectedKeys);
    expect(
      parsed.action_references.map((reference) => reference.action_registry_key),
    ).toEqual(expectedKeys);

    for (const reference of parsed.action_references) {
      const seed = ACTION_REGISTRY_SEED.find(
        (entry) => entry.key === reference.action_registry_key,
      );

      expect(seed, reference.action_registry_key).toBeDefined();
      expect(reference.target_system).toBe(seed?.target_system);
      expect(reference.readiness).toBe(
        seed?.production_allowed ? "Planned" : (seed?.readiness ?? "Planned"),
      );
      expect(reference.rollback_or_correction_note).toBe(seed?.rollback_note);
      expect(reference.approval_owner_uid).toBe("admin-dan");
      expect(reference.readiness).not.toBe("Approved for Execution");
    }
  });

  it("uses exact-confirmed execution copy without restoring the superseded manual-only path", () => {
    const copy = JSON.stringify(template());
    expect(copy).toContain("exact-confirmed");
    expect(copy).toContain("no autonomous, bulk, scheduled, or model-triggered send");
    expect(copy).not.toMatch(
      /human sends|sent by a human|app never sends|sends them by hand/i,
    );
  });

  it("keeps the Rentvine renewal writeback gated as a pending future automation step", () => {
    const parsed = CreateProcessDefinitionInputSchema.parse(template());
    const writeback = parsed.action_references.find(
      (reference) => reference.action_registry_key === "rentvine.lease.renewal_writeback",
    );

    expect(writeback?.readiness).toBe("Planned");
    expect(writeback?.missing_connection_or_permission).toMatch(/[Vv]endor-confirmed/);
  });
});

describe("lease renewal acceptance scenarios (simulation-only)", () => {
  it("creates the template as a Draft definition and runs a simulation test run", async () => {
    const definition = await createProcessDefinition(editor, template(), db);
    expect(definition.status).toBe("Draft");

    const run = await startWorkflowTestRun(
      editor,
      definition.id,
      { note: "Acceptance scenario: simulation-only lease renewal test run." },
      db,
    );

    expect(run).toMatchObject({
      is_test_run: true,
      simulation_only: true,
      production_metrics_included: false,
      status: "In Progress",
      next_action: "Candidate detection",
      owner_uid: "admin-dan",
    });

    const testing = await getProcessDefinition(editor, definition.id, db);
    expect(testing.status).toBe("Testing");

    const completed = await updateWorkflowRunOutcome(
      editor,
      run.id,
      { action: "complete_test", notes: "Simulation completed with fixture facts." },
      db,
    );
    expect(completed.status).toBe("Completed");
  });

  it("submits the tested definition into Pending Approval through the queue", async () => {
    const definition = await createProcessDefinition(editor, template(), db);
    await startWorkflowTestRun(editor, definition.id, {}, db);

    await submitProcessDefinitionForApproval(
      editor,
      definition.id,
      { note: "Lease renewal template ready for Admin review." },
      db,
    );

    const submitted = await getProcessDefinition(editor, definition.id, db);
    expect(submitted.status).toBe("Pending Approval");
  });
});

describe("renewal fact confidence gates", () => {
  it("is owner-draft ready only when every planned read is Verified and approved", () => {
    const result = evaluateRenewalFactGates(allVerifiedFacts());

    expect(result).toEqual({
      owner_draft_ready: true,
      blocking_conflicts: [],
      needs_review: [],
      facts_requiring_warning: [],
      missing_facts: [],
    });
  });

  it("blocks owner-facing drafts on Conflict facts", () => {
    const facts = allVerifiedFacts();
    facts[0] = verifiedFact(facts[0].name, { confidence: "Conflict" });

    const result = evaluateRenewalFactGates(facts);

    expect(result.owner_draft_ready).toBe(false);
    expect(result.blocking_conflicts).toEqual([facts[0].name]);
  });

  it("routes Likely and Needs Review facts to review and flags warnings", () => {
    const facts = allVerifiedFacts();
    facts[1] = verifiedFact(facts[1].name, { confidence: "Likely" });
    facts[2] = verifiedFact(facts[2].name, { confidence: "Needs Review" });

    const result = evaluateRenewalFactGates(facts);

    expect(result.owner_draft_ready).toBe(false);
    expect(result.needs_review).toEqual([facts[1].name, facts[2].name]);
    expect(result.facts_requiring_warning).toEqual([facts[1].name, facts[2].name]);
  });

  it("flags an unapproved Verified fact as requiring a visible warning", () => {
    const facts = allVerifiedFacts();
    facts[3] = verifiedFact(facts[3].name, { approved: false });

    const result = evaluateRenewalFactGates(facts);

    expect(result.owner_draft_ready).toBe(false);
    expect(result.facts_requiring_warning).toEqual([facts[3].name]);
    expect(result.blocking_conflicts).toEqual([]);
  });

  it("keeps a missing-facts list against the planned read set", () => {
    const facts = allVerifiedFacts().slice(0, 3);

    const result = evaluateRenewalFactGates(facts);

    expect(result.owner_draft_ready).toBe(false);
    expect(result.missing_facts).toEqual(["Current rent and terms", "Renewal timeline"]);
  });
});
